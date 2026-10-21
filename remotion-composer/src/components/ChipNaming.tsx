import React from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
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

// Learning-series "logo look" (CLAUDE.md → Look): paper background, navy text, one orange accent,
// circuit traces with ring pads, Chakra Petch display + Inter body. Every view paints its own paper
// background, so the Explainer's animated gradient never shows behind it.

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

// Chakra Petch is bundled (google/fonts OFL TTF, latin + latin-ext + vietnamese); rendering waits for it.
// Registered in a microtask, like Explainer's Inter: a delayRender handle created while the bundle is still
// evaluating gets wiped, so it is never cleared and its 60 s timeout fails any render that runs longer.
if (typeof FontFace !== "undefined" && typeof document !== "undefined") {
  queueMicrotask(() => {
    const handle = delayRender("Loading bundled Chakra Petch", { timeoutInMilliseconds: 60000 });
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
  });
}

// ---------------------------------------------------------------------------
// Data shapes (all `at` values are seconds from the cut start)
// ---------------------------------------------------------------------------

export type CnTone = "plain" | "ok" | "no" | "key";

export interface CnPill {
  text: string;
  tone?: CnTone;
  at?: number;
}

export interface CnIntro {
  video: string;
  /** Length of the intro clip; later frames hold its last frame. */
  videoSeconds: number;
  pillLead: string;
  pillText: string;
  pillAt: number;
  /** Seconds from cut start when the clip starts fading to paper (default: cut end − 0.35 s). */
  fadeAt?: number;
}

export interface CnLineup {
  chips: { prefix: string; letter: string; rest: string; image: string }[];
  questionAt?: number;
  /** Lift one card (others dim) with a crossed Wi-Fi note under the grid, from `at` to `until`. */
  focus?: { index: number; at: number; crossAt?: number; until?: number; note: string };
}

export interface CnFamilyRow {
  letter: string;
  name: string;
  cpu: string;
  pills: CnPill[];
  at: number;
}

export interface CnMyth {
  intro: string;
  claimA: string;
  strikeA: number;
  image: string;
  imageLabel: string;
  imageSub: string;
  imageAt: number;
  claimB: string;
  strikeB: number;
  compareAt: number;
  compare: { name: string; line: string; tone: CnTone }[];
}

export interface CnCodePart {
  text: string;
  label?: string;
  sub?: string;
  at?: number;
  /** Module view: highlight the antenna strip of the module photo while this part is current. */
  antenna?: boolean;
  /** Module view: show the second photo (e.g. the 1U variant) beside this row. */
  image?: string;
  /** A labelled row that is not part of the code line (e.g. the 1U variant of WROOM-1). */
  offCode?: boolean;
}

export interface CnCode {
  parts: CnCodePart[];
  codeSize?: number;
  source?: string;
  result?: { text: string; at: number };
  image?: string;
}

export interface CnTemp {
  max: number;
  marks: { value: number; label: string; sub?: string; at: number; key?: boolean; dashed?: boolean }[];
  keyText: string;
  keyAt: number;
  box: { text: string; at: number };
}

export interface CnRecap {
  rows: { letter: string; text: string; at: number }[];
  tip: { text: string; at: number };
  next: { text: string; at: number };
}

export interface CnData {
  eyebrow?: string;
  title?: string;
  intro?: CnIntro;
  lineup?: CnLineup;
  family?: CnFamilyRow[];
  myth?: CnMyth;
  code?: CnCode;
  temp?: CnTemp;
  recap?: CnRecap;
}

export type CnView = "intro" | "lineup" | "family" | "myth" | "code" | "module" | "temp" | "recap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const show = (t: number, at = 0, dur = 0.35) =>
  interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

/** Index of the last item whose `at` has passed (-1 before the first). */
const currentIndex = (t: number, ats: number[]) => {
  let idx = -1;
  ats.forEach((a, i) => {
    if (t >= a) idx = i;
  });
  return idx;
};

const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { t: frame / fps, frame, fps };
};

const Paper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: C.paper, fontFamily: BODY, color: C.navy, ...NO_LIGA }}>{children}</AbsoluteFill>
);

