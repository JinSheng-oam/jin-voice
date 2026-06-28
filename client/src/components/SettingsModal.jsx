import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SocketContext } from '../SocketContext';
import useAudioStore from '../stores/useAudioStore';
import useUIStore from '../stores/useUIStore';
import { useAuth } from '../useAuth';
import { apiRequest } from '../lib/apiClient';
import { useShallow } from 'zustand/react/shallow';
import { showConfirm } from '../stores/useDialogStore';
import { FiX, FiMic, FiVolume2, FiVideo, FiMonitor, FiChevronRight, FiZap, FiHeadphones, FiShield, FiTrash2, FiUserCheck, FiImage, FiCommand } from 'react-icons/fi';

const formatShortcutKey = (code = 'Space') => {
    if (code === 'Space') return '空格';
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return `小键盘 ${code.slice(6)}`;
    return code
        .replace('Arrow', '方向键 ')
        .replace('Control', 'Ctrl ')
        .replace('Escape', 'Esc')
        .replace('Backquote', '`')
        .replace('Minus', '-')
        .replace('Equal', '=')
        .replace('BracketLeft', '[')
        .replace('BracketRight', ']')
        .replace('Semicolon', ';')
        .replace('Quote', '\'')
        .replace('Comma', ',')
        .replace('Period', '.')
        .replace('Slash', '/')
        .replace('Backslash', '\\');
};

