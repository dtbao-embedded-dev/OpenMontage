import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface RoadmapStage {
  /** Short stage title, e.g. "GPIO và gỡ lỗi". */
  title: string;
  /** Very short label for the progress strip in stage mode, e.g. "GPIO". Default: `title`. */
  short?: string;
  /** Secondary line in overview mode, e.g. "Video 6 · 10 · 11". */
  sub?: string;
  /** Overview: seconds after cut start when the row appears. */
  atSeconds?: number;
  /** Overview: seconds after cut start when the row gets its check mark. */
  doneAtSeconds?: number;
}

export interface RoadmapItem {
  text: string;
  /** Monospace second line (an example folder, a doc path). */
  path?: string;
  atSeconds?: number;
}

export interface RoadmapFocus {
  atSeconds: number;
  /** Stage index to ring in the accent colour; -1 clears the ring. */
  index: number;
}

interface RoadmapProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** "overview": vertical path start → stages → goal. "stage": progress strip + one stage's cards. */
  mode?: "overview" | "stage";
  stages: RoadmapStage[];
  /** Overview: start node above the first stage (drawn from frame 0). */
  start?: { text: string; sub?: string };
  /** Overview: goal node under the last stage. */
  goal?: { text: string; sub?: string; atSeconds?: number; reachedAtSeconds?: number };
  /** Overview: accent ring that moves between stages. */
  focus?: RoadmapFocus[];
  /** Overview: draw stages and goal faintly from frame 0, so the path is visible before each row lights up. */
  ghost?: boolean;
  /** Overview: small pills under the path ("Học gì", "Đọc ở đâu", "Dự án"). */
  legend?: RoadmapItem[];
  legendTitle?: string;
  /** Stage mode: index of the current stage (earlier ones show a check). */
  current?: number;
  /** Stage mode: what to learn (chips). */
  topics?: RoadmapItem[];
  /** Stage mode: documents and example folders. */
  docs?: RoadmapItem[];
  /** Stage mode: the stage project. */
  project?: RoadmapItem;
  /** Stage mode: series videos to watch again. */
  videos?: { items: string[]; atSeconds?: number; label?: string };
  textColor?: string;
  bodyColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  doneColor?: string;
  layout?: "safe" | "centered";
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', Consolas, monospace";
const NO_LIGATURES: React.CSSProperties = { fontVariantLigatures: "none", fontFeatureSettings: '"calt" 0, "liga" 0' };

/**
 * Learning roadmap in a light theme. Overview mode draws a vertical path from a start node through numbered stages to a
 * goal flag; stage mode shows a six-dot progress strip and one stage as cards (what to learn, where to read, the project,
 * series videos). Every item with `atSeconds` <= 0 is fully drawn on the cut's first frame.
 */
