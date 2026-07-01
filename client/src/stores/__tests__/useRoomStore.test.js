import { describe, test, expect, beforeEach } from 'vitest';
import useRoomStore from '../useRoomStore';

beforeEach(() => {
    useRoomStore.setState({
        rooms: [],
        selectedRoomId: null,
        selectedRoomName: '',
        joinedRoomId: null,
        roomUsers: [],
        messages: [],
        privateMessages: []
    });
});

describe('room join confirmation', () => {
    test('setJoinedRoom marks the selected room as confirmed', () => {
        useRoomStore.getState().setJoinedRoom('r1', 'Room 1', [{ funId: 'u1' }]);

        const state = useRoomStore.getState();
        expect(state.selectedRoomId).toBe('r1');
        expect(state.selectedRoomName).toBe('Room 1');
        expect(state.joinedRoomId).toBe('r1');
        expect(state.roomUsers).toEqual([{ funId: 'u1' }]);
    });

    test('markRoomJoinPending selects target room but clears confirmed room until roomJoined arrives', () => {
        useRoomStore.setState({
            rooms: [{ roomId: 'r2', name: 'Room 2' }],
            selectedRoomId: 'r1',
            selectedRoomName: 'Room 1',
            joinedRoomId: 'r1',
            roomUsers: [{ funId: 'u1' }]
        });

        useRoomStore.getState().markRoomJoinPending('r2');

        const state = useRoomStore.getState();
        expect(state.selectedRoomId).toBe('r2');
        expect(state.selectedRoomName).toBe('Room 2');
        expect(state.joinedRoomId).toBeNull();
        expect(state.roomUsers).toEqual([]);
    });

    test('markRoomJoinPending keeps current name when retrying the same room', () => {
        useRoomStore.setState({
            rooms: [],
            selectedRoomId: 'r1',
            selectedRoomName: 'Room 1',
            joinedRoomId: 'r1',
            roomUsers: [{ funId: 'u1' }]
        });

        useRoomStore.getState().markRoomJoinPending('r1');

        const state = useRoomStore.getState();
        expect(state.selectedRoomId).toBe('r1');
        expect(state.selectedRoomName).toBe('Room 1');
        expect(state.joinedRoomId).toBeNull();
        expect(state.roomUsers).toEqual([]);
    });
});

describe('房间列表', () => {
    test('setRooms 设置房间列表', () => {
        const rooms = [{ roomId: 'r1', name: '房间1' }];
        useRoomStore.getState().setRooms(rooms);
        expect(useRoomStore.getState().rooms).toEqual(rooms);
    });

    test('removeRoom 移除指定房间', () => {
        useRoomStore.setState({
            rooms: [{ roomId: 'r1', name: 'A' }, { roomId: 'r2', name: 'B' }]
        });
        useRoomStore.getState().removeRoom('r1');
        expect(useRoomStore.getState().rooms).toHaveLength(1);
        expect(useRoomStore.getState().rooms[0].roomId).toBe('r2');
    });

    test('removeRoom 删除当前选中房间时清空选中状态', () => {
        useRoomStore.setState({
            rooms: [{ roomId: 'r1', name: 'A' }],
            selectedRoomId: 'r1',
            selectedRoomName: 'A'
        });
        useRoomStore.getState().removeRoom('r1');
        expect(useRoomStore.getState().selectedRoomId).toBeNull();
        expect(useRoomStore.getState().selectedRoomName).toBe('');
    });

    test('removeRoom 删除非当前选中房间不影响选中状态', () => {
        useRoomStore.setState({
            rooms: [{ roomId: 'r1', name: 'A' }, { roomId: 'r2', name: 'B' }],
            selectedRoomId: 'r2',
            selectedRoomName: 'B'
        });
        useRoomStore.getState().removeRoom('r1');
        expect(useRoomStore.getState().selectedRoomId).toBe('r2');
    });

    test('updateRoomName 更新房间名称', () => {
        useRoomStore.setState({
            rooms: [{ roomId: 'r1', name: '旧名' }],
            selectedRoomId: 'r1',
            selectedRoomName: '旧名'
        });
        useRoomStore.getState().updateRoomName('r1', '新名');
        expect(useRoomStore.getState().rooms[0].name).toBe('新名');
        expect(useRoomStore.getState().selectedRoomName).toBe('新名');
    });

    test('updateRoomName 更新非当前房间名不影响 selectedRoomName', () => {
        useRoomStore.setState({
            rooms: [{ roomId: 'r1', name: 'A' }, { roomId: 'r2', name: 'B' }],
            selectedRoomId: 'r1',
            selectedRoomName: 'A'
        });
        useRoomStore.getState().updateRoomName('r2', '新B');
        expect(useRoomStore.getState().rooms[1].name).toBe('新B');
        expect(useRoomStore.getState().selectedRoomName).toBe('A');
    });
});

