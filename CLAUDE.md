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
- **Release:** after every render, copy the video to `E:\Baotd\media\release\` as
  `Video <N> <Title>.mp4` — ready to post as is. `N` = highest `N` already in `release` + 1
  (`1` when empty), in delivery order. `Title` = the script title in Vietnamese with
  diacritics and spaces (this folder is exempt from the workspace naming rule); replace `:`
  with ` -` and drop `? * " < > | / \`, which Windows forbids. Example:
  `Video 4 Arduino, ESP-IDF hay MicroPython trên ESP32-S3.mp4`. A re-render of a delivered
  video replaces its file and keeps its number. The render in `projects/` keeps the
  `<topic>-<YYYYMMDD-HHMM>.mp4` name. The user reviews only what is in `release` — a render
  not copied there is not delivered.

### Intro card

- Every video opens on the brand intro card
  `E:\Baotd\media\brand\tiktok-intro-esp32-chia-se-kien-thuc-1080x1920.png`
  ("Lập trình nhúng · IoT / ESP32 / Chia sẻ kiến thức" above an ESP32-S3 board).
- 1.5 s, music only; the narration starts after it (shift the first section by the intro length).
  It doubles as the TikTok cover frame, so it must be at full opacity on frame 0.
- Copy it into `projects/<project>/assets/images/` (and the render `public_dir`), then add it as
  the first cut: `{"type": "image", "source": "<file>", "animation": "static",
  "transition_in": "cut", "vignette": false, "backgroundColor": "#FAFCFF"}`, fading out into
  the first scene. Without `transition_in: "cut"` / `vignette: false` it fades in from a dark
  frame under a dark vignette.

### Background

- **Default background:** `E:\Baotd\media\brand\tiktok-bg-light-plain-1080x1920.png` — plain light
  gradient (`#FAFCFF` top → `#EAF2FC` bottom, faint blue/teal tints in two corners), no grid,
  traces or other detail. Use it for every scene unless the brief asks for something else.
- Copy it into `projects/<project>/assets/images/` and pass it as the scene `backgroundImage`
  with `backgroundOverlay: 0` (the default 0.55 overlay would darken it).
- It is a light background: use the text palette below, not the dark-theme defaults.

### Text palette and type (Apple light-mode hierarchy)

Reference frames: `E:\Baotd\media\brand\tiktok-text-apple-light-example.png` (clean) and
`tiktok-text-apple-light-spec.png` (annotated). Every text colour is ≥ 4.5:1 on the darkest
point of the default background.

| Role | Colour | Weight / size (1080x1920) | Tracking, line-height |
|------|--------|---------------------------|-----------------------|
| Eyebrow | `#0066CC` | Semibold 30 | +0.01em |
| Title | `#1D1D1F` | Bold 132 | -0.025em, 1.05 |
| Subtitle | `#1D1D1F` | Semibold 54 | -0.012em, 1.2 |
| Body | `#424245` | Regular 40 | 0, 1.4 |
| Stat number | `#1D1D1F`; the one key stat `#0066CC` | Bold 84 | -0.02em |
| Stat label, caption, source | `#5E5E63` | Regular 28–30 | +0.005em |
| Status | green `#1D7A34` / red `#D70015` | Semibold 38 | |
| Card | white 75% opacity, 2 px border black 8%, soft shadow, radius 36 | | |

- Hierarchy by weight and colour step (label → secondary → tertiary), not size alone.
  Tracking is size-specific: tighten large text, loosen small text slightly.
- One accent per frame: `#0066CC` only for the eyebrow and the single most important number.
- Never use `#94A3B8`-light greys for text (≈ 2:1 on this background).
- Layout: content inside the TikTok safe area (y 220–1520), right margin ≥ 160 px for the
  action rail, left margin ~88 px.
- Font: **Inter** (has Vietnamese). Pass `themeConfig.headingFont` / `bodyFont` = `"Inter"`.
  `Explainer.tsx` loads Inter 400–800 with the `vietnamese` subset; HeroTitle, SectionTitle,
  StatReveal, EndTag and ProviderChip inherit the theme font. Space Grotesk has no
  Vietnamese glyphs — never use it for Vietnamese text.

### Audio mix

- Music sits well under the voice: music in narration gaps ~12 dB below speech, lower still
  while speech plays. `audio_mixer` `full_mix` settings that achieve it with the Pixabay tracks
  used so far: music track `volume: 0.1`, `ducking.music_volume_during_speech: 0.05`.
  (0.35 / 0.18 left music only ~2 dB under the voice — too loud.)
- Verify after mixing: compare mean volume of speech windows vs narration gaps (ffmpeg
  `volumedetect`); re-mix if the gap is under ~10 dB.

### Voice (Vietnamese narration)

