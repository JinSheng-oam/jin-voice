const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');

const quoteWindowsArg = (value) => {
    if (!/[\s"]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
};

const runPrisma = (args, { allowFailure = false, silent = false } = {}) => {
    const cwd = path.join(__dirname, '..');
    const result = process.platform === 'win32'
        ? spawnSync(
            process.env.ComSpec || 'cmd.exe',
            ['/d', '/s', '/c', ['npx', 'prisma', ...args].map(quoteWindowsArg).join(' ')],
            { cwd, encoding: 'utf8', shell: false }
        )
        : spawnSync('npx', ['prisma', ...args], {
            cwd,
            encoding: 'utf8',
            shell: false
        });

    if (!silent && result.stdout) process.stdout.write(result.stdout);
    if (!silent && result.stderr) process.stderr.write(result.stderr);

    if (result.error) {
        console.error(`[Prisma] Failed to run npx prisma ${args.join(' ')}:`, result.error.message);
        if (!allowFailure) {
            process.exit(1);
        }
    }

    if (!allowFailure && result.status !== 0) {
        process.exit(result.status || 1);
    }

    return result;
};

const listMigrationNames = () => fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const deployResult = runPrisma(['migrate', 'deploy'], { allowFailure: true, silent: true });

if (deployResult.status === 0) {
    if (deployResult.stdout) process.stdout.write(deployResult.stdout);
    if (deployResult.stderr) process.stderr.write(deployResult.stderr);
    process.exit(0);
}

const combinedOutput = `${deployResult.stdout || ''}\n${deployResult.stderr || ''}`;
if (!combinedOutput.includes('P3005')) {
    if (deployResult.stdout) process.stdout.write(deployResult.stdout);
    if (deployResult.stderr) process.stderr.write(deployResult.stderr);
    process.exit(deployResult.status || 1);
}

console.warn('[Prisma] Existing database has no migration baseline. Marking bundled migrations as applied.');

for (const migrationName of listMigrationNames()) {
    runPrisma(['migrate', 'resolve', '--applied', migrationName]);
}

runPrisma(['migrate', 'deploy']);
