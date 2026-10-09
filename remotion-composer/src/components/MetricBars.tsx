import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export interface MetricRow {
  /** Row name, e.g. a protocol ("Wi-Fi"). */
  label: string;
  /** Small secondary text after the label (e.g. the rate or the condition). */
  detail?: string;
  /** Numeric value that sets the bar length (see `scale` and `baseline`). */
  value: number;
  /** Text shown for the value, e.g. "−98,4 dBm". */
  valueText: string;
  /** Fill the bar and the value with the accent colour (the one key number on the frame). */
  highlight?: boolean;
  /** Group heading drawn above this row when it differs from the previous row's group. */
  group?: string;
  /** Seconds after cut start when the row appears and its bar grows (sync to narration). */
  atSeconds?: number;
}

interface MetricBarsProps {
  /** Metric name, the big title of the frame. */
  name: string;
  eyebrow?: string;
  tagline?: string;
  rows: MetricRow[];
  /** "linear" (default) or "log" (values spanning several decades, e.g. µA to mA). */
  scale?: "linear" | "log";
  /** Value drawn as an empty bar (linear scale). Default 0. */
  baseline?: number;
  /** Value drawn as a full bar. Default: the largest row value. */
  maxValue?: number;
  /** Source line under the bars (caption style). */
  source?: string;
  sourceAtSeconds?: number;
  points?: CodePoint[];
  textColor?: string;
  bodyColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  proColor?: string;
  conColor?: string;
  /** Portrait layout: "safe" (default) pads into the TikTok safe area; "centered" uses even 120 px side margins. */
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";

/**
 * Horizontal bar comparison in a light card: one bar per row, rows pop in and their bars grow at `atSeconds`.
 * Built for portrait spec comparisons (range, throughput, current) where each value needs its own unit text.
 */
export const MetricBars: React.FC<MetricBarsProps> = ({
  name,
  eyebrow,
  tagline,
  rows,
  scale = "linear",
  baseline = 0,
  maxValue,
  source,
  sourceAtSeconds,
  points = [],
  textColor = "#1D1D1F",
  bodyColor = "#424245",
  mutedColor = "#5E5E63",
  accentColor = "#0066CC",
  surfaceColor = "rgba(255,255,255,0.75)",
  borderColor = "rgba(0,0,0,0.08)",
  proColor = "#1D7A34",
  conColor = "#D70015",
  layout = "safe",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  // A start at or before frame 0 is fully drawn on the cut's first frame (no fade-in from a blank frame).
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));

  const top = maxValue ?? Math.max(...rows.map((r) => r.value));
  // Log scale: one decade below the smallest value maps to an empty bar, so the smallest row still shows a stub.
  const logMin = Math.log10(Math.max(Math.min(...rows.map((r) => r.value)), 1e-9)) - 1;
  const frac = (v: number) => {
    const f =
      scale === "log"
        ? (Math.log10(Math.max(v, 1e-9)) - logMin) / (Math.log10(top) - logMin)
        : (v - baseline) / (top - baseline || 1);
    return Math.min(1, Math.max(0.02, f));
  };

  const head = pop(0, 18);
  const card = pop(at(rows[0]?.atSeconds, 0.3) - 6, 20);
  const firstRowFrame = at(rows[0]?.atSeconds, 0.3);
  const src = pop(at(sourceAtSeconds, (rows[0]?.atSeconds ?? 0.3) + 0.2));

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "230px 120px 300px 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        // Hidden rows keep their space, so nothing shifts as they appear.
        justifyContent: portrait ? "center" : "flex-start",
        gap: 34,
      }}
    >
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && (
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>
        )}
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {/* Bars card */}
      <div
        style={{
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "34px 40px 30px",
          display: "flex",
          flexDirection: "column",
          gap: 26,
          opacity: frame >= firstRowFrame - 6 ? card : 0,
          transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
        }}
      >
        {rows.map((r, i) => {
          const start = at(r.atSeconds, 0.3 + i * 0.5);
          const p = pop(start);
          const grow = spring({ frame: frame - start - 4, fps, config: { damping: 22, stiffness: 90 } });
          const showGroup = r.group && (i === 0 || rows[i - 1].group !== r.group);
          const ink = r.highlight ? accentColor : textColor;
          return (
            <React.Fragment key={r.label + i}>
              {showGroup && (
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 600,
                    letterSpacing: "0.005em",
                    color: mutedColor,
                    marginTop: i === 0 ? 0 : 10,
                    opacity: p,
                  }}
                >
                  {r.group}
                </div>
              )}
              <div style={{ opacity: p, transform: `translateX(${interpolate(p, [0, 1], [24, 0])}px)` }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 14, minWidth: 0 }}>
                    <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.015em", color: textColor, whiteSpace: "nowrap" }}>
                      {r.label}
                    </div>
                    {r.detail && (
                      <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, whiteSpace: "nowrap" }}>
                        {r.detail}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 48,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: ink,
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.valueText}
                  </div>
                </div>
                <div style={{ height: 30, borderRadius: 15, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${frac(r.value) * grow * 100}%`,
                      borderRadius: 15,
                      background: r.highlight ? accentColor : "#424245",
                    }}
                  />
                </div>
              </div>
            </React.Fragment>
          );
        })}
        {source && (
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, opacity: src }}>
            {source}
          </div>
        )}
      </div>

      {/* Takeaways */}
      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div
                key={pt.text + i}
                style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}
              >
                <div
                  style={{
                    flex: "0 0 auto",
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    background: color,
                    color: "#FFFFFF",
                    fontSize: 30,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  {mark}
                </div>
                <div style={{ fontSize: 40, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
