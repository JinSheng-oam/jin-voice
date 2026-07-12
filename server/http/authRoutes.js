const bcrypt = require('bcryptjs');
const express = require('express');
const {
    clearSessionCookie,
    createSession,
    deleteSessionByToken,
    getSessionTokenFromRequest,
    normalizeEmail,
    serializeUser,
    setSessionCookie
} = require('../auth');

const PASSWORD_MIN_LENGTH = 8;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60_000;

const isValidEmail = (email) => /\S+@\S+\.\S+/u.test(email);
const normalizeDisplayName = (displayName = '') => String(displayName || '').trim().slice(0, 24);

const createLoginRateLimiter = ({ now = () => Date.now() } = {}) => {
    const attempts = new Map();

    return {
        attempts,
        check(key) {
            const currentTime = now();
            const entry = attempts.get(key);
            if (!entry || currentTime - entry.windowStart > LOGIN_WINDOW_MS) {
                attempts.set(key, { count: 1, windowStart: currentTime });
                return true;
            }
            if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
            entry.count += 1;
            return true;
        },
        clear(key) {
            attempts.delete(key);
        },
        cleanup(currentTime = now()) {
            for (const [key, entry] of attempts) {
                if (currentTime - entry.windowStart > LOGIN_WINDOW_MS * 2) attempts.delete(key);
            }
        }
    };
};

const ensureBootstrapAdmin = async ({ prisma, env = process.env }) => {
    const adminEmail = normalizeEmail(env.ADMIN_EMAIL || '');
    const adminPassword = String(env.ADMIN_PASSWORD || '');
    const adminDisplayName = normalizeDisplayName(env.ADMIN_DISPLAY_NAME || '管理员');

    if (!adminEmail || !adminPassword) return;
    if (!isValidEmail(adminEmail) || adminPassword.length < PASSWORD_MIN_LENGTH || adminDisplayName.length < 2) {
        console.warn('[Admin] Bootstrap admin config is invalid, skipped.');
        return;
    }

    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
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
        data: { email: adminEmail, passwordHash, displayName: adminDisplayName, isAdmin: true }
    });
    console.log(`[Admin] Bootstrap admin ensured for ${adminEmail}`);
};

const createAuthRouter = ({ prisma, requireHttpAuth, syncUserSnapshotToSockets, rateLimiter }) => {
    const router = express.Router();

    router.post('/auth/register', async (req, res) => {
        try {
            const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
            const rateLimitKey = `register:${clientIp}`;
            if (!rateLimiter.check(rateLimitKey)) {
                return res.status(429).json({ message: 'Too many registration attempts. Please try again later.' });
            }
            const email = normalizeEmail(req.body?.email);
            const password = String(req.body?.password || '');
            const displayName = normalizeDisplayName(req.body?.displayName);
            if (!isValidEmail(email)) return res.status(400).json({ message: 'Please enter a valid email address.' });
            if (password.length < PASSWORD_MIN_LENGTH) {
                return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
            }
            if (displayName.length < 2) return res.status(400).json({ message: 'Display name must be at least 2 characters.' });

            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) return res.status(409).json({ message: 'This email is already registered.' });

            const passwordHash = await bcrypt.hash(password, 12);
            const user = await prisma.user.create({
                data: { email, passwordHash, displayName, isAdmin: false }
            });
            const { token, expiresAt } = await createSession(prisma, user.id);
            setSessionCookie(res, token, expiresAt);
            rateLimiter.clear(rateLimitKey);
            return res.status(201).json({ user: serializeUser(user) });
        } catch (error) {
            console.error('Register error:', error);
            return res.status(500).json({ message: 'Failed to create account.' });
        }
    });

    router.post('/auth/login', async (req, res) => {
        try {
            const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
            const rateLimitKey = `login:${clientIp}`;
            if (!rateLimiter.check(rateLimitKey)) {
                return res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
            }
            const email = normalizeEmail(req.body?.email);
            const password = String(req.body?.password || '');
            if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

            const user = await prisma.user.findUnique({ where: { email } });
            if (!user || !await bcrypt.compare(password, user.passwordHash)) {
                return res.status(401).json({ message: 'Incorrect email or password.' });
            }
            const { token, expiresAt } = await createSession(prisma, user.id);
            setSessionCookie(res, token, expiresAt);
            rateLimiter.clear(rateLimitKey);
            return res.json({ user: serializeUser(user) });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ message: 'Failed to sign in.' });
        }
    });

    router.post('/auth/logout', async (req, res) => {
        try {
            await deleteSessionByToken(prisma, getSessionTokenFromRequest(req));
            clearSessionCookie(res);
            return res.json({ success: true });
        } catch (error) {
            console.error('Logout error:', error);
            return res.status(500).json({ message: 'Failed to sign out.' });
        }
    });

    router.get('/auth/session', (req, res) => {
        if (!req.user) return res.json({ authenticated: false });
        return res.json({ authenticated: true, user: req.user });
    });

    router.patch('/auth/profile', requireHttpAuth, async (req, res) => {
        try {
            const displayName = normalizeDisplayName(req.body?.displayName);
            if (displayName.length < 2) return res.status(400).json({ message: 'Display name must be at least 2 characters.' });
            const user = await prisma.user.update({ where: { id: req.user.id }, data: { displayName } });
            await syncUserSnapshotToSockets(user);
            return res.json({ user: serializeUser(user) });
        } catch (error) {
            console.error('Profile update error:', error);
            return res.status(500).json({ message: 'Failed to update profile.' });
        }
    });

    return router;
};

module.exports = {
    LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_MS,
    PASSWORD_MIN_LENGTH,
    createAuthRouter,
    createLoginRateLimiter,
    ensureBootstrapAdmin,
    isValidEmail,
    normalizeDisplayName
};
