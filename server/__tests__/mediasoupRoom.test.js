const Room = require('../mediasoup/Room');

const createFakeTransport = (id, appData = {}) => {
    const handlers = new Map();
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
            this.closed = true;
            handlers.get('@close')?.();
        },
        async connect() {},
        async produce() {
            return createFakeProducer(`producer-${id}`);
        }
    };
};

const createFakeProducer = (id) => {
    const handlers = new Map();
    return {
        id,
        closed: false,
        on(event, handler) {
            handlers.set(event, handler);
        },
        close() {
            this.closed = true;
            handlers.get('@close')?.();
        }
    };
};

const createFakeRouter = () => {
    let nextId = 1;
    return {
        rtpCapabilities: {},
        async createWebRtcTransport(options) {
            return createFakeTransport(`transport-${nextId++}`, options.appData);
        },
        canConsume() {
            return true;
        },
        close() {}
    };
};

describe('mediasoup Room transport lifecycle', () => {
    test('replaces stale same-type transports for a peer', async () => {
        const room = new Room('room-1', createFakeRouter());

        const first = await room.createWebRtcTransport('peer-1', 'send');
        const firstTransport = room.peers.get('peer-1').transports.get(first.id);

        const second = await room.createWebRtcTransport('peer-1', 'send');
        const peer = room.peers.get('peer-1');

        expect(firstTransport.closed).toBe(true);
        expect(peer.transports.has(first.id)).toBe(false);
        expect(peer.transports.has(second.id)).toBe(true);
        expect(peer.transports.size).toBe(1);
    });

    test('clears recv consumers when recreating receive transport', async () => {
        const room = new Room('room-1', createFakeRouter());
        await room.createWebRtcTransport('peer-1', 'recv');
        const peer = room.peers.get('peer-1');
        const consumer = { close: jest.fn() };
        peer.consumers.set('producer-1', consumer);

        await room.createWebRtcTransport('peer-1', 'recv');

        expect(consumer.close).toHaveBeenCalledTimes(1);
        expect(peer.consumers.size).toBe(0);
        expect(peer.transports.size).toBe(1);
    });
});
