import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

/**
 * Cell states. `erased` = blank flash (0xFF), `free` = erased and available (dashed), `data` = valid data,
 * `new` = just written (accent), `old` = superseded copy (struck through), `meta` = metadata / table,
 * `partial` = write cut off half way (red stripes), `bad` = worn out or broken (red), `lost` = data gone (dashed red),
 * `good` = verified / recovered (green).
 */
export type FlashState = "erased" | "free" | "data" | "new" | "old" | "meta" | "partial" | "bad" | "lost" | "good";

export interface FlashStep {
  /** Seconds after cut start when the cell switches to this state (sync to narration). */
  atSeconds: number;
  state: FlashState;
  /** Replaces the cell text from this step on. */
  text?: string;
  sub?: string;
}

export interface FlashCell {
  /** Initial text (e.g. "ssid=NhaMinh", "4 KB"). */
  text?: string;
  /** Small second line under the text. */
  sub?: string;
  /** Initial state, default "erased". */
  state?: FlashState;
  steps?: FlashStep[];
  /** Wear as a share of the endurance, [[s, 0..1]] (linear between points): fills the cell from grey through
   *  orange to red. A state of partial / bad / lost still wins over the heat colour. */
  wearTrack?: [number, number][];
  /** Erase count readout at the bottom of the cell, [[s, count]] (linear between points), shown as "12k". */
  countTrack?: [number, number][];
  /** Write-in-progress windows [[start, end]]: an accent fill sweeps across the cell; a power cut freezes it. */
  busy?: [number, number][];
  /** Seconds when the cell appears (default: with its group). */
  atSeconds?: number;
}

export interface FlashGroup {
  /** Heading over the group (e.g. "Trang NVS · 4096 byte"). */
  title?: string;
  /** Small muted text right of the title. */
  sub?: string;
  /** Cells per row. */
  cols: number;
  cells: FlashCell[];
  /** Cell height in px (default 96). */
  cellHeight?: number;
  /** Gap between cells in px (default 12). */
  gap?: number;
  /** Cell text size in px (default 30). */
  fontSize?: number;
  atSeconds?: number;
  /** The group fades out from here (its space is kept). */
  untilSeconds?: number;
  /** Windows [[start, end]] where an accent outline marks the group (e.g. the partition being talked about). */
  highlight?: [number, number][];
}

export interface FlashLink {
  /** [group index, cell index] of the arrow tail. */
  from: [number, number];
  /** [group index, cell index] of the arrow head. */
  to: [number, number];
  atSeconds?: number;
  untilSeconds?: number;
  label?: string;
  tone?: "accent" | "good" | "bad" | "muted";
  /** Bend of the arrow in px, sideways from the straight line (default 60; negative bends the other way). */
  bend?: number;
}

export interface FlashPower {
  /** Seconds of the power cut: flash, grey veil over the cells, red "Mất điện" pill. */
  cutAtSeconds: number;
  /** Seconds of the restart: the veil lifts, the pill turns green. */
  restoreAtSeconds?: number;
  cutLabel?: string;
  restoreLabel?: string;
}

export interface FlashMeter {
  label: string;
  /** [[s, value]] (linear between points). */
  track: [number, number][];
  /** "int" (100.000), "k" (12k), "percent" (42 %). Default "int". */
  format?: "int" | "k" | "percent";
  /** Text after the number (e.g. " lần"). */
  unit?: string;
  /** Fixed text shown instead of the number (e.g. "vài ngày"). */
  valueText?: string;
  /** The value turns red from this value on. */
  badFrom?: number;
  tone?: "neutral" | "accent" | "good" | "bad";
  atSeconds?: number;
  untilSeconds?: number;
}

export interface FlashLegendItem {
  state: FlashState;
  label: string;
  atSeconds?: number;
}

interface FlashMapProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  groups: FlashGroup[];
  links?: FlashLink[];
  power?: FlashPower[];
  meters?: FlashMeter[];
  legend?: FlashLegendItem[];
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
  /** Portrait layout: "safe" (default) pads into the TikTok safe area; "centered" uses even 120 px side margins. */
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const RED = "#D70015";
const GREEN = "#1D7A34";

