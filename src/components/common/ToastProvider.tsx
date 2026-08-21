import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, title?: string, durationMs?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      showToast: (msg) => console.log("[Toast]", msg),
      success: (msg) => console.log("[Toast:Success]", msg),
      error: (msg) => console.error("[Toast:Error]", msg),
      warning: (msg) => console.warn("[Toast:Warning]", msg),
      info: (msg) => console.info("[Toast:Info]", msg),
      dismissToast: () => {},
    };
  }
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", title?: string, durationMs = 3500) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = { id, message, type, title, durationMs };

      setToasts((prev) => [newToast, ...prev].slice(0, 5));

      if (durationMs > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, title?: string) => showToast(message, "success", title),
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string) => showToast(message, "error", title, 5000),
    [showToast]
  );

  const warning = useCallback(
    (message: string, title?: string) => showToast(message, "warning", title, 4000),
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string) => showToast(message, "info", title),
    [showToast]
  );

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-sky-400 shrink-0" />;
    }
  };

  const getBorderColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "border-emerald-500/40 bg-emerald-950/80 text-emerald-100";
      case "error":
        return "border-rose-500/40 bg-rose-950/80 text-rose-100";
      case "warning":
        return "border-amber-500/40 bg-amber-950/80 text-amber-100";
      default:
        return "border-sky-500/40 bg-sky-950/80 text-sky-100";
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, dismissToast }}>
      {children}
      {/* Toast Container Floating Top-Right */}
      <div
        className="toast-container fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-3"
        style={{ position: "fixed", top: "16px", right: "16px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px", maxWidth: "420px" }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${getBorderColor(
              toast.type
            )}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              backdropFilter: "blur(12px)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
            }}
          >
            {getIcon(toast.type)}
            <div className="flex-1 min-w-0" style={{ flex: 1, minWidth: 0 }}>
              {toast.title && (
                <div className="text-xs font-semibold uppercase tracking-wider mb-0.5 opacity-90" style={{ fontWeight: 600, fontSize: "12px", marginBottom: "2px" }}>
                  {toast.title}
                </div>
              )}
              <div className="text-xs leading-relaxed" style={{ fontSize: "13px", lineHeight: "1.4", wordBreak: "break-word" }}>
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-white/60 hover:text-white p-1 rounded-md transition-colors"
              style={{ background: "transparent", border: "none", cursor: "pointer", opacity: 0.7, padding: "2px" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
