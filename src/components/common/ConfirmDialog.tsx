import React from "react";
import { Modal } from "./Modal";
import { AlertTriangle, Trash2, RotateCcw } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary";
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  isLoading = false,
}) => {
  const getIcon = () => {
    switch (variant) {
      case "danger":
        return <Trash2 size={20} className="text-rose-400" />;
      case "warning":
        return <AlertTriangle size={20} className="text-amber-400" />;
      default:
        return <RotateCcw size={20} className="text-indigo-400" />;
    }
  };

  const getConfirmButtonBg = () => {
    switch (variant) {
      case "danger":
        return "linear-gradient(135deg, #ef4444, #dc2626)";
      case "warning":
        return "linear-gradient(135deg, #f59e0b, #d97706)";
      default:
        return "linear-gradient(135deg, #6366f1, #4f46e5)";
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={getIcon()}
      maxWidth="460px"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              color: "#e5e7eb",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={isLoading}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              background: getConfirmButtonBg(),
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
            }}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </>
      }
    >
      <div style={{ color: "#d1d5db", fontSize: "14px", lineHeight: "1.6" }}>
        {typeof message === "string" ? <p style={{ margin: 0 }}>{message}</p> : message}
      </div>
    </Modal>
  );
};
