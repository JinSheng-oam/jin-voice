import { afterEach, describe, expect, test, vi } from 'vitest';
import { createIceServers, resolveApiAssetUrl, setRuntimeIceServers } from '../connectionConfig';

afterEach(() => {
    setRuntimeIceServers(null);
    vi.unstubAllGlobals();
});

describe('connectionConfig', () => {
    test('uses runtime ICE servers before build-time fallback config', () => {
        const runtimeIceServers = [
            { urls: 'stun:runtime.example.com:3478' },
            {
                urls: ['turn:runtime.example.com:3478', 'turn:runtime.example.com:3478?transport=tcp'],
                username: 'runtime-user',
                credential: 'runtime-password'
            }
        ];

        setRuntimeIceServers(runtimeIceServers);

        expect(createIceServers()).toEqual({
            iceServers: runtimeIceServers,
            iceCandidatePoolSize: 10
        });
    });

    test('resolves server-hosted media against the active API origin', () => {
        vi.stubGlobal('window', {
            location: { origin: 'http://localhost:5173' },
            jinvoiceDesktop: null
        });

        expect(resolveApiAssetUrl('/site-media/background.webp'))
            .toBe('http://localhost:5173/site-media/background.webp');
        expect(resolveApiAssetUrl('https://cdn.example.com/background.webp'))
            .toBe('https://cdn.example.com/background.webp');

        window.jinvoiceDesktop = { serverUrl: 'http://127.0.0.1:6000' };
        expect(resolveApiAssetUrl('/site-media/background.webp'))
            .toBe('http://127.0.0.1:6000/site-media/background.webp');
    });
});
