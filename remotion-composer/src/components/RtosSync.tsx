import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted" | "warn";

export interface RtState {
  atSeconds: number;
  /** run = on a core, ready = runnable but waiting for a core, blocked = sleeping on an object, done = finished. */
  state: "run" | "ready" | "blocked" | "done";
  /** Pill text under the task card (defaults per state). */
  text?: string;
}

export interface RtNode {
  id: string;
  /** task / isr cards, queue slots, sema tokens, mutex padlock, bits = event-group flags. */
  kind: "task" | "isr" | "queue" | "sema" | "mutex" | "bits";
  label: string;
  sub?: string;
  /** Centre in canvas units (width 1000, height `canvasHeight`). */
  x: number;
  y: number;
  w?: number;
  atSeconds?: number;
  // task
  states?: RtState[];
  /** Priority badge track: [{atSeconds, text, tone}] — the last one due is shown. */
  prio?: { atSeconds: number; text: string; tone?: Tone }[];
  // queue
  slots?: number;
  /** FIFO items: in the queue from inAt until outAt. */
  items?: { label: string; inAt: number; outAt?: number }[];
  // sema
  max?: number;
  /** [[seconds, available tokens]] step track. */
  tokens?: [number, number][];
  // mutex
  /** Owner track: [{atSeconds, owner}], owner null = free. */
  owners?: { atSeconds: number; owner: string | null }[];
  // bits
  bits?: { label: string; setAt?: number; clearAt?: number }[];
}

export interface RtLink {
  from: string;
  to: string;
  atSeconds?: number;
  untilSeconds?: number;
  /** hold = solid (owns), want = dashed with arrow (waits for), flow = grey arrow (data / signal path). */
  kind?: "hold" | "want" | "flow";
  label?: string;
  tone?: Tone;
  /** Perpendicular bend of the curve in canvas units (+ = left of the direction of travel). */
  bend?: number;
}

export interface RtPacket {
  from: string;
  to: string;
  atSeconds: number;
  seconds?: number;
  label: string;
  tone?: Tone;
}

export interface RtLogLine {
  text: string;
  atSeconds?: number;
  tone?: Tone;
}

export interface RtCode {
  title?: string;
  lines: string[];
  atSeconds?: number;
  /** Highlight windows: 0-based inclusive line range lit from atSeconds until untilSeconds. */
  highlight?: { from: number; to: number; atSeconds: number; untilSeconds?: number; tone?: Tone }[];
  fontSize?: number;
}

export interface RtLane {
  label: string;
  detail?: string;
  tone?: Tone;
}

export interface RtBlock {
  lane: number;
  x0: number;
  x1: number;
  /** run = lane colour, wait = dashed (blocked), boost = lane colour striped (running at an inherited priority). */
  kind?: "run" | "wait" | "boost";
  label?: string;
}

export interface RtInvPanel {
  title: string;
  tone?: Tone;
  atSeconds?: number;
  /** Playhead track: [start, end] seconds for a linear 0 -> units sweep, or [[seconds, unit], ...] breakpoints so each
   *  event lands on the word that names it. Blocks draw as the playhead passes. */
  sweep: [number, number] | [number, number][];
  units?: number;
  lanes: RtLane[];
  blocks: RtBlock[];
  marks?: { x: number; label: string; tone?: Tone }[];
  /** Verdict pill under the panel, shown when the playhead ends. */
  verdict?: { text: string; tone?: Tone; atSeconds?: number };
}

export interface RtStack {
  title?: string;
  /** [[seconds, bytes]] linear track of the configured stack size. */
  size: [number, number][];
  /** [[seconds, bytes]] linear track of the stack in use; the high-water mark is the peak so far. */
  used: [number, number][];
  atSeconds?: number;
  /** Byte readout labels. */
  labels?: { size?: string; used?: string; free?: string };
}

