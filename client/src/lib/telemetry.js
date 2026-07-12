import { apiRequest } from './apiClient';

const ALLOWED_METRICS = new Set([
    'room_join_succeeded', 'room_join_failed', 'socket_reconnected',
    'audio_recovery_succeeded', 'audio_recovery_failed',
    'device_switch_succeeded', 'device_switch_failed'
]);

export const recordClientMetric = (name, durationMs = null) => {
    if (!ALLOWED_METRICS.has(name)) return;
    void apiRequest('/api/telemetry', {
        method: 'POST',
        body: { name, durationMs }
    }).catch(() => { /* telemetry must not interrupt voice */ });
};

export { ALLOWED_METRICS };
