const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const mediasoupManager = require('./mediasoup');
const mediasoupConfig = require('./mediasoup/config');
const { getRuntimeVersionInfo } = require('./runtimeInfo');
const {
    clearSessionCookie,
    createSession,
    deleteExpiredSessions,
    deleteSessionByToken,
    getSessionTokenFromRequest,
    getSessionWithUserByToken,
    normalizeEmail,
    serializeUser,
    setSessionCookie
} = require('./auth');

const prisma = new PrismaClient();
const app = express();

const funnyIds = [
    'AlphaEcho', 'BluePine', 'CloudMint', 'SolarWave', 'QuietFox', 'NorthLeaf',
    'AmberLake', 'PixelDrift', 'SilverNote', 'MoonCanvas', 'SignalBird', 'VividStone',
    'LimeOrbit', 'NovaBridge', 'RiverTone', 'CedarGlow', 'CometField', 'FrostLine',
    'EchoPilot', 'VelvetPeak', 'MapleSpark', 'SkyLetter', 'OrbitTea', 'DawnThread'
];

const userIdMap = new Map();
const reverseIdMap = new Map();
const activeRoomUsers = new Map();
const userSocketsMap = new Map();
const guestRoomOwners = new Map();

// Simple in-memory rate limiter for room creation
const roomCreateTimestamps = new Map(); // funId -> last create timestamp
const ROOM_CREATE_COOLDOWN_MS = 10_000;

// Simple in-memory rate limiter for login attempts
const loginAttemptTimestamps = new Map(); // ip -> { count, windowStart }
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60_000;
const SOCKET_RATE_WINDOW_MS = 10_000;

const checkLoginRateLimit = (ip) => {
    const now = Date.now();
    const entry = loginAttemptTimestamps.get(ip);

    if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
        loginAttemptTimestamps.set(ip, { count: 1, windowStart: now });
        return true;
    }

    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
        return false;
    }

    entry.count++;
    return true;
};

const configuredCorsOrigins = new Set(
    String(process.env.CORS_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
);
const isDevelopment = process.env.NODE_ENV !== 'production';

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
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

const withAuthSession = async (req, res, next) => {
    const token = getSessionTokenFromRequest(req);

    if (!token) {
        req.user = null;
        req.session = null;
        return next();
    }

    try {
        const session = await getSessionWithUserByToken(prisma, token);

        if (!session) {
            clearSessionCookie(res);
            req.user = null;
            req.session = null;
            return next();
        }

        req.user = serializeUser(session.user);
        req.session = session;
        setSessionCookie(res, token, session.expiresAt);
        return next();
    } catch (error) {
        return next(error);
    }
};

app.use(withAuthSession);

const requireHttpAuth = (req, res, next) => {
    if (req.user) {
        return next();
    }

    return res.status(401).json({
        message: 'Please sign in first.'
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.isAdmin) {
        return next();
    }

    return res.status(403).json({
        message: 'Administrator access required.'
    });
};

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

const PUBLIC_DIR = path.join(__dirname, 'public');
const PASSWORD_MIN_LENGTH = 8;
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const SITE_APPEARANCE_ROW_ID = 1;
const SITE_BACKGROUND_PRESETS = new Set([
    'aurora',
    'midnight-grid',
    'sunset-flow',
    'minimal-paper'
]);
const DEFAULT_SITE_APPEARANCE = {
    backgroundMode: 'preset',
    backgroundPreset: 'aurora',
    backgroundImageUrl: null,
    backgroundBlur: 16,
    backgroundOpacity: 68,
    panelOpacity: 8,
    panelBlur: 22,
    panelGlow: 12
};

const AUTH_ACTION_MESSAGES = {
    createRoom: 'Please sign in to create a room.',
    joinRoom: 'Please sign in to join a room.',
    deleteRoom: 'Please sign in to delete a room.',
    sendMessage: 'Please sign in to send messages.',
    sendPrivateMessage: 'Please sign in to use private chat.',
    callUser: 'Please sign in to start voice calls.',
    answerCall: 'Please sign in to answer voice calls.',
    fileTransfer: 'Please sign in to transfer files.',
    audio: 'Please sign in to use live audio.'
};

const generateFunId = () => {
    const prefix = funnyIds[Math.floor(Math.random() * funnyIds.length)];
    const suffix = crypto.randomInt(0, 1000).toString().padStart(3, '0');
    return `${prefix}${suffix}`;
};

const generateRoomId = () => `room_${Math.random().toString(36).slice(2, 11)}`;

const isValidEmail = (email) => /\S+@\S+\.\S+/u.test(email);

const normalizeDisplayName = (displayName = '') => displayName.trim().slice(0, 24);
const normalizeRoomName = (roomName = '') => String(roomName || '').trim().slice(0, 40);

const normalizeBackgroundMode = (mode = '') => (mode === 'image' ? 'image' : 'preset');

const normalizeBackgroundPreset = (preset = '') => (
    SITE_BACKGROUND_PRESETS.has(preset) ? preset : DEFAULT_SITE_APPEARANCE.backgroundPreset
);

const normalizeBackgroundImageUrl = (imageUrl = '') => {
    const normalized = String(imageUrl || '').trim();

    if (!normalized) {
        return null;
    }

    if (normalized.length > 2048) {
        throw new Error('Background image URL is too long.');
    }

    if (
        normalized.startsWith('http://') ||
        normalized.startsWith('https://') ||
        normalized.startsWith('data:image/') ||
        normalized.startsWith('/')
    ) {
        return normalized;
    }

    throw new Error('Background image must be an http(s), data:image, or site-relative URL.');
};

const normalizeBackgroundBlur = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_SITE_APPEARANCE.backgroundBlur;
    }

    return Math.max(0, Math.min(40, Math.round(parsed)));
};

