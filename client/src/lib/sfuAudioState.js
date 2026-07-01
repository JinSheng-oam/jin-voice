export const canJoinSfuRoom = ({
    selectedRoomId,
    peerId,
    roomJoinConfirmed
} = {}) => Boolean(selectedRoomId && peerId && roomJoinConfirmed);

export const getSfuProduceReadiness = ({
    client,
    selectedRoomId,
    sfuRoomJoined,
    stream,
    isMuted
} = {}) => {
    if (!client || !selectedRoomId || !sfuRoomJoined) {
        return { ready: false, reason: 'room-not-ready' };
    }

    const track = stream?.getAudioTracks?.()[0] || null;
    if (!track || track.readyState === 'ended') {
        return { ready: false, reason: 'track-not-ready', track };
    }

    if (isMuted) {
        return { ready: false, reason: 'muted', track };
    }

    return { ready: true, reason: 'ready', track };
};
