import React from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  OffthreadVideo,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { resolveAsset } from "../lib/resolveAsset";
import chakraBoldUrl from "../fonts/ChakraPetch-Bold.ttf";
import chakraSemiUrl from "../fonts/ChakraPetch-SemiBold.ttf";

// Camera footage of a device in a card, in the learning-series logo look (CLAUDE.md → Look): the logo
// intro, then the clip stays on screen while the header and the panel below it change per phase.
// The clip is retimed by piecewise-linear segments (slow motion, real time, fast forward, holds) and
// zoomed onto rectangles of the clip, so one recording carries the whole video. All times are seconds
// from the cut start; clip rectangles are in the clip's own pixels.

const C = {
  paper: "#F5F1E8",
  card: "#FBF8F2",
  navy: "#1B2A34",
  body: "#3E4B55",
  caption: "#56616A",
  orange: "#C8461E",
  rust: "#B23C17",
  ok: "#1F6B43",
  dim: "#D9D2C3",
};
const DISPLAY = "'Chakra Petch', Inter, system-ui, sans-serif";
const BODY = "Inter, system-ui, sans-serif";
const NO_LIGA: React.CSSProperties = { fontVariantLigatures: "none", fontFeatureSettings: '"calt" 0, "liga" 0' };

if (typeof FontFace !== "undefined" && typeof document !== "undefined") {
  const handle = delayRender("Loading bundled Chakra Petch (FootageDemo)", { timeoutInMilliseconds: 60000 });
  const faces = [
    new FontFace("Chakra Petch", `url(${chakraBoldUrl}) format('truetype')`, { weight: "700" }),
    new FontFace("Chakra Petch", `url(${chakraSemiUrl}) format('truetype')`, { weight: "600" }),
  ];
  Promise.all(faces.map((f) => f.load()))
    .then((loaded) => {
      loaded.forEach((f) => document.fonts.add(f));
      continueRender(handle);
    })
    .catch((err) => cancelRender(err));
}

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export interface FdRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FdIntro {
  video: string;
  videoSeconds: number;
  pillLead: string;
  pillText: string;
  pillAt: number;
  /** The intro fades out and the content fades in over 0.35 s from here. */
  fadeAt: number;
}

export interface FdClip {
  src: string;
  /** Clip size in pixels (rectangles below use these pixels). */
  width: number;
  height: number;
  fps: number;
  /** Video time [v0, v1] plays clip time [s0, s1] linearly; outside every segment the nearest end holds. */
  segs: { v0: number; v1: number; s0: number; s1: number }[];
  /** Zoom keys: from `at` the card eases (0.8 s) onto `rect`; before the first key the whole clip shows. */
  zooms?: { at: number; rect: FdRect }[];
  /** Rust outline boxes over the clip from `at` to `until`. */
  marks?: { at: number; until?: number; rect: FdRect }[];
  /** Pills in the card's top-right corner. */
  badges?: { at: number; until?: number; text: string; tone?: "plain" | "rec" | "key" }[];
}

export interface FdRow {
  text: string;
  sub?: string;
  at: number;
  tone?: "plain" | "ok" | "no" | "key";
}

export type FdPanel =
  | {
      kind: "rows";
      rows: FdRow[];
      note?: { text: string; at: number };
      /** Rows wait at 0.3 opacity from the phase start instead of hidden until their cue. */
      dim?: boolean;
    }
  | {
      kind: "record";
      label: string;
      /** Counter shows (t - counterAt + counterFrom) seconds while t >= counterAt. */
      counterAt: number;
      counterFrom?: number;
      counterUntil: number;
      /** Audio level per clip frame (0..1) starting at clip time `levelsAt`. */
      levels: number[];
      levelsAt: number;
    }
  | {
      kind: "wait";
      label: string;
      clockAt: number;
      clockUntil: number;
      clockFrom: number;
      clockTo: number;
      facts: FdRow[];
      flow: string[];
    }
  | {
      kind: "compare";
      heads: [string, string];
      rows: { said: string; heard: string; at: number }[];
      score: { value: string; label: string; at: number };
    }
  | {
      kind: "bars";
      max: number;
      unit: string;
      rows: { label: string; audio: number; decode: number; ratio: string; at: number }[];
      legend: [string, string];
    };

export interface FdPhase {
  at: number;
  eyebrow: string;
  title: string;
  panel: FdPanel;
}