const normalizeBackgroundOpacity = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_SITE_APPEARANCE.backgroundOpacity;
    }

    return Math.max(0, Math.min(100, Math.round(parsed)));
};

const normalizePanelOpacity = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_SITE_APPEARANCE.panelOpacity;
    }

    return Math.max(0, Math.min(100, Math.round(parsed)));
};

const normalizePanelBlur = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_SITE_APPEARANCE.panelBlur;
    }

    return Math.max(0, Math.min(40, Math.round(parsed)));
};

const normalizePanelGlow = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_SITE_APPEARANCE.panelGlow;
    }

    return Math.max(0, Math.min(30, Math.round(parsed)));
};

const serializeSiteAppearance = (appearance) => ({
    backgroundMode: normalizeBackgroundMode(appearance?.backgroundMode),
    backgroundPreset: normalizeBackgroundPreset(appearance?.backgroundPreset),
    backgroundImageUrl: appearance?.backgroundImageUrl || '',
    backgroundBlur: normalizeBackgroundBlur(appearance?.backgroundBlur),
    backgroundOpacity: normalizeBackgroundOpacity(appearance?.backgroundOpacity),
    panelOpacity: normalizePanelOpacity(appearance?.panelOpacity),
    panelBlur: normalizePanelBlur(appearance?.panelBlur),
    panelGlow: normalizePanelGlow(appearance?.panelGlow)
});

const serializeAdminListUser = (user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
});

const ensureSiteAppearance = async () => prisma.siteAppearance.upsert({
    where: { id: SITE_APPEARANCE_ROW_ID },
    update: {},
    create: {
        id: SITE_APPEARANCE_ROW_ID,
        ...DEFAULT_SITE_APPEARANCE
    }
});

const getSiteAppearance = async () => {
    const appearance = await ensureSiteAppearance();
    return serializeSiteAppearance(appearance);
};

const {
    buildMessagePayload: _buildMessagePayload,
    getSocketDisplayName: _getSocketDisplayName,
    getSocketUserId,
    isSocketAdmin,
    buildRoomUser: _buildRoomUser
} = require('./utils');

const buildRoomUser = (socket, user) => _buildRoomUser(socket, user, userIdMap);
const getSocketDisplayName = (socket) => _getSocketDisplayName(socket, userIdMap);
const buildMessagePayload = _buildMessagePayload;

const emitAuthRequired = (socket, action) => {
    socket.emit('authRequired', {
        action,
        message: AUTH_ACTION_MESSAGES[action] || 'Please sign in first.'
    });
};

const requireAuthenticatedSocket = (socket, action, callback) => {
    const user = socket.data.user || null;

    if (user) {
        return user;
    }

    emitAuthRequired(socket, action);

    if (typeof callback === 'function') {
        callback({ error: 'Authentication required.' });
    }

    return null;
};

const registerSocketForUser = (socket, user) => {
    if (!user?.id) return;

    if (!userSocketsMap.has(user.id)) {
        userSocketsMap.set(user.id, new Set());
    }

    userSocketsMap.get(user.id).add(socket.id);
};

const unregisterSocketForUser = (socket) => {
    const userId = socket.data.user?.id;
    if (!userId || !userSocketsMap.has(userId)) return;

    const sockets = userSocketsMap.get(userId);
    sockets.delete(socket.id);

    if (sockets.size === 0) {
        userSocketsMap.delete(userId);
    }
};

