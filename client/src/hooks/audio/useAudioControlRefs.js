import { useEffect, useRef } from 'react';

export const useAudioControlRefs = ({
    selectedAudioInput, selectedAudioOutput, voiceActivationEnabled, voiceActivationThreshold,
    pushToTalkEnabled, pushToTalkKey, voiceActivationOpenSensitivity,
    voiceActivationReleaseDelay, voiceActivationNoiseTolerance
}) => {
    const selectedAudioInputRef = useRef(selectedAudioInput);
    const selectedAudioOutputRef = useRef(selectedAudioOutput);
    const voiceActivationEnabledRef = useRef(voiceActivationEnabled);
    const voiceActivationThresholdRef = useRef(voiceActivationThreshold);
    const pushToTalkEnabledRef = useRef(pushToTalkEnabled);
    const pushToTalkKeyRef = useRef(pushToTalkKey || 'Space');
    const pushToTalkPressedRef = useRef(false);
    const voiceActivationOpenSensitivityRef = useRef(voiceActivationOpenSensitivity);
    const voiceActivationReleaseDelayRef = useRef(voiceActivationReleaseDelay);
    const voiceActivationNoiseToleranceRef = useRef(voiceActivationNoiseTolerance);

    useEffect(() => { selectedAudioInputRef.current = selectedAudioInput; }, [selectedAudioInput]);
    useEffect(() => { selectedAudioOutputRef.current = selectedAudioOutput; }, [selectedAudioOutput]);
    useEffect(() => { voiceActivationEnabledRef.current = voiceActivationEnabled; }, [voiceActivationEnabled]);
    useEffect(() => { voiceActivationThresholdRef.current = voiceActivationThreshold; }, [voiceActivationThreshold]);
    useEffect(() => {
        pushToTalkEnabledRef.current = pushToTalkEnabled;
        if (!pushToTalkEnabled) pushToTalkPressedRef.current = false;
    }, [pushToTalkEnabled]);
    useEffect(() => {
        pushToTalkKeyRef.current = pushToTalkKey || 'Space';
        pushToTalkPressedRef.current = false;
    }, [pushToTalkKey]);
    useEffect(() => { voiceActivationOpenSensitivityRef.current = voiceActivationOpenSensitivity; }, [voiceActivationOpenSensitivity]);
    useEffect(() => { voiceActivationReleaseDelayRef.current = voiceActivationReleaseDelay; }, [voiceActivationReleaseDelay]);
    useEffect(() => { voiceActivationNoiseToleranceRef.current = voiceActivationNoiseTolerance; }, [voiceActivationNoiseTolerance]);

    return {
        pushToTalkEnabledRef, pushToTalkKeyRef, pushToTalkPressedRef, selectedAudioInputRef,
        selectedAudioOutputRef, voiceActivationEnabledRef, voiceActivationNoiseToleranceRef,
        voiceActivationOpenSensitivityRef, voiceActivationReleaseDelayRef, voiceActivationThresholdRef
    };
};
