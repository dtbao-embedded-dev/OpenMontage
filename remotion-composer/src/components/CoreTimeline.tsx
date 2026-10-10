import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export type TimelineTone = "a" | "b" | "c" | "idle" | "wait" | "bad";

export interface TimelineBlock {
  /** Start position on the shared time axis, in abstract units (0..units). */
  start: number;
  /** Length on the time axis, in the same units. */
  len: number;
  label?: string;
  /** a/b/c = tasks, idle = lighter fill, wait = dashed outline (blocked / starved), bad = status red. */
  tone?: TimelineTone;
  /** Seconds after cut start when the block grows in (sync to narration). */
  atSeconds?: number;
}

export interface TimelineLane {
  label: string;
  /** Small secondary text on the right of the lane label (e.g. a priority). */
  detail?: string;
  blocks: TimelineBlock[];
}

export interface TimelineLog {
  title?: string;
  lines: string[];
  atSeconds?: number;
  /** Colour of the log text; defaults to the status red. */
  color?: string;
}

interface CoreTimelineProps {
  /** Big title of the frame. */
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** Lanes drawn top to bottom, sharing one time axis. */
  lanes: TimelineLane[];
  /** Width of the time axis in abstract units (default 12). */
  units?: number;
  /** Caption under the axis (default "thời gian →"). */
  axisLabel?: string;
  points?: CodePoint[];
  log?: TimelineLog;
  textColor?: string;
  bodyColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  proColor?: string;
  conColor?: string;
  /** Portrait layout: "safe" (default) pads into the TikTok safe area; "centered" centres on the frame
   *  with even 120 px side margins. */
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

export const CoreTimeline: React.FC<CoreTimelineProps> = ({
  name,
  eyebrow,
  tagline,
  lanes,
  units = 12,
  axisLabel = "thời gian →",
  points = [],
  log,
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
  // Anything due at frame 0 (heading, lane card) is drawn fully from the first frame, so a cut into this scene never shows a
  // blank background.
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));

  const sidePad = portrait ? (layout === "centered" ? 120 : 88) : 140;
  const rightPad = portrait ? (layout === "centered" ? 120 : 160) : 140;
  const trackW = width - sidePad - rightPad - 56; // card padding 28 on both sides
  const unitPx = trackW / units;
  const TRACK_H = 124;

  const tones: Record<TimelineTone, React.CSSProperties> = {
    a: { background: accentColor, color: "#FFFFFF" },
    b: { background: "#424245", color: "#FFFFFF" },
    c: { background: "#6B7280", color: "#FFFFFF" },
    idle: { background: "rgba(0,0,0,0.07)", color: mutedColor },
    wait: { background: "transparent", color: mutedColor, border: `2px dashed rgba(0,0,0,0.28)` },
    bad: { background: conColor, color: "#FFFFFF" },
  };

  const cardStyle: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };

  const head = pop(0, 18);
  const card = pop(0, 20);

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "0 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 34,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && (
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>
            {eyebrow}
          </div>
        )}
        <div style={{ fontSize: 100, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      <div
        style={{
          ...cardStyle,
          padding: "32px 28px 24px",
          opacity: card,
          transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
          display: "flex",
          flexDirection: "column",
          gap: 30,
        }}
      >
        {lanes.map((lane, li) => (
          <div key={lane.label + li}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.012em", color: textColor }}>{lane.label}</div>
              {lane.detail && <div style={{ fontSize: 30, fontWeight: 400, color: mutedColor }}>{lane.detail}</div>}
            </div>
            <div style={{ position: "relative", width: trackW, height: TRACK_H, borderRadius: 20, background: "rgba(0,0,0,0.035)" }}>
              {lane.blocks.map((b, bi) => {
                const p = pop(at(b.atSeconds, 0.4 + bi * 0.25), 20);
                const w = b.len * unitPx;
                const fits = (b.label?.length ?? 0) * 18 + 24 <= w;
                return (
                  <div
                    key={bi}
                    style={{
                      position: "absolute",
                      left: b.start * unitPx,
                      top: 6,
                      width: w - 4,
                      height: TRACK_H - 12,
                      boxSizing: "border-box",
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 30,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      transformOrigin: "left center",
                      transform: `scaleX(${p})`,
                      opacity: Math.min(1, p * 1.5),
                      ...tones[b.tone ?? "a"],
                    }}
                  >
                    {fits ? b.label : ""}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, textAlign: "right" }}>{axisLabel}</div>
      </div>

      {log && (() => {
        const p = pop(at(log.atSeconds, 1.5), 20);
        return (
          <div
            style={{
              ...cardStyle,
              padding: "20px 28px 24px",
              opacity: p,
              transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
            }}
          >
            {log.title && <div style={{ fontSize: 26, fontWeight: 600, color: mutedColor, marginBottom: 10 }}>{log.title}</div>}
            <div style={{ fontFamily: MONO, fontSize: 26, lineHeight: 1.45, color: log.color ?? conColor, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {log.lines.join("\n")}
            </div>
          </div>
        );
      })()}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}>
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
                <div style={{ fontSize: 42, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
