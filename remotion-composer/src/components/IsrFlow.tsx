import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CodePoint } from "./CodeCompare";

type Tone = "neutral" | "accent" | "good" | "bad" | "muted" | "warn";
export type IsrPlace = "flash" | "iram" | "dram";

export interface IsrStatus {
  atSeconds: number;
  untilSeconds?: number;
  text: string;
  tone?: Tone;
}

export interface IsrCodeTag {
  /** Monospace text, e.g. "gpio_isr()". */
  text: string;
  /** [[seconds, place]] steps; the tag glides to the new region over 0.6 s. */
  placeTrack: [number, IsrPlace][];
  tone?: Tone;
  atSeconds?: number;
}

export interface IsrIrq {
  atSeconds: number;
  /** Index into `codeTags`: the handler the CPU fetches. */
  tag: number;
  /** Not IRAM-safe: an IRQ during a flash write waits at the pin until the write ends, then runs. */
  hold?: boolean;
}

export interface IsrCrash {
  atSeconds: number;
  title: string;
  lines?: string[];
  untilSeconds?: number;
}

export interface IsrBadge {
  text: string;
  /** true = allowed in an ISR (green check), false = not allowed (red cross). */
  ok: boolean;
  atSeconds?: number;
}

export interface IsrEvent {
  /** The interrupt fires: the item pops in the ISR box, then drops into the channel. */
  atSeconds: number;
  label?: string;
  /** Seconds from `atSeconds` until the task takes the item (default 0.7). */
  takeAfter?: number;
  /** Seconds the task runs on the item (default 0.9). */
  runSeconds?: number;
}

export interface IsrChannel {
  kind: "queue" | "notify";
  /** Queue length (default 5). */
  slots?: number;
  /** Caption under the channel, e.g. "queue 10 phần tử". */
  label?: string;
  /** Label on the ISR -> channel arrow (e.g. "xQueueSendFromISR"). */
  sendLabel?: string;
  /** Label on the channel -> task arrow (e.g. "xQueueReceive"). */
  takeLabel?: string;
  atSeconds?: number;
}

export interface IsrBox {
  label: string;
  sub?: string;
  atSeconds?: number;
}

export interface LaChannel {
  label: string;
  /** Level at the left edge of the window. */
  level0: 0 | 1;
  /** Toggle times in microseconds from the window start. */
  edges: number[];
  tone?: Tone;
  atSeconds?: number;
  /** Seconds the pen takes to cross the window (default 1.4). */
  drawSeconds?: number;
}

export interface LaCursor {
  /** Microseconds. */
  x0: number;
  x1: number;
  label: string;
  /** Channel indices the bracket joins (default the first two). */
  from?: number;
  to?: number;
  tone?: Tone;
  atSeconds?: number;
}

export interface LaHist {
  title: string;
  unit: string;
  /** Bins left to right: label under the bar, count sets the height. */
  bins: { label: string; count: number; tone?: Tone }[];
  atSeconds?: number;
}

export interface IsrInfo {
  label: string;
  value: string;
  tone?: Tone;
  atSeconds?: number;
}

