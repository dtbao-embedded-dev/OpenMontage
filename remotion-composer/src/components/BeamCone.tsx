import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted";

export interface ConeBeam {
  /** Name shown in the legend row, e.g. "HC-SR04". */
  label: string;
  /** Full cone angle in degrees (field of view). */
  angleDeg: number;
  /** [[seconds, degrees]]: the angle eases between keys (e.g. a VL53L1X ROI narrowing 27 -> 15). */
  angleTrack?: [number, number][];
  /** [[seconds, degrees]]: tilt of the beam axis, + = up (e.g. an ROI moved off-centre). */
  steerTrack?: [number, number][];
  /** "sound" draws expanding arcs during `pulses`; "light" draws short fast dashes. */
  kind?: "sound" | "light";
  /** Ink of the wedge, edges and labels. */
  color?: string;
  /** [[start, end]] windows (seconds) when pulses travel out to the wall and back. */
  pulses?: [number, number][];
  atSeconds?: number;
  untilSeconds?: number;
  /** Hide the width bracket and the legend row (e.g. while two beams overlap). */
  hideWidth?: boolean;
}

export interface ConeObject {
  /** Rectangle in diagram units: x 0..1000 (sensor face at 110, wall at 900), y 0..viewHeight. */
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** Where the label sits relative to the rectangle. */
  labelSide?: "above" | "below";
  tone?: Tone;
  atSeconds?: number;
  untilSeconds?: number;
}

export interface ConeMyth {
  /** Text on the crossed-out "laser dot" line, e.g. "Một chấm sáng?". */
  text: string;
  atSeconds?: number;
  /** When the red cross lands on the dot line. */
  crossAtSeconds: number;
  /** When the crossed-out line fades (default 0.8 s after the cross); set it to the first beam's start so the
   *  diagram is never empty in between. */
  fadeAtSeconds?: number;
}

export interface ConeSensor {
  atSeconds: number;
  kind: "ultrasonic" | "laser";
  label: string;
}

interface BeamConeProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  beams: ConeBeam[];
  /** Sensor drawn at the apex; the entry whose `atSeconds` was passed last is shown. */
  sensors?: ConeSensor[];
  objects?: ConeObject[];
  myth?: ConeMyth;
  /** Distance from the sensor face to the wall, in metres (sets the width labels). Default 1. */
  rangeMeters?: number;
  /** Diagram height in units (width is always 1000). Default 640. */
  viewHeight?: number;
  /** Caption under the diagram (source or condition). */
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
const APEX_X = 110;
const WALL_X = 900;
const D = WALL_X - APEX_X;

/** Piecewise ease between [[t, v]] keys (seconds); before the first key the first value holds. */
const track = (keys: [number, number][] | undefined, t: number, fallback: number) => {
  if (!keys || keys.length === 0) return fallback;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t < t1) {
      const k = Math.min(1, (t - t0) / Math.min(0.6, t1 - t0));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return v0 + (v1 - v0) * e;
    }
  }
  return keys[keys.length - 1][1];
};

/**
 * Side view of a distance sensor's field of view drawn to scale: the cone from the sensor face to a wall, its width
 * at the wall in cm, pulses travelling out and back, objects the cone catches, an optional crossed-out "laser dot"
 * myth, and an angle track for a narrowing or steered zone (VL53L1X ROI).
 */
