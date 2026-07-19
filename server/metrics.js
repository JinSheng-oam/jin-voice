const express = require('express');

const ALLOWED_METRICS = new Set([
    'room_join_succeeded',
    'room_join_failed',
    'socket_reconnected',
    'audio_recovery_succeeded',
    'audio_recovery_failed',
    'device_switch_succeeded',
    'device_switch_failed',
    'audio_quality_degraded',
    'audio_quality_recovered',
    'audio_preview_failed',
    'audio_calibration_completed'
]);

const createMetricsService = ({ now = () => Date.now() } = {}) => {
    const startedAt = now();
    const entries = new Map();

    const record = (name, durationMs = null) => {
        if (!ALLOWED_METRICS.has(name)) return false;
        const current = entries.get(name) || { count: 0, durationCount: 0, durationTotalMs: 0, durationMaxMs: 0 };
        current.count += 1;
        const duration = Number(durationMs);
        if (Number.isFinite(duration) && duration >= 0 && duration <= 10 * 60 * 1000) {
            current.durationCount += 1;
            current.durationTotalMs += duration;
            current.durationMaxMs = Math.max(current.durationMaxMs, duration);
        }
        entries.set(name, current);
        return true;
    };

    const snapshot = () => ({
        startedAt: new Date(startedAt).toISOString(),
        metrics: Object.fromEntries(Array.from(entries, ([name, entry]) => [name, {
            count: entry.count,
            averageDurationMs: entry.durationCount
                ? Math.round(entry.durationTotalMs / entry.durationCount)
                : null,
            maxDurationMs: entry.durationCount ? Math.round(entry.durationMaxMs) : null
        }]))
    });

    return { record, snapshot };
};

const createMetricsRouter = ({ service, requireHttpAuth, requireAdmin }) => {
    const router = express.Router();

    router.post('/telemetry', (req, res) => {
        const accepted = service.record(String(req.body?.name || ''), req.body?.durationMs);
        return res.status(accepted ? 202 : 400).json({ accepted });
    });

    router.get('/admin/metrics', requireHttpAuth, requireAdmin, (req, res) => {
        return res.json(service.snapshot());
    });

    return router;
};

module.exports = { ALLOWED_METRICS, createMetricsRouter, createMetricsService };
