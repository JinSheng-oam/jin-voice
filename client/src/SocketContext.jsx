import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import useAudioStore from './stores/useAudioStore';
import useRoomStore from './stores/useRoomStore';
import { useShallow } from 'zustand/react/shallow';
import { useLocalAudioPipeline } from './hooks/useLocalAudioPipeline';
import { useP2PCalls } from './hooks/useP2PCalls';
import { usePeerFileTransfer } from './hooks/usePeerFileTransfer';
import { useSocketMessaging } from './hooks/useSocketMessaging';
import { useSfuRoomAudio } from './hooks/useSfuRoomAudio';
import { createIceServers, getSocketUrl } from './lib/connectionConfig';
import { getSharedSocket } from './lib/socketClient';

const SocketContext = createContext();

const SERVER_URL = getSocketUrl();
const socket = getSharedSocket(SERVER_URL);
const ICE_SERVERS = createIceServers();

const ContextProvider = ({ children }) => {
    const [stream, setStream] = useState(null);
    // 从 localStorage 恢复昵称，如果没有则生成随机昵称
    const { user, displayName } = useAuth();
    const name = displayName || '访客';
    const [sfuConnectionError, setSfuConnectionError] = useState(null);

    const myVideo = useRef();
    const connectionRef = useRef();

    // Remote Audio Context for gain control
    const remoteAudioContextRef = useRef(null);
    const remoteGainNodeRef = useRef(null);
    const userVolumesRef = useRef({});
    const isDeafenedRef = useRef(false);
    const fileSendCleanupRef = useRef(null);

    const {
        setAudioDevices,
        selectedAudioInput, setSelectedAudioInput,
        selectedAudioOutput, setSelectedAudioOutput,
        microphoneEnhancementEnabled,
        noiseSuppressionEnabled,
        noiseSuppressionStrength,
        userVolumes, setUserVolume,
        isMuted, toggleMute,
        isDeafened, toggleDeafen,
        voiceActivationEnabled,
        setVoiceActivationEnabled,
        voiceActivationThreshold,
        setVoiceActivationThreshold,
        pushToTalkEnabled,
        pushToTalkKey,
        voiceActivationOpenSensitivity,
        voiceActivationReleaseDelay,
        voiceActivationNoiseTolerance,
        selfMonitorEnabled,
        selfMonitorVolume,
        setMicVolume
    } = useAudioStore(useShallow(state => ({
        setAudioDevices: state.setAudioDevices,
        selectedAudioInput: state.selectedAudioInput,
        setSelectedAudioInput: state.setSelectedAudioInput,
        selectedAudioOutput: state.selectedAudioOutput,
        setSelectedAudioOutput: state.setSelectedAudioOutput,
        microphoneEnhancementEnabled: state.microphoneEnhancementEnabled,
        noiseSuppressionEnabled: state.noiseSuppressionEnabled,
        noiseSuppressionStrength: state.noiseSuppressionStrength,
        userVolumes: state.userVolumes,
        setUserVolume: state.setUserVolume,
        isMuted: state.isMuted,
        toggleMute: state.toggleMute,
        isDeafened: state.isDeafened,
        toggleDeafen: state.toggleDeafen,
        voiceActivationEnabled: state.voiceActivationEnabled,
        setVoiceActivationEnabled: state.setVoiceActivationEnabled,
        voiceActivationThreshold: state.voiceActivationThreshold,
        setVoiceActivationThreshold: state.setVoiceActivationThreshold,
        pushToTalkEnabled: state.pushToTalkEnabled,
        pushToTalkKey: state.pushToTalkKey,
        voiceActivationOpenSensitivity: state.voiceActivationOpenSensitivity,
        voiceActivationReleaseDelay: state.voiceActivationReleaseDelay,
        voiceActivationNoiseTolerance: state.voiceActivationNoiseTolerance,
        selfMonitorEnabled: state.selfMonitorEnabled,
        selfMonitorVolume: state.selfMonitorVolume,
        setMicVolume: state.setMicVolume
    })));

    const {
        addMessage,
        setMessages,
        addPrivateMessage,
        removeMessage,
        removePrivateMessage,
        selectedRoomId,
        joinedRoomId,
        setSelectedRoomId
    } = useRoomStore(useShallow(state => ({
        addMessage: state.addMessage,
        setMessages: state.setMessages,
        addPrivateMessage: state.addPrivateMessage,
        removeMessage: state.removeMessage,
        removePrivateMessage: state.removePrivateMessage,
        selectedRoomId: state.selectedRoomId,
        joinedRoomId: state.joinedRoomId,
        setSelectedRoomId: state.setSelectedRoom
    })));

    const {
        me,
        sendChatMessage,
        sendPrivateMessage,
        deleteMessage
    } = useSocketMessaging({
        socket,
        currentUser: user,
        displayName,
        addMessage,
        setMessages,
        addPrivateMessage,
        removeMessage,
        removePrivateMessage
    });

    useEffect(() => {
        userVolumesRef.current = userVolumes;
    }, [userVolumes]);

    useEffect(() => {
        isDeafenedRef.current = isDeafened;
    }, [isDeafened]);

    const {
        mediasoupClientRef,
        remoteAudiosRef,
        sfuConnectedPeers,
        sfuRoomJoined
    } = useSfuRoomAudio({
        socket,
        me,
        selectedRoomId,
        roomJoinConfirmed: Boolean(selectedRoomId && joinedRoomId === selectedRoomId),
        stream,
        isMuted,
        selectedAudioOutput,
        setConnectionError: setSfuConnectionError,
        userVolumesRef,
        isDeafenedRef,
        remoteAudioContextRef
    });

    const {
        downloadLink,
        transferProgress,
        pendingFileTransfer,
        acceptFileTransfer,
        rejectFileTransfer,
        handleDataReceived,
        sendFile
    } = usePeerFileTransfer({
        connectionRef,
        fileSendCleanupRef
    });

    const {
        connectedPeer,
        connectingPeerId,
        isConnecting,
        connectionError: p2pConnectionError,
        connectionType,
        callUser: connectPeer,
        hangupP2P: disconnectPeer,
        setConnectedPeer
    } = useP2PCalls({
        socket,
        me,
        iceServers: ICE_SERVERS,
        connectionRef,
        fileSendCleanupRef,
        handleDataReceived
    });

    const {
        adjustUserVolume,
        voiceTransmissionState
    } = useLocalAudioPipeline({
        stream,
        setStream,
        myVideoRef: myVideo,
        connectionRef,
        mediasoupClientRef,
        remoteAudioContextRef,
        remoteGainNodeRef,
        remoteAudiosRef,
        connectedPeer,
        isMuted,
        isDeafened,
        selectedAudioInput,
        selectedAudioOutput,
        microphoneEnhancementEnabled,
        noiseSuppressionEnabled,
        noiseSuppressionStrength,
        userVolumes,
        voiceActivationOpenSensitivity,
        voiceActivationEnabled,
        pushToTalkEnabled,
        pushToTalkKey,
        voiceActivationReleaseDelay,
        voiceActivationNoiseTolerance,
        voiceActivationThreshold,
        selfMonitorEnabled,
        selfMonitorVolume,
        setAudioDevices,
        setSelectedAudioInput,
        setSelectedAudioOutput,
        setMicVolume,
        setUserVolume
    });

    const connectionError = p2pConnectionError || sfuConnectionError;

    useEffect(() => {
        if (!import.meta.env.DEV || typeof window === 'undefined') {
            return undefined;
        }

        window.__jinvoiceDebug = {
            getState: () => ({
                identity: {
                    me,
                    name,
                    accountUserId: user?.id || null
                },
                room: {
                    selectedRoomId,
                    joinedRoomId,
                    joinConfirmed: Boolean(selectedRoomId && joinedRoomId === selectedRoomId)
                },
                audioDevices: {
                    selectedAudioInput,
                    selectedAudioOutput
                },
                voiceGate: {
                    voiceTransmissionState,
                    isMuted,
                    isDeafened,
                    pushToTalkEnabled,
                    pushToTalkKey,
                    voiceActivationEnabled,
                    voiceActivationThreshold,
                    selfMonitorEnabled,
                    selfMonitorVolume
                },
                desktop: {
                    isDesktop: Boolean(window.jinvoiceDesktop?.isDesktop),
                    platform: window.jinvoiceDesktop?.platform || null,
                    serverUrl: window.jinvoiceDesktop?.serverUrl || null
                },
                streamTrackStates: stream?.getTracks?.().map((track) => ({
                    kind: track.kind,
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState,
                    settings: typeof track.getSettings === 'function' ? track.getSettings() : null
                })) || [],
                connectedPeer,
                connectionType,
                sfuConnectedPeers: Array.from(sfuConnectedPeers || []),
                sfuRoomJoined,
                sendTransportState: mediasoupClientRef.current?.sendTransport?.connectionState || null,
                recvTransportState: mediasoupClientRef.current?.recvTransport?.connectionState || null,
                producerPaused: mediasoupClientRef.current?.producer?.paused ?? null,
                producerTrackState: mediasoupClientRef.current?.producer?.track
                    ? {
                        enabled: mediasoupClientRef.current.producer.track.enabled,
                        muted: mediasoupClientRef.current.producer.track.muted,
                        readyState: mediasoupClientRef.current.producer.track.readyState,
                        settings: typeof mediasoupClientRef.current.producer.track.getSettings === 'function'
                            ? mediasoupClientRef.current.producer.track.getSettings()
                            : null
                    }
                    : null,
                remoteAudioEntries: Array.from(remoteAudiosRef.current?.entries?.() || []).map(([peerId, entry]) => ({
                    peerId,
                    hasAudioElement: Boolean(entry?.audioElement),
                    trackState: entry?.track
                        ? {
                            enabled: entry.track.enabled,
                            muted: entry.track.muted,
                            readyState: entry.track.readyState,
                            settings: typeof entry.track.getSettings === 'function' ? entry.track.getSettings() : null
                        }
                        : null
                }))
            })
        };

        return () => {
            if (window.__jinvoiceDebug) {
                delete window.__jinvoiceDebug;
            }
        };
    }, [
        connectedPeer,
        connectionType,
        isDeafened,
        isMuted,
        me,
        mediasoupClientRef,
        name,
        joinedRoomId,
        pushToTalkEnabled,
        pushToTalkKey,
        remoteAudiosRef,
        selectedRoomId,
        selectedAudioInput,
        selectedAudioOutput,
        selfMonitorEnabled,
        selfMonitorVolume,
        sfuConnectedPeers,
        sfuRoomJoined,
        stream,
        user,
        voiceActivationEnabled,
        voiceActivationThreshold,
        voiceTransmissionState
    ]);

    useEffect(() => () => {
        if (remoteAudioContextRef.current && remoteAudioContextRef.current.state !== 'closed') {
            remoteAudioContextRef.current.close().catch(() => {
                /* noop cleanup */
            });
            remoteAudioContextRef.current = null;
        }
    }, []);

    const contextValue = useMemo(() => ({
            myVideo,
            stream,
            name,
            me,
            connectPeer,

            sendChatMessage,
            deleteMessage,
            sendFile,
            downloadLink,
            transferProgress,

            sendPrivateMessage,
            connectedPeer,
            connectingPeerId,
            setConnectedPeer,
            isConnecting,
            connectionError,
            connectionType,
            socket,
            userVolumes,
            adjustUserVolume,
            // Audio controls
            isMuted,
            isDeafened,
            toggleMute,
            toggleDeafen,
            // Voice activation (keep in context for now or move next)
            voiceActivationEnabled,
            setVoiceActivationEnabled,
            voiceActivationThreshold,
            pushToTalkEnabled,
            pushToTalkKey,
            setVoiceActivationThreshold,
            voiceTransmissionState,
            // File transfer confirmation
            pendingFileTransfer,
            acceptFileTransfer,
            rejectFileTransfer,
            // SFU mode
            sfuConnectedPeers,
            selectedRoomId,
            setSelectedRoomId,
            disconnectPeer,
            sfuRoomJoined
        }), [
            acceptFileTransfer,
            adjustUserVolume,
            connectPeer,
            connectedPeer,
            connectingPeerId,
            connectionError,
            connectionType,
            disconnectPeer,
            downloadLink,
            deleteMessage,
            isConnecting,
            isDeafened,
            isMuted,
            me,
            name,
            pendingFileTransfer,
            rejectFileTransfer,
            selectedRoomId,
            sendChatMessage,
            sendFile,
            sendPrivateMessage,
            setConnectedPeer,
            setSelectedRoomId,
            setVoiceActivationEnabled,
            setVoiceActivationThreshold,
            sfuConnectedPeers,
            sfuRoomJoined,
            stream,
            toggleDeafen,
            toggleMute,
            transferProgress,
            userVolumes,
            voiceTransmissionState,
            voiceActivationEnabled,
            voiceActivationThreshold,
            pushToTalkEnabled,
            pushToTalkKey
        ]);

    return (
        <SocketContext.Provider value={contextValue}>
            {children}
        </SocketContext.Provider>
    );
};

export { ContextProvider, SocketContext };
