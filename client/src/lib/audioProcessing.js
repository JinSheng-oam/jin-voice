export const AUDIO_PROCESSING_MODES = Object.freeze({
    STANDARD: 'standard',
    AI: 'ai',
    RAW: 'raw'
});

const VALID_AUDIO_PROCESSING_MODES = new Set(Object.values(AUDIO_PROCESSING_MODES));

export const sanitizeAudioProcessingMode = (value) => (
    VALID_AUDIO_PROCESSING_MODES.has(value) ? value : AUDIO_PROCESSING_MODES.STANDARD
);

export const supportsAiNoiseSuppression = () => (
    typeof globalThis.MediaStreamTrackProcessor !== 'undefined' &&
    typeof globalThis.MediaStreamTrackGenerator !== 'undefined'
);

let aiNoiseSuppressionModulePromise = null;

export const loadAiNoiseSuppressionModule = async () => {
    if (!supportsAiNoiseSuppression()) {
        throw new Error('MediaStreamTrack Insertable Streams is unavailable');
    }

    if (!aiNoiseSuppressionModulePromise) {
        aiNoiseSuppressionModulePromise = import('@shiguredo/noise-suppression').catch((error) => {
            aiNoiseSuppressionModulePromise = null;
            throw error;
        });
    }

    return aiNoiseSuppressionModulePromise;
};

export const preloadAiNoiseSuppression = () => {
    if (!supportsAiNoiseSuppression()) return Promise.resolve(false);
    return loadAiNoiseSuppressionModule().then(() => true);
};

export const getAiInputFormatIssue = (settings = {}) => {
    if (settings.sampleRate && Number(settings.sampleRate) !== 48000) {
        return `AI 降噪需要 48000 Hz，当前为 ${settings.sampleRate} Hz`;
    }

    if (settings.channelCount && Number(settings.channelCount) !== 1) {
        return `AI 降噪需要单声道，当前为 ${settings.channelCount} 声道`;
    }

    return null;
};

export const getAudioLevelMetrics = (samples) => {
    if (!samples?.length) return { volume: 0, peak: 0, clipped: false };

    let sumSquares = 0;
    let peak = 0;
    for (const sample of samples) {
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    const normalizedDb = Math.max(-60, Math.min(0, db));

    return {
        volume: Math.round(((normalizedDb + 60) / 60) * 100),
        peak,
        clipped: peak >= 0.98
    };
};

export const getCaptureProcessingOptions = (mode, aiSupported = supportsAiNoiseSuppression()) => {
    const safeMode = sanitizeAudioProcessingMode(mode);

    if (safeMode === AUDIO_PROCESSING_MODES.RAW) {
        return {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        };
    }

    if (safeMode === AUDIO_PROCESSING_MODES.AI && aiSupported) {
        return {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false
        };
    }

    return {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    };
};

export const getAudioProcessingModeLabel = (mode) => {
    switch (sanitizeAudioProcessingMode(mode)) {
        case AUDIO_PROCESSING_MODES.AI:
            return 'AI 降噪';
        case AUDIO_PROCESSING_MODES.RAW:
            return '原始输入';
        default:
            return '标准降噪';
    }
};
