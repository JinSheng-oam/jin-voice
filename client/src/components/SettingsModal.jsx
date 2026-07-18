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
            className="settings-modal-overlay"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
                className="settings-modal"
            >
                {/* 侧边栏导航 - 手机端变成顶部横向tabs */}
                <div className="settings-modal__nav-shell">
                    {/* 标题 - 手机端隐藏 */}
                    {!isMobile && (
                        <h2 className="settings-modal__title" id="settings-title">设置</h2>
                    )}

                    <nav className="settings-modal__nav">
                        {menuItems.map(item => (
                            <React.Fragment key={item.id}>
                            <button
                                onClick={() => item.enabled && setActiveTab(item.id)}
                                disabled={!item.enabled}
                                className={`settings-modal__nav-item ${activeTab === item.id ? 'active' : ''}`}
                            >
                                <item.icon size={isMobile ? 16 : 18} />
                                {/* 手机端显示短标签 */}
                                <span>{item.label}</span>
                                {!item.enabled && !isMobile && (
                                    <span className="settings-modal__nav-badge">开发中</span>
                                )}
                                {item.enabled && !isMobile && (
                                    <FiChevronRight
                                        size={14}
                                        className="settings-modal__nav-chevron"
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
                        <div className="settings-modal__version">
                            JinVoice
                        </div>
                    )}
                </div>

                {/* 主内容区 */}
                <div className="settings-modal__content">
                    {/* 顶部栏 */}
                    <div className="settings-modal__header">
                        <div>
                            <h3>
                                {activeTab === 'audio' && '音频设置'}
                                {activeTab === 'appearance' && '界面外观'}
                                {activeTab === 'admin' && '成员管理'}
                                {activeTab === 'video' && '视频设置'}
                            </h3>
                            <p>
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
                            className="settings-modal__close"
                        >
                            <FiX size={20} />
                        </button>
                    </div>

                    {/* 滚动内容区 */}
                    <div className="settings-modal__body">
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
