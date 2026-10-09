import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";
import { colourise } from "./CodeCompare";
import { unscii_8, unscii_16, type OledFont } from "./oledFonts";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted";

/**
 * One drawing on the simulated panel, in panel pixels (x 0..127, y 0..rows-1). Every layer takes
 * `atSeconds` / `untilSeconds` (seconds after cut start). Layers are drawn in order; `mode: "clear"` erases,
 * `mode: "xor"` inverts.
 * - `text`: LVGL unscii font (`unscii8` default, `unscii16`), `y` is the top of the line box. `typeSeconds`
 *   types it in; `scrollWidth` + `scrollSpeed` (px/s) + `scrollGap` scroll it like LV_LABEL_LONG_SCROLL_CIRCULAR;
 *   `invert` draws dark text on a lit box.
 * - `bitmap`: `rows` of "#"/"1" (lit) and "."/"0" (dark), optional integer `scale`.
 * - `rect` (`fill` for solid), `line` (`x0,y0` → `x1,y1`), `fill` (every pixel).
 * - `chart`: a scrolling line (or `bars`) chart like lv_chart in LV_CHART_UPDATE_MODE_SHIFT: `pointCount` slots,
 *   `values` arrive at `rate` per second from `atSeconds` (the first `startIndex` already present), new points
 *   enter on the right; `min`/`max` map to the plot height; `frame` draws a 1 px border; `label` prints the
 *   newest value (`prefix`, `decimals`, `suffix`) at its own `x`/`y` with `font`.
 * - `noise`: deterministic random pixels (`density` 0..1, `seed`), e.g. uninitialised RAM columns.
 */
export interface OledLayer {
  kind: "text" | "bitmap" | "rect" | "line" | "chart" | "noise" | "fill";
  atSeconds?: number;
  untilSeconds?: number;
  mode?: "set" | "clear" | "xor";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  font?: "unscii8" | "unscii16";
  invert?: boolean;
  typeSeconds?: number;
  scrollWidth?: number;
  scrollSpeed?: number;
  scrollGap?: number;
  rows?: string[];
  scale?: number;
  fill?: boolean;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  values?: number[];
  min?: number;
  max?: number;
  pointCount?: number;
  rate?: number;
  startIndex?: number;
  frame?: boolean;
  bars?: boolean;
  label?: { x: number; y: number; font?: "unscii8" | "unscii16"; decimals?: number; prefix?: string; suffix?: string };
  density?: number;
  seed?: number;
}

/** Outline drawn over the panel in panel pixels; its optional label is a pill under the module, clear of the pixels. */
export interface OledMark {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  tone?: Tone;
  atSeconds?: number;
  untilSeconds?: number;
}

/** Page bands: the 8 rows of each GDDRAM page tinted alternately and numbered on the left. */
export interface OledPages {
  atSeconds?: number;
  untilSeconds?: number;
  /** Page drawn in the accent tint. */
  highlight?: number;
  highlightAtSeconds?: number;
}

/** One GDDRAM byte: column `col` of page `page`, read from the live framebuffer and shown bit by bit in a card. */
export interface OledByte {
  page: number;
  col: number;
  atSeconds?: number;
  untilSeconds?: number;
  title?: string;
  note?: string;
}

export interface OledCodeHighlight {
  /** Zero-based code line indexes to tint. */
  lines: number[];
  atSeconds?: number;
  untilSeconds?: number;
}

/**
 * A rotary encoder knob (top view) drawn to the right of the module. `track` keyframes `[seconds, detent]` turn it,
 * one click every `clickSeconds`, from the previous detent to the new one (positive = clockwise); the detent ring
 * lights the current position and a readout shows the pulse count (`countsPerDetent` per click, counting through
 * the in-between edges while it turns) and the detent number. `press` windows push the knob down (its switch).
 */
