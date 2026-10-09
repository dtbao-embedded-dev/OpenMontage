import React, { useId } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted";
type Track = [number, number][];
type Window = [number, number];

export interface TouchPadDef {
  id: string;
  /** Centre in panel units (the panel is 1000 wide, `panelHeight` tall). */
  x: number;
  y: number;
  /** Radius in panel units (default 78). */
  r?: number;
  /** Silkscreen label under the pad, e.g. "CH1 · GPIO1". */
  label?: string;
  /** Short glyph printed on the pad, e.g. "+". */
  icon?: string;
  /** Reading over time as [seconds, level]: 0 = benchmark, 1 = active threshold. Linear between points. */
  levelTrack?: Track;
  /** Windows in which the driver does not scan this pad (guard ring active). */
  paused?: Window[];
  atSeconds?: number;
}

export interface TouchFinger {
  /** Pad the fingertip lands on (or an explicit x/y in panel units). */
  pad?: string;
  x?: number;
  y?: number;
  /** Contact time; the finger slides in during the 0.35 s before it. */
  atSeconds: number;
  untilSeconds?: number;
  /** Draws water beads on the fingertip. */
  wet?: boolean;
}

export interface TouchDrop {
  x: number;
  y: number;
  /** Radius (default 26); `w`/`h` make an elongated streak instead, rotated by `rot` degrees. */
  r?: number;
  w?: number;
  h?: number;
  rot?: number;
  atSeconds: number;
  untilSeconds?: number;
}

export interface TouchWire {
  /** Polyline in panel units, from the free end (e.g. the header pin) to the pad it feeds. */
  points: [number, number][];
  color?: string;
  /** Pill at the first point, e.g. "GPIO1". */
  label?: string;
  atSeconds?: number;
}

export interface TouchGridWindow {
  /** `gnd`: grounded hatch (copper); `shield`: hatch driven by TOUCH14 in step with the measured pad (accent). */
  kind: "gnd" | "shield";
  atSeconds?: number;
  untilSeconds?: number;
  /** Pill printed at the bottom-left of the panel, e.g. "Lưới GND". */
  label?: string;
}

export interface TouchGuard {
  atSeconds?: number;
  /** Silkscreen label on the ring, e.g. "Guard · CH13". */
  label?: string;
  /** Windows in which the ring is triggered (glows and shows `activeLabel`). */
  active?: Window[];
  activeLabel?: string;
  /** Padding around the pads' bounding box (panel units, default 64). */
  pad?: number;
}

