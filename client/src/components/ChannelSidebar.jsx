import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../useAuth';
import { SocketContext } from '../SocketContext';
import useAudioStore from '../stores/useAudioStore';
import useRoomStore from '../stores/useRoomStore';
import { useShallow } from 'zustand/react/shallow';
import SettingsModal from './SettingsModal';
import { showAlert } from '../stores/useDialogStore';
import {
    FiUsers,
    FiMic,
    FiMicOff,
    FiHeadphones,
    FiSettings,
    FiRadio,
    FiVolume2,
    FiActivity,
    FiEdit3,
    FiSlash,
    FiGrid,
    FiMessageSquare,
    FiLogOut,
    FiUserMinus
} from 'react-icons/fi';
import { TbHeadphonesOff } from 'react-icons/tb';

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 160;
const CONTEXT_MENU_GAP = 16;

const ChannelSidebar = ({ roomId, roomName, users = [], onNavigateMobile, onLeaveRoom, canManageRoom = false, onRemoveMember }) => {
    const {
        socket,
        me,
        name,
        connectedPeer,
        connectingPeerId,
        isConnecting,
        isMuted,
        isDeafened,
        toggleMute,
        toggleDeafen,
        connectionType,
        connectionError,
        userVolumes,
        adjustUserVolume,
        audioQuality,
        sfuConnectedPeers,
        selectedRoomId,
        disconnectPeer
    } = useContext(SocketContext);
    const { user, pending, updateProfile, updateGuestDisplayName } = useAuth();
    const micVolume = useAudioStore((state) => state.micVolume);
    const { privateChatTarget, setPrivateChatTarget } = useRoomStore(useShallow((state) => ({
        privateChatTarget: state.privateChatTarget,
        setPrivateChatTarget: state.setPrivateChatTarget
    })));
    const sidebarRef = useRef(null);
    const contextMenuRangeRef = useRef(null);

    const [contextMenu, setContextMenu] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        const closeContextMenu = () => setContextMenu(null);
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') closeContextMenu();
        };
        window.addEventListener('click', closeContextMenu);
        window.addEventListener('resize', closeContextMenu);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('click', closeContextMenu);
            window.removeEventListener('resize', closeContextMenu);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
        if (contextMenu) contextMenuRangeRef.current?.focus();
    }, [contextMenu]);

    const openVolumeMenu = useCallback(({ clientX, clientY }, userId, userName) => {
        if (userId === me) return;
        const maxX = window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GAP;
        const maxY = window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_GAP;

        setContextMenu({
            x: Math.max(CONTEXT_MENU_GAP, Math.min(clientX, maxX)),
            y: Math.max(CONTEXT_MENU_GAP, Math.min(clientY + 10, maxY)),
            userId,
            userName
        });
    }, [me]);

    const handleContextMenu = useCallback((event, userId, userName) => {
        event.preventDefault();
        event.stopPropagation();
        openVolumeMenu(event, userId, userName);
    }, [openVolumeMenu]);

    const handleVolumeButtonClick = useCallback((event, userId, userName) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        openVolumeMenu({ clientX: rect.right - CONTEXT_MENU_WIDTH, clientY: rect.bottom }, userId, userName);
    }, [openVolumeMenu]);

    const handleUserClick = useCallback((user) => {
        if (user.funId === me) return;
        if (!user?.funId) return;
        setPrivateChatTarget({ funId: user.funId, name: user.name });
        onNavigateMobile?.('chat');
    }, [me, onNavigateMobile, setPrivateChatTarget]);

    const handleSaveName = useCallback(async () => {
        const trimmed = editNameValue.trim();
        if (trimmed && trimmed !== name) {
            if (user) {
                try {
                    await updateProfile({ displayName: trimmed });
                } catch (error) {
                    await showAlert({
                        title: '昵称更新失败',
                        message: error.message
                    });
                }
            } else {
                const nextName = updateGuestDisplayName(trimmed);
                socket.emit('updateName', { name: nextName });
            }
        }
        setIsEditingName(false);
    }, [editNameValue, name, socket, updateGuestDisplayName, updateProfile, user]);

    const startEditingName = useCallback(() => {
        setEditNameValue(name);
        setIsEditingName(true);
    }, [name]);

    const isVoiceJoined = selectedRoomId === roomId;
    const liveCount = useMemo(
        () => Math.max(users.length, (sfuConnectedPeers?.size || 0) + (selectedRoomId ? 1 : 0)),
        [selectedRoomId, sfuConnectedPeers, users.length]
    );
    const currentConnectionLabel = useMemo(() => (
        connectedPeer
            ? (connectionType === 'relay' ? '文件直连经中继' : '文件直连')
            : isVoiceJoined
                ? 'SFU 已连接'
                : '尚未加入'
    ), [connectedPeer, connectionType, isVoiceJoined]);
    const connectedPeerName = useMemo(
        () => users.find((member) => (member.funId || member) === connectedPeer)?.name || null,
        [connectedPeer, users]
    );
    const activeStageCards = useMemo(() => {
        const cards = [{
            id: 'main-stage',
            title: roomName || '主舞台',
            subtitle: `${Math.max(liveCount, 1)} 人在线`,
            status: micVolume > 5 ? '发言中' : 'SFU 已连接',
            highlighted: true
        }];

        if (connectedPeerName) {
            cards.push({
                id: 'file-link',
                title: connectedPeerName,
                subtitle: connectionType === 'relay' ? '文件连接 · 中继' : '文件连接 · 直连',
                status: '已连接',
                highlighted: false
            });
        }

        return cards;
    }, [connectedPeerName, connectionType, liveCount, micVolume, roomName]);
    const memberCards = useMemo(() => users.map((user) => {
        const userName = user.name || user;
        const userId = user.funId || user;
        const isMe = userId === me;
        const isSFUConnected = sfuConnectedPeers.has(userId);
        const isP2PConnected = connectedPeer === userId;
        const isConnected = isSFUConnected || isP2PConnected;
        const isTarget = isConnecting && connectingPeerId === userId && !isConnected;

        const isPrivateTarget = privateChatTarget?.funId === userId;
        let statusLabel = '可发起私聊';
        if (isMe) statusLabel = isMuted ? '已静音' : micVolume > 5 ? '正在说话' : '麦克风已开启';
        if (isSFUConnected) statusLabel = '已在房间语音中';
        if (isP2PConnected) statusLabel = connectionType === 'relay' ? '文件通道已连接（中继）' : '文件通道已连接';
        if (isTarget) statusLabel = '连接中...';

        return {
            userName,
            userId,
            isMe,
            isP2PConnected,
            isConnected,
            isTarget,
            isPrivateTarget,
            statusLabel,
            showPulse: isConnected || (isMe && micVolume > 5)
        };
    }), [connectedPeer, connectingPeerId, connectionType, isConnecting, isMuted, me, micVolume, privateChatTarget?.funId, sfuConnectedPeers, users]);

    return (
        <aside ref={sidebarRef} className="channel-sidebar">
            {showSettings && (
                <SettingsModal onClose={() => setShowSettings(false)} />
            )}

            <header className="channel-header">
                <div className="mobile-dashboard-header">
                    <div className="mobile-dashboard-header__title">
                        <span className="channel-eyebrow">语音房间面板</span>
                        <h1>{roomName || '语音聊天房间'}</h1>
                    </div>
                    <div className="mobile-dashboard-header__actions">
                        <button
                            type="button"
                            className="mobile-dashboard-header__action"
                            onClick={() => onNavigateMobile?.('servers')}
                            aria-label="打开房间列表"
                        >
                            <FiGrid size={16} />
                        </button>
                        <button
                            type="button"
                            className="mobile-dashboard-header__action"
                            onClick={() => onNavigateMobile?.('chat')}
                            aria-label="打开聊天"
                        >
                            <FiMessageSquare size={16} />
                        </button>
                    </div>
                </div>

                <div className="channel-header__title">
                    <span className="channel-eyebrow">
                        <FiRadio size={14} />
                        房间概览
                    </span>
                    <h2>{roomName || '选择房间'}</h2>
                </div>

                <div className="mobile-room-overview">
                    <div className="mobile-room-overview__header">
                        <h3>房间总览</h3>
                        <span className={`mobile-live-pill ${isVoiceJoined ? 'active' : ''}`}>
                            <span className="mobile-live-pill__dot"></span>
                            {isVoiceJoined ? '直播中' : '待机中'}
                        </span>
                    </div>
                    <p className="mobile-room-overview__id">房间 ID：{roomId?.slice(-6) || '---'}</p>
                    <div className="mobile-room-overview__stats">
                        <div className="mobile-room-overview__metric">
                            <strong>{users.length}</strong>
                            <span>名成员</span>
                        </div>
                        <div className="mobile-room-overview__metric status">
                            <strong>{currentConnectionLabel}</strong>
                            <span>{micVolume > 5 ? '检测到发言' : '语音已就绪'}</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="channel-list">
                <section className="mobile-channel-section">
                    <div className="channel-section-heading mobile-channel-section__heading">
                        <span className="channel-section-title">
                            <FiRadio size={15} />
                            活跃频道
                        </span>
                    </div>

                    <div className="mobile-stage-scroll">
                        {activeStageCards.map((card) => (
                            <article
                                key={card.id}
                                className={`mobile-stage-card ${card.highlighted ? 'highlighted' : ''}`}
                            >
                                <div className="mobile-stage-card__content">
                                    <strong>{card.title}</strong>
                                    <span>{card.subtitle}</span>
                                </div>
                                <div className="mobile-stage-card__footer">
                                    <div className="mobile-stage-card__avatars" aria-hidden="true">
                                        {users.slice(0, 3).map((member) => (
                                            <span key={member.funId || member.name} className="mobile-stage-card__avatar">
                                                {(member.name || member)[0]?.toUpperCase() || '?'}
                                            </span>
                                        ))}
                                    </div>
                                    <span className={`mobile-stage-card__status ${card.highlighted ? 'live' : ''}`}>
                                        {card.status}
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                {connectionError && (
                    <div className="channel-inline-alert">
                        <FiX size={14} />
                        <span>{connectionError}</span>
                    </div>
                )}

                {(audioQuality?.level === 'fair' || audioQuality?.level === 'poor') && (
                    <div className={`channel-inline-alert audio-quality-alert is-${audioQuality.level}`} role="status">
                        <FiActivity size={14} />
                        <span>{audioQuality.level === 'poor' ? '网络不稳，语音可能断续' : '网络有波动，正在保护语音质量'}</span>
                    </div>
                )}

                <section className="channel-users-section">
                    <div className="channel-section-heading">
                        <span className="channel-section-title">
                            <FiUsers size={15} />
                            房间成员
                        </span>
                        <span className="channel-section-count">{users.length}</span>
                    </div>

                    <div className="member-list">
                        {memberCards.map((member) => (
                            <article
                                key={member.userId}
                                className={`member-card ${member.isConnected ? 'connected' : ''} ${member.isPrivateTarget ? 'selected' : ''} ${member.isMe ? 'self' : ''}`}
                                onContextMenu={(event) => handleContextMenu(event, member.userId, member.userName)}
                            >
                                <div className="member-card__avatar">
                                    {member.userName[0]?.toUpperCase() || '?'}
                                    {member.showPulse && <span className="member-card__pulse"></span>}
                                </div>

                                <div className="member-card__meta">
                                    <div className="member-card__name-row">
                                        <strong>{member.userName}</strong>
                                        {member.isMe && <span className="member-chip">我</span>}
                                    </div>
                                    <span className={`member-card__status ${member.isConnected || member.isTarget ? 'live' : ''}`}>
                                        {member.statusLabel}
                                    </span>
                                </div>

                                <div className="member-card__actions">
                                    {!member.isMe && (
                                        <button
                                            type="button"
                                            className="member-inline-action"
                                            onClick={(event) => handleVolumeButtonClick(event, member.userId, member.userName)}
                                            aria-label={`调节 ${member.userName} 的音量，当前 ${userVolumes[member.userId] ?? 100}%`}
                                            aria-haspopup="dialog"
                                            aria-expanded={contextMenu?.userId === member.userId}
                                        >
                                            <FiVolume2 size={13} />
                                            音量
                                        </button>
                                    )}
                                    {!member.isMe && (
                                        <button
                                            type="button"
                                            className={`member-inline-action ${member.isPrivateTarget ? 'selected' : ''}`}
                                            onClick={() => handleUserClick({ funId: member.userId, name: member.userName })}
                                            aria-label={`与 ${member.userName} 私聊`}
                                        >
                                            <FiMessageSquare size={13} />
                                            {member.isPrivateTarget ? '私聊中' : '私聊'}
                                        </button>
                                    )}
                                    {member.isP2PConnected && !member.isMe && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost member-hangup"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                disconnectPeer();
                                            }}
                                        >
                                            <FiSlash size={13} />
                                            断开
                                        </button>
                                    )}
                                    {canManageRoom && !member.isMe && (
                                        <button
                                            type="button"
                                            className="member-inline-action danger"
                                            onClick={() => onRemoveMember?.({ funId: member.userId, name: member.userName })}
                                            aria-label={`将 ${member.userName} 移出房间`}
                                        >
                                            <FiUserMinus size={13} />
                                            移出
                                        </button>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

            </div>

            <footer className="user-panel">
                <div className="user-info">
                    <div className="user-avatar-large">
                        {name ? name[0]?.toUpperCase() : '?'}
                    </div>

                    <div className="user-details">
                        {isEditingName ? (
                            <input
                                className="input user-name-input"
                                value={editNameValue}
                                onChange={(event) => setEditNameValue(event.target.value)}
                                onBlur={handleSaveName}
                                onKeyDown={(event) => event.key === 'Enter' && handleSaveName()}
                                autoFocus
                                disabled={pending}
                            />
                        ) : (
                            <button
                                type="button"
                                className="user-name-button"
                                title="点击修改昵称"
                                onClick={startEditingName}
                            >
                                <span className="user-name-large">{name}</span>
                                <FiEdit3 size={14} />
                            </button>
                        )}
                        <div className="user-id-small">{user?.email || `访客 #${me?.slice(-4) || '----'}`}</div>
                    </div>
                </div>

                <div className="user-controls">
                    <button
                        type="button"
                        className="mobile-control-profile"
                        onClick={startEditingName}
                        title="编辑昵称"
                    >
                        <div className="mobile-control-profile__avatar">
                            {name ? name[0]?.toUpperCase() : '?'}
                        </div>
                    </button>

                    <button
                        className={`control-btn ${isMuted ? 'active danger' : ''}`}
                        onClick={toggleMute}
                        title={isMuted ? '取消静音' : '静音'}
                    >
                        {isMuted ? <FiMicOff size={18} /> : <FiMic size={18} />}
                        <span>{isMuted ? '已静音' : '麦克风'}</span>
                    </button>

                    <button
                        className={`control-btn ${isDeafened ? 'active danger' : ''}`}
                        onClick={toggleDeafen}
                        title={isDeafened ? '开启耳机' : '关闭耳机'}
                    >
                        {isDeafened ? <TbHeadphonesOff size={18} /> : <FiHeadphones size={18} />}
                        <span>{isDeafened ? '已闭麦' : '耳机'}</span>
                    </button>

                    <button
                        className={`control-btn ${showSettings ? 'active' : ''}`}
                        onClick={() => setShowSettings(!showSettings)}
                        title="音频设置"
                    >
                        <FiSettings size={18} />
                        <span>设置</span>
                    </button>

                    <button
                        type="button"
                        className="control-btn leave"
                        onClick={onLeaveRoom}
                        title="离开房间"
                        aria-label="离开当前房间"
                    >
                        <FiLogOut size={18} />
                        <span>离开</span>
                    </button>
                </div>
            </footer>

            {contextMenu && createPortal(
                <div
                    onClick={(event) => event.stopPropagation()}
                    className="channel-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    role="dialog"
                    aria-label={`${contextMenu.userName} 的单独音量`}
                >
                    <div className="channel-context-menu__header">
                        <div className="channel-context-menu__avatar">
                            <FiVolume2 size={16} />
                        </div>
                        <div>
                            <strong>{contextMenu.userName}</strong>
                            <span>单独音量 · {userVolumes[contextMenu.userId] ?? 100}%</span>
                        </div>
                    </div>

                    <input
                        ref={contextMenuRangeRef}
                        type="range"
                        min="0"
                        max="500"
                        value={userVolumes[contextMenu.userId] ?? 100}
                        onChange={(event) => adjustUserVolume(contextMenu.userId, parseInt(event.target.value, 10))}
                        className="channel-context-menu__range"
                        aria-label={`${contextMenu.userName} 的音量`}
                    />

                    <div className="channel-context-menu__scale">
                        <span>0%</span>
                        <span>100%</span>
                        <span>500%</span>
                    </div>
                </div>,
                document.body
            )}
        </aside>
    );
};

export default ChannelSidebar;