export interface OledKnob {
  track: [number, number][];
  /** Seconds per click while turning (default 0.16). */
  clickSeconds?: number;
  /** Detents per turn (default 20). */
  detents?: number;
  /** Counts per detent in the readout (default 4); 0 hides the readout. */
  countsPerDetent?: number;
  /** [start, end] seconds when the knob is pressed. */
  press?: [number, number][];
  /** Small label above the knob (e.g. "KY-040"). */
  label?: string;
  /** Readout labels (defaults "count" and "nấc"). */
  countLabel?: string;
  detentLabel?: string;
  /** Text of the pill shown while pressed (default "Nhấn"). */
  pressLabel?: string;
  atSeconds?: number;
  /** Column width in px (default 240). */
  size?: number;
}

/** Knob position in detents (fractional while turning) at time t, each click eased like a detent snapping in. */
export function knobDetent(knob: OledKnob, t: number): number {
  const click = Math.max(0.02, knob.clickSeconds ?? 0.16);
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);
  let v = 0;
  for (const [t0, target] of [...knob.track].sort((a, b) => a[0] - b[0])) {
    if (t < t0) break;
    const delta = target - v;
    const n = Math.abs(delta);
    const k = Math.min(n, (t - t0) / click);
    const whole = Math.floor(k);
    const moved = k >= n ? n : whole + ease(k - whole);
    v = v + Math.sign(delta) * moved;
  }
  return v;
}

interface OledScreenProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  layers: OledLayer[];
  /** Panel rows: 64 (default) or 32. */
  rows?: number;
  /** "white" (default), "blue", or "yellow-blue" (rows 0-15 yellow, the rest blue, like two-colour modules). */
  panelColor?: "white" | "blue" | "yellow-blue";
  /** Header pin labels on the module PCB; [] hides the pin strip. */
  pins?: string[];
  /** Module board width in px (default 840). */
  boardWidth?: number;
  marks?: OledMark[];
  pages?: OledPages;
  byte?: OledByte;
  /** Faint pixel grid over the dark panel (shows the 128 x 64 resolution). */
  gridAtSeconds?: number;
  gridUntilSeconds?: number;
  caption?: string;
  captionAtSeconds?: number;
  code?: string[];
  codeTitle?: string;
  codeAtSeconds?: number;
  codeRevealSeconds?: number;
  codeFontSize?: number;
  codeHighlights?: OledCodeHighlight[];
  /** Rotary encoder knob beside the module; leave room for it with `boardWidth` (module + 28 px + knob size). */
  knob?: OledKnob;
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
const COLS = 128;
const UNIT = 10; // SVG units per panel pixel
const DOT = 8.6; // lit square inside each pixel cell; the rest is the dark gap between OLED pixels
const MARK = "#FFD54A"; // outline colour on the dark panel (and its label pill)

type Glyph = { adv: number; w: number; h: number; ox: number; oy: number; bits: Uint8Array };
const glyphCache = new Map<OledFont, Map<string, Glyph>>();

function glyphsOf(font: OledFont): Map<string, Glyph> {
  let m = glyphCache.get(font);
  if (m) return m;
  m = new Map();
  for (const [ch, [adv, w, h, ox, oy, hex]] of Object.entries(font.glyphs)) {
    const bits = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const byte = parseInt(hex.substr((i >> 3) * 2, 2), 16);
      bits[i] = byte & (0x80 >> (i & 7)) ? 1 : 0;
    }
    m.set(ch, { adv, w, h, ox, oy, bits });
  }
  glyphCache.set(font, m);
  return m;
}

const fontOf = (f?: string) => (f === "unscii16" ? unscii_16 : unscii_8);

function textWidth(font: OledFont, text: string): number {
  const g = glyphsOf(font);
  let w = 0;
  for (const ch of text) w += (g.get(ch) ?? g.get("?"))!.adv;
  return w;
}

