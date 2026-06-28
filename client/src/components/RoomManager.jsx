import React, { memo, useMemo, useState } from 'react';
import useRoomStore from '../stores/useRoomStore';
import {
    FiUsers,
    FiPlus,
    FiLogIn,
    FiLogOut,
    FiRefreshCw,
    FiLock,
    FiGlobe,
    FiRadio,
    FiTrash2,
    FiEdit3,
    FiUserPlus,
    FiX
} from 'react-icons/fi';

const RoomManager = ({
    currentUserId,
    currentUserSocketId,
    currentUserName,
    currentUserEmail,
    isAdmin,
    isAuthenticated,
    onOpenAuthModal,
    onLogout,
    onCreateRoom,
    onDeleteRoom,
    onRenameRoom,
    onJoinRoom,
    onRefreshRooms
}) => {
    const rooms = useRoomStore((state) => state.rooms);
    const [privateRoomTarget, setPrivateRoomTarget] = useState(null);
    const [password, setPassword] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pendingJoinRoomId, setPendingJoinRoomId] = useState(null);
    const [isSubmittingPrivateRoom, setIsSubmittingPrivateRoom] = useState(false);

    const busiestRoom = useMemo(() => rooms.reduce((top, room) => {
        if (!top || (room.userCount || 0) > (top.userCount || 0)) return room;
        return top;
    }, null), [rooms]);

    const handleJoinRoom = async (room) => {
        if (room.isPrivate) {
            setPrivateRoomTarget(room);
            setPassword('');
            return;
        }

        setPendingJoinRoomId(room.roomId);
        try {
            await Promise.resolve(onJoinRoom?.(room.roomId));
        } finally {
            setPendingJoinRoomId(null);
        }
    };

    const submitPrivateRoom = async () => {
        if (!privateRoomTarget) return;

        setIsSubmittingPrivateRoom(true);
        setPendingJoinRoomId(privateRoomTarget.roomId);
        try {
            await Promise.resolve(onJoinRoom?.(privateRoomTarget.roomId, { password }));
            setPrivateRoomTarget(null);
            setPassword('');
        } finally {
            setIsSubmittingPrivateRoom(false);
            setPendingJoinRoomId(null);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.resolve(onRefreshRooms?.());
        } finally {
            window.setTimeout(() => setIsRefreshing(false), 220);
        }
    };

    return (
        <div className="room-manager-shell glass-panel">
            <section className="room-hero">
                <div className="room-hero__copy">
                    <span className="room-eyebrow">
                        <FiRadio size={14} />
                        JinVoice 房间面板
                    </span>
                    <h1>浏览当前在线的语音空间</h1>
                    <p>
                        不登录也能先直接加入语音、聊天、创建房间和发起文件传输；
                        登录后则可以绑定固定账号和邮箱资料。
                    </p>
                </div>

                <div className="room-hero__actions">
                    <button
                        onClick={handleRefresh}
                        className={`btn btn-secondary ${isRefreshing ? 'is-busy' : ''}`}
                        title="刷新房间列表"
                        disabled={isRefreshing}
                        aria-busy={isRefreshing}
                    >
                        <FiRefreshCw size={16} className={isRefreshing ? 'spin-icon' : ''} />
                        {isRefreshing ? '刷新中...' : '刷新'}
                    </button>

                    {isAuthenticated ? (
                        <>
                            <button onClick={onLogout} className="btn btn-secondary">
                                <FiLogOut size={16} />
                                退出登录
                            </button>
                            <button onClick={onCreateRoom} className="btn btn-primary">
                                <FiPlus size={16} />
                                创建房间
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={onCreateRoom} className="btn btn-primary">
                                <FiPlus size={16} />
                                创建房间
                            </button>
                            <button
                                onClick={() => onOpenAuthModal?.('login', '登录后可以把当前使用习惯绑定到账号，并在多设备间恢复资料。')}
                                className="btn btn-secondary"
                            >
                                <FiLogIn size={16} />
                                登录
                            </button>
                            <button
                                onClick={() => onOpenAuthModal?.('register', '注册账号后可以保存邮箱和固定昵称；不注册也能继续直接使用。')}
                                className="btn btn-secondary"
                            >
                                <FiUserPlus size={16} />
                                注册
                            </button>
                        </>
                    )}
                </div>
            </section>

            <section className="room-list-header">
                <div className="room-list-header__copy">
                    <h3>房间列表</h3>
                    <p>
                        {isAuthenticated
                            ? `${currentUserName}${currentUserEmail ? ` (${currentUserEmail})` : ''} 已登录，可以创建或加入房间。`
                            : `${currentUserName} 当前以访客身份在线，也可以直接加入房间和使用语音。`}
                    </p>
                </div>
            </section>

            <div className="room-list-content">
                {rooms.length === 0 ? (
                    <div className="room-empty-state">
                        <div className="room-empty-state__icon">
                            <FiUsers size={42} />
                        </div>
                        <h3>还没有活跃房间</h3>
                        <p>从创建一个新空间开始，邀请大家加入语音协作。</p>
                        <button onClick={onCreateRoom} className="btn btn-primary">
                            <FiPlus size={16} />
                            创建第一个房间
                        </button>
                    </div>
                ) : (
                    <div className="room-grid">
                        {rooms.map((room, index) => (
                            <article
                                key={room.roomId}
                                className={`room-card ${pendingJoinRoomId === room.roomId ? 'pending' : ''} ${busiestRoom?.roomId === room.roomId ? 'featured' : ''}`}
                                style={{ animationDelay: `${Math.min(index * 45, 240)}ms` }}
                            >
                                <div className="room-card__top">
                                    <span className={`room-badge ${room.isPrivate ? 'private' : 'public'}`}>
                                        {room.isPrivate ? <FiLock size={14} /> : <FiGlobe size={14} />}
                                        {room.isPrivate ? '私密' : '公开'}
                                    </span>
                                    <span className="room-card__id">#{room.roomId.slice(-5)}</span>
                                </div>

                                <div className="room-card__body">
                                    <h3>{room.name}</h3>
                                    <p>
                                        {room.isPrivate
                                            ? '需要密码才能加入，适合小范围私密沟通。'
                                            : '可随时加入，适合快速交流与共享语音。'}
                                    </p>
                                    {(room.ownerId === currentUserId || room.ownerFunId === currentUserSocketId || isAdmin) && (
                                        <span className="room-owner-chip">{isAdmin ? '管理员可管理' : '你是房主'}</span>
                                    )}
                                </div>

                                <div className="room-card__footer">
                                    <div className="room-card__people">
                                        <FiUsers size={15} />
                                        <span>{room.userCount || 0} 人在线</span>
                                    </div>

                                    <div className="room-card__actions">
                                        {(isAdmin || (room.ownerId && room.ownerId === currentUserId) ||
                                            (!room.ownerId && (!room.ownerFunId || room.ownerFunId === currentUserSocketId))) && (
                                            <>
                                                <button onClick={() => onRenameRoom?.(room)} className="btn btn-secondary">
                                                    <FiEdit3 size={16} />
                                                    重命名
                                                </button>
                                                <button onClick={() => onDeleteRoom?.(room)} className="btn btn-danger">
                                                    <FiTrash2 size={16} />
                                                    删除
                                                </button>
                                            </>
                                        )}

                                        <button
                                            onClick={() => handleJoinRoom(room)}
                                            className={`btn btn-secondary ${pendingJoinRoomId === room.roomId ? 'is-busy' : ''}`}
                                            disabled={pendingJoinRoomId === room.roomId}
                                            aria-busy={pendingJoinRoomId === room.roomId}
                                        >
                                            <FiLogIn size={16} />
                                            {pendingJoinRoomId === room.roomId
                                                ? '进入中...'
                                                : room.isPrivate ? '输入密码' : '加入房间'}
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>

            {privateRoomTarget && (
                <div className="room-overlay" onClick={() => setPrivateRoomTarget(null)}>
                    <div className="room-overlay__card" onClick={(event) => event.stopPropagation()}>
                        <div className="room-overlay__header">
                            <div>
                                <span className="room-overlay__eyebrow">私密访问</span>
                                <h3>{privateRoomTarget.name}</h3>
                                <p>输入房间密码后即可加入当前私密空间。</p>
                            </div>
                            <button
                                className="btn btn-ghost btn-icon"
                                onClick={() => setPrivateRoomTarget(null)}
                                title="关闭"
                            >
                                <FiX size={18} />
                            </button>
                        </div>

                        <label className="modal-field">
                            <span>房间密码</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && submitPrivateRoom()}
                                placeholder="输入加入密码"
                                className="input"
                                autoFocus
                            />
                        </label>

                        <div className="room-overlay__actions">
                            <button className="btn btn-secondary" onClick={() => setPrivateRoomTarget(null)}>
                                取消
                            </button>
                            <button
                                className={`btn btn-primary ${isSubmittingPrivateRoom ? 'is-busy' : ''}`}
                                onClick={submitPrivateRoom}
                                disabled={!password.trim() || isSubmittingPrivateRoom}
                                aria-busy={isSubmittingPrivateRoom}
                            >
                                <FiLogIn size={16} />
                                {isSubmittingPrivateRoom ? '验证中...' : '加入房间'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default memo(RoomManager);
