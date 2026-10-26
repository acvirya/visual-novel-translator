import { useState } from "react";
import { Globe, KeyRound } from "lucide-react";
import { settingsManager } from "../../../services/settingsManager";
import { useToast } from "../../common/ToastProvider";
import { useConfirmation } from "../../common/ConfirmationProvider";

export function FreeMtCard() {
  const [key, setKey] = useState(() => settingsManager.getDeepLApiKey());
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirm = useConfirmation();

  const saveKey = async () => {
    setSaving(true);
    try {
      await settingsManager.setLlmApiKey("deepl", key);
      toast.success(key.trim() ? "DeepL API key saved securely." : "DeepL API key removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (settingsManager.getDeepLApiKey() && settingsManager.getDeepLApiKey() !== key.trim()) {
      confirm({ title: key.trim() ? "Replace DeepL API key?" : "Remove DeepL API key?", message: "Replace the saved DeepL credential with this edited value?", confirmText: key.trim() ? "Replace key" : "Remove key", variant: "warning" }, saveKey);
    } else void saveKey();
  };

  return (
    <section className="card" style={{ margin: 0 }} aria-labelledby="mt-engines-title">
      <div className="card-header"><div>
        <h2 id="mt-engines-title" className="card-title"><Globe size={16} /> Machine translation</h2>
        <p className="card-subtitle">Choose these engines from the translation model menu. An internet connection is required.</p>
      </div></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16 }}>
        <div style={{ padding: 16, background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
          <h3 style={{ fontSize: 14 }}>Google Translate</h3>
          <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>Available without an API key. Suitable for translating dialogue as you play.</p>
        </div>
        <div style={{ padding: 16, background: "var(--bg-app)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", minWidth: 0 }}>
          <h3 style={{ fontSize: 14 }}>DeepL API Free</h3>
          <p style={{ color: "var(--text-secondary)", margin: "8px 0 12px" }}>Requires a DeepL API Free key. Request errors are shown for the selected engine.</p>
          <label htmlFor="deepl-api-key" style={{ display: "block", marginBottom: 6 }}>API key</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input id="deepl-api-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="DeepL API Free key" style={{ flex: "1 1 160px", minWidth: 0, width: "100%" }} />
            <button type="button" className="btn-secondary" disabled={saving} onClick={requestSave}><KeyRound size={14} />{saving ? "Saving..." : "Save key"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
