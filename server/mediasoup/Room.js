// mediasoup Room 管理器
// 每个语音房间对应一个 Room 实例

const mediasoup = require('mediasoup');
const config = require('./config');

const MAX_TRANSPORTS_PER_PEER = 4;

class Room {
    constructor(roomId, router) {
        this.roomId = roomId;
        this.router = router;
        // Map<peerId, { transport, producer, consumers: Map<producerId, consumer> }>
        this.peers = new Map();
    }

    // 获取 Router RTP 能力（客户端需要）
    getRouterRtpCapabilities() {
        return this.router.rtpCapabilities;
    }

    // 创建 WebRTC Transport
    async createWebRtcTransport(peerId, type = 'send') {
        const peer = this._ensurePeer(peerId);
        this._trimPeerTransports(peer);

        const transport = await this.router.createWebRtcTransport({
            ...config.webRtcTransport,
            appData: { type }   // tag the transport so consume() can find the recv one reliably
        });

        // 监听 Transport 状态
        transport.on('dtlsstatechange', (dtlsState) => {
            if (dtlsState === 'closed') {
                console.log(`[Room ${this.roomId}] Transport DTLS closed for peer ${peerId}`);
                // Do NOT call transport.close() here — mediasoup closes it internally.
            }
        });

        transport.on('@close', () => {
            console.log(`[Room ${this.roomId}] Transport @close for peer ${peerId}`);
            peer.transports.delete(transport.id);
        });

        peer.transports.set(transport.id, transport);

        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            appData: transport.appData
        };
    }

    // 连接 Transport（客户端调用）
    async connectTransport(peerId, transportId, dtlsParameters) {
        const peer = this.peers.get(peerId);
        if (!peer) throw new Error('Peer not found');

        const transport = peer.transports.get(transportId);
        if (!transport) throw new Error('Transport not found');

        await transport.connect({ dtlsParameters });
    }

    // 创建 Producer（发送音频）
    async produce(peerId, transportId, kind, rtpParameters) {
        const peer = this.peers.get(peerId);
        if (!peer) throw new Error('Peer not found');

        const transport = peer.transports.get(transportId);
        if (!transport) throw new Error('Transport not found');

        if (peer.producer) {
            peer.producer.close();
            peer.producer = null;
        }

        const producer = await transport.produce({ kind, rtpParameters });

        producer.on('transportclose', () => {
            console.log(`[Room ${this.roomId}] Producer transport closed for peer ${peerId}`);
            producer.close();
            if (peer.producer === producer) {
                peer.producer = null;
            }
        });

        producer.on('@close', () => {
            if (peer.producer === producer) {
                peer.producer = null;
            }
        });

        peer.producer = producer;

        // 通知其他 peer 有新的 producer
        return { id: producer.id };
    }

    // 创建 Consumer（接收其他人的音频）
    async consume(peerId, producerId, rtpCapabilities) {
        const peer = this.peers.get(peerId);
        if (!peer) throw new Error('Peer not found');

        // 检查是否可以消费
        if (!this.router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error('Cannot consume this producer');
        }

        // 找到接收用的 recv transport

        const peerTransports = Array.from(peer.transports.values());
        let recvTransport = peerTransports.findLast(t => t.appData?.type === 'recv');

        if (!recvTransport) {
            console.warn(`[Room ${this.roomId}] No typed recv transport found for peer ${peerId}`);
            recvTransport = peerTransports.findLast(t => t.appData?.type !== 'send');
            if (!recvTransport) {
                recvTransport = peerTransports.at(-1);
            }
        }

        if (!recvTransport) throw new Error('No receive transport found');
        console.log(`[Room ${this.roomId}] Using transport ${recvTransport.id} for consuming`);

        const consumer = await recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true // 先暂停创建，等连接稳定后再 resume
        });

        // 显式恢复 Consumer
        await consumer.resume();
        console.log(`[Room ${this.roomId}] Consumer ${consumer.id} ready for peer ${peerId}`);

        consumer.on('transportclose', () => {
            console.log(`[Room ${this.roomId}] Consumer transport closed`);
            consumer.close();
        });

        consumer.on('producerclose', () => {
            console.log(`[Room ${this.roomId}] Producer closed, closing consumer`);
            consumer.close();
            peer.consumers.delete(producerId);
        });

        peer.consumers.set(producerId, consumer);

        return {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
        };
    }

    // 获取房间内所有 Producer（用于新加入者订阅）
    getProducerIds(excludePeerId) {
        const producerIds = [];
        for (const [peerId, peer] of this.peers) {
            if (peerId !== excludePeerId && peer.producer) {
                producerIds.push({
                    peerId,
                    producerId: peer.producer.id
                });
            }
        }
        return producerIds;
    }

    // 移除 Peer
    removePeer(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        // 关闭所有 transport（会自动关闭 producer 和 consumer）
        for (const transport of peer.transports.values()) {
            transport.close();
        }

        this.peers.delete(peerId);
        console.log(`[Room ${this.roomId}] Peer ${peerId} removed, remaining: ${this.peers.size}`);

        return peer.producer?.id; // 返回被关闭的 producer ID
    }

    // 获取 peer 数量
    get peerCount() {
        return this.peers.size;
    }

    // 关闭房间
    close() {
        this.router.close();
        this.peers.clear();
        console.log(`[Room ${this.roomId}] Closed`);
    }

    _ensurePeer(peerId) {
        if (!this.peers.has(peerId)) {
            this.peers.set(peerId, {
                transports: new Map(),
                producer: null,
                consumers: new Map()
            });
        }

        return this.peers.get(peerId);
    }

    _trimPeerTransports(peer) {
        while (peer.transports.size >= MAX_TRANSPORTS_PER_PEER) {
            const oldestTransport = peer.transports.values().next().value;
            if (!oldestTransport) return;
            oldestTransport.close();
            peer.transports.delete(oldestTransport.id);
        }
    }
}

module.exports = Room;