export interface RtInfo {
  label: string;
  value: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface RtStatus {
  atSeconds: number;
  untilSeconds?: number;
  text: string;
  tone?: Tone;
}

interface RtosSyncProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  view?: "diagram" | "inversion" | "stack";
  canvasHeight?: number;
  nodes?: RtNode[];
  links?: RtLink[];
  packets?: RtPacket[];
  inversion?: RtInvPanel[];
  stack?: RtStack;
  log?: { title?: string; lines: RtLogLine[]; atSeconds?: number; fontSize?: number };
  code?: RtCode;
  info?: RtInfo[];
  status?: RtStatus[];
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
const MONO = "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace";
const WARN = "#B25000";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const NOLIG: React.CSSProperties = { fontVariantLigatures: "none", fontFeatureSettings: '"calt" 0, "liga" 0' };

const lin = (tr: [number, number][], t: number) => {
  if (tr.length === 0) return 0;
  if (t <= tr[0][0]) return tr[0][1];
  for (let i = 1; i < tr.length; i++) {
    if (t <= tr[i][0]) {
      const [s0, v0] = tr[i - 1];
      const [s1, v1] = tr[i];
      return s1 === s0 ? v1 : v0 + ((v1 - v0) * (t - s0)) / (s1 - s0);
    }
  }
  return tr[tr.length - 1][1];
};
const step = <T,>(tr: { atSeconds: number }[] & T[], t: number): T | undefined =>
  [...tr].reverse().find((s) => s.atSeconds <= t) as T | undefined;

/**
 * FreeRTOS synchronisation explainer: task / ISR cards with run-ready-blocked states and priority badges, queue slots
 * with FIFO items, semaphore tokens, a mutex padlock with its owner, event-group bits, hold / wait-for arrows (deadlock
 * cycles) and travelling packets; a priority-inversion view (H / M / L lanes swept by a playhead, binary semaphore vs
 * mutex with priority inheritance); a stack view (configured size, usage and the high-water mark); and shared log /
 * code panels.
 */
export const RtosSync: React.FC<RtosSyncProps> = ({
  name,
  eyebrow,
  tagline,
  view = "diagram",
  canvasHeight = 520,
  nodes = [],
  links = [],
  packets = [],
  inversion = [],
  stack,
  log,
  code,
  info = [],
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
  layout = "safe",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = frame / fps;
  // A start at or before 0 is fully drawn on the cut's first frame (no fade-in from a blank frame).
  const pop = (s: number | undefined, damping = 16) =>
    (s ?? 0) <= 0 ? 1 : spring({ frame: frame - Math.round((s ?? 0) * fps), fps, config: { damping, stiffness: 120 } });
  const shown = (s?: number) => (s ?? 0) <= t;
  const head = pop(0);

  const ink = (tone?: Tone) =>
    tone === "good" ? proColor : tone === "bad" ? conColor : tone === "warn" ? WARN : tone === "muted" ? mutedColor : tone === "neutral" ? textColor : accentColor;
  const tint = (tone?: Tone) =>
    tone === "good" ? "#D7F0DD" : tone === "bad" ? "#F9D5D8" : tone === "warn" ? "#FBE3CC" : tone === "muted" || tone === "neutral" ? "#E8E8ED" : "#CFE2F8";

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };
  const panel: React.CSSProperties = {
    background: "rgba(255,255,255,0.7)",
    borderRadius: 24,
    border: "2px solid rgba(0,0,0,0.06)",
    padding: "16px 20px",
  };

  const st = [...status].reverse().find((s) => t >= s.atSeconds && (s.untilSeconds === undefined || t < s.untilSeconds));

  // ------------------------------------------------------------------ diagram geometry
  const W = 1000;
  const H = canvasHeight;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const size = (n: RtNode): [number, number] => {
    if (n.kind === "task") return [n.w ?? 250, 128];
    if (n.kind === "isr") return [n.w ?? 190, 104];
    if (n.kind === "queue") return [n.w ?? 64 * (n.slots ?? 5) + 24, 112];
    if (n.kind === "sema") return [n.w ?? Math.max(170, 58 * (n.max ?? 1) + 40), 112];
    if (n.kind === "mutex") return [n.w ?? 190, 180];
    return [n.w ?? 96 * (n.bits?.length ?? 2) + 24, 112];
  };
  /** Point on the border of node n's box in the direction of (dx, dy) from its centre, plus a small gap. */
  const edge = (n: RtNode, dx: number, dy: number) => {
    const [w, h] = size(n);
    const sx = dx === 0 ? Infinity : (w / 2 + 10) / Math.abs(dx);
    const sy = dy === 0 ? Infinity : (h / 2 + 10) / Math.abs(dy);
    const s = Math.min(sx, sy);
    return [n.x + dx * s, n.y + dy * s];
  };
  const curve = (a: RtNode, b: RtNode, bend = 0) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * bend;
    const cy = my + (dx / len) * bend;
    const [x0, y0] = edge(a, cx - a.x, cy - a.y);
    const [x1, y1] = edge(b, cx - b.x, cy - b.y);
    return { x0, y0, x1, y1, cx, cy };
  };
  const qpt = (c: ReturnType<typeof curve>, u: number) => [
    (1 - u) * (1 - u) * c.x0 + 2 * (1 - u) * u * c.cx + u * u * c.x1,
    (1 - u) * (1 - u) * c.y0 + 2 * (1 - u) * u * c.cy + u * u * c.y1,
  ];

