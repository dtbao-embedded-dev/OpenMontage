import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted" | "warn";

export interface PmSeries {
  /** Name used by readouts and batteries to follow this series. */
  key?: string;
  label: string;
  /** One value per sample; sample k sits at k / pmRate seconds after cut start. */
  values: number[];
  tone?: Tone;
  color?: string;
  width?: number;
  dashed?: boolean;
  /** Hold each sample until the next one (square edges, e.g. current pulses). */
  step?: boolean;
  atSeconds?: number;
}

export interface PmLine {
  v: number;
  label: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface PmBand {
  /** Data time in seconds (same clock as the cut). */
  from: number;
  to: number;
  label?: string;
  tone?: Tone;
  /** Label row from the top of the plot (0, 1, 2 ...): stacks labels of narrow neighbouring bands. */
  labelRow?: number;
}

export interface PmMarker {
  /** Data time in seconds; pops when the pen gets there. */
  at: number;
  label: string;
  tone?: Tone;
}

export interface PmPanel {
  title?: string;
  yMin: number;
  yMax: number;
  yTicks?: { v: number; label: string }[];
  series: PmSeries[];
  lines?: PmLine[];
  bands?: PmBand[];
  markers?: PmMarker[];
  height?: number;
  atSeconds?: number;
  /** Data clock: [[videoSeconds, dataSeconds], ...] breakpoints, linear in between (default: data time = video time).
   *  Lets the pen run slowly while a formula is read and faster through events named in quick succession.
   *  Series samples, bands and markers are in data time. */
  clock?: [number, number][];
}

export interface PmReadout {
  label: string;
  /** Follow a series by key, or give own `values` at pmRate, or a fixed `text`. */
  key?: string;
  values?: number[];
  text?: string;
  unit?: string;
  decimals?: number;
  tone?: Tone;
  /** Accent-coloured number (the one key value). */
  highlight?: boolean;
  /** Small line under the number. */
  sub?: string;
  atSeconds?: number;
}

export interface PmBattery {
  label: string;
  /** Percent 0..100: follow a series by key or own `values` at pmRate. */
  key?: string;
  values?: number[];
  sub?: string;
  /** From this time the device is off: grey gauge and an off tag. */
  offAtSeconds?: number;
  offLabel?: string;
  atSeconds?: number;
}

export interface PmFormulaLine {
  text: string;
  atSeconds?: number;
  tone?: Tone;
}

export interface PmFormula {
  title?: string;
  lines: PmFormulaLine[];
  atSeconds?: number;
}

export interface PmStatus {
  atSeconds: number;
  untilSeconds?: number;
  text: string;
  tone?: Tone;
}

interface PowerMeterProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  rate: number;
  spanSeconds: number;
  panels?: PmPanel[];
  readouts?: PmReadout[];
  readoutColumns?: number;
  batteries?: PmBattery[];
  formula?: PmFormula;
  status?: PmStatus[];
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
  warnColor?: string;
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace";
const W = 1000;
const LEFT = 150;
const RIGHT = 24;

/**
 * Power monitor in a light card: battery gauges and big readout tiles (V, mA, mW, mAh, %) that tick with the data,
 * stacked pen-drawn plots that share one time axis (voltage above current, each with its own scale), threshold lines,
 * shaded time bands, event markers, a formula card and a status pill. Built for INA219 / INA226 battery monitoring:
 * voltage sag under Wi-Fi bursts, coulomb counting and load power.
 */
export const PowerMeter: React.FC<PowerMeterProps> = ({
  name,
  eyebrow,
  tagline,
  rate,
  spanSeconds,
  panels = [],
  readouts = [],
  readoutColumns,
  batteries = [],
  formula,
  status = [],
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
  warnColor = "#B25000",
  layout = "safe",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = frame / fps;
  const sec = (s: number | undefined) => Math.round((s ?? 0) * fps);
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const toneColor = (tn: Tone | undefined, fallback = textColor) =>
    tn === "accent" ? accentColor : tn === "good" ? proColor : tn === "bad" ? conColor : tn === "warn" ? warnColor : tn === "muted" ? mutedColor : tn === "neutral" ? textColor : fallback;
  const head = pop(0, 18);
  const sample = (vals: number[], time: number, step = false) => {
    if (vals.length === 0) return 0;
    const x = Math.max(0, Math.min(vals.length - 1, time * rate));
    const i = Math.floor(x);
    if (step) return vals[i];
    const f = x - i;
    return i + 1 < vals.length ? vals[i] * (1 - f) + vals[i + 1] * f : vals[i];
  };
  const dataTime = (clock: [number, number][] | undefined, time: number) => {
    if (!clock || clock.length === 0) return time;
    if (time <= clock[0][0]) return clock[0][1];
    for (let i = 1; i < clock.length; i++) {
      const [v0, d0] = clock[i - 1];
      const [v1, d1] = clock[i];
      if (time <= v1) return d0 + ((time - v0) / Math.max(1e-6, v1 - v0)) * (d1 - d0);
    }
    const n = clock.length;
    const [va, da] = clock[n - 2] ?? [0, 0];
    const [vb, db] = clock[n - 1];
    return db + (time - vb) * (n > 1 ? (db - da) / Math.max(1e-6, vb - va) : 1);
  };
  const byKey = new Map<string, { s: PmSeries; clock?: [number, number][] }>();
  panels.forEach((p) => p.series.forEach((s) => s.key && byKey.set(s.key, { s, clock: p.clock })));
  const valueOf = (key: string | undefined, own: number[] | undefined) => {
    if (own) return sample(own, t);
    const e = key ? byKey.get(key) : undefined;
    return e ? sample(e.s.values, dataTime(e.clock, Math.max(t, e.s.atSeconds ?? 0)), e.s.step) : 0;
  };
  const fmt = (v: number, d: number) => v.toFixed(d).replace(".", ",").replace(/^-/, "−");
  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };

  // ---- Battery gauge ----
  const renderBattery = (b: PmBattery, i: number) => {
    const o = pop(sec(b.atSeconds));
    const off = b.offAtSeconds !== undefined && t >= b.offAtSeconds;
    const pct = Math.max(0, Math.min(100, valueOf(b.key, b.values)));
    const c = off ? "#AEAEB2" : pct > 50 ? proColor : pct > 20 ? warnColor : conColor;
    const offPop = off ? pop(sec(b.offAtSeconds), 12) : 0;
    return (
      <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, opacity: Math.min(1, o), flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor }}>{b.label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width={190} height={92} viewBox="0 0 190 92" style={{ flex: "0 0 auto" }}>
            <rect x={3} y={3} width={170} height={86} rx={16} fill="#FFFFFF" stroke={off ? "#AEAEB2" : textColor} strokeWidth={6} />
            <rect x={174} y={30} width={12} height={32} rx={4} fill={off ? "#AEAEB2" : textColor} />
            <rect x={13} y={13} width={Math.max(0, 150 * (pct / 100))} height={66} rx={8} fill={c} />
          </svg>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.02em", color: off ? mutedColor : textColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {fmt(pct, 0)}
            <span style={{ fontSize: 40, fontWeight: 600, color: bodyColor, marginLeft: 4 }}>%</span>
          </div>
        </div>
        {off ? (
          <div style={{ alignSelf: "flex-start", padding: "6px 20px", borderRadius: 30, background: conColor, color: "#FFFFFF", fontSize: 30, fontWeight: 700, opacity: Math.min(1, offPop), transform: `scale(${interpolate(offPop, [0, 1], [0.6, 1])})` }}>
            {b.offLabel ?? "Tắt nguồn"}
          </div>
        ) : (
          b.sub && <div style={{ fontSize: 28, fontWeight: 400, color: mutedColor }}>{b.sub}</div>
        )}
      </div>
    );
  };

