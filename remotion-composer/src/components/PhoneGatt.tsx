import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

/** Action buttons drawn on a characteristic row, in the order a BLE client app shows them. */
export type GattAction = "read" | "write" | "notify";

export interface GattValue {
  atSeconds: number;
  text: string;
}

export interface GattTap {
  atSeconds: number;
  action: GattAction;
}

export interface GattRow {
  /** "device" = a scan result with a CONNECT button, "service" / "char" / "desc" = the attribute table. */
  kind: "device" | "service" | "char" | "desc";
  name: string;
  /** UUID line, e.g. "0x181A" or a 128-bit UUID. */
  uuid?: string;
  /** Second line: "PRIMARY SERVICE", "Properties: READ, NOTIFY", an address... */
  sub?: string;
  /** Buttons on the right of a characteristic row. */
  actions?: GattAction[];
  /** Value field ("Value: ..."); the latest entry at or before the current time is shown, a change flashes. */
  values?: GattValue[];
  /** Finger taps on this row's buttons (ripple on the button). */
  taps?: GattTap[];
  /** Device rows: seconds when CONNECT is tapped. */
  connectAtSeconds?: number;
  /** Accent outline around the row from this time on (until `highlightUntilSeconds`). */
  highlightAtSeconds?: number;
  highlightUntilSeconds?: number;
  atSeconds?: number;
}

export interface GattDialog {
  atSeconds: number;
  untilSeconds: number;
  title: string;
  options: string[];
  /** Index of the option that gets selected, and when. */
  selected: number;
  selectAtSeconds: number;
  /** When SEND is tapped (the dialog closes at `untilSeconds`). */
  sendAtSeconds: number;
}

export interface GattSideItem {
  label: string;
  /** Values over time; the latest at or before now is shown. */
  values: GattValue[];
  /** "led" draws a lamp that glows while the value is "ON". */
  kind?: "text" | "led";
  atSeconds?: number;
}

export interface GattLogLine {
  atSeconds: number;
  text: string;
  tone?: "info" | "ok" | "bad";
}

interface PhoneGattProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** Tab title at the top of the phone screen (device name). */
  screenTitle: string;
  /** Status under the title over time, e.g. [{0, "SCANNER"}, {2.1, "CONNECTED"}]; "CONNECTED" is drawn green. */
  status?: GattValue[];
  rows: GattRow[];
  dialog?: GattDialog;
  /** Small caption under the phone (e.g. "Minh hoạ giao diện nRF Connect"). */
  phoneCaption?: string;
  /** Title of the side column (the ESP32 side). */
  sideTitle?: string;
  side?: GattSideItem[];
  /** Serial log lines under the phone; the last `logLines` visible lines are shown. */
  log?: GattLogLine[];
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
const PHONE_W = 512;
/** Phone width when there is no ESP32 side column. */
const PHONE_W_ALONE = 680;
const SIDE_W = 288;

/** Latest value at or before time t (seconds), with the time it was set. */
function latest(values: GattValue[] | undefined, t: number): GattValue | undefined {
  let out: GattValue | undefined;
  for (const v of values ?? []) if (v.atSeconds <= t + 1e-6) out = v;
  return out;
}

const ActionIcon: React.FC<{ action: GattAction; color: string }> = ({ action, color }) => {
  const s = { fill: "none", stroke: color, strokeWidth: 3.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={34} height={34} viewBox="0 0 32 32">
      {action === "read" && (
        <>
          <path d="M16 5 V21" {...s} />
          <path d="M9 15 L16 22 L23 15" {...s} />
          <path d="M7 27 H25" {...s} />
        </>
      )}
      {action === "write" && (
        <>
          <path d="M16 27 V11" {...s} />
          <path d="M9 17 L16 10 L23 17" {...s} />
          <path d="M7 5 H25" {...s} />
        </>
      )}
      {action === "notify" && (
        <>
          {[6, 16, 26].map((x) => (
            <g key={x}>
              <path d={`M${x} 6 V24`} {...s} strokeWidth={3} />
              <path d={`M${x - 4} 19 L${x} 25 L${x + 4} 19`} {...s} strokeWidth={3} />
            </g>
          ))}
        </>
      )}
    </svg>
  );
};

