import { describe, expect, test, vi } from 'vitest';
import {
    BACKGROUND_VIDEO_MAX_BYTES,
    buildBackgroundMediaOutputName,
    createBackgroundMediaLink,
    getBackgroundMediaKind,
    validateBackgroundMediaFile
} from '../backgroundMediaLibrary';

describe('background media library', () => {
    test('accepts supported image and video files', () => {
        expect(validateBackgroundMediaFile({ type: 'video/mp4', size: 1024 })).toBeTruthy();
        expect(validateBackgroundMediaFile({ type: 'image/avif', size: 1024 })).toBeTruthy();
    });

    test('rejects unsupported and oversized videos', () => {
        expect(() => validateBackgroundMediaFile({ type: 'video/quicktime', size: 1024 })).toThrow('仅支持');
        expect(() => validateBackgroundMediaFile({
            type: 'video/mp4',
            size: BACKGROUND_VIDEO_MAX_BYTES + 1
        })).toThrow('100 MB');
    });

    test('creates normalized URL entries', () => {
        vi.stubGlobal('crypto', { randomUUID: () => 'media-id' });
        const media = createBackgroundMediaLink({ name: '  夜航  ', type: 'video', url: ' https://example.com/bg.mp4 ' });
        expect(media).toEqual({
            id: 'media-id',
            name: '夜航',
            type: 'video',
            source: 'url',
            url: 'https://example.com/bg.mp4'
        });
        vi.unstubAllGlobals();
    });

    test('derives media kinds and output file extensions', () => {
        expect(getBackgroundMediaKind({ type: 'video/ogg' })).toBe('video');
        expect(getBackgroundMediaKind({ type: 'image/png' })).toBe('image');
        expect(buildBackgroundMediaOutputName('night.flight.png', 'webp')).toBe('night.flight.webp');
        expect(buildBackgroundMediaOutputName('clip.webm', 'mp4')).toBe('clip.mp4');
    });
});