/** Deterministic hash noise in 0..1 for (x, y, seed). */
function hash01(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Composes the framebuffer (1 = lit) for time `t` seconds after the cut start. */
export function composeOled(layers: OledLayer[], rows: number, t: number): Uint8Array {
  const fb = new Uint8Array(COLS * rows);
  let mode: "set" | "clear" | "xor" = "set";
  let clip: [number, number] | null = null;
  const put = (x: number, y: number, on = 1) => {
    if (x < 0 || x >= COLS || y < 0 || y >= rows) return;
    if (clip && (x < clip[0] || x >= clip[1])) return;
    const i = y * COLS + x;
    if (mode === "xor") fb[i] ^= on;
    else if (mode === "clear") fb[i] = on ? 0 : fb[i];
    else fb[i] = on ? 1 : fb[i];
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    // Bresenham, the way a 1-bpp canvas rasterises a thin line.
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      put(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  };
  const drawText = (font: OledFont, text: string, x: number, y: number, invert = false) => {
    const g = glyphsOf(font);
    if (invert) {
      const w = textWidth(font, text);
      for (let yy = y; yy < y + font.lineHeight; yy++) for (let xx = x - 1; xx < x + w; xx++) put(xx, yy);
    }
    let cx = x;
    for (const ch of text) {
      const gl = g.get(ch) ?? g.get("?")!;
      const top = y + (font.lineHeight - font.baseLine) - gl.h - gl.oy;
      for (let i = 0; i < gl.w * gl.h; i++) {
        if (!gl.bits[i]) continue;
        const px = cx + gl.ox + (i % gl.w);
        const py = top + Math.floor(i / gl.w);
        if (invert) {
          const prev = mode;
          mode = "clear";
          put(px, py);
          mode = prev;
        } else put(px, py);
      }
      cx += gl.adv;
    }
  };

  for (const L of layers) {
    const t0 = L.atSeconds ?? 0;
    if (t < t0 || (L.untilSeconds !== undefined && t >= L.untilSeconds)) continue;
    const lt = t - t0;
    mode = L.mode ?? "set";
    clip = null;
    const x = L.x ?? 0;
    const y = L.y ?? 0;
    if (L.kind === "fill") {
      for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < COLS; xx++) put(xx, yy);
    } else if (L.kind === "text" && L.text) {
      const font = fontOf(L.font);
      let text = L.text;
      if (L.typeSeconds && L.typeSeconds > 0) text = text.slice(0, Math.floor(Math.min(1, lt / L.typeSeconds) * text.length));
      if (L.scrollWidth) {
        const period = textWidth(font, text) + (L.scrollGap ?? 24);
        const off = Math.floor((lt * (L.scrollSpeed ?? 30)) % period);
        clip = [x, x + L.scrollWidth];
        drawText(font, text, x - off, y, L.invert);
        drawText(font, text, x - off + period, y, L.invert);
      } else drawText(font, text, x, y, L.invert);
    } else if (L.kind === "bitmap" && L.rows) {
      const s = Math.max(1, Math.round(L.scale ?? 1));
      L.rows.forEach((r, ry) => {
        for (let rx = 0; rx < r.length; rx++) {
          if (r[rx] !== "#" && r[rx] !== "1") continue;
          for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) put(x + rx * s + b, y + ry * s + a);
        }
      });
    } else if (L.kind === "rect") {
      const w = L.w ?? 1;
      const h = L.h ?? 1;
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          if (L.fill || yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1) put(xx, yy);
    } else if (L.kind === "line") {
      line(L.x0 ?? 0, L.y0 ?? 0, L.x1 ?? 0, L.y1 ?? 0);
    } else if (L.kind === "noise") {
      const w = L.w ?? COLS;
      const h = L.h ?? rows;
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) if (hash01(xx, yy, L.seed ?? 7) < (L.density ?? 0.5)) put(xx, yy);
    } else if (L.kind === "chart" && L.values && L.values.length) {
      const w = L.w ?? COLS;
      const h = L.h ?? rows;
      const n = Math.max(2, L.pointCount ?? 32);
      if (L.frame) {
        for (let xx = x; xx < x + w; xx++) {
          put(xx, y);
          put(xx, y + h - 1);
        }
        for (let yy = y; yy < y + h; yy++) {
          put(x, yy);
          put(x + w - 1, yy);
        }
      }
      const inset = L.frame ? 2 : 0;
      const px0 = x + inset;
      const py0 = y + inset;
      const pw = w - 2 * inset;
      const ph = h - 2 * inset;
      const count = Math.min(L.values.length, (L.startIndex ?? 0) + Math.floor(lt * (L.rate ?? 1)) + 1);
      const win = L.values.slice(Math.max(0, count - n), count);
      const lo = L.min ?? Math.min(...L.values);
      const hi = L.max ?? Math.max(...L.values);
      const X = (j: number) => px0 + Math.round(((n - win.length + j) * (pw - 1)) / (n - 1));
      const Y = (v: number) => py0 + (ph - 1) - Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1))) * (ph - 1));
      if (L.bars) {
        win.forEach((v, j) => {
          for (let yy = Y(v); yy < py0 + ph; yy++) put(X(j), yy);
        });
      } else {
        for (let j = 1; j < win.length; j++) line(X(j - 1), Y(win[j - 1]), X(j), Y(win[j]));
        if (win.length === 1) put(X(0), Y(win[0]));
      }
      if (L.label && win.length) {
        mode = "set";
        const v = win[win.length - 1];
        const txt = `${L.label.prefix ?? ""}${v.toFixed(L.label.decimals ?? 1)}${L.label.suffix ?? ""}`;
        drawText(fontOf(L.label.font), txt, L.label.x, L.label.y);
      }
    }
  }
  return fb;
}

