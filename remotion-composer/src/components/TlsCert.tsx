import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export type CertTone = "neutral" | "good" | "bad" | "accent" | "wait";

export interface CertRow {
  label: string;
  value: string;
  atSeconds?: number;
  /** Tints the value (e.g. the validity row turns red when the clock is outside it). */
  tone?: CertTone;
  /** Tone change of this row over time. */
  toneSteps?: { atSeconds: number; tone: CertTone }[];
}

export interface CertCard {
  /** Card heading, e.g. "Chứng chỉ broker". */
  title: string;
  /** Small text right of the heading, e.g. "X.509 · PEM". */
  detail?: string;
  rows: CertRow[];
  atSeconds?: number;
  /** Rubber stamp over the card (e.g. "Chưa có hiệu lực"), from `atSeconds` to `untilSeconds`. */
  stamp?: { text: string; tone: CertTone; atSeconds: number; untilSeconds?: number };
}

export interface CertClockPoint {
  atSeconds: number;
  /** Decimal year on the axis (1970.0 = 1 Jan 1970). */
  year: number;
  /** Clock text shown big, e.g. "01/01/1970 00:00:05". */
  text: string;
}

export interface CertClock {
  label?: string;
  /** Clock over time; the marker glides to each new point. */
  track: CertClockPoint[];
  /** Certificate validity on the same axis (decimal years) and its labels. */
  validFrom: number;
  validTo: number;
  fromLabel?: string;
  toLabel?: string;
  /** Left and right axis windows (decimal years) joined by a break mark. */
  leftWindow?: [number, number];
  rightWindow?: [number, number];
  /** Integer years to tick on the axis. */
  ticks?: number[];
  atSeconds?: number;
}

export interface CertVerdict {
  atSeconds: number;
  text: string;
  tone: CertTone;
}

export interface CertLogLine {
  text: string;
  atSeconds?: number;
  tone?: CertTone;
}

export interface CertLog {
  title?: string;
  lines: (string | CertLogLine)[];
  atSeconds?: number;
  /** Seconds to reveal lines without their own `atSeconds` (default 1.2). */
  revealSeconds?: number;
  fontSize?: number;
  /** Small source line under the log, e.g. "esp32.com · log thật". */
  source?: string;
}

interface TlsCertProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  cards?: CertCard[];
  clock?: CertClock;
  verdict?: CertVerdict[];
  log?: CertLog;
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

function latest<T extends { atSeconds: number }>(values: T[] | undefined, t: number): T | undefined {
  let out: T | undefined;
  for (const v of values ?? []) if (v.atSeconds <= t + 1e-6) out = v;
  return out;
}

