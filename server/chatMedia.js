const CHAT_IMAGE_MAX_BYTES = 600 * 1024;
const CHAT_IMAGE_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/u;

const normalizeChatImage = (image) => {
    if (!image) return null;
    if (typeof image !== 'object' || typeof image.dataUrl !== 'string') {
        throw new Error('图片数据无效，请重新选择后发送。');
    }

    const match = CHAT_IMAGE_DATA_URL_PATTERN.exec(image.dataUrl);
    if (!match) {
        throw new Error('聊天图片仅支持 JPEG、PNG 和 WebP。');
    }

    const byteLength = Buffer.from(match[2], 'base64').byteLength;
    if (byteLength <= 0 || byteLength > CHAT_IMAGE_MAX_BYTES) {
        throw new Error('聊天图片压缩后不能超过 600 KB。');
    }

    const width = Number(image.width);
    const height = Number(image.height);
    if (
        !Number.isInteger(width) || width <= 0 || width > 4096 ||
        !Number.isInteger(height) || height <= 0 || height > 4096
    ) {
        throw new Error('图片尺寸无效，请重新选择后发送。');
    }

    return {
        dataUrl: image.dataUrl,
        name: String(image.name || '图片').slice(0, 255),
        width,
        height
    };
};

module.exports = {
    CHAT_IMAGE_MAX_BYTES,
    normalizeChatImage
};
