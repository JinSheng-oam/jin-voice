import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { SocketContext } from '../SocketContext';
import { useAuth } from '../useAuth';
import {
    FiSend,
    FiMessageCircle,
    FiUsers,
    FiLock,
    FiRadio,
    FiArrowUpRight,
    FiTrash2
} from 'react-icons/fi';
import useRoomStore from '../stores/useRoomStore';
import { useShallow } from 'zustand/react/shallow';
import { showAlert } from '../stores/useDialogStore';

const Chat = () => {
    const {
        sendChatMessage,
        sendPrivateMessage,
        deleteMessage,
        me,
        connectedPeer
    } = useContext(SocketContext);

    const { chatMessages, privateMessages } = useRoomStore(useShallow(state => ({
        chatMessages: state.messages,
        privateMessages: state.privateMessages
    })));
    const { user, isAdmin } = useAuth();

    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('public');
    const scrollRef = useRef(null);

    const canUsePrivate = Boolean(connectedPeer);
    const resolvedTab = activeTab === 'private' && !canUsePrivate ? 'public' : activeTab;
    const currentMessages = useMemo(
        () => (resolvedTab === 'public' ? chatMessages : privateMessages),
        [resolvedTab, chatMessages, privateMessages]
    );

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages]);

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!message.trim()) return;

        if (resolvedTab === 'public') {
            sendChatMessage(message);
        } else if (connectedPeer) {
            sendPrivateMessage(message, connectedPeer);
        }

        setMessage('');
    };

    const handleDeleteMessage = async (msg) => {
        const response = await deleteMessage(msg, resolvedTab === 'private');
        if (response?.error) {
            await showAlert({
                title: '删除失败',
                message: response.error
            });
        }
    };

    return (
        <section className="chat-shell glass-panel">
            <header className="chat-header">
                <div className="chat-header__title">
                    <div className="chat-header__icon">
                        <FiMessageCircle size={18} />
                    </div>
                    <div>
                        <h2>房间聊天</h2>
                        <p>
                            {resolvedTab === 'public'
                                ? `${currentMessages.length} 条公共消息`
                                : `${currentMessages.length} 条私聊消息`}
                        </p>
                    </div>
                </div>

                <div className="chat-header__status">
                    <span className="status-badge online">
                        <span className="dot"></span>
                        实时同步
                    </span>
                </div>
            </header>

            <div className="chat-tabs">
                <button
                    onClick={() => setActiveTab('public')}
                    className={`chat-tab ${resolvedTab === 'public' ? 'active' : ''}`}
                >
                    <FiUsers size={15} />
                    公共大厅
                </button>
                <button
                    onClick={() => canUsePrivate && setActiveTab('private')}
                    disabled={!canUsePrivate}
                    className={`chat-tab ${resolvedTab === 'private' ? 'active private' : ''}`}
                >
                    <FiLock size={15} />
                    私密聊天
                    {!canUsePrivate && <span className="chat-tab__hint">需先建立文件连接</span>}
                </button>
            </div>

            {!canUsePrivate && resolvedTab === 'public' && (
                <div className="chat-banner">
                    <FiRadio size={15} />
                    <span>点击成员列表中的其他用户建立文件连接后，就能开启私聊和文件传输。</span>
                </div>
            )}

            <div className="chat-messages">
                {currentMessages.length === 0 ? (
                    <div className="chat-empty">
                        <div className="chat-empty__icon">
                            {resolvedTab === 'public' ? <FiUsers size={44} /> : <FiLock size={44} />}
                        </div>
                        <h3>{resolvedTab === 'public' ? '公共大厅还没有消息' : '私密聊天还没有开始'}</h3>
                        <p>
                            {resolvedTab === 'public'
                                ? '发出第一条消息，让语音房间里的协作更有上下文。'
                                : '建立文件连接后，这里会显示你们之间的私密消息。'}
                        </p>
                    </div>
                ) : (
                    currentMessages.map((msg, index) => {
                        const isMe = msg.userId === user?.id || msg.from === me;
                        const canDelete = Boolean(msg.id) && (isAdmin || isMe);
                        return (
                            <div key={msg.id || `${msg.time || 'msg'}-${index}`} className={`chat-row ${isMe ? 'mine' : ''}`}>
                                <div className={`chat-bubble ${isMe ? 'me' : 'other'}`}>
                                    <div className="chat-bubble__meta">
                                        <div className="chat-bubble__meta-left">
                                            <span>{isMe ? '我' : msg.user}</span>
                                            <span>{msg.time}</span>
                                        </div>
                                        {canDelete && (
                                            <button
                                                type="button"
                                                className="chat-message-delete"
                                                aria-label="删除消息"
                                                title="删除消息"
                                                onClick={() => handleDeleteMessage(msg)}
                                            >
                                                <FiTrash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <p>{msg.text}</p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={scrollRef} />
            </div>

            <form onSubmit={handleSubmit} className="chat-input-shell">
                <div className="chat-input-shell__tag">
                    {resolvedTab === 'public' ? (
                        <>
                            <FiUsers size={14} />
                            发送到公共大厅
                        </>
                    ) : (
                        <>
                            <FiArrowUpRight size={14} />
                            发送到当前私聊
                        </>
                    )}
                </div>

                <div className="chat-input-shell__row">
                    <input
                        type="text"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder={resolvedTab === 'public' ? '输入公共消息...' : '输入私密消息...'}
                        className="input"
                        disabled={resolvedTab === 'private' && !canUsePrivate}
                    />
                    <button
                        type="submit"
                        className={`btn ${resolvedTab === 'private' ? 'btn-accent' : 'btn-primary'} btn-icon`}
                        disabled={!message.trim() || (resolvedTab === 'private' && !canUsePrivate)}
                    >
                        <FiSend size={18} />
                    </button>
                </div>
            </form>
        </section>
    );
};

export default Chat;
