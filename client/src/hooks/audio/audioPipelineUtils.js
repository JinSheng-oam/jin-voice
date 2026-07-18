import { sanitizeAudioProcessingMode } from '../../lib/audioProcessing';

export const stopStreamTracks = (mediaStream) => {
    mediaStream?.getTracks?.().forEach((track) => track.stop());
};

export const disconnectAudioNode = (node) => {
    if (!node) return;

    try {
        node.disconnect();
    } catch {
        /* noop cleanup */
    }
};

export const buildInputSignature = ({ deviceId, audioProcessingMode }) => JSON.stringify({
    deviceId: deviceId || '',
    audioProcessingMode: sanitizeAudioProcessingMode(audioProcessingMode)
});

export const createEmptyAudioLevelHealth = () => ({
    rawVolume: 0,
    processedVolume: 0,
    rawPeak: 0,
    processedPeak: 0,
    rawClipFrames: 0,
    processedClipFrames: 0,
    lastUpdatedAt: 0
});

export const getTrackDiagnostics = (track) => {
    if (!track) return null;

    return {
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: typeof track.getSettings === 'function' ? track.getSettings() : null
    };
};
