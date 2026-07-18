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
            'createRoom', 'joinRoom', 'leaveRoom', 'deleteRoom', 'renameRoom',
            'setRoomLocked', 'removeRoomMember', 'requestRoomMute', 'updateName'
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

    test('guest room creation receives the display-name dependency', async () => {
        const handlers = {};
        const socket = {
            id: 'socket-1',
            data: { guestId: 'guest-1', user: null },
            emit: jest.fn(),
            on: (event, handler) => { handlers[event] = handler; }
        };
        const prisma = { room: { create: jest.fn().mockResolvedValue({}) } };
        const broadcastRoomsUpdated = jest.fn().mockResolvedValue(undefined);

        registerRoomHandlers(socket, {
            ROOM_CREATE_COOLDOWN_MS: 0,
            activeRoomUsers: new Map(),
            attachSocketToRoom: () => ({ users: [] }),
            bcrypt: { hash: jest.fn() },
            broadcastRoomsUpdated,
            generateRoomId: () => 'room-1',
            getSocketDisplayName: () => '访客0001',
            guestRoomOwners: new Map(),
            leaveAllRoomsForSocket: jest.fn().mockResolvedValue(undefined),
            normalizeRoomName: (name) => name,
            prisma,
            roomCreateTimestamps: new Map(),
            userIdMap: new Map([[socket.id, 'fun-1']])
        });

        await handlers.createRoom({ roomName: '开黑房', isPrivate: false });

        expect(prisma.room.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ ownerName: '访客0001' })
        }));
        expect(broadcastRoomsUpdated).toHaveBeenCalled();
    });

    test('public messages resolve the sender room from the active-room dependency', async () => {
        const handlers = {};
        const roomEmit = jest.fn();
        const socket = {
            id: 'socket-1',
            emit: jest.fn(),
            on: (event, handler) => { handlers[event] = handler; }
        };
        const message = { id: 1, content: '开黑吗', roomId: 'room-1' };
        const prisma = { message: { create: jest.fn().mockResolvedValue(message) } };

        registerChatHandlers(socket, {
            MAX_CHAT_MESSAGE_LENGTH: 500,
            activeRoomUsers: new Map([['room-1', new Map([['fun-1', {}]])]]),
            buildMessagePayload: (value) => value,
            checkSocketRateLimit: () => true,
            getSocketDisplayName: () => '玩家一',
            getSocketUserId: () => null,
            io: { to: () => ({ emit: roomEmit }) },
            prisma,
            userIdMap: new Map([[socket.id, 'fun-1']])
        });

        await handlers.sendMessage({ text: '开黑吗' });

        expect(prisma.message.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ content: '开黑吗', roomId: 'room-1', senderFunId: 'fun-1' })
        });
        expect(roomEmit).toHaveBeenCalledWith('receiveMessage', message);
    });

    test('locked rooms reject non-managers before attaching them', async () => {
        const handlers = {};
        const socket = {
            data: { guestId: 'guest-2', user: null },
            emit: jest.fn(),
            on: (event, handler) => { handlers[event] = handler; }
        };
        const attachSocketToRoom = jest.fn();
        const callback = jest.fn();

        registerRoomHandlers(socket, {
            attachSocketToRoom,
            bcrypt: { compare: jest.fn() },
            canSocketManageRoom: () => false,
            prisma: { room: { findUnique: jest.fn().mockResolvedValue({ id: 'room-1', isLocked: true }) } }
        });

        await handlers.joinRoom({ roomId: 'room-1' }, callback);

        expect(callback).toHaveBeenCalledWith({ error: '房间已锁定，请联系房主解锁。' });
        expect(attachSocketToRoom).not.toHaveBeenCalled();
    });

    test('room managers can lock a room and broadcast the new state', async () => {
        const handlers = {};
        const roomEmit = jest.fn();
        const socket = { on: (event, handler) => { handlers[event] = handler; } };
        const callback = jest.fn();
        const broadcastRoomsUpdated = jest.fn().mockResolvedValue(undefined);

        registerRoomHandlers(socket, {
            broadcastRoomsUpdated,
            canSocketManageRoom: () => true,
            io: { to: () => ({ emit: roomEmit }) },
            prisma: {
                room: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'room-1' }),
                    update: jest.fn().mockResolvedValue({ isLocked: true })
                }
            }
        });

        await handlers.setRoomLocked({ roomId: 'room-1', locked: true }, callback);

        expect(roomEmit).toHaveBeenCalledWith('roomLockChanged', { roomId: 'room-1', isLocked: true });
        expect(callback).toHaveBeenCalledWith({ success: true, roomId: 'room-1', isLocked: true });
        expect(broadcastRoomsUpdated).toHaveBeenCalled();
    });
});
