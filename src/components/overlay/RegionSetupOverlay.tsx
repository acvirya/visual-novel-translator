import React, { useState, useEffect, useRef } from "react";
import { OcrRegion, OcrRegionRole, MonitorInfo } from "../../types";
import { OcrService } from "../../services/ocrService";
import { TauriBridge } from "../../services/tauriBridge";
import { settingsManager } from "../../services/settingsManager";
import { Check, X, Trash2, MessageSquare, User, Crosshair } from "lucide-react";

export const RegionSetupOverlay: React.FC = () => {
  const [currentMonitor, setCurrentMonitor] = useState<MonitorInfo | null>(null);
  const currentMonitorRef = useRef<MonitorInfo | null>(null);

  const [regions, setRegions] = useState<OcrRegion[]>(() => {
    try {
      const saved = settingsManager.getOcr().regions;
      if (saved && saved.length > 0) {
        return saved;
      }
    } catch (e) {
      console.warn("Failed to load saved OCR regions:", e);
    }
    return [
      {
        id: "region_1",
        name: "Region 1 (Dialogue)",
        role: "dialogue",
        x: 350,
        y: 750,
        width: 1220,
        height: 250,
        color: "#4e73df",
      },
      {
        id: "region_2",
        name: "Region 2 (Speaker)",
        role: "speaker",
        x: 350,
        y: 690,
        width: 320,
        height: 55,
        color: "#f6c23e",
      },
    ];
  });

  const initialRegionsRef = useRef<OcrRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>("region_1");

  const [dragAction, setDragAction] = useState<{
    type: "move" | "resize" | "draw";
    regionId: string;
    handle?: string; // 'nw', 'ne', 'sw', 'se'
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

  const loadWindowMonitor = async (): Promise<MonitorInfo> => {
    try {
      const mon = await TauriBridge.getWindowMonitor("region-selector");
      if (mon) {
        setCurrentMonitor(mon);
        currentMonitorRef.current = mon;
        return mon;
      }
    } catch (e) {
      console.warn("Failed to load window monitor for region setup:", e);
    }
    const fallback: MonitorInfo = {
      name: "Primary Monitor",
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      scale_factor: window.devicePixelRatio || 1.0,
      is_primary: true,
    };
    setCurrentMonitor(fallback);
    currentMonitorRef.current = fallback;
    return fallback;
  };

  const reloadSavedRegions = async () => {
    const mon = await loadWindowMonitor();
    try {
      const saved = settingsManager.getOcr().regions;
      if (saved && saved.length > 0) {
        const parsed: OcrRegion[] = saved;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const scale = mon.scale_factor || window.devicePixelRatio || 1.0;
          const monX = mon.x || 0;
          const monY = mon.y || 0;

          const aligned = parsed.map((r) => {
            if (r.physicalX != null && r.physicalY != null && r.physicalWidth != null && r.physicalHeight != null) {
              const logicalX = Math.round((r.physicalX - monX) / scale);
              const logicalY = Math.round((r.physicalY - monY) / scale);
              const logicalW = Math.round(r.physicalWidth / scale);
              const logicalH = Math.round(r.physicalHeight / scale);
              return {
                ...r,
                x: logicalX,
                y: logicalY,
                width: logicalW,
                height: logicalH,
              };
            }
            return r;
          });

          setRegions(aligned);
          initialRegionsRef.current = JSON.parse(JSON.stringify(aligned));
        }
      }
    } catch (e) {
      console.warn("Failed to reload saved OCR regions:", e);
    }
  };

  useEffect(() => {
    reloadSavedRegions();

    const handleFocus = () => {
      reloadSavedRegions();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const computeRegionsWithPhysical = (regs: OcrRegion[]): OcrRegion[] => {
    const activeMonitor = currentMonitorRef.current || currentMonitor || {
      name: "Primary Monitor",
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      scale_factor: window.devicePixelRatio || 1.0,
      is_primary: true,
    };

    const scale = activeMonitor.scale_factor || window.devicePixelRatio || 1.0;
    const monX = activeMonitor.x || 0;
    const monY = activeMonitor.y || 0;

    return regs.map((r) => ({
      ...r,
      physicalX: Math.round(monX + r.x * scale),
      physicalY: Math.round(monY + r.y * scale),
      physicalWidth: Math.round(r.width * scale),
      physicalHeight: Math.round(r.height * scale),
      targetMonitor: activeMonitor.name,
    }));
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        handleSaveAndClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [regions, currentMonitor]);

  const handleSaveAndClose = async () => {
    try {
      const regionsWithPhysical = computeRegionsWithPhysical(regions);
      settingsManager.updateOcr({ regions: regionsWithPhysical });
      const channel = new BroadcastChannel("vn_ocr_channel");
      channel.postMessage({ type: "REGIONS_UPDATED", regions: regionsWithPhysical });
      channel.close();
    } catch (e) {
      console.warn("Failed to broadcast updated regions:", e);
    }
    await OcrService.closeRegionSelector(true);
  };

  const handleCancel = async () => {
    if (initialRegionsRef.current.length > 0) {
      setRegions(JSON.parse(JSON.stringify(initialRegionsRef.current)));
    }
    await OcrService.closeRegionSelector(true);
  };

  const handleResetDefaults = () => {
    const defaultRegions: OcrRegion[] = [
      {
        id: "region_1",
        name: "Region 1 (Dialogue)",
        role: "dialogue",
        x: 350,
        y: 750,
        width: 1220,
        height: 250,
        color: "#4e73df",
      },
      {
        id: "region_2",
        name: "Region 2 (Speaker)",
        role: "speaker",
        x: 350,
        y: 690,
        width: 320,
        height: 55,
        color: "#f6c23e",
      },
    ];
    setRegions(defaultRegions);
    setSelectedRegionId("region_1");
  };

  const handleDeleteRegion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRegions((prev) => prev.filter((r) => r.id !== id));
    if (selectedRegionId === id) {
      setSelectedRegionId(null);
    }
  };

  const handleToggleRole = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRegions((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const nextRole: OcrRegionRole = r.role === "dialogue" ? "speaker" : "dialogue";
          return {
            ...r,
            role: nextRole,
            name: nextRole === "dialogue" ? "Dialogue Region" : "Speaker Region",
            color: nextRole === "dialogue" ? "#4e73df" : "#f6c23e",
          };
        }
        return r;
      })
    );
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (regions.length >= 2) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const newId = `region_${Date.now()}`;
    const defaultRole: OcrRegionRole = regions.some((r) => r.role === "dialogue") ? "speaker" : "dialogue";

    const newRegion: OcrRegion = {
      id: newId,
      name: defaultRole === "dialogue" ? "Dialogue Region" : "Speaker Region",
      role: defaultRole,
      x: startX,
      y: startY,
      width: 10,
      height: 10,
      color: defaultRole === "dialogue" ? "#4e73df" : "#f6c23e",
    };

    setRegions((prev) => [...prev, newRegion]);
    setSelectedRegionId(newId);

    setDragAction({
      type: "draw",
      regionId: newId,
      startX,
      startY,
      initialX: startX,
      initialY: startY,
      initialW: 10,
      initialH: 10,
    });
  };

  const handleBoxMouseDown = (r: OcrRegion, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRegionId(r.id);

    setDragAction({
      type: "move",
      regionId: r.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: r.x,
      initialY: r.y,
      initialW: r.width,
      initialH: r.height,
    });
  };

  const handleResizeMouseDown = (r: OcrRegion, handle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRegionId(r.id);

    setDragAction({
      type: "resize",
      regionId: r.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialX: r.x,
      initialY: r.y,
      initialW: r.width,
      initialH: r.height,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragAction) return;

    const dx = e.clientX - dragAction.startX;
    const dy = e.clientY - dragAction.startY;

    setRegions((prev) =>
      prev.map((r) => {
        if (r.id !== dragAction.regionId) return r;

        if (dragAction.type === "move") {
          return {
            ...r,
            x: Math.max(0, dragAction.initialX + dx),
            y: Math.max(0, dragAction.initialY + dy),
          };
        }

        if (dragAction.type === "draw") {
          const w = Math.max(10, e.clientX - dragAction.startX);
          const h = Math.max(10, e.clientY - dragAction.startY);
          return {
            ...r,
            width: w,
            height: h,
          };
        }

        if (dragAction.type === "resize") {
          let newX = dragAction.initialX;
          let newY = dragAction.initialY;
          let newW = dragAction.initialW;
          let newH = dragAction.initialH;

          if (dragAction.handle?.includes("e")) {
            newW = Math.max(20, dragAction.initialW + dx);
          }
          if (dragAction.handle?.includes("s")) {
            newH = Math.max(20, dragAction.initialH + dy);
          }
          if (dragAction.handle?.includes("w")) {
            const possibleW = dragAction.initialW - dx;
            if (possibleW >= 20) {
              newX = dragAction.initialX + dx;
              newW = possibleW;
            }
          }
          if (dragAction.handle?.includes("n")) {
            const possibleH = dragAction.initialH - dy;
            if (possibleH >= 20) {
              newY = dragAction.initialY + dy;
              newH = possibleH;
            }
          }

          return {
            ...r,
            x: Math.max(0, newX),
            y: Math.max(0, newY),
            width: newW,
            height: newH,
          };
        }

        return r;
      })
    );
  };

  const handleMouseUp = () => {
    setDragAction(null);
  };

  return (
    <div
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        cursor: dragAction ? "move" : regions.length < 2 ? "crosshair" : "default",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Top Banner with Control Buttons */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#161b22",
          border: "1px solid #30363d",
          borderRadius: "8px",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          color: "#ffffff",
          fontSize: "13px",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Crosshair size={18} color="#58a6ff" />
          <span style={{ fontWeight: 600 }}>OCR Region Configurator</span>
          <span style={{ color: "#8b949e", fontSize: "12px" }}>
            ({regions.length}/2 active regions)
          </span>
        </div>

        <div style={{ height: "18px", width: "1px", backgroundColor: "#30363d" }} />

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleResetDefaults}
            style={{
              padding: "5px 10px",
              fontSize: "12px",
              backgroundColor: "#21262d",
              color: "#c9d1d9",
              border: "1px solid #30363d",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Reset Defaults
          </button>

          <button
            onClick={handleCancel}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              backgroundColor: "#21262d",
              color: "#f85149",
              border: "1px solid #30363d",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <X size={13} /> Cancel (Esc)
          </button>

          <button
            onClick={handleSaveAndClose}
            style={{
              padding: "5px 14px",
              fontSize: "12px",
              backgroundColor: "#238636",
              color: "#ffffff",
              border: "1px solid #2ea043",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Check size={14} /> Save & Apply
          </button>
        </div>
      </div>

      {/* Render Region Bounding Boxes */}
      {regions.map((region) => {
        const isSelected = selectedRegionId === region.id;
        const borderColor = region.role === "dialogue" ? "#58a6ff" : "#f6c23e";
        const roleLabel = region.role === "dialogue" ? "💬 Dialogue" : "👤 Speaker Name";

        return (
          <div
            key={region.id}
            onMouseDown={(e) => handleBoxMouseDown(region, e)}
            style={{
              position: "absolute",
              left: `${region.x}px`,
              top: `${region.y}px`,
              width: `${region.width}px`,
              height: `${region.height}px`,
              border: `2px solid ${borderColor}`,
              backgroundColor: region.role === "dialogue" ? "rgba(88, 166, 255, 0.15)" : "rgba(246, 194, 62, 0.15)",
              boxShadow: isSelected ? `0 0 0 2px rgba(255,255,255,0.8), 0 4px 16px rgba(0,0,0,0.5)` : "0 2px 8px rgba(0,0,0,0.3)",
              cursor: "move",
              boxSizing: "border-box",
              borderRadius: "4px",
            }}
          >
            {/* Box Header Toolbar */}
            <div
              style={{
                position: "absolute",
                top: "-28px",
                left: "-2px",
                backgroundColor: "#161b22",
                border: `1px solid ${borderColor}`,
                borderRadius: "4px 4px 0 0",
                padding: "2px 8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                color: "#ffffff",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Role Toggle Button */}
              <button
                onClick={(e) => handleToggleRole(region.id, e)}
                style={{
                  padding: "1px 6px",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  backgroundColor: region.role === "dialogue" ? "#1f6feb" : "#9e6a03",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
                title="Click to toggle between Dialogue and Speaker role"
              >
                {region.role === "dialogue" ? <MessageSquare size={10} /> : <User size={10} />}
                <span>{roleLabel}</span>
              </button>

              <span style={{ color: "#8b949e", fontSize: "10px" }}>
                {Math.round(region.width)} × {Math.round(region.height)} px
              </span>

              {/* Delete Button */}
              <button
                onClick={(e) => handleDeleteRegion(region.id, e)}
                style={{
                  padding: "1px 4px",
                  fontSize: "10px",
                  backgroundColor: "transparent",
                  color: "#f85149",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
                title="Delete this region"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {/* Resize Corner Handles */}
            {["nw", "ne", "sw", "se"].map((handle) => {
              let style: React.CSSProperties = {
                position: "absolute",
                width: "10px",
                height: "10px",
                backgroundColor: "#ffffff",
                border: `2px solid ${borderColor}`,
                borderRadius: "2px",
                zIndex: 10,
              };

              if (handle === "nw") {
                style.top = "-5px";
                style.left = "-5px";
                style.cursor = "nwse-resize";
              } else if (handle === "ne") {
                style.top = "-5px";
                style.right = "-5px";
                style.cursor = "nesw-resize";
              } else if (handle === "sw") {
                style.bottom = "-5px";
                style.left = "-5px";
                style.cursor = "nesw-resize";
              } else if (handle === "se") {
                style.bottom = "-5px";
                style.right = "-5px";
                style.cursor = "nwse-resize";
              }

              return (
                <div
                  key={handle}
                  onMouseDown={(e) => handleResizeMouseDown(region, handle, e)}
                  style={style}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
