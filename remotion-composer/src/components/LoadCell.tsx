import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveAsset } from "../lib/resolveAsset";
import type { CodePoint } from "./CodeCompare";

export type CellTone = "neutral" | "good" | "bad" | "accent" | "muted";
/** [seconds after cut start, value] */
export type CellTrackPoint = [number, number];

export interface CellWeight {
  /** Text on the weight, e.g. "500 g". */
  label: string;
  /** Mass in grams: sets the bend, the readouts and the drawn size. */
  grams: number;
  /** Seconds when it starts to drop onto the platform (lands 0.35 s later). */
  atSeconds: number;
  /** Seconds when it is lifted off again. */
  untilSeconds?: number;
  /** "weight" = calibration weight with a knob (default), "box" = a plain object. */
  kind?: "weight" | "box";
  color?: string;
}

export interface CellBench {
  atSeconds?: number;
  /** Rated capacity in grams (default 5000): full bend and full bridge output. */
  capacityGrams?: number;
  weights?: CellWeight[];
  /** Strain gauges appear (and colour by tension / compression) from this time. */
  gaugesAtSeconds?: number;
  /** Leader label pointing at the gauges, e.g. "4 điện trở biến dạng". */
  gaugeLabel?: string;
  gaugeLabelAtSeconds?: number;
  /** Engraved on the bar (default "5 kg"). */
  label?: string;
  /** Panel height in diagram units (width is 1000; default 420). */
  height?: number;
  /** Drawn deflection at full capacity in diagram units (default 22; exaggerated). */
  bendPx?: number;
  /** Small note shown while the bar is bent, e.g. "độ cong phóng đại". */
  bendLabel?: string;
}

export interface CellBridge {
  atSeconds?: number;
  /** Excitation voltage (default 3.3). */
  excitation?: number;
  /** Rated output in mV/V (default 1). */
  ratedMvPerV?: number;
  /** Label above the output value. */
  label?: string;
  /** Line(s) under the value, e.g. "1 mV/V × 3,3 V"; a newline breaks lines. */
  note?: string;
  noteAtSeconds?: number;
}

export interface CellReadout {
  label: string;
  unit?: string;
  decimals?: number;
  /** grams = bench load in g; raw = offset + k × grams (24-bit counts); track = `track` values. */
  mode?: "grams" | "raw" | "track";
  offset?: number;
  /** Counts per gram for `raw`. */
  k?: number;
  track?: CellTrackPoint[];
  /** Interpolate `track` / `drift` linearly instead of stepping. */
  ramp?: boolean;
  /** Noise amplitude in grams (steps), roughly the peak of the jitter. */
  noise?: CellTrackPoint[];
  /** Additive offset in grams, interpolated linearly (slow drift). */
  drift?: CellTrackPoint[];
  /** Display updates per second (default 10, like the HX711 at RATE = 0). */
  rate?: number;
  seed?: number;
  atSeconds?: number;
  /** Text overrides, e.g. "– – –" before calibration; null returns to the number. */
  text?: { atSeconds: number; text: string | null }[];
  badges?: { atSeconds: number; untilSeconds?: number; text: string; tone?: CellTone }[];
  /** Tone of the value. */
  tone?: CellTone;
}

export interface CellStep {
  atSeconds?: number;
  text: string;
  /** Short label left of the text, e.g. "1". */
  label?: string;
  tone?: CellTone;
  /** Monospace text (default true). */
  mono?: boolean;
}

export interface CellPin {
  id: string;
  text: string;
  sub?: string;
  /** Rows this pin spans (default 1). */
  span?: number;
  tone?: CellTone;
  strike?: boolean;
  atSeconds?: number;
}

export interface CellColumn {
  title: string;
  sub?: string;
  image?: string;
  /** Pins on the block's left / right edge. */
  left?: CellPin[];
  right?: CellPin[];
  atSeconds?: number;
}

export interface CellWire {
  from: string;
  to: string;
  color: string;
  atSeconds?: number;
  untilSeconds?: number;
  /** Draw a grey outline (white wires). */
  outline?: boolean;
}

export interface CellWiring {
  columns: CellColumn[];
  wires?: CellWire[];
  rowHeight?: number;
  imageHeight?: number;
  highlights?: { pin: string; atSeconds: number; untilSeconds?: number; tone?: CellTone }[];
  atSeconds?: number;
}

export interface CellSeries {
  label: string;
  tone?: CellTone;
  color?: string;
  /** Values evenly spaced over the x axis. */
  values: number[];
  atSeconds?: number;
  drawSeconds?: number;
  width?: number;
  dashed?: boolean;
}

