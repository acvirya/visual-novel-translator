import { useState, useEffect } from "react";
import { NavigationTab } from "./types";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { shortcutService } from "./services/shortcutService";
import { ToastProvider } from "./components/common/ToastProvider";

// Translation Views
import { LiveTranslateView } from "./components/views/LiveTranslateView";
import { ManualTranslateView } from "./components/views/ManualTranslateView";
import { BatchTranslateView } from "./components/views/BatchTranslateView";
import { GlossaryManagerView } from "./components/views/GlossaryManagerView";
import { ScriptManagerView } from "./components/views/ScriptManagerView";
import { LogsView } from "./components/views/LogsView";

// Input Views
import { TextractorInputView } from "./components/views/TextractorInputView";
import { OcrInputView } from "./components/views/OcrInputView";

// Overlay Views
import { OverlaySettingsView } from "./components/views/OverlaySettingsView";

// Settings Views
import { TextPreprocessingView } from "./components/views/TextPreprocessingView";
import { GeneralSettingsView } from "./components/views/GeneralSettingsView";
import { TranslationProvidersView } from "./components/views/TranslationProvidersView";

// Error Boundary
import { ErrorBoundary } from "./components/common/ErrorBoundary";

interface TabConfig {
  id: NavigationTab;
  title: string;
  component: React.ReactNode;
}

export function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>("live-translate");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  useEffect(() => {
    shortcutService.init();
  }, []);

  const tabs: TabConfig[] = [
    { id: "live-translate", title: "Live Translate", component: <LiveTranslateView /> },
    { id: "manual-translate", title: "Manual Translate", component: <ManualTranslateView /> },
    { id: "batch-translate", title: "Batch Translate", component: <BatchTranslateView /> },
    { id: "glossary-manager", title: "Glossary Manager", component: <GlossaryManagerView /> },
    { id: "script-manager", title: "Script Manager", component: <ScriptManagerView /> },
    { id: "logs", title: "Logs", component: <LogsView /> },
    { id: "textractor", title: "Textractor Hook", component: <TextractorInputView /> },
    { id: "ocr", title: "OCR Input", component: <OcrInputView /> },
    { id: "overlay-settings", title: "Overlay Settings", component: <OverlaySettingsView /> },
    { id: "text-preprocessing", title: "Text Preprocessing", component: <TextPreprocessingView /> },
    { id: "general-settings", title: "General Settings", component: <GeneralSettingsView /> },
    { id: "translation-providers", title: "Translation Providers", component: <TranslationProvidersView /> },
  ];

  return (
    <ErrorBoundary fallbackTitle="Visual Novel Translator encountered an unexpected error">
      <ToastProvider>
        <div className="app-layout">
          {/* Collapsible Left Sidebar */}
          <Sidebar
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />

          {/* Main Content Area */}
          <div className="main-content">
            <Header currentTab={currentTab} />
            <main className="view-container" style={{ position: "relative", flex: 1, minHeight: 0 }}>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  style={{
                    display: currentTab === tab.id ? "flex" : "none",
                    flexDirection: "column",
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                    flex: 1,
                  }}
                >
                  <ErrorBoundary fallbackTitle={`${tab.title} Error`}>
                    {tab.component}
                  </ErrorBoundary>
                </div>
              ))}
            </main>
          </div>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
