const percentile = (values, ratio) => {
    const sorted = values.map(Number).filter(Number.isFinite).toSorted((a, b) => a - b);
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const calculateVoiceCalibration = ({ noiseSamples = [], voiceSamples = [] } = {}) => {
    const noiseFloor = percentile(noiseSamples, 0.9);
    const voiceLevel = percentile(voiceSamples, 0.65);
    if (noiseSamples.length < 5 || voiceSamples.length < 5) {
        throw new Error('校准样本不足，请重新测试');
    }
    if (voiceLevel < noiseFloor + 5) {
        throw new Error('没有检测到清晰人声，请靠近麦克风后重试');
    }

    const targetOpenLevel = noiseFloor + Math.max(4, (voiceLevel - noiseFloor) * 0.32);
    const noiseTolerance = clamp(Math.round(noiseFloor / 5), 2, 12);
    const openSensitivity = 8;
    const threshold = clamp(Math.round(targetOpenLevel - noiseTolerance + openSensitivity), 5, 60);

    return {
        noiseFloor: Math.round(noiseFloor),
        voiceLevel: Math.round(voiceLevel),
        voiceActivationThreshold: threshold,
        voiceActivationOpenSensitivity: openSensitivity,
        voiceActivationReleaseDelay: 600,
        voiceActivationNoiseTolerance: noiseTolerance
    };
};

