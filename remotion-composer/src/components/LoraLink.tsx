import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted";

export interface LoraChirpRow {
  /** Spreading factor 5..12: one symbol lasts 2^SF / BW. */
  sf: number;
  /** Text right of the SF name, e.g. "1,02 ms/ký hiệu · 5,5 kbps". */
  sub?: string;
  tone?: Tone;
  atSeconds?: number;
  /** Seconds the pen takes to draw the row (default 1.4). */
  drawSeconds?: number;
}

export interface LoraChirps {
  /** Bandwidth in kHz (default 125); sets the symbol time of every row. */
  bwKHz?: number;
  /** Time span of the plot in ms (default: one symbol of the largest SF). */
  spanMs?: number;
  rows: LoraChirpRow[];
  /** Caption under the rows. */
  caption?: string;
  captionAtSeconds?: number;
  atSeconds?: number;
}

export interface LoraBandSegment {
  from: number;
  to: number;
  label: string;
  tone?: Tone;
  /** 0 = lane next to the ruler, 1 = the lane above it. */
  row?: number;
  atSeconds?: number;
  /** Draws a red cross over the segment from this time. */
  crossAtSeconds?: number;
}

export interface LoraBandMarker {
  mhz: number;
  label: string;
  atSeconds?: number;
}

export interface LoraGauge {
  label: string;
  /** Fill 0..1 of the bar. */
  value: number;
  valueText: string;
  /** Limit line 0..1 with its text, e.g. the legal maximum. */
  limit?: number;
  limitText?: string;
  tone?: Tone;
  /** [[seconds, value]] eases the fill (e.g. 22 dBm turned down to 14 dBm). */
  valueTrack?: [number, number][];
  /** [[seconds, text]] replaces the value text. */
  textTrack?: [number, string][];
  atSeconds?: number;
}

export interface LoraBands {
  minMHz: number;
  maxMHz: number;
  tickMHz?: number;
  segments: LoraBandSegment[];
  markers?: LoraBandMarker[];
  gauges?: LoraGauge[];
  atSeconds?: number;
}

export interface LoraNode {
  /** Position along the path 0..1. */
  x: number;
  label: string;
  /** [[seconds, metres]] antenna height above the ground under the node. */
  heightTrack: [number, number][];
}

export interface LoraPacket {
  atSeconds: number;
  /** false: the packet fades out where the path is blocked. */
  ok?: boolean;
  /** Travel time in seconds (default 0.9). */
  seconds?: number;
}

export interface LoraStatus {
  atSeconds: number;
  text: string;
  tone?: Tone;
}

export interface LoraProfile {
  /** Path length in km (ruler and Fresnel radius). */
  distanceKm: number;
  /** Carrier frequency in MHz for the Fresnel radius (default 922). */
  freqMHz?: number;
  /** [[x 0..1, metres]] ground profile (buildings and hills), linear between keys. */
  terrain: [number, number][];
  /** Top of the vertical axis in metres (default 60). */
  maxHeightM?: number;
  nodes: [LoraNode, LoraNode];
  /** When the 60 % Fresnel zone fades in (unset = hidden). */
  fresnelAtSeconds?: number;
  fresnelLabel?: string;
  packets?: LoraPacket[];
  status?: LoraStatus[];
  /** Label under the ruler, e.g. "5 km". */
  distanceLabel?: string;
  atSeconds?: number;
}

interface LoraLinkProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  chirps?: LoraChirps;
  bands?: LoraBands;
  profile?: LoraProfile;
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
const fmt = (v: number) => String(v).replace(".", ",");

/** Piecewise ease between [[t, v]] keys (seconds); before the first key the first value holds. */
const track = (keys: [number, number][] | undefined, t: number, fallback: number) => {
  if (!keys || keys.length === 0) return fallback;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t < t1) {
      const k = Math.min(1, (t - t0) / Math.min(0.8, t1 - t0));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return v0 + (v1 - v0) * e;
    }
  }
  return keys[keys.length - 1][1];
};

const step = <T,>(keys: [number, T][] | undefined, t: number): T | undefined => {
  if (!keys || keys.length === 0) return undefined;
  let v = keys[0][1];
  for (const [s, x] of keys) if (t >= s) v = x;
  return v;
};

