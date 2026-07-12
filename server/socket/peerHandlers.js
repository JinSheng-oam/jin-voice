const registerPeerHandlers = (socket, {
    checkSocketRateLimit, getSharedPeerContext, getSocketDisplayName,
    getSocketUserId, io, isSafeSignalPayload
}) => {
    socket.on('callUser', ({ userToCall, signalData } = {}) => {
        if (!checkSocketRateLimit(socket, 'p2p-signal', 12) || !isSafeSignalPayload(signalData)) {
            socket.emit('roomError', { message: 'Invalid or excessive file connection signaling.' });
            return;
        }

        const peerContext = getSharedPeerContext(socket, userToCall);
        if (peerContext) {
            io.to(peerContext.targetSocketId).emit('callUser', {
                signal: signalData,
                from: peerContext.senderFunId,
                roomId: peerContext.roomId,
                name: getSocketDisplayName(socket),
                userId: getSocketUserId(socket)
            });
        } else {
            socket.emit('roomError', { message: 'File connections are limited to members of the current room.' });
        }
    });

    socket.on('answerCall', (data = {}) => {
        if (!checkSocketRateLimit(socket, 'p2p-signal', 12) || !isSafeSignalPayload(data.signal)) {
            return;
        }

        const peerContext = getSharedPeerContext(socket, data.to);
        if (peerContext) {
            io.to(peerContext.targetSocketId).emit('callAccepted', {
                signal: data.signal,
                from: peerContext.senderFunId,
                roomId: peerContext.roomId
            });
        }
    });

    socket.on('iceCandidate', ({ to, candidate } = {}) => {
        if (!checkSocketRateLimit(socket, 'p2p-ice', 30) || !isSafeSignalPayload(candidate)) {
            return;
        }

        const peerContext = getSharedPeerContext(socket, to);
        if (peerContext) {
            io.to(peerContext.targetSocketId).emit('iceCandidate', {
                from: peerContext.senderFunId,
                roomId: peerContext.roomId,
                candidate
            });
        }
    });

};

module.exports = { registerPeerHandlers };
