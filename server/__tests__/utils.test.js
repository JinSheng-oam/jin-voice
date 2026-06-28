const {
    buildMessagePayload,
    getSocketDisplayName,
    getSocketUserId,
    isSocketAdmin,
    buildRoomUser
} = require('../utils');

describe('buildMessagePayload', () => {
    test('正确映射消息字段', () => {
        const message = {
            id: 42,
            sender: '测试用户',
            senderUserId: 'user-123',
            senderFunId: 'fun-456',
            content: '你好世界',
            createdAt: new Date('2026-01-01T12:00:00')
        };

        const result = buildMessagePayload(message);

        expect(result.id).toBe(42);
        expect(result.user).toBe('测试用户');
        expect(result.userId).toBe('user-123');
        expect(result.from).toBe('fun-456');
        expect(result.text).toBe('你好世界');
        expect(result.isPrivate).toBe(false);
        expect(typeof result.time).toBe('string');
    });

    test('senderUserId 为 null 时 userId 为 null', () => {
        const message = {
            id: 1,
            sender: '游客',
            senderUserId: null,
            senderFunId: 'fun-001',
            content: 'test',
            createdAt: new Date()
        };

        expect(buildMessagePayload(message).userId).toBeNull();
    });

    test('senderFunId 为 null 时 from 为 null', () => {
        const message = {
            id: 1,
            sender: '用户',
            senderUserId: 'user-1',
            senderFunId: null,
            content: 'test',
            createdAt: new Date()
        };

        expect(buildMessagePayload(message).from).toBeNull();
    });
});

describe('getSocketUserId', () => {
    test('有登录用户时返回 userId', () => {
        const socket = { data: { user: { id: 'user-123' } } };
        expect(getSocketUserId(socket)).toBe('user-123');
    });

    test('无登录用户时返回 null', () => {
        const socket = { data: {} };
        expect(getSocketUserId(socket)).toBeNull();
    });

    test('user 为 null 时返回 null', () => {
        const socket = { data: { user: null } };
        expect(getSocketUserId(socket)).toBeNull();
    });
});

describe('isSocketAdmin', () => {
    test('管理员用户返回 true', () => {
        const socket = { data: { user: { isAdmin: true } } };
        expect(isSocketAdmin(socket)).toBe(true);
    });

    test('非管理员用户返回 false', () => {
        const socket = { data: { user: { isAdmin: false } } };
        expect(isSocketAdmin(socket)).toBe(false);
    });

    test('无用户返回 false', () => {
        const socket = { data: {} };
        expect(isSocketAdmin(socket)).toBe(false);
    });
});

describe('getSocketDisplayName', () => {
    const userIdMap = new Map([
        ['socket-1', 'fun-abc12345']
    ]);

    test('登录用户返回 displayName', () => {
        const socket = {
            id: 'socket-1',
            data: { user: { displayName: '张三' }, guestName: '游客' }
        };
        expect(getSocketDisplayName(socket, userIdMap)).toBe('张三');
    });

    test('游客返回 guestName', () => {
        const socket = {
            id: 'socket-1',
            data: { guestName: '小明' }
        };
        expect(getSocketDisplayName(socket, userIdMap)).toBe('小明');
    });

    test('无名称时返回 fallback（访客+funId 后4位）', () => {
        const socket = {
            id: 'socket-1',
            data: {}
        };
        expect(getSocketDisplayName(socket, userIdMap)).toBe('访客2345');
    });

    test('funId 不存在时返回访客0000', () => {
        const socket = {
            id: 'unknown-socket',
            data: {}
        };
        const emptyMap = new Map();
        expect(getSocketDisplayName(socket, emptyMap)).toBe('访客0000');
    });
});

describe('buildRoomUser', () => {
    const userIdMap = new Map([
        ['socket-1', 'fun-abc123']
    ]);

    test('登录用户返回正确结构', () => {
        const socket = {
            id: 'socket-1',
            data: { guestName: '游客名' }
        };
        const user = { id: 'user-1', displayName: '张三' };

        const result = buildRoomUser(socket, user, userIdMap);

        expect(result.funId).toBe('fun-abc123');
        expect(result.userId).toBe('user-1');
        expect(result.name).toBe('张三');
    });

    test('游客返回正确结构', () => {
        const socket = {
            id: 'socket-1',
            data: { guestName: '小游客' }
        };

        const result = buildRoomUser(socket, null, userIdMap);

        expect(result.funId).toBe('fun-abc123');
        expect(result.userId).toBeNull();
        expect(result.name).toBe('小游客');
    });

    test('无 guestName 时 fallback 到访客+后4位', () => {
        const socket = {
            id: 'socket-1',
            data: {}
        };

        const result = buildRoomUser(socket, null, userIdMap);

        expect(result.name).toBe('访客c123');
    });
});
