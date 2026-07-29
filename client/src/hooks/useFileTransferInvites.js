import { useCallback, useEffect, useRef, useState } from 'react';
import { FILE_TRANSFER_MAX_SIZE } from '../lib/fileTransfer';

const INVITE_TIMEOUT_MS = 30_000;
const createRequestId = () => `file_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const useFileTransferInvites = ({
    socket,
    me,
    connectedPeer,
    connectPeer,
    sendFile,
    prepareIncomingFile
}) => {
    const [pendingFileTransfer, setPendingFileTransfer] = useState(null);
    const [outgoingFileTransfer, setOutgoingFileTransfer] = useState(null);
    const outgoingFileRef = useRef(null);

    const requestFileTransfer = useCallback((file, to) => {
        if (!to || to === me) throw new Error('请先打开一位房间成员的私聊。');
        if (!file || file.size <= 0 || file.size > FILE_TRANSFER_MAX_SIZE) {
            throw new Error('文件大小必须在 1 字节到 64 MB 之间。');
        }

        const requestId = createRequestId();
        outgoingFileRef.current = { requestId, to, file, accepted: false };
        setOutgoingFileTransfer({ requestId, to, name: file.name, size: file.size, status: 'waiting' });
        socket.emit('requestFileTransfer', {
            requestId,
            to,
            name: file.name,
            size: file.size,
            mime: file.type
        });
    }, [me, socket]);

    const acceptFileTransfer = useCallback(() => {
        if (!pendingFileTransfer) return;
        prepareIncomingFile(pendingFileTransfer);
        socket.emit('acceptFileTransferRequest', {
            requestId: pendingFileTransfer.requestId,
            to: pendingFileTransfer.from
        });
        setPendingFileTransfer(null);
    }, [pendingFileTransfer, prepareIncomingFile, socket]);

    const rejectFileTransfer = useCallback(() => {
        if (!pendingFileTransfer) return;
        socket.emit('rejectFileTransferRequest', {
            requestId: pendingFileTransfer.requestId,
            to: pendingFileTransfer.from
        });
        setPendingFileTransfer(null);
    }, [pendingFileTransfer, socket]);

    useEffect(() => {
        const onRequest = (request) => {
            if (request?.requestId && request?.from) setPendingFileTransfer(request);
        };
        const onAccepted = ({ requestId, from } = {}) => {
            const outgoing = outgoingFileRef.current;
            if (!outgoing || outgoing.requestId !== requestId || outgoing.to !== from) return;
            outgoing.accepted = true;
            setOutgoingFileTransfer((current) => (
                current?.requestId === requestId ? { ...current, status: 'connecting' } : current
            ));
            if (connectedPeer !== from) connectPeer(from);
        };
        const onRejected = ({ requestId, from } = {}) => {
            const outgoing = outgoingFileRef.current;
            if (!outgoing || outgoing.requestId !== requestId || outgoing.to !== from) return;
            outgoingFileRef.current = null;
            setOutgoingFileTransfer((current) => (
                current?.requestId === requestId ? { ...current, status: 'rejected' } : current
            ));
        };

        socket.on('fileTransferRequested', onRequest);
        socket.on('fileTransferRequestAccepted', onAccepted);
        socket.on('fileTransferRequestRejected', onRejected);
        return () => {
            socket.off('fileTransferRequested', onRequest);
            socket.off('fileTransferRequestAccepted', onAccepted);
            socket.off('fileTransferRequestRejected', onRejected);
        };
    }, [connectPeer, connectedPeer, socket]);

    useEffect(() => {
        const outgoing = outgoingFileRef.current;
        if (!outgoing?.accepted || connectedPeer !== outgoing.to) return;
        sendFile(outgoing.file);
        outgoingFileRef.current = null;
        setOutgoingFileTransfer((current) => (
            current?.requestId === outgoing.requestId ? { ...current, status: 'sending' } : current
        ));
    }, [connectedPeer, outgoingFileTransfer?.status, sendFile]);

    useEffect(() => {
        if (outgoingFileTransfer?.status !== 'waiting') return undefined;
        const timer = setTimeout(() => {
            if (outgoingFileRef.current?.requestId !== outgoingFileTransfer.requestId) return;
            outgoingFileRef.current = null;
            setOutgoingFileTransfer((current) => (
                current?.requestId === outgoingFileTransfer.requestId
                    ? { ...current, status: 'timeout' }
                    : current
            ));
        }, INVITE_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [outgoingFileTransfer]);

    useEffect(() => () => {
        outgoingFileRef.current = null;
    }, []);

    return {
        pendingFileTransfer,
        outgoingFileTransfer,
        requestFileTransfer,
        acceptFileTransfer,
        rejectFileTransfer
    };
};
