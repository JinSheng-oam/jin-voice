const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { GlobalKeyboardListener } = require('node-global-key-listener');

const DEFAULT_SERVER_URL = 'https://voice.jinworld.cn';
const isDev = process.argv.includes('--dev') || process.env.JINVOICE_DESKTOP_DEV === '1';

let mainWindow = null;
let keyboardListener = null;
let currentAccelerator = 'Space';
let currentKeyName = 'SPACE';
let pushToTalkPressed = false;
let keyboardListenerReady = false;
let lastKeyboardError = null;

const productionRendererPath = path.resolve(__dirname, '..', 'client', 'dist', 'index.html');
const developmentRendererUrl = process.env.JINVOICE_DESKTOP_DEV_URL || 'http://127.0.0.1:5173';

const isSafeExternalUrl = (value) => {
    try {
        const protocol = new URL(value).protocol;
        return protocol === 'https:' || protocol === 'http:';
    } catch {
        return false;
    }
};

const isTrustedRendererUrl = (value) => {
    try {
        const candidate = new URL(value);
        if (isDev) {
            return candidate.origin === new URL(developmentRendererUrl).origin;
        }

        const productionUrl = new URL(pathToFileURL(productionRendererPath).toString());
        return candidate.protocol === 'file:' && candidate.pathname === productionUrl.pathname;
    } catch {
        return false;
    }
};

const codeToGlobalKeyName = (code = 'Space') => {
    if (typeof code !== 'string' || !code.trim()) return '';
    if (code === 'Space') return 'SPACE';
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return `NUMPAD ${code.slice(6)}`;

    const aliases = {
        ControlLeft: 'LEFT CTRL',
        ControlRight: 'RIGHT CTRL',
        AltLeft: 'LEFT ALT',
        AltRight: 'RIGHT ALT',
        ShiftLeft: 'LEFT SHIFT',
        ShiftRight: 'RIGHT SHIFT',
        MetaLeft: 'LEFT META',
        MetaRight: 'RIGHT META',
        Escape: 'ESCAPE',
        Enter: 'RETURN',
        Backspace: 'BACKSPACE',
        Tab: 'TAB',
        ArrowUp: 'UP ARROW',
        ArrowDown: 'DOWN ARROW',
        ArrowLeft: 'LEFT ARROW',
        ArrowRight: 'RIGHT ARROW',
        Backquote: '`',
        Minus: '-',
        Equal: '=',
        BracketLeft: '[',
        BracketRight: ']',
        Backslash: '\\',
        Semicolon: ';',
        Quote: '\'',
        Comma: ',',
        Period: '.',
        Slash: '/'
    };

    return aliases[code] || '';
};

const isMainWindowAlive = () => (
    Boolean(mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed())
);

const isTrustedIpcEvent = (event) => {
    if (!isMainWindowAlive() || event?.sender !== mainWindow.webContents) {
        return false;
    }
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    return isTrustedRendererUrl(senderUrl);
};

const sendPushToTalkState = (pressed) => {
    if (pushToTalkPressed === pressed) return;
    pushToTalkPressed = pressed;
    if (isMainWindowAlive()) {
        mainWindow.webContents.send('push-to-talk-change', { pressed });
    }
};

const stopKeyboardListener = () => {
    if (!keyboardListener) return;

    try {
        keyboardListener.kill?.();
    } catch {
        /* noop */
    }

    keyboardListener = null;
    keyboardListenerReady = false;
    pushToTalkPressed = false;
};

