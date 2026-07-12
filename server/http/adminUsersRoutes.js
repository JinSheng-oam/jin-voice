const express = require('express');

const serializeAdminListUser = (user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
});

const createAdminUsersRouter = ({
    prisma,
    requireHttpAuth,
    requireAdmin,
    normalizeDisplayName,
    syncUserSnapshotToSockets,
    expireUserSessionsAndNotifySockets,
    broadcastRoomsUpdated
}) => {
    const router = express.Router();
    router.use(requireHttpAuth, requireAdmin);

    router.get('/users', async (req, res) => {
        try {
            const users = await prisma.user.findMany({
                orderBy: [{ isAdmin: 'desc' }, { createdAt: 'asc' }]
            });
            return res.json({ users: users.map(serializeAdminListUser) });
        } catch (error) {
            console.error('Admin list users error:', error);
            return res.status(500).json({ message: 'Failed to fetch members.' });
        }
    });

    router.patch('/users/:userId', async (req, res) => {
        try {
            const targetUserId = String(req.params.userId || '');
            const nextDisplayName = req.body?.displayName;
            const nextIsAdmin = typeof req.body?.isAdmin === 'boolean' ? req.body.isAdmin : undefined;
            const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
            if (!targetUser) return res.status(404).json({ message: 'Member not found.' });

            const data = {};
            if (typeof nextDisplayName === 'string') {
                const displayName = normalizeDisplayName(nextDisplayName);
                if (displayName.length < 2) return res.status(400).json({ message: 'Display name must be at least 2 characters.' });
                data.displayName = displayName;
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
            if (Object.keys(data).length === 0) return res.json({ user: serializeAdminListUser(targetUser) });

            const updatedUser = await prisma.user.update({ where: { id: targetUserId }, data });
            await syncUserSnapshotToSockets(updatedUser);
            return res.json({ user: serializeAdminListUser(updatedUser) });
        } catch (error) {
            console.error('Admin update user error:', error);
            return res.status(500).json({ message: 'Failed to update member.' });
        }
    });

    router.delete('/users/:userId', async (req, res) => {
        try {
            const targetUserId = String(req.params.userId || '');
            if (targetUserId === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account here.' });

            const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
            if (!targetUser) return res.status(404).json({ message: 'Member not found.' });
            if (targetUser.isAdmin) {
                const adminCount = await prisma.user.count({ where: { isAdmin: true } });
                if (adminCount <= 1) return res.status(400).json({ message: 'At least one administrator must remain.' });
            }

            await expireUserSessionsAndNotifySockets(targetUserId, 'Your account was removed by an administrator.');
            await prisma.room.updateMany({ where: { ownerId: targetUserId }, data: { ownerId: req.user.id } });
            await prisma.user.delete({ where: { id: targetUserId } });
            await broadcastRoomsUpdated();
            return res.json({ success: true });
        } catch (error) {
            console.error('Admin delete user error:', error);
            return res.status(500).json({ message: 'Failed to delete member.' });
        }
    });

    return router;
};

module.exports = { createAdminUsersRouter, serializeAdminListUser };
