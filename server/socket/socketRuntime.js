const crypto = require('crypto');
const { serializeUser } = require('../auth');
const { normalizeDisplayName } = require('../http/authRoutes');

const funnyIds = [
    'AlphaEcho', 'BluePine', 'CloudMint', 'SolarWave', 'QuietFox', 'NorthLeaf',
    'AmberLake', 'PixelDrift', 'SilverNote', 'MoonCanvas', 'SignalBird', 'VividStone',
    'LimeOrbit', 'NovaBridge', 'RiverTone', 'CedarGlow', 'CometField', 'FrostLine',
    'EchoPilot', 'VelvetPeak', 'MapleSpark', 'SkyLetter', 'OrbitTea', 'DawnThread'
];

const createSocketRuntime = ({ io, prisma, mediasoupManager }) => {
    const userIdMap = new Map();
    const reverseIdMap = new Map();
    const activeRoomUsers = new Map();
    const userSocketsMap = new Map();
    const guestRoomOwners = new Map();
    const roomCreateTimestamps = new Map();
    const ROOM_CREATE_COOLDOWN_MS = 10_000;
    const SOCKET_RATE_WINDOW_MS = 10_000;

    const MAX_CHAT_MESSAGE_LENGTH = 2000;
    const AUTH_ACTION_MESSAGES = {
        createRoom: 'Please sign in to create a room.',
        joinRoom: 'Please sign in to join a room.',
        deleteRoom: 'Please sign in to delete a room.',
        sendMessage: 'Please sign in to send messages.',
        sendPrivateMessage: 'Please sign in to use private chat.',
        callUser: 'Please sign in to start voice calls.',
        answerCall: 'Please sign in to answer voice calls.',
        fileTransfer: 'Please sign in to transfer files.',
        audio: 'Please sign in to use live audio.'
    };

    const generateFunId = () => {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const prefix = funnyIds[crypto.randomInt(0, funnyIds.length)];
            const suffix = crypto.randomBytes(4).toString('hex');
            const candidate = `${prefix}-${suffix}`;
            if (!reverseIdMap.has(candidate)) {
                return candidate;
            }
        }

        return `peer-${crypto.randomUUID()}`;
    };

    const normalizeGuestId = (value) => {
        const guestId = String(value || '').trim();
        return /^[A-Za-z0-9-]{16,128}$/u.test(guestId) ? guestId : crypto.randomUUID();
    };

    const generateRoomId = () => `room_${Math.random().toString(36).slice(2, 11)}`;

    const normalizeRoomName = (roomName = '') => String(roomName || '').trim().slice(0, 40);

    const {
        buildMessagePayload: _buildMessagePayload,
        getSocketDisplayName: _getSocketDisplayName,
        getSocketUserId,
        isSocketAdmin,
        buildRoomUser: _buildRoomUser
    } = require('../utils');

    const buildRoomUser = (socket, user) => _buildRoomUser(socket, user, userIdMap);
    const getSocketDisplayName = (socket) => _getSocketDisplayName(socket, userIdMap);
    const buildMessagePayload = _buildMessagePayload;

    const emitAuthRequired = (socket, action) => {
        socket.emit('authRequired', {
            action,
            message: AUTH_ACTION_MESSAGES[action] || 'Please sign in first.'
        });
    };

    const requireAuthenticatedSocket = (socket, action, callback) => {
        const user = socket.data.user || null;

        if (user) {
            return user;
        }

        emitAuthRequired(socket, action);

        if (typeof callback === 'function') {
            callback({ error: 'Authentication required.' });
        }

        return null;
    };

    const registerSocketForUser = (socket, user) => {
        if (!user?.id) return;

        if (!userSocketsMap.has(user.id)) {
            userSocketsMap.set(user.id, new Set());
        }

        userSocketsMap.get(user.id).add(socket.id);
    };

    const unregisterSocketForUser = (socket) => {
        const userId = socket.data.user?.id;
        if (!userId || !userSocketsMap.has(userId)) return;

        const sockets = userSocketsMap.get(userId);
        sockets.delete(socket.id);

        if (sockets.size === 0) {
            userSocketsMap.delete(userId);
        }
    };

    const fetchRooms = () => prisma.room.findMany({
        include: {
            owner: {
                select: {
                    id: true,
                    displayName: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    const canSocketManageRoom = (socket, room) => Boolean(
        socket && (
            isSocketAdmin(socket) ||
            (room.ownerId && room.ownerId === getSocketUserId(socket)) ||
            (room.ownerGuestId && room.ownerGuestId === socket.data.guestId)
        )
    );

    const serializeRoomsForSocket = (dbRooms, socket = null) => dbRooms.map((room) => {
        const activeMap = activeRoomUsers.get(room.id);
        const guestOwner = guestRoomOwners.get(room.id);

        return {
            roomId: room.id,
            name: room.name,
            ownerId: room.owner?.id || null,
            ownerFunId: guestOwner?.funId || null,
            ownerName: room.owner?.displayName || room.ownerName || guestOwner?.name || null,
            canManage: canSocketManageRoom(socket, room),
            userCount: activeMap ? activeMap.size : 0,
            createdAt: room.createdAt,
            isPrivate: room.isPrivate || false,
            isLocked: room.isLocked || false
        };
    });

    const getRoomsList = async (socket = null) => {
        try {
            return serializeRoomsForSocket(await fetchRooms(), socket);
        } catch (error) {
            console.error('Error fetching rooms:', error);
            return [];
        }
    };

    const broadcastRoomsUpdated = async () => {
        try {
            const dbRooms = await fetchRooms();
            io.sockets.sockets.forEach((targetSocket) => {
                targetSocket.emit('roomsUpdated', serializeRoomsForSocket(dbRooms, targetSocket));
            });
        } catch (error) {
            console.error('Error broadcasting rooms:', error);
        }
    };

    const updateActiveUserDisplayName = (userId, displayName) => {
        activeRoomUsers.forEach((usersMap, roomId) => {
            const updates = [];

            usersMap.forEach((userData) => {
                if (userData.userId !== userId || userData.name === displayName) {
                    return;
                }

                userData.name = displayName;
                updates.push({ funId: userData.funId, name: displayName });
            });

            updates.forEach((payload) => {
                io.to(roomId).emit('userUpdated', payload);
            });
        });
    };

    const updateGuestDisplayName = async (funId, guestId, displayName) => {
        activeRoomUsers.forEach((usersMap, roomId) => {
            const roomUser = usersMap.get(funId);
            if (roomUser && roomUser.name !== displayName) {
                roomUser.name = displayName;
                io.to(roomId).emit('userUpdated', { funId, name: displayName });
            }

            const guestOwner = guestRoomOwners.get(roomId);
            if (guestOwner?.funId === funId && guestOwner.name !== displayName) {
                guestRoomOwners.set(roomId, { ...guestOwner, name: displayName });
            }
        });

        if (guestId) {
            await prisma.room.updateMany({
                where: { ownerGuestId: guestId },
                data: { ownerName: displayName }
            });
        }

        await broadcastRoomsUpdated();
    };

    const syncUserSnapshotToSockets = async (user) => {
        const serializedUser = serializeUser(user);
        const socketIds = userSocketsMap.get(user.id);

        if (socketIds) {
            socketIds.forEach((socketId) => {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) {
                    targetSocket.data.user = serializedUser;
                    targetSocket.emit('authUserUpdated', serializedUser);
                }
            });
        }

        updateActiveUserDisplayName(user.id, user.displayName);
        await broadcastRoomsUpdated();
    };

    const expireUserSessionsAndNotifySockets = async (userId, message = 'Your account session has ended.') => {
        await prisma.session.deleteMany({
            where: { userId }
        });

        const socketIds = userSocketsMap.get(userId);
        if (!socketIds) return;

        userSocketsMap.delete(userId);
        Array.from(socketIds).forEach((socketId) => {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
                targetSocket.data.user = null;
                targetSocket.emit('sessionExpired', { message });
                targetSocket.disconnect(true);
            }
        });
    };

    const leaveRoomHandler = async (
        socket,
        roomId,
        { isDisconnect = false, skipRoomsBroadcast = false } = {}
    ) => {
        const funId = userIdMap.get(socket.id);
        const activeMap = activeRoomUsers.get(roomId);

        if (!funId || !activeMap || !activeMap.has(funId)) {
            return;
        }

        activeMap.delete(funId);

        if (guestRoomOwners.get(roomId)?.funId === funId) {
            guestRoomOwners.delete(roomId);
        }

        if (!isDisconnect) {
            socket.leave(roomId);
        }

        socket.to(roomId).emit('userLeftRoom', {
            funId,
            users: Array.from(activeMap.values())
        });

        if (activeMap.size === 0) {
            activeRoomUsers.delete(roomId);
        }

        try {
            const room = mediasoupManager.getRoom(roomId);
            if (room) {
                const producerId = room.removePeer(funId);
                if (producerId) {
                    socket.to(roomId).emit('producerClosed', { producerId });
                }
                if (room.peerCount === 0) {
                    mediasoupManager.removeRoomIfEmpty(roomId);
                }
            }
        } catch (error) {
            console.error('Error cleaning up mediasoup peer:', error);
        }

        if (!skipRoomsBroadcast) {
            await broadcastRoomsUpdated();
        }
    };

    const leaveAllRoomsForSocket = async (socket, isDisconnect = false) => {
        const funId = userIdMap.get(socket.id);
        if (!funId) return;

        const joinedRoomIds = [];
        activeRoomUsers.forEach((usersMap, roomId) => {
            if (usersMap.has(funId)) {
                joinedRoomIds.push(roomId);
            }
        });

        for (const roomId of joinedRoomIds) {
            await leaveRoomHandler(socket, roomId, {
                isDisconnect,
                skipRoomsBroadcast: true
            });
        }

        if (joinedRoomIds.length > 0) {
            await broadcastRoomsUpdated();
        }
    };

    const attachSocketToRoom = (socket, roomId, user) => {
        if (!activeRoomUsers.has(roomId)) {
            activeRoomUsers.set(roomId, new Map());
        }

        const usersMap = activeRoomUsers.get(roomId);
        const roomUser = buildRoomUser(socket, user);
        usersMap.set(roomUser.funId, roomUser);
        socket.join(roomId);

        return {
            roomUser,
            users: Array.from(usersMap.values())
        };
    };

    const isSocketActiveInRoom = (socket, roomId) => {
        const funId = userIdMap.get(socket.id);
        return Boolean(funId && roomId && activeRoomUsers.get(roomId)?.has(funId));
    };

    const findSharedRoomId = (firstFunId, secondFunId) => {
        if (!firstFunId || !secondFunId || firstFunId === secondFunId) return null;

        for (const [roomId, usersMap] of activeRoomUsers) {
            if (usersMap.has(firstFunId) && usersMap.has(secondFunId)) {
                return roomId;
            }
        }

        return null;
    };

    const getSharedPeerContext = (socket, targetFunId) => {
        const senderFunId = userIdMap.get(socket.id);
        const targetSocketId = reverseIdMap.get(String(targetFunId || ''));
        const roomId = findSharedRoomId(senderFunId, targetFunId);

        if (!senderFunId || !targetSocketId || !roomId) return null;
        return { senderFunId, targetSocketId, roomId };
    };

    const isSafeSignalPayload = (payload) => {
        if (!payload || typeof payload !== 'object') return false;
        try {
            return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= 128 * 1024;
        } catch {
            return false;
        }
    };

    const requireActiveRoomMember = (socket, roomId, callback) => {
        if (isSocketActiveInRoom(socket, roomId)) {
            return true;
        }

        if (typeof callback === 'function') {
            callback({ error: 'Join the room before using live audio.' });
        }

        return false;
    };

    const normalizeSfuSessionId = (value) => {
        const sessionId = String(value || '').trim();
        return /^[A-Za-z0-9-]{16,128}$/u.test(sessionId) ? sessionId : '';
    };

    const requireCurrentSfuSession = (socket, roomId, sfuSessionId, callback) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return null;

        const room = mediasoupManager.getRoom(roomId);
        const peerId = userIdMap.get(socket.id);
        const normalizedSessionId = normalizeSfuSessionId(sfuSessionId);

        if (!room || !peerId || !room.isPeerSessionActive(peerId, normalizedSessionId)) {
            callback({ error: 'SFU session is stale. Please reconnect to the room.' });
            return null;
        }

        return { room, peerId, sfuSessionId: normalizedSessionId };
    };

    const checkSocketRateLimit = (socket, action, maxActions) => {
        const now = Date.now();
        const rateLimits = socket.data.rateLimits || new Map();
        const entry = rateLimits.get(action);

        socket.data.rateLimits = rateLimits;

        if (!entry || now - entry.windowStart > SOCKET_RATE_WINDOW_MS) {
            rateLimits.set(action, { count: 1, windowStart: now });
            return true;
        }

        if (entry.count >= maxActions) {
            return false;
        }

        entry.count += 1;
        return true;
    };


    return {
        MAX_CHAT_MESSAGE_LENGTH, ROOM_CREATE_COOLDOWN_MS, activeRoomUsers,
        attachSocketToRoom, broadcastRoomsUpdated, buildMessagePayload, canSocketManageRoom, checkSocketRateLimit,
        expireUserSessionsAndNotifySockets, generateFunId, generateRoomId,
        getRoomsList, getSharedPeerContext, getSocketDisplayName, getSocketUserId,
        guestRoomOwners, isSafeSignalPayload, isSocketAdmin, leaveAllRoomsForSocket,
        leaveRoomHandler, normalizeGuestId, normalizeRoomName, normalizeSfuSessionId,
        registerSocketForUser, requireActiveRoomMember, requireAuthenticatedSocket,
        requireCurrentSfuSession, reverseIdMap, roomCreateTimestamps,
        syncUserSnapshotToSockets, unregisterSocketForUser, updateGuestDisplayName, userIdMap
    };
};

module.exports = { createSocketRuntime };
