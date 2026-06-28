const {
    normalizeEmail,
    serializeUser,
    hashToken,
    getSessionTokenFromRequest
} = require('../auth');

describe('normalizeEmail', () => {
    test('转小写并去除首尾空格', () => {
        expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    });

    test('空字符串返回空字符串', () => {
        expect(normalizeEmail('')).toBe('');
    });

    test('无空格无大写原样返回', () => {
        expect(normalizeEmail('test@test.com')).toBe('test@test.com');
    });
});

describe('serializeUser', () => {
    test('null 输入返回 null', () => {
        expect(serializeUser(null)).toBeNull();
    });

    test('undefined 输入返回 null', () => {
        expect(serializeUser(undefined)).toBeNull();
    });

    test('正常用户序列化只包含公开字段', () => {
        const user = {
            id: 'abc123',
            email: 'test@test.com',
            displayName: '测试用户',
            isAdmin: false,
            passwordHash: 'should-not-appear',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = serializeUser(user);

        expect(result).toEqual({
            id: 'abc123',
            email: 'test@test.com',
            displayName: '测试用户',
            isAdmin: false
        });
        expect(result).not.toHaveProperty('passwordHash');
    });

    test('isAdmin 转为布尔值', () => {
        expect(serializeUser({ id: '1', email: 'a', displayName: 'b', isAdmin: 1 }).isAdmin).toBe(true);
        expect(serializeUser({ id: '1', email: 'a', displayName: 'b', isAdmin: 0 }).isAdmin).toBe(false);
        expect(serializeUser({ id: '1', email: 'a', displayName: 'b', isAdmin: null }).isAdmin).toBe(false);
    });
});

describe('hashToken', () => {
    test('相同输入产生相同输出', () => {
        expect(hashToken('test-token')).toBe(hashToken('test-token'));
    });

    test('不同输入产生不同输出', () => {
        expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });

    test('输出是 64 字符十六进制字符串（SHA256）', () => {
        const result = hashToken('anything');
        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('getSessionTokenFromRequest', () => {
    test('有 cookie 时返回 token', () => {
        const req = { cookies: { jinvoice_session: 'abc123' } };
        expect(getSessionTokenFromRequest(req)).toBe('abc123');
    });

    test('无 cookie 时返回 null', () => {
        expect(getSessionTokenFromRequest({})).toBeNull();
    });

    test('cookies 对象存在但无 session cookie 时返回 null', () => {
        expect(getSessionTokenFromRequest({ cookies: {} })).toBeNull();
    });

    test('cookies 为 undefined 时返回 null', () => {
        expect(getSessionTokenFromRequest({ cookies: undefined })).toBeNull();
    });
});
