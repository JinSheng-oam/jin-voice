const registerSfuHandlers = (socket, {
    checkSocketRateLimit, mediasoupManager, normalizeSfuSessionId,
    requireActiveRoomMember, requireCurrentSfuSession, userIdMap
}) => {
    socket.on('startSfuSession', async ({ roomId, sfuSessionId } = {}, callback = () => {}) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return;

        try {
            const normalizedSessionId = normalizeSfuSessionId(sfuSessionId);
            if (!normalizedSessionId) {
                callback({ error: 'Invalid SFU session.' });
                return;
            }

            const room = await mediasoupManager.getOrCreateRoom(roomId);
            const peerId = userIdMap.get(socket.id);
            const replacedProducerId = room.beginPeerSession(peerId, normalizedSessionId)?.replacedProducerId;

            if (replacedProducerId) {
                socket.to(roomId).emit('producerClosed', { producerId: replacedProducerId });
            }

            callback({ rtpCapabilities: room.getRouterRtpCapabilities() });
        } catch (error) {
            console.error('startSfuSession error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('closeSfuSession', ({ roomId, sfuSessionId } = {}) => {
        const room = mediasoupManager.getRoom(roomId);
        const peerId = userIdMap.get(socket.id);
        if (!room || !peerId) return;

        const producerId = room.removePeer(peerId, normalizeSfuSessionId(sfuSessionId));
        if (producerId) {
            socket.to(roomId).emit('producerClosed', { producerId });
        }
        mediasoupManager.removeRoomIfEmpty(roomId);
    });

    socket.on('getRouterRtpCapabilities', async ({ roomId, sfuSessionId } = {}, callback = () => {}) => {
        const context = requireCurrentSfuSession(socket, roomId, sfuSessionId, callback);
        if (!context) return;

        callback({ rtpCapabilities: context.room.getRouterRtpCapabilities() });
    });

    socket.on('createWebRtcTransport', async ({ roomId, type, sfuSessionId } = {}, callback = () => {}) => {
        const context = requireCurrentSfuSession(socket, roomId, sfuSessionId, callback);
        if (!context) return;
        if (!checkSocketRateLimit(socket, 'create-transport', 30)) {
            callback({ error: 'Too many transport requests. Please reconnect and try again.' });
            return;
        }

        try {
            const transportType = type === 'recv' ? 'recv' : 'send';
            const transportInfo = await context.room.createWebRtcTransport(
                context.peerId,
                context.sfuSessionId,
                transportType
            );

            if (transportInfo.replacedProducerId) {
                socket.to(roomId).emit('producerClosed', {
                    producerId: transportInfo.replacedProducerId
                });
            }
            callback(transportInfo);
        } catch (error) {
            console.error('createWebRtcTransport error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('connectTransport', async (
        { roomId, transportId, dtlsParameters, sfuSessionId } = {},
        callback = () => {}
    ) => {
        const context = requireCurrentSfuSession(socket, roomId, sfuSessionId, callback);
        if (!context) return;

        try {
            await context.room.connectTransport(
                context.peerId,
                context.sfuSessionId,
                transportId,
                dtlsParameters
            );
            callback({ success: true });
        } catch (error) {
            console.error('connectTransport error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('produce', async (
        { roomId, transportId, kind, rtpParameters, sfuSessionId } = {},
        callback = () => {}
    ) => {
        const context = requireCurrentSfuSession(socket, roomId, sfuSessionId, callback);
        if (!context) return;

        try {
            const { id, replacedProducerId } = await context.room.produce(
                context.peerId,
                context.sfuSessionId,
                transportId,
                kind,
                rtpParameters
            );

            if (replacedProducerId) {
                socket.to(roomId).emit('producerClosed', { producerId: replacedProducerId });
            }
            socket.to(roomId).emit('newProducer', { peerId: context.peerId, producerId: id });
            callback({ id });
        } catch (error) {
            console.error('produce error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('consume', async (
        { roomId, transportId, producerId, rtpCapabilities, sfuSessionId } = {},
        callback = () => {}
    ) => {
        const context = requireCurrentSfuSession(socket, roomId, sfuSessionId, callback);
        if (!context) return;

        try {
            const consumerInfo = await context.room.consume(
                context.peerId,
                context.sfuSessionId,
                transportId,
                producerId,
                rtpCapabilities
            );
            callback(consumerInfo);
        } catch (error) {
            console.error('consume error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('getProducers', async ({ roomId, sfuSessionId } = {}, callback = () => {}) => {
        const context = requireCurrentSfuSession(socket, roomId, sfuSessionId, callback);
        if (!context) return;

        try {
            const producers = context.room.getProducerIds(context.peerId);
            callback({ producers });
        } catch (error) {
            console.error('getProducers error:', error);
            callback({ error: error.message });
        }
    });
};

module.exports = { registerSfuHandlers };
