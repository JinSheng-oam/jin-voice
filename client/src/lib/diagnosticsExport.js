const SENSITIVE_IDENTIFIER_KEY = /(?:^id$|(?:account|user|peer|room|device|group|socket|session|transport|producer|consumer).*ids?$)/i;

const redactNestedIdentifiers = (value) => {
    if (Array.isArray(value)) return value.map(redactNestedIdentifiers);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
        key,
        SENSITIVE_IDENTIFIER_KEY.test(key) && nestedValue != null
            ? '[redacted]'
            : redactNestedIdentifiers(nestedValue)
    ]));
};

const redactDiagnostics = (state) => ({
    exportedAt: new Date().toISOString(),
    app: 'JinVoice',
    identity: state?.identity ? { hasAccount: Boolean(state.identity.accountUserId), hasPeerId: Boolean(state.identity.me) } : null,
    room: state?.room ? {
        hasSelectedRoom: Boolean(state.room.selectedRoomId),
        hasJoinedRoom: Boolean(state.room.joinedRoomId),
        joinConfirmed: Boolean(state.room.joinConfirmed)
    } : null,
    connection: {
        status: state?.socketConnectionStatus || null,
        error: state?.connectionError || null,
        type: state?.connectionType || null
    },
    audioDevices: state?.audioDevices ? {
        hasSelectedInput: Boolean(state.audioDevices.selectedAudioInput),
        hasSelectedOutput: Boolean(state.audioDevices.selectedAudioOutput)
    } : null,
    voiceGate: state?.voiceGate || null,
    audioPipeline: redactNestedIdentifiers(state?.audioPipeline || null),
    streamTrackStates: redactNestedIdentifiers(state?.streamTrackStates || []),
    sfuConnectedPeerCount: state?.sfuConnectedPeers?.length || 0,
    sfuRoomJoined: Boolean(state?.sfuRoomJoined),
    sfu: redactNestedIdentifiers(state?.sfu || null),
    remoteAudioCount: state?.remoteAudioEntries?.length || 0,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent
});

export const buildDiagnosticsReport = (state) => redactDiagnostics(state || {});

export const downloadDiagnosticsReport = (state, documentRef = document, urlApi = URL) => {
    const report = buildDiagnosticsReport(state);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = urlApi.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = `jinvoice-diagnostics-${Date.now()}.json`;
    anchor.click();
    urlApi.revokeObjectURL(url);
    return report;
};
