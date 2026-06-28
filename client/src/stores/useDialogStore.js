import { create } from 'zustand';

let dialogId = 0;

const createDialog = (set, options) => new Promise((resolve) => {
    const id = ++dialogId;
    set({
        dialog: {
            id,
            type: options.type || 'alert',
            title: options.title || '提示',
            message: options.message || '',
            confirmText: options.confirmText || '确定',
            cancelText: options.cancelText || '取消',
            defaultValue: options.defaultValue || '',
            placeholder: options.placeholder || '',
            danger: Boolean(options.danger),
            resolve
        }
    });
});

const useDialogStore = create((set, get) => ({
    dialog: null,
    alert: (options) => createDialog(set, {
        type: 'alert',
        confirmText: '知道了',
        ...options
    }),
    confirm: (options) => createDialog(set, {
        type: 'confirm',
        ...options
    }),
    prompt: (options) => createDialog(set, {
        type: 'prompt',
        ...options
    }),
    closeDialog: (value) => {
        const current = get().dialog;
        if (!current) return;

        set({ dialog: null });
        current.resolve(value);
    }
}));

export const showAlert = (options) => useDialogStore.getState().alert(options);
export const showConfirm = (options) => useDialogStore.getState().confirm(options);
export const showPrompt = (options) => useDialogStore.getState().prompt(options);

export default useDialogStore;
