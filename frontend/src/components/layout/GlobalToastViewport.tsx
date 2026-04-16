import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import type { ToastType } from '../../context/ToastContext';
import { useToast } from '../../context/ToastContext';

function getToastIcon(type: ToastType) {
  switch (type) {
    case 'success':
      return CheckCircle2;
    case 'error':
      return AlertCircle;
    case 'warning':
      return AlertTriangle;
    case 'info':
      return Info;
  }
}

function getToastStyle(type: ToastType): { container: string; icon: string } {
  switch (type) {
    case 'success':
      return {
        container: 'border-slate-200 bg-white text-slate-900',
        icon: 'text-emerald-600',
      };
    case 'error':
      return {
        container: 'border-slate-200 bg-white text-slate-900',
        icon: 'text-red-600',
      };
    case 'warning':
      return {
        container: 'border-slate-200 bg-white text-slate-900',
        icon: 'text-amber-600',
      };
    case 'info':
      return {
        container: 'border-slate-200 bg-white text-slate-900',
        icon: 'text-blue-600',
      };
  }
}

export function GlobalToastViewport() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 top-20 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = getToastIcon(toast.type);
        const styles = getToastStyle(toast.type);

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-md border p-3 shadow-sm ${styles.container}`}
          >
            <div className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${styles.icon}`} aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm leading-5">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded p-1 text-slate-500 hover:bg-black/5 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
