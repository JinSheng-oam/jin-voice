import React, { useMemo, useState } from 'react';
import { FiLogIn, FiMail, FiUser, FiLock, FiX } from 'react-icons/fi';

const getInitialDisplayName = () => {
    try {
        return localStorage.getItem('anydrop_nickname') || '';
    } catch {
        return '';
    }
};

const AuthModal = ({
    mode = 'login',
    message = '',
    pending = false,
    error = '',
    onClose,
    onLogin,
    onRegister
}) => {
    const [activeMode, setActiveMode] = useState(mode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState(getInitialDisplayName);

    const title = useMemo(() => (
        activeMode === 'login' ? '登录 JinVoice 账号' : '创建 JinVoice 账号'
    ), [activeMode]);
    const titleId = activeMode === 'login' ? 'auth-modal-title-login' : 'auth-modal-title-register';
    const descriptionId = `${titleId}-description`;

    const submit = async (event) => {
        event.preventDefault();

        if (activeMode === 'login') {
            await onLogin?.({ email, password });
            return;
        }

        await onRegister?.({ email, password, displayName });
    };

    return (
        <div
            className="modal-overlay auth-modal-overlay"
            onClick={onClose}
        >
            <div
                className="auth-dialog"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
            >
                <div className="auth-dialog__header">
                    <div>
                        <span className="auth-dialog__eyebrow">
                            账号访问
                        </span>
                        <h2 id={titleId}>{title}</h2>
                        <p id={descriptionId}>
                            不登录也能先直接使用；登录后可以把昵称和会话绑定到账号。
                        </p>
                    </div>

                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        aria-label="关闭登录窗口"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                <div className="auth-dialog__tabs" role="tablist" aria-label="账号操作">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeMode === 'login'}
                        className={activeMode === 'login' ? 'active' : ''}
                        onClick={() => setActiveMode('login')}
                    >
                        登录
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeMode === 'register'}
                        className={activeMode === 'register' ? 'active' : ''}
                        onClick={() => setActiveMode('register')}
                    >
                        注册
                    </button>
                </div>

                {message && (
                    <div className="auth-dialog__notice">
                        {message}
                    </div>
                )}

                {error && (
                    <div className="auth-dialog__notice is-error" role="alert">
                        {error}
                    </div>
                )}

                <form className="auth-dialog__form" onSubmit={submit}>
                    {activeMode === 'register' && (
                        <label className="auth-dialog__field">
                            <FiUser size={16} color="var(--text-muted)" />
                            <input
                                type="text"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                placeholder="显示昵称"
                                aria-label="显示昵称"
                                autoComplete="nickname"
                                autoFocus
                                disabled={pending}
                            />
                        </label>
                    )}

                    <label className="auth-dialog__field">
                        <FiMail size={16} color="var(--text-muted)" />
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="邮箱地址"
                            aria-label="邮箱地址"
                            autoComplete="email"
                            spellCheck={false}
                            autoFocus={activeMode === 'login'}
                            disabled={pending}
                        />
                    </label>

                    <label className="auth-dialog__field">
                        <FiLock size={16} color="var(--text-muted)" />
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder={activeMode === 'login' ? '输入密码' : '至少 8 位密码'}
                            aria-label="密码"
                            autoComplete={activeMode === 'login' ? 'current-password' : 'new-password'}
                            disabled={pending}
                        />
                    </label>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={
                            pending ||
                            !email.trim() ||
                            !password.trim() ||
                            (activeMode === 'register' && !displayName.trim())
                        }
                    >
                        <FiLogIn size={16} />
                        {pending ? '处理中...' : activeMode === 'login' ? '登录账号' : '创建账号'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
