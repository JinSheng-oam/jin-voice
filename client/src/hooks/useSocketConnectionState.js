import { useEffect, useRef, useState } from 'react';
import { recordClientMetric } from '../lib/telemetry';

export const useSocketConnectionState = (socket) => {
    const [status, setStatus] = useState(socket.connected ? 'connected' : 'connecting');
    const disconnectedAtRef = useRef(null);
    const restoredTimerRef = useRef(null);

    useEffect(() => {
        const onConnect = () => {
            if (disconnectedAtRef.current) {
                recordClientMetric('socket_reconnected', Date.now() - disconnectedAtRef.current);
                disconnectedAtRef.current = null;
                setStatus('restored');
                restoredTimerRef.current = window.setTimeout(() => setStatus('connected'), 2400);
                return;
            }
            setStatus('connected');
        };
        const onDisconnect = () => {
            disconnectedAtRef.current = Date.now();
            setStatus('reconnecting');
        };
        const onConnectError = () => setStatus(socket.active ? 'reconnecting' : 'offline');

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        if (socket.connected) onConnect();

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            if (restoredTimerRef.current) window.clearTimeout(restoredTimerRef.current);
        };
    }, [socket]);

    return status;
};
