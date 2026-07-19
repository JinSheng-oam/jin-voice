export const AUDIO_BITRATE_PROFILES = Object.freeze({
    GOOD: { name: 'good', maxBitrate: 96000 },
    FAIR: { name: 'fair', maxBitrate: 64000 },
    POOR: { name: 'poor', maxBitrate: 40000 }
});

const PROFILE_ORDER = Object.freeze(['good', 'fair', 'poor']);
const EWMA_ALPHA = 0.35;
const DOWNGRADE_SAMPLES = 2;
const UPGRADE_SAMPLES = 4;
const MIN_PROFILE_HOLD_MS = 15000;

export const selectAudioBitrateProfile = ({ roundTripTime = 0, lossRate = 0 } = {}) => {
    const safeRtt = Math.max(0, Number(roundTripTime) || 0);
    const safeLoss = Math.max(0, Number(lossRate) || 0);

    if (safeRtt >= 0.35 || safeLoss >= 0.08) return AUDIO_BITRATE_PROFILES.POOR;
    if (safeRtt >= 0.18 || safeLoss >= 0.03) return AUDIO_BITRATE_PROFILES.FAIR;
    return AUDIO_BITRATE_PROFILES.GOOD;
};

export const calculateLossRate = ({
    packetsSent = 0,
    packetsLost = 0,
    previousPacketsSent = 0,
    previousPacketsLost = 0
} = {}) => {
    const sentDelta = Math.max(0, Number(packetsSent) - Number(previousPacketsSent));
    const lostDelta = Math.max(0, Number(packetsLost) - Number(previousPacketsLost));
    const totalDelta = sentDelta + lostDelta;
    return totalDelta > 0 ? lostDelta / totalDelta : 0;
};

export const createAudioAdaptationState = (now = 0) => ({
    profile: AUDIO_BITRATE_PROFILES.GOOD,
    smoothedRoundTripTime: 0,
    smoothedLossRate: 0,
    downgradeSamples: 0,
    upgradeSamples: 0,
    sampleCount: 0,
    lastProfileChangedAt: now
});

export const updateAudioAdaptation = (state, { roundTripTime = 0, lossRate = 0, now = 0 } = {}) => {
    const previous = state || createAudioAdaptationState(now);
    const safeRtt = Math.max(0, Number(roundTripTime) || 0);
    const safeLoss = Math.max(0, Number(lossRate) || 0);
    const smoothedRoundTripTime = previous.sampleCount
        ? previous.smoothedRoundTripTime * (1 - EWMA_ALPHA) + safeRtt * EWMA_ALPHA
        : safeRtt;
    const smoothedLossRate = previous.sampleCount
        ? previous.smoothedLossRate * (1 - EWMA_ALPHA) + safeLoss * EWMA_ALPHA
        : safeLoss;
    const candidate = selectAudioBitrateProfile({
        roundTripTime: smoothedRoundTripTime,
        lossRate: smoothedLossRate
    });
    const currentIndex = PROFILE_ORDER.indexOf(previous.profile.name);
    const candidateIndex = PROFILE_ORDER.indexOf(candidate.name);
    const isDowngrade = candidateIndex > currentIndex;
    const isUpgrade = candidateIndex < currentIndex;
    const downgradeSamples = isDowngrade ? previous.downgradeSamples + 1 : 0;
    const upgradeSamples = isUpgrade ? previous.upgradeSamples + 1 : 0;
    const holdElapsed = now - previous.lastProfileChangedAt >= MIN_PROFILE_HOLD_MS;
    const shouldChange = holdElapsed && (
        (isDowngrade && downgradeSamples >= DOWNGRADE_SAMPLES) ||
        (isUpgrade && upgradeSamples >= UPGRADE_SAMPLES)
    );

    return {
        profile: shouldChange ? candidate : previous.profile,
        smoothedRoundTripTime,
        smoothedLossRate,
        downgradeSamples: shouldChange ? 0 : downgradeSamples,
        upgradeSamples: shouldChange ? 0 : upgradeSamples,
        sampleCount: previous.sampleCount + 1,
        lastProfileChangedAt: shouldChange ? now : previous.lastProfileChangedAt
    };
};

export const classifyInboundAudioQuality = ({
    jitterMs = 0,
    jitterBufferMs = 0,
    concealmentRate = 0,
    packetsDiscarded = 0
} = {}) => {
    if (concealmentRate >= 0.05 || jitterMs >= 80 || jitterBufferMs >= 180 || packetsDiscarded >= 4) {
        return 'poor';
    }
    if (concealmentRate >= 0.01 || jitterMs >= 30 || jitterBufferMs >= 80 || packetsDiscarded > 0) {
        return 'fair';
    }
    return 'good';
};
