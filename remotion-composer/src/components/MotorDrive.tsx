import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted";

export type MotorMode = "forward" | "reverse" | "coast" | "brake";

export interface MotorState {
  /** Seconds after cut start; the last state reached is the current one (the first holds before it). */
  atSeconds: number;
  mode: MotorMode;
}

export interface MotorTag {
  text: string;
  /** Pill centre in diagram units of the current view (width 1000). */
  x: number;
  y: number;
  tone?: Tone;
  fontSize?: number;
  atSeconds?: number;
  untilSeconds?: number;
}

export interface MotorReadout {
  label: string;
  /** "rpm" follows |rpmTrack|, "duty" follows dutyTrack (percent), "text" shows `text`. */
  source: "rpm" | "duty" | "text";
  text?: string;
  unit?: string;
  sub?: string;
  highlight?: boolean;
  atSeconds?: number;
}

export interface MotorStatus {
  atSeconds: number;
  untilSeconds?: number;
  text: string;
  tone?: Tone;
}

interface MotorDriveProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** "motor": geared motor with a wheel; "bridge": H-bridge with the motor in the middle; "both": stacked. */
  view?: "motor" | "bridge" | "both";
  /** [[seconds, rpm]] output-shaft speed, signed (+ forward). Eases between keys; the wheel angle integrates it. */
  rpmTrack?: [number, number][];
  /** [[seconds, percent]] PWM duty shown by the "duty" readout and the PWM pin trace. */
  dutyTrack?: [number, number][];
  states?: MotorState[];
  /** [[start, end]] windows when a pad presses on the tyre (load). */
  loads?: [number, number][];
  loadLabel?: string;
  /** Show the bridge view from this time (view "both"); in view "bridge" it is drawn from frame 0. */
  bridgeAtSeconds?: number;
  /** Names of the two driver inputs (default IN1 / IN2). */
  pinLabels?: [string, string];
  /** Show the IN1 / IN2 level row and the mode pill from this time; omit to hide. */
  pinsAtSeconds?: number;
  /** Show the truth table from this time; omit to hide. */
  tableAtSeconds?: number;
  /** Result text per mode in the truth table and the mode pill. */
  modeLabels?: Partial<Record<MotorMode, string>>;
  tags?: MotorTag[];
  readouts?: MotorReadout[];
  status?: MotorStatus[];
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
const MOTOR_H = 440;
const BRIDGE_H = 600;
const DEFAULT_LABELS: Record<MotorMode, string> = { forward: "Thuận", reverse: "Ngược", coast: "Thả trôi", brake: "Phanh" };

/** Piecewise ease between [[t, v]] keys (seconds); before the first key the first value holds. */
const track = (keys: [number, number][] | undefined, t: number, fallback: number) => {
  if (!keys || keys.length === 0) return fallback;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t < t1) {
      const k = (t - t0) / (t1 - t0);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return v0 + (v1 - v0) * e;
    }
  }
  return keys[keys.length - 1][1];
};

/** Point at distance `d` along a polyline, and the polyline's total length. */
const along = (pts: [number, number][], d: number): [number, number] => {
  let rest = d;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (rest <= seg) return [x0 + ((x1 - x0) * rest) / seg, y0 + ((y1 - y0) * rest) / seg];
    rest -= seg;
  }
  return pts[pts.length - 1];
};
const lengthOf = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/**
 * Brushed DC motor drive: a geared motor whose wheel turns at a speed track (with a load pad pressing the tyre), an
 * H-bridge whose closed switch pair and current path follow the drive mode (forward / reverse / coast / brake), the
 * IN1 / IN2 levels with a PWM trace, a truth table and big readouts for speed and duty.
 */