/**
 * LoRa link explainer card. Three optional panels, stacked:
 * - chirps: one lane per spreading factor, up-chirps sweeping the bandwidth; each SF step doubles the symbol time;
 * - bands: a MHz ruler with allowed / not allowed segments, markers and gauges (power, airtime);
 * - profile: side view of a link over terrain, antenna masts with height tracks, the 60 % Fresnel zone that turns red
 *   where the ground cuts into it, packets travelling (or dying) along the line of sight, and a status pill.
 */
export const LoraLink: React.FC<LoraLinkProps> = ({
  name,
  eyebrow,
  tagline,
  chirps,
  bands,
  profile,
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
  const life = (from?: number) => (from === undefined ? 1 : pop(at(from, 0)));
  const toneColor = (tone?: Tone) =>
    tone === "accent" ? accentColor : tone === "good" ? proColor : tone === "bad" ? conColor : tone === "muted" ? mutedColor : textColor;
  const head = pop(0, 18);

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
    padding: "26px 26px 22px",
  };

  // ------------------------------------------------------------------ chirps
  const chirpPanel = (c: LoraChirps) => {
    const bw = (c.bwKHz ?? 125) * 1000;
    const maxSf = Math.max(...c.rows.map((r) => r.sf));
    const span = c.spanMs ?? (Math.pow(2, maxSf) / bw) * 1000;
    const X0 = 150;
    const X1 = 980;
    const W = X1 - X0;
    const laneH = c.rows.length === 1 ? 220 : 112;
    const gap = 50;
    const h = c.rows.length * (laneH + gap) + 30;
    return (
      <div style={{ ...card, opacity: life(c.atSeconds) }}>
        <svg viewBox={`0 0 1000 ${h}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {c.rows.map((r, i) => {
            const y0 = 20 + i * (laneH + gap);
            const v = life(r.atSeconds);
            const startF = at(r.atSeconds, 0);
            const drawF = Math.round((r.drawSeconds ?? 1.4) * fps);
            const k = r.atSeconds === undefined || r.atSeconds <= 0 ? 1 : interpolate(frame, [startF, startF + drawF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const sym = (Math.pow(2, r.sf) / bw) * 1000; // ms
            const symW = (sym / span) * W;
            const n = Math.ceil(W / symW);
            const reach = X0 + W * k;
            let d = "";
            for (let j = 0; j < n; j++) {
              const xa = X0 + j * symW;
              if (xa >= reach) break;
              const xb = Math.min(xa + symW, reach, X1);
              const yb = y0 + laneH - ((xb - xa) / symW) * laneH;
              d += `M ${xa} ${y0 + laneH} L ${xb} ${yb} `;
              if (xa + symW < Math.min(reach, X1)) d += `M ${xb} ${y0} L ${xb} ${y0 + laneH} `;
            }
            const color = toneColor(r.tone ?? "accent");
            return (
              <g key={`r${i}`} opacity={v}>
                <rect x={X0} y={y0} width={W} height={laneH} rx={8} fill="rgba(0,0,0,0.035)" />
                <text x={X0 - 18} y={y0 + laneH / 2 + 4} textAnchor="end" fontSize={38} fontWeight={700} fill={textColor}>
                  {`SF${r.sf}`}
                </text>
                <path d={d} fill="none" stroke={color} strokeWidth={r.sf >= 11 ? 5 : 3} strokeLinejoin="round" />
                {r.sub && (
                  <text x={X1} y={y0 + laneH + 26} textAnchor="end" fontSize={26} fontWeight={600} fill={color}>
                    {r.sub}
                  </text>
                )}
              </g>
            );
          })}
          <text x={X0} y={h - 6} fontSize={24} fill={mutedColor}>
            {`0 → ${fmt(Math.round(span * 10) / 10)} ms · trục dọc: tần số quét hết ${fmt((c.bwKHz ?? 125))} kHz`}
          </text>
        </svg>
        {c.caption && (
          <div style={{ fontSize: 28, lineHeight: 1.35, color: mutedColor, padding: "6px 14px 0", opacity: life(c.captionAtSeconds) }}>{c.caption}</div>
        )}
      </div>
    );
  };

  // ------------------------------------------------------------------ bands
  const bandPanel = (b: LoraBands) => {
    const X0 = 40;
    const X1 = 960;
    const xm = (mhz: number) => X0 + ((mhz - b.minMHz) / (b.maxMHz - b.minMHz)) * (X1 - X0);
    const rulerY = 250;
    const laneY = [rulerY - 86, rulerY - 176];
    const tick = b.tickMHz ?? 10;
    const ticks: number[] = [];
    for (let m = Math.ceil(b.minMHz / tick) * tick; m <= b.maxMHz; m += tick) ticks.push(m);
    const gauges = b.gauges ?? [];
    return (
      <div style={{ ...card, opacity: life(b.atSeconds) }}>
        <svg viewBox="0 0 1000 330" style={{ width: "100%", display: "block", overflow: "visible" }}>
          {b.segments.map((s, i) => {
            const v = life(s.atSeconds);
            const c = toneColor(s.tone);
            const y = laneY[s.row ?? 0];
            const x0 = xm(s.from);
            const x1 = xm(s.to);
            const crossF = s.crossAtSeconds === undefined ? undefined : at(s.crossAtSeconds, 0);
            const cross = crossF === undefined || frame < crossF ? 0 : spring({ frame: frame - crossF, fps, config: { damping: 14, stiffness: 140 } });
            const mid = (x0 + x1) / 2;
            return (
              <g key={`s${i}`} opacity={v}>
                <rect x={x0} y={y} width={Math.max(8, x1 - x0)} height={64} rx={10} fill={c} fillOpacity={0.16} stroke={c} strokeWidth={3} />
                <line x1={x0} y1={y + 64} x2={x0} y2={rulerY} stroke={c} strokeWidth={2} strokeDasharray="6 6" />
                <line x1={x1} y1={y + 64} x2={x1} y2={rulerY} stroke={c} strokeWidth={2} strokeDasharray="6 6" />
                <text x={Math.min(Math.max(mid, 120), 880)} y={x1 - x0 > 150 ? y + 43 : y - 12} textAnchor="middle" fontSize={28} fontWeight={700} fill={c} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
                  {s.label}
                </text>
                {cross > 0 && (
                  <g opacity={cross} transform={`translate(${mid} ${y + 32}) scale(${0.6 + 0.4 * cross})`}>
                    <line x1={-24} y1={-24} x2={24} y2={24} stroke={conColor} strokeWidth={8} strokeLinecap="round" />
                    <line x1={24} y1={-24} x2={-24} y2={24} stroke={conColor} strokeWidth={8} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}
          <line x1={X0} y1={rulerY} x2={X1} y2={rulerY} stroke={textColor} strokeWidth={3} />
          {ticks.map((m) => (
            <g key={`t${m}`}>
              <line x1={xm(m)} y1={rulerY} x2={xm(m)} y2={rulerY + 14} stroke={textColor} strokeWidth={2} />
              <text x={xm(m)} y={rulerY + 44} textAnchor="middle" fontSize={26} fill={mutedColor}>
                {m}
              </text>
            </g>
          ))}
          <text x={X1} y={rulerY + 80} textAnchor="end" fontSize={26} fill={mutedColor}>
            MHz
          </text>
          {(b.markers ?? []).map((m, i) => (
            <g key={`m${i}`} opacity={life(m.atSeconds)}>
              <path d={`M ${xm(m.mhz)} ${rulerY - 4} l -10 -18 l 20 0 Z`} fill={accentColor} />
              <text x={xm(m.mhz)} y={rulerY + 80} textAnchor="middle" fontSize={26} fontWeight={700} fill={accentColor}>
                {m.label}
              </text>
            </g>
          ))}
        </svg>
        {gauges.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "10px 14px 4px" }}>
            {gauges.map((g, i) => {
              const v = life(g.atSeconds);
              const val = Math.max(0, Math.min(1, track(g.valueTrack, t, g.value)));
              const txt = step(g.textTrack, t) ?? g.valueText;
              const c = toneColor(g.tone ?? "accent");
              return (
                <div key={`g${i}`} style={{ opacity: v }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
                    <div style={{ fontSize: 32, fontWeight: 600, color: textColor }}>{g.label}</div>
                    <div style={{ fontSize: 34, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{txt}</div>
                  </div>
                  <div style={{ position: "relative", height: 30, borderRadius: 15, background: "rgba(0,0,0,0.07)", marginTop: 10 }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${val * 100}%`, borderRadius: 15, background: c }} />
                    {g.limit !== undefined && (
                      <div style={{ position: "absolute", left: `${g.limit * 100}%`, top: -8, bottom: -8, width: 4, background: textColor, borderRadius: 2 }} />
                    )}
                  </div>
                  {g.limitText && <div style={{ fontSize: 26, color: mutedColor, marginTop: 8 }}>{g.limitText}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ------------------------------------------------------------------ profile
  const profilePanel = (p: LoraProfile) => {
    const VH = 600;
    const X0 = 40;
    const X1 = 960;
    const GROUND = 520; // y of 0 m
    const TOP = 40;
    const maxH = p.maxHeightM ?? 60;
    const ym = (m: number) => GROUND - (m / maxH) * (GROUND - TOP);
    const xs = (x: number) => X0 + x * (X1 - X0);
    const ground = (x: number) => {
      const k = p.terrain;
      if (x <= k[0][0]) return k[0][1];
      for (let i = 1; i < k.length; i++) {
        if (x <= k[i][0]) {
          const f = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
          return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * f;
        }
      }
      return k[k.length - 1][1];
    };
    const [na, nb] = p.nodes;
    const ha = ground(na.x) + track(na.heightTrack, t, na.heightTrack[0][1]);
    const hb = ground(nb.x) + track(nb.heightTrack, t, nb.heightTrack[0][1]);
    const los = (x: number) => ha + ((x - na.x) / (nb.x - na.x)) * (hb - ha);
    const f = (p.freqMHz ?? 922) / 1000;
    const D = p.distanceKm * (nb.x - na.x);
    // First Fresnel zone radius (m) at a point d1 km from A: 17.32 * sqrt(d1 d2 / (f D)); the clear zone is 60 % of it.
    const r60 = (x: number) => {
      const d1 = ((x - na.x) / (nb.x - na.x)) * D;
      const d2 = D - d1;
      return 0.6 * 17.32 * Math.sqrt(Math.max(0, (d1 * d2) / (f * D)));
    };
    const N = 80;
    const samples = Array.from({ length: N + 1 }, (_, i) => na.x + ((nb.x - na.x) * i) / N);
    const blocked = samples.some((x) => ground(x) > los(x) - r60(x));
    const losBlocked = samples.some((x) => ground(x) > los(x));
    const fz = p.fresnelAtSeconds === undefined ? 0 : life(p.fresnelAtSeconds);
    const zoneColor = blocked ? conColor : proColor;
    const upper = samples.map((x) => `${xs(x)},${ym(los(x) + r60(x))}`).join(" ");
    const lower = samples.slice().reverse().map((x) => `${xs(x)},${ym(los(x) - r60(x))}`).join(" ");
    const terrainPts = [`${xs(0)},${GROUND}`, ...Array.from({ length: 101 }, (_, i) => `${xs(i / 100)},${ym(ground(i / 100))}`), `${xs(1)},${GROUND}`].join(" ");
    const status = [...(p.status ?? [])].reverse().find((s) => t >= s.atSeconds);
    // Packets: a dot from A to B along the line of sight; a failed one fades where the ground or zone cuts in.
    const firstCut = samples.find((x) => ground(x) > los(x) - r60(x) * 0.3);
    const packetEls = (p.packets ?? []).map((pk, i) => {
      const dur = pk.seconds ?? 0.9;
      const k = (t - pk.atSeconds) / dur;
      if (k < 0 || k > 1.15) return null;
      const kk = Math.min(1, k);
      const x = na.x + (nb.x - na.x) * kk;
      const dying = pk.ok === false && firstCut !== undefined && x >= firstCut;
      const alpha = pk.ok === false ? (dying ? Math.max(0, 1 - (x - firstCut!) / 0.08) : 1) : k > 1 ? 1 - (k - 1) / 0.15 : 1;
      const c = pk.ok === false ? conColor : accentColor;
      return (
        <g key={`p${i}`} opacity={alpha}>
          <circle cx={xs(x)} cy={ym(los(x))} r={16} fill={c} />
          <circle cx={xs(x)} cy={ym(los(x))} r={28} fill="none" stroke={c} strokeWidth={3} opacity={0.5} />
        </g>
      );
    });
    const mast = (n: LoraNode, top: number) => {
      const x = xs(n.x);
      const g = ym(ground(n.x));
      return (
        <g>
          <line x1={x} y1={g} x2={x} y2={ym(top)} stroke={textColor} strokeWidth={6} strokeLinecap="round" />
          <rect x={x - 14} y={ym(top) - 30} width={28} height={36} rx={6} fill={accentColor} />
          <text x={x} y={ym(top) - 44} textAnchor="middle" fontSize={28} fontWeight={700} fill={textColor} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
            {n.label}
          </text>
          <text x={x + (n.x < 0.5 ? 20 : -20)} y={(g + ym(top)) / 2 + 10} textAnchor={n.x < 0.5 ? "start" : "end"} fontSize={26} fontWeight={600} fill={mutedColor} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
            {`${Math.round(top - ground(n.x))} m`}
          </text>
        </g>
      );
    };
    return (
      <div style={{ ...card, opacity: life(p.atSeconds) }}>
        <svg viewBox={`0 0 1000 ${VH + 70}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {fz > 0 && <polygon points={`${upper} ${lower}`} fill={zoneColor} fillOpacity={0.14 * fz} stroke={zoneColor} strokeWidth={3} strokeOpacity={fz} strokeDasharray="10 8" />}
          <polygon points={terrainPts} fill="#D2D2D7" stroke="#A1A1A6" strokeWidth={2} />
          <line x1={xs(na.x)} y1={ym(ha)} x2={xs(nb.x)} y2={ym(hb)} stroke={losBlocked ? conColor : textColor} strokeWidth={3} strokeDasharray={losBlocked ? "4 8" : undefined} />
          {packetEls}
          {mast(na, ha)}
          {mast(nb, hb)}
          {fz > 0 && p.fresnelLabel && (
            <text x={500} y={ym(los(0.5) + r60(0.5)) - 16} textAnchor="middle" fontSize={28} fontWeight={700} fill={zoneColor} opacity={fz} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
              {p.fresnelLabel}
            </text>
          )}
          <line x1={xs(na.x)} y1={VH + 10} x2={xs(nb.x)} y2={VH + 10} stroke={mutedColor} strokeWidth={2} />
          <line x1={xs(na.x)} y1={VH - 2} x2={xs(na.x)} y2={VH + 22} stroke={mutedColor} strokeWidth={2} />
          <line x1={xs(nb.x)} y1={VH - 2} x2={xs(nb.x)} y2={VH + 22} stroke={mutedColor} strokeWidth={2} />
          <text x={(xs(na.x) + xs(nb.x)) / 2} y={VH + 52} textAnchor="middle" fontSize={30} fontWeight={600} fill={mutedColor}>
            {p.distanceLabel ?? `${fmt(p.distanceKm)} km`}
          </text>
        </svg>
        {status && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 6 }}>
            <div
              style={{
                fontSize: 34,
                fontWeight: 600,
                color: toneColor(status.tone),
                background: "rgba(255,255,255,0.9)",
                border: `2px solid ${toneColor(status.tone)}`,
                borderRadius: 40,
                padding: "10px 28px",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {status.text}
            </div>
          </div>
        )}
      </div>
    );
  };

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
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {profile && profilePanel(profile)}
      {chirps && chirpPanel(chirps)}
      {bands && bandPanel(bands)}

      {caption && (
        <div style={{ fontSize: 28, lineHeight: 1.35, color: mutedColor, padding: "0 14px", opacity: life(captionAtSeconds) }}>{caption}</div>
      )}

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
