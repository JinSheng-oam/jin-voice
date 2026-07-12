import { useEffect } from 'react';
import { AUDIO_PROCESSING_MODES, sanitizeAudioProcessingMode } from '../../lib/audioProcessing';

export const useLocalMonitorPlayback = ({
    audioProcessingMode, microphoneEnhancementEnabled, selectedAudioInput, selectedAudioOutput,
    selfMonitorEnabled, selfMonitorVolume, stream, isMuted, ensureLocalMonitorAudio,
    stopLocalMonitorStream, syncLocalMonitorMuteState, rawInputStreamRef, activeOutgoingStreamRef,
    currentInputDeviceIdRef, localMonitorStreamRef, localMonitorSourceTrackIdRef,
    voiceActivationEnabledRef, lastMuteStateRef
}) => {
    useEffect(() => {
        const applyLocalMonitor = async () => {
            if (!selfMonitorEnabled) return stopLocalMonitorStream();
            const processed = microphoneEnhancementEnabled || sanitizeAudioProcessingMode(audioProcessingMode) === AUDIO_PROCESSING_MODES.AI;
            const sourceStream = !processed && rawInputStreamRef.current ? rawInputStreamRef.current : (stream || activeOutgoingStreamRef.current);
            const sourceTrack = sourceStream?.getAudioTracks?.()[0];
            if (!sourceTrack || sourceTrack.readyState === 'ended') return stopLocalMonitorStream();

            const audioElement = ensureLocalMonitorAudio();
            if (selectedAudioOutput && typeof audioElement.setSinkId === 'function') {
                try { await audioElement.setSinkId(selectedAudioOutput); }
                catch (error) { console.warn('[Audio] Failed to set self-monitor output device:', error); }
            }
            const sourceId = processed ? sourceTrack.id : `dedicated:${selectedAudioInput || currentInputDeviceIdRef.current || sourceTrack.id}`;
            const reusable = localMonitorStreamRef.current && localMonitorSourceTrackIdRef.current === sourceId && localMonitorStreamRef.current.getAudioTracks?.()[0]?.readyState !== 'ended';
            if (!reusable) {
                stopLocalMonitorStream();
                const monitorStream = sourceStream?.clone?.() || null;
                if (!monitorStream) return;
                localMonitorStreamRef.current = monitorStream;
                localMonitorSourceTrackIdRef.current = sourceId;
                audioElement.srcObject = monitorStream;
                syncLocalMonitorMuteState(isMuted || (voiceActivationEnabledRef.current && lastMuteStateRef.current === true));
            }
            audioElement.muted = false;
            audioElement.volume = Math.max(0, Math.min(1, selfMonitorVolume / 100));
            try { await audioElement.play(); } catch { /* wait for user interaction */ }
        };
        void applyLocalMonitor();
        return () => { if (!selfMonitorEnabled) stopLocalMonitorStream(); };
    }, [
        activeOutgoingStreamRef, audioProcessingMode, currentInputDeviceIdRef, ensureLocalMonitorAudio,
        isMuted, lastMuteStateRef, localMonitorSourceTrackIdRef, localMonitorStreamRef,
        microphoneEnhancementEnabled, rawInputStreamRef, selectedAudioInput, selectedAudioOutput,
        selfMonitorEnabled, selfMonitorVolume, stopLocalMonitorStream, stream,
        syncLocalMonitorMuteState, voiceActivationEnabledRef
    ]);
};
