import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

export interface IrAcState {
  on: boolean;
  /** Set temperature shown on the display, e.g. 26. */
  temp?: number;
  /** Mode text under the temperature, e.g. "Mát". */
  mode?: string;
}

export interface IrShot {
  /** Who sends: the handheld remote, the phone (over Wi-Fi), or the ESP32-S3's IR LED. */
  from: "remote" | "phone" | "esp";
  /** Who receives: the ESP32-S3's IR receiver, the AC or the TV. */
  to: "esp" | "ac" | "tv";
  atSeconds: number;
  /** Travel time of the beam (default 0.7 s). The target reacts when it lands. */
  seconds?: number;
  /** Button of the remote / phone page pressed at `atSeconds`. */
  button?: number;
  /** Learned-command row lit while the shot travels. */
  cmd?: number;
  /** New AC state when an ESP/remote shot lands on the AC. */
  ac?: IrAcState;
  /** New TV power state when a shot lands on the TV. */
  tv?: boolean;
  /** Status pill text from `atSeconds` until the next shot (default derived from the shot). */
  status?: string;
}

export interface IrButton {
  label: string;
  sub?: string;
}

export interface IrLearned {
  name: string;
  /** Second line, e.g. "NEC · 32 bit" or "Raw · 290 xung". */
  sub?: string;
  atSeconds?: number;
}

export interface IrStrip {
  label: string;
  sub?: string;
  /** Number of RMT symbols (mark + space pairs) in the frame. */
  symbols: number;
  atSeconds?: number;
  /** Seconds to draw the strip left to right (default 0.8). */
  revealSeconds?: number;
}

interface IrRemoteProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** [[seconds, "remote" | "phone"]]: which handheld is drawn (cross-fade). Default remote. */
  handTrack?: [number, "remote" | "phone"][];
  remoteButtons?: IrButton[];
  phoneButtons?: IrButton[];
  /** Small page title on the phone, e.g. "ir-remote.local". */
  phoneTitle?: string;
  shots?: IrShot[];
  /** AC state on the first frame (default off). */
  acStart?: IrAcState;
  tvStart?: boolean;
  /** Hide a device: e.g. ["tv"]. */
  hide?: ("ac" | "tv")[];
  learned?: IrLearned[];
  learnedTitle?: string;
  learnedAtSeconds?: number;
  strips?: IrStrip[];
  /** RMT memory block width in symbols drawn as a bracket over the strips (e.g. 48). */
  stripBlock?: { symbols: number; label: string; atSeconds?: number };
  /** Overflow beyond the block turns accent with this label (e.g. "DMA · nhận từng phần"). */
  stripFix?: { label: string; atSeconds: number };
  stripsAtSeconds?: number;
  idleStatus?: string;
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
const MONO = "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace";
const STAGE_W = 1000;
const STAGE_H = 800;
const BEAM = "#C2185B";
const WIFI = "#0066CC";

