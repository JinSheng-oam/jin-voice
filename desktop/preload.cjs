const { contextBridge, ipcRenderer } = require('electron');

const api = {
    isDesktop: true,
    platform: process.platform,
    serverUrl: process.env.JINVOICE_DESKTOP_SERVER_URL || 'https://voice.jinworld.cn',
    onPushToTalkChange: (callback) => {
        if (typeof callback !== 'function') {
            return () => {};
        }

        const listener = (_event, payload) => {
            callback(Boolean(payload?.pressed));
        };

        ipcRenderer.on('push-to-talk-change', listener);
        return () => ipcRenderer.removeListener('push-to-talk-change', listener);
    },
    setPushToTalkAccelerator: (accelerator) => ipcRenderer.invoke('push-to-talk:set-accelerator', accelerator),
    getPushToTalkAccelerator: () => ipcRenderer.invoke('push-to-talk:get-accelerator')
};

contextBridge.exposeInMainWorld('jinvoiceDesktop', api);
