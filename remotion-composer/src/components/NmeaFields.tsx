import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export type NmeaTone = "neutral" | "good" | "bad" | "accent" | "muted";

export interface NmeaStep {
  /** Field indices in the sentence split on "," (0 = "$GPGGA"); "cs" = the "*hh" checksum. */
  fields: (number | "cs")[];
  /** Seconds after cut start when the fields light up and the decode row appears. */
  atSeconds: number;
  /** Seconds when the highlight moves off (default: the next step's start). The decode row stays. */
  untilSeconds?: number;
  /** Decode row: label, raw text as sent, decoded value, a small formula/note line. Omit `label` for a highlight only. */
  label?: string;
  raw?: string;
  value?: string;
  sub?: string;
  tone?: NmeaTone;
}

interface NmeaFieldsProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** One NMEA sentence, verbatim, e.g. "$GPGGA,092725.00,4717.11399,N,...*5B". */
  sentence: string;
  /** Card header over the sentence, e.g. "GGA · vị trí". */
  sentenceTitle?: string;
  /** Dim lines drawn above the sentence (the rest of the stream). */
  contextLines?: string[];
  steps?: NmeaStep[];
  /** Keep only the last N decode rows (default 5). */
  maxRows?: number;
  source?: string;
  sentenceFontSize?: number;
  points?: CodePoint[];
  textColor?: string;
  bodyColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  proColor?: string;
  conColor?: string;
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

/**
 * NMEA sentence anatomy: the sentence is drawn token by token (fields wrap on commas), the fields of the active step
 * get an accent box, earlier decoded fields keep a soft tint, and each step adds a decode row (raw -> value, formula)
 * under the sentence. Used for GGA (time, latitude, longitude, fix quality, satellites) and RMC (status, date).
 */
export const NmeaFields: React.FC<NmeaFieldsProps> = ({
  name,
  eyebrow,
  tagline,
  sentence,
  sentenceTitle,
  contextLines = [],
  steps = [],
  maxRows = 5,
  source,
  sentenceFontSize = 40,
  points = [],
  textColor = "#1D1D1F",
  bodyColor = "#424245",
  mutedColor = "#5E5E63",
  accentColor = "#0066CC",
  surfaceColor = "rgba(255,255,255,0.75)",
  borderColor = "rgba(0,0,0,0.08)",
  proColor = "#1D7A34",
  conColor = "#D70015",
  layout = "centered",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = frame / fps;
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  const pop = (start: number, damping = 16) =>
    start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });
  const toneColor = (tone: NmeaTone | undefined) =>
    tone === "good" ? proColor : tone === "bad" ? conColor : tone === "muted" ? mutedColor : tone === "neutral" ? textColor : accentColor;

  const star = sentence.lastIndexOf("*");
  const body = star >= 0 ? sentence.slice(0, star) : sentence;
  const cs = star >= 0 ? sentence.slice(star) : "";
  const fields = body.split(",");

  const sorted = [...steps].sort((a, b) => a.atSeconds - b.atSeconds);
  const activeIdx = sorted.findIndex((s, i) => {
    const end = s.untilSeconds ?? sorted[i + 1]?.atSeconds ?? Infinity;
    return t >= s.atSeconds && t < end;
  });
  const active = activeIdx >= 0 ? sorted[activeIdx] : undefined;
  const fieldState = (key: number | "cs") => {
    if (active && active.fields.includes(key)) return { on: true, step: active };
    const past = sorted.filter((s) => t >= s.atSeconds && s.fields.includes(key)).pop();
    return { on: false, step: past };
  };
  const activeStart = active ? Math.round(active.atSeconds * fps) : 0;
  const glow = active ? interpolate(frame - activeStart, [0, 8], [0, 1], { extrapolateRight: "clamp" }) : 0;

  const head = pop(0, 18);
  const rows = sorted.filter((s) => s.label && t >= s.atSeconds).slice(-maxRows);

  const token = (text: string, key: number | "cs") => {
    const st = fieldState(key);
    const col = st.step ? toneColor(st.step.tone) : textColor;
    const isEmpty = text.length === 0;
    return (
      <span
        key={String(key)}
        style={{
          display: "inline-block",
          padding: "2px 6px",
          margin: "4px 0",
          borderRadius: 10,
          minWidth: isEmpty ? 22 : undefined,
          background: st.on ? `rgba(0,102,204,${0.16 * glow})` : st.step ? "rgba(0,0,0,0.035)" : "transparent",
          boxShadow: st.on ? `inset 0 0 0 ${3 * glow}px ${col}` : "none",
          color: st.on || st.step ? col : textColor,
          fontWeight: st.on ? 700 : 500,
        }}
      >
        {isEmpty ? " " : text}
      </span>
    );
  };

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        fontVariantLigatures: "none",
        padding: portrait ? (layout === "centered" ? "230px 100px 300px 100px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 30,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {/* Sentence card */}
      <div
        style={{
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "22px 28px 26px",
        }}
      >
        {sentenceTitle && <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 10 }}>{sentenceTitle}</div>}
        {contextLines.map((l, i) => (
          <div key={i} style={{ fontFamily: MONO, fontSize: 26, color: mutedColor, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {l}
          </div>
        ))}
        <div style={{ fontFamily: MONO, fontSize: sentenceFontSize, lineHeight: 1.3, display: "flex", flexWrap: "wrap", alignItems: "baseline", marginTop: contextLines.length ? 8 : 0 }}>
          {fields.map((f, i) => (
            <React.Fragment key={i}>
              {token(f, i)}
              {i < fields.length - 1 && <span style={{ color: mutedColor, margin: "4px 0" }}>,</span>}
            </React.Fragment>
          ))}
          {cs && token(cs, "cs")}
        </div>
      </div>

      {/* Decode rows */}
      {rows.length > 0 && (
        <div
          style={{
            background: surfaceColor,
            border: `2px solid ${borderColor}`,
            borderRadius: 36,
            boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
            padding: "8px 28px",
          }}
        >
          {rows.map((r, i) => {
            const p = pop(Math.round(r.atSeconds * fps));
            const isActive = r === active;
            return (
              <div
                key={r.label! + r.atSeconds}
                style={{
                  borderTop: i ? `2px solid ${borderColor}` : "none",
                  padding: "16px 0",
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [16, 0])}px)`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 20 }}>
                  <div style={{ fontSize: 30, fontWeight: 600, color: isActive ? accentColor : mutedColor }}>{r.label}</div>
                  {r.raw !== undefined && <div style={{ fontFamily: MONO, fontSize: 30, color: mutedColor, whiteSpace: "nowrap" }}>{r.raw}</div>}
                </div>
                {r.value && (
                  <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.015em", color: toneColor(r.tone ?? "neutral"), marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                    {r.value}
                  </div>
                )}
                {r.sub && <div style={{ fontFamily: MONO, fontSize: 28, color: bodyColor, marginTop: 4 }}>{r.sub}</div>}
              </div>
            );
          })}
        </div>
      )}

      {source && <div style={{ fontSize: 28, color: mutedColor, marginTop: -10 }}>{source}</div>}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}>
                <div style={{ flex: "0 0 auto", width: 52, height: 52, borderRadius: 26, background: color, color: "#FFFFFF", fontSize: 30, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
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
