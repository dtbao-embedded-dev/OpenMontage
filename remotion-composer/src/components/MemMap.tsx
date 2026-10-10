import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted" | "warn";

export interface MemRegion {
  id: string;
  label: string;
  /** Small mono line under the label (address range, bus). */
  sub?: string;
  /** Capacity in bytes; the bar fills used / total. */
  total: number;
  /** [[seconds, bytes]] linear track of the bytes in use. */
  used?: [number, number][];
  /** Readout override track: [{atSeconds, text}] — the last one due is shown (default "used / total B"). */
  readout?: { atSeconds: number; text: string }[];
  tone?: Tone;
  atSeconds?: number;
  /** Windows [[start, end]] in which the row is outlined in its tone. */
  highlight?: [number, number][];
  /** Group heading drawn above the row when it changes ("Trong chip", "Ngoài chip"). */
  group?: string;
}

export interface MemChip {
  text: string;
  /** [[seconds, region id]] — the chip glides to the new row over 0.6 s. */
  placeTrack: [number, string][];
  tone?: Tone;
  atSeconds?: number;
  untilSeconds?: number;
}

export interface MemTableStep {
  atSeconds: number;
  used?: string;
  pct?: string;
  remain?: string;
}

export interface MemTableRow {
  label: string;
  /** Section rows (.bss, .text …) are indented and lighter, like the idf.py size table. */
  indent?: boolean;
  /** Value track; a step whose values differ from the previous one flashes the row. */
  steps: MemTableStep[];
  atSeconds?: number;
  untilSeconds?: number;
  /** Explicit highlight windows (tone defaults to accent). */
  highlight?: { atSeconds: number; untilSeconds?: number; tone?: Tone }[];
}

export interface MemTable {
  title?: string;
  columns?: [string, string, string, string];
  rows: MemTableRow[];
  atSeconds?: number;
  fontSize?: number;
  foot?: string;
}

export interface MemCode {
  title?: string;
  lines: string[];
  atSeconds?: number;
  highlight?: { from: number; to: number; atSeconds: number; untilSeconds?: number; tone?: Tone }[];
  fontSize?: number;
}

export interface MemLogLine {
  text: string;
  atSeconds?: number;
  tone?: Tone;
}

export interface MemInfo {
  label: string;
  value: string;
  tone?: Tone;
  atSeconds?: number;
}

export interface MemStatus {
  atSeconds: number;
  untilSeconds?: number;
  text: string;
  tone?: Tone;
}

export type MemPanel = "map" | "table" | "code" | "log" | "info";

interface MemMapProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  regions?: MemRegion[];
  chips?: MemChip[];
  table?: MemTable;
  code?: MemCode;
  log?: { title?: string; lines: MemLogLine[]; atSeconds?: number; fontSize?: number };
  info?: MemInfo[];
  status?: MemStatus[];
  order?: MemPanel[];
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
const NOLIG: React.CSSProperties = { fontVariantLigatures: "none", fontFeatureSettings: '"calt" 0, "liga" 0' };
const ROW_H = 96;
const GROUP_H = 40;

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

const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN");

/**
 * ESP32 memory map: region bars (internal SRAM, RTC SLOW / FAST, PSRAM, flash) whose fill follows a byte track,
 * variable chips that glide between regions, an `idf.py size`-style table whose rows appear and whose values change
 * per build step (a changed value flashes its row), and code / log panels. Frame-0 content is drawn on the first frame.
 */
