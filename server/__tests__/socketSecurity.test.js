const { safeSocket, revokeSessionSockets, guardSocketSession } = require('../socket/security');
const { hashToken } = require('../auth');
const { createAuthRouter, createLoginRateLimiter } = require('../http/authRoutes');

const makeSocket = (token = 'session') => ({
    data: { user: { id: 'admin', isAdmin: true }, sessionTokenHash: hashToken(token) },
    emit: jest.fn(), disconnect: jest.fn(), on: jest.fn(), use: jest.fn()
});

test('a real anonymous Socket.IO connection survives a null room request', async () => {
    const http = require('http');
    const { Server } = require('socket.io');
    const { io: connect } = require('socket.io-client');
    const { registerRoomHandlers } = require('../socket/roomHandlers');
    const server = http.createServer();
    const io = new Server(server);
    io.on('connection', (socket) => {
        registerRoomHandlers(socket, {});
        socket.on('auditPing', (reply) => reply('alive'));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const client = connect(`http://127.0.0.1:${server.address().port}`, { reconnection: false });
    try {
        await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
        const error = new Promise((resolve) => client.once('roomError', resolve));
        client.emit('createRoom', null);
        expect((await error).message).toContain('Invalid');
        await expect(client.timeout(1000).emitWithAck('auditPing')).resolves.toBe('alive');
    } finally {
        client.disconnect();
        await new Promise((resolve) => io.close(resolve));
    }
});

test('rejects malformed payloads and callbacks and catches rejected handlers', async () => {
    const socket = makeSocket();
    const handler = jest.fn().mockRejectedValue(new Error('database unavailable'));
    safeSocket(socket).on('createRoom', handler);
    const dispatch = socket.on.mock.calls[0][1];
    for (const data of [null, [], 'text', 3]) await dispatch(data);
    await dispatch({}, 'not a callback');
    expect(handler).not.toHaveBeenCalled();
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        await expect(dispatch({})).resolves.toBeUndefined();
        expect(handler).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
});

test('logout revokes all sockets for this session and preserves other sessions', async () => {
    const first = makeSocket();
    const second = makeSocket();
    const other = makeSocket('other-session');
    const io = { sockets: { sockets: new Map([['a', first], ['b', second], ['c', other]]) } };
    const prisma = { session: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const router = createAuthRouter({ prisma, requireHttpAuth: (_req, _res, next) => next(),
        revokeSessionSockets: (token) => revokeSessionSockets(io, token) });
    const logout = router.stack.find((layer) => layer.route?.path === '/auth/logout').route.stack[0].handle;
    await logout({ cookies: { jinvoice_session: 'session' } }, { clearCookie() {}, json() {} });
    expect(first.data.user).toBeNull();
    expect(second.disconnect).toHaveBeenCalledWith(true);
    expect(other.data.user.isAdmin).toBe(true);
    expect(other.disconnect).not.toHaveBeenCalled();
});

test('expired database sessions cannot dispatch more socket events', async () => {
    const socket = makeSocket();
    guardSocketSession(socket, { session: { findUnique: jest.fn().mockResolvedValue({
        expiresAt: new Date(0), user: { id: 'admin', isAdmin: true }
    }) } });
    const next = jest.fn();
    await socket.use.mock.calls[0][0]([], next);
    await new Promise(setImmediate);
    expect(next).not.toHaveBeenCalled();
    expect(socket.data.user).toBeNull();
    socket.on.mock.calls.find(([event]) => event === 'disconnect')[1]();
});

test('successful registrations still consume the per-IP window', async () => {
    const bcrypt = require('bcryptjs');
    const hash = jest.spyOn(bcrypt, 'hash').mockResolvedValue('hash');
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user', email: 'a@example.test' }) },
    session: { create: jest.fn().mockResolvedValue({}) } };
    const router = createAuthRouter({ prisma, requireHttpAuth: (_req, _res, next) => next(),
        rateLimiter: createLoginRateLimiter({ now: () => 1000 }) });
    const register = router.stack.find((layer) => layer.route?.path === '/auth/register').route.stack[0].handle;
    try {
        const statuses = [];
        for (let index = 0; index < 6; index += 1) {
            const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {}, cookie() {} };
            await register({ ip: 'same-ip', body: { email: `user${index}@example.test`, password: 'password123', displayName: 'User' } }, res);
            statuses.push(res.statusCode);
        }
        expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    } finally { hash.mockRestore(); }
});
