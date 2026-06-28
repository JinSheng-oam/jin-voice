const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronCommand = process.platform === 'win32'
    ? path.join(rootDir, 'node_modules', '.bin', 'electron.cmd')
    : path.join(rootDir, 'node_modules', '.bin', 'electron');

const children = new Set();

const spawnManaged = (command, args, options = {}) => {
    const child = spawn(command, args, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
        ...options
    });

    children.add(child);
    child.on('exit', () => children.delete(child));
    return child;
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
    for (const child of children) {
        child.kill();
    }
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
    spawnManaged(npmCommand, ['--prefix', 'client', 'run', 'dev']);
    await waitForPort(5173);

    const electron = spawnManaged(electronCommand, ['desktop/main.cjs', '--dev'], {
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
