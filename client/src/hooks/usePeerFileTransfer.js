import { useCallback, useEffect, useRef, useState } from 'react';
import {
    appendIncomingFileChunk,
    beginPeerFileSend,
    createIncomingFileRecord,
    isValidFileMetadata,
    readPeerPayload
} from '../lib/fileTransfer';

export const usePeerFileTransfer = ({
    connectionRef,
    fileSendCleanupRef
}) => {
    const [downloadLink, setDownloadLink] = useState(null);
    const [transferProgress, setTransferProgress] = useState(0);
    const [pendingFileTransfer, setPendingFileTransfer] = useState(null);
    const incomingFileRef = useRef(null);
    const downloadUrlRef = useRef(null);

    const acceptFileTransfer = useCallback(() => {
        if (!pendingFileTransfer) {
            return;
        }

        const peer = connectionRef.current;
        if (peer) {
            peer.send(JSON.stringify({ type: 'file-accept' }));
        }

        incomingFileRef.current = createIncomingFileRecord(pendingFileTransfer);
        setTransferProgress(0);
        setPendingFileTransfer(null);
    }, [connectionRef, pendingFileTransfer]);

    const rejectFileTransfer = useCallback(() => {
        if (!pendingFileTransfer) {
            return;
        }

        const peer = connectionRef.current;
        if (peer) {
            peer.send(JSON.stringify({ type: 'file-reject' }));
        }

        setPendingFileTransfer(null);
        setTransferProgress(0);
    }, [connectionRef, pendingFileTransfer]);

    const handleDataReceived = useCallback((data) => {
        const message = readPeerPayload(data);

        if (message.type === 'json') {
            const meta = message.payload;

            if (meta.type === 'file-meta') {
                if (!isValidFileMetadata(meta)) {
                    connectionRef.current?.send(JSON.stringify({ type: 'file-reject' }));
                    return;
                }

                setPendingFileTransfer({
                    name: meta.name,
                    size: meta.size,
                    mime: meta.mime
                });
                setDownloadLink(null);
                setTransferProgress(0);
            } else if (meta.type === 'file-reject') {
                setTransferProgress(0);
            }

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

        if (downloadUrlRef.current) {
            URL.revokeObjectURL(downloadUrlRef.current);
            downloadUrlRef.current = null;
        }
    }, [fileSendCleanupRef]);

    return {
        downloadLink,
        transferProgress,
        pendingFileTransfer,
        acceptFileTransfer,
        rejectFileTransfer,
        handleDataReceived,
        sendFile
    };
};
