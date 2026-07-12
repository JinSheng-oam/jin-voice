import { describe, expect, test } from 'vitest';
import { calculateLossRate, selectAudioBitrateProfile } from '../audioNetwork';

describe('audio network adaptation', () => {
    test('selects profiles from RTT and packet loss', () => {
        expect(selectAudioBitrateProfile({ roundTripTime: 0.05, lossRate: 0.01 }).name).toBe('good');
        expect(selectAudioBitrateProfile({ roundTripTime: 0.2, lossRate: 0.01 }).name).toBe('fair');
        expect(selectAudioBitrateProfile({ roundTripTime: 0.1, lossRate: 0.1 }).name).toBe('poor');
    });

    test('calculates interval loss instead of cumulative loss', () => {
        expect(calculateLossRate({
            packetsSent: 1100,
            packetsLost: 20,
            previousPacketsSent: 1000,
            previousPacketsLost: 10
        })).toBeCloseTo(10 / 110, 5);
    });
});
