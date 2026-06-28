import React, { useEffect, useMemo, useState } from 'react';
import { FiLogIn, FiMail, FiUser, FiLock, FiX } from 'react-icons/fi';

const getInitialDisplayName = () => {
    try {
        return localStorage.getItem('anydrop_nickname') || '';
    } catch {
        return '';
    }
};

const tabButtonStyle = (active) => ({
    flex: 1,
    border: 'none',
    borderRadius: '12px',
    padding: '12px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    background: active ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-strong) 100%)' : 'var(--bg-subtle-panel)',
    color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
    transition: 'all 0.2s ease'
});

const fieldStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid var(--border-moderate)',
    borderRadius: '14px',
    background: 'var(--bg-subtle-panel)',
    padding: '0 14px'
};

const inputStyle = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-normal)',
    fontSize: '14px',
    padding: '14px 0'
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

    useEffect(() => {
        setActiveMode(mode);
    }, [mode]);

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
            className="modal-overlay"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 11000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-overlay)',
                backdropFilter: 'blur(16px)'
            }}
        >
            <div
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                style={{
                    width: 'min(460px, calc(100vw - 32px))',
                    borderRadius: '24px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-modal-soft)',
                    boxShadow: 'var(--shadow-panel)',
                    padding: '24px'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div>
                        <span style={{ display: 'inline-block', fontSize: '12px', color: 'var(--primary)', marginBottom: '8px' }}>
                            账号访问
                        </span>
                        <h2 id={titleId} style={{ margin: 0, fontSize: '24px', color: 'var(--text-primary)' }}>{title}</h2>
                        <p id={descriptionId} style={{ margin: '10px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            不登录也能先直接使用；登录后可以把昵称和会话绑定到账号。
                        </p>
                    </div>

                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        aria-label="关闭登录窗口"
                        style={{ flexShrink: 0 }}
                    >
                        <FiX size={18} />
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button type="button" onClick={() => setActiveMode('login')} style={tabButtonStyle(activeMode === 'login')}>
                        登录
                    </button>
                    <button type="button" onClick={() => setActiveMode('register')} style={tabButtonStyle(activeMode === 'register')}>
                        注册
                    </button>
                </div>

                {message && (
                    <div
                        style={{
                            marginTop: '16px',
                            borderRadius: '14px',
                            padding: '12px 14px',
                            background: 'var(--primary-glow)',
                            border: '1px solid var(--border-glow)',
                            color: 'var(--text-normal)',
                            fontSize: '13px',
                            lineHeight: 1.5
                        }}
                    >
                        {message}
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            marginTop: '16px',
                            borderRadius: '14px',
                            padding: '12px 14px',
                            background: 'rgba(127, 29, 29, 0.38)',
                            border: '1px solid rgba(248, 113, 113, 0.26)',
                            color: '#fecaca',
                            fontSize: '13px',
                            lineHeight: 1.5
                        }}
                    >
                        {error}
                    </div>
                )}

                <form onSubmit={submit} style={{ display: 'grid', gap: '14px', marginTop: '20px' }}>
                    {activeMode === 'register' && (
                        <label style={fieldStyle}>
                            <FiUser size={16} color="var(--text-muted)" />
                            <input
                                style={inputStyle}
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

                    <label style={fieldStyle}>
                        <FiMail size={16} color="var(--text-muted)" />
                        <input
                            style={inputStyle}
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

                    <label style={fieldStyle}>
                        <FiLock size={16} color="var(--text-muted)" />
                        <input
                            style={inputStyle}
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
                        style={{ justifyContent: 'center', marginTop: '6px' }}
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