export const PhoneGatt: React.FC<PhoneGattProps> = ({
  name,
  eyebrow,
  tagline,
  screenTitle,
  status = [],
  rows,
  dialog,
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
  /** 0..1..0 pulse lasting `len` seconds after `start` seconds. */
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
  const st = latest(status, t);
  const connected = st?.text === "CONNECTED";

  const renderRow = (r: GattRow, i: number) => {
    const p = pop(at(r.atSeconds, 0.2 + i * 0.25));
    const indent = r.kind === "char" ? 26 : r.kind === "desc" ? 52 : 0;
    const v = latest(r.values, t);
    const flash = v && v.atSeconds > 0 ? pulse(v.atSeconds, 1.1) : 0;
    const hl =
      r.highlightAtSeconds !== undefined && t >= r.highlightAtSeconds && (r.highlightUntilSeconds === undefined || t < r.highlightUntilSeconds)
        ? pop(at(r.highlightAtSeconds, 0))
        : 0;
    const titleSize = r.kind === "service" ? 32 : r.kind === "device" ? 34 : 30;
    const connectTap = r.connectAtSeconds !== undefined ? pulse(r.connectAtSeconds, 0.8) : 0;
    const didConnect = r.connectAtSeconds !== undefined && t >= r.connectAtSeconds;
    return (
      <div
        key={r.name + i}
        style={{
          marginLeft: indent,
          padding: "16px 18px",
          borderRadius: 18,
          border: `3px solid ${hl > 0 ? accentColor : "transparent"}`,
          background: r.kind === "service" ? "rgba(0,102,204,0.06)" : "transparent",
          opacity: p,
          transform: `translateY(${interpolate(p, [0, 1], [18, 0])}px)`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, color: textColor, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{r.name}</div>
          {r.uuid && (
            <div style={{ fontSize: 24, fontFamily: MONO, color: mutedColor, marginTop: 4, wordBreak: "break-all" }}>
              UUID: {r.uuid}
            </div>
          )}
          {r.sub && <div style={{ fontSize: 24, color: mutedColor, marginTop: 2, letterSpacing: "0.01em" }}>{r.sub}</div>}
          {v && (
            <div
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "2px 10px",
                borderRadius: 10,
                fontSize: 27,
                fontFamily: MONO,
                color: textColor,
                background: `rgba(255,204,0,${0.55 * flash})`,
              }}
            >
              Value: {v.text}
            </div>
          )}
        </div>
        {r.kind === "device" && (
          <div
            style={{
              flex: "0 0 auto",
              padding: "10px 16px",
              borderRadius: 12,
              background: didConnect ? mutedColor : accentColor,
              color: "#FFFFFF",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.02em",
              boxShadow: `0 0 0 ${10 * connectTap}px rgba(0,102,204,${0.3 * connectTap})`,
            }}
          >
            {didConnect ? "DISCONNECT" : "CONNECT"}
          </div>
        )}
        {(r.actions ?? []).map((a) => {
          const tap = (r.taps ?? []).filter((x) => x.action === a).reduce((m, x) => Math.max(m, pulse(x.atSeconds, 0.9)), 0);
          // The notify button stays accent-coloured once subscribed.
          const on = a === "notify" && (r.taps ?? []).some((x) => x.action === "notify" && t >= x.atSeconds);
          return (
            <div
              key={a}
              style={{
                flex: "0 0 auto",
                width: 52,
                height: 52,
                borderRadius: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: tap > 0 ? `rgba(0,102,204,${0.18 * tap})` : "transparent",
                boxShadow: `0 0 0 ${12 * tap}px rgba(0,102,204,${0.22 * tap})`,
              }}
            >
              <ActionIcon action={a} color={on || tap > 0.2 ? accentColor : mutedColor} />
            </div>
          );
        })}
      </div>
    );
  };

  // Dialog (write value picker)
  const dlg = dialog && t >= dialog.atSeconds && t < dialog.untilSeconds ? pop(at(dialog.atSeconds, 0), 18) : 0;

  const visibleLog = log.filter((l) => l.atSeconds <= t + 1e-6).slice(-logLines);

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        // Mono code must show "->" as typed, not as an arrow ligature.
        fontVariantLigatures: "none",
        padding: portrait ? (layout === "centered" ? "230px 120px 300px 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 26,
      }}
    >
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 8 }}>{eyebrow}</div>}
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 36, fontWeight: 400, lineHeight: 1.35, color: bodyColor, marginTop: 10 }}>{tagline}</div>}
      </div>

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
        {/* Phone */}
        <div style={{ width: phoneW, flex: "0 0 auto", opacity: phone, transform: `translateY(${interpolate(phone, [0, 1], [40, 0])}px)` }}>
          <div
            style={{
              position: "relative",
              width: phoneW,
              height: 900,
              borderRadius: 64,
              background: "#1D1D1F",
              padding: 14,
              boxShadow: "0 24px 60px rgba(16,24,40,0.22)",
            }}
          >
            <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, background: "#FFFFFF", overflow: "hidden" }}>
              {/* App bar */}
              <div style={{ background: "#00A9CE", padding: "46px 24px 16px", color: "#FFFFFF" }}>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.01em" }}>{screenTitle}</div>
                {st && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 7, background: connected ? "#7CFC9A" : "rgba(255,255,255,0.7)" }} />
                    <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.04em" }}>{st.text}</div>
                  </div>
                )}
              </div>
              {/* Attribute list */}
              <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>{rows.map(renderRow)}</div>

              {/* Write dialog */}
              {dialog && dlg > 0 && (
                <AbsoluteFill style={{ background: `rgba(0,0,0,${0.35 * dlg})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div
                    style={{
                      width: phoneW - 90,
                      background: "#FFFFFF",
                      borderRadius: 28,
                      padding: "28px 28px 20px",
                      boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
                      transform: `scale(${interpolate(dlg, [0, 1], [0.9, 1])})`,
                    }}
                  >
                    <div style={{ fontSize: 30, fontWeight: 700, color: textColor, marginBottom: 18 }}>{dialog.title}</div>
                    {dialog.options.map((o, k) => {
                      const sel = k === dialog.selected && t >= dialog.selectAtSeconds;
                      return (
                        <div key={o} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0" }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 17,
                              border: `3px solid ${sel ? accentColor : mutedColor}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {sel && <div style={{ width: 18, height: 18, borderRadius: 9, background: accentColor }} />}
                          </div>
                          <div style={{ fontSize: 30, fontWeight: 600, color: textColor }}>{o}</div>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                      <div
                        style={{
                          padding: "10px 20px",
                          borderRadius: 12,
                          fontSize: 26,
                          fontWeight: 700,
                          color: accentColor,
                          background: `rgba(0,102,204,${0.08 + 0.2 * pulse(dialog.sendAtSeconds, 0.7)})`,
                        }}
                      >
                        SEND
                      </div>
                    </div>
                  </div>
                </AbsoluteFill>
              )}
            </div>
          </div>
          {phoneCaption && (
            <div style={{ fontSize: 26, color: mutedColor, textAlign: "center", marginTop: 14, letterSpacing: "0.005em" }}>{phoneCaption}</div>
          )}
        </div>

        {/* ESP32 side */}
        {side.length > 0 && (
          <div style={{ width: SIDE_W, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 30, fontWeight: 600, color: accentColor, letterSpacing: "0.01em", opacity: phone }}>{sideTitle}</div>
            {side.map((s, i) => {
              const p = pop(at(s.atSeconds, 0.3 + i * 0.3));
              const v = latest(s.values, t);
              const flash = v && v.atSeconds > 0 ? pulse(v.atSeconds, 1.1) : 0;
              const ledOn = s.kind === "led" && v?.text === "ON";
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
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
                    {s.kind === "led" && (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          background: ledOn ? "#FFFFFF" : "#D2D2D7",
                          border: `3px solid ${ledOn ? "#FFD60A" : "#AEAEB2"}`,
                          boxShadow: ledOn ? "0 0 26px 12px rgba(255,214,10,0.75)" : "none",
                        }}
                      />
                    )}
                    <div style={{ fontSize: 44, fontWeight: 700, color: textColor, letterSpacing: "-0.02em" }}>{v?.text ?? "–"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Serial log */}
      {log.length > 0 && (
        <div style={{ ...card, borderRadius: 28, padding: "16px 24px", opacity: phone, minHeight: 40 + logLines * 36 }}>
          <div style={{ fontSize: 24, fontFamily: MONO, color: mutedColor, marginBottom: 6 }}>{logTitle}</div>
          {visibleLog.map((l, i) => {
            const p = pop(at(l.atSeconds, 0), 18);
            const c = l.tone === "ok" ? proColor : l.tone === "bad" ? conColor : bodyColor;
            return (
              <div key={l.text + l.atSeconds + i} style={{ fontSize: 24, fontFamily: MONO, color: c, lineHeight: 1.5, opacity: p, whiteSpace: "pre" }}>
                {l.text}
              </div>
            );
          })}
        </div>
      )}

      {/* Pros / cons */}
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
