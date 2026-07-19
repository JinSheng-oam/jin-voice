import { describe, expect, test } from 'vitest';
import {
    calculateContainedVideoSize,
    getBrowserVideoBitrate,
    selectBrowserVideoMimeType
} from '../browserVideoPrecompression';

describe('browser video precompression', () => {
    test('keeps aspect ratio within landscape and portrait resolution bounds', () => {
        expect(calculateContainedVideoSize(3840, 2160, '720')).toEqual({ width: 1280, height: 720 });
        expect(calculateContainedVideoSize(1080, 1920, '720')).toEqual({ width: 720, height: 1280 });
        expect(calculateContainedVideoSize(640, 360, '1080')).toEqual({ width: 640, height: 360 });
    });

    test('derives bounded bitrates from resolution and quality', () => {
        expect(getBrowserVideoBitrate('720', 100)).toBe(2_500_000);
        expect(getBrowserVideoBitrate('720', 20)).toBe(1_400_000);
        expect(getBrowserVideoBitrate('360', 80)).toBeLessThan(getBrowserVideoBitrate('1080', 80));
    });

    test('chooses the first browser-supported recording format', () => {
        const MediaRecorderMock = {
            isTypeSupported: (mimeType) => mimeType === 'video/webm;codecs=vp8'
        };
        expect(selectBrowserVideoMimeType('mp4', MediaRecorderMock)).toBe('video/webm;codecs=vp8');
        expect(selectBrowserVideoMimeType('mp4', null)).toBe('');
    });
});
