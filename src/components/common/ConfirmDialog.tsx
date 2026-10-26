import React, { useState } from "react";
import { Modal } from "./Modal";
import { AlertTriangle, Trash2, RotateCcw } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary";
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", variant = "danger", isLoading = false }) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = isLoading || pending;
  const confirm = async () => {
    if (busy) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };
  const icon = variant === "danger" ? <Trash2 size={20} /> : variant === "warning" ? <AlertTriangle size={20} /> : <RotateCcw size={20} />;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={icon} maxWidth="460px" closeDisabled={busy} footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{cancelText}</button><button type="button" className={variant === "danger" ? "btn-danger" : "btn-primary"} onClick={() => { void confirm(); }} disabled={busy}>{busy ? "Processing…" : confirmText}</button></>}>
      <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.65 }}>{message}</div>
      {error && <p role="alert" style={{ color: "var(--accent-danger)", marginTop: 12 }}>{error}</p>}
    </Modal>
  );
};
