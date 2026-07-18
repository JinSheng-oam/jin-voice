import React, { useContext } from 'react';
import { FiCommand, FiHeadphones, FiMic, FiVolume2, FiZap } from 'react-icons/fi';
import { SocketContext } from '../../SocketContext';
import useAudioStore from '../../stores/useAudioStore';
import { AUDIO_PROCESSING_MODES, getAudioProcessingModeLabel } from '../../lib/audioProcessing';
import SettingsSwitch from './SettingsSwitch';
import DropdownSelect from '../DropdownSelect';
import { helperTextStyle, sectionCaptionStyle, sectionCardStyle } from './settingsStyles';

const formatShortcutKey = (code = 'Space') => {
    if (code === 'Space') return '空格';
    if (code.startsWith('Key')) return code.slice(3).toUpperCase();
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return `小键盘 ${code.slice(6)}`;
    return code.replace('Arrow', '方向键 ').replace('Control', 'Ctrl ').replace('Escape', 'Esc')
        .replace('Backquote', '`').replace('Minus', '-').replace('Equal', '=')
        .replace('BracketLeft', '[').replace('BracketRight', ']').replace('Semicolon', ';')
        .replace('Quote', "'").replace('Comma', ',').replace('Period', '.')
        .replace('Slash', '/').replace('Backslash', '\\');
};

