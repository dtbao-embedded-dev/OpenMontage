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
   */
  kind: "wire" | "resistor" | "button" | "ground" | "rail" | "block" | "pin" | "tag" | "cross" | "dot" | "label" | "potentiometer" | "ldr" | "capacitor";
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
  /** button: [start, end] seconds when it is held down (contact closed). */
  pressed?: [number, number][];
  /** wire: current-flow dots travel along the wire in this window. */
  flow?: { atSeconds: number; untilSeconds?: number; reverse?: boolean };
  /** potentiometer: side of the body (seen from `from` towards `to`) the wiper arrow comes from. Default "right". */
  wiperSide?: "left" | "right";
  /** potentiometer: wiper position over time as [seconds, fraction 0..1 from `from` to `to`]; default 0.5 throughout. */
  wiperTrack?: [number, number][];
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
  const pop = (start: number, damping = 16) => spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });
  const toneColor = (t: Tone | undefined) =>
    t === "accent" ? accentColor : t === "good" ? proColor : t === "bad" ? conColor : t === "muted" ? mutedColor : textColor;
  // Visibility of a part: spring in at atSeconds, fade out over 6 frames from untilSeconds.
  const vis = (p: CircuitPart) => {
    const inP = (p.atSeconds ?? 0) <= 0 ? 1 : pop(sec(p.atSeconds!));
    const out = p.untilSeconds === undefined ? 1 : interpolate(frame, [sec(p.untilSeconds), sec(p.untilSeconds) + 6], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return Math.min(1, inP) * out;
  };

  const head = pop(0, 18);

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
    const ink = toneColor(p.tone);
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
      const track = p.wiperTrack ?? [];
      let f = 0.5;
      if (track.length === 1) f = track[0][1];
      if (track.length > 1) {
        f = interpolate(frame, track.map(([s]) => sec(s)), track.map(([, v]) => v), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      }
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
        let closed = 0;
        for (const [a, b] of p.pressed ?? []) {
          const c = Math.min(
            interpolate(frame, [sec(a), sec(a) + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            interpolate(frame, [sec(b), sec(b) + 3], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          );
          closed = Math.max(closed, c);
        }
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