export const BeamCone: React.FC<BeamConeProps> = ({
  name,
  eyebrow,
  tagline,
  beams,
  sensors = [],
  objects = [],
  myth,
  rangeMeters = 1,
  viewHeight = 640,
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

  const cy = viewHeight / 2;
  const head = pop(0, 18);

  // Sensor shown at the apex: the last entry already reached (the first one before any is reached).
  const sensor = sensors.length ? [...sensors].reverse().find((s) => t >= s.atSeconds) ?? sensors[0] : undefined;

  const beamGeom = (b: ConeBeam) => {
    const angle = track(b.angleTrack, t, b.angleDeg);
    const steer = track(b.steerTrack, t, 0);
    const half = (angle / 2) * (Math.PI / 180);
    const axis = (steer * Math.PI) / 180;
    const up = cy - D * Math.tan(axis + half);
    const down = cy - D * Math.tan(axis - half);
    const widthCm = Math.round(rangeMeters * 100 * (Math.tan(axis + half) - Math.tan(axis - half)));
    return { angle, axis, half, up, down, widthCm };
  };

  const visible = beams.map((b) => life(b.atSeconds, b.untilSeconds));

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
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {/* Diagram card */}
      <div
        style={{
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "26px 26px 22px",
        }}
      >
        <svg viewBox={`0 0 1000 ${viewHeight}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {/* Wall */}
          <rect x={WALL_X} y={16} width={14} height={viewHeight - 92} rx={4} fill="#D2D2D7" />
          {/* Distance ruler */}
          <g>
            <line x1={APEX_X} y1={viewHeight - 40} x2={WALL_X} y2={viewHeight - 40} stroke={mutedColor} strokeWidth={2} />
            <line x1={APEX_X} y1={viewHeight - 52} x2={APEX_X} y2={viewHeight - 28} stroke={mutedColor} strokeWidth={2} />
            <line x1={WALL_X} y1={viewHeight - 52} x2={WALL_X} y2={viewHeight - 28} stroke={mutedColor} strokeWidth={2} />
            <text x={(APEX_X + WALL_X) / 2} y={viewHeight - 52} textAnchor="middle" fontSize={30} fontWeight={600} fill={mutedColor}>
              {`${String(rangeMeters).replace(".", ",")} m`}
            </text>
          </g>

          {/* Objects the cone may catch */}
          {objects.map((o, i) => {
            const v = life(o.atSeconds, o.untilSeconds);
            const c = toneColor(o.tone);
            return (
              <g key={`o${i}`} opacity={v}>
                <rect x={o.x} y={o.y} width={o.w} height={o.h} rx={6} fill={o.tone === "bad" ? "rgba(215,0,21,0.12)" : "rgba(0,0,0,0.08)"} stroke={c} strokeWidth={3} />
                {o.label && (
                  <text
                    x={o.x + o.w / 2}
                    y={o.labelSide === "below" ? o.y + o.h + 34 : o.y - 12}
                    textAnchor="middle"
                    fontSize={28}
                    fontWeight={600}
                    fill={c}
                    stroke="#FFFFFF"
                    strokeWidth={6}
                    paintOrder="stroke"
                  >
                    {o.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Beams: wedge, edges, pulses */}
          {beams.map((b, i) => {
            const v = visible[i];
            if (v <= 0.001) return null;
            const g = beamGeom(b);
            const color = b.color ?? accentColor;
            // The wedge grows out from the sensor as it appears.
            const reach = APEX_X + D * Math.min(1, v * 1.05);
            const k = (reach - APEX_X) / D;
            const upY = cy + (g.up - cy) * k;
            const downY = cy + (g.down - cy) * k;
            const active = (b.pulses ?? []).some(([s, e]) => t >= s && t <= e);
            const pulseEls: React.ReactNode[] = [];
            if (active) {
              if (b.kind === "light") {
                // Light: short dashes running out and back fast along the axis.
                for (let j = 0; j < 3; j++) {
                  const ph = ((t * 1.6 + j / 3) % 1) * 2;
                  const out = ph <= 1;
                  const f = out ? ph : 2 - ph;
                  const x = APEX_X + D * f;
                  const y = cy - (x - APEX_X) * Math.tan(g.axis);
                  pulseEls.push(
                    <line key={`d${j}`} x1={x - (out ? 34 : -34)} y1={y} x2={x} y2={y} stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.9} />,
                  );
                }
              } else {
                // Sound: arcs expand to the wall, then echo arcs come back from it.
                for (let j = 0; j < 3; j++) {
                  const ph = ((t * 0.55 + j / 3) % 1) * 2;
                  if (ph <= 1) {
                    const r = D * ph;
                    const a0 = g.axis - g.half;
                    const a1 = g.axis + g.half;
                    const x0 = APEX_X + r * Math.cos(a0);
                    const y0 = cy - r * Math.sin(a0);
                    const x1 = APEX_X + r * Math.cos(a1);
                    const y1 = cy - r * Math.sin(a1);
                    pulseEls.push(
                      <path key={`a${j}`} d={`M ${x0} ${y0} A ${r} ${r} 0 0 0 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={5} opacity={0.75 * (1 - ph * 0.3)} />,
                    );
                  } else {
                    const r = D * (ph - 1);
                    const x = WALL_X - r;
                    pulseEls.push(
                      <path
                        key={`e${j}`}
                        d={`M ${x + r * 0.12} ${cy - Math.max(40, r * 0.22)} Q ${x - 6} ${cy} ${x + r * 0.12} ${cy + Math.max(40, r * 0.22)}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={4}
                        strokeDasharray="10 8"
                        opacity={0.6}
                      />,
                    );
                  }
                }
              }
            }
            return (
              <g key={`b${i}`} opacity={Math.min(1, v * 1.4)}>
                <path d={`M ${APEX_X} ${cy} L ${reach} ${upY} L ${reach} ${downY} Z`} fill={color} fillOpacity={0.12} />
                <line x1={APEX_X} y1={cy} x2={reach} y2={upY} stroke={color} strokeWidth={4} />
                <line x1={APEX_X} y1={cy} x2={reach} y2={downY} stroke={color} strokeWidth={4} />
                {pulseEls}
              </g>
            );
          })}

          {/* Angle arcs near the apex, and width brackets at the wall */}
          {beams.map((b, i) => {
            const v = visible[i];
            if (v <= 0.001) return null;
            const g = beamGeom(b);
            const color = b.color ?? accentColor;
            // Nested beams get their angle arcs at different radii, narrowest innermost.
            const order = beams
              .map((x, j) => ({ j, a: beamGeom(x).angle, v: visible[j] }))
              .filter((x) => x.v > 0.001)
              .sort((p, q) => p.a - q.a)
              .findIndex((x) => x.j === i);
            const bx = WALL_X + 34;
            const r = 150 + order * 64;
            const ax = APEX_X + r * Math.cos(g.axis + g.half);
            const ay = cy - r * Math.sin(g.axis + g.half);
            const tx = APEX_X + (r + 8) * Math.cos(g.axis + g.half) + 6;
            const ty = cy - (r + 8) * Math.sin(g.axis + g.half) - 10;
            const bv = interpolate(v, [0.85, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <g key={`l${i}`} opacity={bv}>
                <path
                  d={`M ${APEX_X + r * Math.cos(g.axis - g.half)} ${cy - r * Math.sin(g.axis - g.half)} A ${r} ${r} 0 0 0 ${ax} ${ay}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                />
                <text x={tx} y={ty} fontSize={34} fontWeight={700} fill={color} stroke="#FFFFFF" strokeWidth={6} paintOrder="stroke">
                  {`${Math.round(g.angle)}°`}
                </text>
                {!b.hideWidth && (
                  <g>
                    <line x1={bx - 16} y1={g.up} x2={bx + 6} y2={g.up} stroke={color} strokeWidth={3} />
                    <line x1={bx - 16} y1={g.down} x2={bx + 6} y2={g.down} stroke={color} strokeWidth={3} />
                    <line x1={bx} y1={g.up} x2={bx} y2={g.down} stroke={color} strokeWidth={3} />
                  </g>
                )}
              </g>
            );
          })}

          {/* Myth: a thin laser line to a single dot, crossed out */}
          {myth &&
            (() => {
              const show = life(myth.atSeconds, undefined);
              const crossStart = at(myth.crossAtSeconds, 0);
              const cross = frame >= crossStart ? spring({ frame: frame - crossStart, fps, config: { damping: 14, stiffness: 140 } }) : 0;
              const fadeStart = myth.fadeAtSeconds !== undefined ? at(myth.fadeAtSeconds, 0) : crossStart + 24;
              const fade = 1 - interpolate(frame, [fadeStart, fadeStart + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const mx = (APEX_X + WALL_X) / 2;
              return (
                <g opacity={show * fade}>
                  <line x1={APEX_X} y1={cy} x2={WALL_X} y2={cy} stroke={conColor} strokeWidth={3} />
                  <circle cx={WALL_X} cy={cy} r={10} fill={conColor} />
                  <text x={mx} y={cy - 22} textAnchor="middle" fontSize={34} fontWeight={700} fill={conColor} stroke="#FFFFFF" strokeWidth={7} paintOrder="stroke">
                    {myth.text}
                  </text>
                  <g opacity={cross} transform={`translate(${mx} ${cy + 46}) scale(${0.6 + 0.4 * cross})`}>
                    <line x1={-34} y1={-34} x2={34} y2={34} stroke={conColor} strokeWidth={10} strokeLinecap="round" />
                    <line x1={34} y1={-34} x2={-34} y2={34} stroke={conColor} strokeWidth={10} strokeLinecap="round" />
                  </g>
                </g>
              );
            })()}

          {/* Sensor at the apex */}
          {sensor && (
            <g>
              {sensor.kind === "ultrasonic" ? (
                <g>
                  <rect x={APEX_X - 70} y={cy - 92} width={64} height={184} rx={10} fill="#C8102E" />
                  <circle cx={APEX_X - 12} cy={cy - 46} r={30} fill="#B9BCC2" stroke="#8E9198" strokeWidth={4} />
                  <circle cx={APEX_X - 12} cy={cy + 46} r={30} fill="#B9BCC2" stroke="#8E9198" strokeWidth={4} />
                </g>
              ) : (
                <g>
                  <rect x={APEX_X - 70} y={cy - 70} width={64} height={140} rx={10} fill="#1D1D1F" />
                  <rect x={APEX_X - 18} y={cy - 20} width={18} height={40} rx={4} fill="#3A3A3C" stroke="#8E9198" strokeWidth={2} />
                  <circle cx={APEX_X - 4} cy={cy} r={5} fill={conColor} />
                </g>
              )}
              <text
                x={APEX_X - 38}
                y={cy + (sensor.kind === "ultrasonic" ? 132 : 110)}
                textAnchor="middle"
                fontSize={28}
                fontWeight={700}
                fill={textColor}
                stroke="#FFFFFF"
                strokeWidth={6}
                paintOrder="stroke"
              >
                {sensor.label}
              </text>
            </g>
          )}
        </svg>
        {/* Legend: one row per visible beam with its live angle and width at the wall */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 14px 0" }}>
          {beams.map((b, i) => {
            const v = visible[i];
            if (v <= 0.001 || b.hideWidth) return null;
            const g = beamGeom(b);
            return (
              <div key={`g${i}`} style={{ display: "flex", alignItems: "center", gap: 16, opacity: Math.min(1, v), height: 44 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: b.color ?? accentColor, flex: "0 0 auto" }} />
                <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.01em", color: textColor, whiteSpace: "nowrap" }}>{b.label}</div>
                <div style={{ fontSize: 36, fontWeight: 600, color: b.color ?? accentColor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {`${Math.round(g.angle)}° · rộng ${g.widthCm} cm`}
                </div>
              </div>
            );
          })}
        </div>
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
