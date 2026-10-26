import { BookOpen, ChevronLeft, ChevronRight, Languages, Layers, Radio, ScrollText, Sliders } from "lucide-react";
import { NavigationTab } from "../../types";
import { useTextractorStore } from "../../stores/useTextractorStore";
import { useOcrStore } from "../../stores/useOcrStore";
import { useBatchStore } from "../../stores/useBatchStore";

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const navigation = [
  { id: "live-game", label: "Live translation", shortLabel: "Live", icon: Radio, group: "Workspace" },
  { id: "batch-translate", label: "Script translator", shortLabel: "Scripts", icon: Layers, group: "Workspace" },
  { id: "knowledge-base", label: "Knowledge base", shortLabel: "Library", icon: BookOpen, group: "Library & tools" },
  { id: "logs", label: "Activity & usage", shortLabel: "Activity", icon: ScrollText, group: "Library & tools" },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: Sliders, group: "Library & tools" },
] as const;

export function Sidebar({ currentTab, onSelectTab, isCollapsed, onToggleCollapse }: SidebarProps) {
  const isHooked = useTextractorStore((state) => state.isHooked);
  const isScanning = useOcrStore((state) => state.isScanning);
  const isBatchRunning = useBatchStore((state) => state.isRunning);
  const isActive = isHooked || isScanning || isBatchRunning;
  const status = isBatchRunning ? "Translating scripts" : isHooked ? "Game connected" : isScanning ? "Capturing screen" : "Ready when you are";

  return (
    <aside className={`sidebar${isCollapsed ? " sidebar--collapsed" : ""}`} aria-label="Application sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" aria-hidden="true"><Languages size={23} strokeWidth={1.6} /></div>
        <div className="sidebar-brand-copy"><strong>VN Translator</strong><span>A window into the story.</span></div>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map((item, index) => (
          <div className="sidebar-nav-item" key={item.id}>
            {(index === 0 || item.group !== navigation[index - 1].group) && (
              <div className="sidebar-section-label">{item.group}</div>
            )}
            <button
              type="button"
              className={`sidebar-link${currentTab === item.id ? " is-active" : ""}`}
              aria-current={currentTab === item.id ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => onSelectTab(item.id)}
            >
              <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
              <span className="sidebar-link-label">{item.label}</span>
              <span className="sidebar-short-label">{item.shortLabel}</span>
            </button>
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-status" title={status}>
          <span className={`status-dot${isActive ? " status-dot--active" : ""}`} />
          <span className="sidebar-status-label">{status}</span>
        </div>
        <button type="button" className="sidebar-collapse" onClick={onToggleCollapse} aria-expanded={!isCollapsed} aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          <span>Collapse sidebar</span>
        </button>
      </div>
    </aside>
  );
}
