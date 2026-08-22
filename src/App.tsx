import { useState, useEffect } from "react";
import { NavigationTab } from "./types";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { shortcutService } from "./services/shortcutService";
import { ToastProvider } from "./components/common/ToastProvider";

// Primary 4-Hub Views
import { LiveGameHubView } from "./components/views/LiveGameHubView";
import { BatchTranslateView } from "./components/views/BatchTranslateView";
import { KnowledgeBaseView } from "./components/views/KnowledgeBaseView";
import { UnifiedSettingsView } from "./components/views/UnifiedSettingsView";

// Error Boundary
import { ErrorBoundary } from "./components/common/ErrorBoundary";

interface TabConfig {
  id: NavigationTab;
  title: string;
  component: React.ReactNode;
}

export function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>("live-game");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  useEffect(() => {
    shortcutService.init();

    const handleResize = () => {
      if (window.innerWidth < 860) {
        setIsSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const tabs: TabConfig[] = [
    {
      id: "live-game",
      title: "Live Game Translation",
      component: <LiveGameHubView onNavigateToSettings={() => setCurrentTab("settings")} />,
    },
    {
      id: "batch-translate",
      title: "Batch Script Translator",
      component: <BatchTranslateView onOpenPreprocessingSettings={() => setCurrentTab("settings")} />,
    },
    {
      id: "knowledge-base",
      title: "Knowledge Base",
      component: <KnowledgeBaseView />,
    },
    {
      id: "settings",
      title: "Settings & AI Configuration",
      component: <UnifiedSettingsView />,
    },
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
