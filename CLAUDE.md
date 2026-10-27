# OpenMontage

**MANDATORY: Read [`AGENT_GUIDE.md`](AGENT_GUIDE.md) before responding to ANY user message.**

Do not act on the user's request until you have read AGENT_GUIDE.md.
It contains routing rules that determine your first action based on what the user asked.
Skipping it WILL cause you to take the wrong action.

All pipeline instructions are in AGENT_GUIDE.md. The fork rules below are this
machine's standing production rules; where they differ from AGENT_GUIDE.md, they win.

## Fork rules (dtbao-embedded-dev)

A brief that explicitly asks for something different overrides a rule; say so when it does.

### Git

- Remotes: `origin` = the user's fork `dtbao-embedded-dev/OpenMontage`,
  `upstream` = the original `calesthio/OpenMontage` (read-only for us).
- Local changes live on branch **`custom`**. Commit there without asking once a code change
  is verified (typecheck/render passes) — one logical change per commit, Conventional
  Commits messages. Push to `origin custom` after committing.
- Never commit generated media, renders, `projects/` output or `.env`.
- **Never** push to `upstream`, never open a PR against upstream, never commit on `main`
  (`main` mirrors `upstream/main`).
- Sync with upstream: `git fetch upstream` → `git checkout main && git merge --ff-only upstream/main`
  → `git checkout custom && git rebase main` → resolve conflicts → `git push --force-with-lease origin custom`.

### Output

- **Frame:** TikTok 9:16 vertical, 1080x1920 (media profile `tiktok`).
  Lock it at the proposal stage. Lay scenes out vertically (stack image above text).
- **No running captions:** no word-by-word / karaoke caption track
  (no `captions` prop, `subtitles.enabled: false`).
  Static on-screen text — titles, labels, spec cards — is fine.
- **File name:** `<topic>-<YYYYMMDD-HHMM>.mp4` — topic in kebab-case (lowercase, hyphens,
  no spaces, no Vietnamese diacritics), then the local time the render finished.
  Example: `esp32-series-lineup-20261008-1123.mp4`. Pass it as the render `output_path`.
  If two variants finish in the same minute, add the aspect: `-916` (9:16) / `-169` (16:9).
