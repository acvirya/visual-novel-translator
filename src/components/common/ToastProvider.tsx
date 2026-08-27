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

  const getTypeTheme = (type: ToastType) => {
    switch (type) {
      case "success":
        return {
          icon: <CheckCircle2 size={16} color="var(--accent-success)" style={{ flexShrink: 0, marginTop: "1px" }} />,
          accentBorder: "var(--accent-success)",
        };
      case "error":
        return {
          icon: <AlertCircle size={16} color="var(--accent-danger)" style={{ flexShrink: 0, marginTop: "1px" }} />,
          accentBorder: "var(--accent-danger)",
        };
      case "warning":
        return {
          icon: <AlertTriangle size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "1px" }} />,
          accentBorder: "var(--accent-gold)",
        };
      default:
        return {
          icon: <Info size={16} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: "1px" }} />,
          accentBorder: "var(--accent-cyan)",
        };
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, dismissToast }}>
      {children}
      {/* Toast Container Floating Top-Right */}
      <div
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          maxWidth: "380px",
          width: "100%",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => {
          const theme = getTypeTheme(toast.type);
          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                padding: "10px 14px",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderLeft: `3.5px solid ${theme.accentBorder}`,
                borderRadius: "var(--radius-md)",
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
                transition: "opacity 0.2s ease, transform 0.2s ease",
              }}
            >
              {theme.icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                      marginBottom: "2px",
                      letterSpacing: "0.2px",
                    }}
                  >
                    {toast.title}
                  </div>
                )}
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.45",
                    wordBreak: "break-word",
                  }}
                >
                  {toast.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-sm)",
                  transition: "color 0.15s ease",
                }}
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
