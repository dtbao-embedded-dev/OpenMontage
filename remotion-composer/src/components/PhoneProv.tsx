import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export interface ProvNetwork {
  ssid: string;
  /** Signal strength 1..4 bars. */
  bars: number;
  lock?: boolean;
}

export interface ProvStep {
  label: string;
  atSeconds: number;
  /** Result shown at `doneAtSeconds`: tick, cross, or still spinning when absent. */
  state?: "ok" | "bad";
  doneAtSeconds?: number;
}

/** One screen of a Wi-Fi provisioning app; the latest screen whose `atSeconds` has passed is shown. */
export interface ProvScreen {
  atSeconds: number;
  kind: "qr" | "networks" | "password" | "progress" | "result";
  /** App bar title. */
  title: string;
  /** qr: when the code is recognised, and the device name shown then. */
  qrFoundAtSeconds?: number;
  qrLabel?: string;
  /** networks: scan list, the row tapped and when. */
  networks?: ProvNetwork[];
  pickIndex?: number;
  pickAtSeconds?: number;
  /** password: network name, number of masked characters typed over `typeSeconds`, button tap. */
  ssid?: string;
  passwordLength?: number;
  typeSeconds?: number;
  submitAtSeconds?: number;
  buttonLabel?: string;
  /** progress: steps with spinner -> tick / cross. */
  steps?: ProvStep[];
  /** result: big tick or cross with a message. */
  resultTone?: "ok" | "bad";
  resultText?: string;
  resultSub?: string;
}

export interface ProvSideItem {
  label: string;
  values: { atSeconds: number; text: string }[];
  atSeconds?: number;
}

export interface ProvLogLine {
  atSeconds: number;
  text: string;
  tone?: "info" | "ok" | "bad";
}

interface PhoneProvProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  screens: ProvScreen[];
  /** Small caption under the phone (e.g. "Minh hoạ app ESP BLE Provisioning"). */
  phoneCaption?: string;
  sideTitle?: string;
  side?: ProvSideItem[];
  log?: ProvLogLine[];
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
const PHONE_W = 540;
/** Phone width when there is no ESP32 side column. */
const PHONE_W_ALONE = 640;
const SIDE_W = 260;
const PHONE_H = 860;

/** Deterministic 21x21 QR-like module pattern with the three finder squares. */
const QR_N = 21;
const QR_CELLS: boolean[] = (() => {
  const out: boolean[] = [];
  let s = 0x5eed;
  for (let i = 0; i < QR_N * QR_N; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out.push(((s >> 16) & 1) === 1);
  }
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r < 8; r++)
      for (let c = -1; c < 8; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= QR_N || cc >= QR_N) continue;
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        out[rr * QR_N + cc] = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (edge || core);
      }
  };
  finder(0, 0);
  finder(0, QR_N - 7);
  finder(QR_N - 7, 0);
  return out;
})();

const Bars: React.FC<{ n: number; color: string; dim: string }> = ({ n, color, dim }) => (
  <svg width={40} height={30} viewBox="0 0 40 30">
    {[0, 1, 2, 3].map((k) => (
      <rect key={k} x={k * 10 + 1} y={22 - k * 7} width={7} height={8 + k * 7} rx={2} fill={k < n ? color : dim} />
    ))}
  </svg>
);

const Lock: React.FC<{ color: string }> = ({ color }) => (
  <svg width={26} height={30} viewBox="0 0 26 30">
    <rect x={3} y={13} width={20} height={15} rx={3} fill={color} />
    <path d="M7 13 V9 a6 6 0 0 1 12 0 V13" fill="none" stroke={color} strokeWidth={3} />
  </svg>
);

