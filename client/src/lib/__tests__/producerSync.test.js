import { expect, test, vi } from 'vitest';
import MediasoupClient from '../../mediasoup/MediasoupClient';

vi.mock('mediasoup-client', () => ({ Device: class {} }));

test('unmuting before a muted synchronization settles still creates the producer', async () => {
    const client = new MediasoupClient({});
    const track = { readyState: 'live' };
    const stream = { getAudioTracks: () => [track] };
    const producer = { track, on() {}, pause: vi.fn(), resume: vi.fn() };
    client.sendTransport = { produce: vi.fn().mockResolvedValue(producer) };
    const muted = client.syncProducer(stream, true);
    const unmuted = client.syncProducer(stream, false);
    await Promise.all([muted, unmuted]);
    expect(client.producer).toBe(producer);
    expect(producer.resume).toHaveBeenCalled();
});

test('device changes and mute during initial produce reconcile to the latest state', async () => {
    const client = new MediasoupClient({});
    const oldTrack = { readyState: 'live' };
    const newTrack = { readyState: 'live' };
    const stream = (track) => ({ getAudioTracks: () => [track] });
    let complete;
    const producer = { track: oldTrack, on() {}, pause: vi.fn(), resume: vi.fn(),
        replaceTrack: vi.fn(async ({ track }) => { producer.track = track; }) };
    client.sendTransport = { produce: vi.fn(() => new Promise((resolve) => { complete = () => resolve(producer); })) };
    const pending = client.syncProducer(stream(oldTrack), false);
    oldTrack.readyState = 'ended';
    const updated = client.syncProducer(stream(newTrack), true);
    complete();
    await Promise.all([pending, updated]);
    expect(client.producer.track).toBe(newTrack);
    expect(producer.pause).toHaveBeenCalled();
    expect(producer.resume).not.toHaveBeenCalled();
    expect(client.sendTransport.produce).toHaveBeenCalledTimes(1);
});
