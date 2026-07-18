import { useEffect } from 'react';

export const useLocalMonitorPlayback = ({
    selectedAudioOutput,
    selfMonitorEnabled, selfMonitorVolume, stream, ensureLocalMonitorAudio,
    stopLocalMonitorStream, activeOutgoingStreamRef,
    localMonitorStreamRef, localMonitorSourceTrackIdRef
}) => {
    useEffect(() => {
        const applyLocalMonitor = async () => {
            if (!selfMonitorEnabled) return stopLocalMonitorStream();
            // Always monitor the final pre-Opus stream. This keeps AI processing and
            // microphone enhancement identical to the track handed to WebRTC/SFU.
            const sourceStream = stream || activeOutgoingStreamRef.current;
            const sourceTrack = sourceStream?.getAudioTracks?.()[0];
            if (!sourceTrack || sourceTrack.readyState === 'ended') return stopLocalMonitorStream();

            const audioElement = ensureLocalMonitorAudio();
            if (selectedAudioOutput && typeof audioElement.setSinkId === 'function') {
                try { await audioElement.setSinkId(selectedAudioOutput); }
                catch (error) { console.warn('[Audio] Failed to set self-monitor output device:', error); }
            }
            const sourceId = sourceTrack.id;
            const reusable = localMonitorStreamRef.current && localMonitorSourceTrackIdRef.current === sourceId && localMonitorStreamRef.current.getAudioTracks?.()[0]?.readyState !== 'ended';
            if (!reusable) {
                stopLocalMonitorStream();
                const monitorStream = sourceStream?.clone?.() || null;
                if (!monitorStream) return;
                // Monitoring is a local device test and must remain audible while the
                // outgoing track is muted, voice-gated, or waiting for push-to-talk.
                monitorStream.getAudioTracks().forEach((track) => {
                    track.enabled = true;
                });
                localMonitorStreamRef.current = monitorStream;
                localMonitorSourceTrackIdRef.current = sourceId;
                audioElement.srcObject = monitorStream;
            }
            audioElement.muted = false;
            audioElement.volume = Math.max(0, Math.min(1, selfMonitorVolume / 100));
            try { await audioElement.play(); } catch { /* wait for user interaction */ }
        };
        void applyLocalMonitor();
        return () => { if (!selfMonitorEnabled) stopLocalMonitorStream(); };
    }, [
        activeOutgoingStreamRef, ensureLocalMonitorAudio,
        localMonitorSourceTrackIdRef, localMonitorStreamRef, selectedAudioOutput,
        selfMonitorEnabled, selfMonitorVolume, stopLocalMonitorStream, stream
    ]);
};
