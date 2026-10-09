import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted";

export interface WaveTrace {
  /** [x, volts] with x in 0..1 across the plot. With `step` (default) each point holds its level until the next x. */
  points: [number, number][];
  step?: boolean;
  tone?: Tone;
  /** Small name drawn above the line, at `labelAt` ([x, volts]) or at the trace's first point. */
  label?: string;
  labelAt?: [number, number];
  /** Seconds after cut start when the pen starts drawing (default 0). */
  atSeconds?: number;
  /** Seconds the pen takes to cross the plot (default 1.6). */
  drawSeconds?: number;
}

export interface WaveLine {
  /** Voltage of a horizontal threshold line. */
  v: number;
  label: string;
  tone?: Tone;
  dashed?: boolean;
  atSeconds?: number;
}

export interface WaveBand {
  from: number;
  to: number;
  label?: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface WaveMarker {
  /** x in 0..1. */
  x: number;
  label?: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface WaveSpan {
  x0: number;
  x1: number;
  label: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface WavePanel {
  /** Panel heading (e.g. "Tín hiệu thật"). */
  label?: string;
  atSeconds?: number;
  /** Plot height in px (default 360). */
  height?: number;
  yMax: number;
  yMin?: number;
  /** Axis labels on the left, e.g. [{v: 0, label: "0 V"}, {v: 3.3, label: "3,3 V"}]. */
  yTicks?: { v: number; label: string }[];
  traces: WaveTrace[];
  lines?: WaveLine[];
  bands?: WaveBand[];
  markers?: WaveMarker[];
  spans?: WaveSpan[];
}

interface LogicWaveProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  panels: WavePanel[];
  /** Caption under the plots (e.g. the time scale or the source). */
  caption?: string;
  captionAtSeconds?: number;
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
const W = 1000; // plot coordinate width
const LEFT = 150; // room for the y labels

/**
 * Oscilloscope-style voltage plots in a light card: traces are drawn by a moving pen, threshold lines and
 * bands (VIH / VIL / absolute max) fade in, numbered markers pop on edges and brackets mark a time span.
 * Built for switch bounce vs debounced input and for 3.3 V vs 5 V logic levels.
 */
export const LogicWave: React.FC<LogicWaveProps> = ({
  name,
  eyebrow,
  tagline,
  panels,
  caption,
  captionAtSeconds,
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
  const sec = (s: number | undefined) => Math.round((s ?? 0) * fps);
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const toneColor = (t: Tone | undefined, fallback = textColor) =>
    t === "accent" ? accentColor : t === "good" ? proColor : t === "bad" ? conColor : t === "muted" ? mutedColor : t === "neutral" ? textColor : fallback;
  const head = pop(0, 18);

  const renderPanel = (pn: WavePanel, pi: number) => {
    const H = pn.height ?? 360;
    const hasMarkers = (pn.markers ?? []).some((m) => m.label);
    // Heading row, then a row for the numbered marker discs, so neither overlaps the trace.
    const top = (pn.label ? 64 : 24) + (hasMarkers ? 64 : 0);
    // A span label that would run past the right edge is drawn centred under its bracket instead, which needs more room.
    const spanW = (label: string) => label.length * 34 * 0.56;
    const X0 = (x: number) => LEFT + x * (W - LEFT - 30);
    const spanBelow = (sp: WaveSpan) => X0(sp.x1) + 16 + spanW(sp.label) > W;
    const bottom = (pn.spans ?? []).length ? ((pn.spans ?? []).some(spanBelow) ? 120 : 76) : 24;
    const plotH = H - top - bottom;
    const yMin = pn.yMin ?? 0;
    const X = (x: number) => LEFT + x * (W - LEFT - 30);
    const Y = (v: number) => top + plotH * (1 - (v - yMin) / (pn.yMax - yMin));
    const po = pop(sec(pn.atSeconds));
    return (
      <svg key={pi} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", opacity: po }}>
        {pn.label && (
          <text x={LEFT} y={42} fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={40} fontWeight={700} fill={textColor}>
            {pn.label}
          </text>
        )}
        {/* Bands behind everything */}
        {(pn.bands ?? []).map((b, i) => {
          const o = pop(sec(b.atSeconds));
          const c = toneColor(b.tone, accentColor);
          const y0 = Y(Math.max(b.from, b.to));
          const y1 = Y(Math.min(b.from, b.to));
          return (
            <g key={`b${i}`} opacity={o}>
              <rect x={X(0)} y={y0} width={X(1) - X(0)} height={y1 - y0} fill={c} opacity={0.1} />
              {b.label && (
                <text x={X(1) - 12} y={(y0 + y1) / 2 + 12} textAnchor="end" fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={36} fontWeight={700} fill={c}>
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Axes */}
        <line x1={X(0)} y1={top - 6} x2={X(0)} y2={top + plotH} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        <line x1={X(0)} y1={top + plotH} x2={X(1)} y2={top + plotH} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        {(pn.yTicks ?? []).map((t, i) => (
          <text key={`t${i}`} x={X(0) - 16} y={Y(t.v) + 11} textAnchor="end" fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={32} fontWeight={400} fill={mutedColor}>
            {t.label}
          </text>
        ))}
        {/* Threshold lines */}
        {(pn.lines ?? []).map((l, i) => {
          const o = pop(sec(l.atSeconds));
          const c = toneColor(l.tone, mutedColor);
          const grow = interpolate(o, [0, 1], [0, 1]);
          return (
            <g key={`l${i}`} opacity={Math.min(1, o)}>
              <line
                x1={X(0)}
                y1={Y(l.v)}
                x2={X(0) + (X(1) - X(0)) * grow}
                y2={Y(l.v)}
                stroke={c}
                strokeWidth={4}
                strokeDasharray={l.dashed === false ? undefined : "12 10"}
              />
              <text x={X(0) + 14} y={Y(l.v) - 14} fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={36} fontWeight={700} fill={c}>
                {l.label}
              </text>
            </g>
          );
        })}
        {/* Traces drawn by a moving pen */}
        {pn.traces.map((tr, i) => {
          const pts = tr.points;
          if (pts.length === 0) return null;
          const c = toneColor(tr.tone, textColor);
          let d = `M${X(pts[0][0])},${Y(pts[0][1])}`;
          for (let k = 1; k < pts.length; k++) {
            d += tr.step === false ? ` L${X(pts[k][0])},${Y(pts[k][1])}` : ` H${X(pts[k][0])} V${Y(pts[k][1])}`;
          }
          const lastX = pts[pts.length - 1][0];
          if (tr.step !== false && lastX < 1) d += ` H${X(1)}`;
          const start = sec(tr.atSeconds);
          const dur = Math.max(1, sec(tr.drawSeconds ?? 1.6));
          const prog = start <= 0 && (tr.drawSeconds ?? 1.6) <= 0 ? 1 : interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const clipId = `clip-${pi}-${i}`;
          const penX = X(0) + (X(1) - X(0)) * prog;
          return (
            <g key={`tr${i}`} opacity={frame >= start ? 1 : 0}>
              <defs>
                <clipPath id={clipId}>
                  <rect x={0} y={0} width={penX + 4} height={H} />
                </clipPath>
              </defs>
              <path d={d} fill="none" stroke={c} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId})`} />
              {tr.label && (
                <text
                  x={X(tr.labelAt ? tr.labelAt[0] : 0) + 14}
                  y={Y(tr.labelAt ? tr.labelAt[1] : pts[0][1]) - 18}
                  fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round"
                  fontSize={36}
                  fontWeight={700}
                  fill={c}
                  opacity={Math.min(1, prog * 4)}
                >
                  {tr.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Edge markers */}
        {(pn.markers ?? []).map((m, i) => {
          const o = pop(sec(m.atSeconds));
          const c = toneColor(m.tone, accentColor);
          const s = interpolate(o, [0, 1], [0.5, 1]);
          return (
            <g key={`m${i}`} opacity={Math.min(1, o)} transform={`translate(${X(m.x)},${top - 36}) scale(${s})`}>
              <line x1={0} y1={30} x2={0} y2={plotH + 36} stroke={c} strokeWidth={3} strokeDasharray="6 8" />
              {m.label && (
                <>
                  {m.label.length > 2 ? (
                    <rect x={-(m.label.length * 32 * 0.58 + 36) / 2} y={-28} width={m.label.length * 32 * 0.58 + 36} height={56} rx={28} fill={c} />
                  ) : (
                    <circle cx={0} cy={0} r={28} fill={c} />
                  )}
                  <text x={0} y={11} textAnchor="middle" fontFamily={FONT} fontSize={32} fontWeight={700} fill="#FFFFFF">
                    {m.label}
                  </text>
                </>
              )}
            </g>
          );
        })}
        {/* Time spans (brackets near the bottom) */}
        {(pn.spans ?? []).map((s, i) => {
          const o = pop(sec(s.atSeconds));
          const c = toneColor(s.tone, accentColor);
          const y = top + plotH + 50; // under the time axis, clear of the trace
          return (
            <g key={`s${i}`} opacity={Math.min(1, o)}>
              <line x1={X(s.x0)} y1={y} x2={X(s.x1)} y2={y} stroke={c} strokeWidth={4} />
              <line x1={X(s.x0)} y1={y - 14} x2={X(s.x0)} y2={y + 14} stroke={c} strokeWidth={4} />
              <line x1={X(s.x1)} y1={y - 14} x2={X(s.x1)} y2={y + 14} stroke={c} strokeWidth={4} />
              <text
                x={spanBelow(s) ? (X(s.x0) + X(s.x1)) / 2 : X(s.x1) + 16}
                y={spanBelow(s) ? y + 52 : y + 12}
                textAnchor={spanBelow(s) ? "middle" : "start"}
                fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={34} fontWeight={700} fill={c}>
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const cap = pop(sec(captionAtSeconds));

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "230px 120px 300px 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 34,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      <div
        style={{
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "26px 26px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          opacity: head,
        }}
      >
        {panels.map(renderPanel)}
        {caption && (
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, opacity: cap, padding: "0 12px" }}>
            {caption}
          </div>
        )}
      </div>

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(sec(pt.atSeconds ?? 1.5 + i * 0.6));
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
                <div style={{ fontSize: 40, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
