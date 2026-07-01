const fs = require('fs');
const os = require('os');
const path = require('path');
const { getRuntimeVersionInfo, readJsonFileIfExists } = require('../runtimeInfo');

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jinvoice-runtime-'));

describe('readJsonFileIfExists', () => {
    test('returns null for missing or invalid json files', () => {
        const dir = createTempDir();
        const invalidPath = path.join(dir, 'invalid.json');
        fs.writeFileSync(invalidPath, '{not-json', 'utf8');

        expect(readJsonFileIfExists(path.join(dir, 'missing.json'))).toBeNull();
        expect(readJsonFileIfExists(invalidPath)).toBeNull();
    });

    test('reads valid json files', () => {
        const dir = createTempDir();
        const filePath = path.join(dir, 'release_info.json');
        fs.writeFileSync(filePath, JSON.stringify({ version: '1.2.3' }), 'utf8');

        expect(readJsonFileIfExists(filePath)).toEqual({ version: '1.2.3' });
    });
});

describe('getRuntimeVersionInfo', () => {
    test('uses release_info.json from the runtime directory', () => {
        const dir = createTempDir();
        fs.writeFileSync(path.join(dir, 'release_info.json'), JSON.stringify({
            version: '1.2.3',
            gitCommit: 'abc123',
            gitBranch: 'main',
            builtAt: '2026-06-30T00:00:00.000Z'
        }), 'utf8');

        expect(getRuntimeVersionInfo({ baseDir: dir, env: {} })).toEqual({
            version: '1.2.3',
            gitCommit: 'abc123',
            gitBranch: 'main',
            builtAt: '2026-06-30T00:00:00.000Z'
        });
    });

    test('allows environment variables to override release version and git fields', () => {
        const dir = createTempDir();
        fs.writeFileSync(path.join(dir, 'release_info.json'), JSON.stringify({
            version: '1.2.3',
            gitCommit: 'abc123',
            gitBranch: 'main',
            builtAt: '2026-06-30T00:00:00.000Z'
        }), 'utf8');

        expect(getRuntimeVersionInfo({
            baseDir: dir,
            env: {
                JINVOICE_VERSION: '9.9.9',
                JINVOICE_COMMIT: 'override-commit',
                JINVOICE_BRANCH: 'release'
            }
        })).toEqual({
            version: '9.9.9',
            gitCommit: 'override-commit',
            gitBranch: 'release',
            builtAt: '2026-06-30T00:00:00.000Z'
        });
    });

    test('falls back to package version or local when release info is absent', () => {
        const dir = createTempDir();
        const childDir = path.join(dir, 'server');
        fs.mkdirSync(childDir);
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.1.0' }), 'utf8');

        expect(getRuntimeVersionInfo({ baseDir: childDir, env: {} }).version).toBe('0.1.0');
        expect(getRuntimeVersionInfo({ baseDir: createTempDir(), env: {} }).version).toBe('local');
    });
});
