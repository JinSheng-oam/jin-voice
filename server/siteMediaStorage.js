const crypto = require('crypto');
const { constants } = require('fs');
const fs = require('fs/promises');
const path = require('path');

const MAX_SITE_MEDIA_BYTES = 100 * 1024 * 1024;
const SITE_MEDIA_ROUTE = '/site-media';
const SUPPORTED_SITE_MEDIA_TYPES = new Map([
    ['image/jpeg', { extension: 'jpg', type: 'image' }],
    ['image/png', { extension: 'png', type: 'image' }],
    ['image/webp', { extension: 'webp', type: 'image' }],
    ['image/avif', { extension: 'avif', type: 'image' }],
    ['video/mp4', { extension: 'mp4', type: 'video' }],
    ['video/webm', { extension: 'webm', type: 'video' }],
    ['video/ogg', { extension: 'ogv', type: 'video' }]
]);

const normalizeFileName = (value = '') => {
    const decoded = (() => {
        try {
            return decodeURIComponent(String(value || ''));
        } catch {
            return String(value || '');
        }
    })();
    const baseName = path.basename(decoded).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '').trim();
    return (baseName || '背景媒体').slice(0, 80);
};

const normalizeMimeType = (mimeType = '') => String(mimeType).split(';')[0].trim().toLowerCase();

const createSiteMediaStorage = (directory) => {
    const resolveStoredFile = (url = '') => {
        const prefix = `${SITE_MEDIA_ROUTE}/`;
        if (!String(url).startsWith(prefix)) return null;
        const fileName = String(url).slice(prefix.length);
        if (!/^[a-f0-9-]+\.(?:jpg|png|webp|avif|mp4|webm|ogv)$/i.test(fileName)) return null;
        return path.join(directory, fileName);
    };

    return {
        directory,
        storeFile: async ({ filePath, mimeType, originalName }) => {
            const mediaDefinition = SUPPORTED_SITE_MEDIA_TYPES.get(normalizeMimeType(mimeType));
            if (!mediaDefinition) throw new Error('仅支持 JPG、PNG、WebP、AVIF、MP4、WebM 或 OGV 文件。');
            const sourceStat = await fs.stat(filePath);
            if (!sourceStat.isFile() || sourceStat.size === 0) throw new Error('媒体文件为空或无法读取。');
            if (sourceStat.size > MAX_SITE_MEDIA_BYTES) throw new Error('媒体文件不能超过 100 MB。');

            await fs.mkdir(directory, { recursive: true });
            const id = crypto.randomUUID();
            const fileName = `${id}.${mediaDefinition.extension}`;
            await fs.copyFile(filePath, path.join(directory, fileName), constants.COPYFILE_EXCL);

            return {
                id,
                name: normalizeFileName(originalName),
                type: mediaDefinition.type,
                source: 'upload',
                url: `${SITE_MEDIA_ROUTE}/${fileName}`,
                size: sourceStat.size
            };
        },
        remove: async (url) => {
            const filePath = resolveStoredFile(url);
            if (!filePath) return false;
            await fs.rm(filePath, { force: true });
            return true;
        }
    };
};

module.exports = {
    MAX_SITE_MEDIA_BYTES,
    SITE_MEDIA_ROUTE,
    SUPPORTED_SITE_MEDIA_TYPES,
    createSiteMediaStorage,
    normalizeFileName
};
