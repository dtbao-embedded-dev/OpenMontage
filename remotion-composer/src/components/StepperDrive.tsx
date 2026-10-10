import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted";

/** Microstep setting: microsteps per full step ("full" = 1, "256" = 256). */
export type StepMode = "full" | "half" | "1/4" | "1/8" | "1/16" | "1/32" | "1/64" | "256";
/** Current regulation: "chop" = fixed off-time chopper (ripple), "spread" = SpreadCycle (small ripple), "stealth" = clean. */
export type StepChopper = "chop" | "spread" | "stealth";

export interface StepperBadge {
  text: string;
  tone?: Tone;
  atSeconds?: number;
  untilSeconds?: number;
}

export interface StepperMotor {
  /** Panel title, e.g. "A4988". */
  label: string;
  /** Line under the title, e.g. "băm dòng". */
  sub?: string;
  /** [[seconds, mode]]: the microstep setting switches at each key (first key holds before it). */
  modeTrack: [number, StepMode][];
  /** Full steps per second (default 2: one electrical turn = 4 full steps every 2 s, so steps stay visible). */
  speed?: number;
  /** [[seconds, full steps/s]] linear between keys; overrides `speed`. */
  speedTrack?: [number, number][];
  /** [[seconds, chopper]]: ripple drawn on the coil currents. */
  chopperTrack?: [number, StepChopper][];
  /** [[seconds, 0..1]]: loudness shown by the noise meter (eased between keys). */
  noiseTrack?: [number, number][];
  /** Label of the noise meter state, [[seconds, text]] (e.g. "rè rè", "gần như im"). */
  noiseText?: [number, string][];
  color?: string;
  badges?: StepperBadge[];
  atSeconds?: number;
  untilSeconds?: number;
}

interface StepperDriveProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  motors: StepperMotor[];
  /** Hide the coil-current plot (field vector and meter only). */
  hidePlot?: boolean;
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
const MICRO: Record<StepMode, number> = { full: 1, half: 2, "1/4": 4, "1/8": 8, "1/16": 16, "1/32": 32, "1/64": 64, "256": 256 };
const MODE_TEXT: Record<StepMode, string> = {
  full: "Cả bước · 1,8°",
  half: "1/2 bước · 0,9°",
  "1/4": "1/4 · 0,45°",
  "1/8": "1/8 · 0,225°",
  "1/16": "1/16 · 0,1125°",
  "1/32": "1/32 · 0,056°",
  "1/64": "1/64 · 0,028°",
  "256": "1/256 · 0,007°",
};

/** Value of a step track at t (the last key reached; the first key before any is reached). */
function held<T>(keys: [number, T][] | undefined, t: number, fallback: T): T {
  if (!keys || keys.length === 0) return fallback;
  let v = keys[0][1];
  for (const [s, x] of keys) if (t >= s) v = x;
  return v;
}

/** Eased value of a numeric track at t (0.5 s ease into each key). */
const eased = (keys: [number, number][] | undefined, t: number, fallback: number) => {
  if (!keys || keys.length === 0) return fallback;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t < t1) {
      const k = Math.min(1, (t - t0) / Math.min(0.5, t1 - t0));
      return v0 + (v1 - v0) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    }
  }
  return keys[keys.length - 1][1];
};

/** Linear value of a speed track at t. */
const linear = (keys: [number, number][], t: number) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t < t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return keys[keys.length - 1][1];
};

/** Position in full steps at time t (integral of the speed from 0). */
const positionAt = (m: StepperMotor, t: number) => {
  if (!m.speedTrack || m.speedTrack.length === 0) return (m.speed ?? 2) * t;
  const dt = 1 / 120;
  let p = 0;
  for (let s = 0; s < t; s += dt) p += linear(m.speedTrack, s) * Math.min(dt, t - s);
  return p;
};

/** Electrical angle (rad) of the commanded current vector for a position p (full steps) at n microsteps/step. */
const quantised = (p: number, n: number) => {
  const k = Math.floor(p * n + 1e-9);
  // Full step drives both coils (vector at 45 deg between the coil axes); microsteps start on a coil axis.
  const theta = ((k / n) * Math.PI) / 2 + (n === 1 ? Math.PI / 4 : 0);
  return { k, theta };
};

