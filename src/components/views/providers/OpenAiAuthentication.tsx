import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, LogIn, LogOut, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useConfirmation } from "../../common/ConfirmationProvider";
import { TauriBridge } from "../../../services/tauriBridge";
import { settingsManager } from "../../../services/settingsManager";
import { SecureStorageService } from "../../../services/secureStorageService";
import { LlmDispatcherService } from "../../../services/providers/llmDispatcherService";
import type { StoredProviderConfig } from "../../../services/providers/llmProviderRegistry";
import { hasConnectedOpenAiAccount, type OpenAiAuthMethod, type OpenAiAuthStatus } from "../../../types/openaiAuth";

interface Props {
  config: StoredProviderConfig;
  disabled: boolean;
  onConfigChange: (config: StoredProviderConfig) => void;
  beforeMethodChange?: () => Promise<unknown>;
}

export function OpenAiAuthentication({ config, disabled, onConfigChange, beforeMethodChange }: Props) {
  const confirm = useConfirmation();
  const desktop = SecureStorageService.isTauriEnvironment();
  const [status, setStatus] = useState<OpenAiAuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const callback = useRef(onConfigChange);
  callback.current = onConfigChange;
  const mounted = useRef(true);
  const method = config.authMethod === "oauth" ? "oauth" : "api_key";

  const syncStatus = useCallback(async (refreshModels = false) => {
    const next = await TauriBridge.openAiAuthStatus();
    if (!mounted.current) return;
    setStatus(next);
    settingsManager.updateOpenAiAuthStatus(next);
    callback.current(settingsManager.getLlmProvider("openai"));
    if (next.error) setError(next.error);
    if (refreshModels && next.authMethod === "oauth" && hasConnectedOpenAiAccount(next)) {
      const models = await LlmDispatcherService.fetchProviderModels("openai", "");
      if (!mounted.current) return;
      // Do not let a slow catalog response overwrite a newer method/account selection.
      const current = await TauriBridge.openAiAuthStatus();
      if (current.authMethod !== "oauth" || current.selectedAccountId !== next.selectedAccountId) return;
      await settingsManager.saveLlmProvider({ ...settingsManager.getLlmProvider("openai"), customModels: models });
      callback.current(settingsManager.getLlmProvider("openai"));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (desktop) void syncStatus(true).catch(e => { if (mounted.current) setError(String(e)); });
    return () => { mounted.current = false; };
  }, [desktop, syncStatus]);

  // Poll summaries only while authorization is pending; no tokens or auth URLs enter React.
  useEffect(() => {
    if (!status?.pending || !desktop) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await TauriBridge.openAiAuthStatus();
        if (stopped) return;
        if (!next.pending) { await syncStatus(!next.error); return; }
        setStatus(next);
        timer = setTimeout(() => void poll(), 1000);
      } catch (e) {
        if (!stopped) { setError(String(e)); timer = setTimeout(() => void poll(), 2500); }
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [status?.pending, desktop, syncStatus]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (mounted.current) setBusy(false); }
  };

  const changeMethod = (authMethod: OpenAiAuthMethod) => {
    if (authMethod === method) return;
    const change = () => run(async () => {
      await beforeMethodChange?.();
      const saved = settingsManager.getLlmProvider("openai");
      await settingsManager.saveLlmProvider({ ...saved, authMethod, isVerified: false, customModels: [] });
      callback.current(settingsManager.getLlmProvider("openai"));
      if (desktop) await syncStatus(authMethod === "oauth");
    });
    if (config.isVerified || status?.pending) {
      confirm({ title: "Switch OpenAI authentication?", message: "Active OpenAI requests and any pending sign-in will be cancelled. Your other credentials stay saved and inactive.", confirmText: "Switch method", variant: "warning" }, change);
    } else void change();
  };

  const startLogin = (accountId?: string) => run(async () => { await TauriBridge.openAiOAuthStart(accountId); await syncStatus(); });
  const selected = status?.accounts.find(account => account.id === status.selectedAccountId);
  const blocked = disabled || busy;
  return <div className="openai-auth">
    <fieldset className="openai-auth-methods" disabled={blocked}>
      <legend>Authentication method</legend>
      <label><input type="radio" name="openai-auth-method" value="api_key" checked={method === "api_key"} onChange={() => changeMethod("api_key")} /><span>API key<small>OpenAI API billing</small></span></label>
      <label><input type="radio" name="openai-auth-method" value="oauth" checked={method === "oauth"} onChange={() => changeMethod("oauth")} /><span>OAuth · ChatGPT<small>Use your ChatGPT plan</small></span></label>
    </fieldset>
    {method === "oauth" && <div className="openai-oauth-panel" aria-busy={busy || status?.pending}>
      <div className="openai-oauth-heading"><ShieldCheck size={18} /><div><strong>{selected?.connected ? "Using ChatGPT plan" : "Connect your ChatGPT account"}</strong><p>Eligible requests use your ChatGPT plan or available credits. Access and usage limits depend on your account.</p></div></div>
      {!desktop && <p className="openai-auth-notice">OAuth sign-in is available in the Windows desktop app. Browser preview cannot access protected credentials.</p>}
      {status?.accounts.length ? <div className="openai-account-picker">
        <label htmlFor="openai-oauth-account">ChatGPT account</label>
        <select id="openai-oauth-account" value={status.selectedAccountId ?? ""} disabled={blocked || status.pending} onChange={e => {
          const account = status.accounts.find(a => a.id === e.target.value);
          if (!account) return;
          if (account.connected) void run(async () => { await TauriBridge.openAiOAuthSelect(account.id); await syncStatus(true); });
          else void startLogin(account.id);
        }}>
          <option value="" disabled>Select a saved account</option>
          {status.accounts.map((account, index) => <option key={account.id} value={account.id}>{account.email || "ChatGPT account"} · Connection {index + 1}{account.connected ? "" : " (signed out)"}</option>)}
        </select>
      </div> : null}
      <div className="openai-auth-actions">
        {status?.pending ? <><span role="status"><RefreshCw size={14} className="spin" /> Waiting for browser sign-in…</span><button className="btn-secondary" disabled={blocked} onClick={() => void run(async () => { await TauriBridge.openAiOAuthCancel(); await syncStatus(); })}><X size={14} />Cancel sign-in</button></> : <>
          {<button className={selected?.connected ? "btn-secondary" : "btn-primary"} disabled={blocked || !desktop} onClick={() => void startLogin(status?.selectedAccountId ?? undefined)}><LogIn size={15} />Continue with ChatGPT</button>}
          {selected?.connected && <>
            <span className="openai-connected"><CheckCircle2 size={14} />Connected</span>
            <button className="btn-secondary" disabled={blocked} onClick={() => void run(() => syncStatus(true))}><RefreshCw size={14} />Refresh models</button>
            <button className="btn-secondary" disabled={blocked} onClick={() => confirm({ title: "Sign out of ChatGPT?", message: "Stop active OpenAI translations and end this connection's renewable session? The account remains listed for later sign-in.", confirmText: "Sign out", variant: "warning" }, () => run(async () => {
              const revoked = await TauriBridge.openAiOAuthDisconnect(selected.id);
              await syncStatus();
              if (!revoked) setNotice("Signed out on this device. Remote revocation could not be confirmed; disconnect this app in ChatGPT settings to revoke access.");
            }))}><LogOut size={14} />Sign out</button>
          </>}
          {!!status?.accounts.length && <button className="btn-secondary" disabled={blocked || !desktop} onClick={() => void startLogin()}><Plus size={14} />Add account</button>}
        </>}
        <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer" className="openai-usage-link">Manage usage<ExternalLink size={12} /></a>
      </div>
      {selected?.connected && <small className="openai-auth-note">OAuth uses OpenAI's Responses API. Sampling and output-token overrides are not sent with ChatGPT plan requests.</small>}
    </div>}
    {error && <p role="alert" className="openai-auth-error">{error}</p>}
    {notice && <p role="status" className="openai-auth-notice">{notice}</p>}
  </div>;
}
