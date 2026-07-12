const registerChatHandlers = (socket, {
    MAX_CHAT_MESSAGE_LENGTH, buildMessagePayload, checkSocketRateLimit,
    getSharedPeerContext, getSocketDisplayName, getSocketUserId, io,
    isSocketAdmin, prisma, requireAuthenticatedSocket, reverseIdMap, userIdMap
}) => {
    socket.on('sendMessage', async (data = {}) => {
        if (!checkSocketRateLimit(socket, 'public-message', 20)) {
            socket.emit('roomError', { message: 'You are sending messages too quickly.' });
            return;
        }

        const text = String(data.text || '').trim();
        if (!text) return;
        if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
            socket.emit('roomError', { message: `Message is limited to ${MAX_CHAT_MESSAGE_LENGTH} characters.` });
            return;
        }

        const funId = userIdMap.get(socket.id);
        if (!funId) return;

        // Find the room this sender is in
        let senderRoomId = null;
        for (const [roomId, usersMap] of activeRoomUsers) {
            if (usersMap.has(funId)) {
                senderRoomId = roomId;
                break;
            }
        }

        if (!senderRoomId) return;

        try {
            const message = await prisma.message.create({
                data: {
                    content: text,
                    sender: getSocketDisplayName(socket),
                    senderUserId: getSocketUserId(socket),
                    senderFunId: funId,
                    roomId: senderRoomId
                }
            });
            io.to(senderRoomId).emit('receiveMessage', buildMessagePayload(message));
        } catch (error) {
            console.error('Failed to persist message:', error);
            socket.emit('roomError', { message: 'Failed to send message.' });
        }
    });

    socket.on('sendPrivateMessage', (data = {}) => {
        if (!checkSocketRateLimit(socket, 'private-message', 30)) {
            socket.emit('roomError', { message: 'You are sending messages too quickly.' });
            return;
        }

        const text = String(data.text || '').trim();
        if (!text) return;
        if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
            socket.emit('roomError', { message: `Message is limited to ${MAX_CHAT_MESSAGE_LENGTH} characters.` });
            return;
        }

        const peerContext = getSharedPeerContext(socket, data.to);
        if (peerContext) {
            const payload = {
                id: data.id || `private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                user: getSocketDisplayName(socket),
                userId: getSocketUserId(socket),
                text,
                time: data.time || new Date().toLocaleTimeString(),
                to: data.to,
                from: peerContext.senderFunId,
                roomId: peerContext.roomId
            };

            io.to(peerContext.targetSocketId).emit('receivePrivateMessage', payload);
            socket.emit('receivePrivateMessage', payload);
        } else {
            socket.emit('roomError', { message: 'Private messages are limited to members of the current room.' });
        }
    });

    socket.on('deleteMessage', async ({ messageId, privateMessageId, to, from } = {}, callback = () => {}) => {
        try {
            if (privateMessageId) {
                const funId = userIdMap.get(socket.id);
                if (!isSocketAdmin(socket) && from !== funId) {
                    callback({ error: 'Only administrators or the sender can delete this message.' });
                    return;
                }

                const peerId = from === funId ? to : from;
                const targetSocketId = reverseIdMap.get(peerId);
                socket.emit('privateMessageDeleted', { messageId: privateMessageId });
                if (targetSocketId) {
                    io.to(targetSocketId).emit('privateMessageDeleted', { messageId: privateMessageId });
                }
                callback({ success: true, messageId: privateMessageId, from: funId });
                return;
            }

            const parsedMessageId = Number(messageId);
            if (!Number.isInteger(parsedMessageId)) {
                callback({ error: 'Invalid message id.' });
                return;
            }

            const message = await prisma.message.findUnique({
                where: { id: parsedMessageId }
            });

            if (!message || message.deletedAt) {
                callback({ error: 'Message not found.' });
                return;
            }

            const currentUserId = getSocketUserId(socket);
            const currentFunId = userIdMap.get(socket.id);
            const canDelete =
                isSocketAdmin(socket) ||
                (message.senderUserId && message.senderUserId === currentUserId) ||
                (!message.senderUserId && message.senderFunId && message.senderFunId === currentFunId);

            if (!canDelete) {
                callback({ error: 'Only administrators or the sender can delete this message.' });
                return;
            }

            await prisma.message.update({
                where: { id: parsedMessageId },
                data: { deletedAt: new Date() }
            });

            io.to(message.roomId).emit('messageDeleted', { messageId: parsedMessageId });
            callback({ success: true, messageId: parsedMessageId });
        } catch (error) {
            console.error('Delete message error:', error);
            callback({ error: 'Failed to delete message.' });
        }
    });

};

module.exports = { registerChatHandlers };
