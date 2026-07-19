import { describe, test, expect, beforeEach } from 'vitest';
import useAudioStore from '../useAudioStore';
import { AUDIO_PROCESSING_MODES } from '../../lib/audioProcessing';

beforeEach(() => {
    useAudioStore.setState({
        audioDevices: { inputs: [], outputs: [] },
        audioPreviewRequested: false,
        audioDeviceNotice: null,
        selectedAudioInput: '',
        selectedAudioOutput: '',
        micVolume: 0,
        microphoneEnhancementEnabled: false,
        audioProcessingMode: AUDIO_PROCESSING_MODES.STANDARD,
        audioPreset: 'gaming',
        voiceActivationEnabled: false,
        voiceActivationThreshold: 15,
        voiceActivationOpenSensitivity: 6,
        voiceActivationReleaseDelay: 520,
        voiceActivationNoiseTolerance: 8,
        selfMonitorEnabled: false,
        selfMonitorVolume: 100,
        userVolumes: {},
        isMuted: false,
        isDeafened: false
    });
});

describe('设备选择', () => {
    test('setSelectedAudioInput 设置输入设备', () => {
        useAudioStore.getState().setSelectedAudioInput('mic-1');
        expect(useAudioStore.getState().selectedAudioInput).toBe('mic-1');
    });

    test('setSelectedAudioOutput 设置输出设备', () => {
        useAudioStore.getState().setSelectedAudioOutput('speaker-1');
        expect(useAudioStore.getState().selectedAudioOutput).toBe('speaker-1');
    });

    test('setAudioDevices 设置设备列表', () => {
        const devices = { inputs: [{ id: 'a' }], outputs: [{ id: 'b' }] };
        useAudioStore.getState().setAudioDevices(devices);
        expect(useAudioStore.getState().audioDevices).toEqual(devices);
    });
});

describe('静音与耳聋', () => {
    test('toggleMute 切换静音状态', () => {
        expect(useAudioStore.getState().isMuted).toBe(false);
        useAudioStore.getState().toggleMute();
        expect(useAudioStore.getState().isMuted).toBe(true);
        useAudioStore.getState().toggleMute();
        expect(useAudioStore.getState().isMuted).toBe(false);
    });

    test('toggleDeafen 切换耳聋状态', () => {
        expect(useAudioStore.getState().isDeafened).toBe(false);
        useAudioStore.getState().toggleDeafen();
        expect(useAudioStore.getState().isDeafened).toBe(true);
        useAudioStore.getState().toggleDeafen();
        expect(useAudioStore.getState().isDeafened).toBe(false);
    });
});

describe('麦克风增强', () => {
    test('setMicrophoneEnhancementEnabled 开关', () => {
        useAudioStore.getState().setMicrophoneEnhancementEnabled(true);
        expect(useAudioStore.getState().microphoneEnhancementEnabled).toBe(true);
        useAudioStore.getState().setMicrophoneEnhancementEnabled(false);
        expect(useAudioStore.getState().microphoneEnhancementEnabled).toBe(false);
    });
});

describe('音频处理模式', () => {
    test('可切换到 AI 和原始输入模式', () => {
        useAudioStore.getState().setAudioProcessingMode(AUDIO_PROCESSING_MODES.AI);
        expect(useAudioStore.getState().audioProcessingMode).toBe(AUDIO_PROCESSING_MODES.AI);

        useAudioStore.getState().setAudioProcessingMode(AUDIO_PROCESSING_MODES.RAW);
        expect(useAudioStore.getState().audioProcessingMode).toBe(AUDIO_PROCESSING_MODES.RAW);
    });

    test('非法模式回退到标准降噪', () => {
        useAudioStore.getState().setAudioProcessingMode('unknown');
        expect(useAudioStore.getState().audioProcessingMode).toBe(AUDIO_PROCESSING_MODES.STANDARD);
    });
});

describe('开黑语音预设与校准', () => {
    test('嘈杂环境预设会一次性更新处理链路参数', () => {
        useAudioStore.getState().applyAudioPreset('noisy');
        const state = useAudioStore.getState();

        expect(state.audioPreset).toBe('noisy');
        expect(state.audioProcessingMode).toBe(AUDIO_PROCESSING_MODES.AI);
        expect(state.voiceActivationEnabled).toBe(true);
        expect(state.voiceActivationThreshold).toBe(20);
    });

    test('自动校准结果会切换为自定义预设并开启语音感应', () => {
        useAudioStore.getState().applyVoiceCalibration({
            voiceActivationThreshold: 24,
            voiceActivationOpenSensitivity: 9,
            voiceActivationReleaseDelay: 720,
            voiceActivationNoiseTolerance: 10
        });
        const state = useAudioStore.getState();

        expect(state.audioPreset).toBe('custom');
        expect(state.voiceActivationEnabled).toBe(true);
        expect(state.voiceActivationThreshold).toBe(24);
        expect(state.voiceActivationReleaseDelay).toBe(720);
    });

    test('设置页预览请求只保存在当前运行时', () => {
        useAudioStore.getState().setAudioPreviewRequested(true);
        expect(useAudioStore.getState().audioPreviewRequested).toBe(true);
    });
});

