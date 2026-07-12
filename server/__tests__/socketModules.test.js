const { registerChatHandlers } = require('../socket/chatHandlers');
const { registerPeerHandlers } = require('../socket/peerHandlers');
const { registerRoomHandlers } = require('../socket/roomHandlers');
const { registerSfuHandlers } = require('../socket/sfuHandlers');
const { createSocketRuntime } = require('../socket/socketRuntime');

const collectEvents = (register, dependencies = {}) => {
    const events = [];
    register({ on: (event) => events.push(event) }, dependencies);
    return events;
};

describe('Socket module contracts', () => {
    test('each concern registers its existing event surface', () => {
        expect(collectEvents(registerPeerHandlers)).toEqual(['callUser', 'answerCall', 'iceCandidate']);
        expect(collectEvents(registerChatHandlers)).toEqual([
            'sendMessage', 'sendPrivateMessage', 'deleteMessage'
        ]);
        expect(collectEvents(registerRoomHandlers)).toEqual([
            'createRoom', 'joinRoom', 'leaveRoom', 'deleteRoom', 'renameRoom', 'updateName'
        ]);
        expect(collectEvents(registerSfuHandlers)).toEqual([
            'startSfuSession', 'closeSfuSession', 'getRouterRtpCapabilities',
            'createWebRtcTransport', 'connectTransport', 'produce', 'consume', 'getProducers'
        ]);
    });

    test('runtime keeps identity and signaling validation behind a stable API', () => {
        const runtime = createSocketRuntime({
            io: { sockets: { sockets: new Map() } },
            prisma: {},
            mediasoupManager: {}
        });
        expect(runtime.normalizeGuestId('valid-guest-id-1234')).toBe('valid-guest-id-1234');
        expect(runtime.normalizeGuestId('bad')).toMatch(/^[0-9a-f-]{36}$/u);
        expect(runtime.normalizeSfuSessionId('valid-session-id-1234')).toBe('valid-session-id-1234');
        expect(runtime.isSafeSignalPayload({ type: 'offer' })).toBe(true);
        expect(runtime.isSafeSignalPayload({ payload: 'x'.repeat(129 * 1024) })).toBe(false);
    });
});
