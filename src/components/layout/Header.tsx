import { Cpu, Scan } from "lucide-react";
import { NavigationTab } from "../../types";
import { useTextractorStore } from "../../stores/useTextractorStore";
import { useOcrStore } from "../../stores/useOcrStore";

const tabTitles: Record<NavigationTab, { title: string; subtitle: string; section: string }> = {
  "live-game": { title: "Live translation", subtitle: "Real-time game dialogue capture, MT & LLM stream", section: "Workspace" },
  "batch-translate": { title: "Script translator", subtitle: "Batch file translation with terminology and context memory", section: "Workspace" },
  "glossary": { title: "Glossary & terms", subtitle: "Manage character names, custom terminology, and VNDB data", section: "Library" },
  "script-memory": { title: "Script memory", subtitle: "Translation memory database, JSON/JSONL editing, and fuzzy search", section: "Library" },
  "knowledge-base": { title: "Glossary & terms", subtitle: "Manage character names, custom terminology, and VNDB data", section: "Library" },
  settings: { title: "Settings", subtitle: "Translation providers, language preferences, and shortcuts", section: "System" },
  logs: { title: "Activity & usage", subtitle: "Token metrics, translation costs, and application events", section: "System" },
};

export function Header({ currentTab }: { currentTab: NavigationTab }) {
  const info = tabTitles[currentTab];
  const isHooked = useTextractorStore((state) => state.isHooked);
  const isScanning = useOcrStore((state) => state.isScanning);

  return (
    <header className="app-header">
      <div className="header-copy">
        <div className="header-eyebrow">{info.section}<span aria-hidden="true">/</span>VN Translator</div>
        <h1>{info.title}</h1>
        <p>{info.subtitle}</p>
      </div>
      <div className="header-status" aria-label="Capture status">
        <span className={`capture-status${isHooked ? " is-connected" : ""}`}><Cpu size={13} /> Hook {isHooked ? "connected" : "offline"}</span>
        <span className={`capture-status${isScanning ? " is-connected" : ""}`}><Scan size={13} /> OCR {isScanning ? "scanning" : "idle"}</span>
      </div>
    </header>
  );
}
