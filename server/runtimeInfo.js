const fs = require('fs');
const path = require('path');

const readJsonFileIfExists = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
};

const getRuntimeVersionInfo = ({
    baseDir = __dirname,
    env = process.env
} = {}) => {
    const releaseInfo = readJsonFileIfExists(path.join(baseDir, 'release_info.json')) ||
        readJsonFileIfExists(path.join(baseDir, '..', 'release_info.json'));
    const packageInfo = readJsonFileIfExists(path.join(baseDir, '..', 'package.json'));

    return {
        version: env.JINVOICE_VERSION || releaseInfo?.version || packageInfo?.version || 'local',
        gitCommit: env.JINVOICE_COMMIT || releaseInfo?.gitCommit || null,
        gitBranch: env.JINVOICE_BRANCH || releaseInfo?.gitBranch || null,
        builtAt: releaseInfo?.builtAt || null
    };
};

module.exports = {
    getRuntimeVersionInfo,
    readJsonFileIfExists
};
