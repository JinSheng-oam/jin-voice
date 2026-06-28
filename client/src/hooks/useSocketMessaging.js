import { useCallback, useEffect, useState } from 'react';

export const useSocketMessaging = ({
    socket,
    currentUser,
    displayName,
    addMessage,
    setMessages,
    addPrivateMessage,
    removeMessage,
    removePrivateMessage
}) => {
    const [me, setMe] = useState('');

    useEffect(() => {
        const onMe = (id) => {
            setMe(id);
        };

        const onReceiveMessage = (data) => {
            addMessage(data);
        };

        const onChatHistory = (history) => {
            if (Array.isArray(history) && history.length > 0) {
                setMessages(history);
            }
        };

        const onReceivePrivateMessage = (data) => {
            addPrivateMessage(data);
        };

        const onMessageDeleted = ({ messageId }) => {
            removeMessage?.(messageId);
        };

        const onPrivateMessageDeleted = ({ messageId }) => {
            removePrivateMessage?.(messageId);
        };

        const onConnectError = (error) => {
            console.error('Socket connection error:', error);
        };

        socket.on('me', onMe);
        socket.on('receiveMessage', onReceiveMessage);
        socket.on('chatHistory', onChatHistory);
        socket.on('receivePrivateMessage', onReceivePrivateMessage);
        socket.on('messageDeleted', onMessageDeleted);
        socket.on('privateMessageDeleted', onPrivateMessageDeleted);
        socket.on('connect_error', onConnectError);

        return () => {
            socket.off('me', onMe);
            socket.off('receiveMessage', onReceiveMessage);
            socket.off('chatHistory', onChatHistory);
            socket.off('receivePrivateMessage', onReceivePrivateMessage);
            socket.off('messageDeleted', onMessageDeleted);
            socket.off('privateMessageDeleted', onPrivateMessageDeleted);
            socket.off('connect_error', onConnectError);
        };
    }, [addMessage, setMessages, addPrivateMessage, removeMessage, removePrivateMessage, socket]);

    useEffect(() => {
        if (!socket || currentUser || !displayName?.trim()) return;

        const syncGuestName = () => {
            socket.emit('updateName', { name: displayName.trim() });
        };

        if (socket.connected) {
            syncGuestName();
        }

        socket.on('connect', syncGuestName);
        return () => {
            socket.off('connect', syncGuestName);
        };
    }, [currentUser, displayName, socket]);

    const sendChatMessage = useCallback((msg) => {
        const messageData = {
            text: msg,
            time: new Date().toLocaleTimeString()
        };
        socket.emit('sendMessage', messageData);
    }, [socket]);

    const sendPrivateMessage = useCallback((msg, to) => {
        const messageData = {
            id: `private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            text: msg,
            time: new Date().toLocaleTimeString(),
            to,
            from: me,
            userId: currentUser?.id || null
        };
        socket.emit('sendPrivateMessage', messageData);
    }, [currentUser?.id, me, socket]);

    const deleteMessage = useCallback((msg, isPrivate = false) => new Promise((resolve) => {
        if (!msg?.id) {
            resolve({ error: 'Message id is missing.' });
            return;
        }

        if (isPrivate) {
            socket.emit('deleteMessage', {
                privateMessageId: msg.id,
                from: msg.from,
                to: msg.to
            }, (response = {}) => resolve(response));
            return;
        }

        socket.emit('deleteMessage', { messageId: msg.id }, (response = {}) => resolve(response));
    }), [socket]);

    return {
        me,
        sendChatMessage,
        sendPrivateMessage,
        deleteMessage
    };
};
