import React, { memo } from 'react';
import { FiPlus, FiHome, FiRadio } from 'react-icons/fi';

const getRoomInitial = (roomName) => {
    if (!roomName) return '?';
    return roomName.trim()[0]?.toUpperCase() || '?';
};

const brandIconUrl = `${import.meta.env.BASE_URL}jinvoice-icon.png`;

const ServerSidebar = ({
    rooms = [],
    selectedRoom,
    activeRoomName,
    currentUserName,
    onSelectRoom,
    onCreateRoom
}) => {
    return (
        <aside className="server-sidebar">
            <div className="server-brand">
                <div className="server-brand__mark">
                    <img src={brandIconUrl} alt="JinVoice" />
                </div>
                <div className="server-brand__copy">
                    <strong>JinVoice</strong>
                    <span>{currentUserName || '访客'}</span>
                </div>
            </div>

            <div className="server-divider"></div>

            <div className="server-stack-shell">
                <div className="server-stack">
                    <button
                        type="button"
                        className={`server-icon ${!selectedRoom ? 'active' : ''}`}
                        onClick={() => onSelectRoom(null)}
                        title="首页"
                        aria-label="首页"
                        aria-current={!selectedRoom ? 'page' : undefined}
                    >
                        <FiHome size={20} />
                        <span className="server-icon__label">首页</span>
                    </button>

                    {rooms.map((room) => (
                        <button
                            key={room.roomId}
                            type="button"
                            className={`server-icon ${selectedRoom === room.roomId ? 'active' : ''}`}
                            onClick={() => onSelectRoom(room.roomId)}
                            title={room.name}
                            aria-label={room.name}
                            aria-current={selectedRoom === room.roomId ? 'page' : undefined}
                        >
                            <span className="server-icon-text">{getRoomInitial(room.name)}</span>
                            <span className="server-icon__label">{room.name}</span>
                            {room.userCount ? <span className="server-room-count">{room.userCount}</span> : null}
                        </button>
                    ))}
                </div>
            </div>

            <div className="server-sidebar__footer">
                <div className="server-active-room">
                    <FiRadio size={14} />
                    <span>{activeRoomName || '未加入房间'}</span>
                </div>

                <button
                    type="button"
                    className="server-icon add-server"
                    onClick={onCreateRoom}
                    title="创建房间"
                    aria-label="创建房间"
                >
                    <FiPlus size={20} />
                    <span className="server-icon__label">创建</span>
                </button>
            </div>
        </aside>
    );
};

export default memo(ServerSidebar);
