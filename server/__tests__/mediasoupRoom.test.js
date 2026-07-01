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
        },
        async consume({ producerId }) {
            return {
                id: `consumer-${id}`,
                producerId,
                kind: 'audio',
                rtpParameters: {},
                on() {},
                async resume() {},
                close() {}
            };
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
    test('keeps same-type transports during reconnect races', async () => {
        const room = new Room('room-1', createFakeRouter());

        const first = await room.createWebRtcTransport('peer-1', 'send');
        const firstTransport = room.peers.get('peer-1').transports.get(first.id);
        const second = await room.createWebRtcTransport('peer-1', 'send');
        const peer = room.peers.get('peer-1');

        expect(firstTransport.closed).toBe(false);
        expect(peer.transports.has(first.id)).toBe(true);
        expect(peer.transports.has(second.id)).toBe(true);
        expect(peer.transports.size).toBe(2);
    });

    test('uses newest receive transport when multiple exist during reconnect', async () => {
        const room = new Room('room-1', createFakeRouter());
        const first = await room.createWebRtcTransport('peer-1', 'recv');
        const second = await room.createWebRtcTransport('peer-1', 'recv');

        const consumer = await room.consume('peer-1', 'producer-1', {});

        expect(first.id).toBe('transport-1');
        expect(second.id).toBe('transport-2');
        expect(consumer.id).toBe('consumer-transport-2');
    });

    test('trims old transports instead of growing without bounds', async () => {
        const room = new Room('room-1', createFakeRouter());

        const created = [];
        for (let index = 0; index < 5; index += 1) {
            created.push(await room.createWebRtcTransport('peer-1', 'send'));
        }

        const peer = room.peers.get('peer-1');

        expect(peer.transports.size).toBe(4);
        expect(peer.transports.has(created[0].id)).toBe(false);
        expect(peer.transports.has(created[4].id)).toBe(true);
    });
});
