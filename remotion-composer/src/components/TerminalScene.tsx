import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * TerminalScene — animated terminal with typed commands and scrolling output.
 *
 * Each "step" is either:
 *   { kind: "cmd", text: "git clone ...", typeSpeed?: number }  — typed char-by-char with prompt
 *   { kind: "out", text: "cloning into 'OpenMontage'..." }       — reveals instantly
 *   { kind: "pause", seconds: number }                            — silent dwell
 *   { kind: "pill", text: "Piper TTS installed", color?: string } — floating badge
 *
 * Steps execute in order at the specified durations. Terminal auto-scrolls when
 * it fills up.
 */

export type TerminalStep =
  | { kind: "cmd"; text: string; typeSpeed?: number; holdSeconds?: number }
  | { kind: "out"; text: string; holdSeconds?: number }
  | { kind: "pause"; seconds: number }
  | { kind: "pill"; text: string; color?: string; durationSeconds?: number };

interface TerminalSceneProps {
  title?: string;
  steps: TerminalStep[];
  prompt?: string;
  accentColor?: string;
  backgroundColor?: string;
  /** Body text size in px; the title bar and cursor scale with it. */
  fontSize?: number;
  /** Window height (px or CSS length); a short window suits portrait frames. */
  windowHeight?: number | string;
  /** Small label above the heading (e.g. "Bước 1/4"); with `heading` it switches to the light-theme header layout. */
  eyebrow?: string;
  /** Step heading drawn above the window, left-aligned inside the safe area. */
  heading?: string;
  eyebrowColor?: string;
  headingColor?: string;
}

interface RenderedLine {
  text: string;
  isCmd: boolean;
  startFrame: number;
  endFrame: number;  // frame at which typing completes
}

interface RenderedPill {
  text: string;
  color: string;
  startFrame: number;
  endFrame: number;
}

