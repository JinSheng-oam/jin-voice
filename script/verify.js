const { spawnSync } = require('child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeCommand = process.execPath;

const quoteWindowsArg = (value) => {
    if (!/[\s"]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
};

const runCommand = (command, args) => {
    if (process.platform !== 'win32' || command !== npmCommand) {
        return spawnSync(command, args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: false
        });
    }

    return spawnSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', [command, ...args].map(quoteWindowsArg).join(' ')],
        {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: false
        }
    );
};

const steps = [
    ['Check server syntax', nodeCommand, ['--check', 'server/server.js']],
    ['Check migration helper syntax', nodeCommand, ['--check', 'server/scripts/deploy-migrate.js']],
    ['Check build script syntax', nodeCommand, ['--check', 'script/build.js']],
    ['Audit root production dependencies', npmCommand, ['audit', '--omit=dev']],
    ['Audit server production dependencies', npmCommand, ['--prefix', 'server', 'audit', '--omit=dev']],
    ['Audit client production dependencies', npmCommand, ['--prefix', 'client', 'audit', '--omit=dev']],
    ['Run tests', npmCommand, ['test']],
    ['Lint client', npmCommand, ['--prefix', 'client', 'run', 'lint']],
    ['Build client', npmCommand, ['--prefix', 'client', 'run', 'build']]
];

for (const [label, command, args] of steps) {
    console.log(`\n=== ${label} ===`);
    const result = runCommand(command, args);

    if (result.error) {
        console.error(result.error.message);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

console.log('\nVerification passed.');
