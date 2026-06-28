import { describe, test, expect, beforeEach } from 'vitest';
import useAudioStore from '../useAudioStore';

beforeEach(() => {
    useAudioStore.setState({
        audioDevices: { inputs: [], outputs: [] },
        selectedAudioInput: '',
        selectedAudioOutput: '',
        micVolume: 0,
        microphoneEnhancementEnabled: false,
        noiseSuppressionEnabled: false,
        noiseSuppressionStrength: 35,
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

describe('轻度降噪', () => {
    test('setNoiseSuppressionEnabled 开关', () => {
        useAudioStore.getState().setNoiseSuppressionEnabled(true);
        expect(useAudioStore.getState().noiseSuppressionEnabled).toBe(true);
    });

    test('setNoiseSuppressionStrength 正常值', () => {
        useAudioStore.getState().setNoiseSuppressionStrength(50);
        expect(useAudioStore.getState().noiseSuppressionStrength).toBe(50);
    });

    test('setNoiseSuppressionStrength 下限 clamp 到 0', () => {
        useAudioStore.getState().setNoiseSuppressionStrength(-10);
        expect(useAudioStore.getState().noiseSuppressionStrength).toBe(0);
    });

    test('setNoiseSuppressionStrength 上限 clamp 到 100', () => {
        useAudioStore.getState().setNoiseSuppressionStrength(200);
        expect(useAudioStore.getState().noiseSuppressionStrength).toBe(100);
    });

    test('setNoiseSuppressionStrength 非数字回退到 0', () => {
        useAudioStore.getState().setNoiseSuppressionStrength('abc');
        expect(useAudioStore.getState().noiseSuppressionStrength).toBe(0);
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
});
