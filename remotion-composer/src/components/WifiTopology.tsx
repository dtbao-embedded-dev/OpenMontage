import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveAsset } from "../lib/resolveAsset";
import type { CodePoint } from "./CodeCompare";
import type { TimelineLog } from "./CoreTimeline";

export type TopologyIcon = "router" | "phone" | "laptop" | "cloud" | "server" | "chip";

export interface TopologyNode {
  id: string;
  label: string;
  detail?: string;
  /** Built-in vector icon; ignored when `image` is set. */
  icon?: TopologyIcon;
  /** Image in public/ (e.g. a board photo) drawn instead of an icon. */
  image?: string;
  /** Centre position inside the diagram card, 0..1 on each axis. */
  x: number;
  y: number;
  /** Seconds after cut start when the node pops in (default: staggered from 0.2 s). */
  atSeconds?: number;
  /** Small pill above the node (e.g. "STA", "AP", an IP address). */
  badge?: string;
  badgeAtSeconds?: number;
  /** Accent ring around the node from this time on. */
  highlightAtSeconds?: number;
}

export interface TopologyPacket {
  atSeconds: number;
  /** Text in the travelling pill; empty = a dot. */
  label?: string;
  /** Travel from `to` back to `from`. */
  reverse?: boolean;
  durationSeconds?: number;
  color?: string;
  /** Send `count` packets, one every `everySeconds`. */
  count?: number;
  everySeconds?: number;
}

export interface TopologyLink {
  from: string;
  to: string;
  label?: string;
  /** Dashed = wireless hop, solid = wired / Internet. */
  dashed?: boolean;
  atSeconds?: number;
  packets?: TopologyPacket[];
}

export interface TopologyRange {
  /** Node that broadcasts (rings pulse out of it). */
  node: string;
  atSeconds?: number;
  label?: string;
}

interface WifiTopologyProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  nodes: TopologyNode[];
  links?: TopologyLink[];
  ranges?: TopologyRange[];
  /** Height of the diagram card in px (default 760). */
  diagramHeight?: number;
  points?: CodePoint[];
  log?: TimelineLog;
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
const ICON = 132; // icon disc diameter
const IMG_W = 230; // board image width

