import { describe, expect, test } from 'vitest';
import {
    AUDIO_PROCESSING_MODES,
    getAiInputFormatIssue,
    getAudioLevelMetrics,
    getCaptureProcessingOptions,
    sanitizeAudioProcessingMode
} from '../audioProcessing';

describe('audio processing mode', () => {
    test('sanitizes unknown values to standard mode', () => {
        expect(sanitizeAudioProcessingMode('unknown')).toBe(AUDIO_PROCESSING_MODES.STANDARD);
        expect(sanitizeAudioProcessingMode(AUDIO_PROCESSING_MODES.AI)).toBe(AUDIO_PROCESSING_MODES.AI);
    });

    test('standard mode enables browser processing', () => {
        expect(getCaptureProcessingOptions(AUDIO_PROCESSING_MODES.STANDARD, true)).toEqual({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        });
    });

    test('AI mode prevents stacked browser suppression when supported', () => {
        expect(getCaptureProcessingOptions(AUDIO_PROCESSING_MODES.AI, true)).toEqual({
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false
        });
    });

    test('AI mode captures with browser suppression when unsupported', () => {
        expect(getCaptureProcessingOptions(AUDIO_PROCESSING_MODES.AI, false)).toEqual({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        });
    });

    test('raw mode disables all browser processing', () => {
        expect(getCaptureProcessingOptions(AUDIO_PROCESSING_MODES.RAW, true)).toEqual({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        });
    });

    test('validates the RNNoise input format', () => {
        expect(getAiInputFormatIssue({ sampleRate: 48000, channelCount: 1 })).toBeNull();
        expect(getAiInputFormatIssue({ sampleRate: 44100, channelCount: 1 })).toContain('48000 Hz');
        expect(getAiInputFormatIssue({ sampleRate: 48000, channelCount: 2 })).toContain('单声道');
    });

    test('measures RMS volume, peak and clipping', () => {
        const quiet = getAudioLevelMetrics(new Float32Array([0, 0, 0, 0]));
        expect(quiet).toEqual({ volume: 0, peak: 0, clipped: false });

        const loud = getAudioLevelMetrics(new Float32Array([0.25, -0.5, 0.99, -0.25]));
        expect(loud.volume).toBeGreaterThan(80);
        expect(loud.peak).toBeCloseTo(0.99, 5);
        expect(loud.clipped).toBe(true);
    });
});
