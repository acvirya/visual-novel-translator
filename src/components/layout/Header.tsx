import { NavigationTab } from "../../types";

const tabTitles: Record<NavigationTab, string> = {
  "live-game": "Live translation",
  "batch-translate": "Script translator",
  glossary: "Glossary & terms",
  "script-memory": "Script memory",
  "knowledge-base": "Glossary & terms",
  settings: "Settings",
  logs: "Activity & usage",
};

export function Header({ currentTab }: { currentTab: NavigationTab }) {
  const title = tabTitles[currentTab] || "VN Translator";

  return (
    <header className="app-header">
      <div className="header-copy">
        <h1>{title}</h1>
      </div>
    </header>
  );
}
