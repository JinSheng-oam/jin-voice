const express = require('express');
const { processSiteMediaUpload } = require('./siteMediaProcessor');

const SITE_APPEARANCE_ROW_ID = 1;
const MAX_BACKGROUND_URL_LENGTH = 2048;
const MAX_EMBEDDED_BACKGROUND_LENGTH = 300000;
const MAX_BACKGROUND_MEDIA_ITEMS = 24;
const MAX_BACKGROUND_MEDIA_BYTES = 100 * 1024 * 1024;
const EMBEDDED_BACKGROUND_PATTERN = /^data:image\/(?:jpeg|png|webp|avif);base64,[a-z0-9+/]+={0,2}$/i;
const SITE_BACKGROUND_PRESETS = new Set([
    'aurora',
    'midnight-grid',
    'sunset-flow',
    'minimal-paper'
]);
const DEFAULT_SITE_APPEARANCE = {
    backgroundMode: 'preset',
    backgroundPreset: 'aurora',
    backgroundImageUrl: null,
    backgroundMediaType: 'image',
    backgroundMediaId: null,
    backgroundMediaLibrary: [],
    backgroundBlur: 16,
    backgroundOpacity: 68,
    panelOpacity: 8,
    panelBlur: 22,
    panelGlow: 12,
    lgOpacity: 12,
    lgBlur: 24,
    lgSaturation: 120,
    lgBrightness: 110,
    lgEdgeHighlight: 25,
    lgEdgeHighlightBottom: 5,
    lgInnerGlow: 15,
    lgInsetShadow: 20
};

