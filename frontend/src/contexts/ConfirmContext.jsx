/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';

const ConfirmContext = createContext(null);

export const ConfirmProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setDialog({
      title: options?.title || '确认操作',
      description: options?.description || '',
      confirmLabel: options?.confirmLabel || '确认',
      tone: options?.tone || 'default',
    });
  }), []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {dialog && (
        <div className="ui-dialog-backdrop" role="presentation" onMouseDown={() => close(false)}>
          <div
            className="ui-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ui-dialog__header">
              <div className={`ui-dialog__icon ui-dialog__icon--${dialog.tone}`}>
                <AlertTriangle size={19} aria-hidden="true" />
              </div>
              <IconButton icon={X} label="关闭" size="sm" onClick={() => close(false)} />
            </div>
            <h2 id="confirm-dialog-title">{dialog.title}</h2>
            {dialog.description && <p>{dialog.description}</p>}
            <div className="ui-dialog__actions">
              <Button onClick={() => close(false)}>取消</Button>
              <Button variant={dialog.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
                {dialog.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside ConfirmProvider');
  return context;
};