const Header: React.FC<{ eyebrow?: string; title?: string; t: number }> = ({ eyebrow, title, t }) => {
  const a = show(t, 0, 0.3);
  return (
    <div style={{ position: "absolute", left: 88, right: 160, top: 230, opacity: a, transform: `translateY(${(1 - a) * 16}px)` }}>
      {eyebrow && (
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: C.rust }}>
          {eyebrow}
        </div>
      )}
      {title && (
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, lineHeight: 1.02, letterSpacing: "-0.01em", marginTop: 14 }}>
          {title}
        </div>
      )}
    </div>
  );
};

const Card: React.FC<{
  style?: React.CSSProperties;
  highlight?: boolean;
  dashed?: boolean;
  children: React.ReactNode;
}> = ({ style, highlight, dashed, children }) => (
  <div
    style={{
      position: "absolute",
      background: C.card,
      border: `4px ${dashed ? "dashed" : "solid"} ${highlight || dashed ? C.rust : C.navy}`,
      borderRadius: 28,
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);

const Pill: React.FC<{ pill: CnPill; t: number; size?: number }> = ({ pill, t, size = 28 }) => {
  const a = pill.at === undefined ? 1 : show(t, pill.at, 0.3);
  const tone = pill.tone || "plain";
  const color = tone === "no" ? C.rust : tone === "ok" ? C.ok : C.navy;
  const border = tone === "no" || tone === "key" ? C.rust : tone === "ok" ? C.ok : C.navy;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: `${size * 0.22}px ${size * 0.6}px`,
        borderRadius: 999,
        border: `3px ${tone === "no" ? "dashed" : "solid"} ${border}`,
        background: C.card,
        fontWeight: 600,
        fontSize: size,
        color,
        opacity: a,
        transform: `scale(${0.85 + 0.15 * a})`,
        whiteSpace: "nowrap",
      }}
    >
      {tone === "no" && <span style={{ fontWeight: 700 }}>✕</span>}
      {tone === "ok" && <span style={{ fontWeight: 700 }}>✓</span>}
      {pill.text}
    </div>
  );
};

/** Ring pad of the logo motif: filled = current item. */
const Pad: React.FC<{ x: number; y: number; filled?: boolean; color?: string }> = ({ x, y, filled, color = C.orange }) => (
  <circle cx={x} cy={y} r={22} fill={filled ? color : C.paper} stroke={color} strokeWidth={9} />
);