export interface CellChart {
  title?: string;
  atSeconds?: number;
  /** Diagram units (width 1000; default 460). */
  height?: number;
  yMin: number;
  yMax: number;
  yTicks?: number[];
  unit?: string;
  xLabels?: { x: number; text: string }[];
  series: CellSeries[];
  bands?: { from: number; to: number; label?: string; tone?: CellTone; atSeconds?: number }[];
  markers?: { x: number; text: string; atSeconds?: number; tone?: CellTone }[];
  spans?: { from: number; to: number; text: string; atSeconds?: number; tone?: CellTone }[];
}

interface LoadCellProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  bench?: CellBench;
  bridge?: CellBridge;
  readouts?: CellReadout[];
  steps?: CellStep[];
  stepsTitle?: string;
  wiring?: CellWiring;
  chart?: CellChart;
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
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";
const FALL = 0.35; // seconds a weight takes to land
const PANEL_W = 828; // inner card width in portrait (1080 - 2 x 100 margin - 2 x 26 padding)

const rnd = (n: number, seed: number) => {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
/** Deterministic, roughly normal jitter in [-1, 1]. */
const jitter = (n: number, seed: number) => (rnd(n, seed) + rnd(n, seed + 1.7) + rnd(n, seed + 3.1) - 1.5) / 1.5;

const trackAt = (track: CellTrackPoint[] | undefined, t: number, ramp: boolean, fallback = 0) => {
  if (!track || track.length === 0) return fallback;
  const pts = [...track].sort((a, b) => a[0] - b[0]);
  if (t <= pts[0][0]) return ramp ? pts[0][1] : t < pts[0][0] ? fallback : pts[0][1];
  for (let i = pts.length - 1; i >= 0; i--) {
    if (t >= pts[i][0]) {
      if (!ramp || i === pts.length - 1) return pts[i][1];
      const [t0, v0] = pts[i];
      const [t1, v1] = pts[i + 1];
      return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0);
    }
  }
  return fallback;
};

const fmt = (v: number, decimals: number) => {
  const neg = v < 0;
  const s = Math.abs(v).toFixed(decimals);
  const [int, dec] = s.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg && Number(s) !== 0 ? "−" : "") + grouped + (dec ? "," + dec : "");
};

/**
 * Load cell scale explainer in a light card: a bar load cell that bends when weights drop on it (strain gauges in
 * tension / compression), a bridge panel with the mV output, digital readouts sampled like an HX711 (raw counts or
 * grams, with noise and drift), formula steps, a three-column wiring panel and a drift chart. Every panel is
 * optional; panels without `atSeconds` are drawn from the first frame.
 */