- **Concat is the release path** (user decision 2026-10-27, first run Video 61): the HyperFrames/Remotion render is
  the picture source, not the delivery. Build the Concat project from it (`python scripts/concat_build.py <slug>`:
  scene clips, voice clips, music bed in `projects/<slug>/concat/<slug>/`), export, master the audio
  (`scripts/concat_master.py`, run by concat_build: loudnorm to the series' -14 LUFS, picture stream copied), check
  with `scripts/concat_compare.py` (must print `PASS`), and release that mastered
  `renders/<topic>-concat-<YYYYMMDD-HHMM>.mp4`. Changes after that are made in the Concat project first; go back to
  the composition only for new pixels or new words (`workflow/video-make.md` step 10). A project without the parts
  concat_build needs (`edit_decisions.json` cuts and section starts, per-section narration, music bed): ask first.
- **Release:** after every Concat export (see above), copy the mastered file to its series folder under
  `E:\Baotd\media\release\` (user decision 2026-10-10; folder names spelled as the user created them):
  - `Learining-ESP32\` — the ESP32 learning series. The default.
  - `News-ESP32\` — news videos: only when the brief asks for a news video or for this folder.
  - `Desk-FX-Screen\` — the Desk FX Screen build series (scripts in `E:\Baotd\media\content\desk-fx-screen\`;
    user decision 2026-10-13). Named like `Learining-ESP32\` (`Video <N> <Title>.mp4`, `N` = the script's video number);
    its own intro (see Intro card), the same look; the intro line opens this series instead of the learning series.
  - `Other\` — standalone videos that belong to no series (user decision 2026-10-21; first: the Whistle
    speech-to-text demo on the ESP32-P4). Learning-series logo intro, look and closing line; the intro line is
    a plain greeting plus what the video does, with no series or video number, and the pill under the logo is
    `<chip> · <topic>`.

  Name the copy — ready to post as is:
  - `Learining-ESP32\`: `Video <N> <Title>.mp4`. `N` = highest `N` already in that folder + 1
    (`1` when empty), in delivery order.
  - `News-ESP32\`: `<Title>.mp4` — no `Video <N>` prefix (user decision 2026-10-10).
  - `Other\`: `<Title>.mp4` — no `Video <N>` prefix (user decision 2026-10-21).

  `Title` = the script title in Vietnamese with
  diacritics and spaces (these folders are exempt from the workspace naming rule); replace `:`
  with ` -` and drop `? * " < > | / \`, which Windows forbids. Example:
  `Video 4 Arduino, ESP-IDF hay MicroPython trên ESP32-S3.mp4`. A new export of a delivered
  video replaces its file (and keeps its number). The files in `projects/` keep their
  `<topic>-<YYYYMMDD-HHMM>.mp4` / `<topic>-concat-<YYYYMMDD-HHMM>.mp4` names. The user reviews only what is in the
  release folder — a file not copied there is not delivered.
- **Demo repo cleanup** (user decision 2026-10-13): a scratch firmware/simulation repo made for
  a video (`E:\esp-v<N>-demo`, `N` = video number) is deleted as soon as that video is delivered
  (release copy made). Before deleting, copy into `projects/<slug>/work/` anything a re-render
  still needs (firmware sources, captured logs, Wokwi chips), and drop the path from memory notes.

### Intro card

- Every video opens on the brand intro of its series (see Release), so each series has its own
  TikTok cover:
  - Desk FX Screen series (`Desk-FX-Screen`, user decision 2026-10-15): the learning-series logo intro
    with a bold rust pill "DESK FX SCREEN" centred in the empty band above the logo on every frame, frame 0 included —
    `E:\Baotd\media\brand\desk-fx-screen-logo-intro-1080x1920.mp4` (same 4.2 s timing) and
    `desk-fx-screen-logo-intro-last.png` for the hold; source `desk-fx-screen-logo-intro.py` next to them
    (overlays the badge on `esp32-logo-intro-1080x1920.mp4`; re-run it after re-rendering that mp4).
    Everything else below for the learning series (intro line, pill, hold) applies to it too.
  - Learning series (`Learining-ESP32`, user decision 2026-10-11): the animated logo intro
    `E:\Baotd\media\brand\esp32-logo-intro-1080x1920.mp4` — 4.2 s, 30 fps, no audio. Frame 0 is
    the finished logo (bulb + "ESP32" + "CHIA SẺ KIẾN THỨC" on `#F5F1E8`), held 0.4 s, then it
    fades and rebuilds itself. Source: `esp32-logo-intro.py` next to it (re-renders the mp4 from
    `media/logo-basic/esp32-tiktok-avatar.png`).
  - News (`News-ESP32`): `E:\Baotd\media\brand\tiktok-intro-esp32-tin-tuc-1080x1920.png`
    (blue "TIN TỨC" badge / ESP32 / "Tin mới · Dự án hay"), 1.5 s; `.html` source next to it.
- Learning series (user decision 2026-10-11): the first script section is spoken over the intro,
  from 0.5 s (user decision 2026-10-11). Video 1: "Chào các bạn, mình sẽ làm một series lộ trình học ESP32
  cho các bạn mới tiếp xúc. Video 1: <what this video does>." Every later video: "Chào các bạn, tiếp tục
  series học ESP32 với video <N>, nói về <what this video does>." (sent lower case: "chào các bạn, tiếp tục
  series học esp32 với video <N in words>, nói về ..."). The pill appears on the word "video", not on the
  greeting. When it
  runs past 4.2 s, the intro holds its last frame until the line ends + 0.3 s (ffmpeg
  `tpad=stop_mode=clone`). Under the logo (y ≈ 1360) show a pill "Video <N> · <Title>" from the
  word "video". The content sections start after the intro.
- News series: the intro is music only; the narration starts after it (shift the first section by
  1.5 s).
- The intro doubles as the TikTok cover, so frame 0 must show the clean logo/card at full
  opacity — no fade-in, no overlay on frame 0.
- HyperFrames: copy it into the workspace assets and add it as the top clip from 0 s
  (`<video muted>` for the mp4, `<img>` for the PNG), fading out over 0.3–0.4 s into the first scene.
  Remotion: copy it into the render `public_dir` and make it the first cut (`"type": "video"` for the
  mp4; for the PNG `{"type": "image", "animation": "static", "transition_in": "cut",
  "vignette": false}`) — without `transition_in: "cut"` / `vignette: false` it fades in from a dark
  frame under a dark vignette.

### Look (background, palette, type)

Learning series (user decision 2026-10-11): the look is derived from the channel logo
`E:\Baotd\media\logo-basic\esp32-tiktok-avatar.png`. Reference frames (Video 01):
`projects/espressif-esp32-family-history/styleframes/frame-0..5.png`.

- **Background:** flat paper `#F5F1E8` (the logo background, so the intro blends into scene 1).
  No gradient, grid or photo behind text.
- **Motif from the bulb:** circuit traces 8 px with round caps ending in ring pads (r 22, stroke 9;
  filled pad = active/current item) — timelines, trees, buses, flows. The bulb's short rounded light
  dashes (18 px) mark the one key number. Cards: `#FBF8F2` fill, 4 px `#1B2A34` border, radius 28;
  pills: same border, fully rounded. An outline in rust = the highlighted card; dashed rust =
  preview / not ready.

| Role | Colour | Font, weight / size (1080x1920) | Tracking, line-height |
|------|--------|---------------------------------|-----------------------|
| Eyebrow | `#B23C17` | Inter Semibold 30, upper case | +0.22em |
| Title | `#1B2A34` | Chakra Petch Bold 96–112 | -0.01em, 1.02 |
| Subtitle | `#1B2A34` | Inter Semibold 52 | -0.012em, 1.2 |
| Body | `#3E4B55` | Inter Regular 40 | 0, 1.4 |
| Year / stat number | `#1B2A34`; the one key number `#C8461E` | Chakra Petch Bold 64–300 | -0.02em |
| Caption, source | `#56616A` | Inter Regular 28–30 | +0.005em |
| Status | ok `#1F6B43` / preview `#B23C17` | Inter Semibold 36 | |
| Strokes, pads, rays | `#C8461E` (logo orange), `#1B2A34` (logo navy) | 8 px traces, 4 px card borders | |

- Contrast on `#F5F1E8`: `#1B2A34` 13:1, `#3E4B55` 8:1, `#56616A` 5.6:1, `#B23C17` 5.3:1,
  `#1F6B43` 5.8:1. The logo orange `#C8461E` is only 4.3:1 — strokes and text ≥ 60 px only;
  smaller orange text uses `#B23C17`.
- One accent per frame: orange only for the eyebrow, the key number and the highlighted item.
- Layout: content inside the TikTok safe area (y 220–1520), right margin ≥ 160 px for the
  action rail, left margin ~88 px. Scenes stack vertically.
- Fonts: **Chakra Petch** (display: titles, years, numbers, chip names — chamfered like the logo's
  "ESP32") and **Inter** (everything else). Both have Vietnamese; self-host the woff2 files
  (Chakra Petch latin + latin-ext + vietnamese subsets). Space Grotesk has no Vietnamese glyphs —
  never use it for Vietnamese text. Turn ligatures off (`font-variant-ligatures:none`).
- News series keeps the previous look: background `E:\Baotd\media\brand\tiktok-bg-light-plain-1080x1920.png`
  (`backgroundOverlay: 0` in Remotion) with the Apple light-mode palette (title `#1D1D1F`,
  body `#424245`, caption `#5E5E63`, accent `#0066CC`, Inter; reference
  `media/brand/tiktok-text-apple-light-spec.png`).

### Audio mix

- Music sits well under the voice: music in narration gaps ~12 dB below speech, lower still
  while speech plays. `audio_mixer` `full_mix` settings that achieve it with the Pixabay tracks
  used so far: music track `volume: 0.1`, `ducking.music_volume_during_speech: 0.05`.
  (0.35 / 0.18 left music only ~2 dB under the voice — too loud.)
  Those values predate upstream `audio_mixer` #761 (amix no longer scales tracks by 1/N, so the
  voice is ~17 dB louder against the music): since then 0.1 / 0.05 leaves ~28 dB; zephiramusic
  needed 0.26 / 0.13 for 12.2 dB (Video 49, 2026-10-19). Older per-track values are a start, not an answer.
