import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createVoiceCaptureConstraints, enumerateAudioDevices, requestInitialAudioSetup } from '../lib/audioDevices';
import {
    AUDIO_PROCESSING_MODES,
    getAiInputFormatIssue,
    getAudioLevelMetrics,
    getCaptureProcessingOptions,
    loadAiNoiseSuppressionModule,
    sanitizeAudioProcessingMode,
    supportsAiNoiseSuppression
} from '../lib/audioProcessing';
import { adjustRemoteUserVolume } from '../lib/remoteAudio';
import { configureVoiceLimiter, getVoiceTransmissionDecision } from '../lib/audioUtils';
import { useAudioControlRefs } from './audio/useAudioControlRefs';
import { useAudioProcessingStatus } from './audio/useAudioProcessingStatus';
import { useRemoteAudioPlayback } from './audio/useRemoteAudioPlayback';

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

const buildInputSignature = ({ deviceId, audioProcessingMode }) => JSON.stringify({
    deviceId: deviceId || '',
    audioProcessingMode: sanitizeAudioProcessingMode(audioProcessingMode)
});

const OUTGOING_MAKEUP_GAIN = 1.25;
const STREAM_RECOVERY_MIN_INTERVAL_MS = 1500;
const STREAM_RECOVERY_MAX_BACKOFF_MS = 10000;
const MUTED_TRACK_RECOVERY_DELAY_MS = 1800;
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const createEmptyAudioLevelHealth = () => ({
    rawVolume: 0,
    processedVolume: 0,
    rawPeak: 0,
    processedPeak: 0,
    rawClipFrames: 0,
    processedClipFrames: 0,
    lastUpdatedAt: 0
});

const getTrackDiagnostics = (track) => {
    if (!track) return null;

    return {
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: typeof track.getSettings === 'function' ? track.getSettings() : null
    };
};

