import { describe, expect, test } from 'vitest';
import {
    BACKGROUND_IMAGE_MAX_SOURCE_BYTES,
    calculateBackgroundImageDimensions,
    formatImageFileSize,
    validateBackgroundImageFile
} from '../backgroundImageFile';

describe('background image file validation', () => {
    test('accepts supported raster images', () => {
        const file = { type: 'image/webp', size: 1024 };
        expect(validateBackgroundImageFile(file)).toBe(file);
    });

    test('rejects unsupported or oversized files', () => {
        expect(() => validateBackgroundImageFile({ type: 'image/svg+xml', size: 1024 })).toThrow('仅支持');
        expect(() => validateBackgroundImageFile({
            type: 'image/png',
            size: BACKGROUND_IMAGE_MAX_SOURCE_BYTES + 1
        })).toThrow('15 MB');
    });

    test('formats output sizes for status copy', () => {
        expect(formatImageFileSize(512)).toBe('512 B');
        expect(formatImageFileSize(1536)).toBe('2 KB');
        expect(formatImageFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });

    test('fits landscape and portrait images into the selected resolution without upscaling', () => {
        expect(calculateBackgroundImageDimensions(3840, 2160, '1080')).toEqual({ width: 1920, height: 1080 });
        expect(calculateBackgroundImageDimensions(2160, 3840, '720')).toEqual({ width: 720, height: 1280 });
        expect(calculateBackgroundImageDimensions(640, 360, '1080')).toEqual({ width: 640, height: 360 });
        expect(calculateBackgroundImageDimensions(3840, 2160, 'native')).toEqual({ width: 3840, height: 2160 });
    });
});
