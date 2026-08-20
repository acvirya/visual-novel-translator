import React, { useState, useEffect } from "react";
import { OcrRegion, OcrRegionRole, MonitorInfo } from "../../types";
import { OcrService } from "../../services/ocrService";
import { invoke } from "@tauri-apps/api/core";
import { Check, X, Trash2, MessageSquare, User, Crosshair } from "lucide-react";

export const RegionSelectionOverlay: React.FC = () => {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const targetMonitorName = localStorage.getItem("vn_ocr_target_monitor") || "monitor_1";

  const [regions, setRegions] = useState<OcrRegion[]>(() => {
    try {
      const saved = localStorage.getItem("vn_ocr_regions");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load saved OCR regions:", e);
    }
    // Default: Region 1 (Dialogue) and Region 2 (Speaker)
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

  const initialRegionsRef = React.useRef<OcrRegion[]>([]);

  const reloadSavedRegions = () => {
    try {
      const saved = localStorage.getItem("vn_ocr_regions");
      if (saved) {
        const parsed: OcrRegion[] = JSON.parse(saved);
        setRegions(parsed);
        initialRegionsRef.current = JSON.parse(JSON.stringify(parsed));
        if (parsed.length > 0) {
          setSelectedRegionId(parsed[0].id);
        }
        return;
      }
    } catch (e) {
      console.warn("Failed to reload OCR regions:", e);
    }
  };

  // Load monitors and sync on focus/broadcast
  useEffect(() => {
    async function loadMonitors() {
      try {
        const list = await invoke<MonitorInfo[]>("get_monitors");
        if (list && list.length > 0) {
          setMonitors(list);
        }
      } catch (e) {
        console.warn("Failed to load monitors:", e);
      }
    }
    loadMonitors();
    reloadSavedRegions();

    const handleFocus = () => {
      reloadSavedRegions();
    };

    const channel = new BroadcastChannel("vn_ocr_channel");
    channel.onmessage = (event) => {
      if (event.data?.type === "OPEN_SELECTOR") {
        reloadSavedRegions();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      channel.close();
    };
  }, []);

  const [selectedRegionId, setSelectedRegionId] = useState<string | null>("region_1");

  // Dragging & Resizing State
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

  const computeRegionsWithPhysical = (regs: OcrRegion[]): OcrRegion[] => {
    const activeMonitor =
      monitors.find((m) => m.name === targetMonitorName) ||
      monitors.find((m) => m.is_primary) ||
      monitors[0] || {
        name: "Primary Monitor",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
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
      targetMonitor: activeMonitor.name || targetMonitorName,
    }));
  };

  // Keyboard shortcut listener (Escape to cancel/exit)
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
  }, [regions, monitors, targetMonitorName]);

  const handleSaveAndClose = async () => {
    try {
      const regionsWithPhysical = computeRegionsWithPhysical(regions);
      localStorage.setItem("vn_ocr_regions", JSON.stringify(regionsWithPhysical));
      // Notify main window via BroadcastChannel
      const channel = new BroadcastChannel("vn_ocr_channel");
      channel.postMessage({ type: "REGIONS_UPDATED", regions: regionsWithPhysical });
      channel.close();
    } catch (e) {
      console.warn("Failed to broadcast updated regions:", e);
    }
    await OcrService.closeRegionSelector();
  };

  const handleCancel = async () => {
    // Revert regions in state back to the original snapshot
    if (initialRegionsRef.current.length > 0) {
      setRegions(JSON.parse(JSON.stringify(initialRegionsRef.current)));
    }
    await OcrService.closeRegionSelector();
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

  // Canvas Mouse Down -> Start drawing a new region if empty space clicked and count < 2
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return; // Only if clicked directly on overlay background
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

  // Box Mouse Down -> Move Box
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

  // Handle Resize Mouse Down
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

  // Global Mouse Move
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
          const width = Math.abs(dx);
          const height = Math.abs(dy);
          const x = dx >= 0 ? dragAction.startX : dragAction.startX + dx;
          const y = dy >= 0 ? dragAction.startY : dragAction.startY + dy;
          return {
            ...r,
            x: Math.max(0, x),
            y: Math.max(0, y),
            width: Math.max(20, width),
            height: Math.max(20, height),
          };
        }

        if (dragAction.type === "resize") {
          let { initialX, initialY, initialW, initialH, handle } = dragAction;
          let newX = initialX;
          let newY = initialY;
          let newW = initialW;
          let newH = initialH;

          if (handle?.includes("e")) newW = Math.max(30, initialW + dx);
          if (handle?.includes("s")) newH = Math.max(20, initialH + dy);
          if (handle?.includes("w")) {
            const possibleW = initialW - dx;
            if (possibleW >= 30) {
              newW = possibleW;
              newX = initialX + dx;
            }
          }
          if (handle?.includes("n")) {
            const possibleH = initialH - dy;
            if (possibleH >= 20) {
              newH = possibleH;
              newY = initialY + dy;
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
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        zIndex: 999999,
        cursor: regions.length < 2 ? "crosshair" : "default",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Top Floating Control Bar */}
      <div
        style={{
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#161b22",
          border: "1px solid #30363d",
          borderRadius: "8px",
          padding: "10px 18px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          zIndex: 1000000,
          color: "#f0f6fc",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Crosshair size={18} color="#58a6ff" />
          <div>
            <div style={{ fontWeight: 600, fontSize: "13px" }}>
              OCR Screen Region Selector ({regions.length}/2 Boxes)
            </div>
            <div style={{ fontSize: "11px", color: "#8b949e" }}>
              {regions.length < 2
                ? "Hold & drag on empty space to draw a new region. Drag corners to resize."
                : "2 maximum regions reached. Drag to reposition or drag corners to resize."}
            </div>
          </div>
        </div>

        <div style={{ height: "24px", width: "1px", backgroundColor: "#30363d" }} />

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={handleResetDefaults}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              backgroundColor: "#21262d",
              color: "#c9d1d9",
              border: "1px solid #30363d",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Reset
          </button>

          <button
            onClick={handleCancel}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              backgroundColor: "#21262d",
              color: "#c9d1d9",
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