- Verify after mixing: compare mean volume of speech windows vs narration gaps (ffmpeg
  `volumedetect`); re-mix if the gap is under ~10 dB.

### Voice (Vietnamese narration)

- VieNeu-TTS, voice **"Giọng tôi 1"** (user decision 2026-10-13: the user's own voice, cloned
  on the server from an 8 s sample; replaces "Hải Đăng"), raw text (its g2p handles English
  terms; no phonetic respelling). The voice notes and ASR spellings in memory were measured with
  "Hải Đăng" — re-check a term before relying on them.
- **The voice-tts server** (`E:\Baotd\software\apps\voice-tts`, VieNeu v3 Turbo model, 48 kHz).
  It may run on this machine or on a remote host; both are fine. On this machine the port depends on
  how it was started (voice-tts README): the tray / `serve` backend (Startup shortcut "Voice TTS Server")
  listens on `http://127.0.0.1:8760`, the GUI window's backend on `8761`. Check which one answers
  `/api/status` and set `.env` to it (2026-10-15: the tray server on 8760). The homelab server is retired (2026-10-09):

  ```sh
  curl -f -X POST http://<host>:8760/api/tts/stream \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    --data-binary @request.json --output speech.wav
  ```

  `request.json`: `{"text": "...", "voice": "Giọng tôi 1", "speed": 1.0, "format": "wav", "pronunciation": "special"}`.
  `"format": "wav"` is required — the default `"f32"` streams raw float32, not a WAV file.
  `"pronunciation": "special"` (server ≥ 0.7.0) turns on the server lexicon that fixes the garbled
  terms below; the default `"normal"` reads the text as typed and still says "bot" / "áp".
  Host: `VOICE_TTS_SERVER` in the repo `.env` (port 8760, or 8761 for the GUI window). Never point it back at the retired
  homelab address.
  Token: `VOICE_TTS_TOKEN` in the repo `.env` (gitignored); never write the token into this file or any tracked file. The token lives in
  `~/voice-tts/.env` on the server. Check readiness with `voice-tts status --wait 120`.
