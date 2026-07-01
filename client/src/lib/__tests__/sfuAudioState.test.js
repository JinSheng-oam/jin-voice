import { describe, expect, test } from 'vitest';
import { canJoinSfuRoom, getSfuProduceReadiness } from '../sfuAudioState';

describe('canJoinSfuRoom', () => {
    test('requires selected room, peer id, and confirmed room join', () => {
        expect(canJoinSfuRoom({ selectedRoomId: 'room-1', peerId: 'peer-1', roomJoinConfirmed: true })).toBe(true);
        expect(canJoinSfuRoom({ selectedRoomId: null, peerId: 'peer-1', roomJoinConfirmed: true })).toBe(false);
        expect(canJoinSfuRoom({ selectedRoomId: 'room-1', peerId: '', roomJoinConfirmed: true })).toBe(false);
        expect(canJoinSfuRoom({ selectedRoomId: 'room-1', peerId: 'peer-1', roomJoinConfirmed: false })).toBe(false);
    });
});

describe('getSfuProduceReadiness', () => {
    const createStream = (track) => ({
        getAudioTracks: () => [track]
    });

    test('blocks produce before the SFU room is joined', () => {
        const readiness = getSfuProduceReadiness({
            client: {},
            selectedRoomId: 'room-1',
            sfuRoomJoined: false,
            stream: createStream({ readyState: 'live' }),
            isMuted: false
        });

        expect(readiness).toEqual({ ready: false, reason: 'room-not-ready' });
    });

    test('blocks produce when the local track is missing or ended', () => {
        expect(getSfuProduceReadiness({
            client: {},
            selectedRoomId: 'room-1',
            sfuRoomJoined: true,
            stream: createStream({ readyState: 'ended' }),
            isMuted: false
        }).reason).toBe('track-not-ready');

        expect(getSfuProduceReadiness({
            client: {},
            selectedRoomId: 'room-1',
            sfuRoomJoined: true,
            stream: null,
            isMuted: false
        }).reason).toBe('track-not-ready');
    });

    test('blocks produce while muted', () => {
        const track = { readyState: 'live' };
        const readiness = getSfuProduceReadiness({
            client: {},
            selectedRoomId: 'room-1',
            sfuRoomJoined: true,
            stream: createStream(track),
            isMuted: true
        });

        expect(readiness).toEqual({ ready: false, reason: 'muted', track });
    });

    test('allows produce only when room, SFU, track, and mute state are ready', () => {
        const track = { readyState: 'live' };
        const readiness = getSfuProduceReadiness({
            client: {},
            selectedRoomId: 'room-1',
            sfuRoomJoined: true,
            stream: createStream(track),
            isMuted: false
        });

        expect(readiness).toEqual({ ready: true, reason: 'ready', track });
    });
});
