import { useCallback, useEffect, useRef, useState } from 'react';
import { createVoiceCaptureConstraints, enumerateAudioDevices, requestInitialAudioSetup } from '../lib/audioDevices';
import { adjustRemoteUserVolume, syncRemoteAudioOutputDevice, syncRemotePlaybackVolume } from '../lib/remoteAudio';
import { getVoiceTransmissionDecision, getNoiseGateConfig, getPlaybackGainValue } from '../lib/audioUtils';

const stopStreamTracks = (mediaStream) => {
    mediaStream?.getTracks().forEach((track) => track.stop());
};

const disconnectNode = (node) => {
    if (!node) return;

    try {
        node.disconnect();
    } catch {
        /* noop cleanup */
    }
};

const buildInputSignature = ({ deviceId }) => JSON.stringify({
    deviceId: deviceId || ''
});

const OUTGOING_MAKEUP_GAIN = 1.55;
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

const cloneTrackSettings = (sourceTrack, targetTrack, fallbackDeviceId = '') => {
    if (!sourceTrack || !targetTrack) return;

    const settings = sourceTrack.getSettings?.() || {};
    const deviceId = settings.deviceId || fallbackDeviceId || '';

    try {
        Object.defineProperty(targetTrack, 'getSettings', {
            configurable: true,
            value: () => ({
                ...settings,
                deviceId
            })
        });
    } catch {
        targetTrack.__jinvoiceSettings = {
            ...settings,
            deviceId
        };
    }
};

