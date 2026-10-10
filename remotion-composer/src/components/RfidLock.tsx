import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveAsset } from "../lib/resolveAsset";
import type { CodePoint } from "./CodeCompare";

export interface RfidCard {
  /** Name printed on the card, e.g. "Thẻ của bạn" or "Thẻ magic". */
  label: string;
  /** UID as hex bytes separated by spaces, e.g. "F7 DB 64 A9". */
  uid: string;
  /** [[seconds, uid]]: the UID changes at these times (a magic card rewritten with a copied UID); the card flashes. */
  uidTrack?: [number, string][];
  /** Small text under the UID bytes in the readout while this card was the last one read, e.g. "MIFARE 1K · SAK 0x08". */
  info?: string;
  /** Holds the secret key: passes the "aes" check. A UID copy does not. */
  key?: boolean;
  /** Card face colour (default white with an accent stripe). */
  color?: string;
  /** [[start, end]] windows when the card is held on the reader. */
  taps?: [number, number][];
  atSeconds?: number;
  untilSeconds?: number;
}

export interface RfidReader {
  /** Photo of the reader module in public/ (e.g. the RC522); omitted = a drawn antenna board. */
  image?: string;
  label?: string;
  /** Photo box in stage units [x, y, w, h] (stage is 1000 x 560). Default [30, 20, 340, 520]. */
  box?: [number, number, number, number];
  /** Centre of the antenna loop in stage units. Default [200, 360]. */
  antenna?: [number, number];
}

export interface RfidWhitelistEntry {
  uid: string;
  name: string;
  atSeconds?: number;
}

export interface RfidPanelsAt {
  /** When the UID readout strip appears (undefined = never shown). */
  readout?: number;
  /** When the allowed-card list appears; from then on every tap is checked against it. */
  whitelist?: number;
  /** When the door-lock panel appears. */
  lock?: number;
}

interface RfidLockProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  reader?: RfidReader;
  cards: RfidCard[];
  whitelist?: RfidWhitelistEntry[];
  whitelistTitle?: string;
  panelsAt?: RfidPanelsAt;
  /** [[seconds, "uid" | "aes"]]: what a tap is checked by. "aes" also needs the card's `key`. Default "uid". */
  checkTrack?: [number, "uid" | "aes"][];
  /** How long the lock stays open after a granted tap (seconds of video). Default 2.5. */
  unlockSeconds?: number;
  /** Label above the field rings, e.g. "13,56 MHz". */
  fieldLabel?: string;
  /** When the field rings start (default 0). */
  fieldAtSeconds?: number;
  lockLabel?: string;
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
const STAGE_H = 560;
const CARD_W = 330;
const CARD_H = 208;
const READ_DELAY = 0.35;
const BYTE_STEP = 0.12;

const uidAt = (c: RfidCard, t: number) => {
  let u = c.uid;
  for (const [s, v] of c.uidTrack ?? []) if (t >= s) u = v;
  return u;
};
const bytesOf = (u: string) => u.trim().split(/\s+/);

/**
 * RFID door-lock explainer: a reader module with its 13.56 MHz field, cards that slide onto it, the UID bytes read out
 * one by one, an allowed-card list (NVS) that lights the matching row, and a solenoid bolt that opens or refuses.
 * A card's `uidTrack` rewrites its UID (a magic card cloned from another); `checkTrack` switches the check from the UID
 * alone to a key check, which a clone fails.
 */