const getRoomsList = async () => {
    try {
        const dbRooms = await prisma.room.findMany({
            include: {
                owner: {
                    select: {
                        id: true,
                        displayName: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return dbRooms.map((room) => {
            const activeMap = activeRoomUsers.get(room.id);
            const guestOwner = guestRoomOwners.get(room.id);

            return {
                roomId: room.id,
                name: room.name,
                ownerId: room.owner?.id || null,
                ownerFunId: room.owner ? null : guestOwner?.funId || null,
                ownerName: room.owner?.displayName || guestOwner?.name || null,
                userCount: activeMap ? activeMap.size : 0,
                createdAt: room.createdAt,
                isPrivate: room.isPrivate || false
            };
        });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        return [];
    }
};

const broadcastRoomsUpdated = async () => {
    io.emit('roomsUpdated', await getRoomsList());
};

const updateActiveUserDisplayName = (userId, displayName) => {
    activeRoomUsers.forEach((usersMap, roomId) => {
        const updates = [];

        usersMap.forEach((userData) => {
            if (userData.userId !== userId || userData.name === displayName) {
                return;
            }

            userData.name = displayName;
            updates.push({ funId: userData.funId, name: displayName });
        });

        updates.forEach((payload) => {
            io.to(roomId).emit('userUpdated', payload);
        });
    });
};

const updateGuestDisplayName = async (funId, displayName) => {
    activeRoomUsers.forEach((usersMap, roomId) => {
        const roomUser = usersMap.get(funId);
        if (roomUser && roomUser.name !== displayName) {
            roomUser.name = displayName;
            io.to(roomId).emit('userUpdated', { funId, name: displayName });
        }

        const guestOwner = guestRoomOwners.get(roomId);
        if (guestOwner?.funId === funId && guestOwner.name !== displayName) {
            guestRoomOwners.set(roomId, { ...guestOwner, name: displayName });
        }
    });

    await broadcastRoomsUpdated();
};

const syncUserSnapshotToSockets = async (user) => {
    const serializedUser = serializeUser(user);
    const socketIds = userSocketsMap.get(user.id);

    if (socketIds) {
        socketIds.forEach((socketId) => {
            const targetSocket = io.sockets.sockets.get(socketId);
            if (targetSocket) {
                targetSocket.data.user = serializedUser;
                targetSocket.emit('authUserUpdated', serializedUser);
            }
        });
    }

    updateActiveUserDisplayName(user.id, user.displayName);
    await broadcastRoomsUpdated();
};

const expireUserSessionsAndNotifySockets = async (userId, message = 'Your account session has ended.') => {
    await prisma.session.deleteMany({
        where: { userId }
    });

    const socketIds = userSocketsMap.get(userId);
    if (!socketIds) return;

    socketIds.forEach((socketId) => {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
            targetSocket.data.user = null;
            targetSocket.emit('sessionExpired', { message });
            targetSocket.disconnect(true);
        }
    });
};

const ensureBootstrapAdmin = async () => {
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || '');
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    const adminDisplayName = normalizeDisplayName(process.env.ADMIN_DISPLAY_NAME || '管理员');

    if (!adminEmail || !adminPassword) {
        return;
    }

    if (!isValidEmail(adminEmail) || adminPassword.length < PASSWORD_MIN_LENGTH || adminDisplayName.length < 2) {
        console.warn('[Admin] Bootstrap admin config is invalid, skipped.');
        return;
    }

    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail }
    });

    if (existingAdmin) {
        if (!existingAdmin.isAdmin) {
            await prisma.user.update({
                where: { id: existingAdmin.id },
                data: { isAdmin: true, displayName: adminDisplayName }
            });
        }
        return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
        data: {
            email: adminEmail,
            passwordHash,
            displayName: adminDisplayName,
            isAdmin: true
        }
    });

    console.log(`[Admin] Bootstrap admin ensured for ${adminEmail}`);
};

const leaveRoomHandler = async (
    socket,
    roomId,
    { isDisconnect = false, skipRoomsBroadcast = false } = {}
) => {
    const funId = userIdMap.get(socket.id);
    const activeMap = activeRoomUsers.get(roomId);

    if (!funId || !activeMap || !activeMap.has(funId)) {
        return;
    }

    activeMap.delete(funId);

    if (!isDisconnect) {
        socket.leave(roomId);
    }

    socket.to(roomId).emit('userLeftRoom', {
        funId,
        users: Array.from(activeMap.values())
    });

    if (activeMap.size === 0) {
        activeRoomUsers.delete(roomId);
    }

    try {
        const room = mediasoupManager.getRoom(roomId);
        if (room) {
            const producerId = room.removePeer(funId);
            if (producerId) {
                socket.to(roomId).emit('producerClosed', { producerId });
            }
            if (room.peerCount === 0) {
                mediasoupManager.removeRoomIfEmpty(roomId);
            }
        }
    } catch (error) {
        console.error('Error cleaning up mediasoup peer:', error);
    }

    if (!skipRoomsBroadcast) {
        await broadcastRoomsUpdated();
    }
};

const leaveAllRoomsForSocket = async (socket, isDisconnect = false) => {
    const funId = userIdMap.get(socket.id);
    if (!funId) return;

    const joinedRoomIds = [];
    activeRoomUsers.forEach((usersMap, roomId) => {
        if (usersMap.has(funId)) {
            joinedRoomIds.push(roomId);
        }
    });

    for (const roomId of joinedRoomIds) {
        await leaveRoomHandler(socket, roomId, {
            isDisconnect,
            skipRoomsBroadcast: true
        });
    }

    if (joinedRoomIds.length > 0) {
        await broadcastRoomsUpdated();
    }
};

const attachSocketToRoom = (socket, roomId, user) => {
    if (!activeRoomUsers.has(roomId)) {
        activeRoomUsers.set(roomId, new Map());
    }

    const usersMap = activeRoomUsers.get(roomId);
    const roomUser = buildRoomUser(socket, user);
    usersMap.set(roomUser.funId, roomUser);
    socket.join(roomId);

    return {
        roomUser,
        users: Array.from(usersMap.values())
    };
};

