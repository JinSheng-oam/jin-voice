import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './auth-context';
import AuthModal from './components/AuthModal';
import { apiRequest } from './lib/apiClient';
import { getSocketUrl } from './lib/connectionConfig';
import { reconnectSharedSocket, getSharedSocket } from './lib/socketClient';
import { getInitialNickname, saveNickname } from './lib/nickname';

const SOCKET_URL = getSocketUrl();

export const AuthProvider = ({ children }) => {
    const [status, setStatus] = useState('loading');
    const [user, setUser] = useState(null);
    const [guestDisplayName, setGuestDisplayName] = useState(() => getInitialNickname());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('login');
    const [modalMessage, setModalMessage] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');

    const refreshSession = useCallback(async () => {
        try {
            const data = await apiRequest('/api/auth/session');
            if (data.authenticated && data.user) {
                setUser(data.user);
                setStatus('authenticated');
                return data.user;
            }

            setUser(null);
            setStatus('anonymous');
            return null;
        } catch {
            setUser(null);
            setStatus('anonymous');
            return null;
        }
    }, []);

    useEffect(() => {
        void refreshSession();
    }, [refreshSession]);

    useEffect(() => {
        const socket = getSharedSocket(SOCKET_URL);

        const onAuthRequired = ({ message } = {}) => {
            setModalMode('login');
            setModalMessage(message || '登录后才能继续当前操作。');
            setError('');
            setIsModalOpen(true);
        };

        const onAuthUserUpdated = (nextUser) => {
            setUser(nextUser || null);
            setStatus(nextUser ? 'authenticated' : 'anonymous');
        };

        const onSessionExpired = ({ message } = {}) => {
            setUser(null);
            setStatus('anonymous');
            setModalMode('login');
            setModalMessage(message || '当前登录状态已失效，请重新登录。');
            setError('');
            setIsModalOpen(true);
        };

        socket.on('authRequired', onAuthRequired);
        socket.on('authUserUpdated', onAuthUserUpdated);
        socket.on('sessionExpired', onSessionExpired);
        return () => {
            socket.off('authRequired', onAuthRequired);
            socket.off('authUserUpdated', onAuthUserUpdated);
            socket.off('sessionExpired', onSessionExpired);
        };
    }, []);

    const closeAuthModal = useCallback(() => {
        setIsModalOpen(false);
        setModalMessage('');
        setError('');
    }, []);

    const openAuthModal = useCallback((mode = 'login', message = '') => {
        setModalMode(mode);
        setModalMessage(message);
        setError('');
        setIsModalOpen(true);
    }, []);

    const updateGuestDisplayName = useCallback((nextName) => {
        const normalized = saveNickname(nextName);
        setGuestDisplayName(normalized);
        return normalized;
    }, []);

    const login = useCallback(async ({ email, password }) => {
        setPending(true);
        setError('');

        try {
            const data = await apiRequest('/api/auth/login', {
                method: 'POST',
                body: { email, password }
            });

            setUser(data.user);
            setStatus('authenticated');
            closeAuthModal();
            reconnectSharedSocket(SOCKET_URL);
            return data.user;
        } catch (requestError) {
            setError(requestError.message);
            throw requestError;
        } finally {
            setPending(false);
        }
    }, [closeAuthModal]);

    const register = useCallback(async ({ email, password, displayName }) => {
        setPending(true);
        setError('');

        try {
            const data = await apiRequest('/api/auth/register', {
                method: 'POST',
                body: { email, password, displayName }
            });

            setUser(data.user);
            setStatus('authenticated');
            closeAuthModal();
            reconnectSharedSocket(SOCKET_URL);
            return data.user;
        } catch (requestError) {
            setError(requestError.message);
            throw requestError;
        } finally {
            setPending(false);
        }
    }, [closeAuthModal]);

    const logout = useCallback(async () => {
        setPending(true);
        setError('');

        try {
            await apiRequest('/api/auth/logout', {
                method: 'POST'
            });

            setUser(null);
            setStatus('anonymous');
            reconnectSharedSocket(SOCKET_URL);
        } finally {
            setPending(false);
        }
    }, []);

    const updateProfile = useCallback(async ({ displayName }) => {
        setPending(true);
        setError('');

        try {
            const data = await apiRequest('/api/auth/profile', {
                method: 'PATCH',
                body: { displayName }
            });

            setUser(data.user);
            return data.user;
        } catch (requestError) {
            setError(requestError.message);
            throw requestError;
        } finally {
            setPending(false);
        }
    }, []);

    const value = useMemo(() => ({
        status,
        user,
        displayName: user?.displayName || guestDisplayName,
        isAdmin: Boolean(user?.isAdmin),
        guestDisplayName,
        isAuthenticated: status === 'authenticated',
        isLoading: status === 'loading',
        pending,
        error,
        openAuthModal,
        closeAuthModal,
        refreshSession,
        login,
        register,
        logout,
        updateProfile,
        updateGuestDisplayName
    }), [
        closeAuthModal,
        error,
        guestDisplayName,
        login,
        logout,
        openAuthModal,
        pending,
        refreshSession,
        register,
        status,
        updateProfile,
        updateGuestDisplayName,
        user
    ]);

    return (
        <AuthContext.Provider value={value}>
            {children}
            {isModalOpen && (
                <AuthModal
                    mode={modalMode}
                    message={modalMessage}
                    pending={pending}
                    error={error}
                    onClose={closeAuthModal}
                    onLogin={login}
                    onRegister={register}
                />
            )}
        </AuthContext.Provider>
    );
};
