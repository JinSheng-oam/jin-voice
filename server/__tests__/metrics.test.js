const { createMetricsService } = require('../metrics');

describe('metrics service', () => {
    test('records allowlisted counts and duration summaries', () => {
        const service = createMetricsService({ now: () => Date.parse('2026-07-12T00:00:00Z') });
        expect(service.record('room_join_succeeded', 120)).toBe(true);
        expect(service.record('room_join_succeeded', 180)).toBe(true);
        expect(service.record('unknown_metric', 1)).toBe(false);
        expect(service.snapshot()).toEqual({
            startedAt: '2026-07-12T00:00:00.000Z',
            metrics: {
                room_join_succeeded: { count: 2, averageDurationMs: 150, maxDurationMs: 180 }
            }
        });
    });

    test('ignores invalid durations while retaining the event count', () => {
        const service = createMetricsService();
        service.record('audio_recovery_failed', -1);
        expect(service.snapshot().metrics.audio_recovery_failed).toEqual({
            count: 1, averageDurationMs: null, maxDurationMs: null
        });
    });
});
