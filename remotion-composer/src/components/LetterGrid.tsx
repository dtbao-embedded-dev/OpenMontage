import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface LetterTile {
  letter: string;
  label: string;
  /** Seconds after cut start when this tile appears (sync to narration). */
  atSeconds?: number;
}

interface LetterGridProps {
  tiles: LetterTile[];
  title?: string;
  textColor?: string;
  accentColor?: string;
  surfaceColor?: string;
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";

export const LetterGrid: React.FC<LetterGridProps> = ({
  tiles,
  title,
  textColor = "#FFFFFF",
  accentColor = "#E94560",
  surfaceColor = "rgba(255,255,255,0.05)",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Portrait frames wrap the tiles into a 2x2 grid.
  const portrait = height > width;
  const tileW = portrait ? 420 : 340;
  const tileH = portrait ? 440 : 400;
  const titleIn = spring({ frame, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
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
                border: "1.5px solid rgba(255,255,255,0.12)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                opacity: p,
                transform: `translateY(${interpolate(p, [0, 1], [60, 0])}px) scale(${interpolate(p, [0, 1], [0.9, 1])})`,
              }}
            >
              <div style={{ fontSize: 200, fontWeight: 800, color: accentColor, lineHeight: 1 }}>{t.letter}</div>
              <div style={{ fontSize: 34, fontWeight: 600, color: textColor, marginTop: 24, textAlign: "center", padding: "0 20px" }}>
                {t.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
