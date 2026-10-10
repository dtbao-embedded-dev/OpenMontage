import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveAsset } from "../lib/resolveAsset";
import type { CodePoint } from "./CodeCompare";

export interface MatrixBoard {
  /** Board name under the photo, e.g. "ESP32-S3 DevKit". */
  name: string;
  /** Small line under the name, e.g. the chip. */
  sub?: string;
  /** Photo in `public/` (transparent PNG preferred). */
  image: string;
  /** Seconds after cut start when the board slides in; 0 or unset = drawn from the first frame. */
  atSeconds?: number;
}

export type MatrixTone = "neutral" | "good" | "bad" | "accent" | "muted";

export interface MatrixCell {
  text: string;
  tone?: MatrixTone;
  /** Seconds after cut start when this cell appears; default: with its row. */
  atSeconds?: number;
}

export interface MatrixRow {
  /** Row heading, e.g. "CPU". */
  label: string;
  /** One cell per board, same order as `boards`. */
  cells: MatrixCell[];
  atSeconds?: number;
}

export interface MatrixFocus {
  atSeconds: number;
  /** Index of the board to lift (others dim); null clears the focus. */
  board: number | null;
}

export interface MatrixVerdict {
  board: number;
  text: string;
  tone?: MatrixTone;
  atSeconds?: number;
}

interface BoardMatrixProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  boards: MatrixBoard[];
  rows?: MatrixRow[];
  focus?: MatrixFocus[];
  verdicts?: MatrixVerdict[];
  /** Photo box height in px (default 300). */
  imageHeight?: number;
  /** Caption-style source line under the rows. */
  source?: string;
  sourceAtSeconds?: number;
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
const FADE = 9; // frames for a focus change

/**
 * Side-by-side board comparison: real board photos in columns, spec rows whose cells line up under each board,
 * a focus track that lifts one board and dims the others, verdict pills and pro/con rows under the matrix.
 * Boards without `atSeconds` are drawn from the first frame, so consecutive cuts keep the same boards on screen.
 */
