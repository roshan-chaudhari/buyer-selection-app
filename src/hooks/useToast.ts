import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastState {
  message: string;
  type: ToastType;
}

export function useToast(): {
  toast: ToastState | null;
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
} {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  }, []);

  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    toast,
    showToast,
    clearToast,
  };
}
