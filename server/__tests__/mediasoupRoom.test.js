const Room = require('../mediasoup/Room');

const createFakeProducer = (id) => {
    const handlers = new Map();
    return {
        id,
        closed: false,
        on(event, handler) {
            handlers.set(event, handler);
        },
        close() {
            if (this.closed) return;
            this.closed = true;
            handlers.get('@close')?.();
        }
    };
};

const createFakeConsumer = (id, producerId) => {
    const handlers = new Map();
    return {
        id,
        producerId,
        kind: 'audio',
        rtpParameters: {},
        closed: false,
        resumed: false,
        on(event, handler) {
            handlers.set(event, handler);
        },
        async resume() {
            this.resumed = true;
        },
        close() {
            this.closed = true;
        }
    };
};

const createFakeTransport = (id, appData = {}) => {
    const handlers = new Map();
    let nextProducerId = 1;
    let nextConsumerId = 1;

    return {
        id,
        appData,
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
        closed: false,
        on(event, handler) {
            handlers.set(event, handler);
        },
        close() {
            if (this.closed) return;
            this.closed = true;
            handlers.get('@close')?.();
        },
        async connect() {},
        async produce() {
            return createFakeProducer(`producer-${id}-${nextProducerId++}`);
        },
        async consume({ producerId }) {
            return createFakeConsumer(`consumer-${id}-${nextConsumerId++}`, producerId);
        }
    };
};

const createFakeRouter = () => {
    let nextId = 1;
    return {
        rtpCapabilities: {},
        closed: false,
        async createWebRtcTransport(options) {
            return createFakeTransport(`transport-${nextId++}`, options.appData);
        },
        canConsume() {
            return true;
        },
        close() {
            this.closed = true;
        }
    };
};

describe('mediasoup Room session lifecycle', () => {
    test('keeps one transport per type and closes the replaced transport', async () => {
        const room = new Room('room-1', createFakeRouter());
        room.beginPeerSession('peer-1', 'session-00000001');

        const first = await room.createWebRtcTransport('peer-1', 'session-00000001', 'send');
        const firstTransport = room.peers.get('peer-1').transports.get(first.id);
        const second = await room.createWebRtcTransport('peer-1', 'session-00000001', 'send');
        const peer = room.peers.get('peer-1');

        expect(firstTransport.closed).toBe(true);
        expect(peer.transports.has(first.id)).toBe(false);
        expect(peer.transports.has(second.id)).toBe(true);
        expect(peer.transports.size).toBe(1);
    });

    test('closes the producer when replacing its send transport', async () => {
        const room = new Room('room-1', createFakeRouter());
        room.beginPeerSession('peer-1', 'session-00000001');
        const firstTransport = await room.createWebRtcTransport(
            'peer-1',
            'session-00000001',
            'send'
        );
        const producer = await room.produce(
            'peer-1',
            'session-00000001',
            firstTransport.id,
            'audio',
            {}
        );

        const replacement = await room.createWebRtcTransport(
            'peer-1',
            'session-00000001',
            'send'
        );

        expect(replacement.replacedProducerId).toBe(producer.id);
        expect(room.peers.get('peer-1').producer).toBeNull();
    });

    test('consumes on the explicitly requested receive transport', async () => {
        const room = new Room('room-1', createFakeRouter());
        room.beginPeerSession('peer-1', 'session-00000001');
        await room.createWebRtcTransport('peer-1', 'session-00000001', 'send');
        const recv = await room.createWebRtcTransport('peer-1', 'session-00000001', 'recv');

        const consumer = await room.consume(
            'peer-1',
            'session-00000001',
            recv.id,
            'producer-1',
            {}
        );

        expect(consumer.id).toContain(recv.id);
    });

    test('rejects stale sessions after a peer session is replaced', async () => {
        const room = new Room('room-1', createFakeRouter());
        room.beginPeerSession('peer-1', 'session-00000001');
        const first = await room.createWebRtcTransport('peer-1', 'session-00000001', 'send');
        const firstTransport = room.peers.get('peer-1').transports.get(first.id);

        room.beginPeerSession('peer-1', 'session-00000002');

        expect(firstTransport.closed).toBe(true);
        await expect(room.createWebRtcTransport('peer-1', 'session-00000001', 'send'))
            .rejects.toThrow('Stale or missing SFU session');
    });

    test('replaces an existing consumer without leaking it', async () => {
        const room = new Room('room-1', createFakeRouter());
        room.beginPeerSession('peer-1', 'session-00000001');
        const recv = await room.createWebRtcTransport('peer-1', 'session-00000001', 'recv');

        await room.consume('peer-1', 'session-00000001', recv.id, 'producer-1', {});
        const firstConsumer = room.peers.get('peer-1').consumers.get('producer-1');
        await room.consume('peer-1', 'session-00000001', recv.id, 'producer-1', {});
        const secondConsumer = room.peers.get('peer-1').consumers.get('producer-1');

        expect(firstConsumer.closed).toBe(true);
        expect(secondConsumer).not.toBe(firstConsumer);
        expect(room.peers.get('peer-1').consumers.size).toBe(1);
    });

    test('reports a replaced producer so remote consumers can be closed', async () => {
        const room = new Room('room-1', createFakeRouter());
        room.beginPeerSession('peer-1', 'session-00000001');
        const send = await room.createWebRtcTransport('peer-1', 'session-00000001', 'send');

        const first = await room.produce('peer-1', 'session-00000001', send.id, 'audio', {});
        const second = await room.produce('peer-1', 'session-00000001', send.id, 'audio', {});

        expect(second.replacedProducerId).toBe(first.id);
    });

    test('does not remove the current peer for a stale or empty session token', () => {
        const room = new Room('room-1', createFakeRouter());
        room.beginPeerSession('peer-1', 'session-00000002');

        expect(room.removePeer('peer-1', 'session-00000001')).toBeNull();
        expect(room.removePeer('peer-1', '')).toBeNull();
        expect(room.peers.has('peer-1')).toBe(true);

        room.removePeer('peer-1', 'session-00000002');
        expect(room.peers.has('peer-1')).toBe(false);
    });
});
