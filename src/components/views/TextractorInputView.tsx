import React, { useState } from "react";
import { TextractorThread } from "../../types";
import { Cpu, RefreshCw, CheckCircle2 } from "lucide-react";

// TODO: Replace with real process list from Windows system
const DUMMY_PROCESSES = [
  { pid: 14920, name: "ClannadHD.exe", windowTitle: "CLANNAD" },
  { pid: 8312, name: "Fate.exe", windowTitle: "Fate/stay night" },
  { pid: 1944, name: "SummerPockets.exe", windowTitle: "Summer Pockets REFLECTION BLUE" },
];

// TODO: Replace with real Textractor threads detected by sidecar
const DUMMY_THREADS: TextractorThread[] = [
  { id: 1, name: "Text Out (Auto)", hookCode: "HB8*0@0045A12", totalLines: 320, isActive: true },
  { id: 2, name: "Console Stream", hookCode: "ENGINE_DEFAULT", totalLines: 12, isActive: false },
  { id: 3, name: "Name Tag Hook", hookCode: "HN4*0@0042B90", totalLines: 280, isActive: true },
  { id: 4, name: "Choice Selection", hookCode: "HC4*0@0048F10", totalLines: 14, isActive: false },
];

export const TextractorInputView: React.FC = () => {
  const [selectedPid, setSelectedPid] = useState<number>(14920);
  const [threads, setThreads] = useState<TextractorThread[]>(DUMMY_THREADS);

  const toggleThread = (id: number) => {
    setThreads(
      threads.map((t) => (t.id === id ? { ...t, isActive: !t.isActive } : t))
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {/* Target Game Process Attacher */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <span className="card-title">
            <Cpu size={16} /> Target Visual Novel Process (Textractor Sidecar)
          </span>
          <button className="btn-secondary" style={{ padding: "4px 10px", fontSize: "12px" }}>
            <RefreshCw size={12} />
            <span>Refresh Processes</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <select
            value={selectedPid}
            onChange={(e) => setSelectedPid(Number(e.target.value))}
            style={{ flex: 1 }}
          >
            {DUMMY_PROCESSES.map((proc) => (
              <option key={proc.pid} value={proc.pid}>
                {proc.name} (PID: {proc.pid}) — "{proc.windowTitle}"
              </option>
            ))}
          </select>

          <button className="btn-primary" style={{ padding: "7px 18px" }}>
            <CheckCircle2 size={14} />
            <span>Attach Hook</span>
          </button>
        </div>
      </div>

      {/* Detected Hook Threads Table */}
      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">Detected Text Threads</span>
            <span className="card-subtitle">Select active hook threads containing clean in-game dialogue</span>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ padding: "8px 12px", width: "40px", color: "var(--text-muted)" }}>Active</th>
              <th style={{ padding: "8px 12px", color: "var(--text-muted)" }}>Thread Name</th>
              <th style={{ padding: "8px 12px", color: "var(--text-muted)" }}>Hook Code</th>
              <th style={{ padding: "8px 12px", width: "100px", color: "var(--text-muted)" }}>Line Count</th>
            </tr>
          </thead>
          <tbody>
            {threads.map((thread) => (
              <tr key={thread.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "8px 12px" }}>
                  <input
                    type="checkbox"
                    checked={thread.isActive}
                    onChange={() => toggleThread(thread.id)}
                  />
                </td>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: thread.isActive ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {thread.name}
                </td>
                <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent-cyan)" }}>
                  {thread.hookCode}
                </td>
                <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>
                  {thread.totalLines} lines
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Linked Text Preprocessing Pipeline Banner */}
      <div
        className="card"
        style={{
          margin: 0,
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          padding: "14px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)", display: "block" }}>
              Unified Text Preprocessing Pipeline
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              All raw stream outputs from hooked threads are cleaned automatically through the centralized drag-and-drop Preprocessing pipeline (Furigana, Stutter, Control Tags, and Custom Regex).
            </span>
          </div>
          <span className="badge badge-success" style={{ whiteSpace: "nowrap" }}>
            Pipeline Active
          </span>
        </div>
      </div>
    </div>
  );
};