export const useLocalAudioPipeline = ({
    audioSessionActive,
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
    audioProcessingMode,
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
    const voiceAnalyserRef = useRef(null);
    const voiceAnalyserSourceRef = useRef(null);
    const voiceAnalyserInputStreamRef = useRef(null);
    const volumeFrameRef = useRef(null);
    const lastMuteStateRef = useRef(null);
    const analyserStreamRef = useRef(null);
    const analyserInputStreamRef = useRef(null);
    const analyserResumeCleanupRef = useRef(null);
    const localMonitorAudioRef = useRef(null);
    const localMonitorStreamRef = useRef(null);
    const localMonitorSourceTrackIdRef = useRef('');
    const rawInputStreamRef = useRef(null);
    const activeOutgoingStreamRef = useRef(null);
    const {
        pushToTalkEnabledRef, pushToTalkKeyRef, pushToTalkPressedRef, selectedAudioInputRef,
        selectedAudioOutputRef, voiceActivationEnabledRef, voiceActivationNoiseToleranceRef,
        voiceActivationOpenSensitivityRef, voiceActivationReleaseDelayRef, voiceActivationThresholdRef
    } = useAudioControlRefs({
        selectedAudioInput, selectedAudioOutput, voiceActivationEnabled, voiceActivationThreshold,
        pushToTalkEnabled, pushToTalkKey, voiceActivationOpenSensitivity,
        voiceActivationReleaseDelay, voiceActivationNoiseTolerance
    });
    const micVolumePublishRef = useRef({ volume: 0, time: 0 });
    const liveMicVolumeRef = useRef(0);
    const liveVoiceVolumeRef = useRef(0);
    const audioLevelHealthRef = useRef(createEmptyAudioLevelHealth());
    const lastVoiceDetectedAtRef = useRef(0);
    const currentInputDeviceIdRef = useRef('');
    const appliedInputSignatureRef = useRef('');
    const monitoringSetupVersionRef = useRef(0);
    const microphoneGainContextRef = useRef(null);
    const microphoneGainSourceRef = useRef(null);
    const microphoneGainNodeRef = useRef(null);
    const microphoneCompressorRef = useRef(null);
    const microphoneLimiterRef = useRef(null);
    const microphoneGainDestinationRef = useRef(null);
    const microphoneGainSinkRef = useRef(null);
    const microphoneGainResumeCleanupRef = useRef(null);
    const aiNoiseSuppressionProcessorRef = useRef(null);
    const { audioProcessingRuntimeRef, audioProcessingStatus, updateAudioProcessingStatus } =
        useAudioProcessingStatus(audioProcessingMode);
    const mutedTrackRecoveryTimerRef = useRef(null);
    const streamRecoveryInFlightRef = useRef(false);
    const streamRecoveryMetaRef = useRef({
        attempts: 0,
        lastReason: null,
        lastError: null,
        lastStartedAt: 0,
        lastSucceededAt: 0,
        lastFailedAt: 0,
        nextAllowedAt: 0,
        lastLoggedAt: 0
    });
    const initialAudioSetupInFlightRef = useRef(false);
    const audioSessionActiveRef = useRef(audioSessionActive);

    useEffect(() => {
        audioSessionActiveRef.current = audioSessionActive;
    }, [audioSessionActive]);

    const refreshAudioDevices = useCallback(async () => {
        const { inputs, outputs } = await enumerateAudioDevices();
        setAudioDevices({ inputs, outputs });
        return { inputs, outputs };
    }, [setAudioDevices]);

    const requestInputStream = useCallback(async (deviceId = '') => {
        const preferredDeviceId = deviceId || selectedAudioInputRef.current || currentInputDeviceIdRef.current;
        const captureProcessingOptions = getCaptureProcessingOptions(audioProcessingMode);

        return navigator.mediaDevices.getUserMedia({
            video: false,
            audio: createVoiceCaptureConstraints({
                deviceId: preferredDeviceId,
                ...captureProcessingOptions
            })
        });
    }, [audioProcessingMode, selectedAudioInputRef]);

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

        if (localMonitorAudioRef.current) {
            localMonitorAudioRef.current.pause();
            localMonitorAudioRef.current.srcObject = null;
        }
    }, []);

    const cleanupMicrophoneGainPipeline = useCallback(() => {
        microphoneGainResumeCleanupRef.current?.();
        microphoneGainResumeCleanupRef.current = null;
        disconnectNode(microphoneGainSourceRef.current);
        disconnectNode(microphoneGainNodeRef.current);
        disconnectNode(microphoneCompressorRef.current);
        disconnectNode(microphoneLimiterRef.current);
        disconnectNode(microphoneGainSinkRef.current);
        microphoneGainSourceRef.current = null;
        microphoneGainNodeRef.current = null;
        microphoneCompressorRef.current = null;
        microphoneLimiterRef.current = null;
        microphoneGainDestinationRef.current = null;
        microphoneGainSinkRef.current = null;

        if (microphoneGainContextRef.current && microphoneGainContextRef.current.state !== 'closed') {
            microphoneGainContextRef.current.close().catch(() => {
                /* noop cleanup */
            });
        }

        microphoneGainContextRef.current = null;
    }, []);

    const cleanupAiNoiseSuppression = useCallback(() => {
        const processor = aiNoiseSuppressionProcessorRef.current;
        aiNoiseSuppressionProcessorRef.current = null;

        try {
            processor?.stopProcessing?.();
        } catch {
            /* noop cleanup */
        }
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
        disconnectNode(voiceAnalyserSourceRef.current);
        stopStreamTracks(analyserInputStreamRef.current);
        stopStreamTracks(voiceAnalyserInputStreamRef.current);
        analyserSourceRef.current = null;
        analyserSinkRef.current = null;
        analyserRef.current = null;
        voiceAnalyserRef.current = null;
        voiceAnalyserSourceRef.current = null;
        voiceAnalyserInputStreamRef.current = null;
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

        const rawTrack = rawInputStreamRef.current?.getAudioTracks?.()[0];
        currentInputDeviceIdRef.current = rawTrack?.getSettings?.().deviceId || fallbackDeviceId || '';
        appliedInputSignatureRef.current = signature;

        setStream((previousStream) => {
            const previousIsCurrentRawInput = previousStream && previousStream === rawInputStreamRef.current;
            if (previousStream && previousStream !== nextStream && !previousIsCurrentRawInput) {
                stopStreamTracks(previousStream);
            }
            return nextStream;
        });
    }, [attachPreviewStream, isMuted, replacePeerAudioTrack, setStream, syncStreamMuteState]);

    const buildOutgoingStream = useCallback(async (inputStream) => {
        // `rawInputStreamRef` is the stable source for metering and ear-return.
        // Any enhancement pipeline must preserve that separation, otherwise we reintroduce
        // the old class of bugs where ear-return works but the sent track is silent (or vice versa).
        const previousRawInputStream = rawInputStreamRef.current;
        const requestedMode = sanitizeAudioProcessingMode(audioProcessingMode);
        const aiSupported = supportsAiNoiseSuppression();
        const sourceTrack = inputStream.getAudioTracks?.()[0];
        let processingSourceStream = inputStream;
        let effectiveMode = requestedMode;
        let fallbackReason = null;
        let lastError = null;
        let nextAiProcessor = null;

        if (requestedMode === AUDIO_PROCESSING_MODES.AI) {
            if (!aiSupported) {
                effectiveMode = AUDIO_PROCESSING_MODES.STANDARD;
                fallbackReason = '当前浏览器不支持 AI 音轨处理，已回退到标准降噪';
            } else if (!sourceTrack) {
                effectiveMode = AUDIO_PROCESSING_MODES.STANDARD;
                fallbackReason = '麦克风音轨不可用，已回退到标准降噪';
            } else {
                let processor = null;

                try {
                    updateAudioProcessingStatus({ status: 'loading' });
                    if (sourceTrack.applyConstraints) {
                        await sourceTrack.applyConstraints({
                            sampleRate: { exact: 48000 },
                            channelCount: { exact: 1 }
                        });
                    }

                    const formatIssue = getAiInputFormatIssue(sourceTrack.getSettings?.() || {});
                    if (formatIssue) throw new Error(formatIssue);

                    const { NoiseSuppressionProcessor } = await loadAiNoiseSuppressionModule();
                    if (!NoiseSuppressionProcessor.isSupported()) {
                        throw new Error('MediaStreamTrack Insertable Streams is unavailable');
                    }

                    processor = new NoiseSuppressionProcessor();
                    const processedTrack = await processor.startProcessing(sourceTrack);
                    if (!processedTrack || processedTrack.readyState === 'ended') {
                        throw new Error('RNNoise returned an unavailable audio track');
                    }

                    nextAiProcessor = processor;
                    processingSourceStream = new MediaStream([processedTrack]);
                } catch (error) {
                    try {
                        processor?.stopProcessing?.();
                    } catch {
                        /* noop cleanup */
                    }

                    effectiveMode = AUDIO_PROCESSING_MODES.STANDARD;
                    lastError = error?.message || String(error);
                    fallbackReason = 'AI 降噪初始化失败，已回退到标准降噪';
                    console.warn('[Audio] RNNoise unavailable, using browser noise suppression:', error);
                }
            }

            if (effectiveMode === AUDIO_PROCESSING_MODES.STANDARD && sourceTrack?.applyConstraints) {
                try {
                    await sourceTrack.applyConstraints(createVoiceCaptureConstraints({
                        ...getCaptureProcessingOptions(AUDIO_PROCESSING_MODES.STANDARD)
                    }));
                } catch (error) {
                    lastError = lastError || error?.message || String(error);
                }
            }
        }

        // Keep the previous outgoing chain alive while the lazy RNNoise module initializes.
        // Tear it down only after the replacement track is ready to minimize audible gaps.
        cleanupMicrophoneGainPipeline();
        cleanupAiNoiseSuppression();
        aiNoiseSuppressionProcessorRef.current = nextAiProcessor;
        rawInputStreamRef.current = inputStream;

        if (previousRawInputStream && previousRawInputStream !== inputStream) {
            stopStreamTracks(previousRawInputStream);
        }

        updateAudioProcessingStatus({
            requestedMode,
            effectiveMode,
            status: fallbackReason ? 'fallback' : 'active',
            aiSupported,
            fallbackReason,
            lastError
        });

        if (!microphoneEnhancementEnabled) {
            return processingSourceStream;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            return processingSourceStream;
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

        const source = microphoneGainContext.createMediaStreamSource(processingSourceStream);
        const gainNode = microphoneGainContext.createGain();
        const compressor = microphoneGainContext.createDynamicsCompressor();
        const limiter = microphoneGainContext.createDynamicsCompressor();
        const destination = microphoneGainContext.createMediaStreamDestination();
        const silentSink = microphoneGainContext.createGain();

        gainNode.gain.value = OUTGOING_MAKEUP_GAIN;
        compressor.threshold.value = -18;
        compressor.knee.value = 8;
        compressor.ratio.value = 2;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.14;
        configureVoiceLimiter(limiter);
        silentSink.gain.value = 0;

        source.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(limiter);
        limiter.connect(destination);
        limiter.connect(silentSink);

        silentSink.connect(microphoneGainContext.destination);

        microphoneGainSourceRef.current = source;
        microphoneGainNodeRef.current = gainNode;
        microphoneCompressorRef.current = compressor;
        microphoneLimiterRef.current = limiter;
        microphoneGainDestinationRef.current = destination;
        microphoneGainSinkRef.current = silentSink;

        window.addEventListener('pointerdown', ensureMicrophoneGainContext);
        window.addEventListener('keydown', ensureMicrophoneGainContext);
        window.addEventListener('touchstart', ensureMicrophoneGainContext);

        microphoneGainResumeCleanupRef.current = () => {
            window.removeEventListener('pointerdown', ensureMicrophoneGainContext);
            window.removeEventListener('keydown', ensureMicrophoneGainContext);
            window.removeEventListener('touchstart', ensureMicrophoneGainContext);
        };

        return destination.stream;
    }, [
        audioProcessingMode,
        cleanupAiNoiseSuppression,
        cleanupMicrophoneGainPipeline,
        microphoneEnhancementEnabled,
        updateAudioProcessingStatus
    ]);

    const applyInitialAudioStream = useEffectEvent(async (
        initialStream,
        inputSignature,
        activeInputDeviceId,
        isStillActive
    ) => {
        const outgoingStream = await buildOutgoingStream(initialStream, activeInputDeviceId);

        if (!isStillActive()) {
            if (outgoingStream !== initialStream) {
                stopStreamTracks(outgoingStream);
            }
            stopStreamTracks(initialStream);
            return;
        }

        applyActiveStream(outgoingStream, inputSignature, activeInputDeviceId);
    });

    const recoverEndedStream = useCallback(async (reason = 'unknown') => {
        if (
            !audioSessionActiveRef.current ||
            streamRecoveryInFlightRef.current ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            return;
        }

        const now = performance.now();
        const recoveryMeta = streamRecoveryMetaRef.current;
        if (now < recoveryMeta.nextAllowedAt) {
            return;
        }

        streamRecoveryInFlightRef.current = true;
        updateAudioProcessingStatus({ status: 'recovering' });
        streamRecoveryMetaRef.current = {
            ...recoveryMeta,
            attempts: recoveryMeta.attempts + 1,
            lastReason: reason,
            lastStartedAt: now,
            nextAllowedAt: now + STREAM_RECOVERY_MIN_INTERVAL_MS
        };

        try {
            const fallbackDeviceId = currentInputDeviceIdRef.current || selectedAudioInputRef.current;
            const nextSignature = buildInputSignature({
                deviceId: fallbackDeviceId,
                audioProcessingMode
            });
            const freshInputStream = await requestInputStream(fallbackDeviceId);
            const outgoingStream = await buildOutgoingStream(freshInputStream, fallbackDeviceId);
            applyActiveStream(outgoingStream, nextSignature, fallbackDeviceId);
            const succeededAt = performance.now();
            streamRecoveryMetaRef.current = {
                ...streamRecoveryMetaRef.current,
                attempts: 0,
                lastError: null,
                lastSucceededAt: succeededAt,
                nextAllowedAt: succeededAt + STREAM_RECOVERY_MIN_INTERVAL_MS
            };
        } catch (error) {
            const failedAt = performance.now();
            const attempts = streamRecoveryMetaRef.current.attempts;
            const backoff = Math.min(
                STREAM_RECOVERY_MAX_BACKOFF_MS,
                STREAM_RECOVERY_MIN_INTERVAL_MS * (2 ** Math.min(attempts, 3))
            );
            const shouldLog = failedAt - streamRecoveryMetaRef.current.lastLoggedAt > 5000;
            streamRecoveryMetaRef.current = {
                ...streamRecoveryMetaRef.current,
                lastError: error?.message || String(error),
                lastFailedAt: failedAt,
                nextAllowedAt: failedAt + backoff,
                lastLoggedAt: shouldLog ? failedAt : streamRecoveryMetaRef.current.lastLoggedAt
            };
            if (shouldLog) {
                console.error('[Audio] Failed to recover ended outgoing stream:', error);
            }
            updateAudioProcessingStatus({
                status: 'error',
                lastError: error?.message || String(error)
            });
        } finally {
            streamRecoveryInFlightRef.current = false;
        }
    }, [applyActiveStream, audioProcessingMode, buildOutgoingStream, requestInputStream, selectedAudioInputRef, updateAudioProcessingStatus]);

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
    }, [
        isMuted, pushToTalkEnabledRef, pushToTalkPressedRef, syncLocalMonitorMuteState,
        syncSfuProducerPaused, voiceActivationEnabledRef, voiceActivationNoiseToleranceRef,
        voiceActivationOpenSensitivityRef, voiceActivationReleaseDelayRef, voiceActivationThresholdRef
    ]);

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
            syncVoiceActivationState(liveVoiceVolumeRef.current, stream || activeOutgoingStreamRef.current);
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
        syncVoiceActivationState(liveVoiceVolumeRef.current, stream || activeOutgoingStreamRef.current);

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
    }, [pushToTalkEnabled, pushToTalkKey, pushToTalkKeyRef, pushToTalkPressedRef, stream, syncVoiceActivationState]);

    const setupVolumeMonitoring = useCallback((inputStream, outputStream = inputStream) => {
        const setupVersion = ++monitoringSetupVersionRef.current;
        stopVolumeMonitoring();
        audioLevelHealthRef.current = createEmptyAudioLevelHealth();

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

                const analyserInputStream = inputStream.clone();
                const voiceAnalyserInputStream = outputStream.clone();

                if (setupVersion !== monitoringSetupVersionRef.current) {
                    stopStreamTracks(analyserInputStream);
                    stopStreamTracks(voiceAnalyserInputStream);
                    return;
                }

                const source = audioContext.createMediaStreamSource(analyserInputStream);
                const analyser = audioContext.createAnalyser();
                const voiceSource = audioContext.createMediaStreamSource(voiceAnalyserInputStream);
                const voiceAnalyser = audioContext.createAnalyser();
                const silentGain = audioContext.createGain();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.85;
                voiceAnalyser.fftSize = 1024;
                voiceAnalyser.smoothingTimeConstant = 0.72;
                source.connect(analyser);
                analyser.connect(silentGain);
                voiceSource.connect(voiceAnalyser);
                voiceAnalyser.connect(silentGain);
                silentGain.gain.value = 0;
                silentGain.connect(audioContext.destination);

                analyserSourceRef.current = source;
                analyserRef.current = analyser;
                voiceAnalyserSourceRef.current = voiceSource;
                voiceAnalyserRef.current = voiceAnalyser;
                analyserSinkRef.current = silentGain;
                analyserStreamRef.current = outputStream;
                analyserInputStreamRef.current = analyserInputStream;
                voiceAnalyserInputStreamRef.current = voiceAnalyserInputStream;

                const cleanupInteractionResume = () => {
                    window.removeEventListener('pointerdown', ensureAnalyserContext);
                    window.removeEventListener('keydown', ensureAnalyserContext);
                    window.removeEventListener('touchstart', ensureAnalyserContext);
                };

                window.addEventListener('pointerdown', ensureAnalyserContext);
                window.addEventListener('keydown', ensureAnalyserContext);
                window.addEventListener('touchstart', ensureAnalyserContext);

                const dataArray = new Float32Array(analyser.fftSize);
                const voiceDataArray = new Float32Array(voiceAnalyser.fftSize);
                let lastSampleAt = 0;
                const checkVolume = (timestamp = performance.now()) => {
                    if (!analyserRef.current || !voiceAnalyserRef.current) return;

                    if (timestamp - lastSampleAt < 32) {
                        volumeFrameRef.current = requestAnimationFrame(checkVolume);
                        return;
                    }
                    lastSampleAt = timestamp;

                    const monitoredTrack = analyserInputStreamRef.current?.getAudioTracks?.()[0];
                    if (!monitoredTrack || monitoredTrack.readyState === 'ended' || monitoredTrack.muted) {
                        liveVoiceVolumeRef.current = 0;
                        syncVoiceActivationState(0, analyserStreamRef.current);
                        publishMicVolume(0);
                        volumeFrameRef.current = requestAnimationFrame(checkVolume);
                        return;
                    }

                    analyserRef.current.getFloatTimeDomainData(dataArray);
                    voiceAnalyserRef.current.getFloatTimeDomainData(voiceDataArray);

                    const rawMetrics = getAudioLevelMetrics(dataArray);
                    const processedMetrics = getAudioLevelMetrics(voiceDataArray);
                    liveVoiceVolumeRef.current = processedMetrics.volume;
                    audioLevelHealthRef.current = {
                        rawVolume: rawMetrics.volume,
                        processedVolume: processedMetrics.volume,
                        rawPeak: rawMetrics.peak,
                        processedPeak: processedMetrics.peak,
                        rawClipFrames: audioLevelHealthRef.current.rawClipFrames + (rawMetrics.clipped ? 1 : 0),
                        processedClipFrames: audioLevelHealthRef.current.processedClipFrames + (processedMetrics.clipped ? 1 : 0),
                        lastUpdatedAt: performance.now()
                    };

                    syncVoiceActivationState(processedMetrics.volume, analyserStreamRef.current);
                    publishMicVolume(rawMetrics.volume);
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
        if (!audioSessionActive) {
            return undefined;
        }

        if (!navigator.mediaDevices) {
            console.warn('navigator.mediaDevices not available - likely not HTTPS');
            return;
        }

        let isActive = true;

        const initAudio = async () => {
            initialAudioSetupInFlightRef.current = true;

            try {
                const inputSignature = buildInputSignature({
                    deviceId: selectedAudioInputRef.current,
                    audioProcessingMode
                });

                const { initialStream, activeInputDeviceId } = await requestInitialAudioSetup({
                    selectedAudioInput: selectedAudioInputRef.current,
                    selectedAudioOutput: selectedAudioOutputRef.current,
                    captureProcessingOptions: getCaptureProcessingOptions(audioProcessingMode),
                    setAudioDevices,
                    setSelectedAudioInput,
                    setSelectedAudioOutput,
                    previewElementRef: myVideoRef
                });

                if (!isActive) {
                    stopStreamTracks(initialStream);
                    return;
                }

                await applyInitialAudioStream(
                    initialStream,
                    inputSignature,
                    activeInputDeviceId,
                    () => isActive
                );
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
        myVideoRef,
        refreshAudioDevices,
        setAudioDevices,
        setSelectedAudioInput,
        setSelectedAudioOutput,
        selectedAudioInputRef,
        selectedAudioOutputRef,
        audioSessionActive,
        audioProcessingMode,
        microphoneEnhancementEnabled,
    ]);

    useEffect(() => {
        if (audioSessionActive) return;

        monitoringSetupVersionRef.current += 1;
        stopVolumeMonitoring();
        cleanupMicrophoneGainPipeline();
        cleanupAiNoiseSuppression();
        stopLocalMonitorStream();
        stopStreamTracks(rawInputStreamRef.current);
        if (activeOutgoingStreamRef.current !== rawInputStreamRef.current) {
            stopStreamTracks(activeOutgoingStreamRef.current);
        }
        rawInputStreamRef.current = null;
        activeOutgoingStreamRef.current = null;
        currentInputDeviceIdRef.current = '';
        appliedInputSignatureRef.current = '';
        initialAudioSetupInFlightRef.current = false;
        updateAudioProcessingStatus({ effectiveMode: 'idle', status: 'idle' });
        publishMicVolume(0, true);
        if (stream) {
            setStream(null);
        }
        if (myVideoRef.current) {
            myVideoRef.current.srcObject = null;
        }
    }, [
        audioSessionActive,
        cleanupAiNoiseSuppression,
        cleanupMicrophoneGainPipeline,
        myVideoRef,
        publishMicVolume,
        setStream,
        stopLocalMonitorStream,
        stopVolumeMonitoring,
        stream,
        updateAudioProcessingStatus
    ]);

    useEffect(() => {
        if (!audioSessionActive || !selectedAudioInput || !navigator.mediaDevices?.getUserMedia) return;
        if (initialAudioSetupInFlightRef.current && !stream) return;

        let cancelled = false;

        const switchMicrophone = async () => {
            const nextSignature = buildInputSignature({
                deviceId: selectedAudioInput,
                audioProcessingMode
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
        audioSessionActive,
        audioProcessingMode,
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

        const clearMutedRecovery = () => {
            if (mutedTrackRecoveryTimerRef.current) {
                window.clearTimeout(mutedTrackRecoveryTimerRef.current);
                mutedTrackRecoveryTimerRef.current = null;
            }
        };

        const handleMuted = () => {
            clearMutedRecovery();
            mutedTrackRecoveryTimerRef.current = window.setTimeout(() => {
                mutedTrackRecoveryTimerRef.current = null;
                if (audioTrack.muted || audioTrack.readyState === 'ended') {
                    void recoverEndedStream('track-muted-timeout');
                }
            }, MUTED_TRACK_RECOVERY_DELAY_MS);
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
    }, [recoverEndedStream, stream]);

    useEffect(() => {
        if (!stream) return;
        syncStreamMuteState(stream, isMuted);
    }, [isMuted, stream, syncStreamMuteState]);

    useRemoteAudioPlayback({
        connectedPeer, isDeafened, remoteAudioContextRef, remoteAudiosRef,
        remoteGainNodeRef, selectedAudioOutput, userVolumes
    });

    useEffect(() => {
        const applyLocalMonitor = async () => {
            if (!selfMonitorEnabled) {
                stopLocalMonitorStream();
                return;
            }

            const hasOutgoingProcessing = microphoneEnhancementEnabled ||
                sanitizeAudioProcessingMode(audioProcessingMode) === AUDIO_PROCESSING_MODES.AI;
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

                monitorStream = currentSourceStream?.clone?.() || null;

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
        audioProcessingMode,
        microphoneEnhancementEnabled,
        selectedAudioInput,
        selectedAudioOutput,
        selfMonitorEnabled,
        selfMonitorVolume,
        stopLocalMonitorStream,
        stream,
        syncLocalMonitorMuteState,
        voiceActivationEnabledRef
    ]);

    useEffect(() => {
        syncVoiceActivationState(liveVoiceVolumeRef.current, stream);
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
        cleanupAiNoiseSuppression();
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
    }, [cleanupAiNoiseSuppression, cleanupMicrophoneGainPipeline, myVideoRef, publishMicVolume, stopLocalMonitorStream, stopVolumeMonitoring]);

    const getAudioPipelineDiagnostics = useCallback(() => ({
        activeOutgoingTrack: getTrackDiagnostics(activeOutgoingStreamRef.current?.getAudioTracks?.()[0]),
        rawInputTrack: getTrackDiagnostics(rawInputStreamRef.current?.getAudioTracks?.()[0]),
        streamRecovery: {
            inFlight: streamRecoveryInFlightRef.current,
            ...streamRecoveryMetaRef.current
        },
        currentInputDeviceId: currentInputDeviceIdRef.current,
        appliedInputSignature: appliedInputSignatureRef.current,
        levels: { ...audioLevelHealthRef.current },
        limiter: {
            microphoneReductionDb: microphoneLimiterRef.current?.reduction || 0,
            remoteMasterReductionDb: remoteAudioContextRef.current?.__jinvoiceMasterLimiter?.reduction || 0
        },
        processing: {
            ...audioProcessingRuntimeRef.current,
            enhancementEnabled: microphoneEnhancementEnabled
        },
        hasOutgoingProcessing: microphoneEnhancementEnabled ||
            audioProcessingRuntimeRef.current.effectiveMode === AUDIO_PROCESSING_MODES.AI
    }), [audioProcessingRuntimeRef, microphoneEnhancementEnabled, remoteAudioContextRef]);

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
        audioProcessingStatus,
        voiceTransmissionState,
        getAudioPipelineDiagnostics
    };
};
