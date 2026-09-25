const {
    DEFAULT_SITE_APPEARANCE,
    createSiteAppearanceService,
    normalizeSiteAppearanceInput,
    serializeSiteAppearance
} = require('../siteAppearance');

const createAppearancePrisma = (initial = {}) => {
    let row = {
        id: 1,
        ...DEFAULT_SITE_APPEARANCE,
        backgroundMediaLibrary: '[]',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...initial
    };
    return {
        siteAppearance: {
            upsert: jest.fn().mockImplementation(async () => row),
            findUnique: jest.fn().mockImplementation(async () => row),
            updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
                if (where.updatedAt.getTime() !== row.updatedAt.getTime()) return { count: 0 };
                row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1000) };
                return { count: 1 };
            })
        }
    };
};

describe('site appearance service', () => {
    test('ensures the singleton row with canonical defaults', async () => {
        const upsert = jest.fn().mockResolvedValue({ id: 1, ...DEFAULT_SITE_APPEARANCE });
        const service = createSiteAppearanceService({ siteAppearance: { upsert } });

        await service.ensure();

        expect(upsert).toHaveBeenCalledWith({
            where: { id: 1 },
            update: {},
            create: {
                id: 1,
                ...DEFAULT_SITE_APPEARANCE,
                backgroundMediaLibrary: '[]'
            }
        });
    });

    test('normalizes and clamps update values before persistence', async () => {
        const prisma = createAppearancePrisma();
        const service = createSiteAppearanceService(prisma);

        const appearance = await service.update({
            expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
            backgroundMode: 'image',
            backgroundPreset: 'unknown',
            backgroundImageUrl: ' https://example.com/bg.png ',
            backgroundBlur: 99,
            backgroundOpacity: -5,
            panelOpacity: 120,
            panelBlur: 18.4,
            panelGlow: 31
        });

        expect(prisma.siteAppearance.updateMany).toHaveBeenCalledWith({
            where: { id: 1, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
            data: expect.objectContaining({
                backgroundMode: 'media',
                backgroundPreset: 'aurora',
                backgroundImageUrl: 'https://example.com/bg.png',
                backgroundBlur: 40,
                backgroundOpacity: 0,
                panelOpacity: 100,
                panelBlur: 18,
                panelGlow: 30
            })
        });
        expect(appearance.backgroundImageUrl).toBe('https://example.com/bg.png');
    });

    test('rejects unsupported background URL schemes', () => {
        expect(() => normalizeSiteAppearanceInput({
            backgroundImageUrl: 'javascript:alert(1)'
        })).toThrow('Background media must be an http(s), data:image, or site-relative URL.');
    });

    test('accepts supported embedded background images', () => {
        expect(normalizeSiteAppearanceInput({
            backgroundMode: 'image',
            backgroundImageUrl: 'data:image/webp;base64,AAAA'
        }).backgroundImageUrl).toBe('data:image/webp;base64,AAAA');
    });

    test('rejects malformed or oversized embedded images', () => {
        expect(() => normalizeSiteAppearanceInput({
            backgroundImageUrl: 'data:image/svg+xml;base64,AAAA'
        })).toThrow('supported Base64 raster image');

        expect(() => normalizeSiteAppearanceInput({
            backgroundImageUrl: `data:image/webp;base64,${'A'.repeat(300000)}`
        })).toThrow('too large');
    });

    test('serializes nullable database values to the public contract', () => {
        expect(serializeSiteAppearance({ backgroundImageUrl: null })).toEqual({
            ...DEFAULT_SITE_APPEARANCE,
            backgroundImageUrl: '',
            backgroundMode: 'preset',
            updatedAt: null
        });
    });

    test('normalizes a media library and derives the selected media contract', () => {
        const normalized = normalizeSiteAppearanceInput({
            backgroundMode: 'media',
            backgroundMediaId: 'night-flight',
            backgroundMediaLibrary: [{
                id: 'night-flight',
                name: '夜航',
                type: 'video',
                source: 'url',
                url: 'https://example.com/night.mp4'
            }]
        });

        expect(normalized).toEqual(expect.objectContaining({
            backgroundMode: 'media',
            backgroundMediaId: 'night-flight',
            backgroundMediaType: 'video',
            backgroundImageUrl: 'https://example.com/night.mp4',
            backgroundMediaLibrary: JSON.stringify([{
                id: 'night-flight',
                name: '夜航',
                type: 'video',
                source: 'url',
                url: 'https://example.com/night.mp4'
            }])
        }));
    });

    test('persists the selected uploaded media and restores it on the next read', async () => {
        const service = createSiteAppearanceService(createAppearancePrisma());
        const media = {
            id: 'uploaded-background',
            name: '夜航背景.webp',
            type: 'image',
            source: 'upload',
            url: '/site-media/uploaded-background.webp',
            size: 234567
        };

        await service.update({
            expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
            ...DEFAULT_SITE_APPEARANCE,
            backgroundMode: 'media',
            backgroundMediaId: media.id,
            backgroundMediaLibrary: [media]
        });
        const restored = await service.get();

        expect(restored).toEqual(expect.objectContaining({
            backgroundMode: 'media',
            backgroundImageUrl: media.url,
            backgroundMediaType: 'image',
            backgroundMediaId: media.id,
            backgroundMediaLibrary: [media]
        }));
    });

    test('partial updates keep existing media and reject stale saves', async () => {
        const media = { id: 'saved', name: '已保存', type: 'image', url: 'https://example.com/bg.png' };
        const prisma = createAppearancePrisma({ backgroundMediaLibrary: JSON.stringify([media]) });
        const service = createSiteAppearanceService(prisma);

        await expect(service.update({ backgroundBlur: 12 })).rejects.toThrow('站点背景已更新');
        const updated = await service.update({
            expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
            backgroundBlur: 12
        });

        expect(updated.backgroundMediaLibrary).toHaveLength(1);
        expect(updated.backgroundBlur).toBe(12);
        await expect(service.update({
            expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
            backgroundMediaLibrary: []
        })).rejects.toThrow('站点背景已更新');
        expect(prisma.siteAppearance.updateMany).toHaveBeenCalledTimes(1);
    });
});
