import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted" | "warn";

export interface RbBadge {
  text: string;
  tone?: Tone;
  atSeconds?: number;
  untilSeconds?: number;
}

export interface RbNode {
  id: string;
  label: string;
  sub?: string;
  /** Icon drawn in the node box. */
  kind?: "master" | "sensor" | "meter" | "pc" | "device";
  /** Centre of the node in diagram units (width 1000). */
  x: number;
  /** Address pill in the node's corner (e.g. "ID 1"); a list switches text over time. */
  addr?: string | { atSeconds: number; text: string }[];
  /** Meter screen text (kind meter). */
  screen?: string;
  badges?: RbBadge[];
  atSeconds?: number;
  untilSeconds?: number;
  /** [[start, end]] windows when the node box is outlined in the accent colour. */
  highlight?: [number, number][];
}

export interface RbPacket {
  from: string;
  to: string;
  atSeconds: number;
  /** Travel time along the bus (default 0.9 s). */
  seconds?: number;
  label: string;
  tone?: Tone;
}

export interface RbGroup {
  /** Byte index range, inclusive. */
  from: number;
  to: number;
  label: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface RbFrame {
  title: string;
  /** Space-separated hex bytes, e.g. "01 04 00 01 00 02 20 0B". */
  bytes: string;
  groups?: RbGroup[];
  /** Dashed "silence" box after the last byte. */
  gap?: { label: string; atSeconds?: number };
  decode?: { text: string; atSeconds?: number; tone?: Tone }[];
  /** Bytes type in one by one from this time over `revealSeconds` (default 0.8 s). */
  atSeconds?: number;
  untilSeconds?: number;
  revealSeconds?: number;
}

export interface RbTag {
  text: string;
  x: number;
  y: number;
  tone?: Tone;
  fontSize?: number;
  atSeconds?: number;
  untilSeconds?: number;
}

interface Rs485BusProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  nodes?: RbNode[];
  /** Draw the twisted pair in from this time (default: drawn from frame 0). */
  busAtSeconds?: number;
  /** Bus wire labels (default A / B). */
  wireLabels?: [string, string];
  terminators?: { side: "left" | "right"; label?: string; atSeconds?: number }[];
  ground?: { label?: string; atSeconds?: number };
  /** [[start, end]] windows of interference hitting the cable. */
  noise?: [number, number][];
  packets?: RbPacket[];
  /** Small "length" bracket under the bus. */
  span?: { text: string; atSeconds?: number };
  tags?: RbTag[];
  diagramHeight?: number;
  frames?: RbFrame[];
  status?: { atSeconds: number; untilSeconds?: number; text: string; tone?: Tone }[];
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
const WIRE_A = "#0066CC";
const WIRE_B = "#C25E00";
const WARN = "#B25000";

/**
 * RS-485 multi-drop bus with Modbus RTU frames: nodes hang off a twisted pair (A / B) with 120 ohm terminators at both
 * ends and a common ground, labelled packets glide between nodes, interference flickers on the cable, and a frame card
 * spells out request / response bytes with their fields (address, function, register, count, CRC) and decoded values.
 */
export const Rs485Bus: React.FC<Rs485BusProps> = ({
  name,
  eyebrow,
  tagline,
  nodes = [],
  busAtSeconds,
  wireLabels = ["A", "B"],
  terminators = [],
  ground,
  noise = [],
  packets = [],
  span,
  tags = [],
  diagramHeight = 560,
  frames = [],
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
  layout = "centered",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = frame / fps;
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  // A start at or before frame 0 is fully drawn on the cut's first frame (no fade-in from a blank frame).
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const life = (from?: number, until?: number) => {
    const a = from === undefined ? 1 : pop(at(from, 0));
    const b = until === undefined ? 1 : 1 - interpolate(frame, [at(until, 0), at(until, 0) + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return Math.min(a, b);
  };
  const toneColor = (tone?: Tone) =>
    tone === "accent" ? accentColor : tone === "good" ? proColor : tone === "bad" ? conColor : tone === "muted" ? mutedColor : tone === "warn" ? WARN : textColor;
  const head = pop(0, 18);

  // ------------------------------------------------------------------ bus geometry
  const H = diagramHeight;
  const BUS_Y = H - 150;
  const X0 = 40;
  const X1 = 960;
  const busDraw = busAtSeconds === undefined || busAtSeconds <= 0 ? 1 : interpolate(t, [busAtSeconds, busAtSeconds + 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const busEnd = X0 + (X1 - X0) * busDraw;
  const noiseOn = noise.some(([s, e]) => t >= s && t < e);
  const jitter = (k: number) => (noiseOn ? Math.sin(frame * 2.3 + k * 1.7) * 7 : 0);
  const twisted = (sign: 1 | -1) => {
    let d = "";
    for (let x = X0; x <= busEnd; x += 6) {
      const y = BUS_Y + sign * 11 * Math.sin(((x - X0) / 44) * Math.PI) + jitter(x / 50);
      d += `${d ? " L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // ------------------------------------------------------------------ node icons
  const icon = (n: RbNode, cx: number, cy: number) => {
    if (n.kind === "master") {
      return (
        <g>
          <rect x={cx - 92} y={cy - 34} width={104} height={68} rx={8} fill="#2C2C2E" />
          <rect x={cx - 74} y={cy - 22} width={68} height={44} rx={4} fill="#5A5A5E" />
          <text x={cx - 40} y={cy + 8} textAnchor="middle" fontSize={17} fontWeight={700} fill="#FFFFFF">S3</text>
          <rect x={cx + 22} y={cy - 26} width={70} height={52} rx={6} fill="#1F6FB2" />
          <rect x={cx + 40} y={cy - 12} width={34} height={24} rx={3} fill="#2C2C2E" />
          <line x1={cx + 12} y1={cy} x2={cx + 22} y2={cy} stroke="#8E9298" strokeWidth={4} />
        </g>
      );
    }
    if (n.kind === "sensor") {
      return (
        <g>
          <rect x={cx - 60} y={cy - 38} width={120} height={76} rx={14} fill="#F2F2F4" stroke="#C7C7CC" strokeWidth={3} />
          <rect x={cx - 10} y={cy - 30} width={20} height={44} rx={10} fill="#FFFFFF" stroke="#8E9298" strokeWidth={3} />
          <circle cx={cx} cy={cy + 20} r={13} fill={conColor} />
          <rect x={cx - 4} y={cy - 6} width={8} height={24} fill={conColor} />
          <path d={`M ${cx + 30} ${cy - 20} q 10 14 0 24 q -10 -10 0 -24 z`} fill="#4A9BE8" />
        </g>
      );
    }
    if (n.kind === "meter") {
      return (
        <g>
          <rect x={cx - 62} y={cy - 42} width={124} height={84} rx={10} fill="#F2F2F4" stroke="#C7C7CC" strokeWidth={3} />
          <rect x={cx - 50} y={cy - 32} width={100} height={38} rx={4} fill="#C9E7C3" stroke="#7FA777" strokeWidth={2} />
          <text x={cx} y={cy - 5} textAnchor="middle" fontSize={22} fontWeight={700} fill="#1D3A1A" fontFamily={MONO}>
            {n.screen ?? "230.2V"}
          </text>
          <rect x={cx - 44} y={cy + 14} width={88} height={16} rx={4} fill="#D1D1D6" />
        </g>
      );
    }
    if (n.kind === "pc") {
      return (
        <g>
          <rect x={cx - 70} y={cy - 40} width={110} height={68} rx={6} fill="#2C2C2E" />
          <rect x={cx - 62} y={cy - 32} width={94} height={52} rx={3} fill="#E8F1FB" />
          <rect x={cx - 84} y={cy + 28} width={138} height={10} rx={4} fill="#8E9298" />
          <rect x={cx + 52} y={cy - 6} width={36} height={22} rx={5} fill="#1F6FB2" />
          <line x1={cx + 40} y1={cy + 5} x2={cx + 52} y2={cy + 5} stroke="#8E9298" strokeWidth={4} />
        </g>
      );
    }
    return <rect x={cx - 50} y={cy - 34} width={100} height={68} rx={12} fill="#F2F2F4" stroke="#C7C7CC" strokeWidth={3} />;
  };

  const NODE_W = 220;
  const NODE_Y = 30;
  const NODE_H = 250;
  const nodeEls = nodes.map((n) => {
    const v = life(n.atSeconds, n.untilSeconds);
    if (v <= 0.01) return null;
    const lit = (n.highlight ?? []).some(([s, e]) => t >= s && t < e);
    // Packet arrival glow
    const arrived = packets.some((p) => p.to === n.id && t >= p.atSeconds + (p.seconds ?? 0.9) && t < p.atSeconds + (p.seconds ?? 0.9) + 0.7);
    const edge = lit || arrived ? accentColor : "rgba(0,0,0,0.10)";
    const addr = typeof n.addr === "string" ? n.addr : n.addr ? ([...n.addr].reverse().find((a) => t >= a.atSeconds) ?? n.addr[0]).text : undefined;
    const addrStart = Array.isArray(n.addr) ? ([...n.addr].reverse().find((a) => t >= a.atSeconds)?.atSeconds ?? 0) : 0;
    const addrFlash = Array.isArray(n.addr) && addrStart > 0 ? 1 - interpolate(t, [addrStart, addrStart + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
    const x = n.x;
    const boxTop = NODE_Y + (1 - v) * 20;
    return (
      <g key={n.id} opacity={v}>
        {/* Drop to the bus: two short stubs, A and B */}
        <line x1={x - 14} y1={boxTop + NODE_H} x2={x - 14} y2={BUS_Y - 10} stroke={WIRE_A} strokeWidth={5} />
        <line x1={x + 14} y1={boxTop + NODE_H} x2={x + 14} y2={BUS_Y + 10} stroke={WIRE_B} strokeWidth={5} />
        <circle cx={x - 14} cy={BUS_Y - 10} r={7} fill={WIRE_A} />
        <circle cx={x + 14} cy={BUS_Y + 10} r={7} fill={WIRE_B} />
        <rect x={x - NODE_W / 2} y={boxTop} width={NODE_W} height={NODE_H} rx={24} fill="#FFFFFF" stroke={edge} strokeWidth={lit || arrived ? 6 : 3} />
        {icon(n, x, boxTop + 76)}
        <text x={x} y={boxTop + 166} textAnchor="middle" fontSize={30} fontWeight={700} fill={textColor}>
          {n.label}
        </text>
        {n.sub && (
          <text x={x} y={boxTop + 202} textAnchor="middle" fontSize={24} fontWeight={400} fill={mutedColor}>
            {n.sub}
          </text>
        )}
        {addr && (
          <g transform={`translate(${x} ${boxTop + 232})`}>
            <rect x={-62} y={-20} width={124} height={38} rx={19} fill={addrFlash > 0 ? accentColor : "#EEF4FB"} stroke={accentColor} strokeWidth={2} />
            <text x={0} y={9} textAnchor="middle" fontSize={24} fontWeight={700} fill={addrFlash > 0.5 ? "#FFFFFF" : accentColor}>
              {addr}
            </text>
          </g>
        )}
      </g>
    );
  });

  // Badges sit above the bus, under each node.
  const badgeEls = nodes.flatMap((n) =>
    (n.badges ?? []).map((b, i) => {
      const v = Math.min(life(n.atSeconds, n.untilSeconds), life(b.atSeconds, b.untilSeconds));
      if (v <= 0.01) return null;
      const c = toneColor(b.tone);
      const w = b.text.length * 15 + 34;
      return (
        <g key={`${n.id}b${i}`} opacity={v} transform={`translate(${n.x} ${BUS_Y + 70 + i * 48})`}>
          <rect x={-w / 2} y={-22} width={w} height={40} rx={20} fill={c} />
          <text x={0} y={7} textAnchor="middle" fontSize={26} fontWeight={700} fill="#FFFFFF">
            {b.text}
          </text>
        </g>
      );
    }),
  );

  // ------------------------------------------------------------------ terminators, ground, noise, packets
  const termEls = terminators.map((tm, i) => {
    const v = life(tm.atSeconds, undefined);
    if (v <= 0.01) return null;
    const x = tm.side === "left" ? X0 : X1;
    const dir = tm.side === "left" ? 1 : -1;
    return (
      <g key={`tm${i}`} opacity={v} transform={`translate(${x} 0) scale(${0.9 + 0.1 * v})`}>
        <line x1={0} y1={BUS_Y - 11} x2={0} y2={BUS_Y - 46} stroke={WIRE_A} strokeWidth={5} />
        <line x1={0} y1={BUS_Y + 11} x2={0} y2={BUS_Y + 46} stroke={WIRE_B} strokeWidth={5} />
        <rect x={-14} y={BUS_Y - 46} width={28} height={92} rx={6} fill="#F6E7C8" stroke={WARN} strokeWidth={4} />
        <text x={dir * 26} y={BUS_Y - 60} textAnchor={tm.side === "left" ? "start" : "end"} fontSize={28} fontWeight={700} fill={WARN} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
          {tm.label ?? "120 Ω"}
        </text>
      </g>
    );
  });
  const gndV = ground ? life(ground.atSeconds, undefined) : 0;
  const gndY = BUS_Y + 48;
  const gndEl = ground && gndV > 0.01 && (
    <g opacity={gndV}>
      <line x1={X0 + 30} y1={gndY} x2={X0 + 30 + (X1 - X0 - 60) * gndV} y2={gndY} stroke="#3A3A3C" strokeWidth={4} strokeDasharray="14 8" />
      {nodes
        .filter((n) => life(n.atSeconds, n.untilSeconds) > 0.5)
        .map((n) => (
          <line key={`g${n.id}`} x1={n.x + 40} y1={NODE_Y + NODE_H} x2={n.x + 40} y2={gndY} stroke="#3A3A3C" strokeWidth={3} strokeDasharray="8 6" />
        ))}
      <text x={X0 + 30} y={gndY + 38} fontSize={26} fontWeight={700} fill="#3A3A3C" stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
        {ground.label ?? "GND chung"}
      </text>
    </g>
  );
  const noiseEls = noiseOn
    ? [180, 420, 640, 860].map((x, i) => {
        const flick = (Math.sin(frame * 1.9 + i * 2.1) + 1) / 2;
        const xx = x + Math.sin(frame * 0.7 + i) * 30;
        return (
          <path
            key={`n${i}`}
            d={`M ${xx - 10} ${BUS_Y - 95} l 22 32 l -18 6 l 24 40`}
            fill="none"
            stroke={conColor}
            strokeWidth={6}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.35 + 0.65 * flick}
          />
        );
      })
    : null;
  const packetEls = packets.map((p, i) => {
    const a = nodeById[p.from];
    const b = nodeById[p.to];
    if (!a || !b) return null;
    const dur = p.seconds ?? 0.9;
    if (t < p.atSeconds || t > p.atSeconds + dur + 0.35) return null;
    const k = Math.min(1, (t - p.atSeconds) / dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = a.x + (b.x - a.x) * e;
    const fade = t > p.atSeconds + dur ? 1 - (t - p.atSeconds - dur) / 0.35 : Math.min(1, (t - p.atSeconds) / 0.15);
    const c = toneColor(p.tone ?? "accent");
    const w = p.label.length * 16 + 36;
    return (
      <g key={`p${i}`} opacity={Math.max(0, fade)} transform={`translate(${x} ${BUS_Y - 52})`}>
        <rect x={-w / 2} y={-24} width={w} height={44} rx={12} fill={c} />
        <text x={0} y={8} textAnchor="middle" fontSize={26} fontWeight={700} fill="#FFFFFF" fontFamily={MONO}>
          {p.label}
        </text>
      </g>
    );
  });
  const spanV = span ? life(span.atSeconds, undefined) : 0;
  const tagEls = tags.map((tg, i) => {
    const v = life(tg.atSeconds, tg.untilSeconds);
    if (v <= 0.01) return null;
    const fs = tg.fontSize ?? 30;
    const c = toneColor(tg.tone);
    const w = tg.text.length * fs * 0.56 + 40;
    return (
      <g key={`t${i}`} opacity={v} transform={`translate(${tg.x} ${tg.y}) scale(${0.9 + 0.1 * v})`}>
        <rect x={-w / 2} y={-fs * 0.95} width={w} height={fs * 1.6} rx={fs * 0.8} fill="#FFFFFF" stroke={c} strokeWidth={3} />
        <text x={0} y={fs * 0.2} textAnchor="middle" fontSize={fs} fontWeight={700} fill={c}>
          {tg.text}
        </text>
      </g>
    );
  });

  const st = status.filter((s) => t >= s.atSeconds && (s.untilSeconds === undefined || t < s.untilSeconds)).pop();
  const stPop = st ? pop(at(st.atSeconds, 0), 12) : 0;

  // ------------------------------------------------------------------ frame cards
  const frameEls = frames.map((f, fi) => {
    const v = life(f.atSeconds, f.untilSeconds);
    if (v <= 0.01) return null;
    const bytes = f.bytes.trim().split(/\s+/);
    const start = f.atSeconds ?? 0;
    const reveal = f.revealSeconds ?? 0.8;
    const shown = start <= 0 ? bytes.length : Math.floor(interpolate(t, [start, start + reveal], [0, bytes.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) + 0.999);
    const groups = f.groups ?? [];
    const groupOf = (i: number) => groups.findIndex((g) => i >= g.from && i <= g.to && t >= (g.atSeconds ?? start));
    // Byte boxes share the card's inner width (~780 px in portrait) with the silence box.
    const GAPW = 8;
    const BW = Math.min(92, Math.floor((780 - (f.gap ? 170 : 0)) / bytes.length) - GAPW);
    const byteFont = Math.round(Math.min(40, BW * 0.5));
    const gapV = f.gap ? life(f.gap.atSeconds, undefined) : 0;
    const placed: [number, number][][] = [];
    const labelRows = groups.map((g) => {
      const c = ((g.from + g.to + 1) * (BW + GAPW) - GAPW) / 2;
      const half = (g.label.length * 15.5 + 28) / 2;
      let r = 0;
      while ((placed[r] ?? []).some(([a, b]) => c - half < b && c + half > a)) r++;
      (placed[r] = placed[r] ?? []).push([c - half, c + half]);
      return r;
    });
    const labelBand = 76 + Math.max(0, placed.length - 2) * 34;
    return (
      <div key={`f${fi}`} style={{ opacity: v, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 30, fontWeight: 600, color: bodyColor }}>{f.title}</div>
        <div style={{ position: "relative", height: 92 + labelBand }}>
          {bytes.map((b, i) => {
            const gi = groupOf(i);
            const g = gi >= 0 ? groups[gi] : undefined;
            const c = g ? toneColor(g.tone ?? "accent") : "rgba(0,0,0,0.12)";
            const on = i < shown;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: i * (BW + GAPW),
                  top: 0,
                  width: BW,
                  height: 80,
                  borderRadius: 14,
                  background: g ? `${c}1A` : "#FFFFFF",
                  border: `3px solid ${c}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: MONO,
                  fontSize: byteFont,
                  fontWeight: 700,
                  color: g ? c : textColor,
                  opacity: on ? 1 : 0,
                  transform: `translateY(${on ? 0 : 10}px)`,
                }}
              >
                {b}
              </div>
            );
          })}
          {f.gap && gapV > 0.01 && (
            <div
              style={{
                position: "absolute",
                left: bytes.length * (BW + GAPW),
                top: 0,
                height: 80,
                width: 160,
                padding: "0 10px",
                borderRadius: 14,
                border: `3px dashed ${mutedColor}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 600,
                lineHeight: 1.12,
                color: mutedColor,
                textAlign: "center",
                opacity: gapV,
              }}
            >
              {f.gap.label}
            </div>
          )}
          {/* Field brackets and labels; each label takes the first row where it clears the labels already placed */}
          {groups.map((g, gi) => {
            const gv = life(g.atSeconds ?? start, undefined);
            if (gv <= 0.01) return null;
            const c = toneColor(g.tone ?? "accent");
            const left = g.from * (BW + GAPW);
            const w = (g.to - g.from + 1) * (BW + GAPW) - GAPW;
            const row = labelRows[gi];
            return (
              <div key={`g${gi}`} style={{ position: "absolute", left, top: 88, width: w, opacity: gv }}>
                <div style={{ height: 10, borderLeft: `3px solid ${c}`, borderRight: `3px solid ${c}`, borderBottom: `3px solid ${c}`, borderRadius: "0 0 6px 6px" }} />
                <div
                  style={{
                    position: "absolute",
                    top: 14 + row * 34,
                    left: w / 2,
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    fontSize: 25,
                    fontWeight: 700,
                    color: c,
                    textShadow: "0 0 6px #FFFFFF, 0 0 6px #FFFFFF",
                  }}
                >
                  {g.label}
                </div>
              </div>
            );
          })}
        </div>
        {(f.decode ?? []).map((d, di) => {
          const dv = life(d.atSeconds ?? start, undefined);
          if (dv <= 0.01) return null;
          return (
            <div
              key={`d${di}`}
              style={{
                opacity: dv,
                transform: `translateX(${interpolate(dv, [0, 1], [20, 0])}px)`,
                fontFamily: MONO,
                fontSize: 31,
                fontWeight: 600,
                color: d.tone ? toneColor(d.tone) : textColor,
                background: "#FFFFFF",
                border: "2px solid rgba(0,0,0,0.08)",
                borderRadius: 16,
                padding: "8px 18px",
              }}
            >
              {d.text}
            </div>
          );
        })}
      </div>
    );
  });

  const hasDiagram = nodes.length > 0;
  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "230px 120px 300px 120px" : "230px 160px 300px 88px") : "100px 140px",
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

      <div
        style={{
          position: "relative",
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "26px 26px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {st && (
          <div
            style={{
              position: "absolute",
              top: -26,
              right: 30,
              background: toneColor(st.tone),
              color: "#FFFFFF",
              fontSize: 32,
              fontWeight: 700,
              padding: "10px 26px",
              borderRadius: 30,
              opacity: stPop,
              transform: `scale(${0.85 + 0.15 * stPop})`,
              boxShadow: "0 8px 20px rgba(16,24,40,0.15)",
              zIndex: 2,
            }}
          >
            {st.text}
          </div>
        )}
        {hasDiagram && (
          <svg viewBox={`0 0 1000 ${H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
            {gndEl}
            {/* Twisted pair */}
            <path d={twisted(1)} fill="none" stroke={WIRE_A} strokeWidth={7} strokeLinecap="round" />
            <path d={twisted(-1)} fill="none" stroke={WIRE_B} strokeWidth={7} strokeLinecap="round" />
            {busDraw > 0.2 && (
              <g opacity={Math.min(1, (busDraw - 0.2) * 3)}>
                <text x={X0 - 6} y={BUS_Y - 28} textAnchor="start" fontSize={30} fontWeight={800} fill={WIRE_A} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
                  {wireLabels[0]}
                </text>
                <text x={X0 - 6} y={BUS_Y + 50} textAnchor="start" fontSize={30} fontWeight={800} fill={WIRE_B} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
                  {wireLabels[1]}
                </text>
              </g>
            )}
            {termEls}
            {nodeEls}
            {noiseEls}
            {packetEls}
            {badgeEls}
            {span && spanV > 0.01 && (
              <g opacity={spanV}>
                <line x1={X0 + 60} y1={H - 28} x2={X1 - 60} y2={H - 28} stroke={mutedColor} strokeWidth={3} />
                <line x1={X0 + 60} y1={H - 40} x2={X0 + 60} y2={H - 16} stroke={mutedColor} strokeWidth={3} />
                <line x1={X1 - 60} y1={H - 40} x2={X1 - 60} y2={H - 16} stroke={mutedColor} strokeWidth={3} />
                <text x={500} y={H - 40} textAnchor="middle" fontSize={28} fontWeight={600} fill={bodyColor} stroke="#FFFFFF" strokeWidth={8} paintOrder="stroke">
                  {span.text}
                </text>
              </g>
            )}
            {tagEls}
          </svg>
        )}
        {frameEls}
        {caption && (
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, padding: "0 8px", opacity: pop(at(captionAtSeconds, 0)) }}>
            {caption}
          </div>
        )}
      </div>

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div
                key={pt.text + i}
                style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}
              >
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
