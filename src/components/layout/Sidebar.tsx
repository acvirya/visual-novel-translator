import React from "react";
import {
  Radio,
  FileText,
  Layers,
  BookOpen,
  Database,
  Terminal,
  Cpu,
  Scan,
  Monitor,
  Sliders,
  KeyRound,
  Menu,
  Languages,
} from "lucide-react";
import { NavigationTab } from "../../types";

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
  const sections: NavSection[] = [
    {
      title: "Translation",
      items: [
        { id: "live-translate", label: "Live Translate", icon: <Radio size={16} /> },
        { id: "manual-translate", label: "Manual Translate", icon: <FileText size={16} /> },
        { id: "batch-translate", label: "Batch Translate", icon: <Layers size={16} /> },
        { id: "glossary-manager", label: "Glossary Manager", icon: <BookOpen size={16} /> },
        { id: "script-manager", label: "Script Manager", icon: <Database size={16} /> },
        { id: "logs", label: "Logs", icon: <Terminal size={16} /> },
      ],
    },
    {
      title: "Input",
      items: [
        { id: "textractor", label: "Textractor", icon: <Cpu size={16} /> },
        { id: "ocr", label: "OCR", icon: <Scan size={16} /> },
      ],
    },
    {
      title: "Overlay",
      items: [
        { id: "overlay-settings", label: "Overlay Settings", icon: <Monitor size={16} /> },
      ],
    },
    {
      title: "Settings",
      items: [
        { id: "general-settings", label: "General", icon: <Sliders size={16} /> },
        { id: "translation-providers", label: "Translation Providers", icon: <KeyRound size={16} /> },
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

      {/* Footer Info */}
      <div
        style={{
          padding: isCollapsed ? "10px 4px" : "12px 14px",
          borderTop: "1px solid var(--border-subtle)",
          fontSize: "11px",
          color: "var(--text-muted)",
          textAlign: isCollapsed ? "center" : "left",
        }}
      >
        {!isCollapsed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Pure Translator</span>
            <span>Non-invasive • v0.1.0</span>
          </div>
        ) : (
          <span>v0.1</span>
        )}
      </div>
    </aside>
  );
};
