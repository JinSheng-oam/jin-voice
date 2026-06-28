const FILE_TRANSFER_CHUNK_SIZE = 16 * 1024;
const FILE_TRANSFER_MAX_BUFFERED_AMOUNT = 1024 * 1024;
export const FILE_TRANSFER_MAX_SIZE = 256 * 1024 * 1024;

export const isValidFileMetadata = (fileMeta) => (
    fileMeta &&
    typeof fileMeta.name === 'string' &&
    fileMeta.name.trim().length > 0 &&
    fileMeta.name.length <= 255 &&
    Number.isFinite(fileMeta.size) &&
    fileMeta.size > 0 &&
    fileMeta.size <= FILE_TRANSFER_MAX_SIZE
);

export const readPeerPayload = (data) => {
    try {
        const text = new TextDecoder().decode(data);
        return {
            type: 'json',
            payload: JSON.parse(text)
        };
    } catch {
        return {
            type: 'binary',
            payload: data
        };
    }
};

export const createIncomingFileRecord = (fileMeta) => ({
    name: fileMeta.name,
    size: fileMeta.size,
    type: fileMeta.mime,
    chunks: [],
    receivedSize: 0
});

export const appendIncomingFileChunk = (previousFile, chunk) => {
    if (!previousFile) {
        return {
            nextIncomingFile: null,
            progress: null,
            downloadLink: null
        };
    }

    const chunks = previousFile.chunks || [];
    chunks.push(chunk);

    const newReceivedSize = previousFile.receivedSize + chunk.byteLength;
    if (newReceivedSize > previousFile.size || newReceivedSize > FILE_TRANSFER_MAX_SIZE) {
        return {
            nextIncomingFile: null,
            progress: null,
            downloadLink: null
        };
    }
    const progress = Math.round((newReceivedSize / previousFile.size) * 100);

    if (newReceivedSize >= previousFile.size) {
        const blob = new Blob(chunks, { type: previousFile.type });
        const url = URL.createObjectURL(blob);

        return {
            nextIncomingFile: null,
            progress: 100,
            downloadLink: {
                url,
                name: previousFile.name
            }
        };
    }

    return {
        nextIncomingFile: {
            ...previousFile,
            chunks,
            receivedSize: newReceivedSize
        },
        progress,
        downloadLink: null
    };
};

export const beginPeerFileSend = ({ peer, file, setTransferProgress }) => {
    if (!peer || !peer._channel) {
        return () => {};
    }
    if (!file || file.size <= 0 || file.size > FILE_TRANSFER_MAX_SIZE) {
        throw new Error('文件大小必须在 1 字节到 256 MB 之间。');
    }

    const channel = peer._channel;
    const meta = JSON.stringify({
        type: 'file-meta',
        name: file.name,
        size: file.size,
        mime: file.type
    });

    let offset = 0;
    let accepted = false;
    let cancelled = false;

    const cleanupAcceptListener = () => {
        if (typeof peer.off === 'function') {
            peer.off('data', waitForAccept);
        } else if (typeof peer.removeListener === 'function') {
            peer.removeListener('data', waitForAccept);
        }
    };

    const sendNextChunk = () => {
        if (cancelled) return;

        if (channel.bufferedAmount > FILE_TRANSFER_MAX_BUFFERED_AMOUNT) {
            setTimeout(sendNextChunk, 50);
            return;
        }

        if (offset >= file.size) {
            setTransferProgress(100);
            return;
        }

        const slice = file.slice(offset, offset + FILE_TRANSFER_CHUNK_SIZE);
        const reader = new FileReader();

        reader.onload = (event) => {
            if (cancelled) return;

            const result = event.target?.result;
            if (!(result instanceof ArrayBuffer)) {
                console.error('Unexpected file reader result while sending file');
                return;
            }

            try {
                peer.send(result);
                offset += result.byteLength;

                const progress = Math.round((offset / file.size) * 100);
                setTransferProgress(progress);

                if (offset < file.size) {
                    if (channel.bufferedAmount < FILE_TRANSFER_MAX_BUFFERED_AMOUNT / 2) {
                        sendNextChunk();
                    } else {
                        setTimeout(sendNextChunk, 10);
                    }
                } else {
                    setTransferProgress(100);
                }
            } catch (error) {
                console.error('Error sending chunk:', error);
                setTimeout(sendNextChunk, 100);
            }
        };

        reader.onerror = (error) => {
            console.error('Error reading file:', error);
        };

        reader.readAsArrayBuffer(slice);
    };

    const waitForAccept = (data) => {
        if (cancelled) return;

        const message = readPeerPayload(data);
        if (message.type !== 'json') return;

        if (message.payload.type === 'file-accept' && !accepted) {
            accepted = true;
            cleanupAcceptListener();
            sendNextChunk();
        } else if (message.payload.type === 'file-reject') {
            cleanupAcceptListener();
            setTransferProgress(0);
        }
    };

    peer.send(meta);
    setTransferProgress(0);
    peer.on('data', waitForAccept);

    return () => {
        cancelled = true;
        cleanupAcceptListener();
    };
};