/** Linear interpolation over [[s, v]] points, held flat outside them. */
const track = (pts: [number, number][] | undefined, t: number, fallback = 0): number => {
  if (!pts || pts.length === 0) return fallback;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (t <= t1) {
      const [t0, v0] = pts[i - 1];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
};

const mix = (a: string, b: string, f: number): string => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.min(1, Math.max(0, f))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/** Wear 0..1 to a fill: light grey, pale orange, orange, red. */
const heat = (w: number): string => {
  if (w <= 0.5) return mix("#F2F4F7", "#FFD9A8", w / 0.5);
  if (w <= 0.8) return mix("#FFD9A8", "#FF9F0A", (w - 0.5) / 0.3);
  return mix("#FF9F0A", RED, (w - 0.8) / 0.2);
};

const groupDigits = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmt = (v: number, f: FlashMeter["format"] = "int") => {
  if (f === "percent") return `${Math.round(v)} %`;
  if (f === "k") return v < 1000 ? `${Math.round(v)}` : `${(v / 1000).toFixed(v < 10000 ? 1 : 0).replace(".", ",")}k`;
  return groupDigits(v);
};

interface StateLook {
  fill: string;
  border: string;
  ink: string;
  dashed?: boolean;
  strike?: boolean;
  stripes?: boolean;
}

const lookOf = (s: FlashState, accent: string, text: string, muted: string): StateLook => {
  switch (s) {
    case "free":
      return { fill: "#F7F9FB", border: "rgba(0,0,0,0.22)", ink: muted, dashed: true };
    case "data":
      return { fill: "#E6F0FB", border: "rgba(0,102,204,0.40)", ink: text };
    case "new":
      return { fill: accent, border: accent, ink: "#FFFFFF" };
    case "old":
      return { fill: "#E8E8ED", border: "rgba(0,0,0,0.10)", ink: muted, strike: true };
    case "meta":
      return { fill: "#424245", border: "#424245", ink: "#FFFFFF" };
    case "partial":
      return { fill: "#FFFFFF", border: RED, ink: RED, stripes: true };
    case "bad":
      return { fill: RED, border: RED, ink: "#FFFFFF" };
    case "lost":
      return { fill: "rgba(255,255,255,0.4)", border: RED, ink: RED, dashed: true };
    case "good":
      return { fill: "#E5F3E8", border: GREEN, ink: GREEN };
    default:
      return { fill: "#F2F4F7", border: "rgba(0,0,0,0.10)", ink: muted };
  }
};

const toneColor = (tone: string | undefined, accent: string, text: string, muted: string) =>
  tone === "good" ? GREEN : tone === "bad" ? RED : tone === "muted" ? muted : tone === "neutral" ? text : accent;

const Bolt: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M13.5 2 4 13.5h6.5L9 22l10-12.5h-6.6z" fill={color} />
  </svg>
);

/**
 * Flash memory map in a light card: groups of sectors / pages / entries drawn as cells whose state follows the
 * narration (data written, old copy struck through, write cut off, worn out), wear shown as heat, a power cut that
 * greys the card and a restart, arrows between cells (pointers, copy-on-write moves) and live counters.
 * Built for NVS log-structured pages, LittleFS copy-on-write, FAT tables and wear levelling.
 */