export const LoadCell: React.FC<LoadCellProps> = ({
  name,
  eyebrow,
  tagline,
  bench,
  bridge,
  readouts = [],
  steps = [],
  stepsTitle,
  wiring,
  chart,
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
  layout = "centered",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = frame / fps;
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  const pop = (start: number, damping = 16) =>
    start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });
  const toneColor = (tn: CellTone | undefined, fallback = textColor) =>
    tn === "good" ? proColor : tn === "bad" ? conColor : tn === "accent" ? accentColor : tn === "muted" ? mutedColor : fallback;

  // ---- Bench load model -------------------------------------------------------------------------------------
  const capacity = bench?.capacityGrams ?? 5000;
  const weights = [...(bench?.weights ?? [])].sort((a, b) => a.atSeconds - b.atSeconds);
  /** 0..1 how much of a weight rests on the platform at time s (seconds). */
  const restAt = (w: CellWeight, s: number) => {
    const land = w.atSeconds + FALL;
    const on = interpolate(s, [land, land + 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const off = w.untilSeconds === undefined ? 1 : interpolate(s, [w.untilSeconds, w.untilSeconds + 0.12], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return on * off;
  };
  const loadAt = (s: number) => weights.reduce((sum, w) => sum + w.grams * restAt(w, s), 0);
  const load = loadAt(t);
  // Small damped wobble after each landing, for the bend only.
  const wobble = weights.reduce((sum, w) => {
    const tl = t - (w.atSeconds + FALL);
    if (tl < 0 || tl > 1.2 || (w.untilSeconds !== undefined && t > w.untilSeconds)) return sum;
    return sum + (w.grams / capacity) * 0.35 * Math.sin(2 * Math.PI * 3.2 * tl) * Math.exp(-tl * 5);
  }, 0);
  const loadFrac = Math.min(1.2, load / capacity);

  // ---- Panels ----------------------------------------------------------------------------------------------
  const head = pop(0, 18);
  const svgFont = (px: number) => px / (PANEL_W / 1000); // diagram units for a given on-screen px size

  const renderBench = () => {
    if (!bench) return null;
    const H = bench.height ?? 420;
    const p = pop(at(bench.atSeconds, 0));
    const d = (bench.bendPx ?? 22) * (loadFrac + wobble);
    const ground = H - 18;
    const baseTop = H - 110;
    const barBot = baseTop - 30;
    const barTop = barBot - 90;
    const mid = (barTop + barBot) / 2;
    const off = (x: number) => (x <= 335 ? 0 : x >= 485 ? d : ((x - 335) / 150) * d);
    const barPts = [100, 335, 485, 720];
    const poly = [...barPts.map((x) => `${x},${barTop + off(x)}`), ...[...barPts].reverse().map((x) => `${x},${barBot + off(x)}`)].join(" ");
    const platTop = barTop - 50 + d;
    const gaugesOn = bench.gaugesAtSeconds !== undefined && frame >= at(bench.gaugesAtSeconds, 0);
    const gp = bench.gaugesAtSeconds === undefined ? 0 : pop(at(bench.gaugesAtSeconds, 0));
    const strain = Math.min(1, Math.max(load > 1 ? 0.3 : 0, loadFrac));
    const tension = conColor;
    const compression = accentColor;
    const gaugeFill = (kind: "t" | "c") => (load > 1 ? (kind === "t" ? tension : compression) : "#8E8E93");
    const gauges: { x: number; y: number; kind: "t" | "c" }[] = [
      { x: 365, y: barTop + off(365) - 10, kind: "t" },
      { x: 455, y: barTop + off(455) - 10, kind: "c" },
      { x: 365, y: barBot + off(365), kind: "c" },
      { x: 455, y: barBot + off(455), kind: "t" },
    ];
    const lp = bench.gaugeLabel ? pop(at(bench.gaugeLabelAtSeconds ?? bench.gaugesAtSeconds, 0)) : 0;
    // Stack the weights that are on (or falling onto, or leaving) the platform.
    let stackTop = platTop;
    const drawn: React.ReactNode[] = [];
    for (const w of weights) {
      const f0 = at(w.atSeconds, 0);
      if (frame < f0) continue;
      const leaving = w.untilSeconds !== undefined && frame >= at(w.untilSeconds, 0);
      const leaveK = leaving ? interpolate(frame, [at(w.untilSeconds, 0), at(w.untilSeconds, 0) + Math.round(0.4 * fps)], [0, 1], { extrapolateRight: "clamp" }) : 0;
      if (leaveK >= 1) continue;
      const k = Math.cbrt(Math.max(50, w.grams) / 500); // drawn size grows with the cube root of the mass
      const wh = Math.min(112, 70 * k);
      const ww = Math.min(180, 104 * k);
      const fallK = interpolate(frame, [f0, f0 + Math.round(FALL * fps)], [0, 1], { extrapolateRight: "clamp" });
      const fallY = (1 - fallK * fallK) * -300 - leaveK * 220;
      const op = Math.min(1, fallK * 4) * (1 - leaveK);
      const cx = 690;
      const yb = stackTop + fallY; // bottom of this weight
      const knobH = w.kind === "box" ? 0 : Math.max(14, wh * 0.2);
      drawn.push(
        <g key={w.label + w.atSeconds} opacity={op}>
          {w.kind === "box" ? (
            <rect x={cx - ww / 2} y={yb - wh} width={ww} height={wh} rx={14} fill={w.color ?? "#F5D9A8"} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
          ) : (
            <>
              <rect x={cx - ww * 0.16} y={yb - wh - knobH} width={ww * 0.32} height={knobH + 6} rx={6} fill="url(#lcMetal)" stroke="#8E8E93" strokeWidth={2.5} />
              <ellipse cx={cx} cy={yb - wh - knobH} rx={ww * 0.22} ry={knobH * 0.45} fill="url(#lcMetal)" stroke="#8E8E93" strokeWidth={2.5} />
              <rect x={cx - ww / 2} y={yb - wh} width={ww} height={wh} rx={16} fill="url(#lcMetal)" stroke="#8E8E93" strokeWidth={3} />
            </>
          )}
          <text x={cx} y={yb - wh / 2 + svgFont(30) * 0.36} textAnchor="middle" fontSize={svgFont(Math.min(36, 30 * Math.max(1, k * 0.9)))} fontWeight={700} fill={textColor} fontFamily={FONT}>
            {w.label}
          </text>
        </g>,
      );
      if (fallK >= 1 && !leaving) stackTop -= wh + knobH;
    }
    return (
      <div style={{ opacity: p, transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px)` }}>
        <svg viewBox={`0 0 1000 ${H}`} style={{ width: "100%", display: "block" }}>
          <defs>
            <linearGradient id="lcMetal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F2F2F5" />
              <stop offset="0.55" stopColor="#C7C7CC" />
              <stop offset="1" stopColor="#A1A1A6" />
            </linearGradient>
            <linearGradient id="lcBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F5F5F7" />
              <stop offset="1" stopColor="#C9CBD1" />
            </linearGradient>
          </defs>
          {/* Desk, base and spacer */}
          <line x1={20} y1={ground} x2={980} y2={ground} stroke="#C7C7CC" strokeWidth={4} />
          <rect x={40} y={baseTop} width={300} height={ground - baseTop} rx={10} fill="#D8D8DD" stroke="#AEAEB2" strokeWidth={3} />
          <rect x={100} y={barBot} width={200} height={baseTop - barBot} fill="#AEAEB2" />
          {/* Bar with the binocular hole */}
          <polygon points={poly} fill="url(#lcBar)" stroke="#8E8E93" strokeWidth={3} strokeLinejoin="round" />
          <circle cx={365} cy={mid + off(365)} r={30} fill="#FFFFFF" stroke="#8E8E93" strokeWidth={3} />
          <circle cx={455} cy={mid + off(455)} r={30} fill="#FFFFFF" stroke="#8E8E93" strokeWidth={3} />
          <polygon
            points={`365,${mid - 13 + off(365)} 455,${mid - 13 + off(455)} 455,${mid + 13 + off(455)} 365,${mid + 13 + off(365)}`}
            fill="#FFFFFF"
          />
          {[150, 250].map((x) => (
            <g key={x}>
              <circle cx={x} cy={barTop + 4} r={15} fill="#8E8E93" />
              <line x1={x - 8} y1={barTop + 4} x2={x + 8} y2={barTop + 4} stroke="#F5F5F7" strokeWidth={3} />
            </g>
          ))}
          <text x={600} y={mid + off(600) + svgFont(30) * 0.36} textAnchor="middle" fontSize={svgFont(30)} fontWeight={600} fill="#8E8E93" fontFamily={FONT}>
            {bench.label ?? "5 kg"}
          </text>
          {/* Leads */}
          {["#D70015", "#1D1D1F", "#FFFFFF", "#1D7A34"].map((c, i) => (
            <path
              key={c}
              d={`M 720 ${barBot - 34 + i * 8 + d} C 760 ${barBot - 30 + i * 8 + d}, 770 ${ground - 60}, 800 ${ground - 52 + i * 4}`}
              fill="none"
              stroke={c}
              strokeWidth={6}
              style={c === "#FFFFFF" ? { filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.6))" } : undefined}
            />
          ))}
          {/* Right spacer and platform */}
          <rect x={560} y={barTop - 30 + d} width={160} height={30} fill="#AEAEB2" />
          <rect x={450} y={platTop} width={480} height={20} rx={6} fill="#D8D8DD" stroke="#AEAEB2" strokeWidth={3} />
          {/* Strain gauges */}
          {gaugesOn &&
            gauges.map((g, i) => (
              <g key={i} opacity={gp}>
                <rect x={g.x - 24} y={g.y} width={48} height={10} rx={2} fill={gaugeFill(g.kind)} opacity={load > 1 ? 0.45 + 0.55 * strain : 1} />
                <path
                  d={`M ${g.x - 18} ${g.y + 5} l 6 -3 l 6 6 l 6 -6 l 6 6 l 6 -6 l 6 3`}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={1.6}
                />
              </g>
            ))}
          {bench.gaugeLabel && lp > 0 && (
            <g opacity={lp}>
              <text x={60} y={46} fontSize={svgFont(30)} fontWeight={600} fill={textColor} fontFamily={FONT}>
                {bench.gaugeLabel}
              </text>
              {(
                [
                  ["kéo dài", tension, 60],
                  ["nén lại", compression, 250],
                ] as const
              ).map(([txt, col, lx]) => (
                <g key={txt} opacity={load > 1 ? 1 : 0.35}>
                  <rect x={lx} y={72} width={40} height={14} rx={3} fill={col} />
                  <text x={lx + 52} y={86} fontSize={svgFont(28)} fontWeight={600} fill={col} fontFamily={FONT}>
                    {txt}
                  </text>
                </g>
              ))}
            </g>
          )}
          {drawn}
          {bench.bendLabel && d > 4 && (
            <text x={985} y={ground - 14} textAnchor="end" fontSize={svgFont(28)} fill={mutedColor} fontFamily={FONT} opacity={Math.min(1, (d - 4) / 6)}>
              {bench.bendLabel}
            </text>
          )}
        </svg>
      </div>
    );
  };

  const renderBridge = () => {
    if (!bridge) return null;
    const p = pop(at(bridge.atSeconds, 0));
    const exc = bridge.excitation ?? 3.3;
    const mv = (bridge.ratedMvPerV ?? 1) * exc * (load / capacity);
    const H = 370;
    const cx = 230;
    const cy = 185;
    const r = 125;
    const nodes = { top: [cx, cy - r], right: [cx + r, cy], bottom: [cx, cy + r], left: [cx - r, cy] } as const;
    const active = load > 1;
    const res = (a: readonly number[], b: readonly number[], tag: "+" | "−", key: string) => {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const col = active ? (tag === "+" ? conColor : accentColor) : "#8E8E93";
      const outX = mx + (mx - cx) * 0.55;
      const outY = my + (my - cy) * 0.55;
      return (
        <g key={key}>
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={textColor} strokeWidth={3.5} />
          <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
            <rect x={-30} y={-13} width={60} height={26} rx={4} fill="#FFFFFF" stroke={col} strokeWidth={4} />
          </g>
          {active && (
            <text x={outX} y={outY + svgFont(28) * 0.36} textAnchor="middle" fontSize={svgFont(28)} fontWeight={700} fill={col} fontFamily={FONT}>
              {tag}ΔR
            </text>
          )}
        </g>
      );
    };
    const np = pop(at(bridge.noteAtSeconds ?? bridge.atSeconds, 0));
    return (
      <div style={{ opacity: p, transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px)` }}>
        <svg viewBox={`0 0 1000 ${H}`} style={{ width: "100%", display: "block" }}>
          {res(nodes.top, nodes.right, "+", "r1")}
          {res(nodes.right, nodes.bottom, "−", "r2")}
          {res(nodes.bottom, nodes.left, "+", "r3")}
          {res(nodes.left, nodes.top, "−", "r4")}
          {(
            [
              ["E+", nodes.top, "#D70015", 0, -22],
              ["E−", nodes.bottom, "#1D1D1F", 0, 46],
              ["A−", nodes.left, "#8E8E93", -52, 12],
              ["A+", nodes.right, "#1D7A34", 54, 12],
            ] as const
          ).map(([label, n, c, dx, dy]) => (
            <g key={label}>
              <circle cx={n[0]} cy={n[1]} r={10} fill={c} stroke="#1D1D1F" strokeWidth={2} />
              <text x={n[0] + dx} y={n[1] + dy} textAnchor="middle" fontSize={svgFont(30)} fontWeight={700} fill={textColor} fontFamily={FONT}>
                {label}
              </text>
            </g>
          ))}
          {/* Output value */}
          <text x={520} y={100} fontSize={svgFont(28)} fontWeight={600} fill={mutedColor} fontFamily={FONT}>
            {bridge.label ?? "Điện áp ra A+ − A−"}
          </text>
          <text x={520} y={205} fontSize={svgFont(84)} fontWeight={700} fill={active ? accentColor : textColor} fontFamily={FONT} style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmt(mv, 2)} mV
          </text>
          {bridge.note && (
            <text x={520} y={262} fontSize={svgFont(30)} fill={bodyColor} fontFamily={FONT} opacity={np}>
              {bridge.note.split("\n").map((line, i) => (
                <tspan key={i} x={520} dy={i === 0 ? 0 : svgFont(30) * 1.3}>
                  {line}
                </tspan>
              ))}
            </text>
          )}
        </svg>
      </div>
    );
  };

  const renderReadouts = () => {
    if (readouts.length === 0) return null;
    return (
      <div style={{ display: "flex", gap: 20 }}>
        {readouts.map((r, i) => {
          const p = pop(at(r.atSeconds, 0));
          const rate = r.rate ?? 10;
          const n = Math.floor(t * rate);
          const ts = n / rate;
          const amp = trackAt(r.noise, ts, false, 0);
          const drift = trackAt(r.drift, ts, true, 0);
          const noise = amp * jitter(n, (r.seed ?? 1) + i * 11);
          let value: number;
          if ((r.mode ?? "grams") === "track") value = trackAt(r.track, ts, !!r.ramp, 0) + noise;
          else {
            const g = loadAt(ts) + drift + noise;
            value = r.mode === "raw" ? Math.round((r.offset ?? 0) + (r.k ?? 1) * g) : g;
          }
          const decimals = r.decimals ?? (r.mode === "raw" ? 0 : 1);
          const override = [...(r.text ?? [])].filter((x) => t >= x.atSeconds).sort((a, b) => a.atSeconds - b.atSeconds).pop();
          const shown = override && override.text !== null ? override.text : fmt(value, decimals);
          const badge = [...(r.badges ?? [])]
            .filter((b) => t >= b.atSeconds && (b.untilSeconds === undefined || t < b.untilSeconds))
            .sort((a, b) => a.atSeconds - b.atSeconds)
            .pop();
          const bp = badge ? pop(at(badge.atSeconds, 0)) : 0;
          return (
            <div
              key={r.label + i}
              style={{
                flex: 1,
                minWidth: 0,
                background: "rgba(255,255,255,0.92)",
                border: `2px solid ${borderColor}`,
                borderRadius: 28,
                padding: "20px 24px 18px",
                opacity: p,
                transform: `translateY(${interpolate(p, [0, 1], [20, 0])}px)`,
                position: "relative",
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "0.005em", color: mutedColor }}>{r.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 4 }}>
                <div
                  style={{
                    fontSize: readouts.length > 1 ? 72 : 96,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: toneColor(r.tone),
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shown}
                </div>
                {r.unit && <div style={{ fontSize: 40, fontWeight: 600, color: bodyColor }}>{r.unit}</div>}
              </div>
              {badge && (
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 18,
                    padding: "6px 16px",
                    borderRadius: 999,
                    background: toneColor(badge.tone ?? "accent"),
                    color: "#FFFFFF",
                    fontSize: 28,
                    fontWeight: 600,
                    opacity: bp,
                    transform: `scale(${interpolate(bp, [0, 1], [0.8, 1])})`,
                  }}
                >
                  {badge.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSteps = () => {
    if (steps.length === 0) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stepsTitle && <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor }}>{stepsTitle}</div>}
        {steps.map((s, i) => {
          const p = pop(at(s.atSeconds, 0.3 + i * 0.5));
          return (
            <div
              key={s.text + i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                opacity: p,
                transform: `translateX(${interpolate(p, [0, 1], [26, 0])}px)`,
              }}
            >
              {s.label && (
                <div
                  style={{
                    flex: "0 0 auto",
                    minWidth: 46,
                    height: 46,
                    padding: "0 10px",
                    borderRadius: 23,
                    background: toneColor(s.tone, accentColor),
                    color: "#FFFFFF",
                    fontSize: 26,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {s.label}
                </div>
              )}
              <div
                style={{
                  fontFamily: s.mono === false ? FONT : MONO,
                  fontSize: s.mono === false ? 36 : 30,
                  fontWeight: s.mono === false ? 500 : 600,
                  lineHeight: 1.3,
                  color: toneColor(s.tone, textColor),
                  whiteSpace: s.mono === false ? "normal" : "pre-wrap",
                  fontVariantLigatures: "none",
                }}
              >
                {s.text}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWiring = () => {
    if (!wiring) return null;
    const cols = wiring.columns;
    const n = cols.length;
    const gapX = n > 2 ? 66 : 160;
    const colW = (PANEL_W - gapX * (n - 1)) / n;
    const rowH = wiring.rowHeight ?? 76;
    const imgH = wiring.imageHeight ?? 170;
    const titleH = 74;
    const blockTop = imgH + titleH;
    const rowsOf = (pins?: CellPin[]) => (pins ?? []).reduce((s, p) => s + (p.span ?? 1), 0);
    const maxRows = Math.max(...cols.map((c) => Math.max(rowsOf(c.left), rowsOf(c.right))), 1);
    const blockH = maxRows * rowH + 24;
    const H = blockTop + blockH + 8;
    // Pin anchor positions.
    const anchors: Record<string, { x: number; y: number; ci: number; side: "l" | "r" }> = {};
    cols.forEach((c, ci) => {
      const x0 = ci * (colW + gapX);
      (["left", "right"] as const).forEach((side) => {
        let row = 0;
        for (const pin of c[side] ?? []) {
          const span = pin.span ?? 1;
          anchors[pin.id] = { x: side === "left" ? x0 : x0 + colW, y: blockTop + 12 + (row + span / 2) * rowH, ci, side: side === "left" ? "l" : "r" };
          row += span;
        }
      });
    });
    const wp = pop(at(wiring.atSeconds, 0));
    const hl = (id: string) =>
      (wiring.highlights ?? []).find((h) => h.pin === id && t >= h.atSeconds && (h.untilSeconds === undefined || t < h.untilSeconds));
    const pinChip = (pin: CellPin, side: "left" | "right", top: number) => {
      const pp = pop(at(pin.atSeconds, 0));
      const h = hl(pin.id);
      const span = pin.span ?? 1;
      const hk = h ? pop(at(h.atSeconds, 0)) : 0;
      const col = toneColor(pin.tone);
      return (
        <div
          key={pin.id}
          style={{
            position: "absolute",
            top,
            [side]: 8,
            height: span * rowH - 10,
            width: "calc(100% - 16px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: side === "left" ? "flex-start" : "flex-end",
            padding: "0 12px",
            boxSizing: "border-box",
            borderRadius: 14,
            background: h ? `rgba(0,102,204,${0.12 * hk})` : "transparent",
            boxShadow: h ? `inset 0 0 0 ${3 * hk}px ${toneColor(h.tone, accentColor)}` : "none",
            opacity: pp,
          }}
        >
          <div style={{ fontSize: 30, fontWeight: 700, color: col, letterSpacing: "-0.01em", textDecoration: pin.strike ? "line-through" : "none", whiteSpace: "nowrap" }}>
            {pin.text}
          </div>
          {pin.sub && <div style={{ fontSize: 26, fontWeight: 400, color: pin.tone === "bad" ? conColor : mutedColor, whiteSpace: "nowrap" }}>{pin.sub}</div>}
        </div>
      );
    };
    return (
      <div style={{ position: "relative", height: H, opacity: wp }}>
        {cols.map((c, ci) => {
          const x0 = ci * (colW + gapX);
          const cp = pop(at(c.atSeconds, 0));
          const both = (c.left?.length ?? 0) > 0 && (c.right?.length ?? 0) > 0;
          return (
            <div
              key={c.title + ci}
              style={{ position: "absolute", left: x0, top: 0, width: colW, opacity: cp, transform: `translateY(${interpolate(cp, [0, 1], [30, 0])}px)` }}
            >
              <div style={{ height: imgH, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {c.image && (
                  <Img
                    src={resolveAsset(c.image)}
                    style={{ maxHeight: imgH - 8, maxWidth: "100%", objectFit: "contain", borderRadius: 18, mixBlendMode: "multiply" }}
                  />
                )}
              </div>
              <div style={{ height: titleH, textAlign: "center" }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: textColor, letterSpacing: "-0.015em", lineHeight: 1.15 }}>{c.title}</div>
                {c.sub && <div style={{ fontSize: 26, color: mutedColor }}>{c.sub}</div>}
              </div>
              <div
                style={{
                  position: "relative",
                  height: blockH,
                  borderRadius: 22,
                  background: "rgba(255,255,255,0.95)",
                  border: `2px solid rgba(0,0,0,0.14)`,
                  boxSizing: "border-box",
                }}
              >
                {(["left", "right"] as const).map((side) => {
                  let row = 0;
                  return (c[side] ?? []).map((pin) => {
                    const top = 12 + row * rowH + 5;
                    row += pin.span ?? 1;
                    return (
                      <div key={pin.id} style={{ position: "absolute", inset: 0, [side === "left" ? "right" : "left"]: both ? "50%" : 0 }}>
                        {pinChip(pin, side, top)}
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          );
        })}
        <svg viewBox={`0 0 ${PANEL_W} ${H}`} style={{ position: "absolute", inset: 0, width: "100%", height: H, overflow: "visible", pointerEvents: "none" }}>
          {(wiring.wires ?? []).map((w, wi) => {
            const a = anchors[w.from];
            const b = anchors[w.to];
            if (!a || !b) return null;
            const f0 = at(w.atSeconds, 0);
            if (frame < f0) return null;
            if (w.untilSeconds !== undefined && frame >= at(w.untilSeconds, 0)) return null;
            const [s, e] = a.x <= b.x ? [a, b] : [b, a];
            const mx = (s.x + e.x) / 2 + ((wi % 3) - 1) * 10;
            const dpath = Math.abs(s.y - e.y) < 0.5 ? `M ${s.x} ${s.y} L ${e.x} ${e.y}` : `M ${s.x} ${s.y} L ${mx} ${s.y} L ${mx} ${e.y} L ${e.x} ${e.y}`;
            const len = Math.abs(e.x - s.x) + Math.abs(e.y - s.y) + 1;
            const k = f0 <= 0 ? 1 : interpolate(frame, [f0, f0 + Math.round(0.45 * fps)], [0, 1], { extrapolateRight: "clamp" });
            const dash = { strokeDasharray: len, strokeDashoffset: len * (1 - k) };
            return (
              <g key={wi}>
                {w.outline && <path d={dpath} fill="none" stroke="#8E8E93" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" style={dash} />}
                <path d={dpath} fill="none" stroke={w.color} strokeWidth={w.outline ? 6.5 : 8} strokeLinecap="round" strokeLinejoin="round" style={dash} />
                <circle cx={s.x} cy={s.y} r={7} fill={textColor} opacity={k > 0 ? 1 : 0} />
                <circle cx={e.x} cy={e.y} r={7} fill={textColor} opacity={k >= 1 ? 1 : 0} />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const renderChart = () => {
    if (!chart) return null;
    const H = chart.height ?? 460;
    const cp = pop(at(chart.atSeconds, 0));
    const L = 120;
    const R = 975;
    const T = chart.title ? 96 : 60;
    const B = H - 64;
    const y = (v: number) => B - ((v - chart.yMin) / (chart.yMax - chart.yMin)) * (B - T);
    const x = (u: number) => L + u * (R - L);
    const ticks = chart.yTicks ?? [chart.yMin, (chart.yMin + chart.yMax) / 2, chart.yMax];
    const visibleSeries = chart.series.filter((s) => frame >= at(s.atSeconds, 0));
    return (
      <div style={{ opacity: cp, transform: `translateY(${interpolate(cp, [0, 1], [24, 0])}px)` }}>
        <svg viewBox={`0 0 1000 ${H}`} style={{ width: "100%", display: "block" }}>
          {chart.title && (
            <text x={L - 100} y={40} fontSize={svgFont(30)} fontWeight={600} fill={mutedColor} fontFamily={FONT}>
              {chart.title}
            </text>
          )}
          {/* Legend */}
          {visibleSeries.map((s, i) => {
            const col = s.color ?? toneColor(s.tone, accentColor);
            const lp = pop(at(s.atSeconds, 0));
            const lx = L + i * 440;
            const ly = T - 26;
            return (
              <g key={s.label} opacity={lp}>
                <line x1={lx} y1={ly} x2={lx + 44} y2={ly} stroke={col} strokeWidth={8} strokeLinecap="round" strokeDasharray={s.dashed ? "10 10" : undefined} />
                <text x={lx + 58} y={ly + svgFont(28) * 0.34} fontSize={svgFont(28)} fontWeight={600} fill={textColor} fontFamily={FONT}>
                  {s.label}
                </text>
              </g>
            );
          })}
          {(chart.bands ?? []).map((b, i) => {
            const bp = pop(at(b.atSeconds, 0));
            const col = toneColor(b.tone, accentColor);
            return (
              <g key={i} opacity={bp}>
                <rect x={L} y={y(b.to)} width={R - L} height={y(b.from) - y(b.to)} fill={col} opacity={0.1} />
                {b.label && (
                  <text x={R - 10} y={y(b.to) - 10} textAnchor="end" fontSize={svgFont(26)} fontWeight={600} fill={col} fontFamily={FONT}>
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} y1={y(v)} x2={R} y2={y(v)} stroke="rgba(0,0,0,0.08)" strokeWidth={2} />
              <text x={L - 14} y={y(v) + svgFont(26) * 0.34} textAnchor="end" fontSize={svgFont(26)} fill={mutedColor} fontFamily={FONT}>
                {fmt(v, Number.isInteger(v) ? 0 : 1)}
                {chart.unit && v === ticks[ticks.length - 1] ? ` ${chart.unit}` : ""}
              </text>
            </g>
          ))}
          <line x1={L} y1={B} x2={R} y2={B} stroke={mutedColor} strokeWidth={2.5} />
          {(chart.xLabels ?? []).map((xl) => (
            <text key={xl.text} x={x(xl.x)} y={B + 40} textAnchor={xl.x <= 0 ? "start" : xl.x >= 1 ? "end" : "middle"} fontSize={svgFont(26)} fill={mutedColor} fontFamily={FONT}>
              {xl.text}
            </text>
          ))}
          {(chart.spans ?? []).map((s, i) => {
            const sp = pop(at(s.atSeconds, 0));
            const col = toneColor(s.tone, mutedColor);
            return (
              <g key={i} opacity={sp}>
                <rect x={x(s.from)} y={T} width={x(s.to) - x(s.from)} height={B - T} fill={col} opacity={0.08} />
                <text x={(x(s.from) + x(s.to)) / 2} y={T + 34} textAnchor="middle" fontSize={svgFont(26)} fontWeight={600} fill={col} fontFamily={FONT}>
                  {s.text}
                </text>
              </g>
            );
          })}
          {visibleSeries.map((s) => {
            const col = s.color ?? toneColor(s.tone, accentColor);
            const f0 = at(s.atSeconds, 0);
            const k = f0 <= 0 && !s.drawSeconds ? 1 : interpolate(frame, [f0, f0 + Math.round((s.drawSeconds ?? 2) * fps)], [0, 1], { extrapolateRight: "clamp" });
            const nPts = s.values.length;
            const upto = Math.max(1, Math.floor(k * (nPts - 1)));
            const pts = s.values.slice(0, upto + 1).map((v, i) => `${x(i / (nPts - 1))},${y(Math.max(chart.yMin, Math.min(chart.yMax, v)))}`);
            const last = pts[pts.length - 1].split(",").map(Number);
            return (
              <g key={s.label}>
                <polyline points={pts.join(" ")} fill="none" stroke={col} strokeWidth={s.width ?? 5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "12 10" : undefined} />
                {k < 1 && <circle cx={last[0]} cy={last[1]} r={9} fill={col} />}
              </g>
            );
          })}
          {(chart.markers ?? []).map((m, i) => {
            const mp = pop(at(m.atSeconds, 0));
            const col = toneColor(m.tone, textColor);
            return (
              <g key={i} opacity={mp}>
                <line x1={x(m.x)} y1={T} x2={x(m.x)} y2={B} stroke={col} strokeWidth={3} strokeDasharray="8 8" />
                <text x={x(m.x) + 12} y={B - 16} fontSize={svgFont(26)} fontWeight={600} fill={col} fontFamily={FONT}>
                  {m.text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const capP = caption ? pop(at(captionAtSeconds, 0)) : 0;
  const panels = [renderWiring(), renderBench(), renderBridge(), renderChart(), renderReadouts(), renderSteps()].filter(Boolean);

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
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 12 }}>{tagline}</div>}
      </div>

      <div
        style={{
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "26px 26px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {panels}
        {caption && <div style={{ fontSize: 28, color: mutedColor, letterSpacing: "0.005em", opacity: capP }}>{caption}</div>}
      </div>

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                <div style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.32, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
