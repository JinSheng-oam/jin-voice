import { useEffect } from 'react';
import { sanitizeAudioProcessingMode } from '../../lib/audioProcessing';
import { recordClientMetric } from '../../lib/telemetry';

const stopStreamTracks = (stream) => stream?.getTracks?.().forEach((track) => track.stop());
const buildSignature = (deviceId, mode) => JSON.stringify({
    deviceId: deviceId || '',
    audioProcessingMode: sanitizeAudioProcessingMode(mode)
});

export const useMicrophoneSwitch = ({
    active, selectedAudioInput, audioProcessingMode, stream,
    initialSetupInFlightRef, currentInputDeviceIdRef, appliedInputSignatureRef,
    requestInputStream, buildOutgoingStream, applyActiveStream
}) => {
    useEffect(() => {
        if (!active || !selectedAudioInput || !navigator.mediaDevices?.getUserMedia) return;
        if (initialSetupInFlightRef.current && !stream) return;
        let cancelled = false;
        const startedAt = performance.now();

        const switchMicrophone = async () => {
            const signature = buildSignature(selectedAudioInput, audioProcessingMode);
            if (stream && currentInputDeviceIdRef.current === selectedAudioInput && appliedInputSignatureRef.current === signature) return;
            try {
                const inputStream = await requestInputStream(selectedAudioInput);
                if (cancelled) return stopStreamTracks(inputStream);
                const outgoingStream = await buildOutgoingStream(inputStream, selectedAudioInput);
                if (cancelled) {
                    if (outgoingStream !== inputStream) stopStreamTracks(outgoingStream);
                    stopStreamTracks(inputStream);
                    return;
                }
                applyActiveStream(outgoingStream, signature, selectedAudioInput);
                recordClientMetric('device_switch_succeeded', performance.now() - startedAt);
            } catch (error) {
                recordClientMetric('device_switch_failed', performance.now() - startedAt);
                console.error('Mic switch failed:', error);
            }
        };
        void switchMicrophone();
        return () => { cancelled = true; };
    }, [
        active, appliedInputSignatureRef, applyActiveStream, audioProcessingMode,
        buildOutgoingStream, currentInputDeviceIdRef, initialSetupInFlightRef,
        requestInputStream, selectedAudioInput, stream
    ]);
};
