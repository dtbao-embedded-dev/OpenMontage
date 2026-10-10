import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted" | "warn";

export interface CanStatus {
  atSeconds: number;
  untilSeconds?: number;
  text: string;
  tone?: Tone;
}

export interface CanByteGroup {
  /** Byte index range, inclusive (0-7). */
  from: number;
  to: number;
  label: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface CanFrameRow {
  /** "tx": ESP32-S3 -> car / bus, "rx": answer coming back. */
  dir: "tx" | "rx";
  /** Row title, e.g. "Hỏi" / "Trả lời". */
  title: string;
  /** CAN ID text, e.g. "0x7DF". */
  id: string;
  /** Space-separated hex data bytes, e.g. "02 01 0C CC CC CC CC CC". */
  bytes: string;
  groups?: CanByteGroup[];
  /** The row types in byte by byte from here over 0.6 s; a packet travels the link at the same time. */
  atSeconds?: number;
}

export interface CanGauge {
  label: string;
  unit: string;
  /** [[seconds, value]] linear. */
  track: [number, number][];
  /** "dial" = round rpm dial (first one only), "tile" = number tile. */
  kind?: "dial" | "tile";
  max?: number;
  decimals?: number;
  atSeconds?: number;
}

export interface CanNode {
  label: string;
  sub?: string;
  /** Centre x in bus units (width 1000). */
  x: number;
  /** Mode pill, e.g. "Gửi" / "Chỉ nghe". */
  mode?: string;
  atSeconds?: number;
}

export interface CanPacket {
  /** Index into `nodes`. */
  from: number;
  atSeconds: number;
  /** Seconds to reach the bus ends (default 0.8). */
  seconds?: number;
  label: string;
  tone?: Tone;
  /** Receivers pull the ACK slot when the frame lands (default true). */
  ack?: boolean;
}

export interface CanPin {
  a: string;
  b: string;
  note?: string;
  atSeconds?: number;
}

export interface CanField {
  label: string;
  /** Bit count shown under the label, e.g. "11 bit". */
  bits: string;
  /** Relative width. */
  w: number;
  tone?: Tone;
  /** [[start, end]] windows when the field is lit. */
  lit?: [number, number][];
}

export interface CanArb {
  /** Two 11-bit IDs as hex, e.g. ["0x100", "0x080"]. */
  ids: [string, string];
  labels?: [string, string];
  atSeconds: number;
  /** Seconds per bit column (default 0.35). */
  bitSeconds?: number;
}

export interface CanAck {
  /** Receivers pull the ACK slot low: green. */
  okAtSeconds?: number;
  /** Single node: nobody acknowledges, red + retry counter. */
  failAtSeconds?: number;
  /** Retries counted per second after the failure (default 2). */
  retryRate?: number;
}

export interface CanObdPin {
  pin: number;
  label: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface CanInfo {
  label: string;
  value: string;
  tone?: Tone;
  atSeconds?: number;
}

interface CanBusProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** car: dongle -> car link, frame rows, gauges. bus: nodes on the pair. frame: bit fields, arbitration, ACK.
   * obd: J1962 socket pinout. */
  view?: "car" | "bus" | "frame" | "obd";
  // car
  frames?: CanFrameRow[];
  gauges?: CanGauge[];
  formula?: { lines: { text: string; atSeconds?: number; tone?: Tone }[]; title?: string; atSeconds?: number };
  // bus
  nodes?: CanNode[];
  packets?: CanPacket[];
  terminators?: { label?: string; atSeconds?: number };
  pins?: CanPin[];
  pinsTitle?: string;
  // frame
  fields?: CanField[];
  arb?: CanArb;
  ack?: CanAck;
  // obd
  obdPins?: CanObdPin[];
  obdPhoto?: { src: string; label?: string };
  info?: CanInfo[];
  status?: CanStatus[];
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
const CANH = "#C25E00";
const CANL = "#0066CC";
const WARN = "#B25000";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const DEFAULT_FIELDS: CanField[] = [
  { label: "SOF", bits: "1", w: 0.7 },
  { label: "ID", bits: "11 bit", w: 2.4 },
  { label: "RTR", bits: "1", w: 0.8 },
  { label: "DLC", bits: "4 bit", w: 1.3 },
  { label: "Dữ liệu", bits: "0–8 byte", w: 3.2 },
  { label: "CRC", bits: "15 bit", w: 1.6 },
  { label: "ACK", bits: "khe", w: 1.1 },
  { label: "EOF", bits: "7", w: 0.9 },
];

const track = (tr: [number, number][], t: number) => {
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

const bits11 = (hex: string) => {
  const v = parseInt(hex.replace(/^0x/i, ""), 16);
  return Array.from({ length: 11 }, (_, i) => (v >> (10 - i)) & 1);
};

/**
 * CAN bus explainer for ESP32 TWAI: a dongle-to-car link with OBD-II request / reply byte rows and an rpm dial, two or
 * more ESP32-S3 + transceiver nodes on a CANH / CANL pair with 120 ohm ends and frames that ripple to every node, the
 * fields of a standard frame with bit-by-bit arbitration and the ACK slot, and the J1962 socket pinout.
 */
export const CanBus: React.FC<CanBusProps> = ({
  name,
  eyebrow,
  tagline,
  view = "car",
  frames = [],
  gauges = [],
  formula,
  nodes = [],
  packets = [],
  terminators,
  pins = [],
  pinsTitle = "Nối dây",
  fields = DEFAULT_FIELDS,
  arb,
  ack,
  obdPins = [],
  obdPhoto,
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

  // ------------------------------------------------------------------ shared drawings
  const espBoard = (x: number, y: number, w: number, h: number, label = "ESP32-S3") => (
    <g>
      <rect x={x + 4} y={y + 8} width={w} height={h} rx={18} fill="rgba(16,24,40,0.12)" />
      <rect x={x} y={y} width={w} height={h} rx={18} fill="#1F2937" />
      <rect x={x + w * 0.2} y={y + h * 0.2} width={w * 0.6} height={h * 0.5} rx={8} fill="#C9CDD3" />
      <text x={x + w / 2} y={y + h * 0.2 + h * 0.25 + 10} textAnchor="middle" fontSize={Math.min(30, w / 6.5)} fontWeight={700} fill="#1D1D1F">
        {label}
      </text>
      {Array.from({ length: Math.floor((w - 30) / 26) }).map((_, j) => (
        <circle key={j} cx={x + 22 + j * 26} cy={y + h - 12} r={5} fill="#D4AF37" />
      ))}
    </g>
  );
  const transceiver = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x + 3} y={y + 6} width={w} height={h} rx={12} fill="rgba(16,24,40,0.12)" />
      <rect x={x} y={y} width={w} height={h} rx={12} fill="#1F5FA8" />
      <rect x={x + w * 0.3} y={y + h * 0.18} width={w * 0.4} height={h * 0.5} rx={4} fill="#202124" />
      <text x={x + w / 2} y={y + h * 0.18 + h * 0.25 + 7} textAnchor="middle" fontSize={17} fontWeight={700} fill="#E8EAED" fontFamily={MONO}>
        VP230
      </text>
      <text x={x + w / 2} y={y + h - 10} textAnchor="middle" fontSize={20} fontWeight={600} fill="#FFFFFF">
        SN65HVD230
      </text>
    </g>
  );

  // ------------------------------------------------------------------ car view
  const carView = () => {
    const live = frames
      .filter((f) => f.atSeconds !== undefined && f.atSeconds > 0 && t >= f.atSeconds && t < f.atSeconds + 0.9)
      .map((f) => ({ dir: f.dir, u: interpolate(t, [f.atSeconds!, f.atSeconds! + 0.8], [0, 1], clamp) }));
    const ecuLit = frames.some((f) => f.dir === "tx" && f.atSeconds !== undefined && t >= f.atSeconds + 0.75 && t < f.atSeconds + 1.6);
    const dial = gauges.find((g) => (g.kind ?? "dial") === "dial");
    const tiles = gauges.filter((g) => g !== dial);
    const L0: [number, number] = [300, 125];
    const L1: [number, number] = [690, 125];
    return (
      <>
        <svg viewBox="0 0 1000 250" style={{ width: "100%", display: "block", overflow: "visible" }}>
          {espBoard(20, 40, 210, 120)}
          {transceiver(150, 150, 150, 80)}
          {/* Cable to the OBD-II socket */}
          <path d={`M ${L0[0]} ${L0[1] + 60} C 420 ${L0[1] + 60}, 420 ${L1[1]}, ${L1[0]} ${L1[1]}`} fill="none" stroke="#3A3A3C" strokeWidth={10} strokeLinecap="round" />
          <rect x={L1[0] - 60} y={L1[1] - 30} width={70} height={60} rx={10} fill="#2C2C2E" />
          <text x={L1[0] - 25} y={L1[1] + 58} textAnchor="middle" fontSize={22} fontWeight={600} fill={mutedColor}>
            OBD-II
          </text>
          {/* Car outline with an ECU inside */}
          <path
            d="M 700 190 L 700 130 Q 712 104 750 98 L 800 56 Q 815 44 840 44 L 905 44 Q 930 44 945 60 L 980 100 Q 995 108 995 130 L 995 190 Z"
            fill="#EAF2FC"
            stroke="#8AA4C2"
            strokeWidth={4}
          />
          <circle cx={760} cy={192} r={28} fill="#2C2C2E" />
          <circle cx={940} cy={192} r={28} fill="#2C2C2E" />
          <circle cx={760} cy={192} r={11} fill="#AEAEB2" />
          <circle cx={940} cy={192} r={11} fill="#AEAEB2" />
          <rect x={808} y={112} width={120} height={56} rx={10} fill={ecuLit ? accentColor : "#FFFFFF"} stroke={ecuLit ? accentColor : "#8AA4C2"} strokeWidth={3} />
          <text x={868} y={148} textAnchor="middle" fontSize={24} fontWeight={700} fill={ecuLit ? "#FFFFFF" : textColor}>
            ECU
          </text>
          {/* Packets on the cable */}
          {live.map((p, i) => {
            const u = p.dir === "tx" ? p.u : 1 - p.u;
            const bx = (1 - u) ** 3 * L0[0] + 3 * (1 - u) ** 2 * u * 420 + 3 * (1 - u) * u * u * 420 + u ** 3 * L1[0];
            const by = (1 - u) ** 3 * (L0[1] + 60) + 3 * (1 - u) ** 2 * u * (L0[1] + 60) + 3 * (1 - u) * u * u * L1[1] + u ** 3 * L1[1];
            return (
              <g key={i}>
                <circle cx={bx} cy={by} r={26} fill={p.dir === "tx" ? accentColor : proColor} opacity={0.22} />
                <circle cx={bx} cy={by} r={14} fill={p.dir === "tx" ? accentColor : proColor} />
              </g>
            );
          })}
        </svg>

        {/* Frame rows */}
        {frames.length > 0 && (
          <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 12, opacity: pop(Math.min(...frames.map((f) => f.atSeconds ?? 0))) }}>
            {frames.map((f, i) => {
              const v = pop(f.atSeconds);
              const bytes = f.bytes.split(/\s+/);
              const typed = (f.atSeconds ?? 0) <= 0 ? bytes.length : Math.floor(interpolate(t, [f.atSeconds!, f.atSeconds! + 0.6], [0, bytes.length], clamp));
              const groupsShown = (f.groups ?? []).filter((g) => shown(g.atSeconds));
              return (
                <div key={i} style={{ opacity: v, transform: `translateY(${interpolate(v, [0, 1], [12, 0])}px)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: f.dir === "tx" ? accentColor : proColor, minWidth: 120 }}>{f.title}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: MONO, padding: "2px 14px", borderRadius: 999, background: f.dir === "tx" ? "#CFE2F8" : "#D7F0DD", color: textColor }}>
                      ID {f.id}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
                    {bytes.map((b, j) => {
                      const g = groupsShown.find((gg) => j >= gg.from && j <= gg.to);
                      return (
                        <div
                          key={j}
                          style={{
                            fontFamily: MONO,
                            fontSize: 32,
                            fontWeight: 700,
                            textAlign: "center",
                            padding: "6px 0",
                            borderRadius: 10,
                            background: g ? tint(g.tone) : "#F2F2F7",
                            color: j < typed ? (g ? ink(g.tone) : textColor) : "transparent",
                            border: g ? `2px solid ${ink(g.tone)}` : "2px solid transparent",
                          }}
                        >
                          {b}
                        </div>
                      );
                    })}
                  </div>
                  {groupsShown.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6, marginTop: 4 }}>
                      {groupsShown.map((g, k) => (
                        <div
                          key={k}
                          style={{
                            gridColumn: `${g.from + 1} / ${g.to + 2}`,
                            fontSize: 24,
                            fontWeight: 600,
                            color: ink(g.tone),
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            opacity: pop(g.atSeconds),
                          }}
                        >
                          {g.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Formula */}
        {formula && (
          <div style={{ ...panel, opacity: pop(formula.atSeconds) }}>
            {formula.title && <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 6 }}>{formula.title}</div>}
            {formula.lines.map((l, i) => (
              <div key={i} style={{ fontFamily: MONO, fontSize: 32, fontWeight: 600, lineHeight: 1.45, color: ink(l.tone ?? "neutral"), opacity: pop(l.atSeconds) }}>
                {l.text}
              </div>
            ))}
          </div>
        )}

        {/* Gauges */}
        {(dial || tiles.length > 0) && (
          <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
            {dial && (
              <div style={{ ...panel, flex: "1 1 0", opacity: pop(dial.atSeconds), display: "flex", flexDirection: "column", alignItems: "center" }}>
                {(() => {
                  const max = dial.max ?? 8000;
                  const v = track(dial.track, t);
                  const a0 = -210;
                  const a1 = 30;
                  const ang = (x: number) => ((a0 + ((a1 - a0) * Math.min(x, max)) / max) * Math.PI) / 180;
                  const R = 150;
                  const C: [number, number] = [190, 180];
                  const pt = (x: number, r: number) => [C[0] + r * Math.cos(ang(x)), C[1] + r * Math.sin(ang(x))];
                  const arc = (from: number, to: number, r: number) => {
                    const [x0, y0] = pt(from, r);
                    const [x1, y1] = pt(to, r);
                    const large = ((to - from) / max) * 240 > 180 ? 1 : 0;
                    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
                  };
                  const [nx, ny] = pt(v, R - 22);
                  return (
                    <svg viewBox="0 0 380 300" style={{ width: "100%", maxWidth: 430, display: "block" }}>
                      <path d={arc(0, max, R)} fill="none" stroke="#E5E5EA" strokeWidth={18} strokeLinecap="round" />
                      {v > 1 && <path d={arc(0, v, R)} fill="none" stroke={accentColor} strokeWidth={18} strokeLinecap="round" />}
                      {Array.from({ length: Math.floor(max / 1000) + 1 }).map((_, k) => {
                        const [tx, ty] = pt(k * 1000, R - 40);
                        return (
                          <text key={k} x={tx} y={ty + 9} textAnchor="middle" fontSize={24} fontWeight={600} fill={mutedColor}>
                            {k}
                          </text>
                        );
                      })}
                      <line x1={C[0]} y1={C[1]} x2={nx} y2={ny} stroke={conColor} strokeWidth={7} strokeLinecap="round" />
                      <circle cx={C[0]} cy={C[1]} r={14} fill={textColor} />
                      <text x={C[0]} y={C[1] + 76} textAnchor="middle" fontSize={56} fontWeight={700} fill={textColor} letterSpacing="-0.02em">
                        {Math.round(v)}
                      </text>
                      <text x={C[0]} y={C[1] + 108} textAnchor="middle" fontSize={26} fontWeight={600} fill={mutedColor}>
                        {dial.label} · {dial.unit}
                      </text>
                    </svg>
                  );
                })()}
              </div>
            )}
            {tiles.length > 0 && (
              <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", gap: 16 }}>
                {tiles.map((g, i) => {
                  const v = track(g.track, t);
                  return (
                    <div key={i} style={{ ...panel, flex: "1 1 0", opacity: pop(g.atSeconds), display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: 28, color: mutedColor, fontWeight: 600 }}>{g.label}</div>
                      <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.02em", color: textColor }}>
                        {v.toFixed(g.decimals ?? 0)}
                        <span style={{ fontSize: 34, fontWeight: 600, color: mutedColor, marginLeft: 10 }}>{g.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  // ------------------------------------------------------------------ bus view
  const busView = () => {
    const BH = 620;
    const yH = 540;
    const yL = 584;
    const termV = terminators ? pop(terminators.atSeconds) : 0;
    const wave = (y: number, ph: number) => {
      let d = `M 40 ${y}`;
      for (let x = 40; x <= 960; x += 20) d += ` L ${x} ${y + Math.sin((x / 60) * Math.PI + ph) * 6}`;
      return d;
    };
    const livePk = packets.filter((p) => t >= p.atSeconds && t < p.atSeconds + (p.seconds ?? 0.8) + 0.9);
    const rxLit = (i: number) =>
      packets.some((p) => {
        if (p.from === i) return false;
        const dt = Math.abs(nodes[i].x - nodes[p.from].x) / 920;
        const arrive = p.atSeconds + (p.seconds ?? 0.8) * dt;
        return t >= arrive && t < arrive + 0.7;
      });
    const txLit = (i: number) => packets.some((p) => p.from === i && t >= p.atSeconds - 0.1 && t < p.atSeconds + (p.seconds ?? 0.8));
    const ackLit = (i: number) =>
      packets.some((p) => p.from === i && p.ack !== false && t >= p.atSeconds + (p.seconds ?? 0.8) && t < p.atSeconds + (p.seconds ?? 0.8) + 0.6);
    return (
      <>
        <svg viewBox={`0 0 1000 ${BH}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {/* Twisted pair */}
          <path d={wave(yH, 0)} fill="none" stroke={CANH} strokeWidth={7} strokeLinecap="round" />
          <path d={wave(yL, Math.PI)} fill="none" stroke={CANL} strokeWidth={7} strokeLinecap="round" />
          <text x={36} y={yH - 18} fontSize={26} fontWeight={700} fill={CANH}>
            CANH
          </text>
          <text x={36} y={yL + 42} fontSize={26} fontWeight={700} fill={CANL}>
            CANL
          </text>
          {/* 120 ohm terminators */}
          {terminators &&
            [40, 960].map((x, k) => (
              <g key={k} opacity={termV}>
                <rect x={x - 16} y={yH + 2} width={32} height={yL - yH - 4} rx={6} fill="#FFFFFF" stroke={textColor} strokeWidth={3} />
                <text x={x + (k === 0 ? 30 : -30)} y={yH + 30} textAnchor={k === 0 ? "start" : "end"} fontSize={24} fontWeight={700} fill={textColor}>
                  {terminators.label ?? "120 Ω"}
                </text>
              </g>
            ))}
          {/* Nodes */}
          {nodes.map((n, i) => {
            const v = pop(n.atSeconds);
            const x = n.x;
            const tx = txLit(i);
            const rx = rxLit(i);
            return (
              <g key={i} opacity={v}>
                {espBoard(x - 130, 30, 260, 130)}
                {/* GPIO lines to the transceiver */}
                <line x1={x - 50} y1={160} x2={x - 50} y2={270} stroke={tx ? accentColor : "#8E8E93"} strokeWidth={5} />
                <line x1={x + 50} y1={160} x2={x + 50} y2={270} stroke={rx ? proColor : "#8E8E93"} strokeWidth={5} />
                <text x={x - 60} y={226} textAnchor="end" fontSize={22} fontWeight={700} fill={tx ? accentColor : mutedColor}>
                  TX→D
                </text>
                <text x={x + 60} y={226} fontSize={22} fontWeight={700} fill={rx ? proColor : mutedColor}>
                  R→RX
                </text>
                {transceiver(x - 110, 270, 220, 120)}
                {/* Stubs to the pair */}
                <line x1={x - 30} y1={390} x2={x - 30} y2={yH} stroke={CANH} strokeWidth={6} />
                <line x1={x + 30} y1={390} x2={x + 30} y2={yL} stroke={CANL} strokeWidth={6} />
                <circle cx={x - 30} cy={yH} r={8} fill={CANH} />
                <circle cx={x + 30} cy={yL} r={8} fill={CANL} />
                <text x={x} y={yL + 46} textAnchor="middle" fontSize={28} fontWeight={700} fill={textColor}>
                  {n.label}
                </text>
                {n.mode && (
                  <g>
                    <rect x={x - 90} y={-6} width={180} height={40} rx={20} fill={rx ? "#D7F0DD" : tx ? "#CFE2F8" : "#E8E8ED"} />
                    <text x={x} y={22} textAnchor="middle" fontSize={24} fontWeight={700} fill={rx ? proColor : tx ? accentColor : mutedColor}>
                      {n.mode}
                    </text>
                  </g>
                )}
                {ackLit(i) && (
                  <text x={x} y={yH - 64} textAnchor="middle" fontSize={26} fontWeight={700} fill={proColor}>
                    ACK ✓
                  </text>
                )}
              </g>
            );
          })}
          {/* Frames rippling along the pair */}
          {livePk.map((p, k) => {
            const sec = p.seconds ?? 0.8;
            const u = interpolate(t, [p.atSeconds, p.atSeconds + sec], [0, 1], clamp);
            const fade = 1 - interpolate(t, [p.atSeconds + sec, p.atSeconds + sec + 0.9], [0, 1], clamp);
            const x0 = nodes[p.from]?.x ?? 500;
            const left = x0 - (x0 - 40) * u;
            const right = x0 + (960 - x0) * u;
            const col = ink(p.tone);
            return (
              <g key={k} opacity={fade}>
                <line x1={left} y1={(yH + yL) / 2} x2={right} y2={(yH + yL) / 2} stroke={col} strokeWidth={30} strokeLinecap="round" opacity={0.18} />
                {[left, right].map((bx, j) => (
                  <circle key={j} cx={bx} cy={(yH + yL) / 2} r={14} fill={col} />
                ))}
                <rect x={x0 - 80} y={(yH + yL) / 2 - 92} width={160} height={44} rx={22} fill={col} />
                <text x={x0} y={(yH + yL) / 2 - 61} textAnchor="middle" fontSize={26} fontWeight={700} fill="#FFFFFF" fontFamily={MONO}>
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
        {pins.length > 0 && (
          <div style={{ ...panel, opacity: pop(Math.min(...pins.map((p) => p.atSeconds ?? 0))) }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 6 }}>{pinsTitle}</div>
            {pins.map((p, i) => {
              const v = pop(p.atSeconds);
              return (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 14, opacity: v, transform: `translateX(${interpolate(v, [0, 1], [16, 0])}px)`, lineHeight: 1.5 }}>
                  <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: textColor, minWidth: 250 }}>{p.a}</div>
                  <div style={{ fontSize: 30, color: mutedColor }}>→</div>
                  <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: accentColor, minWidth: 110 }}>{p.b}</div>
                  {p.note && <div style={{ fontSize: 28, color: bodyColor }}>{p.note}</div>}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  // ------------------------------------------------------------------ frame view
  const frameView = () => {
    const total = fields.reduce((s, f) => s + f.w, 0);
    const bitSec = arb?.bitSeconds ?? 0.35;
    const cols = arb ? Math.max(0, Math.min(11, Math.floor((t - arb.atSeconds) / bitSec) + 1)) : 0;
    const A = arb ? bits11(arb.ids[0]) : [];
    const B = arb ? bits11(arb.ids[1]) : [];
    const lose = arb ? A.findIndex((b, i) => b !== B[i]) : -1;
    const loser = lose >= 0 ? (A[lose] === 1 ? 0 : 1) : -1;
    const ackOk = ack?.okAtSeconds !== undefined && t >= ack.okAtSeconds && (ack.failAtSeconds === undefined || t < ack.failAtSeconds);
    const ackFail = ack?.failAtSeconds !== undefined && t >= ack.failAtSeconds;
    const retries = ackFail ? Math.floor((t - ack!.failAtSeconds!) * (ack!.retryRate ?? 2)) + 1 : 0;
    const ackField = fields.findIndex((f) => f.label === "ACK");
    return (
      <>
        {/* Fields strip */}
        <div style={{ ...panel }}>
          <div style={{ display: "flex", gap: 4 }}>
            {fields.map((f, i) => {
              const lit = (f.lit ?? []).some(([a, b]) => t >= a && t < b) || (i === ackField && (ackOk || ackFail));
              const tone = i === ackField && ackFail ? "bad" : i === ackField && ackOk ? "good" : f.tone ?? "accent";
              return (
                <div
                  key={i}
                  style={{
                    flex: `${f.w / total} 1 0`,
                    minWidth: 0,
                    borderRadius: 12,
                    padding: "14px 2px",
                    textAlign: "center",
                    background: lit ? ink(tone) : "#F2F2F7",
                    border: `2px solid ${lit ? ink(tone) : "rgba(0,0,0,0.06)"}`,
                  }}
                >
                  <div style={{ fontSize: f.label.length > 4 ? 24 : 27, fontWeight: 700, color: lit ? "#FFFFFF" : textColor, whiteSpace: "nowrap" }}>{f.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 500, color: lit ? "#FFFFFF" : mutedColor, whiteSpace: "nowrap" }}>{f.bits}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Arbitration */}
        {arb && (
          <div style={{ ...panel, opacity: pop(arb.atSeconds) }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 10 }}>Phân xử ID · bit 0 thắng bit 1</div>
            {[0, 1, 2].map((row) => {
              const bitsRow = row === 0 ? A : row === 1 ? B : A.map((b, i) => Math.min(b, B[i]));
              const isLoser = row === loser && lose >= 0 && cols > lose;
              const label = row === 2 ? "Trên dây" : arb.labels?.[row] ?? `Board ${row === 0 ? "A" : "B"} · ${arb.ids[row]}`;
              return (
                <div key={row} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, opacity: isLoser ? 0.45 : 1 }}>
                  <div style={{ width: 250, fontSize: 26, fontWeight: 700, color: row === 2 ? accentColor : textColor, whiteSpace: "nowrap" }}>{label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 4, flex: 1 }}>
                    {bitsRow.map((b, i) => {
                      const on = i < cols;
                      const lostHere = row !== 2 && i === lose && cols > lose;
                      // After losing, the loser only listens: its later bits are not driven.
                      const silent = row === loser && lose >= 0 && i > lose;
                      return (
                        <div
                          key={i}
                          style={{
                            fontFamily: MONO,
                            fontSize: 30,
                            fontWeight: 700,
                            textAlign: "center",
                            padding: "4px 0",
                            borderRadius: 8,
                            background: lostHere ? (row === loser ? "#F9D5D8" : "#D7F0DD") : row === 2 && on ? "#CFE2F8" : "#F2F2F7",
                            color: on && !silent ? (lostHere ? (row === loser ? conColor : proColor) : textColor) : "transparent",
                          }}
                        >
                          {b}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {lose >= 0 && cols > lose && (
              <div style={{ fontSize: 30, fontWeight: 600, color: bodyColor, marginTop: 4 }}>
                <span style={{ color: proColor, fontWeight: 700 }}>{arb.ids[loser === 0 ? 1 : 0]}</span> thắng · {arb.ids[loser === 0 ? 0 : 1]} im lặng, gửi lại sau
              </div>
            )}
          </div>
        )}

        {/* ACK slot */}
        {ack && (ackOk || ackFail) && (
          <div style={{ ...panel, display: "flex", alignItems: "center", gap: 18, background: ackFail ? "#FDECEE" : "#EAF7EE" }}>
            <div style={{ fontSize: 56, fontWeight: 700, color: ackFail ? conColor : proColor }}>{ackFail ? "✕" : "✓"}</div>
            <div>
              <div style={{ fontSize: 34, fontWeight: 700, color: ackFail ? conColor : proColor }}>
                {ackFail ? "Không ai xác nhận · lỗi ACK" : "Nút nhận kéo khe ACK xuống"}
              </div>
              <div style={{ fontSize: 28, color: bodyColor }}>
                {ackFail ? `Một board duy nhất · phát lại lần ${retries}` : "Khung đã có người nhận đúng"}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // ------------------------------------------------------------------ OBD view
  const obdView = () => {
    // Front view of the car's J1962 socket (Wikimedia "OBD-II type A female connector pinout"): pins 1-8 on the wide
    // top row and 9-16 underneath, both left to right, key tab under the narrow bottom edge.
    const pinXY = (p: number): [number, number] => {
      const top = p <= 8;
      const k = top ? p - 1 : p - 9;
      return [140 + k * 103, top ? 150 : 290];
    };
    return (
      <>
        <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
          <div style={{ ...panel, flex: "1 1 0", padding: "16px 10px" }}>
            <svg viewBox="0 0 1000 420" style={{ width: "100%", display: "block", overflow: "visible" }}>
              <path d="M 60 80 L 940 80 L 900 360 L 100 360 Z" fill="#2C2C2E" />
              <rect x={430} y={354} width={140} height={40} rx={8} fill="#2C2C2E" />
              {Array.from({ length: 16 }).map((_, i) => {
                const p = i + 1;
                const [x, y] = pinXY(p);
                const hit = obdPins.find((o) => o.pin === p && shown(o.atSeconds));
                const k = hit ? pop(hit.atSeconds) : 0;
                return (
                  <g key={p}>
                    <rect x={x - 22} y={y - 30} width={44} height={60} rx={8} fill={hit ? ink(hit.tone) : "#48484A"} transform={`translate(${x} ${y}) scale(${1 + 0.15 * k}) translate(${-x} ${-y})`} />
                    <text x={x} y={y + 10} textAnchor="middle" fontSize={26} fontWeight={700} fill="#FFFFFF">
                      {p}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          {obdPhoto && (
            <div style={{ ...panel, flex: "0 0 230px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 10 }}>
              <Img src={staticFile(obdPhoto.src)} style={{ width: 210, height: 210, objectFit: "cover", borderRadius: 16 }} />
              {obdPhoto.label && <div style={{ fontSize: 24, color: mutedColor, textAlign: "center", marginTop: 6, lineHeight: 1.25 }}>{obdPhoto.label}</div>}
            </div>
          )}
        </div>
        {obdPins.length > 0 && (
          <div style={{ ...panel, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 18px", opacity: pop(Math.min(...obdPins.map((o) => o.atSeconds ?? 0))) }}>
            {obdPins.map((o, i) => {
              const v = pop(o.atSeconds);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, opacity: shown(o.atSeconds) ? v : 0 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 26, background: ink(o.tone), color: "#FFFFFF", fontSize: 26, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {o.pin}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 600, color: textColor }}>{o.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
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
        {view === "car" && carView()}
        {view === "bus" && busView()}
        {view === "frame" && frameView()}
        {view === "obd" && obdView()}

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
            <div style={{ fontSize: 34, fontWeight: 600, padding: "10px 26px", borderRadius: 999, background: tint(st.tone), color: ink(st.tone) }}>{st.text}</div>
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
