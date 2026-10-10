import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export interface BrowserValue {
  atSeconds: number;
  text: string;
}

export interface BrowserCard {
  label: string;
  /** Values over time; the latest at or before now is shown, a change flashes the number. */
  values: BrowserValue[];
  atSeconds?: number;
}

export interface BrowserLedState {
  atSeconds: number;
  on: boolean;
}

export interface BrowserWindow {
  /** "desktop" = browser window with tabs, "phone" = narrow phone browser. */
  frame: "desktop" | "phone";
  /** Address bar text, e.g. "192.168.1.42". */
  url: string;
  /** Tab title (desktop) or caption under the window. */
  title?: string;
  /** Clicks / taps on the LED switch (ripple). */
  taps?: number[];
  /** Page content appears at this time (before it the page is blank, as while loading). */
  loadAtSeconds?: number;
  atSeconds?: number;
}

export interface BrowserFrameLine {
  atSeconds: number;
  /** "up" = browser -> ESP32 (sent), "down" = ESP32 -> browser (received). */
  dir: "up" | "down";
  text: string;
}

interface BrowserPageProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  windows: BrowserWindow[];
  pageTitle?: string;
  cards?: BrowserCard[];
  /** LED switch state over time, shared by every window (they stay in sync). */
  led?: BrowserLedState[];
  ledLabel?: string;
  /** Connection line at the bottom of every page, e.g. [{0, "WebSocket: đã kết nối"}]. */
  status?: BrowserValue[];
  /** DevTools-style WebSocket frame list under the windows. */
  frames?: BrowserFrameLine[];
  framesTitle?: string;
  framesLines?: number;
  /** Board card with the real LED lamp, following `led`. */
  espLabel?: string;
  espAtSeconds?: number;
  /** LED state on the board when it differs from the pages' (the board switches first, the pages follow the broadcast). */
  espLed?: BrowserLedState[];
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

function latest<T extends { atSeconds: number }>(values: T[] | undefined, t: number): T | undefined {
  let out: T | undefined;
  for (const v of values ?? []) if (v.atSeconds <= t + 1e-6) out = v;
  return out;
}

