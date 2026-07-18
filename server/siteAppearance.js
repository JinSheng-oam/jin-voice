const express = require('express');

const SITE_APPEARANCE_ROW_ID = 1;
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

const normalizeBackgroundMode = (mode = '') => (mode === 'image' ? 'image' : 'preset');
const normalizeBackgroundPreset = (preset = '') => (
    SITE_BACKGROUND_PRESETS.has(preset) ? preset : DEFAULT_SITE_APPEARANCE.backgroundPreset
);
const normalizeBackgroundImageUrl = (imageUrl = '') => {
    const normalized = String(imageUrl || '').trim();
    if (!normalized) return null;
    if (normalized.length > 2048) throw new Error('Background image URL is too long.');
    if (
        normalized.startsWith('http://') ||
        normalized.startsWith('https://') ||
        normalized.startsWith('data:image/') ||
        normalized.startsWith('/')
    ) {
        return normalized;
    }
    throw new Error('Background image must be an http(s), data:image, or site-relative URL.');
};
const normalizeNumber = (value, fallback, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : fallback;
};
const serializeSiteAppearance = (appearance) => ({
    backgroundMode: normalizeBackgroundMode(appearance?.backgroundMode),
    backgroundPreset: normalizeBackgroundPreset(appearance?.backgroundPreset),
    backgroundImageUrl: appearance?.backgroundImageUrl || '',
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
});

const normalizeSiteAppearanceInput = (input = {}) => ({
    backgroundMode: normalizeBackgroundMode(input.backgroundMode),
    backgroundPreset: normalizeBackgroundPreset(input.backgroundPreset),
    backgroundImageUrl: normalizeBackgroundImageUrl(input.backgroundImageUrl),
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
});

const createSiteAppearanceService = (prisma) => {
    const ensure = () => prisma.siteAppearance.upsert({
        where: { id: SITE_APPEARANCE_ROW_ID },
        update: {},
        create: { id: SITE_APPEARANCE_ROW_ID, ...DEFAULT_SITE_APPEARANCE }
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

const createSiteAppearanceRouter = ({ service, io, requireHttpAuth, requireAdmin }) => {
    const router = express.Router();

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
            const appearance = await service.update(req.body);
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
    serializeSiteAppearance
};
