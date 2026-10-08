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
  | "ble"
  | "bt-classic"
  | "thread"
  | "zigbee"
  | "ethernet"
  | "none";

export interface ChipSpec {
  label: string;
  value: string;
}

interface ChipSpotlightProps {
  image: string;
  chipName: string;
  tagline?: string;
  specs: ChipSpec[];
  radios?: RadioBadge[];
  /** Optional second board shown linked to the first (e.g. P4 + C6 companion). */
  companionImage?: string;
  companionLabel?: string;
  /** Seconds after cut start when the companion board appears (default 1.2). */
  companionAtSeconds?: number;
  textColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";

const RADIO_LABEL: Record<RadioBadge, string> = {
  wifi4: "Wi-Fi 4",
  wifi6: "Wi-Fi 6",
  "wifi6-5g": "Wi-Fi 6 · 5 GHz",
  ble: "Bluetooth LE",
  "bt-classic": "BT Classic",
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
  if (kind === "ble" || kind === "bt-classic") {
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
  tagline,
  specs,
  radios = [],
  companionImage,
  companionLabel,
  companionAtSeconds = 1.2,
  textColor = "#FFFFFF",
  mutedColor = "#94A3B8",
  accentColor = "#E94560",
  surfaceColor = "rgba(255,255,255,0.06)",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Portrait frames (TikTok/Reels) stack the board above the specs.
  const portrait = height > width;

  const boardIn = spring({ frame, fps, config: { damping: 16, stiffness: 90 } });
  const boardX = interpolate(boardIn, [0, 1], [-120, 0]);
  const bob = Math.sin(frame / 22) * 8;
  const glow = interpolate(boardIn, [0, 1], [0, 0.55]);

  const titleIn = spring({ frame: frame - 6, fps, config: { damping: 18 } });

  const hasCompanion = Boolean(companionImage);
  const boardWidth = portrait ? (hasCompanion ? 640 : 860) : hasCompanion ? 560 : 760;
  const boardMaxHeight = portrait ? (hasCompanion ? 460 : 640) : hasCompanion ? 420 : 640;

  return (
    <AbsoluteFill
      style={
        portrait
          ? { flexDirection: "column", alignItems: "stretch", justifyContent: "center", padding: "150px 80px 120px", gap: 40 }
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
              filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.55))",
            }}
          />
          {hasCompanion && (
            <CompanionLink
              image={companionImage!}
              label={companionLabel}
              accentColor={accentColor}
              mutedColor={mutedColor}
              delayFrames={Math.round(fps * companionAtSeconds)}
            />
          )}
        </div>
      </div>

      {/* Spec column */}
      <div style={{ flex: portrait ? "0 0 auto" : 1, display: "flex", flexDirection: "column", fontFamily: FONT }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 800,
            color: textColor,
            letterSpacing: -1,
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
        <div style={{ height: 4, width: interpolate(titleIn, [0, 1], [0, 140]), background: accentColor, borderRadius: 2, margin: "26px 0 22px" }} />

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
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                opacity: p,
                transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)`,
              }}
            >
              <div style={{ width: 230, fontSize: 26, color: mutedColor, flexShrink: 0 }}>{s.label}</div>
              <div style={{ fontSize: 38, fontWeight: 700, color: textColor }}>{s.value}</div>
            </div>
          );
        })}

        {radios.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 28 }}>
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
                    border: `1.5px solid ${isNone ? accentColor : "rgba(255,255,255,0.18)"}`,
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
      </div>
    </AbsoluteFill>
  );
};

const CompanionLink: React.FC<{
  image: string;
  label?: string;
  accentColor: string;
  mutedColor: string;
  delayFrames: number;
}> = ({ image, label, accentColor, mutedColor, delayFrames }) => {
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
        <Img src={resolveAsset(image)} style={{ width: 230, objectFit: "contain", filter: "drop-shadow(0 16px 20px rgba(0,0,0,0.5))" }} />
        {label && <div style={{ fontFamily: FONT, fontSize: 28, color: mutedColor, maxWidth: 260 }}>{label}</div>}
      </div>
    </div>
  );
};
