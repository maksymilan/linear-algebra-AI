/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import IconButton from '../components/ui/IconButton';

const ToastContext = createContext(null);
const toneIcons = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, tone = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, message, tone }]);
    if (duration > 0) {
      window.setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const value = useMemo(() => ({ showToast, removeToast }), [showToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toast-viewport" aria-live="polite">
        {toasts.map((toast) => {
          const ToneIcon = toneIcons[toast.tone] || Info;
          return (
            <div key={toast.id} className={`ui-toast ui-toast--${toast.tone}`}>
              <ToneIcon size={17} aria-hidden="true" />
              <span>{toast.message}</span>
              <IconButton icon={X} label="关闭提示" size="sm" onClick={() => removeToast(toast.id)} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
};
