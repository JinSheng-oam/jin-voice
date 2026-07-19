import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { FiUsers, FiRadio, FiCompass, FiTrash2, FiEdit3, FiLogOut, FiShare2, FiLock, FiUnlock, FiVolumeX, FiWifi, FiWifiOff, FiCheckCircle, FiX } from 'react-icons/fi';
import { SocketContext } from './SocketContext';
import { useAuth } from './useAuth';
import useRoomStore from './stores/useRoomStore';
import { useShallow } from 'zustand/react/shallow';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import Chat from './components/Chat';
import CreateRoomModal from './components/CreateRoomModal';
import MobileNavBar from './components/MobileNavBar';
import RoomManager from './components/RoomManager';
import SfuDiagnosticsPanel from './components/SfuDiagnosticsPanel';
import PreJoinModal from './components/PreJoinModal';
import SettingsModal from './components/SettingsModal';
import useUIStore from './stores/useUIStore';
import useAudioStore from './stores/useAudioStore';
import { useRoomSession } from './hooks/useRoomSession';
import { apiRequest } from './lib/apiClient';
import { defaultSiteAppearance } from './stores/useUIStore';
import { showAlert, showConfirm, showPrompt } from './stores/useDialogStore';
import { copyRoomInviteLink } from './lib/roomInvite';
import { resolveApiAssetUrl } from './lib/connectionConfig';

const AppBackgroundMedia = ({ appearance }) => {
  const videoRef = useRef(null);
  const isVideo = appearance?.backgroundMode === 'media' && appearance?.backgroundMediaType === 'video';
  const mediaUrl = resolveApiAssetUrl(appearance?.backgroundImageUrl || '');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return undefined;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlayback = () => {
      if (motionQuery.matches) video.pause();
      else void video.play().catch(() => undefined);
    };
    syncPlayback();
    motionQuery.addEventListener('change', syncPlayback);
    return () => motionQuery.removeEventListener('change', syncPlayback);
  }, [isVideo, mediaUrl]);

  return (
    <div className="app-background-media" aria-hidden="true">
      {isVideo && mediaUrl ? (
        <video ref={videoRef} key={mediaUrl} src={mediaUrl} autoPlay loop muted playsInline preload="auto" />
      ) : null}
    </div>
  );
};

