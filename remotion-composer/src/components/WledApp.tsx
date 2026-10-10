import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export interface WledTimedText {
  atSeconds: number;
  text: string;
}

export interface WledTimedValue {
  atSeconds: number;
  value: number;
}

export interface WledSegment {
  /** LED index range [from, to) on the strip. */
  from: number;
  to: number;
  effect: string;
  color?: string;
  color2?: string;
}

/**
 * One effect state of a strip. `effect`: off, solid, rainbow, fire, twinkle, chase, breathe, segments,
 * music_volume (centre-out level meter), music_bands (16 GEQ bands across the strip), wipe (a data front lights the LEDs
 * one by one from the step start, as the colour data is shifted down the chain).
 */
export interface WledStep {
  atSeconds: number;
  effect: string;
  color?: string;
  color2?: string;
  /** 0..1, default 1. */
  brightness?: number;
  segments?: WledSegment[];
  /** wipe: LEDs per second the data front moves (default 12); each pass alternates color / color2. */
  speed?: number;
}

export interface WledStrip {
  label: string;
  /** Small status text right of the label (e.g. "nhóm 1 · nhận"). */
  sub?: WledTimedText[];
  leds?: number;
  atSeconds?: number;
  /** Own effect steps; used before `followAtSeconds` (or always when it is unset). */
  steps?: WledStep[];
  /** From this time the strip shows the master effect (`effects`). Strips without `steps` always follow it. */
  followAtSeconds?: number;
}

export interface WledRow {
  label: string;
  value?: string;
  values?: WledTimedText[];
  /** text (default), toggle, field (typed in), select (value + chevron), button (full-width, accent). */
  kind?: "text" | "toggle" | "field" | "select" | "button";
  on?: boolean;
  onAtSeconds?: number;
  typeAtSeconds?: number;
  typeSeconds?: number;
  mask?: boolean;
  tapAtSeconds?: number;
  highlightAtSeconds?: number;
  atSeconds?: number;
}

export interface WledNetwork {
  ssid: string;
  bars?: number;
  lock?: boolean;
}

export interface WledScreen {
  atSeconds: number;
  /** control = WLED app main screen, settings = form page, networks = phone Wi-Fi list, installer = web installer. */
  kind: "control" | "settings" | "networks" | "installer";
  frame?: "phone" | "desktop";
  title: string;
  /** Address bar text (settings / installer); omitted = no address bar. */
  url?: string;
  // control
  deviceName?: string;
  colors?: { atSeconds: number; color: string }[];
  brightness?: WledTimedValue[];
  effects?: string[];
  select?: { atSeconds: number; index: number }[];
  palette?: WledTimedText[];
  // settings
  rows?: WledRow[];
  /** Live 16-band GEQ bars at the bottom of a settings page, from `audio`. */
  geq?: boolean;
  geqTitle?: string;
  // networks
  networks?: WledNetwork[];
  pickIndex?: number;
  pickAtSeconds?: number;
  // installer
  version?: string;
  installTapAtSeconds?: number;
  portDialogAtSeconds?: number;
  portName?: string;
  portPickAtSeconds?: number;
  chipText?: string;
  chipAtSeconds?: number;
  /** [start, end] of the flashing progress bar. */
  progress?: [number, number];
  doneText?: string;
}

export interface WledAudio {
  /** Rows of 16 band levels (0..1) sampled at `fps`, starting at cut time `start`. */
  fps: number;
  start?: number;
  levels: number[][];
}

export interface WledPacket {
  atSeconds: number;
  label: string;
}

interface WledAppProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  screens?: WledScreen[];
  panelHeight?: number;
  phoneWidth?: number;
  panelCaption?: string;
  strips?: WledStrip[];
  /** Master effect steps (the device the app controls). */
  effects?: WledStep[];
  audio?: WledAudio;
  packets?: WledPacket[];
  caption?: string;
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

type RGB = [number, number, number];