const MicVolumeMeter = () => {
    const micVolume = useAudioStore((state) => state.micVolume);

    return (
        <div style={{ marginTop: '16px' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px'
            }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>输入电平</span>
                <span style={{ fontSize: '12px', color: micVolume > 50 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {micVolume > 5 ? '🎤 检测到声音' : '🔇 静音中'}
                </span>
            </div>
            <div style={{
                height: '8px',
                borderRadius: '4px',
                background: 'var(--bg-modifier)',
                overflow: 'hidden'
            }}>
                <div style={{
                    height: '100%',
                    width: `${micVolume}%`,
                    borderRadius: '4px',
                    background: micVolume < 30
                        ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                        : micVolume < 70
                            ? 'linear-gradient(90deg, #22c55e, #facc15)'
                            : 'linear-gradient(90deg, #facc15, #ef4444)',
                    transition: 'width 0.1s ease-out'
                }} />
            </div>
        </div>
    );
};

const VoiceActivationLiveLevel = () => {
    const micVolume = useAudioStore((state) => state.micVolume);
    const { voiceTransmissionState = 'live' } = useContext(SocketContext) || {};
    const transmissionStateLabel = voiceTransmissionState === 'manual-muted'
        ? '手动静音中'
        : voiceTransmissionState === 'push-to-talk-muted'
            ? '等待按键说话'
        : voiceTransmissionState === 'voice-gated'
            ? '语音感应闭麦'
            : '正常发送';
    const transmissionStateColor = voiceTransmissionState === 'manual-muted'
        ? '#f59e0b'
        : voiceTransmissionState === 'push-to-talk-muted'
            ? '#38bdf8'
        : voiceTransmissionState === 'voice-gated'
            ? '#ec4899'
            : 'var(--success)';

    return (
        <div style={{ marginTop: '8px' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px', marginBottom: '6px' }}>
                当前音量: {micVolume} | 阈值越低越灵敏
            </p>
            <p style={{ fontSize: '11px', color: transmissionStateColor, margin: 0 }}>
                当前发送状态：{transmissionStateLabel}
            </p>
        </div>
    );
};

const sectionCardStyle = {
    background: 'var(--panel-card-glass)',
    backdropFilter: 'blur(var(--site-panel-blur))',
    WebkitBackdropFilter: 'blur(var(--site-panel-blur))',
    borderRadius: '14px',
    padding: '20px',
    border: '1px solid var(--panel-card-border)',
    boxShadow: '0 14px 28px rgba(0, 0, 0, 0.12)'
};

const sectionCaptionStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-muted)',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
};

const helperTextStyle = {
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    marginTop: '8px',
    lineHeight: '1.5'
};

const selectStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '0',
    border: '1px solid var(--panel-card-border)',
    background: 'var(--panel-card-glass-strong)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.2s'
};

const SettingsModal = ({ onClose }) => {
    const {
        voiceActivationEnabled = false,
        setVoiceActivationEnabled,
        voiceActivationThreshold = 15,
        setVoiceActivationThreshold
    } = useContext(SocketContext) || {};

    const {
        audioDevices,
        selectedAudioInput,
        setSelectedAudioInput,
        selectedAudioOutput,
        setSelectedAudioOutput: setOutputDevice,
        microphoneEnhancementEnabled,
        setMicrophoneEnhancementEnabled,
        noiseSuppressionEnabled,
        setNoiseSuppressionEnabled,
        noiseSuppressionStrength,
        setNoiseSuppressionStrength,
        pushToTalkEnabled,
        setPushToTalkEnabled,
        pushToTalkKey,
        setPushToTalkKey,
        voiceActivationOpenSensitivity,
        setVoiceActivationOpenSensitivity,
        voiceActivationReleaseDelay,
        setVoiceActivationReleaseDelay,
        voiceActivationNoiseTolerance,
        setVoiceActivationNoiseTolerance,
        selfMonitorEnabled,
        setSelfMonitorEnabled,
        selfMonitorVolume,
        setSelfMonitorVolume
    } = useAudioStore(useShallow((state) => ({
        audioDevices: state.audioDevices,
        selectedAudioInput: state.selectedAudioInput,
        setSelectedAudioInput: state.setSelectedAudioInput,
        selectedAudioOutput: state.selectedAudioOutput,
        setSelectedAudioOutput: state.setSelectedAudioOutput,
        microphoneEnhancementEnabled: state.microphoneEnhancementEnabled,
        setMicrophoneEnhancementEnabled: state.setMicrophoneEnhancementEnabled,
        noiseSuppressionEnabled: state.noiseSuppressionEnabled,
        setNoiseSuppressionEnabled: state.setNoiseSuppressionEnabled,
        noiseSuppressionStrength: state.noiseSuppressionStrength,
        setNoiseSuppressionStrength: state.setNoiseSuppressionStrength,
        pushToTalkEnabled: state.pushToTalkEnabled,
        setPushToTalkEnabled: state.setPushToTalkEnabled,
        pushToTalkKey: state.pushToTalkKey,
        setPushToTalkKey: state.setPushToTalkKey,
        voiceActivationOpenSensitivity: state.voiceActivationOpenSensitivity,
        setVoiceActivationOpenSensitivity: state.setVoiceActivationOpenSensitivity,
        voiceActivationReleaseDelay: state.voiceActivationReleaseDelay,
        setVoiceActivationReleaseDelay: state.setVoiceActivationReleaseDelay,
        voiceActivationNoiseTolerance: state.voiceActivationNoiseTolerance,
        setVoiceActivationNoiseTolerance: state.setVoiceActivationNoiseTolerance,
        selfMonitorEnabled: state.selfMonitorEnabled,
        setSelfMonitorEnabled: state.setSelfMonitorEnabled,
        selfMonitorVolume: state.selfMonitorVolume,
        setSelfMonitorVolume: state.setSelfMonitorVolume
    })));

    const {
        theme,
        setTheme,
        siteAppearance,
        setSiteAppearance
    } = useUIStore(useShallow((state) => ({
        theme: state.theme,
        setTheme: state.setTheme,
        siteAppearance: state.siteAppearance,
        setSiteAppearance: state.setSiteAppearance
    })));
    const { user, isAdmin } = useAuth();
    const isDesktop = Boolean(window.jinvoiceDesktop?.isDesktop);

    const [activeTab, setActiveTab] = useState('audio');
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminLoading, setAdminLoading] = useState(false);
    const [adminError, setAdminError] = useState('');
    const [adminSavingId, setAdminSavingId] = useState('');
    const [siteAppearanceDraft, setSiteAppearanceDraft] = useState(siteAppearance);
    const [siteAppearanceSaving, setSiteAppearanceSaving] = useState(false);
    const [contentReady, setContentReady] = useState(false);
    const [isCapturingPushToTalkKey, setIsCapturingPushToTalkKey] = useState(false);

    useEffect(() => {
        if (!isCapturingPushToTalkKey) return undefined;

        const handleKeyCapture = (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.code === 'Escape') {
                setIsCapturingPushToTalkKey(false);
                return;
            }

            setPushToTalkKey?.(event.code || 'Space');
            setIsCapturingPushToTalkKey(false);
        };

        window.addEventListener('keydown', handleKeyCapture, true);
        return () => {
            window.removeEventListener('keydown', handleKeyCapture, true);
        };
    }, [isCapturingPushToTalkKey, setPushToTalkKey]);

    React.useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    React.useEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            setContentReady(true);
        });

        return () => window.cancelAnimationFrame(frameId);
    }, []);

    React.useEffect(() => {
        const timerId = window.setTimeout(() => {
            setSiteAppearanceDraft(siteAppearance);
        }, 0);

        return () => window.clearTimeout(timerId);
    }, [siteAppearance]);

    const menuItems = [
        { id: 'audio', icon: FiMic, label: '音频设置', enabled: true },
        { id: 'appearance', icon: FiMonitor, label: '界面外观', enabled: true },
        ...(isAdmin ? [{ id: 'admin', icon: FiShield, label: '成员管理', enabled: true }] : []),
        { id: 'video', icon: FiVideo, label: '视频设置', enabled: false },
    ];

    const backgroundOptions = [
        { id: 'aurora', label: '极光流光', preview: 'linear-gradient(135deg, #0c1729 0%, #103552 40%, #1eb8ab 100%)' },
        { id: 'midnight-grid', label: '深夜网格', preview: 'linear-gradient(135deg, #0a1221 0%, #11253b 55%, #335b7f 100%)' },
        { id: 'sunset-flow', label: '落日流线', preview: 'linear-gradient(135deg, #1f1830 0%, #47344a 45%, #ff7a3c 100%)' },
        { id: 'minimal-paper', label: '极简纸面', preview: 'linear-gradient(135deg, #edf4f8 0%, #dfeaf2 100%)' }
    ];

    const updateSiteAppearanceDraft = (patch) => {
        setSiteAppearanceDraft((prev) => ({
            ...prev,
            ...patch
        }));
    };

    const loadAdminUsers = React.useCallback(async () => {
        if (!isAdmin) return;

        setAdminLoading(true);
        setAdminError('');
        try {
            const data = await apiRequest('/api/admin/users');
            setAdminUsers(data.users || []);
        } catch (error) {
            setAdminError(error.message);
        } finally {
            setAdminLoading(false);
        }
    }, [isAdmin]);

    React.useEffect(() => {
        if (activeTab === 'admin' && isAdmin) {
            const timerId = window.setTimeout(() => {
                void loadAdminUsers();
            }, 0);

            return () => window.clearTimeout(timerId);
        }

        return undefined;
    }, [activeTab, isAdmin, loadAdminUsers]);

    const updateAdminUser = async (userId, payload) => {
        setAdminSavingId(userId);
        setAdminError('');
        try {
            const data = await apiRequest(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                body: payload
            });

            setAdminUsers((prev) => prev.map((entry) => (
                entry.id === userId ? data.user : entry
            )));
        } catch (error) {
            setAdminError(error.message);
        } finally {
            setAdminSavingId('');
        }
    };

    const deleteAdminUser = async (userId) => {
        const target = adminUsers.find((entry) => entry.id === userId);
        if (!target) return;

        const confirmed = await showConfirm({
            title: '删除成员账户',
            message: `确定要删除成员「${target.displayName}」吗？此操作不可恢复。`,
            confirmText: '删除',
            danger: true
        });
        if (!confirmed) return;

        setAdminSavingId(userId);
        setAdminError('');
        try {
            await apiRequest(`/api/admin/users/${userId}`, {
                method: 'DELETE'
            });

            setAdminUsers((prev) => prev.filter((entry) => entry.id !== userId));
        } catch (error) {
            setAdminError(error.message);
        } finally {
            setAdminSavingId('');
        }
    };

    const saveSiteAppearance = async () => {
        if (!isAdmin) return;

        setSiteAppearanceSaving(true);
        setAdminError('');

        try {
            const data = await apiRequest('/api/admin/site-appearance', {
                method: 'PATCH',
                body: siteAppearanceDraft
            });

            setSiteAppearance(data.appearance || siteAppearanceDraft);
            setSiteAppearanceDraft(data.appearance || siteAppearanceDraft);
        } catch (error) {
            setAdminError(error.message);
        } finally {
            setSiteAppearanceSaving(false);
        }
    };

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-overlay)',
                animation: 'fadeIn 0.12s ease-out',
                willChange: 'opacity'
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--panel-card-glass)',
                    border: '1px solid var(--panel-card-border)',
                    // Mobile: Fullscreen, Desktop: Floating Card
                    borderRadius: isMobile ? '0' : '20px',
                    boxShadow: '0 22px 48px rgba(0, 0, 0, 0.18)',
                    backdropFilter: 'blur(var(--site-panel-blur))',
                    WebkitBackdropFilter: 'blur(var(--site-panel-blur))',
                    width: isMobile ? '100%' : '900px',
                    maxWidth: isMobile ? '100%' : '95vw',
                    height: isMobile ? '100%' : '650px',
                    maxHeight: isMobile ? '100%' : '90vh',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    overflow: 'hidden',
                    animation: 'scaleIn 0.18s ease-out',
                    transform: 'translateZ(0)',
                    position: isMobile ? 'fixed' : 'relative', // Ensure it covers everything on mobile
                    top: isMobile ? 0 : 'auto',
                    left: isMobile ? 0 : 'auto'
                }}
            >
                {/* 侧边栏导航 - 手机端变成顶部横向tabs */}
                <div style={{
                    width: isMobile ? '100%' : '260px',
                    background: 'rgba(255, 255, 255, 0.025)',
                    borderRight: isMobile ? 'none' : '1px solid var(--panel-card-border)',
                    borderBottom: isMobile ? '1px solid var(--panel-card-border)' : 'none',
                    padding: isMobile ? '12px 8px' : '28px 16px',
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    alignItems: isMobile ? 'center' : 'stretch',
                    gap: isMobile ? '8px' : '0',
                    overflowX: isMobile ? 'auto' : 'visible',
                    flexShrink: 0
                }}>
                    {/* 标题 - 手机端隐藏 */}
                    {!isMobile && (
                        <h2 style={{
                            fontSize: '22px',
                            fontWeight: '700',
                            marginBottom: '32px',
                            paddingLeft: '16px',
                            background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--primary) 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                        }}>设置</h2>
                    )}

                    <nav style={{
                        flex: isMobile ? 'none' : 1,
                        display: 'flex',
                        flexDirection: isMobile ? 'row' : 'column',
                        gap: isMobile ? '4px' : '0'
                    }}>
                        {menuItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => item.enabled && setActiveTab(item.id)}
                                disabled={!item.enabled}
                                style={{
                                    width: isMobile ? 'auto' : '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: isMobile ? '6px' : '14px',
                                    padding: isMobile ? '10px 14px' : '14px 18px',
                                    borderRadius: isMobile ? '10px' : '12px',
                                    border: 'none',
                                    marginBottom: isMobile ? '0' : '6px',
                                    cursor: item.enabled ? 'pointer' : 'not-allowed',
                                    fontSize: isMobile ? '12px' : '14px',
                                    fontWeight: '500',
                                    transition: 'all 0.2s ease',
                                    background: activeTab === item.id
                                        ? 'linear-gradient(135deg, var(--primary-glow) 0%, rgba(255, 155, 103, 0.12) 100%)'
                                        : 'transparent',
                                    color: activeTab === item.id ? 'var(--text-primary)' : item.enabled ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                                    boxShadow: activeTab === item.id ? 'var(--shadow-highlight)' : 'none',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                <item.icon size={isMobile ? 16 : 18} />
                                {/* 手机端显示短标签 */}
                                <span style={{
                                    flex: isMobile ? 'none' : 1,
                                    textAlign: 'left',
                                    display: isMobile ? 'none' : 'block'
                                }}>{item.label}</span>
                                {/* 手机端只显示图标，点击后显示 tab 名称 */}
                                {isMobile && activeTab === item.id && (
                                    <span style={{ fontSize: '11px' }}>{item.label.slice(0, 2)}</span>
                                )}
                                {!item.enabled && !isMobile && (
                                    <span style={{
                                        fontSize: '10px',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        background: 'var(--bg-subtle-panel-hover)',
                                        color: 'var(--text-tertiary)'
                                    }}>开发中</span>
                                )}
                                {item.enabled && !isMobile && <FiChevronRight size={14} style={{ opacity: 0.4 }} />}
                            </button>
                        ))}
                    </nav>

                    {/* 版本信息 - 手机端隐藏 */}
                    {!isMobile && (
                        <div style={{
                            padding: '16px',
                            borderTop: '1px solid var(--border-light)',
                            fontSize: '11px',
                            color: 'var(--text-tertiary)'
                        }}>
                            JinVoice v1.0.0
                        </div>
                    )}
                </div>

                {/* 主内容区 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {/* 顶部栏 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '24px 32px',
                        borderBottom: '1px solid var(--panel-card-border)',
                        flexShrink: 0
                    }}>
                        <div>
                            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
                                {activeTab === 'audio' && '音频设置'}
                                {activeTab === 'appearance' && '界面外观'}
                                {activeTab === 'admin' && '成员管理'}
                                {activeTab === 'video' && '视频设置'}
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                                {activeTab === 'audio' && '配置你的麦克风和扬声器设备'}
                                {activeTab === 'appearance' && '自定义应用的主题和显示偏好'}
                                {activeTab === 'admin' && '管理员可以查看成员、提升管理员权限或删除账户'}
                                {activeTab === 'video' && '配置摄像头和视频效果'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '12px',
                                border: 'none',
                                background: 'var(--bg-subtle-panel)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = 'rgba(239,68,68,0.2)';
                                e.target.style.color = '#ef4444';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'var(--bg-subtle-panel)';
                                e.target.style.color = 'var(--text-secondary)';
                            }}
                        >
                            <FiX size={20} />
                        </button>
                    </div>

                    {/* 滚动内容区 */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                        {!contentReady && (
                            <div style={{ maxWidth: '540px' }}>
                                <div style={{
                                    ...sectionCardStyle,
                                    minHeight: '150px',
                                    display: 'grid',
                                    alignContent: 'center',
                                    gap: '12px'
                                }}>
                                    <div style={{
                                        width: '42%',
                                        height: '14px',
                                        borderRadius: '999px',
                                        background: 'var(--bg-subtle-panel-hover)'
                                    }} />
                                    <div style={{
                                        width: '72%',
                                        height: '10px',
                                        borderRadius: '999px',
                                        background: 'var(--bg-subtle-panel)'
                                    }} />
                                    <div style={{
                                        width: '56%',
                                        height: '10px',
                                        borderRadius: '999px',
                                        background: 'var(--bg-subtle-panel)'
                                    }} />
                                </div>
                            </div>
                        )}
                        {contentReady && (
                            <>
                        {activeTab === 'appearance' && (
                            <div style={{ maxWidth: '540px' }}>
                                <section>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <FiMonitor size={16} color="#fff" />
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: '600' }}>主题设置</span>
                                    </div>

                                    <div style={{
                                        ...sectionCardStyle
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                            {[
                                                { id: 'dark', label: '深色模式', color: '#1e1f22' },
                                                { id: 'light', label: '浅色模式', color: '#ffffff' },
                                                { id: 'system', label: '跟随系统', color: '#475569' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => setTheme(opt.id)}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '16px',
                                                        borderRadius: '12px',
                                                        border: theme === opt.id ? '2px solid var(--primary)' : '1px solid var(--border-moderate)',
                                                        background: 'var(--bg-subtle-panel-hover)',
                                                        cursor: 'pointer',
                                                        position: 'relative',
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        borderRadius: '50%',
                                                        background: opt.color,
                                                        border: '1px solid var(--border-moderate)',
                                                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                                                    }}></div>
                                                    <span style={{ fontSize: '13px', color: theme === opt.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                                        {opt.label}
                                                    </span>
                                                    {theme === opt.id && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            top: '8px',
                                                            right: '8px',
                                                            width: '8px',
                                                            height: '8px',
                                                            borderRadius: '50%',
                                                            background: 'var(--primary)'
                                                        }} />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </section>

                                <section style={{ marginTop: '32px' }}>
                                    <div style={sectionCardStyle}>
                                        <p style={{ ...helperTextStyle, marginTop: 0 }}>
                                            主题设置会影响你当前设备上的浅色、深色和跟随系统选项。
                                        </p>
                                    </div>
                                </section>

                                {isAdmin && (
                                    <section style={{ marginTop: '32px' }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            marginBottom: '20px'
                                        }}>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px'
                                            }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '10px',
                                                    background: 'linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <FiImage size={16} color="#fff" />
                                                </div>
                                                <span style={{ fontSize: '15px', fontWeight: '600' }}>站点背景</span>
                                            </div>
                                        </div>

                                        <div style={sectionCardStyle}>
                                            <p style={{ ...helperTextStyle, marginTop: 0, marginBottom: '16px' }}>
                                                这里配置的是整站统一的玻璃背景风格，普通成员会看到最终效果，但不会看到或修改这些控制项。
                                            </p>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                                                {[
                                                    { id: 'preset', label: '使用预设背景' },
                                                    { id: 'image', label: '自定义背景图片' }
                                                ].map((option) => (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        onClick={() => updateSiteAppearanceDraft({ backgroundMode: option.id })}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            minHeight: '48px',
                                                            padding: '0 16px',
                                                            borderRadius: '12px',
                                                            border: siteAppearanceDraft.backgroundMode === option.id ? '2px solid var(--primary)' : '1px solid var(--panel-card-border)',
                                                            background: 'var(--panel-card-surface)',
                                                            color: siteAppearanceDraft.backgroundMode === option.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                            fontSize: '13px',
                                                            fontWeight: '600',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                {backgroundOptions.map((option) => (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        onClick={() => updateSiteAppearanceDraft({ backgroundPreset: option.id })}
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'flex-start',
                                                            gap: '10px',
                                                            padding: '14px',
                                                            borderRadius: '12px',
                                                            border: siteAppearanceDraft.backgroundPreset === option.id ? '2px solid var(--primary)' : '1px solid var(--panel-card-border)',
                                                            background: 'var(--panel-card-surface)',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '100%',
                                                            height: '74px',
                                                            borderRadius: '10px',
                                                            background: option.preview,
                                                            border: '1px solid var(--panel-card-border)'
                                                        }} />
                                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '600' }}>
                                                            {option.label}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>

                                            {siteAppearanceDraft.backgroundMode === 'image' && (
                                                <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--panel-card-border)' }}>
                                                    <label style={sectionCaptionStyle}>背景图片地址</label>
                                                    <input
                                                        type="url"
                                                        value={siteAppearanceDraft.backgroundImageUrl || ''}
                                                        onChange={(e) => updateSiteAppearanceDraft({ backgroundImageUrl: e.target.value })}
                                                        placeholder="https://example.com/background.jpg 或 /images/background.jpg"
                                                        className="input"
                                                    />
                                                    <p style={helperTextStyle}>
                                                        支持 `https://`、`http://`、`data:image/...` 和站点相对路径。
                                                    </p>
                                                </div>
                                            )}

                                            <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--panel-card-border)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>背景模糊</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{siteAppearanceDraft.backgroundBlur}px</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="40"
                                                    value={siteAppearanceDraft.backgroundBlur}
                                                    onChange={(e) => updateSiteAppearanceDraft({ backgroundBlur: Number(e.target.value) })}
                                                    style={{ width: '100%', accentColor: '#0ea5e9' }}
                                                />
                                            </div>

                                            <div style={{ marginTop: '18px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>背景透明度</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{siteAppearanceDraft.backgroundOpacity}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={siteAppearanceDraft.backgroundOpacity}
                                                    onChange={(e) => updateSiteAppearanceDraft({ backgroundOpacity: Number(e.target.value) })}
                                                    style={{ width: '100%', accentColor: '#14b8a6' }}
                                                />
                                            </div>

                                            <div style={{ marginTop: '18px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>面板透明度</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{siteAppearanceDraft.panelOpacity}%</span>
                                                </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={siteAppearanceDraft.panelOpacity}
                                                onChange={(e) => updateSiteAppearanceDraft({ panelOpacity: Number(e.target.value) })}
                                                style={{ width: '100%', accentColor: '#45d6c5' }}
                                            />
                                                <p style={helperTextStyle}>
                                                    数值越高越透明，数值越低越接近实心玻璃。
                                                </p>
                                            </div>

                                            <div style={{ marginTop: '18px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>面板模糊</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{siteAppearanceDraft.panelBlur}px</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="40"
                                                    value={siteAppearanceDraft.panelBlur}
                                                    onChange={(e) => updateSiteAppearanceDraft({ panelBlur: Number(e.target.value) })}
                                                    style={{ width: '100%', accentColor: '#8b5cf6' }}
                                                />
                                            </div>

                                            <div style={{ marginTop: '18px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>面板高亮</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{siteAppearanceDraft.panelGlow}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="30"
                                                    value={siteAppearanceDraft.panelGlow}
                                                    onChange={(e) => updateSiteAppearanceDraft({ panelGlow: Number(e.target.value) })}
                                                    style={{ width: '100%', accentColor: '#ff9b67' }}
                                                />
                                            </div>

                                            <div style={{
                                                marginTop: '22px',
                                                paddingTop: '18px',
                                                borderTop: '1px solid var(--panel-card-border)',
                                                display: 'flex',
                                                justifyContent: 'flex-end'
                                            }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary"
                                                    disabled={siteAppearanceSaving}
                                                    onClick={() => void saveSiteAppearance()}
                                                >
                                                    {siteAppearanceSaving ? '保存中...' : '保存背景'}
                                                </button>
                                            </div>
                                        </div>
                                    </section>
                                )}
                            </div>
                        )}

                        {activeTab === 'admin' && isAdmin && (
                            <div style={{ maxWidth: '760px' }}>
                                <section>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '16px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '10px',
                                                background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <FiShield size={16} color="#fff" />
                                            </div>
                                            <span style={{ fontSize: '15px', fontWeight: '600' }}>成员账户管理</span>
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={() => void loadAdminUsers()}
                                            disabled={adminLoading}
                                        >
                                            刷新成员
                                        </button>
                                    </div>

                                    <div style={sectionCardStyle}>
                                        <p style={{ ...helperTextStyle, marginTop: 0, marginBottom: '16px' }}>
                                            当前登录账号：{user?.displayName || user?.email}。管理员账号由服务端启动配置创建或由现有管理员授权。
                                        </p>

                                        {adminError && (
                                            <div style={{
                                                marginBottom: '16px',
                                                borderRadius: '12px',
                                                padding: '12px 14px',
                                                background: 'rgba(239, 68, 68, 0.12)',
                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                color: 'var(--danger)',
                                                fontSize: '13px'
                                            }}>
                                                {adminError}
                                            </div>
                                        )}

                                        {adminLoading ? (
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>正在加载成员列表...</div>
                                        ) : (
                                            <div style={{ display: 'grid', gap: '12px' }}>
                                                {adminUsers.map((member) => (
                                                    <div
                                                        key={member.id}
                                                        style={{
                                                            border: '1px solid var(--border-light)',
                                                            background: 'var(--bg-subtle-panel)',
                                                            borderRadius: '14px',
                                                            padding: '14px 16px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '16px'
                                                        }}
                                                    >
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{member.displayName}</strong>
                                                                {member.isAdmin && (
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        minHeight: '24px',
                                                                        padding: '0 10px',
                                                                        borderRadius: '999px',
                                                                        background: 'rgba(30, 184, 171, 0.12)',
                                                                        color: 'var(--primary)',
                                                                        fontSize: '11px',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        管理员
                                                                    </span>
                                                                )}
                                                                {member.id === user?.id && (
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        minHeight: '24px',
                                                                        padding: '0 10px',
                                                                        borderRadius: '999px',
                                                                        background: 'rgba(255, 255, 255, 0.08)',
                                                                        color: 'var(--text-secondary)',
                                                                        fontSize: '11px',
                                                                        fontWeight: '700'
                                                                    }}>
                                                                        当前账号
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                                                                {member.email}
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary"
                                                                disabled={adminSavingId === member.id || member.id === user?.id}
                                                                onClick={() => void updateAdminUser(member.id, { isAdmin: !member.isAdmin })}
                                                                title={member.id === user?.id ? '不能修改自己的管理员权限' : ''}
                                                            >
                                                                <FiUserCheck size={14} />
                                                                {member.isAdmin ? '取消管理员' : '设为管理员'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-danger"
                                                                disabled={adminSavingId === member.id || member.id === user?.id}
                                                                onClick={() => void deleteAdminUser(member.id)}
                                                                title={member.id === user?.id ? '不能在这里删除自己的账号' : ''}
                                                            >
                                                                <FiTrash2 size={14} />
                                                                删除账户
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>

                            </div>
                        )}

                        {activeTab === 'audio' && (
                            <div style={{ maxWidth: '540px' }}>
                                {/* 输出设备 */}
                                <section style={{ marginBottom: '40px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <FiVolume2 size={16} color="#fff" />
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: '600' }}>输出设备</span>
                                    </div>

                                    <div style={{
                                        ...sectionCardStyle
                                    }}>
                                        <label style={sectionCaptionStyle}>扬声器 / 耳机</label>
                                        <select
                                            value={selectedAudioOutput || ''}
                                            onChange={(e) => setOutputDevice && setOutputDevice(e.target.value)}
                                            style={selectStyle}
                                        >
                                            {audioDevices.outputs.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>
                                                    {d.label || `扬声器 ${d.deviceId.slice(0, 8)}...`}
                                                </option>
                                            ))}
                                            {audioDevices.outputs.length === 0 && (
                                                <option disabled>浏览器不支持输出切换</option>
                                            )}
                                        </select>

                                        {audioDevices.outputs.length === 0 && (
                                            <p style={{
                                                marginTop: '12px',
                                                fontSize: '12px',
                                                color: '#fbbf24',
                                                lineHeight: '1.5'
                                            }}>
                                                ⚠️ 音频输出切换仅支持 Chrome / Edge
                                            </p>
                                        )}
                                    </div>
                                </section>

                                {/* 输入设备 */}
                                <section style={{ marginBottom: '40px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <FiMic size={16} color="#fff" />
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: '600' }}>输入设备</span>
                                    </div>

                                    <div style={{
                                        ...sectionCardStyle
                                    }}>
                                        <label style={sectionCaptionStyle}>麦克风</label>
                                        <select
                                            value={selectedAudioInput || ''}
                                            onChange={(e) => setSelectedAudioInput && setSelectedAudioInput(e.target.value)}
                                            style={selectStyle}
                                        >
                                            {audioDevices.inputs.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>
                                                    {d.label || `麦克风 ${d.deviceId.slice(0, 8)}...`}
                                                </option>
                                            ))}
                                            {audioDevices.inputs.length === 0 && (
                                                <option disabled>未检测到麦克风</option>
                                            )}
                                        </select>

                                        <MicVolumeMeter />

                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>麦克风增强</span>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                                        轻微放大发给他人的声音，并用温和限幅避免突然爆音。
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => setMicrophoneEnhancementEnabled && setMicrophoneEnhancementEnabled(!microphoneEnhancementEnabled)}
                                                    style={{
                                                        width: '48px',
                                                        height: '26px',
                                                        borderRadius: '13px',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: microphoneEnhancementEnabled
                                                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                                            : 'var(--border-moderate)',
                                                        position: 'relative',
                                                        transition: 'background 0.2s'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: '#fff',
                                                        position: 'absolute',
                                                        top: '3px',
                                                        left: microphoneEnhancementEnabled ? '25px' : '3px',
                                                        transition: 'left 0.2s'
                                                    }} />
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>轻度降噪</span>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                                        平滑压低持续底噪，不做强力 AI 处理，优先保护通话音质和低延迟。
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => setNoiseSuppressionEnabled && setNoiseSuppressionEnabled(!noiseSuppressionEnabled)}
                                                    style={{
                                                        width: '48px',
                                                        height: '26px',
                                                        borderRadius: '13px',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: noiseSuppressionEnabled
                                                            ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                                                            : 'var(--border-moderate)',
                                                        position: 'relative',
                                                        transition: 'background 0.2s'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '20px',
                                                        height: '20px',
                                                        borderRadius: '50%',
                                                        background: '#fff',
                                                        position: 'absolute',
                                                        top: '3px',
                                                        left: noiseSuppressionEnabled ? '25px' : '3px',
                                                        transition: 'left 0.2s'
                                                    }} />
                                                </button>
                                            </div>

                                            {noiseSuppressionEnabled && (
                                                <div style={{ marginTop: '16px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>降噪强度</label>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                                            {noiseSuppressionStrength < 30 ? '轻柔' : noiseSuppressionStrength < 70 ? '均衡' : '强力'}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        value={noiseSuppressionStrength}
                                                        onChange={(e) => setNoiseSuppressionStrength(Number(e.target.value))}
                                                        style={{ width: '100%', accentColor: '#06b6d4' }}
                                                    />
                                                    <p style={helperTextStyle}>
                                                        如果声音发闷或尾音被吃掉，把强度调低；如果风扇声明显，再逐步提高。
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <p style={{ ...helperTextStyle, marginTop: '12px', fontSize: '12px' }}>
                                            💡 确保浏览器已授予麦克风访问权限
                                        </p>
                                    </div>
                                </section>

                                <section style={{ marginBottom: '40px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <FiHeadphones size={16} color="#fff" />
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: '600' }}>耳返测试</span>
                                    </div>

                                    <div style={{
                                        ...sectionCardStyle
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>开启耳返</span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    将你的麦克风实时回放到当前输出设备，方便确认输入是否正常。
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => setSelfMonitorEnabled && setSelfMonitorEnabled(!selfMonitorEnabled)}
                                                style={{
                                                    width: '48px',
                                                    height: '26px',
                                                    borderRadius: '13px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: selfMonitorEnabled
                                                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                                        : 'var(--border-moderate)',
                                                    position: 'relative',
                                                    transition: 'background 0.2s'
                                                }}
                                            >
                                                <div style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '50%',
                                                    background: '#fff',
                                                    position: 'absolute',
                                                    top: '3px',
                                                    left: selfMonitorEnabled ? '25px' : '3px',
                                                    transition: 'left 0.2s'
                                                }} />
                                            </button>
                                        </div>

                                        {selfMonitorEnabled && (
                                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>耳返音量</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selfMonitorVolume}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={selfMonitorVolume}
                                                    onChange={(e) => setSelfMonitorVolume && setSelfMonitorVolume(Number(e.target.value))}
                                                    style={{ width: '100%', accentColor: '#f59e0b' }}
                                                />
                                                <p style={helperTextStyle}>
                                                    建议佩戴耳机测试，避免外放啸叫。如果打开后能听到自己，说明麦克风输入链路基本正常。
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section style={{ marginTop: '32px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <FiCommand size={16} color="#fff" />
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: '600' }}>按键说话</span>
                                    </div>

                                    <div style={{
                                        ...sectionCardStyle
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>启用按键说话</span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                                    开启后默认不发送声音，按住指定按键才开麦。{isDesktop ? '桌面端会使用全局按键监听。' : '浏览器失焦时会自动松开，避免卡住开麦。'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => setPushToTalkEnabled && setPushToTalkEnabled(!pushToTalkEnabled)}
                                                style={{
                                                    width: '48px',
                                                    height: '26px',
                                                    borderRadius: '13px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: pushToTalkEnabled
                                                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                                        : 'var(--border-moderate)',
                                                    position: 'relative',
                                                    transition: 'background 0.2s'
                                                }}
                                            >
                                                <div style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '50%',
                                                    background: '#fff',
                                                    position: 'absolute',
                                                    top: '3px',
                                                    left: pushToTalkEnabled ? '25px' : '3px',
                                                    transition: 'left 0.2s'
                                                }} />
                                            </button>
                                        </div>

                                        {pushToTalkEnabled && (
                                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
                                                    <div>
                                                        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>说话按键</label>
                                                        <p style={{ ...helperTextStyle, margin: 0 }}>
                                                            当前：按住 <strong style={{ color: 'var(--text-primary)' }}>{formatShortcutKey(pushToTalkKey)}</strong> 说话。
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary"
                                                        onClick={() => setIsCapturingPushToTalkKey(true)}
                                                    >
                                                        {isCapturingPushToTalkKey ? '按下任意键...' : '更换按键'}
                                                    </button>
                                                </div>
                                                <p style={{ ...helperTextStyle, marginTop: '12px' }}>
                                                    {isDesktop
                                                        ? '桌面端由主进程接管全局按键，在外部游戏或其他窗口中也会尝试生效；如果游戏以管理员权限运行，可能需要后续补管理员权限启动。'
                                                        : '如果是浏览器全屏，系统会尝试启用 Keyboard Lock 让快捷键更稳定；如果是外部原生游戏占用焦点，网页无法接收全局按键，需要桌面端或本地热键助手。'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* 语音感应 */}
                                <section style={{ marginTop: '32px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '20px'
                                    }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <FiZap size={16} color="#fff" />
                                        </div>
                                        <span style={{ fontSize: '15px', fontWeight: '600' }}>语音感应</span>
                                    </div>

                                    <div style={{
                                        ...sectionCardStyle
                                    }}>
                                        {/* 开关 */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                            <span style={{ fontSize: '14px' }}>启用语音感应</span>
                                            <button
                                                onClick={() => setVoiceActivationEnabled && setVoiceActivationEnabled(!voiceActivationEnabled)}
                                                style={{
                                                    width: '48px',
                                                    height: '26px',
                                                    borderRadius: '13px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: voiceActivationEnabled
                                                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                                        : 'var(--border-moderate)',
                                                    position: 'relative',
                                                    transition: 'background 0.2s'
                                                }}
                                            >
                                                <div style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '50%',
                                                    background: '#fff',
                                                    position: 'absolute',
                                                    top: '3px',
                                                    left: voiceActivationEnabled ? '25px' : '3px',
                                                    transition: 'left 0.2s'
                                                }} />
                                            </button>
                                        </div>

                                        {/* 阈值滑块 */}
                                        {voiceActivationEnabled && (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>触发阈值</label>
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{voiceActivationThreshold}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="5"
                                                    max="60"
                                                    value={voiceActivationThreshold}
                                                    onChange={(e) => setVoiceActivationThreshold && setVoiceActivationThreshold(Math.max(5, Math.min(60, Number(e.target.value))))}
                                                    style={{ width: '100%', accentColor: '#ec4899' }}
                                                />
                                                <div style={{ marginTop: '18px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>开麦灵敏度</label>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                                            {voiceActivationOpenSensitivity < 5 ? '保守' : voiceActivationOpenSensitivity < 10 ? '均衡' : '敏感'}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="12"
                                                        value={voiceActivationOpenSensitivity}
                                                        onChange={(e) => setVoiceActivationOpenSensitivity(Number(e.target.value))}
                                                        style={{ width: '100%', accentColor: '#f472b6' }}
                                                    />
                                                </div>
                                                <div style={{ marginTop: '18px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>闭麦延迟</label>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{voiceActivationReleaseDelay} ms</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="150"
                                                        max="1200"
                                                        step="10"
                                                        value={voiceActivationReleaseDelay}
                                                        onChange={(e) => setVoiceActivationReleaseDelay(Number(e.target.value))}
                                                        style={{ width: '100%', accentColor: '#fb7185' }}
                                                    />
                                                </div>
                                                <div style={{ marginTop: '18px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                        <label style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>噪声容忍度</label>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                                            {voiceActivationNoiseTolerance < 6 ? '低' : voiceActivationNoiseTolerance < 12 ? '中' : '高'}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="16"
                                                        value={voiceActivationNoiseTolerance}
                                                        onChange={(e) => setVoiceActivationNoiseTolerance(Number(e.target.value))}
                                                        style={{ width: '100%', accentColor: '#f97316' }}
                                                    />
                                                </div>
                                                <p style={{ ...helperTextStyle, marginTop: '12px', lineHeight: '1.6' }}>
                                                    开麦灵敏度越高，越容易触发；闭麦延迟越长，短停顿越不容易断；噪声容忍度越高，背景杂音越不容易误触发。
                                                </p>
                                                <VoiceActivationLiveLevel />
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SettingsModal;
