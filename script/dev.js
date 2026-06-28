const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');

const rootDir = path.join(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
const clientDir = path.join(rootDir, 'client');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const processes = [];
let shuttingDown = false;

const runBlockingNpm = (cwd, args) => {
    const child = spawnNpm(cwd, args);

    return new Promise((resolve, reject) => {
        pipeWithPrefix(child.stdout, path.basename(cwd), process.stdout);
        pipeWithPrefix(child.stderr, path.basename(cwd), process.stderr);

        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`${path.basename(cwd)} npm ${args.join(' ')} failed with code ${code}`));
        });

        child.on('error', reject);
    });
};

const quoteWindowsArg = (value) => {
    if (!/[\s"]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
};

const spawnNpm = (cwd, args, env = process.env) => {
    if (process.platform === 'win32') {
        return spawn(
            process.env.ComSpec || 'cmd.exe',
            ['/d', '/s', '/c', `${quoteWindowsArg(npmCommand)} ${args.map(quoteWindowsArg).join(' ')}`],
            {
                cwd,
                env,
                shell: false,
                windowsHide: false
            }
        );
    }

    return spawn(npmCommand, args, {
        cwd,
        env,
        shell: false,
        windowsHide: false
    });
};

const pipeWithPrefix = (stream, prefix, target) => {
    const rl = readline.createInterface({ input: stream });
    rl.on('line', (line) => {
        target.write(`[${prefix}] ${line}\n`);
    });
    return rl;
};

const stopAll = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const child of processes) {
        if (!child.killed) {
            child.kill('SIGINT');
        }
    }

    setTimeout(() => {
        for (const child of processes) {
            if (!child.killed) {
                child.kill('SIGTERM');
            }
        }
        process.exit(exitCode);
    }, 500);
};

const ensurePathExists = (targetPath) => fs.existsSync(targetPath);

const ensureDevPrerequisites = async () => {
    const clientModulesPath = path.join(clientDir, 'node_modules');
    const serverModulesPath = path.join(serverDir, 'node_modules');
    const prismaClientPath = path.join(serverDir, 'node_modules', '.prisma', 'client', 'default.js');

    if (!ensurePathExists(clientModulesPath)) {
        process.stdout.write('[dev] 前端 node_modules 缺失，正在安装依赖...\n');
        await runBlockingNpm(clientDir, ['install']);
    }

    if (!ensurePathExists(serverModulesPath) || !ensurePathExists(prismaClientPath)) {
        process.stdout.write('[dev] 后端依赖或 Prisma client 缺失，正在安装依赖...\n');
        await runBlockingNpm(serverDir, ['install']);
    }

    process.stdout.write('[dev] 同步 Prisma schema 到本地开发数据库\n');
    await runBlockingNpm(serverDir, ['run', 'db:push', '--', '--skip-generate']);
};

const buildProcessEnv = (name) => {
    const nextEnv = { ...process.env };

    if (name === 'server') {
        nextEnv.NODE_ENV = nextEnv.NODE_ENV || 'development';
        nextEnv.MEDIASOUP_LISTEN_IP = '127.0.0.1';
        nextEnv.MEDIASOUP_ANNOUNCED_IP = '127.0.0.1';
    }

    return nextEnv;
};

const startNamedProcess = (name, cwd, args) => {
    const child = spawnNpm(cwd, args, buildProcessEnv(name));

    processes.push(child);

    pipeWithPrefix(child.stdout, name, process.stdout);
    pipeWithPrefix(child.stderr, name, process.stderr);

    child.on('exit', (code) => {
        if (shuttingDown) return;

        const normalizedCode = typeof code === 'number' ? code : 1;
        const message = normalizedCode === 0
            ? `${name} 已退出`
            : `${name} 异常退出，代码: ${normalizedCode}`;

        process.stderr.write(`[dev] ${message}\n`);
        stopAll(normalizedCode);
    });
};

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

(async () => {
    try {
        await ensureDevPrerequisites();
        startNamedProcess('server', serverDir, ['run', 'dev']);
        startNamedProcess('client', clientDir, ['run', 'dev']);
    } catch (error) {
        process.stderr.write(`[dev] ${error.message}\n`);
        process.exit(1);
    }
})();