const normalizeBackgroundMode = (mode = '') => (['image', 'media'].includes(mode) ? 'media' : 'preset');
const normalizeBackgroundPreset = (preset = '') => (
    SITE_BACKGROUND_PRESETS.has(preset) ? preset : DEFAULT_SITE_APPEARANCE.backgroundPreset
);
const normalizeBackgroundMediaUrl = (imageUrl = '') => {
    const normalized = String(imageUrl || '').trim();
    if (!normalized) return null;
    if (normalized.startsWith('data:image/')) {
        if (normalized.length > MAX_EMBEDDED_BACKGROUND_LENGTH) {
            throw new Error('Embedded background image is too large.');
        }
        if (!EMBEDDED_BACKGROUND_PATTERN.test(normalized)) {
            throw new Error('Embedded background image must be a supported Base64 raster image.');
        }
        return normalized;
    }
    if (normalized.length > MAX_BACKGROUND_URL_LENGTH) throw new Error('Background image URL is too long.');
    if (
        normalized.startsWith('http://') ||
        normalized.startsWith('https://') ||
        normalized.startsWith('/')
    ) {
        return normalized;
    }
    throw new Error('Background media must be an http(s), data:image, or site-relative URL.');
};
const normalizeBackgroundMediaType = (type = '') => (type === 'video' ? 'video' : 'image');
const normalizeBackgroundMediaLibrary = (value = []) => {
    let entries = value;
    if (typeof entries === 'string') {
        try {
            entries = JSON.parse(entries || '[]');
        } catch {
            throw new Error('Background media library is malformed.');
        }
    }
    if (!Array.isArray(entries)) throw new Error('Background media library must be an array.');
    if (entries.length > MAX_BACKGROUND_MEDIA_ITEMS) {
        throw new Error(`Background media library cannot exceed ${MAX_BACKGROUND_MEDIA_ITEMS} items.`);
    }

    const ids = new Set();
    return entries.map((entry, index) => {
        const id = String(entry?.id || '').trim();
        if (!/^[a-z0-9_-]{1,64}$/i.test(id) || ids.has(id)) {
            throw new Error(`Background media item ${index + 1} has an invalid or duplicate id.`);
        }
        ids.add(id);
        const name = String(entry?.name || '').trim().slice(0, 80);
        if (!name) throw new Error(`Background media item ${index + 1} needs a name.`);
        const url = normalizeBackgroundMediaUrl(entry?.url);
        if (!url) throw new Error(`Background media item ${index + 1} needs a URL.`);
        const requestedSize = Number(entry?.size);
        const size = Number.isFinite(requestedSize) && requestedSize > 0
            ? Math.min(MAX_BACKGROUND_MEDIA_BYTES, Math.round(requestedSize))
            : 0;
        return {
            id,
            name,
            type: normalizeBackgroundMediaType(entry?.type),
            source: url.startsWith('/site-media/') ? 'upload' : 'url',
            url,
            ...(size ? { size } : {})
        };
    });
};
const normalizeNumber = (value, fallback, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : fallback;
};
const serializeSiteAppearance = (appearance) => {
    let backgroundMediaLibrary = normalizeBackgroundMediaLibrary(appearance?.backgroundMediaLibrary || []);
    const backgroundImageUrl = appearance?.backgroundImageUrl || '';
    const backgroundMediaType = normalizeBackgroundMediaType(appearance?.backgroundMediaType);
    const backgroundMediaId = String(appearance?.backgroundMediaId || '').trim() || null;
    if (!backgroundMediaLibrary.length && backgroundImageUrl) {
        backgroundMediaLibrary = [{
            id: backgroundMediaId || 'legacy-background',
            name: '当前背景',
            type: backgroundMediaType,
            source: backgroundImageUrl.startsWith('/site-media/') ? 'upload' : 'url',
            url: backgroundImageUrl
        }];
    }
    const effectiveMediaId = backgroundMediaId
        || backgroundMediaLibrary.find((item) => item.url === backgroundImageUrl)?.id
        || null;

    return {
    backgroundMode: normalizeBackgroundMode(appearance?.backgroundMode),
    backgroundPreset: normalizeBackgroundPreset(appearance?.backgroundPreset),
    backgroundImageUrl,
    backgroundMediaType,
    backgroundMediaId: effectiveMediaId,
    backgroundMediaLibrary,
    backgroundBlur: normalizeNumber(appearance?.backgroundBlur, DEFAULT_SITE_APPEARANCE.backgroundBlur, 40),
    backgroundOpacity: normalizeNumber(appearance?.backgroundOpacity, DEFAULT_SITE_APPEARANCE.backgroundOpacity, 100),
    panelOpacity: normalizeNumber(appearance?.panelOpacity, DEFAULT_SITE_APPEARANCE.panelOpacity, 100),
    panelBlur: normalizeNumber(appearance?.panelBlur, DEFAULT_SITE_APPEARANCE.panelBlur, 40),
    panelGlow: normalizeNumber(appearance?.panelGlow, DEFAULT_SITE_APPEARANCE.panelGlow, 30),
    lgOpacity: normalizeNumber(appearance?.lgOpacity, DEFAULT_SITE_APPEARANCE.lgOpacity, 100),
    lgBlur: normalizeNumber(appearance?.lgBlur, DEFAULT_SITE_APPEARANCE.lgBlur, 100),
    lgSaturation: normalizeNumber(appearance?.lgSaturation, DEFAULT_SITE_APPEARANCE.lgSaturation, 300),
    lgBrightness: normalizeNumber(appearance?.lgBrightness, DEFAULT_SITE_APPEARANCE.lgBrightness, 300),
    lgEdgeHighlight: normalizeNumber(appearance?.lgEdgeHighlight, DEFAULT_SITE_APPEARANCE.lgEdgeHighlight, 100),
    lgEdgeHighlightBottom: normalizeNumber(appearance?.lgEdgeHighlightBottom, DEFAULT_SITE_APPEARANCE.lgEdgeHighlightBottom, 100),
    lgInnerGlow: normalizeNumber(appearance?.lgInnerGlow, DEFAULT_SITE_APPEARANCE.lgInnerGlow, 100),
    lgInsetShadow: normalizeNumber(appearance?.lgInsetShadow, DEFAULT_SITE_APPEARANCE.lgInsetShadow, 100)
    };
};

const normalizeSiteAppearanceInput = (input = {}) => {
    const backgroundMediaLibrary = normalizeBackgroundMediaLibrary(input.backgroundMediaLibrary || []);
    const requestedMediaId = String(input.backgroundMediaId || '').trim();
    const activeMedia = backgroundMediaLibrary.find((item) => item.id === requestedMediaId) || null;
    const backgroundImageUrl = activeMedia?.url || normalizeBackgroundMediaUrl(input.backgroundImageUrl);
    const backgroundMediaType = activeMedia?.type || normalizeBackgroundMediaType(input.backgroundMediaType);

    return {
    backgroundMode: normalizeBackgroundMode(input.backgroundMode),
    backgroundPreset: normalizeBackgroundPreset(input.backgroundPreset),
    backgroundImageUrl,
    backgroundMediaType,
    backgroundMediaId: activeMedia?.id || null,
    backgroundMediaLibrary: JSON.stringify(backgroundMediaLibrary),
    backgroundBlur: normalizeNumber(input.backgroundBlur, DEFAULT_SITE_APPEARANCE.backgroundBlur, 40),
    backgroundOpacity: normalizeNumber(input.backgroundOpacity, DEFAULT_SITE_APPEARANCE.backgroundOpacity, 100),
    panelOpacity: normalizeNumber(input.panelOpacity, DEFAULT_SITE_APPEARANCE.panelOpacity, 100),
    panelBlur: normalizeNumber(input.panelBlur, DEFAULT_SITE_APPEARANCE.panelBlur, 40),
    panelGlow: normalizeNumber(input.panelGlow, DEFAULT_SITE_APPEARANCE.panelGlow, 30),
    lgOpacity: normalizeNumber(input.lgOpacity, DEFAULT_SITE_APPEARANCE.lgOpacity, 100),
    lgBlur: normalizeNumber(input.lgBlur, DEFAULT_SITE_APPEARANCE.lgBlur, 100),
    lgSaturation: normalizeNumber(input.lgSaturation, DEFAULT_SITE_APPEARANCE.lgSaturation, 300),
    lgBrightness: normalizeNumber(input.lgBrightness, DEFAULT_SITE_APPEARANCE.lgBrightness, 300),
    lgEdgeHighlight: normalizeNumber(input.lgEdgeHighlight, DEFAULT_SITE_APPEARANCE.lgEdgeHighlight, 100),
    lgEdgeHighlightBottom: normalizeNumber(input.lgEdgeHighlightBottom, DEFAULT_SITE_APPEARANCE.lgEdgeHighlightBottom, 100),
    lgInnerGlow: normalizeNumber(input.lgInnerGlow, DEFAULT_SITE_APPEARANCE.lgInnerGlow, 100),
    lgInsetShadow: normalizeNumber(input.lgInsetShadow, DEFAULT_SITE_APPEARANCE.lgInsetShadow, 100)
    };
};

