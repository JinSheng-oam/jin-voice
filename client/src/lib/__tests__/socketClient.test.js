import { afterEach, describe, expect, test, vi } from 'vitest';
import { getPersistentGuestId } from '../socketClient';

describe('persistent guest identity', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.window;
    });

    test('reuses a valid stored guest id', () => {
        globalThis.window = {
            localStorage: {
                getItem: () => 'guest-session-1234567890',
                setItem: vi.fn()
            }
        };

        expect(getPersistentGuestId()).toBe('guest-session-1234567890');
        expect(globalThis.window.localStorage.setItem).not.toHaveBeenCalled();
    });

    test('falls back to an in-memory id when storage is unavailable', () => {
        globalThis.window = {
            localStorage: {
                getItem: () => {
                    throw new DOMException('Blocked', 'SecurityError');
                }
            }
        };

        expect(getPersistentGuestId()).toMatch(/^[A-Za-z0-9-]{16,128}$/u);
    });
});
