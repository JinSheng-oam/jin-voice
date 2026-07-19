const stopStream = (stream) => {
    stream?.getTracks?.().forEach((track) => track.stop());
};

const applySinkId = async (audioElement, sinkId) => {
    if (!sinkId || sinkId === 'default' || typeof audioElement.setSinkId !== 'function') return;
    await audioElement.setSinkId(sinkId);
};

const waitForIceGatheringComplete = (peer, timeoutMs = 3000) => {
    if (peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
        const timeoutId = window.setTimeout(finish, timeoutMs);
        function finish() {
            window.clearTimeout(timeoutId);
            peer.removeEventListener('icegatheringstatechange', handleChange);
            resolve();
        }
        function handleChange() {
            if (peer.iceGatheringState === 'complete') finish();
        }
        peer.addEventListener('icegatheringstatechange', handleChange);
    });
};

export const playOutputTestTone = async ({ sinkId = '', durationMs = 900 } = {}) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前环境不支持输出测试');

    const context = new AudioContextClass({ latencyHint: 'interactive' });
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    const audioElement = document.createElement('audio');
    audioElement.playsInline = true;
    audioElement.srcObject = destination.stream;
    oscillator.type = 'sine';
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);
    oscillator.connect(gain);
    gain.connect(destination);

    try {
        await applySinkId(audioElement, sinkId);
        await context.resume();
        await audioElement.play();
        oscillator.start();
        oscillator.stop(context.currentTime + durationMs / 1000);
        await new Promise((resolve) => window.setTimeout(resolve, durationMs + 80));
    } finally {
        audioElement.pause();
        audioElement.srcObject = null;
        stopStream(destination.stream);
        await context.close().catch(() => {});
    }
};

export const startOpusLoopback = async ({ stream, sinkId = '' } = {}) => {
    const sourceTrack = stream?.getAudioTracks?.()[0];
    if (!sourceTrack || sourceTrack.readyState === 'ended') {
        throw new Error('当前没有可测试的麦克风音轨');
    }
    if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('当前环境不支持 Opus 编码测试');
    }

    const senderPeer = new RTCPeerConnection({ iceServers: [] });
    const receiverPeer = new RTCPeerConnection({ iceServers: [] });
    const testTrack = sourceTrack.clone();
    testTrack.enabled = true;
    const testStream = new MediaStream([testTrack]);
    const audioElement = document.createElement('audio');
    audioElement.autoplay = true;
    audioElement.playsInline = true;
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);

    const stop = () => {
        audioElement.pause();
        audioElement.srcObject = null;
        audioElement.remove();
        stopStream(testStream);
        senderPeer.close();
        receiverPeer.close();
    };

    try {
        const transceiver = senderPeer.addTransceiver(testTrack, {
            direction: 'sendonly',
            streams: [testStream]
        });
        const capabilities = globalThis.RTCRtpSender?.getCapabilities?.('audio');
        const opusCodecs = capabilities?.codecs?.filter((codec) => codec.mimeType?.toLowerCase() === 'audio/opus') || [];
        if (opusCodecs.length && typeof transceiver.setCodecPreferences === 'function') {
            transceiver.setCodecPreferences(opusCodecs);
        }

        const remoteTrackPromise = new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => reject(new Error('编码听感测试启动超时')), 4000);
            receiverPeer.ontrack = (event) => {
                window.clearTimeout(timeoutId);
                resolve(event.streams?.[0] || new MediaStream([event.track]));
            };
        });

        const offer = await senderPeer.createOffer();
        await senderPeer.setLocalDescription(offer);
        await waitForIceGatheringComplete(senderPeer);
        await receiverPeer.setRemoteDescription(senderPeer.localDescription);
        const answer = await receiverPeer.createAnswer();
        await receiverPeer.setLocalDescription(answer);
        await waitForIceGatheringComplete(receiverPeer);
        await senderPeer.setRemoteDescription(receiverPeer.localDescription);
        const remoteStream = await remoteTrackPromise;
        audioElement.srcObject = remoteStream;
        await applySinkId(audioElement, sinkId);
        await audioElement.play();

        return { stop };
    } catch (error) {
        stop();
        throw error;
    }
};