// Anchor points on the stage
const AC_BOX = [30, 24, 560, 176] as const; // x, y, w, h
const TV_BOX = [650, 24, 320, 210] as const;
const ESP_BOX = [500, 500, 420, 170] as const;
const RX_AT: [number, number] = [560, 500];
const LED_AT: [number, number] = [860, 500];
const HAND_BOX = [30, 290, 360, 450] as const;
const TARGET: Record<string, [number, number]> = {
  esp: RX_AT,
  ac: [430, 140],
  tv: [810, 150],
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Infrared remote explainer: an AC and a TV, an ESP32-S3 with its IR receiver and IR LED, a handheld remote or a phone
 * page whose button taps send beams (IR) or Wi-Fi requests, a learned-command list (NVS) and pulse strips of a frame's
 * RMT symbols against one RMT memory block. Device states follow the shots that land on them.
 */
export const IrRemote: React.FC<IrRemoteProps> = ({
  name,
  eyebrow,
  tagline,
  handTrack,
  remoteButtons = [{ label: "Nguồn" }, { label: "Chế độ" }, { label: "▲" }, { label: "▼" }, { label: "Quạt" }, { label: "Hẹn giờ" }],
  phoneButtons = [],
  phoneTitle = "ir-remote.local",
  shots = [],
  acStart = { on: false },
  tvStart = false,
  hide = [],
  learned,
  learnedTitle = "Lệnh đã học · NVS",
  learnedAtSeconds,
  strips,
  stripBlock,
  stripFix,
  stripsAtSeconds,
  idleStatus = "Chờ lệnh…",
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
  const head = pop(0, 18);
  const sorted = [...shots].sort((a, b) => a.atSeconds - b.atSeconds);
  const travel = (s: IrShot) => s.seconds ?? 0.7;
  const landAt = (s: IrShot) => s.atSeconds + travel(s);

  // ---------------------------------------------------------------- device states
  let ac: IrAcState = acStart;
  let acChanged = -1e9;
  let tv = tvStart;
  let tvChanged = -1e9;
  for (const s of sorted) {
    if (t < landAt(s)) continue;
    if (s.to === "ac" && s.ac) {
      ac = s.ac;
      acChanged = landAt(s);
    }
    if (s.to === "tv" && s.tv !== undefined) {
      tv = s.tv;
      tvChanged = landAt(s);
    }
  }
  const beepK = 1 - interpolate(t, [acChanged, acChanged + 0.9], [0, 1], clamp);
  const tvFlash = 1 - interpolate(t, [tvChanged, tvChanged + 0.6], [0, 1], clamp);

  // ---------------------------------------------------------------- handheld
  let hand: "remote" | "phone" = "remote";
  let handSince = -1e9;
  for (const [s, v] of handTrack ?? []) {
    if (t >= s) {
      // A switch at or before frame 0 is the starting handheld, drawn fully from the first frame.
      if (v !== hand && s > 0) handSince = s;
      hand = v;
    }
  }
  const handK = handSince <= -1e8 ? 1 : interpolate(t, [handSince, handSince + 0.35], [0, 1], clamp);
  const pressed = (src: "remote" | "phone", i: number) =>
    sorted.some((s) => s.from === src && s.button === i && t >= s.atSeconds - 0.05 && t < s.atSeconds + 0.45);

  // ---------------------------------------------------------------- current shot, status, lit command
  const live = sorted.filter((s) => t >= s.atSeconds && t < landAt(s) + 0.15);
  const lastShot = [...sorted].reverse().find((s) => t >= s.atSeconds);
  const btnLabel = (s: IrShot) => {
    const list = s.from === "phone" ? phoneButtons : remoteButtons;
    return s.button !== undefined && list[s.button] ? list[s.button].label : "";
  };
  const cmdName = (s: IrShot) => (s.cmd !== undefined && learned?.[s.cmd] ? learned[s.cmd].name : btnLabel(s));
  let status = { text: idleStatus, tone: "muted" as "muted" | "accent" | "good" };
  if (lastShot) {
    const nm = cmdName(lastShot);
    const def =
      lastShot.from === "remote" && lastShot.to === "esp"
        ? `Mắt thu: ${nm || "khung mới"}`
        : lastShot.from === "phone"
          ? `Wi-Fi: ${nm}`
          : `Phát: ${nm}`;
    status = { text: lastShot.status ?? def, tone: t < landAt(lastShot) ? "accent" : "good" };
  }
  const statusBg = status.tone === "good" ? "#D7F0DD" : status.tone === "accent" ? "#CFE2F8" : "#E8E8ED";
  const statusInk = status.tone === "good" ? proColor : status.tone === "accent" ? accentColor : mutedColor;
  const litCmd = (i: number) => sorted.some((s) => s.cmd === i && t >= s.atSeconds && t < landAt(s) + 0.6);

  // ---------------------------------------------------------------- drawing helpers
  const beam = (s: IrShot, k: number) => {
    const p0: [number, number] = s.from === "esp" ? LED_AT : s.from === "remote" ? [HAND_BOX[0] + HAND_BOX[2] / 2, HAND_BOX[1] + 6] : [HAND_BOX[0] + HAND_BOX[2], HAND_BOX[1] + 200];
    const p1 = TARGET[s.to];
    const u = interpolate(t, [s.atSeconds, landAt(s)], [0, 1], clamp);
    const fade = 1 - interpolate(t, [landAt(s), landAt(s) + 0.15], [0, 1], clamp);
    const head2: [number, number] = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u];
    if (s.from === "phone") {
      // Wi-Fi request: arcs travelling to the ESP32-S3
      return (
        <g key={`b${k}`} opacity={fade}>
          <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={WIFI} strokeWidth={3} strokeDasharray="4 12" opacity={0.5} />
          {[0, 1, 2].map((j) => {
            const uu = Math.max(0, u - j * 0.12);
            const x = p0[0] + (p1[0] - p0[0]) * uu;
            const y = p0[1] + (p1[1] - p0[1]) * uu;
            return <circle key={j} cx={x} cy={y} r={14 + j * 9} fill="none" stroke={WIFI} strokeWidth={4} opacity={uu > 0 ? 0.8 - j * 0.22 : 0} />;
          })}
        </g>
      );
    }
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const spread = 26;
    return (
      <g key={`b${k}`} opacity={fade}>
        {/* Cone of light from the emitter to the moving front */}
        <polygon
          points={`${p0[0]},${p0[1]} ${head2[0] + nx * spread * u},${head2[1] + ny * spread * u} ${head2[0] - nx * spread * u},${head2[1] - ny * spread * u}`}
          fill={BEAM}
          opacity={0.2}
        />
        {/* Carrier bursts: dots along the beam, blinking */}
        {Array.from({ length: 9 }).map((_, j) => {
          const uu = u - j * 0.07;
          if (uu <= 0) return null;
          const x = p0[0] + dx * uu;
          const y = p0[1] + dy * uu;
          const blink = Math.sin((t * 14 + j) * Math.PI) > -0.2 ? 1 : 0.25;
          return <circle key={j} cx={x} cy={y} r={10} fill={BEAM} opacity={blink * (1 - j * 0.08)} />;
        })}
      </g>
    );
  };

  const acOn = ac.on;
  const tvOn = tv;

  // ---------------------------------------------------------------- strips
  const showStrips = strips && strips.length > 0;
  const stripsV = showStrips ? pop(at(stripsAtSeconds, 0)) : 0;
  const maxSym = Math.max(...(strips ?? [{ symbols: 1 }]).map((s) => s.symbols), stripBlock?.symbols ?? 1);
  const STRIP_W = 900;
  const symW = STRIP_W / maxSym;
  const fixK = stripFix ? interpolate(t, [stripFix.atSeconds, stripFix.atSeconds + 0.4], [0, 1], clamp) : 0;
  const blockV = stripBlock ? pop(at(stripBlock.atSeconds, 0)) : 0;
  const rand = (i: number) => {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };
  const panel: React.CSSProperties = {
    background: "rgba(255,255,255,0.7)",
    borderRadius: 24,
    border: "2px solid rgba(0,0,0,0.06)",
    padding: "14px 18px",
  };

  const handheld = (kind: "remote" | "phone", v: number) => {
    const [hx, hy, hw, hh] = HAND_BOX;
    if (v <= 0.001) return null;
    if (kind === "remote") {
      const cols = 2;
      const bw = 104;
      const bh = 62;
      return (
        <g opacity={v}>
          <rect x={hx + 60} y={hy + 4} width={hw - 120} height={hh - 8} rx={60} fill="#2C2C2E" />
          <rect x={hx + 60} y={hy + 4} width={hw - 120} height={hh - 8} rx={60} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
          {/* IR emitter window */}
          <rect x={hx + hw / 2 - 30} y={hy + 14} width={60} height={22} rx={11} fill="#5B1A33" />
          {remoteButtons.slice(0, 8).map((b, i) => {
            const cx = hx + hw / 2 + (i % cols === 0 ? -bw / 2 - 6 : bw / 2 + 6);
            const cy = hy + 90 + Math.floor(i / cols) * (bh + 22) + bh / 2;
            const on = pressed("remote", i);
            return (
              <g key={i}>
                <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={22} fill={on ? "#FFFFFF" : "#48484A"} />
                <text x={cx} y={cy + 9} textAnchor="middle" fontSize={b.label.length > 6 ? 21 : 26} fontWeight={600} fill={on ? textColor : "#F2F2F7"}>
                  {b.label}
                </text>
              </g>
            );
          })}
          <text x={hx + hw / 2} y={hy + hh + 34} textAnchor="middle" fontSize={28} fontWeight={700} fill={textColor}>
            Remote
          </text>
        </g>
      );
    }
    // Phone with a small web page
    return (
      <g opacity={v}>
        <rect x={hx + 16} y={hy - 6} width={hw - 32} height={hh + 12} rx={42} fill="#1D1D1F" />
        <rect x={hx + 28} y={hy + 6} width={hw - 56} height={hh - 12} rx={32} fill="#FFFFFF" />
        <rect x={hx + hw / 2 - 40} y={hy + 16} width={80} height={16} rx={8} fill="#1D1D1F" />
        <rect x={hx + 44} y={hy + 44} width={hw - 88} height={36} rx={18} fill="#F2F2F7" />
        <text x={hx + hw / 2} y={hy + 69} textAnchor="middle" fontSize={20} fill={mutedColor} fontFamily={MONO}>
          {phoneTitle}
        </text>
        {phoneButtons.slice(0, 5).map((b, i) => {
          const y = hy + 96 + i * 70;
          const on = pressed("phone", i);
          return (
            <g key={i}>
              <rect x={hx + 44} y={y} width={hw - 88} height={60} rx={16} fill={on ? accentColor : "#EAF2FC"} />
              <text x={hx + hw / 2} y={y + 39} textAnchor="middle" fontSize={b.label.length > 13 ? 25 : 29} fontWeight={600} fill={on ? "#FFFFFF" : accentColor}>
                {b.label}
              </text>
            </g>
          );
        })}
        <text x={hx + hw / 2} y={hy + hh + 40} textAnchor="middle" fontSize={28} fontWeight={700} fill={textColor}>
          Điện thoại
        </text>
      </g>
    );
  };

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "230px 110px 300px 110px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 28,
      }}
    >
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 12 }}>{tagline}</div>}
      </div>

      <div style={{ ...card, padding: "18px 18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {/* AC wall unit */}
          {!hide.includes("ac") && (
            <g>
              <rect x={AC_BOX[0] + 4} y={AC_BOX[1] + 10} width={AC_BOX[2]} height={AC_BOX[3]} rx={30} fill="rgba(16,24,40,0.10)" />
              <rect x={AC_BOX[0]} y={AC_BOX[1]} width={AC_BOX[2]} height={AC_BOX[3]} rx={30} fill="#FFFFFF" stroke="rgba(0,0,0,0.12)" strokeWidth={2} />
              <rect x={AC_BOX[0] + 24} y={AC_BOX[1] + AC_BOX[3] - 40} width={AC_BOX[2] - 48} height={14} rx={7} fill="#E5E5EA" />
              {/* Display */}
              <rect x={AC_BOX[0] + 330} y={AC_BOX[1] + 26} width={200} height={96} rx={16} fill={acOn ? "#0B1B2E" : "#2C2C2E"} />
              {acOn ? (
                <g>
                  <text x={AC_BOX[0] + 430} y={AC_BOX[1] + 92} textAnchor="middle" fontSize={56} fontWeight={700} fill="#7FD3FF" fontFamily={MONO}>
                    {ac.temp !== undefined ? `${ac.temp}°` : "ON"}
                  </text>
                  {ac.mode && (
                    <text x={AC_BOX[0] + 430} y={AC_BOX[1] + 116} textAnchor="middle" fontSize={20} fontWeight={600} fill="#7FD3FF">
                      {ac.mode}
                    </text>
                  )}
                </g>
              ) : (
                <text x={AC_BOX[0] + 430} y={AC_BOX[1] + 88} textAnchor="middle" fontSize={40} fontWeight={700} fill="#636366" fontFamily={MONO}>
                  – –
                </text>
              )}
              {/* Receiver window + power LED */}
              <circle cx={AC_BOX[0] + 290} cy={AC_BOX[1] + 74} r={12} fill="#3A3A3C" />
              <circle cx={AC_BOX[0] + 290} cy={AC_BOX[1] + 108} r={7} fill={acOn ? proColor : "#C7C7CC"} />
              <text x={AC_BOX[0] + 34} y={AC_BOX[1] + 66} fontSize={34} fontWeight={700} fill={textColor}>
                Điều hoà
              </text>
              <text x={AC_BOX[0] + 34} y={AC_BOX[1] + 104} fontSize={26} fontWeight={600} fill={acOn ? proColor : mutedColor}>
                {acOn ? "Đang chạy" : "Tắt"}
              </text>
              {/* Airflow */}
              {acOn &&
                [0, 1, 2].map((j) => {
                  const ph = (t * 0.8 + j / 3) % 1;
                  const y = AC_BOX[1] + AC_BOX[3] + 10 + ph * 46;
                  return (
                    <path
                      key={j}
                      d={`M ${AC_BOX[0] + 70 + j * 150} ${y} q 30 -12 60 0 t 60 0`}
                      fill="none"
                      stroke="#7FB8E6"
                      strokeWidth={5}
                      strokeLinecap="round"
                      opacity={(1 - ph) * 0.8}
                    />
                  );
                })}
              {/* Beep bubble */}
              {beepK > 0.001 && (
                <g opacity={beepK} transform={`translate(${AC_BOX[0] + AC_BOX[2] - 40} ${AC_BOX[1] - 6 - 12 * (1 - beepK)})`}>
                  <rect x={-58} y={-30} width={116} height={50} rx={25} fill={accentColor} />
                  <text x={0} y={5} textAnchor="middle" fontSize={28} fontWeight={700} fill="#FFFFFF">
                    bíp!
                  </text>
                </g>
              )}
            </g>
          )}

          {/* TV */}
          {!hide.includes("tv") && (
            <g>
              <rect x={TV_BOX[0]} y={TV_BOX[1]} width={TV_BOX[2]} height={TV_BOX[3]} rx={16} fill="#1C1C1E" />
              <rect x={TV_BOX[0] + 12} y={TV_BOX[1] + 12} width={TV_BOX[2] - 24} height={TV_BOX[3] - 24} rx={8} fill={tvOn ? "url(#irTvScreen)" : "#0A0A0A"} />
              {tvOn && <polygon points={`${TV_BOX[0] + 145},${TV_BOX[1] + 80} ${TV_BOX[0] + 145},${TV_BOX[1] + 132} ${TV_BOX[0] + 190},${TV_BOX[1] + 106}`} fill="#FFFFFF" opacity={0.9} />}
              {tvFlash > 0.001 && <rect x={TV_BOX[0] + 12} y={TV_BOX[1] + 12} width={TV_BOX[2] - 24} height={TV_BOX[3] - 24} rx={8} fill="#FFFFFF" opacity={tvFlash * 0.7} />}
              <rect x={TV_BOX[0] + TV_BOX[2] / 2 - 40} y={TV_BOX[1] + TV_BOX[3]} width={80} height={14} rx={4} fill="#3A3A3C" />
              <text x={TV_BOX[0] + TV_BOX[2] / 2} y={TV_BOX[1] + TV_BOX[3] + 50} textAnchor="middle" fontSize={28} fontWeight={700} fill={textColor}>
                {tvOn ? "TV · bật" : "TV · tắt"}
              </text>
            </g>
          )}
          <defs>
            <linearGradient id="irTvScreen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2F6FD6" />
              <stop offset="1" stopColor="#5BC0EB" />
            </linearGradient>
          </defs>

          {/* ESP32-S3 board with IR receiver (left) and IR LED (right) */}
          <g>
            <rect x={ESP_BOX[0] + 4} y={ESP_BOX[1] + 10} width={ESP_BOX[2]} height={ESP_BOX[3]} rx={20} fill="rgba(16,24,40,0.12)" />
            <rect x={ESP_BOX[0]} y={ESP_BOX[1]} width={ESP_BOX[2]} height={ESP_BOX[3]} rx={20} fill="#1F2937" />
            <rect x={ESP_BOX[0] + 120} y={ESP_BOX[1] + 40} width={180} height={96} rx={10} fill="#C9CDD3" />
            <text x={ESP_BOX[0] + 210} y={ESP_BOX[1] + 97} textAnchor="middle" fontSize={30} fontWeight={700} fill="#1D1D1F">
              ESP32-S3
            </text>
            {Array.from({ length: 12 }).map((_, j) => (
              <circle key={j} cx={ESP_BOX[0] + 40 + j * 31} cy={ESP_BOX[1] + ESP_BOX[3] - 16} r={6} fill="#D4AF37" />
            ))}
            {/* Receiver dome */}
            <rect x={RX_AT[0] - 30} y={RX_AT[1] - 34} width={60} height={50} rx={10} fill="#111111" />
            <circle cx={RX_AT[0]} cy={RX_AT[1] - 14} r={16} fill={live.some((s) => s.to === "esp" && s.from === "remote" && t >= landAt(s) - 0.1) ? BEAM : "#2C2C2E"} />
            <text x={RX_AT[0]} y={RX_AT[1] - 48} textAnchor="middle" fontSize={24} fontWeight={600} fill={mutedColor}>
              Mắt thu
            </text>
            {/* IR LED */}
            <path d={`M ${LED_AT[0] - 16} ${LED_AT[1] + 4} v -28 a 16 16 0 0 1 32 0 v 28 z`} fill={live.some((s) => s.from === "esp") ? BEAM : "#B9A3C9"} />
            {live.some((s) => s.from === "esp") && <circle cx={LED_AT[0]} cy={LED_AT[1] - 26} r={30} fill={BEAM} opacity={0.18} />}
            <text x={LED_AT[0]} y={LED_AT[1] - 48} textAnchor="middle" fontSize={24} fontWeight={600} fill={mutedColor}>
              LED IR
            </text>
          </g>

          {/* Handheld: remote or phone */}
          {handheld("remote", hand === "remote" ? handK : 1 - handK)}
          {handheld("phone", hand === "phone" ? handK : 1 - handK)}

          {/* Beams on top */}
          {live.map((s, k) => beam(s, k))}
        </svg>

        {/* Pulse strips vs one RMT block */}
        {showStrips && (
          <div style={{ ...panel, opacity: stripsV, display: "flex", flexDirection: "column", gap: 10 }}>
            <svg viewBox={`0 0 1000 ${strips!.length * 130 + 80}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
              {stripBlock && (
                <g opacity={blockV}>
                  <rect x={50} y={4} width={stripBlock.symbols * symW} height={strips!.length * 130 + 10} rx={10} fill="rgba(0,102,204,0.08)" stroke={accentColor} strokeWidth={3} strokeDasharray="10 8" />
                  <text x={50 + stripBlock.symbols * symW + 14} y={strips!.length * 130 + 60} fontSize={32} fontWeight={700} fill={accentColor}>
                    {stripBlock.label}
                  </text>
                </g>
              )}
              {strips!.map((s, i) => {
                const y0 = 20 + i * 130;
                const v = pop(at(s.atSeconds, 0));
                const reveal = (s.atSeconds ?? 0) <= 0 ? 1 : interpolate(t, [s.atSeconds!, s.atSeconds! + (s.revealSeconds ?? 0.8)], [0, 1], clamp);
                const n = Math.max(0, Math.round(s.symbols * reveal));
                let d = "";
                for (let j = 0; j < n; j++) {
                  const x = 50 + j * symW;
                  const markW = symW * (j === 0 ? 0.62 : 0.32);
                  d += `M ${x} ${y0 + 70} V ${y0 + 18} H ${x + markW} V ${y0 + 70} H ${x + symW} `;
                }
                const over = stripBlock && s.symbols > stripBlock.symbols && n > stripBlock.symbols;
                const ox = 50 + (stripBlock?.symbols ?? 0) * symW;
                return (
                  <g key={i} opacity={v}>
                    <path d={d} fill="none" stroke={textColor} strokeWidth={symW < 4 ? 1.6 : 3} />
                    {over && (
                      <rect x={ox} y={y0 + 12} width={(n - stripBlock!.symbols) * symW} height={64} fill={fixK > 0.5 ? "rgba(0,102,204,0.16)" : "rgba(215,0,21,0.14)"} />
                    )}
                    <text x={50} y={y0 + 108} fontSize={32} fontWeight={700} fill={textColor}>
                      {s.label}
                      {s.sub && (
                        <tspan fontWeight={400} fill={mutedColor}>
                          {"  ·  "}
                          {s.sub}
                        </tspan>
                      )}
                    </text>
                  </g>
                );
              })}
            </svg>
            {stripFix && (
              <div style={{ fontSize: 30, fontWeight: 600, color: accentColor, opacity: fixK, textAlign: "center" }}>{stripFix.label}</div>
            )}
          </div>
        )}

        {/* Learned commands */}
        {learned && learned.length > 0 && (
          <div style={{ ...panel, opacity: pop(at(learnedAtSeconds, 0)) }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 6 }}>{learnedTitle}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
              {learned.map((l, i) => {
                const v = pop(at(l.atSeconds, 0));
                const lit = litCmd(i);
                return (
                  <div
                    key={i}
                    style={{
                      opacity: v,
                      transform: `translateY(${interpolate(v, [0, 1], [10, 0])}px)`,
                      padding: "6px 12px",
                      borderRadius: 14,
                      background: lit ? "#CFE2F8" : "transparent",
                    }}
                  >
                    <div style={{ fontSize: 30, fontWeight: 700, color: textColor, whiteSpace: "nowrap" }}>{l.name}</div>
                    {l.sub && <div style={{ fontSize: 26, color: mutedColor, whiteSpace: "nowrap" }}>{l.sub}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Status */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 600, padding: "10px 26px", borderRadius: 999, background: statusBg, color: statusInk }}>{status.text}</div>
        </div>

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
