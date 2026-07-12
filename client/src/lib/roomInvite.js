export const buildRoomInviteUrl = (roomId, location = window.location) => {
    const url = new URL(location.href);
    if (roomId) url.searchParams.set('roomId', roomId);
    else url.searchParams.delete('roomId');
    return url.toString();
};

export const copyRoomInviteLink = async (roomId, clipboard = navigator.clipboard, location = window.location) => {
    const inviteUrl = buildRoomInviteUrl(roomId, location);
    if (!clipboard?.writeText) throw new Error('当前环境不支持复制，请手动复制地址栏链接。');
    await clipboard.writeText(inviteUrl);
    return inviteUrl;
};
