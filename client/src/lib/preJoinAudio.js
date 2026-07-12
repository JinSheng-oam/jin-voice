import { createVoiceCaptureConstraints } from './audioDevices';
import { getCaptureProcessingOptions } from './audioProcessing';

const stopStream = (stream) => {
    stream?.getTracks?.().forEach((track) => track.stop());
};

export const getByteTimeDomainPeak = (samples) => {
    if (!samples?.length) return 0;

    let peak = 0;
    for (const sample of samples) {
        peak = Math.max(peak, Math.abs(sample - 128) / 128);
    }
    return peak;
};

export const startPreJoinMicCheck = async ({
    mediaDevices,
    AudioContextClass,
    deviceId = '',
    audioProcessingMode,
    onLevel,
    requestAnimationFrameImpl = globalThis.requestAnimationFrame,
    cancelAnimationFrameImpl = globalThis.cancelAnimationFrame
}) => {
    if (!mediaDevices?.getUserMedia || !AudioContextClass) {
        throw new Error('Microphone preview is unavailable.');
    }

    const stream = await mediaDevices.getUserMedia({
        audio: createVoiceCaptureConstraints({
            deviceId,
            ...getCaptureProcessingOptions(audioProcessingMode)
        }),
        video: false
    });

    let audioContext;
    let animationFrameId = null;
    let stopped = false;

    try {
        audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);

        const updateLevel = () => {
            if (stopped) return;
            analyser.getByteTimeDomainData(samples);
            onLevel?.(Math.min(100, Math.round(getByteTimeDomainPeak(samples) * 180)));
            animationFrameId = requestAnimationFrameImpl(updateLevel);
        };
        updateLevel();

        return {
            activeDeviceId: stream.getAudioTracks()[0]?.getSettings?.().deviceId || deviceId,
            stop: () => {
                if (stopped) return;
                stopped = true;
                if (animationFrameId !== null) cancelAnimationFrameImpl(animationFrameId);
                stopStream(stream);
                if (audioContext.state !== 'closed') void audioContext.close();
            }
        };
    } catch (error) {
        stopStream(stream);
        if (audioContext && audioContext.state !== 'closed') void audioContext.close();
        throw error;
    }
};
