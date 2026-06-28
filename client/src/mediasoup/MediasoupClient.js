// mediasoup SFU 客户端模块
// 管理与 mediasoup 服务器的连接

import { Device } from 'mediasoup-client';
import { createIceServers } from '../lib/connectionConfig';

// ICE Servers 配置 (STUN + TURN)
// 用于 NAT 穿透，确保跨网络环境可连接
const getIceServers = () => createIceServers().iceServers;

class MediasoupClient {
    constructor(socket) {
        this.socket = socket;
        this.device = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.producer = null;
        this.consumers = new Map(); // Map<producerId, { consumer, peerId }>
        this.pendingConsumerIds = new Set();
        this.roomId = null;
        this.peerId = null;
        this.onNewConsumer = null; // 回调：新的音频源
        this.onConsumerClosed = null; // 回调：音频源关闭
        this._onNewProducer = null;
        this._onProducerClosed = null;
    }

    // 初始化 Device 并加载 Router 能力
    async joinRoom(roomId, peerId) {
        this.roomId = roomId;
        this.peerId = peerId;

        // 获取服务器 RTP 能力
        const { rtpCapabilities, error } = await this._request('getRouterRtpCapabilities', { roomId });
        if (error) throw new Error(error);

        // 创建 Device
        this.device = new Device();
        await this.device.load({ routerRtpCapabilities: rtpCapabilities });

        // 创建发送和接收 Transport
        await this._createSendTransport();
        await this._createRecvTransport();

        // 先挂好房间级监听，避免 "getProducers -> 挂 newProducer 监听" 之间的竞态
        // 导致新加入或刚开始发声的成员被漏掉。
        this._detachRoomListeners();

        this._onNewProducer = async ({ peerId: producerPeerId, producerId }) => {
            await this.consumeProducer(producerId, producerPeerId);
        };

        // 监听 producer 关闭
        this._onProducerClosed = ({ producerId }) => {
            this._closeConsumer(producerId);
        };

        this.socket.on('newProducer', this._onNewProducer);
        this.socket.on('producerClosed', this._onProducerClosed);

        // 获取房间内已有的 producer 并订阅
        const { producers } = await this._request('getProducers', { roomId });
        for (const { peerId: producerPeerId, producerId } of producers) {
            await this.consumeProducer(producerId, producerPeerId);
        }
    }

    // 开始发送本地音频
    async produce(stream) {
        if (!this.sendTransport) throw new Error('Send transport not ready');

        const track = stream.getAudioTracks()[0];
        if (!track) throw new Error('No audio track in stream');
        if (track.readyState === 'ended') throw new Error('Audio track is already ended');

        this.producer = await this.sendTransport.produce({
            track,
            codecOptions: {
                opusStereo: true,
                opusDtx: false,  // 关闭 DTX，防止微弱声音被截断
                opusFec: true,   // 开启 FEC，提升抗丢包能力
                opusNack: true,  // 开启 NACK
                opusPtime: 10,
                opusMaxAverageBitrate: 128000,
                opusCbr: false
            },
            encodings: [
                { maxBitrate: 128000 } // 提高码率至 128kbps (默认通常较低)
            ]
        });

        this.producer.on('transportclose', () => {
            this.producer = null;
        });

        return this.producer.id;
    }

    // 订阅其他人的音频
    async consumeProducer(producerId, producerPeerId) {
        if (!this.recvTransport) return;
        if (this.consumers.has(producerId) || this.pendingConsumerIds.has(producerId)) {
            return;
        }

        this.pendingConsumerIds.add(producerId);

        try {
            const { id, kind, rtpParameters, error } = await this._request('consume', {
                roomId: this.roomId,
                producerId,
                rtpCapabilities: this.device.rtpCapabilities
            });

            if (error) {
                console.error('[MediasoupClient] Consume error:', error);
                return;
            }

            const consumer = await this.recvTransport.consume({
                id,
                producerId,
                kind,
                rtpParameters
            });

            // 移除内置 Audio 元素创建逻辑，改为将 Track 传递给上层处理 (SocketContext)
            // 这样可以复用应用统一的 AudioContext 管道 (支持音量调节、静音等)
            const track = consumer.track;

            this.consumers.set(producerId, { consumer, peerId: producerPeerId });

            if (this.onNewConsumer) {
                this.onNewConsumer(producerPeerId, producerId, track);
            }



            consumer.on('transportclose', () => {
                this._closeConsumer(producerId);
            });
        } finally {
            this.pendingConsumerIds.delete(producerId);
        }
    }

