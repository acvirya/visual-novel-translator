import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  closeDisabled?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, icon, children, footer, maxWidth = "540px", closeDisabled = false }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const opener = document.activeElement;
    // Native modal dialogs make the background inert, trap focus, and restore
    // it to the opener when closed, including nested dialog interactions.
    dialog.showModal();
    return () => {
      dialog.close();
      // React removes the dialog before passive cleanup runs; restore focus
      // explicitly because the browser cannot do so after that removal.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return createPortal(
    <dialog ref={dialogRef} className="modal-dialog" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined} style={{ maxWidth }} onCancel={(event) => { event.preventDefault(); if (!closeDisabled) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
      <div className="modal-panel">
        <header className="modal-header">
          <div className="modal-heading">
            {icon && <span className="modal-icon" aria-hidden="true">{icon}</span>}
            <div><h2 id={titleId}>{title}</h2>{subtitle && <p id={subtitleId}>{subtitle}</p>}</div>
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={closeDisabled}><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
};
