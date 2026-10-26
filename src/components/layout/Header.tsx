import { Cpu, Scan } from "lucide-react";
import { NavigationTab } from "../../types";
import { useTextractorStore } from "../../stores/useTextractorStore";
import { useOcrStore } from "../../stores/useOcrStore";

const tabTitles: Record<NavigationTab, { title: string; subtitle: string; section: string }> = {
  "live-game": { title: "Live translation", subtitle: "Keep the story moving. Capture, translate, and read in game.", section: "Workspace" },
  "batch-translate": { title: "Script translator", subtitle: "Translate your files with consistent context and terminology.", section: "Workspace" },
  "knowledge-base": { title: "Knowledge base", subtitle: "The characters, terms, and translations behind your story.", section: "Library" },
  settings: { title: "Make it yours", subtitle: "Translation providers, language preferences, and shortcuts.", section: "Settings" },
  logs: { title: "Activity & usage", subtitle: "Follow translation activity, costs, and application events.", section: "Tools" },
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
