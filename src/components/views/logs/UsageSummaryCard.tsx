import React, { useState, useMemo } from "react";
import { AiUsageLogEntry } from "../../../services/usageLogService";
import { splitModelProviderAndName } from "../../common/ModelSelectorCombobox";
import { ArrowUp, ArrowDown, ExternalLink } from "lucide-react";

export interface UsageSummaryCardProps {
  logs: AiUsageLogEntry[];
  onViewAllLogs?: () => void;
}

type Timeframe = "7d" | "30d" | "all";
type MetricType = "tokens" | "spend" | "requests";

// Palette matching OpenRouter / sleek dark theme
const MODEL_COLORS = [
  "#FF7070", // Grapefruit Pink (Ling / MiniMax)
  "#88BDF2", // Baby Blue Ice (DeepSeek / Primary)
  "#facc15", // Amber / Gold (Meta / Muse)
  "#4ade80", // Mint / Green (Nemotron / OpenAI)
  "#c084fc", // Purple / Violet (Anthropic / Laguna)
  "#38bdf8", // Sky Blue
  "#fb923c", // Orange (Ox Alpha)
  "#f43f5e", // Rose
  "#2dd4bf", // Teal
  "#a78bfa", // Lavender
];

function formatMetricValue(value: number, type: MetricType): string {
  if (type === "spend") {
    if (value <= 0) return "$0.00";
    if (value < 0.01) return `<$0.01`;
    return `$${value.toFixed(2)}`;
  }
  if (type === "requests") {
    return value.toLocaleString();
  }
  // Tokens
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toLocaleString();
}

function formatAxisValue(value: number, type: MetricType): string {
  if (type === "spend") {
    if (value <= 0) return "$0";
    if (value < 0.1) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(1)}`;
  }
  if (type === "requests") {
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    return String(Math.round(value));
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}k`;
  }
  return String(Math.round(value));
}

function getVendorInitial(modelName: string): string {
  if (!modelName) return "AI";
  const clean = modelName.trim();
  return clean.slice(0, 2).toUpperCase();
}

