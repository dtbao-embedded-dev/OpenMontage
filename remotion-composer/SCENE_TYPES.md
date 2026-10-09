# Remotion Composer — Scene & Overlay Cheat Sheet

Authoritative list of `cut.type` and `overlay.type` values the `Explainer` composition accepts. Each row maps to a dispatch case in `src/Explainer.tsx`.

When you add a new component, append it here and in `src/components/index.ts`.

---

## Cut types (`cut.type`)

| `type` | Component | Required fields | Common fields | Purpose |
|---|---|---|---|---|
| *(none — video)* | `OffthreadVideo` | `source` (path to mp4) | `source_in_seconds`, `animation` (zoom-in, ken-burns), `in_seconds`, `out_seconds` | Play an MP4 clip directly |
| *(none — image)* | `Img` | `source` (path to png/jpg) | `animation`, `in_seconds`, `out_seconds` | Play a still with Ken Burns |
| `text_card` | `TextCard` | `text` | `fontSize`, `backgroundVideo`, `backgroundOverlay`, `color` | Large-typography beat |
| `hero_title` | `HeroTitle` | `text` | `heroSubtitle`, `backgroundVideo`, `backgroundOverlay` | Title/end card |
| `stat_card` | `StatCard` | `stat` | `subtitle`, `accentColor`, `backgroundVideo` | A single big number |
| `callout` | `CalloutBox` | `text` | `callout_type` (info/warning/tip/quote), `title`, `backgroundVideo` | Boxed message with bullets |
| `comparison` | `ComparisonCard` | `leftLabel`, `leftValue`, `rightLabel`, `rightValue` | `title`, `backgroundColor` | Side-by-side compare |
| `bar_chart` | `BarChart` | `chartData` | `chartAnimation`, `showValues`, `showGrid`, `backgroundVideo` | Animated bars |
| `line_chart` | `LineChart` | `chartSeries` | `chartAnimation`, `xLabel`, `yLabel`, `showMarkers` | Animated line |
| `pie_chart` | `PieChart` | `chartData` | `donut`, `centerLabel`, `centerValue`, `showLegend` | Pie / donut |
| `kpi_grid` | `KPIGrid` | `chartData` | `title`, `columns`, `chartAnimation` | 2–4 column KPI grid |
| `progress_bar` | `ProgressBar` | `progress` | `progressLabel`, `progressColor`, `progressSegments` | Animated progress |
| `anime_scene` | `AnimeScene` | `images` (list) | `particles`, `lightingFrom`, `lightingTo`, `vignette` | Still-image anime scene with particles + camera motion |
| **`terminal_scene`** | **`TerminalScene`** | **`steps`** (list of cmd/out/pause/pill) | **`terminalTitle`, `prompt`, `accentColor`, `fontSize`, `terminalHeight`, `eyebrow` + `title` (light step header above the window, e.g. "Bước 1/4": drawn from frame 0, even 120 px margins, output hard-wrapped, pills at the bottom)** | **Synthetic terminal animation — NO real capture needed. See [`.agents/skills/synthetic-screen-recording/SKILL.md`](../.agents/skills/synthetic-screen-recording/SKILL.md)** |
| **`screenshot_scene`** | **`ScreenshotScene`** | **`backgroundImage`** (path in `public/`), **`screenshotSteps`** (list of overlays) | **`screenshotSize` (natural px w/h), `cursorStartAt`, `accentColor`** | **Approach-1 synthetic UI — drop any screenshot, animate scripted overlays on top (cursor, click_pulse, type_into, bubble_append, typing_dots, highlight_box, callout_balloon). Viewer-indistinguishable from a real recording for 15–30s focused demos. Coordinates are normalized (0–1) against the contain-fit rect. See [`.agents/skills/synthetic-ui-recording/SKILL.md`](../.agents/skills/synthetic-ui-recording/SKILL.md) (planned).** |

