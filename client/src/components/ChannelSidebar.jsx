import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../useAuth';
import { SocketContext } from '../SocketContext';
import useAudioStore from '../stores/useAudioStore';
import SettingsModal from './SettingsModal';
import { showAlert } from '../stores/useDialogStore';
import {
    FiUsers,
    FiMic,
    FiMicOff,
    FiHeadphones,
    FiSettings,
    FiFile,
    FiDownload,
    FiCheck,
    FiX,
    FiRadio,
    FiUploadCloud,
    FiVolume2,
    FiActivity,
    FiEdit3,
    FiLink2,
    FiSlash,
    FiGrid,
    FiMessageSquare
} from 'react-icons/fi';
import { TbHeadphonesOff } from 'react-icons/tb';

const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 160;
const CONTEXT_MENU_GAP = 16;

const ChannelSidebar = ({ roomId, roomName, users = [], onNavigateMobile }) => {
    const {
        socket,
        me,
        name,
        connectPeer,
        connectedPeer,
        connectingPeerId,
        isConnecting,
        sendFile,
        transferProgress,
        downloadLink,
        isMuted,
        isDeafened,
        toggleMute,
        toggleDeafen,
        pendingFileTransfer,
        acceptFileTransfer,
        rejectFileTransfer,
        connectionType,
        connectionError,
        userVolumes,
        adjustUserVolume,
        sfuConnectedPeers,
        selectedRoomId,
        disconnectPeer
    } = useContext(SocketContext);
    const { user, pending, updateProfile, updateGuestDisplayName } = useAuth();
    const micVolume = useAudioStore((state) => state.micVolume);
    const sidebarRef = useRef(null);

    const [contextMenu, setContextMenu] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = useCallback((event, userId, userName) => {
        event.preventDefault();
        if (userId === me) return;

        const sidebarRect = sidebarRef.current?.getBoundingClientRect();
        if (!sidebarRect) return;

        const localX = event.clientX - sidebarRect.left;
        const localY = event.clientY - sidebarRect.top + 10;
        const maxX = sidebarRect.width - CONTEXT_MENU_WIDTH - CONTEXT_MENU_GAP;
        const maxY = sidebarRect.height - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_GAP;

        setContextMenu({
            x: Math.max(CONTEXT_MENU_GAP, Math.min(localX, maxX)),
            y: Math.max(CONTEXT_MENU_GAP, Math.min(localY, maxY)),
            userId,
            userName
        });
    }, [me]);

    const handleUserClick = useCallback((user) => {
        if (user.funId === me || connectedPeer === user.funId) return;
        if (!user?.funId) return;
        connectPeer(user.funId);
    }, [connectPeer, connectedPeer, me]);

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

        let statusLabel = '点击建立文件连接';
        if (isMe) statusLabel = micVolume > 5 ? '正在说话' : '你自己';
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
            statusLabel,
            showPulse: isConnected || (isMe && micVolume > 5)
        };
    }), [connectedPeer, connectingPeerId, connectionType, isConnecting, me, micVolume, sfuConnectedPeers, users]);

    return (
        <aside ref={sidebarRef} className="channel-sidebar">
            {showSettings && (
                <SettingsModal onClose={() => setShowSettings(false)} />
            )}

            {pendingFileTransfer && (
                <div className="floating-event-card">
                    <div className="floating-event-card__icon">
                        <FiFile size={18} />
                    </div>
                    <div className="floating-event-card__content">
                        <span className="floating-event-card__label">收到文件</span>
                        <strong>{pendingFileTransfer.name}</strong>
                        <small>{(pendingFileTransfer.size / 1024 / 1024).toFixed(2)} MB</small>
                    </div>
                    <div className="floating-event-card__actions">
                        <button className="btn btn-primary" onClick={acceptFileTransfer}>
                            <FiCheck size={14} />
                            接收
                        </button>
                        <button className="btn btn-secondary" onClick={rejectFileTransfer}>
                            <FiX size={14} />
                            拒绝
                        </button>
                    </div>
                </div>
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
                            <button
                                key={member.userId}
                                type="button"
                                className={`member-card ${member.isConnected ? 'connected' : ''} ${member.isMe ? 'self' : ''}`}
                                onClick={() => handleUserClick({ funId: member.userId, name: member.userName })}
                                onContextMenu={(event) => handleContextMenu(event, member.userId, member.userName)}
                                disabled={member.isMe}
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
                                    {!member.isP2PConnected && !member.isMe && (
                                        <span className="member-action-tag">
                                            <FiLink2 size={12} />
                                            文件连接
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="file-transfer-section">
                    <div className="channel-section-heading">
                        <span className="channel-section-title">
                            <FiUploadCloud size={15} />
                            文件传输
                        </span>
                        <span className="channel-section-hint">
                            {connectedPeer ? '已就绪' : '需先连接成员'}
                        </span>
                    </div>

                    <label className={`file-send-btn ${connectedPeer ? '' : 'disabled'}`}>
                        <FiFile size={16} />
                        <span>选择并发送文件</span>
                        <input
                            type="file"
                            style={{ display: 'none' }}
                            onChange={(event) => {
                                if (!connectedPeer) {
                                    void showAlert({
                                        title: '需要先连接成员',
                                        message: '请先点击成员建立连接，连接成功后才可传输文件。'
                                    });
                                    event.target.value = '';
                                    return;
                                }
                                const file = event.target.files?.[0];
                                if (!file) return;

                                try {
                                    sendFile(file);
                                } catch (error) {
                                    void showAlert({
                                        title: '无法发送文件',
                                        message: error.message
                                    });
                                }
                            }}
                        />
                    </label>

                    <p className="channel-helper-text">
                        文件传输依赖当前的点对点文件连接，建议先从成员列表中选择目标用户。
                    </p>

                    {transferProgress > 0 && transferProgress < 100 && (
                        <div className="transfer-progress">
                            <div className="progress-info">
                                <span className="progress-text">传输中</span>
                                <span className="progress-percent">{transferProgress}%</span>
                            </div>
                            <div className="progress-bar-container">
                                <div
                                    className="progress-bar-fill"
                                    style={{ width: `${transferProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    {downloadLink && (
                        <a href={downloadLink.url} download={downloadLink.name} className="download-btn">
                            <FiDownload size={16} />
                            <span>{downloadLink.name}</span>
                        </a>
                    )}
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
                </div>
            </footer>

            {contextMenu && (
                <div
                    onClick={(event) => event.stopPropagation()}
                    className="channel-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="channel-context-menu__header">
                        <div className="channel-context-menu__avatar">
                            {contextMenu.userName[0]?.toUpperCase()}
                        </div>
                        <div>
                            <strong>{contextMenu.userName}</strong>
                            <span>{userVolumes[contextMenu.userId] ?? 100}% 音量</span>
                        </div>
                    </div>

                    <input
                        type="range"
                        min="0"
                        max="500"
                        value={userVolumes[contextMenu.userId] ?? 100}
                        onChange={(event) => adjustUserVolume(contextMenu.userId, parseInt(event.target.value, 10))}
                        className="channel-context-menu__range"
                    />

                    <div className="channel-context-menu__scale">
                        <span>0%</span>
                        <span>100%</span>
                        <span>500%</span>
                    </div>
                </div>
            )}
        </aside>
    );
};

export default ChannelSidebar;
