const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const mediasoupManager = require('./mediasoup');
const mediasoupConfig = require('./mediasoup/config');
const {
    deleteExpiredSessions,
    getSessionWithUserByToken,
    serializeUser
} = require('./auth');
const { createAdminUsersRouter } = require('./http/adminUsersRoutes');
const { createAuthSessionMiddleware, requireAdmin, requireHttpAuth } = require('./http/authMiddleware');
const {
    createAuthRouter,
    createLoginRateLimiter,
    ensureBootstrapAdmin,
    normalizeDisplayName
} = require('./http/authRoutes');
const { createSystemRouter } = require('./http/systemRoutes');
const { createSiteAppearanceRouter, createSiteAppearanceService } = require('./siteAppearance');
const { createMetricsRouter, createMetricsService } = require('./metrics');
const { registerChatHandlers } = require('./socket/chatHandlers');
const { registerPeerHandlers } = require('./socket/peerHandlers');
const { registerRoomHandlers } = require('./socket/roomHandlers');
const { registerSfuHandlers } = require('./socket/sfuHandlers');
const { createSocketRuntime } = require('./socket/socketRuntime');

const prisma = new PrismaClient();
const app = express();

const loginRateLimiter = createLoginRateLimiter();

const configuredCorsOrigins = new Set(
    String(process.env.CORS_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
);
const isDevelopment = process.env.NODE_ENV !== 'production';
const configuredTrustProxy = String(process.env.TRUST_PROXY || '').trim();
app.set(
    'trust proxy',
    configuredTrustProxy || (isDevelopment ? false : 'loopback, linklocal, uniquelocal')
);

const isTrustedOrigin = (origin, host = '') => {
    if (!origin || origin === 'null' || origin.startsWith('file://')) {
        return true;
    }

    if (configuredCorsOrigins.has(origin) || isDevelopment) {
        return true;
    }

    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
};

const appCors = cors((req, callback) => {
    callback(null, {
        origin: isTrustedOrigin(req.headers.origin, req.headers.host),
        credentials: true
    });
});

app.use(appCors);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.use(createAuthSessionMiddleware(prisma));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH']
    },
    allowRequest: (req, callback) => {
        callback(null, isTrustedOrigin(req.headers.origin, req.headers.host));
    }
});

const siteAppearanceService = createSiteAppearanceService(prisma);
const metricsService = createMetricsService();
app.use('/api', createSiteAppearanceRouter({
    service: siteAppearanceService,
    io,
    requireHttpAuth,
    requireAdmin
}));
app.use('/api', createSystemRouter({ prisma, mediasoupManager, mediasoupConfig }));
app.use('/api', createMetricsRouter({ service: metricsService, requireHttpAuth, requireAdmin }));

mediasoupManager.on('recovering', (state) => {
    console.error('[Mediasoup] Worker unavailable, starting recovery:', state.lastError);
    io.emit('sfuUnavailable', { message: 'Voice service is restarting.' });
});

mediasoupManager.on('recovered', () => {
    console.log('[Mediasoup] Worker recovery completed.');
    io.emit('sfuRestartRequired');
});

const PUBLIC_DIR = path.join(__dirname, 'public');
const socketRuntime = createSocketRuntime({ io, prisma, mediasoupManager });
const {
    MAX_CHAT_MESSAGE_LENGTH, ROOM_CREATE_COOLDOWN_MS, activeRoomUsers,
    attachSocketToRoom, broadcastRoomsUpdated, buildMessagePayload, canSocketManageRoom, checkSocketRateLimit,
    expireUserSessionsAndNotifySockets, generateFunId, generateRoomId,
    getRoomsList, getSharedPeerContext, getSocketDisplayName, getSocketUserId,
    guestRoomOwners, isSafeSignalPayload, isSocketAdmin, leaveAllRoomsForSocket,
    leaveRoomHandler, normalizeGuestId, normalizeRoomName, normalizeSfuSessionId,
    registerSocketForUser, requireActiveRoomMember, requireAuthenticatedSocket,
    requireCurrentSfuSession, reverseIdMap, roomCreateTimestamps,
    syncUserSnapshotToSockets, unregisterSocketForUser, updateGuestDisplayName, userIdMap
} = socketRuntime;

app.use('/api', createAuthRouter({
    prisma,
    requireHttpAuth,
    syncUserSnapshotToSockets,
    rateLimiter: loginRateLimiter
}));
app.use('/api/admin', createAdminUsersRouter({
    prisma,
    requireHttpAuth,
    requireAdmin,
    normalizeDisplayName,
    syncUserSnapshotToSockets,
    expireUserSessionsAndNotifySockets,
    broadcastRoomsUpdated
}));

