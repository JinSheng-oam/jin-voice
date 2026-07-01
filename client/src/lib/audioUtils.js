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

export const getVoiceActivationThresholds = ({
    threshold = 15,
    openSensitivity = 6,
    noiseTolerance = 8
} = {}) => {
    const baseThreshold = normalizeVoiceActivationThreshold(threshold);
    const safeOpenSensitivity = Math.max(0, Math.min(12, Number(openSensitivity) || 0));
    const safeNoiseTolerance = Math.max(0, Math.min(16, Number(noiseTolerance) || 0));
    const openThreshold = Math.max(0, Math.min(100, baseThreshold + safeNoiseTolerance - safeOpenSensitivity));
    const closeThreshold = Math.max(0, Math.min(100, openThreshold - (4 + safeOpenSensitivity * 0.5)));

    return {
        openThreshold,
        closeThreshold
    };
};

export const getVoiceTransmissionDecision = ({
    isMuted = false,
    pushToTalkEnabled = false,
    pushToTalkPressed = false,
    voiceActivationEnabled = false,
    volume = 0,
    previousMuted = false,
    lastVoiceDetectedAt = 0,
    now = 0,
    voiceActivationThreshold = 15,
    voiceActivationOpenSensitivity = 6,
    voiceActivationReleaseDelay = 520,
    voiceActivationNoiseTolerance = 8
} = {}) => {
    if (isMuted) {
        return {
            shouldMuteOutput: true,
            state: 'manual-muted',
            lastVoiceDetectedAt
        };
    }

    if (pushToTalkEnabled) {
        const shouldMuteOutput = !pushToTalkPressed;
        return {
            shouldMuteOutput,
            state: shouldMuteOutput ? 'push-to-talk-muted' : 'live',
            lastVoiceDetectedAt
        };
    }

    if (!voiceActivationEnabled) {
        return {
            shouldMuteOutput: false,
            state: 'live',
            lastVoiceDetectedAt: 0
        };
    }

    const { openThreshold, closeThreshold } = getVoiceActivationThresholds({
        threshold: voiceActivationThreshold,
        openSensitivity: voiceActivationOpenSensitivity,
        noiseTolerance: voiceActivationNoiseTolerance
    });

    const safeVolume = Math.max(0, Math.min(100, Number(volume) || 0));
    const safeReleaseDelay = Math.max(0, Number(voiceActivationReleaseDelay) || 0);
    let nextLastVoiceDetectedAt = lastVoiceDetectedAt;
    let shouldMuteOutput;

    if (safeVolume >= openThreshold) {
        nextLastVoiceDetectedAt = now;
        shouldMuteOutput = false;
    } else if (!previousMuted) {
        const withinReleaseWindow = now - nextLastVoiceDetectedAt < safeReleaseDelay;
        shouldMuteOutput = !withinReleaseWindow && safeVolume < closeThreshold;
    } else {
        shouldMuteOutput = safeVolume < openThreshold;
    }

    return {
        shouldMuteOutput,
        state: shouldMuteOutput ? 'voice-gated' : 'live',
        lastVoiceDetectedAt: nextLastVoiceDetectedAt
    };
};