export const BrowserPage: React.FC<BrowserPageProps> = ({
  name,
  eyebrow,
  tagline,
  windows,
  pageTitle = "ESP32-S3",
  cards = [],
  led,
  ledLabel = "LED",
  status = [],
  frames = [],
  framesTitle = "WebSocket · Messages",
  framesLines = 4,
  espLabel,
  espAtSeconds,
  espLed,
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
  const pulse = (start: number, len = 0.9) =>
    interpolate(t - start, [0, 0.12, len], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };

  const contentW = portrait ? width - (layout === "centered" ? 240 : 248) : 1100;
  const hasPhone = windows.some((w) => w.frame === "phone");
  const hasDesktop = windows.some((w) => w.frame === "desktop");
  const gap = 28;
  const phoneW = hasPhone && hasDesktop ? 300 : 420;
  const desktopW = hasPhone && hasDesktop ? contentW - phoneW - gap : contentW;
  const winH = hasPhone && hasDesktop ? 640 : hasPhone ? 760 : 600;

  const ledNow = latest(led, t);
  const ledOn = ledNow?.on ?? false;
  const espNow = latest(espLed ?? led, t);
  const espOn = espNow?.on ?? false;
  const espFlash = espNow && espNow.atSeconds > 0 ? pulse(espNow.atSeconds, 1.0) : 0;
  const st = latest(status, t);

  /** Page body; `k` scales type to the window width (1 = 520 px wide). */
  const Page: React.FC<{ w: BrowserWindow; k: number; narrow: boolean }> = ({ w, k, narrow }) => {
    const loaded = w.loadAtSeconds === undefined || t >= w.loadAtSeconds;
    const lp = loaded ? pop(w.loadAtSeconds, 0, 20) : 0;
    const tap = (w.taps ?? []).reduce((m, x) => Math.max(m, pulse(x, 0.8)), 0);
    if (!loaded) {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 46 * k, height: 46 * k, borderRadius: "50%", border: `${5 * k}px solid #D2D2D7`, borderTopColor: accentColor,
            transform: `rotate(${t * 360}deg)` }} />
        </div>
      );
    }
    return (
      <div style={{ flex: 1, padding: `${22 * k}px ${24 * k}px`, display: "flex", flexDirection: "column", gap: 16 * k, opacity: lp,
        transform: `translateY(${interpolate(lp, [0, 1], [14, 0])}px)` }}>
        <div style={{ fontSize: 34 * k, fontWeight: 700, color: textColor, letterSpacing: "-0.015em" }}>{pageTitle}</div>
        <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", gap: 14 * k }}>
          {cards.map((c, i) => {
            const v = latest(c.values, t);
            const fl = v && v.atSeconds > 0 ? pulse(v.atSeconds, 0.9) : 0;
            const cp = pop(c.atSeconds, 0);
            return (
              <div key={c.label + i} style={{ flex: "1 1 0", minWidth: 0, borderRadius: 20 * k, padding: `${14 * k}px ${16 * k}px`,
                background: `rgba(0,102,204,${0.06 + 0.12 * fl})`, opacity: cp }}>
                <div style={{ fontSize: 22 * k, color: mutedColor, letterSpacing: "0.005em" }}>{c.label}</div>
                <div style={{ fontSize: 50 * k, fontWeight: 700, color: textColor, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap" }}>{v?.text ?? "–"}</div>
              </div>
            );
          })}
        </div>
        {led && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 20 * k,
            padding: `${14 * k}px ${16 * k}px`, background: "rgba(0,0,0,0.035)" }}>
            <div style={{ fontSize: 30 * k, fontWeight: 600, color: textColor }}>{ledLabel}</div>
            <div style={{ position: "relative", width: 96 * k, height: 54 * k, borderRadius: 27 * k,
              background: ledOn ? proColor : "#D2D2D7",
              boxShadow: `0 0 0 ${14 * tap * k}px rgba(0,102,204,${0.25 * tap})` }}>
              <div style={{ position: "absolute", top: 5 * k, left: ledOn ? 47 * k : 5 * k, width: 44 * k, height: 44 * k, borderRadius: 22 * k,
                background: "#FFFFFF", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }} />
            </div>
          </div>
        )}
        <div style={{ flex: 1 }} />
        {st && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 * k }}>
            <div style={{ width: 14 * k, height: 14 * k, borderRadius: 7 * k, background: /lỗi|mất|đóng/i.test(st.text) ? conColor : proColor }} />
            <div style={{ fontSize: 22 * k, color: bodyColor }}>{st.text}</div>
          </div>
        )}
      </div>
    );
  };

  const Window: React.FC<{ w: BrowserWindow; i: number }> = ({ w, i }) => {
    const p = pop(w.atSeconds, 0, 20);
    const ww = w.frame === "phone" ? phoneW : desktopW;
    const k = ww / 520;
    const phone = w.frame === "phone";
    return (
      <div style={{ width: ww, flex: "0 0 auto", opacity: p, transform: `translateY(${interpolate(p, [0, 1], [36, 0])}px)` }}>
        <div style={{ width: ww, height: winH, borderRadius: phone ? 48 : 22, background: phone ? "#1D1D1F" : "#FFFFFF",
          padding: phone ? 10 : 0, border: phone ? "none" : `2px solid ${borderColor}`, boxShadow: "0 22px 56px rgba(16,24,40,0.16)",
          overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#FFFFFF", borderRadius: phone ? 40 : 0, overflow: "hidden" }}>
            {/* Chrome */}
            <div style={{ background: "#F2F2F7", padding: phone ? `${34 * k}px ${14 * k}px ${12 * k}px` : `${12 * k}px ${16 * k}px`,
              borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
              {!phone && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 * k, marginBottom: 10 * k }}>
                  {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                    <div key={c} style={{ width: 14 * k, height: 14 * k, borderRadius: 7 * k, background: c }} />
                  ))}
                  <div style={{ marginLeft: 12 * k, padding: `${6 * k}px ${14 * k}px`, borderRadius: `${10 * k}px ${10 * k}px 0 0`,
                    background: "#FFFFFF", fontSize: 20 * k, color: bodyColor, whiteSpace: "nowrap" }}>{w.title ?? pageTitle}</div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 * k, background: "#FFFFFF", borderRadius: 12 * k,
                padding: `${8 * k}px ${14 * k}px`, border: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize: (phone ? 26 : 20) * k, color: mutedColor }}>ⓘ</div>
                <div style={{ fontSize: (phone ? 28 : 22) * k, fontFamily: MONO, color: textColor, whiteSpace: "nowrap", overflow: "hidden" }}>{w.url}</div>
              </div>
            </div>
            <Page w={w} k={phone ? k * 1.45 : k} narrow={phone} />
          </div>
        </div>
        {phone && w.title && (
          <div style={{ fontSize: 26, color: mutedColor, textAlign: "center", marginTop: 12, letterSpacing: "0.005em" }}>{w.title}</div>
        )}
        {!phone && i === 0 && caption && (
          <div style={{ fontSize: 26, color: mutedColor, textAlign: "center", marginTop: 12, letterSpacing: "0.005em" }}>{caption}</div>
        )}
      </div>
    );
  };

  const head = pop(0, 0, 18);
  const visibleFrames = frames.filter((l) => l.atSeconds <= t + 1e-6).slice(-framesLines);
  const espP = espLabel ? pop(espAtSeconds, 0.3) : 0;

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

      <div style={{ display: "flex", gap, alignItems: "flex-start", justifyContent: "center" }}>
        {windows.map((w, i) => (
          <Window key={i} w={w} i={i} />
        ))}
      </div>

      {espLabel && (
        <div style={{ ...card, borderRadius: 28, padding: "16px 24px", display: "flex", alignItems: "center", gap: 20, opacity: espP,
          background: espFlash > 0 ? `rgba(255,236,170,${0.35 + 0.45 * espFlash})` : surfaceColor }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: espOn ? "#FFFFFF" : "#D2D2D7",
            border: `3px solid ${espOn ? "#FFD60A" : "#AEAEB2"}`, boxShadow: espOn ? "0 0 26px 12px rgba(255,214,10,0.75)" : "none" }} />
          <div style={{ fontSize: 32, fontWeight: 600, color: textColor }}>{espLabel}</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 32, fontWeight: 700, color: espOn ? proColor : mutedColor }}>{espOn ? "ON" : "OFF"}</div>
        </div>
      )}

      {frames.length > 0 && (
        <div style={{ ...card, borderRadius: 28, padding: "16px 24px", minHeight: 44 + framesLines * 38, opacity: head }}>
          <div style={{ fontSize: 24, color: mutedColor, marginBottom: 6 }}>{framesTitle}</div>
          {visibleFrames.map((l, i) => {
            const p = pop(l.atSeconds, 0, 18);
            const up = l.dir === "up";
            return (
              <div key={l.text + l.atSeconds + i} style={{ display: "flex", gap: 14, alignItems: "baseline", opacity: p, lineHeight: 1.55 }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: up ? proColor : conColor, width: 24 }}>{up ? "↑" : "↓"}</div>
                <div style={{ fontSize: 25, fontFamily: MONO, color: textColor, whiteSpace: "pre" }}>{l.text}</div>
              </div>
            );
          })}
        </div>
      )}

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
