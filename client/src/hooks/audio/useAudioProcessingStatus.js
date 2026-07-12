import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AUDIO_PROCESSING_MODES,
    preloadAiNoiseSuppression,
    sanitizeAudioProcessingMode,
    supportsAiNoiseSuppression
} from '../../lib/audioProcessing';

const createInitialStatus = (audioProcessingMode) => ({
    requestedMode: sanitizeAudioProcessingMode(audioProcessingMode),
    effectiveMode: 'idle',
    status: 'idle',
    aiSupported: supportsAiNoiseSuppression(),
    fallbackReason: null,
    lastError: null
});

export const useAudioProcessingStatus = (audioProcessingMode) => {
    const [status, setStatus] = useState(() => createInitialStatus(audioProcessingMode));
    const runtimeRef = useRef(status);

    const updateStatus = useCallback((nextStatus) => {
        const next = { ...runtimeRef.current, ...nextStatus };
        runtimeRef.current = next;
        setStatus(next);
    }, []);

    useEffect(() => {
        const requestedMode = sanitizeAudioProcessingMode(audioProcessingMode);
        const aiSupported = supportsAiNoiseSuppression();
        let cancelled = false;
        updateStatus({
            requestedMode,
            effectiveMode: requestedMode === AUDIO_PROCESSING_MODES.AI && !aiSupported
                ? AUDIO_PROCESSING_MODES.STANDARD : requestedMode,
            status: requestedMode === AUDIO_PROCESSING_MODES.AI && aiSupported ? 'loading' : 'ready',
            aiSupported,
            fallbackReason: requestedMode === AUDIO_PROCESSING_MODES.AI && !aiSupported
                ? '当前浏览器不支持 AI 音轨处理，将使用标准降噪' : null,
            lastError: null
        });

        if (requestedMode === AUDIO_PROCESSING_MODES.AI && aiSupported) {
            preloadAiNoiseSuppression()
                .then(() => {
                    if (!cancelled && runtimeRef.current.status === 'loading') updateStatus({ status: 'ready' });
                })
                .catch((error) => {
                    if (!cancelled) {
                        updateStatus({
                            effectiveMode: AUDIO_PROCESSING_MODES.STANDARD,
                            status: 'fallback',
                            fallbackReason: 'AI 降噪模块预加载失败，将使用标准降噪',
                            lastError: error?.message || String(error)
                        });
                    }
                });
        }
        return () => { cancelled = true; };
    }, [audioProcessingMode, updateStatus]);

    return { audioProcessingRuntimeRef: runtimeRef, audioProcessingStatus: status, updateAudioProcessingStatus: updateStatus };
};
