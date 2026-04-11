import React, { createContext, useContext, useCallback, useState, useRef } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  pushToast: (type: ToastType, message: string) => void;
  toasts: ToastMessage[];
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const MAX_VISIBLE_TOASTS = 4;
const TOAST_DURATION_MS = 4200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(1);

  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = toastIdRef.current++;
    setToasts((current) =>
      [...current, { id, type, message }].slice(-MAX_VISIBLE_TOASTS)
    );

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast, toasts, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