/**
 * A 0.96" SSD1306-style OLED module drawn pixel-exact: the panel is a 128 x 64 (or 32) framebuffer composed every
 * frame from timed layers (LVGL unscii text, 1-bit icons, a scrolling lv_chart-style plot, noise), shown as lit
 * squares with a soft glow on a black glass inside a blue module PCB with its header pins. Optional overlays explain
 * the GDDRAM layout (page bands, one byte's 8 vertical bits read from the live framebuffer) and outline regions; a
 * code window and pro/con rows can sit below, timed to narration.
 */
export const OledScreen: React.FC<OledScreenProps> = ({
  name,
  eyebrow,
  tagline,
  layers,
  rows = 64,
  panelColor = "white",
  pins = ["GND", "VCC", "SCL", "SDA"],
  boardWidth = 840,
  marks = [],
  pages,
  byte,
  gridAtSeconds,
  gridUntilSeconds,
  caption,
  captionAtSeconds,
  code,
  codeTitle,
  codeAtSeconds = 0.3,
  codeRevealSeconds = 1.2,
  codeFontSize = 25,
  codeHighlights = [],
  knob,
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
  const sec = (s: number | undefined) => Math.round((s ?? 0) * fps);
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const live = (a?: number, u?: number) => t >= (a ?? 0) && (u === undefined || t < u);
  const fade = (a?: number, u?: number) => {
    if (!live(a, u)) return 0;
    const inP = pop(sec(a));
    const outP = u === undefined ? 1 : interpolate(frame, [sec(u) - 6, sec(u)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return Math.min(1, inP) * outP;
  };
  const toneColor = (tn: Tone | undefined, fallback = accentColor) =>
    tn === "accent" ? accentColor : tn === "good" ? proColor : tn === "bad" ? conColor : tn === "muted" ? mutedColor : tn === "neutral" ? textColor : fallback;

  const head = pop(0, 18);
  const board = pop(2, 20);

  // ---------------------------------------------------------------- framebuffer → SVG path of lit squares
  const fb = composeOled(layers, rows, t);
  const pixColor = (y: number) =>
    panelColor === "blue" ? "#5BC8FF" : panelColor === "yellow-blue" ? (y < 16 ? "#FFD54A" : "#5BC8FF") : "#F2F8FF";
  const paths = new Map<string, string>();
  for (let y = 0; y < rows; y++) {
    const c = pixColor(y);
    let d = paths.get(c) ?? "";
    for (let x = 0; x < COLS; x++) if (fb[y * COLS + x]) d += `M${x * UNIT + 0.7} ${y * UNIT + 0.7}h${DOT}v${DOT}h-${DOT}z`;
    paths.set(c, d);
  }

  // ---------------------------------------------------------------- module geometry (px)
  const pinStrip = pins.length ? 78 : 0;
  const pcbPad = 26;
  const glassPad = 30;
  const activeW = boardWidth - 2 * pcbPad - 2 * glassPad;
  const pitch = activeW / COLS;
  const activeH = pitch * rows;
  const glassW = activeW + 2 * glassPad;
  const glassH = activeH + 2 * glassPad;
  const boardH = pinStrip + glassH + 2 * pcbPad - (pins.length ? 10 : 0);

  const pageOp = pages ? fade(pages.atSeconds, pages.untilSeconds) : 0;
  const gridOp = gridAtSeconds !== undefined ? fade(gridAtSeconds, gridUntilSeconds) : 0;
  const byteOp = byte ? fade(byte.atSeconds, byte.untilSeconds) : 0;
  const capOp = caption ? pop(sec(captionAtSeconds)) : 0;

  const lines = code ?? [];
  const codeStart = sec(codeAtSeconds);
  const perLine = lines.length > 0 ? (codeRevealSeconds * fps) / lines.length : 0;
  const codeCard = lines.length ? pop(codeStart - 6, 20) : 0;
  const hlOf = (i: number) => {
    let o = 0;
    for (const h of codeHighlights) if (h.lines.includes(i)) o = Math.max(o, fade(h.atSeconds, h.untilSeconds));
    return o;
  };

  const byteBits = byte ? Array.from({ length: 8 }, (_, k) => fb[(byte.page * 8 + k) * COLS + byte.col] ?? 0) : [];
  const byteVal = byteBits.reduce((acc, b, k) => acc | (b << k), 0);

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
    overflow: "hidden",
  };

  // ---------------------------------------------------------------- rotary knob beside the module
  const renderKnob = (k: OledKnob) => {
    const S = k.size ?? 240;
    const c = S / 2;
    const detents = Math.max(4, k.detents ?? 20);
    const cpd = k.countsPerDetent ?? 4;
    const v = knobDetent(k, t);
    const vPrev = knobDetent(k, t - 3 / fps);
    const turning = Math.abs(v - vPrev) > 1e-3;
    const dir = Math.sign(v - vPrev);
    const angle = (v * 360) / detents;
    const pressed = (k.press ?? []).some(([a, b]) => t >= a && t < b);
    const pressP = (k.press ?? []).reduce((o, [a, b]) => {
      const inP = interpolate(frame, [sec(a), sec(a) + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const outP = interpolate(frame, [sec(b), sec(b) + 4], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return Math.max(o, Math.min(inP, outP));
    }, 0);
    const lit = ((Math.round(v) % detents) + detents) % detents;
    const count = Math.round(v * cpd);
    const detentNow = cpd > 0 ? Math.trunc(count / cpd) : Math.round(v);
    const op = pop(sec(k.atSeconds));
    const arcR = S * 0.55; // outside the detent ring
    const arcA0 = -50;
    const arcA1 = 50;
    const pt = (r: number, deg: number) => [c + r * Math.sin((deg * Math.PI) / 180), c - r * Math.cos((deg * Math.PI) / 180)];
    const [ax0, ay0] = pt(arcR, arcA0);
    const [ax1, ay1] = pt(arcR, arcA1);
    const headDeg = dir >= 0 ? arcA1 : arcA0;
    const [hx, hy] = pt(arcR, headDeg);
    const tangent = headDeg + (dir >= 0 ? 90 : -90);
    const arrowHead = (() => {
      const back = (deg: number, len: number) => [hx - len * Math.sin((deg * Math.PI) / 180), hy + len * Math.cos((deg * Math.PI) / 180)];
      const [b1x, b1y] = back(tangent - 28, 22);
      const [b2x, b2y] = back(tangent + 28, 22);
      return `M${b1x},${b1y} L${hx},${hy} L${b2x},${b2y}`;
    })();
    return (
      <div style={{ width: S, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: op }}>
        {k.label && <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "0.005em", color: mutedColor }}>{k.label}</div>}
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ display: "block", overflow: "visible", marginTop: 26 }}>
          <defs>
            <linearGradient id="knob-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#D5D9DF" />
              <stop offset="1" stopColor="#A9AFB8" />
            </linearGradient>
            <radialGradient id="knob-cap" cx="0.4" cy="0.35" r="0.75">
              <stop offset="0" stopColor="#4A505A" />
              <stop offset="1" stopColor="#1C1F24" />
            </radialGradient>
          </defs>
          {/* Detent ring: one tick per click, the current one lit */}
          {Array.from({ length: detents }, (_, i) => {
            const deg = (i * 360) / detents;
            const on = i === lit;
            const [x0, y0] = pt(S * 0.4, deg);
            const [x1, y1] = pt(S * 0.47, deg);
            return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={on ? accentColor : "#C3C8CF"} strokeWidth={on ? 7 : 4} strokeLinecap="round" />;
          })}
          {/* Encoder housing */}
          <rect x={c - S * 0.3} y={c - S * 0.3} width={S * 0.6} height={S * 0.6} rx={14} fill="url(#knob-body)" stroke="rgba(0,0,0,0.18)" strokeWidth={2} />
          {/* Knob cap, pushed down while pressed */}
          <g transform={`translate(${c},${c}) scale(${1 - 0.07 * pressP})`}>
            <circle cx={0} cy={6 - 3 * pressP} r={S * 0.27} fill="rgba(0,0,0,0.22)" />
            <g transform={`rotate(${angle})`}>
              <circle cx={0} cy={0} r={S * 0.27} fill="#24272D" />
              {Array.from({ length: 28 }, (_, i) => (
                <rect key={i} x={-3} y={-S * 0.27} width={6} height={S * 0.045} rx={2} fill="#0E1013" transform={`rotate(${(i * 360) / 28})`} />
              ))}
              <circle cx={0} cy={0} r={S * 0.215} fill="url(#knob-cap)" />
              <line x1={0} y1={-S * 0.05} x2={0} y2={-S * 0.19} stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" />
            </g>
          </g>
          {/* Direction arc while turning */}
          <g opacity={turning ? 1 : 0}>
            <path d={`M${ax0},${ay0} A${arcR},${arcR} 0 0 1 ${ax1},${ay1}`} fill="none" stroke={accentColor} strokeWidth={6} strokeLinecap="round" />
            <path d={arrowHead} fill="none" stroke={accentColor} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
        <div style={{ height: 52, display: "flex", alignItems: "center" }}>
          {pressed && (
            <div style={{ padding: "8px 24px", borderRadius: 26, background: accentColor, color: "#FFFFFF", fontSize: 28, fontWeight: 700, opacity: pressP }}>
              {k.pressLabel ?? "Nhấn"}
            </div>
          )}
        </div>
        {cpd > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 28, color: mutedColor, letterSpacing: "0.005em", fontFamily: MONO }}>{k.countLabel ?? "count"}</div>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.02em", color: accentColor, fontFamily: MONO, lineHeight: 1.05 }}>{count}</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: bodyColor }}>
              = {detentNow} {k.detentLabel ?? "nấc"}
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
        alignItems: "stretch",
        gap: 32,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      <div style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 28 }}>
      {/* Module */}
      <div style={{ alignSelf: "center", opacity: board, transform: `scale(${interpolate(board, [0, 1], [0.94, 1])})` }}>
        <svg width={boardWidth} height={boardH} viewBox={`0 0 ${boardWidth} ${boardH}`} style={{ display: "block", overflow: "visible" }}>
          <defs>
            <linearGradient id="oled-pcb" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2457B8" />
              <stop offset="1" stopColor="#1A418E" />
            </linearGradient>
            <linearGradient id="oled-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#15181E" />
              <stop offset="0.55" stopColor="#07080B" />
              <stop offset="1" stopColor="#101318" />
            </linearGradient>
            <filter id="oled-glow" x="-5%" y="-5%" width="110%" height="110%">
              <feGaussianBlur stdDeviation={UNIT * 0.9} result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="oled-grid" width={UNIT} height={UNIT} patternUnits="userSpaceOnUse">
              <rect x={0.7} y={0.7} width={DOT} height={DOT} fill="#20252E" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={boardWidth} height={boardH} rx={30} fill="url(#oled-pcb)" />
          {[
            [22, 22],
            [boardWidth - 22, 22],
            [22, boardH - 22],
            [boardWidth - 22, boardH - 22],
          ].map(([cx, cy], i) => (
            <g key={`h${i}`}>
              <circle cx={cx} cy={cy} r={13} fill="#C9A548" />
              <circle cx={cx} cy={cy} r={7} fill="#F7F9FC" />
            </g>
          ))}
          {pins.map((p, i) => {
            const cx = boardWidth / 2 + (i - (pins.length - 1) / 2) * 112;
            return (
              <g key={p}>
                <rect x={cx - 17} y={12} width={34} height={34} rx={6} fill="#C9A548" />
                <circle cx={cx} cy={29} r={9} fill="#1A1A1A" />
                <text x={cx} y={70} textAnchor="middle" fontFamily={FONT} fontSize={20} fontWeight={700} fill="#FFFFFF" letterSpacing="0.04em">
                  {p}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${pcbPad},${pinStrip + pcbPad - (pins.length ? 10 : 0)})`}>
            <rect x={0} y={0} width={glassW} height={glassH} rx={10} fill="url(#oled-glass)" stroke="#000000" strokeWidth={2} />
            <g transform={`translate(${glassPad},${glassPad}) scale(${pitch / UNIT})`}>
              {gridOp > 0 && <rect x={0} y={0} width={COLS * UNIT} height={rows * UNIT} fill="url(#oled-grid)" opacity={gridOp} />}
              <g filter="url(#oled-glow)">
                {[...paths.entries()].map(([c, d]) => (d ? <path key={c} d={d} fill={c} /> : null))}
              </g>
              {/* GDDRAM page bands */}
              {pageOp > 0 &&
                Array.from({ length: rows / 8 }, (_, pg) => {
                  const hi = pages?.highlight === pg && t >= (pages?.highlightAtSeconds ?? 0);
                  return (
                    <g key={`pg${pg}`} opacity={pageOp}>
                      <rect
                        x={0}
                        y={pg * 8 * UNIT}
                        width={COLS * UNIT}
                        height={8 * UNIT}
                        fill={hi ? accentColor : pg % 2 ? "#FFFFFF" : "#7FB2FF"}
                        opacity={hi ? 0.38 : 0.14}
                      />
                      <line x1={0} y1={pg * 8 * UNIT} x2={COLS * UNIT} y2={pg * 8 * UNIT} stroke="#7FB2FF" strokeWidth={UNIT * 0.35} opacity={0.8} />
                      <text
                        x={-UNIT * 0.9}
                        y={(pg * 8 + 5.6) * UNIT}
                        textAnchor="end"
                        fontFamily={FONT}
                        fontSize={UNIT * 4.2}
                        fontWeight={700}
                        fill={hi ? "#FFD54A" : "#B9D4FF"}
                      >
                        {pg}
                      </text>
                    </g>
                  );
                })}
              {/* One byte = 8 vertical pixels */}
              {byte && byteOp > 0 && (
                <rect
                  x={byte.col * UNIT - UNIT * 0.6}
                  y={byte.page * 8 * UNIT - UNIT * 0.6}
                  width={UNIT * 2.2}
                  height={8 * UNIT + UNIT * 1.2}
                  fill="none"
                  stroke="#FFD54A"
                  strokeWidth={UNIT * 0.6}
                  rx={UNIT * 0.4}
                  opacity={byteOp}
                />
              )}
              {marks.map((m, i) => {
                const o = fade(m.atSeconds, m.untilSeconds);
                if (o <= 0) return null;
                return (
                  <rect
                    key={`m${i}`}
                    opacity={o}
                    x={m.x * UNIT - UNIT * 0.6}
                    y={m.y * UNIT - UNIT * 0.6}
                    width={m.w * UNIT + UNIT * 1.2}
                    height={m.h * UNIT + UNIT * 1.2}
                    fill="none"
                    stroke={toneColor(m.tone, MARK)}
                    strokeWidth={UNIT * 0.6}
                    rx={UNIT * 0.6}
                  />
                );
              })}
            </g>
          </g>
        </svg>
        {/* Mark labels sit under the module, never over the pixels; the row keeps its height so nothing shifts. */}
        {marks.some((m) => m.label) && (
          <div style={{ position: "relative", height: 62, marginTop: 16 }}>
            {marks.map((m, i) => {
              const o = m.label ? fade(m.atSeconds, m.untilSeconds) : 0;
              if (o <= 0) return null;
              const c = toneColor(m.tone, MARK);
              return (
                <div key={`ml${i}`} style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", opacity: o }}>
                  <div
                    style={{
                      padding: "10px 28px",
                      borderRadius: 31,
                      background: c,
                      color: c === MARK ? "#1D1D1F" : "#FFFFFF",
                      fontSize: 32,
                      fontWeight: 700,
                      letterSpacing: "-0.005em",
                      transform: `translateY(${interpolate(o, [0, 1], [-10, 0])}px)`,
                    }}
                  >
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {caption && (
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 28, letterSpacing: "0.005em", color: mutedColor, opacity: capOp }}>{caption}</div>
        )}
      </div>
      {knob && renderKnob(knob)}
      </div>

      {/* Byte card: the 8 bits of one GDDRAM byte, D0 at the top */}
      {byte && (
        <div style={{ ...card, opacity: byteOp, padding: "26px 34px", display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {byteBits.map((b, k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, fontSize: 26, fontFamily: MONO, color: mutedColor, textAlign: "right" }}>D{k}</div>
                <div style={{ width: 40, height: 34, borderRadius: 6, background: "#0B0D12", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {b ? <div style={{ width: 26, height: 22, borderRadius: 3, background: "#F2F8FF", boxShadow: "0 0 10px rgba(220,240,255,0.9)" }} /> : null}
                </div>
                <div style={{ fontSize: 26, fontFamily: MONO, color: b ? textColor : mutedColor, fontWeight: b ? 700 : 400 }}>{b}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.012em", color: textColor }}>{byte.title ?? `Trang ${byte.page} · cột ${byte.col}`}</div>
            <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.02em", color: accentColor, fontFamily: MONO }}>
              0x{byteVal.toString(16).toUpperCase().padStart(2, "0")}
            </div>
            <div style={{ fontSize: 30, fontFamily: MONO, color: mutedColor }}>
              D7…D0 = {byteBits.slice().reverse().join("")}
            </div>
            {byte.note && <div style={{ fontSize: 30, lineHeight: 1.35, color: bodyColor }}>{byte.note}</div>}
          </div>
        </div>
      )}

      {/* Code window */}
      {lines.length > 0 && (
        <div style={{ ...card, opacity: codeCard, transform: `translateY(${interpolate(codeCard, [0, 1], [40, 0])}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: `2px solid ${borderColor}` }}>
            {["#FF5F56", "#FFBD2E", "#27C93F"].map((c) => (
              <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
            ))}
            {codeTitle && <div style={{ marginLeft: 14, fontSize: 26, fontFamily: MONO, color: mutedColor }}>{codeTitle}</div>}
          </div>
          <div style={{ padding: "16px 0 20px", fontFamily: MONO, fontSize: codeFontSize, lineHeight: 1.45, whiteSpace: "pre" }}>
            {lines.map((ln, i) => {
              const p = interpolate(frame - codeStart - i * perLine, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const hl = hlOf(i);
              return (
                <div
                  key={i}
                  style={{
                    opacity: p,
                    transform: `translateX(${interpolate(p, [0, 1], [-12, 0])}px)`,
                    minHeight: codeFontSize * 1.45,
                    padding: "0 28px",
                    background: hl > 0 ? `rgba(0,102,204,${0.12 * hl})` : undefined,
                    boxShadow: hl > 0 ? `inset 6px 0 0 rgba(0,102,204,${hl})` : undefined,
                  }}
                >
                  {colourise(ln, textColor, accentColor, mutedColor)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(sec(pt.atSeconds ?? 1.5 + i * 0.6));
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
