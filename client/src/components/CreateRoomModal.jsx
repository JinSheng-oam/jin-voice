import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FiGlobe, FiLock, FiPlus, FiX } from 'react-icons/fi';

const CreateRoomModal = ({ onClose, onSubmit }) => {
    const [roomName, setRoomName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event?.preventDefault();
        if (isSubmitting || !roomName.trim()) return;
        if (isPrivate && !password.trim()) return;

        setIsSubmitting(true);
        try {
            const result = onSubmit({
                roomName: roomName.trim(),
                password: isPrivate ? password.trim() : null,
                isPrivate
            });

            if (result && typeof result.then === 'function') {
                await result;
            } else {
                onClose();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="app-dialog-overlay" role="presentation" onClick={() => !isSubmitting && onClose()}>
            <form
                className="app-dialog create-room-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-room-title"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.key === 'Escape' && !isSubmitting && onClose()}
                onSubmit={handleSubmit}
            >
                <div className="create-room-dialog__header">
                    <span className="app-dialog__icon" aria-hidden="true"><FiPlus size={18} /></span>
                    <div className="app-dialog__copy">
                        <span className="app-dialog__eyebrow">新房间</span>
                        <h3 id="create-room-title">创建语音房间</h3>
                        <p>设置名称和访问方式，创建后会直接进入房间。</p>
                    </div>
                    <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="关闭" disabled={isSubmitting}>
                        <FiX size={18} />
                    </button>
                </div>

                <div className="create-room-dialog__body">
                    <label className="modal-field">
                        <span>房间名称</span>
                        <input
                            type="text"
                            value={roomName}
                            onChange={(event) => setRoomName(event.target.value)}
                            placeholder="例如：产品讨论室"
                            className="input"
                            autoFocus
                            disabled={isSubmitting}
                        />
                    </label>

                    <div className="create-room-type" role="group" aria-label="房间类型">
                        <button
                            type="button"
                            className={`create-room-type__option ${!isPrivate ? 'active' : ''}`}
                            disabled={isSubmitting}
                            onClick={() => {
                                setIsPrivate(false);
                                setPassword('');
                            }}
                        >
                            <FiGlobe size={17} />
                            <span>公开</span>
                        </button>
                        <button
                            type="button"
                            className={`create-room-type__option ${isPrivate ? 'active' : ''}`}
                            disabled={isSubmitting}
                            onClick={() => setIsPrivate(true)}
                        >
                            <FiLock size={17} />
                            <span>私密</span>
                        </button>
                    </div>

                    {isPrivate && (
                        <label className="modal-field create-room-password">
                            <span>访问密码</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="设置加入密码"
                                className="input"
                                disabled={isSubmitting}
                            />
                        </label>
                    )}
                </div>

                <div className="app-dialog__actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                        取消
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSubmitting || !roomName.trim() || (isPrivate && !password.trim())}
                    >
                        <FiPlus size={16} />
                        {isSubmitting ? '正在创建...' : '创建房间'}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
};

export default CreateRoomModal;
