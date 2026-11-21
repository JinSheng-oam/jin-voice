const splitDevices = (deviceInfos) => ({
    inputs: deviceInfos.filter((device) => device.kind === 'audioinput'),
    outputs: deviceInfos.filter((device) => device.kind === 'audiooutput')
});

const getTrackDeviceId = (mediaStream) => {
    const audioTrack = mediaStream?.getAudioTracks?.()[0];
    return audioTrack?.getSettings?.().deviceId || '';
};

export const createVoiceCaptureConstraints = ({
    deviceId = '',
    echoCancellation = true,
    noiseSuppression = true,
    autoGainControl = true
} = {}) => ({
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation,
    noiseSuppression,
    autoGainControl,
    sampleRate: 48000,
    sampleSize: 16,
    channelCount: 1,
    latency: {
        ideal: 0.01,
        max: 0.05
    }
});

export const enumerateAudioDevices = async () => {
    const deviceInfos = await navigator.mediaDevices.enumerateDevices();
    return splitDevices(deviceInfos);
};

export const requestInitialAudioSetup = async ({
    selectedAudioInput,
    selectedAudioOutput,
    captureProcessingOptions,
    setAudioDevices,
    setAudioDeviceNotice,
    setSelectedAudioInput,
    setSelectedAudioOutput,
    previewElementRef
}) => {
    let initialStream = null;
    let fellBackToDefaultInput = false;

    try {
        initialStream = await navigator.mediaDevices.getUserMedia({
            audio: createVoiceCaptureConstraints({
                deviceId: selectedAudioInput,
                ...captureProcessingOptions
            }),
            video: false
        });
    } catch (error) {
        if (!selectedAudioInput) {
            throw error;
        }
        initialStream = await navigator.mediaDevices.getUserMedia({
            audio: createVoiceCaptureConstraints({
                deviceId: '',
                ...captureProcessingOptions
            }),
            video: false
        });
        fellBackToDefaultInput = true;
    }

    if (previewElementRef?.current) {
        previewElementRef.current.srcObject = initialStream;
    }

    const { inputs, outputs } = await enumerateAudioDevices();
    setAudioDevices({ inputs, outputs });

    const activeInputDeviceId = getTrackDeviceId(initialStream) || (fellBackToDefaultInput ? '' : selectedAudioInput) || inputs[0]?.deviceId || '';

    if (fellBackToDefaultInput) {
        const fallbackDeviceId = activeInputDeviceId || inputs[0]?.deviceId || '';
        setSelectedAudioInput(fallbackDeviceId);
        setAudioDeviceNotice?.({
            type: 'warning',
            message: '原麦克风不可用，已自动切换到可用输入设备。',
            id: Date.now()
        });
    } else if (inputs.length > 0 && !selectedAudioInput) {
        setSelectedAudioInput(inputs[0].deviceId);
    }

    if (outputs.length > 0 && !selectedAudioOutput) {
        setSelectedAudioOutput(outputs[0].deviceId);
    }

    return {
        initialStream,
        inputs,
        outputs,
        activeInputDeviceId
    };
};
