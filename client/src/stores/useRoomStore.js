import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_CHAT_HISTORY = 200;

const clampMessages = (messages) => (
    messages.length > MAX_CHAT_HISTORY
        ? messages.slice(-MAX_CHAT_HISTORY)
        : messages
);

const buildRoomSelection = (roomId = null, roomName = '', roomUsers = []) => ({
    selectedRoomId: roomId,
    selectedRoomName: roomName,
    joinedRoomId: roomId,
    roomUsers
});

const useRoomStore = create(
    persist(
        (set) => ({
            // Room List
            rooms: [],
            setRooms: (rooms) => set({ rooms }),
            updateRoomName: (roomId, roomName) => set((state) => ({
                rooms: state.rooms.map((room) => (
                    room.roomId === roomId ? { ...room, name: roomName } : room
                )),
                ...(state.selectedRoomId === roomId ? { selectedRoomName: roomName } : {})
            })),

            // Selected Room State (persisted for auto-rejoin)
            selectedRoomId: null,
            selectedRoomName: '',
            joinedRoomId: null,
            roomUsers: [],

            setSelectedRoom: (roomId) => set({
                selectedRoomId: roomId,
                selectedRoomName: '',
                joinedRoomId: null,
                roomUsers: []
            }),
            clearSelectedRoom: () => set(buildRoomSelection()),
            removeRoom: (roomId) => set((state) => {
                const nextState = {
                    rooms: state.rooms.filter((room) => room.roomId !== roomId)
                };

                return state.selectedRoomId === roomId
                    ? { ...nextState, ...buildRoomSelection() }
                    : nextState;
            }),

            // Action to set full room state on join
            setJoinedRoom: (roomId, name, users) => set(buildRoomSelection(roomId, name, users)),
            markRoomJoinPending: (roomId) => set((state) => {
                const targetRoom = state.rooms.find((room) => room.roomId === roomId);

                return {
                    selectedRoomId: roomId,
                    selectedRoomName: targetRoom?.name || (state.selectedRoomId === roomId ? state.selectedRoomName : ''),
                    joinedRoomId: null,
                    roomUsers: []
                };
            }),

            setRoomUsers: (users) => set({ roomUsers: users }),

            updateRoomUser: (funId, newName) => set((state) => ({
                roomUsers: state.roomUsers.map(u => u.funId === funId ? { ...u, name: newName } : u)
            })),

            // Chat Messages (Global/Room) - not persisted
            messages: [],
            addMessage: (msg) => set((state) => ({
                messages: clampMessages([...state.messages, msg])
            })),
            setMessages: (msgs) => set({ messages: msgs }),
            removeMessage: (messageId) => set((state) => ({
                messages: state.messages.filter((msg) => String(msg.id) !== String(messageId))
            })),

            // Private Messages
            privateMessages: [],
            addPrivateMessage: (msg) => set((state) => ({
                privateMessages: clampMessages([...state.privateMessages, msg])
            })),
            removePrivateMessage: (messageId) => set((state) => ({
                privateMessages: state.privateMessages.filter((msg) => String(msg.id) !== String(messageId))
            })),

            // Actions
            clearMessages: () => set({ messages: [] }),
            clearPrivateMessages: () => set({ privateMessages: [] }),
        }),
        {
            name: 'room-storage',
            // Only persist selectedRoomId and selectedRoomName for auto-rejoin
            partialize: (state) => ({
                selectedRoomId: state.selectedRoomId,
                selectedRoomName: state.selectedRoomName
            })
        }
    )
);

export default useRoomStore;