const startKeyboardListener = () => {
    stopKeyboardListener();

    let instance = null;
    try {
        instance = new GlobalKeyboardListener({
            windows: {
                onError: (errorCode) => {
                    lastKeyboardError = String(errorCode);
                    keyboardListenerReady = false;
                    console.error(`[GlobalKeyboard] error: ${errorCode}`);
                },
                onInfo: (info) => console.info(`[GlobalKeyboard] ${info}`)
            }
        });
    } catch (error) {
        lastKeyboardError = error?.message || String(error);
        keyboardListenerReady = false;
        console.error('[GlobalKeyboard] failed to initialize:', error);
        return;
    }

    keyboardListener = instance;
    keyboardListenerReady = false;
    lastKeyboardError = null;

    const addPromise = instance.addListener((event) => {
        if (event.name !== currentKeyName) {
            return false;
        }

        sendPushToTalkState(event.state === 'DOWN');
        return false;
    });

    Promise.resolve(addPromise)
        .then(() => {
            if (keyboardListener === instance && !lastKeyboardError) {
                keyboardListenerReady = true;
            }
        })
        .catch((error) => {
            if (keyboardListener === instance) {
                lastKeyboardError = error?.message || String(error);
                keyboardListenerReady = false;
            }
            console.error('[GlobalKeyboard] addListener failed:', error);
        });
};

const createWindow = async () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 620,
        title: 'JinVoice',
        backgroundColor: '#101827',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            void shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    const preventUntrustedNavigation = (event, url) => {
        if (isTrustedRendererUrl(url)) return;
        event.preventDefault();
        if (isSafeExternalUrl(url)) {
            void shell.openExternal(url);
        }
    };

    mainWindow.webContents.on('will-navigate', preventUntrustedNavigation);
    mainWindow.webContents.on('will-redirect', preventUntrustedNavigation);

    if (isDev) {
        await mainWindow.loadURL(developmentRendererUrl);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        await mainWindow.loadFile(productionRendererPath);
    }
};

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const configurePermissions = () => {
    const isTrustedWebContents = (webContents) => (
        webContents === mainWindow?.webContents && isTrustedRendererUrl(webContents.getURL())
    );

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(permission === 'media' && isTrustedWebContents(webContents));
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
        permission === 'media' && isTrustedWebContents(webContents)
    ));
};

app.whenReady().then(async () => {
    configurePermissions();

    ipcMain.handle('push-to-talk:set-accelerator', (event, code) => {
        if (!isTrustedIpcEvent(event)) {
            return { ok: false, error: 'Untrusted IPC sender.' };
        }
        const normalizedCode = typeof code === 'string' && code.trim() ? code.trim() : 'Space';
        const nextKeyName = codeToGlobalKeyName(normalizedCode);
        if (!nextKeyName) {
            return { ok: false, error: 'Unsupported shortcut key.' };
        }

        currentAccelerator = normalizedCode;
        currentKeyName = nextKeyName;
        sendPushToTalkState(false);
        return { ok: true, accelerator: currentAccelerator, keyName: currentKeyName };
    });

    ipcMain.handle('push-to-talk:get-accelerator', (event) => {
        if (!isTrustedIpcEvent(event)) {
            return { ok: false, error: 'Untrusted IPC sender.' };
        }
        return {
            ok: true,
            accelerator: currentAccelerator,
            keyName: currentKeyName
        };
    });

    ipcMain.handle('desktop:get-diagnostics', (event) => {
        if (!isTrustedIpcEvent(event)) {
            return { ok: false, error: 'Untrusted IPC sender.' };
        }
        return {
            ok: true,
            platform: process.platform,
            isDev,
            serverUrl: process.env.JINVOICE_DESKTOP_SERVER_URL || DEFAULT_SERVER_URL,
            mediaPermission: 'granted-by-electron',
            pushToTalk: {
                accelerator: currentAccelerator,
                keyName: currentKeyName,
                pressed: pushToTalkPressed,
                listenerActive: Boolean(keyboardListener),
                listenerReady: keyboardListenerReady,
                lastError: lastKeyboardError
            }
        };
    });

    await createWindow();
    startKeyboardListener();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createWindow().then(() => {
                if (!keyboardListener) {
                    startKeyboardListener();
                }
            });
        }
    });
});

app.on('before-quit', () => {
    stopKeyboardListener();
});

app.on('window-all-closed', () => {
    stopKeyboardListener();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
