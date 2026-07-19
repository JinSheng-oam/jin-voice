const crypto = require('crypto');
const { spawn } = require('child_process');
const { createWriteStream } = require('fs');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { MAX_SITE_MEDIA_BYTES, SUPPORTED_SITE_MEDIA_TYPES } = require('./siteMediaStorage');

const VIDEO_INPUT_EXTENSIONS = new Map([
    ['video/mp4', 'mp4'],
    ['video/webm', 'webm'],
    ['video/ogg', 'ogv']
]);

const VIDEO_OUTPUT_FORMATS = {
    mp4: { extension: 'mp4', mimeType: 'video/mp4', codec: 'libx264' },
    webm: { extension: 'webm', mimeType: 'video/webm', codec: 'libvpx-vp9' }
};

const VIDEO_RESOLUTIONS = {
    1080: [1920, 1080],
    720: [1280, 720],
    480: [854, 480],
    360: [640, 360]
};

const normalizeMimeType = (mimeType = '') => String(mimeType).split(';')[0].trim().toLowerCase();

const streamUploadToFile = async (readable, outputPath, maxBytes = MAX_SITE_MEDIA_BYTES) => {
    let size = 0;
    const limiter = new Transform({
        transform(chunk, encoding, callback) {
            size += chunk.length;
            if (size > maxBytes) {
                const error = new Error('媒体文件不能超过 100 MB。');
                error.statusCode = 413;
                callback(error);
                return;
            }
            callback(null, chunk);
        }
    });

    try {
        await pipeline(readable, limiter, createWriteStream(outputPath, { flags: 'wx' }));
        if (!size) throw new Error('媒体文件为空或无法读取。');
        return size;
    } catch (error) {
        await fs.rm(outputPath, { force: true });
        throw error;
    }
};

const receiveSiteMediaUpload = async (readable, mimeType) => {
    const normalizedMimeType = normalizeMimeType(mimeType);
    const mediaDefinition = SUPPORTED_SITE_MEDIA_TYPES.get(normalizedMimeType);
    if (!mediaDefinition) throw new Error('仅支持 JPG、PNG、WebP、AVIF、MP4、WebM 或 OGV 文件。');

    const declaredSize = Number(readable.headers?.['content-length']);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_SITE_MEDIA_BYTES) {
        const error = new Error('媒体文件不能超过 100 MB。');
        error.statusCode = 413;
        throw error;
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jinvoice-upload-'));
    const inputPath = path.join(directory, `input-${crypto.randomUUID()}.${mediaDefinition.extension}`);
    try {
        const size = await streamUploadToFile(readable, inputPath);
        return { directory, inputPath, mimeType: normalizedMimeType, size };
    } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });
        throw error;
    }
};

const normalizeVideoProcessingOptions = (input = {}) => {
    const resolution = input.resolution === 'native' || VIDEO_RESOLUTIONS[input.resolution]
        ? input.resolution
        : '1080';
    const format = VIDEO_OUTPUT_FORMATS[input.format] ? input.format : 'mp4';
    const quality = Math.max(20, Math.min(100, Math.round(Number(input.quality) || 80)));
    return { resolution, format, quality };
};

const buildScaleFilter = (resolution) => {
    const target = VIDEO_RESOLUTIONS[resolution];
    if (!target) return null;
    const [landscapeWidth, landscapeHeight] = target;
    const portraitWidth = landscapeHeight;
    const portraitHeight = landscapeWidth;
    return [
        `scale=w='min(iw,if(gt(iw,ih),${landscapeWidth},${portraitWidth}))'`,
        `h='min(ih,if(gt(iw,ih),${landscapeHeight},${portraitHeight}))'`,
        'force_original_aspect_ratio=decrease',
        'force_divisible_by=2',
        'flags=lanczos'
    ].join(':');
};

const buildVideoTranscodeArgs = ({ inputPath, outputPath, resolution, format, quality }) => {
    const output = VIDEO_OUTPUT_FORMATS[format];
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-map', '0:v:0', '-an'];
    const scaleFilter = buildScaleFilter(resolution);
    if (scaleFilter) args.push('-vf', scaleFilter);

    if (format === 'webm') {
        const crf = Math.round(48 - (quality * 0.33));
        args.push('-c:v', output.codec, '-crf', String(crf), '-b:v', '0', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1');
    } else {
        const crf = Math.round(43 - (quality * 0.25));
        args.push('-c:v', output.codec, '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    }

    args.push(outputPath);
    return args;
};

const runFfmpeg = (args, timeoutMs = 10 * 60 * 1000) => new Promise((resolve, reject) => {
    const executable = String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
    const child = spawn(executable, args, { windowsHide: true });
    let stderr = '';
    let settled = false;
    const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
    };
    const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        const error = new Error('视频转码超时，请缩短视频或降低输出分辨率。');
        error.diagnostics = stderr.slice(-2000);
        finish(reject, error);
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-16000);
    });
    child.on('error', (error) => {
        const message = error.code === 'ENOENT'
            ? '服务器未安装 FFmpeg，暂时无法处理视频。'
            : '无法启动视频转码服务。';
        const wrapped = new Error(message);
        wrapped.diagnostics = error.message;
        finish(reject, wrapped);
    });
    child.on('close', (code) => {
        if (code === 0) {
            finish(resolve);
            return;
        }
        const error = new Error('视频转码失败，请尝试降低分辨率或更换压缩格式。');
        error.diagnostics = stderr.slice(-2000);
        finish(reject, error);
    });
});

const processSiteMediaUploadFile = async ({ inputPath, mimeType, resolution, quality, format }) => {
    const normalizedMimeType = normalizeMimeType(mimeType);
    const inputExtension = VIDEO_INPUT_EXTENSIONS.get(normalizedMimeType);
    if (!inputExtension) {
        return { filePath: inputPath, mimeType: normalizedMimeType, processing: null };
    }

    const options = normalizeVideoProcessingOptions({ resolution, quality, format });
    const output = VIDEO_OUTPUT_FORMATS[options.format];
    const outputPath = path.join(path.dirname(inputPath), `output-${crypto.randomUUID()}.${output.extension}`);
    const args = buildVideoTranscodeArgs({ inputPath, outputPath, ...options });
    await runFfmpeg(args);
    const outputStat = await fs.stat(outputPath);
    if (!outputStat.size) throw new Error('视频转码结果为空，请更换文件后重试。');
    if (outputStat.size > MAX_SITE_MEDIA_BYTES) {
        throw new Error('转码后的视频仍超过 100 MB，请降低分辨率或压缩质量。');
    }
    return {
        filePath: outputPath,
        mimeType: output.mimeType,
        processing: {
            size: outputStat.size,
            detail: `${options.resolution === 'native' ? '原生' : `${options.resolution}p`} · ${options.format.toUpperCase()}`
        }
    };
};

module.exports = {
    VIDEO_OUTPUT_FORMATS,
    VIDEO_RESOLUTIONS,
    buildScaleFilter,
    buildVideoTranscodeArgs,
    normalizeVideoProcessingOptions,
    processSiteMediaUploadFile,
    receiveSiteMediaUpload,
    streamUploadToFile
};
