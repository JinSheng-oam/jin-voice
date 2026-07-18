import { useEffect } from 'react';

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

const isEditableKeyboardTarget = (event) => {
    if (event.defaultPrevented) return true;
    return event.target instanceof Element && Boolean(event.target.closest(EDITABLE_SELECTOR));
};

export const usePushToTalkControls = ({
    activeOutgoingStreamRef,
    liveVoiceVolumeRef,
    pushToTalkEnabled,
    pushToTalkKey,
    pushToTalkKeyRef,
    pushToTalkPressedRef,
    stream,
    syncVoiceActivationState
}) => {
    useEffect(() => {
        if (!pushToTalkEnabled) return undefined;

        const desktopApi = window.jinvoiceDesktop;
        const isDesktopPushToTalk = Boolean(desktopApi?.isDesktop);
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
            if (isDesktopPushToTalk || event.code !== pushToTalkKeyRef.current || isEditableKeyboardTarget(event) || event.repeat) return;
            event.preventDefault();
            syncPushToTalk(true);
        };
        const onKeyUp = (event) => {
            if (isDesktopPushToTalk || event.code !== pushToTalkKeyRef.current) return;
            event.preventDefault();
            syncPushToTalk(false);
        };
        const onBlur = () => syncPushToTalk(false);
        const onVisibilityChange = () => {
            if (document.hidden) syncPushToTalk(false);
        };
        const onFullscreenChange = () => {
            if (document.fullscreenElement && navigator.keyboard?.lock && pushToTalkKeyRef.current) {
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
    }, [
        activeOutgoingStreamRef, liveVoiceVolumeRef, pushToTalkEnabled, pushToTalkKey,
        pushToTalkKeyRef, pushToTalkPressedRef, stream, syncVoiceActivationState
    ]);
};
