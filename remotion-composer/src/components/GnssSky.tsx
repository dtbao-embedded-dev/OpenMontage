import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

/** GNSS constellation of a satellite: G = GPS, R = GLONASS, E = Galileo, C = BeiDou. */
export type GnssSystem = "G" | "R" | "E" | "C";

export interface GnssSat {
  /** Label under the bar and next to the dot, e.g. "G12". */
  id: string;
  sys?: GnssSystem;
  /** Azimuth in degrees (0 = north, clockwise). */
  az: number;
  /** Elevation in degrees (0 = horizon, 90 = zenith). */
  el: number;
  /** Seconds after cut start when the satellite appears; unset = from the first frame. */
  atSeconds?: number;
  /** Signal level track [[s, 0..1]], linear between points; default 0.8 throughout. */
  levelTrack?: [number, number][];
  /** Windows [[start, end]] in which the satellite is used in the fix (filled dot, ray to the receiver). */
  used?: [number, number][];
}

export interface GnssWindow {
  atSeconds: number;
  untilSeconds?: number;
  label?: string;
}

export interface GnssStatus {
  atSeconds: number;
  text: string;
  tone?: "neutral" | "good" | "bad" | "accent" | "wait";
}

export interface GnssTimer {
  label: string;
  startAtSeconds: number;
  stopAtSeconds?: number;
  atSeconds?: number;
  /** Receiver seconds per video second (default 1), e.g. 2.7 to show a 27 s cold start in 10 s. */
  scale?: number;
  /** Small note next to the clock while it runs faster than real time, e.g. "tua nhanh". */
  scaleLabel?: string;
}

export interface GnssProgress {
  label: string;
  startAtSeconds: number;
  endAtSeconds: number;
  doneLabel?: string;
  atSeconds?: number;
}

export interface GnssReadout {
  label: string;
  values: { atSeconds: number; text: string; tone?: GnssStatus["tone"] }[];
  atSeconds?: number;
}

interface GnssSkyProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  sats: GnssSat[];
  /** Roof windows: a house roof and ceiling drawn over the sky plot. */
  roof?: GnssWindow[];
  status?: GnssStatus[];
  timer?: GnssTimer;
  progress?: GnssProgress;
  readouts?: GnssReadout[];
  /** Level (0..1) a signal needs to be used; drawn as a dashed line over the bars. */
  threshold?: number;
  thresholdLabel?: string;
  /** Sky plot diameter in px (default 540). */
  plotSize?: number;
  /** Hide the signal bars under the plot. */
  hideBars?: boolean;
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
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";
const SYS_COLOR: Record<GnssSystem, string> = { G: "#0066CC", R: "#B4235A", E: "#1D7A34", C: "#B25E00" };

