import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SocketContext } from '../SocketContext';
import { useAuth } from '../useAuth';
import {
    FiSend,
    FiMessageCircle,
    FiUsers,
    FiLock,
    FiRadio,
    FiArrowUpRight,
    FiTrash2,
    FiImage,
    FiPaperclip,
    FiFile,
    FiCheck,
    FiX,
    FiDownload,
    FiMinus,
    FiPlus,
    FiMaximize2
} from 'react-icons/fi';
import useRoomStore from '../stores/useRoomStore';
import { useShallow } from 'zustand/react/shallow';
import { showAlert } from '../stores/useDialogStore';
import { prepareChatImage } from '../lib/chatImage';

const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const TRANSFER_STATUS_LABELS = {
    waiting: '等待对方接收',
    connecting: '对方已接收，正在建立连接',
    sending: '正在发送',
    rejected: '对方已拒绝',
    timeout: '接收邀请已超时'
};

const IMAGE_ZOOM_MIN = 0.5;
const IMAGE_ZOOM_FIT = 1;
const IMAGE_ZOOM_MAX = 4;
const IMAGE_ZOOM_STEP = 0.5;

const ImageLightbox = ({ image, onClose }) => {
    const [zoom, setZoom] = useState(IMAGE_ZOOM_FIT);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const stageRef = useRef(null);
    const dragRef = useRef(null);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [onClose]);

    const clampOffset = (nextOffset, nextZoom = zoom) => {
        const stage = stageRef.current?.getBoundingClientRect();
        if (!stage || nextZoom <= IMAGE_ZOOM_FIT) return { x: 0, y: 0 };

        const maxX = stage.width * (nextZoom - 1) / 2;
        const maxY = stage.height * (nextZoom - 1) / 2;
        return {
            x: Math.max(-maxX, Math.min(maxX, nextOffset.x)),
            y: Math.max(-maxY, Math.min(maxY, nextOffset.y))
        };
    };

    const applyZoom = (nextZoom) => {
        const clampedZoom = Math.max(IMAGE_ZOOM_MIN, Math.min(IMAGE_ZOOM_MAX, nextZoom));
        setZoom(clampedZoom);
        setOffset((current) => clampOffset(current, clampedZoom));
    };

    const handlePointerDown = (event) => {
        if (zoom <= IMAGE_ZOOM_FIT) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: offset.x,
            offsetY: offset.y
        };
    };

    const handlePointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setOffset(clampOffset({
            x: drag.offsetX + event.clientX - drag.startX,
            y: drag.offsetY + event.clientY - drag.startY
        }));
    };

    const stopDragging = (event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    return createPortal((
        <div
            className="chat-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={stageRef}
                className={`chat-image-lightbox__stage ${zoom > IMAGE_ZOOM_FIT ? 'is-zoomed' : ''}`}
                onWheel={(event) => {
                    event.preventDefault();
                    applyZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
                }}
                onDoubleClick={() => applyZoom(zoom > IMAGE_ZOOM_FIT ? IMAGE_ZOOM_FIT : 2)}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDragging}
                onPointerCancel={stopDragging}
            >
                <img
                    src={image.dataUrl}
                    alt={image.name || '聊天图片预览'}
                    draggable={false}
                    style={{
                        transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`
                    }}
                />
            </div>
            <button
                type="button"
                className="chat-image-lightbox__close"
                onClick={onClose}
                aria-label="关闭图片预览"
            >
                <FiX size={20} />
            </button>
            <div className="chat-image-lightbox__toolbar" aria-label="图片缩放控制">
                <button
                    type="button"
                    onClick={() => applyZoom(zoom - IMAGE_ZOOM_STEP)}
                    disabled={zoom <= IMAGE_ZOOM_MIN}
                    aria-label="缩小图片"
                >
                    <FiMinus size={18} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                    type="button"
                    onClick={() => applyZoom(zoom + IMAGE_ZOOM_STEP)}
                    disabled={zoom >= IMAGE_ZOOM_MAX}
                    aria-label="放大图片"
                >
                    <FiPlus size={18} />
                </button>
                <button type="button" onClick={() => applyZoom(IMAGE_ZOOM_FIT)} aria-label="适应屏幕">
                    <FiMaximize2 size={17} />
                </button>
                <small>滚轮缩放 · 放大后拖动</small>
            </div>
        </div>
    ), document.body);
};

const Chat = () => {
    const {
        sendChatMessage,
        sendPrivateMessage,
        deleteMessage,
        me,
        requestFileTransfer,
        pendingFileTransfer,
        outgoingFileTransfer,
        acceptFileTransfer,
        rejectFileTransfer,
        transferProgress,
        downloadLink
    } = useContext(SocketContext);

    const { chatMessages, privateMessages, privateChatTarget, setPrivateChatTarget } = useRoomStore(useShallow(state => ({
        chatMessages: state.messages,
        privateMessages: state.privateMessages,
        privateChatTarget: state.privateChatTarget,
        setPrivateChatTarget: state.setPrivateChatTarget
    })));
    const { user, isAdmin } = useAuth();

    const [message, setMessage] = useState('');
    const [isPreparingImage, setIsPreparingImage] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const scrollRef = useRef(null);
    const imageInputRef = useRef(null);
    const fileInputRef = useRef(null);

    const targetId = privateChatTarget?.funId || '';
    const canUsePrivate = Boolean(privateChatTarget?.funId);
    const resolvedTab = canUsePrivate ? 'private' : 'public';
    const activePrivateMessages = useMemo(() => (
        canUsePrivate
            ? privateMessages.filter((msg) => (
                msg.from === targetId || msg.to === targetId
            ))
            : []
    ), [canUsePrivate, privateMessages, targetId]);
    const currentMessages = resolvedTab === 'public' ? chatMessages : activePrivateMessages;

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentMessages]);

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!message.trim()) return;

        if (resolvedTab === 'public') {
            sendChatMessage(message);
        } else if (privateChatTarget?.funId) {
            sendPrivateMessage(message, privateChatTarget.funId);
        }

        setMessage('');
    };

    const handleImageSelected = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setIsPreparingImage(true);
        try {
            const image = await prepareChatImage(file);
            if (resolvedTab === 'public') {
                sendChatMessage('', image);
            } else if (privateChatTarget?.funId) {
                sendPrivateMessage('', privateChatTarget.funId, image);
            }
        } catch (error) {
            await showAlert({
                title: '图片发送失败',
                message: error.message
            });
        } finally {
            setIsPreparingImage(false);
        }
    };

    const handleFileSelected = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !privateChatTarget?.funId) return;

        try {
            requestFileTransfer(file, privateChatTarget.funId);
        } catch (error) {
            await showAlert({
                title: '文件发送失败',
                message: error.message
            });
        }
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
                                : `与 ${privateChatTarget?.name || '成员'} 的私聊`}
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
                    onClick={() => setPrivateChatTarget(null)}
                    className={`chat-tab ${resolvedTab === 'public' ? 'active' : ''}`}
                >
                    <FiUsers size={15} />
                    公共大厅
                </button>
                <button
                    disabled={!canUsePrivate}
                    className={`chat-tab ${resolvedTab === 'private' ? 'active private' : ''}`}
                >
                    <FiLock size={15} />
                    私密聊天
                    {!canUsePrivate && <span className="chat-tab__hint">先选择成员</span>}
                </button>
            </div>

            {!canUsePrivate && resolvedTab === 'public' && (
                <div className="chat-banner">
                    <FiRadio size={15} />
                    <span>从成员列表选择队友即可私聊并直接发送文件；对方接收后会自动建立点对点连接。</span>
                </div>
            )}

            {pendingFileTransfer && (
                <div className="chat-file-invite" role="status" aria-live="polite">
                    <div className="chat-file-invite__icon"><FiFile size={18} /></div>
                    <div className="chat-file-invite__content">
                        <strong>{pendingFileTransfer.user || '房间成员'} 想发送文件</strong>
                        <span title={pendingFileTransfer.name}>
                            {pendingFileTransfer.name} · {formatFileSize(pendingFileTransfer.size)}
                        </span>
                    </div>
                    <div className="chat-file-invite__actions">
                        <button type="button" className="btn btn-primary" onClick={acceptFileTransfer}>
                            <FiCheck size={14} /> 接收
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={rejectFileTransfer}>
                            <FiX size={14} /> 拒绝
                        </button>
                    </div>
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
                                : `发给 ${privateChatTarget?.name || '当前成员'} 的消息只在双方在线时传递。`}
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
                                    {msg.image && (
                                        <img
                                            className="chat-message-image"
                                            src={msg.image.dataUrl}
                                            alt={msg.image.name || '聊天图片'}
                                            title="双击放大"
                                            tabIndex={0}
                                            role="button"
                                            onDoubleClick={() => setPreviewImage(msg.image)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    setPreviewImage(msg.image);
                                                }
                                            }}
                                        />
                                    )}
                                    {msg.text && <p>{msg.text}</p>}
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
                        ref={imageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={handleImageSelected}
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        hidden
                        onChange={handleFileSelected}
                    />
                    <button
                        type="button"
                        className="chat-composer-action"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isPreparingImage || (resolvedTab === 'private' && !canUsePrivate)}
                        aria-label={isPreparingImage ? '正在处理图片' : '发送图片'}
                        title={isPreparingImage ? '正在压缩图片…' : '发送图片'}
                    >
                        <FiImage size={18} />
                    </button>
                    {resolvedTab === 'private' && (
                        <button
                            type="button"
                            className="chat-composer-action"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!canUsePrivate || outgoingFileTransfer?.status === 'waiting' || outgoingFileTransfer?.status === 'connecting'}
                            aria-label={`发送文件给 ${privateChatTarget?.name || '成员'}`}
                            title="发送文件"
                        >
                            <FiPaperclip size={18} />
                        </button>
                    )}
                    <input
                        type="text"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder={resolvedTab === 'public' ? '输入公共消息...' : '输入私密消息...'}
                        className="input"
                        disabled={resolvedTab === 'private' && !canUsePrivate}
                        aria-label={resolvedTab === 'public' ? '公共消息' : `发送给 ${privateChatTarget?.name || '成员'} 的私密消息`}
                    />
                    <button
                        type="submit"
                        className={`btn ${resolvedTab === 'private' ? 'btn-accent' : 'btn-primary'} btn-icon`}
                        disabled={!message.trim() || (resolvedTab === 'private' && !canUsePrivate)}
                        aria-label={resolvedTab === 'private' ? `发送私密消息给 ${privateChatTarget?.name || '成员'}` : '发送公共消息'}
                    >
                        <FiSend size={18} />
                    </button>
                </div>

                {(outgoingFileTransfer || (transferProgress > 0 && transferProgress < 100) || downloadLink) && (
                    <div className="chat-transfer-status" aria-live="polite">
                        {outgoingFileTransfer && (
                            <span title={outgoingFileTransfer.name}>
                                <FiFile size={14} />
                                {outgoingFileTransfer.name} · {
                                    outgoingFileTransfer.status === 'sending' && transferProgress >= 100
                                        ? '发送完成'
                                        : TRANSFER_STATUS_LABELS[outgoingFileTransfer.status]
                                }
                                {outgoingFileTransfer.status === 'sending' && transferProgress > 0
                                    ? ` ${transferProgress}%`
                                    : ''}
                            </span>
                        )}
                        {downloadLink && (
                            <a href={downloadLink.url} download={downloadLink.name}>
                                <FiDownload size={14} />
                                下载 {downloadLink.name}
                            </a>
                        )}
                    </div>
                )}
            </form>

            {previewImage && (
                <ImageLightbox image={previewImage} onClose={() => setPreviewImage(null)} />
            )}
        </section>
    );
};

export default Chat;