const isSocketActiveInRoom = (socket, roomId) => {
    const funId = userIdMap.get(socket.id);
    return Boolean(funId && roomId && activeRoomUsers.get(roomId)?.has(funId));
};

const requireActiveRoomMember = (socket, roomId, callback) => {
    if (isSocketActiveInRoom(socket, roomId)) {
        return true;
    }

    if (typeof callback === 'function') {
        callback({ error: 'Join the room before using live audio.' });
    }

    return false;
};

const checkSocketRateLimit = (socket, action, maxActions) => {
    const now = Date.now();
    const rateLimits = socket.data.rateLimits || new Map();
    const entry = rateLimits.get(action);

    socket.data.rateLimits = rateLimits;

    if (!entry || now - entry.windowStart > SOCKET_RATE_WINDOW_MS) {
        rateLimits.set(action, { count: 1, windowStart: now });
        return true;
    }

    if (entry.count >= maxActions) {
        return false;
    }

    entry.count += 1;
    return true;
};

app.post('/api/auth/register', async (req, res) => {
    try {
        const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkLoginRateLimit(`register:${clientIp}`)) {
            return res.status(429).json({ message: 'Too many registration attempts. Please try again later.' });
        }

        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || '');
        const displayName = normalizeDisplayName(req.body?.displayName);

        if (!isValidEmail(email)) {
            return res.status(400).json({ message: 'Please enter a valid email address.' });
        }

        if (password.length < PASSWORD_MIN_LENGTH) {
            return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
        }

        if (displayName.length < 2) {
            return res.status(400).json({ message: 'Display name must be at least 2 characters.' });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(409).json({ message: 'This email is already registered.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                displayName,
                isAdmin: false
            }
        });

        const { token, expiresAt } = await createSession(prisma, user.id);
        setSessionCookie(res, token, expiresAt);

        return res.status(201).json({
            user: serializeUser(user)
        });
    } catch (error) {
        console.error('Register error:', error);
        return res.status(500).json({ message: 'Failed to create account.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkLoginRateLimit(clientIp)) {
            return res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
        }

        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || '');

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return res.status(401).json({ message: 'Incorrect email or password.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Incorrect email or password.' });
        }

        const { token, expiresAt } = await createSession(prisma, user.id);
        setSessionCookie(res, token, expiresAt);

        return res.json({
            user: serializeUser(user)
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Failed to sign in.' });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        const token = getSessionTokenFromRequest(req);
        await deleteSessionByToken(prisma, token);
        clearSessionCookie(res);

        return res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ message: 'Failed to sign out.' });
    }
});

app.get('/api/auth/session', (req, res) => {
    if (!req.user) {
        return res.json({ authenticated: false });
    }

    return res.json({
        authenticated: true,
        user: req.user
    });
});

app.get('/api/site-appearance', async (req, res) => {
    try {
        const appearance = await getSiteAppearance();
        return res.json({ appearance });
    } catch (error) {
        console.error('Get site appearance error:', error);
        return res.status(500).json({ message: 'Failed to load site appearance.' });
    }
});

app.get('/api/health', async (req, res) => {
    const versionInfo = getRuntimeVersionInfo();
    const database = {
        status: 'ok'
    };

    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
        database.status = 'error';
        database.message = error.message;
    }

    const health = {
        status: database.status === 'ok' ? 'ok' : 'degraded',
        version: versionInfo.version,
        gitCommit: versionInfo.gitCommit,
        gitBranch: versionInfo.gitBranch,
        builtAt: versionInfo.builtAt,
        uptime: process.uptime(),
        database,
        mediasoup: {
            listenIp: mediasoupConfig.webRtcTransport.listenIps[0]?.ip || null,
            announcedIp: mediasoupConfig.webRtcTransport.listenIps[0]?.announcedIp || null,
            rtcMinPort: mediasoupConfig.worker.rtcMinPort,
            rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
            udpEnabled: Boolean(mediasoupConfig.webRtcTransport.enableUdp),
            tcpEnabled: Boolean(mediasoupConfig.webRtcTransport.enableTcp),
            preferUdp: Boolean(mediasoupConfig.webRtcTransport.preferUdp)
        }
    };

    return res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.patch('/api/auth/profile', requireHttpAuth, async (req, res) => {
    try {
        const displayName = normalizeDisplayName(req.body?.displayName);

        if (displayName.length < 2) {
            return res.status(400).json({ message: 'Display name must be at least 2 characters.' });
        }

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { displayName }
        });

        await syncUserSnapshotToSockets(user);

        return res.json({
            user: serializeUser(user)
        });
    } catch (error) {
        console.error('Profile update error:', error);
        return res.status(500).json({ message: 'Failed to update profile.' });
    }
});

