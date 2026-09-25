const fs = require('fs/promises');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { mergeBackgroundMediaLibraries } = require('../backgroundRecovery');
const { serializeSiteAppearance } = require('../siteAppearance');

const apply = process.argv.includes('--apply');
const dataDir = path.resolve(__dirname, '..', 'data');

const main = async () => {
    const directories = (await fs.readdir(dataDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('recovery-'))
        .map((entry) => path.join(dataDir, entry.name))
        .sort();
    const currentPrisma = new PrismaClient();

    try {
        const currentRow = await currentPrisma.siteAppearance.findUnique({ where: { id: 1 } });
        if (!currentRow) throw new Error('Current site appearance is missing. No changes made.');

        const current = serializeSiteAppearance(currentRow).backgroundMediaLibrary;
        const recovered = [];
        let recoveryDatabases = 0;
        for (const directory of directories) {
            for (const source of ['host-database', 'container-data']) {
                const databasePath = path.join(directory, source, 'dev.db');
                try {
                    await fs.access(databasePath);
                } catch {
                    continue;
                }

                const recoveryPrisma = new PrismaClient({
                    datasources: { db: { url: `file:${databasePath}` } }
                });
                try {
                    const row = await recoveryPrisma.siteAppearance.findUnique({ where: { id: 1 } });
                    if (row) recovered.push(...serializeSiteAppearance(row).backgroundMediaLibrary);
                    recoveryDatabases += 1;
                } finally {
                    await recoveryPrisma.$disconnect();
                }
            }
        }

        const availableFiles = new Set(await fs.readdir(path.join(dataDir, 'site-media')).catch((error) => {
            if (error.code === 'ENOENT') return [];
            throw error;
        }));
        const result = mergeBackgroundMediaLibraries(current, recovered, (item) => (
            availableFiles.has(path.basename(item.url))
        ));

        let backupPath = null;
        if (apply && result.added > 0) {
            backupPath = path.join(dataDir, `background-library-before-merge-${Date.now()}.json`);
            await fs.writeFile(backupPath, JSON.stringify({
                updatedAt: currentRow.updatedAt,
                backgroundMediaLibrary: currentRow.backgroundMediaLibrary
            }), { flag: 'wx', mode: 0o600 });

            const update = await currentPrisma.siteAppearance.updateMany({
                where: { id: 1, updatedAt: currentRow.updatedAt },
                data: { backgroundMediaLibrary: JSON.stringify(result.library) }
            });
            if (update.count !== 1) throw new Error('Site appearance changed during recovery. No merge applied.');
        }

        console.log(JSON.stringify({
            recoveryDatabases,
            currentItems: current.length,
            recoveredItems: recovered.length,
            addableItems: result.added,
            missingFiles: result.missingFiles,
            applied: apply && result.added > 0,
            backupPath
        }));
    } finally {
        await currentPrisma.$disconnect();
    }
};

main().catch((error) => {
    console.error('[Background recovery]', error.message);
    process.exitCode = 1;
});
