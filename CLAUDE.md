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
  `<NNN>-<topic>-<YYYYMMDD-HHMM>.mp4` — the render's file name prefixed with a 3-digit
  sequence number: highest `NNN` already in `release` + 1 (`001` when empty). Numbers follow
  delivery order, are never reused or renumbered. Example:
  `006-esp32-series-lineup-20261008-1123.mp4`. The render in `projects/` keeps the
  unnumbered name. The user reviews only what is in `release` — a render not copied there
  is not delivered.

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
- **Primary: the homelab voice server** (`E:\Baotd\software\apps\voice-tts`, same VieNeu v3 Turbo
  model, 48 kHz, same voice names):

  ```sh
  curl -f -X POST http://<host>:8760/api/tts/stream \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    --data-binary @request.json --output speech.wav
  ```

  `request.json`: `{"text": "...", "voice": "Hải Đăng", "speed": 1.0, "format": "wav"}`.
  `"format": "wav"` is required — the default `"f32"` streams raw float32, not a WAV file.
  Host: `VOICE_TTS_SERVER` in the repo `.env` (homelab LAN address, port 8760).
  Token: `VOICE_TTS_TOKEN` in the repo `.env` (gitignored); never write the token into this file or any tracked file. The token lives in
  `~/voice-tts/.env` on the server. Check readiness with `voice-tts status --wait 120`.
- **Homelab only — no local synthesis.** In the pipeline, call tool `vieneu_tts`
  (repo-local `tools/audio/vieneu_tts.py`): it posts to the server above with `"format": "wav"`
  and never runs a model on this machine. If the server is unreachable or not `ready`,
  stop and report it as a blocker — do not fall back to Piper or any other TTS without approval.
- Output is not deterministic: when one section must be redone, regenerate all sections together.
- **Closing line:** the last spoken sentence of every video is, verbatim:
  "Nếu có vấn đề cần giải thích về ESP, bạn có thể nhắn tin trực tiếp cho tôi."
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
