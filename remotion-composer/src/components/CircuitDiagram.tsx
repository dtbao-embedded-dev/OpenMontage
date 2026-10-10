import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Pt = [number, number];
type Tone = "neutral" | "accent" | "good" | "bad" | "muted";

export interface CircuitPart {
  /**
   * wire: polyline `points`; resistor / button: two-terminal part from `from` to `to`;
   * ground / rail / dot / cross / tag / label: drawn at `at`; block: rounded box with top-left `at` and size `w` x `h`;
   * pin: small square on a block edge at `at`, its `text` drawn on the `textAt` side.
   * potentiometer / ldr / capacitor: two-terminal parts from `from` to `to` like a resistor.
   * potentiometer: the wiper arrow points at the body from the `wiperSide`, its tail wired to `at` (the wiper terminal).
   * led: diode from anode `from` to cathode `to`; its glow follows `levelTrack`.
   * buzzer: two-terminal disc from `from` to `to`; sound arcs pulse on the `wiperSide` during `sounding` windows.
   * servo: top view with top-left `at` and size `w` x `h`; the horn turns to `angleTrack` degrees (0 = up, +90 = right).
   * pwm: mini scope trace with top-left `at` and size `w` x `h`; `periods` square-wave cycles at the `dutyTrack` duty.
   * diode / lamp / ac / motor / fuse: two-terminal parts from `from` to `to` (diode: anode -> cathode).
   * lamp glow follows `levelTrack` (default off); motor spins and diode lights up during `active` windows.
   * relay: package outline with top-left `at`, size `w` x `h` (default 420 x 340); terminals coil A1 [x+0.25w, y],
   * A2 [x+0.25w, y+h], NC [x+0.55w, y], NO [x+0.9w, y], COM [x+0.72w, y+h]; the arm moves from NC to NO during `active`.
   * npn / nmos: centred on `at`; terminals base/gate [x-110, y], collector/drain [x+32, y-110], emitter/source [x+32, y+110];
   * the switched path turns accent during `active`.
   * opto / ssr: package with top-left `at`, size `w` x `h` (default 300 x 260 / 360 x 260); input pins on the left edge at
   * 0.25h / 0.75h (opto) or 0.3h / 0.7h (ssr), output pins at the same heights on the right edge; lit during `active`.
   * hazard: electrical warning triangle centred on `at`, side `w` (default 200).
   * battery: single cell from + terminal `from` (long plate, "+" mark) to − terminal `to` (short plate).
   * inductor: two-terminal coil (four turns) from `from` to `to`; turns accent during `active`.
   */
  kind:
    | "wire"
    | "resistor"
    | "button"
    | "ground"
    | "rail"
    | "block"
    | "pin"
    | "tag"
    | "cross"
    | "dot"
    | "label"
    | "potentiometer"
    | "ldr"
    | "capacitor"
    | "led"
    | "buzzer"
    | "servo"
    | "pwm"
    | "diode"
    | "lamp"
    | "ac"
    | "motor"
    | "fuse"
    | "relay"
    | "npn"
    | "nmos"
    | "opto"
    | "ssr"
    | "hazard"
    | "battery"
    | "inductor";
  points?: Pt[];
  from?: Pt;
  to?: Pt;
  at?: Pt;
  w?: number;
  h?: number;
  /** Main text: resistor value, rail voltage, block title, pin name, tag or label text. */
  text?: string;
  /** Secondary text (block subtitle, resistor note). */
  sub?: string;
  textAt?: "left" | "right" | "above" | "below";
  tone?: Tone;
  /** Dashed outline (block: a region inside the chip) or dashed wire. */
  dashed?: boolean;
  fontSize?: number;
  /** Seconds after cut start when the part appears (default 0: on screen from the first frame). */
  atSeconds?: number;
  /** Seconds after cut start when the part fades out (to swap a tag or a whole sub-circuit). */
  untilSeconds?: number;
  /** Appear at `atSeconds` and vanish at `untilSeconds` with no spring or fade (fast swaps such as melody notes). */
  cut?: boolean;
  /** button: [start, end] seconds when it is held down (contact closed). */
  pressed?: [number, number][];
  /** wire: current-flow dots travel along the wire in this window. */
  flow?: { atSeconds: number; untilSeconds?: number; reverse?: boolean };
  /** potentiometer: side of the body (seen from `from` towards `to`) the wiper arrow comes from. Default "right". */
  wiperSide?: "left" | "right";
  /** potentiometer: wiper position over time as [seconds, fraction 0..1 from `from` to `to`]; default 0.5 throughout. */
  wiperTrack?: [number, number][];
  /** Ink override (CSS colour) for wires and parts, e.g. servo cable colours or the LED colour. */
  color?: string;
  /** led: brightness over time as [seconds, 0..1]; default 1. */
  levelTrack?: [number, number][];
  /** buzzer: [start, end] seconds when it sounds. */
  sounding?: [number, number][];
  /** servo: horn angle over time as [seconds, degrees -90..90]; default 0. */
  angleTrack?: [number, number][];
  /** servo: draw the current angle under the body (default true). */
  angleLabel?: boolean;
  /** pwm: duty over time as [seconds, 0..1]; default 0.5. */
  dutyTrack?: [number, number][];
  /** pwm: number of periods drawn, may be fractional (default 4). */
  periods?: number;
  /** pwm: live readout drawn above the trace's right end: duty in percent, or pulse width in ms (needs `periodMs`). */
  readout?: "percent" | "ms";
  periodMs?: number;
  /** relay / npn / nmos / opto / ssr / motor / diode / inductor: [start, end] seconds when the part is switched on (conducts, spins). */
  active?: [number, number][];
  /** relay / npn / nmos / opto / ssr: draw the small terminal names (COM, NO, NC, B, C, E, G, D, S, +, −). Default true. */
  terminalLabels?: boolean;
}

interface CircuitDiagramProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  parts: CircuitPart[];
  /** Diagram coordinate height; the width is always 1000 units. Default 900. */
  viewHeight?: number;
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
const MONO = "'JetBrains Mono', Consolas, monospace";
const STROKE = 5;

