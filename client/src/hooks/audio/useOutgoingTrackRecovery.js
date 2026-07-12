import { useEffect } from 'react';

export const useOutgoingTrackRecovery = ({
    stream, activeOutgoingStreamRef, recoveryTimerRef, recoverEndedStream, mutedRecoveryDelayMs
}) => {
    useEffect(() => {
        const audioTrack = stream?.getAudioTracks?.()[0];
        activeOutgoingStreamRef.current = stream;
        if (!audioTrack) return undefined;
        if (audioTrack.readyState === 'ended') {
            void recoverEndedStream('track-already-ended');
            return undefined;
        }
        const clearMutedRecovery = () => {
            if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
        };
        const handleEnded = () => void recoverEndedStream('track-ended-event');
        const handleMuted = () => {
            clearMutedRecovery();
            recoveryTimerRef.current = window.setTimeout(() => {
                recoveryTimerRef.current = null;
                if (audioTrack.muted || audioTrack.readyState === 'ended') void recoverEndedStream('track-muted-timeout');
            }, mutedRecoveryDelayMs);
        };
        audioTrack.addEventListener('ended', handleEnded);
        audioTrack.addEventListener('mute', handleMuted);
        audioTrack.addEventListener('unmute', clearMutedRecovery);
        if (audioTrack.muted) handleMuted();
        return () => {
            clearMutedRecovery();
            audioTrack.removeEventListener('ended', handleEnded);
            audioTrack.removeEventListener('mute', handleMuted);
            audioTrack.removeEventListener('unmute', clearMutedRecovery);
        };
    }, [activeOutgoingStreamRef, mutedRecoveryDelayMs, recoverEndedStream, recoveryTimerRef, stream]);
};
