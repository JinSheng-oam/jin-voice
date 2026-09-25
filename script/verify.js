const { spawnSync } = require('child_process');

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const nodeCommand = process.execPath;
const commandShell = process.env.ComSpec || 'cmd.exe';

const quoteWindowsArg = (value) => {
    if (!/[\s"]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
};

const runCommand = (command, args) => {
    if (process.platform !== 'win32' || command !== pnpmCommand) {
        return spawnSync(command, args, {
            cwd: process.cwd(),
            stdio: 'inherit',
            shell: false
        });
    }

    return spawnSync(
        commandShell,
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
    ['Check runtime info syntax', nodeCommand, ['--check', 'server/runtimeInfo.js']],
    ['Check desktop main syntax', nodeCommand, ['--check', 'desktop/main.cjs']],
    ['Check desktop preload syntax', nodeCommand, ['--check', 'desktop/preload.cjs']],
    ['Check migration helper syntax', nodeCommand, ['--check', 'server/scripts/deploy-migrate.js']],
    ['Check background recovery syntax', nodeCommand, ['--check', 'server/scripts/recover-background-library.js']],
    ['Check build script syntax', nodeCommand, ['--check', 'script/build.js']],
    ['Check release scan syntax', nodeCommand, ['--check', 'script/scan_release.js']],
    ['Check load test syntax', nodeCommand, ['--check', 'script/load-test.js']],
    ['Check Windows update verifier syntax', nodeCommand, ['--check', 'script/verify-update-bat.js']],
    // 工作区共用一份锁文件，一次 audit 已覆盖 root / client / server；--registry 用于绕过本地镜像缺少审计接口的问题
    ['Audit production dependencies', pnpmCommand, ['audit', '--prod', '--registry=https://registry.npmjs.org', '--audit-level=high']],
    ['Run tests', pnpmCommand, ['test']],
    ['Validate load test CLI', pnpmCommand, ['run', 'load:test', '--', '--dry-run']],
    ['Lint client', pnpmCommand, ['--prefix', 'client', 'run', 'lint']],
    ['Build client', pnpmCommand, ['--prefix', 'client', 'run', 'build']]
];

if (process.platform === 'win32') {
    const insertAfterIndex = steps.findIndex(([label]) => label === 'Check Windows update verifier syntax') + 1;
    steps.splice(
        insertAfterIndex > 0 ? insertAfterIndex : steps.length,
        0,
        ['Check Windows update script help', commandShell, ['/d', '/s', '/c', 'script\\update_app.bat --help']],
        ['Check Windows update script archive validation', nodeCommand, ['script/verify-update-bat.js']]
    );
}

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