function latest<T extends { atSeconds: number }>(values: T[] | undefined, t: number): T | undefined {
  let out: T | undefined;
  for (const v of values ?? []) if (v.atSeconds <= t + 1e-6) out = v;
  return out;
}

function hex(c: string | undefined, fb: RGB = [255, 255, 255]): RGB {
  if (!c) return fb;
  const m = c.replace("#", "");
  if (m.length !== 6) return fb;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function hsv(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function toHsv([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === R) h = 60 * (((G - B) / d) % 6);
    else if (mx === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  return [(h + 360) % 360, mx === 0 ? 0 : d / mx, mx];
}

const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function noise(x: number): number {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/** Colour of LED i of n at time t for one effect. Returns linear-ish RGB 0..255 (black = off). */
function effectColor(effect: string, i: number, n: number, t: number, c1: RGB, c2: RGB, bands: number[]): RGB {
  switch (effect) {
    case "solid":
      return c1;
    case "rainbow":
      return hsv((i / n * 360 + t * 110) % 360, 1, 1);
    case "fire": {
      const h = Math.min(1, Math.max(0, noise(i * 0.42 - t * 3.4) * 0.65 + noise(i * 0.17 + t * 1.9 + 40) * 0.55 - 0.08));
      if (h < 0.35) return mix([0, 0, 0], [200, 20, 0], h / 0.35);
      if (h < 0.7) return mix([200, 20, 0], [255, 120, 0], (h - 0.35) / 0.35);
      return mix([255, 120, 0], [255, 225, 120], (h - 0.7) / 0.3);
    }
    case "twinkle": {
      const p = 1.1 + hash(i + 7) * 1.7;
      const s = (t / p + hash(i + 99)) % 1;
      const sp = s < 0.22 ? Math.sin((Math.PI * s) / 0.22) : 0;
      return mix(scale(c1, 0.18), [255, 255, 255], sp);
    }
    case "chase": {
      const b = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (i / 9 - t * 1.3)), 2.2);
      return mix(scale(c2, 0.08), c1, b);
    }
    case "breathe":
      return scale(c1, 0.2 + 0.8 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 3)));
    case "music_volume": {
      const v = bands.reduce((a, b) => a + b, 0) / Math.max(1, bands.length);
      const lvl = Math.min(1, v * 1.35);
      const d = Math.abs(i + 0.5 - n / 2) / (n / 2);
      return d <= lvl ? hsv(120 - 120 * d, 1, 1) : [0, 0, 0];
    }
    case "music_bands": {
      const band = Math.min(15, Math.floor((i / n) * 16));
      const lvl = Math.min(1, bands[band] ?? 0);
      return hsv((band / 16) * 300, 1, Math.pow(lvl, 1.3));
    }
    default:
      return [0, 0, 0];
  }
}

