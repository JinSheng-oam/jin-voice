import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AUDIO_PROCESSING_MODES, sanitizeAudioProcessingMode } from '../lib/audioProcessing';
import { getAudioPreset } from '../lib/audioPresets';

const clampNumber = (value, min, max, fallback) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(min, Math.min(max, numericValue));
};

const sanitizeUserVolumes = (userVolumes = {}) => Object.fromEntries(
    Object.entries(userVolumes || {}).map(([userId, volume]) => [
        userId,
        clampNumber(volume, 0, 500, 100)
    ])
);

const sanitizePersistedAudioSettings = (state) => ({
    ...state,
    audioProcessingMode: sanitizeAudioProcessingMode(state.audioProcessingMode),
    voiceActivationThreshold: clampNumber(state.voiceActivationThreshold, 5, 60, 15),
    voiceActivationOpenSensitivity: clampNumber(state.voiceActivationOpenSensitivity, 0, 12, 6),
    voiceActivationReleaseDelay: clampNumber(state.voiceActivationReleaseDelay, 0, 2000, 520),
    voiceActivationNoiseTolerance: clampNumber(state.voiceActivationNoiseTolerance, 0, 16, 8),
    selfMonitorVolume: clampNumber(state.selfMonitorVolume, 0, 100, 100),
    userVolumes: sanitizeUserVolumes(state.userVolumes)
});

const useAudioStore = create(
    persist(
        (set) => ({
            audioDevices: { inputs: [], outputs: [] },
            audioPreviewRequested: false,
            setAudioPreviewRequested: (requested) => set({ audioPreviewRequested: Boolean(requested) }),
            audioDeviceNotice: null,
            setAudioDeviceNotice: (notice) => set({ audioDeviceNotice: notice }),
            selectedAudioInput: '',
            selectedAudioOutput: '',
            setAudioDevices: (devices) => set({ audioDevices: devices }),
            setSelectedAudioInput: (deviceId) => set({ selectedAudioInput: deviceId }),
            setSelectedAudioOutput: (deviceId) => set({ selectedAudioOutput: deviceId }),

            micVolume: 0,
            setMicVolume: (vol) => set({ micVolume: vol }),

            microphoneEnhancementEnabled: false,
            setMicrophoneEnhancementEnabled: (enabled) => set({
                microphoneEnhancementEnabled: enabled,
                audioPreset: 'custom'
            }),

            audioPreset: 'gaming',
            applyAudioPreset: (presetId) => set((state) => {
                const preset = getAudioPreset(presetId);
                if (!preset) return state;
                return {
                    audioPreset: preset.id,
                    audioProcessingMode: preset.audioProcessingMode,
                    microphoneEnhancementEnabled: preset.microphoneEnhancementEnabled,
                    voiceActivationEnabled: preset.voiceActivationEnabled,
                    voiceActivationThreshold: preset.voiceActivationThreshold,
                    voiceActivationOpenSensitivity: preset.voiceActivationOpenSensitivity,
                    voiceActivationReleaseDelay: preset.voiceActivationReleaseDelay,
                    voiceActivationNoiseTolerance: preset.voiceActivationNoiseTolerance
                };
            }),
            applyVoiceCalibration: (calibration) => set({
                audioPreset: 'custom',
                voiceActivationEnabled: true,
                voiceActivationThreshold: clampNumber(calibration?.voiceActivationThreshold, 5, 60, 15),
                voiceActivationOpenSensitivity: clampNumber(calibration?.voiceActivationOpenSensitivity, 0, 12, 8),
                voiceActivationReleaseDelay: clampNumber(calibration?.voiceActivationReleaseDelay, 0, 2000, 600),
                voiceActivationNoiseTolerance: clampNumber(calibration?.voiceActivationNoiseTolerance, 0, 16, 6)
            }),
            audioProcessingMode: AUDIO_PROCESSING_MODES.STANDARD,
            setAudioProcessingMode: (mode) => set({
                audioProcessingMode: sanitizeAudioProcessingMode(mode),
                audioPreset: 'custom'
            }),

            voiceActivationEnabled: false,
            setVoiceActivationEnabled: (enabled) => set({ voiceActivationEnabled: enabled, audioPreset: 'custom' }),
            voiceActivationThreshold: 15,
            setVoiceActivationThreshold: (value) => set({
                voiceActivationThreshold: Math.max(5, Math.min(60, Number(value) || 15)),
                audioPreset: 'custom'
            }),

            pushToTalkEnabled: false,
            setPushToTalkEnabled: (enabled) => set({ pushToTalkEnabled: enabled }),
            pushToTalkKey: 'Space',
            setPushToTalkKey: (key) => set({ pushToTalkKey: key || 'Space' }),

            voiceActivationOpenSensitivity: 6,
            setVoiceActivationOpenSensitivity: (value) => set({
                voiceActivationOpenSensitivity: clampNumber(value, 0, 12, 6),
                audioPreset: 'custom'
            }),
            voiceActivationReleaseDelay: 520,
            setVoiceActivationReleaseDelay: (value) => set({
                voiceActivationReleaseDelay: clampNumber(value, 0, 2000, 520),
                audioPreset: 'custom'
            }),
            voiceActivationNoiseTolerance: 8,
            setVoiceActivationNoiseTolerance: (value) => set({
                voiceActivationNoiseTolerance: clampNumber(value, 0, 16, 8),
                audioPreset: 'custom'
            }),

            selfMonitorEnabled: false,
            setSelfMonitorEnabled: (enabled) => set({ selfMonitorEnabled: enabled }),
            selfMonitorVolume: 100,
            setSelfMonitorVolume: (volume) => set({
                selfMonitorVolume: clampNumber(volume, 0, 100, 100)
            }),

            userVolumes: {},
            setUserVolume: (userId, volume) => set((state) => ({
                userVolumes: {
                    ...state.userVolumes,
                    [userId]: clampNumber(volume, 0, 500, 100)
                }
            })),

            isMuted: true,
            setIsMuted: (muted) => set({ isMuted: muted }),
            toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

            isDeafened: false,
            setIsDeafened: (deafened) => set({ isDeafened: deafened }),
            toggleDeafen: () => set((state) => ({ isDeafened: !state.isDeafened })),
        }),
        {
            name: 'audio-settings',
            partialize: (state) => ({
                selectedAudioInput: state.selectedAudioInput,
                selectedAudioOutput: state.selectedAudioOutput,
                audioPreset: state.audioPreset,
                microphoneEnhancementEnabled: state.microphoneEnhancementEnabled,
                audioProcessingMode: state.audioProcessingMode,
                voiceActivationEnabled: state.voiceActivationEnabled,
                voiceActivationThreshold: state.voiceActivationThreshold,
                pushToTalkEnabled: state.pushToTalkEnabled,
                pushToTalkKey: state.pushToTalkKey,
                voiceActivationOpenSensitivity: state.voiceActivationOpenSensitivity,
                voiceActivationReleaseDelay: state.voiceActivationReleaseDelay,
                voiceActivationNoiseTolerance: state.voiceActivationNoiseTolerance,
                selfMonitorEnabled: state.selfMonitorEnabled,
                selfMonitorVolume: state.selfMonitorVolume,
                userVolumes: state.userVolumes,
            }),
            merge: (persistedState, currentState) => sanitizePersistedAudioSettings({
                ...currentState,
                ...(persistedState || {})
            })
        }
    )
);

export default useAudioStore;