- In the pipeline, call tool `vieneu_tts` (repo-local `tools/audio/vieneu_tts.py`): it posts to
  `VOICE_TTS_SERVER` with `"format": "wav"` and `"pronunciation": "special"` (tool default).
  If the server is unreachable or not `ready`, stop and report it as a blocker — do not fall back
  to Piper or any other TTS without approval.
- Output is not deterministic, but sections are independent: the tool sends every section as its
  own request (no shared seed or session), so one section is regenerated alone and sections from
  different attempts are combined freely.
- **Narration verify — audio first, then video.** Run
  `python scripts/narrate_sections.py <slug>` (reads `artifacts/script.json` and the lower-case
  `work/tts_text.json`). It runs the steps in this order:
  1. Request the server one section at a time and transcribe each attempt with tool
     `zipformer_vi_asr` (Zipformer-30M-RNNT-6000h via sherpa-onnx, CPU, ~0.2 s a section; user
     decision 2026-10-10, replacing whisper large-v3), aligned word by word with the script. The
     check is relative — it sorts attempts and lists what to listen for; the user's own listen
     decides. An attempt passes when at least **85 %** of the checked script words are heard
     (`--min-score`, user decision 2026-10-10); the words it missed are printed again at the end
     as the list to listen for. A section below 85 % is regenerated on its own, up to 4 attempts
     (`assets/audio/takes/<id>/try<k>.wav`). A word missed by every attempt is a habit of the
     voice, not bad luck: the script lists it as `missed_every_time` instead of retrying forever.
     A word the recogniser always writes differently goes in `--ignore`; a rerun rescores the
     attempts on disk without regenerating them. `--redo <id>` starts a section over.
  2. When every section passes, lock them: gain-match to their median loudness, flag a speech
     rate more than 15 % off the median, join them into `work/narration_full.wav` and check the
     whole narration in one pass, then write the word timestamps of the locked files to
     `work/word_timings.json` (see Sync). Build the scene plan and the video only after the
     script exits 0, and only from these files, so the visuals stay in sync with the voice.
  3. The automatic check covers words with Vietnamese diacritics only, number words included
     (the recogniser writes them as words). Unit words (vôn, héc, mê, lô, ôm, oát, mét, xăng)
     are ignored by default: it writes them as ASCII ("vun", "vol") or drops them. Initials that
     sound alike in the Northern voice (ch/tr, d/gi/r, s/x) count as a match; an ignored word also
     drops its sound-alikes. Words without diacritics ("dung", "cho") are not checked, and English
     terms come out as Vietnamese syllables ("i sp ba hai" for ESP32): read the HEARD text it
     prints for every section, and listen.
  4. After the video render, run
     `python scripts/narrate_sections.py <slug> --listen <render.mp4>` (music and all, ~7 s;
     `work/listen_report.json`). It catches mix and cut problems. It does not replace steps 1–2.

  Model license: CC BY-NC-ND 4.0 (non-commercial). Files are in the Hugging Face cache after the
  first run; `pip install sherpa-onnx` in the repo `.venv`.
