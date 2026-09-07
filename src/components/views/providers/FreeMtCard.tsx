import React from "react";
import { Globe } from "lucide-react";

interface FreeMtCardProps {
  useGoogleTranslate: boolean;
  useDeepLFree: boolean;
  onToggleGoogleTranslate: (enabled: boolean) => void;
  onToggleDeepLFree: (enabled: boolean) => void;
}

export const FreeMtCard: React.FC<FreeMtCardProps> = ({
  useGoogleTranslate,
  useDeepLFree,
  onToggleGoogleTranslate,
  onToggleDeepLFree,
}) => {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-header">
        <div>
          <span className="card-title">
            <Globe size={16} /> 5. Free Online MT (Zero API Cost Fallback)
          </span>
          <span className="card-subtitle">
            Fast web translation services used as backup when API credits expire
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={useGoogleTranslate}
            onChange={(e) => onToggleGoogleTranslate(e.target.checked)}
            style={{ transform: "scale(1.15)" }}
          />
          <div>
            <span style={{ fontWeight: 600, fontSize: "13px" }}>
              Google Translate (Free Web Endpoint)
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "block" }}>
              High-speed translation engine for live gameplay streaming with minimal latency.
            </span>
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={useDeepLFree}
            onChange={(e) => onToggleDeepLFree(e.target.checked)}
            style={{ transform: "scale(1.15)" }}
          />
          <div>
            <span style={{ fontWeight: 600, fontSize: "13px" }}>
              DeepL Web Scraper Endpoint
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "block" }}>
              Natural Japanese nuance translation fallback.
            </span>
          </div>
        </label>
      </div>
    </div>
  );
};
