import React, { useState, useContext, useEffect, useMemo } from 'react';
import { FiUsers, FiRadio, FiCompass, FiTrash2, FiEdit3 } from 'react-icons/fi';
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
import useUIStore from './stores/useUIStore';
import { useRoomSession } from './hooks/useRoomSession';
import { apiRequest } from './lib/apiClient';
import { defaultSiteAppearance } from './stores/useUIStore';
import { showAlert, showConfirm, showPrompt } from './stores/useDialogStore';

const App = () => {
  const { socket, me } = useContext(SocketContext);
  const { isAuthenticated, isLoading, user, displayName, openAuthModal, logout, isAdmin } = useAuth();

  const {
    rooms, setRooms,
    selectedRoomId, clearSelectedRoom, clearMessages, clearPrivateMessages, removeRoom, updateRoomName,
    setJoinedRoom, markRoomJoinPending,
    selectedRoomName,
    roomUsers, setRoomUsers, updateRoomUser
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
    updateRoomName: state.updateRoomName
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
    const backgroundImageUrl = String(siteAppearance?.backgroundImageUrl || '').trim();
    const imageValue = backgroundImageUrl
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

    return () => {
      root.style.removeProperty('--site-background-image-url');
      root.style.removeProperty('--site-background-blur');
      root.style.removeProperty('--site-background-opacity');
      root.style.removeProperty('--site-panel-surface-opacity');
      root.style.removeProperty('--site-panel-soft-opacity');
      root.style.removeProperty('--site-panel-border-opacity');
      root.style.removeProperty('--site-panel-blur');
      root.style.removeProperty('--site-panel-glow-opacity');
    };
  }, [siteAppearance]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mobileTab, setMobileTab] = useState('servers');

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
      setMobileTab('channels');
    },
    onRoomDeleted: () => {
      setMobileTab('servers');
    }
  });

  const activeRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId),
    [rooms, selectedRoomId]
  );
  const handleCreateRoom = () => {
    setShowCreateModal(true);
  };

  const handleDeleteRoom = async (room) => {
    if (!room?.roomId) return;

    const canDeleteRoom = isAdmin || (room.ownerId
      ? room.ownerId === user?.id
      : !room.ownerFunId || room.ownerFunId === me);

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

    const canRenameRoom = isAdmin || (room.ownerId
      ? room.ownerId === user?.id
      : !room.ownerFunId || room.ownerFunId === me);

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

  const guardedJoinRoom = (roomId, options) => {
    joinRoom(roomId, options);
  };

  const handleCreateRoomSubmit = async (data) => {
    try {
      await createRoom(data);
      setShowCreateModal(false);
      setMobileTab('channels');
    } catch (error) {
      await showAlert({
        title: '创建房间失败',
        message: error.message || '创建房间时出现问题，请稍后重试。'
      });
    }
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
      <div className="app-background-media" aria-hidden="true"></div>
      <div className={`app-kook-layout mobile-view-${mobileTab}`}>
        <ServerSidebar
        rooms={rooms}
        selectedRoom={selectedRoomId}
        activeRoomName={selectedRoomName}
        currentUserName={displayName || '访客'}
        onSelectRoom={(id) => {
          if (id) {
            guardedJoinRoom(id);
            setMobileTab('channels');
          } else {
            leaveRoom();
            setMobileTab('servers');
          }
        }}
        onCreateRoom={handleCreateRoom}
      />

      {selectedRoomId && (
        <>
          <ChannelSidebar
            roomId={selectedRoomId}
            roomName={selectedRoomName}
            users={roomUsers}
            onNavigateMobile={setMobileTab}
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
                    <strong>{selectedRoomId ? '在线中' : '空闲中'}</strong>
                    <span>房间状态</span>
                  </div>
                </div>
                {(isAdmin || (activeRoom?.ownerId && activeRoom.ownerId === user?.id) ||
                  (!activeRoom?.ownerId && (!activeRoom?.ownerFunId || activeRoom.ownerFunId === me))) && (
                  <>
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
              </div>
            </section>

            <Chat />
          </main>
        </>
      )}

      {(!selectedRoomId || mobileTab === 'servers') && (
        <div className="main-full-width">
          <RoomManager
            currentUserId={user?.id || me || ''}
            currentUserSocketId={me || ''}
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
      </div>
    </>
  );
};

export default App;
