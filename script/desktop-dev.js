const { spawn, spawnSync } = require('child_process');
const net = require('net');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const electronBinary = require('electron');

const children = new Set();
let shuttingDown = false;

const quoteWindowsArg = (value) => {
    if (!/[\s"]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
};

const registerChild = (child) => {
    children.add(child);
    child.on('exit', () => children.delete(child));
    return child;
};

const spawnPnpm = (args, options = {}) => {
    if (process.platform === 'win32') {
        const child = spawn(
            process.env.ComSpec || 'cmd.exe',
            ['/d', '/s', '/c', `${quoteWindowsArg(pnpmCommand)} ${args.map(quoteWindowsArg).join(' ')}`],
            {
                cwd: rootDir,
                stdio: 'inherit',
                shell: false,
                ...options
            }
        );
        return registerChild(child);
    }

    const child = spawn(pnpmCommand, args, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
        ...options
    });
    return registerChild(child);
};

const spawnManaged = (command, args, options = {}) => {
    const child = spawn(command, args, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
        ...options
    });

    return registerChild(child);
};

const killProcessTree = (child) => {
    if (!child || !child.pid) return;

    if (process.platform === 'win32') {
        try {
            spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true
            });
        } catch {
            /* noop */
        }
        return;
    }

    if (!child.killed) {
        child.kill('SIGTERM');
    }
};

const waitForPort = (port, host = '127.0.0.1', timeoutMs = 30000) => new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const tryConnect = () => {
        const socket = net.connect(port, host);
        socket.once('connect', () => {
            socket.end();
            resolve();
        });
        socket.once('error', () => {
            socket.destroy();
            if (Date.now() - startedAt > timeoutMs) {
                reject(new Error(`Timed out waiting for ${host}:${port}`));
                return;
            }
            setTimeout(tryConnect, 350);
        });
    };

    tryConnect();
});

const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
        killProcessTree(child);
    }
    children.clear();
};

process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
});
process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
});
process.on('exit', shutdown);

const main = async () => {
    spawnPnpm(['--prefix', 'client', 'run', 'dev']);
    await waitForPort(5173);

    const electron = spawnManaged(electronBinary, ['desktop/main.cjs', '--dev'], {
        env: {
            ...process.env,
            JINVOICE_DESKTOP_DEV: '1',
            JINVOICE_DESKTOP_DEV_URL: 'http://127.0.0.1:5173',
            JINVOICE_DESKTOP_SERVER_URL: process.env.JINVOICE_DESKTOP_SERVER_URL || 'https://voice.jinworld.cn'
        }
    });

    electron.on('exit', (code) => {
        shutdown();
        process.exit(code || 0);
    });
};

main().catch((error) => {
    console.error(error);
    shutdown();
    process.exit(1);
});