export const WledApp: React.FC<WledAppProps> = ({
  name,
  eyebrow,
  tagline,
  screens = [],
  panelHeight = 700,
  phoneWidth = 600,
  panelCaption,
  strips = [],
  effects = [],
  audio,
  packets = [],
  caption,
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
  const pulse = (start: number | undefined, len = 0.8) =>
    start === undefined ? 0 :
      interpolate(t - start, [0, 0.12, len], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const after = (s: number | undefined) => s !== undefined && t >= s;

  const contentW = portrait ? width - (layout === "centered" ? 240 : 248) : 1100;

  /** 16 band levels at time t (cut-relative), linearly interpolated; a soft synthetic beat when no data is given. */
  const bandsAt = (tt: number): number[] => {
    if (audio && audio.levels.length) {
      const x = (tt - (audio.start ?? 0)) * audio.fps;
      const i = Math.max(0, Math.min(audio.levels.length - 1, Math.floor(x)));
      const j = Math.min(audio.levels.length - 1, i + 1);
      const f = Math.max(0, Math.min(1, x - i));
      return audio.levels[i].map((v, k) => v * (1 - f) + (audio.levels[j][k] ?? v) * f);
    }
    const beat = Math.pow(Math.max(0, 1 - ((tt * 1.75) % 1) * 2.2), 2);
    return Array.from({ length: 16 }, (_, k) =>
      Math.min(1, (k < 4 ? beat * 0.9 : 0.15) + noise(k * 3.1 + tt * 4) * 0.45 * (1 - k / 22)));
  };
  const bands = bandsAt(t);

  const stepColors = (st: WledStep | undefined, i: number, n: number): RGB => {
    if (!st) return [0, 0, 0];
    const c1 = hex(st.color, [255, 160, 60]);
    const c2 = hex(st.color2, [0, 60, 255]);
    let c: RGB;
    if (st.effect === "wipe") {
      const sp = st.speed ?? 12;
      const period = n / sp + 0.8;
      const e = Math.max(0, t - st.atSeconds);
      const pass = Math.floor(e / period);
      const front = (e - pass * period) * sp;
      const cur = pass % 2 === 0 ? c1 : c2;
      const prev = pass === 0 ? ([0, 0, 0] as RGB) : pass % 2 === 0 ? c2 : c1;
      c = i < front ? cur : prev;
      if (Math.abs(i - front) < 1) c = mix(c, [255, 255, 255], 0.6);
    } else if (st.effect === "segments" && st.segments) {
      const seg = st.segments.find((s) => i >= s.from && i < s.to);
      c = seg ? effectColor(seg.effect, i - seg.from, seg.to - seg.from, t, hex(seg.color, c1), hex(seg.color2, c2), bands) : [0, 0, 0];
    } else {
      c = effectColor(st.effect, i, n, t, c1, c2, bands);
    }
    return scale(c, st.brightness ?? 1);
  };

  /** LED colour with a 0.3 s cross-fade from the previous step. */
  const ledColor = (steps: WledStep[], i: number, n: number): RGB => {
    let idx = -1;
    for (let k = 0; k < steps.length; k++) if (steps[k].atSeconds <= t + 1e-6) idx = k;
    if (idx < 0) return [0, 0, 0];
    const cur = stepColors(steps[idx], i, n);
    const k = steps[idx].atSeconds <= 0 ? 1 : Math.min(1, (t - steps[idx].atSeconds) / 0.3);
    if (k >= 1 || idx === 0) return cur;
    return mix(stepColors(steps[idx - 1], i, n), cur, k);
  };

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };

  // ---------- screens ----------
  const screen = latest(screens, t);
  const desktop = screen?.frame === "desktop";
  const panelW = desktop ? contentW : Math.min(phoneWidth, contentW);
  const k = panelW / 520;

  const Toggle: React.FC<{ on: boolean; s: number }> = ({ on, s }) => (
    <div style={{ position: "relative", width: 84 * s, height: 48 * s, borderRadius: 24 * s, background: on ? proColor : "#D2D2D7", flex: "0 0 auto" }}>
      <div style={{ position: "absolute", top: 4 * s, left: on ? 40 * s : 4 * s, width: 40 * s, height: 40 * s, borderRadius: 20 * s,
        background: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }} />
    </div>
  );

  const Geq: React.FC<{ s: number; title?: string }> = ({ s, title }) => (
    <div style={{ borderRadius: 18 * s, background: "#1D1D1F", padding: `${12 * s}px ${14 * s}px` }}>
      {title && <div style={{ fontSize: 20 * s, color: "#C7C7CC", marginBottom: 8 * s }}>{title}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5 * s, height: 120 * s }}>
        {bands.map((v, b) => (
          <div key={b} style={{ flex: 1, height: `${Math.max(4, Math.min(1, v) * 100)}%`, borderRadius: 4 * s,
            background: `hsl(${(b / 16) * 300}, 90%, 55%)` }} />
        ))}
      </div>
    </div>
  );

  const Control: React.FC<{ sc: WledScreen }> = ({ sc }) => {
    const col = latest(sc.colors, t)?.color ?? "#FFA040";
    const [hh, ss] = toHsv(hex(col));
    const bri = latest(sc.brightness, t)?.value ?? 0.8;
    const sel = latest(sc.select, t);
    const list = sc.effects ?? [];
    const selIdx = sel?.index ?? 0;
    const selFlash = sel && sel.atSeconds > 0 ? pulse(sel.atSeconds, 0.7) : 0;
    const rowH = 58 * k;
    const shown = 4;
    // Scroll so the selected row sits in the middle of the window, easing toward each new selection.
    const prevSel = (() => {
      let p: number | undefined;
      for (const v of sc.select ?? []) if (v.atSeconds <= t + 1e-6 && v !== sel) p = v.index;
      return p ?? selIdx;
    })();
    const ease = sel && sel.atSeconds > 0 ? spring({ frame: frame - Math.round(sel.atSeconds * fps), fps, config: { damping: 20, stiffness: 110 } }) : 1;
    const centerIdx = prevSel + (selIdx - prevSel) * ease;
    const maxTop = Math.max(0, list.length - shown);
    const top = Math.max(0, Math.min(maxTop, centerIdx - (shown - 1) / 2));
    const wheel = 230 * k;
    const pal = latest(sc.palette, t);
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `${18 * k}px ${22 * k}px`, gap: 16 * k, background: "#111113" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 * k }}>
          <div style={{ fontSize: 32 * k, fontWeight: 700, color: "#FFFFFF", flex: 1, whiteSpace: "nowrap" }}>{sc.deviceName ?? "WLED"}</div>
          <div style={{ width: 52 * k, height: 52 * k, borderRadius: 26 * k, border: `${4 * k}px solid ${bri > 0 ? "#30D158" : "#636366"}`,
            display: "flex", alignItems: "center", justifyContent: "center", color: bri > 0 ? "#30D158" : "#636366", fontSize: 26 * k, fontWeight: 800 }}>⏻</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22 * k }}>
          <div style={{ position: "relative", width: wheel, height: wheel, flex: "0 0 auto", borderRadius: "50%",
            background: "radial-gradient(circle, #FFFFFF 0%, rgba(255,255,255,0) 70%), conic-gradient(from 90deg, #FF0000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF, #FF0000)" }}>
            {(() => {
              const a = (hh * Math.PI) / 180;
              const r = (wheel / 2 - 16 * k) * Math.min(1, ss);
              return (
                <div style={{ position: "absolute", left: wheel / 2 + r * Math.cos(a) - 18 * k, top: wheel / 2 - r * Math.sin(a) - 18 * k,
                  width: 36 * k, height: 36 * k, borderRadius: "50%", border: `${5 * k}px solid #FFFFFF`, background: col,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }} />
              );
            })()}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 * k }}>
            <div style={{ fontSize: 22 * k, color: "#C7C7CC" }}>Độ sáng</div>
            <div style={{ position: "relative", height: 34 * k, borderRadius: 17 * k, background: "#3A3A3C" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(8, bri * 100)}%`, borderRadius: 17 * k,
                background: "linear-gradient(90deg, #8E8E93, #FFFFFF)" }} />
            </div>
            <div style={{ fontSize: 30 * k, fontWeight: 700, color: "#FFFFFF", fontVariantNumeric: "tabular-nums" }}>{Math.round(bri * 100)}%</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 * k }}>
              <div style={{ width: 34 * k, height: 34 * k, borderRadius: 10 * k, background: col }} />
              <div style={{ fontSize: 24 * k, fontFamily: MONO, color: "#E5E5EA" }}>{col.toUpperCase()}</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 22 * k, color: "#C7C7CC", display: "flex", justifyContent: "space-between" }}>
          <span>Hiệu ứng</span>
          {pal && <span>Bảng màu: <span style={{ color: "#FFFFFF" }}>{pal.text}</span></span>}
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: rowH * 2, overflow: "hidden", borderRadius: 16 * k, background: "#1C1C1E" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: -top * rowH }}>
            {list.map((e, i) => {
              const on = i === selIdx;
              return (
                <div key={e + i} style={{ height: rowH, display: "flex", alignItems: "center", padding: `0 ${18 * k}px`,
                  background: on ? `rgba(10,132,255,${0.55 + 0.35 * selFlash})` : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 28 * k, fontWeight: on ? 700 : 500, color: on ? "#FFFFFF" : "#E5E5EA", whiteSpace: "nowrap" }}>{e}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const Settings: React.FC<{ sc: WledScreen }> = ({ sc }) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `${18 * k}px ${22 * k}px`, gap: 12 * k, background: "#FFFFFF" }}>
      <div style={{ fontSize: 34 * k, fontWeight: 700, color: textColor, letterSpacing: "-0.015em" }}>{sc.title}</div>
      {(sc.rows ?? []).map((r, i) => {
        const p = pop(r.atSeconds, 0);
        const hl = after(r.highlightAtSeconds);
        const hlFlash = pulse(r.highlightAtSeconds, 0.9);
        const v = latest(r.values, t)?.text ?? r.value ?? "";
        if (r.kind === "button") {
          const tap = pulse(r.tapAtSeconds, 0.8);
          return (
            <div key={i} style={{ opacity: p, marginTop: 6 * k, borderRadius: 16 * k, background: accentColor, color: "#FFFFFF", fontSize: 28 * k,
              fontWeight: 700, textAlign: "center", padding: `${16 * k}px 0`, transform: `scale(${1 - 0.04 * tap})`,
              boxShadow: `0 0 0 ${14 * tap * k}px rgba(0,102,204,${0.25 * tap})` }}>{r.label}</div>
          );
        }
        let shown = v;
        if (r.kind === "field" && r.typeAtSeconds !== undefined) {
          const n = Math.round(interpolate(t, [r.typeAtSeconds, r.typeAtSeconds + (r.typeSeconds ?? 1)], [0, v.length],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
          shown = v.slice(0, n);
        }
        if (r.mask) shown = "•".repeat(shown.length);
        const on = r.kind === "toggle" ? (r.onAtSeconds !== undefined ? after(r.onAtSeconds) : !!r.on) : false;
        return (
          <div key={i} style={{ opacity: p, display: "flex", alignItems: "center", gap: 14 * k, borderRadius: 14 * k,
            padding: `${10 * k}px ${14 * k}px`, background: hl ? `rgba(0,102,204,${0.1 + 0.15 * hlFlash})` : "rgba(0,0,0,0.035)",
            border: hl ? `2px solid rgba(0,102,204,0.45)` : "2px solid transparent" }}>
            <div style={{ fontSize: 25 * k, color: bodyColor, flex: 1, minWidth: 0 }}>{r.label}</div>
            {r.kind === "toggle" ? <Toggle on={on} s={k * 0.85} /> : (
              <div style={{ fontSize: 26 * k, fontWeight: 600, color: textColor, fontFamily: r.kind === "field" ? MONO : FONT,
                whiteSpace: "nowrap", padding: r.kind === "field" ? `${4 * k}px ${10 * k}px` : 0, minWidth: r.kind === "field" ? 180 * k : 0,
                background: r.kind === "field" ? "#FFFFFF" : "transparent", border: r.kind === "field" ? "1px solid rgba(0,0,0,0.18)" : "none",
                borderRadius: 8 * k, textAlign: "right" }}>
                {shown}{r.kind === "select" ? " ▾" : ""}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      {sc.geq && <Geq s={k} title={sc.geqTitle} />}
    </div>
  );

  const Networks: React.FC<{ sc: WledScreen }> = ({ sc }) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: `${18 * k}px ${22 * k}px`, gap: 10 * k, background: "#F2F2F7" }}>
      <div style={{ fontSize: 40 * k, fontWeight: 700, color: textColor }}>{sc.title}</div>
      <div style={{ borderRadius: 18 * k, background: "#FFFFFF", overflow: "hidden" }}>
        {(sc.networks ?? []).map((nw, i) => {
          const picked = i === sc.pickIndex && after(sc.pickAtSeconds);
          const tap = i === sc.pickIndex ? pulse(sc.pickAtSeconds, 0.8) : 0;
          return (
            <div key={nw.ssid} style={{ display: "flex", alignItems: "center", gap: 14 * k, padding: `${16 * k}px ${18 * k}px`,
              borderBottom: "1px solid rgba(0,0,0,0.07)", background: tap > 0 ? `rgba(0,0,0,${0.08 * tap})` : "transparent" }}>
              <div style={{ width: 30 * k, fontSize: 28 * k, color: accentColor, fontWeight: 700 }}>{picked ? "✓" : ""}</div>
              <div style={{ flex: 1, fontSize: 30 * k, fontWeight: picked ? 700 : 500, color: textColor }}>{nw.ssid}</div>
              {nw.lock && <div style={{ fontSize: 22 * k, color: mutedColor }}>🔒</div>}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3 * k, height: 24 * k }}>
                {[1, 2, 3, 4].map((b) => (
                  <div key={b} style={{ width: 6 * k, height: b * 6 * k, borderRadius: 2 * k, background: b <= (nw.bars ?? 3) ? textColor : "#C7C7CC" }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const Installer: React.FC<{ sc: WledScreen }> = ({ sc }) => {
    const tap = pulse(sc.installTapAtSeconds, 0.8);
    const dlg = after(sc.portDialogAtSeconds) && !(sc.progress && t >= sc.progress[0]);
    const dlgP = pop(sc.portDialogAtSeconds, 0, 18);
    const picked = after(sc.portPickAtSeconds);
    const prog = sc.progress
      ? interpolate(t, sc.progress, [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
    const flashing = sc.progress && t >= sc.progress[0];
    const done = sc.progress && t >= sc.progress[1];
    const chipP = pop(sc.chipAtSeconds, 0);
    return (
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
        padding: `${30 * k}px ${30 * k}px`, gap: 22 * k, background: "#FFFFFF" }}>
        <div style={{ fontSize: 52 * k, fontWeight: 800, color: textColor, letterSpacing: "-0.02em" }}>{sc.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 * k }}>
          <div style={{ fontSize: 30 * k, color: bodyColor, padding: `${10 * k}px ${20 * k}px`, borderRadius: 12 * k,
            border: "2px solid rgba(0,0,0,0.15)" }}>{sc.version ?? ""} ▾</div>
          <div style={{ fontSize: 32 * k, fontWeight: 700, color: "#FFFFFF", background: accentColor, borderRadius: 14 * k,
            padding: `${12 * k}px ${34 * k}px`, transform: `scale(${1 - 0.05 * tap})`,
            boxShadow: `0 0 0 ${16 * tap * k}px rgba(0,102,204,${0.25 * tap})` }}>Install</div>
        </div>
        {sc.chipText && after(sc.chipAtSeconds) && (
          <div style={{ opacity: chipP, fontSize: 28 * k, color: textColor, background: "rgba(0,102,204,0.08)", borderRadius: 14 * k,
            padding: `${12 * k}px ${20 * k}px`, textAlign: "center", lineHeight: 1.35 }}>{sc.chipText}</div>
        )}
        {flashing && (
          <div style={{ width: "86%", display: "flex", flexDirection: "column", gap: 10 * k }}>
            <div style={{ fontSize: 28 * k, color: done ? proColor : bodyColor, fontWeight: done ? 700 : 500 }}>
              {done ? (sc.doneText ?? "✓ Xong") : `Đang ghi firmware… ${Math.round(prog * 100)}%`}
            </div>
            <div style={{ height: 22 * k, borderRadius: 11 * k, background: "#E5E5EA", overflow: "hidden" }}>
              <div style={{ width: `${prog * 100}%`, height: "100%", background: done ? proColor : accentColor }} />
            </div>
          </div>
        )}
        {dlg && (
          <div style={{ position: "absolute", top: 18 * k, left: "50%", width: "78%", transform: `translateX(-50%) translateY(${interpolate(dlgP, [0, 1], [-20, 0])}px)`,
            opacity: dlgP, background: "#FFFFFF", borderRadius: 14 * k, boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
            border: "1px solid rgba(0,0,0,0.12)", padding: `${20 * k}px ${24 * k}px`, display: "flex", flexDirection: "column", gap: 14 * k }}>
            <div style={{ fontSize: 26 * k, color: textColor, fontWeight: 600 }}>Trang muốn kết nối với cổng nối tiếp</div>
            <div style={{ fontSize: 26 * k, fontFamily: MONO, color: textColor, padding: `${12 * k}px ${14 * k}px`, borderRadius: 8 * k,
              background: picked ? "rgba(0,102,204,0.15)" : "rgba(0,0,0,0.04)" }}>{sc.portName ?? "USB JTAG/serial debug unit"}</div>
            <div style={{ alignSelf: "flex-end", fontSize: 26 * k, fontWeight: 700, color: "#FFFFFF", borderRadius: 10 * k,
              padding: `${8 * k}px ${22 * k}px`, background: picked ? accentColor : "#AEAEB2" }}>Kết nối</div>
          </div>
        )}
      </div>
    );
  };

  const Panel: React.FC<{ sc: WledScreen }> = ({ sc }) => {
    const p = pop(sc.atSeconds, 0, 20);
    const phone = !desktop;
    const body = sc.kind === "control" ? <Control sc={sc} /> : sc.kind === "settings" ? <Settings sc={sc} /> :
      sc.kind === "networks" ? <Networks sc={sc} /> : <Installer sc={sc} />;
    return (
      <div style={{ width: panelW, height: panelHeight, borderRadius: phone ? 52 : 22, background: phone ? "#1D1D1F" : "#FFFFFF",
        padding: phone ? 10 : 0, border: phone ? "none" : `2px solid ${borderColor}`, boxShadow: "0 22px 56px rgba(16,24,40,0.16)",
        overflow: "hidden", display: "flex", flexDirection: "column", alignSelf: "center" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRadius: phone ? 44 : 0, overflow: "hidden",
          background: sc.kind === "control" ? "#111113" : "#FFFFFF", paddingTop: phone ? 26 * k : 0 }}>
          {(sc.url || desktop) && (
            <div style={{ background: "#F2F2F7", padding: `${10 * k}px ${16 * k}px`, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              {desktop && (
                <div style={{ display: "flex", gap: 8 * k, marginBottom: 8 * k }}>
                  {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 14 * k, height: 14 * k, borderRadius: 7 * k, background: c }} />)}
                </div>
              )}
              <div style={{ background: "#FFFFFF", borderRadius: 12 * k, padding: `${8 * k}px ${14 * k}px`, border: "1px solid rgba(0,0,0,0.08)",
                fontSize: 24 * k, fontFamily: MONO, color: textColor, whiteSpace: "nowrap", overflow: "hidden" }}>{sc.url ?? ""}</div>
            </div>
          )}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", opacity: interpolate(p, [0, 1], [0.3, 1]),
            transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)` }}>{body}</div>
        </div>
      </div>
    );
  };

  // ---------- strips ----------
  const stripW = contentW;
  const stripP = (s: WledStrip) => pop(s.atSeconds, 0);
  const stripRowH = 112;
  const activeSteps = (s: WledStrip, idx: number): WledStep[] => {
    if (!s.steps) return effects;
    if (s.followAtSeconds !== undefined && t >= s.followAtSeconds) return effects;
    return s.steps;
  };

  const Strip: React.FC<{ s: WledStrip; idx: number }> = ({ s, idx }) => {
    const n = s.leds ?? 30;
    const steps = activeSteps(s, idx);
    const pad = 18;
    const pitch = (stripW - pad * 2) / n;
    const sz = pitch * 0.62;
    const sub = latest(s.sub, t);
    const recv = packets.reduce((m, pk) => Math.max(m, idx > 0 ? pulse(pk.atSeconds + 0.55, 0.7) : pulse(pk.atSeconds, 0.7)), 0);
    return (
      <div style={{ opacity: stripP(s), height: stripRowH, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div style={{ fontSize: 30, fontWeight: 600, color: textColor }}>{s.label}</div>
          {sub && <div style={{ fontSize: 26, color: mutedColor, letterSpacing: "0.005em" }}>{sub.text}</div>}
          {recv > 0.05 && <div style={{ marginLeft: "auto", fontSize: 24, fontWeight: 700, color: accentColor, opacity: recv }}>● UDP</div>}
        </div>
        <div style={{ position: "relative", width: stripW, height: 62, borderRadius: 14, background: "#2C2C2E", display: "flex",
          alignItems: "center", padding: `0 ${pad}px`, boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4)" }}>
          {Array.from({ length: n }, (_, i) => {
            const c = ledColor(steps, i, n);
            const lum = Math.max(c[0], c[1], c[2]) / 255;
            const body = mix([74, 74, 78], c, Math.min(1, lum * 1.4));
            const glow = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.min(0.9, lum)})`;
            return (
              <div key={i} style={{ width: pitch, display: "flex", justifyContent: "center" }}>
                <div style={{ width: sz, height: sz, borderRadius: 5, background: `rgb(${body[0] | 0},${body[1] | 0},${body[2] | 0})`,
                  boxShadow: lum > 0.05 ? `0 0 ${10 + 14 * lum}px ${3 + 5 * lum}px ${glow}` : "none" }} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Packets glide down the left edge from the first strip to every other strip.
  const PacketLayer: React.FC = () => (
    <>
      {packets.map((pk, pi) => {
        const dt = t - pk.atSeconds;
        if (dt < 0 || dt > 0.9) return null;
        return strips.slice(1).map((_, j) => {
          const target = j + 1;
          const y = interpolate(dt, [0, 0.55], [stripRowH / 2 + 10, target * (stripRowH + 22) + stripRowH / 2 + 10],
            { extrapolateRight: "clamp" });
          const o = interpolate(dt, [0, 0.1, 0.7, 0.9], [0, 1, 1, 0]);
          return (
            <div key={`${pi}-${j}`} style={{ position: "absolute", right: 8, top: y - 22, opacity: o, fontSize: 24, fontWeight: 700,
              color: "#FFFFFF", background: accentColor, borderRadius: 22, padding: "6px 16px", whiteSpace: "nowrap",
              boxShadow: "0 6px 16px rgba(0,102,204,0.35)" }}>{pk.label}</div>
          );
        });
      })}
    </>
  );

  const head = pop(0, 0, 18);

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        fontVariantLigatures: "none",
        padding: portrait ? (layout === "centered" ? "230px 120px 300px 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 26,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 8 }}>{eyebrow}</div>}
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 36, fontWeight: 400, lineHeight: 1.35, color: bodyColor, marginTop: 10 }}>{tagline}</div>}
      </div>

      {screen && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Panel sc={screen} />
          {panelCaption && <div style={{ fontSize: 26, color: mutedColor, letterSpacing: "0.005em" }}>{panelCaption}</div>}
        </div>
      )}

      {strips.length > 0 && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22 }}>
          {strips.map((s, i) => <Strip key={s.label + i} s={s} idx={i} />)}
          <PacketLayer />
        </div>
      )}

      {caption && <div style={{ fontSize: 26, color: mutedColor, textAlign: "center", letterSpacing: "0.005em" }}>{caption}</div>}

      {points.length > 0 && (
        <div style={{ ...card, background: "transparent", border: "none", boxShadow: "none", display: "flex", flexDirection: "column", gap: 14 }}>
          {points.map((pt, i) => {
            const p = pop(pt.atSeconds, 1.5 + i * 0.6);
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 18, opacity: p }}>
                <div style={{ flex: "0 0 auto", width: 46, height: 46, borderRadius: 23, background: color, color: "#FFFFFF", fontSize: 26,
                  fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>{mark}</div>
                <div style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