export const Roadmap: React.FC<RoadmapProps> = ({
  name,
  eyebrow,
  tagline,
  mode = "stage",
  stages,
  start,
  goal,
  focus = [],
  ghost = false,
  legend = [],
  legendTitle,
  current = 0,
  topics = [],
  docs = [],
  project,
  videos,
  textColor = "#1D1D1F",
  bodyColor = "#424245",
  mutedColor = "#5E5E63",
  accentColor = "#0066CC",
  surfaceColor = "rgba(255,255,255,0.75)",
  borderColor = "rgba(0,0,0,0.08)",
  doneColor = "#1D7A34",
  layout = "centered",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const at = (s: number | undefined, fallback = 0) => Math.round((s ?? fallback) * fps);
  const pop = (startFrame: number, damping = 16) =>
    startFrame <= 0 ? 1 : spring({ frame: frame - startFrame, fps, config: { damping, stiffness: 120 } });
  const head = pop(0, 18);

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };
  const label: React.CSSProperties = { fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: mutedColor };

  const header = (
    <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
      {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
      <div style={{ fontSize: mode === "overview" ? 92 : name.length > 16 ? 78 : 88, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
      {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 14 }}>{tagline}</div>}
    </div>
  );

  const Dot: React.FC<{ n: React.ReactNode; size: number; state: "todo" | "now" | "done"; ring?: number }> = ({ n, size, state, ring = 0 }) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 700,
        color: state === "todo" ? textColor : "#FFFFFF",
        background: state === "now" ? accentColor : state === "done" ? doneColor : "#FFFFFF",
        border: state === "todo" ? `3px solid rgba(0,0,0,0.18)` : "3px solid transparent",
        boxShadow: ring > 0 ? `0 0 0 ${8 * ring}px rgba(0,102,204,${0.22 * ring})` : "none",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {n}
    </div>
  );

  // Content stays inside the TikTok safe area (y 200-1520).
  const padding = portrait ? (layout === "centered" ? "200px 120px 400px 120px" : "200px 160px 400px 88px") : "100px 140px";
  // A row drawn as a ghost before it lights up.
  const vis = (p: number) => (ghost ? 0.28 + 0.72 * p : p);

  if (mode === "overview") {
    const DOT = 76;
    const shown = stages.map((s) => pop(at(s.atSeconds)));
    const goalP = goal ? pop(at(goal.atSeconds)) : 0;
    const goalVis = vis(goalP);
    const reached = goal?.reachedAtSeconds !== undefined ? pop(at(goal.reachedAtSeconds)) : 0;
    // Focus ring: the latest focus step at or before this frame.
    let ringIndex = -1;
    let ringStart = 0;
    for (const f of focus) {
      if (frame >= at(f.atSeconds)) {
        ringIndex = f.index;
        ringStart = at(f.atSeconds);
      }
    }
    const ringP = ringIndex >= 0 ? pop(ringStart, 14) : 0;
    const rowGap = 18;
    const connector = (p: number, done: boolean) => (
      <div style={{ width: DOT, display: "flex", justifyContent: "center", height: rowGap + 8 }}>
        <div style={{ width: 6, height: `${p * 100}%`, borderRadius: 3, background: done ? doneColor : "rgba(0,0,0,0.14)" }} />
      </div>
    );
    return (
      <AbsoluteFill style={{ fontFamily: FONT, padding, display: "flex", flexDirection: "column", justifyContent: portrait ? "center" : "flex-start", gap: 34, ...NO_LIGATURES }}>
        {header}
        <div style={{ ...card, padding: "34px 40px", display: "flex", flexDirection: "column" }}>
          {start && (
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <Dot n={"▶"} size={DOT} state="todo" />
              <div>
                <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.015em", color: textColor }}>{start.text}</div>
                {start.sub && <div style={{ fontSize: 28, letterSpacing: "0.005em", color: mutedColor, marginTop: 4 }}>{start.sub}</div>}
              </div>
            </div>
          )}
          {stages.map((s, i) => {
            const p = shown[i];
            const done = s.doneAtSeconds !== undefined && frame >= at(s.doneAtSeconds);
            const doneP = s.doneAtSeconds !== undefined ? pop(at(s.doneAtSeconds), 14) : 0;
            const isRing = ringIndex === i;
            const state = done ? "done" : isRing ? "now" : "todo";
            return (
              <React.Fragment key={s.title + i}>
                {(start || i > 0) && connector(ghost ? 1 : p, done)}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 28,
                    opacity: vis(p),
                    transform: `translateX(${interpolate(p, [0, 1], [ghost ? 0 : 30, 0])}px) scale(${done ? 1 + 0.04 * (1 - doneP) : 1})`,
                  }}
                >
                  <Dot n={done ? "✓" : i + 1} size={DOT} state={state} ring={isRing && !done ? ringP : 0} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15, color: isRing && !done ? accentColor : textColor }}>
                      {s.title}
                    </div>
                    {s.sub && <div style={{ fontSize: 28, letterSpacing: "0.005em", color: mutedColor, marginTop: 4 }}>{s.sub}</div>}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {goal && (
            <>
              {connector(ghost ? 1 : goalP, reached > 0.5)}
              <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: goalVis, transform: `translateX(${interpolate(goalP, [0, 1], [ghost ? 0 : 30, 0])}px)` }}>
                <div
                  style={{
                    width: DOT,
                    height: DOT,
                    borderRadius: 20,
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: reached > 0 ? accentColor : "#FFFFFF",
                    border: reached > 0 ? "3px solid transparent" : `3px solid ${accentColor}`,
                    boxShadow: reached > 0 ? `0 0 0 ${10 * reached}px rgba(0,102,204,${0.18 * reached})` : "none",
                  }}
                >
                  <svg width={40} height={40} viewBox="0 0 40 40">
                    <path d="M10 36 V5" stroke={reached > 0 ? "#FFFFFF" : accentColor} strokeWidth={4} strokeLinecap="round" />
                    <path d="M12 6 H32 L27 13 L32 20 H12 Z" fill={reached > 0 ? "#FFFFFF" : accentColor} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-0.02em", color: accentColor }}>{goal.text}</div>
                  {goal.sub && <div style={{ fontSize: 28, letterSpacing: "0.005em", color: mutedColor, marginTop: 4 }}>{goal.sub}</div>}
                </div>
              </div>
            </>
          )}
        </div>
        {legend.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
            {legendTitle && <div style={{ ...label, marginRight: 4, opacity: pop(at(legend[0].atSeconds)) }}>{legendTitle}</div>}
            {legend.map((l, i) => {
              const p = pop(at(l.atSeconds));
              return (
                <div
                  key={l.text + i}
                  style={{
                    ...card,
                    borderRadius: 999,
                    padding: "14px 28px",
                    fontSize: 36,
                    fontWeight: 600,
                    color: textColor,
                    opacity: p,
                    transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})`,
                  }}
                >
                  {l.text}
                </div>
              );
            })}
          </div>
        )}
      </AbsoluteFill>
    );
  }

  // ---------------------------------------------------------------- stage mode
  const STRIP_DOT = 64;
  const projP = project ? pop(at(project.atSeconds)) : 0;
  const vidP = videos ? pop(at(videos.atSeconds)) : 0;
  const firstTopic = at(topics[0]?.atSeconds);
  const firstDoc = at(docs[0]?.atSeconds);
  const section = (title: string, startFrame: number, children: React.ReactNode, extra: React.CSSProperties = {}) => {
    const p = pop(startFrame - 4, 20);
    return (
      <div style={{ ...card, padding: "24px 34px 28px", opacity: frame >= startFrame - 4 ? p : 0, transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`, ...extra }}>
        <div style={{ ...label, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT, padding, display: "flex", flexDirection: "column", justifyContent: portrait ? "center" : "flex-start", gap: 20, ...NO_LIGATURES }}>
      {/* Progress strip: done stages checked, the current one in the accent colour */}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", opacity: head }}>
        <div style={{ position: "absolute", left: STRIP_DOT / 2 + 20, right: STRIP_DOT / 2 + 20, top: STRIP_DOT / 2 - 3, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.12)" }} />
        <div
          style={{
            position: "absolute",
            left: STRIP_DOT / 2 + 20,
            top: STRIP_DOT / 2 - 3,
            height: 6,
            borderRadius: 3,
            background: doneColor,
            width: `calc((100% - ${STRIP_DOT + 40}px) * ${current / Math.max(1, stages.length - 1)})`,
          }}
        />
        {stages.map((s, i) => (
          <div key={s.title + i} style={{ width: 140, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, position: "relative" }}>
            <Dot n={i < current ? "✓" : i + 1} size={STRIP_DOT} state={i < current ? "done" : i === current ? "now" : "todo"} ring={i === current ? 1 : 0} />
            <div style={{ fontSize: 28, fontWeight: i === current ? 700 : 400, letterSpacing: "0.005em", color: i === current ? accentColor : mutedColor, whiteSpace: "nowrap" }}>
              {s.short ?? s.title}
            </div>
          </div>
        ))}
      </div>

      {header}

      {topics.length > 0 &&
        section(
          "Học gì",
          firstTopic,
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {topics.map((t, i) => {
              const p = pop(at(t.atSeconds));
              return (
                <div
                  key={t.text + i}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 999,
                    background: "#FFFFFF",
                    border: `2px solid rgba(0,0,0,0.10)`,
                    fontSize: 34,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                    color: textColor,
                    opacity: p,
                    transform: `scale(${interpolate(p, [0, 1], [0.8, 1])})`,
                  }}
                >
                  {t.text}
                </div>
              );
            })}
          </div>
        )}

      {docs.length > 0 &&
        section(
          "Đọc ở đâu",
          firstDoc,
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {docs.map((d, i) => {
              const p = pop(at(d.atSeconds));
              return (
                <div key={d.text + i} style={{ display: "flex", gap: 20, alignItems: "flex-start", opacity: p, transform: `translateX(${interpolate(p, [0, 1], [24, 0])}px)` }}>
                  <svg width={34} height={42} viewBox="0 0 34 42" style={{ flex: "0 0 auto", marginTop: 4 }}>
                    <path d="M3 3 H22 L31 12 V39 H3 Z" fill="#FFFFFF" stroke={accentColor} strokeWidth={3} strokeLinejoin="round" />
                    <path d="M22 3 V12 H31" fill="none" stroke={accentColor} strokeWidth={3} strokeLinejoin="round" />
                    <path d="M9 21 H25 M9 28 H25" stroke={accentColor} strokeWidth={3} strokeLinecap="round" />
                  </svg>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 38, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em", color: textColor }}>{d.text}</div>
                    {d.path && (
                      // Folders and file names in mono; a plain description in the body font.
                      <div style={{ fontFamily: /[/_{}]/.test(d.path) ? MONO : FONT, fontSize: 28, lineHeight: 1.35, color: bodyColor, marginTop: 4, ...NO_LIGATURES }}>
                        {d.path}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {project &&
        section(
          "Dự án của chặng",
          at(project.atSeconds),
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div
              style={{
                flex: "0 0 auto",
                width: 52,
                height: 52,
                borderRadius: 14,
                background: accentColor,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 700,
                marginTop: 2,
              }}
            >
              ✓
            </div>
            <div style={{ fontSize: 42, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.012em", color: textColor, opacity: projP }}>{project.text}</div>
          </div>,
          { border: `2px solid rgba(0,102,204,0.35)` }
        )}

      {videos && videos.items.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, opacity: vidP, transform: `translateY(${interpolate(vidP, [0, 1], [16, 0])}px)` }}>
          <div style={{ ...label, marginRight: 6 }}>{videos.label ?? "Xem lại trong series"}</div>
          {videos.items.map((v) => (
            <div key={v} style={{ padding: "8px 20px", borderRadius: 999, background: "rgba(0,102,204,0.10)", fontSize: 30, fontWeight: 600, color: accentColor }}>
              {v}
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};
