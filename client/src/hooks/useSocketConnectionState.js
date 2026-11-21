import { useEffect, useRef, useState } from 'react';
import { recordClientMetric } from '../lib/telemetry';

export const useSocketConnectionState = (socket) => {
    const [status, setStatus] = useState(socket.connected ? 'connected' : 'connecting');
    const disconnectedAtRef = useRef(null);
    const restoredTimerRef = useRef(null);

    useEffect(() => {
        const clearRestoredTimer = () => {
            if (restoredTimerRef.current) {
                window.clearTimeout(restoredTimerRef.current);
                restoredTimerRef.current = null;
            }
        };

        const onConnect = () => {
            clearRestoredTimer();
            if (disconnectedAtRef.current) {
                recordClientMetric('socket_reconnected', Date.now() - disconnectedAtRef.current);
                disconnectedAtRef.current = null;
                setStatus('restored');
                restoredTimerRef.current = window.setTimeout(() => {
                    restoredTimerRef.current = null;
                    setStatus('connected');
                }, 2400);
                return;
            }
            setStatus('connected');
        };
        const onDisconnect = () => {
            clearRestoredTimer();
            disconnectedAtRef.current = Date.now();
            setStatus('reconnecting');
        };
        const onConnectError = () => {
            clearRestoredTimer();
            setStatus(socket.active ? 'reconnecting' : 'offline');
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        if (socket.connected) onConnect();

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            clearRestoredTimer();
        };
    }, [socket]);

    return status;
};
