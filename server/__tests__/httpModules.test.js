const { createLoginRateLimiter, normalizeDisplayName } = require('../http/authRoutes');
const { getPublicIceConfig, parseTurnUser } = require('../http/systemRoutes');

describe('HTTP module contracts', () => {
    test('login limiter enforces the window and resets after expiry', () => {
        let now = 1000;
        const limiter = createLoginRateLimiter({ now: () => now });
        for (let attempt = 0; attempt < 5; attempt += 1) expect(limiter.check('login:ip')).toBe(true);
        expect(limiter.check('login:ip')).toBe(false);
        now += 60_001;
        expect(limiter.check('login:ip')).toBe(true);
    });

    test('display names preserve the existing trim and maximum length contract', () => {
        expect(normalizeDisplayName('  Player One  ')).toBe('Player One');
        expect(normalizeDisplayName('x'.repeat(30))).toHaveLength(24);
    });

    test('TURN credentials require both username and credential', () => {
        expect(parseTurnUser('player:secret')).toEqual({ username: 'player', credential: 'secret' });
        expect(parseTurnUser('player:')).toBeNull();
        expect(parseTurnUser('invalid')).toBeNull();
    });

    test('public ICE config adds TURN without changing the STUN defaults', () => {
        const config = getPublicIceConfig(
            { hostname: 'voice.example.com' },
            { TURN_USER: 'player:secret', TURN_HOST: 'turn.example.com' }
        );
        expect(config.iceServers).toHaveLength(5);
        expect(config.iceServers[4]).toEqual({
            urls: ['turn:turn.example.com:3478', 'turn:turn.example.com:3478?transport=tcp'],
            username: 'player',
            credential: 'secret'
        });
    });
});