    // 离开房间
    leaveRoom() {
        // 关闭所有 consumer
        for (const [producerId] of this.consumers) {
            this._closeConsumer(producerId);
        }

        // 关闭 producer
        if (this.producer) {
            this.producer.close();
            this.producer = null;
        }

        // 关闭 transports
        if (this.sendTransport) {
            this.sendTransport.close();
            this.sendTransport = null;
        }
        if (this.recvTransport) {
            this.recvTransport.close();
            this.recvTransport = null;
        }

        this.roomId = null;
        this.device = null;
        this.pendingConsumerIds.clear();

        this._detachRoomListeners();
    }

    // === 私有方法 ===

    async _createSendTransport() {
        const transportInfo = await this._request('createWebRtcTransport', {
            roomId: this.roomId,
            type: 'send'
        });

        if (transportInfo.error) throw new Error(transportInfo.error);

        // 获取 ICE Servers
        const iceServers = getIceServers();

        // 关键：创建发送 Transport
        this.sendTransport = this.device.createSendTransport({
            ...transportInfo,
            iceServers,
            iceTransportPolicy: 'all', // 允许所有类型 (relay/srflx/host)
        });

        // 监听 Connect 事件 (DTLS 握手)
        this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                // 强制设置 DTLS 角色为 client，确保与服务端的 server/auto 角色握手成功
                // 虽然 mediasoup-client 默认就是 client，但显式声明更安全
                dtlsParameters.role = 'client';

                await this._request('connectTransport', {
                    roomId: this.roomId,
                    transportId: this.sendTransport.id,
                    dtlsParameters
                });
                callback();
            } catch (err) {
                console.error('[MediasoupClient] Send Transport connect failed:', err);
                errback(err);
            }
        });

        // 监听 Produce 事件
        this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
            try {
                const { id, error } = await this._request('produce', {
                    roomId: this.roomId,
                    transportId: this.sendTransport.id,
                    kind,
                    rtpParameters
                });
                if (error) throw new Error(error);

                callback({ id });
            } catch (err) {
                console.error('[MediasoupClient] Produce failed:', err);
                errback(err);
            }
        });

        // 监听连接状态
        this.sendTransport.on('connectionstatechange', (state) => {
            if (state === 'failed') {
                console.error('[MediasoupClient] Send Transport FAILED. Firewalls might be blocking UDP/TCP ports 40000-40100.');
            }
        });
    }

    async _createRecvTransport() {
        const transportInfo = await this._request('createWebRtcTransport', {
            roomId: this.roomId,
            type: 'recv'
        });

        if (transportInfo.error) throw new Error(transportInfo.error);

        // 获取 ICE Servers
        const iceServers = getIceServers();

        // 关键：创建接收 Transport
        this.recvTransport = this.device.createRecvTransport({
            ...transportInfo,
            iceServers,
            iceTransportPolicy: 'all'
        });

        // 监听 Connect 事件
        this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                // 强制角色
                dtlsParameters.role = 'client';

                await this._request('connectTransport', {
                    roomId: this.roomId,
                    transportId: this.recvTransport.id,
                    dtlsParameters
                });
                callback();
            } catch (err) {
                console.error('[MediasoupClient] Recv Transport connect failed:', err);
                errback(err);
            }
        });

        // 监听连接状态
        this.recvTransport.on('connectionstatechange', (state) => {
            if (state === 'failed') {
                console.error('[MediasoupClient] Recv Transport FAILED. Check server "announcedIp" and Firewall.');
            }
        });
    }

    _closeConsumer(producerId) {
        const consumerData = this.consumers.get(producerId);
        if (!consumerData) return;

        consumerData.consumer.close();
        this.consumers.delete(producerId);
        this.pendingConsumerIds.delete(producerId);

        if (this.onConsumerClosed) {
            this.onConsumerClosed(consumerData.peerId, producerId);
        }
    }

    // Socket.IO 请求封装
    _request(event, data = {}) {
        return new Promise((resolve) => {
            this.socket.emit(event, data, (response) => {
                resolve(response || {});
            });
        });
    }

    _detachRoomListeners() {
        if (this._onNewProducer) {
            this.socket.off('newProducer', this._onNewProducer);
            this._onNewProducer = null;
        }

        if (this._onProducerClosed) {
            this.socket.off('producerClosed', this._onProducerClosed);
            this._onProducerClosed = null;
        }
    }
}

export default MediasoupClient;
