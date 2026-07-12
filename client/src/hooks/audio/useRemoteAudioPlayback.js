import { useEffect } from 'react';
import { syncRemoteAudioOutputDevice, syncRemotePlaybackVolume } from '../../lib/remoteAudio';
import { getPlaybackGainValue } from '../../lib/audioUtils';

export const useRemoteAudioPlayback = ({
    connectedPeer, isDeafened, remoteAudioContextRef, remoteAudiosRef,
    remoteGainNodeRef, selectedAudioOutput, userVolumes
}) => {
    useEffect(() => {
        if (remoteAudioContextRef.current) {
            const operation = isDeafened ? 'suspend' : 'resume';
            remoteAudioContextRef.current[operation]().catch(() => { /* noop */ });
        }
        if (remoteGainNodeRef.current && connectedPeer) {
            remoteGainNodeRef.current.gain.value = isDeafened ? 0 : getPlaybackGainValue(userVolumes[connectedPeer] ?? 100);
        }
        remoteAudiosRef.current?.forEach((userData, peerId) => {
            if (userData.audioElement) userData.audioElement.muted = isDeafened;
            const gain = isDeafened ? 0 : getPlaybackGainValue(userVolumes[peerId] ?? 100);
            if (userData.audioElement?._gainNode) userData.audioElement._gainNode.gain.value = gain;
            if (userData.gainNode) userData.gainNode.gain.value = gain;
        });
    }, [connectedPeer, isDeafened, remoteAudiosRef, remoteAudioContextRef, remoteGainNodeRef, userVolumes]);

    useEffect(() => {
        if (!selectedAudioOutput) return;
        void syncRemoteAudioOutputDevice({ sinkId: selectedAudioOutput, remoteAudioContextRef, remoteAudiosRef });
    }, [selectedAudioOutput, remoteAudioContextRef, remoteAudiosRef]);

    useEffect(() => {
        syncRemotePlaybackVolume({
            userVolumes, connectedPeer, remoteGainNodeRef, remoteAudiosRef, remoteAudioContextRef
        });
    }, [connectedPeer, remoteAudiosRef, remoteAudioContextRef, remoteGainNodeRef, userVolumes]);
};
