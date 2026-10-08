import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { resolveAsset } from "../lib/resolveAsset";

export type RadioBadge =
  | "wifi4"
  | "wifi6"
  | "wifi6-5g"
  | "wifi6e"
  | "ble"
  | "bt-classic"
  | "le-audio"
  | "thread"
  | "zigbee"
  | "ethernet"
  | "none";

export interface ChipSpec {
  label: string;
  value: string;
  /** Draw this value in the accent colour (the one key stat of the frame). */
  highlight?: boolean;
}

interface ChipSpotlightProps {
  image: string;
  chipName: string;
  /** Small accent label above the chip name (e.g. the chip family). */
  eyebrow?: string;
  tagline?: string;
  specs: ChipSpec[];
  radios?: RadioBadge[];
  /** One-line "best for" statement shown under the radio badges. */
  bestFor?: string;
  /** Optional second board shown linked to the first (e.g. P4 + C6 companion). */
  companionImage?: string;
  companionLabel?: string;
  /** Seconds after cut start when the companion board appears (default 1.2). */
  companionAtSeconds?: number;
  textColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  /** Spec-row dividers and badge borders; dark-theme default is a faint white line. */
  dividerColor?: string;
  /** Opacity of the board drop shadow (dark default 0.55; use ~0.18 on light backgrounds). */
  shadowOpacity?: number;
  /** Hide the accent radial glow behind the board. */
  hideGlow?: boolean;
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";

const RADIO_LABEL: Record<RadioBadge, string> = {
  wifi4: "Wi-Fi 4",
  wifi6: "Wi-Fi 6",
  "wifi6-5g": "Wi-Fi 6 · 2.4 + 5 GHz",
  wifi6e: "Wi-Fi 6E · 2.4/5/6 GHz",
  ble: "Bluetooth LE",
  "bt-classic": "BT Classic",
  "le-audio": "LE Audio",
  thread: "Thread",
  zigbee: "Zigbee",
  ethernet: "Ethernet",
  none: "Không có radio",
};

const RadioIcon: React.FC<{ kind: RadioBadge; color: string }> = ({ kind, color }) => {
  const common = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const };
  if (kind.startsWith("wifi")) {
    return (
      <svg {...common}>
        <path d="M2 9a15 15 0 0 1 20 0" />
        <path d="M5 12.5a10 10 0 0 1 14 0" />
        <path d="M8.5 16a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19.5" r="1.2" fill={color} />
      </svg>
    );
  }
  if (kind === "ble" || kind === "bt-classic" || kind === "le-audio") {
    return (
      <svg {...common}>
        <path d="M7 7l10 10-5 5V2l5 5L7 17" />
      </svg>
    );
  }
  if (kind === "thread" || kind === "zigbee") {
    // Mesh: three linked nodes.
    return (
      <svg {...common}>
        <circle cx="5" cy="17" r="2.5" />
        <circle cx="19" cy="17" r="2.5" />
        <circle cx="12" cy="5" r="2.5" />
        <path d="M7.5 17h9M6.3 14.8l4.4-7.6M17.7 14.8l-4.4-7.6" />
      </svg>
    );
  }
  if (kind === "ethernet") {
    return (
      <svg {...common}>
        <rect x="4" y="6" width="16" height="12" rx="1.5" />
        <path d="M8 18v-4M12 18v-4M16 18v-4" />
      </svg>
    );
  }
  // none: crossed-out antenna
  return (
    <svg {...common}>
      <path d="M12 21V9" />
      <path d="M8 5a6 6 0 0 1 8 0" />
      <path d="M3 3l18 18" />
    </svg>
  );
};