const MicVolumeMeter = () => {
    const micVolume = useAudioStore((state) => state.micVolume);
    return <div style={{ marginTop: '16px' }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>输入电平</span>
        <span style={{ fontSize: '12px', color: micVolume > 50 ? 'var(--success)' : 'var(--text-tertiary)' }}>{micVolume > 5 ? '🎤 检测到声音' : '🔇 静音中'}</span>
    </div><div style={{ height: '8px', borderRadius: '4px', background: 'var(--bg-modifier)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${micVolume}%`, borderRadius: '4px', background: micVolume < 30 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : micVolume < 70 ? 'linear-gradient(90deg, #22c55e, #facc15)' : 'linear-gradient(90deg, #facc15, #ef4444)', transition: 'width 0.1s ease-out' }} />
    </div></div>;
};

const VoiceActivationLiveLevel = () => {
    const micVolume = useAudioStore((state) => state.micVolume);
    const { voiceTransmissionState = 'live' } = useContext(SocketContext) || {};
    const label = voiceTransmissionState === 'manual-muted' ? '手动静音中' : voiceTransmissionState === 'push-to-talk-muted' ? '等待按键说话' : voiceTransmissionState === 'voice-gated' ? '语音感应闭麦' : '正常发送';
    const color = voiceTransmissionState === 'manual-muted' ? '#f59e0b' : voiceTransmissionState === 'push-to-talk-muted' ? '#38bdf8' : voiceTransmissionState === 'voice-gated' ? '#ec4899' : 'var(--success)';
    return <div style={{ marginTop: '8px' }}><p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px', marginBottom: '6px' }}>当前音量: {micVolume} | 阈值越低越灵敏</p><p style={{ fontSize: '11px', color, margin: 0 }}>当前发送状态：{label}</p></div>;
};

const AudioSettingsSection = ({ model }) => {
    const { audioDevices, audioProcessingMode, audioProcessingStatus, desktopDiagnostics,
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
        voiceActivationReleaseDelay, voiceActivationThreshold } = model;
    return (
        <div style={{ maxWidth: '540px', margin: '0 auto' }}>
                                {/* 输出设备 */}
                                <section id="audio-output" style={{ marginBottom: '40px' }}>
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
                                        <DropdownSelect
                                            value={selectedAudioOutput || ''}
                                            onChange={(val) => setOutputDevice && setOutputDevice(val)}
                                            options={audioDevices.outputs.length > 0 ? audioDevices.outputs.map(d => ({
                                                value: d.deviceId,
                                                label: d.label || `扬声器 ${d.deviceId.slice(0, 8)}...`
                                            })) : [{ value: '', label: '浏览器不支持输出切换', disabled: true }]}
                                        />

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
                                <section id="audio-input" style={{ marginBottom: '40px' }}>
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
                                        <DropdownSelect
                                            value={selectedAudioInput || ''}
                                            onChange={(val) => setSelectedAudioInput && setSelectedAudioInput(val)}
                                            options={audioDevices.inputs.length > 0 ? audioDevices.inputs.map(d => ({
                                                value: d.deviceId,
                                                label: d.label || `麦克风 ${d.deviceId.slice(0, 8)}...`
                                            })) : [{ value: '', label: '未检测到麦克风', disabled: true }]}
                                        />

                                        <MicVolumeMeter />

                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                            <span style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>当前处理路径</span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                                {`${getAudioProcessingModeLabel(audioProcessingMode)}${microphoneEnhancementEnabled ? ' + 麦克风增强' : ''}；耳返和对方听到的声音走同一发送轨道。`}
                                            </span>
                                        </div>

                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                            <label style={sectionCaptionStyle}>音频处理模式</label>
                                            <DropdownSelect
                                                value={audioProcessingMode}
                                                onChange={(val) => setAudioProcessingMode(val)}
                                                options={[
                                                    { value: AUDIO_PROCESSING_MODES.STANDARD, label: '标准降噪（推荐）' },
                                                    { value: AUDIO_PROCESSING_MODES.AI, label: 'AI 降噪（RNNoise）' },
                                                    { value: AUDIO_PROCESSING_MODES.RAW, label: '原始输入' }
                                                ]}
                                            />
                                            <p style={helperTextStyle}>
                                                {audioProcessingMode === AUDIO_PROCESSING_MODES.AI
                                                    ? '关闭浏览器降噪和自动增益，使用本地 RNNoise；不支持时会自动回退到标准模式。'
                                                    : audioProcessingMode === AUDIO_PROCESSING_MODES.RAW
                                                        ? '关闭回声消除、降噪和自动增益，适合已由硬件处理的专业麦克风。'
                                                        : '使用浏览器的回声消除、降噪和自动增益，兼容性最好。'}
                                            </p>
                                            <div style={{
                                                marginTop: '10px',
                                                padding: '10px 12px',
                                                borderRadius: '10px',
                                                background: audioProcessingStatus?.status === 'fallback' || audioProcessingStatus?.status === 'error'
                                                    ? 'color-mix(in srgb, var(--warning) 8%, transparent)'
                                                    : 'color-mix(in srgb, var(--primary) 6%, transparent)',
                                                border: audioProcessingStatus?.status === 'fallback' || audioProcessingStatus?.status === 'error'
                                                    ? '1px solid color-mix(in srgb, var(--warning) 15%, transparent)'
                                                    : '1px solid color-mix(in srgb, var(--primary) 15%, transparent)',
                                                color: 'var(--text-secondary)',
                                                fontSize: '12px',
                                                lineHeight: '1.55'
                                            }}>
                                                <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: '2px' }}>
                                                    {audioProcessingStatus?.status === 'loading'
                                                        ? 'AI 模块加载中'
                                                        : audioProcessingStatus?.status === 'active'
                                                            ? `已生效：${getAudioProcessingModeLabel(audioProcessingStatus.effectiveMode)}`
                                                            : audioProcessingStatus?.status === 'fallback'
                                                                ? `已降级：${getAudioProcessingModeLabel(audioProcessingStatus.effectiveMode)}`
                                                                : audioProcessingStatus?.status === 'error'
                                                                    ? '音频处理异常'
                                                                    : '等待音频会话'}
                                                </strong>
                                                {audioProcessingStatus?.fallbackReason || audioProcessingStatus?.lastError ||
                                                    (audioProcessingStatus?.status === 'active'
                                                        ? '当前发送链路已使用该处理模式。'
                                                        : '进入语音房间后会显示实际生效模式。')}
                                            </div>
                                        </div>


                                                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{ fontSize: '14px', fontWeight: '500', display: 'block', marginBottom: '4px' }}>麦克风增强</span>
                                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                                                轻微放大发给他人的声音，并用温和限幅避免突然爆音。
                                                            </span>
                                                        </div>
                                                        <SettingsSwitch
                                                            label="麦克风增强"
                                                            checked={microphoneEnhancementEnabled}
                                                            onChange={setMicrophoneEnhancementEnabled}
                                                        />
                                                    </div>
                                                </div>

                                        <p style={{ ...helperTextStyle, marginTop: '12px', fontSize: '12px' }}>
                                            💡 确保浏览器已授予麦克风访问权限
                                        </p>
                                    </div>
                                </section>

                                <section id="audio-loopback" style={{ marginBottom: '40px' }}>
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
                                            <SettingsSwitch
                                                label="耳返"
                                                checked={selfMonitorEnabled}
                                                onChange={setSelfMonitorEnabled}
                                            />
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
                                                    style={{ width: '100%', '--slider-color': '#f59e0b' }}
                                                    className="settings-range-input"
                                                />
                                                <p style={helperTextStyle}>
                                                    建议佩戴耳机测试，避免外放啸叫。如果打开后能听到自己，说明麦克风输入链路基本正常。
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section id="audio-ptt" style={{ marginBottom: '40px' }}>
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
                                            <SettingsSwitch
                                                label="按键说话"
                                                checked={pushToTalkEnabled}
                                                onChange={setPushToTalkEnabled}
                                            />
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
                                <section id="audio-voice" style={{ marginBottom: '40px' }}>
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
                                            <SettingsSwitch
                                                label="语音感应"
                                                checked={voiceActivationEnabled}
                                                onChange={setVoiceActivationEnabled}
                                            />
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
                                                    style={{ width: '100%', '--slider-color': '#ec4899' }}
                                                    className="settings-range-input"
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
                                                        style={{ width: '100%', '--slider-color': '#f472b6' }}
                                                        className="settings-range-input"
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
                                                        style={{ width: '100%', '--slider-color': '#fb7185' }}
                                                        className="settings-range-input"
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
                                                        style={{ width: '100%', '--slider-color': '#f97316' }}
                                                        className="settings-range-input"
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

                                {isDesktop && (
                                    <div style={{
                                        marginTop: '40px',
                                        padding: '16px',
                                        borderRadius: '12px',
                                        background: 'var(--bg-subtle-panel-hover)',
                                        display: 'grid',
                                        gap: '8px',
                                        fontSize: '12px',
                                        color: 'var(--text-muted)'
                                    }}>
                                        <div style={{ fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>客户端环境诊断</div>
                                        <span>桌面端：{desktopDiagnostics?.platform || desktopPlatform}</span>
                                        <span>服务器：{desktopDiagnostics?.serverUrl || desktopServerUrl}</span>
                                        <span>
                                            全局按键：{pushToTalkEnabled
                                                ? `已启用，当前 ${formatShortcutKey(desktopDiagnostics?.pushToTalk?.accelerator || pushToTalkKey)}`
                                                : '未启用'}
                                        </span>
                                        <span>
                                            热键监听：{desktopDiagnostics?.pushToTalk?.listenerReady
                                                ? '正常'
                                                : desktopDiagnostics?.pushToTalk?.listenerActive
                                                    ? '启动中'
                                                    : '未启动'}
                                            {desktopDiagnostics?.pushToTalk?.lastError ? `，错误：${desktopDiagnostics.pushToTalk.lastError}` : ''}
                                        </span>
                                        <span>麦克风权限：{desktopDiagnostics?.mediaPermission || (audioDevices.inputs.length > 0 ? '已检测到输入设备' : '等待授权或未检测到设备')}</span>
                                        {desktopDiagnostics?.ok === false && (
                                            <span style={{ color: '#f59e0b' }}>诊断读取失败：{desktopDiagnostics.error}</span>
                                        )}
                                    </div>
                                )}
                            </div>
    );
};

export default AudioSettingsSection;
