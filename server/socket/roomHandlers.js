const registerRoomHandlers = (socket, {
    ROOM_CREATE_COOLDOWN_MS, activeRoomUsers, attachSocketToRoom, bcrypt,
    broadcastRoomsUpdated, buildMessagePayload, generateRoomId, getSocketUserId,
    guestRoomOwners, io, isSocketAdmin, leaveAllRoomsForSocket, leaveRoomHandler,
    mediasoupManager, normalizeDisplayName, normalizeRoomName, prisma,
    reverseIdMap, roomCreateTimestamps, updateGuestDisplayName, userIdMap
}) => {
    socket.on('createRoom', async ({ roomName, password, isPrivate }) => {
        const funId = userIdMap.get(socket.id);

        // Rate limit room creation
        const lastCreate = roomCreateTimestamps.get(funId);
        if (lastCreate && Date.now() - lastCreate < ROOM_CREATE_COOLDOWN_MS) {
            socket.emit('roomError', { message: 'Please wait before creating another room.' });
            return;
        }
        roomCreateTimestamps.set(funId, Date.now());

        const safeRoomName = normalizeRoomName(roomName) || 'Voice Room';
        const roomId = generateRoomId();
        const user = socket.data.user || null;

        try {
            await leaveAllRoomsForSocket(socket, false);

            // Hash password if provided
            let hashedPassword = null;
            if (password) {
                hashedPassword = await bcrypt.hash(password, 10);
            }

            await prisma.room.create({
                data: {
                    id: roomId,
                    name: safeRoomName,
                    password: hashedPassword,
                    isPrivate: Boolean(isPrivate),
                    ownerId: user?.id || null,
                    ownerGuestId: user ? null : socket.data.guestId,
                    ownerName: user ? null : getSocketDisplayName(socket)
                }
            });

            if (!user) {
                guestRoomOwners.set(roomId, {
                    funId: userIdMap.get(socket.id),
                    name: getSocketDisplayName(socket),
                    guestId: socket.data.guestId
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
            socket.emit('roomError', { message: `Failed to create room: ${error.message}` });
        }
    });

    socket.on('joinRoom', async ({ roomId, password }, callback = () => {}) => {
        try {
            const room = await prisma.room.findUnique({
                where: { id: roomId }
            });

            if (!room) {
                socket.emit('roomError', { message: 'Room not found.' });
                callback({ error: 'Room not found.' });
                return;
            }

            if (room.isPrivate && room.password) {
                if (!password) {
                    socket.emit('roomError', { message: 'Incorrect room password.' });
                    callback({ error: 'Incorrect room password.' });
                    return;
                }
                const passwordMatch = await bcrypt.compare(password, room.password);
                if (!passwordMatch) {
                    socket.emit('roomError', { message: 'Incorrect room password.' });
                    callback({ error: 'Incorrect room password.' });
                    return;
                }
            }

            await leaveAllRoomsForSocket(socket, false);

            const user = socket.data.user || null;
            const { roomUser, users } = attachSocketToRoom(socket, roomId, user);

            if (room.ownerGuestId && room.ownerGuestId === socket.data.guestId) {
                guestRoomOwners.set(roomId, {
                    funId: roomUser.funId,
                    name: roomUser.name,
                    guestId: socket.data.guestId
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

                if (history.length > 0) {
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
    });

    socket.on('leaveRoom', async ({ roomId }, callback = () => {}) => {
        await leaveRoomHandler(socket, roomId);
        callback({ success: true, roomId });
    });

    socket.on('deleteRoom', async ({ roomId }) => {
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
                room.ownerGuestId !== socket.data.guestId
            ) {
                socket.emit('roomError', { message: 'Only the room owner can delete this room.' });
                return;
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

            await prisma.message.deleteMany({ where: { roomId } });
            await prisma.room.delete({ where: { id: roomId } });
            await broadcastRoomsUpdated();
        } catch (error) {
            console.error('Delete room error:', error);
            socket.emit('roomError', { message: `Failed to delete room: ${error.message}` });
        }
    });

    socket.on('renameRoom', async ({ roomId, roomName }, callback = () => {}) => {
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
                (!room.owner && room.ownerGuestId === socket.data.guestId);

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
            socket.emit('roomError', { message: `Failed to rename room: ${error.message}` });
        }
    });

    socket.on('updateName', async ({ name } = {}) => {
        if (socket.data.user) {
            return;
        }

        const nextName = normalizeDisplayName(name);
        if (nextName.length < 2) {
            return;
        }

        socket.data.guestName = nextName;
        await updateGuestDisplayName(userIdMap.get(socket.id), socket.data.guestId, nextName);
    });

};

module.exports = { registerRoomHandlers };