export interface FdData {
  intro: FdIntro;
  clip: FdClip;
  phases: FdPhase[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const show = (t: number, at = 0, dur = 0.35) =>
  interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
const span = (t: number, at: number, until?: number, dur = 0.3) =>
  show(t, at, dur) * (until === undefined ? 1 : 1 - show(t, until, dur));
const fmt = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");

/** Clip time shown at video time t. */
const clipTime = (t: number, segs: FdClip["segs"]) => {
  if (!segs.length) return 0;
  if (t <= segs[0].v0) return segs[0].s0;
  let s = segs[0].s0;
  for (const g of segs) {
    if (t < g.v0) return s;
    if (t <= g.v1) return g.s0 + ((t - g.v0) / (g.v1 - g.v0)) * (g.s1 - g.s0);
    s = g.s1;
  }
  return s;
};

const CARD = { left: 88, top: 410, width: 832 };

const Pad: React.FC<{ x: number; y: number; filled?: boolean }> = ({ x, y, filled }) => (
  <circle cx={x} cy={y} r={22} fill={filled ? C.orange : C.paper} stroke={C.orange} strokeWidth={9} />
);

// ---------------------------------------------------------------------------
// Intro (the series logo clip, held on its last frame, with the title pill)
// ---------------------------------------------------------------------------

const Intro: React.FC<{ d: FdIntro; t: number; frame: number; fps: number }> = ({ d, t, frame, fps }) => {
  const lastFrame = Math.round(d.videoSeconds * fps) - 1;
  const fade = 1 - show(t, d.fadeAt, 0.35);
  if (fade <= 0) return null;
  const video = <OffthreadVideo src={resolveAsset(d.video)} muted style={{ width: "100%", height: "100%" }} />;
  const p = show(t, d.pillAt, 0.4);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {frame >= lastFrame ? <Freeze frame={lastFrame}>{video}</Freeze> : video}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1360,
          display: "flex",
          justifyContent: "center",
          opacity: p,
          transform: `translateY(${(1 - p) * 24}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            padding: "18px 40px",
            borderRadius: 999,
            border: `4px solid ${C.navy}`,
            background: C.card,
            maxWidth: 900,
          }}
        >
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 46, color: C.rust }}>{d.pillLead}</span>
          <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 40, color: C.navy }}>{d.pillText}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// The clip card
// ---------------------------------------------------------------------------

const ClipCard: React.FC<{ clip: FdClip; t: number }> = ({ clip, t }) => {
  const W = CARD.width;
  const H = Math.round((W * clip.height) / clip.width);
  const full: FdRect = { x: 0, y: 0, w: clip.width, h: clip.height };
  // Current zoom rectangle: ease from the previous key's rectangle to the current one.
  let rect = full;
  const zooms = clip.zooms || [];
  zooms.forEach((z, i) => {
    if (t >= z.at) {
      const from = i === 0 ? full : zooms[i - 1].rect;
      const k = show(t, z.at, 0.8);
      rect = {
        x: from.x + (z.rect.x - from.x) * k,
        y: from.y + (z.rect.y - from.y) * k,
        w: from.w + (z.rect.w - from.w) * k,
        h: from.h + (z.rect.h - from.h) * k,
      };
    }
  });
  const s = W / rect.w;
  const frame = Math.min(Math.round(clipTime(t, clip.segs) * clip.fps), Math.round(clip.fps * 3600));
  return (
    <div
      style={{
        position: "absolute",
        left: CARD.left,
        top: CARD.top,
        width: W,
        height: H,
        border: `4px solid ${C.navy}`,
        borderRadius: 28,
        overflow: "hidden",
        background: C.navy,
        boxSizing: "content-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: clip.width,
          height: clip.height,
          transformOrigin: "0 0",
          transform: `scale(${s}) translate(${-rect.x}px, ${-rect.y}px)`,
        }}
      >
        <Freeze frame={frame}>
          <OffthreadVideo src={resolveAsset(clip.src)} muted style={{ width: clip.width, height: clip.height }} />
        </Freeze>
        {(clip.marks || []).map((m, i) => {
          const a = span(t, m.at, m.until);
          if (a <= 0) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: m.rect.x,
                top: m.rect.y,
                width: m.rect.w,
                height: m.rect.h,
                border: `${6 / s}px solid ${C.orange}`,
                borderRadius: 14 / s,
                boxShadow: `0 0 0 ${3 / s}px ${C.paper}`,
                opacity: a,
                boxSizing: "border-box",
              }}
            />
          );
        })}
      </div>
      {(clip.badges || []).map((b, i) => {
        const a = span(t, b.at, b.until);
        if (a <= 0) return null;
        const tone = b.tone || "plain";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              right: 20,
              top: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 24px",
              borderRadius: 999,
              border: `4px solid ${tone === "plain" ? C.navy : C.rust}`,
              background: C.card,
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: 30,
              color: tone === "plain" ? C.navy : C.rust,
              opacity: a,
            }}
          >
            {tone === "rec" && <span style={{ width: 18, height: 18, borderRadius: 9, background: C.rust }} />}
            {b.text}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Panels (below the clip card, y 930..1520)
// ---------------------------------------------------------------------------

const PANEL_TOP = 940;

const RowsPanel: React.FC<{ p: Extract<FdPanel, { kind: "rows" }>; t: number }> = ({ p, t }) => {
  const STEP = 104;
  const cur = p.rows.reduce((acc, r, i) => (t >= r.at ? i : acc), -1);
  const base = p.dim ? 0.3 : 0;
  const reveal = (at: number) => base + (1 - base) * show(t, at, 0.35);
  const lineLen = STEP * (p.rows.length - 1) * (p.dim ? 1 : show(t, p.rows[p.rows.length - 1].at - 0.3, 0.3));
  return (
    <div style={{ position: "absolute", left: CARD.left, top: PANEL_TOP, width: CARD.width }}>
      <svg width={CARD.width} height={STEP * p.rows.length} style={{ position: "absolute", left: 0, top: 0 }}>
        {p.rows.length > 1 && lineLen > 1 && (
          <line
            x1={30}
            y1={40}
            x2={30}
            y2={40 + lineLen}
            stroke={C.navy}
            strokeWidth={8}
            strokeLinecap="round"
            opacity={0.25}
          />
        )}
        {p.rows.map((r, i) => (
          <g key={i} opacity={reveal(r.at)}>
            <Pad x={30} y={40 + STEP * i} filled={i === cur} />
          </g>
        ))}
      </svg>
      {p.rows.map((r, i) => {
        const a = reveal(r.at);
        const color = r.tone === "no" ? C.rust : r.tone === "ok" ? C.ok : C.navy;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 84,
              top: STEP * i + 12,
              right: 0,
              opacity: a,
              transform: `translateX(${(1 - a) * 18}px)`,
            }}
          >
            <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 40, lineHeight: 1.2, color }}>
              {r.tone === "ok" && "✓ "}
              {r.tone === "no" && "✕ "}
              {r.text}
            </div>
            {r.sub && <div style={{ fontFamily: BODY, fontSize: 28, color: C.caption, marginTop: 4 }}>{r.sub}</div>}
          </div>
        );
      })}
      {p.note && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: STEP * p.rows.length + 10,
            fontFamily: BODY,
            fontSize: 28,
            color: C.caption,
            opacity: show(t, p.note.at, 0.35),
          }}
        >
          {p.note.text}
        </div>
      )}
    </div>
  );
};

const RecordPanel: React.FC<{ p: Extract<FdPanel, { kind: "record" }>; t: number; clipT: number; clipFps: number }> = ({
  p,
  t,
  clipT,
  clipFps,
}) => {
  const live = t >= p.counterAt && t < p.counterUntil;
  const secs = Math.max(0, Math.min(t, p.counterUntil) - p.counterAt) + (p.counterFrom || 0);
  const N = 52;
  const BAR = 12;
  const GAPX = (CARD.width - 64 - N * BAR) / (N - 1);
  const idx = Math.round((clipT - p.levelsAt) * clipFps);
  const blink = live ? 0.55 + 0.45 * Math.cos(t * Math.PI * 2) : 1;
  // Waits dimmed until the button is pressed, so "recording" never shows before it starts.
  const armed = 0.35 + 0.65 * show(t, p.counterAt, 0.3);
  return (
    <div style={{ position: "absolute", left: CARD.left, top: PANEL_TOP, width: CARD.width, opacity: armed }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span style={{ width: 30, height: 30, borderRadius: 15, background: C.rust, opacity: blink }} />
        <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 36, color: C.rust }}>{p.label}</span>
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 150, lineHeight: 1, letterSpacing: "-0.02em", marginTop: 18 }}>
        {fmt(secs)}
        <span style={{ fontSize: 64, marginLeft: 14 }}>s</span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 260,
          left: 0,
          width: CARD.width,
          height: 220,
          background: C.card,
          border: `4px solid ${C.navy}`,
          borderRadius: 28,
          boxSizing: "border-box",
        }}
      >
        <svg width={CARD.width - 8} height={212} style={{ position: "absolute", left: 0, top: 0 }}>
          <line x1={28} y1={106} x2={CARD.width - 36} y2={106} stroke={C.dim} strokeWidth={4} strokeLinecap="round" />
          {Array.from({ length: N }, (_, i) => {
            const k = idx - (N - 1 - i);
            const v = k >= 0 && k < p.levels.length && t >= p.counterAt ? p.levels[k] : 0;
            const h = Math.max(8, v * 170);
            return (
              <rect
                key={i}
                x={28 + i * (BAR + GAPX)}
                y={106 - h / 2}
                width={BAR}
                height={h}
                rx={BAR / 2}
                fill={i === N - 1 && live ? C.orange : C.navy}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const WaitPanel: React.FC<{ p: Extract<FdPanel, { kind: "wait" }>; t: number }> = ({ p, t }) => {
  const k = interpolate(t, [p.clockAt, p.clockUntil], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const secs = p.clockFrom + (p.clockTo - p.clockFrom) * k;
  const FW = (CARD.width - 24) / 2;
  const n = p.flow.length;
  const fx = (i: number) => 40 + (i * (CARD.width - 80)) / (n - 1);
  // A dot runs along the trace while the chip works (illustrative, not a measured phase).
  const run = t >= p.clockAt && t < p.clockUntil ? ((t - p.clockAt) / 2.4) % 1 : -1;
  return (
    <div style={{ position: "absolute", left: CARD.left, top: PANEL_TOP, width: CARD.width }}>
      <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 36, color: C.navy }}>{p.label}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 150, lineHeight: 1, letterSpacing: "-0.02em", marginTop: 12, color: C.orange }}>
        {fmt(secs)}
        <span style={{ fontSize: 64, marginLeft: 14 }}>s</span>
      </div>
      {p.facts.map((f, i) => {
        const a = show(t, f.at, 0.35);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (i % 2) * (FW + 24),
              top: 220 + Math.floor(i / 2) * 104,
              width: FW,
              height: 84,
              background: C.card,
              border: `4px solid ${C.navy}`,
              borderRadius: 28,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: BODY,
              fontWeight: 600,
              fontSize: 34,
              color: C.navy,
              opacity: a,
              transform: `scale(${0.92 + 0.08 * a})`,
            }}
          >
            {f.text}
          </div>
        );
      })}
      <svg width={CARD.width} height={120} style={{ position: "absolute", left: 0, top: 440 }}>
        <line x1={fx(0)} y1={30} x2={fx(n - 1)} y2={30} stroke={C.navy} strokeWidth={8} strokeLinecap="round" />
        {run >= 0 && <circle cx={fx(0) + (fx(n - 1) - fx(0)) * run} cy={30} r={12} fill={C.orange} />}
        {p.flow.map((_, i) => (
          <Pad key={i} x={fx(i)} y={30} filled={i === n - 1 && k >= 1} />
        ))}
      </svg>
      {p.flow.map((label, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 510,
            left: fx(i) - 110,
            width: 220,
            textAlign: i === 0 ? "left" : i === n - 1 ? "right" : "center",
            marginLeft: i === 0 ? 70 - 40 : i === n - 1 ? -(70 - 40) : 0,
            fontFamily: BODY,
            fontSize: 28,
            color: C.caption,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
};

const ComparePanel: React.FC<{ p: Extract<FdPanel, { kind: "compare" }>; t: number }> = ({ p, t }) => {
  const COL = 380;
  return (
    <div style={{ position: "absolute", left: CARD.left, top: PANEL_TOP, width: CARD.width }}>
      <div style={{ display: "flex", fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: C.caption }}>
        <div style={{ width: COL, paddingLeft: 32 }}>{p.heads[0]}</div>
        <div style={{ paddingLeft: 92 }}>{p.heads[1]}</div>
      </div>
      {p.rows.map((r, i) => {
        const a = show(t, r.at, 0.35);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: 56 + i * 124,
              left: 0,
              width: CARD.width,
              height: 104,
              background: C.card,
              border: `4px solid ${C.navy}`,
              borderRadius: 28,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              opacity: a,
              transform: `translateY(${(1 - a) * 16}px)`,
            }}
          >
            <div style={{ width: COL, paddingLeft: 32, fontFamily: DISPLAY, fontWeight: 700, fontSize: 56, color: C.navy }}>{r.said}</div>
            <div style={{ width: 60, fontFamily: BODY, fontWeight: 600, fontSize: 44, color: C.caption }}>→</div>
            <div style={{ paddingLeft: 32, fontFamily: DISPLAY, fontWeight: 700, fontSize: 56, color: C.rust }}>{r.heard}</div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          top: 56 + p.rows.length * 124 + 24,
          left: 0,
          display: "flex",
          alignItems: "baseline",
          gap: 20,
          opacity: show(t, p.score.at, 0.35),
        }}
      >
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 150, lineHeight: 1, letterSpacing: "-0.02em", color: C.orange }}>
          {p.score.value}
        </span>
        <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 44, color: C.navy }}>{p.score.label}</span>
      </div>
    </div>
  );
};

const BarsPanel: React.FC<{ p: Extract<FdPanel, { kind: "bars" }>; t: number }> = ({ p, t }) => {
  const TRACK = CARD.width - 200;
  const ROW = 250;
  return (
    <div style={{ position: "absolute", left: CARD.left, top: PANEL_TOP, width: CARD.width }}>
      <div style={{ display: "flex", gap: 36, fontFamily: BODY, fontSize: 30, color: C.caption }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 40, height: 22, borderRadius: 11, border: `4px solid ${C.navy}`, background: C.card }} />
          {p.legend[0]}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 40, height: 22, borderRadius: 11, border: `4px solid ${C.navy}`, background: C.navy }} />
          {p.legend[1]}
        </span>
      </div>
      {p.rows.map((r, i) => {
        const a = show(t, r.at, 0.35);
        const g = show(t, r.at + 0.1, 0.9);
        const top = 70 + i * ROW;
        const bar = (v: number, filled: boolean, y: number) => (
          <div style={{ position: "absolute", top: y, left: 0, display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: Math.max(20, (TRACK * v * g) / p.max),
                height: 50,
                borderRadius: 25,
                border: `4px solid ${C.navy}`,
                background: filled ? C.navy : C.card,
                boxSizing: "border-box",
              }}
            />
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, color: C.navy, opacity: g }}>
              {fmt(v)} {p.unit}
            </span>
          </div>
        );
        return (
          <div key={i} style={{ position: "absolute", top, left: 0, width: CARD.width, height: ROW - 20, opacity: a }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: CARD.width }}>
              <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 36, color: C.navy }}>{r.label}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, color: i === 0 ? C.orange : C.navy }}>{r.ratio}</span>
            </div>
            <div style={{ position: "absolute", top: 92, left: 0, width: CARD.width }}>
              {bar(r.audio, false, 0)}
              {bar(r.decode, true, 70)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const Header: React.FC<{ eyebrow: string; title: string }> = ({ eyebrow, title }) => (
  <div style={{ position: "absolute", left: CARD.left, right: 160, top: 230 }}>
    <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: C.rust }}>
      {eyebrow}
    </div>
    <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 88, lineHeight: 1.02, letterSpacing: "-0.01em", marginTop: 14, whiteSpace: "nowrap" }}>
      {title}
    </div>
  </div>
);

export const FootageDemo: React.FC<{ data: FdData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { intro, clip, phases } = data;
  const content = show(t, intro.fadeAt, 0.35);
  const clipT = clipTime(t, clip.segs);
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: BODY, color: C.navy, ...NO_LIGA }}>
      {content > 0 && (
        <AbsoluteFill style={{ opacity: content }}>
          <ClipCard clip={clip} t={t} />
          {phases.map((ph, i) => {
            const next = phases[i + 1]?.at;
            // Phases crossfade with a short lead: the outgoing one is mostly gone before the next comes in,
            // so two panels never sit on top of each other at half opacity.
            const a = (i === 0 ? 1 : show(t, ph.at + 0.1, 0.35)) * (next === undefined ? 1 : 1 - show(t, next - 0.05, 0.25));
            if (a <= 0 || (i > 0 && t < ph.at)) return null;
            const p = ph.panel;
            return (
              <AbsoluteFill key={i} style={{ opacity: a }}>
                <Header eyebrow={ph.eyebrow} title={ph.title} />
                {p.kind === "rows" && <RowsPanel p={p} t={t} />}
                {p.kind === "record" && <RecordPanel p={p} t={t} clipT={clipT} clipFps={clip.fps} />}
                {p.kind === "wait" && <WaitPanel p={p} t={t} />}
                {p.kind === "compare" && <ComparePanel p={p} t={t} />}
                {p.kind === "bars" && <BarsPanel p={p} t={t} />}
              </AbsoluteFill>
            );
          })}
        </AbsoluteFill>
      )}
      <Intro d={intro} t={t} frame={frame} fps={fps} />
    </AbsoluteFill>
  );
};
