# Mindscape: genre-transfer demo site

A static website for the Advanced AI group project (Project II, music style transfer). Users pick a **genre** on a style wheel, set the **strength**, and switch between the original and the styled version while playback keeps its place.

- **Layout:** modelled on the Pocket Bard mobile app (now-playing pill, transport with a play orb, radial style wheel, sliders, bottom sheet).
- **Look:** a "mindscape" of liquid-glass panels over slowly moving, audio-reactive lights. The colours follow what you hear:
  - **green & black** in the normal state (the original; the site starts here);
  - **black & white** for **Classical**;
  - **red & black** for **Rock**.

  Themes are defined in `js/background.js` (`PALETTES`) and `js/app.js` (`GENRES`, `ORIGINAL_THEME`).

It is plain HTML, CSS and JavaScript, with no build step and no dependencies. Fonts load from Google Fonts and fall back to system fonts offline.

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

**Option A: double-click `index.html`.** It works from `file://`. The browser blocks reading `demo/manifest.json` that way, so the site falls back to its built-in demo track.

**Option B (recommended): a local web server.** This reads the manifest too.

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

## Live mode (later, local only)

Transforming *uploads* needs a model server on your own machine (planned: ACE-Step 1.5 behind a small FastAPI adapter). When it exists:

- set `API_BASE` in `js/app.js` (e.g. `http://localhost:8000`);
- the site will send uploads and the chosen genre, strength and prompt to it.

Until then, uploads play as the original only.

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
| `js/app.js` | State and UI wiring; `GENRES`, `PRESETS`, `MODELS`, `API_BASE` |
| `demo/manifest.json` | List of demo tracks and their model outputs |

**Accessibility:**
- keyboard support for the wheel (Tab, arrows, Enter) and tabs (arrows);
- Space plays or pauses;
- `prefers-reduced-motion` stops the animations;
- every control has a label.