interface IsrFlowProps {
  name: string;
  eyebrow?: string;
  tagline?: string;
  /** memory: CPU / cache / IRAM / DRAM / SPI flash map with ISR fetch paths. handoff: ISR -> queue / notify -> task.
   * analyzer: logic-analyzer channels with Δt cursors and a latency histogram. */
  view?: "memory" | "handoff" | "analyzer";
  // memory
  codeTags?: IsrCodeTag[];
  flashBusy?: [number, number][];
  flashBusyLabel?: string;
  irqs?: IsrIrq[];
  crash?: IsrCrash;
  pinLabel?: string;
  // handoff
  isr?: IsrBox;
  task?: IsrBox;
  channel?: IsrChannel;
  events?: IsrEvent[];
  badges?: IsrBadge[];
  yieldAt?: { atSeconds: number; label: string };
  // analyzer
  laSpanUs?: number;
  laTickUs?: number;
  laChannels?: LaChannel[];
  laCursors?: LaCursor[];
  laHist?: LaHist;
  laTitle?: string;
  info?: IsrInfo[];
  status?: IsrStatus[];
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
const WARN = "#B25000";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Region rectangles of the memory view (viewBox 1000 x 640). */
const REG: Record<IsrPlace | "cpu" | "cache", { x: number; y: number; w: number; h: number }> = {
  cpu: { x: 70, y: 90, w: 270, h: 180 },
  cache: { x: 400, y: 90, w: 270, h: 180 },
  iram: { x: 70, y: 340, w: 270, h: 230 },
  dram: { x: 400, y: 340, w: 270, h: 230 },
  flash: { x: 770, y: 70, w: 210, h: 330 },
};

/**
 * Interrupt and real-time explainer for ESP32 ISRs: a memory map (CPU, cache, IRAM, DRAM, external SPI flash) where an
 * IRQ makes the CPU fetch its handler — through the cache from flash, or straight from IRAM — and a flash write turns
 * the cache off so a flash-resident handler crashes; an ISR -> queue / task-notify -> task hand-off with items that
 * drop into the channel and wake the task; and a logic-analyzer view with digital channels, Δt cursors and a latency
 * histogram.
 */
export const IsrFlow: React.FC<IsrFlowProps> = ({
  name,
  eyebrow,
  tagline,
  view = "memory",
  codeTags = [],
  flashBusy = [],
  flashBusyLabel = "đang ghi flash",
  irqs = [],
  crash,
  pinLabel = "GPIO",
  isr = { label: "ISR" },
  task = { label: "Task" },
  channel = { kind: "queue" },
  events = [],
  badges = [],
  yieldAt,
  laSpanUs = 10,
  laTickUs = 1,
  laChannels = [],
  laCursors = [],
  laHist,
  laTitle,
  info = [],
  status = [],
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
  layout = "safe",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const t = frame / fps;
  // A start at or before 0 is fully drawn on the cut's first frame (no fade-in from a blank frame).
  const pop = (s: number | undefined, damping = 16) =>
    (s ?? 0) <= 0 ? 1 : spring({ frame: frame - Math.round((s ?? 0) * fps), fps, config: { damping, stiffness: 120 } });
  const shown = (s?: number) => (s ?? 0) <= t;
  const head = pop(0);

  const ink = (tone?: Tone) =>
    tone === "good" ? proColor : tone === "bad" ? conColor : tone === "warn" ? WARN : tone === "muted" ? mutedColor : tone === "neutral" ? textColor : accentColor;
  const tint = (tone?: Tone) =>
    tone === "good" ? "#D7F0DD" : tone === "bad" ? "#F9D5D8" : tone === "warn" ? "#FBE3CC" : tone === "muted" || tone === "neutral" ? "#E8E8ED" : "#CFE2F8";

  const card: React.CSSProperties = {
    background: surfaceColor,
    border: `2px solid ${borderColor}`,
    borderRadius: 36,
    boxShadow: "0 18px 48px rgba(16,24,40,0.10)",
  };
  const panel: React.CSSProperties = {
    background: "rgba(255,255,255,0.7)",
    borderRadius: 24,
    border: "2px solid rgba(0,0,0,0.06)",
    padding: "16px 20px",
  };

  const st = [...status].reverse().find((s) => t >= s.atSeconds && (s.untilSeconds === undefined || t < s.untilSeconds));

  // ------------------------------------------------------------------ memory view
  const memoryView = () => {
    const busyNow = flashBusy.some(([a, b]) => t >= a && t < b);
    const busyAt = (s: number) => flashBusy.some(([a, b]) => s >= a && s < b);
    const placeAt = (tag: IsrCodeTag, s: number): IsrPlace => {
      let p = tag.placeTrack[0]?.[1] ?? "flash";
      for (const [at, v] of tag.placeTrack) if (s >= at) p = v;
      return p;
    };
    // Slot of each tag inside its region: order of tags sharing that place.
    const slotXY = (place: IsrPlace, idx: number) => {
      const r = REG[place];
      const top = place === "flash" ? r.y + 150 : r.y + 132;
      return { x: r.x + r.w / 2, y: top + idx * 56 };
    };
    const tagPos = (k: number, s: number) => {
      const tag = codeTags[k];
      // Find the last step at or before s and the place before it, to glide between them.
      let prev: IsrPlace = tag.placeTrack[0]?.[1] ?? "flash";
      let cur = prev;
      let since = -99;
      for (const [at, v] of tag.placeTrack) {
        if (s >= at) {
          if (v !== cur) {
            prev = cur;
            since = at;
          }
          cur = v;
        }
      }
      const idxIn = (place: IsrPlace, when: number) =>
        codeTags.slice(0, k).filter((o, j) => shown(o.atSeconds) && placeAt(codeTags[j], when) === place).length;
      const a = slotXY(prev, idxIn(prev, since - 0.01));
      const b = slotXY(cur, idxIn(cur, s));
      const u = interpolate(s, [since, since + 0.6], [0, 1], clamp);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, place: cur };
    };

    const pin = { x: 20, y: 300 };
    const cpuIn = { x: REG.cpu.x, y: REG.cpu.y + 90 };
    const cpuC = { x: REG.cpu.x + REG.cpu.w / 2, y: REG.cpu.y + REG.cpu.h / 2 };
    // A held IRQ starts when the flash write that covers it ends; until then it waits at the pin.
    const busyEnd = (s: number) => flashBusy.find(([a, b]) => s >= a && s < b)?.[1];
    const runs = irqs.map((q) => ({ ...q, waitFrom: q.atSeconds, atSeconds: q.hold ? busyEnd(q.atSeconds) ?? q.atSeconds : q.atSeconds }));
    const waiting = runs.filter((q) => q.atSeconds > q.waitFrom && t >= q.waitFrom && t < q.atSeconds);
    const live = runs.filter((q) => t >= q.atSeconds && t < q.atSeconds + 2.6);
    const running = runs.some((q) => t >= q.atSeconds + 0.3 && t < q.atSeconds + 1.3 && !(crash && t >= crash.atSeconds));
    const crashed = crash && t >= crash.atSeconds && (crash.untilSeconds === undefined || t < crash.untilSeconds);

    const box = (key: "cpu" | "cache" | IsrPlace, title: string, sub: string, dark = false, off = false) => {
      const r = REG[key];
      return (
        <g>
          <rect x={r.x + 4} y={r.y + 8} width={r.w} height={r.h} rx={20} fill="rgba(16,24,40,0.10)" />
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={20} fill={dark ? "#1F2937" : off ? "#E5E5EA" : "#FFFFFF"} stroke={off ? "#AEAEB2" : dark ? "#1F2937" : "#8AA4C2"} strokeWidth={3} strokeDasharray={off ? "12 8" : undefined} />
          <text x={r.x + 22} y={r.y + 48} fontSize={38} fontWeight={700} fill={dark ? "#FFFFFF" : off ? mutedColor : textColor}>
            {title}
          </text>
          <text x={r.x + 22} y={r.y + 82} fontSize={24} fontWeight={500} fill={dark ? "#C7CBD1" : mutedColor}>
            {sub}
          </text>
        </g>
      );
    };

    return (
      <svg viewBox="0 0 1000 640" style={{ width: "100%", display: "block", overflow: "visible" }}>
        {/* Chip outline */}
        <rect x={40} y={20} width={660} height={600} rx={30} fill="#EEF3FA" stroke="#8AA4C2" strokeWidth={3} />
        <text x={70} y={66} fontSize={28} fontWeight={700} fill={accentColor} letterSpacing="0.01em">
          ESP32-S3
        </text>
        {/* GPIO pin */}
        <rect x={pin.x} y={pin.y - 22} width={40} height={44} rx={6} fill="#D4AF37" />
        <text x={pin.x - 6} y={pin.y + 52} fontSize={24} fontWeight={600} fill={mutedColor}>
          {pinLabel}
        </text>
        {/* Buses */}
        <line x1={REG.cpu.x + REG.cpu.w} y1={cpuC.y} x2={REG.cache.x} y2={cpuC.y} stroke="#8AA4C2" strokeWidth={6} />
        <line x1={REG.cache.x + REG.cache.w} y1={cpuC.y} x2={REG.flash.x} y2={cpuC.y} stroke={busyNow ? "#AEAEB2" : "#8AA4C2"} strokeWidth={6} strokeDasharray={busyNow ? "10 8" : undefined} />
        <line x1={cpuC.x} y1={REG.cpu.y + REG.cpu.h} x2={cpuC.x} y2={REG.iram.y} stroke="#8AA4C2" strokeWidth={6} />
        <line x1={REG.cpu.x + REG.cpu.w} y1={REG.cpu.y + REG.cpu.h - 20} x2={REG.dram.x + 40} y2={REG.dram.y} stroke="#8AA4C2" strokeWidth={6} />
        <text x={REG.flash.x - 60} y={cpuC.y - 16} textAnchor="middle" fontSize={22} fontWeight={600} fill={mutedColor}>
          SPI
        </text>

        {box("cpu", "CPU", running ? "đang chạy ISR" : "lõi 240 MHz", true)}
        {running && (
          <rect x={REG.cpu.x + 22} y={REG.cpu.y + 110} width={140} height={46} rx={23} fill={accentColor} />
        )}
        {running && (
          <text x={REG.cpu.x + 92} y={REG.cpu.y + 142} textAnchor="middle" fontSize={26} fontWeight={700} fill="#FFFFFF">
            ISR
          </text>
        )}
        {box("cache", "Cache", busyNow ? "tắt khi ghi flash" : "đọc flash qua đây", false, busyNow)}
        {busyNow && (
          <g>
            <line x1={REG.cache.x + 30} y1={REG.cache.y + 110} x2={REG.cache.x + REG.cache.w - 30} y2={REG.cache.y + 160} stroke={conColor} strokeWidth={6} strokeLinecap="round" />
            <line x1={REG.cache.x + REG.cache.w - 30} y1={REG.cache.y + 110} x2={REG.cache.x + 30} y2={REG.cache.y + 160} stroke={conColor} strokeWidth={6} strokeLinecap="round" />
          </g>
        )}
        {box("iram", "IRAM", "SRAM trong chip · code")}
        {box("dram", "DRAM", "SRAM trong chip · dữ liệu")}

        {/* External SPI flash */}
        <rect x={REG.flash.x + 4} y={REG.flash.y + 8} width={REG.flash.w} height={REG.flash.h} rx={16} fill="rgba(16,24,40,0.12)" />
        <rect x={REG.flash.x} y={REG.flash.y} width={REG.flash.w} height={REG.flash.h} rx={16} fill="#2C2C2E" />
        {Array.from({ length: 6 }).map((_, j) => (
          <rect key={j} x={REG.flash.x - 14} y={REG.flash.y + 40 + j * 46} width={14} height={20} fill="#AEAEB2" />
        ))}
        <text x={REG.flash.x + REG.flash.w / 2} y={REG.flash.y + 52} textAnchor="middle" fontSize={32} fontWeight={700} fill="#FFFFFF">
          Flash
        </text>
        <text x={REG.flash.x + REG.flash.w / 2} y={REG.flash.y + 86} textAnchor="middle" fontSize={22} fontWeight={500} fill="#C7CBD1">
          SPI · ngoài chip
        </text>
        {busyNow && (
          <g>
            <rect x={REG.flash.x + 16} y={REG.flash.y + REG.flash.h - 64} width={REG.flash.w - 32} height={40} rx={20} fill="#FBE3CC" />
            <rect
              x={REG.flash.x + 16}
              y={REG.flash.y + REG.flash.h - 64}
              width={(REG.flash.w - 32) * (((t * 0.8) % 1) * 0.85 + 0.15)}
              height={40}
              rx={20}
              fill={WARN}
              opacity={0.55}
            />
            <text x={REG.flash.x + REG.flash.w / 2} y={REG.flash.y + REG.flash.h - 36} textAnchor="middle" fontSize={21} fontWeight={700} fill={WARN}>
              {flashBusyLabel}
            </text>
          </g>
        )}

        {/* Code tags */}
        {codeTags.map((tag, k) => {
          if (!shown(tag.atSeconds)) return null;
          const p = tagPos(k, t);
          const v = pop(tag.atSeconds);
          const onDark = p.place === "flash";
          const w = Math.max(150, tag.text.length * 15 + 36);
          const tone = tag.tone ?? "accent";
          return (
            <g key={k} opacity={v} transform={`translate(${p.x} ${p.y})`}>
              <rect x={-w / 2} y={-22} width={w} height={44} rx={10} fill={onDark ? "#3A3A3C" : tint(tone)} stroke={onDark ? "#636366" : ink(tone)} strokeWidth={2} />
              <text x={0} y={9} textAnchor="middle" fontSize={24} fontWeight={600} fontFamily={MONO} fill={onDark ? "#F2F2F7" : ink(tone)}>
                {tag.text}
              </text>
            </g>
          );
        })}

        {/* IRQ: bolt from the pin to the CPU, then the fetch path to the handler */}
        {live.map((q, i) => {
          const u = interpolate(t, [q.atSeconds, q.atSeconds + 0.3], [0, 1], clamp);
          const tag = codeTags[q.tag];
          if (!tag) return null;
          const place = placeAt(tag, q.atSeconds);
          const bad = place === "flash" && busyAt(q.atSeconds + 0.4);
          const dest = tagPos(q.tag, q.atSeconds + 0.3);
          const path: [number, number][] =
            place === "flash"
              ? [[cpuC.x + 100, cpuC.y], [REG.cache.x + REG.cache.w / 2, cpuC.y], [REG.flash.x + REG.flash.w / 2, cpuC.y], [dest.x, dest.y]]
              : place === "iram"
                ? [[cpuC.x, cpuC.y + 60], [cpuC.x, REG.iram.y + 40], [dest.x, dest.y]]
                : [[cpuC.x + 100, cpuC.y + 60], [REG.dram.x + 40, REG.dram.y + 30], [dest.x, dest.y]];
          const lens = path.slice(1).map((pt, j) => Math.hypot(pt[0] - path[j][0], pt[1] - path[j][1]));
          const total = lens.reduce((a, b) => a + b, 0);
          // Bad fetches stop dead at the cache.
          const stopAt = bad ? lens[0] : total;
          const f = interpolate(t, [q.atSeconds + 0.3, q.atSeconds + 0.9], [0, stopAt], clamp);
          let left = f;
          let dot = path[0];
          for (let j = 0; j < lens.length; j++) {
            if (left <= lens[j]) {
              const k = lens[j] === 0 ? 0 : left / lens[j];
              dot = [path[j][0] + (path[j + 1][0] - path[j][0]) * k, path[j][1] + (path[j + 1][1] - path[j][1]) * k];
              break;
            }
            left -= lens[j];
            dot = path[j + 1];
          }
          const fade = interpolate(t, [q.atSeconds + 1.8, q.atSeconds + 2.6], [1, 0], clamp);
          const col = bad ? conColor : proColor;
          return (
            <g key={i} opacity={fade}>
              <path
                d={`M ${pin.x + 40} ${pin.y} L ${pin.x + 40 + (cpuIn.x - pin.x - 40) * u} ${pin.y + (cpuIn.y - pin.y) * u}`}
                stroke={WARN}
                strokeWidth={8}
                strokeLinecap="round"
                fill="none"
              />
              {u < 1 && (
                <text x={pin.x + 40 + (cpuIn.x - pin.x - 40) * u} y={pin.y + (cpuIn.y - pin.y) * u - 14} fontSize={34} textAnchor="middle">
                  ⚡
                </text>
              )}
              {t >= q.atSeconds + 0.3 && (
                <>
                  <polyline points={path.map((p) => p.join(",")).join(" ")} fill="none" stroke={col} strokeWidth={5} strokeDasharray="4 10" strokeLinecap="round" opacity={0.6} />
                  <circle cx={dot[0]} cy={dot[1]} r={14} fill={col} stroke="#FFFFFF" strokeWidth={4} />
                </>
              )}
            </g>
          );
        })}

        {waiting.map((q, i) => {
          const pulse = 0.6 + 0.4 * Math.sin((t - q.waitFrom) * 8);
          return (
            <g key={`w${i}`} opacity={pulse}>
              <circle cx={pin.x + 20} cy={pin.y} r={34} fill="none" stroke={WARN} strokeWidth={5} />
              <rect x={pin.x + 56} y={pin.y - 22} width={150} height={40} rx={20} fill="#FBE3CC" />
              <text x={pin.x + 131} y={pin.y + 6} textAnchor="middle" fontSize={22} fontWeight={700} fill={WARN}>
                ngắt chờ…
              </text>
            </g>
          );
        })}

        {crashed && crash && (
          <g opacity={pop(crash.atSeconds, 12)}>
            <rect x={40} y={420} width={940} height={200} rx={24} fill="#FFF1F2" stroke={conColor} strokeWidth={4} />
            <text x={70} y={472} fontSize={32} fontWeight={700} fill={conColor}>
              {crash.title}
            </text>
            {(crash.lines ?? []).map((ln, j) => (
              <text key={j} x={70} y={516 + j * 38} fontSize={23} fontWeight={500} fontFamily={MONO} fill="#7A0A12">
                {ln}
              </text>
            ))}
          </g>
        )}
      </svg>
    );
  };

  // ------------------------------------------------------------------ handoff view
  const handoffView = () => {
    const ISR = { x: 20, y: 60, w: 270, h: 170 };
    const TSK = { x: 710, y: 60, w: 270, h: 170 };
    const slots = channel.kind === "notify" ? 1 : channel.slots ?? 5;
    const CH = { x: 350, y: 105, w: 300, h: 80 };
    const sw = CH.w / slots;
    // Item state per event.
    type It = { phase: "isr" | "drop" | "queued" | "take" | "run" | "done"; u: number; label: string };
    const items: It[] = events.map((e) => {
      const take = e.atSeconds + (e.takeAfter ?? 0.7);
      const run = e.runSeconds ?? 0.9;
      const label = e.label ?? "";
      if (t < e.atSeconds) return { phase: "done", u: 0, label };
      if (t < e.atSeconds + 0.25) return { phase: "isr", u: (t - e.atSeconds) / 0.25, label };
      if (t < e.atSeconds + 0.6) return { phase: "drop", u: (t - e.atSeconds - 0.25) / 0.35, label };
      if (t < take) return { phase: "queued", u: 0, label };
      if (t < take + 0.3) return { phase: "take", u: (t - take) / 0.3, label };
      if (t < take + 0.3 + run) return { phase: "run", u: 0, label };
      return { phase: "done", u: 0, label };
    });
    const queued = items.filter((it) => it.phase === "queued" || it.phase === "drop").length;
    const taskRun = items.some((it) => it.phase === "run");
    const isrHot = events.some((e) => t >= e.atSeconds && t < e.atSeconds + 0.45);
    const notifyCount = channel.kind === "notify" ? queued : 0;
    let qi = 0;

    const boxEl = (r: typeof ISR, b: IsrBox, hot: boolean, state?: { text: string; tone: Tone }) => (
      <g opacity={pop(b.atSeconds)}>
        <rect x={r.x + 4} y={r.y + 8} width={r.w} height={r.h} rx={22} fill="rgba(16,24,40,0.10)" />
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={22} fill={hot ? accentColor : "#FFFFFF"} stroke={hot ? accentColor : "#8AA4C2"} strokeWidth={3} />
        <text x={r.x + r.w / 2} y={r.y + 58} textAnchor="middle" fontSize={44} fontWeight={700} fill={hot ? "#FFFFFF" : textColor}>
          {b.label}
        </text>
        {b.sub && (
          <text x={r.x + r.w / 2} y={r.y + 98} textAnchor="middle" fontSize={27} fontWeight={500} fill={hot ? "#E6F0FA" : mutedColor}>
            {b.sub}
          </text>
        )}
        {state && (
          <g>
            <rect x={r.x + r.w / 2 - 70} y={r.y + 116} width={140} height={40} rx={20} fill={tint(state.tone)} />
            <text x={r.x + r.w / 2} y={r.y + 144} textAnchor="middle" fontSize={24} fontWeight={700} fill={ink(state.tone)}>
              {state.text}
            </text>
          </g>
        )}
      </g>
    );

    return (
       <svg viewBox="0 0 1000 310" style={{ width: "100%", display: "block", overflow: "visible" }}>
        {boxEl(ISR, isr, isrHot)}
        {boxEl(TSK, task, taskRun, taskRun ? { text: "Chạy", tone: "good" } : { text: "Chờ", tone: "muted" })}
        {/* Channel */}
        <g opacity={pop(channel.atSeconds)}>
          <line x1={ISR.x + ISR.w} y1={CH.y + CH.h / 2} x2={CH.x} y2={CH.y + CH.h / 2} stroke="#8AA4C2" strokeWidth={5} />
          <line x1={CH.x + CH.w} y1={CH.y + CH.h / 2} x2={TSK.x} y2={CH.y + CH.h / 2} stroke="#8AA4C2" strokeWidth={5} />
          <polygon points={`${CH.x - 2},${CH.y + CH.h / 2} ${CH.x - 18},${CH.y + CH.h / 2 - 10} ${CH.x - 18},${CH.y + CH.h / 2 + 10}`} fill="#8AA4C2" />
          <polygon points={`${TSK.x - 2},${CH.y + CH.h / 2} ${TSK.x - 18},${CH.y + CH.h / 2 - 10} ${TSK.x - 18},${CH.y + CH.h / 2 + 10}`} fill="#8AA4C2" />
          {channel.kind === "queue" ? (
            Array.from({ length: slots }).map((_, j) => (
              <rect key={j} x={CH.x + j * sw + 4} y={CH.y} width={sw - 8} height={CH.h} rx={10} fill="#FFFFFF" stroke="#8AA4C2" strokeWidth={3} />
            ))
          ) : (
            <g>
              <rect x={CH.x + CH.w / 2 - 70} y={CH.y} width={140} height={CH.h} rx={16} fill={notifyCount ? tint("accent") : "#FFFFFF"} stroke="#8AA4C2" strokeWidth={3} />
              <text x={CH.x + CH.w / 2} y={CH.y + 54} textAnchor="middle" fontSize={36} fontWeight={700} fill={notifyCount ? accentColor : mutedColor}>
                🔔 {notifyCount}
              </text>
            </g>
          )}
          {channel.sendLabel && (
            <text x={(ISR.x + ISR.w + TSK.x) / 2} y={CH.y - 22} textAnchor="middle" fontSize={28} fontWeight={600} fontFamily={MONO} fill={accentColor}>
              {channel.sendLabel}
            </text>
          )}
          {channel.takeLabel && (
            <text x={(ISR.x + ISR.w + TSK.x) / 2} y={CH.y + CH.h + 40} textAnchor="middle" fontSize={28} fontWeight={600} fontFamily={MONO} fill={mutedColor}>
              {channel.takeLabel}
            </text>
          )}
          {channel.label && (
            <text x={(ISR.x + ISR.w + TSK.x) / 2} y={CH.y + CH.h + 80} textAnchor="middle" fontSize={26} fontWeight={500} fill={mutedColor}>
              {channel.label}
            </text>
          )}
        </g>
        {/* Items */}
        {items.map((it, k) => {
          if (it.phase === "done") return null;
          const isrPos = { x: ISR.x + ISR.w / 2, y: ISR.y + ISR.h - 30 };
          const slotIdx = channel.kind === "notify" ? 0 : Math.min(slots - 1, qi);
          const slot = { x: channel.kind === "notify" ? CH.x + CH.w / 2 : CH.x + slotIdx * sw + sw / 2, y: CH.y + CH.h / 2 };
          const tsk = { x: TSK.x + TSK.w / 2, y: TSK.y + TSK.h / 2 };
          let p = isrPos;
          let s = 1;
          if (it.phase === "isr") s = it.u;
          if (it.phase === "drop") p = { x: isrPos.x + (slot.x - isrPos.x) * it.u, y: isrPos.y + (slot.y - isrPos.y) * it.u };
          if (it.phase === "queued") {
            p = slot;
            qi++;
          }
          if (it.phase === "drop") qi++;
          if (it.phase === "take") p = { x: CH.x + sw / 2 + (tsk.x - CH.x - sw / 2) * it.u, y: slot.y + (tsk.y - slot.y) * it.u };
          if (it.phase === "run") return null;
          if (channel.kind === "notify" && it.phase === "queued") return null;
          return (
            <g key={k} transform={`translate(${p.x} ${p.y}) scale(${s})`}>
              <rect x={-34} y={-24} width={68} height={48} rx={10} fill={accentColor} />
              <text x={0} y={9} textAnchor="middle" fontSize={22} fontWeight={700} fontFamily={MONO} fill="#FFFFFF">
                {it.label}
              </text>
            </g>
          );
        })}
        {/* Yield arrow */}
        {yieldAt && shown(yieldAt.atSeconds) && (
          <g opacity={pop(yieldAt.atSeconds)}>
            <path d={`M ${ISR.x + ISR.w / 2} ${ISR.y} C ${ISR.x + 260} ${ISR.y - 70}, ${TSK.x + 10} ${TSK.y - 70}, ${TSK.x + TSK.w / 2} ${TSK.y}`} fill="none" stroke={proColor} strokeWidth={4} strokeDasharray="10 8" />
            <text x={500} y={ISR.y - 40} textAnchor="middle" fontSize={24} fontWeight={700} fontFamily={MONO} fill={proColor}>
              {yieldAt.label}
            </text>
          </g>
        )}
      </svg>
    );
  };

  const badgeRow = () =>
    badges.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {badges.map((b, i) => {
          const v = pop(b.atSeconds);
          return (
            <div
              key={i}
              style={{
                ...panel,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: shown(b.atSeconds) ? v : 0,
                background: b.ok ? "#EAF6ED" : "#FDECEE",
              }}
            >
              <div style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: 22, background: b.ok ? proColor : conColor, color: "#FFFFFF", fontSize: 26, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {b.ok ? "✓" : "✕"}
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, fontFamily: MONO, color: b.ok ? proColor : conColor, textDecoration: b.ok ? undefined : "line-through", lineHeight: 1.2 }}>
                {b.text}
              </div>
            </div>
          );
        })}
      </div>
    );

  // ------------------------------------------------------------------ analyzer view
  const analyzerView = () => {
    const W = 1000;
    const L = 170;
    const R = 980;
    const rowH = 110;
    const top = 50;
    const H = top + laChannels.length * rowH + 70;
    const xOf = (us: number) => L + ((R - L) * us) / laSpanUs;
    const ticks = Math.floor(laSpanUs / laTickUs);
    const colorOf = (c: LaChannel, i: number) => (c.tone ? ink(c.tone) : ["#F5A524", "#4FC3F7", "#7EE787", "#F778BA"][i % 4]);
    return (
      <div style={{ background: "#16181D", borderRadius: 24, padding: "14px 10px 8px" }}>
        {laTitle && <div style={{ color: "#C7CBD1", fontSize: 24, fontWeight: 600, padding: "0 14px 4px", fontFamily: MONO }}>{laTitle}</div>}
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {/* Grid */}
          {Array.from({ length: ticks + 1 }).map((_, j) => (
            <g key={j}>
              <line x1={xOf(j * laTickUs)} y1={top - 20} x2={xOf(j * laTickUs)} y2={H - 50} stroke="#2A2E36" strokeWidth={2} />
              <text x={xOf(j * laTickUs)} y={H - 18} textAnchor="middle" fontSize={22} fill="#8B919B" fontFamily={MONO}>
                {`${+(j * laTickUs).toFixed(2)}`.replace(".", ",")}
              </text>
            </g>
          ))}
          <text x={R} y={H - 44} textAnchor="end" fontSize={20} fill="#8B919B" fontFamily={MONO}>
            µs
          </text>
          {laChannels.map((c, i) => {
            const y0 = top + i * rowH + 80;
            const y1 = top + i * rowH + 20;
            const col = colorOf(c, i);
            const prog = interpolate(t, [c.atSeconds ?? 0, (c.atSeconds ?? 0) + (c.drawSeconds ?? 1.4)], [0, 1], clamp);
            const vis = (c.atSeconds ?? 0) <= 0 ? 1 : prog;
            const xEnd = L + (R - L) * vis;
            let lvl = c.level0;
            let d = `M ${L} ${lvl ? y1 : y0}`;
            for (const e of c.edges) {
              const x = xOf(e);
              if (x > xEnd) break;
              d += ` L ${x} ${lvl ? y1 : y0}`;
              lvl = lvl ? 0 : 1;
              d += ` L ${x} ${lvl ? y1 : y0}`;
            }
            d += ` L ${xEnd} ${lvl ? y1 : y0}`;
            return (
              <g key={i} opacity={shown(c.atSeconds) ? 1 : 0}>
                <rect x={10} y={y1 - 6} width={L - 30} height={y0 - y1 + 12} rx={10} fill="#22262E" />
                <rect x={10} y={y1 - 6} width={10} height={y0 - y1 + 12} rx={4} fill={col} />
                <text x={32} y={(y0 + y1) / 2 + 9} fontSize={25} fontWeight={600} fill="#E6E8EB">
                  {c.label}
                </text>
                <path d={d} fill="none" stroke={col} strokeWidth={5} strokeLinejoin="round" />
              </g>
            );
          })}
          {laCursors.map((c, i) => {
            if (!shown(c.atSeconds)) return null;
            const v = pop(c.atSeconds);
            const a = c.from ?? 0;
            const b = c.to ?? 1;
            const ya = top + a * rowH + 10;
            const yb = top + b * rowH + 90;
            const x0 = xOf(c.x0);
            const x1 = xOf(c.x1);
            const col = c.tone ? ink(c.tone) : "#FFFFFF";
            const ym = top + Math.max(a, b) * rowH + 104;
            return (
              <g key={i} opacity={v}>
                <line x1={x0} y1={ya} x2={x0} y2={yb + 14} stroke={col} strokeWidth={3} strokeDasharray="8 6" />
                <line x1={x1} y1={ya} x2={x1} y2={yb + 14} stroke={col} strokeWidth={3} strokeDasharray="8 6" />
                <line x1={x0} y1={ym} x2={x1} y2={ym} stroke={col} strokeWidth={3} />
                <rect x={(x0 + x1) / 2 - (c.label.length * 8.5 + 22)} y={ym - 22} width={c.label.length * 17 + 44} height={44} rx={22} fill={c.tone ? ink(c.tone) : "#3A3F4A"} />
                <text x={(x0 + x1) / 2} y={ym + 9} textAnchor="middle" fontSize={26} fontWeight={700} fill="#FFFFFF" fontFamily={MONO}>
                  {c.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const histView = () => {
    if (!laHist) return null;
    const maxC = Math.max(1, ...laHist.bins.map((b) => b.count));
    const grow = interpolate(t, [laHist.atSeconds ?? 0, (laHist.atSeconds ?? 0) + 1.2], [0, 1], clamp);
    const g = (laHist.atSeconds ?? 0) <= 0 ? 1 : grow;
    return (
      <div style={{ ...panel, opacity: shown(laHist.atSeconds) ? pop(laHist.atSeconds) : 0 }}>
        <div style={{ fontSize: 28, fontWeight: 600, color: textColor, marginBottom: 8 }}>{laHist.title}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 170 }}>
          {laHist.bins.map((b, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ width: "100%", height: `${(b.count / maxC) * 100 * g}%`, minHeight: b.count ? 4 : 0, borderRadius: 8, background: ink(b.tone ?? "accent") }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {laHist.bins.map((b, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 22, color: mutedColor, fontFamily: MONO }}>
              {b.label}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 22, color: mutedColor, textAlign: "right", marginTop: 2 }}>{laHist.unit}</div>
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: portrait ? (layout === "centered" ? "230px 110px 300px 110px" : "230px 160px 300px 88px") : "100px 140px",
        display: "flex",
        flexDirection: "column",
        justifyContent: portrait ? "center" : "flex-start",
        gap: 24,
      }}
    >
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        {eyebrow && <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.01em", color: accentColor, marginBottom: 10 }}>{eyebrow}</div>}
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.05, color: textColor }}>{name}</div>
        {tagline && <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.4, color: bodyColor, marginTop: 12 }}>{tagline}</div>}
      </div>

      <div style={{ ...card, padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
        {view === "memory" && memoryView()}
        {view === "handoff" && handoffView()}
        {view === "handoff" && badgeRow()}
        {view === "analyzer" && analyzerView()}
        {view === "analyzer" && histView()}

        {info.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: info.length > 2 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12 }}>
            {info.map((c, i) => {
              const v = pop(c.atSeconds);
              return (
                <div key={i} style={{ ...panel, padding: "12px 16px", opacity: shown(c.atSeconds) ? v : 0, background: c.tone && c.tone !== "neutral" ? tint(c.tone) : panel.background }}>
                  <div style={{ fontSize: 26, color: mutedColor, fontWeight: 600 }}>{c.label}</div>
                  <div style={{ fontSize: 36, fontWeight: 700, color: c.tone && c.tone !== "neutral" ? ink(c.tone) : textColor, lineHeight: 1.2 }}>{c.value}</div>
                </div>
              );
            })}
          </div>
        )}

        {st && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ fontSize: 34, fontWeight: 600, padding: "10px 26px", borderRadius: 999, background: tint(st.tone), color: ink(st.tone), textAlign: "center" }}>{st.text}</div>
          </div>
        )}

        {caption && (
          <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.005em", lineHeight: 1.35, color: mutedColor, padding: "0 8px", opacity: pop(captionAtSeconds) }}>
            {caption}
          </div>
        )}
      </div>

      {points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {points.map((pt, i) => {
            const p = pop(pt.atSeconds ?? 1.5 + i * 0.6);
            const color = pt.kind === "pro" ? proColor : pt.kind === "con" ? conColor : accentColor;
            const mark = pt.kind === "pro" ? "✓" : pt.kind === "con" ? "✕" : "•";
            return (
              <div key={pt.text + i} style={{ display: "flex", alignItems: "flex-start", gap: 20, opacity: shown(pt.atSeconds ?? 1.5 + i * 0.6) ? p : 0, transform: `translateX(${interpolate(p, [0, 1], [30, 0])}px)` }}>
                <div style={{ flex: "0 0 auto", width: 52, height: 52, borderRadius: 26, background: color, color: "#FFFFFF", fontSize: 30, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
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
