import { afterEach, describe, expect, test } from 'vitest';
import { createIceServers, setRuntimeIceServers } from '../connectionConfig';

afterEach(() => {
    setRuntimeIceServers(null);
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
});
