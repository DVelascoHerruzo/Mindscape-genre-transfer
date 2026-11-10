# Mindscape: genre-transfer demo site

A static website for the Advanced AI group project (Project II, music style transfer). Users **upload an MP3**, pick one of **eight genres** on a style wheel, set the **strength**, and switch between the original and the styled version while playback keeps its place. The transformation runs **entirely in the browser** as **MP3 → MIDI → genre → MP3** with pretrained models (see [The MIDI pipeline](#the-midi-pipeline-transform-your-own-mp3)).

- **Layout:** modelled on the Pocket Bard mobile app (now-playing pill, transport with a play orb, radial style wheel, sliders, bottom sheet).
- **Look:** a "mindscape" of liquid-glass panels over slowly moving, audio-reactive lights. The colours follow what you hear:
  - **green & black** in the normal state (the original; the site starts here);
  - **black & white** for **Classical**;
  - **red & black** for **Rock**;
  - gold (Jazz), night blue (Ambient), lavender (Lo-fi), pink (Pop), cyan (Electronic) and molten orange (Metal) for the other genres.

  Themes are defined in `js/background.js` (`PALETTES`) and `js/app.js` (`GENRES`, `ORIGINAL_THEME`).

It is plain HTML, CSS and JavaScript, with no build step and nothing to install. The pipeline loads its models and instrument samples from public CDNs on first use (listed below). Fonts load from Google Fonts and fall back to system fonts offline.

## Layouts

| Screen width | Layout |
|---|---|
| < 640 px (phone) | Full-screen app: tabs (Style & Strength / Tracks / How it works), slide-up "compare models" sheet |
| 640–1099 px (tablet, small laptop) | The same phone layout, shown as a floating glass device in the middle of the moving background |
| ≥ 1100 px (desktop) | Three columns (described below). "How it works" opens as a centred overlay (Esc or ✕ to close) |

The three desktop columns are:
- **Library** (left): tracks and upload.
- **Stage** (centre): transport, a large style wheel, and Strength + Mood side by side.
- **Listen & compare** (right): original/styled switch, strength and genre stat tiles, model choice, details.

The breakpoint is defined in two places that must match: `css/style.css` (`@media (min-width: 1100px)`) and `js/app.js` (`desktopMQ`).

## Run it locally

**Option A: double-click `index.html`.** It works from `file://`, but the browser blocks reading `demo/manifest.json` and starting the transcription worker that way. The site falls back to its built-in demo track, and uploads only play as the original.

**Option B (recommended): a local web server.** This reads the manifest and **transforms uploads**.

```powershell
cd site
python -m http.server 8000
# then open http://localhost:8000
```

Any static server works, for example the VS Code "Live Server" extension.

## What plays today

The only track at the start is Grieg's **In the Hall of the Mountain King** (*Peer Gynt*, 1875, public domain), *synthesised live in the browser*. The theme was checked against a public transcription. It is arranged three ways, and all three play in sync:
- **plain sketch:** sine melody;
- **classical:** piano with a broken-chord accompaniment and hall reverb;
- **rock:** the theme on a driven **bass guitar**, with distorted power chords and drums.

How the controls act on it:

- picking a genre crossfades to that arrangement;
- **Strength** blends between the sketch and the styled version;
- **Mood** shapes the tone (dark ↔ bright).

This is a stand-in to show the interaction. **It is not a model output**, and the UI says so.

## Deep links (handy for the presentation)

Open the site in a given state with URL parameters, for example:

- `index.html?genre=rock&preset=bold` opens Rock at Bold strength.
- `?ab=original` starts on the original.
- `?tab=tracks` or `?tab=about` opens that tab.
- `?sheet=open` opens the model-comparison sheet.

Parameters can be combined.

## Adding real model outputs

1. Put audio files under `site/demo/audio/<track-id>/`. MP3 is fine: a 30 s clip at 192 kbps is ≈0.7 MB.
2. Add a track to `site/demo/manifest.json`. Paths are relative to `index.html`:

```json
{
  "id": "musicnet-2303",
  "type": "file",
  "title": "Cello Suite (excerpt)",
  "artist": "J. S. Bach · MusicNet #2303",
  "length": "30 s",
  "license": "Source recording: MusicNet (CC BY 4.0). Styled versions are AI-generated.",
  "original": "demo/audio/musicnet-2303/original.mp3",
  "outputs": {
    "ace-step": {
      "rock": {
        "subtle": "demo/audio/musicnet-2303/ace-step_rock_subtle.mp3",
        "balanced": "demo/audio/musicnet-2303/ace-step_rock_balanced.mp3",
        "bold": "demo/audio/musicnet-2303/ace-step_rock_bold.mp3"
      }
    },
    "ace-step-lora": { "rock": { "balanced": "demo/audio/musicnet-2303/lora_rock_balanced.mp3" } },
    "mel-ae": { "rock": { "balanced": "demo/audio/musicnet-2303/mel-ae_rock.mp3" } }
  }
}
```

| Field | Meaning |
|---|---|
| `type` | `"file"` for real audio; `"synth"` only for the built-in preview |
| `original` | The untouched source clip (the **A** in A/B) |
| `outputs` | `model → genre → preset → file`. Models: `ace-step`, `ace-step-lora`, `mel-ae` (labels live in `js/app.js` → `MODELS`). Genres: `classical`, `rock`. Presets: `subtle`, `balanced`, `bold`. A missing preset falls back to the nearest one |
| `license` | Shown by the ⓘ/book button. State the source licence and that styled audio is AI-generated |

All files of one track should have the **same length** (e.g. 30 s), so switching keeps the playback position. Keep the synth track in the list if you still want the preview.

**Rules:**
- Use only our own or Creative Commons source audio (e.g. MusicNet, FMA, MTG-Jamendo, with credit).
- Never commit copyrighted songs.
- Every styled file is AI-generated, and the UI labels it as such.

## Publish on GitHub Pages

GitHub Pages serves static files only. The models do not run there; the site plays the pre-rendered outputs listed in the manifest. Until those exist, it publishes the browser-synth preview, which needs no audio files, so the static demo can go live today.

**The site is published only when a pull request into `prod` is merged.** The workflow [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) runs on every push to `prod`, checks that the pushed commit is the merge of a pull request, and then uploads `site/` as it is (no build step). A direct push to `prod` does not deploy; the run shows a "Site not deployed" notice instead.

To publish:

1. Work on a branch (e.g. `dev`) and open a pull request into `prod`.
2. Merge it. The *Deploy demo site to GitHub Pages* run appears under **Actions**, and its deploy job shows the live URL: <https://dvelascoherruzo.github.io/Mindscape-genre-transfer/>.
3. If the PR adds audio, check that every file referenced in the manifest is committed (and licensed for publication).

One-time setup in the repository settings:

- **Settings → Pages → Build and deployment → Source: GitHub Actions.** Don't add a suggested workflow; ours is already in the repo.
- **Settings → Environments → `github-pages`:** if *Deployment branches and tags* is restricted, add `prod`, or the deploy job is rejected.
- *Optional:* a branch ruleset on `prod` that requires pull requests, so direct pushes are blocked rather than just not deployed.

## The MIDI pipeline: transform your own MP3

Upload a clip with the button on the wheel, or with *Upload your own clip* in Tracks. Everything below runs in the browser, and the audio never leaves the device. Only the first 60 s are used. Clips with a clear melody and chords work best.

| Step | What happens | Code | Model / library |
|---|---|---|---|
| 1. MP3 → MIDI | Decode, resample to 22.05 kHz mono, polyphonic transcription | `js/midi/pipeline.js`, `js/midi/transcribe-worker.js` (module worker) | **Basic Pitch** (Spotify, pretrained, Apache-2.0) on TensorFlow.js |
| 2. Analyse | Spectral-flux onsets → tempo (autocorrelation) → beat tracking (dynamic programming) → downbeat; key (Krumhansl–Kessler); one chord per beat (triad templates + Viterbi); skyline melody | `js/midi/analyse.js` | our code |
| 3. MIDI → genre | A recipe per genre writes new parts on the song's own beat grid: instruments, drum patterns, bass lines, voicings, swing, effects | `js/midi/arranger.js`, `js/midi/genres.js` | our code + **Magenta.js** (Google, pretrained, Apache-2.0) at *Bold* |
| 4. MIDI → MP3 | Offline Web Audio render with soundfont samples, synthesised drums and genre effects, loudness-matched to the original; MP3 encoded on download | `js/midi/render.js`, `js/midi/export.js` | **FluidR3_GM** soundfont (CC BY 3.0) via midi-js-soundfonts; **lamejs** (LGPL-3.0); **@tonejs/midi** (MIT) |

**Strength presets:**
- *Subtle* re-orchestrates every transcribed note on the genre's instruments.
- *Balanced* keeps the melody and replaces the accompaniment (chords, bass, drums).
- *Bold* adds the pretrained-model parts:

| Genre | Bold adds |
|---|---|
| Classical | **Coconet** writes alto, tenor and bass under the melody (Bach chorale style) → string quartet |
| Ambient | **Coconet** voices sung by a choir pad |
| Jazz | **ImprovRNN** answers the melody in its gaps over the detected chords; **GrooVAE** humanises the swing groove; tenor sax lead |
| Lo-fi | **GrooVAE** humanised drums, heavier tape and vinyl |
| Pop, Electronic, Metal | **DrumsRNN** fills at phrase ends, extra layers (strings, arpeggiator, harmonised lead) |
| Rock | **DrumsRNN** fills + **GrooVAE** groove, doubled guitars, organ |

If Magenta cannot load (for example offline), Bold falls back to rule-based parts and the panel says so.

**In the UI:**
- The wheel centre shows progress: transcribing, the model at work, rendering.
- Each genre × strength is rendered the first time it is chosen, then cached. A render takes about 2–4 s; the first Bold run also downloads its model.
- The *Listen & compare* panel shows the detected key and tempo and the models used. It also has the downloads: **Styled MP3**, **Styled MIDI** and **Transcribed MIDI**.
- The pen button maps a text prompt to a genre, strength and mood by keyword, for example "bold heavy metal", "subtle lo-fi" or "dark orchestral".

**Measured on 2026-11-10** in headless Chrome, on a 22.5 s test clip (*Ode to Joy* synthesised with known tempo, key and chords):
- Timings: transcription ≈ 9 s on WebGL. A Balanced render takes ≈ 2–3 s. A Bold render takes ≈ 3–6 s once its model is loaded; the first load takes 5–20 s.
- Accuracy: the analysis recovered the tempo (96.0 vs 96 BPM), the key (G major), the downbeat, the chord progression (G–Em–C–D) and the melody note for note.

**Console hook** (handy for demos and debugging):
- `GTDebug.track.job.score` holds the analysis;
- `GTDebug.track.job.get('jazz', 'bold').arrangement` holds the generated MIDI.

## Live mode with a model server (optional, later)

An audio-diffusion backend could still be added for comparison: set `API_BASE` in `js/app.js` to a local model server (e.g. ACE-Step behind FastAPI). The MIDI pipeline above does not need it.

## Files

| Path | Role |
|---|---|
| `index.html` | Markup: top bar, transport, tabs, wheel, sliders, tracks, "how it works", model sheet, prompt dialog |
| `css/style.css` | Liquid-glass design system, layout, reduced-motion support |
| `js/background.js` | Drifting, audio-reactive light field (canvas, 30 fps, blurred) |
| `js/audio-core.js` | Shared Web Audio graph: mood filter, compressor, level meter |
| `js/synth.js` | The browser-synth preview (three synced arrangements) |
| `js/player.js` | Plays the synth or real files; crossfades and keeps position |
| `js/wheel.js` | The SVG style wheel (genres, strength presets, centre A/B knob) |
| `js/app.js` | State and UI wiring; `GENRES`, `PRESETS`, `MODELS`, `API_BASE`; upload → pipeline, downloads, prompt keywords |
| `js/midi/pipeline.js` | Runs the MIDI pipeline for each upload: decode, transcribe, analyse, render queue, exports |
| `js/midi/transcribe-worker.js` | Basic Pitch transcription in a module worker |
| `js/midi/analyse.js` | Tempo, beats, downbeat, key, chords, melody (also runs in Node) |
| `js/midi/arranger.js` | Arrangement toolkit: beat grid, voicings, melody, drum patterns |
| `js/midi/genres.js` | The eight genre recipes and their drum patterns |
| `js/midi/models.js` | Magenta.js wrappers: Coconet, DrumsRNN, GrooVAE, ImprovRNN |
| `js/midi/render.js` | Offline renderer: soundfont sampler, drum synth, effects |
| `js/midi/export.js` | WAV, MP3 (lamejs) and MIDI (@tonejs/midi) files |
| `demo/manifest.json` | List of demo tracks and their model outputs |

**Accessibility:**
- keyboard support for the wheel (Tab, arrows, Enter) and tabs (arrows);
- Space plays or pauses;
- `prefers-reduced-motion` stops the animations;
- every control has a label.
