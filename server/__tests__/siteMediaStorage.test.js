const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createSiteMediaStorage, normalizeFileName } = require('../siteMediaStorage');

describe('site media storage', () => {
    let directory;
    let storage;

    beforeEach(async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jinvoice-media-'));
        storage = createSiteMediaStorage(directory);
    });

    afterEach(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    test('stores supported video with a generated safe URL', async () => {
        const sourcePath = path.join(directory, 'source-video.mp4');
        await fs.writeFile(sourcePath, Buffer.from('video'));
        const media = await storage.storeFile({
            filePath: sourcePath,
            mimeType: 'video/mp4',
            originalName: encodeURIComponent('夜航背景.mp4')
        });

        expect(media).toEqual(expect.objectContaining({
            name: '夜航背景.mp4',
            type: 'video',
            source: 'upload',
            size: Buffer.byteLength('video')
        }));
        expect(media.url).toMatch(/^\/site-media\/[a-f0-9-]+\.mp4$/);
        await expect(fs.readFile(path.join(directory, path.basename(media.url)))).resolves.toEqual(Buffer.from('video'));
    });

    test('rejects unsupported media and safely removes managed files', async () => {
        const sourcePath = path.join(directory, 'source-image.png');
        await fs.writeFile(sourcePath, Buffer.from('image'));
        await expect(storage.storeFile({
            filePath: sourcePath,
            mimeType: 'video/quicktime',
            originalName: 'clip.mov'
        })).rejects.toThrow('仅支持');

        const media = await storage.storeFile({
            filePath: sourcePath,
            mimeType: 'image/png',
            originalName: 'background.png'
        });
        await expect(storage.remove(media.url)).resolves.toBe(true);
        await expect(storage.remove('/other/file.png')).resolves.toBe(false);
    });

    test('normalizes MIME parameters while storing a streamed file', async () => {
        const sourcePath = path.join(directory, 'source-browser-video.webm');
        await fs.writeFile(sourcePath, Buffer.from('browser-video'));
        const media = await storage.storeFile({
            filePath: sourcePath,
            mimeType: 'video/webm;codecs=vp9',
            originalName: 'compressed.webm'
        });

        expect(media.type).toBe('video');
        expect(media.size).toBe(Buffer.byteLength('browser-video'));
    });

    test('normalizes unsafe display file names', () => {
        expect(normalizeFileName('../bad<name>.mp4')).toBe('badname.mp4');
    });
});
