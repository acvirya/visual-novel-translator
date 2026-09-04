import { useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { shortcutService } from "./services/shortcutService";
import { ToastProvider } from "./components/common/ToastProvider";
import { LlmDispatcherService } from "./services/providers/llmDispatcherService";
import { useUIStore } from "./stores/useUIStore";

// Primary 4-Hub Views
import { LiveGameHubView } from "./components/views/LiveGameHubView";
import { BatchTranslateView } from "./components/views/BatchTranslateView";
import { KnowledgeBaseView } from "./components/views/KnowledgeBaseView";
import { UnifiedSettingsView } from "./components/views/UnifiedSettingsView";

// Error Boundary
import { ErrorBoundary } from "./components/common/ErrorBoundary";

export function App() {
  const currentTab = useUIStore((state) => state.currentTab);
  const setCurrentTab = useUIStore((state) => state.setCurrentTab);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const setIsSidebarCollapsed = useUIStore((state) => state.setIsSidebarCollapsed);

  useEffect(() => {
    shortcutService.init();

    // Background refresh models for all verified providers on boot (graceful error handling)
    LlmDispatcherService.refreshAllVerifiedProviders().catch((err) => {
      console.warn("Background LLM provider refresh failed:", err);
    });

    const handleResize = () => {
      if (window.innerWidth < 860) {
        setIsSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      shortcutService.destroy().catch(() => {});
    };
  }, [setIsSidebarCollapsed]);

  const renderActiveView = () => {
    switch (currentTab) {
      case "live-game":
        return (
          <ErrorBoundary fallbackTitle="Live Game Translation Error">
            <LiveGameHubView onNavigateToSettings={() => setCurrentTab("settings")} />
          </ErrorBoundary>
        );
      case "batch-translate":
        return (
          <ErrorBoundary fallbackTitle="Batch Script Translator Error">
            <BatchTranslateView onOpenPreprocessingSettings={() => setCurrentTab("settings")} />
          </ErrorBoundary>
        );
      case "knowledge-base":
        return (
          <ErrorBoundary fallbackTitle="Knowledge Base Error">
            <KnowledgeBaseView />
          </ErrorBoundary>
        );
      case "settings":
        return (
          <ErrorBoundary fallbackTitle="Settings & AI Configuration Error">
            <UnifiedSettingsView />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  };

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
            <main
              className="view-container"
              style={{
                position: "relative",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: "100%",
              }}
            >
              {renderActiveView()}
            </main>
          </div>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