export const useLocalAudioPipeline = ({
    stream,
    setStream,
    myVideoRef,
    connectionRef,
    mediasoupClientRef,
    remoteAudioContextRef,
    remoteGainNodeRef,
    remoteAudiosRef,
    connectedPeer,
    isMuted,
    isDeafened,
    selectedAudioInput,
    selectedAudioOutput,
    microphoneEnhancementEnabled,
    noiseSuppressionEnabled,
    noiseSuppressionStrength,
    userVolumes,
    voiceActivationEnabled,
    voiceActivationThreshold,
    pushToTalkEnabled,
    pushToTalkKey,
    voiceActivationOpenSensitivity,
    voiceActivationReleaseDelay,
    voiceActivationNoiseTolerance,
    selfMonitorEnabled,
    selfMonitorVolume,
    setAudioDevices,
    setSelectedAudioInput,
    setSelectedAudioOutput,
    setMicVolume,
    setUserVolume
}) => {
    const [voiceTransmissionState, setVoiceTransmissionState] = useState('live');
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const analyserSourceRef = useRef(null);
    const analyserSinkRef = useRef(null);
    const volumeFrameRef = useRef(null);
    const lastMuteStateRef = useRef(null);
    const analyserStreamRef = useRef(null);
    const analyserInputStreamRef = useRef(null);
    const analyserResumeCleanupRef = useRef(null);
    const localMonitorAudioRef = useRef(null);
    const localMonitorStreamRef = useRef(null);
    const localMonitorSourceTrackIdRef = useRef('');
    const localMonitorUsesDedicatedStreamRef = useRef(false);
    const rawInputStreamRef = useRef(null);
    const activeOutgoingStreamRef = useRef(null);
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
    const micVolumePublishRef = useRef({ volume: 0, time: 0 });
    const liveMicVolumeRef = useRef(0);
    const lastVoiceDetectedAtRef = useRef(0);
    const currentInputDeviceIdRef = useRef('');
    const appliedInputSignatureRef = useRef('');
    const monitoringSetupVersionRef = useRef(0);
    const microphoneGainContextRef = useRef(null);
    const microphoneGainSourceRef = useRef(null);
    const microphoneGainNodeRef = useRef(null);
    const microphoneNoiseGateNodeRef = useRef(null);
    const microphoneNoiseAnalyserRef = useRef(null);
    const microphoneNoiseFrameRef = useRef(null);
    const microphoneNoiseDataRef = useRef(null);
    const microphoneGainDestinationRef = useRef(null);
    const microphoneGainSinkRef = useRef(null);
    const microphoneGainResumeCleanupRef = useRef(null);
    const streamRecoveryInFlightRef = useRef(false);
    const initialAudioSetupInFlightRef = useRef(false);

    useEffect(() => {
        selectedAudioInputRef.current = selectedAudioInput;
    }, [selectedAudioInput]);

    useEffect(() => {
        selectedAudioOutputRef.current = selectedAudioOutput;
    }, [selectedAudioOutput]);

    useEffect(() => {
        voiceActivationEnabledRef.current = voiceActivationEnabled;
    }, [voiceActivationEnabled]);

    useEffect(() => {
        voiceActivationThresholdRef.current = voiceActivationThreshold;
    }, [voiceActivationThreshold]);

    useEffect(() => {
        pushToTalkEnabledRef.current = pushToTalkEnabled;
        if (!pushToTalkEnabled) {
            pushToTalkPressedRef.current = false;
        }
    }, [pushToTalkEnabled]);

    useEffect(() => {
        pushToTalkKeyRef.current = pushToTalkKey || 'Space';
        pushToTalkPressedRef.current = false;
    }, [pushToTalkKey]);

    useEffect(() => {
        voiceActivationOpenSensitivityRef.current = voiceActivationOpenSensitivity;
    }, [voiceActivationOpenSensitivity]);

    useEffect(() => {
        voiceActivationReleaseDelayRef.current = voiceActivationReleaseDelay;
    }, [voiceActivationReleaseDelay]);

    useEffect(() => {
        voiceActivationNoiseToleranceRef.current = voiceActivationNoiseTolerance;
    }, [voiceActivationNoiseTolerance]);

    const refreshAudioDevices = useCallback(async () => {
        const { inputs, outputs } = await enumerateAudioDevices();
        setAudioDevices({ inputs, outputs });
        return { inputs, outputs };
    }, [setAudioDevices]);

    const requestInputStream = useCallback(async (deviceId = '') => {
        const preferredDeviceId = deviceId || selectedAudioInputRef.current || currentInputDeviceIdRef.current;

        return navigator.mediaDevices.getUserMedia({
            video: false,
            audio: createVoiceCaptureConstraints({
                deviceId: preferredDeviceId,
                echoCancellation: true
            })
        });
    }, []);

    const ensureLocalMonitorAudio = useCallback(() => {
        if (localMonitorAudioRef.current) {
            return localMonitorAudioRef.current;
        }

        const element = document.createElement('audio');
        element.autoplay = true;
        element.playsInline = true;
        element.style.display = 'none';
        document.body.appendChild(element);
        localMonitorAudioRef.current = element;
        return element;
    }, []);

    const stopLocalMonitorStream = useCallback(() => {
        stopStreamTracks(localMonitorStreamRef.current);
        localMonitorStreamRef.current = null;
        localMonitorSourceTrackIdRef.current = '';
        localMonitorUsesDedicatedStreamRef.current = false;

        if (localMonitorAudioRef.current) {
            localMonitorAudioRef.current.pause();
            localMonitorAudioRef.current.srcObject = null;
        }
    }, []);

    const cleanupMicrophoneGainPipeline = useCallback(() => {
        microphoneGainResumeCleanupRef.current?.();
        microphoneGainResumeCleanupRef.current = null;
        if (microphoneNoiseFrameRef.current) {
            cancelAnimationFrame(microphoneNoiseFrameRef.current);
            microphoneNoiseFrameRef.current = null;
        }
        disconnectNode(microphoneGainSourceRef.current);
        disconnectNode(microphoneGainNodeRef.current);
        disconnectNode(microphoneNoiseGateNodeRef.current);
        disconnectNode(microphoneNoiseAnalyserRef.current);
        disconnectNode(microphoneGainSinkRef.current);
        microphoneGainSourceRef.current = null;
        microphoneGainNodeRef.current = null;
        microphoneNoiseGateNodeRef.current = null;
        microphoneNoiseAnalyserRef.current = null;
        microphoneNoiseDataRef.current = null;
        microphoneGainDestinationRef.current = null;
        microphoneGainSinkRef.current = null;

        if (microphoneGainContextRef.current && microphoneGainContextRef.current.state !== 'closed') {
            microphoneGainContextRef.current.close().catch(() => {
                /* noop cleanup */
            });
        }

        microphoneGainContextRef.current = null;
    }, []);

    const stopVolumeMonitoring = useCallback(() => {
        if (volumeFrameRef.current) {
            cancelAnimationFrame(volumeFrameRef.current);
            volumeFrameRef.current = null;
        }

        analyserResumeCleanupRef.current?.();
        analyserResumeCleanupRef.current = null;

        disconnectNode(analyserSourceRef.current);
        disconnectNode(analyserSinkRef.current);
        stopStreamTracks(analyserInputStreamRef.current);
        analyserSourceRef.current = null;
        analyserSinkRef.current = null;
        analyserRef.current = null;
        analyserStreamRef.current = null;
        analyserInputStreamRef.current = null;
    }, []);

    const publishMicVolume = useCallback((nextVolume, force = false) => {
        liveMicVolumeRef.current = nextVolume;

        const now = performance.now();
        const previous = micVolumePublishRef.current;
        const changedEnough = Math.abs(nextVolume - previous.volume) >= 4;
        const staleEnough = now - previous.time >= 120;
        const zeroTransition = nextVolume === 0 && previous.volume !== 0;

        if (!force && !changedEnough && !staleEnough && !zeroTransition) {
            return;
        }

        micVolumePublishRef.current = { volume: nextVolume, time: now };
        setMicVolume(nextVolume);
    }, [setMicVolume]);

    const syncStreamMuteState = useCallback((activeStream, muted) => {
        activeStream?.getAudioTracks().forEach((track) => {
            track.enabled = !muted;
        });
    }, []);

    const syncLocalMonitorMuteState = useCallback((muted) => {
        localMonitorStreamRef.current?.getAudioTracks?.().forEach((track) => {
            track.enabled = !muted;
        });
    }, []);

    const syncSfuProducerPaused = useCallback((paused) => {
        const producer = mediasoupClientRef.current?.producer;
        if (!producer) return;

        if (paused && !producer.paused) {
            producer.pause();
        } else if (!paused && producer.paused) {
            producer.resume();
        }
    }, [mediasoupClientRef]);

    useEffect(() => {
        if (voiceActivationEnabled || pushToTalkEnabled) {
            return;
        }

        lastVoiceDetectedAtRef.current = 0;
        lastMuteStateRef.current = false;
        const timerId = window.setTimeout(() => {
            setVoiceTransmissionState(isMuted ? 'manual-muted' : 'live');
        }, 0);

        if (stream && !isMuted) {
            stream.getAudioTracks().forEach((track) => {
                track.enabled = true;
            });
        }

        syncLocalMonitorMuteState(isMuted);

        const msClient = mediasoupClientRef.current;
        if (msClient?.producer?.paused && !isMuted) {
            msClient.producer.resume();
        }

        return () => window.clearTimeout(timerId);
    }, [isMuted, mediasoupClientRef, pushToTalkEnabled, stream, syncLocalMonitorMuteState, voiceActivationEnabled]);

    const replacePeerAudioTrack = useCallback((currentStream) => {
        if (!connectionRef.current || connectionRef.current.destroyed) {
            return;
        }

        const audioTrack = currentStream?.getAudioTracks?.()[0];
        const peerStream = connectionRef.current.streams?.[0];
        const oldTrack = peerStream?.getAudioTracks?.()[0];

        if (audioTrack && oldTrack && peerStream) {
            connectionRef.current.replaceTrack(oldTrack, audioTrack, peerStream);
        }
    }, [connectionRef]);

    const attachPreviewStream = useCallback((currentStream) => {
        if (myVideoRef.current) {
            myVideoRef.current.srcObject = currentStream;
        }
    }, [myVideoRef]);

    const applyActiveStream = useCallback((nextStream, signature, fallbackDeviceId = '') => {
        // `stream` is the outgoing stream that feeds WebRTC/SFU.
        // Monitoring and ear-return must not use it as their source of truth.
        syncStreamMuteState(nextStream, isMuted);
        attachPreviewStream(nextStream);
        replacePeerAudioTrack(nextStream);
        activeOutgoingStreamRef.current = nextStream;

        const nextTrack = nextStream?.getAudioTracks?.()[0];
        currentInputDeviceIdRef.current = nextTrack?.getSettings?.().deviceId || fallbackDeviceId || '';
        appliedInputSignatureRef.current = signature;

        setStream((previousStream) => {
            const previousIsCurrentRawInput = previousStream && previousStream === rawInputStreamRef.current;
            if (previousStream && previousStream !== nextStream && !previousIsCurrentRawInput) {
                stopStreamTracks(previousStream);
            }
            return nextStream;
        });
    }, [attachPreviewStream, isMuted, replacePeerAudioTrack, setStream, syncStreamMuteState]);

    const buildOutgoingStream = useCallback(async (inputStream, fallbackDeviceId = '') => {
        // `rawInputStreamRef` is the stable source for metering and ear-return.
        // Any enhancement pipeline must preserve that separation, otherwise we reintroduce
        // the old class of bugs where ear-return works but the sent track is silent (or vice versa).
        cleanupMicrophoneGainPipeline();
        const previousRawInputStream = rawInputStreamRef.current;
        rawInputStreamRef.current = inputStream;

        if (previousRawInputStream && previousRawInputStream !== inputStream) {
            stopStreamTracks(previousRawInputStream);
        }

        const hasOutgoingProcessing = microphoneEnhancementEnabled || noiseSuppressionEnabled;
        if (!hasOutgoingProcessing) {
            return inputStream;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            return inputStream;
        }

        const microphoneGainContext = new AudioContextClass({ latencyHint: 'interactive' });
        microphoneGainContextRef.current = microphoneGainContext;

        const ensureMicrophoneGainContext = () => {
            if (microphoneGainContext.state !== 'suspended') return;

            microphoneGainContext.resume().catch(() => {
                /* wait for user interaction */
            });
        };

        ensureMicrophoneGainContext();

        const source = microphoneGainContext.createMediaStreamSource(inputStream);
        const gainNode = microphoneGainContext.createGain();
        const noiseGateNode = microphoneGainContext.createGain();
        const compressor = microphoneGainContext.createDynamicsCompressor();
        const destination = microphoneGainContext.createMediaStreamDestination();
        const silentSink = microphoneGainContext.createGain();

        gainNode.gain.value = microphoneEnhancementEnabled ? OUTGOING_MAKEUP_GAIN : 1;
        noiseGateNode.gain.value = 1;
        compressor.threshold.value = -24;
        compressor.knee.value = 12;
        compressor.ratio.value = 2.2;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.16;
        silentSink.gain.value = 0;

        source.connect(gainNode);
        gainNode.connect(noiseGateNode);

        if (microphoneEnhancementEnabled) {
            noiseGateNode.connect(compressor);
            compressor.connect(destination);
            compressor.connect(silentSink);
        } else {
            noiseGateNode.connect(destination);
            noiseGateNode.connect(silentSink);
        }

        silentSink.connect(microphoneGainContext.destination);

        microphoneGainSourceRef.current = source;
        microphoneGainNodeRef.current = gainNode;
        microphoneNoiseGateNodeRef.current = noiseGateNode;
        microphoneGainDestinationRef.current = destination;
        microphoneGainSinkRef.current = silentSink;

        if (noiseSuppressionEnabled) {
            const analyser = microphoneGainContext.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.62;
            const analyserData = new Float32Array(analyser.fftSize);
            const noiseGateConfig = getNoiseGateConfig(noiseSuppressionStrength);

            source.connect(analyser);
            microphoneNoiseAnalyserRef.current = analyser;
            microphoneNoiseDataRef.current = analyserData;

            const updateNoiseGate = () => {
                if (!microphoneNoiseAnalyserRef.current || !microphoneNoiseGateNodeRef.current) {
                    return;
                }

                analyser.getFloatTimeDomainData(analyserData);
                let sum = 0;
                for (let index = 0; index < analyserData.length; index += 1) {
                    sum += analyserData[index] * analyserData[index];
                }

                const rms = Math.sqrt(sum / analyserData.length);
                const db = 20 * Math.log10(Math.max(rms, 0.00001));
                const targetGain = db < noiseGateConfig.thresholdDb ? noiseGateConfig.floorGain : 1;
                noiseGateNode.gain.setTargetAtTime(
                    targetGain,
                    microphoneGainContext.currentTime,
                    targetGain < noiseGateNode.gain.value ? noiseGateConfig.release : noiseGateConfig.attack
                );

                microphoneNoiseFrameRef.current = requestAnimationFrame(updateNoiseGate);
            };

            updateNoiseGate();
        }

        window.addEventListener('pointerdown', ensureMicrophoneGainContext);
        window.addEventListener('keydown', ensureMicrophoneGainContext);
        window.addEventListener('touchstart', ensureMicrophoneGainContext);

        microphoneGainResumeCleanupRef.current = () => {
            window.removeEventListener('pointerdown', ensureMicrophoneGainContext);
            window.removeEventListener('keydown', ensureMicrophoneGainContext);
            window.removeEventListener('touchstart', ensureMicrophoneGainContext);
        };

        const sourceTrack = inputStream.getAudioTracks?.()[0];
        const targetTrack = destination.stream.getAudioTracks?.()[0];
        cloneTrackSettings(sourceTrack, targetTrack, fallbackDeviceId);

        return destination.stream;
    }, [
        cleanupMicrophoneGainPipeline,
        microphoneEnhancementEnabled,
        noiseSuppressionEnabled,
        noiseSuppressionStrength
    ]);

    useEffect(() => {
        const hasRawInputStream = Boolean(rawInputStreamRef.current);
        if (!hasRawInputStream) return;

        let cancelled = false;

        const rebuildOutgoingStream = async () => {
            try {
                const nextSignature = buildInputSignature({
                    deviceId: currentInputDeviceIdRef.current || selectedAudioInputRef.current
                });

                const outgoingStream = await buildOutgoingStream(
                    rawInputStreamRef.current,
                    currentInputDeviceIdRef.current || selectedAudioInputRef.current
                );

                if (cancelled) {
                    if (outgoingStream !== rawInputStreamRef.current) {
                        stopStreamTracks(outgoingStream);
                    }
                    return;
                }

                applyActiveStream(
                    outgoingStream,
                    nextSignature,
                    currentInputDeviceIdRef.current || selectedAudioInputRef.current
                );
            } catch (error) {
                console.error('Failed to rebuild outgoing microphone pipeline:', error);
            }
        };

        void rebuildOutgoingStream();

        return () => {
            cancelled = true;
        };
    }, [applyActiveStream, buildOutgoingStream, microphoneEnhancementEnabled, noiseSuppressionEnabled, noiseSuppressionStrength]);

    const recoverEndedStream = useCallback(async (reason = 'unknown') => {
        if (streamRecoveryInFlightRef.current || !navigator.mediaDevices?.getUserMedia) {
            return;
        }

        streamRecoveryInFlightRef.current = true;

        try {
            const fallbackDeviceId = currentInputDeviceIdRef.current || selectedAudioInputRef.current;
            const nextSignature = buildInputSignature({
                deviceId: fallbackDeviceId
            });
            const freshInputStream = await requestInputStream(fallbackDeviceId);
            const outgoingStream = await buildOutgoingStream(freshInputStream, fallbackDeviceId);
            applyActiveStream(outgoingStream, nextSignature, fallbackDeviceId);
            void reason;
        } catch (error) {
            console.error('[Audio] Failed to recover ended outgoing stream:', error);
        } finally {
            streamRecoveryInFlightRef.current = false;
        }
    }, [applyActiveStream, buildOutgoingStream, requestInputStream]);

    const syncVoiceActivationState = useCallback((volume, activeStream) => {
        if (!activeStream) return;

        const audioTrack = activeStream.getAudioTracks()[0];
        if (!audioTrack) return;

        const decision = getVoiceTransmissionDecision({
            isMuted,
            pushToTalkEnabled: pushToTalkEnabledRef.current,
            pushToTalkPressed: pushToTalkPressedRef.current,
            voiceActivationEnabled: voiceActivationEnabledRef.current,
            volume,
            previousMuted: lastMuteStateRef.current ?? false,
            lastVoiceDetectedAt: lastVoiceDetectedAtRef.current,
            now: performance.now(),
            voiceActivationThreshold: voiceActivationThresholdRef.current,
            voiceActivationOpenSensitivity: voiceActivationOpenSensitivityRef.current,
            voiceActivationReleaseDelay: voiceActivationReleaseDelayRef.current,
            voiceActivationNoiseTolerance: voiceActivationNoiseToleranceRef.current
        });
        const { shouldMuteOutput } = decision;
        lastVoiceDetectedAtRef.current = decision.lastVoiceDetectedAt;

        if (lastMuteStateRef.current === shouldMuteOutput) {
            if (audioTrack.enabled !== !shouldMuteOutput) {
                audioTrack.enabled = !shouldMuteOutput;
            }
            syncLocalMonitorMuteState(shouldMuteOutput);
            syncSfuProducerPaused(shouldMuteOutput);
            setVoiceTransmissionState(decision.state);
            return;
        }

        lastMuteStateRef.current = shouldMuteOutput;
        audioTrack.enabled = !shouldMuteOutput;
        syncLocalMonitorMuteState(shouldMuteOutput);
        setVoiceTransmissionState(decision.state);

        syncSfuProducerPaused(shouldMuteOutput);
    }, [isMuted, syncLocalMonitorMuteState, syncSfuProducerPaused]);

    useEffect(() => {
        if (!pushToTalkEnabled) {
            return undefined;
        }

        const desktopApi = window.jinvoiceDesktop;
        const isDesktopPushToTalk = Boolean(desktopApi?.isDesktop);

        const shouldIgnoreKeyboardEvent = (event) => {
            if (event.defaultPrevented) return true;
            const target = event.target;
            return target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR));
        };

        const syncPushToTalk = (pressed) => {
            if (pushToTalkPressedRef.current === pressed) return;
            pushToTalkPressedRef.current = pressed;
            syncVoiceActivationState(liveMicVolumeRef.current, stream || activeOutgoingStreamRef.current);
        };

        let removeDesktopListener = () => {};
        if (isDesktopPushToTalk) {
            desktopApi.setPushToTalkAccelerator?.(pushToTalkKeyRef.current).catch((error) => {
                console.warn('[Desktop] Failed to register push-to-talk accelerator:', error);
            });
            removeDesktopListener = desktopApi.onPushToTalkChange?.((pressed) => {
                syncPushToTalk(Boolean(pressed));
            }) || (() => {});
        }

        const onKeyDown = (event) => {
            if (isDesktopPushToTalk) return;
            if (event.code !== pushToTalkKeyRef.current || shouldIgnoreKeyboardEvent(event)) return;
            if (event.repeat) return;
            event.preventDefault();
            syncPushToTalk(true);
        };

        const onKeyUp = (event) => {
            if (isDesktopPushToTalk) return;
            if (event.code !== pushToTalkKeyRef.current) return;
            event.preventDefault();
            syncPushToTalk(false);
        };

        const onBlur = () => syncPushToTalk(false);
        const onVisibilityChange = () => {
            if (document.hidden) {
                syncPushToTalk(false);
            }
        };
        const onFullscreenChange = () => {
            if (
                document.fullscreenElement &&
                navigator.keyboard?.lock &&
                pushToTalkKeyRef.current
            ) {
                navigator.keyboard.lock([pushToTalkKeyRef.current]).catch(() => {
                    /* Keyboard Lock is optional and browser-dependent. */
                });
            }
        };

        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibilityChange);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        onFullscreenChange();
        syncVoiceActivationState(liveMicVolumeRef.current, stream || activeOutgoingStreamRef.current);

        return () => {
            syncPushToTalk(false);
            removeDesktopListener();
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('keyup', onKeyUp, true);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            navigator.keyboard?.unlock?.();
        };
    }, [pushToTalkEnabled, pushToTalkKey, stream, syncVoiceActivationState]);

    const setupVolumeMonitoring = useCallback((inputStream, outputStream = inputStream) => {
        const setupVersion = ++monitoringSetupVersionRef.current;
        stopVolumeMonitoring();

        const initMonitoring = async () => {
            try {
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
                }

                const audioContext = audioContextRef.current;
                const ensureAnalyserContext = () => {
                    if (audioContext.state !== 'suspended') return;

                    audioContext.resume().catch(() => {
                        /* wait for user interaction */
                    });
                };

                ensureAnalyserContext();

                const preferredDeviceId = selectedAudioInputRef.current || currentInputDeviceIdRef.current;
                let analyserInputStream = null;

                try {
                    analyserInputStream = await navigator.mediaDevices.getUserMedia({
                        video: false,
                        audio: createVoiceCaptureConstraints({
                            deviceId: preferredDeviceId,
                            echoCancellation: true
                        })
                    });
                } catch {
                    analyserInputStream = inputStream.clone();
                }

                if (setupVersion !== monitoringSetupVersionRef.current) {
                    stopStreamTracks(analyserInputStream);
                    return;
                }

                const source = audioContext.createMediaStreamSource(analyserInputStream);
                const analyser = audioContext.createAnalyser();
                const silentGain = audioContext.createGain();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.85;
                source.connect(analyser);
                analyser.connect(silentGain);
                silentGain.gain.value = 0;
                silentGain.connect(audioContext.destination);

                analyserSourceRef.current = source;
                analyserRef.current = analyser;
                analyserSinkRef.current = silentGain;
                analyserStreamRef.current = outputStream;
                analyserInputStreamRef.current = analyserInputStream;

                const cleanupInteractionResume = () => {
                    window.removeEventListener('pointerdown', ensureAnalyserContext);
                    window.removeEventListener('keydown', ensureAnalyserContext);
                    window.removeEventListener('touchstart', ensureAnalyserContext);
                };

                window.addEventListener('pointerdown', ensureAnalyserContext);
                window.addEventListener('keydown', ensureAnalyserContext);
                window.addEventListener('touchstart', ensureAnalyserContext);

                const dataArray = new Float32Array(analyser.fftSize);
                const checkVolume = () => {
                    if (!analyserRef.current) return;

                    const monitoredTrack = analyserInputStreamRef.current?.getAudioTracks?.()[0];
                    if (!monitoredTrack || monitoredTrack.readyState === 'ended' || monitoredTrack.muted) {
                        publishMicVolume(0);
                        volumeFrameRef.current = requestAnimationFrame(checkVolume);
                        return;
                    }

                    analyserRef.current.getFloatTimeDomainData(dataArray);

                    let sumSquares = 0;
                    for (const sample of dataArray) {
                        sumSquares += sample * sample;
                    }

                    const rms = Math.sqrt(sumSquares / dataArray.length);
                    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
                    const normalizedDb = Math.max(-60, Math.min(0, db));
                    const volume = Math.round(((normalizedDb + 60) / 60) * 100);
                    syncVoiceActivationState(volume, analyserStreamRef.current);
                    publishMicVolume(volume);
                    volumeFrameRef.current = requestAnimationFrame(checkVolume);
                };

                analyserResumeCleanupRef.current = cleanupInteractionResume;
                checkVolume();
            } catch (error) {
                console.warn('Audio analyser not available:', error);
            }
        };

        void initMonitoring();
    }, [publishMicVolume, stopVolumeMonitoring, syncVoiceActivationState]);

    useEffect(() => {
        if (!navigator.mediaDevices) {
            console.warn('navigator.mediaDevices not available - likely not HTTPS');
            return;
        }

        let isActive = true;

        const initAudio = async () => {
            initialAudioSetupInFlightRef.current = true;

            try {
                const inputSignature = buildInputSignature({
                    deviceId: selectedAudioInputRef.current
                });

                const { initialStream, activeInputDeviceId } = await requestInitialAudioSetup({
                    selectedAudioInput: selectedAudioInputRef.current,
                    selectedAudioOutput: selectedAudioOutputRef.current,
                    setAudioDevices,
                    setSelectedAudioInput,
                    setSelectedAudioOutput,
                    previewElementRef: myVideoRef
                });

                if (!isActive) {
                    stopStreamTracks(initialStream);
                    return;
                }

                const outgoingStream = await buildOutgoingStream(initialStream, activeInputDeviceId);

                if (!isActive) {
                    if (outgoingStream !== initialStream) {
                        stopStreamTracks(outgoingStream);
                    }
                    stopStreamTracks(initialStream);
                    return;
                }

                applyActiveStream(outgoingStream, inputSignature, activeInputDeviceId);
            } catch (error) {
                console.warn('Microphone access denied or not available:', error.message);

                try {
                    await refreshAudioDevices();
                    if (!isActive) return;
                } catch (enumerateError) {
                    console.error('Cannot enumerate devices:', enumerateError);
                }
            } finally {
                initialAudioSetupInFlightRef.current = false;
            }
        };

        const handleDeviceChange = async () => {
            if (!navigator.mediaDevices?.enumerateDevices) return;
            if (!isActive) return;
            await refreshAudioDevices();
        };

        initAudio();

        if (navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        }

        return () => {
            isActive = false;

            if (navigator.mediaDevices?.removeEventListener) {
                navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
            }
        };
    }, [
        applyActiveStream,
        buildOutgoingStream,
        myVideoRef,
        refreshAudioDevices,
        setAudioDevices,
        setSelectedAudioInput,
        setSelectedAudioOutput,
    ]);

    useEffect(() => {
        if (!selectedAudioInput || !navigator.mediaDevices?.getUserMedia) return;
        if (initialAudioSetupInFlightRef.current && !stream) return;

        let cancelled = false;

        const switchMicrophone = async () => {
            const nextSignature = buildInputSignature({
                deviceId: selectedAudioInput
            });

            const matchesSelectedInput =
                stream &&
                currentInputDeviceIdRef.current &&
                currentInputDeviceIdRef.current === selectedAudioInput;

            if (matchesSelectedInput && appliedInputSignatureRef.current === nextSignature) {
                return;
            }

            try {
                const currentStream = await requestInputStream(selectedAudioInput);

                if (cancelled) {
                    stopStreamTracks(currentStream);
                    return;
                }

                const outgoingStream = await buildOutgoingStream(currentStream, selectedAudioInput);

                if (cancelled) {
                    if (outgoingStream !== currentStream) {
                        stopStreamTracks(outgoingStream);
                    }
                    stopStreamTracks(currentStream);
                    return;
                }

                applyActiveStream(outgoingStream, nextSignature, selectedAudioInput);
            } catch (error) {
                console.error('Mic switch failed:', error);
            }
        };

        switchMicrophone();

        return () => {
            cancelled = true;
        };
    }, [
        selectedAudioInput,
        stream,
        applyActiveStream,
        buildOutgoingStream,
        requestInputStream
    ]);

    useEffect(() => {
        if (!stream) {
            stopVolumeMonitoring();
            publishMicVolume(0, true);
            return undefined;
        }

        setupVolumeMonitoring(rawInputStreamRef.current || stream, stream);

        return () => {
            stopVolumeMonitoring();
        };
    }, [publishMicVolume, setupVolumeMonitoring, stopVolumeMonitoring, stream]);

    useEffect(() => {
        const audioTrack = stream?.getAudioTracks?.()[0];
        activeOutgoingStreamRef.current = stream;

        if (!audioTrack) {
            return undefined;
        }

        if (audioTrack.readyState === 'ended') {
            void recoverEndedStream('track-already-ended');
            return undefined;
        }

        const handleEnded = () => {
            void recoverEndedStream('track-ended-event');
        };

        audioTrack.addEventListener('ended', handleEnded);

        return () => {
            audioTrack.removeEventListener('ended', handleEnded);
        };
    }, [recoverEndedStream, stream]);

    useEffect(() => {
        if (!stream) return;
        syncStreamMuteState(stream, isMuted);
    }, [isMuted, stream, syncStreamMuteState]);

    useEffect(() => {
        if (remoteAudioContextRef.current) {
            if (isDeafened) {
                remoteAudioContextRef.current.suspend().catch(() => { /* noop suspend */ });
            } else {
                remoteAudioContextRef.current.resume().catch(() => { /* noop resume */ });
            }
        }

        if (remoteGainNodeRef.current && connectedPeer) {
            remoteGainNodeRef.current.gain.value = isDeafened
                ? 0
                : getPlaybackGainValue(userVolumes[connectedPeer] ?? 100);
        }

        if (remoteAudiosRef.current?.size > 0) {
            remoteAudiosRef.current.forEach((userData, peerId) => {
                if (userData.audioElement) {
                    userData.audioElement.muted = isDeafened;
                }

                if (userData.audioElement?._gainNode) {
                    userData.audioElement._gainNode.gain.value = isDeafened
                        ? 0
                        : getPlaybackGainValue(userVolumes[peerId] ?? 100);
                }

                if (userData.gainNode) {
                    userData.gainNode.gain.value = isDeafened
                        ? 0
                        : getPlaybackGainValue(userVolumes[peerId] ?? 100);
                }
            });
        }
    }, [connectedPeer, isDeafened, remoteAudiosRef, remoteAudioContextRef, remoteGainNodeRef, userVolumes]);

    useEffect(() => {
        if (!selectedAudioOutput) return;

        void syncRemoteAudioOutputDevice({
            sinkId: selectedAudioOutput,
            remoteAudioContextRef,
            remoteAudiosRef
        });
    }, [selectedAudioOutput, remoteAudioContextRef, remoteAudiosRef]);

    useEffect(() => {
        syncRemotePlaybackVolume({
            userVolumes,
            connectedPeer,
            remoteGainNodeRef,
            remoteAudiosRef,
            remoteAudioContextRef
        });
    }, [connectedPeer, remoteAudiosRef, remoteAudioContextRef, remoteGainNodeRef, userVolumes]);

    useEffect(() => {
        const applyLocalMonitor = async () => {
            if (!selfMonitorEnabled) {
                stopLocalMonitorStream();
                return;
            }

            const hasOutgoingProcessing = microphoneEnhancementEnabled || noiseSuppressionEnabled;
            // Ear-return follows the processed send stream whenever processing is active,
            // so local monitoring stays close to what other members receive.
            const currentSourceStream = (!hasOutgoingProcessing && rawInputStreamRef.current)
                ? rawInputStreamRef.current
                : (stream || activeOutgoingStreamRef.current);
            const currentSourceTrack = currentSourceStream?.getAudioTracks?.()[0];

            if (!currentSourceTrack || currentSourceTrack.readyState === 'ended') {
                stopLocalMonitorStream();
                return;
            }

            const audioElement = ensureLocalMonitorAudio();
            if (selectedAudioOutput && typeof audioElement.setSinkId === 'function') {
                try {
                    await audioElement.setSinkId(selectedAudioOutput);
                } catch (error) {
                    console.warn('[Audio] Failed to set self-monitor output device:', error);
                }
            }

            const preferredMonitorTrackId = hasOutgoingProcessing
                ? currentSourceTrack.id
                : `dedicated:${selectedAudioInput || currentInputDeviceIdRef.current || currentSourceTrack.id}`;

            const canReuseExistingMonitor =
                localMonitorStreamRef.current &&
                localMonitorSourceTrackIdRef.current === preferredMonitorTrackId &&
                localMonitorStreamRef.current.getAudioTracks?.()[0]?.readyState !== 'ended';

            if (!canReuseExistingMonitor) {
                stopLocalMonitorStream();
                let monitorStream;

                if (!hasOutgoingProcessing) {
                    try {
                        monitorStream = await navigator.mediaDevices.getUserMedia({
                            video: false,
                            audio: createVoiceCaptureConstraints({
                                deviceId: selectedAudioInput || currentInputDeviceIdRef.current,
                                echoCancellation: false,
                                noiseSuppression: false,
                                autoGainControl: false
                            })
                        });
                        localMonitorUsesDedicatedStreamRef.current = true;
                    } catch {
                        monitorStream = currentSourceStream?.clone?.() || null;
                    }
                } else {
                    monitorStream = currentSourceStream?.clone?.() || null;
                }

                if (!monitorStream) {
                    return;
                }

                localMonitorStreamRef.current = monitorStream;
                localMonitorSourceTrackIdRef.current = preferredMonitorTrackId;
                audioElement.srcObject = monitorStream;
                syncLocalMonitorMuteState(isMuted || (voiceActivationEnabledRef.current && lastMuteStateRef.current === true));
            }

            audioElement.muted = false;
            audioElement.volume = Math.max(0, Math.min(1, selfMonitorVolume / 100));
            try {
                await audioElement.play();
            } catch {
                /* wait for user interaction */
            }
        };

        void applyLocalMonitor();

        return () => {
            if (!selfMonitorEnabled) {
                stopLocalMonitorStream();
            }
        };
    }, [
        ensureLocalMonitorAudio,
        isMuted,
        microphoneEnhancementEnabled,
        noiseSuppressionEnabled,
        selectedAudioInput,
        selectedAudioOutput,
        selfMonitorEnabled,
        selfMonitorVolume,
        stopLocalMonitorStream,
        stream,
        syncLocalMonitorMuteState
    ]);

    useEffect(() => {
        syncVoiceActivationState(liveMicVolumeRef.current, stream);
    }, [
        isMuted,
        pushToTalkEnabled,
        pushToTalkKey,
        stream,
        syncVoiceActivationState,
        voiceActivationEnabled,
        voiceActivationThreshold
    ]);

    useEffect(() => () => {
        stopVolumeMonitoring();
        cleanupMicrophoneGainPipeline();
        stopStreamTracks(rawInputStreamRef.current);
        stopStreamTracks(activeOutgoingStreamRef.current);
        publishMicVolume(0, true);
        if (myVideoRef.current) {
            myVideoRef.current.srcObject = null;
        }
        const monitorAudio = localMonitorAudioRef.current;
        stopLocalMonitorStream();
        if (monitorAudio) {
            monitorAudio.remove();
            localMonitorAudioRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {
                /* noop cleanup */
            });
            audioContextRef.current = null;
        }
    }, [cleanupMicrophoneGainPipeline, myVideoRef, publishMicVolume, stopLocalMonitorStream, stopVolumeMonitoring]);

    const adjustUserVolume = (userId, volume) => {
        setUserVolume(userId, volume);
        adjustRemoteUserVolume({
            userId,
            volume,
            connectedPeer,
            remoteGainNodeRef,
            remoteAudiosRef,
            remoteAudioContextRef
        });
    };

    return {
        audioContextRef,
        adjustUserVolume,
        voiceTransmissionState
    };
};
