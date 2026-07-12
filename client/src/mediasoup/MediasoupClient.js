// mediasoup SFU 客户端模块
// 管理与 mediasoup 服务器的连接

import { Device } from 'mediasoup-client';
import { createIceServers } from '../lib/connectionConfig';
import { calculateLossRate, selectAudioBitrateProfile } from '../lib/audioNetwork';

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
        this._sessionId = 0;
        this._isClosed = false;
        this._isJoining = false;
        this._isJoined = false;
        this._producePromise = null;
        this._sfuSessionId = null;
        this._audioNetworkState = {
            profile: 'good',
            maxBitrate: 64000,
            roundTripTime: 0,
            lossRate: 0,
            packetsSent: 0,
            packetsLost: 0,
            lastUpdatedAt: 0,
            lastError: null
        };
    }

    // 初始化 Device 并加载 Router 能力
    async joinRoom(roomId, peerId) {
        const sessionId = ++this._sessionId;
        const sfuSessionId = globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this._isClosed = false;
        this._isJoining = true;
        this._isJoined = false;
        this.roomId = roomId;
        this.peerId = peerId;
        this._sfuSessionId = sfuSessionId;

        try {
            const { rtpCapabilities, error } = await this._request('startSfuSession', {
                roomId,
                sfuSessionId
            });
            this._assertActive(sessionId);
            if (error) throw new Error(error);

            this.device = new Device();
            await this.device.load({ routerRtpCapabilities: rtpCapabilities });
            this._assertActive(sessionId);

            await this._createSendTransport(sessionId);
            await this._createRecvTransport(sessionId);
            this._assertActive(sessionId);

            this._detachRoomListeners();

            this._onNewProducer = async ({ peerId: producerPeerId, producerId }) => {
                await this.consumeProducer(producerId, producerPeerId);
            };

            this._onProducerClosed = ({ producerId }) => {
                this._closeConsumer(producerId);
            };

            this.socket.on('newProducer', this._onNewProducer);
            this.socket.on('producerClosed', this._onProducerClosed);

            const { producers, error: producersError } = await this._request('getProducers', {
                roomId,
                sfuSessionId
            });
            this._assertActive(sessionId);
            if (producersError) throw new Error(producersError);

            for (const { peerId: producerPeerId, producerId } of producers) {
                await this.consumeProducer(producerId, producerPeerId);
            }

            this._isJoining = false;
            this._isJoined = true;
        } catch (error) {
            if (this._sessionId === sessionId) {
                this._isJoining = false;
            }
            throw error;
        }
    }

    // 开始发送本地音频
    async produce(stream) {
        if (this._producePromise) return this._producePromise;
        if (!this.sendTransport) throw new Error('Send transport not ready');

        const track = stream.getAudioTracks()[0];
        if (!track) throw new Error('No audio track in stream');
        if (track.readyState === 'ended') throw new Error('Audio track is already ended');

        const sessionId = this._sessionId;
        const sendTransport = this.sendTransport;
        this._assertActive(sessionId);

        this._producePromise = sendTransport.produce({
            track,
            codecOptions: {
                opusStereo: false,
                opusDtx: true,
                opusFec: true,   // 开启 FEC，提升抗丢包能力
                opusNack: true,  // 开启 NACK
                opusPtime: 20,
                opusMaxAverageBitrate: 64000,
                opusCbr: false
            },
            encodings: [
                { maxBitrate: 64000 }
            ]
        }).then((producer) => {
            if (!this._isActive(sessionId) || this.sendTransport !== sendTransport) {
                producer.close();
                throw new Error('Send transport was replaced before produce completed.');
            }

            this.producer = producer;
            return producer;
        }).finally(() => {
            this._producePromise = null;
        });

        const producer = await this._producePromise;

        producer.on('transportclose', () => {
            if (this.producer === producer) {
                this.producer = null;
            }
        });

        return producer.id;
    }

    async adaptAudioBitrate() {
        const producer = this.producer;
        if (!producer || producer.closed || !producer.rtpSender) return;

        try {
            const stats = await producer.getStats();
            let outbound = null;
            let remoteInbound = null;
            stats.forEach((report) => {
                if (report.type === 'outbound-rtp' && !report.isRemote && (report.kind === 'audio' || report.mediaType === 'audio')) {
                    outbound = report;
                } else if (report.type === 'remote-inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
                    remoteInbound = report;
                }
            });

            if (!outbound) return;
            const packetsSent = Number(outbound.packetsSent) || 0;
            const packetsLost = Number(remoteInbound?.packetsLost) || 0;
            const lossRate = Number.isFinite(remoteInbound?.fractionLost)
                ? Math.max(0, Number(remoteInbound.fractionLost))
                : calculateLossRate({
                    packetsSent,
                    packetsLost,
                    previousPacketsSent: this._audioNetworkState.packetsSent,
                    previousPacketsLost: this._audioNetworkState.packetsLost
                });
            const roundTripTime = Math.max(0, Number(remoteInbound?.roundTripTime) || 0);
            const profile = selectAudioBitrateProfile({ roundTripTime, lossRate });

            if (profile.maxBitrate !== this._audioNetworkState.maxBitrate) {
                const parameters = producer.rtpSender.getParameters();
                if (parameters.encodings?.length) {
                    parameters.encodings[0].maxBitrate = profile.maxBitrate;
                    await producer.rtpSender.setParameters(parameters);
                }
            }

            this._audioNetworkState = {
                profile: profile.name,
                maxBitrate: profile.maxBitrate,
                roundTripTime,
                lossRate,
                packetsSent,
                packetsLost,
                lastUpdatedAt: Date.now(),
                lastError: null
            };
        } catch (error) {
            this._audioNetworkState = {
                ...this._audioNetworkState,
                lastUpdatedAt: Date.now(),
                lastError: error?.message || String(error)
            };
        }
    }

    // 订阅其他人的音频
    async consumeProducer(producerId, producerPeerId) {
        if (!this.recvTransport) return;
        if (this.consumers.has(producerId) || this.pendingConsumerIds.has(producerId)) {
            return;
        }

        this.pendingConsumerIds.add(producerId);
        const sessionId = this._sessionId;
        const sfuSessionId = this._sfuSessionId;
        const recvTransport = this.recvTransport;

        try {
            const { id, kind, rtpParameters, error } = await this._request('consume', {
                roomId: this.roomId,
                sfuSessionId,
                transportId: recvTransport.id,
                producerId,
                rtpCapabilities: this.device.rtpCapabilities
            });

            if (error) {
                console.error('[MediasoupClient] Consume error:', error);
                return;
            }

            this._assertActive(sessionId);
            if (this.recvTransport !== recvTransport || this._sfuSessionId !== sfuSessionId) {
                throw new Error('Receive transport was replaced before consume completed.');
            }

            const consumer = await recvTransport.consume({
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
        const closingRoomId = this.roomId;
        const closingSfuSessionId = this._sfuSessionId;
        this._sessionId += 1;
        this._isClosed = true;
        this._isJoining = false;
        this._isJoined = false;

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
        this._sfuSessionId = null;
        this._audioNetworkState = {
            ...this._audioNetworkState,
            profile: 'good',
            maxBitrate: 64000,
            packetsSent: 0,
            packetsLost: 0,
            lastUpdatedAt: 0,
            lastError: null
        };
        this.pendingConsumerIds.clear();

        this._detachRoomListeners();

        if (closingRoomId && closingSfuSessionId && this.socket?.connected) {
            this.socket.emit('closeSfuSession', {
                roomId: closingRoomId,
                sfuSessionId: closingSfuSessionId
            });
        }
    }

    // === 私有方法 ===

    async _createSendTransport(sessionId) {
        const transportInfo = await this._request('createWebRtcTransport', {
            roomId: this.roomId,
            sfuSessionId: this._sfuSessionId,
            type: 'send'
        });

        if (transportInfo.error) throw new Error(transportInfo.error);
        this._assertActive(sessionId);

        // 获取 ICE Servers
        const iceServers = getIceServers();

        // 关键：创建发送 Transport
        const sendTransport = this.device.createSendTransport({
            ...transportInfo,
            iceServers,
            iceTransportPolicy: 'all', // 允许所有类型 (relay/srflx/host)
        });
        this.sendTransport = sendTransport;

        // 监听 Connect 事件 (DTLS 握手)
        sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                this._assertActive(sessionId);
                if (this.sendTransport !== sendTransport) {
                    throw new Error('Send transport is no longer active.');
                }

                // 强制设置 DTLS 角色为 client，确保与服务端的 server/auto 角色握手成功
                // 虽然 mediasoup-client 默认就是 client，但显式声明更安全
                dtlsParameters.role = 'client';

                const response = await this._request('connectTransport', {
                    roomId: this.roomId,
                    sfuSessionId: this._sfuSessionId,
                    transportId: sendTransport.id,
                    dtlsParameters
                });
                this._assertActive(sessionId);
                if (this.sendTransport !== sendTransport) {
                    throw new Error('Send transport is no longer active.');
                }
                if (response.error) throw new Error(response.error);
                callback();
            } catch (err) {
                if (this._isActive(sessionId) && this.sendTransport === sendTransport) {
                    console.error('[MediasoupClient] Send Transport connect failed:', err);
                }
                errback(err);
            }
        });

        // 监听 Produce 事件
        sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
            try {
                this._assertActive(sessionId);
                if (this.sendTransport !== sendTransport) {
                    throw new Error('Send transport is no longer active.');
                }

                const { id, error } = await this._request('produce', {
                    roomId: this.roomId,
                    sfuSessionId: this._sfuSessionId,
                    transportId: sendTransport.id,
                    kind,
                    rtpParameters
                });
                this._assertActive(sessionId);
                if (this.sendTransport !== sendTransport) {
                    throw new Error('Send transport is no longer active.');
                }
                if (error) throw new Error(error);

                callback({ id });
            } catch (err) {
                if (this._isActive(sessionId) && this.sendTransport === sendTransport) {
                    console.error('[MediasoupClient] Produce failed:', err);
                }
                errback(err);
            }
        });

        // 监听连接状态
        sendTransport.on('connectionstatechange', (state) => {
            if (state === 'failed') {
                console.error('[MediasoupClient] Send Transport FAILED. Firewalls might be blocking UDP/TCP ports 40000-40100.');
            }
        });
    }

    async _createRecvTransport(sessionId) {
        const transportInfo = await this._request('createWebRtcTransport', {
            roomId: this.roomId,
            sfuSessionId: this._sfuSessionId,
            type: 'recv'
        });

        if (transportInfo.error) throw new Error(transportInfo.error);
        this._assertActive(sessionId);

        // 获取 ICE Servers
        const iceServers = getIceServers();

        // 关键：创建接收 Transport
        const recvTransport = this.device.createRecvTransport({
            ...transportInfo,
            iceServers,
            iceTransportPolicy: 'all'
        });
        this.recvTransport = recvTransport;

        // 监听 Connect 事件
        recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                this._assertActive(sessionId);
                if (this.recvTransport !== recvTransport) {
                    throw new Error('Receive transport is no longer active.');
                }

                // 强制角色
                dtlsParameters.role = 'client';

                const response = await this._request('connectTransport', {
                    roomId: this.roomId,
                    sfuSessionId: this._sfuSessionId,
                    transportId: recvTransport.id,
                    dtlsParameters
                });
                this._assertActive(sessionId);
                if (this.recvTransport !== recvTransport) {
                    throw new Error('Receive transport is no longer active.');
                }
                if (response.error) throw new Error(response.error);
                callback();
            } catch (err) {
                if (this._isActive(sessionId) && this.recvTransport === recvTransport) {
                    console.error('[MediasoupClient] Recv Transport connect failed:', err);
                }
                errback(err);
            }
        });

        // 监听连接状态
        recvTransport.on('connectionstatechange', (state) => {
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
    _request(event, data = {}, timeoutMs = 10000) {
        return new Promise((resolve) => {
            if (!this.socket?.connected) {
                resolve({ error: 'Socket is not connected.' });
                return;
            }

            let settled = false;
            const timer = window.setTimeout(() => {
                if (settled) return;
                settled = true;
                resolve({ error: `${event} request timed out.` });
            }, timeoutMs);

            this.socket.emit(event, data, (response) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
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

    isActiveFor(roomId, peerId) {
        return !this._isClosed &&
            this.roomId === roomId &&
            this.peerId === peerId &&
            (this._isJoining || this._isJoined);
    }

    getDebugState() {
        return {
            roomId: this.roomId,
            peerId: this.peerId,
            sessionId: this._sessionId,
            sfuSessionId: this._sfuSessionId,
            isClosed: this._isClosed,
            isJoining: this._isJoining,
            isJoined: this._isJoined,
            hasDevice: Boolean(this.device),
            hasSendTransport: Boolean(this.sendTransport),
            hasRecvTransport: Boolean(this.recvTransport),
            sendTransportId: this.sendTransport?.id || null,
            recvTransportId: this.recvTransport?.id || null,
            sendTransportState: this.sendTransport?.connectionState || null,
            recvTransportState: this.recvTransport?.connectionState || null,
            hasProducer: Boolean(this.producer),
            producerId: this.producer?.id || null,
            producerPaused: this.producer?.paused ?? null,
            audioNetwork: { ...this._audioNetworkState },
            producerTrack: this.producer?.track
                ? {
                    enabled: this.producer.track.enabled,
                    muted: this.producer.track.muted,
                    readyState: this.producer.track.readyState,
                    settings: typeof this.producer.track.getSettings === 'function'
                        ? this.producer.track.getSettings()
                        : null
                }
                : null,
            consumerCount: this.consumers.size,
            pendingConsumerCount: this.pendingConsumerIds.size
        };
    }

    _assertActive(sessionId) {
        if (!this._isActive(sessionId)) {
            throw new Error('SFU session is no longer active.');
        }
    }

    _isActive(sessionId) {
        return !this._isClosed && this._sessionId === sessionId;
    }
}

export default MediasoupClient;