| `chip_spotlight` | `ChipSpotlight` | `image`, `chipName`, `specs` (list of `{label, value}`) | `tagline`, `radios` (wifi4/wifi6/wifi6-5g/ble/bt-classic/thread/zigbee/ethernet/none), `companionImage`, `companionLabel`, `accentColor` | Hardware product shot (transparent PNG) left, staggered spec rows + SVG radio badges right; optional linked companion board |
| `letter_grid` | `LetterGrid` | `tiles` (list of `{letter, label, atSeconds?}`) | `title`, `accentColor`, `layout` (`safe` default / `centered`: centred on the frame, even 120 px margins) | Big-letter tiles that pop in one by one (sync with `atSeconds`) — category/naming maps where values are words, not numbers |
| `board_teardown` | `BoardTeardown` | `image`, `imageSize` (natural px w/h), `spots` (list of `{atSeconds, name, region?, focus?, zoom?, eyebrow?, detail?, note?, noteTone?, blink?: {color?, periodSeconds?, region?}}`); cut `eyebrow` + `title` add the same step header as `terminal_scene` | `cardBackgroundColor`, `cardBorderColor`, `layout` (`safe` default packs into y 220-1520 with a 160 px right rail; `centered` centres viewport + card on the frame with even 120 px margins) | Hardware teardown: board image in a viewport (above, in portrait) that glides/zooms to each part's `region` (natural px) and outlines it, label card below switches per spot (sync with `atSeconds`); omit `region` for a whole-board overview; `focus` (natural px) makes the camera frame another area than the outline (e.g. keep the board body in view around an edge header pin); a spot repeating the previous region/text keeps the outline and card text on screen and only slides in the new `note` |
| `code_compare` | `CodeCompare` | `name`, and `code` (list of lines) or `layers` (list of `{label, detail?, highlight?, atSeconds?}`) | `eyebrow`, `tagline`, `codeTitle`, `codeAtSeconds`, `codeRevealSeconds`, `codeFontSize`, `points` (list of `{kind: pro/con/info, text, atSeconds?}`), `cardBackgroundColor`, `cardBorderColor` | Light-theme framework card: big name, a code window that types in line by line (light syntax colouring) or a stacked layer diagram, then pro/con rows with green check / red cross timed to narration. Portrait stacks everything inside the TikTok safe area |
| `core_timeline` | `CoreTimeline` | `name`, `lanes` (list of `{label, detail?, blocks: [{start, len, label?, tone?, atSeconds?}]}`) | `eyebrow`, `tagline`, `units` (axis width, default 12), `axisLabel`, `points` (pro/con/info rows like `code_compare`), `timelineLog` (`{title?, lines, atSeconds?, color?}` monospace card), `layout` (`safe` / `centered`) | Gantt-style scheduler diagram: lanes (cores or tasks) share one time axis, blocks grow in at `atSeconds`. `tone`: `a`/`b`/`c` tasks, `idle` light fill, `wait` dashed (blocked / starved), `bad` status red. Used for dual-core, priority preemption and busy-wait vs `vTaskDelay` |