const WifiIcon: React.FC<{ size: number; crossed?: number }> = ({ size, crossed = 0 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    {[42, 28, 14].map((r, i) => (
      <path
        key={i}
        d={`M ${50 - r} ${78 - r * 0.62} A ${r} ${r} 0 0 1 ${50 + r} ${78 - r * 0.62}`}
        fill="none"
        stroke={C.navy}
        strokeWidth={8}
        strokeLinecap="round"
      />
    ))}
    <circle cx={50} cy={80} r={7} fill={C.navy} />
    {crossed > 0 && (
      <line x1={14} y1={14} x2={14 + 72 * crossed} y2={14 + 72 * crossed} stroke={C.rust} strokeWidth={10} strokeLinecap="round" />
    )}
  </svg>
);

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const IntroView: React.FC<{ d: CnIntro }> = ({ d }) => {
  const { t, frame, fps } = useT();
  const { durationInFrames } = useVideoConfig();
  const lastFrame = Math.round(d.videoSeconds * fps) - 1;
  const fadeAt = d.fadeAt ?? durationInFrames / fps - 0.35;
  const fade = interpolate(t, [fadeAt, fadeAt + 0.35], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const video = <OffthreadVideo src={resolveAsset(d.video)} muted style={{ width: "100%", height: "100%" }} />;
  const p = show(t, d.pillAt, 0.4);
  return (
    <Paper>
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
    </Paper>
  );
};

const LineupView: React.FC<{ data: CnData }> = ({ data }) => {
  const { t } = useT();
  const d = data.lineup!;
  const W = 400;
  const H = 410;
  const focus = d.focus;
  const f = focus ? show(t, focus.at, 0.4) * (1 - (focus.until === undefined ? 0 : show(t, focus.until, 0.4))) : 0;
  return (
    <Paper>
      <Header eyebrow={data.eyebrow} title={data.title} t={t} />
      {d.chips.map((chip, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 88 + col * (W + 32);
        const y = 520 + row * (H + 28);
        const isFocus = focus?.index === i;
        const dim = focus && !isFocus ? 1 - 0.6 * f : 1;
        const a = show(t, 0.05 * i, 0.35);
        const q = d.questionAt === undefined ? 0 : show(t, d.questionAt + 0.12 * i, 0.3);
        return (
          <Card
            key={i}
            highlight={isFocus && f > 0.5}
            style={{ left: x, top: y, width: W, height: H, opacity: a * dim, transform: `translateY(${(1 - a) * 20}px)` }}
          >
            <div style={{ position: "absolute", left: 20, right: 20, top: 20, height: 250, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Img src={resolveAsset(chip.image)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 26,
                textAlign: "center",
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 62,
                letterSpacing: "-0.01em",
              }}
            >
              <span>{chip.prefix}</span>
              <span style={{ position: "relative", display: "inline-block" }}>
                <span style={{ color: q > 0 ? C.orange : C.navy }}>{chip.letter}</span>
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: -64,
                    transform: `translateX(-50%) scale(${q})`,
                    fontSize: 60,
                    color: C.orange,
                  }}
                >
                  ?
                </span>
              </span>
              <span>{chip.rest}</span>
            </div>
          </Card>
        );
      })}
      {focus && (
        <Card
          highlight
          style={{
            left: 88,
            top: 1390,
            width: 832,
            height: 128,
            opacity: f,
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "0 32px",
          }}
        >
          <WifiIcon size={84} crossed={show(t, focus.crossAt ?? focus.at + 0.3, 0.4)} />
          <div style={{ fontWeight: 600, fontSize: 46 }}>{focus.note}</div>
        </Card>
      )}
    </Paper>
  );
};

const FamilyView: React.FC<{ data: CnData }> = ({ data }) => {
  const { t } = useT();
  const rows = data.family!;
  const top = 480;
  const rowH = 190;
  const gap = 18;
  const cur = currentIndex(t, rows.map((r) => r.at));
  const padX = 116;
  const ys = rows.map((_, i) => top + i * (rowH + gap) + rowH / 2);
  const traceTo = cur < 0 ? ys[0] : ys[cur];
  const traceGrow = cur < 0 ? 0 : show(t, rows[cur].at, 0.4);
  const prevY = cur <= 0 ? ys[0] : ys[cur - 1];
  const traceEnd = prevY + (traceTo - prevY) * traceGrow;
  return (
    <Paper>
      <Header eyebrow={data.eyebrow} title={data.title} t={t} />
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
        <line x1={padX} y1={ys[0]} x2={padX} y2={ys[ys.length - 1]} stroke={C.dim} strokeWidth={8} strokeLinecap="round" />
        <line x1={padX} y1={ys[0]} x2={padX} y2={traceEnd} stroke={C.orange} strokeWidth={8} strokeLinecap="round" />
        {ys.map((y, i) => (
          <React.Fragment key={i}>
            <line x1={padX + 22} y1={y} x2={170} y2={y} stroke={i <= cur ? C.orange : C.dim} strokeWidth={8} />
            <Pad x={padX} y={y} filled={i === cur} color={i <= cur ? C.orange : C.dim} />
          </React.Fragment>
        ))}
      </svg>
      {rows.map((r, i) => {
        const on = show(t, r.at, 0.35);
        const isCur = i === cur;
        return (
          <Card
            key={i}
            highlight={isCur}
            style={{
              left: 170,
              top: top + i * (rowH + gap),
              width: 750,
              height: rowH,
              opacity: 0.32 + 0.68 * on,
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "0 24px",
            }}
          >
            <div
              style={{
                flex: "0 0 auto",
                width: r.letter.length > 1 ? 150 : 112,
                height: 112,
                borderRadius: 22,
                border: `4px solid ${C.navy}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: r.letter.length > 1 ? 40 : 80,
                color: isCur ? C.orange : C.navy,
                background: C.paper,
              }}
            >
              {r.letter}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ fontWeight: 600, fontSize: 42, letterSpacing: "-0.012em" }}>{r.name}</span>
                <span style={{ fontSize: 30, color: C.body }}>{r.cpu}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {r.pills.map((p, k) => (
                  <Pill key={k} pill={p} t={t} size={28} />
                ))}
              </div>
            </div>
          </Card>
        );
      })}
    </Paper>
  );
};

const Strike: React.FC<{ p: number; children: React.ReactNode; size: number }> = ({ p, children, size }) => (
  <span style={{ position: "relative", display: "inline-block" }}>
    <span style={{ opacity: 1 - 0.45 * p }}>{children}</span>
    <span
      style={{
        position: "absolute",
        left: -8,
        top: "52%",
        height: size * 0.09,
        width: `calc(${p * 100}% + ${16 * p}px)`,
        background: C.rust,
        borderRadius: 99,
      }}
    />
  </span>
);

const MythView: React.FC<{ data: CnData }> = ({ data }) => {
  const { t } = useT();
  const d = data.myth!;
  const img = show(t, d.imageAt, 0.4);
  const cmp = show(t, d.compareAt, 0.4);
  return (
    <Paper>
      <Header eyebrow={data.eyebrow} title={data.title} t={t} />
      <div style={{ position: "absolute", left: 88, right: 160, top: 470, fontSize: 40, lineHeight: 1.4, color: C.body }}>{d.intro}</div>
      <Card style={{ left: 88, top: 600, width: 832, height: 420 }}>
        <div style={{ position: "absolute", left: 36, top: 26, fontFamily: DISPLAY, fontWeight: 700, fontSize: 88 }}>
          <Strike p={show(t, d.strikeA, 0.45)} size={88}>
            {d.claimA}
          </Strike>
        </div>
        <div
          style={{
            position: "absolute",
            left: 30,
            right: 30,
            top: 150,
            bottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 28,
            opacity: img,
            transform: `translateY(${(1 - img) * 18}px)`,
          }}
        >
          <Img src={resolveAsset(d.image)} style={{ height: 230, maxWidth: 330, objectFit: "contain" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 56 }}>{d.imageLabel}</div>
            <div style={{ fontSize: 36, color: C.body }}>{d.imageSub}</div>
          </div>
        </div>
      </Card>
      <Card style={{ left: 88, top: 1056, width: 832, height: 440 }}>
        <div style={{ position: "absolute", left: 36, top: 26, fontFamily: DISPLAY, fontWeight: 700, fontSize: 64 }}>
          <Strike p={show(t, d.strikeB, 0.45)} size={64}>
            {d.claimB}
          </Strike>
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 140, display: "flex", gap: 24, opacity: cmp }}>
          {d.compare.map((c, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 250,
                borderRadius: 24,
                border: `4px ${c.tone === "no" ? "dashed" : "solid"} ${c.tone === "ok" ? C.ok : c.tone === "no" ? C.rust : C.navy}`,
                background: C.paper,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                transform: `translateY(${(1 - show(t, d.compareAt + 0.2 * i, 0.35)) * 20}px)`,
              }}
            >
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 96 }}>{c.name}</div>
              <div style={{ fontWeight: 600, fontSize: 34, color: c.tone === "ok" ? C.ok : c.tone === "no" ? C.rust : C.navy }}>
                {c.tone === "ok" ? "✓ " : c.tone === "no" ? "✕ " : ""}
                {c.line}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Paper>
  );
};

/** The part number as a row of segments; the current one is boxed in orange. */
const CodeLine: React.FC<{ parts: CnCodePart[]; cur: number; t: number; size: number; top: number }> = ({ parts, cur, t, size, top }) => (
  <div
    style={{
      position: "absolute",
      left: 88,
      right: 160,
      top,
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      fontFamily: DISPLAY,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: "-0.01em",
    }}
  >
    {parts.map((p, i) => {
      if (p.offCode) return null;
      const labelled = p.label !== undefined;
      const seen = labelled && p.at !== undefined && t >= p.at;
      const isCur = i === cur;
      return (
        <span
          key={i}
          style={{
            padding: labelled ? `0 ${size * 0.06}px` : 0,
            borderRadius: 10,
            border: labelled ? `4px solid ${isCur ? C.orange : seen ? C.navy : "transparent"}` : "none",
            color: isCur ? C.orange : C.navy,
            background: isCur ? C.card : "transparent",
            margin: labelled ? `0 2px` : 0,
          }}
        >
          {p.text}
        </span>
      );
    })}
  </div>
);

const CodeView: React.FC<{ data: CnData }> = ({ data }) => {
  const { t } = useT();
  const d = data.code!;
  const labelled = d.parts.map((p, i) => ({ p, i })).filter((x) => x.p.label !== undefined);
  const curLabelled = currentIndex(t, labelled.map((x) => x.p.at ?? 0));
  const cur = curLabelled < 0 ? -1 : labelled[curLabelled].i;
  const rowTop = 720;
  const rowH = 112;
  const res = d.result ? show(t, d.result.at, 0.4) : 0;
  return (
    <Paper>
      <Header eyebrow={data.eyebrow} title={data.title} t={t} />
      <CodeLine parts={d.parts} cur={cur} t={t} size={d.codeSize ?? 104} top={500} />
      {d.source && <div style={{ position: "absolute", left: 88, top: 640, fontSize: 28, color: C.caption }}>{d.source}</div>}
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
        {labelled.map((x, k) => {
          const y = rowTop + k * (rowH + 10) + rowH / 2;
          const on = t >= (x.p.at ?? 0);
          return (
            <React.Fragment key={k}>
              {k > 0 && <line x1={116} y1={y - rowH - 10} x2={116} y2={y} stroke={on ? C.orange : C.dim} strokeWidth={8} />}
              <Pad x={116} y={y} filled={k === curLabelled} color={on ? C.orange : C.dim} />
            </React.Fragment>
          );
        })}
      </svg>
      {labelled.map((x, k) => {
        const a = show(t, x.p.at ?? 0, 0.35);
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: 170,
              right: 160,
              top: rowTop + k * (rowH + 10),
              height: rowH,
              display: "flex",
              alignItems: "center",
              gap: 26,
              opacity: 0.25 + 0.75 * a,
            }}
          >
            <div
              style={{
                flex: "0 0 auto",
                minWidth: 96,
                height: 96,
                padding: "0 14px",
                boxSizing: "border-box",
                borderRadius: 20,
                border: `4px solid ${k === curLabelled ? C.orange : C.navy}`,
                background: C.card,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 56,
                color: k === curLabelled ? C.orange : C.navy,
              }}
            >
              {x.p.text}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 44, letterSpacing: "-0.012em" }}>{x.p.label}</div>
              {x.p.sub && <div style={{ fontSize: 32, color: C.body }}>{x.p.sub}</div>}
            </div>
          </div>
        );
      })}
      {d.result && (
        <Card
          highlight
          style={{
            left: 88,
            top: 1360,
            width: 832,
            height: 150,
            opacity: res,
            transform: `translateY(${(1 - res) * 20}px)`,
            display: "flex",
            alignItems: "center",
            padding: "0 36px",
            fontWeight: 600,
            fontSize: 44,
            lineHeight: 1.2,
          }}
        >
          {d.result.text}
        </Card>
      )}
    </Paper>
  );
};

const ModuleView: React.FC<{ data: CnData }> = ({ data }) => {
  const { t } = useT();
  const d = data.code!;
  const labelled = d.parts.map((p, i) => ({ p, i })).filter((x) => x.p.label !== undefined);
  const curLabelled = currentIndex(t, labelled.map((x) => x.p.at ?? 0));
  const cur = curLabelled < 0 ? -1 : labelled[curLabelled].i;
  const antennaOn = curLabelled >= 0 && labelled[curLabelled].p.antenna ? show(t, labelled[curLabelled].p.at ?? 0, 0.3) : 0;
  // Module photo: 736 x 1040, antenna strip = top 300 px of the render.
  const photoH = 640;
  const photoW = (736 / 1040) * photoH;
  const photoTop = 640;
  const rowsLeft = 88 + photoW + 40;
  const rowTop = 640;
  const rowH = 150;
  return (
    <Paper>
      <Header eyebrow={data.eyebrow} title={data.title} t={t} />
      <CodeLine parts={d.parts} cur={cur} t={t} size={d.codeSize ?? 58} top={500} />
      <div style={{ position: "absolute", left: 88, top: photoTop, width: photoW, height: photoH, opacity: show(t, 0, 0.4) }}>
        <Img src={resolveAsset(d.image!)} style={{ width: "100%", height: "100%" }} />
        <div
          style={{
            position: "absolute",
            left: -10,
            top: -10,
            width: photoW + 20,
            height: (300 / 1040) * photoH + 14,
            border: `6px solid ${C.orange}`,
            borderRadius: 18,
            opacity: antennaOn,
          }}
        />
      </div>
      {labelled.map((x, k) => {
        const a = show(t, x.p.at ?? 0, 0.35);
        const isCur = k === curLabelled;
        return (
          <div
            key={k}
            style={{
              position: "absolute",
              left: rowsLeft,
              right: 160,
              top: rowTop + k * (rowH + 14),
              height: rowH,
              opacity: 0.25 + 0.75 * a,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 6,
              borderLeft: `8px solid ${isCur ? C.orange : t >= (x.p.at ?? 0) ? C.navy : C.dim}`,
              paddingLeft: 22,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 50, color: isCur ? C.orange : C.navy }}>{x.p.text}</span>
              {x.p.image && <Img src={resolveAsset(x.p.image)} style={{ height: 120, opacity: a }} />}
            </div>
            <div style={{ fontWeight: 600, fontSize: 34, lineHeight: 1.15 }}>{x.p.label}</div>
            {x.p.sub && <div style={{ fontSize: 28, color: C.body }}>{x.p.sub}</div>}
          </div>
        );
      })}
      {d.source && <div style={{ position: "absolute", left: 88, top: photoTop + photoH + 30, right: 160, fontSize: 28, color: C.caption }}>{d.source}</div>}
    </Paper>
  );
};

const TempView: React.FC<{ data: CnData }> = ({ data }) => {
  const { t } = useT();
  const d = data.temp!;
  // Vertical thermometer, 0 °C at the bottom.
  const x = 200;
  const yTop = 520;
  const yBot = 1340;
  const yOf = (v: number) => yBot - (v / d.max) * (yBot - yTop);
  const cur = currentIndex(t, d.marks.map((m) => m.at));
  const level = (() => {
    if (cur < 0) return 25 * show(t, 0, 0.6);
    const m = d.marks[cur];
    const prev = cur === 0 ? 25 : d.marks[cur - 1].value;
    return prev + (m.value - prev) * show(t, m.at, 0.8);
  })();
  const firstVal = d.marks[0].value;
  const box = show(t, d.box.at, 0.4);
  const key = show(t, d.keyAt, 0.4);
  return (
    <Paper>
      <Header eyebrow={data.eyebrow} title={data.title} t={t} />
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
        <rect x={x - 34} y={yTop - 30} width={68} height={yBot - yTop + 60} rx={34} fill={C.card} stroke={C.navy} strokeWidth={4} />
        <circle cx={x} cy={yBot + 70} r={62} fill={C.orange} stroke={C.navy} strokeWidth={4} />
        <rect x={x - 18} y={yOf(Math.min(level, firstVal))} width={36} height={yBot + 40 - yOf(Math.min(level, firstVal))} fill={C.orange} />
        {level > firstVal && (
          <rect x={x - 18} y={yOf(level)} width={36} height={yOf(firstVal) - yOf(level)} fill="url(#hatch)" stroke={C.rust} strokeWidth={3} strokeDasharray="10 8" />
        )}
        <defs>
          <pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="16" height="16" fill={C.card} />
            <rect width="7" height="16" fill={C.orange} opacity={0.55} />
          </pattern>
        </defs>
        {[0, 25, 50, 75, 100].filter((v) => v <= d.max).map((v) => (
          <g key={v}>
            <line x1={x - 60} y1={yOf(v)} x2={x - 40} y2={yOf(v)} stroke={C.caption} strokeWidth={4} />
            <text x={x - 70} y={yOf(v) + 10} textAnchor="end" fontFamily={BODY} fontSize={28} fill={C.caption}>
              {v}
            </text>
          </g>
        ))}
        {d.marks.map((m, i) => {
          const a = show(t, m.at, 0.4);
          return (
            <line
              key={i}
              x1={x + 40}
              y1={yOf(m.value)}
              x2={x + 40 + 80 * a}
              y2={yOf(m.value)}
              stroke={m.key ? C.orange : C.navy}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={m.dashed ? "18 14" : undefined}
            />
          );
        })}
      </svg>
      {d.marks.map((m, i) => {
        const a = show(t, m.at, 0.4);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x + 140,
              right: 160,
              top: yOf(m.value) - 44,
              opacity: a,
              transform: `translateX(${(1 - a) * 20}px)`,
            }}
          >
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: m.key ? 76 : 64, color: m.key ? C.orange : C.navy, lineHeight: 1 }}>
              {m.value} °C
            </div>
            <div style={{ fontWeight: 600, fontSize: 34, marginTop: 8, lineHeight: 1.2 }}>{m.label}</div>
            {m.sub && <div style={{ fontSize: 30, color: C.body, marginTop: 4 }}>{m.sub}</div>}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: x + 140, top: yOf(25) - 30, fontSize: 30, color: C.caption, opacity: key }}>{d.keyText}</div>
      <Card
        dashed
        style={{
          left: 340,
          top: 1330,
          width: 580,
          height: 180,
          opacity: box,
          transform: `translateY(${(1 - box) * 20}px)`,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "0 28px",
        }}
      >
        <svg width={96} height={96} viewBox="0 0 100 100">
          {Array.from({ length: 8 }).map((_, i) => {
            const ang = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={50 + Math.cos(ang) * 30}
                y1={50 + Math.sin(ang) * 30}
                x2={50 + Math.cos(ang) * 44}
                y2={50 + Math.sin(ang) * 44}
                stroke={C.orange}
                strokeWidth={8}
                strokeLinecap="round"
              />
            );
          })}
          <circle cx={50} cy={50} r={18} fill={C.orange} />
        </svg>
        <div style={{ fontWeight: 600, fontSize: 36, lineHeight: 1.2 }}>{d.box.text}</div>
      </Card>
    </Paper>
  );
};

const RecapView: React.FC<{ data: CnData }> = ({ data }) => {
  const { t } = useT();
  const d = data.recap!;
  const top = 480;
  const rowH = 128;
  const cur = currentIndex(t, d.rows.map((r) => r.at));
  const tip = show(t, d.tip.at, 0.35);
  const next = show(t, d.next.at, 0.4);
  return (
    <Paper>
      <Header eyebrow={data.eyebrow} title={data.title} t={t} />
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
        {d.rows.map((r, i) => {
          const y = top + i * (rowH + 12) + rowH / 2;
          const on = t >= r.at;
          return (
            <React.Fragment key={i}>
              {i > 0 && <line x1={116} y1={y - rowH - 12} x2={116} y2={y} stroke={on ? C.orange : C.dim} strokeWidth={8} />}
              <Pad x={116} y={y} filled={i === cur} color={on ? C.orange : C.dim} />
            </React.Fragment>
          );
        })}
      </svg>
      {d.rows.map((r, i) => {
        const a = show(t, r.at, 0.35);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 170,
              right: 160,
              top: top + i * (rowH + 12),
              height: rowH,
              display: "flex",
              alignItems: "center",
              gap: 26,
              opacity: 0.25 + 0.75 * a,
            }}
          >
            <div
              style={{
                flex: "0 0 auto",
                minWidth: 104,
                height: 104,
                padding: "0 12px",
                boxSizing: "border-box",
                borderRadius: 20,
                border: `4px solid ${i === cur ? C.orange : C.navy}`,
                background: C.card,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: r.letter.length > 1 ? 36 : 64,
                color: i === cur ? C.orange : C.navy,
              }}
            >
              {r.letter}
            </div>
            <div style={{ fontWeight: 600, fontSize: 44, letterSpacing: "-0.012em", lineHeight: 1.15 }}>{r.text}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 88, top: top + d.rows.length * (rowH + 12) + 14, opacity: tip }}>
        <Pill pill={{ text: d.tip.text, tone: "key" }} t={t} size={38} />
      </div>
      <Card
        dashed
        style={{
          left: 88,
          top: 1370,
          width: 832,
          height: 140,
          opacity: next,
          transform: `translateY(${(1 - next) * 20}px)`,
          display: "flex",
          alignItems: "center",
          padding: "0 36px",
          gap: 20,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 30, letterSpacing: "0.22em", textTransform: "uppercase", color: C.rust }}>Video sau</span>
        <span style={{ fontWeight: 600, fontSize: 42 }}>{d.next.text}</span>
      </Card>
    </Paper>
  );
};

export const ChipNaming: React.FC<{ view: CnView; data: CnData }> = ({ view, data }) => {
  if (view === "intro" && data.intro) return <IntroView d={data.intro} />;
  if (view === "lineup" && data.lineup) return <LineupView data={data} />;
  if (view === "family" && data.family) return <FamilyView data={data} />;
  if (view === "myth" && data.myth) return <MythView data={data} />;
  if (view === "code" && data.code) return <CodeView data={data} />;
  if (view === "module" && data.code) return <ModuleView data={data} />;
  if (view === "temp" && data.temp) return <TempView data={data} />;
  if (view === "recap" && data.recap) return <RecapView data={data} />;
  return <Paper>{null}</Paper>;
};
