import { describe, expect, test } from 'vitest';
import { calculateVoiceCalibration } from '../audioCalibration';

describe('voice activation calibration', () => {
    test('derives a gate between noise and speech', () => {
        const result = calculateVoiceCalibration({
            noiseSamples: [8, 9, 9, 10, 11, 10, 9, 10],
            voiceSamples: [35, 40, 42, 45, 48, 44, 41, 39]
        });
        expect(result.noiseFloor).toBeLessThan(result.voiceLevel);
        expect(result.voiceActivationThreshold).toBeGreaterThanOrEqual(5);
        expect(result.voiceActivationThreshold).toBeLessThanOrEqual(60);
    });

    test('rejects calibration without a clear voice sample', () => {
        expect(() => calculateVoiceCalibration({
            noiseSamples: [10, 10, 11, 10, 9],
            voiceSamples: [11, 12, 11, 10, 12]
        })).toThrow('没有检测到清晰人声');
    });
});

