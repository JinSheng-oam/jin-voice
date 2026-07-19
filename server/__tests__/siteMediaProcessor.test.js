const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const {
    buildScaleFilter,
    buildVideoTranscodeArgs,
    normalizeVideoProcessingOptions,
    streamUploadToFile
} = require('../siteMediaProcessor');

describe('site media processor', () => {
    test('normalizes video processing options to supported bounds', () => {
        expect(normalizeVideoProcessingOptions({ resolution: '720', quality: 110, format: 'webm' })).toEqual({
            resolution: '720',
            quality: 100,
            format: 'webm'
        });
        expect(normalizeVideoProcessingOptions({ resolution: '4k', quality: 1, format: 'avi' })).toEqual({
            resolution: '1080',
            quality: 20,
            format: 'mp4'
        });
    });

    test('builds aspect-ratio-safe scale filters and codec arguments', () => {
        expect(buildScaleFilter('native')).toBeNull();
        expect(buildScaleFilter('720')).toContain('1280');
        expect(buildScaleFilter('720')).toContain('force_divisible_by=2');

        const mp4Args = buildVideoTranscodeArgs({
            inputPath: 'input.webm',
            outputPath: 'output.mp4',
            resolution: '720',
            format: 'mp4',
            quality: 80
        });
        expect(mp4Args).toEqual(expect.arrayContaining(['-an', '-vf', '-c:v', 'libx264', '-crf', '23', '+faststart']));
        expect(mp4Args.at(-1)).toBe('output.mp4');

        const webmArgs = buildVideoTranscodeArgs({
            inputPath: 'input.mp4',
            outputPath: 'output.webm',
            resolution: 'native',
            format: 'webm',
            quality: 80
        });
        expect(webmArgs).toEqual(expect.arrayContaining(['-c:v', 'libvpx-vp9', '-crf', '22', '-b:v', '0']));
        expect(webmArgs).not.toContain('-vf');
    });

    test('streams upload chunks to disk without aggregating a request buffer', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jinvoice-stream-test-'));
        const outputPath = path.join(directory, 'upload.webm');
        try {
            await expect(streamUploadToFile(
                Readable.from([Buffer.from('stream-'), Buffer.from('body')]),
                outputPath,
                32
            )).resolves.toBe(11);
            await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe('stream-body');
        } finally {
            await fs.rm(directory, { recursive: true, force: true });
        }
    });

    test('removes a partial temporary file when the upload exceeds its limit', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jinvoice-stream-limit-'));
        const outputPath = path.join(directory, 'oversized.webm');
        try {
            await expect(streamUploadToFile(
                Readable.from([Buffer.alloc(8), Buffer.alloc(8)]),
                outputPath,
                10
            )).rejects.toMatchObject({ statusCode: 413 });
            await expect(fs.stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await fs.rm(directory, { recursive: true, force: true });
        }
    });
});
