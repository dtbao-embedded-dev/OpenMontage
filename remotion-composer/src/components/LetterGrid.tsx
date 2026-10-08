import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface LetterTile {
  letter: string;
  label: string;
  /** Seconds after cut start when this tile appears (sync to narration). */
  atSeconds?: number;
  /** Letter colour for this tile; defaults to the accent colour. */
  color?: string;
}

interface LetterGridProps {
  tiles: LetterTile[];
  title?: string;
  textColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  /** Tile border; dark-theme default is a faint white line. */
  borderColor?: string;
  mutedColor?: string;
  /** Closing line shown under the grid (e.g. a call to action). */
  footer?: string;
  footerAtSeconds?: number;
  /** Portrait layout: "safe" (default) pads into the TikTok safe area; "centered" centres on the frame
   *  with even 120 px side margins. */
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";

export const LetterGrid: React.FC<LetterGridProps> = ({
  tiles,
  title,
  textColor = "#FFFFFF",
  accentColor = "#E94560",
  surfaceColor = "rgba(255,255,255,0.05)",
  borderColor = "rgba(255,255,255,0.12)",
  mutedColor = "#94A3B8",
  footer,
  footerAtSeconds,
  layout = "safe",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Portrait frames wrap the tiles into two columns; more than four tiles get
  // shorter tiles so three rows still fit the TikTok safe area (y 220-1520).
  const portrait = height > width;
  const dense = portrait && tiles.length > 4;
  const tileW = portrait ? (dense ? 380 : 390) : 340;
  const tileH = portrait ? (dense ? 300 : 440) : 400;
  const letterSize = dense ? 130 : 200;
  // Longer "letters" (e.g. "ESP32", "16 MB") shrink to fit the tile width;
  // 0.62 em is a safe average glyph width for Inter ExtraBold; W and M run ~0.95 em.
  const textEm = (text: string) => Math.max([...text].reduce((em, c) => em + (/[WMwm]/.test(c) ? 0.95 : 0.62), 0), 0.62);
  const fitSize = (text: string) => Math.min(letterSize, Math.floor((tileW - 48) / textEm(text)));
  const titleIn = spring({ frame, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", fontFamily: FONT, padding: portrait ? (layout === "centered" ? "0 120px" : "220px 160px 400px 88px") : undefined }}
    >
      {title && (
        <div style={{ fontSize: 44, fontWeight: 700, color: textColor, marginBottom: 56, opacity: titleIn }}>
          {title}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 40, maxWidth: portrait ? tileW * 2 + 40 : undefined }}>
        {tiles.map((t, i) => {
          const start = t.atSeconds !== undefined ? Math.round(t.atSeconds * fps) : 6 + i * 8;
          const p = spring({ frame: frame - start, fps, config: { damping: 13, stiffness: 110 } });
          return (
            <div
              key={t.letter + i}
              style={{
                width: tileW,
                height: tileH,
                borderRadius: 28,
                background: surfaceColor,
                border: `1.5px solid ${borderColor}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                opacity: p,
                transform: `translateY(${interpolate(p, [0, 1], [60, 0])}px) scale(${interpolate(p, [0, 1], [0.9, 1])})`,
              }}
            >
              <div style={{ fontSize: fitSize(t.letter), fontWeight: 800, letterSpacing: "-0.02em", color: t.color ?? accentColor, lineHeight: 1 }}>{t.letter}</div>
              <div style={{ fontSize: 34, fontWeight: 600, color: textColor, marginTop: 24, textAlign: "center", padding: "0 20px" }}>
                {t.label}
              </div>
            </div>
          );
        })}
      </div>
      {footer && (() => {
        const start = footerAtSeconds !== undefined ? Math.round(footerAtSeconds * fps) : 6 + tiles.length * 8;
        const p = spring({ frame: frame - start, fps, config: { damping: 18 } });
        return (
          <div style={{ marginTop: 44, fontSize: 40, fontWeight: 600, color: mutedColor, opacity: p, textAlign: "center" }}>
            {footer}
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};
