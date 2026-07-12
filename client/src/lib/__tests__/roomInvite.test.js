import { describe, expect, it, vi } from 'vitest';
import { buildRoomInviteUrl, copyRoomInviteLink } from '../roomInvite';

describe('room invites', () => {
    const location = { href: 'https://voice.example.com/app?theme=dark#room' };

    it('preserves unrelated URL state and sets the room id', () => {
        expect(buildRoomInviteUrl('room_123', location)).toBe('https://voice.example.com/app?theme=dark&roomId=room_123#room');
    });

    it('copies the generated invite', async () => {
        const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
        await expect(copyRoomInviteLink('room_123', clipboard, location)).resolves.toContain('roomId=room_123');
        expect(clipboard.writeText).toHaveBeenCalledOnce();
    });
});
