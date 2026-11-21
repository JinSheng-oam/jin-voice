const { safeSocket } = require('./security');

const MAX_ROOM_PASSWORD_BYTES = 72;

const isValidRoomId = (roomId) => (
    typeof roomId === 'string' &&
    roomId.trim().length > 0 &&
    roomId.length <= 128
);

const registerRoomHandlers = (socket, {
    ROOM_CREATE_COOLDOWN_MS, activeRoomUsers, attachSocketToRoom, bcrypt,
    broadcastRoomsUpdated, buildMessagePayload, generateRoomId, getSocketDisplayName, getSocketUserId,
    guestRoomOwners, io, isSocketAdmin, leaveAllRoomsForSocket, leaveRoomHandler,
    mediasoupManager, normalizeDisplayName, normalizeRoomName, prisma,
    reverseIdMap, roomCreateTimestamps, updateGuestDisplayName, userIdMap,
    canSocketManageRoom, checkSocketRateLimit = () => true
}) => {
    socket = safeSocket(socket);
    const isSocketDisconnected = () => Boolean(
        socket.disconnected || (userIdMap && socket.id && !userIdMap.has(socket.id))
    );

    const runRoomTransition = (task) => {
        const pending = (socket.data?.roomTransition || Promise.resolve()).then(task);
        if (socket.data) {
            socket.data.roomTransition = pending.catch(() => {});
        }
        return pending;
    };

    socket.on('createRoom', ({ roomName, password, isPrivate }) => runRoomTransition(async () => {
        if (isSocketDisconnected()) return;

        const funId = userIdMap?.get(socket.id);
        const createIdentityKey = getSocketUserId?.(socket) || socket.data?.guestId || funId;

        // Rate limit room creation by account / guest / funId
        const lastCreateByIdentity = createIdentityKey ? roomCreateTimestamps.get(createIdentityKey) : 0;
        const lastCreateByFunId = funId ? roomCreateTimestamps.get(funId) : 0;
        const lastCreate = Math.max(lastCreateByIdentity || 0, lastCreateByFunId || 0);
        if (lastCreate && Date.now() - lastCreate < ROOM_CREATE_COOLDOWN_MS) {
            socket.emit('roomError', { message: 'Please wait before creating another room.' });
            return;
        }

        if (password !== undefined && password !== null && password !== '') {
            if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > MAX_ROOM_PASSWORD_BYTES) {
                socket.emit('roomError', { message: 'Room password cannot exceed 72 bytes.' });
                return;
            }
        }

        const now = Date.now();
        if (createIdentityKey) roomCreateTimestamps.set(createIdentityKey, now);
        if (funId) roomCreateTimestamps.set(funId, now);

        const safeRoomName = normalizeRoomName(roomName) || 'Voice Room';
        const roomId = generateRoomId();
        const user = socket.data?.user || null;

        try {
            await leaveAllRoomsForSocket(socket, false);
            if (isSocketDisconnected()) return;

            let hashedPassword = null;
            if (password) {
                hashedPassword = await bcrypt.hash(password, 10);
                if (isSocketDisconnected()) return;
            }

            await prisma.room.create({
                data: {
                    id: roomId,
                    name: safeRoomName,
                    password: hashedPassword,
                    isPrivate: Boolean(isPrivate),
                    ownerId: user?.id || null,
                    ownerGuestId: user ? null : socket.data?.guestId,
                    ownerName: user ? null : getSocketDisplayName(socket)
                }
            });

            if (isSocketDisconnected()) return;

            if (!user) {
                guestRoomOwners.set(roomId, {
                    funId: userIdMap.get(socket.id),
                    name: getSocketDisplayName(socket),
                    guestId: socket.data?.guestId
                });
            }

            const { users } = attachSocketToRoom(socket, roomId, user);

            socket.emit('roomCreated', { roomId, roomName: safeRoomName });
            socket.emit('roomJoined', {
                roomId,
                roomName: safeRoomName,
                users
            });

            await broadcastRoomsUpdated();
        } catch (error) {
            console.error('Create room error:', error);
            socket.emit('roomError', { message: 'Failed to create room.' });
        }
    }));

    socket.on('joinRoom', ({ roomId, password }, callback = () => {}) => runRoomTransition(async () => {
        if (isSocketDisconnected()) return;
        if (!checkSocketRateLimit(socket, 'join-room', 20)) {
            socket.emit('roomError', { message: 'Too many join attempts. Please try again later.' });
            callback({ error: 'Too many join attempts. Please try again later.' });
            return;
        }
        if (!isValidRoomId(roomId)) {
            socket.emit('roomError', { message: 'Room not found.' });
            callback({ error: 'Room not found.' });
            return;
        }

        try {
            const room = await prisma.room.findUnique({
                where: { id: roomId }
            });
            if (isSocketDisconnected()) return;

            if (!room) {
                socket.emit('roomError', { message: 'Room not found.' });
                callback({ error: 'Room not found.' });
                return;
            }

            if (room.isLocked && !canSocketManageRoom(socket, room)) {
                socket.emit('roomError', { message: '房间已锁定，请联系房主解锁。' });
                callback({ error: '房间已锁定，请联系房主解锁。' });
                return;
            }

            if (room.isPrivate && room.password) {
                if (typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > MAX_ROOM_PASSWORD_BYTES) {
                    socket.emit('roomError', { message: 'Incorrect room password.' });
                    callback({ error: 'Incorrect room password.' });
                    return;
                }
                if (!checkSocketRateLimit(socket, `join-room-auth:${roomId}`, 8)) {
                    socket.emit('roomError', { message: 'Too many password attempts. Please wait a moment.' });
                    callback({ error: 'Too many password attempts. Please wait a moment.' });
                    return;
                }
                const passwordMatch = await bcrypt.compare(password, room.password);
                if (isSocketDisconnected()) return;
                if (!passwordMatch) {
                    socket.emit('roomError', { message: 'Incorrect room password.' });
                    callback({ error: 'Incorrect room password.' });
                    return;
                }
            }

            await leaveAllRoomsForSocket(socket, false);
            if (isSocketDisconnected()) return;

            const user = socket.data?.user || null;
            const { roomUser, users } = attachSocketToRoom(socket, roomId, user);

            if (room.ownerGuestId && room.ownerGuestId === socket.data?.guestId) {
                guestRoomOwners?.set(roomId, {
                    funId: roomUser.funId,
                    name: roomUser.name,
                    guestId: socket.data?.guestId
                });
            }

            socket.to(roomId).emit('userJoinedRoom', {
                funId: roomUser.funId,
                user: roomUser,
                users
            });

            socket.emit('roomJoined', {
                roomId,
                roomName: room.name,
                users
            });

            // Load recent chat history for the room
            try {
                const history = await prisma.message.findMany({
                    where: {
                        roomId,
                        deletedAt: null
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 50
                });

                if (history.length > 0 && !isSocketDisconnected()) {
                    socket.emit('chatHistory', history.reverse().map(buildMessagePayload));
                }
            } catch (error) {
                console.error('Failed to load chat history:', error);
            }

            await broadcastRoomsUpdated();
            callback({ success: true, roomId });
        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('roomError', { message: 'Failed to join room.' });
            callback({ error: 'Failed to join room.' });
        }
    }));

    socket.on('leaveRoom', ({ roomId }, callback = () => {}) => runRoomTransition(async () => {
        if (roomId && isValidRoomId(roomId)) {
            await leaveRoomHandler(socket, roomId);
        } else {
            await leaveAllRoomsForSocket(socket);
        }
        callback({ success: true, roomId });
    }));

    socket.on('deleteRoom', async ({ roomId }) => {
        if (!checkSocketRateLimit(socket, 'delete-room', 10)) {
            socket.emit('roomError', { message: 'Too many requests. Please try again later.' });
            return;
        }
        if (!isValidRoomId(roomId)) {
            socket.emit('roomError', { message: 'Room not found or already deleted.' });
            return;
        }

        try {
            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    owner: {
                        select: {
                            id: true
                        }
                    }
                }
            });

            if (!room) {
                socket.emit('roomError', { message: 'Room not found or already deleted.' });
                return;
            }

            const currentUserId = getSocketUserId(socket);

            if (!isSocketAdmin(socket) && room.owner && room.ownerId !== currentUserId) {
                socket.emit('roomError', { message: 'Only the room owner can delete this room.' });
                return;
            }

            if (
                !isSocketAdmin(socket) &&
                !room.owner &&
                room.ownerGuestId !== socket.data?.guestId
            ) {
                socket.emit('roomError', { message: 'Only the room owner can delete this room.' });
                return;
            }

            if (typeof prisma.$transaction === 'function') {
                await prisma.$transaction([
                    prisma.message.deleteMany({ where: { roomId } }),
                    prisma.room.delete({ where: { id: roomId } })
                ]);
            } else {
                await prisma.message.deleteMany({ where: { roomId } });
                await prisma.room.delete({ where: { id: roomId } });
            }

            const activeMap = activeRoomUsers.get(roomId);
            const activeUsers = activeMap ? Array.from(activeMap.keys()) : [];

            for (const userFunId of activeUsers) {
                const targetSocketId = reverseIdMap.get(userFunId);
                if (!targetSocketId) continue;

                io.to(targetSocketId).emit('roomDeleted', {
                    roomId,
                    roomName: room.name
                });

                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                }
            }

            activeRoomUsers.delete(roomId);
            mediasoupManager.removeRoom(roomId);
            guestRoomOwners.delete(roomId);

            await broadcastRoomsUpdated();
        } catch (error) {
            console.error('Delete room error:', error);
            socket.emit('roomError', { message: 'Failed to delete room.' });
        }
    });

    socket.on('renameRoom', async ({ roomId, roomName }, callback = () => {}) => {
        if (!checkSocketRateLimit(socket, 'rename-room', 10)) {
            callback({ error: 'Too many requests. Please try again later.' });
            return;
        }
        if (!isValidRoomId(roomId)) {
            callback({ error: 'Room not found.' });
            socket.emit('roomError', { message: 'Room not found.' });
            return;
        }

        try {
            const safeRoomName = normalizeRoomName(roomName);
            if (!safeRoomName || safeRoomName.length < 2) {
                callback({ error: 'Room name must be at least 2 characters.' });
                socket.emit('roomError', { message: 'Room name must be at least 2 characters.' });
                return;
            }

            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    owner: {
                        select: {
                            id: true
                        }
                    }
                }
            });

            if (!room) {
                callback({ error: 'Room not found.' });
                socket.emit('roomError', { message: 'Room not found.' });
                return;
            }

            const currentUserId = getSocketUserId(socket);
            const canManageRoom =
                isSocketAdmin(socket) ||
                (room.owner && room.ownerId === currentUserId) ||
                (!room.owner && room.ownerGuestId === socket.data?.guestId);

            if (!canManageRoom) {
                callback({ error: 'Only the room owner or an administrator can rename this room.' });
                socket.emit('roomError', { message: 'Only the room owner or an administrator can rename this room.' });
                return;
            }

            const updatedRoom = await prisma.room.update({
                where: { id: roomId },
                data: { name: safeRoomName }
            });

            io.to(roomId).emit('roomRenamed', {
                roomId,
                roomName: updatedRoom.name
            });

            await broadcastRoomsUpdated();
            callback({ success: true, roomId, roomName: updatedRoom.name });
        } catch (error) {
            console.error('Rename room error:', error);
            callback({ error: 'Failed to rename room.' });
            socket.emit('roomError', { message: 'Failed to rename room.' });
        }
    });

    socket.on('setRoomLocked', async ({ roomId, locked } = {}, callback = () => {}) => {
        if (!checkSocketRateLimit(socket, 'set-room-locked', 15)) {
            return callback({ error: 'Too many requests. Please try again later.' });
        }
        if (!isValidRoomId(roomId)) {
            return callback({ error: 'Room not found.' });
        }
        try {
            const room = await prisma.room.findUnique({ where: { id: roomId } });
            if (!room) return callback({ error: 'Room not found.' });
            if (!canSocketManageRoom(socket, room)) {
                return callback({ error: 'Only the room owner or an administrator can lock this room.' });
            }
            const updatedRoom = await prisma.room.update({
                where: { id: roomId },
                data: { isLocked: Boolean(locked) }
            });
            io.to(roomId).emit('roomLockChanged', { roomId, isLocked: updatedRoom.isLocked });
            await broadcastRoomsUpdated();
            return callback({ success: true, roomId, isLocked: updatedRoom.isLocked });
        } catch (error) {
            console.error('Set room lock error:', error);
            return callback({ error: 'Failed to update room lock.' });
        }
    });

    socket.on('removeRoomMember', async ({ roomId, targetFunId } = {}, callback = () => {}) => {
        if (!checkSocketRateLimit(socket, 'remove-room-member', 15)) {
            return callback({ error: 'Too many requests. Please try again later.' });
        }
        if (!isValidRoomId(roomId)) {
            return callback({ error: 'Room not found.' });
        }
        try {
            const room = await prisma.room.findUnique({ where: { id: roomId } });
            if (!room) return callback({ error: 'Room not found.' });
            if (!canSocketManageRoom(socket, room)) {
                return callback({ error: 'Only the room owner or an administrator can remove members.' });
            }
            const normalizedTargetFunId = String(targetFunId || '');
            const targetSocketId = reverseIdMap.get(normalizedTargetFunId);
            const targetSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;
            if (!targetSocket || targetSocket.id === socket.id || !activeRoomUsers.get(roomId)?.has(normalizedTargetFunId)) {
                return callback({ error: 'Member is no longer in this room.' });
            }
            targetSocket.emit('removedFromRoom', { roomId, message: '你已被房主移出房间。' });
            await leaveRoomHandler(targetSocket, roomId);
            return callback({ success: true, roomId, targetFunId: normalizedTargetFunId });
        } catch (error) {
            console.error('Remove room member error:', error);
            return callback({ error: 'Failed to remove member.' });
        }
    });

    socket.on('requestRoomMute', async ({ roomId } = {}, callback = () => {}) => {
        if (!checkSocketRateLimit(socket, 'request-room-mute', 10)) {
            return callback({ error: 'Too many requests. Please try again later.' });
        }
        if (!isValidRoomId(roomId)) {
            return callback({ error: 'Room not found.' });
        }
        try {
            const room = await prisma.room.findUnique({ where: { id: roomId } });
            if (!room) return callback({ error: 'Room not found.' });
            if (!canSocketManageRoom(socket, room)) {
                return callback({ error: 'Only the room owner or an administrator can request mute.' });
            }
            socket.to(roomId).emit('hostMuteRequested', {
                roomId,
                message: '房主已请求全员静音，你的麦克风已关闭。'
            });
            return callback({ success: true, roomId });
        } catch (error) {
            console.error('Request room mute error:', error);
            return callback({ error: 'Failed to request room mute.' });
        }
    });

    socket.on('updateName', async ({ name } = {}) => {
        if (socket.data?.user) {
            return;
        }
        if (!checkSocketRateLimit(socket, 'update-name', 8)) {
            return;
        }

        const nextName = normalizeDisplayName(name);
        if (nextName.length < 2 || nextName === socket.data?.guestName) {
            return;
        }

        if (socket.data) {
            socket.data.guestName = nextName;
        }
        await updateGuestDisplayName(userIdMap.get(socket.id), socket.data?.guestId, nextName);
    });

};

module.exports = { registerRoomHandlers };
