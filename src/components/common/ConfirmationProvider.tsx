import { createContext, useContext, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

interface Confirmation {
  title: string;
  message: ReactNode;
  confirmText?: string;
  variant?: "danger" | "warning" | "primary";
}
type RequestConfirmation = (options: Confirmation, action: () => void | Promise<void>) => void;
const ConfirmationContext = createContext<RequestConfirmation | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(Confirmation & { action: () => void | Promise<void> }) | null>(null);
  return <ConfirmationContext.Provider value={(options, action) => setRequest({ ...options, action })}>
    {children}
    {request && <ConfirmDialog isOpen title={request.title} message={request.message}
      confirmText={request.confirmText} variant={request.variant} onConfirm={request.action}
      onClose={() => setRequest(null)} />}
  </ConfirmationContext.Provider>;
}

export function useConfirmation(): RequestConfirmation {
  const request = useContext(ConfirmationContext);
  if (!request) throw new Error("ConfirmationProvider is required for destructive actions.");
  return request;
}
