import { describe, test, expect } from 'vitest';
import {
    normalizeVoiceActivationThreshold,
    clampNoiseSuppressionStrength,
    getNoiseGateConfig,
    getPlaybackGainValue
} from '../audioUtils';

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

describe('clampNoiseSuppressionStrength', () => {
    test('正常值原样返回', () => {
        expect(clampNoiseSuppressionStrength(50)).toBe(50);
    });

    test('下限 clamp 到 0', () => {
        expect(clampNoiseSuppressionStrength(-1)).toBe(0);
    });

    test('上限 clamp 到 100', () => {
        expect(clampNoiseSuppressionStrength(101)).toBe(100);
    });

    test('边界值 0 和 100 正常返回', () => {
        expect(clampNoiseSuppressionStrength(0)).toBe(0);
        expect(clampNoiseSuppressionStrength(100)).toBe(100);
    });

    test('非数字回退到 0', () => {
        expect(clampNoiseSuppressionStrength(undefined)).toBe(0);
        expect(clampNoiseSuppressionStrength(null)).toBe(0);
        expect(clampNoiseSuppressionStrength('abc')).toBe(0);
    });
});

describe('getNoiseGateConfig', () => {
    test('返回包含必要字段的配置对象', () => {
        const config = getNoiseGateConfig(50);
        expect(config).toHaveProperty('thresholdDb');
        expect(config).toHaveProperty('floorGain');
        expect(config).toHaveProperty('attack');
        expect(config).toHaveProperty('release');
    });

    test('thresholdDb 随强度增大而增大', () => {
        const low = getNoiseGateConfig(0);
        const high = getNoiseGateConfig(100);
        expect(high.thresholdDb).toBeGreaterThan(low.thresholdDb);
    });

    test('floorGain 随强度增大而减小（压得更深）', () => {
        const low = getNoiseGateConfig(0);
        const high = getNoiseGateConfig(100);
        expect(high.floorGain).toBeLessThan(low.floorGain);
    });

    test('attack 和 release 是正数', () => {
        const config = getNoiseGateConfig(50);
        expect(config.attack).toBeGreaterThan(0);
        expect(config.release).toBeGreaterThan(0);
    });

    test('强度 0 时 floorGain 接近 1（几乎不压）', () => {
        const config = getNoiseGateConfig(0);
        expect(config.floorGain).toBeGreaterThan(0.5);
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