const len = (pts: Pt[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/** Point at distance d along a polyline. */
const along = (pts: Pt[], d: number): Pt => {
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= seg) {
      const t = seg ? d / seg : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    d -= seg;
  }
  return pts[pts.length - 1];
};

/**
 * Hand-drawn-free schematic in a light card: wires draw in, parts pop in at `atSeconds`, a push button
 * closes during its `pressed` windows, state tags swap with `atSeconds` / `untilSeconds`, current dots
 * run along a wire. Built for pull-up / pull-down, voltage dividers and "do not wire 5 V here" frames.
 */
export const CircuitDiagram: React.FC<CircuitDiagramProps> = ({
  name,
  eyebrow,
  tagline,
  parts,
  viewHeight = 900,
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
  const sec = (s: number) => Math.round(s * fps);
  // A start at or before frame 0 is fully drawn on the cut's first frame (no fade-in from a blank frame).
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const toneColor = (t: Tone | undefined) =>
    t === "accent" ? accentColor : t === "good" ? proColor : t === "bad" ? conColor : t === "muted" ? mutedColor : textColor;
  // Visibility of a part: spring in at atSeconds, fade out over 6 frames from untilSeconds.
  const vis = (p: CircuitPart) => {
    if (p.cut) return frame >= sec(p.atSeconds ?? 0) && (p.untilSeconds === undefined || frame < sec(p.untilSeconds)) ? 1 : 0;
    const inP = (p.atSeconds ?? 0) <= 0 ? 1 : pop(sec(p.atSeconds!));
    const out = p.untilSeconds === undefined ? 1 : interpolate(frame, [sec(p.untilSeconds), sec(p.untilSeconds) + 6], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return Math.min(1, inP) * out;
  };

  const head = pop(0, 18);

  /** Value of a [seconds, value] track at the current frame; keyframes landing on one frame are nudged apart. */
  const trackAt = (track: [number, number][] | undefined, fallback: number) => {
    if (!track || track.length === 0) return fallback;
    if (track.length === 1) return track[0][1];
    const frames: number[] = [];
    for (const [s] of track) frames.push(Math.max(sec(s), frames.length ? frames[frames.length - 1] + 1 : -Infinity));
    return interpolate(frame, frames, track.map(([, v]) => v), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  };

  /** 0..1 switch state from [start, end] windows: on in 3 frames when a window starts, off in 3 frames when it ends. */
  const windowLevel = (windows: [number, number][] | undefined) => {
    let v = 0;
    for (const [a, b] of windows ?? []) {
      const c = Math.min(
        interpolate(frame, [sec(a), sec(a) + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        interpolate(frame, [sec(b), sec(b) + 3], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      );
      v = Math.max(v, c);
    }
    return v;
  };

  /** Filled arrow head with its tip at `tip`, pointing along `dir`. */
  const arrowHead = (tip: Pt, dir: Pt, size: number, fill: string, key?: string | number) => {
    const L = Math.hypot(dir[0], dir[1]) || 1;
    const [ux, uy] = [dir[0] / L, dir[1] / L];
    const [bx, by] = [tip[0] - ux * size, tip[1] - uy * size];
    const hw = size * 0.55;
    return <polygon key={key} points={`${tip[0]},${tip[1]} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`} fill={fill} />;
  };

  const textAnchor = (side: CircuitPart["textAt"], [x, y]: Pt, off: number): { x: number; y: number; anchor: "start" | "middle" | "end" } => {
    switch (side) {
      case "left":
        return { x: x - off, y, anchor: "end" };
      case "above":
        return { x, y: y - off, anchor: "middle" };
      case "below":
        return { x, y: y + off, anchor: "middle" };
      default:
        return { x: x + off, y, anchor: "start" };
    }
  };

  const renderPart = (p: CircuitPart, i: number) => {
    const o = vis(p);
    if (o <= 0.001) return null;
    const ink = p.color ?? toneColor(p.tone);
    const fs = p.fontSize ?? (p.kind === "block" ? 48 : 42);

    if (p.kind === "wire" && p.points && p.points.length > 1) {
      const L = len(p.points);
      const start = sec(p.atSeconds ?? 0);
      const draw = (p.atSeconds ?? 0) <= 0 ? 1 : interpolate(frame, [start, start + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const d = p.points.map((q, k) => `${k ? "L" : "M"}${q[0]},${q[1]}`).join(" ");
      const out = p.untilSeconds === undefined ? 1 : o;
      const dots: React.ReactNode[] = [];
      if (p.flow && frame >= sec(p.flow.atSeconds) && (p.flow.untilSeconds === undefined || frame < sec(p.flow.untilSeconds))) {
        const spacing = 70;
        const shift = ((frame - sec(p.flow.atSeconds)) * 4) % spacing;
        for (let s = shift; s < L; s += spacing) {
          const [x, y] = along(p.points, p.flow.reverse ? L - s : s);
          dots.push(<circle key={s} cx={x} cy={y} r={9} fill={p.tone === "bad" ? conColor : accentColor} />);
        }
      }
      return (
        <g key={i} opacity={out}>
          <path
            d={d}
            fill="none"
            stroke={ink}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={p.dashed ? "14 12" : `${L} ${L}`}
            strokeDashoffset={p.dashed ? 0 : L * (1 - draw)}
          />
          {dots}
        </g>
      );
    }

    if (p.kind === "potentiometer" && p.from && p.to && p.at) {
      const [x1, y1] = p.from;
      const [x2, y2] = p.to;
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / L;
      const uy = (y2 - y1) / L;
      // Normal pointing to the wiper side ("right" of the from->to direction in screen coordinates).
      const side = p.wiperSide === "left" ? -1 : 1;
      const nx = -uy * side;
      const ny = ux * side;
      const bl = Math.min(240, L * 0.7);
      const b0 = (L - bl) / 2;
      const f = trackAt(p.wiperTrack, 0.5);
      const along0 = b0 + bl * (0.12 + 0.76 * f);
      const tip: Pt = [x1 + ux * along0 + nx * 30, y1 + uy * along0 + ny * 30];
      const tail: Pt = [tip[0] + nx * 80, tip[1] + ny * 80];
      const [ax, ay] = p.at;
      // Elbow at the midpoint between the arrow tail and the wiper terminal, so the wire never runs along a block edge.
      const wire =
        Math.abs(nx) > 0.5
          ? `M${tail[0]},${tail[1]} L${(tail[0] + ax) / 2},${tail[1]} L${(tail[0] + ax) / 2},${ay} L${ax},${ay}`
          : `M${tail[0]},${tail[1]} L${tail[0]},${(tail[1] + ay) / 2} L${ax},${(tail[1] + ay) / 2} L${ax},${ay}`;
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const mid: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
      const t = textAnchor(p.textAt ?? (side > 0 ? "left" : "right"), mid, 50);
      const ah = 22;
      return (
        <g key={i} opacity={o}>
          <g transform={`translate(${x1},${y1}) rotate(${ang})`}>
            <line x1={0} y1={0} x2={b0} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <rect x={b0} y={-24} width={bl} height={48} rx={6} fill="#FFFFFF" stroke={ink} strokeWidth={STROKE} />
            <line x1={b0 + bl} y1={0} x2={L} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          </g>
          <path d={wire} fill="none" stroke={accentColor} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
          <line x1={tail[0]} y1={tail[1]} x2={tip[0] + nx * ah} y2={tip[1] + ny * ah} stroke={accentColor} strokeWidth={STROKE} strokeLinecap="round" />
          <polygon
            points={`${tip[0]},${tip[1]} ${tip[0] + nx * ah + ux * 14},${tip[1] + ny * ah + uy * 14} ${tip[0] + nx * ah - ux * 14},${tip[1] + ny * ah - uy * 14}`}
            fill={accentColor}
          />
          {p.text && (
            <text x={t.x} y={t.y + (p.sub ? -6 : fs * 0.35)} textAnchor={t.anchor} fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
              {p.text}
            </text>
          )}
          {p.sub && (
            <text x={t.x} y={t.y + fs * 0.35 + 34} textAnchor={t.anchor} fontFamily={FONT} fontSize={34} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }

    if ((p.kind === "ldr" || p.kind === "capacitor") && p.from && p.to) {
      const [x1, y1] = p.from;
      const [x2, y2] = p.to;
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const mid: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
      const t = textAnchor(p.textAt, mid, p.kind === "ldr" ? 60 : 70);
      let body: React.ReactNode;
      if (p.kind === "ldr") {
        // Resistor body inside a circle, two light arrows coming in from the -y side.
        const bl = Math.min(120, L * 0.5);
        const arrow = (ox: number) => (
          <g key={ox} stroke={accentColor} strokeWidth={4} strokeLinecap="round" fill={accentColor}>
            <line x1={ox - 46} y1={-110} x2={ox - 8} y2={-58} />
            <polygon points={`${ox},${-46} ${ox - 22},${-58} ${ox - 6},${-72}`} stroke="none" />
          </g>
        );
        body = (
          <>
            <line x1={0} y1={0} x2={(L - bl) / 2} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <circle cx={L / 2} cy={0} r={bl / 2 + 16} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
            <rect x={(L - bl) / 2} y={-20} width={bl} height={40} rx={6} fill="#FFFFFF" stroke={ink} strokeWidth={STROKE} />
            <line x1={(L + bl) / 2} y1={0} x2={L} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            {arrow(L / 2 - 20)}
            {arrow(L / 2 + 30)}
          </>
        );
      } else {
        const gap = 26;
        const plate = 90;
        body = (
          <>
            <line x1={0} y1={0} x2={(L - gap) / 2} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <line x1={(L - gap) / 2} y1={-plate / 2} x2={(L - gap) / 2} y2={plate / 2} stroke={ink} strokeWidth={STROKE + 2} strokeLinecap="round" />
            <line x1={(L + gap) / 2} y1={-plate / 2} x2={(L + gap) / 2} y2={plate / 2} stroke={ink} strokeWidth={STROKE + 2} strokeLinecap="round" />
            <line x1={(L + gap) / 2} y1={0} x2={L} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          </>
        );
      }
      return (
        <g key={i} opacity={o}>
          <g transform={`translate(${x1},${y1}) rotate(${ang})`}>{body}</g>
          {p.text && (
            <text x={t.x} y={t.y + (p.sub ? -6 : fs * 0.35)} textAnchor={t.anchor} fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
              {p.text}
            </text>
          )}
          {p.sub && (
            <text x={t.x} y={t.y + fs * 0.35 + 34} textAnchor={t.anchor} fontFamily={FONT} fontSize={34} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }

    if ((p.kind === "led" || p.kind === "buzzer") && p.from && p.to) {
      const [x1, y1] = p.from;
      const [x2, y2] = p.to;
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / L;
      const uy = (y2 - y1) / L;
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const mid: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
      const stroke = toneColor(p.tone);
      let glow: React.ReactNode = null;
      let body: React.ReactNode;
      let waves: React.ReactNode = null;
      let off = 70;
      let side0: CircuitPart["textAt"] = "left";
      if (p.kind === "led") {
        // Triangle points from anode to cathode; the light colour fills it and a halo grows with the level.
        const level = Math.max(0, Math.min(1, trackAt(p.levelTrack, 1)));
        const lit = p.color ?? "#FF3B30";
        const tw = 64;
        const a = (L - tw) / 2;
        const gid = `led-glow-${i}-${Math.round(x1)}-${Math.round(y1)}`;
        const arrow = (sx: number) => (
          <g key={sx} stroke={lit} strokeWidth={4} strokeLinecap="round" fill={lit} opacity={0.25 + 0.75 * level}>
            <line x1={sx} y1={-50} x2={sx + 20} y2={-84} />
            <polygon points={`${sx + 27},${-96} ${sx + 9},${-84} ${sx + 26},${-74}`} stroke="none" />
          </g>
        );
        glow = (
          <g>
            <defs>
              <radialGradient id={gid}>
                <stop offset="0%" stopColor={lit} stopOpacity={0.85 * level} />
                <stop offset="45%" stopColor={lit} stopOpacity={0.35 * level} />
                <stop offset="100%" stopColor={lit} stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle cx={mid[0]} cy={mid[1]} r={50 + 110 * level} fill={`url(#${gid})`} />
          </g>
        );
        body = (
          <>
            <line x1={0} y1={0} x2={a} y2={0} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
            <polygon points={`${a},${-36} ${a},${36} ${a + tw},0`} fill={lit} fillOpacity={0.12 + 0.88 * level} stroke={stroke} strokeWidth={STROKE} strokeLinejoin="round" />
            <line x1={a + tw} y1={-38} x2={a + tw} y2={38} stroke={stroke} strokeWidth={STROKE + 1} strokeLinecap="round" />
            <line x1={a + tw} y1={0} x2={L} y2={0} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
            {arrow(a + 8)}
            {arrow(a + 36)}
          </>
        );
      } else {
        // Disc with a piezo element; while sounding, three arcs ripple out on the wiperSide.
        const R = 48;
        off = R + 34;
        const side = p.wiperSide === "left" ? -1 : 1;
        const nx = -uy * side;
        const ny = ux * side;
        // The label defaults to the side opposite the sound arcs.
        side0 = nx < -0.5 ? "right" : nx > 0.5 ? "left" : ny < 0 ? "below" : "above";
        const win =(p.sounding ?? []).find(([s, e]) => frame >= sec(s) && frame < sec(e));
        if (win) {
          const el = (frame - sec(win[0])) / fps;
          const th = Math.atan2(ny, nx);
          const sw = (40 * Math.PI) / 180;
          waves = [0, 1, 2].map((k) => {
            const ph = (el * 2.5 + k / 3) % 1;
            const r = R + 18 + ph * 80;
            const [sx, sy] = [mid[0] + r * Math.cos(th - sw), mid[1] + r * Math.sin(th - sw)];
            const [ex, ey] = [mid[0] + r * Math.cos(th + sw), mid[1] + r * Math.sin(th + sw)];
            return (
              <path
                key={k}
                d={`M${sx},${sy} A${r},${r} 0 0 1 ${ex},${ey}`}
                fill="none"
                stroke={p.color ?? accentColor}
                strokeWidth={5}
                strokeLinecap="round"
                opacity={(1 - ph) * Math.min(1, el * 4)}
              />
            );
          });
        }
        body = (
          <>
            <line x1={0} y1={0} x2={L / 2 - R} y2={0} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
            <circle cx={L / 2} cy={0} r={R} fill="#FFFFFF" stroke={stroke} strokeWidth={STROKE} />
            <circle cx={L / 2} cy={0} r={20} fill={stroke} fillOpacity={0.12} stroke={stroke} strokeWidth={3} />
            <line x1={L / 2 + R} y1={0} x2={L} y2={0} stroke={stroke} strokeWidth={STROKE} strokeLinecap="round" />
          </>
        );
      }
      const t = textAnchor(p.textAt ?? side0, mid, off);
      return (
        <g key={i} opacity={o}>
          {glow}
          <g transform={`translate(${x1},${y1}) rotate(${ang})`}>{body}</g>
          {waves}
          {p.text && (
            <text x={t.x} y={t.y + (p.sub ? -6 : fs * 0.35)} textAnchor={t.anchor} fontFamily={FONT} fontSize={fs} fontWeight={700} fill={stroke}>
              {p.text}
            </text>
          )}
          {p.sub && (
            <text x={t.x} y={t.y + fs * 0.35 + 34} textAnchor={t.anchor} fontFamily={FONT} fontSize={34} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }

    if (
      (p.kind === "diode" || p.kind === "lamp" || p.kind === "ac" || p.kind === "motor" || p.kind === "fuse" || p.kind === "battery" ||
        p.kind === "inductor") &&
      p.from &&
      p.to
    ) {
      const [x1, y1] = p.from;
      const [x2, y2] = p.to;
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const mid: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
      const on = windowLevel(p.active);
      const R = 52;
      const lead = (a: number, b: number) => <line x1={a} y1={0} x2={b} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />;
      let glow: React.ReactNode = null;
      let body: React.ReactNode;
      let upright: React.ReactNode = null; // symbol content that must not rotate with the part (letters)
      let off = R + 34;
      if (p.kind === "diode") {
        // Triangle from anode to cathode bar; fills with the accent while it conducts (`active`).
        const tw = 60;
        const a = (L - tw) / 2;
        const c = on > 0.5 ? accentColor : ink;
        off = 62;
        body = (
          <>
            {lead(0, a)}
            <polygon points={`${a},${-34} ${a},${34} ${a + tw},0`} fill={accentColor} fillOpacity={0.85 * on} stroke={c} strokeWidth={STROKE} strokeLinejoin="round" />
            <line x1={a + tw} y1={-36} x2={a + tw} y2={36} stroke={c} strokeWidth={STROKE + 1} strokeLinecap="round" />
            {lead(a + tw, L)}
          </>
        );
      } else if (p.kind === "battery") {
        // Long thin plate = +, short thick plate = −; the "+" stays upright beside the long plate, on the side away from
        // the default label (right of a vertical cell, above a horizontal one).
        const gap = 24;
        const a = (L - gap) / 2;
        const ux = (x2 - x1) / L;
        const uy = (y2 - y1) / L;
        const plus: Pt = [x1 + ux * (a - 34) + uy * 58, y1 + uy * (a - 34) - ux * 58];
        off = 70;
        body = (
          <>
            {lead(0, a)}
            <line x1={a} y1={-56} x2={a} y2={56} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <line x1={a + gap} y1={-30} x2={a + gap} y2={30} stroke={ink} strokeWidth={STROKE + 5} strokeLinecap="round" />
            {lead(a + gap, L)}
          </>
        );
        upright = (
          <text x={plus[0]} y={plus[1] + 12} textAnchor="middle" fontFamily={FONT} fontSize={36} fontWeight={700} fill={ink}>
            +
          </text>
        );
      } else if (p.kind === "inductor") {
        // Four half-turn bumps on the -y side; accent while current flows (`active`).
        const turns = 4;
        const r = Math.min(28, (L * 0.7) / (2 * turns));
        const a = (L - 2 * r * turns) / 2;
        const c = on > 0.5 ? accentColor : ink;
        const arcs = Array.from({ length: turns }, (_, k) => `A${r},${r} 0 0 1 ${a + 2 * r * (k + 1)},0`).join(" ");
        off = 56;
        body = (
          <>
            {lead(0, a)}
            <path d={`M${a},0 ${arcs}`} fill="none" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
            {lead(a + 2 * r * turns, L)}
          </>
        );
      } else if (p.kind === "fuse") {
        const bl = Math.min(130, L * 0.6);
        off = 50;
        body = (
          <>
            {lead(0, (L - bl) / 2)}
            <rect x={(L - bl) / 2} y={-22} width={bl} height={44} rx={6} fill="#FFFFFF" stroke={ink} strokeWidth={STROKE} />
            <line x1={(L - bl) / 2} y1={0} x2={(L + bl) / 2} y2={0} stroke={ink} strokeWidth={3} />
            {lead((L + bl) / 2, L)}
          </>
        );
      } else {
        // Circle symbols: lamp (IEC cross, warm glow by level), ac source (sine), motor (M, spinning arc while active).
        let inner: React.ReactNode = null;
        if (p.kind === "lamp") {
          const level = Math.max(0, Math.min(1, trackAt(p.levelTrack, 0)));
          const lit = p.color ?? "#FFB020";
          const gid = `lamp-glow-${i}-${Math.round(x1)}-${Math.round(y1)}`;
          glow = (
            <g>
              <defs>
                <radialGradient id={gid}>
                  <stop offset="0%" stopColor={lit} stopOpacity={0.9 * level} />
                  <stop offset="45%" stopColor={lit} stopOpacity={0.4 * level} />
                  <stop offset="100%" stopColor={lit} stopOpacity={0} />
                </radialGradient>
              </defs>
              <circle cx={mid[0]} cy={mid[1]} r={R + 20 + 70 * level} fill={`url(#${gid})`} />
            </g>
          );
          const d = R * 0.7;
          inner = (
            <>
              <circle cx={L / 2} cy={0} r={R} fill={lit} fillOpacity={0.1 + 0.8 * level} stroke={ink} strokeWidth={STROKE} />
              <line x1={L / 2 - d} y1={-d} x2={L / 2 + d} y2={d} stroke={ink} strokeWidth={4} strokeLinecap="round" />
              <line x1={L / 2 - d} y1={d} x2={L / 2 + d} y2={-d} stroke={ink} strokeWidth={4} strokeLinecap="round" />
            </>
          );
        } else {
          inner = <circle cx={L / 2} cy={0} r={R} fill="#FFFFFF" stroke={ink} strokeWidth={STROKE} />;
        }
        body = (
          <>
            {lead(0, L / 2 - R)}
            {inner}
            {lead(L / 2 + R, L)}
          </>
        );
        if (p.kind === "ac") {
          const pts = Array.from({ length: 25 }, (_, k) => {
            const t = k / 24;
            return `${k ? "L" : "M"}${mid[0] - 30 + 60 * t},${mid[1] - 16 * Math.sin(t * 2 * Math.PI)}`;
          }).join(" ");
          upright = <path d={pts} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" />;
        }
        if (p.kind === "motor") {
          const spin = on > 0.01 ? ((frame / fps) * 360 * 1.5) % 360 : 0;
          upright = (
            <>
              <text x={mid[0]} y={mid[1] + 17} textAnchor="middle" fontFamily={FONT} fontSize={48} fontWeight={700} fill={ink}>
                M
              </text>
              {on > 0.01 && (
                <g opacity={on} transform={`rotate(${spin} ${mid[0]} ${mid[1]})`}>
                  <path d={`M${mid[0] + R + 16},${mid[1]} A${R + 16},${R + 16} 0 0 1 ${mid[0]},${mid[1] + R + 16}`} fill="none" stroke={accentColor} strokeWidth={5} strokeLinecap="round" />
                  {arrowHead([mid[0] - 4, mid[1] + R + 16], [-1, 0], 20, accentColor)}
                </g>
              )}
            </>
          );
        }
      }
      const t = textAnchor(p.textAt ?? "left", mid, off);
      return (
        <g key={i} opacity={o}>
          {glow}
          <g transform={`translate(${x1},${y1}) rotate(${ang})`}>{body}</g>
          {upright}
          {p.text && (
            <text x={t.x} y={t.y + (p.sub ? -6 : fs * 0.35)} textAnchor={t.anchor} fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
              {p.text}
            </text>
          )}
          {p.sub && (
            <text x={t.x} y={t.y + fs * 0.35 + 34} textAnchor={t.anchor} fontFamily={FONT} fontSize={34} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }

    if ((p.kind === "resistor" || p.kind === "button") && p.from && p.to) {
      const [x1, y1] = p.from;
      const [x2, y2] = p.to;
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const mid: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
      const t = textAnchor(p.textAt, mid, p.kind === "resistor" ? 50 : 80);
      let body: React.ReactNode;
      if (p.kind === "resistor") {
        const bl = Math.min(130, L * 0.6);
        body = (
          <>
            <line x1={0} y1={0} x2={(L - bl) / 2} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <rect x={(L - bl) / 2} y={-24} width={bl} height={48} rx={6} fill="#FFFFFF" stroke={ink} strokeWidth={STROKE} />
            <line x1={(L + bl) / 2} y1={0} x2={L} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          </>
        );
      } else {
        // Contact closes in 3 frames when a pressed window starts and opens in 3 frames when it ends.
        const closed = windowLevel(p.pressed);
        const gap = Math.min(90, L * 0.45);
        const a0 = (L - gap) / 2;
        const lift = interpolate(closed, [0, 1], [-34, -8]);
        body = (
          <>
            <line x1={0} y1={0} x2={a0} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <line x1={a0 + gap} y1={0} x2={L} y2={0} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <circle cx={a0} cy={0} r={8} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
            <circle cx={a0 + gap} cy={0} r={8} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
            {/* Moving contact bar with its plunger */}
            <line x1={a0 - 6} y1={lift} x2={a0 + gap + 6} y2={lift} stroke={closed > 0.5 ? accentColor : ink} strokeWidth={STROKE + 1} strokeLinecap="round" />
            <line x1={a0 + gap / 2} y1={lift} x2={a0 + gap / 2} y2={lift - 30} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
            <line x1={a0 + gap / 2 - 22} y1={lift - 30} x2={a0 + gap / 2 + 22} y2={lift - 30} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          </>
        );
      }
      return (
        <g key={i} opacity={o}>
          <g transform={`translate(${x1},${y1}) rotate(${ang})`}>{body}</g>
          {p.text && (
            <text x={t.x} y={t.y + (p.sub ? -6 : fs * 0.35)} textAnchor={t.anchor} fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
              {p.text}
            </text>
          )}
          {p.sub && (
            <text x={t.x} y={t.y + fs * 0.35 + 34} textAnchor={t.anchor} fontFamily={FONT} fontSize={34} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }

    if (!p.at) return null;
    const [x, y] = p.at;
    const showPins = p.terminalLabels !== false;
    const pinText = (tx: number, ty: number, s: string, anchor: "start" | "middle" | "end" = "middle") => (
      <text key={s + tx + ty} x={tx} y={ty} textAnchor={anchor} fontFamily={FONT} fontSize={28} fontWeight={600} fill={mutedColor}>
        {s}
      </text>
    );
    /** Title (+ sub) of a package part, placed around its box on the `textAt` side. */
    const boxLabel = (w: number, h: number, side: NonNullable<CircuitPart["textAt"]>) => {
      if (!p.text) return null;
      const pos =
        side === "left"
          ? { tx: x - 26, ty: y + h / 2 + fs * 0.35 - (p.sub ? 20 : 0), anchor: "end" as const }
          : side === "right"
            ? { tx: x + w + 26, ty: y + h / 2 + fs * 0.35 - (p.sub ? 20 : 0), anchor: "start" as const }
            : side === "below"
              ? { tx: x + w / 2, ty: y + h + fs + 14, anchor: "middle" as const }
              : { tx: x + w / 2, ty: y - 26 - (p.sub ? 40 : 0), anchor: "middle" as const };
      return (
        <>
          <text x={pos.tx} y={pos.ty} textAnchor={pos.anchor} fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
            {p.text}
          </text>
          {p.sub && (
            <text x={pos.tx} y={pos.ty + 42} textAnchor={pos.anchor} fontFamily={FONT} fontSize={32} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </>
      );
    };

    if (p.kind === "relay") {
      // Package outline, coil on the left, changeover contact (COM / NC / NO) on the right, dashed mechanical link.
      const w = p.w ?? 420;
      const h = p.h ?? 340;
      const on = windowLevel(p.active);
      const hot = on > 0.5 ? accentColor : ink;
      const cx = x + 0.25 * w;
      const coilW = 76;
      const coilH = 0.36 * h;
      const ym = y + 0.5 * h;
      const pivot: Pt = [x + 0.72 * w, y + 0.72 * h];
      const nc: Pt = [x + 0.55 * w, y + 0.3 * h];
      const no: Pt = [x + 0.9 * w, y + 0.3 * h];
      const aNC = Math.atan2(nc[1] - pivot[1], nc[0] - pivot[0]);
      const aNO = Math.atan2(no[1] - pivot[1], no[0] - pivot[0]);
      const armL = Math.min(Math.hypot(nc[0] - pivot[0], nc[1] - pivot[1]), Math.hypot(no[0] - pivot[0], no[1] - pivot[1]));
      const a = aNC + (aNO - aNC) * on;
      const tip: Pt = [pivot[0] + armL * Math.cos(a), pivot[1] + armL * Math.sin(a)];
      const link: Pt = [pivot[0] + (tip[0] - pivot[0]) * 0.45, pivot[1] + (tip[1] - pivot[1]) * 0.45];
      const pin = (q: Pt, k: string) => <circle key={k} cx={q[0]} cy={q[1]} r={9} fill="#FFFFFF" stroke={ink} strokeWidth={4} />;
      return (
        <g key={i} opacity={o}>
          <rect x={x} y={y} width={w} height={h} rx={24} fill="rgba(0,102,204,0.03)" stroke={mutedColor} strokeWidth={3} strokeDasharray="12 10" />
          {/* Coil */}
          <line x1={cx} y1={y} x2={cx} y2={ym - coilH / 2} stroke={hot} strokeWidth={STROKE} strokeLinecap="round" />
          <line x1={cx} y1={ym + coilH / 2} x2={cx} y2={y + h} stroke={hot} strokeWidth={STROKE} strokeLinecap="round" />
          <rect x={cx - coilW / 2} y={ym - coilH / 2} width={coilW} height={coilH} rx={6} fill={accentColor} fillOpacity={0.04 + 0.2 * on} stroke={hot} strokeWidth={STROKE} />
          <line x1={cx - coilW / 2} y1={ym + coilH / 2} x2={cx + coilW / 2} y2={ym - coilH / 2} stroke={hot} strokeWidth={3} />
          {/* Mechanical link */}
          <line x1={cx + coilW / 2} y1={ym} x2={link[0]} y2={link[1]} stroke={mutedColor} strokeWidth={3} strokeDasharray="10 9" />
          {/* Contacts */}
          <line x1={nc[0]} y1={y} x2={nc[0]} y2={nc[1]} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          <line x1={no[0]} y1={y} x2={no[0]} y2={no[1]} stroke={on > 0.5 ? accentColor : ink} strokeWidth={STROKE} strokeLinecap="round" />
          <line x1={pivot[0]} y1={y + h} x2={pivot[0]} y2={pivot[1]} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          <circle cx={nc[0]} cy={nc[1]} r={8} fill={ink} />
          <circle cx={no[0]} cy={no[1]} r={8} fill={on > 0.5 ? accentColor : ink} />
          <line x1={pivot[0]} y1={pivot[1]} x2={tip[0]} y2={tip[1]} stroke={hot} strokeWidth={STROKE + 2} strokeLinecap="round" />
          <circle cx={pivot[0]} cy={pivot[1]} r={10} fill="#FFFFFF" stroke={hot} strokeWidth={4} />
          {pin([cx, y], "a1")}
          {pin([cx, y + h], "a2")}
          {pin([nc[0], y], "nc")}
          {pin([no[0], y], "no")}
          {pin([pivot[0], y + h], "com")}
          {showPins && (
            <>
              {pinText(nc[0] - 16, y + 46, "NC", "end")}
              {pinText(no[0] - 16, y + 46, "NO", "end")}
              {pinText(pivot[0] + 18, y + h - 22, "COM", "start")}
            </>
          )}
          {boxLabel(w, h, p.textAt ?? "below")}
        </g>
      );
    }

    if (p.kind === "npn" || p.kind === "nmos") {
      // Discrete transistor in a circle; the collector-emitter / drain-source path turns accent while it conducts.
      const on = windowLevel(p.active);
      const hot = on > 0.5 ? accentColor : ink;
      const R = 62;
      const line = (pts: Pt[], c: string, wdt = STROKE, k?: string) => (
        <path key={k} d={pts.map((q, n) => `${n ? "L" : "M"}${q[0]},${q[1]}`).join(" ")} fill="none" stroke={c} strokeWidth={wdt} strokeLinecap="round" strokeLinejoin="round" />
      );
      let sym: React.ReactNode;
      if (p.kind === "npn") {
        sym = (
          <>
            {line([[x - 110, y], [x - 22, y]], hot)}
            {line([[x - 22, y - 36], [x - 22, y + 36]], ink, 7)}
            {line([[x - 22, y - 16], [x + 32, y - 46], [x + 32, y - 110]], hot)}
            {line([[x - 22, y + 16], [x + 32, y + 46], [x + 32, y + 110]], hot)}
            {arrowHead([x + 21, y + 40], [54, 30], 24, hot)}
          </>
        );
      } else {
        const seg = (a0: number, a1: number, k: string) => line([[x - 18, y + a0], [x - 18, y + a1]], ink, 6, k);
        sym = (
          <>
            {line([[x - 110, y], [x - 38, y]], hot)}
            {line([[x - 38, y - 40], [x - 38, y + 40]], ink, 6)}
            {on > 0.5 ? line([[x - 18, y - 40], [x - 18, y + 40]], hot, 6) : [seg(-40, -20, "s0"), seg(-9, 9, "s1"), seg(20, 40, "s2")]}
            {line([[x - 18, y - 30], [x + 32, y - 30], [x + 32, y - 110]], hot)}
            {line([[x - 18, y + 30], [x + 32, y + 30], [x + 32, y + 110]], hot)}
            {line([[x - 18, y], [x + 32, y], [x + 32, y + 30]], ink, 4)}
            {arrowHead([x - 14, y], [-1, 0], 22, ink)}
          </>
        );
      }
      const [b, c, e] = p.kind === "npn" ? ["B", "C", "E"] : ["G", "D", "S"];
      const t = textAnchor(p.textAt ?? "right", [x, y], R + 46);
      return (
        <g key={i} opacity={o}>
          <circle cx={x} cy={y} r={R} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
          {sym}
          {showPins && (
            <>
              {pinText(x - 96, y - 16, b, "start")}
              {pinText(x + 46, y - 78, c, "start")}
              {pinText(x + 46, y + 100, e, "start")}
            </>
          )}
          {p.text && (
            <text x={t.x} y={t.y + (p.sub ? -6 : fs * 0.35)} textAnchor={t.anchor} fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
              {p.text}
            </text>
          )}
          {p.sub && (
            <text x={t.x} y={t.y + fs * 0.35 + 34} textAnchor={t.anchor} fontFamily={FONT} fontSize={32} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }

    if (p.kind === "opto" || p.kind === "ssr") {
      // Light-coupled packages: an input LED shines across the gap onto a phototransistor (opto) or a triac (SSR).
      const ssr = p.kind === "ssr";
      const w = p.w ?? (ssr ? 360 : 300);
      const h = p.h ?? 260;
      const on = windowLevel(p.active);
      const hot = on > 0.5 ? accentColor : ink;
      const lit = p.color ?? "#FF3B30";
      const yA = y + (ssr ? 0.3 : 0.25) * h;
      const yK = y + (ssr ? 0.7 : 0.75) * h;
      const ym = y + 0.5 * h;
      const lx = x + (ssr ? 0.24 : 0.28) * w;
      const ox = x + (ssr ? 0.7 : 0.66) * w;
      const line = (pts: Pt[], c: string, wdt = STROKE, k?: string) => (
        <path key={k} d={pts.map((q, n) => `${n ? "L" : "M"}${q[0]},${q[1]}`).join(" ")} fill="none" stroke={c} strokeWidth={wdt} strokeLinecap="round" strokeLinejoin="round" />
      );
      const gid = `${p.kind}-glow-${i}-${Math.round(x)}-${Math.round(y)}`;
      const beam = on > 0.5 ? lit : mutedColor;
      const beams = [-16, 14].map((dy, k) => (
        <g key={k} opacity={0.35 + 0.65 * on}>
          {line([[lx + 42, ym + dy], [ox - (ssr ? 66 : 34), ym + dy]], beam, 4)}
          {arrowHead([ox - (ssr ? 56 : 24), ym + dy], [1, 0], 18, beam)}
        </g>
      ));
      let out: React.ReactNode;
      if (ssr) {
        out = (
          <>
            {line([[x + w, yA], [ox, yA], [ox, ym - 34]], hot)}
            {line([[ox, ym + 34], [ox, yK], [x + w, yK]], hot)}
            {line([[ox - 42, ym - 34], [ox + 42, ym - 34]], hot)}
            {line([[ox - 42, ym + 34], [ox + 42, ym + 34]], hot)}
            <polygon points={`${ox - 38},${ym - 34} ${ox - 4},${ym - 34} ${ox - 21},${ym + 34}`} fill={accentColor} fillOpacity={0.85 * on} stroke={hot} strokeWidth={4} strokeLinejoin="round" />
            <polygon points={`${ox + 4},${ym + 34} ${ox + 38},${ym + 34} ${ox + 21},${ym - 34}`} fill={accentColor} fillOpacity={0.85 * on} stroke={hot} strokeWidth={4} strokeLinejoin="round" />
          </>
        );
      } else {
        out = (
          <>
            {line([[ox, ym - 36], [ox, ym + 36]], ink, 7)}
            {line([[ox, ym - 16], [ox + 46, ym - 44], [ox + 46, yA], [x + w, yA]], hot)}
            {line([[ox, ym + 16], [ox + 46, ym + 44], [ox + 46, yK], [x + w, yK]], hot)}
            {arrowHead([ox + 36, ym + 38], [46, 28], 20, hot)}
          </>
        );
      }
      return (
        <g key={i} opacity={o}>
          <rect x={x} y={y} width={w} height={h} rx={20} fill="#FFFFFF" stroke="rgba(0,0,0,0.35)" strokeWidth={4} />
          <defs>
            <radialGradient id={gid}>
              <stop offset="0%" stopColor={lit} stopOpacity={0.8 * on} />
              <stop offset="100%" stopColor={lit} stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={lx} cy={ym} r={70} fill={`url(#${gid})`} />
          {line([[x, yA], [lx, yA], [lx, ym - 28]], ink)}
          <polygon points={`${lx - 30},${ym - 28} ${lx + 30},${ym - 28} ${lx},${ym + 22}`} fill={lit} fillOpacity={0.12 + 0.88 * on} stroke={ink} strokeWidth={STROKE} strokeLinejoin="round" />
          {line([[lx - 32, ym + 22], [lx + 32, ym + 22]], ink, STROKE + 1)}
          {line([[lx, ym + 22], [lx, yK], [x, yK]], ink)}
          {beams}
          {out}
          {showPins &&
            (ssr ? (
              <>
                {pinText(x + 22, yA - 14, "+", "start")}
                {pinText(x + 22, yK - 14, "−", "start")}
                {pinText(x + w - 22, yA - 14, "~", "end")}
                {pinText(x + w - 22, yK - 14, "~", "end")}
              </>
            ) : null)}
          {boxLabel(w, h, p.textAt ?? "above")}
        </g>
      );
    }

    if (p.kind === "hazard") {
      // Electrical warning sign: yellow triangle with a lightning bolt, centred on `at`.
      const s = p.w ?? 200;
      const th = s * 0.866;
      const k = interpolate(o, [0, 1], [0.7, 1]);
      const bolt: Pt[] = [[0.03, -0.24], [-0.09, 0.03], [-0.01, 0.03], [-0.05, 0.24], [0.09, -0.05], [0.01, -0.05], [0.07, -0.24]];
      return (
        <g key={i} opacity={o} transform={`translate(${x},${y}) scale(${k})`}>
          <polygon points={`0,${(-2 * th) / 3} ${-s / 2},${th / 3} ${s / 2},${th / 3}`} fill="#FFCC00" stroke="#1D1D1F" strokeWidth={s * 0.05} strokeLinejoin="round" />
          <polygon points={bolt.map(([bx, by]) => `${bx * s},${by * s + s * 0.04}`).join(" ")} fill="#1D1D1F" />
          {p.text && (
            <text x={0} y={th / 3 + fs + 18} textAnchor="middle" fontFamily={FONT} fontSize={fs} fontWeight={700} fill={p.tone ? ink : conColor}>
              {p.text}
            </text>
          )}
        </g>
      );
    }

    if (p.kind === "servo") {
      // Top view: body with mounting ears, output shaft near one end, horn rotating over a dashed -90..+90 range.
      const w = p.w ?? 340;
      const h = p.h ?? 170;
      const angle = trackAt(p.angleTrack, 0);
      const sx = x + w * 0.7;
      const sy = y + h / 2;
      const hl = h * 0.95;
      const R = hl + 26;
      const deg = Math.round(angle);
      const ear = (ex: number) => (
        <g key={ex}>
          <rect x={ex} y={sy - h * 0.21} width={44} height={h * 0.42} rx={8} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
          <circle cx={ex + 22} cy={sy} r={7} fill="none" stroke={ink} strokeWidth={3} />
        </g>
      );
      return (
        <g key={i} opacity={o}>
          <path d={`M${sx - R},${sy} A${R},${R} 0 0 1 ${sx + R},${sy}`} fill="none" stroke={mutedColor} strokeWidth={3} strokeDasharray="10 10" />
          {ear(x - 44)}
          {ear(x + w)}
          <rect x={x} y={y} width={w} height={h} rx={22} fill="rgba(0,102,204,0.06)" stroke={ink} strokeWidth={STROKE} />
          {/* Name under the body, clear of the horn's sweep; the angle readout sits under the shaft. */}
          {p.text && (
            <text x={x + w * 0.25} y={y + h + 66} textAnchor="middle" fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
              {p.text}
            </text>
          )}
          <g transform={`translate(${sx},${sy}) rotate(${angle})`}>
            <rect x={-17} y={-hl} width={34} height={hl + 17} rx={17} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
            <circle cx={0} cy={-hl + 20} r={6} fill="none" stroke={ink} strokeWidth={3} />
            <circle cx={0} cy={-hl * 0.55} r={6} fill="none" stroke={ink} strokeWidth={3} />
            <circle cx={0} cy={0} r={26} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
            <circle cx={0} cy={0} r={8} fill={accentColor} />
          </g>
          {p.angleLabel !== false && (
            <text x={sx} y={y + h + 66} textAnchor="middle" fontFamily={FONT} fontSize={52} fontWeight={700} fill={accentColor}>
              {`${deg > 0 ? "+" : deg < 0 ? "−" : ""}${Math.abs(deg)}°`}
            </text>
          )}
        </g>
      );
    }

    if (p.kind === "pwm") {
      // Square wave at the current duty, redrawn every frame, with an optional live readout.
      const w = p.w ?? 400;
      const h = p.h ?? 120;
      const duty = Math.max(0, Math.min(1, trackAt(p.dutyTrack, 0.5)));
      const n = p.periods ?? 4;
      const pw = w / n;
      const yH = y;
      const yL = y + h;
      const c = p.color ?? (p.tone ? toneColor(p.tone) : accentColor);
      let d = `M${x},${yL}`;
      if (duty >= 0.999) d += ` V${yH} H${x + w}`;
      else if (duty <= 0.001) d += ` H${x + w}`;
      // A fractional `periods` (e.g. note frequencies in ratio) ends the last cycle at the right edge.
      else
        for (let k = 0; k * pw < w - 0.5; k++)
          d += ` H${x + k * pw} V${yH} H${Math.min(x + (k + duty) * pw, x + w)} V${yL} H${Math.min(x + (k + 1) * pw, x + w)}`;
      const value =
        p.readout === "ms" && p.periodMs
          ? `${(duty * p.periodMs).toFixed(1).replace(".", ",")} ms`
          : p.readout === "percent"
            ? `${Math.round(duty * 100)} %`
            : null;
      const halo = { stroke: "#FFFFFF", strokeWidth: 8, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
      return (
        <g key={i} opacity={o}>
          <line x1={x} y1={yL} x2={x + w} y2={yL} stroke="rgba(0,0,0,0.18)" strokeWidth={3} />
          <path d={d} fill="none" stroke={c} strokeWidth={STROKE} strokeLinejoin="round" strokeLinecap="round" />
          {p.text && (
            <text x={x} y={y - 24} fontFamily={FONT} fontSize={34} fontWeight={600} fill={mutedColor} {...halo}>
              {p.text}
            </text>
          )}
          {value && (
            <text x={x + w} y={y - 24} textAnchor="end" fontFamily={FONT} fontSize={fs} fontWeight={700} fill={c} {...halo}>
              {value}
            </text>
          )}
        </g>
      );
    }

    if (p.kind === "ground") {
      return (
        <g key={i} opacity={o} stroke={ink} strokeWidth={STROKE} strokeLinecap="round">
          <line x1={x} y1={y} x2={x} y2={y + 26} />
          <line x1={x - 34} y1={y + 26} x2={x + 34} y2={y + 26} />
          <line x1={x - 22} y1={y + 40} x2={x + 22} y2={y + 40} />
          <line x1={x - 10} y1={y + 54} x2={x + 10} y2={y + 54} />
          {p.text && (
            <text x={x + 50} y={y + 50} fontFamily={FONT} fontSize={36} fontWeight={600} fill={mutedColor} stroke="none">
              {p.text}
            </text>
          )}
        </g>
      );
    }

    if (p.kind === "rail") {
      return (
        <g key={i} opacity={o}>
          <line x1={x} y1={y} x2={x} y2={y - 28} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          <line x1={x - 40} y1={y - 28} x2={x + 40} y2={y - 28} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" />
          <text x={x} y={y - 46} textAnchor="middle" fontFamily={FONT} fontSize={fs} fontWeight={700} fill={ink}>
            {p.text}
          </text>
        </g>
      );
    }

    if (p.kind === "block") {
      const w = p.w ?? 300;
      const h = p.h ?? 200;
      const s = (p.atSeconds ?? 0) <= 0 ? 1 : interpolate(o, [0, 1], [0.94, 1]);
      return (
        <g key={i} opacity={o} transform={`translate(${x + w / 2},${y + h / 2}) scale(${s}) translate(${-w / 2},${-h / 2})`}>
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            rx={28}
            fill={p.dashed ? "rgba(0,102,204,0.05)" : "#FFFFFF"}
            stroke={p.dashed ? accentColor : p.tone ? ink : "rgba(0,0,0,0.25)"}
            strokeWidth={p.dashed ? 4 : 4}
            strokeDasharray={p.dashed ? "14 10" : undefined}
          />
          {p.text && (
            <text x={w / 2} y={p.sub || h > 300 ? 64 : h / 2 + fs * 0.35} textAnchor="middle" fontFamily={FONT} fontSize={fs} fontWeight={700} fill={p.dashed ? accentColor : textColor}>
              {p.text}
            </text>
          )}
          {p.sub && (
            <text x={w / 2} y={108} textAnchor="middle" fontFamily={FONT} fontSize={34} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }

    if (p.kind === "pin") {
      const t = textAnchor(p.textAt ?? "left", [x, y], 30);
      return (
        <g key={i} opacity={o}>
          <rect x={x - 14} y={y - 14} width={28} height={28} rx={5} fill={ink} />
          {p.text && (
            <text x={t.x} y={t.y + 11} textAnchor={t.anchor} fontFamily={MONO} fontSize={p.fontSize ?? 38} fontWeight={700} fill={ink}>
              {p.text}
            </text>
          )}
        </g>
      );
    }

    if (p.kind === "dot") {
      return <circle key={i} opacity={o} cx={x} cy={y} r={11} fill={ink} />;
    }

    if (p.kind === "cross") {
      const s = interpolate(o, [0, 1], [0.6, 1]);
      return (
        <g key={i} opacity={o} transform={`translate(${x},${y}) scale(${s})`} stroke={conColor} strokeWidth={14} strokeLinecap="round">
          <line x1={-40} y1={-40} x2={40} y2={40} />
          <line x1={40} y1={-40} x2={-40} y2={40} />
        </g>
      );
    }

    if (p.kind === "tag" && p.text) {
      // Pill width from a rough glyph width (Inter semibold ~0.58 em); text stays centred either way.
      const w = p.text.length * fs * 0.58 + 56;
      const h = fs + 30;
      const s = interpolate(o, [0, 1], [0.85, 1]);
      return (
        <g key={i} opacity={o} transform={`translate(${x},${y}) scale(${s})`}>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={p.tone === "neutral" || !p.tone ? textColor : ink} />
          <text x={0} y={fs * 0.35} textAnchor="middle" fontFamily={FONT} fontSize={fs} fontWeight={600} fill="#FFFFFF">
            {p.text}
          </text>
        </g>
      );
    }

    if (p.kind === "label" && p.text) {
      const anchor = p.textAt === "left" ? "end" : p.textAt === "right" ? "start" : "middle";
      return (
        <g key={i} opacity={o}>
          <text x={x} y={y} textAnchor={anchor} fontFamily={FONT} fontSize={fs} fontWeight={p.tone && p.tone !== "muted" ? 700 : 400} fill={ink}>
            {p.text}
          </text>
          {p.sub && (
            <text x={x} y={y + 44} textAnchor={anchor} fontFamily={FONT} fontSize={34} fontWeight={400} fill={mutedColor}>
              {p.sub}
            </text>
          )}
        </g>
      );
    }
    return null;
  };

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
          padding: 24,
          opacity: head,
        }}
      >
        <svg viewBox={`0 0 1000 ${viewHeight}`} style={{ width: "100%", display: "block" }}>
          {parts.map(renderPart)}
        </svg>
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
