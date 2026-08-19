import { useState } from "react";
import { NavigationTab } from "./types";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";

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

export function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>("live-translate");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const renderActiveView = () => {
    switch (currentTab) {
      case "live-translate":
        return <LiveTranslateView />;
      case "manual-translate":
        return <ManualTranslateView />;
      case "batch-translate":
        return <BatchTranslateView />;
      case "glossary-manager":
        return <GlossaryManagerView />;
      case "script-manager":
        return <ScriptManagerView />;
      case "logs":
        return <LogsView />;
      case "textractor":
        return <TextractorInputView />;
      case "ocr":
        return <OcrInputView />;
      case "overlay-settings":
        return <OverlaySettingsView />;
      case "text-preprocessing":
        return <TextPreprocessingView />;
      case "general-settings":
        return <GeneralSettingsView />;
      case "translation-providers":
        return <TranslationProvidersView />;
      default:
        return <LiveTranslateView />;
    }
  };

  return (
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
        <main className="view-container">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}

export default App;