export interface TouchChartNote {
  /** Time (seconds since cut start) the note points at. */
  t: number;
  text: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface TouchChart {
  /** Pad whose state follows this chart (its meter and glow use the chart's hysteresis + debounce). */
  pad?: string;
  atSeconds?: number;
  /** Seconds of time shown across the x axis, starting at `atSeconds`. */
  spanSeconds: number;
  yMin: number;
  yMax: number;
  /** [seconds since cut start, value]. The pen draws it in real time. */
  series: Track;
  /** Constant benchmark or a slowly drifting track. */
  benchmark: number | Track;
  /** Active threshold as an offset above the benchmark (the driver's `active_thresh`). */
  threshold: number;
  /** Shaded band of +- hysteresis around benchmark + threshold. */
  hysteresis?: number;
  /** The level must hold this long before the state flips (debounce). */
  debounceSeconds?: number;
  label?: string;
  benchmarkLabel?: string;
  thresholdLabel?: string;
  yTicks?: { v: number; label: string }[];
  notes?: TouchChartNote[];
  height?: number;
  activeLabel?: string;
  inactiveLabel?: string;
}

interface TouchPadProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  pads: TouchPadDef[];
  panelHeight?: number;
  fingers?: TouchFinger[];
  drops?: TouchDrop[];
  flood?: { atSeconds: number; untilSeconds?: number };
  grid?: TouchGridWindow[];
  wires?: TouchWire[];
  guard?: TouchGuard;
  chart?: TouchChart;
  meters?: boolean;
  activeLabel?: string;
  falseLabel?: string;
  pausedLabel?: string;
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
const W = 1000;
const PCB = "#1F5A43";
const PCB_EDGE = "#163F2F";
const COPPER = "#D39A4E";
const COPPER_DARK = "#A8732F";
const SILK = "#F4F7F5";
const WATER = "#5AC8FA";
const GUARD_ON = "#FF9F0A";
const PAUSED = "#8E8E93";
const SKIN = "#F3C9A8";
const SKIN_EDGE = "#C98F6D";

const lerpTrack = (track: Track | undefined, t: number, fallback = 0) => {
  if (!track || track.length === 0) return fallback;
  if (t <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    if (t <= track[i][0]) {
      const [t0, v0] = track[i - 1];
      const [t1, v1] = track[i];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return track[track.length - 1][1];
};

const inWindows = (ws: Window[] | undefined, t: number) => (ws ?? []).some(([a, b]) => t >= a && t < b);

/**
 * Capacitive touch panel seen from above, on a PCB: copper pads, a grounded or shield-driven hatch around them, an
 * optional guard ring, a fingertip that lands on a pad, water drops and a flood. Each pad glows when its reading
 * crosses the active threshold (blue with a finger on it, red for a false trigger), greys out while the guard ring
 * pauses scanning, and can show a small level meter. An optional chart below draws one pad's reading live against the
 * benchmark, benchmark + threshold and the hysteresis band, with debounce applied to the state pill.
 */
export const TouchPad: React.FC<TouchPadProps> = ({
  name,
  eyebrow,
  tagline,
  pads,
  panelHeight = 600,
  fingers = [],
  drops = [],
  flood,
  grid = [],
  wires = [],
  guard,
  chart,
  meters = true,
  activeLabel = "active",
  falseLabel = "kích nhầm",
  pausedLabel = "dừng quét",
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
  const now = frame / fps;
  const uid = "tp" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const sec = (s: number | undefined) => Math.round((s ?? 0) * fps);
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const fadeWin = (a: number | undefined, b: number | undefined, d = 0.3) => {
    const inn = a === undefined || a <= 0 ? 1 : interpolate(now, [a, a + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const out = b === undefined ? 1 : interpolate(now, [b, b + d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return Math.min(inn, out);
  };
  const toneColor = (t: Tone | undefined, fallback = textColor) =>
    t === "accent" ? accentColor : t === "good" ? proColor : t === "bad" ? conColor : t === "muted" ? mutedColor : t === "neutral" ? textColor : fallback;
  const head = pop(0, 18);
  const H = panelHeight;
  const padById = Object.fromEntries(pads.map((p) => [p.id, p]));

  // ------------------------------------------------------------------ chart state (hysteresis + debounce, frame by frame)
  const bmAt = (t: number) => (chart ? (typeof chart.benchmark === "number" ? chart.benchmark : lerpTrack(chart.benchmark, t)) : 0);
  const chartStates: boolean[] = [];
  if (chart) {
    const hy = chart.hysteresis ?? 0;
    const db = Math.max(0, Math.round((chart.debounceSeconds ?? 0) * fps));
    let state = false;
    let run = 0;
    for (let f = 0; f <= frame; f++) {
      const t = f / fps;
      const v = lerpTrack(chart.series, t);
      const on = bmAt(t) + chart.threshold;
      const want: boolean = state ? v >= on - hy : v > on + hy;
      if (want !== state) {
        run += 1;
        if (run > db) {
          state = want;
          run = 0;
        }
      } else {
        run = 0;
      }
      chartStates.push(state);
    }
  }
  const chartActive = chart ? chartStates[chartStates.length - 1] ?? false : false;

  // ------------------------------------------------------------------ pad state
  const fingerOn = (padId: string) =>
    fingers.some((f) => f.pad === padId && now >= f.atSeconds && (f.untilSeconds === undefined || now < f.untilSeconds));
  const padLevel = (p: TouchPadDef) => {
    if (p.levelTrack) return lerpTrack(p.levelTrack, now);
    if (chart && chart.pad === p.id) return (lerpTrack(chart.series, now) - bmAt(now)) / chart.threshold;
    return 0;
  };
  const padActive = (p: TouchPadDef) => {
    if (inWindows(p.paused, now)) return false;
    if (!p.levelTrack && chart && chart.pad === p.id) return chartActive;
    return padLevel(p) >= 1;
  };

  // ------------------------------------------------------------------ grid / guard geometry
  const minX = Math.min(...pads.map((p) => p.x - (p.r ?? 78)));
  const maxX = Math.max(...pads.map((p) => p.x + (p.r ?? 78)));
  const minY = Math.min(...pads.map((p) => p.y - (p.r ?? 78)));
  const maxY = Math.max(...pads.map((p) => p.y + (p.r ?? 78) + (meters ? 96 : 58)));
  const gp = guard?.pad ?? 64;
  const ring = { x: minX - gp, y: minY - gp, w: maxX - minX + 2 * gp, h: maxY - minY + 2 * gp };
  const RING_W = 22;
  const KEEP = 20;
  const gridWin = grid.filter((g) => (g.atSeconds === undefined || now >= g.atSeconds - 0.3) && (g.untilSeconds === undefined || now < g.untilSeconds + 0.3));
  const shieldPulse = 0.75 + 0.25 * Math.sin(now * Math.PI * 4);

  const renderPanel = () => (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", borderRadius: 26 }}>
      <defs>
        <mask id={`${uid}-keepout`}>
          <rect x={0} y={0} width={W} height={H} fill="white" />
          {pads.map((p) => (
            <circle key={p.id} cx={p.x} cy={p.y} r={(p.r ?? 78) + KEEP + 6} fill="black" />
          ))}
          {pads.map((p) => (
            <rect key={`lab-${p.id}`} x={p.x - 115} y={p.y + (p.r ?? 78) + 10} width={230} height={meters ? 92 : 56} rx={18} fill="black" />
          ))}
          {guard && (
            <rect x={ring.x} y={ring.y} width={ring.w} height={ring.h} rx={46} fill="none" stroke="black" strokeWidth={RING_W + 2 * KEEP} />
          )}
        </mask>
        <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <radialGradient id={`${uid}-drop`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="35%" stopColor={WATER} stopOpacity="0.75" />
          <stop offset="100%" stopColor="#1E88C8" stopOpacity="0.8" />
        </radialGradient>
        <clipPath id={`${uid}-board`}>
          <rect x={6} y={6} width={W - 12} height={H - 12} rx={24} />
        </clipPath>
      </defs>

      {/* Board */}
      <rect x={3} y={3} width={W - 6} height={H - 6} rx={26} fill={PCB} stroke={PCB_EDGE} strokeWidth={6} />

      {/* Hatch: grounded copper or shield (driven in step with the measured pad) */}
      {gridWin.map((g, i) => {
        const o = fadeWin(g.atSeconds, g.untilSeconds);
        const shield = g.kind === "shield";
        return (
          <g key={`g${i}`} opacity={o * (shield ? shieldPulse : 1)} clipPath={`url(#${uid}-board)`}>
            <rect x={24} y={24} width={W - 48} height={H - 48} rx={18} fill={shield ? accentColor : COPPER} opacity={0.18} mask={`url(#${uid}-keepout)`} />
          </g>
        );
      })}
      {/* Hatch lines, cut away around the pads, their labels and the guard ring */}
      {gridWin.map((g, i) => {
        const o = fadeWin(g.atSeconds, g.untilSeconds);
        const shield = g.kind === "shield";
        const lines: React.ReactElement[] = [];
        for (let k = -H; k < W + H; k += 34) {
          lines.push(<line key={`a${k}`} x1={k} y1={0} x2={k + H} y2={H} />);
          lines.push(<line key={`b${k}`} x1={k} y1={H} x2={k + H} y2={0} />);
        }
        return (
          <g key={`gl${i}`} opacity={o * (shield ? shieldPulse : 1)} clipPath={`url(#${uid}-board)`}>
            <g mask={`url(#${uid}-keepout)`} stroke={shield ? "#8CC4FF" : COPPER} strokeWidth={5} opacity={0.75}>
              <clipPath id={`${uid}-inner-${i}`}>
                <rect x={24} y={24} width={W - 48} height={H - 48} rx={18} />
              </clipPath>
              <g clipPath={`url(#${uid}-inner-${i})`}>{lines}</g>
            </g>
          </g>
        );
      })}

      {/* Guard ring */}
      {guard && (() => {
        const o = pop(sec(guard.atSeconds));
        const on = inWindows(guard.active, now);
        const onO = (guard.active ?? []).reduce((m, [a, b]) => Math.max(m, fadeWin(a, b, 0.25)), 0);
        return (
          <g opacity={Math.min(1, o)}>
            <rect x={ring.x} y={ring.y} width={ring.w} height={ring.h} rx={46} fill="none" stroke={GUARD_ON} strokeWidth={RING_W + 26}
              opacity={0.45 * onO} filter={`url(#${uid}-blur)`} />
            <rect x={ring.x} y={ring.y} width={ring.w} height={ring.h} rx={46} fill="none" stroke={onO > 0.5 ? GUARD_ON : COPPER} strokeWidth={RING_W} />
            {guard.label && (
              <text x={ring.x + 40} y={ring.y - 22} fontFamily={FONT} fontSize={34} fontWeight={700} fill={SILK}>
                {guard.label}
              </text>
            )}
            {on && guard.activeLabel && (
              <g opacity={onO}>
                <rect x={ring.x + ring.w - 40 - guard.activeLabel.length * 21 - 40} y={ring.y - 58} width={guard.activeLabel.length * 21 + 40} height={52} rx={26} fill={GUARD_ON} />
                <text x={ring.x + ring.w - 40 - (guard.activeLabel.length * 21 + 40) / 2} y={ring.y - 22} textAnchor="middle" fontFamily={FONT} fontSize={32} fontWeight={700} fill="#1D1D1F">
                  {guard.activeLabel}
                </text>
              </g>
            )}
          </g>
        );
      })()}

      {/* Jumper wires under the pads */}
      {wires.map((w, i) => {
        const o = pop(sec(w.atSeconds));
        const d = w.points.map(([x, y], k) => `${k === 0 ? "M" : "L"}${x},${y}`).join(" ");
        const c = w.color ?? "#E8A33D";
        const [lx, ly] = w.points[0];
        const lw = (w.label ?? "").length * 19 + 44;
        return (
          <g key={`w${i}`} opacity={Math.min(1, o)}>
            <path d={d} fill="none" stroke="#000000" strokeOpacity={0.25} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round"
              transform="translate(6,8)" />
            <path d={d} fill="none" stroke={c} strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round"
              transform="translate(-4,-5)" />
            {w.label && (
              <g>
                <rect x={lx - lw / 2} y={ly - 70} width={lw} height={52} rx={26} fill={SILK} />
                <text x={lx} y={ly - 34} textAnchor="middle" fontFamily={FONT} fontSize={30} fontWeight={700} fill="#1D1D1F">
                  {w.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Pads */}
      {pads.map((p) => {
        const r = p.r ?? 78;
        const o = pop(sec(p.atSeconds));
        const paused = inWindows(p.paused, now);
        const act = padActive(p);
        const finger = fingerOn(p.id);
        const glow = act ? (finger ? accentColor : conColor) : "transparent";
        return (
          <g key={p.id} opacity={Math.min(1, o)}>
            {act && <circle cx={p.x} cy={p.y} r={r + 30} fill={glow} opacity={0.55} filter={`url(#${uid}-blur)`} />}
            <circle cx={p.x} cy={p.y} r={r} fill={COPPER} stroke={act ? glow : COPPER_DARK} strokeWidth={act ? 10 : 6} />
            <circle cx={p.x - r * 0.28} cy={p.y - r * 0.3} r={r * 0.45} fill="#FFFFFF" opacity={0.16} />
            {p.icon && (
              <text x={p.x} y={p.y + 22} textAnchor="middle" fontFamily={FONT} fontSize={64} fontWeight={700} fill="#5B3A12" opacity={0.8}>
                {p.icon}
              </text>
            )}
            {paused && <circle cx={p.x} cy={p.y} r={r + 4} fill={PAUSED} opacity={0.72} />}
          </g>
        );
      })}

      {/* Water drops and streaks */}
      {drops.map((d, i) => {
        const o = fadeWin(d.atSeconds, d.untilSeconds, 0.25);
        if (o <= 0) return null;
        const s = interpolate(now, [d.atSeconds, d.atSeconds + 0.25], [0.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const rx = (d.w ?? (d.r ?? 26) * 2) / 2;
        const ry = (d.h ?? (d.r ?? 26) * 2) / 2;
        return (
          <g key={`d${i}`} opacity={o} transform={`translate(${d.x},${d.y}) rotate(${d.rot ?? 0}) scale(${s})`}>
            <ellipse cx={4} cy={6} rx={rx} ry={ry} fill="#000000" opacity={0.18} />
            <ellipse cx={0} cy={0} rx={rx} ry={ry} fill={`url(#${uid}-drop)`} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={2} />
          </g>
        );
      })}

      {/* Flood: a water sheet sweeps in from the left and drains to the right */}
      {flood && (() => {
        const inP = interpolate(now, [flood.atSeconds - 0.2, flood.atSeconds + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const outP = flood.untilSeconds === undefined ? 0 : interpolate(now, [flood.untilSeconds, flood.untilSeconds + 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (inP <= 0 || outP >= 1) return null;
        const x0 = W * outP;
        const x1 = W * inP;
        let d = `M${x0},0 L${x1},0`;
        for (let y = 0; y <= H; y += 20) d += ` L${x1 + 16 * Math.sin(y / 38 + now * 6)},${y}`;
        d += ` L${x0},${H} Z`;
        return (
          <g clipPath={`url(#${uid}-board)`}>
            <path d={d} fill={WATER} opacity={0.42} />
            {[0.2, 0.45, 0.7].map((k) => (
              <path key={k} d={`M${x0 + 40},${H * k} q 60 -18 120 0 t 120 0`} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={5} fill="none"
                transform={`translate(${((now * 90) % 200) - 100},0)`} />
            ))}
          </g>
        );
      })()}

      {/* Fingers (top view): slide in from the bottom edge, ripple on contact */}
      {fingers.map((f, i) => {
        const tp = f.pad ? padById[f.pad] : undefined;
        const fx = tp ? tp.x : f.x ?? W / 2;
        const fy = tp ? tp.y : f.y ?? H / 2;
        const inP = interpolate(now, [f.atSeconds - 0.35, f.atSeconds], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const outP = f.untilSeconds === undefined ? 0 : interpolate(now, [f.untilSeconds, f.untilSeconds + 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const show = inP > 0 && outP < 1;
        if (!show) return null;
        const off = (1 - inP) * 360 + outP * 360;
        const ripple = interpolate(now, [f.atSeconds, f.atSeconds + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const FW = 118;
        return (
          <g key={`f${i}`}>
            {ripple > 0 && ripple < 1 && (
              <circle cx={fx} cy={fy} r={60 + 90 * ripple} fill="none" stroke="#FFFFFF" strokeWidth={6} opacity={1 - ripple} />
            )}
            <g transform={`translate(${fx},${fy + off})`}>
              <rect x={-FW / 2 + 14} y={-FW / 2 + 22} width={FW} height={H + 200} rx={FW / 2} fill="#000000" opacity={0.22} filter={`url(#${uid}-blur)`} />
              <rect x={-FW / 2} y={-FW / 2} width={FW} height={H + 200} rx={FW / 2} fill={SKIN} stroke={SKIN_EDGE} strokeWidth={4} />
              <ellipse cx={0} cy={-FW / 2 + 52} rx={FW * 0.3} ry={FW * 0.34} fill="#FBE3D6" stroke="#E2B49A" strokeWidth={3} />
              <path d={`M${-FW / 2 + 22},${FW * 1.25} q ${FW / 2 - 22} 16 ${FW - 44} 0`} stroke={SKIN_EDGE} strokeWidth={3} fill="none" opacity={0.6} />
              {f.wet &&
                [[-28, -18, 12], [24, 4, 10], [-8, 40, 9], [30, 60, 8]].map(([dx, dy, rr], k) => (
                  <circle key={k} cx={dx} cy={dy} r={rr} fill={`url(#${uid}-drop)`} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={2} />
                ))}
            </g>
          </g>
        );
      })}


      {/* Labels, meters and state pills above fingers, water and flood */}
      {pads.map((p) => {
        const r = p.r ?? 78;
        const o = pop(sec(p.atSeconds));
        const paused = inWindows(p.paused, now);
        const act = padActive(p);
        const finger = fingerOn(p.id);
        const glow = act ? (finger ? accentColor : conColor) : "transparent";
        const lvl = padLevel(p);
        const pillText = paused ? pausedLabel : act ? (finger ? activeLabel : falseLabel) : "";
        const pillColor = paused ? PAUSED : finger ? accentColor : conColor;
        const pillW = pillText.length * 20 + 44;
        return (
          <g key={`top-${p.id}`} opacity={Math.min(1, o)}>
            {p.label && (
              <text x={p.x} y={p.y + r + 46} textAnchor="middle" fontFamily={FONT} fontSize={32} fontWeight={600} fill={SILK}>
                {p.label}
              </text>
            )}
            {meters && (
              <g transform={`translate(${p.x - 80},${p.y + r + 66})`}>
                <rect x={0} y={0} width={160} height={14} rx={7} fill="#FFFFFF" opacity={0.22} />
                <rect x={0} y={0} width={160 * Math.max(0, Math.min(1, lvl / 1.6))} height={14} rx={7}
                  fill={paused ? PAUSED : act ? glow : "#E9EEF0"} />
                <line x1={160 / 1.6} y1={-6} x2={160 / 1.6} y2={20} stroke="#FFFFFF" strokeWidth={4} />
              </g>
            )}
            {pillText && (
              <g>
                <rect x={p.x - pillW / 2} y={p.y - r - 66} width={pillW} height={50} rx={25} fill={pillColor} />
                <text x={p.x} y={p.y - r - 30} textAnchor="middle" fontFamily={FONT} fontSize={30} fontWeight={700} fill="#FFFFFF">
                  {pillText}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Grid label pill (bottom-left) */}
      {gridWin.map((g, i) =>
        g.label ? (
          <g key={`gp${i}`} opacity={fadeWin(g.atSeconds, g.untilSeconds)}>
            <rect x={30} y={H - 82} width={g.label.length * 19 + 44} height={52} rx={26} fill={g.kind === "shield" ? accentColor : COPPER_DARK} />
            <text x={30 + (g.label.length * 19 + 44) / 2} y={H - 46} textAnchor="middle" fontFamily={FONT} fontSize={30} fontWeight={700} fill="#FFFFFF">
              {g.label}
            </text>
          </g>
        ) : null
      )}
    </svg>
  );

  const renderChart = () => {
    if (!chart) return null;
    const CH = chart.height ?? 380;
    const LEFT = 40;
    const RIGHT = 30;
    const top = 70;
    // Each note gets its own row under the time axis, so notes never cover the trace or each other.
    const ROW = 56;
    const nNotes = (chart.notes ?? []).length;
    const bottom = 30 + (nNotes ? 16 + nNotes * ROW : 0);
    const plotH = CH - top - bottom;
    const t0 = chart.atSeconds ?? 0;
    const X = (t: number) => LEFT + ((t - t0) / chart.spanSeconds) * (W - LEFT - RIGHT);
    const Y = (v: number) => top + plotH * (1 - (v - chart.yMin) / (chart.yMax - chart.yMin));
    const o = pop(sec(chart.atSeconds));
    const tEnd = Math.min(now, t0 + chart.spanSeconds);
    const steps = 120;
    const lineAt = (fn: (t: number) => number) => {
      let d = "";
      for (let k = 0; k <= steps; k++) {
        const t = t0 + (chart.spanSeconds * k) / steps;
        d += `${k === 0 ? "M" : " L"}${X(t).toFixed(1)},${Y(fn(t)).toFixed(1)}`;
      }
      return d;
    };
    // Series up to now
    let trace = "";
    const pts = chart.series.filter(([t]) => t >= t0 && t <= tEnd);
    const startV = lerpTrack(chart.series, t0);
    trace = `M${X(t0)},${Y(startV)}`;
    pts.forEach(([t, v]) => (trace += ` L${X(t).toFixed(1)},${Y(v).toFixed(1)}`));
    const nowV = lerpTrack(chart.series, tEnd);
    if (tEnd > t0) trace += ` L${X(tEnd).toFixed(1)},${Y(nowV).toFixed(1)}`;
    const hy = chart.hysteresis ?? 0;
    const bandTop = (t: number) => bmAt(t) + chart.threshold + hy;
    const bandBot = (t: number) => bmAt(t) + chart.threshold - hy;
    let band = "";
    if (hy > 0) {
      for (let k = 0; k <= steps; k++) {
        const t = t0 + (chart.spanSeconds * k) / steps;
        band += `${k === 0 ? "M" : " L"}${X(t).toFixed(1)},${Y(bandTop(t)).toFixed(1)}`;
      }
      for (let k = steps; k >= 0; k--) {
        const t = t0 + (chart.spanSeconds * k) / steps;
        band += ` L${X(t).toFixed(1)},${Y(bandBot(t)).toFixed(1)}`;
      }
      band += " Z";
    }
    const active = chartActive && now >= t0;
    const pill = active ? chart.activeLabel ?? "active" : chart.inactiveLabel ?? "inactive";
    const pillW = pill.length * 20 + 48;
    return (
      <svg viewBox={`0 0 ${W} ${CH}`} style={{ width: "100%", display: "block", opacity: Math.min(1, o) }}>
        {chart.label && (
          <text x={LEFT} y={44} fontFamily={FONT} fontSize={36} fontWeight={700} fill={textColor}>
            {chart.label}
          </text>
        )}
        <rect x={W - RIGHT - pillW} y={10} width={pillW} height={50} rx={25} fill={active ? accentColor : "rgba(0,0,0,0.08)"} />
        <text x={W - RIGHT - pillW / 2} y={45} textAnchor="middle" fontFamily={FONT} fontSize={30} fontWeight={700} fill={active ? "#FFFFFF" : mutedColor}>
          {pill}
        </text>
        <line x1={LEFT} y1={top + plotH} x2={W - RIGHT} y2={top + plotH} stroke="rgba(0,0,0,0.22)" strokeWidth={3} />
        {hy > 0 && <path d={band} fill={accentColor} opacity={0.12} />}
        <path d={lineAt(bmAt)} fill="none" stroke={mutedColor} strokeWidth={4} strokeDasharray="12 10" />
        <path d={lineAt((t) => bmAt(t) + chart.threshold)} fill="none" stroke={accentColor} strokeWidth={4} strokeDasharray="12 10" />
        <text x={W - RIGHT - 8} y={Y(bmAt(t0 + chart.spanSeconds)) + 42} textAnchor="end" fontFamily={FONT} stroke="#FFFFFF" strokeWidth={8}
          paintOrder="stroke" strokeLinejoin="round" fontSize={30} fontWeight={600} fill={mutedColor}>
          {chart.benchmarkLabel ?? "benchmark"}
        </text>
        <text x={W - RIGHT - 8} y={Y(bmAt(t0 + chart.spanSeconds) + chart.threshold + hy) - 14} textAnchor="end" fontFamily={FONT} stroke="#FFFFFF"
          strokeWidth={8} paintOrder="stroke" strokeLinejoin="round" fontSize={30} fontWeight={700} fill={accentColor}>
          {chart.thresholdLabel ?? "benchmark + ngưỡng"}
        </text>
        {(chart.yTicks ?? []).map((tk, i) => (
          <text key={i} x={LEFT + 6} y={Y(tk.v) - 10} fontFamily={FONT} fontSize={28} fill={mutedColor}>
            {tk.label}
          </text>
        ))}
        {(chart.notes ?? []).map((n, i) => {
          const no = pop(sec(n.atSeconds ?? n.t));
          if (no <= 0.01) return null;
          const c = toneColor(n.tone, accentColor);
          const nx = X(n.t);
          const tw = n.text.length * 17 + 36;
          const lx = Math.max(LEFT + tw / 2, Math.min(W - RIGHT - tw / 2, nx));
          return (
            <g key={`n${i}`} opacity={Math.min(1, no)}>
              <line x1={nx} y1={top + 4} x2={nx} y2={top + plotH + 16 + i * ROW} stroke={c} strokeWidth={3} strokeDasharray="6 8" />
              <rect x={lx - tw / 2} y={top + plotH + 16 + i * ROW} width={tw} height={46} rx={23} fill={c} />
              <text x={lx} y={top + plotH + 48 + i * ROW} textAnchor="middle" fontFamily={FONT} fontSize={28} fontWeight={700} fill="#FFFFFF">
                {n.text}
              </text>
            </g>
          );
        })}
        <path d={trace} fill="none" stroke={textColor} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        {now >= t0 && <circle cx={X(tEnd)} cy={Y(nowV)} r={10} fill={active ? accentColor : textColor} />}
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
          gap: 18,
          opacity: head,
        }}
      >
        {renderPanel()}
        {renderChart()}
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
