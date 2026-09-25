const crypto = require('crypto');
const { normalizeBackgroundMediaLibrary } = require('./siteAppearance');

const mergeBackgroundMediaLibraries = (current, recovered, isAvailable = () => true) => {
    const merged = [...current];
    const urls = new Set(current.map((item) => item.url));
    const ids = new Set(current.map((item) => item.id));
    let missingFiles = 0;

    for (const item of recovered) {
        if (urls.has(item.url)) continue;
        if (item.url.startsWith('/site-media/') && !isAvailable(item)) {
            missingFiles += 1;
            continue;
        }

        const id = ids.has(item.id) ? crypto.randomUUID() : item.id;
        merged.push({ ...item, id });
        urls.add(item.url);
        ids.add(id);
    }

    return {
        library: normalizeBackgroundMediaLibrary(merged),
        added: merged.length - current.length,
        missingFiles
    };
};

module.exports = { mergeBackgroundMediaLibraries };