const toPersistenceDefaults = () => ({
    ...DEFAULT_SITE_APPEARANCE,
    backgroundMediaLibrary: '[]'
});

const createSiteAppearanceService = (prisma) => {
    const ensure = () => prisma.siteAppearance.upsert({
        where: { id: SITE_APPEARANCE_ROW_ID },
        update: {},
        create: { id: SITE_APPEARANCE_ROW_ID, ...toPersistenceDefaults() }
    });

    return {
        ensure,
        get: async () => serializeSiteAppearance(await ensure()),
        update: async (input) => {
            const data = normalizeSiteAppearanceInput(input);
            const appearance = await prisma.siteAppearance.upsert({
                where: { id: SITE_APPEARANCE_ROW_ID },
                update: data,
                create: { id: SITE_APPEARANCE_ROW_ID, ...data }
            });
            return serializeSiteAppearance(appearance);
        }
    };
};

const createSiteAppearanceRouter = ({ service, io, requireHttpAuth, requireAdmin, mediaStorage }) => {
    const router = express.Router();

    if (mediaStorage) {
        router.post(
            '/admin/site-media',
            requireHttpAuth,
            requireAdmin,
            express.raw({ type: () => true, limit: '100mb' }),
            async (req, res) => {
                try {
                    const processed = await processSiteMediaUpload({
                        buffer: req.body,
                        mimeType: req.headers['content-type'],
                        resolution: req.headers['x-media-resolution'],
                        quality: req.headers['x-media-quality'],
                        format: req.headers['x-media-format']
                    });
                    const media = await mediaStorage.store({
                        buffer: processed.buffer,
                        mimeType: processed.mimeType,
                        originalName: req.headers['x-file-name']
                    });
                    return res.status(201).json({ media, processing: processed.processing });
                } catch (error) {
                    if (error.diagnostics) console.error('Site media processing error:', error.diagnostics);
                    return res.status(400).json({ message: error.message || '媒体文件上传失败。' });
                }
            }
        );
    }

    router.get('/site-appearance', async (req, res) => {
        try {
            return res.json({ appearance: await service.get() });
        } catch (error) {
            console.error('Get site appearance error:', error);
            return res.status(500).json({ message: 'Failed to load site appearance.' });
        }
    });

    router.patch('/admin/site-appearance', requireHttpAuth, requireAdmin, async (req, res) => {
        try {
            const previousAppearance = await service.get();
            const appearance = await service.update(req.body);
            if (mediaStorage) {
                const retainedUrls = new Set(appearance.backgroundMediaLibrary.map((item) => item.url));
                const removedUrls = previousAppearance.backgroundMediaLibrary
                    .filter((item) => item.source === 'upload' && !retainedUrls.has(item.url))
                    .map((item) => item.url);
                await Promise.allSettled(removedUrls.map((url) => mediaStorage.remove(url)));
            }
            io.emit('siteAppearanceUpdated', appearance);
            return res.json({ appearance });
        } catch (error) {
            console.error('Admin update site appearance error:', error);
            return res.status(400).json({
                message: error.message || 'Failed to update site appearance.'
            });
        }
    });

    return router;
};

module.exports = {
    DEFAULT_SITE_APPEARANCE,
    createSiteAppearanceRouter,
    createSiteAppearanceService,
    normalizeSiteAppearanceInput,
    normalizeBackgroundMediaLibrary,
    serializeSiteAppearance
};
