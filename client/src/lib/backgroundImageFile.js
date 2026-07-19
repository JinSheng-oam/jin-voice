export const BACKGROUND_IMAGE_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const BACKGROUND_IMAGE_MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

const OUTPUT_IMAGE_TYPES = {
    webp: 'image/webp',
    jpeg: 'image/jpeg',
    png: 'image/png'
};

const OUTPUT_RESOLUTIONS = {
    1080: [1920, 1080],
    720: [1280, 720],
    480: [854, 480],
    360: [640, 360]
};

const SUPPORTED_BACKGROUND_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif'
]);

export const validateBackgroundImageFile = (file) => {
    if (!file) throw new Error('请选择背景图片');
    if (!SUPPORTED_BACKGROUND_IMAGE_TYPES.has(file.type)) {
        throw new Error('仅支持 JPG、PNG、WebP 或 AVIF 图片');
    }
    if (!Number.isFinite(file.size) || file.size <= 0) {
        throw new Error('图片文件为空或无法读取');
    }
    if (file.size > BACKGROUND_IMAGE_MAX_SOURCE_BYTES) {
        throw new Error('原始图片不能超过 15 MB');
    }
    return file;
};

export const formatImageFileSize = (bytes = 0) => {
    const safeBytes = Math.max(0, Number(bytes) || 0);
    if (safeBytes < 1024) return `${safeBytes} B`;
    if (safeBytes < 1024 * 1024) return `${Math.round(safeBytes / 1024)} KB`;
    return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const loadImageSource = async (file) => {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            cleanup: () => bitmap.close()
        };
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(objectUrl)
    };
};

const canvasToBlob = (canvas, mimeType, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (!blob) {
            reject(new Error('浏览器无法压缩这张图片'));
            return;
        }
        if (blob.type !== mimeType) {
            reject(new Error('当前浏览器不支持所选图片格式'));
            return;
        }
        resolve(blob);
    }, mimeType, quality);
});

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('压缩后的图片读取失败'));
    reader.readAsDataURL(blob);
});

export const calculateBackgroundImageDimensions = (width, height, resolution = '1080') => {
    if (resolution === 'native' || !OUTPUT_RESOLUTIONS[resolution]) {
        return { width, height };
    }
    const [landscapeWidth, landscapeHeight] = OUTPUT_RESOLUTIONS[resolution];
    const targetWidth = width >= height ? landscapeWidth : landscapeHeight;
    const targetHeight = width >= height ? landscapeHeight : landscapeWidth;
    const scale = Math.min(1, targetWidth / width, targetHeight / height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
};

export const prepareBackgroundImageFile = async (file, options = {}) => {
    validateBackgroundImageFile(file);
    const format = OUTPUT_IMAGE_TYPES[options.format] ? options.format : 'webp';
    const mimeType = OUTPUT_IMAGE_TYPES[format];
    const quality = Math.max(20, Math.min(100, Number(options.quality) || 80)) / 100;
    const image = await loadImageSource(file);
    if (!image.width || !image.height) {
        image.cleanup();
        throw new Error('无法识别图片尺寸');
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        image.cleanup();
        throw new Error('当前浏览器不支持图片处理');
    }

    const dimensions = calculateBackgroundImageDimensions(image.width, image.height, options.resolution);
    let outputBlob;

    try {
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (format === 'jpeg') {
            context.fillStyle = '#000';
            context.fillRect(0, 0, dimensions.width, dimensions.height);
        }
        context.drawImage(image.source, 0, 0, dimensions.width, dimensions.height);
        outputBlob = await canvasToBlob(canvas, mimeType, format === 'png' ? undefined : quality);
        if (outputBlob.size > BACKGROUND_IMAGE_MAX_OUTPUT_BYTES) {
            throw new Error('处理后的图片超过 100 MB，请降低分辨率或改用 WebP/JPEG');
        }
    } finally {
        image.cleanup();
    }

    return {
        blob: outputBlob,
        dataUrl: await blobToDataUrl(outputBlob),
        width: dimensions.width,
        height: dimensions.height,
        size: outputBlob.size,
        type: outputBlob.type,
        format
    };
};