export const BoardMatrix: React.FC<BoardMatrixProps> = ({
  name,
  eyebrow,
  tagline,
  boards,
  rows = [],
  focus = [],
  verdicts = [],
  imageHeight = 300,
  source,
  sourceAtSeconds,
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
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  const pop = (start: number, damping = 16) =>
    start <= 0 ? 1 : spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });
  const toneColor = (t: MatrixTone | undefined) =>
    t === "good" ? proColor : t === "bad" ? conColor : t === "accent" ? accentColor : t === "muted" ? mutedColor : textColor;

  // Focus weight per board (0..1): 1 = lifted, the others dim while any board is focused.
  const steps = [...focus].sort((a, b) => a.atSeconds - b.atSeconds);
  const weightOf = (idx: number) => {
    let w = 0; // focus amount of this board
    let any = 0; // amount of "some board is focused"
    let prevW = 0;
    let prevAny = 0;
    for (const s of steps) {
      const f0 = Math.round(s.atSeconds * fps);
      if (frame < f0) break;
      const k = f0 <= 0 ? 1 : interpolate(frame, [f0, f0 + FADE], [0, 1], { extrapolateRight: "clamp" });
      const tw = s.board === idx ? 1 : 0;
      const ta = s.board === null ? 0 : 1;
      w = prevW + (tw - prevW) * k;
      any = prevAny + (ta - prevAny) * k;
      prevW = w;
      prevAny = any;
    }
    return { w, any };
  };

  const head = pop(0, 18);
  const colGap = 24;
  const src = pop(at(sourceAtSeconds, (rows[0]?.atSeconds ?? 0.3) + 0.2));
  const lastRowStart = rows.length ? at(rows[rows.length - 1].atSeconds, 0.3) : 0;

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        fontVariantLigatures: "none",
        padding: portrait ? (layout === "centered" ? "230px 100px 300px 100px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 34,
      }}
    >
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && (
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>
        )}
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
      </div>

      {/* Matrix card */}
      <div
        style={{
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 36,
          boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
          padding: "30px 26px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Boards */}
        <div style={{ display: "flex", gap: colGap }}>
          {boards.map((b, i) => {
            const p = pop(at(b.atSeconds, 0));
            const { w, any } = weightOf(i);
            const dim = 1 - 0.62 * any * (1 - w);
            const lift = 1 + 0.06 * w;
            const verdict = verdicts.find((v) => v.board === i);
            const vp = verdict ? pop(at(verdict.atSeconds, 0.3)) : 0;
            return (
              <div
                key={b.name + i}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [50, 0])}px) scale(${lift})`,
                  transformOrigin: "50% 60%",
                }}
              >
                <div style={{ opacity: dim, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div
                  style={{
                    height: imageHeight,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 26,
                    background: w > 0.01 ? `rgba(0,102,204,${0.07 * w})` : "transparent",
                    boxShadow: w > 0.01 ? `inset 0 0 0 ${3 * w}px rgba(0,102,204,${0.55 * w})` : "none",
                  }}
                >
                  <Img
                    src={resolveAsset(b.image)}
                    style={{
                      maxHeight: imageHeight - 24,
                      maxWidth: "92%",
                      objectFit: "contain",
                      filter: "drop-shadow(0 14px 18px rgba(0,0,0,0.18))",
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 16,
                    fontSize: 36,
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
                    lineHeight: 1.15,
                    color: w > 0.5 ? accentColor : textColor,
                    textAlign: "center",
                  }}
                >
                  {b.name}
                </div>
                {b.sub && (
                  <div style={{ marginTop: 6, fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, textAlign: "center" }}>
                    {b.sub}
                  </div>
                )}
                </div>
                {verdict && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "10px 18px",
                      borderRadius: 999,
                      background: toneColor(verdict.tone ?? "accent"),
                      color: "#FFFFFF",
                      fontSize: 28,
                      fontWeight: 600,
                      lineHeight: 1.25,
                      textAlign: "center",
                      opacity: vp,
                      transform: `scale(${interpolate(vp, [0, 1], [0.8, 1])})`,
                    }}
                  >
                    {verdict.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Spec rows: the label spans the card, cells line up under the boards */}
        {rows.map((r, ri) => {
          const firstCell = Math.min(...r.cells.map((c) => c.atSeconds ?? Infinity));
          const rowStart = at(r.atSeconds ?? (Number.isFinite(firstCell) ? firstCell : undefined), 0.4 + ri * 0.5);
          const p = pop(rowStart);
          return (
            <div
              key={r.label + ri}
              style={{
                borderTop: `2px solid ${borderColor}`,
                paddingTop: 14,
                opacity: p,
                transform: `translateY(${interpolate(p, [0, 1], [18, 0])}px)`,
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "0.005em", color: mutedColor, marginBottom: 6 }}>{r.label}</div>
              <div style={{ display: "flex", gap: colGap }}>
                {r.cells.map((c, ci) => {
                  const { w, any } = weightOf(ci);
                  const cp = c.atSeconds === undefined ? 1 : pop(at(c.atSeconds, 0));
                  return (
                    <div
                      key={ci}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "center",
                        fontSize: 36,
                        fontWeight: 700,
                        letterSpacing: "-0.015em",
                        lineHeight: 1.2,
                        color: toneColor(c.tone),
                        opacity: cp * (1 - 0.62 * any * (1 - w)),
                        transform: `translateY(${interpolate(cp, [0, 1], [14, 0])}px)`,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {c.text}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {source && (
          <div
            style={{
              fontSize: 28,
              fontWeight: 400,
              letterSpacing: "0.005em",
              lineHeight: 1.35,
              color: mutedColor,
              opacity: frame >= lastRowStart ? src : 0,
            }}
          >
            {source}
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