app.use(express.static(PUBLIC_DIR, {
    setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\./.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

io.use(async (socket, next) => {
    try {
        socket.data.guestId = normalizeGuestId(socket.handshake.auth?.guestId);
        const parsedCookies = cookie.parse(socket.handshake.headers.cookie || '');
        const token = parsedCookies.jinvoice_session || null;

        if (!token) {
            socket.data.user = null;
            return next();
        }

        const session = await getSessionWithUserByToken(prisma, token);
        socket.data.user = session ? serializeUser(session.user) : null;
        return next();
    } catch (error) {
        return next(error);
    }
});

io.on('connection', (socket) => {
    const funId = generateFunId();
    const currentUser = socket.data.user || null;

    userIdMap.set(socket.id, funId);
    reverseIdMap.set(funId, socket.id);
    socket.data.guestName = socket.data.guestName || `访客${funId.slice(-4)}`;
    registerSocketForUser(socket, currentUser);

    socket.emit('me', funId);

    socket.on('disconnect', async () => {
        const disconnectedFunId = userIdMap.get(socket.id);

        unregisterSocketForUser(socket);
        await leaveAllRoomsForSocket(socket, true);

        userIdMap.delete(socket.id);
        reverseIdMap.delete(disconnectedFunId);
        socket.broadcast.emit('callEnded');
    });

    socket.on('getRooms', async () => {
        socket.emit('roomsList', await getRoomsList(socket));
    });

    const sharedHandlers = {
        checkSocketRateLimit, getSharedPeerContext, getSocketDisplayName, getSocketUserId,
        io, isSafeSignalPayload, requireAuthenticatedSocket, reverseIdMap, userIdMap
    };
    registerPeerHandlers(socket, sharedHandlers);
    registerChatHandlers(socket, {
        ...sharedHandlers, MAX_CHAT_MESSAGE_LENGTH, buildMessagePayload, isSocketAdmin, prisma
    });
    registerRoomHandlers(socket, {
        ROOM_CREATE_COOLDOWN_MS, activeRoomUsers, attachSocketToRoom, bcrypt,
        broadcastRoomsUpdated, buildMessagePayload, generateRoomId, getSocketDisplayName, getSocketUserId,
        guestRoomOwners, io, isSocketAdmin, leaveAllRoomsForSocket, leaveRoomHandler,
        mediasoupManager, normalizeDisplayName, normalizeRoomName, prisma,
        reverseIdMap, roomCreateTimestamps, updateGuestDisplayName, userIdMap,
        requireAuthenticatedSocket, checkSocketRateLimit, canSocketManageRoom
    });

    registerSfuHandlers(socket, {
        checkSocketRateLimit, mediasoupManager, normalizeSfuSessionId,
        requireActiveRoomMember, requireCurrentSfuSession, userIdMap
    });
});

app.use((error, req, res, next) => {
    console.error('Unhandled API error:', error);
    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        message: 'Internal server error.'
    });
});

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

// Periodic cleanup of rate limiter maps to prevent memory leaks
const rateLimitCleanupTimer = setInterval(() => {
    const now = Date.now();
    loginRateLimiter.cleanup(now);
    for (const [funId, ts] of roomCreateTimestamps) {
        if (now - ts > ROOM_CREATE_COOLDOWN_MS * 2) {
            roomCreateTimestamps.delete(funId);
        }
    }
}, 60_000);
rateLimitCleanupTimer.unref?.();

const sessionCleanupTimer = setInterval(() => {
    deleteExpiredSessions(prisma).catch((error) => {
        console.error('Failed to clean expired sessions:', error);
    });
}, 60 * 60 * 1000);
sessionCleanupTimer.unref?.();

let shutdownInProgress = false;
const shutdown = async (signal) => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    console.log(`[Shutdown] ${signal} received, closing services...`);
    clearInterval(rateLimitCleanupTimer);
    clearInterval(sessionCleanupTimer);

    const forceExitTimer = setTimeout(() => process.exit(1), 8000);
    forceExitTimer.unref?.();

    try {
        await mediasoupManager.close();
        await new Promise((resolve) => io.close(resolve));
        await prisma.$disconnect();
        clearTimeout(forceExitTimer);
        process.exit(0);
    } catch (error) {
        console.error('[Shutdown] Failed to close cleanly:', error);
        process.exit(1);
    }
};

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

(async () => {
    try {
        await ensureBootstrapAdmin({ prisma });
        await siteAppearanceService.ensure();
        await deleteExpiredSessions(prisma);
        await mediasoupManager.init(1);

        server.listen(PORT, HOST, () => {
            console.log(`Server is running on http://${HOST}:${PORT}`);
            console.log('Mediasoup SFU ready for multi-party voice');
            console.log(`[Config] MEDIASOUP_ANNOUNCED_IP: ${process.env.MEDIASOUP_ANNOUNCED_IP}`);
            console.log(
                `[Config] RTC Ports: ${mediasoupConfig.worker.rtcMinPort}-${mediasoupConfig.worker.rtcMaxPort}`
            );
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
})();
