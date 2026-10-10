import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "warn" | "muted";

export interface AirParticles {
  /** "co2" = soft blue dots, "pm" = small dark specks, "voc" = green wisps. */
  kind: "co2" | "pm" | "voc";
  /** [[seconds, 0..1]] share of the group's dots on screen, linear between keys. */
  level: [number, number][];
  /** Legend text, e.g. "CO₂". Omit to keep the group out of the legend. */
  label?: string;
  color?: string;
  /** Room units (x 0..1000, y 0..viewHeight): new dots stream out of this point while the level rises. */
  source?: [number, number];
}

export interface AirItem {
  kind: "bed" | "stove" | "spray" | "device";
  /** Left edge (bed, stove) or centre (spray, device) in room units. */
  x: number;
  /** Device / spray centre height; bed and stove stand on the floor. */
  y?: number;
  label?: string;
  /** [[start, end]] windows (seconds): bed = sleeping (blanket breathes, Zz), stove = smoke, spray = mist. */
  active?: [number, number][];
  /** Device only: index of the readout whose status colours the device LED (default 0). */
  readout?: number;
  atSeconds?: number;
  untilSeconds?: number;
}

export interface AirWindowState {
  atSeconds: number;
  open: boolean;
}

export interface AirClock {
  /** [[seconds, hour]] linear, hour may run past 24 (e.g. 22 -> 30 = 06:00 next day). */
  track: [number, number][];
  /** Text after the time, from its `atSeconds` on (e.g. "Cửa đóng" at 0, "Mở cửa" later). */
  labels?: { atSeconds: number; text: string; tone?: Tone }[];
}

export interface AirLevel {
  /** The level applies from this value up (levels sorted ascending). */
  from: number;
  text: string;
  tone: Tone;
}

export interface AirReadout {
  label: string;
  unit: string;
  /** [[seconds, value]] linear between keys. */
  track: [number, number][];
  decimals?: number;
  levels?: AirLevel[];
  /** Draw the history of the track up to now under the number. */
  spark?: boolean;
  sparkMin?: number;
  sparkMax?: number;
  /** Accent the number (the one key stat of the frame). */
  highlight?: boolean;
  atSeconds?: number;
  untilSeconds?: number;
}

interface AirRoomProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  particles?: AirParticles[];
  items?: AirItem[];
  windowStates?: AirWindowState[];
  clock?: AirClock;
  readouts?: AirReadout[];
  /** Room height in units (width is always 1000). Default 620. */
  viewHeight?: number;
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
const WARN = "#A05A00";
const MAX_DOTS: Record<AirParticles["kind"], number> = { co2: 110, pm: 150, voc: 70 };
const DOT_COLOR: Record<AirParticles["kind"], string> = { co2: "#7F9CC4", pm: "#5E5E63", voc: "#2E9E5B" };

/** Linear interpolation between [[t, v]] keys; before the first key the first value holds. */
const lin = (keys: [number, number][] | undefined, t: number, fallback = 0) => {
  if (!keys || keys.length === 0) return fallback;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t < t1) return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return keys[keys.length - 1][1];
};

/** Deterministic 0..1 noise for dot i of a group. */
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const inWindows = (w: [number, number][] | undefined, t: number) => (w ?? []).some(([s, e]) => t >= s && t <= e);

const fmt = (v: number, decimals = 0) => v.toFixed(decimals).replace(".", ",");

/**
 * Cross-section of a room for indoor-air explainers: a bed, a stove or a spray can as sources, CO2 / dust / VOC dots
 * whose density follows a level track, a window that opens and lets the air out, a night clock, and live readout cards
 * (value, status pill from levels, sparkline of the history).
 */
