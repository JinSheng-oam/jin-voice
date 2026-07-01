const path = require('path');
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

const codeToGlobalKeyName = (code = 'Space') => {
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

const sendPushToTalkState = (pressed) => {
    if (pushToTalkPressed === pressed) return;
    pushToTalkPressed = pressed;
    mainWindow?.webContents?.send('push-to-talk-change', { pressed });
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

    keyboardListener = new GlobalKeyboardListener({
        windows: {
            onError: (errorCode) => {
                lastKeyboardError = String(errorCode);
                keyboardListenerReady = false;
                console.error(`[GlobalKeyboard] error: ${errorCode}`);
            },
            onInfo: (info) => console.info(`[GlobalKeyboard] ${info}`)
        }
    });

    keyboardListenerReady = true;
    lastKeyboardError = null;

    keyboardListener.addListener((event) => {
        if (event.name !== currentKeyName) {
            return false;
        }

        sendPushToTalkState(event.state === 'DOWN');
        return true;
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
            sandbox: false
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: 'deny' };
    });

    if (isDev) {
        await mainWindow.loadURL(process.env.JINVOICE_DESKTOP_DEV_URL || 'http://127.0.0.1:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        await mainWindow.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    }
};

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const configurePermissions = () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(permission === 'media');
    });

    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media');
};

app.whenReady().then(async () => {
    configurePermissions();

    ipcMain.handle('push-to-talk:set-accelerator', (_event, code) => {
        const nextKeyName = codeToGlobalKeyName(code);
        if (!nextKeyName) {
            return { ok: false, error: 'Unsupported shortcut key.' };
        }

        currentAccelerator = code || 'Space';
        currentKeyName = nextKeyName;
        sendPushToTalkState(false);
        return { ok: true, accelerator: currentAccelerator, keyName: currentKeyName };
    });

    ipcMain.handle('push-to-talk:get-accelerator', () => ({
        ok: true,
        accelerator: currentAccelerator,
        keyName: currentKeyName
    }));

    ipcMain.handle('desktop:get-diagnostics', () => ({
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
    }));

    await createWindow();
    startKeyboardListener();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createWindow();
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

process.env.JINVOICE_SERVER_URL = DEFAULT_SERVER_URL;