  // ---- Stage: batteries + readout tiles + status ----
  const renderStage = () => {
    if (batteries.length === 0 && readouts.length === 0) return null;
    const st = status.filter((s) => t >= s.atSeconds && (s.untilSeconds === undefined || t < s.untilSeconds)).pop();
    const stPop = st ? pop(sec(st.atSeconds), 12) : 0;
    const cols = readoutColumns ?? Math.min(3, Math.max(1, readouts.length));
    return (
      <div style={{ ...card, padding: "26px 32px", display: "flex", flexDirection: "column", gap: 24, position: "relative", opacity: head }}>
        {batteries.length > 0 && <div style={{ display: "flex", gap: 28 }}>{batteries.map(renderBattery)}</div>}
        {readouts.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "18px 22px" }}>
            {readouts.map((ro, i) => {
              const o = pop(sec(ro.atSeconds));
              const v = ro.text === undefined ? valueOf(ro.key, ro.values) : 0;
              const s = ro.key ? byKey.get(ro.key)?.s : undefined;
              const dot = s ? s.color ?? toneColor(s.tone, textColor) : toneColor(ro.tone, accentColor);
              return (
                <div key={i} style={{ opacity: Math.min(1, o), transform: `translateY(${interpolate(Math.min(1, o), [0, 1], [16, 0])}px)`, minWidth: 0 }}>
                  <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                    <span style={{ width: 16, height: 16, borderRadius: 8, background: dot, display: "inline-block", flex: "0 0 auto" }} />
                    {ro.label}
                  </div>
                  <div style={{ fontSize: 66, fontWeight: 700, letterSpacing: "-0.02em", color: ro.highlight ? accentColor : ro.tone ? toneColor(ro.tone) : textColor, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, whiteSpace: "nowrap" }}>
                    {ro.text ?? fmt(v, ro.decimals ?? 0)}
                    {ro.unit && <span style={{ fontSize: 34, fontWeight: 600, color: bodyColor, marginLeft: 8 }}>{ro.unit}</span>}
                  </div>
                  {ro.sub && <div style={{ fontSize: 28, fontWeight: 400, color: mutedColor, marginTop: 2 }}>{ro.sub}</div>}
                </div>
              );
            })}
          </div>
        )}
        {st && (
          <div
            style={{
              position: "absolute",
              right: 26,
              top: 24,
              padding: "10px 24px",
              borderRadius: 40,
              background: toneColor(st.tone, accentColor),
              color: "#FFFFFF",
              fontSize: 34,
              fontWeight: 700,
              opacity: Math.min(1, stPop),
              transform: `scale(${interpolate(stPop, [0, 1], [0.6, 1])})`,
              boxShadow: "0 10px 24px rgba(16,24,40,0.18)",
            }}
          >
            {st.text}
          </div>
        )}
      </div>
    );
  };

  // ---- One plot panel ----
  const renderPanel = (pn: PmPanel, pi: number) => {
    const H = pn.height ?? 360;
    const markers = pn.markers ?? [];
    const legendH = 54;
    const top = (pn.title ? 58 : 12) + legendH;
    const plotTop = top + (markers.length ? 44 : 0);
    const bottom = 22;
    const plotH = H - plotTop - bottom;
    const X = (time: number) => LEFT + (time / spanSeconds) * (W - LEFT - RIGHT);
    const Y = (v: number) => plotTop + plotH * (1 - (v - pn.yMin) / (pn.yMax - pn.yMin));
    const clampY = (v: number) => Math.max(plotTop - 4, Math.min(plotTop + plotH + 4, Y(v)));
    const d = dataTime(pn.clock, t);
    const tEnd = Math.min(d, spanSeconds);
    const po = pop(sec(pn.atSeconds));
    const clipId = `pm-clip-${pi}`;
    return (
      <svg key={pi} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", opacity: Math.min(1, po) }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={LEFT} y={plotTop - 30} width={W - LEFT - RIGHT} height={plotH + 34} />
          </clipPath>
        </defs>
        {pn.title && (
          <text x={LEFT} y={40} fontFamily={FONT} fontSize={36} fontWeight={700} fill={textColor}>
            {pn.title}
          </text>
        )}
        {(() => {
          let x = LEFT;
          return pn.series.map((s, i) => {
            const o = pop(sec(s.atSeconds));
            const c = s.color ?? toneColor(s.tone, textColor);
            const el = (
              <g key={`lg${i}`} opacity={Math.min(1, o)}>
                <line x1={x} y1={top - 28} x2={x + 34} y2={top - 28} stroke={c} strokeWidth={7} strokeLinecap="round" strokeDasharray={s.dashed ? "10 8" : undefined} />
                <text x={x + 46} y={top - 18} fontFamily={FONT} fontSize={29} fontWeight={600} fill={textColor}>
                  {s.label}
                </text>
              </g>
            );
            x += 46 + s.label.length * 29 * 0.56 + 38;
            return el;
          });
        })()}
        <g clipPath={`url(#${clipId})`}>
          {(pn.bands ?? []).map((b, i) => {
            if (d < b.from) return null;
            const c = toneColor(b.tone, accentColor);
            const x0 = X(b.from);
            const x1 = X(Math.min(b.to, tEnd));
            return <rect key={`bd${i}`} x={x0} y={plotTop} width={Math.max(0, x1 - x0)} height={plotH} fill={c} opacity={0.12} />;
          })}
        </g>
        <line x1={LEFT} y1={plotTop - 6} x2={LEFT} y2={plotTop + plotH} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        <line x1={LEFT} y1={plotTop + plotH} x2={W - RIGHT} y2={plotTop + plotH} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        {(pn.yTicks ?? []).map((tk, i) => (
          <g key={`tk${i}`}>
            <line x1={LEFT} y1={Y(tk.v)} x2={W - RIGHT} y2={Y(tk.v)} stroke="rgba(0,0,0,0.06)" strokeWidth={2} />
            <text x={LEFT - 14} y={Y(tk.v) + 10} textAnchor="end" fontFamily={FONT} fontSize={28} fill={mutedColor}>
              {tk.label}
            </text>
          </g>
        ))}
        {(pn.lines ?? []).map((l, i) => {
          const o = pop(sec(l.atSeconds));
          const c = toneColor(l.tone, mutedColor);
          return (
            <g key={`ln${i}`} opacity={Math.min(1, o)}>
              <line x1={LEFT} y1={Y(l.v)} x2={LEFT + (W - LEFT - RIGHT) * Math.min(1, o)} y2={Y(l.v)} stroke={c} strokeWidth={4} strokeDasharray="12 10" />
              <text x={W - RIGHT - 8} y={Y(l.v) - 12} textAnchor="end" fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={29} fontWeight={700} fill={c}>
                {l.label}
              </text>
            </g>
          );
        })}
        <g clipPath={`url(#${clipId})`}>
          {pn.series.map((s, i) => {
            const start = s.atSeconds ?? 0;
            if (t < start) return null;
            const c = s.color ?? toneColor(s.tone, textColor);
            const k1 = Math.min(s.values.length - 1, Math.floor(tEnd * rate));
            if (k1 < 1) return null;
            let d = "";
            for (let k = 0; k <= k1; k++) {
              const x = X(k / rate).toFixed(1);
              const y = clampY(s.values[k]).toFixed(1);
              if (k === 0) d += `M${x},${y}`;
              else d += s.step ? `H${x}V${y}` : `L${x},${y}`;
            }
            const tipT = Math.min(tEnd, (s.values.length - 1) / rate);
            const tipV = sample(s.values, tipT, s.step);
            d += s.step ? `H${X(tipT).toFixed(1)}` : `L${X(tipT).toFixed(1)},${clampY(tipV).toFixed(1)}`;
            return (
              <g key={`tr${i}`}>
                <path d={d} fill="none" stroke={c} strokeWidth={s.width ?? 5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "12 10" : undefined} />
                <circle cx={X(tipT)} cy={clampY(tipV)} r={8} fill={c} />
              </g>
            );
          })}
        </g>
        {(pn.bands ?? []).map((b, i) => {
          if (!b.label || d < b.from) return null;
          const c = toneColor(b.tone, accentColor);
          const xm = (X(b.from) + X(Math.min(b.to, Math.max(b.from, tEnd)))) / 2;
          return (
            <text key={`bl${i}`} x={Math.max(LEFT + 70, Math.min(W - RIGHT - 70, xm))} y={plotTop + 34 + (b.labelRow ?? 0) * 36} textAnchor="middle" fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={27} fontWeight={700} fill={c}>
              {b.label}
            </text>
          );
        })}
        {markers.map((m, i) => {
          if (d < m.at) return null;
          const x = X(m.at);
          // Pop when the pen reaches the marker: find the video frame of data time m.at.
          let fAt = 0;
          while (fAt < frame && dataTime(pn.clock, fAt / fps) < m.at) fAt++;
          const o = pop(fAt, 12);
          const c = toneColor(m.tone, accentColor);
          const s = interpolate(o, [0, 1], [0.5, 1]);
          const wide = m.label.length > 2;
          const bw = m.label.length * 27 * 0.6 + 34;
          return (
            <g key={`mk${i}`} opacity={Math.min(1, o)}>
              <line x1={x} y1={plotTop - 10} x2={x} y2={plotTop + plotH} stroke={c} strokeWidth={3} strokeDasharray="6 8" />
              <g transform={`translate(${Math.max(LEFT + bw / 2, Math.min(W - RIGHT - bw / 2, x))},${plotTop - 26}) scale(${s})`}>
                {wide ? <rect x={-bw / 2} y={-23} width={bw} height={46} rx={23} fill={c} /> : <circle cx={0} cy={0} r={23} fill={c} />}
                <text x={0} y={10} textAnchor="middle" fontFamily={FONT} fontSize={27} fontWeight={700} fill="#FFFFFF">
                  {m.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    );
  };

  const renderFormula = () => {
    if (!formula) return null;
    const o = pop(sec(formula.atSeconds));
    return (
      <div style={{ ...card, padding: "22px 30px", opacity: Math.min(1, o), transform: `translateY(${interpolate(Math.min(1, o), [0, 1], [20, 0])}px)` }}>
        {formula.title && <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 8 }}>{formula.title}</div>}
        {formula.lines.map((ln, i) => {
          const lo = pop(sec(ln.atSeconds));
          return (
            <div key={i} style={{ fontFamily: MONO, fontSize: 36, lineHeight: 1.5, whiteSpace: "pre", color: toneColor(ln.tone, textColor), fontWeight: ln.tone ? 700 : 500, opacity: Math.min(1, lo), fontVariantLigatures: "none" }}>
              {ln.text}
            </div>
          );
        })}
      </div>
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
        gap: 24,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 12 }}>{tagline}</div>}
      </div>

      {renderStage()}

      {panels.length > 0 && (
        <div style={{ ...card, padding: "18px 22px 12px", opacity: head, display: "flex", flexDirection: "column", gap: 4 }}>
          {panels.map(renderPanel)}
          {caption && (
            <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, opacity: cap, padding: "0 12px 6px" }}>
              {caption}
            </div>
          )}
        </div>
      )}

      {renderFormula()}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {points.map((pt, i) => {
            const p = pop(sec(pt.atSeconds ?? 1.5 + i * 0.6));
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