| `wifi_topology` | `WifiTopology` | `name`, `nodes` (list of `{id, label, x, y, detail?, icon?, image?, atSeconds?, badge?, badgeAtSeconds?, highlightAtSeconds?}`) | `eyebrow`, `tagline`, `links` (list of `{from, to, label?, dashed?, atSeconds?, packets?: [{atSeconds, label?, reverse?, durationSeconds?, color?, count?, everySeconds?}]}`), `ranges` (list of `{node, atSeconds?}`: Wi-Fi rings pulse out of a node), `diagramHeight` (default 760), `points`, `timelineLog` (monospace card), `layout` (`safe` / `centered`) | Network diagram in a light card: nodes at normalised `x`/`y` (0..1) drawn as icon discs (`router`, `phone`, `laptop`, `cloud`, `server`, `chip`) or an `image` from `public/`; links draw in (dashed = wireless), labelled packets glide edge to edge above the nodes; a `badge` pill (STA / AP / an IP) pops above a node. Lay nodes out side by side: a node block is ~220 px tall, so stacked nodes need > 300 px between centres. Used for Wi-Fi Station vs Access Point and a sensor reading travelling to a server |
| `metric_bars` | `MetricBars` | `name`, `metricRows` (list of `{label, value, valueText, detail?, highlight?, group?, atSeconds?}`) | `eyebrow`, `tagline`, `metricScale` (`linear` default / `log` for values spanning decades, e.g. µA to mA), `metricBaseline` (value drawn as an empty bar, e.g. -60 for dBm sensitivity), `metricMax`, `metricSource` + `metricSourceAtSeconds` (caption-style source line inside the card), `points`, `layout` (`safe` / `centered`) | Portrait spec comparison: a light card of labelled horizontal bars, each row pops in and its bar grows at `atSeconds`; the value text carries its own unit, `highlight` paints the one key row in the accent colour, `group` draws a small heading when it changes. Used for Wi-Fi vs BLE vs ESP-NOW range, throughput and current |
| `circuit_diagram` | `CircuitDiagram` | `name`, `circuitParts` (list of `{kind, ...}`) | `eyebrow`, `tagline`, `circuitViewHeight` (diagram units, width is always 1000; default 900), `points`, `layout` (`safe` / `centered`) | Simple schematic in a light card. `kind`: `wire` (`points` polyline, draws in; `flow` window runs current dots along it), `resistor` / `button` (two-terminal `from` → `to`; button closes during `pressed` [[start, end]] windows), `ground`, `rail` (supply bar with `text` such as 3V3), `block` (rounded box at `at` with `w`/`h`, `dashed` = a region inside a chip; title sits at the top when `sub` is set or `h` > 300), `pin`, `dot`, `cross` (red X), `tag` (filled pill), `label` (plain text), `potentiometer` / `ldr` / `capacitor` (two-terminal; potentiometer wiper follows `wiperTrack`), `led` (diode `from` anode → `to` cathode, glow and fill follow `levelTrack` [[s, 0..1]], light colour `color`), `buzzer` (two-terminal disc, sound arcs ripple on the `wiperSide` during `sounding` windows), `servo` (top view at `at` with `w`/`h`, horn turns to `angleTrack` [[s, deg -90..90]], live angle readout), `pwm` (mini square-wave trace at `at` with `w`/`h`, `periods` (fractional allowed) at the `dutyTrack` duty, `readout` `percent` or `ms` with `periodMs`). `color` overrides the ink of any part (e.g. servo cable colours). `cut: true` shows a part from `atSeconds` to `untilSeconds` with no spring or fade (fast swaps such as melody notes). Every part takes `atSeconds` / `untilSeconds` (swap a state tag by ending one where the next starts), `tone` (`neutral`/`accent`/`good`/`bad`/`muted`), `text`/`sub`/`textAt`/`fontSize`. Used for a button with the internal pull-up, a 5 V output into a GPIO, a resistor divider, LED dimming, a buzzer and an SG90 servo |
| `logic_wave` | `LogicWave` | `name`, `wavePanels` (list of `{yMax, traces, label?, height?, yTicks?, lines?, bands?, markers?, spans?, atSeconds?}`) | `eyebrow`, `tagline`, `waveCaption` + `waveCaptionAtSeconds`, `points`, `layout` | Oscilloscope-style voltage plots stacked in one card. A trace (`points` [[x 0..1, volts]], step by default) is drawn by a pen from `atSeconds` over `drawSeconds`, with an optional `label` at `labelAt`; `lines` are threshold lines (e.g. 3.6 V max), `bands` shaded voltage ranges (VIH / VIL), `markers` numbered discs on an edge, `spans` time brackets under the axis. All labels carry a white halo so they stay readable over traces. Used for switch bounce vs debounced read and for 3.3 V vs 5 V levels |
| `oled_screen` | `OledScreen` | `name`, `oledLayers` (list of `{kind, ...}`) | `eyebrow`, `tagline`, `oledRows` (64 default / 32), `oledColor` (`white` / `blue` / `yellow-blue`), `oledPins` (header labels, default GND VCC SCL SDA; `[]` hides the strip), `oledBoardWidth` (px, default 840), `oledMarks` (outlines in panel pixels; a `label` shows as a pill under the module, never over the pixels), `oledPages` (`{atSeconds, untilSeconds?, highlight?, highlightAtSeconds?}`: GDDRAM page bands numbered 0-7), `oledByte` (`{page, col, atSeconds, title?, note?}`: outlines one byte column and shows its 8 bits, read from the live framebuffer, in a card), `oledGridAtSeconds` (faint pixel grid), `oledCaption` + `oledCaptionAtSeconds`, `code` + `codeTitle` + `codeAtSeconds` + `codeRevealSeconds` + `codeFontSize` + `codeHighlights` (`[{lines, atSeconds, untilSeconds?}]` tints lines), `points`, `layout` | A 0.96" SSD1306-style module drawn pixel-exact: the 128 x 64 framebuffer is composed every frame from timed layers in panel pixels. `kind`: `text` (LVGL unscii fonts `unscii8` / `unscii16`, bitmaps from LVGL so glyphs match a real 1-bpp panel; `typeSeconds` types it, `scrollWidth` + `scrollSpeed` scroll it like LV_LABEL_LONG_SCROLL_CIRCULAR, `invert`), `bitmap` (`rows` of `#`/`.`), `rect`, `line`, `fill`, `noise` (deterministic random pixels, e.g. uninitialised RAM), `chart` (lv_chart in LV_CHART_UPDATE_MODE_SHIFT: `pointCount` slots, `values` arrive at `rate` per second, new points enter on the right, `frame`, `bars`, `label` prints the newest value). Every layer takes `atSeconds` / `untilSeconds` and `mode` (`set` / `clear` / `xor`). Used for text, icons, a real-time sensor graph and the SSD1306 memory layout |
---

