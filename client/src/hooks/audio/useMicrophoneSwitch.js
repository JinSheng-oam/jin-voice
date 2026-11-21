import { useEffect } from 'react';
import { recordClientMetric } from '../../lib/telemetry';
import { buildInputSignature, stopStreamTracks } from './audioPipelineUtils';

export const useMicrophoneSwitch = ({
    active, selectedAudioInput, audioProcessingMode, microphoneEnhancementEnabled, stream,
    initialSetupInFlightRef, currentInputDeviceIdRef, appliedInputSignatureRef,
    requestInputStream, buildOutgoingStream, applyActiveStream
}) => {
    useEffect(() => {
        if (!active || !selectedAudioInput || !navigator.mediaDevices?.getUserMedia) return;
        if (initialSetupInFlightRef.current) return;
        let cancelled = false;
        const startedAt = performance.now();

        const switchMicrophone = async () => {
            const signature = buildInputSignature({
                deviceId: selectedAudioInput,
                audioProcessingMode,
                microphoneEnhancementEnabled
            });
            if (stream && currentInputDeviceIdRef.current === selectedAudioInput && appliedInputSignatureRef.current === signature) return;
            try {
                const inputStream = await requestInputStream(selectedAudioInput);
                if (cancelled) return stopStreamTracks(inputStream);
                const outgoingStream = await buildOutgoingStream(inputStream, () => !cancelled);
                if (cancelled || !outgoingStream) {
                    if (outgoingStream && outgoingStream !== inputStream) stopStreamTracks(outgoingStream);
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
        microphoneEnhancementEnabled, requestInputStream, selectedAudioInput, stream
    ]);
};