export const MemMap: React.FC<MemMapProps> = ({
  name,
  eyebrow,
  tagline,
  regions = [],
  chips = [],
  table,
  code,
  log,
  info = [],
  status = [],
  order = ["code", "map", "table", "log", "info"],
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
  const pop = (s: number | undefined, damping = 16) =>
    (s ?? 0) <= 0 ? 1 : spring({ frame: frame - Math.round((s ?? 0) * fps), fps, config: { damping, stiffness: 120 } });
  const shown = (s?: number) => (s ?? 0) <= t;
  const head = pop(0);
  const ink = (tone?: Tone) =>
    tone === "good" ? proColor : tone === "bad" ? conColor : tone === "warn" ? WARN : tone === "muted" ? mutedColor : tone === "neutral" ? textColor : accentColor;
  const tint = (tone?: Tone) =>
    tone === "good" ? "#D7F0DD" : tone === "bad" ? "#F9D5D8" : tone === "warn" ? "#FBE3CC" : tone === "muted" || tone === "neutral" ? "#E8E8ED" : "#CFE2F8";
  const rgb = (tone?: Tone) => (tone === "bad" ? "215,0,21" : tone === "good" ? "29,122,52" : tone === "warn" ? "178,80,0" : "0,102,204");

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

  // ------------------------------------------------------------------ region map
  const mapView = () => {
    if (regions.length === 0) return null;
    // Row tops (with group headings), used to place chips.
    const tops: Record<string, number> = {};
    let y = 0;
    let lastGroup: string | undefined;
    const rows = regions.map((r) => {
      const g = r.group !== undefined && r.group !== lastGroup ? r.group : undefined;
      if (r.group !== undefined) lastGroup = r.group;
      if (g) y += GROUP_H;
      tops[r.id] = y;
      const top = y;
      y += ROW_H;
      return { r, g, top };
    });
    const totalH = y;
    return (
      <div style={{ position: "relative", height: totalH }}>
        {rows.map(({ r, g, top }) => {
          const k = pop(r.atSeconds);
          const vis = shown(r.atSeconds) ? k : 0;
          const used = r.used ? lin(r.used, t) : 0;
          const frac = Math.max(0, Math.min(1, used / r.total));
          const ro = r.readout ? [...r.readout].reverse().find((x) => x.atSeconds <= t) : undefined;
          const hl = (r.highlight ?? []).some(([a, b]) => t >= a && t < b);
          const hk = hl ? pop((r.highlight ?? []).find(([a, b]) => t >= a && t < b)![0], 20) : 0;
          const col = ink(r.tone);
          return (
            <React.Fragment key={r.id}>
              {g && (
                <div style={{ position: "absolute", left: 4, top: top - GROUP_H + 4, fontSize: 24, fontWeight: 600, color: mutedColor, letterSpacing: "0.005em", opacity: vis }}>
                  {g}
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top,
                  height: ROW_H - 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "0 14px",
                  borderRadius: 20,
                  background: hl ? `rgba(${rgb(r.tone)},${0.08 * hk})` : "transparent",
                  outline: hl ? `3px solid rgba(${rgb(r.tone)},${0.7 * hk})` : "none",
                  opacity: vis,
                  transform: `translateX(${interpolate(k, [0, 1], [24, 0])}px)`,
                }}
              >
                <div style={{ flex: "0 0 230px" }}>
                  <div style={{ fontSize: 34, fontWeight: 700, color: textColor, letterSpacing: "-0.012em", lineHeight: 1.1 }}>{r.label}</div>
                  {r.sub && <div style={{ fontSize: 22, fontWeight: 500, color: mutedColor, fontFamily: MONO, ...NOLIG, marginTop: 4 }}>{r.sub}</div>}
                </div>
                <div style={{ flex: 1, position: "relative", height: 52, borderRadius: 14, background: "rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: col, opacity: 0.85, borderRadius: 14 }} />
                  <div
                    style={{
                      position: "absolute",
                      right: 14,
                      top: 0,
                      bottom: 0,
                      display: "flex",
                      alignItems: "center",
                      fontSize: 26,
                      fontWeight: 700,
                      color: textColor,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span style={{ background: "rgba(255,255,255,0.9)", borderRadius: 10, padding: "2px 12px" }}>
                      {ro ? ro.text : `${fmt(used)} / ${fmt(r.total)} B`}
                    </span>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        {chips.map((c, ci) => {
          if (!shown(c.atSeconds) || (c.untilSeconds !== undefined && t >= c.untilSeconds)) return null;
          const k = pop(c.atSeconds);
          // Glide: find the latest placement and the one before it.
          let idx = 0;
          for (let i = 0; i < c.placeTrack.length; i++) if (c.placeTrack[i][0] <= t) idx = i;
          const [s1, id1] = c.placeTrack[idx];
          const id0 = idx > 0 ? c.placeTrack[idx - 1][1] : id1;
          const u = idx > 0 ? interpolate(t, [s1, s1 + 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          const y0 = tops[id0] ?? 0;
          const y1 = tops[id1] ?? 0;
          const cy = y0 + (y1 - y0) * e + (ROW_H - 12) / 2;
          return (
            <div
              key={ci}
              style={{
                position: "absolute",
                left: 262,
                top: cy - 23,
                height: 46,
                padding: "0 18px",
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                background: "#FFFFFF",
                border: `3px solid ${ink(c.tone)}`,
                color: ink(c.tone),
                fontSize: 25,
                fontWeight: 700,
                fontFamily: MONO,
                ...NOLIG,
                boxShadow: "0 6px 16px rgba(16,24,40,0.14)",
                opacity: k,
                transform: `scale(${interpolate(k, [0, 1], [0.8, 1])})`,
                whiteSpace: "nowrap",
              }}
            >
              {c.text}
            </div>
          );
        })}
      </div>
    );
  };

  // ------------------------------------------------------------------ idf.py size table
  const tableView = () => {
    if (!table) return null;
    const k = pop(table.atSeconds);
    const fs = table.fontSize ?? 26;
    const cols = table.columns ?? ["Vùng / section", "Đã dùng [B]", "%", "Còn lại [B]"];
    const grid = "1.35fr 1fr 0.62fr 1fr";
    return (
      <div style={{ ...panel, background: "#FFFFFF", padding: "14px 16px", opacity: shown(table.atSeconds) ? k : 0 }}>
        {table.title && <div style={{ fontSize: 24, fontWeight: 600, color: mutedColor, marginBottom: 8, fontFamily: MONO, ...NOLIG }}>{table.title}</div>}
        <div style={{ display: "grid", gridTemplateColumns: grid, fontSize: fs - 4, fontWeight: 600, color: mutedColor, padding: "0 10px 6px", borderBottom: "2px solid rgba(0,0,0,0.08)" }}>
          {cols.map((c, i) => (
            <div key={i} style={{ textAlign: i === 0 ? "left" : "right" }}>
              {c}
            </div>
          ))}
        </div>
        {table.rows.map((row, ri) => {
          const on = shown(row.atSeconds) && (row.untilSeconds === undefined || t < row.untilSeconds);
          const appear = pop(row.atSeconds);
          const leave = row.untilSeconds === undefined ? 1 : 1 - interpolate(t, [row.untilSeconds - 0.3, row.untilSeconds], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const hgt = (row.atSeconds ?? 0) <= 0 ? 1 : (on ? Math.min(1, appear) : 0) * leave;
          if (hgt <= 0.001) return null;
          let si = 0;
          for (let i = 0; i < row.steps.length; i++) if (row.steps[i].atSeconds <= t) si = i;
          const s = row.steps[si];
          const prev = si > 0 ? row.steps[si - 1] : undefined;
          const changed = !!prev && (prev.used !== s.used || prev.pct !== s.pct || prev.remain !== s.remain);
          const flash = changed && t >= s.atSeconds ? interpolate(t - s.atSeconds, [0, 0.25, 2.2, 3], [0, 1, 1, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
          const hlw = (row.highlight ?? []).find((h) => t >= h.atSeconds && (h.untilSeconds === undefined || t < h.untilSeconds));
          const hk = hlw ? pop(hlw.atSeconds, 20) : 0;
          const tone = hlw?.tone ?? "accent";
          const bg = Math.max(flash, hk);
          const bigRow = !row.indent;
          return (
            <div
              key={ri}
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                alignItems: "center",
                fontFamily: MONO,
                ...NOLIG,
                fontSize: bigRow ? fs : fs - 3,
                fontWeight: bigRow ? 700 : 500,
                color: bigRow ? textColor : bodyColor,
                padding: "0 10px",
                height: (bigRow ? fs * 1.75 : fs * 1.5) * hgt,
                overflow: "hidden",
                opacity: hgt,
                borderRadius: 10,
                background: bg > 0 ? `rgba(${rgb(tone)},${0.14 * bg})` : "transparent",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ paddingLeft: row.indent ? 30 : 0 }}>{row.label}</div>
              <div style={{ textAlign: "right", color: flash > 0.3 ? ink(tone) : undefined }}>{s.used ?? ""}</div>
              <div style={{ textAlign: "right", color: flash > 0.3 ? ink(tone) : undefined }}>{s.pct ?? ""}</div>
              <div style={{ textAlign: "right", color: flash > 0.3 ? ink(tone) : undefined }}>{s.remain ?? ""}</div>
            </div>
          );
        })}
        {table.foot && <div style={{ fontSize: 22, color: mutedColor, marginTop: 8, padding: "0 10px" }}>{table.foot}</div>}
      </div>
    );
  };

  // ------------------------------------------------------------------ code / log / info
  const codePanel = () => {
    if (!code) return null;
    const k = pop(code.atSeconds);
    return (
      <div style={{ ...panel, background: "#FFFFFF", padding: "14px 18px", opacity: shown(code.atSeconds) ? k : 0 }}>
        {code.title && <div style={{ fontSize: 24, fontWeight: 600, color: mutedColor, marginBottom: 8 }}>{code.title}</div>}
        <div style={{ fontFamily: MONO, ...NOLIG, fontSize: code.fontSize ?? 24, lineHeight: 1.5, whiteSpace: "pre", overflow: "hidden" }}>
          {code.lines.map((ln, i) => {
            const hl = (code.highlight ?? []).find((h) => i >= h.from && i <= h.to && t >= h.atSeconds && (h.untilSeconds === undefined || t < h.untilSeconds));
            const e = hl ? pop(hl.atSeconds, 20) : 0;
            return (
              <div key={i} style={{ color: hl ? textColor : bodyColor, background: hl ? `rgba(${rgb(hl.tone)},${0.13 * e})` : "transparent", borderRadius: 8, padding: "0 8px", fontWeight: hl ? 600 : 400 }}>
                {ln || " "}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const logPanel = () => {
    if (!log) return null;
    const k = pop(log.atSeconds);
    const lines = log.lines.filter((l) => shown(l.atSeconds));
    return (
      <div style={{ ...panel, background: "#FFFFFF", padding: "14px 18px", opacity: shown(log.atSeconds) ? k : 0 }}>
        {log.title && <div style={{ fontSize: 24, fontWeight: 600, color: mutedColor, marginBottom: 8 }}>{log.title}</div>}
        <div style={{ fontFamily: MONO, ...NOLIG, fontSize: log.fontSize ?? 22, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.tone ? ink(l.tone) : bodyColor, opacity: pop(l.atSeconds, 20), fontWeight: l.tone ? 600 : 400 }}>
              {l.text || " "}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const infoView = () =>
    info.length === 0 ? null : (
      <div style={{ display: "grid", gridTemplateColumns: info.length > 2 ? "1fr 1fr 1fr" : info.length === 2 ? "1fr 1fr" : "1fr", gap: 12 }}>
        {info.map((c, i) => {
          const v = pop(c.atSeconds);
          return (
            <div key={i} style={{ ...panel, padding: "12px 16px", opacity: shown(c.atSeconds) ? v : 0, background: c.tone && c.tone !== "neutral" ? tint(c.tone) : panel.background }}>
              <div style={{ fontSize: 26, color: mutedColor, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 38, fontWeight: 700, color: c.tone && c.tone !== "neutral" ? ink(c.tone) : textColor, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
            </div>
          );
        })}
      </div>
    );

  const views: Record<MemPanel, () => React.ReactNode> = { map: mapView, table: tableView, code: codePanel, log: logPanel, info: infoView };

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
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 12 }}>{tagline}</div>}
      </div>

      <div style={{ ...card, padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
        {order.map((p) => (
          <React.Fragment key={p}>{views[p]()}</React.Fragment>
        ))}

        {st && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ fontSize: 34, fontWeight: 600, padding: "10px 26px", borderRadius: 999, background: tint(st.tone), color: ink(st.tone), textAlign: "center", opacity: pop(st.atSeconds, 20) }}>
              {st.text}
            </div>
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
