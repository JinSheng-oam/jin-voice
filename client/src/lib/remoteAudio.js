const getAudioContextClass = () => window.AudioContext || window.webkitAudioContext;
const normalizeSinkId = (sinkId) => (sinkId && sinkId !== 'default' ? sinkId : '');
const getEffectivePlaybackVolume = ({ userVolume = 100 }) => {
    const safeVolume = Math.max(0, Math.min(500, Number(userVolume) || 0));

    if (safeVolume <= 100) {
        const normalized = safeVolume / 100;
        return Math.pow(normalized, 2.2);
    }

    return 1 + ((safeVolume - 100) / 100);
};

const ensureSharedAudioContext = (remoteAudioContextRef) => {
    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
        throw new Error('AudioContext is not supported in this browser');
    }

    if (!remoteAudioContextRef.current) {
        remoteAudioContextRef.current = new AudioContextClass({ latencyHint: 'interactive' });
    }

    return remoteAudioContextRef.current;
};

const disconnectNode = (node) => {
    if (!node) return;
    try {
        node.disconnect();
    } catch {
        /* noop cleanup */
    }
};

export const cleanupRemoteAudioEntry = (userData) => {
    if (!userData?.audioElement) return;

    const audioElement = userData.audioElement;
    audioElement.pause();
    audioElement.srcObject = null;

    disconnectNode(audioElement._source);
    disconnectNode(audioElement._gainNode);
    disconnectNode(userData.gainNode);
    audioElement._source = null;
    audioElement._gainNode = null;
    userData.gainNode = null;

    if (audioElement.parentNode) {
        audioElement.parentNode.removeChild(audioElement);
    }
};

export const applyAudioOutputDevice = async ({
    sinkId,
    audioElement,
    remoteAudioContextRef
}) => {
    const normalizedSinkId = normalizeSinkId(sinkId);
    if (!normalizedSinkId) return true;

    let applied = false;

    if (typeof remoteAudioContextRef?.current?.setSinkId === 'function') {
        try {
            await remoteAudioContextRef.current.setSinkId(normalizedSinkId);
            applied = true;
        } catch {
            /* noop fallback */
        }
    }

    if (typeof audioElement?.setSinkId === 'function') {
        try {
            await audioElement.setSinkId(normalizedSinkId);
            applied = true;
        } catch {
            /* noop fallback */
        }
    }

    return applied;
};

export const syncRemoteAudioOutputDevice = async ({
    sinkId,
    remoteAudioContextRef,
    remoteAudiosRef
}) => {
    const normalizedSinkId = normalizeSinkId(sinkId);
    if (!normalizedSinkId) return;

    const tasks = [];

    if (remoteAudiosRef?.current) {
        remoteAudiosRef.current.forEach((userData) => {
            if (userData?.audioElement) {
                tasks.push(applyAudioOutputDevice({
                    sinkId: normalizedSinkId,
                    audioElement: userData.audioElement,
                    remoteAudioContextRef
                }));
            }
        });
    }

    if (tasks.length === 0) {
        await applyAudioOutputDevice({
            sinkId: normalizedSinkId,
            remoteAudioContextRef
        });
        return;
    }

    await Promise.allSettled(tasks);
};

export const playRemoteStream = ({
    remoteStream,
    userId,
    userVolumes,
    isDeafened,
    selectedAudioOutput,
    remoteAudioContextRef
}) => {
    // Playback volume is the product of "global output volume" and "per-user volume".
    // Do not bypass this helper in one path only, or different connection modes will drift.
    try {
        const ctx = ensureSharedAudioContext(remoteAudioContextRef);

        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {
                /* wait for user interaction */
            });
        }

        const source = ctx.createMediaStreamSource(remoteStream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = getEffectivePlaybackVolume({
            userVolume: userVolumes[userId] ?? 100
        });

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        const audio = document.createElement('audio');
        audio.id = `sfu-audio-${userId}`;
        audio.srcObject = remoteStream;
        audio.muted = isDeafened;
        audio.volume = 0;  // actual volume is controlled by gainNode
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        audio.play().catch(() => { /* unlocked by user interaction */ });
        void applyAudioOutputDevice({
            sinkId: selectedAudioOutput,
            audioElement: audio,
            remoteAudioContextRef
        });

        audio._gainNode = gainNode;
        audio._source = source;
        return audio;
    } catch (error) {
        console.error('[SFU] Web Audio setup failed, falling back to simple element:', error);

        const audio = document.createElement('audio');
        audio.id = `sfu-audio-${userId}`;
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.muted = isDeafened;
        audio.volume = Math.min(getEffectivePlaybackVolume({
            userVolume: userVolumes[userId] ?? 100
        }), 1);
        audio.style.display = 'none';
        document.body.appendChild(audio);
        audio.play();
        void applyAudioOutputDevice({
            sinkId: selectedAudioOutput,
            audioElement: audio,
            remoteAudioContextRef
        });
        return audio;
    }
};

