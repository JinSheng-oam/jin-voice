import { describe, expect, test } from 'vitest';
import {
    calculateLossRate,
    classifyInboundAudioQuality,
    createAudioAdaptationState,
    selectAudioBitrateProfile,
    updateAudioAdaptation
} from '../audioNetwork';

describe('audio network adaptation', () => {
    test('selects profiles from RTT and packet loss', () => {
        expect(selectAudioBitrateProfile({ roundTripTime: 0.05, lossRate: 0.01 })).toEqual({ name: 'good', maxBitrate: 96000 });
        expect(selectAudioBitrateProfile({ roundTripTime: 0.2, lossRate: 0.01 })).toEqual({ name: 'fair', maxBitrate: 64000 });
        expect(selectAudioBitrateProfile({ roundTripTime: 0.1, lossRate: 0.1 })).toEqual({ name: 'poor', maxBitrate: 40000 });
    });

    test('calculates interval loss instead of cumulative loss', () => {
        expect(calculateLossRate({
            packetsSent: 1100,
            packetsLost: 20,
            previousPacketsSent: 1000,
            previousPacketsLost: 10
        })).toBeCloseTo(10 / 110, 5);
    });

    test('uses hysteresis before changing bitrate profiles', () => {
        let state = createAudioAdaptationState(0);
        state = updateAudioAdaptation(state, { roundTripTime: 0.5, lossRate: 0.1, now: 16000 });
        expect(state.profile.name).toBe('good');
        state = updateAudioAdaptation(state, { roundTripTime: 0.5, lossRate: 0.1, now: 21000 });
        expect(state.profile.name).toBe('poor');

        state = updateAudioAdaptation(state, { roundTripTime: 0.01, lossRate: 0, now: 40000 });
        state = updateAudioAdaptation(state, { roundTripTime: 0.01, lossRate: 0, now: 45000 });
        expect(state.profile.name).toBe('poor');
    });

    test('classifies receiver quality from jitter and concealment', () => {
        expect(classifyInboundAudioQuality({ jitterMs: 10, jitterBufferMs: 30 })).toBe('good');
        expect(classifyInboundAudioQuality({ jitterMs: 40, concealmentRate: 0.02 })).toBe('fair');
        expect(classifyInboundAudioQuality({ jitterBufferMs: 220 })).toBe('poor');
    });
});
