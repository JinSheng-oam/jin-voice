import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCheck, FiHeadphones, FiMic, FiMicOff, FiShield, FiX } from 'react-icons/fi';
import DropdownSelect from './DropdownSelect';
import useAudioStore from '../stores/useAudioStore';
import { useShallow } from 'zustand/react/shallow';
import { enumerateAudioDevices } from '../lib/audioDevices';
import {
    AUDIO_PROCESSING_MODES,
    getAudioProcessingModeLabel
} from '../lib/audioProcessing';
import { startPreJoinMicCheck } from '../lib/preJoinAudio';

const PreJoinModal = ({ roomName, actionLabel = '加入房间', isSubmitting = false, onCancel, onConfirm }) => {
    const {
        audioDevices,
        setAudioDevices,
        selectedAudioInput,
        setSelectedAudioInput,
        selectedAudioOutput,
        setSelectedAudioOutput,
        audioProcessingMode,
        setAudioProcessingMode
    } = useAudioStore(useShallow((state) => ({
        audioDevices: state.audioDevices,
        setAudioDevices: state.setAudioDevices,
        selectedAudioInput: state.selectedAudioInput,
        setSelectedAudioInput: state.setSelectedAudioInput,
        selectedAudioOutput: state.selectedAudioOutput,
        setSelectedAudioOutput: state.setSelectedAudioOutput,
        audioProcessingMode: state.audioProcessingMode,
        setAudioProcessingMode: state.setAudioProcessingMode
    })));

    const [joinMuted, setJoinMuted] = useState(true);
    const [micState, setMicState] = useState('idle');
    const [micError, setMicError] = useState('');
    const [micLevel, setMicLevel] = useState(0);
    const micCheckControllerRef = useRef(null);
    const micCheckVersionRef = useRef(0);

    const stopMicCheck = useCallback(() => {
        micCheckVersionRef.current += 1;
        micCheckControllerRef.current?.stop();
        micCheckControllerRef.current = null;
        setMicLevel(0);
        setMicState('idle');
    }, []);

    const refreshDevices = useCallback(async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        try {
            const devices = await enumerateAudioDevices();
            setAudioDevices(devices);
            if (!selectedAudioInput && devices.inputs[0]) {
                setSelectedAudioInput(devices.inputs[0].deviceId);
            }
            if (!selectedAudioOutput && devices.outputs[0]) {
                setSelectedAudioOutput(devices.outputs[0].deviceId);
            }
        } catch {
            // Device labels can remain unavailable until microphone permission is granted.
        }
    }, [
        selectedAudioInput,
        selectedAudioOutput,
        setAudioDevices,
        setSelectedAudioInput,
        setSelectedAudioOutput
    ]);

    useEffect(() => {
        void refreshDevices();
        navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
        return () => {
            navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
            micCheckVersionRef.current += 1;
            micCheckControllerRef.current?.stop();
            micCheckControllerRef.current = null;
        };
    }, [refreshDevices]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !isSubmitting) onCancel?.();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSubmitting, onCancel]);

    const startMicCheck = async () => {
        stopMicCheck();
        const checkVersion = micCheckVersionRef.current;
        setMicState('requesting');
        setMicError('');

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const controller = await startPreJoinMicCheck({
                mediaDevices: navigator.mediaDevices,
                AudioContextClass,
                deviceId: selectedAudioInput,
                audioProcessingMode,
                onLevel: setMicLevel
            });

            if (checkVersion !== micCheckVersionRef.current) {
                controller.stop();
                return;
            }

            micCheckControllerRef.current = controller;
            if (controller.activeDeviceId) setSelectedAudioInput(controller.activeDeviceId);
            await refreshDevices();
            setMicState('ready');
        } catch (error) {
            if (checkVersion !== micCheckVersionRef.current) return;
            setMicState('error');
            setMicError(error?.name === 'NotAllowedError'
                ? '没有获得麦克风权限。你仍可静音加入，之后再到浏览器权限中开启。'
                : '无法测试当前麦克风，请检查设备是否被其他应用占用。');
        }
    };

    const handleInputChange = (val) => {
        stopMicCheck();
        setSelectedAudioInput(val);
    };

    return (
        <div className="prejoin-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSubmitting) onCancel?.();
        }}>
            <section
                className="prejoin-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="prejoin-title"
                aria-describedby="prejoin-description"
            >
                <header className="prejoin-header">
                    <div>
                        <span className="prejoin-kicker"><FiShield size={14} /> 入房检查</span>
                        <h2 id="prejoin-title">准备加入「{roomName || '语音房间'}」</h2>
                        <p id="prejoin-description">确认设备和发送状态。默认静音加入，不会在未经确认时发送声音。</p>
                    </div>
                    <button type="button" className="btn btn-ghost btn-icon" onClick={onCancel} disabled={isSubmitting} aria-label="关闭入房检查">
                        <FiX size={19} />
                    </button>
                </header>

                <div className="prejoin-device-grid">
                    <label className="prejoin-field">
                        <span><FiMic size={15} /> 输入设备</span>
                        <DropdownSelect
                            value={selectedAudioInput}
                            onChange={handleInputChange}
                            options={[
                                { value: '', label: '系统默认麦克风' },
                                ...audioDevices.inputs.map((device, index) => ({
                                    value: device.deviceId,
                                    label: device.label || `麦克风 ${index + 1}`
                                }))
                            ]}
                        />
                    </label>

                    <label className="prejoin-field">
                        <span><FiHeadphones size={15} /> 输出设备</span>
                        <DropdownSelect
                            value={selectedAudioOutput}
                            onChange={(val) => setSelectedAudioOutput(val)}
                            options={[
                                { value: '', label: '系统默认扬声器' },
                                ...audioDevices.outputs.map((device, index) => ({
                                    value: device.deviceId,
                                    label: device.label || `扬声器 ${index + 1}`
                                }))
                            ]}
                        />
                    </label>
                </div>

                <div className="prejoin-check-row">
                    <div className="prejoin-meter" aria-label={`麦克风测试电平 ${micLevel}%`}>
                        <div className="prejoin-meter__track"><span style={{ width: `${micLevel}%` }} /></div>
                        <span>{micState === 'ready' ? (micLevel > 4 ? '检测到声音' : '请说句话测试') : '尚未测试麦克风'}</span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={micState === 'ready' ? stopMicCheck : startMicCheck} disabled={micState === 'requesting'}>
                        <FiMic size={15} />
                        {micState === 'requesting' ? '正在请求权限...' : micState === 'ready' ? '停止测试' : '测试麦克风'}
                    </button>
                </div>
                {micError && <p className="prejoin-error" role="alert">{micError}</p>}

                <label className="prejoin-field">
                    <span>降噪模式</span>
                    <DropdownSelect
                        value={audioProcessingMode}
                        onChange={(val) => setAudioProcessingMode(val)}
                        options={[
                            { value: AUDIO_PROCESSING_MODES.STANDARD, label: '标准降噪（推荐）' },
                            { value: AUDIO_PROCESSING_MODES.AI, label: 'AI 降噪（RNNoise）' },
                            { value: AUDIO_PROCESSING_MODES.RAW, label: '原始输入' }
                        ]}
                    />
                    <small>当前选择：{getAudioProcessingModeLabel(audioProcessingMode)}。AI 模式不可用时会自动回退。</small>
                </label>

                <button
                    type="button"
                    className={`prejoin-mute-choice ${joinMuted ? 'selected' : ''}`}
                    role="switch"
                    aria-checked={joinMuted}
                    onClick={() => setJoinMuted((current) => !current)}
                >
                    <span className="prejoin-mute-choice__icon">{joinMuted ? <FiMicOff size={20} /> : <FiMic size={20} />}</span>
                    <span>
                        <strong>{joinMuted ? '静音加入' : '开麦加入'}</strong>
                        <small>{joinMuted ? '进入房间后再手动开麦' : '加入成功后立即发送麦克风声音'}</small>
                    </span>
                    {joinMuted && <FiCheck className="prejoin-mute-choice__check" size={18} />}
                </button>

                <footer className="prejoin-actions">
                    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSubmitting}>取消</button>
                    <button type="button" className={`btn btn-primary ${isSubmitting ? 'is-busy' : ''}`} onClick={() => onConfirm?.({ joinMuted })} disabled={isSubmitting} aria-busy={isSubmitting}>
                        {isSubmitting ? '正在进入...' : actionLabel}
                    </button>
                </footer>
            </section>
        </div>
    );
};

export default PreJoinModal;