- **Letter case of TTS text:** the server's text front end spells an upper-case word it does not
  know with Vietnamese letter names (voice-tts README, "Some words are respelled"). So every text
  sent to the voice server is **all lower case** — sentence starts, names and English terms
  included (`esp32-s3`, `wifi`, `arduino`). Write a word in **upper case only when it must be
  read letter by letter** (`ESP`, `GPIO`, `HTTP`, `UART`). This changes only the case: the words
  stay the script's words, and the on-screen text keeps normal casing. The closing lines below are
  verbatim in their words; send them lower case as written in the next bullet but one.
- **Terms the voice garbles:** fixed on the voice-tts server, not in OpenMontage. Keep the term in
  the script and do not rephrase or respell it here. If a term still comes out wrong, stop and
  report it with the take, the time and what the check heard. Known so far (all with `normal`; `special`
  fixes board → "bo", AP → "ây pi", POST): "board" → "bot", "ESP-NOW" → "ESP-NOV kép" (W spelled as "vê kép"),
  "HTTP POST" → "HTTP phốt", "AP" → "áp".
- **Closing line:** the last spoken sentence of every video is, verbatim:
  - Learning series (user decision 2026-10-11):
    "Trong video có phần nào các bạn chưa hiểu thì có thể comment hoặc nhắn tin cho mình nha."
    (sent as "trong video có phần nào các bạn chưa hiểu thì có thể comment hoặc nhắn tin cho mình nha.")
  - News series: "Có thắc mắc gì về ESP, nhắn tin trực tiếp cho mình nhé, mình trả lời từng người."
    (sent as "có thắc mắc gì về ESP, nhắn tin trực tiếp cho mình nhé, mình trả lời từng người.")
  Put it at the end of the final script section, after any other call to action.

### Sync (visuals ↔ narration)

