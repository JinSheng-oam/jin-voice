export const normalizeVoiceActivationThreshold = (value) => Math.max(5, Math.min(60, Number(value) || 15));

export const clampNoiseSuppressionStrength = (value) => Math.max(0, Math.min(100, Number(value) || 0));

export const getNoiseGateConfig = (strength) => {
    const safeStrength = clampNoiseSuppressionStrength(strength);

    return {
        thresholdDb: -56 + (safeStrength * 0.2),
        floorGain: Math.pow(10, (-6 - (safeStrength * 0.18)) / 20),
        attack: 0.025,
        release: 0.09
    };
};

export const getPlaybackGainValue = (volume = 100) => {
    const safeVolume = Math.max(0, Math.min(500, Number(volume) || 0));

    if (safeVolume <= 100) {
        return Math.pow(safeVolume / 100, 2.2);
    }

    return 1 + ((safeVolume - 100) / 100);
};
