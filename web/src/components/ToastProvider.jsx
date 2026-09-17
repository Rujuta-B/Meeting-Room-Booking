// src/components/ToastProvider.jsx
//
// A lightweight, self-vanishing notification for SAVE-CONFIRMATION
// feedback specifically - distinct in purpose from ErrorBanner/
// BookingConflictBanner, which stay on screen because they explain a
// FAILURE the user must act on. A toast here only confirms something that
// already succeeded, so it's safe (and better UX) for it to disappear on
// its own after a few seconds.
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((message, { duration = 3000 } = {}) => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
