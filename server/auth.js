const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'jinvoice_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000;

const USER_PUBLIC_SELECT = {
    id: true,
    email: true,
    displayName: true,
    isAdmin: true,
    createdAt: true,
    updatedAt: true
};

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const serializeUser = (user) => {
    if (!user) return null;

    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: Boolean(user.isAdmin)
    };
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createOpaqueToken = () => crypto.randomBytes(32).toString('hex');

const getCookieOptions = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
});

const setSessionCookie = (res, token, expiresAt) => {
    res.cookie(SESSION_COOKIE_NAME, token, {
        ...getCookieOptions(),
        expires: expiresAt
    });
};

const clearSessionCookie = (res) => {
    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());
};

const getSessionTokenFromRequest = (req) => req.cookies?.[SESSION_COOKIE_NAME] || null;

const createSession = async (prisma, userId) => {
    const token = createOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.session.create({
        data: {
            userId,
            tokenHash,
            expiresAt
        }
    });

    return { token, expiresAt };
};

const deleteSessionByToken = async (prisma, token) => {
    if (!token) return;

    await prisma.session.deleteMany({
        where: {
            tokenHash: hashToken(token)
        }
    });
};

const deleteExpiredSessions = async (prisma) => {
    await prisma.session.deleteMany({
        where: {
            expiresAt: {
                lt: new Date()
            }
        }
    });
};

const maybeRefreshSession = async (prisma, session) => {
    const now = Date.now();
    const expiresAtMs = new Date(session.expiresAt).getTime();

    if (expiresAtMs - now > SESSION_REFRESH_WINDOW_MS) {
        return session;
    }

    const nextExpiresAt = new Date(now + SESSION_TTL_MS);

    return prisma.session.update({
        where: { id: session.id },
        data: {
            expiresAt: nextExpiresAt,
            lastSeenAt: new Date(now)
        },
        include: {
            user: {
                select: USER_PUBLIC_SELECT
            }
        }
    });
};

const getSessionWithUserByToken = async (prisma, token) => {
    if (!token) return null;

    const session = await prisma.session.findUnique({
        where: {
            tokenHash: hashToken(token)
        },
        include: {
            user: {
                select: USER_PUBLIC_SELECT
            }
        }
    });

    if (!session) {
        return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {
            /* noop cleanup */
        });
        return null;
    }

    return maybeRefreshSession(prisma, session);
};

module.exports = {
    SESSION_COOKIE_NAME,
    USER_PUBLIC_SELECT,
    clearSessionCookie,
    createSession,
    deleteExpiredSessions,
    deleteSessionByToken,
    getSessionTokenFromRequest,
    getSessionWithUserByToken,
    hashToken,
    normalizeEmail,
    serializeUser,
    setSessionCookie
};
