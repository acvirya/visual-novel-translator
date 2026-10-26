import { lazy, Suspense, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { shortcutService } from "./services/shortcutService";
import { ToastProvider } from "./components/common/ToastProvider";
import { LlmDispatcherService } from "./services/providers/llmDispatcherService";
import { useUIStore } from "./stores/useUIStore";

// Primary 4-Hub Views
const LiveGameHubView = lazy(() => import("./components/views/LiveGameHubView").then((module) => ({ default: module.LiveGameHubView })));
const BatchTranslateView = lazy(() => import("./components/views/BatchTranslateView").then((module) => ({ default: module.BatchTranslateView })));
const KnowledgeBaseView = lazy(() => import("./components/views/KnowledgeBaseView").then((module) => ({ default: module.KnowledgeBaseView })));
const UnifiedSettingsView = lazy(() => import("./components/views/UnifiedSettingsView").then((module) => ({ default: module.UnifiedSettingsView })));
const LogsHubView = lazy(() => import("./components/views/LogsHubView").then((module) => ({ default: module.LogsHubView })));

// Error Boundary
import { ErrorBoundary } from "./components/common/ErrorBoundary";

import { appContainer } from "./services/appContainer";
import { settingsManager } from "./services/settingsManager";
import { scriptManagerService } from "./services/scriptManagerService";
import { translationManager } from "./services/translationManager";
import { batchTranslateService } from "./services/batchTranslateService";
import { textractorManagedService } from "./services/textractorService";
import { usageLogService } from "./services/usageLogService";
import { overlayChannel } from "./utils/overlayChannel";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function App() {
  const currentTab = useUIStore((state) => state.currentTab);
  const setCurrentTab = useUIStore((state) => state.setCurrentTab);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const setIsSidebarCollapsed = useUIStore((state) => state.setIsSidebarCollapsed);

  useEffect(() => {
    // Register and initialize core services in AppContainer (A2, H6, H10, CRIT-03)
    appContainer.register(settingsManager);
    appContainer.register(scriptManagerService);
    appContainer.register(translationManager);
    appContainer.register(batchTranslateService);
    appContainer.register(shortcutService);
    appContainer.register(overlayChannel);
    appContainer.register(textractorManagedService);
    appContainer.register(usageLogService);
    let cancelled = false;
    void appContainer.init().then(async () => {
      if (!cancelled) await LlmDispatcherService.refreshAllVerifiedProviders();
    }).catch((error: unknown) => {
      console.warn("Application initialization failed:", error);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let closing = false;
    let unlisten: (() => void) | undefined;
    const mainWindow = getCurrentWindow();
    void mainWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      try {
        await appContainer.dispose();
        await mainWindow.destroy();
      } catch (error) {
        closing = false;
        console.error("Unable to finish application shutdown:", error);
      }
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; })
      .catch((error) => console.warn("Window shutdown listener unavailable:", error));
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const renderActiveView = () => {
    switch (currentTab) {
      case "live-game":
        return (
          <ErrorBoundary key="live-game" fallbackTitle="Live Game Translation Error">
            <LiveGameHubView onNavigateToSettings={() => setCurrentTab("settings")} />
          </ErrorBoundary>
        );
      case "batch-translate":
        return (
          <ErrorBoundary key="batch" fallbackTitle="Batch Script Translator Error">
            <BatchTranslateView onOpenPreprocessingSettings={() => setCurrentTab("settings")} />
          </ErrorBoundary>
        );
      case "knowledge-base":
        return (
          <ErrorBoundary key="knowledge" fallbackTitle="Knowledge Base Error">
            <KnowledgeBaseView />
          </ErrorBoundary>
        );
      case "settings":
        return (
          <ErrorBoundary key="settings" fallbackTitle="Settings & AI Configuration Error">
            <UnifiedSettingsView />
          </ErrorBoundary>
        );
      case "logs":
        return (
          <ErrorBoundary key="logs" fallbackTitle="Usage & App Logs Error">
            <LogsHubView />
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
            <main className="view-container" id="main-content" tabIndex={-1}>
              <Suspense fallback={<div role="status" style={{ padding: 24 }}>Loading workspace…</div>}>
                {renderActiveView()}
              </Suspense>
            </main>
          </div>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
