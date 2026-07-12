import { describe, test, expect } from 'vitest';
import {
    configureVoiceLimiter,
    normalizeVoiceActivationThreshold,
    getPlaybackGainValue,
    getVoiceTransmissionDecision
} from '../audioUtils';

describe('configureVoiceLimiter', () => {
    test('configures a fast protective limiter', () => {
        const createParam = () => ({ value: 0 });
        const limiter = {
            threshold: createParam(),
            knee: createParam(),
            ratio: createParam(),
            attack: createParam(),
            release: createParam()
        };

        expect(configureVoiceLimiter(limiter)).toBe(limiter);
        expect(limiter.threshold.value).toBe(-3);
        expect(limiter.ratio.value).toBe(20);
        expect(limiter.attack.value).toBe(0.002);
        expect(limiter.release.value).toBe(0.08);
    });
});

describe('normalizeVoiceActivationThreshold', () => {
    test('正常值原样返回', () => {
        expect(normalizeVoiceActivationThreshold(30)).toBe(30);
    });

    test('下限 clamp 到 5', () => {
        expect(normalizeVoiceActivationThreshold(4)).toBe(5);
        expect(normalizeVoiceActivationThreshold(-10)).toBe(5);
    });

    test('0 和 falsy 值回退到默认 15', () => {
        expect(normalizeVoiceActivationThreshold(0)).toBe(15);
        expect(normalizeVoiceActivationThreshold(null)).toBe(15);
        expect(normalizeVoiceActivationThreshold(undefined)).toBe(15);
    });

    test('上限 clamp 到 60', () => {
        expect(normalizeVoiceActivationThreshold(61)).toBe(60);
        expect(normalizeVoiceActivationThreshold(100)).toBe(60);
    });

    test('边界值 5 和 60 正常返回', () => {
        expect(normalizeVoiceActivationThreshold(5)).toBe(5);
        expect(normalizeVoiceActivationThreshold(60)).toBe(60);
    });

    test('非数字回退到 15', () => {
        expect(normalizeVoiceActivationThreshold('abc')).toBe(15);
    });
});

describe('getPlaybackGainValue', () => {
    test('音量 0 返回 0', () => {
        expect(getPlaybackGainValue(0)).toBe(0);
    });

    test('音量 100 返回 1', () => {
        expect(getPlaybackGainValue(100)).toBe(1);
    });

    test('音量 50 返回 0 到 1 之间的值', () => {
        const result = getPlaybackGainValue(50);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(1);
    });

    test('音量 200 返回大于 1 的值（放大）', () => {
        const result = getPlaybackGainValue(200);
        expect(result).toBeGreaterThan(1);
    });

    test('音量 500 返回 5（最大放大）', () => {
        expect(getPlaybackGainValue(500)).toBe(5);
    });

    test('无参数默认 100', () => {
        expect(getPlaybackGainValue()).toBe(1);
    });

    test('负数 clamp 到 0', () => {
        expect(getPlaybackGainValue(-10)).toBe(0);
    });

    test('超过 500 clamp 到 500', () => {
        expect(getPlaybackGainValue(999)).toBe(getPlaybackGainValue(500));
    });

    test('0-100 段是单调递增的', () => {
        const v25 = getPlaybackGainValue(25);
        const v50 = getPlaybackGainValue(50);
        const v75 = getPlaybackGainValue(75);
        expect(v25).toBeLessThan(v50);
        expect(v50).toBeLessThan(v75);
    });

    test('100-500 段是单调递增的', () => {
        const v100 = getPlaybackGainValue(100);
        const v200 = getPlaybackGainValue(200);
        const v400 = getPlaybackGainValue(400);
        expect(v100).toBeLessThan(v200);
        expect(v200).toBeLessThan(v400);
    });
});

describe('getVoiceTransmissionDecision', () => {
    test('manual mute has highest priority', () => {
        const decision = getVoiceTransmissionDecision({
            isMuted: true,
            pushToTalkEnabled: true,
            pushToTalkPressed: true,
            voiceActivationEnabled: true,
            volume: 100
        });

        expect(decision.shouldMuteOutput).toBe(true);
        expect(decision.state).toBe('manual-muted');
    });

    test('push-to-talk mutes output until the key is pressed', () => {
        const muted = getVoiceTransmissionDecision({
            pushToTalkEnabled: true,
            pushToTalkPressed: false,
            voiceActivationEnabled: true,
            volume: 100
        });
        const live = getVoiceTransmissionDecision({
            pushToTalkEnabled: true,
            pushToTalkPressed: true,
            voiceActivationEnabled: true,
            volume: 0
        });

        expect(muted.shouldMuteOutput).toBe(true);
        expect(muted.state).toBe('push-to-talk-muted');
        expect(live.shouldMuteOutput).toBe(false);
        expect(live.state).toBe('live');
    });

    test('voice activation keeps mic open during release delay', () => {
        const decision = getVoiceTransmissionDecision({
            voiceActivationEnabled: true,
            volume: 2,
            previousMuted: false,
            lastVoiceDetectedAt: 1000,
            now: 1300,
            voiceActivationReleaseDelay: 520
        });

        expect(decision.shouldMuteOutput).toBe(false);
        expect(decision.state).toBe('live');
    });

    test('voice activation closes after release delay when volume stays low', () => {
        const decision = getVoiceTransmissionDecision({
            voiceActivationEnabled: true,
            volume: 2,
            previousMuted: false,
            lastVoiceDetectedAt: 1000,
            now: 2000,
            voiceActivationReleaseDelay: 520
        });

        expect(decision.shouldMuteOutput).toBe(true);
        expect(decision.state).toBe('voice-gated');
    });
});