export const ChipSpotlight: React.FC<ChipSpotlightProps> = ({
  image,
  chipName,
  eyebrow,
  tagline,
  specs,
  radios = [],
  bestFor,
  companionImage,
  companionLabel,
  companionAtSeconds = 1.2,
  textColor = "#FFFFFF",
  mutedColor = "#94A3B8",
  accentColor = "#E94560",
  surfaceColor = "rgba(255,255,255,0.06)",
  dividerColor = "rgba(255,255,255,0.08)",
  shadowOpacity = 0.55,
  hideGlow = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Portrait frames (TikTok/Reels) stack the board above the specs.
  const portrait = height > width;

  const boardIn = spring({ frame, fps, config: { damping: 16, stiffness: 90 } });
  const boardX = interpolate(boardIn, [0, 1], [-120, 0]);
  const bob = Math.sin(frame / 22) * 8;
  const glow = hideGlow ? 0 : interpolate(boardIn, [0, 1], [0, 0.55]);

  const titleIn = spring({ frame: frame - 6, fps, config: { damping: 18 } });

  const hasCompanion = Boolean(companionImage);
  // One label column for every row, wide enough for the longest label (~0.56 em per Inter glyph at 28 px) plus a gap.
  const labelWidth = Math.max(portrait ? 150 : 230, Math.ceil(Math.max(...specs.map((s) => s.label.length)) * 28 * 0.56) + 20);
  const boardWidth = portrait ? (hasCompanion ? 600 : 800) : hasCompanion ? 560 : 760;
  const boardMaxHeight = portrait ? (hasCompanion ? 380 : 520) : hasCompanion ? 420 : 640;

  return (
    <AbsoluteFill
      style={
        portrait
          ? // Keep content inside the TikTok safe area (y 220-1520, right rail >= 160 px).
            { flexDirection: "column", alignItems: "stretch", justifyContent: "center", padding: "220px 160px 400px 88px", gap: 36 }
          : { flexDirection: "row", alignItems: "center", padding: "0 110px", gap: 70 }
      }
    >
      {/* Board column */}
      <div
        style={{
          flex: portrait ? "0 0 auto" : "0 0 48%",
          height: portrait ? undefined : "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: boardWidth * 0.9,
            height: boardWidth * 0.9,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accentColor}55 0%, transparent 65%)`,
            opacity: glow,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <Img
            src={resolveAsset(image)}
            style={{
              width: boardWidth,
              maxHeight: boardMaxHeight,
              objectFit: "contain",
              transform: `translate(${boardX}px, ${bob}px)`,
              opacity: boardIn,
              filter: `drop-shadow(0 30px 40px rgba(0,0,0,${shadowOpacity}))`,
            }}
          />
          {hasCompanion && (
            <CompanionLink
              image={companionImage!}
              label={companionLabel}
              accentColor={accentColor}
              mutedColor={mutedColor}
              shadowOpacity={shadowOpacity}
              delayFrames={Math.round(fps * companionAtSeconds)}
            />
          )}
        </div>
      </div>

      {/* Spec column */}
      <div style={{ flex: portrait ? "0 0 auto" : 1, display: "flex", flexDirection: "column", fontFamily: FONT }}>
        {eyebrow && (
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 8, opacity: titleIn }}>
            {eyebrow}
          </div>
        )}
        <div
          style={{
            fontSize: portrait ? 96 : 76,
            fontWeight: 800,
            color: textColor,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            opacity: titleIn,
            transform: `translateY(${interpolate(titleIn, [0, 1], [24, 0])}px)`,
          }}
        >
          {chipName}
        </div>
        {tagline && (
          <div style={{ fontSize: 32, color: accentColor, fontWeight: 600, marginTop: 6, opacity: titleIn }}>
            {tagline}
          </div>
        )}
        <div style={{ height: 4, width: interpolate(titleIn, [0, 1], [0, 140]), background: accentColor, borderRadius: 2, margin: "22px 0 14px" }} />

        {specs.map((s, i) => {
          const p = spring({ frame: frame - 14 - i * 7, fps, config: { damping: 18 } });
          return (
            <div
              key={s.label + i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 22,
                padding: "12px 0",
                borderBottom: `1px solid ${dividerColor}`,
                opacity: p,
                transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)`,
              }}
            >
              <div style={{ width: labelWidth, fontSize: 28, color: mutedColor, flexShrink: 0 }}>{s.label}</div>
              <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.01em", color: s.highlight ? accentColor : textColor }}>{s.value}</div>
            </div>
          );
        })}

        {radios.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
            {radios.map((r, i) => {
              const p = spring({ frame: frame - 14 - specs.length * 7 - i * 5, fps, config: { damping: 14 } });
              const isNone = r === "none";
              return (
                <div
                  key={r}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 18px",
                    borderRadius: 999,
                    background: isNone ? `${accentColor}22` : surfaceColor,
                    border: `1.5px solid ${isNone ? accentColor : dividerColor}`,
                    color: isNone ? accentColor : textColor,
                    fontSize: 26,
                    fontWeight: 600,
                    opacity: p,
                    transform: `scale(${interpolate(p, [0, 1], [0.7, 1])})`,
                  }}
                >
                  <RadioIcon kind={r} color={isNone ? accentColor : textColor} />
                  {RADIO_LABEL[r]}
                </div>
              );
            })}
          </div>
        )}

        {bestFor && (() => {
          const p = spring({ frame: frame - 20 - specs.length * 7 - radios.length * 5, fps, config: { damping: 18 } });
          return (
            <div style={{ marginTop: 26, fontSize: 40, lineHeight: 1.4, color: textColor, opacity: p }}>
              <span style={{ color: mutedColor, fontSize: 30 }}>Phù hợp: </span>
              {bestFor}
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};

const CompanionLink: React.FC<{
  image: string;
  label?: string;
  accentColor: string;
  mutedColor: string;
  shadowOpacity: number;
  delayFrames: number;
}> = ({ image, label, accentColor, mutedColor, shadowOpacity, delayFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delayFrames, fps, config: { damping: 16 } });
  // Dashed link "flows" downward to suggest data moving between the two boards.
  const dashOffset = -frame * 1.5;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: p }}>
      <svg width="12" height="60">
        <line x1="6" y1="0" x2="6" y2="60" stroke={accentColor} strokeWidth="4" strokeDasharray="8 7" strokeDashoffset={dashOffset} />
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 24, transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)` }}>
        <Img src={resolveAsset(image)} style={{ width: 230, objectFit: "contain", filter: `drop-shadow(0 16px 20px rgba(0,0,0,${shadowOpacity * 0.9}))` }} />
        {label && <div style={{ fontFamily: FONT, fontSize: 28, color: mutedColor, maxWidth: 260 }}>{label}</div>}
      </div>
    </div>
  );
};