  const stateLook = (s: RtState["state"]) =>
    s === "run"
      ? { pill: "đang chạy", tone: "good" as Tone }
      : s === "ready"
        ? { pill: "sẵn sàng", tone: "warn" as Tone }
        : s === "blocked"
          ? { pill: "đang chờ", tone: "muted" as Tone }
          : { pill: "xong", tone: "neutral" as Tone };

  const drawNode = (n: RtNode) => {
    const [w, h] = size(n);
    const x = n.x - w / 2;
    const y = n.y - h / 2;
    const k = pop(n.atSeconds);
    const vis = shown(n.atSeconds) ? k : 0;
    const scale = interpolate(k, [0, 1], [0.9, 1]);
    const tf = `translate(${n.x} ${n.y}) scale(${scale}) translate(${-n.x} ${-n.y})`;

    if (n.kind === "task") {
      const s = n.states ? step(n.states, t) : undefined;
      const look = s ? stateLook(s.state) : undefined;
      const blocked = s?.state === "blocked";
      const pr = n.prio ? step(n.prio, t) : undefined;
      const fill = s?.state === "run" ? "#FFFFFF" : blocked ? "rgba(255,255,255,0.55)" : "#FFFFFF";
      const stroke = s?.state === "run" ? proColor : blocked ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.14)";
      return (
        <g key={n.id} opacity={vis} transform={tf}>
          <rect x={x + 3} y={y + 7} width={w} height={h} rx={22} fill="rgba(16,24,40,0.08)" />
          <rect x={x} y={y} width={w} height={h} rx={22} fill={fill} stroke={stroke} strokeWidth={s?.state === "run" ? 4 : 3} strokeDasharray={blocked ? "12 9" : undefined} />
          <text x={n.x} y={y + (n.sub ? 52 : 64)} textAnchor="middle" fontSize={Math.min(42, (w - 28) / (n.label.length * 0.56))} fontWeight={700} fill={blocked ? mutedColor : textColor} letterSpacing="-0.01em">
            {n.label}
          </text>
          {n.sub && (
            <text x={n.x} y={y + 90} textAnchor="middle" fontSize={Math.min(29, (w - 24) / (n.sub.length * 0.62))} fontWeight={500} fill={mutedColor} fontFamily={MONO} style={NOLIG}>
              {n.sub}
            </text>
          )}
          {look && (
            <g>
              <rect x={n.x - Math.max(100, w / 2 - 8)} y={y + h - 12} width={Math.max(200, w - 16)} height={50} rx={25} fill={tint(look.tone)} />
              <text x={n.x} y={y + h + 22} textAnchor="middle" fontSize={Math.min(29, Math.max(200, w - 16) / ((s?.text ?? look.pill).length * 0.55))} fontWeight={600} fill={ink(look.tone)}>
                {s?.text ?? look.pill}
              </text>
            </g>
          )}
          {pr && (
            <g>
              <rect x={x + w - 64} y={y - 22} width={84} height={46} rx={23} fill={ink(pr.tone ?? "neutral")} />
              <text x={x + w - 22} y={y + 10} textAnchor="middle" fontSize={26} fontWeight={700} fill="#FFFFFF">
                {pr.text}
              </text>
            </g>
          )}
        </g>
      );
    }

    if (n.kind === "isr") {
      return (
        <g key={n.id} opacity={vis} transform={tf}>
          <rect x={x} y={y} width={w} height={h} rx={20} fill="#FBE3CC" stroke={WARN} strokeWidth={3} />
          <path d={`M ${x + 46} ${y + 18} L ${x + 26} ${y + 58} L ${x + 44} ${y + 58} L ${x + 34} ${y + 88} L ${x + 62} ${y + 44} L ${x + 44} ${y + 44} Z`} fill={WARN} />
          <text x={x + 76} y={y + (n.sub ? 50 : 64)} fontSize={34} fontWeight={700} fill={WARN}>
            {n.label}
          </text>
          {n.sub && (
            <text x={x + 76} y={y + 84} fontSize={24} fontWeight={500} fill={WARN}>
              {n.sub}
            </text>
          )}
        </g>
      );
    }