describe('语音感应', () => {
    test('setVoiceActivationEnabled 开关', () => {
        useAudioStore.getState().setVoiceActivationEnabled(true);
        expect(useAudioStore.getState().voiceActivationEnabled).toBe(true);
    });

    test('setVoiceActivationThreshold 正常值', () => {
        useAudioStore.getState().setVoiceActivationThreshold(30);
        expect(useAudioStore.getState().voiceActivationThreshold).toBe(30);
    });

    test('setVoiceActivationThreshold 下限 clamp 到 5', () => {
        useAudioStore.getState().setVoiceActivationThreshold(4);
        expect(useAudioStore.getState().voiceActivationThreshold).toBe(5);
    });

    test('setVoiceActivationThreshold 0 回退到默认 15', () => {
        useAudioStore.getState().setVoiceActivationThreshold(0);
        expect(useAudioStore.getState().voiceActivationThreshold).toBe(15);
    });

    test('setVoiceActivationThreshold 上限 clamp 到 60', () => {
        useAudioStore.getState().setVoiceActivationThreshold(100);
        expect(useAudioStore.getState().voiceActivationThreshold).toBe(60);
    });

    test('setVoiceActivationThreshold 非数字回退到 15', () => {
        useAudioStore.getState().setVoiceActivationThreshold(undefined);
        expect(useAudioStore.getState().voiceActivationThreshold).toBe(15);
    });
});

describe('用户音量', () => {
    test('setUserVolume 设置指定用户音量', () => {
        useAudioStore.getState().setUserVolume('user-1', 80);
        expect(useAudioStore.getState().userVolumes['user-1']).toBe(80);
    });

    test('setUserVolume 不影响其他用户', () => {
        useAudioStore.getState().setUserVolume('user-1', 80);
        useAudioStore.getState().setUserVolume('user-2', 50);
        expect(useAudioStore.getState().userVolumes['user-1']).toBe(80);
        expect(useAudioStore.getState().userVolumes['user-2']).toBe(50);
    });

    test('setUserVolume clamp 到可用范围', () => {
        useAudioStore.getState().setUserVolume('user-1', -10);
        useAudioStore.getState().setUserVolume('user-2', 999);
        useAudioStore.getState().setUserVolume('user-3', 'abc');

        expect(useAudioStore.getState().userVolumes['user-1']).toBe(0);
        expect(useAudioStore.getState().userVolumes['user-2']).toBe(500);
        expect(useAudioStore.getState().userVolumes['user-3']).toBe(100);
    });
});

describe('输入电平', () => {
    test('setMicVolume 设置电平值', () => {
        useAudioStore.getState().setMicVolume(75);
        expect(useAudioStore.getState().micVolume).toBe(75);
    });
});

describe('耳返', () => {
    test('setSelfMonitorEnabled 开关', () => {
        useAudioStore.getState().setSelfMonitorEnabled(true);
        expect(useAudioStore.getState().selfMonitorEnabled).toBe(true);
    });

    test('setSelfMonitorVolume 设置音量', () => {
        useAudioStore.getState().setSelfMonitorVolume(50);
        expect(useAudioStore.getState().selfMonitorVolume).toBe(50);
    });

    test('setSelfMonitorVolume clamp 到 0-100', () => {
        useAudioStore.getState().setSelfMonitorVolume(-10);
        expect(useAudioStore.getState().selfMonitorVolume).toBe(0);

        useAudioStore.getState().setSelfMonitorVolume(200);
        expect(useAudioStore.getState().selfMonitorVolume).toBe(100);

        useAudioStore.getState().setSelfMonitorVolume('abc');
        expect(useAudioStore.getState().selfMonitorVolume).toBe(100);
    });
});

describe('语音感应高级参数', () => {
    test('开麦灵敏度 clamp 到 0-12', () => {
        useAudioStore.getState().setVoiceActivationOpenSensitivity(-1);
        expect(useAudioStore.getState().voiceActivationOpenSensitivity).toBe(0);

        useAudioStore.getState().setVoiceActivationOpenSensitivity(99);
        expect(useAudioStore.getState().voiceActivationOpenSensitivity).toBe(12);

        useAudioStore.getState().setVoiceActivationOpenSensitivity('abc');
        expect(useAudioStore.getState().voiceActivationOpenSensitivity).toBe(6);
    });

    test('闭麦延迟 clamp 到 0-2000', () => {
        useAudioStore.getState().setVoiceActivationReleaseDelay(-1);
        expect(useAudioStore.getState().voiceActivationReleaseDelay).toBe(0);

        useAudioStore.getState().setVoiceActivationReleaseDelay(3000);
        expect(useAudioStore.getState().voiceActivationReleaseDelay).toBe(2000);

        useAudioStore.getState().setVoiceActivationReleaseDelay('abc');
        expect(useAudioStore.getState().voiceActivationReleaseDelay).toBe(520);
    });

    test('噪声容忍度 clamp 到 0-16', () => {
        useAudioStore.getState().setVoiceActivationNoiseTolerance(-1);
        expect(useAudioStore.getState().voiceActivationNoiseTolerance).toBe(0);

        useAudioStore.getState().setVoiceActivationNoiseTolerance(99);
        expect(useAudioStore.getState().voiceActivationNoiseTolerance).toBe(16);

        useAudioStore.getState().setVoiceActivationNoiseTolerance('abc');
        expect(useAudioStore.getState().voiceActivationNoiseTolerance).toBe(8);
    });
});