export const MotorDrive: React.FC<MotorDriveProps> = ({
  name,
  eyebrow,
  tagline,
  view = "motor",
  rpmTrack,
  dutyTrack,
  states = [],
  loads = [],
  loadLabel = "Bóp trục",
  bridgeAtSeconds,
  pinLabels = ["IN1", "IN2"],
  pinsAtSeconds,
  tableAtSeconds,
  modeLabels,
  tags = [],
  readouts = [],
  status = [],
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
  const labels = { ...DEFAULT_LABELS, ...modeLabels };
  const head = pop(0, 18);

  const rpm = track(rpmTrack, t, 0);
  const duty = track(dutyTrack, t, 0);
  const mode: MotorMode = states.length ? ([...states].reverse().find((s) => t >= s.atSeconds) ?? states[0]).mode : "forward";
  const modeStart = states.length ? ([...states].reverse().find((s) => t >= s.atSeconds)?.atSeconds ?? 0) : 0;
  const modeColor = mode === "forward" ? proColor : mode === "reverse" ? accentColor : mode === "brake" ? conColor : mutedColor;

  // Wheel angle: integral of the speed track up to this frame (degrees; 1 rpm = 6 deg/s).
  let angle = 0;
  for (let k = 0; k < frame; k++) angle += (track(rpmTrack, k / fps, 0) * 6) / fps;

  const loadOn = loads.some(([s, e]) => t >= s && t < e);
  const loadV = loads.reduce((m, [s, e]) => Math.max(m, life(s, e)), 0);

  const showMotor = view === "motor" || view === "both";
  const showBridge = view === "bridge" || view === "both";
  const bridgeV = view === "both" ? life(bridgeAtSeconds ?? 0, undefined) : 1;
  const viewH = (showMotor ? MOTOR_H : 0) + (showBridge ? BRIDGE_H : 0);
  const bridgeY = showMotor ? MOTOR_H : 0;

  // ------------------------------------------------------------------ motor view
  const WX = 790;
  const WY = 220;
  const WR = 150;
  const motorView = showMotor && (
    <g>
      {/* Encoder disc at the back, magnet poles turning with the shaft */}
      <g transform={`translate(100 ${WY})`}>
        <rect x={-14} y={-70} width={34} height={140} rx={8} fill="#2C2C2E" />
        {Array.from({ length: 6 }).map((_, i) => {
          const a0 = ((angle * 3 + i * 60) * Math.PI) / 180;
          const a1 = ((angle * 3 + i * 60 + 60) * Math.PI) / 180;
          // Disc seen edge-on: poles slide up and down the visible face.
          const y0 = Math.sin(a0) * 58;
          const y1 = Math.sin(a1) * 58;
          if (Math.cos((a0 + a1) / 2) < 0) return null;
          return <rect key={i} x={-6} y={Math.min(y0, y1)} width={18} height={Math.abs(y1 - y0)} fill={i % 2 ? "#D70015" : "#0066CC"} opacity={0.85} />;
        })}
        <text x={3} y={112} textAnchor="middle" fontSize={28} fontWeight={600} fill={mutedColor}>
          Encoder
        </text>
      </g>
      {/* Leads */}
      <path d={`M 150 ${WY + 60} C 150 ${WY + 150}, 250 ${WY + 150}, 300 ${WY + 190}`} fill="none" stroke="#D70015" strokeWidth={8} strokeLinecap="round" />
      <path d={`M 175 ${WY + 60} C 175 ${WY + 130}, 270 ${WY + 130}, 330 ${WY + 175}`} fill="none" stroke="#1D1D1F" strokeWidth={8} strokeLinecap="round" />
      {/* Can */}
      <defs>
        <linearGradient id="md-can" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E3E5E8" />
          <stop offset="0.45" stopColor="#B8BCC2" />
          <stop offset="1" stopColor="#8E9298" />
        </linearGradient>
        <linearGradient id="md-gear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2D47A" />
          <stop offset="1" stopColor="#C99A2E" />
        </linearGradient>
      </defs>
      <rect x={120} y={WY - 85} width={400} height={170} rx={30} fill="url(#md-can)" stroke="#7C8087" strokeWidth={3} />
      <rect x={150} y={WY - 85} width={18} height={170} fill="#9EA3AA" opacity={0.6} />
      <text x={330} y={WY + 12} textAnchor="middle" fontSize={38} fontWeight={700} fill="#3A3A3C">
        DC
      </text>
      {/* Gearbox and shaft */}
      <rect x={515} y={WY - 75} width={120} height={150} rx={12} fill="url(#md-gear)" stroke="#A67C1F" strokeWidth={3} />
      <text x={575} y={WY + 120} textAnchor="middle" fontSize={26} fontWeight={600} fill={mutedColor}>
        hộp số
      </text>
      <rect x={635} y={WY - 10} width={WX - 635} height={20} rx={6} fill="#8E9298" />
      {/* Wheel */}
      <g transform={`translate(${WX} ${WY})`}>
        <circle r={WR} fill="#2C2C2E" />
        <circle r={WR - 26} fill="#E5E5EA" stroke="#C7C7CC" strokeWidth={3} />
        <g transform={`rotate(${angle})`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <rect key={i} x={-9} y={-(WR - 30)} width={18} height={WR - 30} rx={9} fill="#AEAEB2" transform={`rotate(${i * 72})`} />
          ))}
          <circle cx={0} cy={-(WR - 13)} r={10} fill={accentColor} />
        </g>
        <circle r={30} fill="#8E9298" stroke="#6E7177" strokeWidth={3} />
      </g>
      {/* Direction arrow over the wheel */}
      {Math.abs(rpm) > 3 && (
        <g opacity={Math.min(1, Math.abs(rpm) / 40)}>
          <path d={`M ${WX - 120} ${WY - WR - 22} A ${WR + 22} ${WR + 22} 0 0 1 ${WX + 120} ${WY - WR - 22}`} fill="none" stroke={modeColor} strokeWidth={6} strokeLinecap="round" />
          {rpm > 0 ? (
            <path d={`M ${WX + 120} ${WY - WR - 22} l -30 -6 l 14 26 z`} fill={modeColor} />
          ) : (
            <path d={`M ${WX - 120} ${WY - WR - 22} l 30 -6 l -14 26 z`} fill={modeColor} />
          )}
        </g>
      )}
      {/* Load pad pressing the tyre */}
      {loadV > 0.01 && (
        <g opacity={loadV} transform={`translate(${WX + (WR + 18) * Math.cos(-0.7) + (loadOn ? 0 : 20)} ${WY + (WR + 18) * Math.sin(-0.7) - (loadOn ? 0 : 20)}) rotate(${(-0.7 * 180) / Math.PI + 90})`}>
          <rect x={-70} y={-34} width={140} height={46} rx={18} fill="rgba(215,0,21,0.16)" stroke={conColor} strokeWidth={4} />
          <rect x={-18} y={-110} width={36} height={80} rx={12} fill={conColor} opacity={0.85} />
        </g>
      )}
      {loadV > 0.01 && (
        <text x={WX - 40} y={WY + WR + 52} textAnchor="middle" fontSize={34} fontWeight={700} fill={conColor} stroke="#FFFFFF" strokeWidth={7} paintOrder="stroke" opacity={loadV}>
          {loadLabel}
        </text>
      )}
    </g>
  );

  // ------------------------------------------------------------------ bridge view
  const LX = 250;
  const RX = 750;
  const TOP = 70;
  const BOT = 540;
  const MID = 305;
  const closed: Record<string, boolean> = {
    q1: mode === "forward",
    q2: mode === "reverse",
    q3: mode === "reverse" || mode === "brake",
    q4: mode === "forward" || mode === "brake",
  };
  const pathFor = (m: MotorMode): [number, number][] | null => {
    if (m === "forward") return [[LX, TOP], [LX, MID], [RX, MID], [RX, BOT]];
    if (m === "reverse") return [[RX, TOP], [RX, MID], [LX, MID], [LX, BOT]];
    if (m === "brake") return [[RX, MID], [LX, MID], [LX, BOT], [RX, BOT], [RX, MID]];
    return null;
  };
  const sw = (id: string, x: number, y0: number, y1: number, label: string, side: -1 | 1) => {
    const on = closed[id];
    const c = on ? modeColor : mutedColor;
    const a = y0 + 52;
    const b = y1 - 52;
    // Open: the blade swings out from the lower terminal.
    const ang = on ? 0 : side * 28;
    const len = b - a;
    const ex = x + Math.sin((ang * Math.PI) / 180) * len;
    const ey = b - Math.cos((ang * Math.PI) / 180) * len;
    return (
      <g key={id}>
        <line x1={x} y1={y0} x2={x} y2={a} stroke={c} strokeWidth={6} />
        <line x1={x} y1={b} x2={x} y2={y1} stroke={c} strokeWidth={6} />
        <line x1={x} y1={b} x2={ex} y2={ey} stroke={c} strokeWidth={8} strokeLinecap="round" />
        <circle cx={x} cy={a} r={9} fill="#FFFFFF" stroke={c} strokeWidth={5} />
        <circle cx={x} cy={b} r={9} fill={c} />
        <text x={x + side * 60} y={(a + b) / 2 + 12} textAnchor="middle" fontSize={34} fontWeight={700} fill={c}>
          {label}
        </text>
      </g>
    );
  };
  const cur = pathFor(mode);
  const dots: React.ReactNode[] = [];
  if (cur) {
    const L = lengthOf(cur);
    const speed = 260; // diagram units per second
    const n = Math.floor(L / 70);
    const local = t - modeStart;
    for (let i = 0; i < n; i++) {
      const d = (local * speed + (i * L) / n) % L;
      const [x, y] = along(cur, d);
      dots.push(<circle key={i} cx={x} cy={y} r={9} fill={modeColor} />);
    }
  }
  const motorSpin = (angle * Math.PI) / 180;
  const bridgeView = showBridge && (
    <g transform={`translate(0 ${bridgeY})`} opacity={bridgeV}>
      {/* Rails */}
      <line x1={LX - 60} y1={TOP} x2={RX + 60} y2={TOP} stroke={textColor} strokeWidth={6} />
      <text x={LX - 76} y={TOP + 12} textAnchor="end" fontSize={34} fontWeight={700} fill={textColor}>
        VM
      </text>
      <line x1={LX - 60} y1={BOT} x2={RX + 60} y2={BOT} stroke={textColor} strokeWidth={6} />
      <text x={LX - 76} y={BOT + 12} textAnchor="end" fontSize={34} fontWeight={700} fill={textColor}>
        GND
      </text>
      {/* Legs */}
      {sw("q1", LX, TOP, MID, "Q1", -1)}
      {sw("q2", RX, TOP, MID, "Q2", 1)}
      {sw("q3", LX, MID, BOT, "Q3", -1)}
      {sw("q4", RX, MID, BOT, "Q4", 1)}
      {/* Motor across the middle */}
      <line x1={LX} y1={MID} x2={430} y2={MID} stroke={cur ? modeColor : mutedColor} strokeWidth={6} />
      <line x1={570} y1={MID} x2={RX} y2={MID} stroke={cur ? modeColor : mutedColor} strokeWidth={6} />
      <circle cx={LX} cy={MID} r={10} fill={textColor} />
      <circle cx={RX} cy={MID} r={10} fill={textColor} />
      <circle cx={500} cy={MID} r={70} fill="#FFFFFF" stroke={textColor} strokeWidth={6} />
      <text x={500} y={MID + 18} textAnchor="middle" fontSize={54} fontWeight={800} fill={textColor}>
        M
      </text>
      {Math.abs(rpm) > 3 && (
        <circle cx={500 + Math.cos(motorSpin) * 56} cy={MID + Math.sin(motorSpin) * 56} r={9} fill={modeColor} />
      )}
      {dots}
    </g>
  );

  // ------------------------------------------------------------------ tags and status
  const tagEls = tags.map((tg, i) => {
    const v = life(tg.atSeconds, tg.untilSeconds);
    if (v <= 0.01) return null;
    const fs = tg.fontSize ?? 32;
    const c = toneColor(tg.tone);
    const w = tg.text.length * fs * 0.56 + 40;
    return (
      <g key={`t${i}`} opacity={v} transform={`translate(${tg.x} ${tg.y}) scale(${0.9 + 0.1 * v})`}>
        <rect x={-w / 2} y={-fs * 0.95} width={w} height={fs * 1.6} rx={fs * 0.8} fill="#FFFFFF" stroke={c} strokeWidth={3} />
        <text x={0} y={fs * 0.2} textAnchor="middle" fontSize={fs} fontWeight={700} fill={c}>
          {tg.text}
        </text>
      </g>
    );
  });
  const st = status.filter((s) => t >= s.atSeconds && (s.untilSeconds === undefined || t < s.untilSeconds)).pop();
  const stPop = st ? pop(at(st.atSeconds, 0), 12) : 0;

  // ------------------------------------------------------------------ pins row
  const pinLevel = (i: 0 | 1): "PWM" | "0" | "1" => {
    if (mode === "brake") return "1";
    if (mode === "coast") return "0";
    if (mode === "forward") return i === 0 ? "PWM" : "0";
    return i === 0 ? "0" : "PWM";
  };
  const pwmTrace = (d: number, c: string) => {
    const w = 150;
    const h = 40;
    const per = w / 3;
    let p = `M 0 ${h}`;
    for (let k = 0; k < 3; k++) {
      const x0 = k * per;
      const x1 = x0 + per * Math.max(0.04, Math.min(0.96, d / 100));
      p += ` L ${x0} 0 L ${x1} 0 L ${x1} ${h} L ${x0 + per} ${h}`;
    }
    return (
      <svg width={w} height={h + 6} viewBox={`-2 -3 ${w + 4} ${h + 6}`} style={{ display: "block" }}>
        <path d={p} fill="none" stroke={c} strokeWidth={4} strokeLinejoin="round" />
      </svg>
    );
  };
  const pinsV = pinsAtSeconds === undefined ? 0 : pop(at(pinsAtSeconds, 0));
  const tableV = tableAtSeconds === undefined ? 0 : pop(at(tableAtSeconds, 0));
  const ROWS: [MotorMode, string, string][] = [
    ["forward", "PWM", "0"],
    ["reverse", "0", "PWM"],
    ["coast", "0", "0"],
    ["brake", "1", "1"],
  ];

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

      {/* Stage card */}
      <div
        style={{
          position: "relative",
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "26px 26px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {st && (
          <div
            style={{
              position: "absolute",
              top: -26,
              right: 30,
              background: toneColor(st.tone),
              color: "#FFFFFF",
              fontSize: 32,
              fontWeight: 700,
              padding: "10px 26px",
              borderRadius: 30,
              opacity: stPop,
              transform: `scale(${0.85 + 0.15 * stPop})`,
              boxShadow: "0 8px 20px rgba(16,24,40,0.15)",
              zIndex: 2,
            }}
          >
            {st.text}
          </div>
        )}
        <svg viewBox={`0 0 1000 ${viewH}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {motorView}
          {bridgeView}
          {tagEls}
        </svg>

        {/* IN1 / IN2 levels and the mode pill */}
        {pinsAtSeconds !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: pinsV, padding: "0 6px" }}>
            {[0, 1].map((i) => {
              const lv = pinLevel(i as 0 | 1);
              const c = lv === "PWM" ? modeColor : lv === "1" ? textColor : mutedColor;
              return (
                <div
                  key={i}
                  style={{
                    flex: "1 1 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    background: "#FFFFFF",
                    border: `2px solid ${lv === "PWM" ? modeColor : "rgba(0,0,0,0.08)"}`,
                    borderRadius: 22,
                    padding: "12px 18px",
                    height: 76,
                  }}
                >
                  <div style={{ fontSize: 32, fontWeight: 700, color: textColor }}>{pinLabels[i]}</div>
                  {lv === "PWM" ? (
                    pwmTrace(duty || 50, c)
                  ) : (
                    <div style={{ fontSize: 40, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>{lv}</div>
                  )}
                </div>
              );
            })}
            <div
              style={{
                flex: "0 0 auto",
                minWidth: 200,
                textAlign: "center",
                background: modeColor,
                color: "#FFFFFF",
                fontSize: 36,
                fontWeight: 700,
                padding: "16px 22px",
                borderRadius: 22,
              }}
            >
              {labels[mode]}
            </div>
          </div>
        )}

        {/* Truth table */}
        {tableAtSeconds !== undefined && (
          <div style={{ opacity: tableV, display: "flex", flexDirection: "column", gap: 6, padding: "0 6px" }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: mutedColor, padding: "0 18px" }}>
              <div style={{ flex: "1 1 0" }}>{pinLabels[0]}</div>
              <div style={{ flex: "1 1 0" }}>{pinLabels[1]}</div>
              <div style={{ flex: "1.4 1 0" }}>Kết quả</div>
            </div>
            {ROWS.map(([m, a, b]) => {
              const on = m === mode;
              const c = m === "forward" ? proColor : m === "reverse" ? accentColor : m === "brake" ? conColor : mutedColor;
              return (
                <div
                  key={m}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontSize: 36,
                    fontWeight: on ? 700 : 500,
                    color: on ? textColor : bodyColor,
                    background: on ? "#FFFFFF" : "transparent",
                    border: `2px solid ${on ? c : "transparent"}`,
                    borderRadius: 18,
                    padding: "8px 16px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <div style={{ flex: "1 1 0" }}>{a}</div>
                  <div style={{ flex: "1 1 0" }}>{b}</div>
                  <div style={{ flex: "1.4 1 0", color: on ? c : bodyColor }}>{labels[m]}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Readouts */}
        {readouts.length > 0 && (
          <div style={{ display: "flex", gap: 18 }}>
            {readouts.map((ro, i) => {
              const o = ro.atSeconds === undefined ? 1 : pop(at(ro.atSeconds, 0));
              const value = ro.source === "rpm" ? String(Math.round(Math.abs(rpm))) : ro.source === "duty" ? String(Math.round(duty)) : ro.text ?? "";
              return (
                <div
                  key={`r${i}`}
                  style={{
                    flex: "1 1 0",
                    background: "#FFFFFF",
                    border: `2px solid ${ro.highlight ? accentColor : "rgba(0,0,0,0.08)"}`,
                    borderRadius: 24,
                    padding: "14px 20px",
                    opacity: o,
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor }}>{ro.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div
                      style={{
                        fontSize: 84,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                        color: ro.highlight ? accentColor : textColor,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.05,
                      }}
                    >
                      {value}
                    </div>
                    {ro.unit && <div style={{ fontSize: 34, fontWeight: 600, color: bodyColor }}>{ro.unit}</div>}
                  </div>
                  {ro.sub && <div style={{ fontSize: 28, color: mutedColor }}>{ro.sub}</div>}
                </div>
              );
            })}
          </div>
        )}

        {caption && (
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, padding: "0 8px", opacity: pop(at(captionAtSeconds, 0)) }}>
            {caption}
          </div>
        )}
      </div>

      {/* Takeaways */}
      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
