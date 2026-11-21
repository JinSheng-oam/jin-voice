import { useCallback, useEffect, useRef, useState } from 'react';
import {
    appendIncomingFileChunk,
    beginPeerFileSend,
    createIncomingFileRecord,
    isValidFileMetadata,
    readPeerPayload
} from '../lib/fileTransfer';

const safeSendControlMessage = (peer, payload) => {
    if (!peer || peer.destroyed) return;
    const channelState = peer._channel?.readyState;
    if (typeof channelState === 'string' && channelState !== 'open') return;
    try {
        peer.send(JSON.stringify(payload));
    } catch (error) {
        console.warn('[P2P File] Failed to send control message:', error);
    }
};

export const usePeerFileTransfer = ({
    connectionRef,
    fileSendCleanupRef
}) => {
    const [downloadLink, setDownloadLink] = useState(null);
    const [transferProgress, setTransferProgress] = useState(0);
    const incomingFileRef = useRef(null);
    const acceptedIncomingFileRef = useRef(null);
    const downloadUrlRef = useRef(null);

    const resetFileTransferState = useCallback(() => {
        incomingFileRef.current = null;
        acceptedIncomingFileRef.current = null;
        setTransferProgress(0);
    }, []);

    const prepareIncomingFile = useCallback((fileMeta) => {
        acceptedIncomingFileRef.current = {
            name: fileMeta.name,
            size: fileMeta.size,
            mime: fileMeta.mime,
            expiresAt: Date.now() + 30_000
        };
        incomingFileRef.current = null;
        setDownloadLink(null);
        setTransferProgress(0);
    }, []);

    const handleDataReceived = useCallback((data) => {
        // 接收文件分片期间，仅检查是否为 file-reject 控制帧，避免文件分片被当作 file-meta 处理
        if (incomingFileRef.current) {
            const maybeControl = readPeerPayload(data);
            if (maybeControl.type === 'json' && maybeControl.payload.type === 'file-reject') {
                incomingFileRef.current = null;
                setTransferProgress(0);
                return;
            }

            const result = appendIncomingFileChunk(incomingFileRef.current, data);
            incomingFileRef.current = result.nextIncomingFile;

            if (result.progress !== null) {
                setTransferProgress(result.progress);
            }

            if (result.downloadLink) {
                setDownloadLink(result.downloadLink);
            }
            return;
        }

        const message = readPeerPayload(data);

        if (message.type === 'json') {
            const meta = message.payload;

            if (meta.type === 'file-meta') {
                const acceptedFile = acceptedIncomingFileRef.current;
                const matchesAcceptedInvite = acceptedFile &&
                    acceptedFile.expiresAt >= Date.now() &&
                    acceptedFile.name === meta.name &&
                    acceptedFile.size === meta.size &&
                    acceptedFile.mime === meta.mime;

                if (!isValidFileMetadata(meta) || !matchesAcceptedInvite) {
                    acceptedIncomingFileRef.current = null;
                    safeSendControlMessage(connectionRef.current, { type: 'file-reject' });
                    return;
                }

                acceptedIncomingFileRef.current = null;
                incomingFileRef.current = createIncomingFileRecord(meta);
                safeSendControlMessage(connectionRef.current, { type: 'file-accept' });
                setTransferProgress(0);
            } else if (meta.type === 'file-reject') {
                setTransferProgress(0);
            }
        }
    }, [connectionRef]);

    const sendFile = useCallback((file) => {
        fileSendCleanupRef.current?.();
        fileSendCleanupRef.current = beginPeerFileSend({
            peer: connectionRef.current,
            file,
            setTransferProgress
        });
    }, [connectionRef, fileSendCleanupRef]);

    useEffect(() => {
        const previousUrl = downloadUrlRef.current;
        const nextUrl = downloadLink?.url || null;

        if (previousUrl && previousUrl !== nextUrl) {
            URL.revokeObjectURL(previousUrl);
        }

        downloadUrlRef.current = nextUrl;
    }, [downloadLink]);

    useEffect(() => () => {
        fileSendCleanupRef.current?.();
        fileSendCleanupRef.current = null;
        incomingFileRef.current = null;
        acceptedIncomingFileRef.current = null;

        if (downloadUrlRef.current) {
            URL.revokeObjectURL(downloadUrlRef.current);
            downloadUrlRef.current = null;
        }
    }, [fileSendCleanupRef]);

    return {
        downloadLink,
        transferProgress,
        prepareIncomingFile,
        handleDataReceived,
        resetFileTransferState,
        sendFile
    };
};
