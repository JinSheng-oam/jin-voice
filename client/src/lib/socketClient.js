import { io } from 'socket.io-client';

const SOCKET_KEY = '__JINVOICE_SOCKET__';
const SOCKET_URL_KEY = '__JINVOICE_SOCKET_URL__';
const SOCKET_OPTIONS = {
    withCredentials: true
};

export const getSharedSocket = (serverUrl) => {
    if (typeof window === 'undefined') {
        return io(serverUrl, SOCKET_OPTIONS);
    }

    const existingSocket = window[SOCKET_KEY];
    const existingUrl = window[SOCKET_URL_KEY];

    if (existingSocket && existingUrl === serverUrl) {
        return existingSocket;
    }

    if (existingSocket && existingUrl !== serverUrl) {
        existingSocket.disconnect();
    }

    const socket = io(serverUrl, SOCKET_OPTIONS);
    window[SOCKET_KEY] = socket;
    window[SOCKET_URL_KEY] = serverUrl;
    return socket;
};

export const reconnectSharedSocket = (serverUrl) => {
    const socket = getSharedSocket(serverUrl);

    if (socket.connected) {
        socket.disconnect();
    }

    socket.connect();
    return socket;
};

if (import.meta.hot && typeof window !== 'undefined') {
    import.meta.hot.dispose(() => {
        const existingSocket = window[SOCKET_KEY];

        if (existingSocket) {
            existingSocket.disconnect();
            delete window[SOCKET_KEY];
            delete window[SOCKET_URL_KEY];
        }
    });
}