const track = (tr: [number, number][] | undefined, t: number, dflt: number) => {
  if (!tr || tr.length === 0) return dflt;
  if (t <= tr[0][0]) return tr[0][1];
  for (let i = 1; i < tr.length; i++) {
    if (t <= tr[i][0]) {
      const [t0, v0] = tr[i - 1];
      const [t1, v1] = tr[i];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return tr[tr.length - 1][1];
};

const inWindows = (w: [number, number][] | undefined, t: number) => !!w && w.some(([a, b]) => t >= a && t < b);

/**
 * GNSS receiver view: a polar sky plot (horizon ring, 30/60 degree rings, N/E/S/W) with satellites as discs
 * coloured by constellation, rays from the satellites used in the fix to the receiver in the centre, an optional
 * roof drawn over the sky, per-satellite signal bars against a threshold, a fix-status pill, a TTFF timer,
 * an ephemeris download bar and value readouts. Illustration, not a live receiver.
 */
export const GnssSky: React.FC<GnssSkyProps> = ({
  name,
  eyebrow,
  tagline,
  sats,
  roof = [],
  status = [],
  timer,
  progress,
  readouts = [],
  threshold = 0.45,
  thresholdLabel,
  plotSize = 540,
  hideBars = false,
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
  const pop = (start: number, damping = 16) =>
    start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });
  const toneColor = (tone: GnssStatus["tone"] | undefined) =>
    tone === "good" ? proColor : tone === "bad" ? conColor : tone === "accent" ? accentColor : tone === "wait" ? "#B25E00" : textColor;

  const head = pop(0, 18);
  const R = plotSize / 2;
  const pad = 46; // room for N/E/S/W labels
  const box = plotSize + pad * 2;
  const cx = box / 2;
  const cy = box / 2;
  const pos = (az: number, el: number) => {
    const r = R * (1 - el / 90);
    const a = ((az - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  // Roof amount 0..1 (fades in and out over 12 frames).
  const roofAmt = roof.reduce((m, w) => {
    const a = Math.round(w.atSeconds * fps);
    const b = w.untilSeconds === undefined ? Infinity : Math.round(w.untilSeconds * fps);
    const kin = a <= 0 ? 1 : interpolate(frame, [a, a + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const kout = Number.isFinite(b) ? interpolate(frame, [b, b + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
    return Math.max(m, Math.min(kin, kout));
  }, 0);
  const roofLabel = [...roof].reverse().find((w) => t >= w.atSeconds)?.label;

  const current = [...status].sort((a, b) => a.atSeconds - b.atSeconds).filter((s) => t >= s.atSeconds).pop();
  const statusStart = current ? Math.round(current.atSeconds * fps) : 0;
  const sp = current ? (statusStart <= 0 ? 1 : spring({ frame: frame - statusStart, fps, config: { damping: 14, stiffness: 160 } })) : 0;

  const visible = sats.map((s) => pop(at(s.atSeconds, 0)));
  const levels = sats.map((s) => track(s.levelTrack, t, 0.8));
  const used = sats.map((s) => inWindows(s.used, t));

  const mmss = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const barH = 210;
  const barW = Math.min(64, Math.floor(800 / Math.max(1, sats.length)) - 14);

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        fontVariantLigatures: "none",
        padding: portrait ? (layout === "centered" ? "230px 100px 300px 100px" : "230px 160px 300px 88px") : "100px 140px",
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
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "24px 26px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          position: "relative",
        }}
      >
        {/* Status pill + timer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 64 }}>
          <div
            style={{
              padding: "10px 22px",
              borderRadius: 999,
              background: current ? toneColor(current.tone) : "transparent",
              color: "#FFFFFF",
              fontSize: 32,
              fontWeight: 600,
              whiteSpace: "nowrap",
              opacity: sp,
              transform: `scale(${interpolate(sp, [0, 1], [0.85, 1])})`,
              transformOrigin: "0% 50%",
            }}
          >
            {current?.text}
          </div>
          {timer && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, opacity: pop(at(timer.atSeconds, 0)) }}>
              <div style={{ fontSize: 28, color: mutedColor }}>
                {timer.label}
                {timer.scaleLabel && (timer.scale ?? 1) !== 1 && <span style={{ marginLeft: 8, fontSize: 24 }}>({timer.scaleLabel})</span>}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 48, fontWeight: 700, color: textColor, fontVariantNumeric: "tabular-nums" }}>
                {mmss(
                  t < timer.startAtSeconds
                    ? 0
                    : (Math.min(t, timer.stopAtSeconds ?? Infinity) - timer.startAtSeconds) * (timer.scale ?? 1)
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sky plot */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{ overflow: "visible" }}>
            <defs>
              <pattern id="gnss-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="18" height="18" fill="rgba(94,94,99,0.18)" />
                <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(94,94,99,0.35)" strokeWidth="6" />
              </pattern>
            </defs>
            <circle cx={cx} cy={cy} r={R} fill="rgba(0,102,204,0.05)" stroke="rgba(0,0,0,0.18)" strokeWidth={2} />
            {[30, 60].map((e) => (
              <circle key={e} cx={cx} cy={cy} r={R * (1 - e / 90)} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={2} strokeDasharray="6 8" />
            ))}
            <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="rgba(0,0,0,0.08)" strokeWidth={2} />
            <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="rgba(0,0,0,0.08)" strokeWidth={2} />
            {[["B", cx, cy - R - 16], ["Đ", cx + R + 22, cy + 10], ["N", cx, cy + R + 36], ["T", cx - R - 22, cy + 10]].map(([l, x, y]) => (
              <text key={l as string} x={x as number} y={y as number} textAnchor="middle" fontSize={28} fontWeight={600} fill={mutedColor} fontFamily={FONT}>
                {l}
              </text>
            ))}

            {/* Rays from used satellites to the receiver */}
            {sats.map((s, i) => {
              if (!used[i] || visible[i] < 0.5) return null;
              const [x, y] = pos(s.az + t * 0.3, s.el);
              const col = SYS_COLOR[s.sys ?? "G"];
              const k = ((t * 0.9 + i * 0.37) % 1 + 1) % 1;
              return (
                <g key={"ray" + s.id}>
                  <line x1={x} y1={y} x2={cx} y2={cy} stroke={col} strokeOpacity={0.45} strokeWidth={3} strokeDasharray="8 10" />
                  <circle cx={x + (cx - x) * k} cy={y + (cy - y) * k} r={6} fill={col} />
                </g>
              );
            })}

            {/* Satellites */}
            {sats.map((s, i) => {
              const v = visible[i];
              if (v <= 0.01) return null;
              const [x, y] = pos(s.az + t * 0.3, s.el);
              const col = SYS_COLOR[s.sys ?? "G"];
              const weak = levels[i] < threshold;
              const op = v * (weak ? 0.45 + 0.35 * levels[i] : 1);
              return (
                <g key={s.id} opacity={op} transform={`translate(${x} ${y}) scale(${interpolate(v, [0, 1], [0.4, 1])})`}>
                  <circle r={22} fill={used[i] ? col : "#FFFFFF"} stroke={col} strokeWidth={4} />
                  <rect x={-34} y={-5} width={14} height={10} rx={2} fill={col} opacity={0.8} />
                  <rect x={20} y={-5} width={14} height={10} rx={2} fill={col} opacity={0.8} />
                  <text y={46} textAnchor="middle" fontSize={24} fontWeight={700} fill={textColor} fontFamily={FONT}>
                    {s.id}
                  </text>
                </g>
              );
            })}

            {/* Receiver */}
            <g transform={`translate(${cx} ${cy})`}>
              <rect x={-26} y={-26} width={52} height={52} rx={8} fill="#C9A227" stroke="#8C6D12" strokeWidth={3} />
              <rect x={-12} y={-12} width={24} height={24} rx={3} fill="#E9D98A" />
              <circle r={4} fill="#8C6D12" />
            </g>

            {/* Roof over the sky */}
            {roofAmt > 0.01 && (
              <g opacity={roofAmt}>
                <path
                  d={`M ${cx - R - 30} ${cy - 40} L ${cx} ${cy - R - 10} L ${cx + R + 30} ${cy - 40} Z`}
                  fill="url(#gnss-hatch)"
                  stroke="#5E5E63"
                  strokeWidth={5}
                  strokeLinejoin="round"
                />
                <rect x={cx - R + 10} y={cy - 46} width={2 * R - 20} height={26} fill="#8E8E93" rx={4} />
                {roofLabel && (
                  <g transform={`translate(${cx} ${cy - R * 0.42})`}>
                    <rect x={-190} y={-30} width={380} height={56} rx={28} fill="#FFFFFF" stroke="#5E5E63" strokeWidth={2} />
                    <text y={10} textAnchor="middle" fontSize={30} fontWeight={600} fill={textColor} fontFamily={FONT}>
                      {roofLabel}
                    </text>
                  </g>
                )}
              </g>
            )}
          </svg>
        </div>

        {/* Signal bars */}
        {!hideBars && (
          <div style={{ borderTop: `2px solid ${borderColor}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor }}>Tín hiệu từng vệ tinh</div>
              {thresholdLabel && <div style={{ fontSize: 26, color: mutedColor }}>- - {thresholdLabel}</div>}
            </div>
            <div style={{ position: "relative", height: barH + 40 }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: barH * (1 - threshold),
                  borderTop: `3px dashed ${mutedColor}`,
                  opacity: 0.7,
                }}
              />
              <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", gap: 14 }}>
                {sats.map((s, i) => {
                  const v = visible[i];
                  const col = SYS_COLOR[s.sys ?? "G"];
                  const lv = Math.max(0, Math.min(1, levels[i])) * v;
                  const weak = levels[i] < threshold;
                  return (
                    <div key={"bar" + s.id} style={{ width: barW, display: "flex", flexDirection: "column", alignItems: "center", opacity: v }}>
                      <div style={{ height: barH, width: "100%", display: "flex", alignItems: "flex-end" }}>
                        <div
                          style={{
                            width: "100%",
                            height: barH * lv,
                            borderRadius: "10px 10px 4px 4px",
                            background: used[i] ? col : weak ? "rgba(94,94,99,0.35)" : "rgba(29,29,31,0.55)",
                          }}
                        />
                      </div>
                      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 600, color: used[i] ? col : mutedColor }}>{s.id}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Ephemeris progress */}
        {progress && (() => {
          const p = pop(at(progress.atSeconds, progress.startAtSeconds));
          const k = interpolate(t, [progress.startAtSeconds, progress.endAtSeconds], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const done = k >= 1;
          return (
            <div style={{ opacity: t >= (progress.atSeconds ?? progress.startAtSeconds) ? p : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, color: done ? proColor : textColor }}>{done && progress.doneLabel ? progress.doneLabel : progress.label}</div>
                <div style={{ fontFamily: MONO, color: mutedColor }}>{Math.round(k * 100)}%</div>
              </div>
              <div style={{ height: 22, borderRadius: 11, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                <div style={{ width: `${k * 100}%`, height: "100%", borderRadius: 11, background: done ? proColor : accentColor }} />
              </div>
            </div>
          );
        })()}

        {/* Readouts */}
        {readouts.length > 0 && (
          <div style={{ display: "flex", gap: 16 }}>
            {readouts.map((r, i) => {
              const p = pop(at(r.atSeconds, 0));
              const cur = [...r.values].sort((a, b) => a.atSeconds - b.atSeconds).filter((v) => t >= v.atSeconds).pop();
              const changed = cur ? frame - Math.round(cur.atSeconds * fps) : 99;
              const flash = cur && cur.atSeconds > 0 ? interpolate(changed, [0, 14], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
              return (
                <div
                  key={r.label + i}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 22,
                    padding: "14px 18px",
                    background: `rgba(0,102,204,${0.04 + 0.12 * flash})`,
                    border: `2px solid ${borderColor}`,
                    opacity: p,
                  }}
                >
                  <div style={{ fontSize: 26, color: mutedColor }}>{r.label}</div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: readouts.length > 2 ? 34 : 40,
                      fontWeight: 700,
                      color: toneColor(cur?.tone),
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {cur?.text ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {caption && (
          <div style={{ fontSize: 28, color: mutedColor, lineHeight: 1.35, opacity: pop(at(captionAtSeconds, 0)) }}>{caption}</div>
        )}
      </div>

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
