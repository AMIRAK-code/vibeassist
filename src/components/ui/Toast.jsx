import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ToastContext } from './toast-context';

// Short confirmations with an optional action (usually Undo). Announced politely to screen
// readers. Toasts with an action stay longer, and the countdown pauses while the pointer or
// keyboard focus is on the toast so Undo can't vanish mid-reach.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map()); // id -> { timeout, deadline, remaining }

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id)?.timeout);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback((id, ms) => {
    timers.current.set(id, { timeout: setTimeout(() => dismiss(id), ms), deadline: Date.now() + ms });
  }, [dismiss]);

  const pause = useCallback((id) => {
    const timer = timers.current.get(id);
    if (!timer || timer.remaining !== undefined) return;
    clearTimeout(timer.timeout);
    timers.current.set(id, { remaining: Math.max(timer.deadline - Date.now(), 2000) });
  }, []);

  const resume = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer?.remaining !== undefined) schedule(id, timer.remaining);
  }, [schedule]);

  const show = useCallback(({ message, actionLabel, onAction, tone = 'default', duration }) => {
    const id = crypto.randomUUID();
    setToasts((list) => [...list.slice(-2), { id, message, actionLabel, onAction, tone }]);
    schedule(id, duration ?? (actionLabel ? 10000 : 5000));
    return id;
  }, [schedule]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast${t.tone === 'error' ? ' toast--error' : ''}`}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            onFocus={() => pause(t.id)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) resume(t.id); }}
          >
            <p>{t.message}</p>
            {t.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  t.onAction();
                }}
              >
                {t.actionLabel}
              </button>
            )}
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
