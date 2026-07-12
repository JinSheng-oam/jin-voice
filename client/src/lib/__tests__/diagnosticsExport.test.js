import { describe, expect, it } from 'vitest';
import { buildDiagnosticsReport } from '../diagnosticsExport';

describe('diagnostics export', () => {
    it('removes account and peer identifiers while preserving technical state', () => {
        const report = buildDiagnosticsReport({
            identity: { me: 'peer-secret', accountUserId: 'user-secret', name: 'Player' },
            room: { selectedRoomId: 'room_123', joinedRoomId: 'room_123', joinConfirmed: true },
            audioDevices: { selectedAudioInput: 'device-secret', selectedAudioOutput: 'output-secret' },
            sfuConnectedPeers: ['peer-a'],
            audioPipeline: { processing: { status: 'ready' }, currentInputDeviceId: 'nested-device-secret' },
            sfu: { transportId: 'transport-secret' }
        });
        expect(report.identity).toEqual({ hasAccount: true, hasPeerId: true });
        expect(JSON.stringify(report)).not.toContain('peer-secret');
        expect(JSON.stringify(report)).not.toContain('user-secret');
        expect(JSON.stringify(report)).not.toContain('room_123');
        expect(JSON.stringify(report)).not.toContain('device-secret');
        expect(JSON.stringify(report)).not.toContain('transport-secret');
        expect(report.room).toEqual({ hasSelectedRoom: true, hasJoinedRoom: true, joinConfirmed: true });
        expect(report.audioDevices).toEqual({ hasSelectedInput: true, hasSelectedOutput: true });
        expect(report.audioPipeline.processing.status).toBe('ready');
    });
});
