import { AUDIO_PROCESSING_MODES } from './audioProcessing';

export const AUDIO_PRESETS = Object.freeze({
    gaming: Object.freeze({
        id: 'gaming',
        label: '稳定开黑',
        description: '持续发送，优先保证语句完整和低延迟。',
        audioProcessingMode: AUDIO_PROCESSING_MODES.STANDARD,
        microphoneEnhancementEnabled: false,
        voiceActivationEnabled: false,
        voiceActivationThreshold: 15,
        voiceActivationOpenSensitivity: 6,
        voiceActivationReleaseDelay: 520,
        voiceActivationNoiseTolerance: 8
    }),
    natural: Object.freeze({
        id: 'natural',
        label: '安静耳机',
        description: '保留自然音色，适合安静环境和耳麦。',
        audioProcessingMode: AUDIO_PROCESSING_MODES.RAW,
        microphoneEnhancementEnabled: false,
        voiceActivationEnabled: true,
        voiceActivationThreshold: 12,
        voiceActivationOpenSensitivity: 8,
        voiceActivationReleaseDelay: 520,
        voiceActivationNoiseTolerance: 4
    }),
    noisy: Object.freeze({
        id: 'noisy',
        label: '嘈杂环境',
        description: 'AI 降噪与保守门控，压制键盘和风扇声。',
        audioProcessingMode: AUDIO_PROCESSING_MODES.AI,
        microphoneEnhancementEnabled: true,
        voiceActivationEnabled: true,
        voiceActivationThreshold: 20,
        voiceActivationOpenSensitivity: 8,
        voiceActivationReleaseDelay: 650,
        voiceActivationNoiseTolerance: 12
    })
});

export const getAudioPreset = (presetId) => AUDIO_PRESETS[presetId] || null;

