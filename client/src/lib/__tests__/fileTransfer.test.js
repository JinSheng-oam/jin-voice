import { describe, expect, test, vi } from 'vitest';
import {
    FILE_TRANSFER_MAX_SIZE,
    appendIncomingFileChunk,
    beginPeerFileSend,
    isValidFileMetadata
} from '../fileTransfer';

describe('fileTransfer limits', () => {
    test('accepts valid metadata within the size limit', () => {
        expect(isValidFileMetadata({
            name: 'voice-note.webm',
            size: 1024,
            mime: 'audio/webm'
        })).toBe(true);
    });

    test('rejects invalid or oversized metadata', () => {
        expect(isValidFileMetadata({ name: '', size: 1 })).toBe(false);
        expect(isValidFileMetadata({ name: 'large.bin', size: FILE_TRANSFER_MAX_SIZE + 1 })).toBe(false);
        expect(isValidFileMetadata({ name: 'invalid.bin', size: Number.NaN })).toBe(false);
    });

    test('drops chunks that exceed the announced file size', () => {
        const result = appendIncomingFileChunk({
            name: 'small.bin',
            size: 2,
            type: 'application/octet-stream',
            chunks: [],
            receivedSize: 0
        }, new Uint8Array([1, 2, 3]));

        expect(result.nextIncomingFile).toBeNull();
        expect(result.downloadLink).toBeNull();
    });

    test('refuses oversized outgoing files before sending metadata', () => {
        const peer = {
            _channel: { bufferedAmount: 0 },
            send: vi.fn(),
            on: vi.fn()
        };

        expect(() => beginPeerFileSend({
            peer,
            file: { name: 'large.bin', size: FILE_TRANSFER_MAX_SIZE + 1 },
            setTransferProgress: vi.fn()
        })).toThrow('256 MB');
        expect(peer.send).not.toHaveBeenCalled();
    });
});