const IconGlyph: React.FC<{ icon: TopologyIcon; color: string }> = ({ icon, color }) => {
  const s = { fill: "none", stroke: color, strokeWidth: 3.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={72} height={72} viewBox="0 0 64 64">
      {icon === "router" && (
        <g {...s}>
          <rect x={8} y={34} width={48} height={16} rx={4} />
          <line x1={18} y1={34} x2={14} y2={14} />
          <line x1={46} y1={34} x2={50} y2={14} />
          <circle cx={18} cy={42} r={1.6} fill={color} />
          <circle cx={26} cy={42} r={1.6} fill={color} />
          <circle cx={34} cy={42} r={1.6} fill={color} />
        </g>
      )}
      {icon === "phone" && (
        <g {...s}>
          <rect x={19} y={6} width={26} height={52} rx={5} />
          <line x1={28} y1={51} x2={36} y2={51} />
        </g>
      )}
      {icon === "laptop" && (
        <g {...s}>
          <rect x={12} y={14} width={40} height={28} rx={3} />
          <path d="M6 48 h52 l-4 6 h-44 z" />
        </g>
      )}
      {icon === "cloud" && (
        <g {...s}>
          <path d="M18 46 h30 a10 10 0 0 0 0-20 a14 14 0 0 0-27-3 a11 11 0 0 0-3 23 z" />
        </g>
      )}
      {icon === "server" && (
        <g {...s}>
          <rect x={12} y={8} width={40} height={14} rx={3} />
          <rect x={12} y={25} width={40} height={14} rx={3} />
          <rect x={12} y={42} width={40} height={14} rx={3} />
          <circle cx={20} cy={15} r={1.6} fill={color} />
          <circle cx={20} cy={32} r={1.6} fill={color} />
          <circle cx={20} cy={49} r={1.6} fill={color} />
        </g>
      )}
      {icon === "chip" && (
        <g {...s}>
          <rect x={16} y={16} width={32} height={32} rx={4} />
          {[24, 32, 40].map((v) => (
            <g key={v}>
              <line x1={v} y1={8} x2={v} y2={16} />
              <line x1={v} y1={48} x2={v} y2={56} />
              <line x1={8} y1={v} x2={16} y2={v} />
              <line x1={48} y1={v} x2={56} y2={v} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
};

export const WifiTopology: React.FC<WifiTopologyProps> = ({
  name,
  eyebrow,
  tagline,
  nodes,
  links = [],
  ranges = [],
  diagramHeight = 760,
  points = [],
  log,
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
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  const pop = (start: number, damping = 16) => spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });

  const sidePad = portrait ? (layout === "centered" ? 120 : 88) : 140;
  const rightPad = portrait ? (layout === "centered" ? 120 : 160) : 140;
  const W = width - sidePad - rightPad;
  const H = diagramHeight;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const pos = (n: TopologyNode) => ({ x: n.x * W, y: n.y * H });
  const nodeAt = (n: TopologyNode, i: number) => n.atSeconds ?? 0.2 + i * 0.2;
  const radius = (n: TopologyNode) => (n.image ? IMG_W * 0.42 : ICON / 2) + 14;

  const cardStyle: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };

  const head = pop(0, 18);
  const card = pop(4, 20);

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "0 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 34,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && (
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>
        )}
        <div style={{ fontSize: 100, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      <div
        style={{
          ...cardStyle,
          position: "relative",
          width: W,
          height: H,
          boxSizing: "border-box",
          opacity: card,
          transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
        }}
      >
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {ranges.map((r, ri) => {
            const n = byId[r.node];
            if (!n) return null;
            const start = r.atSeconds ?? 0.5;
            if (t < start) return null;
            const { x, y } = pos(n);
            return [0, 1, 2].map((k) => {
              const phase = ((t - start) / 1.8 + k / 3) % 1;
              return (
                <circle key={`${ri}-${k}`} cx={x} cy={y} r={radius(n) + phase * 150}
                  fill="none" stroke={accentColor} strokeWidth={3} opacity={(1 - phase) * 0.35} />
              );
            });
          })}
          {links.map((l, li) => {
            const a = byId[l.from];
            const b = byId[l.to];
            if (!a || !b) return null;
            const pa = pos(a);
            const pb = pos(b);
            const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
            const ux = (pb.x - pa.x) / len;
            const uy = (pb.y - pa.y) / len;
            const x1 = pa.x + ux * radius(a);
            const y1 = pa.y + uy * radius(a);
            const x2 = pb.x - ux * radius(b);
            const y2 = pb.y - uy * radius(b);
            const p = interpolate(frame, [at(l.atSeconds, 0.8 + li * 0.3), at(l.atSeconds, 0.8 + li * 0.3) + 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <g key={li}>
                <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * p} y2={y1 + (y2 - y1) * p} stroke="rgba(0,0,0,0.30)" strokeWidth={4}
                  strokeLinecap="round" strokeDasharray={l.dashed ? "4 14" : undefined} />
                {l.label && p > 0.5 && (
                  <text x={(x1 + x2) / 2 + (Math.abs(uy) > 0.6 ? 22 : 0)} y={(y1 + y2) / 2 + (Math.abs(uy) > 0.6 ? 8 : -18)}
                    textAnchor={Math.abs(uy) > 0.6 ? "start" : "middle"} fontFamily={FONT} fontSize={28} fill={mutedColor}
                    opacity={interpolate(p, [0.5, 1], [0, 1])}>
                    {l.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Packets travel edge to edge, drawn above the nodes. */}
        {links.flatMap((l, li) => {
          const a = byId[l.from];
          const b = byId[l.to];
          if (!a || !b) return [];
          const ca = pos(a);
          const cb = pos(b);
          const len = Math.hypot(cb.x - ca.x, cb.y - ca.y);
          const ux = (cb.x - ca.x) / len;
          const uy = (cb.y - ca.y) / len;
          const pa = { x: ca.x + ux * radius(a), y: ca.y + uy * radius(a) };
          const pb = { x: cb.x - ux * radius(b), y: cb.y - uy * radius(b) };
          return (l.packets ?? []).flatMap((pk, pi) =>
            Array.from({ length: pk.count ?? 1 }, (_, k) => {
              const start = pk.atSeconds + k * (pk.everySeconds ?? 1.2);
              const dur = pk.durationSeconds ?? 1.2;
              const u = (t - start) / dur;
              if (u < 0 || u > 1) return null;
              const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
              const [s, d] = pk.reverse ? [pb, pa] : [pa, pb];
              const x = s.x + (d.x - s.x) * e;
              const y = s.y + (d.y - s.y) * e;
              const fade = Math.min(1, u * 6, (1 - u) * 6);
              const color = pk.color ?? accentColor;
              return (
                <div key={`${li}-${pi}-${k}`} style={{
                  position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", opacity: fade, zIndex: 3,
                  background: color, color: "#FFFFFF", borderRadius: 999, whiteSpace: "nowrap",
                  padding: pk.label ? "10px 22px" : 0, width: pk.label ? undefined : 26, height: pk.label ? undefined : 26,
                  fontFamily: MONO, fontSize: 28, fontWeight: 600, boxShadow: "0 8px 20px rgba(0,102,204,0.25)",
                }}>
                  {pk.label}
                </div>
              );
            }),
          );
        })}

        {nodes.map((n, i) => {
          const p = pop(at(nodeAt(n, i), 0), 15);
          const { x, y } = pos(n);
          const hl = n.highlightAtSeconds !== undefined ? pop(at(n.highlightAtSeconds, 0), 20) : 0;
          const badge = n.badge ? pop(at(n.badgeAtSeconds ?? nodeAt(n, i) + 0.3, 0), 14) : 0;
          const boxH = n.image ? IMG_W * 0.87 : ICON;
          return (
            <div key={n.id} style={{
              position: "absolute", left: x, top: y, zIndex: 2, opacity: Math.min(1, p * 1.4),
              transform: `translate(-50%, -${boxH / 2}px) scale(${interpolate(p, [0, 1], [0.6, 1])})`,
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              {n.badge && (
                <div style={{
                  position: "absolute", top: -58, opacity: badge, transform: `translateY(${interpolate(badge, [0, 1], [12, 0])}px)`,
                  background: accentColor, color: "#FFFFFF", borderRadius: 999, padding: "6px 20px",
                  fontSize: 28, fontWeight: 700, letterSpacing: "0.01em", whiteSpace: "nowrap",
                }}>
                  {n.badge}
                </div>
              )}
              {n.image ? (
                <div style={{ width: IMG_W, height: boxH, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div style={{
                    position: "absolute", inset: -8, borderRadius: 28, border: `3px solid ${accentColor}`, opacity: hl * 0.8,
                  }} />
                  <Img src={resolveAsset(n.image)} style={{ width: IMG_W, height: boxH, objectFit: "contain" }} />
                </div>
              ) : (
                <div style={{
                  width: ICON, height: ICON, borderRadius: ICON / 2, background: "#FFFFFF",
                  border: `${hl > 0 ? 4 : 2}px solid ${hl > 0 ? accentColor : "rgba(0,0,0,0.10)"}`,
                  boxShadow: "0 10px 28px rgba(16,24,40,0.10)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <IconGlyph icon={n.icon ?? "chip"} color={hl > 0 ? accentColor : textColor} />
                </div>
              )}
              <div style={{ marginTop: 14, fontSize: 36, fontWeight: 600, letterSpacing: "-0.012em", color: textColor, whiteSpace: "nowrap" }}>
                {n.label}
              </div>
              {n.detail && (
                <div style={{ marginTop: 2, fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, whiteSpace: "nowrap" }}>
                  {n.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {log && (() => {
        const p = pop(at(log.atSeconds, 1.5), 20);
        return (
          <div style={{ ...cardStyle, padding: "20px 28px 24px", opacity: p, transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)` }}>
            {log.title && <div style={{ fontSize: 26, fontWeight: 600, color: mutedColor, marginBottom: 10 }}>{log.title}</div>}
            <div style={{ fontFamily: MONO, fontSize: 26, lineHeight: 1.45, color: log.color ?? textColor, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {log.lines.join("\n")}
            </div>
          </div>
        );
      })()}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}>
                <div style={{
                  flex: "0 0 auto", width: 52, height: 52, borderRadius: 26, background: color, color: "#FFFFFF",
                  fontSize: 30, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2,
                }}>
                  {mark}
                </div>
                <div style={{ fontSize: 42, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