    const title = (
      <text x={n.x} y={n.kind === "mutex" ? y + h + 34 : y - 16} textAnchor="middle" fontSize={30} fontWeight={600} fill={bodyColor}>
        {n.label}
        {n.sub ? <tspan fill={mutedColor} fontWeight={400}>{`  ${n.sub}`}</tspan> : null}
      </text>
    );

    if (n.kind === "queue") {
      const slots = n.slots ?? 5;
      const inside = (n.items ?? []).filter((it) => it.inAt <= t && (it.outAt === undefined || t < it.outAt)).sort((a, b) => a.inAt - b.inAt);
      const sw = (w - 24) / slots;
      return (
        <g key={n.id} opacity={vis} transform={tf}>
          {title}
          <rect x={x} y={y} width={w} height={h} rx={20} fill="#FFFFFF" stroke="rgba(0,0,0,0.16)" strokeWidth={3} />
          {Array.from({ length: slots }).map((_, i) => (
            <rect key={i} x={x + 12 + i * sw + 4} y={y + 14} width={sw - 8} height={h - 28} rx={12} fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.10)" strokeWidth={2} />
          ))}
          {inside.slice(0, slots).map((it, i) => {
            const e = pop(it.inAt, 18);
            const cx = x + 12 + i * sw + sw / 2;
            return (
              <g key={it.label + it.inAt} transform={`translate(${cx} ${n.y}) scale(${interpolate(e, [0, 1], [0.6, 1])}) translate(${-cx} ${-n.y})`}>
                <rect x={x + 12 + i * sw + 8} y={y + 20} width={sw - 16} height={h - 40} rx={10} fill={accentColor} />
                <text x={cx} y={n.y + 11} textAnchor="middle" fontSize={sw > 70 ? 30 : 26} fontWeight={700} fill="#FFFFFF" fontFamily={MONO}>
                  {it.label}
                </text>
              </g>
            );
          })}
          <text x={x + w - 6} y={y + h + 36} textAnchor="end" fontSize={27} fontWeight={500} fill={mutedColor}>
            {`${inside.length}/${slots} ô`}
          </text>
        </g>
      );
    }

    if (n.kind === "sema") {
      const max = n.max ?? 1;
      const avail = Math.round(lin(n.tokens ?? [[0, max]], t));
      const gap = (w - 24) / max;
      return (
        <g key={n.id} opacity={vis} transform={tf}>
          {title}
          <rect x={x} y={y} width={w} height={h} rx={20} fill="#FFFFFF" stroke="rgba(0,0,0,0.16)" strokeWidth={3} />
          {Array.from({ length: max }).map((_, i) => {
            const cx = x + 12 + gap * i + gap / 2;
            const on = i < avail;
            return <circle key={i} cx={cx} cy={n.y} r={Math.min(30, gap / 2 - 6)} fill={on ? accentColor : "transparent"} stroke={on ? accentColor : "rgba(0,0,0,0.25)"} strokeWidth={3} strokeDasharray={on ? undefined : "7 6"} />;
          })}
          <text x={n.x} y={y + h + 36} textAnchor="middle" fontSize={27} fontWeight={500} fill={mutedColor}>
            {`còn ${avail}/${max} thẻ`}
          </text>
        </g>
      );
    }

    if (n.kind === "mutex") {
      const ow = n.owners ? step(n.owners, t) : undefined;
      const owner = ow?.owner ?? null;
      const locked = owner !== null;
      const col = locked ? accentColor : mutedColor;
      const by = y + 52;
      return (
        <g key={n.id} opacity={vis} transform={tf}>
          {title}
          <path
            d={locked ? `M ${n.x - 26} ${by} L ${n.x - 26} ${by - 22} A 26 26 0 0 1 ${n.x + 26} ${by - 22} L ${n.x + 26} ${by}` : `M ${n.x - 26} ${by - 12} L ${n.x - 26} ${by - 34} A 26 26 0 0 1 ${n.x + 26} ${by - 34} L ${n.x + 26} ${by - 26}`}
            fill="none"
            stroke={col}
            strokeWidth={10}
            strokeLinecap="round"
          />
          <rect x={n.x - 44} y={by} width={88} height={70} rx={14} fill={col} />
          <circle cx={n.x} cy={by + 30} r={9} fill="#FFFFFF" />
          <rect x={n.x - 4} y={by + 32} width={8} height={20} rx={3} fill="#FFFFFF" />
          <rect x={n.x - 92} y={by + 80} width={184} height={46} rx={23} fill={locked ? tint("accent") : "#E8E8ED"} />
          <text x={n.x} y={by + 112} textAnchor="middle" fontSize={28} fontWeight={600} fill={locked ? accentColor : mutedColor}>
            {locked ? `chủ: ${owner}` : "trống"}
          </text>
        </g>
      );
    }

    // bits
    const bits = n.bits ?? [];
    const bw = (w - 24) / Math.max(1, bits.length);
    return (
      <g key={n.id} opacity={vis} transform={tf}>
        {title}
        <rect x={x} y={y} width={w} height={h} rx={20} fill="#FFFFFF" stroke="rgba(0,0,0,0.16)" strokeWidth={3} />
        {bits.map((b, i) => {
          const on = b.setAt !== undefined && b.setAt <= t && (b.clearAt === undefined || t < b.clearAt);
          const e = on ? pop(b.setAt, 14) : 0;
          const bx = x + 12 + i * bw;
          return (
            <g key={i}>
              <rect x={bx + 5} y={y + 12} width={bw - 10} height={h - 24} rx={12} fill={on ? accentColor : "rgba(0,0,0,0.04)"} stroke={on ? accentColor : "rgba(0,0,0,0.12)"} strokeWidth={2} opacity={on ? 0.4 + 0.6 * e : 1} />
              <text x={bx + bw / 2} y={n.y + 14} textAnchor="middle" fontSize={40} fontWeight={700} fill={on ? "#FFFFFF" : mutedColor} fontFamily={MONO}>
                {on ? "1" : "0"}
              </text>
              <text x={bx + bw / 2} y={y + h + 36} textAnchor="middle" fontSize={Math.min(27, (bw - 6) / (b.label.length * 0.55))} fontWeight={600} fill={on ? accentColor : mutedColor}>
                {b.label}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const drawLink = (l: RtLink, i: number) => {
    const a = byId[l.from];
    const b = byId[l.to];
    if (!a || !b) return null;
    if (!shown(l.atSeconds) || (l.untilSeconds !== undefined && t >= l.untilSeconds)) return null;
    const c = curve(a, b, l.bend ?? 0);
    const kind = l.kind ?? "flow";
    const col = l.tone ? ink(l.tone) : kind === "hold" ? accentColor : kind === "want" ? conColor : "#8E8E93";
    const grow = (l.atSeconds ?? 0) <= 0 ? 1 : interpolate(t, [l.atSeconds!, l.atSeconds! + 0.45], [0, 1], clamp);
    const d = `M ${c.x0} ${c.y0} Q ${c.cx} ${c.cy} ${c.x1} ${c.y1}`;
    const L = Math.hypot(c.x1 - c.x0, c.y1 - c.y0) * 1.15 + 20;
    const [ex, ey] = qpt(c, 0.999);
    const [px, py] = qpt(c, 0.96);
    const ang = Math.atan2(ey - py, ex - px);
    const head = kind !== "hold";
    const [mx, my] = qpt(c, 0.5);
    return (
      <g key={`l${i}`}>
        <path d={d} fill="none" stroke={col} strokeWidth={kind === "hold" ? 8 : 6} strokeLinecap="round" strokeDasharray={kind === "want" ? `16 12` : `${L} ${L}`} strokeDashoffset={kind === "want" ? -t * 40 : L * (1 - grow)} opacity={kind === "want" ? grow : 1} />
        {head && grow > 0.9 && (
          <path d={`M ${ex} ${ey} L ${ex - 26 * Math.cos(ang - 0.45)} ${ey - 26 * Math.sin(ang - 0.45)} L ${ex - 26 * Math.cos(ang + 0.45)} ${ey - 26 * Math.sin(ang + 0.45)} Z`} fill={col} />
        )}
        {l.label && grow > 0.6 && (
          <g opacity={interpolate(grow, [0.6, 1], [0, 1])}>
            <rect x={mx - (l.label.length * 13 + 20) / 2} y={my - 22} width={l.label.length * 13 + 20} height={44} rx={22} fill="#FFFFFF" stroke={col} strokeWidth={2} />
            <text x={mx} y={my + 9} textAnchor="middle" fontSize={25} fontWeight={600} fill={col}>
              {l.label}
            </text>
          </g>
        )}
      </g>
    );
  };

  const drawPacket = (p: RtPacket, i: number) => {
    const a = byId[p.from];
    const b = byId[p.to];
    const dur = p.seconds ?? 0.6;
    if (!a || !b || t < p.atSeconds || t > p.atSeconds + dur) return null;
    const u = interpolate(t, [p.atSeconds, p.atSeconds + dur], [0, 1], clamp);
    const c = curve(a, b, 0);
    const [x, y] = qpt(c, u);
    const w = Math.max(54, p.label.length * 19 + 26);
    const col = p.tone ? ink(p.tone) : accentColor;
    return (
      <g key={`p${i}`}>
        <rect x={x - w / 2} y={y - 26} width={w} height={52} rx={26} fill={col} />
        <text x={x} y={y + 10} textAnchor="middle" fontSize={28} fontWeight={700} fill="#FFFFFF" fontFamily={MONO}>
          {p.label}
        </text>
      </g>
    );
  };

  const diagramView = () => (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
      {links.map(drawLink)}
      {nodes.map(drawNode)}
      {packets.map(drawPacket)}
    </svg>
  );

  // ------------------------------------------------------------------ inversion view
  const laneCol = (tone?: Tone) => ink(tone ?? "accent");
  const inversionView = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {inversion.map((pn, pi) => {
        const units = pn.units ?? 12;
        const k = pop(pn.atSeconds);
        const track: [number, number][] = Array.isArray(pn.sweep[0])
          ? (pn.sweep as [number, number][])
          : [[(pn.sweep as [number, number])[0], 0], [(pn.sweep as [number, number])[1], units]];
        const head = lin(track, t);
        const sweepEnd = track[track.length - 1][0];
        const LW = 150;
        const TW = 1000 - LW - 20;
        const ux = TW / units;
        const LH = 66;
        const top = 8;
        const marks = pn.marks ?? [];
        // A mark closer than 2.4 units to the previous one drops to a second label row.
        const rows = marks.map((m, i) => (i > 0 && Math.abs(m.x - marks[i - 1].x) < 2.4 ? 1 : 0));
        const svgH = top + pn.lanes.length * (LH + 12) + (rows.some((r) => r) ? 82 : 50);
        const vAt = pn.verdict?.atSeconds ?? sweepEnd;
        const done = t >= vAt;
        return (
          <div key={pi} style={{ ...panel, padding: "14px 18px 12px", opacity: shown(pn.atSeconds) ? k : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 34, fontWeight: 700, color: pn.tone ? ink(pn.tone) : textColor, letterSpacing: "-0.012em" }}>{pn.title}</div>
              {pn.verdict && (
                <div style={{ fontSize: 28, fontWeight: 600, padding: "6px 18px", borderRadius: 999, background: tint(pn.verdict.tone), color: ink(pn.verdict.tone), opacity: done ? pop(vAt) : 0 }}>
                  {pn.verdict.text}
                </div>
              )}
            </div>
            <svg viewBox={`0 0 1000 ${svgH}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
              {pn.lanes.map((ln, li) => {
                const y = top + li * (LH + 12);
                return (
                  <g key={li}>
                    <text x={0} y={y + 32} fontSize={30} fontWeight={700} fill={laneCol(ln.tone)}>
                      {ln.label}
                    </text>
                    {ln.detail && (
                      <text x={0} y={y + 60} fontSize={22} fontWeight={500} fill={mutedColor}>
                        {ln.detail}
                      </text>
                    )}
                    <rect x={LW} y={y} width={TW} height={LH} rx={14} fill="rgba(0,0,0,0.035)" />
                  </g>
                );
              })}
              {pn.blocks.map((b, bi) => {
                if (head <= b.x0) return null;
                const x1 = Math.min(b.x1, head);
                const y = top + b.lane * (LH + 12);
                const col = laneCol(pn.lanes[b.lane]?.tone);
                const bx = LW + b.x0 * ux;
                const bw = (x1 - b.x0) * ux;
                const kind = b.kind ?? "run";
                const full = (b.x1 - b.x0) * ux;
                const fits = b.label && (b.label.length * 15 + 20 <= full);
                return (
                  <g key={bi}>
                    {kind === "wait" ? (
                      <rect x={bx + 2} y={y + 4} width={Math.max(0, bw - 4)} height={LH - 8} rx={12} fill="transparent" stroke={col} strokeWidth={3} strokeDasharray="10 8" />
                    ) : (
                      <>
                        <rect x={bx} y={y} width={bw} height={LH} rx={12} fill={col} />
                        {kind === "boost" &&
                          Array.from({ length: Math.ceil(bw / 26) }).map((_, si) => (
                            <line key={si} x1={bx + si * 26} y1={y + LH} x2={Math.min(bx + bw, bx + si * 26 + 22)} y2={y + LH - Math.min(LH, (Math.min(bx + bw, bx + si * 26 + 22) - (bx + si * 26)) * 3)} stroke="rgba(255,255,255,0.45)" strokeWidth={6} />
                          ))}
                      </>
                    )}
                    {fits && x1 >= b.x1 - 0.01 && (
                      <text x={bx + full / 2} y={y + LH / 2 + 9} textAnchor="middle" fontSize={25} fontWeight={700} fill={kind === "wait" ? col : "#FFFFFF"}>
                        {b.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {marks.map((m, mi) => {
                if (head < m.x) return null;
                const x = LW + m.x * ux;
                const yb = top + pn.lanes.length * (LH + 12);
                const col = ink(m.tone ?? "neutral");
                const anchor = m.x > units * 0.8 ? "end" : m.x < units * 0.2 ? "start" : "middle";
                return (
                  <g key={mi}>
                    <line x1={x} y1={top - 4} x2={x} y2={yb - 4 + rows[mi] * 32} stroke={col} strokeWidth={3} strokeDasharray="6 6" />
                    <text x={x} y={yb + 30 + rows[mi] * 32} textAnchor={anchor} fontSize={24} fontWeight={600} fill={col}>
                      {m.label}
                    </text>
                  </g>
                );
              })}
              {head > 0 && head < units && <line x1={LW + head * ux} y1={top - 6} x2={LW + head * ux} y2={top + pn.lanes.length * (LH + 12) - 6} stroke={textColor} strokeWidth={3} />}
            </svg>
          </div>
        );
      })}
    </div>
  );

  // ------------------------------------------------------------------ stack view
  const stackView = () => {
    if (!stack) return null;
    const sz = lin(stack.size, t);
    const max = Math.max(...stack.size.map((s) => s[1]));
    // High-water mark: peak of the usage track up to now (sampled at 1/fps).
    let peak = 0;
    for (let f = 0; f <= frame; f += 1) peak = Math.max(peak, lin(stack.used, f / fps));
    const used = lin(stack.used, t);
    const k = pop(stack.atSeconds);
    const BH = 470;
    const BW = 210;
    const scale = BH / max;
    const top = 30 + (max - sz) * scale;
    const freeMin = Math.max(0, sz - peak);
    const lab = stack.labels ?? {};
    const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");
    const row = (label: string, value: string, tone?: Tone, big = false) => (
      <div style={{ ...panel, padding: "12px 18px", background: tone ? tint(tone) : panel.background }}>
        <div style={{ fontSize: 26, color: mutedColor, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: big ? 64 : 44, fontWeight: 700, letterSpacing: "-0.02em", color: tone ? ink(tone) : textColor, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>
    );
    return (
      <div style={{ display: "flex", gap: 26, alignItems: "stretch", opacity: shown(stack.atSeconds) ? k : 0 }}>
        <svg viewBox={`0 0 ${BW + 150} ${BH + 70}`} style={{ width: 340, flex: "0 0 340px", display: "block", overflow: "visible" }}>
          <text x={BW / 2 + 10} y={18} textAnchor="middle" fontSize={24} fontWeight={600} fill={mutedColor}>
            {stack.title ?? "stack của task"}
          </text>
          <rect x={10} y={top} width={BW} height={BH + 30 - top} rx={18} fill="#FFFFFF" stroke="rgba(0,0,0,0.22)" strokeWidth={3} />
          {/* usage grows from the bottom (stack base at the bottom of the drawing) */}
          <rect x={14} y={BH + 26 - used * scale} width={BW - 8} height={Math.max(0, used * scale)} rx={14} fill={used > sz ? conColor : accentColor} opacity={0.85} />
          {/* high-water mark */}
          <line x1={0} y1={BH + 26 - peak * scale} x2={BW + 20} y2={BH + 26 - peak * scale} stroke={conColor} strokeWidth={5} />
          <text x={BW + 28} y={BH + 26 - peak * scale + 9} fontSize={26} fontWeight={700} fill={conColor}>
            đỉnh
          </text>
          <text x={BW + 28} y={top + 22} fontSize={24} fontWeight={600} fill={mutedColor}>
            {fmt(sz)}
          </text>
          <text x={BW + 28} y={BH + 30} fontSize={24} fontWeight={600} fill={mutedColor}>
            0
          </text>
        </svg>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
          {row(lab.size ?? "Cấp khi tạo task", `${fmt(sz)} byte`)}
          {row(lab.used ?? "Dùng nhiều nhất", `${fmt(peak)} byte`, "neutral")}
          {row(lab.free ?? "uxTaskGetStackHighWaterMark", `${fmt(freeMin)} byte`, freeMin < 300 ? "bad" : "accent", true)}
        </div>
      </div>
    );
  };

  // ------------------------------------------------------------------ panels
  const logPanel = () => {
    if (!log) return null;
    const k = pop(log.atSeconds);
    const lines = log.lines.filter((l) => shown(l.atSeconds));
    return (
      <div style={{ ...panel, background: "#FFFFFF", padding: "14px 18px", opacity: shown(log.atSeconds) ? k : 0 }}>
        {log.title && <div style={{ fontSize: 24, fontWeight: 600, color: mutedColor, marginBottom: 8 }}>{log.title}</div>}
        <div style={{ fontFamily: MONO, ...NOLIG, fontSize: log.fontSize ?? 22, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.tone ? ink(l.tone) : bodyColor, opacity: pop(l.atSeconds, 20) }}>
              {l.text || " "}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const codePanel = () => {
    if (!code) return null;
    const k = pop(code.atSeconds);
    return (
      <div style={{ ...panel, background: "#FFFFFF", padding: "14px 18px", opacity: shown(code.atSeconds) ? k : 0 }}>
        {code.title && <div style={{ fontSize: 24, fontWeight: 600, color: mutedColor, marginBottom: 8 }}>{code.title}</div>}
        <div style={{ fontFamily: MONO, ...NOLIG, fontSize: code.fontSize ?? 23, lineHeight: 1.5, whiteSpace: "pre", overflow: "hidden" }}>
          {code.lines.map((ln, i) => {
            const hl = (code.highlight ?? []).find((h) => i >= h.from && i <= h.to && t >= h.atSeconds && (h.untilSeconds === undefined || t < h.untilSeconds));
            const e = hl ? pop(hl.atSeconds, 20) : 0;
            return (
              <div key={i} style={{ color: hl ? textColor : bodyColor, background: hl ? `rgba(${hl.tone === "bad" ? "215,0,21" : hl.tone === "good" ? "29,122,52" : "0,102,204"},${0.13 * e})` : "transparent", borderRadius: 8, padding: "0 8px", fontWeight: hl ? 600 : 400 }}>
                {ln || " "}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        ...NOLIG,
        padding: portrait ? (layout === "centered" ? "230px 110px 300px 110px" : "230px 160px 300px 88px") : "100px 140px",
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

      <div style={{ ...card, padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
        {view === "diagram" && nodes.length > 0 && diagramView()}
        {view === "inversion" && inversionView()}
        {view === "stack" && stackView()}

        {codePanel()}
        {logPanel()}

        {info.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: info.length > 2 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12 }}>
            {info.map((c, i) => {
              const v = pop(c.atSeconds);
              return (
                <div key={i} style={{ ...panel, padding: "12px 16px", opacity: shown(c.atSeconds) ? v : 0, background: c.tone && c.tone !== "neutral" ? tint(c.tone) : panel.background }}>
                  <div style={{ fontSize: 26, color: mutedColor, fontWeight: 600 }}>{c.label}</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: c.tone && c.tone !== "neutral" ? ink(c.tone) : textColor, lineHeight: 1.2 }}>{c.value}</div>
                </div>
              );
            })}
          </div>
        )}

        {st && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ fontSize: 34, fontWeight: 600, padding: "10px 26px", borderRadius: 999, background: tint(st.tone), color: ink(st.tone), textAlign: "center" }}>{st.text}</div>
          </div>
        )}

        {caption && (
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, padding: "0 8px", opacity: pop(captionAtSeconds) }}>
            {caption}
          </div>
        )}
      </div>

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {points.map((pt, i) => {
            const p = pop(pt.atSeconds ?? 1.5 + i * 0.6);
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: shown(pt.atSeconds ?? 1.5 + i * 0.6) ? p : 0, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}>
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