- Time every on-screen change inside a narration section (chip switch, tile/label reveal,
  highlighted number) from **word timestamps measured with Zipformer** (`zipformer_vi_asr`,
  user decision 2026-10-10, replacing whisper small): `scripts/narrate_sections.py` writes them
  from the locked `narration_<id>.wav` files to `work/word_timings.json`
  (`{id: {"duration", "words": [{"word", "start", "end"}]}}`) — no separate align step.
  Never estimate from syllable counts or guess which silence ends which sentence.
- Word starts land a median ~50 ms after the speech onset (|error| median 90 ms, p90 120 ms over
  235 onsets of four videos; whisper small was 60 / 130 ms with more outliers).
- Anchors use the recogniser's spelling: lower case, no punctuation, numbers as words ("hai",
  "mươi", never "20mhz"), English terms as Vietnamese syllables ("i sp ba hai"). Prefer a
  Vietnamese word with diacritics next to the cue; look the word up in `word_timings.json`.
- Every narration rerun rewrites `word_timings.json`: re-check every anchor. The first rerun
  over a whisper-era file keeps it as `word_timings_whisper.json` and prints a warning.
- Transcripts are timing data only: no caption track, no subtitles on screen
  (see "No running captions").
- Every scene must show its main text or image from its first frames; never leave a scene
  showing only a small title while the voice is already speaking.

### Render

- **Check the whole video before every render** (user decision 2026-10-13): a render is not a way to find
  problems. Before the first render and before any re-render, snapshot the full composition (every ~1 s, plus
  every phase change and both sides of every cut), go through all of it, list every defect (overlap, overflow,
  wrong or late cue, blank/bare-background frame at a cut, element visible before its cue, typo, wrong fact),
  fix them all, re-check the fixed spots, then render once. Never re-render after fixing one issue while the
  rest of the video is unchecked. Cuts: crossfade scenes (alternate tracks over one shared background), so no
  frame shows only the bare background.
- Render Remotion on the GPU: pass `remotion_gl: "angle"` to `video_compose` (AMD RX 6700 XT).
  Benchmark on this machine (300 frames, 1080x1920): 64 s CPU default vs 15 s with `angle`,
  SSIM 0.997 — visually identical. More `--concurrency` does not help; the CPU rasteriser is the bottleneck.
- Pass `remotion_timeout_ms` (e.g. 1800000) on long videos: the tool's subprocess timeout
  defaults to 600 s and otherwise reports a finished render as failed.
- Explainer props: set `tailPaddingSeconds: 0` when the last cut holds the end frame,
  or the video ends on 1 s of bare background.
- HyperFrames (0.8.146 on this machine) mp4 output has an 8 px black strip on the right edge
  (x 1072–1079) in every mode (GPU, software, streaming off); its png-sequence capture is clean,
  so the fault is in the encode step. Snapshots do not show it. After every HyperFrames render,
  check the pixel at x 1076 and fix with
  `ffmpeg -i in.mp4 -vf "fillborders=right=8:mode=smear" -c:v libx264 -crf 16 -preset slow
  -pix_fmt yuv420p -movflags +faststart -c:a copy out.mp4` (content keeps a ≥ 160 px right margin,
  so the strip is background only). Found 2026-10-11; Video 46 has the strip too.

### Images

- **Library first:** search `E:\Baotd\media\image\INDEX.md` before fetching anything new.
- Then Pixabay, through the registry (`pixabay_image` / `image_selector`; key in `.env`).
- **Rule:** every image used in a video must exist as a downloaded local file. If Pixabay has
  no suitable image, download it from the web — do not skip the visual, fall back to text-only
  cards, or hotlink a remote URL.
- Every downloaded image goes into `E:\Baotd\media\image\` as
  `<source>-<subject>[-<variant>].<ext>` and gets a row in `INDEX.md` (description, tags,
  source, license, size). Copy it into `projects/<project>/assets/images/` for the render.
- Web sources: prefer official vendor sources with a clear license (e.g. `espressif/esp-dev-kits`,
  Apache-2.0). Record `license` and `original_url` in the asset manifest.
- Ask before any paid image or video generation.
