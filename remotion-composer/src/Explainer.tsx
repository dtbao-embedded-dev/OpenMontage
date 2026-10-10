import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import interVariableUrl from "./fonts/InterVariable.woff2";
import { TextCard } from "./components/TextCard";
import { StatCard } from "./components/StatCard";
import { CalloutBox } from "./components/CalloutBox";
import { ComparisonCard } from "./components/ComparisonCard";
import { BarChart } from "./components/charts/BarChart";
import { LineChart } from "./components/charts/LineChart";
import { PieChart } from "./components/charts/PieChart";
import { KPIGrid } from "./components/charts/KPIGrid";
import { ProgressBar } from "./components/ProgressBar";
import { CaptionOverlay, WordCaption } from "./components/CaptionOverlay";
import { SectionTitle } from "./components/SectionTitle";
import { StatReveal } from "./components/StatReveal";
import { HeroTitle } from "./components/HeroTitle";
import { AnimeScene } from "./components/AnimeScene";
import type { CameraMotion } from "./components/AnimeScene";
import { TerminalScene } from "./components/TerminalScene";
import type { TerminalStep } from "./components/TerminalScene";
import { ScreenshotScene } from "./components/ScreenshotScene";
import type { ScreenshotStep } from "./components/ScreenshotScene";
import { ProviderChip } from "./components/ProviderChip";
import { ChipSpotlight } from "./components/ChipSpotlight";
import type { ChipSpec, RadioBadge } from "./components/ChipSpotlight";
import { LetterGrid } from "./components/LetterGrid";
import type { LetterTile } from "./components/LetterGrid";
import { BoardTeardown } from "./components/BoardTeardown";
import type { TeardownSpot } from "./components/BoardTeardown";
import { CodeCompare } from "./components/CodeCompare";
import type { CodePoint, CodeLayer } from "./components/CodeCompare";
import { CoreTimeline } from "./components/CoreTimeline";
import type { TimelineLane, TimelineLog } from "./components/CoreTimeline";
import { WifiTopology } from "./components/WifiTopology";
import type { TopologyLink, TopologyNode, TopologyRange } from "./components/WifiTopology";
import { MetricBars } from "./components/MetricBars";
import type { MetricRow } from "./components/MetricBars";
import { BoardMatrix } from "./components/BoardMatrix";
import type { MatrixBoard, MatrixRow, MatrixFocus, MatrixVerdict } from "./components/BoardMatrix";
import { CircuitDiagram } from "./components/CircuitDiagram";
import type { CircuitPart } from "./components/CircuitDiagram";
import { LogicWave } from "./components/LogicWave";
import { ImuScope } from "./components/ImuScope";
import type { ImuBand, ImuFormula, ImuLine, ImuMarker, ImuPose, ImuReadout, ImuSeries, ImuSpectrum, ImuStatus } from "./components/ImuScope";
import type { WavePanel } from "./components/LogicWave";
import { OledScreen } from "./components/OledScreen";
import type { OledByte, OledCodeHighlight, OledKnob, OledLayer, OledMark, OledPages } from "./components/OledScreen";
import { TouchPad } from "./components/TouchPad";
import type { TouchChart, TouchDrop, TouchFinger, TouchGridWindow, TouchGuard, TouchPadDef, TouchWire } from "./components/TouchPad";
import { FlashMap } from "./components/FlashMap";
import type { FlashGroup, FlashLegendItem, FlashLink, FlashMeter, FlashPower } from "./components/FlashMap";
import { PhoneGatt } from "./components/PhoneGatt";
import type { GattDialog, GattLogLine, GattRow, GattSideItem, GattValue } from "./components/PhoneGatt";
import { WledApp } from "./components/WledApp";
import type { WledAudio, WledPacket, WledScreen, WledStep, WledStrip } from "./components/WledApp";
import { Roadmap } from "./components/Roadmap";
import type { RoadmapFocus, RoadmapItem, RoadmapStage } from "./components/Roadmap";
import { BrowserPage } from "./components/BrowserPage";
import type { BrowserCard, BrowserFrameLine, BrowserLedState, BrowserValue, BrowserWindow } from "./components/BrowserPage";
import { PhoneProv } from "./components/PhoneProv";
import type { ProvLogLine, ProvScreen, ProvSideItem } from "./components/PhoneProv";
import { PhoneRmaker } from "./components/PhoneRmaker";
import type { RmakerLogLine, RmakerPowerStep, RmakerRoute, RmakerScreen } from "./components/PhoneRmaker";
import { TlsCert } from "./components/TlsCert";
import type { CertCard, CertClock, CertLog, CertVerdict } from "./components/TlsCert";
import { resolveAsset } from "./lib/resolveAsset";
import type { ParticleType } from "./components/ParticleOverlay";
import { resolveTheme, type ThemeConfig, DEFAULT_THEME } from "./Root";

// Load Space Grotesk font for cinematic typography
const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

// Inter covers Vietnamese; it is the fallback for every theme font and the
// family components name in their own defaults ("Inter, system-ui, ...").
// It is bundled (rsms/inter InterVariable.woff2, OFL, all weights, full Vietnamese) instead of fetched from
// Google Fonts: the Google loader gives up after 18 s per subset and lets the frame render anyway, so under
// render concurrency some tabs drew "ư/ơ" in a fallback font and the glyphs jumped between frames.
// Rendering waits for this face and fails loudly if it cannot load.
const interFamily = "Inter";
if (typeof FontFace !== "undefined" && typeof document !== "undefined") {
  const interHandle = delayRender("Loading bundled Inter variable font", { timeoutInMilliseconds: 60000 });
  const interFace = new FontFace(interFamily, `url(${interVariableUrl}) format('woff2')`, {
    weight: "100 900",
    style: "normal",
  });
  interFace
    .load()
    .then(() => {
      document.fonts.add(interFace);
      continueRender(interHandle);
    })
    .catch((err) => cancelRender(err));
}

// ---------------------------------------------------------------------------
// Animated Background — Gradient Mesh + Floating Orbs
// ---------------------------------------------------------------------------

// Parse hex color to RGB components
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

// Detect if a color is "light" (for choosing grid/overlay treatment)
function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// Scrim painted behind a hero title. It has to wash *away* from the theme's
// text color: a dark scrim under a light theme's dark text drops the pair to
// ~3.4:1, which is the same legibility bug in reverse.
function heroScrim(theme: ThemeConfig): string {
  const { r, g, b } = hexToRgb(
    isLightColor(theme.backgroundColor) ? "#FFFFFF" : "#0F172A"
  );
  return (
    `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.35) 0%, ` +
    `rgba(${r},${g},${b},0.55) 100%)`
  );
}

