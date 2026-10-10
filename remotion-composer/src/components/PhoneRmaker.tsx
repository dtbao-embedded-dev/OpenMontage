import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

/** A timed on/off state; the latest entry whose `atSeconds` has passed wins. */
export interface RmakerPowerStep {
  atSeconds: number;
  on: boolean;
}

/** A device tile on the home screen. */
export interface RmakerDevice {
  name: string;
  /** Icon drawn on the tile. */
  icon?: "switch" | "light" | "fan" | "sensor";
  /** Small line under the name, e.g. "ESP32-S3" or a sensor reading. */
  sub?: string;
  power?: RmakerPowerStep[];
  /** Times the power button on the tile is tapped (ripple). */
  taps?: number[];
  /** When the tile pops in (default: drawn from the screen's first frame). */
  atSeconds?: number;
  /** Offline tiles are greyed out with an "Offline" label. */
  offline?: boolean;
}

/** One row of a schedule list. */
export interface RmakerSchedule {
  name: string;
  time: string;
  days: string;
  action: string;
  atSeconds?: number;
}

/** One screen of the app; the latest screen whose `atSeconds` has passed is shown. */
export interface RmakerScreen {
  atSeconds: number;
  kind: "home" | "device" | "schedules";
  /** App bar title. */
  title: string;
  /** home: device tiles. */
  devices?: RmakerDevice[];
  /** device: the one device and its params. */
  device?: RmakerDevice;
  params?: { label: string; value: string }[];
  /** schedules: rows. */
  schedules?: RmakerSchedule[];
}

/** A connection-path chip over the phone ("Cloud" / "Local"). */
export interface RmakerRoute {
  atSeconds: number;
  text: string;
  tone?: "cloud" | "local";
}

export interface RmakerLogLine {
  atSeconds: number;
  text: string;
  tone?: "info" | "ok" | "bad";
}

interface PhoneRmakerProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  screens: RmakerScreen[];
  /** Small caption under the phone (e.g. "Minh hoạ app ESP RainMaker"). */
  phoneCaption?: string;
  routes?: RmakerRoute[];
  /** Board column beside the phone: a lamp that follows `boardPower`. */
  boardTitle?: string;
  boardLabel?: string;
  boardPower?: RmakerPowerStep[];
  /** Times the board's BOOT button is pressed (ripple on the button). */
  boardPresses?: number[];
  log?: RmakerLogLine[];
  logTitle?: string;
  logLines?: number;
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
const PHONE_W = 560;
const PHONE_W_ALONE = 640;
const SIDE_W = 240;
const PHONE_H = 860;
const LAMP_ON = "#FFB020";

const stateAt = (steps: RmakerPowerStep[] | undefined, t: number): RmakerPowerStep | undefined => {
  let v: RmakerPowerStep | undefined;
  for (const s of steps ?? []) if (s.atSeconds <= t + 1e-6) v = s;
  return v;
};

const Icon: React.FC<{ kind: RmakerDevice["icon"]; color: string }> = ({ kind = "switch", color }) => {
  if (kind === "light") {
    return (
      <svg width={56} height={56} viewBox="0 0 56 56">
        <path d="M28 8 a14 14 0 0 1 8 25.5 V39 H20 V33.5 A14 14 0 0 1 28 8 Z" fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" />
        <path d="M21 45 H35 M23 51 H33" stroke={color} strokeWidth={4} strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "fan") {
    return (
      <svg width={56} height={56} viewBox="0 0 56 56">
        <circle cx={28} cy={28} r={5} fill={color} />
        {[0, 120, 240].map((a) => (
          <path key={a} d="M28 23 C24 10 34 6 38 14 C40 19 34 22 28 23 Z" fill={color} transform={`rotate(${a} 28 28)`} />
        ))}
      </svg>
    );
  }
  if (kind === "sensor") {
    return (
      <svg width={56} height={56} viewBox="0 0 56 56">
        <path d="M24 10 a5 5 0 0 1 10 0 V32 a10 10 0 1 1 -10 0 Z" fill="none" stroke={color} strokeWidth={4} />
        <circle cx={29} cy={40} r={5} fill={color} />
      </svg>
    );
  }
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <rect x={14} y={6} width={28} height={44} rx={8} fill="none" stroke={color} strokeWidth={4} />
      <rect x={20} y={12} width={16} height={16} rx={4} fill={color} />
    </svg>
  );
};