## Overlay types (`overlay.type`)

| `type` | Component | Required fields | Common fields | Purpose |
|---|---|---|---|---|
| `section_title` | `SectionTitle` | `text` | `accentColor`, `position` (top-left, etc.) | Tiny section label |
| `stat_reveal` | `StatReveal` | `text` | `subtitle`, `accentColor`, `position` | Corner stat badge |
| `hero_title` | `HeroTitle` (as overlay) | `text` | `subtitle` | Full-frame title overlay |
| **`provider_chip`** | **`ProviderChip`** | **`providers`** (list of strings) | **`cycleSeconds`, `position`, `accentColor`, `label`** | **Rotating badge that cycles through provider names — used in AI-generated-motion scenes to show which model produced the clip** |

---

## Adding a new scene type

1. Create the React component in `src/components/MyScene.tsx`. Use `interpolate(frame, [inFrame, outFrame], [from, to])` and `spring(...)` for motion. Read `useCurrentFrame()` and `useVideoConfig()`.
2. Export it in `src/components/index.ts`.
3. Add the `type` to the `Cut` interface in `src/Explainer.tsx` (and any new prop fields).
4. Add a dispatch case in `SceneRenderer`:
   ```tsx
   if (cut.type === "my_scene" && cut.mySceneData) {
     return maybeWrapWithBg(<MyScene ... />);
   }
   ```
5. Document it in this file. That's what makes it discoverable to the next agent.

## Existing synthetic-UI components

Currently only `TerminalScene` exists. The pattern generalizes — likely candidates to add next, if a pipeline needs them:

- `ChatTranscript` — Claude/Cursor/GPT chat-bubble timeline with typing animation
- `EditorScene` — VS Code-style code editor with syntax highlight + cursor motion
- `PrReview` — GitHub PR diff view with inline-comment reveals
- `SlackThread` — Slack thread with avatars + reaction pops
- `TicketBoard` — Jira / Linear card moving across columns

Pattern: follow `TerminalScene.tsx` — a `steps` list of timeline primitives, cursor-advancing durations, spring-based reveals, optional non-blocking pills/badges.