describe('房间选择', () => {
    test('setSelectedRoom 设置选中房间', () => {
        useRoomStore.getState().setSelectedRoom('r1');
        expect(useRoomStore.getState().selectedRoomId).toBe('r1');
    });

    test('clearSelectedRoom 清空选中状态', () => {
        useRoomStore.setState({ selectedRoomId: 'r1', selectedRoomName: 'A', roomUsers: [{ id: 1 }] });
        useRoomStore.getState().clearSelectedRoom();
        expect(useRoomStore.getState().selectedRoomId).toBeNull();
        expect(useRoomStore.getState().selectedRoomName).toBe('');
        expect(useRoomStore.getState().roomUsers).toEqual([]);
    });

    test('setJoinedRoom 设置完整房间状态', () => {
        useRoomStore.getState().setJoinedRoom('r1', '房间1', [{ funId: 'u1' }]);
        const state = useRoomStore.getState();
        expect(state.selectedRoomId).toBe('r1');
        expect(state.selectedRoomName).toBe('房间1');
        expect(state.roomUsers).toEqual([{ funId: 'u1' }]);
    });
});

describe('房间成员', () => {
    test('setRoomUsers 设置成员列表', () => {
        const users = [{ funId: 'u1', name: 'A' }, { funId: 'u2', name: 'B' }];
        useRoomStore.getState().setRoomUsers(users);
        expect(useRoomStore.getState().roomUsers).toEqual(users);
    });

    test('updateRoomUser 更新指定成员名称', () => {
        useRoomStore.setState({
            roomUsers: [{ funId: 'u1', name: '旧名' }, { funId: 'u2', name: 'B' }]
        });
        useRoomStore.getState().updateRoomUser('u1', '新名');
        expect(useRoomStore.getState().roomUsers[0].name).toBe('新名');
        expect(useRoomStore.getState().roomUsers[1].name).toBe('B');
    });
});

describe('公共消息', () => {
    test('addMessage 添加消息', () => {
        const msg = { id: 1, text: '你好' };
        useRoomStore.getState().addMessage(msg);
        expect(useRoomStore.getState().messages).toEqual([msg]);
    });

    test('setMessages 设置消息列表', () => {
        const msgs = [{ id: 1 }, { id: 2 }];
        useRoomStore.getState().setMessages(msgs);
        expect(useRoomStore.getState().messages).toEqual(msgs);
    });

    test('removeMessage 按 id 移除消息', () => {
        useRoomStore.setState({ messages: [{ id: '1' }, { id: '2' }, { id: '3' }] });
        useRoomStore.getState().removeMessage('2');
        expect(useRoomStore.getState().messages).toHaveLength(2);
        expect(useRoomStore.getState().messages.find(m => m.id === '2')).toBeUndefined();
    });

    test('removeMessage 支持数字和字符串 id 混合匹配', () => {
        useRoomStore.setState({ messages: [{ id: 42 }, { id: 43 }] });
        useRoomStore.getState().removeMessage('42');
        expect(useRoomStore.getState().messages).toHaveLength(1);
    });

    test('clearMessages 清空消息', () => {
        useRoomStore.setState({ messages: [{ id: 1 }, { id: 2 }] });
        useRoomStore.getState().clearMessages();
        expect(useRoomStore.getState().messages).toEqual([]);
    });

    test('addMessage 超过 200 条时截断旧消息', () => {
        const msgs = Array.from({ length: 200 }, (_, i) => ({ id: i }));
        useRoomStore.setState({ messages: msgs });
        useRoomStore.getState().addMessage({ id: 200 });
        expect(useRoomStore.getState().messages).toHaveLength(200);
        expect(useRoomStore.getState().messages[0].id).toBe(1);
        expect(useRoomStore.getState().messages[199].id).toBe(200);
    });
});

describe('私聊消息', () => {
    test('addPrivateMessage 添加私聊消息', () => {
        const msg = { id: 'p1', text: '私聊' };
        useRoomStore.getState().addPrivateMessage(msg);
        expect(useRoomStore.getState().privateMessages).toEqual([msg]);
    });

    test('removePrivateMessage 按 id 移除私聊消息', () => {
        useRoomStore.setState({ privateMessages: [{ id: 'p1' }, { id: 'p2' }] });
        useRoomStore.getState().removePrivateMessage('p1');
        expect(useRoomStore.getState().privateMessages).toHaveLength(1);
    });

    test('clearPrivateMessages 清空私聊消息', () => {
        useRoomStore.setState({ privateMessages: [{ id: 'p1' }] });
        useRoomStore.getState().clearPrivateMessages();
        expect(useRoomStore.getState().privateMessages).toEqual([]);
    });
});