- VieNeu-TTS, voice **"Hải Đăng"**, raw text (its g2p handles English terms; no phonetic respelling).
- **The voice-tts server** (`E:\Baotd\software\apps\voice-tts`, VieNeu v3 Turbo model, 48 kHz).
  It may run on this machine (the VoiceTTS tray app, `http://127.0.0.1:8760`) or on a remote
  host; both are fine. The homelab server is retired (2026-10-09):

  ```sh
  curl -f -X POST http://<host>:8760/api/tts/stream \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    --data-binary @request.json --output speech.wav
  ```

  `request.json`: `{"text": "...", "voice": "Hải Đăng", "speed": 1.0, "format": "wav", "pronunciation": "special"}`.
  `"format": "wav"` is required — the default `"f32"` streams raw float32, not a WAV file.
  `"pronunciation": "special"` (server ≥ 0.7.0) turns on the server lexicon that fixes the garbled
  terms below; the default `"normal"` reads the text as typed and still says "bot" / "áp".
  Host: `VOICE_TTS_SERVER` in the repo `.env` (port 8760). Never point it back at the retired
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
  1. Request the server one section at a time and transcribe each attempt with faster-whisper
     **`large-v3`** (`language: "vi"`), aligned word by word with the script. A section that
     fails is regenerated on its own, up to 4 attempts (`assets/audio/takes/<id>/try<k>.wav`).
     A word missed by every attempt is a habit of the voice, not bad luck: the script lists it
     as `missed_every_time` instead of retrying forever. A word whisper always writes
     differently (a unit such as "giây") goes in `--ignore`; a rerun rescores the attempts on
     disk without regenerating them. `--redo <id>` starts a section over.
  2. When every section passes, lock them: gain-match to their median loudness, flag a speech
     rate more than 15 % off the median, join them into `work/narration_full.wav` and run a
     large-v3 listen-back on the whole narration. Build the scene plan and the video only after
     the script exits 0, and only from these files, so the visuals stay in sync with the voice.
  3. The automatic check covers words with Vietnamese diacritics only. Initials that sound alike
     in the Northern voice (ch/tr, d/gi/r, s/x) count as a match, so "trục" for "chục" or "dây"
     for "giây" needs no `--ignore`; an ignored word also drops its sound-alikes. Read the HEARD
     text it prints for every section for the English terms whose meaning changes when misread
     (e.g. "board" heard as "bot"/"both").
  4. After the video render, run a final large-v3 listen-back on the audio of the full render.
     It catches mix and cut problems. It does not replace steps 1–2.

  small and medium mishear both ways, so they are not a pronunciation check (small stays the
  timing source, see Sync). large-v3 invents phrases such as "Cảm ơn các bạn đã theo dõi" on a
  music-only tail; ignore text past the last narration section.
- **Letter case of TTS text:** the server's text front end spells an upper-case word it does not
  know with Vietnamese letter names (voice-tts README, "Some words are respelled"). So every text
  sent to the voice server is **all lower case** — sentence starts, names and English terms
  included (`esp32-s3`, `wifi`, `arduino`). Write a word in **upper case only when it must be
  read letter by letter** (`ESP`, `GPIO`, `HTTP`, `UART`). This changes only the case: the words
  stay the script's words, and the on-screen text keeps normal casing. The closing line below is
  verbatim in its words; it is sent as
  "có thắc mắc gì về ESP, nhắn tin trực tiếp cho mình nhé, mình trả lời từng người."
- **Terms the voice garbles:** fixed on the voice-tts server, not in OpenMontage. Keep the term in
  the script and do not rephrase or respell it here. If a term still comes out wrong, stop and
  report it with the take, the time and what large-v3 heard. Known so far (all with `normal`; `special`
  fixes board → "bo", AP → "ây pi", POST): "board" → "bot", "ESP-NOW" → "ESP-NOV kép" (W spelled as "vê kép"),
  "HTTP POST" → "HTTP phốt", "AP" → "áp".
- **Closing line:** the last spoken sentence of every video is, verbatim:
  "Có thắc mắc gì về ESP, nhắn tin trực tiếp cho mình nhé, mình trả lời từng người."
  Put it at the end of the final script section, after any other call to action.

### Sync (visuals ↔ narration)

- Time every on-screen change inside a narration section (chip switch, tile/label reveal,
  highlighted number) from **word timestamps measured with faster-whisper** — tool
  `transcriber`, `language: "vi"`, `model_size: "small"` — on the final narration WAVs.
  Never estimate from syllable counts or guess which silence ends which sentence.
- Re-run the transcription whenever narration is regenerated (output is not deterministic).
- Transcripts are timing data only: no caption track, no subtitles on screen
  (see "No running captions").
- Every scene must show its main text or image from its first frames; never leave a scene
  showing only a small title while the voice is already speaking.
- Setup: `faster-whisper` in the repo `.venv` with `av==16.1.0` — PyAV 17+ dropped the
  `metadata_errors` argument faster-whisper 1.2.1 passes (`TypeError` on `av.open`).

### Render

- Render Remotion on the GPU: pass `remotion_gl: "angle"` to `video_compose` (AMD RX 6700 XT).
  Benchmark on this machine (300 frames, 1080x1920): 64 s CPU default vs 15 s with `angle`,
  SSIM 0.997 — visually identical. More `--concurrency` does not help; the CPU rasteriser is the bottleneck.
- Pass `remotion_timeout_ms` (e.g. 1800000) on long videos: the tool's subprocess timeout
  defaults to 600 s and otherwise reports a finished render as failed.
- Explainer props: set `tailPaddingSeconds: 0` when the last cut holds the end frame,
  or the video ends on 1 s of bare background.

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