export const TerminalScene: React.FC<TerminalSceneProps> = ({
  title = "Terminal",
  steps,
  prompt = "$",
  accentColor = "#22D3EE",
  backgroundColor = "#0B0F1A",
  fontSize = 26,
  windowHeight = "80%",
  eyebrow,
  heading,
  eyebrowColor = "#0066CC",
  headingColor = "#1D1D1F",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const hasHeader = Boolean(eyebrow || heading);

  // Lay out timing in frames
  const lines: RenderedLine[] = [];
  const pills: RenderedPill[] = [];
  let cursorFrame = 0;

  for (const step of steps) {
    if (step.kind === "cmd") {
      const speed = step.typeSpeed ?? 0.035; // seconds per char
      const typeFrames = Math.ceil(step.text.length * speed * fps);
      const hold = Math.ceil((step.holdSeconds ?? 0.3) * fps);
      lines.push({
        text: step.text,
        isCmd: true,
        startFrame: cursorFrame,
        endFrame: cursorFrame + typeFrames,
      });
      cursorFrame += typeFrames + hold;
    } else if (step.kind === "out") {
      const revealFrames = Math.max(2, Math.ceil(0.08 * fps));
      const hold = Math.ceil((step.holdSeconds ?? 0.15) * fps);
      lines.push({
        text: step.text,
        isCmd: false,
        startFrame: cursorFrame,
        endFrame: cursorFrame + revealFrames,
      });
      cursorFrame += revealFrames + hold;
    } else if (step.kind === "pause") {
      cursorFrame += Math.ceil(step.seconds * fps);
    } else if (step.kind === "pill") {
      const dur = Math.ceil((step.durationSeconds ?? 2.2) * fps);
      pills.push({
        text: step.text,
        color: step.color ?? accentColor,
        startFrame: cursorFrame,
        endFrame: cursorFrame + dur,
      });
      // pill is non-blocking — don't advance cursor
    }
  }

  // Only render lines that have started
  const visibleLines = lines.filter(l => frame >= l.startFrame);

  // Auto-scroll: keep last N lines in view
  const MAX_VISIBLE = 18;
  const scrollStart = Math.max(0, visibleLines.length - MAX_VISIBLE);
  const renderedLines = visibleLines.slice(scrollStart);

  // Cursor blinks on most recent command
  const blinkPhase = Math.floor(frame / (fps * 0.55)) % 2 === 0;

  // Terminal window frame fade-in
  const windowOpacity = spring({ frame, fps, config: { damping: 25, stiffness: 100 } });

  return (
    <AbsoluteFill
      style={{
        background: backgroundColor,
        justifyContent: hasHeader ? "flex-start" : "center",
        alignItems: hasHeader ? "flex-start" : "center",
        // Header layout keeps everything inside the TikTok safe area (top 220, left 88, right rail >= 160 px).
        padding: hasHeader ? (portrait ? "220px 160px 0 88px" : "110px") : "80px",
        fontFamily: "'JetBrains Mono', 'Consolas', 'Monaco', monospace",
      }}
    >
      {hasHeader && (
        <div
          style={{
            fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
            marginBottom: 40,
            opacity: windowOpacity,
            transform: `translateY(${interpolate(windowOpacity, [0, 1], [16, 0])}px)`,
          }}
        >
          {eyebrow && (
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: eyebrowColor, marginBottom: 8 }}>
              {eyebrow}
            </div>
          )}
          {heading && (
            <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.08, color: headingColor }}>
              {heading}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          width: hasHeader ? "100%" : "85%",
          maxWidth: 1600,
          height: windowHeight,
          opacity: windowOpacity,
          transform: `scale(${interpolate(windowOpacity, [0, 1], [0.97, 1])})`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: hasHeader
            ? "0 24px 60px rgba(0,0,0,0.18), 0 0 1px rgba(255,255,255,0.2) inset"
            : "0 40px 120px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.2) inset",
          background: "#12151F",
          position: "relative",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 18px",
            background: "#1A1F2E",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F56" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#FFBD2E" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#27C93F" }} />
          <div
            style={{
              flex: 1,
              textAlign: "center",
              color: "#8E8E93",
              fontSize: Math.round(fontSize * 0.62),
              fontFamily: "Inter, sans-serif",
            }}
          >
            {title}
          </div>
        </div>

        {/* Terminal body */}
        <div
          style={{
            padding: "32px 40px",
            fontSize,
            lineHeight: 1.55,
            color: "#E5E7EB",
            height: "calc(100% - 46px)",
            overflow: "hidden",
          }}
        >
          {renderedLines.map((line, idx) => {
            if (line.isCmd) {
              // Char-by-char typed command
              const progress = interpolate(
                frame,
                [line.startFrame, line.endFrame],
                [0, line.text.length],
                { extrapolateRight: "clamp" }
              );
              const typed = line.text.slice(0, Math.floor(progress));
              const isLatest = idx === renderedLines.length - 1;
              const isActive = frame <= line.endFrame + fps * 0.2;
              return (
                <div key={`${line.startFrame}-${idx}`} style={{ display: "flex", alignItems: "baseline" }}>
                  <span style={{ color: accentColor, marginRight: 12, fontWeight: 600 }}>{prompt}</span>
                  <span style={{ color: "#F1F5F9" }}>{typed}</span>
                  {isLatest && isActive && blinkPhase && (
                    <span
                      style={{
                        display: "inline-block",
                        width: Math.round(fontSize * 0.46),
                        height: fontSize,
                        background: "#F1F5F9",
                        marginLeft: 2,
                        transform: "translateY(4px)",
                      }}
                    />
                  )}
                </div>
              );
            } else {
              // Instant-reveal output line with fade-in
              const alpha = interpolate(
                frame,
                [line.startFrame, line.endFrame],
                [0, 1],
                { extrapolateRight: "clamp" }
              );
              return (
                <div
                  key={`${line.startFrame}-${idx}`}
                  style={{ color: "#9CA3AF", opacity: alpha, paddingLeft: 4 }}
                >
                  {line.text}
                </div>
              );
            }
          })}
        </div>

        {/* Floating command pills */}
        {pills
          .filter(p => frame >= p.startFrame && frame <= p.endFrame)
          .map((pill, idx) => {
            const lifeProgress = (frame - pill.startFrame) / Math.max(1, pill.endFrame - pill.startFrame);
            // spring in (0 → 1), hold, spring out (0.8 → 1.0)
            const inAlpha = spring({
              frame: frame - pill.startFrame,
              fps,
              config: { damping: 14, stiffness: 180 },
              durationInFrames: Math.ceil(fps * 0.35),
            });
            const outAlpha =
              lifeProgress > 0.82
                ? interpolate(lifeProgress, [0.82, 1], [1, 0], { extrapolateRight: "clamp" })
                : 1;
            const alpha = Math.min(inAlpha, outAlpha);
            const translateY = interpolate(inAlpha, [0, 1], [14, 0]);
            return (
              <div
                key={`${pill.startFrame}-${idx}`}
                style={{
                  position: "absolute",
                  top: 28 + idx * (hasHeader ? 78 : 62),
                  right: 32,
                  padding: "12px 20px",
                  background: pill.color,
                  color: "#0B0F1A",
                  borderRadius: 999,
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 700,
                  fontSize: hasHeader ? 30 : 20,
                  letterSpacing: 0.2,
                  opacity: alpha,
                  transform: `translateY(${translateY}px)`,
                  boxShadow: `0 10px 30px ${pill.color}40`,
                }}
              >
                {pill.text}
              </div>
            );
          })}
      </div>
    </AbsoluteFill>
  );
};
