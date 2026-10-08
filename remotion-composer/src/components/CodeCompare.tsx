import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface CodePoint {
  /** "pro" draws a green check, "con" a red cross, "info" an accent dot. */
  kind: "pro" | "con" | "info";
  text: string;
  /** Seconds after cut start when this row appears (sync to narration). */
  atSeconds?: number;
}

export interface CodeLayer {
  label: string;
  /** Small secondary text on the right of the bar (e.g. a version). */
  detail?: string;
  /** Draw the bar filled with the accent colour (the foundation layer). */
  highlight?: boolean;
  atSeconds?: number;
}

interface CodeCompareProps {
  /** Framework / language name, the big title of the frame. */
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** Code shown in a light editor window; omit when using `layers`. */
  code?: string[];
  /** Label in the editor title bar (e.g. a file name). */
  codeTitle?: string;
  /** Seconds after cut start when the code starts typing in (default 0.3). */
  codeAtSeconds?: number;
  /** Seconds the code takes to appear line by line (default 1.2). */
  codeRevealSeconds?: number;
  /** Stacked layer diagram drawn instead of code, listed top to bottom. */
  layers?: CodeLayer[];
  points?: CodePoint[];
  textColor?: string;
  bodyColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  proColor?: string;
  conColor?: string;
  codeFontSize?: number;
  /** Portrait layout: "safe" (default) pads into the TikTok safe area; "centered" uses even 120 px side margins. */
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

/** Light syntax colouring: comments, strings, numbers, keywords. Enough for short C / C++ / Python snippets. */
const KEYWORDS = new Set([
  "void", "int", "static", "const", "return", "include", "from", "import", "def", "while", "for", "if", "else",
  "True", "False", "None", "struct", "uint8_t",
]);

function colourise(line: string, ink: string, accent: string, muted: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\/\/.*$|#(?!include).*$|"[^"]*"|'[^']*'|\b\d+\b|[A-Za-z_][A-Za-z0-9_]*|\s+|.)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(line)) !== null) {
    const tok = m[0];
    let color = ink;
    let weight = 400;
    if (tok.startsWith("//") || (tok.startsWith("#") && !tok.startsWith("#include"))) color = muted;
    else if (tok.startsWith('"') || tok.startsWith("'")) color = "#A3361F";
    else if (/^\d+$/.test(tok)) color = "#7A4BC2";
    else if (KEYWORDS.has(tok)) {
      color = accent;
      weight = 600;
    }
    out.push(
      <span key={i++} style={{ color, fontWeight: weight }}>
        {tok}
      </span>
    );
  }
  return out;
}

export const CodeCompare: React.FC<CodeCompareProps> = ({
  name,
  eyebrow,
  tagline,
  code,
  codeTitle,
  codeAtSeconds = 0.3,
  codeRevealSeconds = 1.2,
  layers,
  points = [],
  textColor = "#1D1D1F",
  bodyColor = "#424245",
  mutedColor = "#5E5E63",
  accentColor = "#0066CC",
  surfaceColor = "rgba(255,255,255,0.75)",
  borderColor = "rgba(0,0,0,0.08)",
  proColor = "#1D7A34",
  conColor = "#D70015",
  codeFontSize = 27,
  layout = "safe",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const at = (s: number | undefined, fallback: number) => Math.round((s ?? fallback) * fps);
  const pop = (start: number, damping = 16) => spring({ frame: frame - start, fps, config: { damping, stiffness: 120 } });

  const head = pop(0, 18);
  const card = pop(at(codeAtSeconds, 0.3) - 6, 20);
  const codeStart = at(codeAtSeconds, 0.3);
  const lines = code ?? [];
  const perLine = lines.length > 0 ? (codeRevealSeconds * fps) / lines.length : 0;

  const cardStyle: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
    overflow: "hidden",
  };

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "230px 120px 300px 120px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        // Centred in the safe area; hidden rows keep their space, so nothing shifts as they appear.
        justifyContent: portrait ? "center" : "flex-start",
        gap: 34,
      }}
    >
      {/* Heading */}
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && (
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>
            {eyebrow}
          </div>
        )}
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && (
          <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>
        )}
      </div>

      {/* Code window */}
      {lines.length > 0 && (
        <div style={{ ...cardStyle, opacity: card, transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: `2px solid ${borderColor}` }}>
            {["#FF5F56", "#FFBD2E", "#27C93F"].map((c) => (
              <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />
            ))}
            {codeTitle && (
              <div style={{ marginLeft: 14, fontSize: 26, fontFamily: MONO, color: mutedColor }}>{codeTitle}</div>
            )}
          </div>
          <div style={{ padding: "20px 28px 24px", fontFamily: MONO, fontSize: codeFontSize, lineHeight: 1.45, whiteSpace: "pre" }}>
            {lines.map((ln, i) => {
              const p = interpolate(frame - codeStart - i * perLine, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ opacity: p, transform: `translateX(${interpolate(p, [0, 1], [-12, 0])}px)`, minHeight: codeFontSize * 1.45 }}>
                  {colourise(ln, textColor, accentColor, mutedColor)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Layer diagram */}
      {layers && layers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {layers.map((l, i) => {
            const p = pop(at(l.atSeconds, 0.3 + i * 0.4));
            return (
              <div
                key={l.label + i}
                style={{
                  ...cardStyle,
                  background: l.highlight ? accentColor : surfaceColor,
                  padding: "26px 34px",
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 20,
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [-30, 0])}px)`,
                }}
              >
                <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.015em", color: l.highlight ? "#FFFFFF" : textColor }}>{l.label}</div>
                {l.detail && (
                  <div style={{ fontSize: 30, fontWeight: 500, color: l.highlight ? "rgba(255,255,255,0.9)" : mutedColor, textAlign: "right" }}>
                    {l.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pros / cons */}
      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {points.map((pt, i) => {
            const p = pop(at(pt.atSeconds, 1.5 + i * 0.6));
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div
                key={pt.text + i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 20,
                  opacity: p,
                  transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)`,
                }}
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
