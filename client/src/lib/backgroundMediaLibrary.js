import { getApiBaseUrl } from './connectionConfig';
import { prepareBackgroundImageFile } from './backgroundImageFile';
import { precompressVideoFile } from './browserVideoPrecompression';

export const BACKGROUND_MEDIA_LIBRARY_LIMIT = 24;
export const BACKGROUND_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const BACKGROUND_MEDIA_RESOLUTION_OPTIONS = [
    { value: '1080', label: '1080p' },
    { value: '720', label: '720p' },
    { value: '480', label: '480p' },
    { value: '360', label: '360p' },
    { value: 'native', label: '原生分辨率' }
];
export const BACKGROUND_IMAGE_FORMAT_OPTIONS = [
    { value: 'webp', label: 'WebP（推荐）' },
    { value: 'jpeg', label: 'JPEG' },
    { value: 'png', label: 'PNG（无损）' }
];
export const BACKGROUND_VIDEO_FORMAT_OPTIONS = [
    { value: 'mp4', label: 'MP4（推荐）' },
    { value: 'webm', label: 'WebM' }
];

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const SUPPORTED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg']);
const OUTPUT_EXTENSIONS = { webp: 'webp', jpeg: 'jpg', png: 'png', mp4: 'mp4', webm: 'webm' };

export const getBackgroundMediaKind = (file) => (
    SUPPORTED_VIDEO_TYPES.has(file?.type) ? 'video' : 'image'
);

export const buildBackgroundMediaOutputName = (fileName, format) => {
    const extension = OUTPUT_EXTENSIONS[format] || 'bin';
    const baseName = String(fileName || '背景媒体').replace(/\.[^.]+$/, '') || '背景媒体';
    return `${baseName}.${extension}`;
};

export const validateBackgroundMediaFile = (file) => {
    if (!file) throw new Error('请选择背景图片或视频');
    if (!SUPPORTED_IMAGE_TYPES.has(file.type) && !SUPPORTED_VIDEO_TYPES.has(file.type)) {
        throw new Error('仅支持 JPG、PNG、WebP、AVIF、MP4、WebM 或 OGV');
    }
    if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('媒体文件为空或无法读取');
    if (SUPPORTED_VIDEO_TYPES.has(file.type) && file.size > BACKGROUND_VIDEO_MAX_BYTES) {
        throw new Error('视频文件不能超过 100 MB');
    }
    return file;
};

const parseResponse = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '媒体文件上传失败');
    return payload;
};

export const uploadBackgroundMediaFile = async (file, options = {}) => {
    validateBackgroundMediaFile(file);
    const kind = getBackgroundMediaKind(file);
    const resolution = BACKGROUND_MEDIA_RESOLUTION_OPTIONS.some((item) => item.value === options.resolution)
        ? options.resolution
        : '1080';
    const quality = Math.max(20, Math.min(100, Number(options.quality) || 80));
    const allowedFormats = kind === 'video' ? BACKGROUND_VIDEO_FORMAT_OPTIONS : BACKGROUND_IMAGE_FORMAT_OPTIONS;
    const format = allowedFormats.some((item) => item.value === options.format)
        ? options.format
        : allowedFormats[0].value;
    let uploadBlob = file;
    let detail = '';
    let precompression = null;
    if (kind === 'image') {
        const prepared = await prepareBackgroundImageFile(file, { resolution, quality, format });
        uploadBlob = prepared.blob;
        detail = `${prepared.width}×${prepared.height} · ${format.toUpperCase()}`;
    } else if (options.precompressVideo) {
        options.onPhase?.('precompress');
        try {
            precompression = await precompressVideoFile(file, { resolution, quality, format });
            uploadBlob = precompression.blob;
        } catch (error) {
            precompression = {
                applied: false,
                originalSize: file.size,
                size: file.size,
                reason: `${error?.message || '视频预压缩失败'}，已回退上传原文件`
            };
        }
    }

    options.onPhase?.('upload', { size: uploadBlob.size, precompressed: Boolean(precompression?.applied) });
    const response = await fetch(`${getApiBaseUrl()}/api/admin/site-media`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': uploadBlob.type || file.type,
            'X-File-Name': encodeURIComponent(buildBackgroundMediaOutputName(file.name, format)),
            'X-Media-Resolution': resolution,
            'X-Media-Quality': String(quality),
            'X-Media-Format': format
        },
        body: uploadBlob
    });
    const payload = await parseResponse(response);
    return {
        ...payload.media,
        size: payload.processing?.size || uploadBlob.size,
        detail: detail || payload.processing?.detail || '',
        precompressed: Boolean(precompression?.applied),
        originalSize: precompression?.originalSize || file.size,
        uploadSize: uploadBlob.size,
        precompressionWarning: precompression?.reason || ''
    };
};

export const createBackgroundMediaLink = ({ name, type, url }) => {
    const normalizedUrl = String(url || '').trim();
    if (!/^https?:\/\//i.test(normalizedUrl) && !normalizedUrl.startsWith('/')) {
        throw new Error('请输入 http(s) 或站点相对地址');
    }
    const fallbackName = (() => {
        try {
            return decodeURIComponent(new URL(normalizedUrl, window.location.origin).pathname.split('/').pop() || '链接背景');
        } catch {
            return '链接背景';
        }
    })();
    return {
        id: globalThis.crypto?.randomUUID?.() || `media-${Date.now()}`,
        name: String(name || fallbackName).trim().slice(0, 80) || '链接背景',
        type: type === 'video' ? 'video' : 'image',
        source: 'url',
        url: normalizedUrl
    };
};
