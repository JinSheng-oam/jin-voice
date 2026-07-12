export const AUDIO_BITRATE_PROFILES = Object.freeze({
    GOOD: { name: 'good', maxBitrate: 64000 },
    FAIR: { name: 'fair', maxBitrate: 48000 },
    POOR: { name: 'poor', maxBitrate: 32000 }
});

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
