const config = require('./config');

class Room {
    constructor(roomId, router) {
        this.roomId = roomId;
        this.router = router;
        this.peers = new Map();
    }

    getRouterRtpCapabilities() {
        return this.router.rtpCapabilities;
    }

    beginPeerSession(peerId, sessionId) {
        if (!peerId || !sessionId) {
            throw new Error('Invalid SFU peer session');
        }

        const existingPeer = this.peers.get(peerId);
        if (existingPeer?.sessionId === sessionId) {
            return { peer: existingPeer, replacedProducerId: null };
        }

        let replacedProducerId = null;
        if (existingPeer) {
            replacedProducerId = this.removePeer(peerId);
        }

        const peer = {
            sessionId,
            transports: new Map(),
            transportVersions: new Map(),
            producer: null,
            producerVersion: 0,
            consumers: new Map(),
            consumerVersions: new Map()
        };
        this.peers.set(peerId, peer);
        return { peer, replacedProducerId };
    }

    isPeerSessionActive(peerId, sessionId) {
        return Boolean(sessionId && this.peers.get(peerId)?.sessionId === sessionId);
    }

    async createWebRtcTransport(peerId, sessionId, type = 'send') {
        const peer = this._requirePeerSession(peerId, sessionId);
        const transportType = type === 'recv' ? 'recv' : 'send';
        const requestVersion = (peer.transportVersions.get(transportType) || 0) + 1;
        peer.transportVersions.set(transportType, requestVersion);

        const transport = await this.router.createWebRtcTransport({
            ...config.webRtcTransport,
            appData: { type: transportType, sessionId }
        });

        if (
            !this.isPeerSessionActive(peerId, sessionId) ||
            peer.transportVersions.get(transportType) !== requestVersion
        ) {
            transport.close();
            throw new Error('SFU session was replaced while creating transport');
        }

        let replacedProducerId = null;
        if (transportType === 'send') {
            replacedProducerId = peer.producer?.id || null;
            peer.producerVersion += 1;
            peer.producer?.close();
            peer.producer = null;
        }

        for (const existingTransport of peer.transports.values()) {
            if (existingTransport.appData?.type === transportType) {
                existingTransport.close();
            }
        }

        transport.on('@close', () => {
            if (peer.transports.get(transport.id) === transport) {
                peer.transports.delete(transport.id);
            }
        });

        peer.transports.set(transport.id, transport);

        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            appData: transport.appData,
            replacedProducerId
        };
    }

    async connectTransport(peerId, sessionId, transportId, dtlsParameters) {
        const transport = this._requireTransport(peerId, sessionId, transportId);
        await transport.connect({ dtlsParameters });
    }

    async produce(peerId, sessionId, transportId, kind, rtpParameters) {
        const peer = this._requirePeerSession(peerId, sessionId);
        const transport = this._requireTransport(peerId, sessionId, transportId, 'send');
        const requestVersion = ++peer.producerVersion;
        const producer = await transport.produce({ kind, rtpParameters });

        if (!this.isPeerSessionActive(peerId, sessionId) || peer.producerVersion !== requestVersion) {
            producer.close();
            throw new Error('SFU session was replaced while producing audio');
        }

        const previousProducer = peer.producer;
        peer.producer = producer;

        producer.on('transportclose', () => {
            if (peer.producer === producer) {
                peer.producer = null;
            }
        });

        producer.on('@close', () => {
            if (peer.producer === producer) {
                peer.producer = null;
            }
        });

        const replacedProducerId = previousProducer?.id || null;
        previousProducer?.close();

        return { id: producer.id, replacedProducerId };
    }

    async consume(peerId, sessionId, transportId, producerId, rtpCapabilities) {
        const peer = this._requirePeerSession(peerId, sessionId);
        const recvTransport = this._requireTransport(peerId, sessionId, transportId, 'recv');

        if (!this.router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error('Cannot consume this producer');
        }

        const requestVersion = (peer.consumerVersions.get(producerId) || 0) + 1;
        peer.consumerVersions.set(producerId, requestVersion);

        const consumer = await recvTransport.consume({
            producerId,
            rtpCapabilities,
            paused: true
        });

        if (
            !this.isPeerSessionActive(peerId, sessionId) ||
            peer.consumerVersions.get(producerId) !== requestVersion ||
            peer.transports.get(transportId) !== recvTransport
        ) {
            consumer.close();
            throw new Error('SFU session was replaced while consuming audio');
        }

        await consumer.resume();

        const previousConsumer = peer.consumers.get(producerId);
        peer.consumers.set(producerId, consumer);
        previousConsumer?.close();

        const removeCurrentConsumer = () => {
            if (peer.consumers.get(producerId) === consumer) {
                peer.consumers.delete(producerId);
                peer.consumerVersions.delete(producerId);
            }
        };

        consumer.on('transportclose', removeCurrentConsumer);
        consumer.on('producerclose', () => {
            consumer.close();
            removeCurrentConsumer();
        });

        return {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
        };
    }

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

    removePeer(peerId, expectedSessionId = undefined) {
        const peer = this.peers.get(peerId);
        if (!peer || (expectedSessionId !== undefined && peer.sessionId !== expectedSessionId)) {
            return null;
        }

        const producerId = peer.producer?.id || null;
        for (const transport of peer.transports.values()) {
            transport.close();
        }
        for (const consumer of peer.consumers.values()) {
            consumer.close();
        }
        peer.producer?.close();

        this.peers.delete(peerId);
        return producerId;
    }

    get peerCount() {
        return this.peers.size;
    }

    close() {
        for (const peerId of Array.from(this.peers.keys())) {
            this.removePeer(peerId);
        }
        if (!this.router.closed) {
            this.router.close();
        }
    }

    _requirePeerSession(peerId, sessionId) {
        const peer = this.peers.get(peerId);
        if (!peer || peer.sessionId !== sessionId) {
            throw new Error('Stale or missing SFU session');
        }
        return peer;
    }

    _requireTransport(peerId, sessionId, transportId, expectedType = null) {
        const peer = this._requirePeerSession(peerId, sessionId);
        const transport = peer.transports.get(transportId);
        if (!transport || transport.closed) {
            throw new Error('Transport not found');
        }
        if (expectedType && transport.appData?.type !== expectedType) {
            throw new Error(`Expected ${expectedType} transport`);
        }
        return transport;
    }
}

module.exports = Room;
