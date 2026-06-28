import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAudioStore = create(
    persist(
        (set) => ({
            audioDevices: { inputs: [], outputs: [] },
            selectedAudioInput: '',
            selectedAudioOutput: '',
            setAudioDevices: (devices) => set({ audioDevices: devices }),
            setSelectedAudioInput: (deviceId) => set({ selectedAudioInput: deviceId }),
            setSelectedAudioOutput: (deviceId) => set({ selectedAudioOutput: deviceId }),

            micVolume: 0,
            setMicVolume: (vol) => set({ micVolume: vol }),

            microphoneEnhancementEnabled: false,
            setMicrophoneEnhancementEnabled: (enabled) => set({ microphoneEnhancementEnabled: enabled }),

            noiseSuppressionEnabled: false,
            setNoiseSuppressionEnabled: (enabled) => set({ noiseSuppressionEnabled: enabled }),
            noiseSuppressionStrength: 35,
            setNoiseSuppressionStrength: (value) => set({
                noiseSuppressionStrength: Math.max(0, Math.min(100, Number(value) || 0))
            }),

            voiceActivationEnabled: false,
            setVoiceActivationEnabled: (enabled) => set({ voiceActivationEnabled: enabled }),
            voiceActivationThreshold: 15,
            setVoiceActivationThreshold: (value) => set({ voiceActivationThreshold: Math.max(5, Math.min(60, Number(value) || 15)) }),

            pushToTalkEnabled: false,
            setPushToTalkEnabled: (enabled) => set({ pushToTalkEnabled: enabled }),
            pushToTalkKey: 'Space',
            setPushToTalkKey: (key) => set({ pushToTalkKey: key || 'Space' }),

            voiceActivationOpenSensitivity: 6,
            setVoiceActivationOpenSensitivity: (value) => set({ voiceActivationOpenSensitivity: value }),
            voiceActivationReleaseDelay: 520,
            setVoiceActivationReleaseDelay: (value) => set({ voiceActivationReleaseDelay: value }),
            voiceActivationNoiseTolerance: 8,
            setVoiceActivationNoiseTolerance: (value) => set({ voiceActivationNoiseTolerance: value }),

            selfMonitorEnabled: false,
            setSelfMonitorEnabled: (enabled) => set({ selfMonitorEnabled: enabled }),
            selfMonitorVolume: 100,
            setSelfMonitorVolume: (volume) => set({ selfMonitorVolume: volume }),

            userVolumes: {},
            setUserVolume: (userId, volume) => set((state) => ({
                userVolumes: { ...state.userVolumes, [userId]: volume }
            })),

            isMuted: false,
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
                microphoneEnhancementEnabled: state.microphoneEnhancementEnabled,
                noiseSuppressionEnabled: state.noiseSuppressionEnabled,
                noiseSuppressionStrength: state.noiseSuppressionStrength,
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
        }
    )
);

export default useAudioStore;