const App = () => {
  const { socket, socketConnectionStatus, roomNotice, clearRoomNotice, voiceTransmissionState } = useContext(SocketContext);
  const { isAuthenticated, isLoading, user, displayName, openAuthModal, logout, isAdmin } = useAuth();

  const {
    rooms, setRooms,
    selectedRoomId, clearSelectedRoom, clearMessages, clearPrivateMessages, removeRoom, updateRoomName,
    setJoinedRoom, markRoomJoinPending,
    selectedRoomName,
    roomUsers, setRoomUsers, updateRoomUser, updateRoomLock, recentRooms, removeRecentRoom
  } = useRoomStore(useShallow(state => ({
    rooms: state.rooms,
    setRooms: state.setRooms,
    selectedRoomId: state.selectedRoomId,
    clearSelectedRoom: state.clearSelectedRoom,
    clearMessages: state.clearMessages,
    clearPrivateMessages: state.clearPrivateMessages,
    removeRoom: state.removeRoom,
    setJoinedRoom: state.setJoinedRoom,
    markRoomJoinPending: state.markRoomJoinPending,
    selectedRoomName: state.selectedRoomName,
    roomUsers: state.roomUsers,
    setRoomUsers: state.setRoomUsers,
    updateRoomUser: state.updateRoomUser,
    updateRoomName: state.updateRoomName,
    updateRoomLock: state.updateRoomLock,
    recentRooms: state.recentRooms,
    removeRecentRoom: state.removeRecentRoom
  })));

  const { theme, siteAppearance, setSiteAppearance } = useUIStore(useShallow((state) => ({
    theme: state.theme,
    siteAppearance: state.siteAppearance,
    setSiteAppearance: state.setSiteAppearance
  })));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolvedTheme = theme === 'system'
        ? (mediaQuery.matches ? 'dark' : 'light')
        : theme;

      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.body.setAttribute('data-theme', resolvedTheme);
      document.documentElement.style.colorScheme = resolvedTheme;
      document.body.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (theme !== 'system') {
      return undefined;
    }

    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    const loadSiteAppearance = async () => {
      try {
        const data = await apiRequest('/api/site-appearance');
        if (!cancelled && data.appearance) {
          setSiteAppearance(data.appearance);
        }
      } catch {
        if (!cancelled) {
          setSiteAppearance(defaultSiteAppearance);
        }
      }
    };

    void loadSiteAppearance();

    return () => {
      cancelled = true;
    };
  }, [setSiteAppearance]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleSiteAppearanceUpdated = (nextAppearance) => {
      setSiteAppearance(nextAppearance || defaultSiteAppearance);
    };

    socket.on('siteAppearanceUpdated', handleSiteAppearanceUpdated);

    return () => {
      socket.off('siteAppearanceUpdated', handleSiteAppearanceUpdated);
    };
  }, [setSiteAppearance, socket]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const backgroundMode = siteAppearance?.backgroundMode || 'preset';
    const backgroundPreset = siteAppearance?.backgroundPreset || 'aurora';
    const backgroundImageUrl = resolveApiAssetUrl(siteAppearance?.backgroundImageUrl || '').trim();
    const imageValue = backgroundImageUrl && siteAppearance?.backgroundMediaType !== 'video'
      ? `url("${backgroundImageUrl.replace(/"/g, '\\"')}")`
      : 'none';
    const panelTransparency = Math.max(0, Math.min(100, siteAppearance?.panelOpacity ?? 8)) / 100;
    const panelSurfaceOpacity = Math.max(0, (1 - panelTransparency) * 0.1);
    const panelSoftOpacity = Math.min(panelSurfaceOpacity + 0.028, 0.12);
    const panelBorderOpacity = Math.max(0.04, Math.min(panelSurfaceOpacity + 0.038, 0.16));
    const panelGlowOpacity = Math.min((siteAppearance?.panelGlow ?? 12) / 100, 0.36);

    root.setAttribute('data-background-mode', backgroundMode);
    body.setAttribute('data-background-mode', backgroundMode);
    root.setAttribute('data-background', backgroundPreset);
    body.setAttribute('data-background', backgroundPreset);
    root.style.setProperty('--site-background-image-url', imageValue);
    root.style.setProperty('--site-background-blur', `${siteAppearance?.backgroundBlur ?? 16}px`);
    root.style.setProperty('--site-background-opacity', `${(siteAppearance?.backgroundOpacity ?? 68) / 100}`);
    root.style.setProperty('--site-panel-surface-opacity', `${panelSurfaceOpacity}`);
    root.style.setProperty('--site-panel-soft-opacity', `${panelSoftOpacity}`);
    root.style.setProperty('--site-panel-border-opacity', `${panelBorderOpacity}`);
    root.style.setProperty('--site-panel-blur', `${siteAppearance?.panelBlur ?? 22}px`);
    root.style.setProperty('--site-panel-glow-opacity', `${panelGlowOpacity}`);

    root.style.setProperty('--lg-opacity', `${(siteAppearance?.lgOpacity ?? 12) / 100}`);
    root.style.setProperty('--lg-blur', `${siteAppearance?.lgBlur ?? 24}px`);
    root.style.setProperty('--lg-saturation', `${(siteAppearance?.lgSaturation ?? 120) / 100}`);
    root.style.setProperty('--lg-brightness', `${(siteAppearance?.lgBrightness ?? 110) / 100}`);
    root.style.setProperty('--lg-edge-highlight', `rgba(255, 255, 255, ${(siteAppearance?.lgEdgeHighlight ?? 25) / 100})`);
    root.style.setProperty('--lg-edge-highlight-bottom', `rgba(255, 255, 255, ${(siteAppearance?.lgEdgeHighlightBottom ?? 5) / 100})`);
    root.style.setProperty('--lg-inner-glow', `rgba(255, 255, 255, ${(siteAppearance?.lgInnerGlow ?? 15) / 100})`);
    root.style.setProperty('--lg-inset-shadow', `rgba(0, 0, 0, ${(siteAppearance?.lgInsetShadow ?? 20) / 100})`);
    root.style.setProperty('--lg-outer-shadow', `rgba(0, 0, 0, ${(siteAppearance?.lgOuterShadow ?? 30) / 100})`);

    return () => {
      root.style.removeProperty('--site-background-image-url');
      root.style.removeProperty('--site-background-blur');
      root.style.removeProperty('--site-background-opacity');
      root.style.removeProperty('--site-panel-surface-opacity');
      root.style.removeProperty('--site-panel-soft-opacity');
      root.style.removeProperty('--site-panel-border-opacity');
      root.style.removeProperty('--site-panel-blur');
      root.style.removeProperty('--site-panel-glow-opacity');

      root.style.removeProperty('--lg-opacity');
      root.style.removeProperty('--lg-blur');
      root.style.removeProperty('--lg-saturation');
      root.style.removeProperty('--lg-brightness');
      root.style.removeProperty('--lg-edge-highlight');
      root.style.removeProperty('--lg-edge-highlight-bottom');
      root.style.removeProperty('--lg-inner-glow');
      root.style.removeProperty('--lg-inset-shadow');
      root.style.removeProperty('--lg-outer-shadow');
    };
  }, [siteAppearance]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileTab, setMobileTab] = useState('servers');
  const [pendingEntry, setPendingEntry] = useState(null);
  const [isEnteringRoom, setIsEnteringRoom] = useState(false);
  const setIsMuted = useAudioStore((state) => state.setIsMuted);

  const { createRoom, joinRoom, leaveRoom, refreshRooms } = useRoomSession({
    socket,
    selectedRoomId,
    setRooms,
    setJoinedRoom,
    markRoomJoinPending,
    clearSelectedRoom,
    clearMessages,
    clearPrivateMessages,
    removeRoom,
    updateRoomName,
    setRoomUsers,
    updateRoomUser,
    onRoomJoined: () => {
      setPendingEntry(null);
      setIsEnteringRoom(false);
      setMobileTab('channels');
    },
    onRoomDeleted: () => {
      setMobileTab('servers');
    },
    onInviteRoom: (roomId) => {
      const room = useRoomStore.getState().rooms.find((candidate) => candidate.roomId === roomId);
      setPendingEntry({ kind: 'join', roomId, roomName: room?.name || '邀请房间', options: {} });
    }
  });

  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId),
    [rooms, selectedRoomId]
  );

  useEffect(() => {
    if (!socket) return undefined;
    const handleEntryError = () => setIsEnteringRoom(false);
    socket.on('roomError', handleEntryError);
    return () => socket.off('roomError', handleEntryError);
  }, [socket]);

  useEffect(() => {
    if (!socket) return undefined;
    const onRoomLockChanged = ({ roomId, isLocked } = {}) => updateRoomLock(roomId, isLocked);
    const onRemovedFromRoom = ({ roomId } = {}) => {
      if (roomId !== selectedRoomId) return;
      clearSelectedRoom();
      clearMessages();
      clearPrivateMessages();
      setMobileTab('servers');
    };
    socket.on('roomLockChanged', onRoomLockChanged);
    socket.on('removedFromRoom', onRemovedFromRoom);
    return () => {
      socket.off('roomLockChanged', onRoomLockChanged);
      socket.off('removedFromRoom', onRemovedFromRoom);
    };
  }, [clearMessages, clearPrivateMessages, clearSelectedRoom, selectedRoomId, socket, updateRoomLock]);

  const handleCreateRoom = () => {
    setShowCreateModal(true);
  };

  const handleDeleteRoom = async (room) => {
    if (!room?.roomId) return;

    const canDeleteRoom = Boolean(isAdmin || room.canManage);

    if (!canDeleteRoom) {
      await showAlert({
        title: '无法删除房间',
        message: '只有房主或管理员可以删除这个房间。'
      });
      return;
    }

    const confirmed = await showConfirm({
      title: '删除房间',
      message: `确定要删除房间「${room.name}」吗？此操作会让所有成员退出该房间。`,
      confirmText: '删除',
      danger: true
    });
    if (!confirmed) return;

    socket.emit('deleteRoom', { roomId: room.roomId });
  };

  const handleRenameRoom = async (room) => {
    if (!room?.roomId) return;

    const canRenameRoom = Boolean(isAdmin || room.canManage);

    if (!canRenameRoom) {
      await showAlert({
        title: '无法重命名',
        message: '只有房主或管理员可以修改这个房间名称。'
      });
      return;
    }

    const nextName = await showPrompt({
      title: '重命名房间',
      message: '输入新的房间名称。',
      defaultValue: room.name || '',
      placeholder: '房间名称',
      confirmText: '保存'
    });
    const trimmedName = nextName?.trim();
    if (!trimmedName || trimmedName === room.name) return;

    socket.emit('renameRoom', {
      roomId: room.roomId,
      roomName: trimmedName
    }, (response = {}) => {
      if (response.error) {
        void showAlert({
          title: '重命名失败',
          message: response.error
        });
      }
    });
  };

  const guardedJoinRoom = (roomId, options = {}) => {
    if (!roomId) return;
    if (roomId === selectedRoomId) {
      setMobileTab('channels');
      return;
    }

    const room = rooms.find((candidate) => candidate.roomId === roomId);
    setPendingEntry({
      kind: 'join',
      roomId,
      roomName: room?.name || '语音房间',
      options
    });
  };

  const handleCopyInvite = async () => {
    try {
      await copyRoomInviteLink(selectedRoomId);
      await showAlert({ title: '邀请链接已复制', message: '把链接发给队友，对方打开后会直接进入入房检查。' });
    } catch (error) {
      await showAlert({ title: '复制失败', message: error.message });
    }
  };

  const handleToggleRoomLock = () => {
    if (!activeRoom?.roomId) return;
    socket.emit('setRoomLocked', {
      roomId: activeRoom.roomId,
      locked: !activeRoom.isLocked
    }, (response = {}) => {
      if (response.error) void showAlert({ title: '更新房间锁失败', message: response.error });
    });
  };

  const handleRequestMuteAll = async () => {
    const confirmed = await showConfirm({
      title: '请求全员静音',
      message: '所有其他成员会立即关闭麦克风，并看到房主提示。',
      confirmText: '请求静音'
    });
    if (!confirmed) return;
    socket.emit('requestRoomMute', { roomId: selectedRoomId }, (response = {}) => {
      if (response.error) void showAlert({ title: '静音请求失败', message: response.error });
    });
  };

  const handleRemoveMember = async (member) => {
    const confirmed = await showConfirm({
      title: '移出成员',
      message: `将「${member.name || '该成员'}」移出当前房间？`,
      confirmText: '移出',
      danger: true
    });
    if (!confirmed) return;
    socket.emit('removeRoomMember', { roomId: selectedRoomId, targetFunId: member.funId }, (response = {}) => {
      if (response.error) void showAlert({ title: '移出失败', message: response.error });
    });
  };

  const handleCreateRoomSubmit = (data) => {
    setShowCreateModal(false);
    setPendingEntry({
      kind: 'create',
      roomName: data?.roomName || '新语音房间',
      payload: data
    });
  };

  const handleConfirmEntry = async ({ joinMuted }) => {
    if (!pendingEntry || isEnteringRoom) return;
    setIsMuted(Boolean(joinMuted));
    setIsEnteringRoom(true);

    try {
      if (pendingEntry.kind === 'create') {
        await createRoom(pendingEntry.payload);
      } else {
        const didStart = joinRoom(pendingEntry.roomId, pendingEntry.options);
        if (!didStart) throw new Error('当前连接不可用，请稍后重试。');
      }
    } catch (error) {
      setIsEnteringRoom(false);
      await showAlert({
        title: pendingEntry.kind === 'create' ? '创建房间失败' : '加入房间失败',
        message: error.message || '进入房间时出现问题，请稍后重试。'
      });
    }
  };

  const handleCancelEntry = () => {
    if (isEnteringRoom) return;
    setPendingEntry(null);
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setPendingEntry(null);
    setMobileTab('servers');
  };

  const handleLogout = async () => {
    await logout();
    setMobileTab('servers');
  };

  if (isLoading) {
    return (
      <div className="main-full-width">
        <div className="room-manager-shell glass-panel loading-workspace">
          <div className="loading-workspace__hero">
            <div className="loading-workspace__badge">
              <span className="loading-workspace__pulse-dot"></span>
              正在恢复工作台
            </div>
            <h2>连接你的语音空间与账号状态</h2>
            <p>稍等片刻，我们正在同步房间列表、设备设置和当前会话。</p>
          </div>

          <div className="loading-workspace__grid" aria-hidden="true">
            <div className="loading-card">
              <div className="loading-skeleton loading-skeleton--eyebrow"></div>
              <div className="loading-skeleton loading-skeleton--title"></div>
              <div className="loading-skeleton loading-skeleton--line"></div>
              <div className="loading-skeleton loading-skeleton--line short"></div>
            </div>
            <div className="loading-card">
              <div className="loading-skeleton loading-skeleton--eyebrow"></div>
              <div className="loading-skeleton loading-skeleton--title"></div>
              <div className="loading-skeleton loading-skeleton--line"></div>
              <div className="loading-skeleton loading-skeleton--line short"></div>
            </div>
            <div className="loading-card">
              <div className="loading-skeleton loading-skeleton--eyebrow"></div>
              <div className="loading-skeleton loading-skeleton--title"></div>
              <div className="loading-skeleton loading-skeleton--line"></div>
              <div className="loading-skeleton loading-skeleton--line short"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppBackgroundMedia appearance={siteAppearance} />
      <div className={`app-kook-layout mobile-view-${mobileTab}`}>
      {socketConnectionStatus !== 'connected' && (
        <div className={`connection-status-banner is-${socketConnectionStatus}`} role="status">
          {socketConnectionStatus === 'restored' ? <FiCheckCircle size={16} /> : socketConnectionStatus === 'offline' ? <FiWifiOff size={16} /> : <FiWifi size={16} />}
          <span>{socketConnectionStatus === 'restored' ? '连接已恢复，语音房间正在同步。' : socketConnectionStatus === 'offline' ? '连接已断开，请检查网络后重试。' : '正在重新连接，期间不会发送声音。'}</span>
        </div>
      )}
      {roomNotice && (
        <div className={`room-notice-banner is-${roomNotice.type || 'info'}`} role="status">
          <span>{roomNotice.message}</span>
          <button type="button" onClick={clearRoomNotice} aria-label="关闭房间提示"><FiX size={15} /></button>
        </div>
      )}
        <ServerSidebar
        rooms={rooms}
        selectedRoom={selectedRoomId}
        currentUserName={displayName || '访客'}
          onSelectRoom={(id) => {
          if (id) {
            guardedJoinRoom(id);
          } else {
            handleLeaveRoom();
          }
        }}
        onCreateRoom={handleCreateRoom}
        onOpenSettings={() => setShowSettings(true)}
      />

      {selectedRoomId && (
        <>
          <ChannelSidebar
            roomId={selectedRoomId}
            roomName={selectedRoomName}
            users={roomUsers}
            onNavigateMobile={setMobileTab}
            onLeaveRoom={handleLeaveRoom}
            canManageRoom={Boolean(isAdmin || activeRoom?.canManage)}
            onRemoveMember={handleRemoveMember}
          />

          <main className="main-chat-area">
            <section className="workspace-summary">
              <div className="workspace-summary__heading">
                <span className="workspace-summary__eyebrow">
                  <FiCompass size={14} />
                  当前空间
                </span>
                <h1>{selectedRoomName || activeRoom?.name || '语音空间'}</h1>
                <p>
                  {activeRoom?.isPrivate ? '私密房间' : '开放房间'}，适合即时语音和文字协作。
                </p>
              </div>
                <div className="workspace-summary__metrics">
                <div className="summary-metric">
                  <FiUsers size={16} />
                  <div>
                    <strong>{roomUsers.length}</strong>
                    <span>在线成员</span>
                  </div>
                </div>
                <div className="summary-metric">
                  <FiRadio size={16} />
                  <div>
                    <strong>{voiceTransmissionState === 'live' ? '正在发送' : voiceTransmissionState === 'manual-muted' ? '已静音' : voiceTransmissionState === 'push-to-talk-muted' ? '等待按键' : '语音感应闭麦'}</strong>
                    <span>真实发送状态</span>
                  </div>
                </div>
                {(isAdmin || activeRoom?.canManage) && (
                  <>
                    <button className="btn btn-secondary" onClick={handleToggleRoomLock}>
                      {activeRoom?.isLocked ? <FiUnlock size={16} /> : <FiLock size={16} />}
                      {activeRoom?.isLocked ? '解锁房间' : '锁定房间'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => void handleRequestMuteAll()}>
                      <FiVolumeX size={16} /> 请求静音
                    </button>
                    <button
                      className="btn btn-secondary workspace-summary__danger"
                      onClick={() => handleRenameRoom(activeRoom)}
                    >
                      <FiEdit3 size={16} />
                      重命名
                    </button>
                    <button
                      className="btn btn-danger workspace-summary__danger"
                      onClick={() => handleDeleteRoom(activeRoom)}
                    >
                      <FiTrash2 size={16} />
                      删除房间
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => void handleCopyInvite()}>
                  <FiShare2 size={16} /> 复制邀请
                </button>
                <button
                  type="button"
                  className="btn btn-danger workspace-summary__leave"
                  onClick={handleLeaveRoom}
                >
                  <FiLogOut size={16} />
                  离开房间
                </button>
              </div>
            </section>

            <Chat />
          </main>
        </>
      )}

      {(!selectedRoomId || mobileTab === 'servers') && (
        <div className="main-full-width">
          <RoomManager
            currentUserName={displayName || '访客'}
            currentUserEmail={user?.email || ''}
            isAdmin={isAdmin}
            isAuthenticated={isAuthenticated}
            onOpenAuthModal={openAuthModal}
            onLogout={handleLogout}
            onCreateRoom={handleCreateRoom}
            onDeleteRoom={handleDeleteRoom}
            onRenameRoom={handleRenameRoom}
            onJoinRoom={guardedJoinRoom}
            onRefreshRooms={refreshRooms}
            recentRooms={recentRooms}
            onRemoveRecentRoom={removeRecentRoom}
          />
        </div>
      )}

      <MobileNavBar
        activeTab={mobileTab}
        onTabChange={setMobileTab}
        isRoomSelected={!!selectedRoomId}
      />

      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateRoomSubmit}
        />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {pendingEntry && (
        <PreJoinModal
          roomName={pendingEntry.roomName}
          actionLabel={pendingEntry.kind === 'create' ? '创建并加入' : '加入房间'}
          isSubmitting={isEnteringRoom}
          onCancel={handleCancelEntry}
          onConfirm={handleConfirmEntry}
        />
      )}
      <SfuDiagnosticsPanel />
      </div>
    </>
  );

};

export default App;
