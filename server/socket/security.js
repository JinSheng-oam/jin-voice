const { hashToken, serializeUser } = require('../auth');

const safeSocket = (socket) => new Proxy(socket, {
    get(target, key) {
        if (key !== 'on') {
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
        }
        return (event, handler) => target.on(event, (...args) => {
            const reply = typeof args[1] === 'function' ? args[1] : null;
            const fail = () => {
                reply?.({ error: 'Invalid request or operation failed.' });
                target.emit('roomError', { message: 'Invalid request or operation failed.' });
            };
            const data = args[0] === undefined ? {} : args[0];
            if (!data || typeof data !== 'object' || Array.isArray(data)
                || args.length > 2 || (args.length > 1 && !reply)) {
                fail();
                return Promise.resolve();
            }
            const onError = (error) => {
                console.error(`Socket ${event} failed:`, error);
                fail();
            };
            try {
                return Promise.resolve(handler(data, reply || undefined)).catch(onError);
            } catch (error) {
                onError(error);
                return Promise.resolve();
            }
        });
    }
});

const revokeSocket = (socket) => {
    socket.data.user = null;
    socket.emit('sessionExpired', { message: '当前登录状态已失效，请重新登录。' });
    socket.disconnect(true);
};

const revokeSessionSockets = (io, token) => {
    if (!token) return;
    const tokenHash = hashToken(token);
    for (const socket of io.sockets.sockets.values()) {
        if (socket.data.sessionTokenHash === tokenHash) revokeSocket(socket);
    }
};

const guardSocketSession = (socket, prisma) => {
    if (!socket.data.sessionTokenHash) return;
    socket.data.sessionUserId = socket.data.user?.id;
    let checking = null;
    const check = () => {
        if (!checking) {
            checking = prisma.session.findUnique({
                where: { tokenHash: socket.data.sessionTokenHash },
                include: { user: true }
            }).then((session) => {
                if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
                    revokeSocket(socket);
                    return false;
                }
                socket.data.user = serializeUser(session.user);
                return true;
            }).finally(() => { checking = null; });
        }
        return checking;
    };
    socket.use((_packet, next) => {
        check().then((valid) => { if (valid) next(); }).catch(() => revokeSocket(socket));
    });
    const timer = setInterval(() => { void check().catch(() => revokeSocket(socket)); }, 60_000);
    timer.unref?.();
    socket.on('disconnect', () => clearInterval(timer));
};

module.exports = { safeSocket, guardSocketSession, revokeSessionSockets };