const PowerGlyph: React.FC<{ color: string; size?: number }> = ({ color, size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 34 34">
    <path d="M10.5 9.5 A10.5 10.5 0 1 0 23.5 9.5" fill="none" stroke={color} strokeWidth={3.6} strokeLinecap="round" />
    <path d="M17 4 V16" stroke={color} strokeWidth={3.6} strokeLinecap="round" />
  </svg>
);

export const PhoneRmaker: React.FC<PhoneRmakerProps> = ({
  name,
  eyebrow,
  tagline,
  screens,
  phoneCaption,
  routes = [],
  boardTitle = "ESP32-S3",
  boardLabel = "LED",
  boardPower,
  boardPresses = [],
  log = [],
  logTitle = "idf.py monitor",
  logLines = 3,
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
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  // Anything due at frame 0 is drawn fully from the first frame, so a cut into this scene never shows a blank card.
  const pop = (start: number, damping = 16) => (start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } }));
  const pulse = (start: number, len = 0.9) =>
    interpolate(t - start, [0, 0.12, len], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tapOf = (taps: number[] | undefined) => (taps ?? []).reduce((m, s) => Math.max(m, pulse(s, 0.8)), 0);

  const head = pop(0, 18);
  const phone = pop(0, 20);
  const hasBoard = boardPower !== undefined;
  const phoneW = hasBoard ? PHONE_W : PHONE_W_ALONE;
  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };

  let idx = 0;
  screens.forEach((s, k) => {
    if (s.atSeconds <= t + 1e-6) idx = k;
  });
  const scr = screens[idx];
  const enter = idx === 0 ? 1 : pop(at(scr.atSeconds, 0), 20);

  const powerButton = (d: RmakerDevice, size: number) => {
    const on = stateAt(d.power, t)?.on ?? false;
    const tap = tapOf(d.taps);
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          flex: "0 0 auto",
          background: on ? accentColor : "#E5E5EA",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 0 ${14 * tap}px rgba(0,102,204,${0.25 * tap})`,
        }}
      >
        <PowerGlyph color={on ? "#FFFFFF" : mutedColor} size={size * 0.5} />
      </div>
    );
  };

  const tile = (d: RmakerDevice, i: number, s: RmakerScreen) => {
    const p = d.atSeconds !== undefined && d.atSeconds > 0 ? pop(at(d.atSeconds, 0)) : idx === screens.indexOf(s) && s.atSeconds > 0 ? pop(at(s.atSeconds + 0.1 + i * 0.1, 0)) : 1;
    const on = stateAt(d.power, t)?.on ?? false;
    return (
      <div
        key={d.name + i}
        style={{
          borderRadius: 26,
          padding: "22px 20px",
          background: on && !d.offline ? "rgba(0,102,204,0.08)" : "#F5F5F7",
          border: `2px solid ${on && !d.offline ? "rgba(0,102,204,0.35)" : borderColor}`,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          opacity: p * (d.offline ? 0.55 : 1),
          transform: `scale(${interpolate(p, [0, 1], [0.92, 1])})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Icon kind={d.icon} color={on && !d.offline ? accentColor : mutedColor} />
          {d.power && !d.offline && powerButton(d, 72)}
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 700, color: textColor, letterSpacing: "-0.01em" }}>{d.name}</div>
          <div style={{ fontSize: 24, color: d.offline ? conColor : mutedColor, marginTop: 4 }}>{d.offline ? "Offline" : d.sub ?? (on ? "Bật" : "Tắt")}</div>
        </div>
      </div>
    );
  };

  const renderScreen = (s: RmakerScreen) => {
    if (s.kind === "home") {
      return (
        <div style={{ padding: "22px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 24, color: mutedColor, letterSpacing: "0.01em" }}>Thiết bị</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>{(s.devices ?? []).map((d, i) => tile(d, i, s))}</div>
        </div>
      );
    }
    if (s.kind === "device" && s.device) {
      const d = s.device;
      const on = stateAt(d.power, t)?.on ?? false;
      return (
        <div style={{ padding: "34px 30px", display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
          <Icon kind={d.icon} color={on ? accentColor : mutedColor} />
          {powerButton(d, 190)}
          <div style={{ fontSize: 34, fontWeight: 700, color: on ? accentColor : mutedColor }}>{on ? "Đang bật" : "Đang tắt"}</div>
          <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
            {(s.params ?? []).map((pr, i) => (
              <div
                key={pr.label + i}
                style={{ display: "flex", justifyContent: "space-between", padding: "18px 6px", borderTop: `2px solid ${borderColor}`, fontSize: 28 }}
              >
                <span style={{ color: mutedColor }}>{pr.label}</span>
                <span style={{ color: textColor, fontWeight: 600, fontFamily: MONO }}>{pr.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    // schedules
    return (
      <div style={{ padding: "26px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        {(s.schedules ?? []).map((sc, i) => {
          const p = sc.atSeconds !== undefined && sc.atSeconds > 0 ? pop(at(sc.atSeconds, 0)) : 1;
          return (
            <div
              key={sc.name + i}
              style={{
                borderRadius: 26,
                padding: "22px 24px",
                background: "#F5F5F7",
                border: `2px solid ${borderColor}`,
                opacity: p,
                transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ fontSize: 64, fontWeight: 700, color: textColor, letterSpacing: "-0.02em" }}>{sc.time}</div>
                <div style={{ width: 76, height: 44, borderRadius: 22, background: proColor, position: "relative" }}>
                  <div style={{ position: "absolute", right: 4, top: 4, width: 36, height: 36, borderRadius: 18, background: "#FFF" }} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: textColor, marginTop: 8 }}>{sc.name}</div>
              <div style={{ fontSize: 24, color: mutedColor, marginTop: 4 }}>
                {sc.days} · {sc.action}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  let route: RmakerRoute | undefined;
  for (const r of routes) if (r.atSeconds <= t + 1e-6) route = r;
  const routeIn = route ? (route.atSeconds > 0 ? pop(at(route.atSeconds, 0)) : 1) : 0;

  const boardOn = stateAt(boardPower, t)?.on ?? false;
  const press = tapOf(boardPresses);
  const visibleLog = log.filter((l) => l.atSeconds <= t + 1e-6).slice(-logLines);

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

      <div style={{ display: "flex", gap: 30, alignItems: "flex-start", justifyContent: hasBoard ? "flex-start" : "center" }}>
        <div style={{ width: phoneW, flex: "0 0 auto", opacity: phone, transform: `translateY(${interpolate(phone, [0, 1], [40, 0])}px)` }}>
          <div
            style={{
              position: "relative",
              width: phoneW,
              height: PHONE_H,
              borderRadius: 64,
              background: "#1D1D1F",
              padding: 14,
              boxShadow: "0 24px 60px rgba(16,24,40,0.22)",
            }}
          >
            <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, background: "#FFFFFF", overflow: "hidden" }}>
              <div
                style={{
                  padding: "52px 28px 18px",
                  borderBottom: `2px solid ${borderColor}`,
                  background: "#F5F5F7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 34, fontWeight: 700, color: textColor, letterSpacing: "-0.01em" }}>{scr.title}</div>
                {route && (
                  <div
                    style={{
                      opacity: routeIn,
                      transform: `scale(${interpolate(routeIn, [0, 1], [0.7, 1])})`,
                      padding: "8px 18px",
                      borderRadius: 22,
                      fontSize: 24,
                      fontWeight: 600,
                      color: "#FFFFFF",
                      background: route.tone === "local" ? proColor : accentColor,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {route.text}
                  </div>
                )}
              </div>
              <div style={{ opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [60, 0])}px)` }}>{renderScreen(scr)}</div>
            </div>
          </div>
          {phoneCaption && (
            <div style={{ fontSize: 26, color: mutedColor, textAlign: "center", marginTop: 14, letterSpacing: "0.005em" }}>{phoneCaption}</div>
          )}
        </div>

        {hasBoard && (
          <div style={{ width: SIDE_W, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 18, opacity: phone }}>
            <div style={{ fontSize: 30, fontWeight: 600, color: accentColor, letterSpacing: "0.01em" }}>{boardTitle}</div>
            <div style={{ ...card, borderRadius: 28, padding: "26px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  background: boardOn ? LAMP_ON : "#D2D2D7",
                  boxShadow: boardOn ? `0 0 46px 18px rgba(255,176,32,0.55)` : "none",
                  border: `4px solid ${boardOn ? "#E89B00" : "#B8B8BE"}`,
                }}
              />
              <div style={{ fontSize: 28, color: mutedColor }}>{boardLabel}</div>
              <div style={{ fontSize: 40, fontWeight: 700, color: boardOn ? textColor : mutedColor, letterSpacing: "-0.02em" }}>{boardOn ? "BẬT" : "TẮT"}</div>
            </div>
            <div style={{ ...card, borderRadius: 28, padding: "20px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  background: "#2C2C2E",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    background: press > 0.05 ? "#636366" : "#48484A",
                    transform: `scale(${1 - 0.12 * press})`,
                    boxShadow: `0 0 0 ${12 * press}px rgba(0,102,204,${0.35 * press})`,
                  }}
                />
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: textColor }}>BOOT</div>
            </div>
          </div>
        )}
      </div>

      {log.length > 0 && (
        <div style={{ ...card, borderRadius: 28, padding: "16px 24px", opacity: phone, minHeight: 40 + logLines * 36 }}>
          <div style={{ fontSize: 24, fontFamily: MONO, color: mutedColor, marginBottom: 6 }}>{logTitle}</div>
          {visibleLog.map((l, i) => {
            const p = pop(at(l.atSeconds, 0), 18);
            const c = l.tone === "ok" ? proColor : l.tone === "bad" ? conColor : bodyColor;
            return (
              <div key={l.text + l.atSeconds + i} style={{ fontSize: 22, fontFamily: MONO, color: c, lineHeight: 1.5, opacity: p, whiteSpace: "pre" }}>
                {l.text}
              </div>
            );
          })}
        </div>
      )}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 18, opacity: p }}>
                <div
                  style={{
                    flex: "0 0 auto", width: 46, height: 46, borderRadius: 23, background: color, color: "#FFFFFF",
                    fontSize: 26, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2,
                  }}
                >
                  {mark}
                </div>
                <div style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.35, color: pt.kind === "info" ? textColor : bodyColor }}>{pt.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