export const TlsCert: React.FC<TlsCertProps> = ({
  name,
  eyebrow,
  tagline,
  cards = [],
  clock,
  verdict = [],
  log,
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
  // Anything due at time 0 is drawn fully from the first frame, so a cut into this scene never shows a blank card.
  const pop = (s: number | undefined, fallback = 0, damping = 16) => {
    const start = Math.round((s ?? fallback) * fps);
    return start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });
  };
  const pulse = (start: number, len = 0.9) =>
    interpolate(t - start, [0, 0.12, len], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const toneColor = (tone: CertTone | undefined) =>
    tone === "good" ? proColor : tone === "bad" ? conColor : tone === "accent" ? accentColor : tone === "wait" ? mutedColor : textColor;

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };
  const contentW = portrait ? width - (layout === "centered" ? 240 : 248) : 1100;
  const head = pop(0, 0, 18);
  const v = latest(verdict, t);

  const Pill: React.FC<{ vv: CertVerdict; big?: boolean }> = ({ vv, big }) => {
    const p = pop(vv.atSeconds, 0, 14);
    const c = toneColor(vv.tone);
    const mark = vv.tone === "good" ? "✓" : vv.tone === "bad" ? "✕" : vv.tone === "wait" ? "…" : "•";
    return (
      <div key={vv.text + vv.atSeconds} style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: big ? "12px 26px" : "8px 20px",
        borderRadius: 999, background: c, color: "#FFFFFF", fontSize: big ? 38 : 30, fontWeight: 600, whiteSpace: "nowrap",
        opacity: p, transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})` }}>
        <span style={{ fontWeight: 700 }}>{mark}</span>
        {vv.text}
      </div>
    );
  };

  // ------------------------------------------------------------------ clock axis (two windows joined by a break)
  const Clock: React.FC<{ c: CertClock }> = ({ c }) => {
    const L = c.leftWindow ?? [1969.5, 1971.5];
    const R = c.rightWindow ?? [2025.5, 2028.5];
    const W = contentW - 72;
    const lw = W * 0.2, gapW = W * 0.1, rw = W - lw - gapW;
    const x = (y: number) => {
      if (y <= L[1]) return interpolate(y, L, [0, lw], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      if (y >= R[0]) return lw + gapW + interpolate(y, R, [0, rw], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return lw + gapW / 2;
    };
    // Marker glides to the latest clock point over 0.8 s.
    const pts = c.track;
    let year = pts[0]?.year ?? 1970;
    let text = pts[0]?.text ?? "";
    let glide = 1;
    let prevX = x(year);
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].atSeconds <= t + 1e-6) {
        prevX = i > 0 ? x(pts[i - 1].year) : x(pts[i].year);
        year = pts[i].year;
        text = pts[i].text;
        glide = pts[i].atSeconds <= 0 || i === 0 ? 1 : spring({ frame: frame - Math.round(pts[i].atSeconds * fps), fps, config: { damping: 18, stiffness: 90 } });
      }
    }
    const mx = interpolate(glide, [0, 1], [prevX, x(year)]);
    const inside = year >= c.validFrom && year <= c.validTo;
    const cur = latest(pts, t);
    const flash = cur && cur.atSeconds > 0 ? pulse(cur.atSeconds, 1.0) : 0;
    const mc = inside ? proColor : conColor;
    const p = pop(c.atSeconds, 0, 20);
    const bx0 = x(c.validFrom), bx1 = x(c.validTo);
    const ticks = c.ticks ?? [1970, 2026, 2027, 2028];
    return (
      <div style={{ ...card, padding: "26px 36px 30px", opacity: p, transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, minHeight: 50 }}>
          <div style={{ fontSize: 30, color: mutedColor, letterSpacing: "0.005em" }}>{c.label ?? "Đồng hồ ESP32"}</div>
          {v && <Pill vv={v} />}
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: MONO, color: mc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
          background: flash > 0 ? `rgba(0,102,204,${0.12 * flash})` : "transparent", borderRadius: 14, marginLeft: -8, padding: "0 8px", marginTop: 6 }}>{text}</div>
        <div style={{ position: "relative", height: 170, marginTop: 22 }}>
          {/* Axis lines with a break between the windows */}
          <div style={{ position: "absolute", left: 0, width: lw, top: 70, height: 4, background: "#C7C7CC", borderRadius: 2 }} />
          <div style={{ position: "absolute", left: lw + gapW, width: rw, top: 70, height: 4, background: "#C7C7CC", borderRadius: 2 }} />
          <div style={{ position: "absolute", left: lw + gapW / 2 - 24, top: 50, width: 48, textAlign: "center", fontSize: 40, color: mutedColor, fontWeight: 600 }}>≈</div>
          {/* Validity bar */}
          <div style={{ position: "absolute", left: bx0, width: Math.max(8, bx1 - bx0), top: 56, height: 32, borderRadius: 10,
            background: "rgba(29,122,52,0.18)", border: `3px solid ${proColor}` }} />
          <div style={{ position: "absolute", left: bx0, top: 0, fontSize: 26, color: proColor, fontWeight: 600, whiteSpace: "nowrap" }}>
            {c.fromLabel ?? "Hiệu lực"}
          </div>
          {c.toLabel && (
            <div style={{ position: "absolute", right: W - bx1, top: 0, fontSize: 26, color: proColor, fontWeight: 600, whiteSpace: "nowrap" }}>{c.toLabel}</div>
          )}
          {/* Year ticks */}
          {ticks.map((y) => (
            <div key={y} style={{ position: "absolute", left: x(y) - 50, width: 100, top: 100, textAlign: "center", fontSize: 28, color: mutedColor,
              fontVariantNumeric: "tabular-nums" }}>
              <div style={{ width: 3, height: 14, background: "#AEAEB2", margin: "0 auto 6px" }} />
              {y}
            </div>
          ))}
          {/* Clock marker */}
          <div style={{ position: "absolute", left: mx - 14, top: 42, width: 28, height: 60, borderRadius: 14, background: mc,
            boxShadow: `0 0 0 ${8 * flash}px ${inside ? "rgba(29,122,52,0.25)" : "rgba(215,0,21,0.25)"}`, border: "4px solid #FFFFFF" }} />
        </div>
      </div>
    );
  };

  const Card: React.FC<{ c: CertCard; i: number }> = ({ c, i }) => {
    const p = pop(c.atSeconds, 0, 20);
    const sp = c.stamp && t >= c.stamp.atSeconds && (c.stamp.untilSeconds === undefined || t < c.stamp.untilSeconds) ? pop(c.stamp.atSeconds, 0, 12) : 0;
    return (
      <div key={c.title + i} style={{ ...card, position: "relative", padding: "24px 34px 26px", opacity: p, overflow: "hidden",
        transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: accentColor, color: "#FFFFFF", fontSize: 26, display: "flex",
              alignItems: "center", justifyContent: "center", fontWeight: 700 }}>✎</div>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.015em", color: textColor }}>{c.title}</div>
          </div>
          {c.detail && <div style={{ fontSize: 28, color: mutedColor, whiteSpace: "nowrap" }}>{c.detail}</div>}
        </div>
        {c.rows.map((r, k) => {
          const rp = pop(r.atSeconds, 0, 18);
          const tone = latest(r.toneSteps, t)?.tone ?? r.tone;
          const fl = (r.toneSteps ?? []).reduce((m, s) => Math.max(m, s.atSeconds > 0 ? pulse(s.atSeconds, 1.0) : 0), 0);
          return (
            <div key={r.label + k} style={{ display: "flex", gap: 20, alignItems: "baseline", padding: "9px 12px", margin: "0 -12px", borderRadius: 14,
              borderTop: k === 0 ? "none" : "1px solid rgba(0,0,0,0.06)", opacity: rp,
              background: fl > 0 ? `rgba(0,102,204,${0.10 * fl})` : "transparent" }}>
              <div style={{ flex: "0 0 230px", fontSize: 30, color: mutedColor }}>{r.label}</div>
              <div style={{ flex: 1, fontSize: 34, fontWeight: tone && tone !== "neutral" ? 600 : 500, color: toneColor(tone), lineHeight: 1.3 }}>{r.value}</div>
            </div>
          );
        })}
        {c.stamp && sp > 0 && (
          <div style={{ position: "absolute", right: 20, bottom: 30, padding: "6px 16px", border: `5px solid ${toneColor(c.stamp.tone)}`, borderRadius: 16,
            color: toneColor(c.stamp.tone), fontSize: 28, fontWeight: 800, letterSpacing: "0.01em", background: "rgba(255,255,255,0.9)",
            opacity: sp, transform: `rotate(-8deg) scale(${interpolate(sp, [0, 1], [1.6, 1])})` }}>{c.stamp.text}</div>
        )}
      </div>
    );
  };

  const Log: React.FC<{ l: CertLog }> = ({ l }) => {
    const p = pop(l.atSeconds, 0, 20);
    const lines = l.lines.map((x) => (typeof x === "string" ? { text: x } : x));
    const start = l.atSeconds ?? 0;
    const per = (l.revealSeconds ?? 1.2) / Math.max(1, lines.length);
    const fs = l.fontSize ?? 23;
    return (
      <div style={{ ...card, borderRadius: 28, overflow: "hidden", opacity: p, transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: `2px solid ${borderColor}` }}>
          {["#FF5F56", "#FFBD2E", "#27C93F"].map((c) => (
            <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
          ))}
          {l.title && <div style={{ marginLeft: 14, fontSize: 26, fontFamily: MONO, color: mutedColor }}>{l.title}</div>}
        </div>
        <div style={{ padding: "16px 24px 18px", fontFamily: MONO, fontSize: fs, lineHeight: 1.5, whiteSpace: "pre" }}>
          {lines.map((ln, i) => {
            const at = ln.atSeconds ?? start + i * per;
            const lp = at <= 0 ? 1 : interpolate(t - at, [0, 0.15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const color = ln.tone ? toneColor(ln.tone) : /^E \(/.test(ln.text) ? conColor : /^W \(/.test(ln.text) ? "#A05A00" : /^\s*(#|\/\/)/.test(ln.text) ? mutedColor : textColor;
            return (
              <div key={i} style={{ opacity: lp, color, minHeight: fs * 1.5 }}>{ln.text}</div>
            );
          })}
        </div>
        {l.source && <div style={{ padding: "0 24px 16px", fontSize: 26, color: mutedColor, letterSpacing: "0.005em" }}>{l.source}</div>}
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        fontVariantLigatures: "none",
        padding: portrait ? (layout === "centered" ? "230px 120px 300px 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 28,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 8 }}>{eyebrow}</div>}
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 38, fontWeight: 400, lineHeight: 1.35, color: bodyColor, marginTop: 12 }}>{tagline}</div>}
      </div>

      {cards.map((c, i) => (
        <Card key={i} c={c} i={i} />
      ))}

      {clock && <Clock c={clock} />}

      {!clock && v && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Pill vv={v} big />
        </div>
      )}

      {log && <Log l={log} />}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {points.map((pt, i) => {
            const p = pop(pt.atSeconds, 1.5 + i * 0.6);
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 18, opacity: p,
                transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}>
                <div style={{ flex: "0 0 auto", width: 48, height: 48, borderRadius: 24, background: color, color: "#FFFFFF", fontSize: 28,
                  fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>{mark}</div>
                <div style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