/** Deterministic chopper ripple at plot position x (0..1) and frame. */
const ripple = (x: number, frame: number, amp: number) => {
  if (amp <= 0) return 0;
  const u = x * 90 + frame * 0.37;
  const tri = 2 * Math.abs(u - Math.floor(u) - 0.5) - 0.5; // -0.5..0.5 sawtooth-like triangle
  const jitter = Math.sin(x * 731 + frame * 1.7) * 0.25;
  return amp * (tri + jitter);
};

/**
 * Two-phase stepper drive explained in panels: the stator field vector of coils A/B jumping in full steps or creeping
 * in microsteps with the rotor ringing after each jump, the coil currents as stair-step sine/cosine with chopper ripple,
 * and a noise meter. One panel per driver (1 or 2), so "A4988 vs TMC2209 at the same speed" sits side by side.
 */
export const StepperDrive: React.FC<StepperDriveProps> = ({
  name,
  eyebrow,
  tagline,
  motors,
  hidePlot = false,
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
    tone === "accent" ? accentColor : tone === "good" ? proColor : tone === "bad" ? conColor : tone === "muted" ? mutedColor : textColor;
  const toneFill = (tone?: Tone) =>
    tone === "accent" ? "#CFE2F8" : tone === "good" ? "#D5EEDB" : tone === "bad" ? "#F9D5D8" : "#E8E8ED";

  const head = pop(0, 18);
  const two = motors.length > 1;
  const VW = two ? 400 : 640; // panel viewBox width
  const DIAL_R = two ? 128 : 170;
  const plotH = hidePlot ? 0 : two ? 170 : 210;

  const panel = (m: StepperMotor, idx: number) => {
    const vis = life(m.atSeconds, m.untilSeconds);
    const color = m.color ?? accentColor;
    const mode = held(m.modeTrack, t, "full" as StepMode);
    const n = MICRO[mode];
    const chop = held(m.chopperTrack, t, "stealth" as StepChopper);
    const amp = chop === "chop" ? 0.16 : chop === "spread" ? 0.06 : 0;
    const p = positionAt(m, t);
    const speed = m.speedTrack && m.speedTrack.length ? linear(m.speedTrack, t) : m.speed ?? 2;
    const { k, theta } = quantised(p, n);
    // Rotor: settles on the commanded angle with a damped overshoot after each jump (bigger jumps ring more).
    const sinceJump = speed > 0 ? (p - k / n) / speed : 1;
    const jump = Math.PI / 2 / n;
    const ring = jump * Math.exp(-sinceJump / 0.07) * Math.cos(2 * Math.PI * 7 * sinceJump);
    const rotor = theta - ring;

    const cx = VW / 2;
    const dialTop = m.sub ? 96 : 70;
    const cy = dialTop + DIAL_R + 10;
    const plotTop = cy + DIAL_R + 84;
    const meterTop = plotTop + plotH + (hidePlot ? 0 : 52);
    const off = m.sub ? 24 : 0;
    const VH = meterTop + 96 + off + 22;

    // Visited commanded positions in the last electrical turn (trail dots).
    const trail: { x: number; y: number; o: number }[] = [];
    const perTurn = 4 * n;
    const shown = Math.min(perTurn, n === 1 ? 4 : 64);
    for (let j = 1; j <= shown; j++) {
      const kk = k - Math.round((j * perTurn) / shown);
      if (kk < 0) break;
      const th = ((kk / n) * Math.PI) / 2 + (n === 1 ? Math.PI / 4 : 0);
      trail.push({ x: cx + Math.sin(th) * DIAL_R * 0.86, y: cy - Math.cos(th) * DIAL_R * 0.86, o: 1 - j / (shown + 1) });
    }

    // Coil-current plot: the last two electrical turns ending at the current position.
    const PW = VW - 40;
    const span = 8; // full steps on the x axis
    const samples = 360;
    const traceA: string[] = [];
    const traceB: string[] = [];
    for (let i = 0; i <= samples; i++) {
      const x = i / samples;
      const pp = p - span + x * span;
      if (pp < 0) continue;
      const q = quantised(pp, n).theta;
      const ia = Math.sin(q) + ripple(x, frame, amp);
      const ib = Math.cos(q) + ripple(x + 0.37, frame + 11, amp);
      const X = 20 + x * PW;
      traceA.push(`${traceA.length ? "L" : "M"}${X.toFixed(1)},${(plotTop + plotH / 2 - (ia * plotH) / 2.5).toFixed(1)}`);
      traceB.push(`${traceB.length ? "L" : "M"}${X.toFixed(1)},${(plotTop + plotH / 2 - (ib * plotH) / 2.5).toFixed(1)}`);
    }

    // Noise meter with a little shimmer.
    const level = Math.max(0, Math.min(1, eased(m.noiseTrack, t, 0)));
    const bars = 12;
    const barW = (VW - 40 - (bars - 1) * 8) / bars;
    const noiseLabel = held(m.noiseText, t, "");

    return (
      <div
        key={`m${idx}`}
        style={{
          flex: 1,
          minWidth: 0,
          opacity: vis,
          transform: `translateY(${interpolate(vis, [0, 1], [24, 0])}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {/* Title + mode chip */}
          <text x={cx} y={34} textAnchor="middle" fontSize={two ? 40 : 46} fontWeight={700} letterSpacing="-0.01em" fill={textColor}>
            {m.label}
          </text>
          {m.sub && (
            <text x={cx} y={70} textAnchor="middle" fontSize={26} fontWeight={400} fill={mutedColor}>
              {m.sub}
            </text>
          )}
          {/* Dial: one electrical turn (4 full steps), 16 ticks per quarter */}
          <g transform={`translate(0, ${off})`}>
            <circle cx={cx} cy={cy} r={DIAL_R} fill="#FFFFFF" stroke="#D2D2D7" strokeWidth={3} />
            {Array.from({ length: 64 }).map((_, i) => {
              const a = (i / 64) * Math.PI * 2;
              const major = i % 16 === 0;
              const r0 = DIAL_R - (major ? 22 : 10);
              return (
                <line
                  key={`t${i}`}
                  x1={cx + Math.sin(a) * r0}
                  y1={cy - Math.cos(a) * r0}
                  x2={cx + Math.sin(a) * (DIAL_R - 3)}
                  y2={cy - Math.cos(a) * (DIAL_R - 3)}
                  stroke={major ? "#8E9198" : "#D2D2D7"}
                  strokeWidth={major ? 4 : 2}
                />
              );
            })}
            {/* Coil axes */}
            <text x={cx} y={cy - DIAL_R - 12} textAnchor="middle" fontSize={24} fontWeight={600} fill={mutedColor}>A</text>
            <text x={cx + DIAL_R + 12} y={cy + 8} textAnchor="start" fontSize={24} fontWeight={600} fill={mutedColor}>B</text>
            {trail.map((d, i) => (
              <circle key={`d${i}`} cx={d.x} cy={d.y} r={n === 1 ? 9 : 5} fill={color} opacity={0.15 + 0.5 * d.o} />
            ))}
            {/* Commanded field vector */}
            <line
              x1={cx}
              y1={cy}
              x2={cx + Math.sin(theta) * DIAL_R * 0.86}
              y2={cy - Math.cos(theta) * DIAL_R * 0.86}
              stroke={color}
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.45}
            />
            <circle cx={cx + Math.sin(theta) * DIAL_R * 0.86} cy={cy - Math.cos(theta) * DIAL_R * 0.86} r={n === 1 ? 12 : 8} fill={color} />
            {/* Rotor (follows the field, rings after a jump) */}
            <circle cx={cx} cy={cy} r={DIAL_R * 0.42} fill="#3A3A3C" />
            <g transform={`rotate(${(rotor * 180) / Math.PI}, ${cx}, ${cy})`}>
              <rect x={cx - 9} y={cy - DIAL_R * 0.66} width={18} height={DIAL_R * 0.66} rx={9} fill="#1D1D1F" />
              <circle cx={cx} cy={cy - DIAL_R * 0.58} r={6} fill="#FFFFFF" />
            </g>
            <circle cx={cx} cy={cy} r={DIAL_R * 0.14} fill="#C7C7CC" stroke="#8E9198" strokeWidth={2} />
          </g>
          {/* Mode chip */}
          <g transform={`translate(0, ${off})`}>
            <rect x={cx - (two ? 150 : 170)} y={cy + DIAL_R + 6} width={two ? 300 : 340} height={44} rx={22} fill={n === 1 ? "#E8E8ED" : "#CFE2F8"} />
            <text x={cx} y={cy + DIAL_R + 37} textAnchor="middle" fontSize={26} fontWeight={600} fill={textColor}>
              {MODE_TEXT[mode]}
            </text>
          </g>
          {/* Coil currents */}
          {!hidePlot && (
            <g transform={`translate(0, ${off + 22})`}>
              <rect x={20} y={plotTop} width={PW} height={plotH} rx={14} fill="#F5F5F7" />
              <line x1={20} y1={plotTop + plotH / 2} x2={20 + PW} y2={plotTop + plotH / 2} stroke="#D2D2D7" strokeWidth={2} />
              <path d={traceB.join(" ")} fill="none" stroke="#8E9198" strokeWidth={3.5} strokeLinejoin="round" />
              <path d={traceA.join(" ")} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" />
              <text x={VW - 20 - 92} y={plotTop - 10} textAnchor="end" fontSize={22} fontWeight={600} fill={color}>
                dòng A
              </text>
              <text x={VW - 20} y={plotTop - 10} textAnchor="end" fontSize={22} fontWeight={600} fill="#5E5E63">
                dòng B
              </text>
            </g>
          )}
          {/* Noise meter */}
          <g transform={`translate(0, ${off + 22})`}>
            <text x={20} y={meterTop - 10} fontSize={24} fontWeight={600} fill={mutedColor}>
              Tiếng ồn
            </text>
            {noiseLabel && (
              <text x={VW - 20} y={meterTop - 10} textAnchor="end" fontSize={26} fontWeight={700} fill={level > 0.5 ? conColor : proColor}>
                {noiseLabel}
              </text>
            )}
            {Array.from({ length: bars }).map((_, i) => {
              const shimmer = level > 0.02 ? 0.88 + 0.12 * Math.sin(t * 23 + i * 1.9) : 1;
              const lit = i < Math.round(level * bars * shimmer);
              const fill = !lit ? "#E8E8ED" : i >= 7 ? conColor : i >= 4 ? "#C9781A" : proColor;
              return <rect key={`b${i}`} x={20 + i * (barW + 8)} y={meterTop} width={barW} height={40} rx={6} fill={fill} />;
            })}
          </g>
        </svg>
        {/* Badges */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minHeight: (m.badges ?? []).length ? 56 : 0 }}>
          {(m.badges ?? []).map((b, i) => {
            const v = life(b.atSeconds, b.untilSeconds);
            if (v <= 0.001) return null;
            return (
              <div
                key={`g${i}`}
                style={{
                  opacity: v,
                  transform: `scale(${interpolate(v, [0, 1], [0.9, 1])})`,
                  background: toneFill(b.tone),
                  color: toneColor(b.tone === "neutral" ? undefined : b.tone),
                  fontSize: 28,
                  fontWeight: 600,
                  borderRadius: 26,
                  padding: "8px 20px",
                  textAlign: "center",
                }}
              >
                {b.text}
              </div>
            );
          })}
        </div>
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
        gap: 34,
      }}
    >
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {/* Panels card */}
      <div
        style={{
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "26px 22px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: two ? 22 : 0, justifyContent: "center" }}>{motors.map(panel)}</div>
        {caption && (
          <div
            style={{
              fontSize: 28,
              fontWeight: 400,
              letterSpacing: "0.005em",
              lineHeight: 1.35,
              color: mutedColor,
              padding: "6px 14px 0",
              opacity: pop(at(captionAtSeconds, 0)),
            }}
          >
            {caption}
          </div>
        )}
      </div>

      {/* Takeaways */}
      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div
                key={pt.text + i}
                style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: p, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}
              >
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
