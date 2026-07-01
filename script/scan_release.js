const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const rootDir = path.join(__dirname, '..');
const releaseDir = path.join(rootDir, 'dist_release');
const zipPath = path.join(rootDir, 'anydrop_release.zip');

const forbiddenBasenames = new Set(['.env']);
const forbiddenExtensions = new Set([
    '.db',
    '.db-journal',
    '.db-shm',
    '.db-wal',
    '.sqlite',
    '.sqlite-journal',
    '.sqlite-shm',
    '.sqlite-wal',
    '.sqlite3'
]);
const requiredReleaseFiles = [
    'release_info.json',
    '.release_version',
    'public/index.html',
    'start_app.sh',
    'start_app.bat',
    'start_app_nodocker.sh',
    'start_app_nodocker.bat',
    'update_app.sh',
    'update_app.bat'
];
const forbiddenTextPatterns = [
    { label: 'default TURN credential', pattern: /jinvoice:jinvoice2024|jinvoice2024/u },
    { label: 'GitHub token variable', pattern: /GHCR_TOKEN|gho_[A-Za-z0-9_]+/u }
];

const textExtensions = new Set([
    '.bat',
    '.cmd',
    '.css',
    '.html',
    '.js',
    '.json',
    '.md',
    '.mjs',
    '.sh',
    '.txt',
    '.yaml',
    '.yml'
]);

const failures = [];

const fail = (message) => {
    failures.push(message);
};

const shouldCheckText = (filePath) => textExtensions.has(path.extname(filePath).toLowerCase());

const scanFileName = (filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    const basename = path.basename(normalized);
    const ext = path.extname(basename).toLowerCase();

    if (forbiddenBasenames.has(basename) || forbiddenExtensions.has(ext)) {
        fail(`Forbidden file in release: ${normalized}`);
    }
};

const scanText = (label, text) => {
    for (const rule of forbiddenTextPatterns) {
        if (rule.pattern.test(text)) {
            fail(`Forbidden ${rule.label} found in ${label}`);
        }
    }
};

const scanDirectory = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fail(`Release directory not found: ${dirPath}`);
        return;
    }

    for (const requiredFile of requiredReleaseFiles) {
        if (!fs.existsSync(path.join(dirPath, requiredFile))) {
            fail(`Required release file missing: dist_release/${requiredFile}`);
        }
    }

    const walk = (currentPath) => {
        const stats = fs.statSync(currentPath);

        if (stats.isDirectory()) {
            for (const entry of fs.readdirSync(currentPath)) {
                walk(path.join(currentPath, entry));
            }
            return;
        }

        const relativePath = path.relative(rootDir, currentPath);
        scanFileName(relativePath);

        if (shouldCheckText(currentPath)) {
            scanText(relativePath, fs.readFileSync(currentPath, 'utf8'));
        }
    };

    walk(dirPath);
};

const readZipEntries = (buffer) => {
    const entries = [];
    let offset = 0;

    while (offset < buffer.length) {
        const signature = buffer.readUInt32LE(offset);
        if (signature !== 0x04034b50) break;

        const compressionMethod = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLength = buffer.readUInt16LE(offset + 26);
        const extraLength = buffer.readUInt16LE(offset + 28);
        const fileNameStart = offset + 30;
        const fileNameEnd = fileNameStart + fileNameLength;
        const dataStart = fileNameEnd + extraLength;
        const dataEnd = dataStart + compressedSize;
        const name = buffer.toString('utf8', fileNameStart, fileNameEnd).replace(/\\/g, '/');
        const compressedData = buffer.subarray(dataStart, dataEnd);

        entries.push({ name, compressionMethod, compressedData });
        offset = dataEnd;
    }

    return entries;
};

const scanZip = (archivePath) => {
    if (!fs.existsSync(archivePath)) {
        fail(`Release archive not found: ${archivePath}`);
        return;
    }

    const entries = readZipEntries(fs.readFileSync(archivePath));
    if (entries.length === 0) {
        fail(`No readable zip entries found: ${archivePath}`);
        return;
    }

    const entryNames = new Set(entries.map((entry) => entry.name));
    for (const requiredFile of requiredReleaseFiles) {
        if (!entryNames.has(`dist_release/${requiredFile}`)) {
            fail(`Required release file missing from archive: dist_release/${requiredFile}`);
        }
    }

    for (const entry of entries) {
        scanFileName(entry.name);

        if (!shouldCheckText(entry.name)) continue;

        if (entry.compressionMethod === 0) {
            scanText(entry.name, entry.compressedData.toString('utf8'));
        } else if (entry.compressionMethod === 8) {
            scanText(entry.name, zlib.inflateRawSync(entry.compressedData).toString('utf8'));
        }
    }
};

scanDirectory(releaseDir);
scanZip(zipPath);

if (failures.length > 0) {
    console.error('Release scan failed:');
    failures.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
}

console.log('Release scan passed.');
