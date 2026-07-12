const {
    clearSessionCookie,
    getSessionTokenFromRequest,
    getSessionWithUserByToken,
    serializeUser,
    setSessionCookie
} = require('../auth');

const createAuthSessionMiddleware = (prisma) => async (req, res, next) => {
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

const requireHttpAuth = (req, res, next) => {
    if (req.user) return next();
    return res.status(401).json({ message: 'Please sign in first.' });
};

const requireAdmin = (req, res, next) => {
    if (req.user?.isAdmin) return next();
    return res.status(403).json({ message: 'Administrator access required.' });
};

module.exports = {
    createAuthSessionMiddleware,
    requireAdmin,
    requireHttpAuth
};
