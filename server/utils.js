const buildMessagePayload = (message) => ({
    id: message.id,
    user: message.sender,
    userId: message.senderUserId || null,
    from: message.senderFunId || null,
    text: message.content,
    time: message.createdAt.toLocaleTimeString(),
    isPrivate: false
});

const getSocketDisplayName = (socket, userIdMap) => (
    socket.data.user?.displayName ||
    socket.data.guestName ||
    `访客${(userIdMap.get(socket.id) || '').slice(-4) || '0000'}`
);

const getSocketUserId = (socket) => socket.data.user?.id || null;

const isSocketAdmin = (socket) => Boolean(socket.data.user?.isAdmin);

const buildRoomUser = (socket, user, userIdMap) => {
    const funId = userIdMap.get(socket.id);

    return {
        funId,
        userId: user?.id || null,
        name: user?.displayName || socket.data.guestName || `访客${funId?.slice(-4) || '0000'}`
    };
};

module.exports = {
    buildMessagePayload,
    getSocketDisplayName,
    getSocketUserId,
    isSocketAdmin,
    buildRoomUser
};
