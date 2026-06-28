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
    clearSelectedRoom,
    clearMessages,
    removeRoom,
    updateRoomName,
    setRoomUsers,
    updateRoomUser,
    onRoomJoined,
    onRoomDeleted
}) => {
    const hasJoinedRef = useRef(false);
    const listenersReadyRef = useRef(false);
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
        hasJoinedRef.current = false;
        listenersReadyRef.current = false;
    }, [socket]);

    useEffect(() => {
        syncUrlRoomId(selectedRoomId);
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
        if (!socket) {
            clearSelectedRoom();
            clearMessages();
            return false;
        }

        if (roomId) {
            socket.emit('leaveRoom', { roomId });
        }

        clearSelectedRoom();
        clearMessages();
        hasJoinedRef.current = false;
        return true;
    }, [clearSelectedRoom, clearMessages, socket]);

    const joinRoom = useCallback((roomId, options = {}) => {
        if (!roomId || !socket) return false;

        if (selectedRoomIdRef.current && selectedRoomIdRef.current !== roomId) {
            socket.emit('leaveRoom', { roomId: selectedRoomIdRef.current });
            clearSelectedRoom();
        }

        setRoomUsers([]);

        hasJoinedRef.current = true;
        socket.emit('joinRoom', {
            roomId,
            ...(options.password ? { password: options.password } : {})
        });

        return true;
    }, [clearSelectedRoom, setRoomUsers, socket]);

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
                clearSelectedRoom();
                onRoomDeletedRef.current?.({ roomId: selectedRoomIdRef.current, roomName: '' });
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
                clearSelectedRoom();
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

        refreshRooms();
        listenersReadyRef.current = true;
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

        return () => {
            listenersReadyRef.current = false;
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
        };
    }, [
        clearSelectedRoom,
        clearPendingCreate,
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

    useEffect(() => {
        if (!socket || hasJoinedRef.current || !listenersReadyRef.current) return;

        const urlRoomId = getUrlRoomId();
        const targetRoomId = urlRoomId || selectedRoomId;

        if (!targetRoomId) return;

        joinRoom(targetRoomId);
    }, [joinRoom, selectedRoomId, socket]);

    return {
        createRoom,
        joinRoom,
        leaveRoom,
        refreshRooms
    };
};