// Darken/lighten a color by mixing toward black or white
function shiftColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  if (amount < 0) {
    // Darken
    const f = 1 + amount;
    return `rgb(${clamp(r * f)}, ${clamp(g * f)}, ${clamp(b * f)})`;
  }
  // Lighten
  return `rgb(${clamp(r + (255 - r) * amount)}, ${clamp(g + (255 - g) * amount)}, ${clamp(b + (255 - b) * amount)})`;
}

const AnimatedBackground: React.FC<{ theme: ThemeConfig }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const bg = theme.backgroundColor;
  const primary = theme.primaryColor;
  const accent = theme.accentColor;
  const surface = theme.surfaceColor;
  const light = isLightColor(bg);

  // Slow-moving gradient angles
  const angle1 = 135 + Math.sin(frame / (fps * 8)) * 30;

  // Build gradient from theme colors instead of hardcoded dark blue
  const { r: bgR, g: bgG, b: bgB } = hexToRgb(bg);
  const { r: priR, g: priG, b: priB } = hexToRgb(primary);
  const { r: accR, g: accG, b: accB } = hexToRgb(accent);

  const gradient = `
    radial-gradient(ellipse at ${30 + Math.sin(frame / (fps * 10)) * 20}% ${40 + Math.cos(frame / (fps * 8)) * 20}%,
      rgba(${priR}, ${priG}, ${priB}, 0.15) 0%, transparent 60%),
    radial-gradient(ellipse at ${70 + Math.cos(frame / (fps * 7)) * 20}% ${60 + Math.sin(frame / (fps * 9)) * 25}%,
      rgba(${accR}, ${accG}, ${accB}, 0.1) 0%, transparent 55%),
    linear-gradient(${angle1}deg, ${bg} 0%, ${shiftColor(bg, light ? -0.05 : 0.05)} 40%, ${surface} 70%, ${bg} 100%)
  `;

  // Floating orbs — derived from theme chart colors with low opacity
  const orbColors = theme.chartColors.slice(0, 5);
  const orbOpacity = light ? 0.06 : 0.08;
  const orbs = [
    { x: 20, y: 30, size: 300, color: orbColors[0] || primary, speedX: 7, speedY: 11 },
    { x: 70, y: 60, size: 250, color: orbColors[1] || accent, speedX: 9, speedY: 8 },
    { x: 40, y: 80, size: 200, color: orbColors[2] || primary, speedX: 13, speedY: 6 },
    { x: 80, y: 20, size: 350, color: orbColors[3] || accent, speedX: 11, speedY: 14 },
    { x: 10, y: 70, size: 180, color: orbColors[4] || primary, speedX: 8, speedY: 10 },
  ];

  // Grid and overlay colors adapt to light vs dark backgrounds
  const gridColor = light ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.02)";
  const fadeColor = light
    ? `rgba(${bgR},${bgG},${bgB},0.2)`
    : `rgba(${bgR},${bgG},${bgB},0.4)`;

  return (
    <AbsoluteFill style={{ background: gradient }}>
      {/* Floating glow orbs */}
      {orbs.map((orb, i) => {
        const ox = orb.x + Math.sin(frame / (fps * orb.speedX)) * 15;
        const oy = orb.y + Math.cos(frame / (fps * orb.speedY)) * 12;
        const { r, g, b } = hexToRgb(orb.color);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${ox}%`,
              top: `${oy}%`,
              width: orb.size,
              height: orb.size,
              borderRadius: "50%",
              background: `rgba(${r}, ${g}, ${b}, ${orbOpacity})`,
              filter: `blur(${orb.size * 0.4}px)`,
              transform: "translate(-50%, -50%)",
              willChange: "transform",
            }}
          />
        );
      })}

      {/* Subtle grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(${gridColor} 1px, transparent 1px),
            linear-gradient(90deg, ${gridColor} 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          opacity: 0.5 + Math.sin(frame / (fps * 20)) * 0.2,
        }}
      />

      {/* Top gradient fade for depth */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "30%",
          background: `linear-gradient(to bottom, ${fadeColor}, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Types — aligned with edit_decisions artifact schema
// ---------------------------------------------------------------------------

interface Cut {
  id: string;
  source: string;
  in_seconds: number;
  out_seconds: number;
  layer?: string;
  type?: string;
  // Component-specific props
  text?: string;
  stat?: string;
  subtitle?: string;
  callout_type?: "info" | "warning" | "tip" | "quote";
  title?: string;
  // Video source trim — seek to this point in the source before playback.
  // Defaults to 0 (play from beginning). Use this instead of in_seconds for source trimming.
  source_in_seconds?: number;
  // Comparison props
  leftLabel?: string;
  rightLabel?: string;
  leftValue?: string;
  rightValue?: string;
  // Chart props
  chartData?: any[];
  chartSeries?: any[];
  chartColors?: string[];
  chartAnimation?: string;
  donut?: boolean;
  centerLabel?: string;
  centerValue?: string;
  showGrid?: boolean;
  showValues?: boolean;
  showLegend?: boolean;
  showMarkers?: boolean;
  xLabel?: string;
  yLabel?: string;
  columns?: 2 | 3 | 4;
  // Progress bar props
  progress?: number;
  progressLabel?: string;
  progressColor?: string;
  progressAnimation?: string;
  progressSegments?: any[];
  // Hero title props (when used as scene, not overlay)
  heroSubtitle?: string;
  // Styling overrides
  backgroundColor?: string;
  cardBackgroundColor?: string; // Inner card surface (comparison); defaults to theme.surfaceColor
  backgroundImage?: string; // AI-generated or stock image rendered behind the component
  backgroundVideo?: string; // Video clip rendered behind the component (takes priority over backgroundImage)
  backgroundVideoStart?: number; // Seek position in seconds for background video (default 0)
  backgroundOverlay?: number; // Opacity of dark overlay on backgroundImage/backgroundVideo (0-1, default 0.55)
  color?: string;
  accentColor?: string;
  fontSize?: number;
  // Animation & transitions
  animation?: string;
  transition_in?: string;
  transition_out?: string;
  transition_duration?: number;
  transform?: {
    animation?: string;
    scale?: number;
    position?: string | { x: number; y: number };
  };
  // Anime scene props (type: "anime_scene")
  images?: string[];
  particles?: ParticleType;
  particleColor?: string;
  particleCount?: number;
  particleIntensity?: number;
  vignette?: boolean;
  lightingFrom?: string;
  lightingTo?: string;
  // Terminal scene props (type: "terminal_scene")
  steps?: TerminalStep[];
  terminalTitle?: string;
  terminalHeight?: number | string; // window height; fontSize sets the body text size
  prompt?: string;
  // Screenshot scene props (type: "screenshot_scene")
  screenshotSteps?: ScreenshotStep[];
  screenshotSize?: { width: number; height: number };
  cursorStartAt?: [number, number];
  // Chip spotlight props (type: "chip_spotlight")
  image?: string;
  chipName?: string;
  tagline?: string;
  specs?: ChipSpec[];
  radios?: RadioBadge[];
  companionImage?: string;
  companionLabel?: string;
  companionAtSeconds?: number;
  eyebrow?: string;
  bestFor?: string;
  imageRadius?: number; // chip_spotlight: round the corners of a rectangular photo
  // Light-background styling shared by chip_spotlight and letter_grid
  cardBorderColor?: string; // divider / tile border; defaults to the dark-theme faint white
  shadowOpacity?: number;
  hideGlow?: boolean;
  // Letter grid props (type: "letter_grid")
  tiles?: LetterTile[];
  footer?: string;
  footerAtSeconds?: number;
  // Board teardown props (type: "board_teardown"; reuses `image`)
  imageSize?: { width: number; height: number };
  spots?: TeardownSpot[];
  // Portrait layout for board_teardown / letter_grid: "safe" (default) or "centered" on the frame
  layout?: "safe" | "centered";
  // Code compare props (type: "code_compare"; reuses `eyebrow`, `tagline`)
  name?: string;
  code?: string[];
  codeTitle?: string;
  codeAtSeconds?: number;
  codeRevealSeconds?: number;
  codeFontSize?: number;
  layers?: CodeLayer[];
  points?: CodePoint[];
  // Core timeline props (type: "core_timeline"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  lanes?: TimelineLane[];
  units?: number;
  axisLabel?: string;
  timelineLog?: TimelineLog;
  // Wi-Fi topology props (type: "wifi_topology"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`, `timelineLog`)
  nodes?: TopologyNode[];
  links?: TopologyLink[];
  ranges?: TopologyRange[];
  diagramHeight?: number;
  // Metric bars props (type: "metric_bars"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  metricRows?: MetricRow[];
  metricScale?: "linear" | "log";
  metricBaseline?: number;
  metricMax?: number;
  metricSource?: string;
  metricSourceAtSeconds?: number;
  // Board matrix props (type: "board_matrix"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  matrixBoards?: MatrixBoard[];
  matrixRows?: MatrixRow[];
  matrixFocus?: MatrixFocus[];
  matrixVerdicts?: MatrixVerdict[];
  matrixImageHeight?: number;
  matrixSource?: string;
  matrixSourceAtSeconds?: number;
  // Circuit diagram props (type: "circuit_diagram"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  circuitParts?: CircuitPart[];
  circuitViewHeight?: number;
  // Logic wave props (type: "logic_wave"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  wavePanels?: WavePanel[];
  waveCaption?: string;
  waveCaptionAtSeconds?: number;
  // IMU scope props (type: "imu_scope"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  imuRate?: number;
  imuSeries?: ImuSeries[];
  imuPlotTitle?: string;
  imuYMin?: number;
  imuYMax?: number;
  imuYTicks?: { v: number; label: string }[];
  imuSpanSeconds?: number;
  imuScroll?: boolean;
  imuLines?: ImuLine[];
  imuBands?: ImuBand[];
  imuMarkers?: ImuMarker[];
  imuPlotHeight?: number;
  imuReadouts?: ImuReadout[];
  imuPose?: ImuPose;
  imuBoardLabel?: string;
  imuStatus?: ImuStatus[];
  imuFormula?: ImuFormula;
  imuSpectrum?: ImuSpectrum;
  imuCaption?: string;
  imuCaptionAtSeconds?: number;
  // OLED screen props (type: "oled_screen"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`, `code`, `codeTitle`,
  // `codeAtSeconds`, `codeRevealSeconds`, `codeFontSize`)
  oledLayers?: OledLayer[];
  oledRows?: number;
  oledColor?: "white" | "blue" | "yellow-blue";
  oledPins?: string[];
  oledBoardWidth?: number;
  oledMarks?: OledMark[];
  oledPages?: OledPages;
  oledByte?: OledByte;
  oledGridAtSeconds?: number;
  oledGridUntilSeconds?: number;
  oledCaption?: string;
  oledCaptionAtSeconds?: number;
  oledKnob?: OledKnob;
  codeHighlights?: OledCodeHighlight[];
  // Touch panel props (type: "touch_pad"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  touchPads?: TouchPadDef[];
  touchPanelHeight?: number;
  touchFingers?: TouchFinger[];
  touchDrops?: TouchDrop[];
  touchFlood?: { atSeconds: number; untilSeconds?: number };
  touchGrid?: TouchGridWindow[];
  touchWires?: TouchWire[];
  touchGuard?: TouchGuard;
  touchChart?: TouchChart;
  touchMeters?: boolean;
  touchActiveLabel?: string;
  touchFalseLabel?: string;
  touchPausedLabel?: string;
  touchCaption?: string;
  touchCaptionAtSeconds?: number;
  // Flash map props (type: "flash_map"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  flashGroups?: FlashGroup[];
  flashLinks?: FlashLink[];
  flashPower?: FlashPower[];
  flashMeters?: FlashMeter[];
  flashLegend?: FlashLegendItem[];
  flashCaption?: string;
  flashCaptionAtSeconds?: number;
  // Phone GATT client props (type: "phone_gatt"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  gattScreenTitle?: string;
  gattStatus?: GattValue[];
  gattRows?: GattRow[];
  gattDialog?: GattDialog;
  gattPhoneCaption?: string;
  gattSideTitle?: string;
  gattSide?: GattSideItem[];
  gattLog?: GattLogLine[];
  gattLogTitle?: string;
  gattLogLines?: number;
  // WLED app props (type: "wled_app"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  wledScreens?: WledScreen[];
  wledPanelHeight?: number;
  wledPhoneWidth?: number;
  wledPanelCaption?: string;
  wledStrips?: WledStrip[];
  wledEffects?: WledStep[];
  wledAudio?: WledAudio;
  wledPackets?: WledPacket[];
  wledCaption?: string;
  // Browser page props (type: "browser_page"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  browserWindows?: BrowserWindow[];
  browserPageTitle?: string;
  browserCards?: BrowserCard[];
  browserLed?: BrowserLedState[];
  browserLedLabel?: string;
  browserStatus?: BrowserValue[];
  browserFrames?: BrowserFrameLine[];
  browserFramesTitle?: string;
  browserFramesLines?: number;
  browserEspLabel?: string;
  browserEspAtSeconds?: number;
  browserEspLed?: BrowserLedState[];
  browserCaption?: string;
  // Provisioning app props (type: "phone_prov"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  provScreens?: ProvScreen[];
  provPhoneCaption?: string;
  provSideTitle?: string;
  provSide?: ProvSideItem[];
  provLog?: ProvLogLine[];
  provLogTitle?: string;
  provLogLines?: number;
  // RainMaker app props (type: "phone_rmaker"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  rmakerScreens?: RmakerScreen[];
  rmakerPhoneCaption?: string;
  rmakerRoutes?: RmakerRoute[];
  rmakerBoardTitle?: string;
  rmakerBoardLabel?: string;
  rmakerBoardPower?: RmakerPowerStep[];
  rmakerBoardPresses?: number[];
  rmakerLog?: RmakerLogLine[];
  rmakerLogTitle?: string;
  rmakerLogLines?: number;
  // TLS certificate props (type: "tls_cert"; reuses `name`, `eyebrow`, `tagline`, `points`, `layout`)
  certCards?: CertCard[];
  certClock?: CertClock;
  certVerdict?: CertVerdict[];
  certLog?: CertLog;
  // Learning roadmap props (type: "roadmap"; reuses `name`, `eyebrow`, `tagline`, `layout`)
  roadmapMode?: "overview" | "stage";
  roadmapStages?: RoadmapStage[];
  roadmapStart?: { text: string; sub?: string };
  roadmapGoal?: { text: string; sub?: string; atSeconds?: number; reachedAtSeconds?: number };
  roadmapFocus?: RoadmapFocus[];
  roadmapGhost?: boolean;
  roadmapLegend?: RoadmapItem[];
  roadmapLegendTitle?: string;
  roadmapCurrent?: number;
  roadmapTopics?: RoadmapItem[];
  roadmapDocs?: RoadmapItem[];
  roadmapProject?: RoadmapItem;
  roadmapVideos?: { items: string[]; atSeconds?: number; label?: string };
}

interface Overlay {
  type: "section_title" | "stat_reveal" | "hero_title" | "provider_chip";
  in_seconds: number;
  out_seconds: number;
  text?: string;
  subtitle?: string;
  accentColor?: string;
  position?: string;
  // provider_chip
  providers?: string[];
  cycleSeconds?: number;
  label?: string;
}

interface AudioLayer {
  src: string;
  volume?: number;
}

interface AudioConfig {
  narration?: AudioLayer;
  music?: AudioLayer & {
    fadeInSeconds?: number;
    fadeOutSeconds?: number;
    /** Start playback from this offset in seconds (skip quiet intros).
     *  Use the audio_energy tool to find the optimal offset. */
    offsetSeconds?: number;
    /** Loop the music if it's shorter than the video duration. */
    loop?: boolean;
  };
}

export interface ExplainerProps {
  [key: string]: unknown;
  cuts: Cut[];
  overlays?: Overlay[];
  captions?: WordCaption[];
  audio?: AudioConfig;
  /** Seconds of padding after the last cut (default 1). */
  tailPaddingSeconds?: number;
}

// ---------------------------------------------------------------------------
// Image Extensions
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".avi", ".mkv"];

function isImage(source: string): boolean {
  const lower = source.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isVideo(source: string): boolean {
  const lower = source.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// ---------------------------------------------------------------------------
// Cinematic vignette overlay
// ---------------------------------------------------------------------------

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)",
      pointerEvents: "none",
    }}
  />
);

// ---------------------------------------------------------------------------
// Enhanced Image Scene — spring physics, parallax, variety
// ---------------------------------------------------------------------------

const ImageScene: React.FC<{
  src: string;
  animation?: string;
  fadeIn?: boolean;
  vignette?: boolean;
  backgroundColor?: string;
}> = ({ src, animation, fadeIn: withFadeIn = true, vignette = true, backgroundColor = "#0F172A" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Smooth spring fade-in
  // transition_in "cut" shows the image at full opacity from frame 0 (e.g. an intro card used as the cover frame)
  const fadeIn = withFadeIn ? spring({ frame, fps, config: { damping: 18, stiffness: 80 } }) : 1;

  // Fade-out for crossfade effect
  const fadeOutStart = durationInFrames - 8;
  const fadeOut = interpolate(frame, [fadeOutStart, durationInFrames], [1, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  const anim = animation || "zoom-in";

  // Progress with easing — smoother than linear
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (anim === "zoom-in") {
    scale = 1 + progress * 0.18;
  } else if (anim === "zoom-out") {
    scale = 1.18 - progress * 0.18;
  } else if (anim === "pan-left") {
    translateX = interpolate(progress, [0, 1], [40, -40]);
    scale = 1.15;
  } else if (anim === "pan-right") {
    translateX = interpolate(progress, [0, 1], [-40, 40]);
    scale = 1.15;
  } else if (anim === "ken-burns" || anim === "ken-burns-slow-zoom") {
    // Cinematic Ken Burns: gentle zoom + diagonal drift
    scale = 1 + progress * 0.22;
    translateX = interpolate(progress, [0, 1], [0, -25]);
    translateY = interpolate(progress, [0, 1], [0, -15]);
  } else if (anim === "parallax") {
    // Subtle parallax — foreground moves faster
    translateY = interpolate(progress, [0, 1], [15, -15]);
    scale = 1.1;
  }
  // "static" or "none" → just display

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: backgroundColor }}>
      <Img
        src={resolveAsset(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: fadeIn * fadeOut,
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          willChange: "transform, opacity",
        }}
      />
      {vignette && <Vignette />}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Enhanced Video Scene
// ---------------------------------------------------------------------------

const VideoScene: React.FC<{
  src: string;
  startFrom?: number;
  transitionIn?: string;
  transitionOut?: string;
  transitionDuration?: number;
  sceneDurationSeconds: number;
  backgroundColor?: string;
}> = ({
  src,
  startFrom = 0,
  transitionIn,
  transitionOut,
  transitionDuration,
  sceneDurationSeconds,
  backgroundColor = "#0F172A",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationInFrames = Math.max(1, Math.round(sceneDurationSeconds * fps));

  const hardIn = ["cut", "none"].includes((transitionIn || "").toLowerCase());
  const hardOut = ["cut", "none"].includes((transitionOut || "").toLowerCase());
  const transitionFrames = Math.max(
    1,
    Math.round((transitionDuration ?? 8 / fps) * fps),
  );
  const fadeIn = hardIn
    ? 1
    : interpolate(frame, [0, transitionFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const fadeOutStart = Math.max(0, durationInFrames - transitionFrames);
  const fadeOut = hardOut
    ? 1
    : interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  return (
    <AbsoluteFill style={{ background: backgroundColor }}>
      <OffthreadVideo
        src={resolveAsset(src)}
        startFrom={Math.round(startFrom * fps)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: fadeIn * fadeOut,
        }}
        muted
      />
      <Vignette />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Scene renderer — maps cut type / source to the right component
// ---------------------------------------------------------------------------

// Background image layer — renders an AI-generated/stock image behind data components
const BackgroundImageLayer: React.FC<{
  src: string;
  overlayOpacity?: number;
  children: React.ReactNode;
}> = ({ src, overlayOpacity = 0.55, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Subtle ken-burns on the background
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bgScale = 1 + progress * 0.08;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Background image with subtle zoom */}
      <Img
        src={resolveAsset(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${bgScale})`,
          willChange: "transform",
        }}
      />
      {/* Dark overlay for readability */}
      <AbsoluteFill
        style={{
          background: `rgba(15, 23, 42, ${overlayOpacity})`,
        }}
      />
      {/* Component content on top */}
      {children}
    </AbsoluteFill>
  );
};

// Background video layer — plays a looping video behind component content with dark overlay
const BackgroundVideoLayer: React.FC<{
  src: string;
  startFrom?: number;
  overlayOpacity?: number;
  children: React.ReactNode;
}> = ({ src, startFrom = 0, overlayOpacity = 0.55, children }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* Background video */}
      <OffthreadVideo
        src={resolveAsset(src)}
        startFrom={Math.round(startFrom * fps)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
        muted
      />
      {/* Dark overlay for readability */}
      <AbsoluteFill
        style={{
          background: `rgba(15, 23, 42, ${overlayOpacity})`,
        }}
      />
      {/* Component content on top */}
      {children}
    </AbsoluteFill>
  );
};

const SceneRenderer: React.FC<{ cut: Cut; theme: ThemeConfig }> = ({ cut, theme }) => {
  // Wrap component with background video or image if specified
  const maybeWrapWithBg = (element: React.ReactElement) => {
    if (cut.backgroundVideo) {
      return (
        <BackgroundVideoLayer
          src={cut.backgroundVideo}
          startFrom={cut.backgroundVideoStart ?? 0}
          overlayOpacity={cut.backgroundOverlay ?? 0.55}
        >
          {element}
        </BackgroundVideoLayer>
      );
    }
    if (cut.backgroundImage) {
      return (
        <BackgroundImageLayer
          src={cut.backgroundImage}
          overlayOpacity={cut.backgroundOverlay ?? 0.55}
        >
          {element}
        </BackgroundImageLayer>
      );
    }
    return element;
  };

  // Resolve the scene element based on cut type, then wrap with backgroundImage if set
  // Use transparent bg so the animated gradient background shows through
  // When no explicit backgroundColor on the cut, inherit from theme
  const rawBg = (cut.backgroundImage || cut.backgroundVideo) ? "transparent" : (cut.backgroundColor || theme.surfaceColor);
  const bgColor = (rawBg === theme.backgroundColor || rawBg === "#0F172A" || rawBg === "#0f172a") ? "transparent" : rawBg;
  const textColor = cut.color || theme.textColor;
  const accent = cut.accentColor || theme.accentColor;

  // Explicit component types — use theme-derived defaults for colors
  if (cut.type === "text_card" && cut.text) {
    return maybeWrapWithBg(
      <TextCard text={cut.text} fontSize={cut.fontSize} color={textColor} backgroundColor={bgColor} />
    );
  }
  if (cut.type === "stat_card" && cut.stat) {
    return maybeWrapWithBg(
      <StatCard stat={cut.stat} subtitle={cut.subtitle} accentColor={accent} backgroundColor={bgColor} />
    );
  }
  if (cut.type === "callout" && cut.text) {
    return maybeWrapWithBg(
      <CalloutBox
        text={cut.text} type={cut.callout_type} title={cut.title}
        borderColor={accent} backgroundColor={cut.backgroundColor || theme.surfaceColor}
        textColor={textColor} containerBackgroundColor={bgColor}
      />
    );
  }
  if (cut.type === "comparison" && cut.leftLabel && cut.rightLabel && cut.leftValue && cut.rightValue) {
    return maybeWrapWithBg(
      <ComparisonCard
        leftLabel={cut.leftLabel} rightLabel={cut.rightLabel}
        leftValue={cut.leftValue} rightValue={cut.rightValue}
        title={cut.title} backgroundColor={bgColor} textColor={textColor}
        cardBackgroundColor={cut.cardBackgroundColor || theme.surfaceColor}
      />
    );
  }
  if (cut.type === "hero_title" && cut.text) {
    return maybeWrapWithBg(
      <HeroTitle
        title={cut.text}
        subtitle={cut.heroSubtitle || cut.subtitle}
        accentColor={accent}
        textColor={textColor}
        subtitleColor={theme.mutedTextColor}
        scrimBackground={heroScrim(theme)}
        titleFontSize={cut.fontSize}
      />
    );
  }
  if (cut.type === "terminal_scene" && cut.steps) {
    return maybeWrapWithBg(
      <TerminalScene
        title={cut.terminalTitle || "Terminal"}
        steps={cut.steps as TerminalStep[]}
        prompt={cut.prompt}
        accentColor={accent}
        backgroundColor={bgColor || theme.backgroundColor}
        fontSize={cut.fontSize}
        windowHeight={cut.terminalHeight}
        eyebrow={cut.eyebrow}
        heading={cut.title}
        eyebrowColor={accent}
        headingColor={textColor}
      />
    );
  }
  if (cut.type === "screenshot_scene" && cut.backgroundImage && cut.screenshotSteps) {
    return (
      <ScreenshotScene
        backgroundImage={cut.backgroundImage}
        backgroundSize={cut.screenshotSize}
        steps={cut.screenshotSteps as ScreenshotStep[]}
        accentColor={accent}
        cursorStartAt={cut.cursorStartAt}
      />
    );
  }

  if (cut.type === "chip_spotlight" && cut.image && cut.chipName && cut.specs) {
    return maybeWrapWithBg(
      <ChipSpotlight
        image={cut.image} chipName={cut.chipName} eyebrow={cut.eyebrow} tagline={cut.tagline} specs={cut.specs}
        radios={cut.radios} bestFor={cut.bestFor}
        companionImage={cut.companionImage} companionLabel={cut.companionLabel} companionAtSeconds={cut.companionAtSeconds}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} dividerColor={cut.cardBorderColor}
        shadowOpacity={cut.shadowOpacity} hideGlow={cut.hideGlow} imageRadius={cut.imageRadius}
      />
    );
  }

  if (cut.type === "letter_grid" && cut.tiles) {
    return maybeWrapWithBg(
      <LetterGrid
        tiles={cut.tiles} title={cut.title} textColor={textColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} mutedColor={theme.mutedTextColor}
        footer={cut.footer} footerAtSeconds={cut.footerAtSeconds} layout={cut.layout}
      />
    );
  }

  if (cut.type === "board_teardown" && cut.image && cut.imageSize && cut.spots) {
    return maybeWrapWithBg(
      <BoardTeardown
        image={cut.image} imageSize={cut.imageSize} spots={cut.spots}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} viewportColor={cut.cardBackgroundColor}
        eyebrow={cut.eyebrow} heading={cut.title} layout={cut.layout}
      />
    );
  }

  if (cut.type === "code_compare" && cut.name && (cut.code || cut.layers)) {
    return maybeWrapWithBg(
      <CodeCompare
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        code={cut.code} codeTitle={cut.codeTitle} codeAtSeconds={cut.codeAtSeconds}
        codeRevealSeconds={cut.codeRevealSeconds} codeFontSize={cut.codeFontSize}
        layers={cut.layers} points={cut.points} layout={cut.layout}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor}
      />
    );
  }

  if (cut.type === "core_timeline" && cut.name && cut.lanes) {
    return maybeWrapWithBg(
      <CoreTimeline
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        lanes={cut.lanes} units={cut.units} axisLabel={cut.axisLabel} points={cut.points} log={cut.timelineLog}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "wifi_topology" && cut.name && cut.nodes) {
    return maybeWrapWithBg(
      <WifiTopology
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        nodes={cut.nodes} links={cut.links} ranges={cut.ranges} diagramHeight={cut.diagramHeight}
        points={cut.points} log={cut.timelineLog}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "board_matrix" && cut.name && cut.matrixBoards) {
    return maybeWrapWithBg(
      <BoardMatrix
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        boards={cut.matrixBoards} rows={cut.matrixRows} focus={cut.matrixFocus} verdicts={cut.matrixVerdicts}
        imageHeight={cut.matrixImageHeight} source={cut.matrixSource} sourceAtSeconds={cut.matrixSourceAtSeconds} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "metric_bars" && cut.name && cut.metricRows) {
    return maybeWrapWithBg(
      <MetricBars
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        rows={cut.metricRows} scale={cut.metricScale} baseline={cut.metricBaseline} maxValue={cut.metricMax}
        source={cut.metricSource} sourceAtSeconds={cut.metricSourceAtSeconds} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "circuit_diagram" && cut.name && cut.circuitParts) {
    return maybeWrapWithBg(
      <CircuitDiagram
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        parts={cut.circuitParts} viewHeight={cut.circuitViewHeight} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "logic_wave" && cut.name && cut.wavePanels) {
    return maybeWrapWithBg(
      <LogicWave
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        panels={cut.wavePanels} caption={cut.waveCaption} captionAtSeconds={cut.waveCaptionAtSeconds} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "imu_scope" && cut.name && cut.imuRate) {
    return maybeWrapWithBg(
      <ImuScope
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        rate={cut.imuRate} series={cut.imuSeries} plotTitle={cut.imuPlotTitle} yMin={cut.imuYMin ?? 0} yMax={cut.imuYMax ?? 1}
        yTicks={cut.imuYTicks} spanSeconds={cut.imuSpanSeconds ?? 10} scroll={cut.imuScroll} lines={cut.imuLines} bands={cut.imuBands}
        markers={cut.imuMarkers} plotHeight={cut.imuPlotHeight} readouts={cut.imuReadouts} pose={cut.imuPose}
        boardLabel={cut.imuBoardLabel} status={cut.imuStatus} formula={cut.imuFormula} spectrum={cut.imuSpectrum}
        caption={cut.imuCaption} captionAtSeconds={cut.imuCaptionAtSeconds} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "oled_screen" && cut.name && cut.oledLayers) {
    return maybeWrapWithBg(
      <OledScreen
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        layers={cut.oledLayers} rows={cut.oledRows} panelColor={cut.oledColor} pins={cut.oledPins} boardWidth={cut.oledBoardWidth}
        marks={cut.oledMarks} pages={cut.oledPages} byte={cut.oledByte}
        gridAtSeconds={cut.oledGridAtSeconds} gridUntilSeconds={cut.oledGridUntilSeconds}
        caption={cut.oledCaption} captionAtSeconds={cut.oledCaptionAtSeconds}
        code={cut.code} codeTitle={cut.codeTitle} codeAtSeconds={cut.codeAtSeconds} codeRevealSeconds={cut.codeRevealSeconds}
        codeFontSize={cut.codeFontSize} codeHighlights={cut.codeHighlights} knob={cut.oledKnob} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "touch_pad" && cut.name && cut.touchPads) {
    return maybeWrapWithBg(
      <TouchPad
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        pads={cut.touchPads} panelHeight={cut.touchPanelHeight} fingers={cut.touchFingers} drops={cut.touchDrops}
        flood={cut.touchFlood} grid={cut.touchGrid} wires={cut.touchWires} guard={cut.touchGuard} chart={cut.touchChart} meters={cut.touchMeters}
        activeLabel={cut.touchActiveLabel} falseLabel={cut.touchFalseLabel} pausedLabel={cut.touchPausedLabel}
        caption={cut.touchCaption} captionAtSeconds={cut.touchCaptionAtSeconds} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "flash_map" && cut.name && cut.flashGroups) {
    return maybeWrapWithBg(
      <FlashMap
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        groups={cut.flashGroups} links={cut.flashLinks} power={cut.flashPower} meters={cut.flashMeters} legend={cut.flashLegend}
        caption={cut.flashCaption} captionAtSeconds={cut.flashCaptionAtSeconds} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "phone_gatt" && cut.name && cut.gattScreenTitle && cut.gattRows) {
    return maybeWrapWithBg(
      <PhoneGatt
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        screenTitle={cut.gattScreenTitle} status={cut.gattStatus} rows={cut.gattRows} dialog={cut.gattDialog}
        phoneCaption={cut.gattPhoneCaption} sideTitle={cut.gattSideTitle} side={cut.gattSide}
        log={cut.gattLog} logTitle={cut.gattLogTitle} logLines={cut.gattLogLines} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "phone_prov" && cut.name && cut.provScreens) {
    return maybeWrapWithBg(
      <PhoneProv
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline} screens={cut.provScreens}
        phoneCaption={cut.provPhoneCaption} sideTitle={cut.provSideTitle} side={cut.provSide}
        log={cut.provLog} logTitle={cut.provLogTitle} logLines={cut.provLogLines} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "phone_rmaker" && cut.name && cut.rmakerScreens) {
    return maybeWrapWithBg(
      <PhoneRmaker
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline} screens={cut.rmakerScreens}
        phoneCaption={cut.rmakerPhoneCaption} routes={cut.rmakerRoutes} boardTitle={cut.rmakerBoardTitle}
        boardLabel={cut.rmakerBoardLabel} boardPower={cut.rmakerBoardPower} boardPresses={cut.rmakerBoardPresses}
        log={cut.rmakerLog} logTitle={cut.rmakerLogTitle} logLines={cut.rmakerLogLines} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "tls_cert" && cut.name) {
    return maybeWrapWithBg(
      <TlsCert
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        cards={cut.certCards} clock={cut.certClock} verdict={cut.certVerdict} log={cut.certLog} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "browser_page" && cut.name && cut.browserWindows) {
    return maybeWrapWithBg(
      <BrowserPage
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        windows={cut.browserWindows} pageTitle={cut.browserPageTitle} cards={cut.browserCards} led={cut.browserLed}
        ledLabel={cut.browserLedLabel} status={cut.browserStatus} frames={cut.browserFrames} framesTitle={cut.browserFramesTitle}
        framesLines={cut.browserFramesLines} espLabel={cut.browserEspLabel} espAtSeconds={cut.browserEspAtSeconds} espLed={cut.browserEspLed}
        caption={cut.browserCaption} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "roadmap" && cut.name && cut.roadmapStages) {
    return maybeWrapWithBg(
      <Roadmap
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline} mode={cut.roadmapMode} stages={cut.roadmapStages}
        start={cut.roadmapStart} goal={cut.roadmapGoal} focus={cut.roadmapFocus} ghost={cut.roadmapGhost} legend={cut.roadmapLegend}
        legendTitle={cut.roadmapLegendTitle} current={cut.roadmapCurrent} topics={cut.roadmapTopics} docs={cut.roadmapDocs}
        project={cut.roadmapProject} videos={cut.roadmapVideos}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  if (cut.type === "wled_app" && cut.name) {
    return maybeWrapWithBg(
      <WledApp
        name={cut.name} eyebrow={cut.eyebrow} tagline={cut.tagline}
        screens={cut.wledScreens} panelHeight={cut.wledPanelHeight} phoneWidth={cut.wledPhoneWidth} panelCaption={cut.wledPanelCaption}
        strips={cut.wledStrips} effects={cut.wledEffects} audio={cut.wledAudio} packets={cut.wledPackets}
        caption={cut.wledCaption} points={cut.points}
        textColor={textColor} mutedColor={theme.mutedTextColor} accentColor={accent}
        surfaceColor={cut.cardBackgroundColor} borderColor={cut.cardBorderColor} layout={cut.layout}
      />
    );
  }

  // --- Chart types — use theme.chartColors as default palette ---
  if (cut.type === "bar_chart" && cut.chartData) {
    return maybeWrapWithBg(
      <BarChart
        data={cut.chartData} title={cut.title} colors={cut.chartColors || theme.chartColors}
        animationStyle={(cut.chartAnimation as any) || "grow-up"}
        showGrid={cut.showGrid} showValues={cut.showValues} backgroundColor={bgColor}
        textColor={textColor}
      />
    );
  }
  if (cut.type === "line_chart" && cut.chartSeries) {
    return maybeWrapWithBg(
      <LineChart
        series={cut.chartSeries} title={cut.title} colors={cut.chartColors || theme.chartColors}
        animationStyle={(cut.chartAnimation as any) || "draw"}
        showGrid={cut.showGrid} showMarkers={cut.showMarkers} showLegend={cut.showLegend}
        xLabel={cut.xLabel} yLabel={cut.yLabel} backgroundColor={bgColor}
        textColor={textColor}
      />
    );
  }
  if (cut.type === "pie_chart" && cut.chartData) {
    return maybeWrapWithBg(
      <PieChart
        data={cut.chartData} title={cut.title} colors={cut.chartColors || theme.chartColors}
        animationStyle={(cut.chartAnimation as any) || "expand"}
        donut={cut.donut} centerLabel={cut.centerLabel} centerValue={cut.centerValue}
        showLegend={cut.showLegend} backgroundColor={bgColor}
        textColor={textColor}
      />
    );
  }
  if (cut.type === "kpi_grid" && cut.chartData) {
    return maybeWrapWithBg(
      <KPIGrid
        metrics={cut.chartData} title={cut.title} columns={cut.columns}
        colors={cut.chartColors || theme.chartColors} animationStyle={(cut.chartAnimation as any) || "count-up"}
        backgroundColor={bgColor}
        textColor={textColor}
      />
    );
  }
  if (cut.type === "progress_bar" && cut.progress !== undefined) {
    return maybeWrapWithBg(
      <AbsoluteFill
        style={{
          background: bgColor || theme.surfaceColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "80px 120px",
        }}
      >
        {cut.title && (
          <div style={{
            position: "absolute", top: 120, fontSize: 48, fontWeight: 700,
            color: textColor, textAlign: "center", width: "100%",
          }}>
            {cut.title}
          </div>
        )}
        <ProgressBar
          progress={cut.progress} label={cut.progressLabel}
          color={cut.progressColor || accent}
          animationStyle={(cut.progressAnimation as any) || "fill"}
          segments={cut.progressSegments} backgroundColor={cut.backgroundColor || theme.surfaceColor}
        />
      </AbsoluteFill>
    );
  }

  // --- Anime scene (multi-image crossfade + particles) ---
  if (cut.type === "anime_scene" && cut.images && cut.images.length > 0) {
    return (
      <AnimeScene
        images={cut.images}
        animation={(cut.animation as CameraMotion) || "ken-burns"}
        particles={cut.particles}
        particleColor={cut.particleColor}
        particleCount={cut.particleCount}
        particleIntensity={cut.particleIntensity}
        backgroundColor={cut.backgroundColor}
        vignette={cut.vignette ?? true}
        lightingFrom={cut.lightingFrom}
        lightingTo={cut.lightingTo}
        sceneDurationSeconds={cut.out_seconds - cut.in_seconds}
      />
    );
  }

  // --- Media types (image / video fallback) ---
  const animation = cut.animation || cut.transform?.animation;

  if (cut.source && isImage(cut.source)) {
    return maybeWrapWithBg(<ImageScene
        src={cut.source}
        animation={animation}
        fadeIn={!["cut", "none"].includes((cut.transition_in || "").toLowerCase())}
        vignette={cut.vignette ?? true}
        backgroundColor={cut.backgroundColor}
      />);
  }

  if (cut.source && isVideo(cut.source)) {
    return maybeWrapWithBg(
      <VideoScene
        src={cut.source}
        startFrom={cut.source_in_seconds ?? 0}
        transitionIn={cut.transition_in}
        transitionOut={cut.transition_out}
        transitionDuration={cut.transition_duration}
        sceneDurationSeconds={cut.out_seconds - cut.in_seconds}
        backgroundColor={cut.backgroundColor}
      />,
    );
  }

  // Final fallback — try as image if source exists, otherwise show text_card
  if (cut.source) {
    return maybeWrapWithBg(<ImageScene
        src={cut.source}
        animation={animation}
        fadeIn={!["cut", "none"].includes((cut.transition_in || "").toLowerCase())}
        vignette={cut.vignette ?? true}
        backgroundColor={cut.backgroundColor}
      />);
  }

  // No source, no type — render as text card with cut id as fallback
  return <TextCard text={cut.text || cut.id} color={textColor} backgroundColor={bgColor} />;
};

// ---------------------------------------------------------------------------
// Overlay renderer
// ---------------------------------------------------------------------------

const OverlayRenderer: React.FC<{ overlay: Overlay; theme: ThemeConfig }> = ({
  overlay,
  theme,
}) => {
  if (overlay.type === "section_title") {
    return (
      <SectionTitle
        title={overlay.text ?? ""}
        subtitle={overlay.subtitle}
        accentColor={overlay.accentColor || theme.accentColor}
        textColor={theme.textColor}
        position={(overlay.position as any) || "top-left"}
      />
    );
  }
  if (overlay.type === "stat_reveal") {
    return (
      <StatReveal
        stat={overlay.text ?? ""}
        label={overlay.subtitle}
        accentColor={overlay.accentColor || theme.accentColor}
        textColor={theme.textColor}
        position={(overlay.position as any) || "bottom-right"}
      />
    );
  }
  if (overlay.type === "hero_title") {
    return (
      <HeroTitle
        title={overlay.text ?? ""}
        subtitle={overlay.subtitle}
        accentColor={overlay.accentColor || theme.accentColor}
        textColor={theme.textColor}
        subtitleColor={theme.mutedTextColor}
        scrimBackground={heroScrim(theme)}
      />
    );
  }
  if (overlay.type === "provider_chip" && overlay.providers) {
    return (
      <ProviderChip
        providers={overlay.providers as string[]}
        cycleSeconds={overlay.cycleSeconds}
        position={(overlay.position as any) || "bottom-right"}
        accentColor={overlay.accentColor}
        label={overlay.label}
      />
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------

export const Explainer: React.FC<ExplainerProps> = (props) => {
  const { cuts, overlays, captions, audio } = props;
  const { fps, durationInFrames } = useVideoConfig();

  // Resolve theme from props — playbook name, theme name, or custom themeConfig
  const theme = resolveTheme(props as Record<string, unknown>);

  return (
    <AbsoluteFill style={{ background: theme.backgroundColor, fontFamily: `${theme.headingFont || fontFamily}, ${interFamily}, system-ui, sans-serif` }}>
      {/* Layer 0: Animated gradient background — driven by theme */}
      <AnimatedBackground theme={theme} />

      {/* Layer 1: Visual scenes */}
      {cuts.map((cut) => {
        // End on the frame the next cut starts on: rounding the length separately left a one-frame gap
        // (the bare animated background) between back-to-back cuts whose times are not frame-aligned.
        const from = Math.round(cut.in_seconds * fps);
        const duration = Math.max(1, Math.round(cut.out_seconds * fps) - from);

        return (
          <Sequence key={cut.id} from={from} durationInFrames={duration}>
            <SceneRenderer cut={cut} theme={theme} />
          </Sequence>
        );
      })}

      {/* Layer 2: Overlays (section titles, stat reveals, hero titles) */}
      {overlays?.map((overlay, i) => {
        const from = Math.round(overlay.in_seconds * fps);
        const duration = Math.max(1, Math.round(overlay.out_seconds * fps) - from);

        return (
          <Sequence key={`overlay-${i}`} from={from} durationInFrames={duration}>
            <OverlayRenderer overlay={overlay} theme={theme} />
          </Sequence>
        );
      })}

      {/* Layer 3: Captions (word-by-word highlight) */}
      {captions && captions.length > 0 && (
        <CaptionOverlay
          words={captions}
          wordsPerPage={6}
          fontSize={42}
          color={theme.textColor}
          highlightColor={theme.captionHighlightColor}
          backgroundColor={theme.captionBackgroundColor}
        />
      )}

      {/* Layer 4: Audio — narration */}
      {audio?.narration?.src && (
        <Audio src={resolveAsset(audio.narration.src)} volume={audio.narration.volume ?? 1} />
      )}

      {/* Layer 4: Audio — music with offset, fade in/out, and optional loop */}
      {audio?.music?.src && (
        <Audio
          src={resolveAsset(audio.music.src)}
          startFrom={Math.round((audio.music.offsetSeconds ?? 0) * fps)}
          loop={audio.music.loop ?? false}
          loopVolumeCurveBehavior="repeat"
          volume={(f) => {
            const baseVol = audio.music!.volume ?? 0.1;
            const fadeInDur = (audio.music!.fadeInSeconds ?? 2) * fps;
            const fadeOutDur = (audio.music!.fadeOutSeconds ?? 3) * fps;
            const totalFrames = durationInFrames;

            // Fade in
            const fadeIn = interpolate(f, [0, fadeInDur], [0, baseVol], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            // Fade out
            const fadeOut = interpolate(
              f,
              [totalFrames - fadeOutDur, totalFrames],
              [baseVol, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return Math.min(fadeIn, fadeOut);
          }}
        />
      )}
    </AbsoluteFill>
  );
};
