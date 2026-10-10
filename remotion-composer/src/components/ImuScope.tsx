import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted" | "warn";

export interface ImuSeries {
  label: string;
  /** One value per sample; sample k sits at k / imuRate seconds after cut start. */
  values: number[];
  tone?: Tone;
  /** Explicit stroke colour (wins over `tone`). */
  color?: string;
  width?: number;
  dashed?: boolean;
  /** Seconds after cut start before which the trace is hidden (it then shows its history up to now). */
  atSeconds?: number;
}

export interface ImuLine {
  v: number;
  label: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface ImuBand {
  /** Data time in seconds (same clock as the cut). */
  from: number;
  to: number;
  label?: string;
  tone?: Tone;
}

export interface ImuMarker {
  /** Data time in seconds; the marker pops when the pen reaches it. */
  at: number;
  label: string;
  tone?: Tone;
}

export interface ImuReadout {
  label: string;
  /** Index into `series`; the readout shows that series' value at the current time. */
  series?: number;
  /** Own samples at `rate` (for a value that is not plotted, e.g. the tilt angle); wins over `series`. */
  values?: number[];
  unit?: string;
  decimals?: number;
  tone?: Tone;
  color?: string;
  atSeconds?: number;
}

export interface ImuPose {
  /** Samples per second of the arrays below (default: the scene `rate`). */
  rate?: number;
  /** Board rotation in the picture plane, degrees (positive = clockwise). */
  angle: number[];
  /** Vertical drop in px (positive = down). */
  drop?: number[];
}

export interface ImuStatus {
  atSeconds: number;
  untilSeconds?: number;
  text: string;
  tone?: Tone;
}

export interface ImuFormula {
  lines: string[];
  title?: string;
  atSeconds?: number;
  /** Line index to highlight from `highlightAtSeconds`. */
  highlight?: number;
  highlightAtSeconds?: number;
}

export interface ImuSpectrumFrame {
  atSeconds: number;
  /** Bar heights 0..1, one per bin; frames are interpolated. */
  bins: number[];
}

export interface ImuSpectrum {
  title?: string;
  atSeconds?: number;
  /** Frequency of the last bin edge, for the axis (e.g. 100 → "100 Hz"). */
  maxHz: number;
  ticks?: number[];
  frames: ImuSpectrumFrame[];
  /** Bin index to label (e.g. the motor peak) and when. */
  peak?: { bin: number; label: string; atSeconds?: number; tone?: Tone };
  height?: number;
}

interface ImuScopeProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  rate: number;
  series?: ImuSeries[];
  plotTitle?: string;
  yMin: number;
  yMax: number;
  yTicks?: { v: number; label: string }[];
  /** Visible time span. With `scroll` the window slides with the pen, otherwise it covers 0..span. */
  spanSeconds: number;
  scroll?: boolean;
  lines?: ImuLine[];
  bands?: ImuBand[];
  markers?: ImuMarker[];
  plotHeight?: number;
  readouts?: ImuReadout[];
  pose?: ImuPose;
  boardLabel?: string;
  status?: ImuStatus[];
  formula?: ImuFormula;
  spectrum?: ImuSpectrum;
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
const LEFT = 130;
const RIGHT = 24;

/**
 * Live IMU scope in a light card: a sensor board that tilts and drops with the motion, readouts that tick with
 * the data, a pen-drawn plot of accelerometer / gyroscope / angle series (fixed span or scrolling window) with
 * threshold lines, shaded time bands and numbered event markers, plus an optional formula card and an FFT
 * spectrum whose bars morph between frames. Built for fall detection, the complementary filter and vibration.
 */
export const ImuScope: React.FC<ImuScopeProps> = ({
  name,
  eyebrow,
  tagline,
  rate,
  series = [],
  plotTitle,
  yMin,
  yMax,
  yTicks = [],
  spanSeconds,
  scroll = false,
  lines = [],
  bands = [],
  markers = [],
  plotHeight = 470,
  readouts = [],
  pose,
  boardLabel = "IMU",
  status = [],
  formula,
  spectrum,
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
  const sample = (vals: number[], r: number, time: number) => {
    if (vals.length === 0) return 0;
    const x = Math.max(0, Math.min(vals.length - 1, time * r));
    const i = Math.floor(x);
    const f = x - i;
    return i + 1 < vals.length ? vals[i] * (1 - f) + vals[i + 1] * f : vals[i];
  };
  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };

  // ---- Stage: tilting board + readouts + status pill ----
  const renderStage = () => {
    if (!pose && readouts.length === 0) return null;
    const pr = pose?.rate ?? rate;
    const ang = pose ? sample(pose.angle, pr, t) : 0;
    const drop = pose?.drop ? sample(pose.drop, pr, t) : 0;
    const st = status.filter((s) => t >= s.atSeconds && (s.untilSeconds === undefined || t < s.untilSeconds)).pop();
    const stPop = st ? pop(sec(st.atSeconds), 12) : 0;
    return (
      <div style={{ ...card, padding: "24px 30px", display: "flex", alignItems: "center", gap: 26, minHeight: 330, position: "relative", overflow: "hidden" }}>
        {pose && (
          <div style={{ flex: "0 0 330px", height: 300, display: "flex", alignItems: "center", justifyContent: "center", perspective: 1400, position: "relative" }}>
            {/* Gravity arrow: always straight down */}
            <svg width={60} height={260} viewBox="0 0 60 260" style={{ position: "absolute", left: 0, top: 20 }}>
              <line x1={30} y1={10} x2={30} y2={220} stroke={mutedColor} strokeWidth={5} strokeDasharray="10 8" />
              <path d="M14,212 L30,246 L46,212 Z" fill={mutedColor} />
            </svg>
            <div style={{ position: "absolute", left: 4, top: 0, fontSize: 30, fontWeight: 700, color: mutedColor }}>g</div>
            <div style={{ transform: `translateY(${drop}px) rotateX(16deg) rotate(${ang}deg)`, transformStyle: "preserve-3d" }}>
              <svg width={250} height={170} viewBox="0 0 250 170" style={{ display: "block", filter: "drop-shadow(0 16px 18px rgba(16,24,40,0.28))" }}>
                <rect x={2} y={2} width={246} height={166} rx={14} fill="#1F5FAF" stroke="#174A88" strokeWidth={4} />
                <circle cx={22} cy={22} r={9} fill="#FAFCFF" stroke="#C9A43A" strokeWidth={4} />
                <circle cx={228} cy={22} r={9} fill="#FAFCFF" stroke="#C9A43A" strokeWidth={4} />
                <rect x={92} y={34} width={66} height={66} rx={6} fill="#1D1D1F" />
                <circle cx={102} cy={44} r={4} fill="#5E5E63" />
                <text x={125} y={74} textAnchor="middle" fontFamily={FONT} fontSize={16} fontWeight={700} fill="#E8E8ED">{boardLabel}</text>
                {Array.from({ length: 8 }).map((_, i) => (
                  <rect key={i} x={24 + i * 27} y={136} width={16} height={22} rx={3} fill="#C9A43A" />
                ))}
                {/* Board axes */}
                <line x1={180} y1={70} x2={226} y2={70} stroke="#FF6B6B" strokeWidth={5} />
                <path d="M226,62 L240,70 L226,78 Z" fill="#FF6B6B" />
                <text x={222} y={56} fontFamily={FONT} fontSize={20} fontWeight={700} fill="#FFFFFF">X</text>
                <line x1={180} y1={70} x2={180} y2={24} stroke="#7CE38B" strokeWidth={5} />
                <path d="M172,26 L180,12 L188,26 Z" fill="#7CE38B" />
                <text x={192} y={30} fontFamily={FONT} fontSize={20} fontWeight={700} fill="#FFFFFF">Y</text>
              </svg>
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {status.length > 0 && (
            <div style={{ height: 60, display: "flex", alignItems: "center" }}>
              {st && (
                <div
                  style={{
                    padding: "10px 24px",
                    borderRadius: 40,
                    background: toneColor(st.tone, accentColor),
                    color: "#FFFFFF",
                    fontSize: 32,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    opacity: Math.min(1, stPop),
                    transform: `scale(${interpolate(stPop, [0, 1], [0.6, 1])})`,
                    transformOrigin: "left center",
                    boxShadow: "0 10px 24px rgba(16,24,40,0.18)",
                  }}
                >
                  {st.text}
                </div>
              )}
            </div>
          )}
          {readouts.map((ro, i) => {
            const o = pop(sec(ro.atSeconds));
            const s = ro.series !== undefined ? series[ro.series] : undefined;
            const vals = ro.values ?? s?.values;
            if (!vals) return null;
            const v = sample(vals, rate, Math.max(t, s?.atSeconds ?? 0));
            const c = ro.color ?? s?.color ?? toneColor(ro.tone ?? s?.tone, textColor);
            const txt = v.toFixed(ro.decimals ?? 1).replace(".", ",").replace(/^-/, "−");
            return (
              <div key={i} style={{ opacity: o, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 9, background: c, display: "inline-block" }} />
                  {ro.label}
                </div>
                <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em", color: textColor, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                  {txt}
                  {ro.unit && <span style={{ fontSize: 34, fontWeight: 600, color: bodyColor, marginLeft: 8 }}>{ro.unit}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ---- Plot ----
  const renderPlot = () => {
    if (series.length === 0) return null;
    const H = plotHeight;
    const legendH = 62;
    const top = (plotTitle ? 60 : 16) + legendH;
    const hasMarkers = markers.length > 0;
    const plotTop = top + (hasMarkers ? 44 : 0);
    const bottom = 30;
    const plotH = H - plotTop - bottom;
    const t0 = scroll ? Math.max(0, t - spanSeconds) : 0;
    const X = (time: number) => LEFT + ((time - t0) / spanSeconds) * (W - LEFT - RIGHT);
    const Y = (v: number) => plotTop + plotH * (1 - (v - yMin) / (yMax - yMin));
    const clampY = (v: number) => Math.max(plotTop - 4, Math.min(plotTop + plotH + 4, Y(v)));
    const tEnd = Math.min(t, scroll ? t : spanSeconds);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <clipPath id="imu-plot-clip">
            <rect x={LEFT} y={plotTop - 30} width={W - LEFT - RIGHT} height={plotH + 34} />
          </clipPath>
        </defs>
        {plotTitle && (
          <text x={LEFT} y={42} fontFamily={FONT} fontSize={38} fontWeight={700} fill={textColor}>
            {plotTitle}
          </text>
        )}
        {/* Legend */}
        {(() => {
          let x = LEFT;
          return series.map((s, i) => {
            const o = pop(sec(s.atSeconds));
            const c = s.color ?? toneColor(s.tone, textColor);
            const el = (
              <g key={`lg${i}`} opacity={Math.min(1, o)}>
                <line x1={x} y1={top - 30} x2={x + 36} y2={top - 30} stroke={c} strokeWidth={7} strokeLinecap="round" strokeDasharray={s.dashed ? "10 8" : undefined} />
                <text x={x + 48} y={top - 20} fontFamily={FONT} fontSize={30} fontWeight={600} fill={c === mutedColor ? mutedColor : textColor}>
                  {s.label}
                </text>
              </g>
            );
            x += 48 + s.label.length * 30 * 0.56 + 40;
            return el;
          });
        })()}
        {/* Time bands */}
        <g clipPath="url(#imu-plot-clip)">
          {bands.map((b, i) => {
            if (t < b.from) return null;
            const c = toneColor(b.tone, accentColor);
            const x0 = X(b.from);
            const x1 = X(Math.min(b.to, tEnd));
            return (
              <g key={`bd${i}`}>
                <rect x={x0} y={plotTop} width={Math.max(0, x1 - x0)} height={plotH} fill={c} opacity={0.12} />
              </g>
            );
          })}
        </g>
        {/* Axes and ticks */}
        <line x1={LEFT} y1={plotTop - 6} x2={LEFT} y2={plotTop + plotH} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        <line x1={LEFT} y1={plotTop + plotH} x2={W - RIGHT} y2={plotTop + plotH} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
        {yTicks.map((tk, i) => (
          <g key={`tk${i}`}>
            <line x1={LEFT} y1={Y(tk.v)} x2={W - RIGHT} y2={Y(tk.v)} stroke="rgba(0,0,0,0.06)" strokeWidth={2} />
            <text x={LEFT - 14} y={Y(tk.v) + 10} textAnchor="end" fontFamily={FONT} fontSize={28} fill={mutedColor}>
              {tk.label}
            </text>
          </g>
        ))}
        {/* Threshold lines */}
        {lines.map((l, i) => {
          const o = pop(sec(l.atSeconds));
          const c = toneColor(l.tone, mutedColor);
          return (
            <g key={`ln${i}`} opacity={Math.min(1, o)}>
              <line x1={LEFT} y1={Y(l.v)} x2={LEFT + (W - LEFT - RIGHT) * Math.min(1, o)} y2={Y(l.v)} stroke={c} strokeWidth={4} strokeDasharray="12 10" />
              <text x={W - RIGHT - 8} y={Y(l.v) - 12} textAnchor="end" fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={30} fontWeight={700} fill={c}>
                {l.label}
              </text>
            </g>
          );
        })}
        {/* Traces */}
        <g clipPath="url(#imu-plot-clip)">
          {series.map((s, i) => {
            const start = s.atSeconds ?? 0;
            if (t < start) return null;
            const c = s.color ?? toneColor(s.tone, textColor);
            const k0 = Math.max(0, Math.floor(t0 * rate) - 1);
            const k1 = Math.min(s.values.length - 1, Math.floor(tEnd * rate));
            if (k1 <= k0) return null;
            let d = "";
            for (let k = k0; k <= k1; k++) d += `${k === k0 ? "M" : "L"}${X(k / rate).toFixed(1)},${clampY(s.values[k]).toFixed(1)}`;
            // Pen tip at the exact current time
            const tipT = Math.min(tEnd, (s.values.length - 1) / rate);
            d += `L${X(tipT).toFixed(1)},${clampY(sample(s.values, rate, tipT)).toFixed(1)}`;
            return (
              <g key={`tr${i}`}>
                <path d={d} fill="none" stroke={c} strokeWidth={s.width ?? 5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "12 10" : undefined} />
                <circle cx={X(tipT)} cy={clampY(sample(s.values, rate, tipT))} r={8} fill={c} />
              </g>
            );
          })}
        </g>
        {/* Band labels on top of traces */}
        {bands.map((b, i) => {
          if (!b.label || t < b.from) return null;
          const c = toneColor(b.tone, accentColor);
          const xm = (X(b.from) + X(Math.min(b.to, Math.max(b.from, tEnd)))) / 2;
          if (xm < LEFT || xm > W - RIGHT) return null;
          return (
            <text key={`bl${i}`} x={Math.max(LEFT + 70, Math.min(W - RIGHT - 70, xm))} y={plotTop + plotH - 16} textAnchor="middle" fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={28} fontWeight={700} fill={c}>
              {b.label}
            </text>
          );
        })}
        {/* Event markers */}
        {markers.map((m, i) => {
          if (t < m.at) return null;
          const x = X(m.at);
          if (x < LEFT - 1 || x > W - RIGHT + 1) return null;
          const o = pop(sec(m.at), 12);
          const c = toneColor(m.tone, accentColor);
          const s = interpolate(o, [0, 1], [0.5, 1]);
          const wide = m.label.length > 2;
          const bw = m.label.length * 28 * 0.6 + 34;
          return (
            <g key={`mk${i}`} opacity={Math.min(1, o)}>
              <line x1={x} y1={plotTop - 10} x2={x} y2={plotTop + plotH} stroke={c} strokeWidth={3} strokeDasharray="6 8" />
              <g transform={`translate(${Math.max(LEFT + bw / 2, Math.min(W - RIGHT - bw / 2, x))},${plotTop - 26}) scale(${s})`}>
                {wide ? <rect x={-bw / 2} y={-24} width={bw} height={48} rx={24} fill={c} /> : <circle cx={0} cy={0} r={24} fill={c} />}
                <text x={0} y={10} textAnchor="middle" fontFamily={FONT} fontSize={28} fontWeight={700} fill="#FFFFFF">
                  {m.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    );
  };

  // ---- Formula ----
  const renderFormula = () => {
    if (!formula) return null;
    const o = pop(sec(formula.atSeconds));
    const hl = formula.highlight !== undefined && t >= (formula.highlightAtSeconds ?? 0) ? formula.highlight : -1;
    return (
      <div style={{ ...card, padding: "22px 30px", opacity: Math.min(1, o), transform: `translateY(${interpolate(o, [0, 1], [20, 0])}px)` }}>
        {formula.title && <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 10 }}>{formula.title}</div>}
        {formula.lines.map((ln, i) => (
          <div
            key={i}
            style={{
              fontFamily: MONO,
              fontSize: 34,
              lineHeight: 1.5,
              whiteSpace: "pre",
              color: i === hl ? accentColor : textColor,
              fontWeight: i === hl ? 700 : 500,
              background: i === hl ? "rgba(0,102,204,0.08)" : "transparent",
              borderRadius: 10,
              padding: "0 10px",
            }}
          >
            {ln}
          </div>
        ))}
      </div>
    );
  };

  // ---- Spectrum ----
  const renderSpectrum = () => {
    if (!spectrum || spectrum.frames.length === 0) return null;
    const o = pop(sec(spectrum.atSeconds));
    const H = spectrum.height ?? 420;
    const fr = spectrum.frames;
    let a = fr[0];
    let b = fr[0];
    for (let i = 0; i < fr.length; i++) {
      if (fr[i].atSeconds <= t) {
        a = fr[i];
        b = fr[Math.min(fr.length - 1, i + 1)];
      }
    }
    const span = b.atSeconds - a.atSeconds;
    const mix = span > 0 ? Math.max(0, Math.min(1, (t - a.atSeconds) / span)) : 0;
    const ease = mix * mix * (3 - 2 * mix);
    const n = a.bins.length;
    const top = spectrum.title ? 70 : 20;
    const bottom = 56;
    const plotH = H - top - bottom;
    const X = (hz: number) => LEFT + (hz / spectrum.maxHz) * (W - LEFT - RIGHT);
    const bw = (W - LEFT - RIGHT) / n;
    const pk = spectrum.peak;
    const pkO = pk ? pop(sec(pk.atSeconds)) : 0;
    return (
      <div style={{ ...card, padding: "22px 26px 14px", opacity: Math.min(1, o) }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
          {spectrum.title && (
            <text x={LEFT} y={44} fontFamily={FONT} fontSize={38} fontWeight={700} fill={textColor}>
              {spectrum.title}
            </text>
          )}
          <line x1={LEFT} y1={top + plotH} x2={W - RIGHT} y2={top + plotH} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
          {Array.from({ length: n }).map((_, i) => {
            const v = (a.bins[i] ?? 0) * (1 - ease) + (b.bins[i] ?? 0) * ease;
            const h = Math.max(2, v * plotH * Math.min(1, o));
            const isPk = pk && i === pk.bin && pkO > 0.05;
            return <rect key={i} x={LEFT + i * bw + bw * 0.12} y={top + plotH - h} width={bw * 0.76} height={h} rx={Math.min(6, bw * 0.3)} fill={isPk ? toneColor(pk?.tone, accentColor) : "#8E8E93"} />;
          })}
          {(spectrum.ticks ?? []).map((hz, i) => (
            <text key={i} x={X(hz)} y={top + plotH + 40} textAnchor="middle" fontFamily={FONT} fontSize={28} fill={mutedColor}>
              {hz} Hz
            </text>
          ))}
          {pk && pkO > 0.01 && (() => {
            const v = (a.bins[pk.bin] ?? 0) * (1 - ease) + (b.bins[pk.bin] ?? 0) * ease;
            const x = LEFT + (pk.bin + 0.5) * bw;
            const y = top + plotH - v * plotH - 22;
            const c = toneColor(pk.tone, accentColor);
            const tw = pk.label.length * 32 * 0.56 + 32;
            const cx = Math.max(LEFT + tw / 2, Math.min(W - RIGHT - tw / 2, x));
            return (
              <g opacity={Math.min(1, pkO)}>
                <rect x={cx - tw / 2} y={Math.max(4, y - 50)} width={tw} height={48} rx={24} fill={c} />
                <text x={cx} y={Math.max(4, y - 50) + 34} textAnchor="middle" fontFamily={FONT} fontSize={30} fontWeight={700} fill="#FFFFFF">
                  {pk.label}
                </text>
              </g>
            );
          })()}
        </svg>
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
        gap: 26,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 12 }}>{tagline}</div>}
      </div>

      {renderStage()}

      {series.length > 0 && (
        <div style={{ ...card, padding: "20px 22px 14px", opacity: head }}>
          {renderPlot()}
          {caption && (
            <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, opacity: cap, padding: "0 12px 6px" }}>
              {caption}
            </div>
          )}
        </div>
      )}

      {renderFormula()}
      {renderSpectrum()}

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