export const UsageSummaryCard: React.FC<UsageSummaryCardProps> = ({ logs, onViewAllLogs }) => {
  const [timeframe, setTimeframe] = useState<Timeframe>("7d");
  const [metric, setMetric] = useState<MetricType>("tokens");
  const [showAllModels, setShowAllModels] = useState<boolean>(false);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  // Time window calculations
  const now = useMemo(() => Date.now(), [logs]);

  const { currentLogs, prevLogs, windowDays } = useMemo(() => {
    if (timeframe === "7d") {
      const windowMs = 7 * 86400000;
      const cur = logs.filter((l) => l.timestamp >= now - windowMs);
      const prev = logs.filter((l) => l.timestamp >= now - 2 * windowMs && l.timestamp < now - windowMs);
      return { currentLogs: cur, prevLogs: prev, windowDays: 7 };
    }
    if (timeframe === "30d") {
      const windowMs = 30 * 86400000;
      const cur = logs.filter((l) => l.timestamp >= now - windowMs);
      const prev = logs.filter((l) => l.timestamp >= now - 2 * windowMs && l.timestamp < now - windowMs);
      return { currentLogs: cur, prevLogs: prev, windowDays: 30 };
    }
    // "all"
    return { currentLogs: logs, prevLogs: [], windowDays: 0 };
  }, [logs, timeframe, now]);

  // Aggregate current totals
  const currentTotal = useMemo(() => {
    if (metric === "tokens") {
      return currentLogs.reduce((acc, l) => acc + (l.totalTokens || 0), 0);
    }
    if (metric === "spend") {
      return currentLogs.reduce((acc, l) => acc + (l.cost || 0), 0);
    }
    return currentLogs.length;
  }, [currentLogs, metric]);

  // Aggregate prev totals for % change
  const prevTotal = useMemo(() => {
    if (timeframe === "all" || prevLogs.length === 0) return 0;
    if (metric === "tokens") {
      return prevLogs.reduce((acc, l) => acc + (l.totalTokens || 0), 0);
    }
    if (metric === "spend") {
      return prevLogs.reduce((acc, l) => acc + (l.cost || 0), 0);
    }
    return prevLogs.length;
  }, [prevLogs, metric, timeframe]);

  const percentageChange = useMemo(() => {
    if (timeframe === "all" || prevTotal === 0) return null;
    return ((currentTotal - prevTotal) / prevTotal) * 100;
  }, [currentTotal, prevTotal, timeframe]);

  // Model color map (deterministic by model ID)
  const modelColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let colorIdx = 0;
    const sortedUniqueModels = Array.from(new Set(logs.map((l) => l.modelId)));
    for (const id of sortedUniqueModels) {
      map[id] = MODEL_COLORS[colorIdx % MODEL_COLORS.length];
      colorIdx++;
    }
    return map;
  }, [logs]);

  // Top models by active metric
  const topModels = useMemo(() => {
    const map: Record<string, { modelId: string; modelName: string; provider: string; tokens: number; spend: number; requests: number }> = {};

    for (const l of currentLogs) {
      if (!map[l.modelId]) {
        const parsed = splitModelProviderAndName({ id: l.modelId, name: l.modelId });
        map[l.modelId] = {
          modelId: l.modelId,
          modelName: parsed.modelName,
          provider: parsed.provider,
          tokens: 0,
          spend: 0,
          requests: 0,
        };
      }
      map[l.modelId].tokens += l.totalTokens || 0;
      map[l.modelId].spend += l.cost || 0;
      map[l.modelId].requests += 1;
    }

    const list = Object.values(map);
    list.sort((a, b) => {
      if (metric === "tokens") return b.tokens - a.tokens;
      if (metric === "spend") return b.spend - a.spend;
      return b.requests - a.requests;
    });

    return list;
  }, [currentLogs, metric]);

  const maxModelValue = useMemo(() => {
    if (topModels.length === 0) return 1;
    const top = topModels[0];
    if (metric === "tokens") return top.tokens || 1;
    if (metric === "spend") return top.spend || 1;
    return top.requests || 1;
  }, [topModels, metric]);

  // Daily Chart Buckets
  const dailyBuckets = useMemo(() => {
    const days = timeframe === "all" ? Math.min(30, Math.max(7, Math.ceil((now - (logs[0]?.timestamp || now)) / 86400000))) : windowDays;
    const buckets: {
      dateLabel: string;
      fullDate: string;
      startMs: number;
      endMs: number;
      modelValues: Record<string, number>;
      totalValue: number;
    }[] = [];

    // Construct day slots
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
      const endMs = startMs + 86400000 - 1;
      const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      const fullDate = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

      buckets.push({
        dateLabel,
        fullDate,
        startMs,
        endMs,
        modelValues: {},
        totalValue: 0,
      });
    }

    // Populate with logs
    for (const l of currentLogs) {
      const targetBucket = buckets.find((b) => l.timestamp >= b.startMs && l.timestamp <= b.endMs);
      if (targetBucket) {
        let val = 0;
        if (metric === "tokens") val = l.totalTokens || 0;
        else if (metric === "spend") val = l.cost || 0;
        else val = 1;

        targetBucket.modelValues[l.modelId] = (targetBucket.modelValues[l.modelId] || 0) + val;
        targetBucket.totalValue += val;
      }
    }

    return buckets;
  }, [currentLogs, timeframe, windowDays, now, logs, metric]);

  const maxBucketValue = useMemo(() => {
    const maxVal = Math.max(...dailyBuckets.map((b) => b.totalValue), 0);
    if (maxVal === 0) {
      if (metric === "spend") return 0.1;
      if (metric === "requests") return 10;
      return 10000;
    }
    return maxVal * 1.15; // padding top
  }, [dailyBuckets, metric]);

  const displayedTopModels = showAllModels ? topModels : topModels.slice(0, 5);

  // Breakdown by mode for the bottom bar
  const liveCost = useMemo(() => currentLogs.filter((l) => l.mode === "live").reduce((acc, l) => acc + (l.cost || 0), 0), [currentLogs]);
  const batchCost = useMemo(() => currentLogs.filter((l) => l.mode === "batch").reduce((acc, l) => acc + (l.cost || 0), 0), [currentLogs]);

  // Chart dimensions
  const chartHeight = 160;
  const yAxisTicks = [0, maxBucketValue * 0.25, maxBucketValue * 0.5, maxBucketValue * 0.75, maxBucketValue];

  return (
    <div
      className="card"
      style={{
        margin: 0,
        padding: "16px 20px",
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {/* 1. Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Usage summary
          </h2>

          {/* Timeframe Dropdown */}
          <select
            className="select-field"
            value={timeframe}
            aria-label="Select timeframe"
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            style={{
              fontSize: "12px",
              padding: "4px 26px 4px 10px",
              fontWeight: 500,
              height: "30px",
              backgroundColor: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
            }}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>

          {/* Metric Selector Tabs */}
          <div
            style={{
              display: "inline-flex",
              backgroundColor: "var(--bg-app)",
              padding: "2px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              gap: "2px",
            }}
          >
            {(["tokens", "spend", "requests"] as MetricType[]).map((m) => {
              const isActive = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={`selector-pill${isActive ? " is-active" : ""}`}
                  style={{
                    padding: "3px 12px",
                    height: "26px",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    textTransform: "capitalize",
                    borderRadius: "3px",
                    border: "none",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {onViewAllLogs && (
          <button
            type="button"
            onClick={onViewAllLogs}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "12px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 6px",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <span>View full activity</span>
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {/* 2. Main Two-Column Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.8fr) minmax(240px, 1fr)",
          gap: "28px",
          alignItems: "stretch",
        }}
      >
        {/* Left Column: Big Number, Trend & Daily Bar Chart */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Top of Chart: Big Metric & Subtitle */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
            <div>
              <div
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: "-0.03em",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {formatMetricValue(currentTotal, metric)}
              </div>

              <div style={{ marginTop: "4px", fontSize: "11.5px" }}>
                {percentageChange !== null ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      color: percentageChange >= 0 ? "#4ade80" : "#f87171",
                      fontWeight: 600,
                    }}
                  >
                    {percentageChange >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {percentageChange >= 0 ? "+" : ""}{percentageChange.toFixed(1)}% vs prev period
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>
                    {currentLogs.length > 0 ? "Active usage tracked" : "No activity data in this period"}
                  </span>
                )}
              </div>
            </div>

            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", fontWeight: 500, alignSelf: "flex-end" }}>
              Daily by model
            </div>
          </div>

          {/* SVG Bar Chart */}
          <div style={{ position: "relative", width: "100%", height: `${chartHeight}px`, marginTop: "12px" }}>
            {/* Horizontal Dashed Gridlines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                pointerEvents: "none",
              }}
            >
              {[...yAxisTicks].reverse().map((tickVal, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      width: "42px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      flexShrink: 0,
                    }}
                  >
                    {formatAxisValue(tickVal, metric)}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      borderBottom: "1px dashed rgba(255, 255, 255, 0.08)",
                      height: 0,
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Vertical Stacked Bars */}
            <div
              style={{
                position: "absolute",
                left: "50px",
                right: 0,
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "flex-end",
                gap: dailyBuckets.length > 15 ? "2px" : "6px",
              }}
            >
              {dailyBuckets.map((bucket, bIdx) => {
                const heightPct = maxBucketValue > 0 ? Math.min(100, (bucket.totalValue / maxBucketValue) * 100) : 0;
                const isHovered = hoveredBarIndex === bIdx;

                return (
                  <div
                    key={bIdx}
                    onMouseEnter={() => setHoveredBarIndex(bIdx)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                    style={{
                      flex: 1,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "stretch",
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    {/* Tooltip on Hover */}
                    {isHovered && bucket.totalValue > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "105%",
                          left: "50%",
                          transform: "translateX(-50%)",
                          backgroundColor: "#161B26",
                          border: "1px solid var(--border-active)",
                          borderRadius: "4px",
                          padding: "6px 9px",
                          fontSize: "11px",
                          zIndex: 100,
                          boxShadow: "0 6px 16px rgba(0,0,0,0.6)",
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                          {bucket.fullDate}
                        </div>
                        <div style={{ color: "var(--accent-primary)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                          Total: {formatMetricValue(bucket.totalValue, metric)}
                        </div>
                        {Object.entries(bucket.modelValues).map(([mId, mVal]) => {
                          const parsed = splitModelProviderAndName({ id: mId, name: mId });
                          const color = modelColorMap[mId] || "#88BDF2";
                          return (
                            <div key={mId} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: color }} />
                              <span style={{ color: "var(--text-muted)" }}>{parsed.modelName}:</span>
                              <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                                {formatMetricValue(mVal, metric)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Stacked Bar Container */}
                    <div
                      style={{
                        width: "100%",
                        height: `${Math.max(heightPct > 0 ? 3 : 0, heightPct)}%`,
                        display: "flex",
                        flexDirection: "column-reverse",
                        borderRadius: "2px 2px 0 0",
                        overflow: "hidden",
                        backgroundColor: isHovered ? "rgba(255, 255, 255, 0.1)" : "transparent",
                        transition: "opacity 0.15s ease",
                        opacity: isHovered ? 1 : 0.9,
                      }}
                    >
                      {bucket.totalValue > 0 ? (
                        Object.entries(bucket.modelValues).map(([mId, mVal]) => {
                          const segPct = (mVal / bucket.totalValue) * 100;
                          const color = modelColorMap[mId] || "#88BDF2";
                          return (
                            <div
                              key={mId}
                              style={{
                                width: "100%",
                                height: `${segPct}%`,
                                backgroundColor: color,
                              }}
                            />
                          );
                        })
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "2px",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* X-Axis Date Labels */}
          <div
            style={{
              display: "flex",
              paddingLeft: "50px",
              marginTop: "6px",
              gap: dailyBuckets.length > 15 ? "2px" : "6px",
            }}
          >
            {dailyBuckets.map((bucket, idx) => {
              // Hide some labels if many days
              const showLabel =
                dailyBuckets.length <= 10 ||
                idx === 0 ||
                idx === dailyBuckets.length - 1 ||
                idx % Math.ceil(dailyBuckets.length / 7) === 0;

              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {showLabel ? bucket.dateLabel : ""}
                </div>
              );
            })}
          </div>

          {/* Bottom Bar: Mode Breakdown */}
          <div
            style={{
              marginTop: "16px",
              paddingTop: "10px",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              fontSize: "11.5px",
              color: "var(--text-secondary)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#38bdf8" }} />
              <span>Live Game: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>${liveCost.toFixed(4)}</strong></span>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#c084fc" }} />
              <span>Batch Script: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>${batchCost.toFixed(4)}</strong></span>
            </div>
          </div>
        </div>

        {/* Right Column: Top Models List with Horizontal Bars */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid var(--border-subtle)",
            paddingLeft: "24px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: "12.5px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "12px",
              letterSpacing: "-0.01em",
            }}
          >
            Top models <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>by {metric}</span>
          </div>

          {topModels.length === 0 ? (
            <div
              style={{
                padding: "30px 10px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>No model activity recorded in this period.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
              {displayedTopModels.map((item) => {
                const color = modelColorMap[item.modelId] || "#88BDF2";
                const value = metric === "tokens" ? item.tokens : metric === "spend" ? item.spend : item.requests;
                const pct = Math.max(3, Math.min(100, (value / maxModelValue) * 100));

                return (
                  <div key={item.modelId} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        {/* Vendor Logo / Initial Box */}
                        <div
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "4px",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            border: `1px solid ${color}`,
                            color: color,
                            fontSize: "10px",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {getVendorInitial(item.modelName)}
                        </div>

                        {/* Model Name & Provider */}
                        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={item.modelId}
                          >
                            {item.modelName}
                          </span>
                          <span
                            style={{
                              fontSize: "10.5px",
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.provider}
                          </span>
                        </div>
                      </div>

                      {/* Metric Value */}
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {formatMetricValue(value, metric)}
                      </span>
                    </div>

                    {/* Horizontal Progress Bar */}
                    <div
                      style={{
                        width: "100%",
                        height: "4px",
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        borderRadius: "2px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          backgroundColor: color,
                          borderRadius: "2px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {topModels.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllModels(!showAllModels)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "right",
                    marginTop: "4px",
                    padding: "4px 0",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  {showAllModels ? "Show top 5 ‹" : `View all (${topModels.length}) ›`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

