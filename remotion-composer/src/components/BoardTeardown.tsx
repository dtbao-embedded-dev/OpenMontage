import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveAsset } from "../lib/resolveAsset";

/** A rectangle in the image's natural pixel coordinates. */
export interface BoardRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TeardownSpot {
  /** Seconds after cut start when the camera moves to this spot (sync to narration). */
  atSeconds: number;
  /** Part to frame and outline; omit for a whole-board overview. */
  region?: BoardRegion;
  /** Area the camera frames instead of `region` (natural px), e.g. to keep the board body in view
   *  around a pin on the edge; the outline is still drawn around `region`. */
  focus?: BoardRegion;
  /** Zoom relative to the fitted board; default fits the region into ~70% of the viewport. */
  zoom?: number;
  eyebrow?: string;
  name: string;
  detail?: string;
  /** Short status line under the detail. */
  note?: string;
  noteTone?: "good" | "bad";
  /** Light a glow that toggles on/off, like a blinking LED (starts "on" at the spot). It centres on `blink.region`
   *  (the LED body itself, natural px) or on the spot region when omitted. */
  blink?: { color?: string; periodSeconds?: number; region?: BoardRegion };
}

interface BoardTeardownProps {
  image: string;
  /** Natural pixel size of `image`; regions are given in these coordinates. */
  imageSize: { width: number; height: number };
  spots: TeardownSpot[];
  textColor?: string;
  bodyColor?: string;
  mutedColor?: string;
  accentColor?: string;
  surfaceColor?: string;
  borderColor?: string;
  /** Background of the image viewport (shows around a board that does not fill it). */
  viewportColor?: string;
  /** Colour washed over everything outside the outlined part. */
  dimColor?: string;
  /** Small label above the heading (e.g. "Bước 3/4"); with `heading` the scene gets the same step header as
   *  TerminalScene, drawn at full opacity from frame 0 so consecutive step cuts do not flash. */
  eyebrow?: string;
  heading?: string;
}

const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
const GOOD = "#1D7A34";
const BAD = "#D70015";
const FILL = 0.7;
const MAX_ZOOM = 3.2;

interface Camera {
  scale: number;
  ox: number;
  oy: number;
}

/** Where the image sits in the viewport so that `spot` is framed (offsets clamped to the image edges). */
function cameraFor(spot: TeardownSpot, iw: number, ih: number, vw: number, vh: number): Camera {
  const fit = Math.min(vw / iw, vh / ih);
  const r = spot.focus ?? spot.region;
  const zoom = spot.zoom ?? (r ? Math.min(MAX_ZOOM, (vw * FILL) / (r.w * fit), (vh * FILL) / (r.h * fit)) : 1);
  const scale = fit * Math.max(1, zoom);
  const cx = r ? r.x + r.w / 2 : iw / 2;
  const cy = r ? r.y + r.h / 2 : ih / 2;
  const place = (view: number, size: number, c: number) => {
    const span = size * scale;
    if (span <= view) return (view - span) / 2;
    return Math.min(0, Math.max(view - span, view / 2 - c * scale));
  };
  return { scale, ox: place(vw, iw, cx), oy: place(vh, ih, cy) };
}

