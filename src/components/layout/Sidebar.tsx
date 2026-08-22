import React from "react";
import {
  Radio,
  Layers,
  BookOpen,
  Sliders,
  Menu,
  Languages,
  Bot,
} from "lucide-react";
import { NavigationTab } from "../../types";
import { useTextractorStore } from "../../stores/useTextractorStore";
import { useOcrStore } from "../../stores/useOcrStore";
import { useTranslationStore } from "../../stores/useTranslationStore";
import { useBatchStore } from "../../stores/useBatchStore";

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
}) => {
  const isHooked = useTextractorStore((state) => state.isHooked);
  const isOcrScanning = useOcrStore((state) => state.isScanning);
  const isBatchRunning = useBatchStore((state) => state.isRunning);
  const selectedProvider = useTranslationStore((state) => state.selectedProvider);

  // Status calculation (Green when live or batch active, Blue when standby)
  const isEngineActive = isHooked || isOcrScanning || isBatchRunning;
  let statusText = "Engine Standby";
  if (isBatchRunning) statusText = "Batch Translating";
  else if (isHooked) statusText = "Live Hook Active";
  else if (isOcrScanning) statusText = "Live OCR Active";

  // Friendly model name formatting
  const formatModelName = (id: string) => {
    if (!id || id === "mt:google-translate") return "Google Translate";
    if (id.startsWith("openrouter:")) {
      const clean = id.replace("openrouter:", "");
      const parts = clean.split("/");
      return parts[parts.length - 1]
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    const parts = id.split("/");
    return parts[parts.length - 1]
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const modelDisplayName = formatModelName(selectedProvider);

  const sections: NavSection[] = [
    {
      title: "Workspace",
      items: [
        { id: "live-game", label: "Live Game", icon: <Radio size={16} /> },
        { id: "batch-translate", label: "Batch Script", icon: <Layers size={16} /> },
      ],
    },
    {
      title: "Data & Config",
      items: [
        { id: "knowledge-base", label: "Knowledge Base", icon: <BookOpen size={16} /> },
        { id: "settings", label: "Settings", icon: <Sliders size={16} /> },
      ],
    },
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)",
        backgroundColor: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        transition: "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Brand & Burger Button Header */}
      <div
        style={{
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          justifyContent: isCollapsed ? "center" : "space-between",
          padding: isCollapsed ? "0" : "0 14px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {!isCollapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--accent-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 2px 8px rgba(78, 115, 223, 0.3)",
              }}
            >
              <Languages size={17} />
            </div>
            <span
              style={{
                fontWeight: 700,
                fontSize: "13.5px",
                letterSpacing: "-0.2px",
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
              }}
            >
              VN Translator
            </span>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            padding: "7px",
            borderRadius: "var(--radius-sm)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Navigation Links */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: isCollapsed ? "12px 6px" : "12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {sections.map((section) => (
          <div key={section.title}>
            {!isCollapsed && (
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                  color: "var(--text-muted)",
                  padding: "0 8px 6px 8px",
                }}
              >
                {section.title}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {section.items.map((item) => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    title={isCollapsed ? item.label : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: isCollapsed ? "center" : "flex-start",
                      gap: "10px",
                      width: "100%",
                      padding: isCollapsed ? "10px 0" : "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: isActive ? "var(--accent-primary)" : "transparent",
                      color: isActive ? "#ffffff" : "var(--text-secondary)",
                      fontWeight: isActive ? 600 : 500,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center" }}>{item.icon}</span>
                    {!isCollapsed && (
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: "13px",
                        }}
                      >
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Live System Status & App Footer */}
      <div
        style={{
          padding: isCollapsed ? "12px 6px" : "12px 14px",
          borderTop: "1px solid var(--border-subtle)",
          backgroundColor: "rgba(0, 0, 0, 0.15)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {!isCollapsed ? (
          <>
            {/* 1. Status Engine */}
            <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "18px" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: isEngineActive ? "var(--accent-success, #3fb950)" : "var(--accent-primary, #58a6ff)",
                    boxShadow: isEngineActive
                      ? "0 0 8px rgba(63, 185, 80, 0.6)"
                      : "0 0 8px rgba(88, 166, 255, 0.6)",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: isEngineActive ? "var(--accent-success, #3fb950)" : "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {statusText}
              </span>
            </div>

            {/* 2. Model */}
            <div style={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "18px" }}>
                <Bot size={14} color="var(--text-muted)" />
              </div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={modelDisplayName}
              >
                {modelDisplayName}
              </span>
            </div>

            {/* Divider & App Version */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "2px", paddingTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10.5px", color: "var(--text-muted)", fontWeight: 500 }}>
                VN Translator v0.1.0
              </span>
            </div>
          </>
        ) : (
          /* Collapsed Mini Mode */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }} title={`${statusText} • ${modelDisplayName} • v0.1.0`}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: isEngineActive ? "var(--accent-success, #3fb950)" : "var(--accent-primary, #58a6ff)",
                boxShadow: isEngineActive
                  ? "0 0 8px rgba(63, 185, 80, 0.6)"
                  : "0 0 8px rgba(88, 166, 255, 0.6)",
              }}
            />
            <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: 600 }}>v0.1</span>
          </div>
        )}
      </div>
    </aside>
  );
};
