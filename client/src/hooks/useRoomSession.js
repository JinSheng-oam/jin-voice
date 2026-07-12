import { useCallback, useEffect, useRef } from 'react';
import { showAlert } from '../stores/useDialogStore';

const getUrlRoomId = () => new URLSearchParams(window.location.search).get('roomId');

const syncUrlRoomId = (roomId) => {
    const params = new URLSearchParams(window.location.search);

    if (roomId) {
        params.set('roomId', roomId);
    } else {
        params.delete('roomId');
    }

    const queryString = params.toString();
    const nextUrl = queryString
        ? `${window.location.pathname}?${queryString}`
        : window.location.pathname;

    window.history.replaceState(null, '', nextUrl);
};

export const useRoomSession = ({
    socket,
    selectedRoomId,
    setRooms,
    setJoinedRoom,
    markRoomJoinPending,
    clearSelectedRoom,
    clearMessages,
    clearPrivateMessages,
    removeRoom,
    updateRoomName,
    setRoomUsers,
    updateRoomUser,
    onRoomJoined,
    onRoomDeleted
}) => {
    const selectedRoomIdRef = useRef(selectedRoomId);
    const onRoomJoinedRef = useRef(onRoomJoined);
    const onRoomDeletedRef = useRef(onRoomDeleted);
    const pendingCreateRef = useRef(null);

    useEffect(() => {
        selectedRoomIdRef.current = selectedRoomId;
    }, [selectedRoomId]);

    useEffect(() => {
        onRoomJoinedRef.current = onRoomJoined;
    }, [onRoomJoined]);

    useEffect(() => {
        onRoomDeletedRef.current = onRoomDeleted;
    }, [onRoomDeleted]);

    useEffect(() => {
        if (selectedRoomId) {
            syncUrlRoomId(selectedRoomId);
        }
    }, [selectedRoomId]);

    const refreshRooms = useCallback(() => {
        if (!socket) return;
        socket.emit('getRooms');
    }, [socket]);

    const clearPendingCreate = useCallback((error = null) => {
        const pendingCreate = pendingCreateRef.current;
        if (!pendingCreate) return;

        window.clearTimeout(pendingCreate.timeoutId);
        pendingCreateRef.current = null;

        if (error) {
            pendingCreate.reject(error);
        }
    }, []);

    const resolvePendingCreateIfReady = useCallback(() => {
        const pendingCreate = pendingCreateRef.current;
        if (!pendingCreate?.created || !pendingCreate.joined) return;

        window.clearTimeout(pendingCreate.timeoutId);
        pendingCreateRef.current = null;
        pendingCreate.resolve({
            roomId: pendingCreate.roomId,
            roomName: pendingCreate.roomName
        });
    }, []);

    const createRoom = useCallback((payload) => new Promise((resolve, reject) => {
        if (!socket) {
            reject(new Error('Socket is not connected.'));
            return;
        }

        clearPendingCreate(new Error('Previous room creation was cancelled.'));

        const timeoutId = window.setTimeout(() => {
            clearPendingCreate(new Error('创建房间超时，请稍后重试。'));
        }, 8000);

        pendingCreateRef.current = {
            created: false,
            joined: false,
            roomId: '',
            roomName: payload?.roomName || '',
            timeoutId,
            resolve,
            reject
        };

        socket.emit('createRoom', payload);
    }), [clearPendingCreate, socket]);

    const leaveRoom = useCallback((roomId = selectedRoomIdRef.current) => {
        selectedRoomIdRef.current = null;

        if (!socket) {
            clearSelectedRoom();
            clearMessages();
            clearPrivateMessages?.();
            syncUrlRoomId(null);
            return false;
        }

        if (roomId) {
            socket.emit('leaveRoom', { roomId });
        }

        clearSelectedRoom();
        clearMessages();
        clearPrivateMessages?.();
        syncUrlRoomId(null);
        return true;
    }, [clearPrivateMessages, clearSelectedRoom, clearMessages, socket]);

    const joinRoom = useCallback((roomId, options = {}) => {
        if (!roomId || !socket) return false;

        const previousRoomId = selectedRoomIdRef.current;

        if (previousRoomId && previousRoomId !== roomId) {
            socket.emit('leaveRoom', { roomId: previousRoomId });
            clearSelectedRoom();
        }

        selectedRoomIdRef.current = roomId;

        if (typeof markRoomJoinPending === 'function') {
            markRoomJoinPending(roomId);
        } else {
            setRoomUsers([]);
        }

        clearMessages();
        clearPrivateMessages?.();
        socket.emit('joinRoom', {
            roomId,
            ...(options.password ? { password: options.password } : {})
        });

        return true;
    }, [clearMessages, clearPrivateMessages, clearSelectedRoom, markRoomJoinPending, setRoomUsers, socket]);

    useEffect(() => {
        if (!socket) return;

        const onRoomsList = (roomsList) => {
            setRooms(roomsList);
        };

        const onRoomCreatedEvent = ({ roomId, roomName }) => {
            const pendingCreate = pendingCreateRef.current;
            if (!pendingCreate) return;

            pendingCreate.created = true;
            pendingCreate.roomId = roomId;
            pendingCreate.roomName = roomName;
            resolvePendingCreateIfReady();
        };

        const onRoomJoinedEvent = ({ roomId, roomName, users = [] }) => {
            selectedRoomIdRef.current = roomId;
            setJoinedRoom(roomId, roomName, users);

            const pendingCreate = pendingCreateRef.current;
            const matchesPendingCreate = pendingCreate && (
                pendingCreate.roomId
                    ? pendingCreate.roomId === roomId
                    : pendingCreate.roomName === roomName
            );

            if (matchesPendingCreate) {
                pendingCreate.joined = true;
                pendingCreate.roomId = roomId;
                pendingCreate.roomName = roomName;
                resolvePendingCreateIfReady();
            }

            onRoomJoinedRef.current?.({ roomId, roomName, users });
        };

        const onRoomUsersChanged = ({ users = [] }) => {
            setRoomUsers(users);
        };

        const onUserUpdated = ({ funId, name: updatedName }) => {
            updateRoomUser(funId, updatedName);
        };

        const onRoomError = ({ message }) => {
            if (message && (message.includes('Room not found') || message.includes('deleted'))) {
                const failedRoomId = selectedRoomIdRef.current;
                selectedRoomIdRef.current = null;
                clearSelectedRoom();
                clearMessages();
                clearPrivateMessages?.();
                syncUrlRoomId(null);
                onRoomDeletedRef.current?.({ roomId: failedRoomId, roomName: '' });
            }

            const hasPendingCreate = Boolean(pendingCreateRef.current);

            if (message) {
                clearPendingCreate(new Error(message));
            }

            if (message && !hasPendingCreate) {
                setTimeout(() => {
                    void showAlert({
                        title: '房间操作失败',
                        message
                    });
                }, 10);
            }
        };

        const onRoomDeletedEvent = ({ roomId, roomName }) => {
            removeRoom(roomId);

            if (selectedRoomIdRef.current === roomId) {
                selectedRoomIdRef.current = null;
                clearSelectedRoom();
                clearMessages();
                clearPrivateMessages?.();
                syncUrlRoomId(null);
                onRoomDeletedRef.current?.({ roomId, roomName });
                setTimeout(() => {
                    void showAlert({
                        title: '房间已删除',
                        message: `房间「${roomName || roomId}」已被删除。`
                    });
                }, 10);
            }
        };

        const onRoomRenamedEvent = ({ roomId, roomName }) => {
            updateRoomName?.(roomId, roomName);
        };

        const restoreSelectedRoom = () => {
            refreshRooms();

            const targetRoomId = getUrlRoomId() || selectedRoomIdRef.current;
            if (targetRoomId) {
                joinRoom(targetRoomId);
            }
        };

        const onSocketDisconnect = () => {
            const targetRoomId = selectedRoomIdRef.current;
            if (targetRoomId) {
                markRoomJoinPending?.(targetRoomId);
            }
            clearPendingCreate(new Error('连接已断开，创建房间已取消。'));
        };

        socket.on('roomsList', onRoomsList);
        socket.on('roomsUpdated', onRoomsList);
        socket.on('roomCreated', onRoomCreatedEvent);
        socket.on('roomJoined', onRoomJoinedEvent);
        socket.on('userJoinedRoom', onRoomUsersChanged);
        socket.on('userLeftRoom', onRoomUsersChanged);
        socket.on('userUpdated', onUserUpdated);
        socket.on('roomError', onRoomError);
        socket.on('roomDeleted', onRoomDeletedEvent);
        socket.on('roomRenamed', onRoomRenamedEvent);
        socket.on('connect', restoreSelectedRoom);
        socket.on('disconnect', onSocketDisconnect);

        if (socket.connected) {
            restoreSelectedRoom();
        }

        return () => {
            socket.off('roomsList', onRoomsList);
            socket.off('roomsUpdated', onRoomsList);
            socket.off('roomCreated', onRoomCreatedEvent);
            socket.off('roomJoined', onRoomJoinedEvent);
            socket.off('userJoinedRoom', onRoomUsersChanged);
            socket.off('userLeftRoom', onRoomUsersChanged);
            socket.off('userUpdated', onUserUpdated);
            socket.off('roomError', onRoomError);
            socket.off('roomDeleted', onRoomDeletedEvent);
            socket.off('roomRenamed', onRoomRenamedEvent);
            socket.off('connect', restoreSelectedRoom);
            socket.off('disconnect', onSocketDisconnect);
        };
    }, [
        clearSelectedRoom,
        clearMessages,
        clearPrivateMessages,
        clearPendingCreate,
        joinRoom,
        markRoomJoinPending,
        refreshRooms,
        removeRoom,
        resolvePendingCreateIfReady,
        setJoinedRoom,
        setRoomUsers,
        setRooms,
        socket,
        updateRoomName,
        updateRoomUser
    ]);

    return {
        createRoom,
        joinRoom,
        leaveRoom,
        refreshRooms
    };
};
