import { afterEach, describe, expect, test, vi } from 'vitest';
import { adjustRemoteUserVolume, playRemoteStream, syncRemotePlaybackVolume } from '../remoteAudio';

afterEach(() => vi.unstubAllGlobals());

describe('deafened remote playback', () => {
    test('changing a member volume keeps the gain muted', () => {
        const gainNode = { gain: { value: 0 } };
        const remoteAudiosRef = { current: new Map([['peer-1', { audioElement: { _gainNode: gainNode } }]]) };
        const remoteAudioContextRef = { current: { state: 'suspended', resume: vi.fn() } };
        const options = {
            connectedPeer: null,
            remoteGainNodeRef: { current: null },
            remoteAudiosRef,
            remoteAudioContextRef,
            isDeafened: true
        };

        adjustRemoteUserVolume({ ...options, userId: 'peer-1', volume: 500 });
        syncRemotePlaybackVolume({ ...options, userVolumes: { 'peer-1': 500 } });

        expect(gainNode.gain.value).toBe(0);
        expect(remoteAudioContextRef.current.resume).not.toHaveBeenCalled();
    });

    test('a new track starts with zero gain while deafened', () => {
        const params = () => ({ value: 0 });
        const gainNode = { gain: { value: 1 }, connect: vi.fn() };
        const audioContext = {
            state: 'suspended', resume: vi.fn(), destination: {},
            createMediaStreamSource: () => ({ connect: vi.fn() }),
            createGain: () => gainNode,
            createDynamicsCompressor: () => ({
                threshold: params(), knee: params(), ratio: params(),
                attack: params(), release: params(), connect: vi.fn()
            })
        };
        const audio = { play: () => Promise.resolve(), style: {} };
        vi.stubGlobal('window', { AudioContext: function AudioContext() { return audioContext; } });
        vi.stubGlobal('document', {
            createElement: () => audio,
            body: { appendChild: vi.fn() }
        });

        playRemoteStream({
            remoteStream: {}, userId: 'peer-1', userVolumes: { 'peer-1': 500 },
            isDeafened: true, selectedAudioOutput: '', remoteAudioContextRef: { current: null }
        });

        expect(gainNode.gain.value).toBe(0);
        expect(audioContext.resume).not.toHaveBeenCalled();
    });
});
