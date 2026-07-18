import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SocketContext } from '../SocketContext';
import useAudioStore from '../stores/useAudioStore';
import useUIStore from '../stores/useUIStore';
import { useAuth } from '../useAuth';
import { apiRequest } from '../lib/apiClient';
import { useShallow } from 'zustand/react/shallow';
import { showConfirm } from '../stores/useDialogStore';
import AdminUsersSection from './settings/AdminUsersSection';
import AppearanceSettingsSection from './settings/AppearanceSettingsSection';
import AudioSettingsSection from './settings/AudioSettingsSection';
import { sectionCardStyle } from './settings/settingsStyles';
import { FiX, FiMic, FiMonitor, FiChevronRight, FiShield } from 'react-icons/fi';

const SettingsModal = ({ onClose }) => {
    const {
        audioProcessingStatus,
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
        audioProcessingMode,
        setAudioProcessingMode,
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
        audioProcessingMode: state.audioProcessingMode,
        setAudioProcessingMode: state.setAudioProcessingMode,
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
    const [desktopDiagnostics, setDesktopDiagnostics] = useState(null);
    const desktopPlatform = window.jinvoiceDesktop?.platform || 'web';
    const desktopServerUrl = window.jinvoiceDesktop?.serverUrl || 'browser';

    const scrollToSection = (id) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    useEffect(() => {
        if (!isDesktop || typeof window.jinvoiceDesktop?.getDiagnostics !== 'function') {
            return undefined;
        }

        let cancelled = false;
        const loadDesktopDiagnostics = async () => {
            try {
                const diagnostics = await window.jinvoiceDesktop.getDiagnostics();
                if (!cancelled) {
                    setDesktopDiagnostics(diagnostics);
                }
            } catch (error) {
                if (!cancelled) {
                    setDesktopDiagnostics({
                        ok: false,
                        error: error?.message || '桌面端诊断读取失败'
                    });
                }
            }
        };

        void loadDesktopDiagnostics();
        const intervalId = window.setInterval(loadDesktopDiagnostics, 3000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [isDesktop]);

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
            role="presentation"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.25)', // A neutral dark tint works best for both light and dark modes when blurred
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                animation: 'fadeIn 0.12s ease-out',
                willChange: 'opacity'
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
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
                            color: 'var(--text-primary)'
                        }} id="settings-title">设置</h2>
                    )}

                    <nav style={{
                        flex: isMobile ? 'none' : 1,
                        display: 'flex',
                        flexDirection: isMobile ? 'row' : 'column',
                        gap: isMobile ? '4px' : '0'
                    }}>
                        {menuItems.map(item => (
                            <React.Fragment key={item.id}>
                            <button
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
                                {item.enabled && !isMobile && (
                                    <FiChevronRight
                                        size={14}
                                        style={{
                                            opacity: activeTab === item.id ? 0.8 : 0.4,
                                            transform: activeTab === item.id ? 'rotate(90deg)' : 'none',
                                            transition: 'transform 0.2s ease'
                                        }}
                                    />
                                )}
                            </button>
                            {item.id === 'audio' && activeTab === 'audio' && !isMobile && (
                                <div className="settings-modal__sub-nav">
                                    <button className="settings-modal__sub-nav-item" onClick={() => scrollToSection('audio-output')}>输出设备</button>
                                    <button className="settings-modal__sub-nav-item" onClick={() => scrollToSection('audio-input')}>输入设备</button>
                                    <button className="settings-modal__sub-nav-item" onClick={() => scrollToSection('audio-loopback')}>耳返测试</button>
                                    <button className="settings-modal__sub-nav-item" onClick={() => scrollToSection('audio-ptt')}>按键说话</button>
                                    <button className="settings-modal__sub-nav-item" onClick={() => scrollToSection('audio-voice')}>语音感应</button>
                                </div>
                            )}
                            {item.id === 'appearance' && activeTab === 'appearance' && !isMobile && (
                                <div className="settings-modal__sub-nav">
                                    <button className="settings-modal__sub-nav-item" onClick={() => scrollToSection('appearance-theme')}>主题设置</button>
                                    {isAdmin && <button className="settings-modal__sub-nav-item" onClick={() => scrollToSection('appearance-background')}>站点背景</button>}
                                </div>
                            )}
                            </React.Fragment>
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
                            JinVoice
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
                            type="button"
                            onClick={onClose}
                            aria-label="关闭设置"
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
                            <AppearanceSettingsSection model={{
                                backgroundOptions, isAdmin, saveSiteAppearance, setTheme, siteAppearanceDraft,
                                siteAppearanceSaving, theme, updateSiteAppearanceDraft
                            }} />
                        )}

                        {activeTab === 'admin' && isAdmin && (
                            <AdminUsersSection model={{
                                adminError, adminLoading, adminSavingId, adminUsers, deleteAdminUser,
                                loadAdminUsers, updateAdminUser, user
                            }} />
                        )}

                        {activeTab === 'audio' && (
                            <AudioSettingsSection model={{
                                audioDevices, audioProcessingMode, audioProcessingStatus, desktopDiagnostics,
                                desktopPlatform, desktopServerUrl,
                                isCapturingPushToTalkKey, isDesktop, microphoneEnhancementEnabled, pushToTalkEnabled,
                                pushToTalkKey, selectedAudioInput, selectedAudioOutput, selfMonitorEnabled,
                                selfMonitorVolume, setAudioProcessingMode, setIsCapturingPushToTalkKey,
                                setMicrophoneEnhancementEnabled, setOutputDevice, setPushToTalkEnabled,
                                setSelectedAudioInput, setSelfMonitorEnabled, setSelfMonitorVolume,
                                setVoiceActivationEnabled, setVoiceActivationNoiseTolerance,
                                setVoiceActivationOpenSensitivity, setVoiceActivationReleaseDelay,
                                setVoiceActivationThreshold, voiceActivationEnabled,
                                voiceActivationNoiseTolerance, voiceActivationOpenSensitivity,
                                voiceActivationReleaseDelay, voiceActivationThreshold
                            }} />
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
