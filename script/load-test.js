const { randomUUID } = require('crypto');
const { io } = require('socket.io-client');

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
};
const dryRun = args.includes('--dry-run');
const clientCount = Math.max(2, Math.min(50, Number(readArg('--clients', 5)) || 5));
const serverUrl = readArg('--url', process.env.JINVOICE_LOAD_URL || 'http://127.0.0.1:5001');
const timeoutMs = 12_000;

const percentile = (values, ratio) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
};

const waitForEvent = (socket, event) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeoutMs);
    socket.once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload);
    });
});

const connectClient = (index) => new Promise((resolve, reject) => {
    const startedAt = performance.now();
    let connectedAt = null;
    let funId = null;
    const socket = io(serverUrl, {
        transports: ['websocket'],
        reconnection: false,
        timeout: timeoutMs,
        auth: { guestId: `load-${index}-${randomUUID()}` }
    });
    const resolveWhenReady = () => {
        if (connectedAt !== null && funId) resolve({ socket, funId, durationMs: connectedAt - startedAt });
    };
    socket.once('connect', () => {
        connectedAt = performance.now();
        resolveWhenReady();
    });
    socket.once('me', (value) => {
        funId = value;
        resolveWhenReady();
    });
    socket.once('connect_error', reject);
});

const joinRoom = (socket, roomId) => new Promise((resolve, reject) => {
    const startedAt = performance.now();
    socket.emit('joinRoom', { roomId }, (response = {}) => {
        if (response.error) return reject(new Error(response.error));
        return resolve(performance.now() - startedAt);
    });
});

const emitAck = (socket, event, payload) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), timeoutMs);
    socket.emit(event, payload, (response = {}) => {
        clearTimeout(timer);
        if (response.error) return reject(new Error(response.error));
        return resolve(response);
    });
});

const run = async () => {
    if (dryRun) {
        console.log(JSON.stringify({ valid: true, clientCount, serverUrl }));
        return;
    }
    const connected = await Promise.all(Array.from({ length: clientCount }, (_, index) => connectClient(index)));
    const sockets = connected.map((entry) => entry.socket);
    try {
        const roomCreated = waitForEvent(sockets[0], 'roomCreated');
        sockets[0].emit('createRoom', { roomName: `Load Test ${Date.now()}`, isPrivate: false });
        const { roomId } = await roomCreated;
        const joinDurations = await Promise.all(sockets.slice(1).map((socket) => joinRoom(socket, roomId)));
        const roomsList = waitForEvent(sockets[0], 'roomsList');
        sockets[0].emit('getRooms');
        const rooms = await roomsList;
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        if (room?.userCount !== clientCount) throw new Error(`Expected ${clientCount} members, received ${room?.userCount ?? 0}`);

        const muteRequested = waitForEvent(sockets[1], 'hostMuteRequested');
        await emitAck(sockets[0], 'requestRoomMute', { roomId });
        await muteRequested;

        await emitAck(sockets[0], 'setRoomLocked', { roomId, locked: true });
        const outsider = await connectClient(clientCount);
        sockets.push(outsider.socket);
        let lockedJoinRejected = false;
        try {
            await joinRoom(outsider.socket, roomId);
        } catch (error) {
            lockedJoinRejected = error.message.includes('锁定');
        }
        if (!lockedJoinRejected) throw new Error('Locked room accepted a new member');
        await emitAck(sockets[0], 'setRoomLocked', { roomId, locked: false });

        const removed = waitForEvent(sockets[1], 'removedFromRoom');
        await emitAck(sockets[0], 'removeRoomMember', {
            roomId,
            targetFunId: connected[1].funId
        });
        await removed;
        console.log(JSON.stringify({
            clients: clientCount,
            roomId,
            connectP95Ms: Math.round(percentile(connected.map((entry) => entry.durationMs), 0.95)),
            joinP95Ms: Math.round(percentile(joinDurations, 0.95)),
            verifiedUserCount: room.userCount,
            hostControlsVerified: true
        }, null, 2));
    } finally {
        sockets.forEach((socket) => socket.close());
    }
};

run().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