app.patch('/api/admin/site-appearance', requireHttpAuth, requireAdmin, async (req, res) => {
    try {
        const backgroundMode = normalizeBackgroundMode(req.body?.backgroundMode);
        const backgroundPreset = normalizeBackgroundPreset(req.body?.backgroundPreset);
        const backgroundImageUrl = normalizeBackgroundImageUrl(req.body?.backgroundImageUrl);
        const backgroundBlur = normalizeBackgroundBlur(req.body?.backgroundBlur);
        const backgroundOpacity = normalizeBackgroundOpacity(req.body?.backgroundOpacity);
        const panelOpacity = normalizePanelOpacity(req.body?.panelOpacity);
        const panelBlur = normalizePanelBlur(req.body?.panelBlur);
        const panelGlow = normalizePanelGlow(req.body?.panelGlow);

        const appearance = await prisma.siteAppearance.upsert({
            where: { id: SITE_APPEARANCE_ROW_ID },
            update: {
                backgroundMode,
                backgroundPreset,
                backgroundImageUrl,
                backgroundBlur,
                backgroundOpacity,
                panelOpacity,
                panelBlur,
                panelGlow
            },
            create: {
                id: SITE_APPEARANCE_ROW_ID,
                backgroundMode,
                backgroundPreset,
                backgroundImageUrl,
                backgroundBlur,
                backgroundOpacity,
                panelOpacity,
                panelBlur,
                panelGlow
            }
        });

        const serializedAppearance = serializeSiteAppearance(appearance);
        io.emit('siteAppearanceUpdated', serializedAppearance);

        return res.json({
            appearance: serializedAppearance
        });
    } catch (error) {
        console.error('Admin update site appearance error:', error);
        return res.status(400).json({
            message: error.message || 'Failed to update site appearance.'
        });
    }
});

app.get('/api/admin/users', requireHttpAuth, requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: [
                { isAdmin: 'desc' },
                { createdAt: 'asc' }
            ]
        });

        return res.json({
            users: users.map(serializeAdminListUser)
        });
    } catch (error) {
        console.error('Admin list users error:', error);
        return res.status(500).json({ message: 'Failed to fetch members.' });
    }
});

app.patch('/api/admin/users/:userId', requireHttpAuth, requireAdmin, async (req, res) => {
    try {
        const targetUserId = String(req.params.userId || '');
        const nextDisplayName = req.body?.displayName;
        const nextIsAdmin = typeof req.body?.isAdmin === 'boolean' ? req.body.isAdmin : undefined;

        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId }
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        const data = {};

        if (typeof nextDisplayName === 'string') {
            const normalizedDisplayName = normalizeDisplayName(nextDisplayName);
            if (normalizedDisplayName.length < 2) {
                return res.status(400).json({ message: 'Display name must be at least 2 characters.' });
            }
            data.displayName = normalizedDisplayName;
        }

        if (typeof nextIsAdmin === 'boolean' && nextIsAdmin !== targetUser.isAdmin) {
            if (!nextIsAdmin) {
                const adminCount = await prisma.user.count({ where: { isAdmin: true } });
                if (adminCount <= 1 && targetUser.isAdmin) {
                    return res.status(400).json({ message: 'At least one administrator must remain.' });
                }
            }
            data.isAdmin = nextIsAdmin;
        }

        if (Object.keys(data).length === 0) {
            return res.json({ user: serializeAdminListUser(targetUser) });
        }

        const updatedUser = await prisma.user.update({
            where: { id: targetUserId },
            data
        });

        await syncUserSnapshotToSockets(updatedUser);

        return res.json({
            user: serializeAdminListUser(updatedUser)
        });
    } catch (error) {
        console.error('Admin update user error:', error);
        return res.status(500).json({ message: 'Failed to update member.' });
    }
});

app.delete('/api/admin/users/:userId', requireHttpAuth, requireAdmin, async (req, res) => {
    try {
        const targetUserId = String(req.params.userId || '');

        if (targetUserId === req.user.id) {
            return res.status(400).json({ message: 'You cannot delete your own account here.' });
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId }
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        if (targetUser.isAdmin) {
            const adminCount = await prisma.user.count({ where: { isAdmin: true } });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'At least one administrator must remain.' });
            }
        }

        await expireUserSessionsAndNotifySockets(targetUserId, 'Your account was removed by an administrator.');
        await prisma.user.delete({
            where: { id: targetUserId }
        });

        await broadcastRoomsUpdated();

        return res.json({ success: true });
    } catch (error) {
        console.error('Admin delete user error:', error);
        return res.status(500).json({ message: 'Failed to delete member.' });
    }
});

app.use(express.static(PUBLIC_DIR));

app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

