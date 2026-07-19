const VIDEO_RESOLUTION_LIMITS = {
    1080: [1920, 1080],
    720: [1280, 720],
    480: [854, 480],
    360: [640, 360]
};

const VIDEO_BITRATES = {
    1080: 4_000_000,
    720: 2_500_000,
    480: 1_200_000,
    360: 700_000,
    native: 4_000_000
};

const MIME_CANDIDATES = {
    mp4: ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
    webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
};

export const calculateContainedVideoSize = (width, height, resolution = '1080') => {
    const safeWidth = Math.max(2, Number(width) || 2);
    const safeHeight = Math.max(2, Number(height) || 2);
    const limit = VIDEO_RESOLUTION_LIMITS[resolution];
    if (!limit) {
        return {
            width: Math.max(2, Math.floor(safeWidth / 2) * 2),
            height: Math.max(2, Math.floor(safeHeight / 2) * 2)
        };
    }
    const landscape = safeWidth >= safeHeight;
    const maxWidth = landscape ? limit[0] : limit[1];
    const maxHeight = landscape ? limit[1] : limit[0];
    const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);
    return {
        width: Math.max(2, Math.floor((safeWidth * scale) / 2) * 2),
        height: Math.max(2, Math.floor((safeHeight * scale) / 2) * 2)
    };
};

export const getBrowserVideoBitrate = (resolution = '1080', quality = 80) => {
    const normalizedQuality = Math.max(20, Math.min(100, Number(quality) || 80));
    const qualityScale = 0.45 + (normalizedQuality / 100) * 0.55;
    return Math.round((VIDEO_BITRATES[resolution] || VIDEO_BITRATES[1080]) * qualityScale);
};

export const selectBrowserVideoMimeType = (format = 'mp4', MediaRecorderCtor = globalThis.MediaRecorder) => {
    if (!MediaRecorderCtor) return '';
    const candidates = MIME_CANDIDATES[format] || MIME_CANDIDATES.mp4;
    return candidates.find((mimeType) => (
        typeof MediaRecorderCtor.isTypeSupported !== 'function'
        || MediaRecorderCtor.isTypeSupported(mimeType)
    )) || '';
};

export const canPrecompressVideoInBrowser = () => (
    typeof document !== 'undefined'
    && typeof globalThis.MediaRecorder === 'function'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && Boolean(selectBrowserVideoMimeType())
);

const waitForVideoMetadata = (video) => new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', resolve, { once: true });
    video.addEventListener('error', () => reject(new Error('浏览器无法读取该视频')), { once: true });
});

export const precompressVideoFile = async (file, options = {}) => {
    if (!canPrecompressVideoInBrowser()) throw new Error('当前浏览器不支持视频预压缩');

    const mimeType = selectBrowserVideoMimeType(options.format);
    if (!mimeType) throw new Error('当前浏览器不支持可用的视频编码格式');

    const sourceUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = sourceUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    try {
        await waitForVideoMetadata(video);
    } catch (error) {
        video.removeAttribute('src');
        URL.revokeObjectURL(sourceUrl);
        throw error;
    }

    const outputSize = calculateContainedVideoSize(video.videoWidth, video.videoHeight, options.resolution);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
        URL.revokeObjectURL(sourceUrl);
        throw new Error('浏览器无法创建视频压缩画布');
    }

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: getBrowserVideoBitrate(options.resolution, options.quality)
    });
    const chunks = [];
    let frameHandle = null;
    let stopped = false;
    const drawFrame = () => {
        if (stopped) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (typeof video.requestVideoFrameCallback === 'function') {
            frameHandle = video.requestVideoFrameCallback(drawFrame);
        } else {
            frameHandle = requestAnimationFrame(drawFrame);
        }
    };

    try {
        const stoppedPromise = new Promise((resolve, reject) => {
            recorder.addEventListener('dataavailable', (event) => {
                if (event.data?.size) chunks.push(event.data);
            });
            recorder.addEventListener('stop', resolve, { once: true });
            recorder.addEventListener('error', () => reject(new Error('浏览器视频编码失败')), { once: true });
        });
        const endedPromise = new Promise((resolve, reject) => {
            video.addEventListener('ended', resolve, { once: true });
            video.addEventListener('error', () => reject(new Error('浏览器视频播放失败')), { once: true });
        });

        recorder.start(1000);
        drawFrame();
        await video.play();
        await endedPromise;
        recorder.stop();
        await stoppedPromise;

        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        if (!blob.size) throw new Error('浏览器视频预压缩结果为空');
        if (blob.size >= file.size) {
            return { blob: file, applied: false, originalSize: file.size, size: file.size, reason: '预压缩未减小文件，已使用原文件' };
        }
        return {
            blob,
            applied: true,
            originalSize: file.size,
            size: blob.size,
            width: outputSize.width,
            height: outputSize.height
        };
    } finally {
        stopped = true;
        video.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        if (frameHandle !== null) {
            if (typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(frameHandle);
            else cancelAnimationFrame(frameHandle);
        }
        stream.getTracks().forEach((track) => track.stop());
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(sourceUrl);
    }
};
