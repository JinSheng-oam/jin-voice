const FILE_TRANSFER_CHUNK_SIZE = 16 * 1024;
const FILE_TRANSFER_MAX_BUFFERED_AMOUNT = 1024 * 1024;
const FILE_TRANSFER_ACCEPT_TIMEOUT_MS = 30_000;
const FILE_TRANSFER_MAX_CONTROL_FRAME_BYTES = 1024;
const FILE_TRANSFER_MAX_SEND_RETRIES = 20;
const CONTROL_MESSAGE_TYPES = new Set(['file-meta', 'file-accept', 'file-reject']);
export const FILE_TRANSFER_MAX_SIZE = 64 * 1024 * 1024;

const textDecoder = new TextDecoder();

const toUint8View = (data) => {
    if (data instanceof Uint8Array) {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
};

const isControlPayload = (payload) => (
    Boolean(payload) &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof payload.type === 'string' &&
    CONTROL_MESSAGE_TYPES.has(payload.type)
);

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
        if (typeof data === 'string') {
            if (data.length === 0 || data.length > FILE_TRANSFER_MAX_CONTROL_FRAME_BYTES) {
                return { type: 'binary', payload: data };
            }
            const parsed = JSON.parse(data);
            if (isControlPayload(parsed)) {
                return { type: 'json', payload: parsed };
            }
            return { type: 'binary', payload: data };
        }

        const view = toUint8View(data);
        if (
            !view ||
            view.byteLength < 2 ||
            view.byteLength > FILE_TRANSFER_MAX_CONTROL_FRAME_BYTES ||
            view[0] !== 0x7b ||
            view[view.byteLength - 1] !== 0x7d
        ) {
            return { type: 'binary', payload: data };
        }

        const text = textDecoder.decode(view);
        const parsed = JSON.parse(text);
        if (isControlPayload(parsed)) {
            return {
                type: 'json',
                payload: parsed
            };
        }
    } catch {
        /* Fall through to binary payload */
    }

    return {
        type: 'binary',
        payload: data
    };
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

    const chunkByteLength = typeof chunk?.byteLength === 'number'
        ? chunk.byteLength
        : (typeof chunk?.length === 'number' ? chunk.length : 0);
    const newReceivedSize = previousFile.receivedSize + chunkByteLength;
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

const isPeerChannelWritable = (peer, channel) => {
    if (!peer || peer.destroyed) return false;
    if (channel && typeof channel.readyState === 'string' && channel.readyState !== 'open') {
        return false;
    }
    return true;
};

export const beginPeerFileSend = ({ peer, file, setTransferProgress }) => {
    if (!peer || !peer._channel) {
        return () => {};
    }
    if (!file || file.size <= 0 || file.size > FILE_TRANSFER_MAX_SIZE) {
        throw new Error('文件大小必须在 1 字节到 64 MB 之间。');
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
    let acceptTimer = null;
    let chunkTimer = null;
    let activeReader = null;
    let sendRetryCount = 0;

    const clearChunkTimer = () => {
        if (chunkTimer) {
            clearTimeout(chunkTimer);
            chunkTimer = null;
        }
    };

    const cleanupAcceptListener = () => {
        if (acceptTimer) {
            clearTimeout(acceptTimer);
            acceptTimer = null;
        }
        if (typeof peer.off === 'function') {
            peer.off('data', waitForAccept);
        } else if (typeof peer.removeListener === 'function') {
            peer.removeListener('data', waitForAccept);
        }
    };

    const abortTransfer = () => {
        cancelled = true;
        clearChunkTimer();
        cleanupAcceptListener();
        if (activeReader && activeReader.readyState === 1) {
            try {
                activeReader.abort();
            } catch {
                /* noop */
            }
        }
        activeReader = null;
    };

    const sendNextChunk = () => {
        clearChunkTimer();
        if (cancelled || !isPeerChannelWritable(peer, channel)) return;

        if (channel.bufferedAmount > FILE_TRANSFER_MAX_BUFFERED_AMOUNT) {
            chunkTimer = setTimeout(sendNextChunk, 50);
            return;
        }

        if (offset >= file.size) {
            setTransferProgress(100);
            return;
        }

        const slice = file.slice(offset, offset + FILE_TRANSFER_CHUNK_SIZE);
        const reader = new FileReader();
        activeReader = reader;

        reader.onload = (event) => {
            if (activeReader === reader) {
                activeReader = null;
            }
            if (cancelled || !isPeerChannelWritable(peer, channel)) return;

            const result = event.target?.result;
            if (!(result instanceof ArrayBuffer)) {
                console.error('Unexpected file reader result while sending file');
                return;
            }

            try {
                peer.send(result);
                sendRetryCount = 0;
                offset += result.byteLength;

                const progress = Math.round((offset / file.size) * 100);
                setTransferProgress(progress);

                if (offset < file.size) {
                    if (channel.bufferedAmount < FILE_TRANSFER_MAX_BUFFERED_AMOUNT / 2) {
                        sendNextChunk();
                    } else {
                        chunkTimer = setTimeout(sendNextChunk, 10);
                    }
                } else {
                    setTransferProgress(100);
                }
            } catch (error) {
                sendRetryCount += 1;
                console.error('Error sending chunk:', error);
                if (!isPeerChannelWritable(peer, channel) || sendRetryCount > FILE_TRANSFER_MAX_SEND_RETRIES) {
                    abortTransfer();
                    setTransferProgress(0);
                    return;
                }
                chunkTimer = setTimeout(sendNextChunk, 100);
            }
        };

        reader.onerror = (error) => {
            if (activeReader === reader) {
                activeReader = null;
            }
            console.error('Error reading file:', error);
            abortTransfer();
            setTransferProgress(0);
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

    try {
        if (!isPeerChannelWritable(peer, channel)) {
            return () => {};
        }
        peer.send(meta);
    } catch (error) {
        console.error('Failed to send file metadata:', error);
        setTransferProgress(0);
        return () => {};
    }

    setTransferProgress(0);
    peer.on('data', waitForAccept);
    acceptTimer = setTimeout(() => {
        if (accepted || cancelled) return;
        cleanupAcceptListener();
        setTransferProgress(0);
    }, FILE_TRANSFER_ACCEPT_TIMEOUT_MS);

    return abortTransfer;
};
