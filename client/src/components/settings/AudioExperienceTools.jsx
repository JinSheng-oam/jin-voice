import React, { useEffect, useRef, useState } from 'react';
import { FiActivity, FiCheck, FiRadio, FiSliders, FiVolume2 } from 'react-icons/fi';
import useAudioStore from '../../stores/useAudioStore';
import { AUDIO_PRESETS } from '../../lib/audioPresets';
import { calculateVoiceCalibration } from '../../lib/audioCalibration';
import { playOutputTestTone, startOpusLoopback } from '../../lib/audioTestTools';
import { recordClientMetric } from '../../lib/telemetry';
import { sectionCardStyle } from './settingsStyles';

const wait = (durationMs) => new Promise((resolve) => window.setTimeout(resolve, durationMs));

const collectLevels = async (durationMs) => {
    const values = [];
    const intervalId = window.setInterval(() => {
        values.push(useAudioStore.getState().micVolume);
    }, 100);
    await wait(durationMs);
    window.clearInterval(intervalId);
    return values;
};

const qualityCopy = {
    idle: { label: '等待房间成员', detail: '入房后会自动监测远端语音质量。', tone: 'neutral' },
    good: { label: '语音稳定', detail: '当前抖动与补偿处于正常范围。', tone: 'good' },
    fair: { label: '网络波动', detail: '正在调整缓冲和发送码率。', tone: 'warning' },
    poor: { label: '声音可能断续', detail: '检测到较高抖动或音频补偿。', tone: 'danger' }
};

const AudioExperienceTools = ({ stream, selectedAudioOutput, audioQuality, audioDeviceNotice }) => {
    const audioPreset = useAudioStore((state) => state.audioPreset);
    const applyAudioPreset = useAudioStore((state) => state.applyAudioPreset);
    const applyVoiceCalibration = useAudioStore((state) => state.applyVoiceCalibration);
    const setAudioDeviceNotice = useAudioStore((state) => state.setAudioDeviceNotice);
    const [calibrationPhase, setCalibrationPhase] = useState('idle');
    const [calibrationMessage, setCalibrationMessage] = useState('');
    const [tonePlaying, setTonePlaying] = useState(false);
    const [loopbackState, setLoopbackState] = useState('idle');
    const [testError, setTestError] = useState('');
    const loopbackRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            loopbackRef.current?.stop?.();
            loopbackRef.current = null;
        };
    }, []);

    const runCalibration = async () => {
        if (calibrationPhase !== 'idle') return;
        setCalibrationMessage('');
        setCalibrationPhase('noise');
        try {
            const noiseSamples = await collectLevels(2000);
            if (!mountedRef.current) return;
            setCalibrationPhase('voice');
            const voiceSamples = await collectLevels(3000);
            if (!mountedRef.current) return;
            const result = calculateVoiceCalibration({ noiseSamples, voiceSamples });
            applyVoiceCalibration(result);
            recordClientMetric('audio_calibration_completed', 5000);
            setCalibrationMessage(`已校准：环境 ${result.noiseFloor}，人声 ${result.voiceLevel}`);
        } catch (error) {
            setCalibrationMessage(error?.message || '校准失败，请重试');
        } finally {
            if (mountedRef.current) setCalibrationPhase('idle');
        }
    };

    const playTone = async () => {
        if (tonePlaying) return;
        setTestError('');
        setTonePlaying(true);
        try {
            await playOutputTestTone({ sinkId: selectedAudioOutput });
        } catch (error) {
            setTestError(error?.message || '无法播放测试音');
        } finally {
            if (mountedRef.current) setTonePlaying(false);
        }
    };

    const toggleLoopback = async () => {
        setTestError('');
        if (loopbackRef.current) {
            loopbackRef.current.stop();
            loopbackRef.current = null;
            setLoopbackState('idle');
            return;
        }
        setLoopbackState('starting');
        try {
            loopbackRef.current = await startOpusLoopback({ stream, sinkId: selectedAudioOutput });
            if (mountedRef.current) setLoopbackState('active');
        } catch (error) {
            setTestError(error?.message || '编码听感测试启动失败');
            if (mountedRef.current) setLoopbackState('idle');
        }
    };

    const currentQuality = qualityCopy[audioQuality?.level] || qualityCopy.idle;

    return (
        <>
            <section className="audio-experience-section">
                <div className="audio-experience-heading">
                    <span className="audio-experience-heading__icon"><FiSliders size={16} /></span>
                    <div><strong>开黑语音预设</strong><span>先选目标，再按需要展开高级参数。</span></div>
                </div>
                <div className="audio-preset-grid">
                    {Object.values(AUDIO_PRESETS).map((preset) => (
                        <button
                            key={preset.id}
                            type="button"
                            className={`audio-preset-card ${audioPreset === preset.id ? 'is-active' : ''}`}
                            onClick={() => applyAudioPreset(preset.id)}
                        >
                            <span><strong>{preset.label}</strong>{audioPreset === preset.id && <FiCheck size={14} />}</span>
                            <small>{preset.description}</small>
                        </button>
                    ))}
                </div>
            </section>

            <section className="audio-experience-section">
                <div className="audio-experience-heading">
                    <span className="audio-experience-heading__icon is-teal"><FiActivity size={16} /></span>
                    <div><strong>快速校准与测试</strong><span>设置页会启动本地预览，不会向房间发送声音。</span></div>
                </div>
                <div style={sectionCardStyle} className="audio-test-card">
                    {audioDeviceNotice && (
                        <div className="audio-device-notice" role="status">
                            <span>{audioDeviceNotice.message}</span>
                            <button type="button" onClick={() => setAudioDeviceNotice(null)}>知道了</button>
                        </div>
                    )}
                    <div className="audio-test-actions">
                        <button type="button" className="btn btn-secondary" onClick={playTone} disabled={tonePlaying}>
                            <FiVolume2 size={15} />{tonePlaying ? '播放中…' : '播放输出测试音'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={toggleLoopback} disabled={!stream || loopbackState === 'starting'}>
                            <FiRadio size={15} />{loopbackState === 'active' ? '停止编码听感' : loopbackState === 'starting' ? '启动中…' : 'Opus 编码听感'}
                        </button>
                        <button type="button" className="btn btn-primary" onClick={runCalibration} disabled={!stream || calibrationPhase !== 'idle'}>
                            <FiActivity size={15} />
                            {calibrationPhase === 'noise' ? '保持安静 2 秒…' : calibrationPhase === 'voice' ? '连续说话 3 秒…' : '自动校准语音感应'}
                        </button>
                    </div>
                    <p className="audio-test-description">编码听感会在本机经过一次 Opus 编解码，不会发送到房间成员；自动校准会先测环境声，再测人声。</p>
                    {(calibrationMessage || testError) && <p className={testError ? 'audio-test-message is-error' : 'audio-test-message'}>{testError || calibrationMessage}</p>}
                </div>
            </section>

            <section className="audio-experience-section">
                <div className={`audio-quality-summary is-${currentQuality.tone}`}>
                    <span className="audio-quality-summary__dot" />
                    <div><strong>{currentQuality.label}</strong><span>{currentQuality.detail}</span></div>
                    {audioQuality?.level !== 'idle' && <small>{Math.round(audioQuality.jitterMs || 0)} ms 抖动 · {((audioQuality.concealmentRate || 0) * 100).toFixed(1)}% 补偿</small>}
                </div>
            </section>
        </>
    );
};

export default AudioExperienceTools;
