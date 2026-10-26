import { useEffect, useRef, useState } from "react";
import { useToast } from "./ToastProvider";

/** Only report success after the clipboard operation completes. */
export function useClipboardText() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const toast = useToast();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (!mounted.current) return;
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (mounted.current) toast.error("The clipboard is unavailable. Please select and copy the text manually.", "Could not copy");
    }
  };
  return { copied, copyText };
}
