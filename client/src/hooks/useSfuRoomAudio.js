import { useCallback, useEffect, useRef, useState } from 'react';
import MediasoupClient from '../mediasoup/MediasoupClient';
import { cleanupRemoteAudioEntry, playRemoteStream } from '../lib/remoteAudio';

export const useSfuRoomAudio = ({
    socket,
    me,
    selectedRoomId,
    stream,
    isMuted,
    selectedAudioOutput,
    setConnectionError,
    userVolumesRef,
    isDeafenedRef,
    remoteAudioContextRef
}) => {
    const mediasoupClientRef = useRef(null);
    const remoteAudiosRef = useRef(new Map());
    const selectedAudioOutputRef = useRef(selectedAudioOutput);

    const [sfuConnectedPeers, setSfuConnectedPeers] = useState(new Set());
    const [sfuRoomJoined, setSfuRoomJoined] = useState(false);

    useEffect(() => {
        selectedAudioOutputRef.current = selectedAudioOutput;
    }, [selectedAudioOutput]);

    const cleanupAllRemoteAudios = useCallback(() => {
        remoteAudiosRef.current.forEach((userData) => {
            cleanupRemoteAudioEntry(userData);
        });
        remoteAudiosRef.current.clear();
        setSfuConnectedPeers(new Set());
    }, []);

    const storeRemoteAudioEntry = useCallback((peerId, entry) => {
        const existing = remoteAudiosRef.current.get(peerId) || {};
        remoteAudiosRef.current.set(peerId, {
            ...existing,
            ...entry
        });
    }, []);

    const removeRemoteAudioEntry = useCallback((peerId) => {
        const userData = remoteAudiosRef.current.get(peerId);
        cleanupRemoteAudioEntry(userData);
        remoteAudiosRef.current.delete(peerId);
    }, []);

    const attachConsumerHandlers = useCallback((msClient) => {
        msClient.onNewConsumer = (peerId, producerId, track) => {
            void producerId;

            const existingUser = remoteAudiosRef.current.get(peerId);
            if (existingUser?.audioElement) {
                cleanupRemoteAudioEntry(existingUser);
            }

            setSfuConnectedPeers((prev) => new Set(prev).add(peerId));

            const remoteStream = new MediaStream([track]);
            const audioElement = playRemoteStream({
                remoteStream,
                userId: peerId,
                userVolumes: userVolumesRef.current,
                isDeafened: isDeafenedRef.current,
                selectedAudioOutput: selectedAudioOutputRef.current,
                remoteAudioContextRef
            });

            storeRemoteAudioEntry(peerId, {
                track,
                audioElement
            });
        };

        msClient.onConsumerClosed = (peerId, producerId) => {
            void producerId;

            setSfuConnectedPeers((prev) => {
                const nextSet = new Set(prev);
                nextSet.delete(peerId);
                return nextSet;
            });

            removeRemoteAudioEntry(peerId);
        };
    }, [isDeafenedRef, remoteAudioContextRef, removeRemoteAudioEntry, storeRemoteAudioEntry, userVolumesRef]);

    const createManagedClient = useCallback(() => {
        const msClient = new MediasoupClient(socket);
        mediasoupClientRef.current = msClient;
        attachConsumerHandlers(msClient);
        return msClient;
    }, [attachConsumerHandlers, socket]);

    useEffect(() => {
        const handleInteraction = () => {
            const ctx = remoteAudioContextRef.current;
            if (ctx && ctx.state === 'suspended') {
                ctx.resume().catch(() => {
                    /* noop resume */
                });
            }
        };

        window.addEventListener('click', handleInteraction);
        window.addEventListener('touchstart', handleInteraction);
        window.addEventListener('keydown', handleInteraction);

        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
        };
    }, [remoteAudioContextRef]);

    useEffect(() => {
        if (!selectedRoomId || !me) return;

        const msClient = createManagedClient();

        msClient.joinRoom(selectedRoomId, me)
            .then(() => {
                setSfuRoomJoined(true);
            })
            .catch((error) => {
                console.error('[SFU] Failed to join room:', error);
                if (mediasoupClientRef.current === msClient) {
                    msClient.leaveRoom();
                    mediasoupClientRef.current = null;
                }
                setConnectionError(`SFU audio failed: ${error.message}`);
            });

        return () => {
            setSfuRoomJoined(false);
            if (mediasoupClientRef.current === msClient) {
                mediasoupClientRef.current = null;
            }
            msClient.leaveRoom();
            cleanupAllRemoteAudios();
        };
    }, [cleanupAllRemoteAudios, createManagedClient, me, selectedRoomId, setConnectionError]);

    useEffect(() => {
        const msClient = mediasoupClientRef.current;
        if (!msClient || !selectedRoomId || !sfuRoomJoined) return;

        const track = stream?.getAudioTracks?.()[0];
        if (!track || track.readyState === 'ended') {
            msClient.producer?.pause();
            return;
        }

        if (isMuted) {
            msClient.producer?.pause();
            return;
        }

        if (!msClient.producer) {
            msClient.produce(stream).catch((error) => {
                console.error('[SFU] Produce error:', error);
            });
            return;
        }

        if (msClient.producer.track && msClient.producer.track !== track) {
            msClient.producer.replaceTrack({ track }).catch((error) => {
                console.error('[SFU] Track replace failed:', error);
            });
        }

        if (msClient.producer.paused) {
            msClient.producer.resume();
        }
    }, [isMuted, selectedRoomId, sfuRoomJoined, stream]);

    return {
        mediasoupClientRef,
        remoteAudiosRef,
        sfuConnectedPeers,
        sfuRoomJoined
    };
};