export const adjustRemoteUserVolume = ({
    userId,
    volume,
    connectedPeer,
    remoteGainNodeRef,
    remoteAudiosRef,
    remoteAudioContextRef
}) => {
    if (connectedPeer === userId && remoteGainNodeRef.current) {
        remoteGainNodeRef.current.gain.value = getEffectivePlaybackVolume({
            userVolume: volume
        });
    }

    const sfuUserData = remoteAudiosRef.current.get(userId);
    if (!sfuUserData?.audioElement) return;

    const effectiveVolume = getEffectivePlaybackVolume({
        userVolume: volume
    });

    if (sfuUserData.audioElement._gainNode) {
        if (remoteAudioContextRef.current?.state === 'suspended') {
            remoteAudioContextRef.current.resume().catch(() => { /* noop resume */ });
        }
        sfuUserData.audioElement._gainNode.gain.value = effectiveVolume;
        return;
    }

    if (!sfuUserData.gainNode) {
        try {
            const ctx = ensureSharedAudioContext(remoteAudioContextRef);

            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {
                    /* noop resume */
                });
            }

            const source = ctx.createMediaElementSource(sfuUserData.audioElement);
            const gainNode = ctx.createGain();
            source.connect(gainNode);
            gainNode.connect(ctx.destination);

            sfuUserData.gainNode = gainNode;
            sfuUserData.audioContext = ctx;
            sfuUserData.audioElement.volume = 1;
        } catch (error) {
            console.warn('[SFU] Failed to create GainNode, falling back to volume:', error);
            sfuUserData.audioElement.volume = Math.min(effectiveVolume, 1);
        }
    }

    if (sfuUserData.audioContext?.state === 'suspended') {
        sfuUserData.audioContext.resume();
    }

    if (sfuUserData.gainNode) {
        sfuUserData.gainNode.gain.value = effectiveVolume;
    } else {
        sfuUserData.audioElement.volume = Math.min(effectiveVolume, 1);
    }
};

export const syncRemotePlaybackVolume = ({
    userVolumes = {},
    connectedPeer,
    remoteGainNodeRef,
    remoteAudiosRef,
    remoteAudioContextRef
}) => {
    if (connectedPeer && remoteGainNodeRef.current) {
        remoteGainNodeRef.current.gain.value = getEffectivePlaybackVolume({
            userVolume: userVolumes[connectedPeer] ?? 100
        });
    }

    remoteAudiosRef.current?.forEach((userData, userId) => {
        if (!userData?.audioElement) return;

        const effectiveVolume = getEffectivePlaybackVolume({
            userVolume: userVolumes[userId] ?? 100
        });

        if (userData.audioElement._gainNode) {
            if (remoteAudioContextRef.current?.state === 'suspended') {
                remoteAudioContextRef.current.resume().catch(() => { /* noop resume */ });
            }
            userData.audioElement._gainNode.gain.value = effectiveVolume;
        } else if (userData.gainNode) {
            if (userData.audioContext?.state === 'suspended') {
                userData.audioContext.resume().catch(() => { /* noop resume */ });
            }
            userData.gainNode.gain.value = effectiveVolume;
        } else {
            userData.audioElement.volume = Math.min(effectiveVolume, 1);
        }
    });
};
