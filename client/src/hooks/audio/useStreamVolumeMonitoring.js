import { useEffect } from 'react';

export const useStreamVolumeMonitoring = ({
    stream, rawInputStreamRef, setupVolumeMonitoring, stopVolumeMonitoring, publishMicVolume
}) => {
    useEffect(() => {
        if (!stream) {
            stopVolumeMonitoring();
            publishMicVolume(0, true);
            return undefined;
        }
        setupVolumeMonitoring(rawInputStreamRef.current || stream, stream);
        return () => stopVolumeMonitoring();
    }, [publishMicVolume, rawInputStreamRef, setupVolumeMonitoring, stopVolumeMonitoring, stream]);
};
