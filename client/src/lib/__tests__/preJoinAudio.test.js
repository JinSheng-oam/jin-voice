import { describe, expect, test, vi } from 'vitest';
import { AUDIO_PROCESSING_MODES } from '../audioProcessing';
import { getByteTimeDomainPeak, startPreJoinMicCheck } from '../preJoinAudio';

const createFixture = () => {
    const track = {
        stop: vi.fn(),
        getSettings: () => ({ deviceId: 'mic-active' })
    };
    const stream = {
        getTracks: () => [track],
        getAudioTracks: () => [track]
    };
    const analyser = {
        fftSize: 0,
        getByteTimeDomainData: (samples) => {
            samples.fill(128);
            samples[0] = 192;
        }
    };
    const source = { connect: vi.fn() };
    const audioContext = {
        state: 'running',
        createAnalyser: () => analyser,
        createMediaStreamSource: () => source,
        close: vi.fn().mockResolvedValue(undefined)
    };
    const audioContextConstructor = vi.fn();
    class AudioContextClass {
        constructor() {
            audioContextConstructor();
            return audioContext;
        }
    }
    const mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) };

    return {
        track,
        stream,
        analyser,
        source,
        audioContext,
        audioContextConstructor,
        AudioContextClass,
        mediaDevices
    };
};

describe('pre-join microphone check', () => {
    test('normalizes byte-domain microphone peaks', () => {
        expect(getByteTimeDomainPeak(new Uint8Array([128, 192, 64]))).toBe(0.5);
        expect(getByteTimeDomainPeak(new Uint8Array())).toBe(0);
    });

    test('requests the selected device and releases every resource', async () => {
        const fixture = createFixture();
        const onLevel = vi.fn();
        const requestAnimationFrameImpl = vi.fn(() => 17);
        const cancelAnimationFrameImpl = vi.fn();

        const controller = await startPreJoinMicCheck({
            mediaDevices: fixture.mediaDevices,
            AudioContextClass: fixture.AudioContextClass,
            deviceId: 'mic-requested',
            audioProcessingMode: AUDIO_PROCESSING_MODES.STANDARD,
            onLevel,
            requestAnimationFrameImpl,
            cancelAnimationFrameImpl
        });

        expect(fixture.mediaDevices.getUserMedia).toHaveBeenCalledWith({
            audio: expect.objectContaining({
                deviceId: { exact: 'mic-requested' },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false
            }),
            video: false
        });
        expect(controller.activeDeviceId).toBe('mic-active');
        expect(onLevel).toHaveBeenCalledWith(90);

        controller.stop();
        controller.stop();
        expect(cancelAnimationFrameImpl).toHaveBeenCalledWith(17);
        expect(fixture.track.stop).toHaveBeenCalledTimes(1);
        expect(fixture.audioContext.close).toHaveBeenCalledTimes(1);
    });

    test('propagates permission errors without creating an audio context', async () => {
        const permissionError = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
        const mediaDevices = { getUserMedia: vi.fn().mockRejectedValue(permissionError) };
        const audioContextConstructor = vi.fn();
        class AudioContextClass {
            constructor() {
                audioContextConstructor();
            }
        }

        await expect(startPreJoinMicCheck({
            mediaDevices,
            AudioContextClass,
            audioProcessingMode: AUDIO_PROCESSING_MODES.STANDARD
        })).rejects.toBe(permissionError);
        expect(audioContextConstructor).not.toHaveBeenCalled();
    });

    test('stops the acquired stream when audio analysis setup fails', async () => {
        const track = { stop: vi.fn() };
        const mediaDevices = {
            getUserMedia: vi.fn().mockResolvedValue({
                getTracks: () => [track],
                getAudioTracks: () => [track]
            })
        };
        class AudioContextClass {
            constructor() {
                throw new Error('AudioContext failed');
            }
        }

        await expect(startPreJoinMicCheck({
            mediaDevices,
            AudioContextClass,
            audioProcessingMode: AUDIO_PROCESSING_MODES.STANDARD
        })).rejects.toThrow('AudioContext failed');
        expect(track.stop).toHaveBeenCalledTimes(1);
    });
});
