const {
    DEFAULT_SITE_APPEARANCE,
    createSiteAppearanceService,
    normalizeSiteAppearanceInput,
    serializeSiteAppearance
} = require('../siteAppearance');

describe('site appearance service', () => {
    test('ensures the singleton row with canonical defaults', async () => {
        const upsert = jest.fn().mockResolvedValue({ id: 1, ...DEFAULT_SITE_APPEARANCE });
        const service = createSiteAppearanceService({ siteAppearance: { upsert } });

        await service.ensure();

        expect(upsert).toHaveBeenCalledWith({
            where: { id: 1 },
            update: {},
            create: { id: 1, ...DEFAULT_SITE_APPEARANCE }
        });
    });

    test('normalizes and clamps update values before persistence', async () => {
        const upsert = jest.fn().mockImplementation(async ({ create }) => create);
        const service = createSiteAppearanceService({ siteAppearance: { upsert } });

        const appearance = await service.update({
            backgroundMode: 'image',
            backgroundPreset: 'unknown',
            backgroundImageUrl: ' https://example.com/bg.png ',
            backgroundBlur: 99,
            backgroundOpacity: -5,
            panelOpacity: 120,
            panelBlur: 18.4,
            panelGlow: 31
        });

        expect(upsert).toHaveBeenCalledWith({
            where: { id: 1 },
            update: {
                backgroundMode: 'image',
                backgroundPreset: 'aurora',
                backgroundImageUrl: 'https://example.com/bg.png',
                backgroundBlur: 40,
                backgroundOpacity: 0,
                panelOpacity: 100,
                panelBlur: 18,
                panelGlow: 30
            },
            create: expect.objectContaining({ id: 1 })
        });
        expect(appearance.backgroundImageUrl).toBe('https://example.com/bg.png');
    });

    test('rejects unsupported background URL schemes', () => {
        expect(() => normalizeSiteAppearanceInput({
            backgroundImageUrl: 'javascript:alert(1)'
        })).toThrow('Background image must be an http(s), data:image, or site-relative URL.');
    });

    test('serializes nullable database values to the public contract', () => {
        expect(serializeSiteAppearance({ backgroundImageUrl: null })).toEqual({
            ...DEFAULT_SITE_APPEARANCE,
            backgroundImageUrl: ''
        });
    });
});
