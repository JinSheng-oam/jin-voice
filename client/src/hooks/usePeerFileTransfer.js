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
    const incomingFileRef = useRef(null);
    const acceptedIncomingFileRef = useRef(null);
    const downloadUrlRef = useRef(null);

    const prepareIncomingFile = useCallback((fileMeta) => {
        acceptedIncomingFileRef.current = {
            name: fileMeta.name,
            size: fileMeta.size,
            mime: fileMeta.mime,
            expiresAt: Date.now() + 30_000
        };
        setDownloadLink(null);
        setTransferProgress(0);
    }, []);

    const handleDataReceived = useCallback((data) => {
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
                    connectionRef.current?.send(JSON.stringify({ type: 'file-reject' }));
                    return;
                }

                acceptedIncomingFileRef.current = null;
                incomingFileRef.current = createIncomingFileRecord(meta);
                connectionRef.current?.send(JSON.stringify({ type: 'file-accept' }));
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
        sendFile
    };
};
