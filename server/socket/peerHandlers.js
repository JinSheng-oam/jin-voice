const registerPeerHandlers = (socket, {
    checkSocketRateLimit, getSharedPeerContext, getSocketDisplayName,
    getSocketUserId, io, isSafeSignalPayload
}) => {
    const normalizeFileRequest = (data = {}) => {
        const requestId = String(data.requestId || '');
        const name = String(data.name || '').trim();
        const size = Number(data.size);
        if (
            !/^file_[a-z0-9_]{8,80}$/iu.test(requestId) ||
            !name || name.length > 255 ||
            !Number.isFinite(size) || size <= 0 || size > 64 * 1024 * 1024
        ) {
            return null;
        }
        return {
            requestId,
            name,
            size,
            mime: String(data.mime || '').slice(0, 120)
        };
    };

    socket.on('requestFileTransfer', (data = {}) => {
        if (!checkSocketRateLimit(socket, 'file-transfer-request', 10)) return;
        const request = normalizeFileRequest(data);
        const peerContext = request && getSharedPeerContext(socket, data.to);
        if (!peerContext) {
            socket.emit('roomError', { message: '文件只能发送给当前房间内的成员。' });
            return;
        }

        io.to(peerContext.targetSocketId).emit('fileTransferRequested', {
            ...request,
            from: peerContext.senderFunId,
            user: getSocketDisplayName(socket),
            userId: getSocketUserId(socket),
            roomId: peerContext.roomId
        });
    });

    const forwardFileDecision = (eventName, outgoingEventName) => {
        socket.on(eventName, (data = {}) => {
            const requestId = String(data.requestId || '');
            const peerContext = getSharedPeerContext(socket, data.to);
            if (!peerContext || !/^file_[a-z0-9_]{8,80}$/iu.test(requestId)) return;

            io.to(peerContext.targetSocketId).emit(outgoingEventName, {
                requestId,
                from: peerContext.senderFunId,
                roomId: peerContext.roomId
            });
        });
    };

    forwardFileDecision('acceptFileTransferRequest', 'fileTransferRequestAccepted');
    forwardFileDecision('rejectFileTransferRequest', 'fileTransferRequestRejected');

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