export const AirRoom: React.FC<AirRoomProps> = ({
  name,
  eyebrow,
  tagline,
  particles = [],
  items = [],
  windowStates = [],
  clock,
  readouts = [],
  viewHeight = 620,
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
    tone === "accent" ? accentColor : tone === "good" ? proColor : tone === "bad" ? conColor : tone === "warn" ? WARN : tone === "muted" ? mutedColor : textColor;
  const toneFill = (tone?: Tone) =>
    tone === "good" ? "#D9F0DF" : tone === "bad" ? "#F9D5D8" : tone === "warn" ? "#FBE7C6" : tone === "accent" ? "#CFE2F8" : "#E8E8ED";
  const levelOf = (r: AirReadout, v: number) => {
    let cur: AirLevel | undefined;
    for (const l of r.levels ?? []) if (v >= l.from) cur = l;
    return cur;
  };

  const H = viewHeight;
  const FLOOR = H - 46;
  const L = 30;
  const R = 970;
  const TOP = 24;
  const head = pop(0, 18);

  // Window on the back wall, top right; opening eases over 0.6 s.
  const WX = 690;
  const WY = 70;
  const WW = 220;
  const WH = 190;
  let open = 0;
  {
    let from = 0;
    let to = 0;
    let since = -1e9;
    for (const s of [...windowStates].sort((p, q) => p.atSeconds - q.atSeconds)) {
      if (t >= s.atSeconds) {
        from = to;
        to = s.open ? 1 : 0;
        since = s.atSeconds;
      }
    }
    // A state set at or before 0 s holds from the first frame.
    const k = since <= 0 ? 1 : Math.min(1, (t - since) / 0.6);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    open = from + (to - from) * e;
  }
  const hour = clock ? lin(clock.track, t, 22) : 14;
  const h24 = ((hour % 24) + 24) % 24;
  const night = h24 >= 19 || h24 < 6 ? 1 : h24 < 7 ? 1 - (h24 - 6) : h24 >= 18 ? h24 - 18 : 0;
  const sky = night > 0.5 ? "#26324F" : "#BFE0FA";
  const clockLabel = clock?.labels ? [...clock.labels].reverse().find((l) => t >= l.atSeconds) ?? clock.labels[0] : undefined;

  // ---------------------------------------------------------------- dots
  const dots: React.ReactNode[] = [];
  particles.forEach((g, gi) => {
    const n = MAX_DOTS[g.kind];
    const lev = Math.max(0, Math.min(1, lin(g.level, t)));
    const count = lev * n;
    const color = g.color ?? DOT_COLOR[g.kind];
    for (let i = 0; i < n; i++) {
      const id = i;
      const bx = L + 30 + rnd(id, gi + 1) * (R - L - 60);
      const by = TOP + 20 + rnd(id, gi + 7) * (FLOOR - TOP - 40);
      const ph = rnd(id, gi + 13) * Math.PI * 2;
      let x = bx + Math.sin(t * 0.35 + ph) * 22;
      let y = by + Math.cos(t * 0.28 + ph * 1.3) * 16;
      let op = 1;
      if (i >= count) {
        // Just above the level: leaving (towards the open window) or not yet there.
        const out = i - count;
        if (out > 10 || open < 0.2) continue;
        const k = 1 - out / 10;
        x = x + (WX + WW / 2 - x) * (1 - k);
        y = y + (WY + WH / 2 - y) * (1 - k);
        op = k * 0.8;
      } else if (g.source && count - i < 8) {
        // Newest dots are still on their way out of the source.
        const k = (count - i) / 8;
        x = g.source[0] + (x - g.source[0]) * k;
        y = g.source[1] + (y - g.source[1]) * k;
        op = 0.4 + 0.6 * k;
      } else if (count - i < 1) {
        op = count - i;
      }
      if (g.kind === "pm") {
        dots.push(<circle key={`p${gi}-${i}`} cx={x} cy={y} r={3 + rnd(id, 5) * 3} fill={color} opacity={0.75 * op} />);
      } else if (g.kind === "voc") {
        dots.push(
          <path
            key={`v${gi}-${i}`}
            d={`M ${x - 12} ${y} q 6 -9 12 0 t 12 0`}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.7 * op}
          />,
        );
      } else {
        dots.push(<circle key={`c${gi}-${i}`} cx={x} cy={y} r={8} fill={color} opacity={0.55 * op} />);
      }
    }
  });

  // ---------------------------------------------------------------- items
  const itemEls = items.map((it, i) => {
    const v = life(it.atSeconds, it.untilSeconds);
    if (v <= 0.001) return null;
    const on = inWindows(it.active, t);
    if (it.kind === "bed") {
      const x = it.x;
      const breathe = on ? Math.sin(t * 1.4) * 4 : 0;
      return (
        <g key={`i${i}`} opacity={v}>
          <rect x={x} y={FLOOR - 120} width={18} height={120} rx={4} fill="#8E7A66" />
          <rect x={x} y={FLOOR - 70} width={380} height={44} rx={10} fill="#A88F76" />
          <rect x={x + 18} y={FLOOR - 96} width={350} height={30} rx={12} fill="#F2F2F5" stroke="#D2D2D7" strokeWidth={2} />
          <rect x={x + 28} y={FLOOR - 122} width={90} height={34} rx={14} fill="#FFFFFF" stroke="#D2D2D7" strokeWidth={2} />
          <circle cx={x + 82} cy={FLOOR - 120} r={24} fill="#E9C9A8" />
          <path d={`M ${x + 104} ${FLOOR - 98} Q ${x + 240} ${FLOOR - 140 - breathe} ${x + 362} ${FLOOR - 96} L ${x + 362} ${FLOOR - 70} L ${x + 104} ${FLOOR - 70} Z`} fill="#9DB8DE" />
          {on &&
            [0, 1, 2].map((j) => {
              const ph = (t * 0.5 + j / 3) % 1;
              return (
                <text key={j} x={x + 110 + ph * 50} y={FLOOR - 150 - ph * 70} fontSize={26 + j * 6} fontWeight={700} fill={mutedColor} opacity={1 - ph}>
                  z
                </text>
              );
            })}
          {it.label && (
            <text x={x + 190} y={FLOOR + 36} textAnchor="middle" fontSize={28} fontWeight={600} fill={mutedColor}>
              {it.label}
            </text>
          )}
        </g>
      );
    }
    if (it.kind === "stove") {
      const x = it.x;
      return (
        <g key={`i${i}`} opacity={v}>
          <rect x={x} y={FLOOR - 120} width={260} height={120} rx={8} fill="#D2D2D7" />
          <rect x={x + 30} y={FLOOR - 92} width={200} height={14} rx={4} fill="#8E9198" />
          <path d={`M ${x + 60} ${FLOOR - 120} L ${x + 200} ${FLOOR - 120} L ${x + 186} ${FLOOR - 150} L ${x + 74} ${FLOOR - 150} Z`} fill="#3A3A3C" />
          <rect x={x + 200} y={FLOOR - 140} width={60} height={8} rx={4} fill="#3A3A3C" />
          {on &&
            [0, 1, 2, 3].map((j) => {
              const ph = (t * 0.45 + j / 4) % 1;
              const sx = x + 90 + j * 26 + Math.sin(t * 2 + j) * 10;
              return (
                <path
                  key={j}
                  d={`M ${sx} ${FLOOR - 160 - ph * 140} q 14 -20 0 -40 q -14 -20 0 -40`}
                  fill="none"
                  stroke="#8E9198"
                  strokeWidth={8}
                  strokeLinecap="round"
                  opacity={0.6 * (1 - ph)}
                />
              );
            })}
          {it.label && (
            <text x={x + 130} y={FLOOR + 36} textAnchor="middle" fontSize={28} fontWeight={600} fill={mutedColor}>
              {it.label}
            </text>
          )}
        </g>
      );
    }
    if (it.kind === "spray") {
      const x = it.x;
      const y = it.y ?? FLOOR - 70;
      return (
        <g key={`i${i}`} opacity={v}>
          <rect x={x - 26} y={y - 40} width={52} height={110} rx={12} fill="#3B7DD8" />
          <rect x={x - 14} y={y - 62} width={28} height={24} rx={4} fill="#1D1D1F" />
          <rect x={x + 10} y={y - 58} width={14} height={8} rx={2} fill="#1D1D1F" />
          {on && <path d={`M ${x + 26} ${y - 54} L ${x + 170} ${y - 110} L ${x + 170} ${y + 6} Z`} fill={DOT_COLOR.voc} opacity={0.18 + 0.08 * Math.sin(t * 9)} />}
          {it.label && (
            <text x={x} y={FLOOR + 36} textAnchor="middle" fontSize={28} fontWeight={600} fill={mutedColor}>
              {it.label}
            </text>
          )}
        </g>
      );
    }
    // device: the meter on the wall, LED coloured by its readout's level
    const r = readouts[it.readout ?? 0];
    const lv = r ? levelOf(r, lin(r.track, t)) : undefined;
    const led = toneColor(lv?.tone ?? "good");
    const x = it.x;
    const y = it.y ?? 150;
    return (
      <g key={`i${i}`} opacity={v}>
        <rect x={x - 70} y={y - 46} width={140} height={92} rx={16} fill="#FFFFFF" stroke="#C7C7CC" strokeWidth={3} />
        <rect x={x - 54} y={y - 32} width={84} height={50} rx={6} fill="#1D1D1F" />
        <text x={x - 12} y={y + 2} textAnchor="middle" fontSize={22} fontWeight={700} fill="#FFFFFF" fontFamily={FONT}>
          {r ? fmt(lin(r.track, t), r.decimals ?? 0) : ""}
        </text>
        <circle cx={x + 48} cy={y - 8} r={10} fill={led} />
        {it.label && (
          <text x={x} y={y + 80} textAnchor="middle" fontSize={26} fontWeight={600} fill={mutedColor} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
            {it.label}
          </text>
        )}
      </g>
    );
  });

  // Window panes swing open: each half narrows towards its hinge.
  const pane = (WW / 2) * (1 - 0.75 * open);
  const flow =
    open > 0.3
      ? [0, 1, 2].map((j) => {
          const ph = (t * 0.6 + j / 3) % 1;
          const x = WX - 120 + ph * 190;
          const y = WY + 50 + j * 45;
          return <path key={j} d={`M ${x} ${y} l 40 0 m -14 -12 l 14 12 l -14 12`} fill="none" stroke={accentColor} strokeWidth={5} strokeLinecap="round" opacity={(open - 0.3) * (1 - Math.abs(ph - 0.5) * 2)} />;
        })
      : null;

  const legend = particles.filter((g) => g.label);
  const cols = Math.max(1, readouts.length);

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
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {/* Room card */}
      <div style={{ background: surfaceColor, border: `2px solid ${borderColor}`, borderRadius: 36, boxShadow: "0 18px 48px rgba(16,24,40,0.10)", padding: "22px 22px 18px" }}>
        <svg viewBox={`0 0 1000 ${H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          <defs>
            <clipPath id="air-room-clip">
              <rect x={L} y={TOP} width={R - L} height={FLOOR - TOP} rx={18} />
            </clipPath>
          </defs>
          {/* Walls and floor */}
          <rect x={L} y={TOP} width={R - L} height={FLOOR - TOP} rx={18} fill="#F5F7FA" stroke="#D2D2D7" strokeWidth={3} />
          <rect x={L} y={FLOOR - 4} width={R - L} height={10} rx={4} fill="#C7C7CC" />
          <g clipPath="url(#air-room-clip)">{dots}</g>
          {/* Window: sky, then two panes (over the dots: they are inside the room) */}
          <rect x={WX} y={WY} width={WW} height={WH} rx={6} fill={sky} />
          {night > 0.5 ? <circle cx={WX + WW - 50} cy={WY + 50} r={18} fill="#F2F2F5" /> : <circle cx={WX + WW - 50} cy={WY + 50} r={22} fill="#FFD66B" />}
          <rect x={WX} y={WY} width={pane} height={WH} fill="rgba(255,255,255,0.35)" stroke="#8E9198" strokeWidth={5} />
          <rect x={WX + WW - pane} y={WY} width={pane} height={WH} fill="rgba(255,255,255,0.35)" stroke="#8E9198" strokeWidth={5} />
          <rect x={WX - 6} y={WY - 6} width={WW + 12} height={WH + 12} rx={8} fill="none" stroke="#8E9198" strokeWidth={6} />
          {itemEls}
          {flow}
          {/* Clock pill */}
          {clock && (
            <g>
              <rect x={L + 20} y={TOP + 18} width={clockLabel ? 150 + 18 * clockLabel.text.length : 150} height={56} rx={28} fill="#FFFFFF" stroke="#D2D2D7" strokeWidth={2} />
              <text x={L + 44} y={TOP + 57} fontSize={32} fontWeight={700} fill={textColor} style={{ fontVariantNumeric: "tabular-nums" }}>
                {`${String(Math.floor(h24)).padStart(2, "0")}:${String(Math.floor((h24 % 1) * 60)).padStart(2, "0")}`}
              </text>
              {clockLabel && (
                <text x={L + 150} y={TOP + 57} fontSize={28} fontWeight={600} fill={toneColor(clockLabel.tone ?? "muted")}>
                  {clockLabel.text}
                </text>
              )}
            </g>
          )}
        </svg>
        {legend.length > 0 && (
          <div style={{ display: "flex", gap: 30, padding: "10px 12px 0", flexWrap: "wrap" }}>
            {legend.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 600, color: bodyColor }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: g.color ?? DOT_COLOR[g.kind] }} />
                {g.label}
              </div>
            ))}
          </div>
        )}
        {caption && (
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, padding: "8px 12px 0", opacity: pop(at(captionAtSeconds, 0)) }}>
            {caption}
          </div>
        )}
      </div>

      {/* Readouts */}
      {readouts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 20 }}>
          {readouts.map((r, i) => {
            const v = life(r.atSeconds, r.untilSeconds);
            const val = lin(r.track, t);
            const lv = levelOf(r, val);
            const big = cols >= 3 ? 64 : 84;
            let spark: React.ReactNode = null;
            if (r.spark && r.track.length > 1) {
              const t0 = r.track[0][0];
              const t1 = r.track[r.track.length - 1][0];
              const lo = r.sparkMin ?? Math.min(...r.track.map((k) => k[1]));
              const hi = r.sparkMax ?? Math.max(...r.track.map((k) => k[1]));
              const now = Math.min(t, t1);
              const pts: string[] = [];
              for (let s = 0; s <= 40; s++) {
                const tt = t0 + ((now - t0) * s) / 40;
                const x = ((tt - t0) / Math.max(0.01, t1 - t0)) * 300;
                const y = 60 - ((lin(r.track, tt) - lo) / Math.max(1e-6, hi - lo)) * 56;
                pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
              }
              spark = (
                <svg viewBox="0 0 300 64" style={{ width: "100%", height: 54, display: "block", marginTop: 6 }} preserveAspectRatio="none">
                  <polyline points={pts.join(" ")} fill="none" stroke={lv ? toneColor(lv.tone) : accentColor} strokeWidth={4} strokeLinejoin="round" />
                </svg>
              );
            }
            return (
              <div
                key={i}
                style={{
                  opacity: v,
                  transform: `translateY(${interpolate(v, [0, 1], [20, 0])}px)`,
                  background: surfaceColor,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 30,
                  boxShadow: "0 12px 32px rgba(16,24,40,0.08)",
                  padding: "18px 22px 18px",
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, whiteSpace: "nowrap" }}>{r.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4, whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: big, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, color: r.highlight ? accentColor : textColor, fontVariantNumeric: "tabular-nums" }}>
                    {fmt(val, r.decimals ?? 0)}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor }}>{r.unit}</div>
                </div>
                {lv && (
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: 10,
                      padding: "6px 16px",
                      borderRadius: 18,
                      background: toneFill(lv.tone),
                      color: toneColor(lv.tone),
                      fontSize: 28,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {lv.text}
                  </div>
                )}
                {spark}
              </div>
            );
          })}
        </div>
      )}

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
