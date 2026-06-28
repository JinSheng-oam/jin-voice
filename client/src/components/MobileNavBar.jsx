import React, { memo } from 'react';
import { FiGrid, FiRadio, FiMessageSquare } from 'react-icons/fi';

const MobileNavBar = ({ activeTab, onTabChange, isRoomSelected }) => {
    const items = [
        { id: 'servers', icon: FiGrid, label: '房间' },
        { id: 'channels', icon: FiRadio, label: '语音', disabled: !isRoomSelected },
        { id: 'chat', icon: FiMessageSquare, label: '聊天', disabled: !isRoomSelected }
    ];

    return (
        <nav className="mobile-bottom-nav">
            {items.map((item) => (
                <button
                    key={item.id}
                    className={`nav-item ${activeTab === item.id ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                    onClick={() => !item.disabled && onTabChange(item.id)}
                    disabled={item.disabled}
                >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                </button>
            ))}
        </nav>
    );
};

export default memo(MobileNavBar);
