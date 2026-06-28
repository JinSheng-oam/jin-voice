const STUN_SERVERS = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302'
];

export const getSocketUrl = () => {
    if (window.jinvoiceDesktop?.serverUrl) return window.jinvoiceDesktop.serverUrl;
    if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;

    const hostname = window.location.hostname;
    const port = window.location.port;
    const isLocalPreviewHost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (import.meta.env.PROD) {
        if (isLocalPreviewHost && port && port !== '5000') {
            return `${window.location.protocol}//${hostname}:5000`;
        }

        return window.location.origin;
    }

    return `${window.location.protocol}//${hostname}:5000`;
};

export const getApiBaseUrl = () => getSocketUrl();

const normalizeIceHost = (value = '') => {
    const candidate = String(value).trim();
    if (!candidate) return '';

    try {
        const url = new URL(candidate.includes('://') ? candidate : `turn://${candidate}`);
        return url.hostname;
    } catch {
        return '';
    }
};

export const getTurnServerHost = () => {
    const configuredHost = normalizeIceHost(import.meta.env.VITE_TURN_SERVER);
    if (configuredHost) return configuredHost;

    const pageHost = normalizeIceHost(window.location.hostname);
    if (pageHost) return pageHost;

    return normalizeIceHost(getSocketUrl());
};

export const createIceServers = () => {
    const turnServer = getTurnServerHost();
    const turnUsername = String(import.meta.env.VITE_TURN_USERNAME || '').trim();
    const turnPassword = String(import.meta.env.VITE_TURN_PASSWORD || '').trim();
    const iceServers = STUN_SERVERS.map((urls) => ({ urls }));

    if (turnServer && turnUsername && turnPassword) {
        iceServers.push({
            urls: [
                `turn:${turnServer}:3478`,
                `turn:${turnServer}:3478?transport=tcp`
            ],
            username: turnUsername,
            credential: turnPassword
        });
    }

    return { iceServers, iceCandidatePoolSize: 10 };
};
