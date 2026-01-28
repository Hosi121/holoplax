"use client";

import { AlertCircle, CheckCircle, Info, X, XCircle } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

const toastStyles: Record<ToastType, { bg: string; border: string; icon: ReactNode }> = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: <CheckCircle size={18} className="text-emerald-600" />,
  },
  error: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    icon: <XCircle size={18} className="text-rose-600" />,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: <AlertCircle size={18} className="text-amber-600" />,
  },
  info: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    icon: <Info size={18} className="text-sky-600" />,
  },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const styles = toastStyles[toast.type];

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${styles.bg} ${styles.border}`}
      role="alert"
      aria-live="polite"
    >
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <p className="flex-1 text-sm text-slate-700">{toast.message}</p>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-slate-400 transition hover:text-slate-600"
        aria-label="閉じる"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-end justify-start gap-2 p-4"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full max-w-sm animate-slide-in">
          <ToastItem toast={toast} onRemove={() => onRemove(toast.id)} />
        </div>
      ))}
    </div>
  );
}

const DEFAULT_DURATION = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", duration = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const toast: Toast = { id, message, type, duration };

      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (message: string, duration?: number) => addToast(message, "success", duration),
    [addToast],
  );

  const error = useCallback(
    (message: string, duration?: number) => addToast(message, "error", duration ?? 8000),
    [addToast],
  );

  const warning = useCallback(
    (message: string, duration?: number) => addToast(message, "warning", duration),
    [addToast],
  );

  const info = useCallback(
    (message: string, duration?: number) => addToast(message, "info", duration),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}