export const PhoneProv: React.FC<PhoneProvProps> = ({
  name,
  eyebrow,
  tagline,
  screens,
  phoneCaption,
  sideTitle = "ESP32-S3",
  side = [],
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

  const head = pop(0, 18);
  const phone = pop(0, 20);
  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };
  const phoneW = side.length > 0 ? PHONE_W : PHONE_W_ALONE;

  let idx = 0;
  screens.forEach((s, k) => {
    if (s.atSeconds <= t + 1e-6) idx = k;
  });
  const scr = screens[idx];
  // The first screen is drawn fully at frame 0; later screens slide in.
  const enter = idx === 0 ? 1 : pop(at(scr.atSeconds, 0), 20);

  const button = (label: string, tapAt: number | undefined) => {
    const tap = tapAt !== undefined ? pulse(tapAt, 0.8) : 0;
    return (
      <div
        style={{
          marginTop: 26,
          padding: "20px 0",
          borderRadius: 18,
          background: accentColor,
          color: "#FFFFFF",
          textAlign: "center",
          fontSize: 32,
          fontWeight: 700,
          boxShadow: `0 0 0 ${12 * tap}px rgba(0,102,204,${0.25 * tap})`,
        }}
      >
        {label}
      </div>
    );
  };

  const renderScreen = (s: ProvScreen) => {
    if (s.kind === "qr") {
      const found = s.qrFoundAtSeconds !== undefined && t >= s.qrFoundAtSeconds;
      const f = found ? pop(at(s.qrFoundAtSeconds, 0)) : 0;
      const size = phoneW - 200;
      const cell = size / QR_N;
      const scan = ((t - s.atSeconds) % 1.6) / 1.6;
      return (
        <div style={{ padding: "30px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 28, color: bodyColor, textAlign: "center", lineHeight: 1.35 }}>Quét mã QR in trên log của thiết bị</div>
          <div
            style={{
              position: "relative",
              width: size + 60,
              height: size + 60,
              borderRadius: 28,
              background: "#2C2C2E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width={size} height={size} style={{ background: "#FFFFFF", borderRadius: 8 }}>
              {QR_CELLS.map((on, i) =>
                on ? <rect key={i} x={(i % QR_N) * cell} y={Math.floor(i / QR_N) * cell} width={cell + 0.5} height={cell + 0.5} fill="#000" /> : null,
              )}
            </svg>
            {/* Viewfinder corners */}
            {[
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ].map(([x, y]) => (
              <div
                key={`${x}${y}`}
                style={{
                  position: "absolute",
                  left: x ? undefined : 10,
                  right: x ? 10 : undefined,
                  top: y ? undefined : 10,
                  bottom: y ? 10 : undefined,
                  width: 54,
                  height: 54,
                  borderColor: found ? proColor : "#FFFFFF",
                  borderStyle: "solid",
                  borderWidth: `${y ? 0 : 6}px ${x ? 6 : 0}px ${y ? 6 : 0}px ${x ? 0 : 6}px`,
                  borderRadius: 6,
                }}
              />
            ))}
            {!found && (
              <div
                style={{
                  position: "absolute",
                  left: 30,
                  right: 30,
                  top: 30 + size * scan,
                  height: 4,
                  background: "rgba(255,59,48,0.85)",
                  boxShadow: "0 0 14px 4px rgba(255,59,48,0.45)",
                }}
              />
            )}
          </div>
          {found && s.qrLabel && (
            <div style={{ opacity: f, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 20, background: proColor, color: "#FFF", fontSize: 26, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✓
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: textColor, fontFamily: MONO }}>{s.qrLabel}</div>
            </div>
          )}
        </div>
      );
    }
    if (s.kind === "networks") {
      return (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 24, color: mutedColor, padding: "10px 14px", letterSpacing: "0.01em" }}>Mạng ESP quét được</div>
          {(s.networks ?? []).map((n, i) => {
            const p = idx === screens.indexOf(s) && s.atSeconds > 0 ? pop(at(s.atSeconds + 0.15 + i * 0.12, 0)) : 1;
            const picked = s.pickIndex === i && s.pickAtSeconds !== undefined && t >= s.pickAtSeconds;
            const tap = s.pickIndex === i && s.pickAtSeconds !== undefined ? pulse(s.pickAtSeconds, 0.8) : 0;
            return (
              <div
                key={n.ssid + i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "20px 16px",
                  borderRadius: 16,
                  borderBottom: `2px solid ${borderColor}`,
                  background: picked ? `rgba(0,102,204,${0.08 + 0.2 * tap})` : "transparent",
                  opacity: p,
                }}
              >
                <Bars n={n.bars} color={textColor} dim="#D2D2D7" />
                <div style={{ flex: 1, fontSize: 32, fontWeight: picked ? 700 : 600, color: textColor }}>{n.ssid}</div>
                {n.lock && <Lock color={mutedColor} />}
              </div>
            );
          })}
        </div>
      );
    }
    if (s.kind === "password") {
      const typed =
        s.passwordLength && s.typeSeconds !== undefined
          ? Math.round(interpolate(t - s.atSeconds - 0.3, [0, s.typeSeconds], [0, s.passwordLength], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))
          : (s.passwordLength ?? 0);
      const caret = Math.floor(t * 2) % 2 === 0;
      return (
        <div style={{ padding: "34px 30px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 24, color: mutedColor }}>Mạng Wi-Fi</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: textColor, paddingBottom: 14, borderBottom: `2px solid ${borderColor}` }}>{s.ssid}</div>
          <div style={{ fontSize: 24, color: mutedColor, marginTop: 14 }}>Mật khẩu</div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: textColor,
              letterSpacing: "0.12em",
              padding: "10px 0 14px",
              borderBottom: `3px solid ${accentColor}`,
              minHeight: 54,
            }}
          >
            {"•".repeat(typed)}
            <span style={{ opacity: caret ? 1 : 0, color: accentColor }}>|</span>
          </div>
          {button(s.buttonLabel ?? "Provision", s.submitAtSeconds)}
        </div>
      );
    }
    if (s.kind === "progress") {
      return (
        <div style={{ padding: "40px 30px", display: "flex", flexDirection: "column", gap: 30 }}>
          {(s.steps ?? []).map((st, i) => {
            const p = pop(at(st.atSeconds, 0));
            const done = st.doneAtSeconds !== undefined && t >= st.doneAtSeconds && st.state;
            const color = done ? (st.state === "ok" ? proColor : conColor) : mutedColor;
            const spin = (t * 360) % 360;
            return (
              <div key={st.label + i} style={{ display: "flex", alignItems: "center", gap: 20, opacity: p }}>
                <div style={{ width: 48, height: 48, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {done ? (
                    <div style={{ width: 48, height: 48, borderRadius: 24, background: color, color: "#FFF", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {st.state === "ok" ? "✓" : "✕"}
                    </div>
                  ) : (
                    <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: `rotate(${spin}deg)` }}>
                      <circle cx={22} cy={22} r={18} fill="none" stroke="#D2D2D7" strokeWidth={5} />
                      <path d="M22 4 A18 18 0 0 1 40 22" fill="none" stroke={accentColor} strokeWidth={5} strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div style={{ fontSize: 30, fontWeight: 600, color: done && st.state === "bad" ? conColor : textColor, lineHeight: 1.3 }}>{st.label}</div>
              </div>
            );
          })}
        </div>
      );
    }
    // result
    const ok = s.resultTone !== "bad";
    const p = pop(at(s.atSeconds, 0));
    return (
      <div style={{ padding: "70px 30px", display: "flex", flexDirection: "column", alignItems: "center", gap: 26, textAlign: "center" }}>
        <div
          style={{
            width: 170,
            height: 170,
            borderRadius: 85,
            background: ok ? proColor : conColor,
            color: "#FFF",
            fontSize: 96,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${interpolate(p, [0, 1], [0.6, 1])})`,
          }}
        >
          {ok ? "✓" : "✕"}
        </div>
        {s.resultText && <div style={{ fontSize: 36, fontWeight: 700, color: textColor, lineHeight: 1.25 }}>{s.resultText}</div>}
        {s.resultSub && <div style={{ fontSize: 28, color: bodyColor, lineHeight: 1.35 }}>{s.resultSub}</div>}
      </div>
    );
  };

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

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", justifyContent: side.length > 0 ? "flex-start" : "center" }}>
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
              <div style={{ padding: "52px 28px 18px", borderBottom: `2px solid ${borderColor}`, background: "#F5F5F7" }}>
                <div style={{ fontSize: 34, fontWeight: 700, color: textColor, letterSpacing: "-0.01em" }}>{scr.title}</div>
              </div>
              <div style={{ opacity: enter, transform: `translateX(${interpolate(enter, [0, 1], [60, 0])}px)` }}>{renderScreen(scr)}</div>
            </div>
          </div>
          {phoneCaption && (
            <div style={{ fontSize: 26, color: mutedColor, textAlign: "center", marginTop: 14, letterSpacing: "0.005em" }}>{phoneCaption}</div>
          )}
        </div>

        {side.length > 0 && (
          <div style={{ width: SIDE_W, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 30, fontWeight: 600, color: accentColor, letterSpacing: "0.01em", opacity: phone }}>{sideTitle}</div>
            {side.map((s, i) => {
              const p = pop(at(s.atSeconds, 0.3 + i * 0.3));
              let v: { atSeconds: number; text: string } | undefined;
              for (const x of s.values) if (x.atSeconds <= t + 1e-6) v = x;
              const flash = v && v.atSeconds > 0 ? pulse(v.atSeconds, 1.1) : 0;
              return (
                <div
                  key={s.label + i}
                  style={{
                    ...card,
                    borderRadius: 28,
                    padding: "18px 22px",
                    opacity: p,
                    transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)`,
                    background: flash > 0 ? `rgba(255,236,170,${0.4 + 0.5 * flash})` : surfaceColor,
                  }}
                >
                  <div style={{ fontSize: 26, color: mutedColor, letterSpacing: "0.005em" }}>{s.label}</div>
                  <div style={{ fontSize: 38, fontWeight: 700, color: textColor, letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1.15 }}>{v?.text ?? "–"}</div>
                </div>
              );
            })}
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