export const RfidLock: React.FC<RfidLockProps> = ({
  name,
  eyebrow,
  tagline,
  reader = {},
  cards,
  whitelist = [],
  whitelistTitle = "Thẻ hợp lệ · NVS",
  panelsAt = {},
  checkTrack,
  unlockSeconds = 2.5,
  fieldLabel = "13,56 MHz",
  fieldAtSeconds = 0,
  lockLabel = "Khoá solenoid 12 V",
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
  const life = (from?: number, until?: number) => {
    const a = from === undefined ? 1 : pop(at(from, 0));
    const b = until === undefined ? 1 : 1 - interpolate(frame, [at(until, 0), at(until, 0) + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return Math.min(a, b);
  };
  const head = pop(0, 18);

  const box = reader.box ?? [30, 20, 340, 520];
  const [ax, ay] = reader.antenna ?? [200, 360];

  // ---------------------------------------------------------------- taps and their outcome
  type Tap = { card: number; start: number; end: number };
  const taps: Tap[] = [];
  cards.forEach((c, i) => (c.taps ?? []).forEach(([s, e]) => taps.push({ card: i, start: s, end: e })));
  taps.sort((p, q) => p.start - q.start);
  const modeAt = (s: number) => {
    let m: "uid" | "aes" = "uid";
    for (const [k, v] of checkTrack ?? []) if (s >= k) m = v;
    return m;
  };
  const listed = (u: string, s: number) => whitelist.some((w) => w.uid === u && s >= (w.atSeconds ?? -1e9));
  const outcome = (tp: Tap) => {
    const c = cards[tp.card];
    const uid = uidAt(c, tp.start);
    const n = bytesOf(uid).length;
    const readEnd = tp.start + READ_DELAY + BYTE_STEP * n;
    const decideAt = readEnd + 0.25;
    const checking = panelsAt.whitelist !== undefined && tp.start >= panelsAt.whitelist;
    const mode = modeAt(tp.start);
    const inList = listed(uid, tp.start);
    const granted = checking && inList && (mode === "uid" || !!c.key);
    return { c, uid, n, start: tp.start, readEnd, decideAt, checking, mode, inList, granted };
  };
  const last = [...taps].reverse().find((tp) => t >= tp.start);
  const res = last ? outcome(last) : undefined;
  const decided = res ? t >= res.decideAt : false;
  const open = taps.some((tp) => {
    const o = outcome(tp);
    return o.granted && t >= o.decideAt && t < o.decideAt + unlockSeconds;
  });
  const openK = (() => {
    // Bolt position 0 = locked, 1 = open, eased over 0.25 s.
    let k = 0;
    for (const tp of taps) {
      const o = outcome(tp);
      if (!o.granted) continue;
      const a = interpolate(t, [o.decideAt, o.decideAt + 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const b = interpolate(t, [o.decideAt + unlockSeconds, o.decideAt + unlockSeconds + 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      k = Math.max(k, a * (1 - b));
    }
    return k;
  })();
  const deniedShake = (() => {
    for (const tp of taps) {
      const o = outcome(tp);
      if (o.checking && !o.granted && t >= o.decideAt && t < o.decideAt + 0.5) return Math.sin((t - o.decideAt) * 60) * 10 * (1 - (t - o.decideAt) / 0.5);
    }
    return 0;
  })();

  // ---------------------------------------------------------------- field rings
  const fieldOn = t >= fieldAtSeconds ? pop(at(fieldAtSeconds, 0)) : 0;
  const tapping = taps.some((tp) => t >= tp.start && t <= tp.end);
  const ringBoost = tapping ? 1 : 0.45;

  // ---------------------------------------------------------------- card placement
  const restSlots = cards.map((_, i) => i);
  const cardPose = (i: number) => {
    const c = cards[i];
    const slot = restSlots[i];
    const rest = { x: 640, y: 40 + slot * (CARD_H + 44), r: 0 };
    const over = { x: ax - CARD_W / 2 + 60, y: ay - CARD_H / 2 - 30, r: -7 };
    let k = 0;
    for (const [s, e] of c.taps ?? []) {
      const kin = t >= s ? spring({ frame: frame - at(s, 0), fps, config: { damping: 18, stiffness: 140 } }) : 0;
      const kout = t >= e ? spring({ frame: frame - at(e, 0), fps, config: { damping: 18, stiffness: 140 } }) : 0;
      k = Math.max(k, kin * (1 - kout));
    }
    return { x: rest.x + (over.x - rest.x) * k, y: rest.y + (over.y - rest.y) * k, r: over.r * k, k };
  };

  const drawCard = (i: number) => {
    const c = cards[i];
    const v = life(c.atSeconds, c.untilSeconds);
    if (v <= 0.001) return null;
    const pose = cardPose(i);
    const uid = uidAt(c, t);
    // Flash when the UID was rewritten in the last 0.8 s.
    const lastWrite = (c.uidTrack ?? []).filter(([s]) => t >= s).map(([s]) => s).pop();
    const flash = lastWrite !== undefined ? 1 - interpolate(t, [lastWrite, lastWrite + 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
    const powered = pose.k > 0.6;
    const face = c.color ?? "#FFFFFF";
    return (
      <g key={`c${i}`} opacity={v} transform={`translate(${pose.x} ${pose.y}) rotate(${pose.r} ${CARD_W / 2} ${CARD_H / 2})`}>
        <rect x={6} y={10} width={CARD_W} height={CARD_H} rx={20} fill="rgba(16,24,40,0.16)" />
        <rect x={0} y={0} width={CARD_W} height={CARD_H} rx={20} fill={face} stroke={flash > 0 ? accentColor : "rgba(0,0,0,0.14)"} strokeWidth={2 + 6 * flash} />
        <rect x={0} y={0} width={CARD_W} height={46} rx={20} fill={accentColor} opacity={0.9} />
        <rect x={0} y={26} width={CARD_W} height={20} fill={accentColor} opacity={0.9} />
        <text x={20} y={33} fontSize={26} fontWeight={700} fill="#FFFFFF">{c.label}</text>
        {/* Coil and chip on the right, glowing while the reader field powers the card */}
        <rect x={226} y={64} width={86} height={92} rx={12} fill="none" stroke={powered ? accentColor : "#B9BCC2"} strokeWidth={3} />
        <rect x={236} y={74} width={66} height={72} rx={8} fill="none" stroke={powered ? accentColor : "#B9BCC2"} strokeWidth={3} />
        <rect x={256} y={96} width={26} height={26} rx={5} fill={powered ? accentColor : "#8E9198"} />
        {powered && <rect x={248} y={88} width={42} height={42} rx={8} fill={accentColor} opacity={0.18} />}
        {/* UID on the left, full width of the text column */}
        <text x={20} y={84} fontSize={22} fontWeight={600} fill={mutedColor}>UID</text>
        {bytesOf(uid).length <= 4 ? (
          <text x={20} y={124} fontSize={32} fontWeight={700} fontFamily={MONO} fill={flash > 0 ? accentColor : textColor}>
            {uid}
          </text>
        ) : (
          <>
            <text x={20} y={118} fontSize={27} fontWeight={700} fontFamily={MONO} fill={flash > 0 ? accentColor : textColor}>{bytesOf(uid).slice(0, 4).join(" ")}</text>
            <text x={20} y={150} fontSize={27} fontWeight={700} fontFamily={MONO} fill={flash > 0 ? accentColor : textColor}>{bytesOf(uid).slice(4).join(" ")}</text>
          </>
        )}
        {c.key && (
          <g>
            <rect x={196} y={164} width={118} height={34} rx={17} fill="#D7F0DD" />
            <text x={255} y={188} textAnchor="middle" fontSize={22} fontWeight={700} fill={proColor}>AES key</text>
          </g>
        )}
      </g>
    );
  };

  // ---------------------------------------------------------------- readout
  const showReadout = panelsAt.readout !== undefined;
  const readoutV = showReadout ? life(panelsAt.readout, undefined) : 0;
  const nShown = res ? Math.max(0, Math.min(res.n, Math.floor((t - res.start - READ_DELAY) / BYTE_STEP) + 1)) : 0;

  const showList = panelsAt.whitelist !== undefined;
  const listV = showList ? life(panelsAt.whitelist, undefined) : 0;
  const showLock = panelsAt.lock !== undefined;
  const lockV = showLock ? life(panelsAt.lock, undefined) : 0;

  // Status line
  let status: { text: string; tone: "good" | "bad" | "muted" | "accent" } = { text: "Chờ thẻ…", tone: "muted" };
  if (res && t <= (last?.end ?? 0) + 30) {
    if (!decided) status = { text: "Đang đọc thẻ…", tone: "accent" };
    else if (!res.checking) status = { text: `Đã đọc UID · ${res.n} byte`, tone: "accent" };
    else if (res.granted) status = { text: res.mode === "aes" ? "Đúng khoá AES · mở cửa" : "UID có trong danh sách · mở cửa", tone: "good" };
    else if (res.mode === "aes" && res.inList) status = { text: "Sai khoá AES · từ chối", tone: "bad" };
    else status = { text: "UID lạ · từ chối", tone: "bad" };
  }
  const statusBg = status.tone === "good" ? "#D7F0DD" : status.tone === "bad" ? "#F9D5D8" : status.tone === "accent" ? "#CFE2F8" : "#E8E8ED";
  const statusInk = status.tone === "good" ? proColor : status.tone === "bad" ? conColor : status.tone === "accent" ? accentColor : mutedColor;

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
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

      <div style={{ ...card, padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Stage: reader photo, field rings, cards */}
        <div style={{ position: "relative", width: "100%", aspectRatio: `${STAGE_W} / ${STAGE_H}` }}>
          {reader.image ? (
            <Img
              src={resolveAsset(reader.image)}
              style={{
                position: "absolute",
                left: `${(box[0] / STAGE_W) * 100}%`,
                top: `${(box[1] / STAGE_H) * 100}%`,
                width: `${(box[2] / STAGE_W) * 100}%`,
                height: `${(box[3] / STAGE_H) * 100}%`,
                objectFit: "contain",
                filter: "drop-shadow(0 12px 16px rgba(0,0,0,0.18))",
              }}
            />
          ) : null}
          <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            {!reader.image && (
              <g>
                <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} rx={18} fill="#1F4FA3" />
                {[0, 1, 2, 3].map((j) => (
                  <rect key={j} x={box[0] + 30 + j * 12} y={box[1] + 150 + j * 12} width={box[2] - 60 - j * 24} height={box[3] - 190 - j * 24} rx={14} fill="none" stroke="#C9D6EE" strokeWidth={3} />
                ))}
              </g>
            )}
            {/* Field rings around the antenna */}
            {fieldOn > 0.001 && (
              <g opacity={fieldOn}>
                {[0, 1, 2].map((j) => {
                  const ph = (t * 0.7 + j / 3) % 1;
                  const r = 70 + ph * 230;
                  return <circle key={j} cx={ax} cy={ay} r={r} fill="none" stroke={accentColor} strokeWidth={4} opacity={(1 - ph) * 0.55 * ringBoost} />;
                })}
                <text x={ax} y={Math.max(36, ay - 300)} textAnchor="middle" fontSize={30} fontWeight={700} fill={accentColor} stroke="#FFFFFF" strokeWidth={7} paintOrder="stroke">
                  {fieldLabel}
                </text>
              </g>
            )}
            {reader.label && (
              <text x={box[0] + box[2] / 2} y={box[1] + box[3] + 34} textAnchor="middle" fontSize={28} fontWeight={700} fill={textColor}>
                {reader.label}
              </text>
            )}
            {/* Resting cards first, the tapping card on top */}
            {cards.map((_, i) => i).sort((p, q) => cardPose(p).k - cardPose(q).k).map((i) => drawCard(i))}
          </svg>
        </div>

        {/* UID readout */}
        {showReadout && (
          <div style={{ opacity: readoutV, display: "flex", flexDirection: "column", gap: 8, padding: "0 6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "nowrap" }}>
              <div style={{ fontSize: 30, fontWeight: 600, color: mutedColor, width: 74, flex: "0 0 auto" }}>UID</div>
              {(res ? bytesOf(res.uid) : ["", "", "", ""]).map((b, j) => {
                const shown = j < nShown;
                const fresh = shown && res ? interpolate(t, [res.start + READ_DELAY + j * BYTE_STEP, res.start + READ_DELAY + j * BYTE_STEP + 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
                const seven = res ? res.n > 4 : false;
                return (
                  <div
                    key={j}
                    style={{
                      width: seven ? 78 : 108,
                      height: 66,
                      borderRadius: 14,
                      border: shown ? `2px solid ${accentColor}` : "2px dashed #B9BCC2",
                      background: shown ? `rgba(0,102,204,${0.06 + 0.1 * (1 - fresh)})` : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: MONO,
                      fontSize: seven ? 32 : 40,
                      fontWeight: 700,
                      color: textColor,
                      transform: `scale(${shown ? 0.85 + 0.15 * fresh : 1})`,
                    }}
                  >
                    {shown ? b : ""}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", color: mutedColor, height: 36, opacity: res && t >= res.readEnd && res.c.info ? 1 : 0 }}>
              {res?.c.info ?? ""}
            </div>
          </div>
        )}

        {/* Allowed list + lock */}
        {(showList || showLock) && (
          <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
            {showList && (
              <div style={{ flex: 1.35, opacity: listV, background: "rgba(255,255,255,0.7)", borderRadius: 24, border: "2px solid rgba(0,0,0,0.06)", padding: "14px 16px" }}>
                <div style={{ fontSize: 28, fontWeight: 600, color: mutedColor, marginBottom: 8 }}>{whitelistTitle}</div>
                {whitelist.map((w, j) => {
                  const v = life(w.atSeconds, undefined);
                  const hit = res && decided && res.checking && res.inList && res.uid === w.uid && t < res.decideAt + unlockSeconds + 0.5;
                  const good = hit && res?.granted;
                  return (
                    <div
                      key={j}
                      style={{
                        opacity: v,
                        display: "flex",
                        flexDirection: "column",
                        padding: "6px 10px",
                        borderRadius: 12,
                        background: hit ? (good ? "#D7F0DD" : "#F9D5D8") : "transparent",
                      }}
                    >
                      <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: textColor, whiteSpace: "nowrap" }}>{w.uid}</div>
                      <div style={{ fontSize: 26, color: mutedColor }}>{w.name}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {showLock && (
              <div
                style={{
                  flex: 1,
                  opacity: lockV,
                  background: "rgba(255,255,255,0.7)",
                  borderRadius: 24,
                  border: "2px solid rgba(0,0,0,0.06)",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg viewBox="0 0 300 150" style={{ width: "100%", display: "block" }}>
                  <g transform={`translate(${deniedShake} 0)`}>
                    {/* Door edge with the strike plate */}
                    <rect x={232} y={10} width={58} height={130} rx={8} fill="#D2D2D7" />
                    <rect x={226} y={52} width={20} height={46} rx={4} fill="#B9BCC2" />
                    {/* Bolt, sliding back when open */}
                    <rect x={118 + 104 * (1 - openK)} y={60} width={40} height={30} rx={6} fill={openK > 0.5 ? proColor : "#8E9198"} transform={`translate(${-0} 0)`} />
                    {/* Solenoid body */}
                    <rect x={14} y={30} width={150} height={90} rx={14} fill={openK > 0.5 ? proColor : textColor} />
                    {[0, 1, 2, 3, 4].map((j) => (
                      <line key={j} x1={40 + j * 22} y1={44} x2={40 + j * 22} y2={106} stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={6} />
                    ))}
                  </g>
                </svg>
                <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.01em", color: open ? proColor : deniedShake !== 0 ? conColor : textColor }}>
                  {open ? "MỞ" : "ĐÓNG"}
                </div>
                <div style={{ fontSize: 26, color: mutedColor, textAlign: "center" }}>{lockLabel}</div>
              </div>
            )}
          </div>
        )}

        {/* Status */}
        {(showReadout || showList) && (
          <div style={{ display: "flex", justifyContent: "center", opacity: Math.max(readoutV, listV) }}>
            <div style={{ fontSize: 34, fontWeight: 600, padding: "10px 26px", borderRadius: 999, background: statusBg, color: statusInk }}>{status.text}</div>
          </div>
        )}

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