export const FlashMap: React.FC<FlashMapProps> = ({
  name,
  eyebrow,
  tagline,
  groups,
  links = [],
  power = [],
  meters = [],
  legend = [],
  caption,
  captionAtSeconds,
  points = [],
  textColor = "#1D1D1F",
  bodyColor = "#424245",
  mutedColor = "#5E5E63",
  accentColor = "#0066CC",
  surfaceColor = "rgba(255,255,255,0.75)",
  borderColor = "rgba(0,0,0,0.08)",
  proColor = GREEN,
  conColor = RED,
  layout = "safe",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = frame / fps;
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  // A start at or before frame 0 is fully drawn on the cut's first frame (no fade-in from a blank frame).
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const fadeOut = (until: number | undefined) => (until === undefined ? 1 : interpolate(t, [until, until + 0.25], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  // ---- geometry: cells are placed absolutely so arrows can find them
  const sidePad = portrait ? (layout === "centered" ? 240 : 248) : 280;
  const cardPadX = 36;
  const inner = width - sidePad - cardPadX * 2 - 4;
  const TITLE_H = 50;
  const GROUP_GAP = 30;
  const boxes: { x: number; y: number; w: number; h: number }[][] = [];
  const titleY: number[] = [];
  let y = 0;
  groups.forEach((g, gi) => {
    const gap = g.gap ?? 12;
    const ch = g.cellHeight ?? 96;
    const cw = (inner - gap * (g.cols - 1)) / g.cols;
    if (gi > 0) y += GROUP_GAP;
    titleY.push(y);
    if (g.title) y += TITLE_H;
    boxes.push(g.cells.map((_, i) => ({ x: (i % g.cols) * (cw + gap), y: y + Math.floor(i / g.cols) * (ch + gap), w: cw, h: ch })));
    const rows = Math.ceil(g.cells.length / g.cols);
    y += rows * ch + (rows - 1) * gap;
  });
  const mapH = y;

  // ---- power state
  const cut = power.filter((p) => t >= p.cutAtSeconds).pop();
  const veil = cut
    ? cut.restoreAtSeconds !== undefined && t >= cut.restoreAtSeconds
      ? interpolate(t, [cut.restoreAtSeconds, cut.restoreAtSeconds + 0.3], [1, 0], { extrapolateRight: "clamp" })
      : interpolate(t, [cut.cutAtSeconds, cut.cutAtSeconds + 0.15], [0, 1], { extrapolateRight: "clamp" })
    : 0;
  const flash = cut ? interpolate(t, [cut.cutAtSeconds, cut.cutAtSeconds + 0.3], [0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const restored = cut && cut.restoreAtSeconds !== undefined && t >= cut.restoreAtSeconds;
  const pill = cut ? pop(at(restored ? cut.restoreAtSeconds : cut.cutAtSeconds, 0), 14) : 0;
  // The frozen moment of an unrestored cut, for write sweeps that it interrupts.
  const frozenAt = (a: number, b: number) => {
    const c = power.find((p) => p.cutAtSeconds > a && p.cutAtSeconds < b);
    return c ? c.cutAtSeconds : undefined;
  };

  const head = pop(0, 18);
  const firstGroup = at(groups[0]?.atSeconds, 0);
  const card = pop(firstGroup - 6, 20);
  const cap = pop(at(captionAtSeconds, 0.6));

  const renderCell = (c: FlashCell, gi: number, i: number, g: FlashGroup) => {
    const b = boxes[gi][i];
    const appear = pop(at(c.atSeconds ?? g.atSeconds, 0));
    const steps = (c.steps ?? []).filter((s) => t >= s.atSeconds);
    const last = steps[steps.length - 1];
    const prev = steps.length > 1 ? steps[steps.length - 2] : undefined;
    const state: FlashState = last ? last.state : c.state ?? "erased";
    const prevState: FlashState = prev ? prev.state : c.state ?? "erased";
    let text = c.text;
    let sub = c.sub;
    for (const s of steps) {
      if (s.text !== undefined) text = s.text;
      if (s.sub !== undefined) sub = s.sub;
    }
    const since = last ? t - last.atSeconds : 99;
    const blend = last ? interpolate(since, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }) : 1;
    const bump = last && last.atSeconds > 0 ? interpolate(since, [0, 0.1, 0.3], [0, 1, 0], { extrapolateRight: "clamp" }) : 0;
    const wear = c.wearTrack ? track(c.wearTrack, t) : undefined;
    const overriding = state === "partial" || state === "bad" || state === "lost";
    const look = lookOf(state, accentColor, textColor, mutedColor);
    const prevLook = lookOf(prevState, accentColor, textColor, mutedColor);
    const fill = wear !== undefined && !overriding ? heat(wear) : look.fill;
    const prevFill = wear !== undefined ? heat(wear) : prevLook.fill;
    const ink = wear !== undefined && !overriding ? (wear > 0.75 ? "#FFFFFF" : textColor) : look.ink;
    // The count readout shows from the first point of its track.
    const count = c.countTrack && t >= c.countTrack[0][0] ? track(c.countTrack, t) : undefined;
    const fs = g.fontSize ?? 30;

    // Write sweep
    let sweep = 0;
    for (const [a, z] of c.busy ?? []) {
      const stop = frozenAt(a, z);
      const end = stop ?? z;
      const restoreAfter = power.find((p) => p.cutAtSeconds === stop)?.restoreAtSeconds;
      if (t >= a && t < (stop !== undefined ? (restoreAfter ?? 1e9) : z)) {
        sweep = Math.min(1, (Math.min(t, end) - a) / Math.max(0.01, z - a));
      }
    }

    const boxStyle = (lk: StateLook, f: string): React.CSSProperties => ({
      position: "absolute",
      inset: 0,
      borderRadius: 14,
      background: lk.stripes ? `repeating-linear-gradient(135deg, #FDE3E6 0 12px, #FFFFFF 12px 24px)` : f,
      border: `2px ${lk.dashed ? "dashed" : "solid"} ${lk.border}`,
    });

    return (
      <div
        key={`${gi}-${i}`}
        style={{
          position: "absolute",
          left: b.x,
          top: b.y,
          width: b.w,
          height: b.h,
          opacity: appear,
          transform: `scale(${(0.9 + 0.1 * appear) * (1 + 0.06 * bump)})`,
        }}
      >
        <div style={{ ...boxStyle(prevLook, prevFill), opacity: 1 - blend }} />
        <div style={{ ...boxStyle(look, fill), opacity: blend }} />
        {sweep > 0 && (
          <div
            style={{
              position: "absolute",
              left: 2,
              top: 2,
              bottom: 2,
              width: `calc(${sweep * 100}% - 4px)`,
              borderRadius: 12,
              background: state === "partial" ? "rgba(215,0,21,0.16)" : "rgba(0,102,204,0.28)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 8px",
            textAlign: "center",
          }}
        >
          {text && (
            <div
              style={{
                fontSize: fs,
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                color: ink,
                textDecoration: look.strike && blend > 0.5 ? "line-through" : undefined,
                whiteSpace: "nowrap",
              }}
            >
              {text}
            </div>
          )}
          {sub && (
            <div style={{ fontSize: Math.max(26, Math.round(fs * 0.8)), fontWeight: 500, lineHeight: 1.15, color: ink, opacity: 0.85, marginTop: 4, whiteSpace: "nowrap" }}>
              {sub}
            </div>
          )}
          {count !== undefined && (
            <div style={{ fontSize: Math.max(24, Math.round(fs * 0.8)), fontWeight: 700, color: ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
              {fmt(count, "k")}
            </div>
          )}
        </div>
        {/* The cross marks a worn-out cell; a cell carrying a sentence keeps its text readable. */}
        {state === "bad" && blend > 0 && (text ?? "").length <= 6 && !sub && (
          <svg style={{ position: "absolute", inset: 0, opacity: blend * 0.35 }} width={b.w} height={b.h}>
            <line x1={10} y1={10} x2={b.w - 10} y2={b.h - 10} stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
            <line x1={b.w - 10} y1={10} x2={10} y2={b.h - 10} stroke="#FFFFFF" strokeWidth={5} strokeLinecap="round" />
          </svg>
        )}
      </div>
    );
  };

  const center = (gi: number, i: number) => {
    const b = boxes[gi]?.[i];
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
  };
  // Point where the line from a cell's centre toward `toward` leaves the cell, 8 px outside its border.
  const edge = ([gi, i]: [number, number], toward: { x: number; y: number }) => {
    const b = boxes[gi]?.[i];
    if (!b) return { x: 0, y: 0 };
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = toward.x - c.x;
    const dy = toward.y - c.y;
    const k = Math.min(dx ? (b.w / 2 + 8) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + 8) / Math.abs(dy) : Infinity);
    return Number.isFinite(k) ? { x: c.x + dx * k, y: c.y + dy * k } : c;
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
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {/* Map card */}
      <div
        style={{
          position: "relative",
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: `30px ${cardPadX}px 30px`,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          opacity: frame >= firstGroup - 6 ? card : 0,
          transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
        }}
      >
        <div style={{ position: "relative", height: mapH }}>
          {groups.map((g, gi) => {
            const gp = pop(at(g.atSeconds, 0)) * fadeOut(g.untilSeconds);
            const lit = (g.highlight ?? []).some(([a, z]) => t >= a && t < z);
            const bx = boxes[gi];
            const top = g.title ? titleY[gi] + TITLE_H : titleY[gi];
            const bottom = bx.length ? Math.max(...bx.map((q) => q.y + q.h)) : top;
            return (
              <div key={gi} style={{ position: "absolute", inset: 0, opacity: gp, pointerEvents: "none" }}>
                {g.title && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: titleY[gi],
                      height: TITLE_H - 10,
                      display: "flex",
                      alignItems: "baseline",
                      gap: 14,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.01em", color: lit ? accentColor : textColor }}>{g.title}</div>
                    {g.sub && <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor }}>{g.sub}</div>}
                  </div>
                )}
                {lit && (
                  <div
                    style={{
                      position: "absolute",
                      left: -10,
                      right: -10,
                      top: top - 10,
                      height: bottom - top + 20,
                      borderRadius: 20,
                      border: `3px solid ${accentColor}`,
                      boxShadow: `0 0 0 6px rgba(0,102,204,0.12)`,
                    }}
                  />
                )}
                {g.cells.map((c, i) => renderCell(c, gi, i, g))}
              </div>
            );
          })}

          {/* Arrows between cells */}
          <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={inner} height={mapH}>
            <defs>
              {["accent", "good", "bad", "muted"].map((tn) => (
                <marker key={tn} id={`fm-head-${tn}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L10 5 L0 10 z" fill={toneColor(tn, accentColor, textColor, mutedColor)} />
                </marker>
              ))}
            </defs>
            {links.map((l, k) => {
              const p = pop(at(l.atSeconds, 0)) * fadeOut(l.untilSeconds);
              if (p <= 0.001) return null;
              const a = edge(l.from, center(...l.to));
              const z = edge(l.to, center(...l.from));
              const dx = z.x - a.x;
              const dy = z.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const bend = l.bend ?? 60;
              const mx = (a.x + z.x) / 2 - (dy / len) * bend;
              const my = (a.y + z.y) / 2 + (dx / len) * bend;
              const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${z.x} ${z.y}`;
              const draw = l.atSeconds !== undefined && l.atSeconds > 0 ? interpolate(t - l.atSeconds, [0, 0.35], [0, 1], { extrapolateRight: "clamp" }) : 1;
              const col = toneColor(l.tone, accentColor, textColor, mutedColor);
              const tn = l.tone ?? "accent";
              return (
                <g key={k} opacity={Math.min(1, p)}>
                  <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={11} strokeLinecap="round" pathLength={1} strokeDasharray={`${draw} 1`} />
                  <path
                    d={d}
                    fill="none"
                    stroke={col}
                    strokeWidth={5}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={`${draw} 1`}
                    markerEnd={draw >= 0.98 ? `url(#fm-head-${tn})` : undefined}
                  />
                  {l.label && draw >= 0.6 && (
                    <g transform={`translate(${(a.x + z.x) / 2 - (dy / len) * bend * 0.5}, ${(a.y + z.y) / 2 + (dx / len) * bend * 0.5})`}>
                      <rect x={-l.label.length * 8.4 - 16} y={-22} width={l.label.length * 16.8 + 32} height={44} rx={22} fill="#FFFFFF" stroke={col} strokeWidth={2} />
                      <text textAnchor="middle" dominantBaseline="central" fontSize={26} fontWeight={600} fill={col} fontFamily={FONT}>
                        {l.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Power cut: white flash, grey veil over the cells */}
          {veil > 0 && <div style={{ position: "absolute", inset: -12, borderRadius: 18, background: `rgba(29,29,31,${0.12 * veil})` }} />}
          {flash > 0 && <div style={{ position: "absolute", inset: -12, borderRadius: 18, background: `rgba(255,255,255,${flash})` }} />}
        </div>

        {/* Power pill, over the top edge of the card */}
        {cut && (
          <div
            style={{
              position: "absolute",
              right: 28,
              top: -30,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 22px 8px 14px",
              borderRadius: 30,
              background: restored ? GREEN : RED,
              color: "#FFFFFF",
              fontSize: 32,
              fontWeight: 700,
              opacity: pill,
              transform: `scale(${0.8 + 0.2 * pill})`,
              boxShadow: "0 8px 20px rgba(16,24,40,0.18)",
            }}
          >
            {!restored && <Bolt size={34} color="#FFFFFF" />}
            {restored ? cut.restoreLabel ?? "Khởi động lại" : cut.cutLabel ?? "Mất điện"}
          </div>
        )}

        {/* Legend */}
        {legend.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 26px" }}>
            {legend.map((lg, k) => {
              const p = pop(at(lg.atSeconds, 0));
              const lk = lookOf(lg.state, accentColor, textColor, mutedColor);
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, opacity: p }}>
                  <div
                    style={{
                      width: 34,
                      height: 26,
                      borderRadius: 7,
                      background: lk.stripes ? `repeating-linear-gradient(135deg, #FDE3E6 0 6px, #FFFFFF 6px 12px)` : lk.fill,
                      border: `2px ${lk.dashed ? "dashed" : "solid"} ${lk.border}`,
                    }}
                  />
                  <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: "0.005em", color: mutedColor, whiteSpace: "nowrap" }}>{lg.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Meters */}
        {meters.length > 0 && (
          <div style={{ display: "flex", gap: 18 }}>
            {meters.map((m, k) => {
              const p = pop(at(m.atSeconds, 0)) * fadeOut(m.untilSeconds);
              const v = track(m.track, t);
              const bad = m.badFrom !== undefined && v >= m.badFrom;
              const col = bad ? RED : m.tone === "accent" ? accentColor : m.tone === "good" ? GREEN : m.tone === "bad" ? RED : textColor;
              return (
                <div
                  key={k}
                  style={{
                    flex: 1,
                    opacity: p,
                    borderRadius: 22,
                    background: "rgba(0,0,0,0.035)",
                    padding: "14px 22px",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, whiteSpace: "nowrap" }}>{m.label}</div>
                  <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.02em", color: col, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {m.valueText ?? `${fmt(v, m.format)}${m.unit ?? ""}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {caption && <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, opacity: cap }}>{caption}</div>}
      </div>

      {/* Takeaways */}
      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
                <div style={{ fontSize: 40, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