io.use(async (socket, next) => {
    try {
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
        socket.emit('roomsList', await getRoomsList());
    });

    socket.on('callUser', ({ userToCall, signalData }) => {
        const targetSocketId = reverseIdMap.get(userToCall);
        if (targetSocketId) {
            io.to(targetSocketId).emit('callUser', {
                signal: signalData,
                from: userIdMap.get(socket.id),
                name: getSocketDisplayName(socket),
                userId: getSocketUserId(socket)
            });
        }
    });

    socket.on('answerCall', (data) => {
        const targetSocketId = reverseIdMap.get(data.to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('callAccepted', data.signal);
        }
    });

    socket.on('iceCandidate', ({ to, candidate }) => {
        const targetSocketId = reverseIdMap.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('iceCandidate', {
                from: userIdMap.get(socket.id),
                candidate
            });
        }
    });

    socket.on('sendMessage', async (data = {}) => {
        if (!checkSocketRateLimit(socket, 'public-message', 20)) {
            socket.emit('roomError', { message: 'You are sending messages too quickly.' });
            return;
        }

        const text = String(data.text || '').trim();
        if (!text) return;
        if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
            socket.emit('roomError', { message: `Message is limited to ${MAX_CHAT_MESSAGE_LENGTH} characters.` });
            return;
        }

        const funId = userIdMap.get(socket.id);
        if (!funId) return;

        // Find the room this sender is in
        let senderRoomId = null;
        for (const [roomId, usersMap] of activeRoomUsers) {
            if (usersMap.has(funId)) {
                senderRoomId = roomId;
                break;
            }
        }

        if (!senderRoomId) return;

        try {
            const message = await prisma.message.create({
                data: {
                    content: text,
                    sender: getSocketDisplayName(socket),
                    senderUserId: getSocketUserId(socket),
                    senderFunId: funId,
                    roomId: senderRoomId
                }
            });
            io.to(senderRoomId).emit('receiveMessage', buildMessagePayload(message));
        } catch (error) {
            console.error('Failed to persist message:', error);
            socket.emit('roomError', { message: 'Failed to send message.' });
        }
    });

    socket.on('sendPrivateMessage', (data = {}) => {
        if (!checkSocketRateLimit(socket, 'private-message', 30)) {
            socket.emit('roomError', { message: 'You are sending messages too quickly.' });
            return;
        }

        const text = String(data.text || '').trim();
        if (!text) return;
        if (text.length > MAX_CHAT_MESSAGE_LENGTH) {
            socket.emit('roomError', { message: `Message is limited to ${MAX_CHAT_MESSAGE_LENGTH} characters.` });
            return;
        }

        const targetSocketId = reverseIdMap.get(data.to);
        if (targetSocketId) {
            const payload = {
                id: data.id || `private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                user: getSocketDisplayName(socket),
                userId: getSocketUserId(socket),
                text,
                time: data.time || new Date().toLocaleTimeString(),
                to: data.to,
                from: userIdMap.get(socket.id)
            };

            io.to(targetSocketId).emit('receivePrivateMessage', payload);
            socket.emit('receivePrivateMessage', payload);
        }
    });

    socket.on('deleteMessage', async ({ messageId, privateMessageId, to, from } = {}, callback = () => {}) => {
        try {
            if (privateMessageId) {
                const funId = userIdMap.get(socket.id);
                if (!isSocketAdmin(socket) && from !== funId) {
                    callback({ error: 'Only administrators or the sender can delete this message.' });
                    return;
                }

                const peerId = from === funId ? to : from;
                const targetSocketId = reverseIdMap.get(peerId);
                socket.emit('privateMessageDeleted', { messageId: privateMessageId });
                if (targetSocketId) {
                    io.to(targetSocketId).emit('privateMessageDeleted', { messageId: privateMessageId });
                }
                callback({ success: true, messageId: privateMessageId, from: funId });
                return;
            }

            const parsedMessageId = Number(messageId);
            if (!Number.isInteger(parsedMessageId)) {
                callback({ error: 'Invalid message id.' });
                return;
            }

            const message = await prisma.message.findUnique({
                where: { id: parsedMessageId }
            });

            if (!message || message.deletedAt) {
                callback({ error: 'Message not found.' });
                return;
            }

            const currentUserId = getSocketUserId(socket);
            const currentFunId = userIdMap.get(socket.id);
            const canDelete =
                isSocketAdmin(socket) ||
                (message.senderUserId && message.senderUserId === currentUserId) ||
                (!message.senderUserId && message.senderFunId && message.senderFunId === currentFunId);

            if (!canDelete) {
                callback({ error: 'Only administrators or the sender can delete this message.' });
                return;
            }

            await prisma.message.update({
                where: { id: parsedMessageId },
                data: { deletedAt: new Date() }
            });

            io.to(message.roomId).emit('messageDeleted', { messageId: parsedMessageId });
            callback({ success: true, messageId: parsedMessageId });
        } catch (error) {
            console.error('Delete message error:', error);
            callback({ error: 'Failed to delete message.' });
        }
    });

    socket.on('createRoom', async ({ roomName, password, isPrivate }) => {
        const funId = userIdMap.get(socket.id);

        // Rate limit room creation
        const lastCreate = roomCreateTimestamps.get(funId);
        if (lastCreate && Date.now() - lastCreate < ROOM_CREATE_COOLDOWN_MS) {
            socket.emit('roomError', { message: 'Please wait before creating another room.' });
            return;
        }
        roomCreateTimestamps.set(funId, Date.now());

        const safeRoomName = normalizeRoomName(roomName) || 'Voice Room';
        const roomId = generateRoomId();
        const user = socket.data.user || null;

        try {
            await leaveAllRoomsForSocket(socket, false);

            // Hash password if provided
            let hashedPassword = null;
            if (password) {
                hashedPassword = await bcrypt.hash(password, 10);
            }

            await prisma.room.create({
                data: {
                    id: roomId,
                    name: safeRoomName,
                    password: hashedPassword,
                    isPrivate: Boolean(isPrivate),
                    ownerId: user?.id || null
                }
            });

            if (!user) {
                guestRoomOwners.set(roomId, {
                    funId: userIdMap.get(socket.id),
                    name: getSocketDisplayName(socket)
                });
            }

            const { users } = attachSocketToRoom(socket, roomId, user);

            socket.emit('roomCreated', { roomId, roomName: safeRoomName });
            socket.emit('roomJoined', {
                roomId,
                roomName: safeRoomName,
                users
            });

            await broadcastRoomsUpdated();
        } catch (error) {
            console.error('Create room error:', error);
            socket.emit('roomError', { message: `Failed to create room: ${error.message}` });
        }
    });

    socket.on('joinRoom', async ({ roomId, password }, callback = () => {}) => {
        try {
            const room = await prisma.room.findUnique({
                where: { id: roomId }
            });

            if (!room) {
                socket.emit('roomError', { message: 'Room not found.' });
                callback({ error: 'Room not found.' });
                return;
            }

            if (room.isPrivate && room.password) {
                if (!password) {
                    socket.emit('roomError', { message: 'Incorrect room password.' });
                    callback({ error: 'Incorrect room password.' });
                    return;
                }
                const passwordMatch = await bcrypt.compare(password, room.password);
                if (!passwordMatch) {
                    socket.emit('roomError', { message: 'Incorrect room password.' });
                    callback({ error: 'Incorrect room password.' });
                    return;
                }
            }

            await leaveAllRoomsForSocket(socket, false);

            const user = socket.data.user || null;
            const { roomUser, users } = attachSocketToRoom(socket, roomId, user);

            socket.to(roomId).emit('userJoinedRoom', {
                funId: roomUser.funId,
                user: roomUser,
                users
            });

            socket.emit('roomJoined', {
                roomId,
                roomName: room.name,
                users
            });

            // Load recent chat history for the room
            try {
                const history = await prisma.message.findMany({
                    where: {
                        roomId,
                        deletedAt: null
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 50
                });

                if (history.length > 0) {
                    socket.emit('chatHistory', history.reverse().map(buildMessagePayload));
                }
            } catch (error) {
                console.error('Failed to load chat history:', error);
            }

            await broadcastRoomsUpdated();
            callback({ success: true, roomId });
        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('roomError', { message: 'Failed to join room.' });
            callback({ error: 'Failed to join room.' });
        }
    });

    socket.on('leaveRoom', async ({ roomId }, callback = () => {}) => {
        await leaveRoomHandler(socket, roomId);
        callback({ success: true, roomId });
    });

    socket.on('deleteRoom', async ({ roomId }) => {
        try {
            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    owner: {
                        select: {
                            id: true
                        }
                    }
                }
            });

            if (!room) {
                socket.emit('roomError', { message: 'Room not found or already deleted.' });
                return;
            }

            const guestOwner = guestRoomOwners.get(roomId);
            const currentUserId = getSocketUserId(socket);
            const currentFunId = userIdMap.get(socket.id);

            if (!isSocketAdmin(socket) && room.owner && room.ownerId !== currentUserId) {
                socket.emit('roomError', { message: 'Only the room owner can delete this room.' });
                return;
            }

            if (!isSocketAdmin(socket) && !room.owner && guestOwner?.funId !== currentFunId) {
                socket.emit('roomError', { message: 'Only the room owner can delete this room.' });
                return;
            }

            const activeMap = activeRoomUsers.get(roomId);
            const activeUsers = activeMap ? Array.from(activeMap.keys()) : [];

            for (const userFunId of activeUsers) {
                const targetSocketId = reverseIdMap.get(userFunId);
                if (!targetSocketId) continue;

                io.to(targetSocketId).emit('roomDeleted', {
                    roomId,
                    roomName: room.name
                });

                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                }
            }

            activeRoomUsers.delete(roomId);
            mediasoupManager.removeRoom(roomId);
            guestRoomOwners.delete(roomId);

            await prisma.message.deleteMany({ where: { roomId } });
            await prisma.room.delete({ where: { id: roomId } });
            await broadcastRoomsUpdated();
        } catch (error) {
            console.error('Delete room error:', error);
            socket.emit('roomError', { message: `Failed to delete room: ${error.message}` });
        }
    });

    socket.on('renameRoom', async ({ roomId, roomName }, callback = () => {}) => {
        try {
            const safeRoomName = normalizeRoomName(roomName);
            if (!safeRoomName || safeRoomName.length < 2) {
                callback({ error: 'Room name must be at least 2 characters.' });
                socket.emit('roomError', { message: 'Room name must be at least 2 characters.' });
                return;
            }

            const room = await prisma.room.findUnique({
                where: { id: roomId },
                include: {
                    owner: {
                        select: {
                            id: true
                        }
                    }
                }
            });

            if (!room) {
                callback({ error: 'Room not found.' });
                socket.emit('roomError', { message: 'Room not found.' });
                return;
            }

            const guestOwner = guestRoomOwners.get(roomId);
            const currentUserId = getSocketUserId(socket);
            const currentFunId = userIdMap.get(socket.id);
            const canManageRoom =
                isSocketAdmin(socket) ||
                (room.owner && room.ownerId === currentUserId) ||
                (!room.owner && guestOwner?.funId === currentFunId);

            if (!canManageRoom) {
                callback({ error: 'Only the room owner or an administrator can rename this room.' });
                socket.emit('roomError', { message: 'Only the room owner or an administrator can rename this room.' });
                return;
            }

            const updatedRoom = await prisma.room.update({
                where: { id: roomId },
                data: { name: safeRoomName }
            });

            io.to(roomId).emit('roomRenamed', {
                roomId,
                roomName: updatedRoom.name
            });

            await broadcastRoomsUpdated();
            callback({ success: true, roomId, roomName: updatedRoom.name });
        } catch (error) {
            console.error('Rename room error:', error);
            callback({ error: 'Failed to rename room.' });
            socket.emit('roomError', { message: `Failed to rename room: ${error.message}` });
        }
    });

    socket.on('updateName', async ({ name } = {}) => {
        if (socket.data.user) {
            return;
        }

        const nextName = normalizeDisplayName(name);
        if (nextName.length < 2) {
            return;
        }

        socket.data.guestName = nextName;
        await updateGuestDisplayName(userIdMap.get(socket.id), nextName);
    });

    socket.on('getRouterRtpCapabilities', async ({ roomId }, callback) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return;

        try {
            const room = await mediasoupManager.getOrCreateRoom(roomId);
            callback({ rtpCapabilities: room.getRouterRtpCapabilities() });
        } catch (error) {
            console.error('getRouterRtpCapabilities error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('createWebRtcTransport', async ({ roomId, type }, callback) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return;
        if (!checkSocketRateLimit(socket, 'create-transport', 30)) {
            callback({ error: 'Too many transport requests. Please reconnect and try again.' });
            return;
        }

        try {
            const room = mediasoupManager.getRoom(roomId);
            if (!room) {
                callback({ error: 'Room not found.' });
                return;
            }

            const peerId = userIdMap.get(socket.id);
            const transportInfo = await room.createWebRtcTransport(peerId);
            const peer = room.peers.get(peerId);

            if (peer) {
                const transport = peer.transports.get(transportInfo.id);
                if (transport) {
                    transport.appData = { type };
                }
            }

            callback(transportInfo);
        } catch (error) {
            console.error('createWebRtcTransport error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('connectTransport', async ({ roomId, transportId, dtlsParameters }, callback) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return;

        try {
            const room = mediasoupManager.getRoom(roomId);
            if (!room) {
                callback({ error: 'Room not found.' });
                return;
            }

            const peerId = userIdMap.get(socket.id);
            await room.connectTransport(peerId, transportId, dtlsParameters);
            callback({ success: true });
        } catch (error) {
            console.error('connectTransport error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('produce', async ({ roomId, transportId, kind, rtpParameters }, callback) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return;

        try {
            const room = mediasoupManager.getRoom(roomId);
            if (!room) {
                callback({ error: 'Room not found.' });
                return;
            }

            const peerId = userIdMap.get(socket.id);
            const { id } = await room.produce(peerId, transportId, kind, rtpParameters);

            socket.to(roomId).emit('newProducer', { peerId, producerId: id });
            callback({ id });
        } catch (error) {
            console.error('produce error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return;

        try {
            const room = mediasoupManager.getRoom(roomId);
            if (!room) {
                callback({ error: 'Room not found.' });
                return;
            }

            const peerId = userIdMap.get(socket.id);
            const consumerInfo = await room.consume(peerId, producerId, rtpCapabilities);
            callback(consumerInfo);
        } catch (error) {
            console.error('consume error:', error);
            callback({ error: error.message });
        }
    });

    socket.on('getProducers', async ({ roomId }, callback) => {
        if (!requireActiveRoomMember(socket, roomId, callback)) return;

        try {
            const room = mediasoupManager.getRoom(roomId);
            if (!room) {
                callback({ producers: [] });
                return;
            }

            const peerId = userIdMap.get(socket.id);
            const producers = room.getProducerIds(peerId);
            callback({ producers });
        } catch (error) {
            console.error('getProducers error:', error);
            callback({ error: error.message });
        }
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
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of loginAttemptTimestamps) {
        if (now - entry.windowStart > LOGIN_WINDOW_MS * 2) {
            loginAttemptTimestamps.delete(ip);
        }
    }
    for (const [funId, ts] of roomCreateTimestamps) {
        if (now - ts > ROOM_CREATE_COOLDOWN_MS * 2) {
            roomCreateTimestamps.delete(funId);
        }
    }
}, 60_000);

setInterval(() => {
    deleteExpiredSessions(prisma).catch((error) => {
        console.error('Failed to clean expired sessions:', error);
    });
}, 60 * 60 * 1000);

(async () => {
    try {
        await ensureBootstrapAdmin();
        await ensureSiteAppearance();
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
