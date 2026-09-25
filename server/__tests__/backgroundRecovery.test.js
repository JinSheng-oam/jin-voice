const { mergeBackgroundMediaLibraries } = require('../backgroundRecovery');

const media = (id, url) => ({ id, name: id, type: 'image', url });

describe('background media recovery', () => {
    test('adds only missing URLs without changing existing entries', () => {
        const current = [media('current', 'https://example.com/current.png')];
        const recovered = [
            media('old-name', 'https://example.com/current.png'),
            media('new-link', 'https://example.com/new.png')
        ];

        const result = mergeBackgroundMediaLibraries(current, recovered);

        expect(result.added).toBe(1);
        expect(result.library[0]).toEqual({ ...current[0], source: 'url' });
        expect(result.library[1].url).toBe('https://example.com/new.png');
    });

    test('skips uploads whose file was not rescued', () => {
        const result = mergeBackgroundMediaLibraries([], [
            media('missing', '/site-media/missing.webp'),
            media('present', '/site-media/present.webp')
        ], (item) => item.id === 'present');

        expect(result.added).toBe(1);
        expect(result.missingFiles).toBe(1);
        expect(result.library[0].source).toBe('upload');
    });

    test('keeps both URLs when recovered IDs conflict', () => {
        const result = mergeBackgroundMediaLibraries(
            [media('shared', 'https://example.com/first.png')],
            [media('shared', 'https://example.com/second.png')]
        );

        expect(result.library).toHaveLength(2);
        expect(result.library[1].id).not.toBe('shared');
    });

    test('rejects a merge exceeding the media library limit', () => {
        const current = Array.from({ length: 24 }, (_, index) => (
            media(`item-${index}`, `https://example.com/${index}.png`)
        ));

        expect(() => mergeBackgroundMediaLibraries(current, [
            media('extra', 'https://example.com/extra.png')
        ])).toThrow('cannot exceed 24 items');
    });
});
