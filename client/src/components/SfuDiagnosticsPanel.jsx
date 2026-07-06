import React, { useEffect, useState } from 'react';

const readDebugState = () => {
    if (typeof window === 'undefined') return null;
    try {
        return window.__jinvoiceDebug?.getState?.() || null;
    } catch (error) {
        return {
            error: error?.message || '读取诊断状态失败'
        };
    }
};

const formatValue = (value) => {
    if (value === true) return '是';
    if (value === false) return '否';
    if (value === null || value === undefined || value === '') return '-';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '空';
    return String(value);
};

const StatusPill = ({ ok, children }) => (
    <span className={`sfu-diagnostics__pill ${ok ? 'is-ok' : 'is-warn'}`}>
        {children}
    </span>
);

const Row = ({ label, value, ok }) => (
    <div className="sfu-diagnostics__row">
        <span>{label}</span>
        {typeof ok === 'boolean' ? (
            <StatusPill ok={ok}>{formatValue(value)}</StatusPill>
        ) : (
            <strong>{formatValue(value)}</strong>
        )}
    </div>
);

const SfuDiagnosticsPanel = () => {
    const [expanded, setExpanded] = useState(false);
    const [state, setState] = useState(() => readDebugState());

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setState(readDebugState());
        }, expanded ? 500 : 1500);

        return () => window.clearInterval(intervalId);
    }, [expanded]);

    if (!import.meta.env.DEV) return null;

    const room = state?.room || {};
    const voiceGate = state?.voiceGate || {};
    const sfu = state?.sfu || {};
    const audioPipeline = state?.audioPipeline || {};
    const streamRecovery = audioPipeline.streamRecovery || {};
    const tracks = state?.streamTrackStates || [];
    const audioTrack = tracks.find((track) => track.kind === 'audio');
    const remoteAudioEntries = state?.remoteAudioEntries || [];
    const hasError = Boolean(state?.error || state?.connectionError);
    const isReady = Boolean(room.joinConfirmed && state?.sfuRoomJoined && sfu.hasProducer);

    return (
        <aside className={`sfu-diagnostics ${expanded ? 'is-expanded' : ''}`} aria-label="SFU 诊断面板">
            <button
                type="button"
                className="sfu-diagnostics__toggle"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
            >
                <span className={`sfu-diagnostics__dot ${isReady ? 'is-ok' : hasError ? 'is-error' : 'is-warn'}`}></span>
                <span>语音诊断</span>
                <strong>{isReady ? '正常' : hasError ? '异常' : '等待'}</strong>
            </button>

            {expanded && (
                <div className="sfu-diagnostics__body">
                    {state?.error && <p className="sfu-diagnostics__error">{state.error}</p>}
                    {state?.connectionError && <p className="sfu-diagnostics__error">{state.connectionError}</p>}

                    <section>
                        <h4>入房链路</h4>
                        <Row label="目标房间" value={room.selectedRoomId} />
                        <Row label="已确认入房" value={room.joinConfirmed} ok={Boolean(room.joinConfirmed)} />
                        <Row label="SFU 已加入" value={state?.sfuRoomJoined} ok={Boolean(state?.sfuRoomJoined)} />
                    </section>

                    <section>
                        <h4>发送链路</h4>
                        <Row label="发送 Transport" value={sfu.sendTransportState || sfu.hasSendTransport} ok={Boolean(sfu.hasSendTransport)} />
                        <Row label="Producer" value={sfu.producerPaused ? '暂停' : sfu.hasProducer ? '发送中' : '未创建'} ok={Boolean(sfu.hasProducer && !sfu.producerPaused)} />
                        <Row label="本地音轨" value={audioTrack?.readyState || '无'} ok={audioTrack?.readyState === 'live'} />
                        <Row label="发送音轨" value={audioPipeline.activeOutgoingTrack?.readyState || '无'} ok={audioPipeline.activeOutgoingTrack?.readyState === 'live'} />
                        <Row label="门控状态" value={voiceGate.voiceTransmissionState} />
                    </section>

                    <section>
                        <h4>本地恢复</h4>
                        <Row label="恢复中" value={streamRecovery.inFlight} ok={!streamRecovery.inFlight} />
                        <Row label="最近原因" value={streamRecovery.lastReason} />
                        <Row label="最近错误" value={streamRecovery.lastError} ok={!streamRecovery.lastError} />
                    </section>

                    <section>
                        <h4>接收链路</h4>
                        <Row label="接收 Transport" value={sfu.recvTransportState || sfu.hasRecvTransport} ok={Boolean(sfu.hasRecvTransport)} />
                        <Row label="远端音频" value={remoteAudioEntries.length} ok={remoteAudioEntries.length > 0 || !room.joinConfirmed} />
                        <Row label="SFU 成员" value={state?.sfuConnectedPeers || []} />
                    </section>
                </div>
            )}
        </aside>
    );
};

export default SfuDiagnosticsPanel;
