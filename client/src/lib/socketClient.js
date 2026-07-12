import { io } from 'socket.io-client';

const SOCKET_KEY = '__JINVOICE_SOCKET__';
const SOCKET_URL_KEY = '__JINVOICE_SOCKET_URL__';
const GUEST_ID_KEY = 'jinvoice_guest_id';

const createGuestId = () => globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export const getPersistentGuestId = () => {
    if (typeof window === 'undefined') return createGuestId();

    try {
        const existingGuestId = window.localStorage.getItem(GUEST_ID_KEY);
        if (/^[A-Za-z0-9-]{16,128}$/u.test(existingGuestId || '')) {
            return existingGuestId;
        }

        const guestId = createGuestId();
        window.localStorage.setItem(GUEST_ID_KEY, guestId);
        return guestId;
    } catch {
        return createGuestId();
    }
};

const createSocketOptions = () => ({
    withCredentials: true,
    auth: {
        guestId: getPersistentGuestId()
    }
});

export const getSharedSocket = (serverUrl) => {
    if (typeof window === 'undefined') {
        return io(serverUrl, createSocketOptions());
    }

    const existingSocket = window[SOCKET_KEY];
    const existingUrl = window[SOCKET_URL_KEY];

    if (existingSocket && existingUrl === serverUrl) {
        return existingSocket;
    }

    if (existingSocket && existingUrl !== serverUrl) {
        existingSocket.disconnect();
    }

    const socket = io(serverUrl, createSocketOptions());
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