export const BoardTeardown: React.FC<BoardTeardownProps> = ({
  image,
  imageSize,
  spots,
  textColor = "#1D1D1F",
  bodyColor = "#424245",
  mutedColor = "#5E5E63",
  accentColor = "#0066CC",
  surfaceColor = "rgba(255,255,255,0.75)",
  borderColor = "rgba(0,0,0,0.08)",
  viewportColor = "rgba(255,255,255,0.75)",
  dimColor = "rgba(250,252,255,0.62)",
  eyebrow,
  heading,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;

  // Portrait: viewport above the label card, inside the TikTok safe area (y 220-1520, right rail >= 160 px).
  // With a step header the layout matches TerminalScene's: header at y 220, even 120 px side margins.
  const hasHeader = portrait && Boolean(eyebrow || heading);
  const HEADER_H = 135 + 40; // eyebrow 30 px + heading 84 px (line-height 1.08) + gap to the viewport
  const left = portrait ? (hasHeader ? 120 : 88) : 110;
  const top = portrait ? (hasHeader ? 220 + HEADER_H : 220) : 110;
  const vw = portrait ? (hasHeader ? width - 240 : width - 88 - 160) : Math.round(width * 0.55);
  const vh = portrait ? (hasHeader ? 600 : 930) : height - 220;
  const cardTop = portrait ? top + vh + 30 : top;
  const cardLeft = portrait ? left : left + vw + 60;
  const cardWidth = portrait ? vw : width - cardLeft - 110;

  const { width: iw, height: ih } = imageSize;
  const starts = spots.map((s) => Math.round(s.atSeconds * fps));
  let idx = 0;
  starts.forEach((f, i) => {
    if (frame >= f) idx = i;
  });
  const spot = spots[idx];
  const cams = spots.map((s) => cameraFor(s, iw, ih, vw, vh));

  // Camera glides from the previous spot; the first spot is framed from frame 0.
  const move = idx === 0 ? 1 : spring({ frame: frame - starts[idx], fps, config: { damping: 22, stiffness: 70 } });
  const from = cams[Math.max(0, idx - 1)];
  const to = cams[idx];
  const cam: Camera = {
    scale: interpolate(move, [0, 1], [from.scale, to.scale]),
    ox: interpolate(move, [0, 1], [from.ox, to.ox]),
    oy: interpolate(move, [0, 1], [from.oy, to.oy]),
  };

  const enter = hasHeader ? 1 : spring({ frame, fps, config: { damping: 18 } });
  const r = spot.region;
  // A spot that repeats the previous region / text (e.g. only adds a note) keeps the outline and the card
  // text on screen instead of fading them out and back in.
  const prev = idx > 0 ? spots[idx - 1] : undefined;
  const sameRegion = Boolean(r && prev?.region && JSON.stringify(prev.region) === JSON.stringify(r));
  const sameText = Boolean(prev && prev.name === spot.name && prev.eyebrow === spot.eyebrow && prev.detail === spot.detail);
  const boxIn = r
    ? sameRegion ? 1 : interpolate(move, [0.55, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const pulse = 1 + 0.25 * Math.max(0, Math.sin((frame - starts[idx]) / 7));
  const pad = 10;

  const cardIn = spring({ frame: frame - starts[idx] - (idx === 0 ? 0 : 4), fps, config: { damping: 18 } });
  const cardSettled = idx === 0 ? Math.max(cardIn, enter) : sameText ? 1 : cardIn;
  const noteIn = sameText && spot.note !== prev?.note ? cardIn : 1;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      {hasHeader && (
        <div style={{ position: "absolute", left, top: 220, width: vw }}>
          {eyebrow && (
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 8 }}>
              {eyebrow}
            </div>
          )}
          {heading && (
            <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.08, color: textColor }}>
              {heading}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left,
          top,
          width: vw,
          height: vh,
          overflow: "hidden",
          borderRadius: 36,
          background: viewportColor,
          border: `2px solid ${borderColor}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.10)",
          opacity: enter,
        }}
      >
        <Img
          src={resolveAsset(image)}
          style={{
            position: "absolute",
            left: cam.ox,
            top: cam.oy,
            width: iw * cam.scale,
            height: ih * cam.scale,
            maxWidth: "none",
          }}
        />
        {r && (
          <div
            style={{
              position: "absolute",
              left: cam.ox + r.x * cam.scale - pad,
              top: cam.oy + r.y * cam.scale - pad,
              width: r.w * cam.scale + pad * 2,
              height: r.h * cam.scale + pad * 2,
              borderRadius: 18,
              border: `${6 * pulse}px solid ${accentColor}`,
              boxShadow: `0 0 0 4000px ${dimColor}`,
              opacity: boxIn,
            }}
          />
        )}
        {r && spot.blink && (() => {
          // LED toggles every periodSeconds (the ESP-IDF blink example toggles every CONFIG_BLINK_PERIOD ms).
          const period = Math.max(1, Math.round((spot.blink.periodSeconds ?? 1) * fps));
          const t = frame - starts[idx];
          const on = Math.floor(t / period) % 2 === 0;
          const edge = Math.min(t % period, period - (t % period));
          const level = boxIn * (on ? interpolate(edge, [0, 2], [0.4, 1], { extrapolateRight: "clamp" }) : 0);
          const color = spot.blink.color ?? "#FFFFFF";
          const g = spot.blink.region ?? r;
          const d = Math.max(g.w, g.h) * cam.scale * 1.6;
          return (
            <div
              style={{
                position: "absolute",
                left: cam.ox + (g.x + g.w / 2) * cam.scale - d / 2,
                top: cam.oy + (g.y + g.h / 2) * cam.scale - d / 2,
                width: d,
                height: d,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color} 0%, ${color} 14%, ${color}AA 26%, ${color}33 48%, transparent 70%)`,
                mixBlendMode: "screen",
                opacity: level,
              }}
            />
          );
        })()}
      </div>

      <div
        style={{
          position: "absolute",
          left: cardLeft,
          top: cardTop,
          width: cardWidth,
          boxSizing: "border-box",
          padding: "30px 36px 34px",
          borderRadius: 36,
          background: surfaceColor,
          border: `2px solid ${borderColor}`,
          boxShadow: "0 18px 44px rgba(0,0,0,0.08)",
          opacity: enter,
        }}
      >
        <div style={{ opacity: cardSettled, transform: `translateY(${interpolate(cardSettled, [0, 1], [18, 0])}px)` }}>
          {spot.eyebrow && (
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 6 }}>
              {spot.eyebrow}
            </div>
          )}
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.08, color: textColor }}>
            {spot.name}
          </div>
          {spot.detail && (
            <div style={{ fontSize: 40, lineHeight: 1.4, color: bodyColor, marginTop: 12 }}>{spot.detail}</div>
          )}
          {spot.note && (
            <div
              style={{
                fontSize: 38,
                fontWeight: 600,
                lineHeight: 1.3,
                marginTop: 12,
                color: spot.noteTone === "bad" ? BAD : spot.noteTone === "good" ? GOOD : mutedColor,
                opacity: noteIn,
                transform: `translateY(${interpolate(noteIn, [0, 1], [18, 0])}px)`,
              }}
            >
              {spot.note}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
