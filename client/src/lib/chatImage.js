export const CHAT_IMAGE_MAX_SOURCE_SIZE = 12 * 1024 * 1024;
export const CHAT_IMAGE_MAX_BYTES = 600 * 1024;
export const CHAT_IMAGE_MAX_DIMENSION = 1600;

const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('无法读取这张图片，请换一张后重试。'));
    };
    image.src = url;
});

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
});

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片编码失败，请重试。'));
    reader.readAsDataURL(blob);
});

export const prepareChatImage = async (file) => {
    if (!file?.type?.startsWith('image/')) {
        throw new Error('请选择 JPG、PNG 或 WebP 图片。');
    }
    if (file.size <= 0 || file.size > CHAT_IMAGE_MAX_SOURCE_SIZE) {
        throw new Error('原始图片大小必须在 12 MB 以内。');
    }

    const image = await loadImage(file);
    const scale = Math.min(1, CHAT_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
        throw new Error('当前浏览器无法处理图片。');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let blob = null;
    for (const quality of [0.84, 0.72, 0.6, 0.48]) {
        blob = await canvasToBlob(canvas, 'image/webp', quality);
        if (blob && blob.size <= CHAT_IMAGE_MAX_BYTES) break;
    }

    if (!blob || blob.size > CHAT_IMAGE_MAX_BYTES) {
        throw new Error('压缩后图片仍然过大，请选择尺寸更小的图片。');
    }

    return {
        dataUrl: await blobToDataUrl(blob),
        name: file.name.slice(0, 255),
        width,
        height,
        size: blob.size,
        mime: blob.type
    };
};
