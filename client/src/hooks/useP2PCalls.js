import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { bindPeerEvents } from '../lib/p2pPeer';

export const useP2PCalls = ({
    socket,
    me,
    iceServers,
    connectionRef,
    fileSendCleanupRef,
    handleDataReceived
}) => {
    const [connectedPeer, setConnectedPeer] = useState(null);
    const [connectingPeerId, setConnectingPeerId] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [connectionType, setConnectionType] = useState(null);

    const connectTimeoutRef = useRef(null);
    const pendingTargetRef = useRef(null);

    const cleanupPeerSession = useCallback(() => {
        fileSendCleanupRef.current?.();
        fileSendCleanupRef.current = null;
    }, [fileSendCleanupRef]);

    const clearConnectTimeout = useCallback(() => {
        if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
        }
    }, []);

    const destroyCurrentPeer = useCallback(() => {
        if (connectionRef.current) {
            connectionRef.current.destroy();
            connectionRef.current = null;
        }
    }, [connectionRef]);

    const detectConnectionType = useCallback(() => {
        const peer = connectionRef.current;
        if (!peer || !peer._pc) {
            return;
        }

        peer._pc.getStats().then((stats) => {
            let foundType = null;
            stats.forEach((report) => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    const isRelay = report.remoteCandidateType === 'relay' ||
                        report.localCandidateType === 'relay';
                    foundType = isRelay ? 'relay' : 'direct';
                }
            });

            if (foundType) {
                setConnectionType(foundType);
            }
        }).catch((error) => {
            console.error('[P2P] 获取连接统计失败:', error);
        });
    }, [connectionRef]);

    const resetConnectionState = useCallback(() => {
        clearConnectTimeout();
        cleanupPeerSession();
        destroyCurrentPeer();
        pendingTargetRef.current = null;
        setConnectingPeerId(null);
        setConnectedPeer(null);
        setIsConnecting(false);
        setConnectionType(null);
    }, [clearConnectTimeout, cleanupPeerSession, destroyCurrentPeer]);

    const buildPeer = useCallback(({ initiator, targetPeerId, initialSignal = null }) => {
        const peer = new Peer({
            initiator,
            trickle: false,
            config: iceServers
        });

        bindPeerEvents({
            peer,
            onSignal: (data) => {
                if (initiator) {
                    socket.emit('callUser', { userToCall: targetPeerId, signalData: data, from: me });
                    return;
                }

                socket.emit('answerCall', { signal: data, to: targetPeerId });
            },
            onData: handleDataReceived,
            onError: (error) => {
                console.error('[P2P] Data channel error:', error);
                setConnectionError(`连接失败: ${error.message}`);
                resetConnectionState();
            },
            onClose: () => {
                resetConnectionState();
            },
            onConnect: () => {
                clearConnectTimeout();
                setConnectedPeer(targetPeerId);
                setConnectingPeerId(null);
                setIsConnecting(false);
                setConnectionError(null);
                setTimeout(() => detectConnectionType(), 1500);
            }
        });

        if (initialSignal) {
            peer.signal(initialSignal);
        }

        connectionRef.current = peer;
        return peer;
    }, [
        clearConnectTimeout,
        connectionRef,
        detectConnectionType,
        handleDataReceived,
        iceServers,
        me,
        resetConnectionState,
        socket
    ]);

    const callUser = useCallback((id) => {
        if (!id || id === me) {
            return;
        }

        resetConnectionState();
        setConnectionError(null);
        setIsConnecting(true);
        pendingTargetRef.current = id;
        setConnectingPeerId(id);

        const peer = buildPeer({
            initiator: true,
            targetPeerId: id
        });

        connectTimeoutRef.current = setTimeout(() => {
            if (!connectionRef.current || !connectionRef.current.connected) {
                setConnectionError('文件连接超时，请确认对方在线后重试。');
                setIsConnecting(false);
                setConnectingPeerId(null);
                peer.destroy();
            }
        }, 15000);
    }, [buildPeer, connectionRef, me, resetConnectionState]);

    const hangupP2P = useCallback(() => {
        resetConnectionState();
    }, [resetConnectionState]);

    useEffect(() => {
        const onCallUser = ({ from, signal }) => {
            if (!from || from === me) {
                return;
            }

            resetConnectionState();
            buildPeer({
                initiator: false,
                targetPeerId: from,
                initialSignal: signal
            });
        };

        const onCallAccepted = (signal) => {
            if (!signal || !connectionRef.current || !pendingTargetRef.current) {
                return;
            }

            connectionRef.current.signal(signal);
        };

        socket.on('callUser', onCallUser);
        socket.on('callAccepted', onCallAccepted);

        return () => {
            socket.off('callUser', onCallUser);
            socket.off('callAccepted', onCallAccepted);
        };
    }, [buildPeer, connectionRef, me, resetConnectionState, socket]);

    useEffect(() => () => {
        resetConnectionState();
    }, [resetConnectionState]);

    return {
        connectedPeer,
        connectingPeerId,
        isConnecting,
        connectionError,
        connectionType,
        callUser,
        hangupP2P,
        setConnectedPeer
    };
};
