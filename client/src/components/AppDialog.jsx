import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertTriangle, FiEdit3, FiInfo, FiX } from 'react-icons/fi';
import useDialogStore from '../stores/useDialogStore';

const AppDialog = () => {
    const dialog = useDialogStore((state) => state.dialog);
    const closeDialog = useDialogStore((state) => state.closeDialog);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!dialog) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeDialog(dialog.type === 'alert' ? true : null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeDialog, dialog]);

    if (!dialog) return null;

    const isPrompt = dialog.type === 'prompt';
    const isAlert = dialog.type === 'alert';

    const handleConfirm = () => {
        if (isPrompt) {
            closeDialog(inputRef.current?.value || '');
            return;
        }

        closeDialog(true);
    };

    const handleCancel = () => {
        closeDialog(isAlert ? true : null);
    };

    return createPortal(
        <div className="app-dialog-overlay" onClick={handleCancel}>
            <section
                className={`app-dialog ${dialog.danger ? 'danger' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="app-dialog-title"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="app-dialog__header">
                    <div className="app-dialog__icon">
                        {dialog.danger ? (
                            <FiAlertTriangle size={18} />
                        ) : isPrompt ? (
                            <FiEdit3 size={18} />
                        ) : (
                            <FiInfo size={18} />
                        )}
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={handleCancel}
                        aria-label="关闭"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                <div className="app-dialog__body">
                    <h3 id="app-dialog-title">{dialog.title}</h3>
                    {dialog.message && <p>{dialog.message}</p>}
                    {isPrompt && (
                        <input
                            ref={inputRef}
                            className="input app-dialog__input"
                            defaultValue={dialog.defaultValue}
                            placeholder={dialog.placeholder}
                            autoFocus
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    handleConfirm();
                                }
                            }}
                        />
                    )}
                </div>

                <div className="app-dialog__actions">
                    {!isAlert && (
                        <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                            {dialog.cancelText}
                        </button>
                    )}
                    <button
                        type="button"
                        className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                        onClick={handleConfirm}
                    >
                        {dialog.confirmText}
                    </button>
                </div>
            </section>
        </div>,
        document.body
    );
};

export default AppDialog;
