import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

// toast.show({ message, actionLabel, onAction, tone: 'default' | 'error', duration }) -> id
export function useToast() {
  return useContext(ToastContext);
}
