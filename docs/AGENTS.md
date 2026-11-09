# AGENTS.md: Genre-Transfer Web App (guide for AI agents)

> Scope: this whole repository, i.e. the `Advanced AI Project/` folder (the git root). This file lives in `docs/`. Read fully before acting. Last updated 2026-11-09.
> **Layout changed on 2026-11-09:** the project moved out of `Advanced AI/Project/` into its own folder, and the review files were renamed (see §1). Older notes and memories may still use the old paths. The status log (§9) keeps the old names as history.
> The `AGENTS.md` in the sibling `Advanced AI/` folder belongs to Assignment I (YOLO object detection) and does not apply here.

---

## 0. TL;DR

- **Project:** a web app where a user uploads a song (MP3/WAV) and changes its **genre** via a **text prompt** or **predefined style buttons**. Models: **guided diffusion** (Track A) and **autoencoder-style per genre / class models** (Track B). Start with **2–3 genres**.
- **Source of truth for the plan:** `docs/Advanced AI Project.md`, the team's own document. **Do not edit it unless the user asks.** Proposed changes live in `docs/PLANNING_SUMMARY.md` §4 and §13.
- **Current phase (2026-11-09):** Literature Review. The primary deliverable is `docs/LITERATURE_REVIEW.md` (v3.1, the short review, cited as "SR §x"). `docs/LITERATURE_REVIEW_Extended.md` (v2) is the extended evidence version (cited as "LR §x").
- **Agreed scope (v3, 2026-11-09)**, detailed in `docs/PLANNING_SUMMARY.md` §3–4:
  - instrumental ~30 s clips, **Classical ↔ Rock** first (Pop later);
  - primary model **ACE-Step 1.5 Cover**, backup Stable Audio 3;
  - **three trained models, all must-haves** (training plan in `docs/PLANNING_SUMMARY.md` §6b): **M1** mel-spectrogram AE + pretrained vocoder (designed and trained from scratch), **M2** LoRA per genre on the diffusion model, **M3** genre/style-embedding probe (frozen CLAP/MERT/MuQ + small classifier);
  - demo: **static site in `site/`** (local, GitHub-Pages-ready); a local live mode via a model server is a should-have;
  - cut: RAVE, the symbolic route, deployment/auth.
- **What AI agents may touch (set by the user on 2026-11-09):**
  1. the literature review and planning docs (`docs/`, this file);
  2. **the web application**, only when the user asks to start it.

  Do **not** write model-training, data-collection or evaluation code, or create notebooks, unless the user explicitly asks.

---

## 1. Document map

All paths are relative to the repository root.

| File | Owner / audience | Rules |
|---|---|---|
| `README.md` | Public landing page of the GitHub repo | Keep its layout tree, document table and links in sync with this map |
| `docs/Advanced AI Project.md` | Team (likely exported from a shared doc) | Read-only for agents unless asked |
| `docs/LITERATURE_REVIEW.md` | Graders + team (**primary review, v3.1**; was `LITERATURE_REVIEW_SHORT.md` until 2026-11-09) | ≈5.3k-word main body, 84 references, brief-compliance table (§1.5), evidence-graded table (§3.7), models and tools in Appendix A. Keep it short. Keep the section numbering stable, because other docs cite "SR §x" |
| `docs/LITERATURE_REVIEW_Extended.md` | Evidence (v2, extended; was `LITERATURE_REVIEW.md` until 2026-11-09) | Full 157-reference evidence base, model fact sheets in Appendix A. Apply corrections only; don't expand. Other docs cite it as "LR §x" |
| `docs/LIT_REVIEW_SUMMARY.md` | Team (quick reference) | Condensed version of the review. **Update it whenever the full review changes**, and add no claims that aren't in the full review |
| `docs/PLANNING_SUMMARY.md` | Team | Plan v3: mirrors `docs/Advanced AI Project.md` + literature-driven proposals. Update it when plans change |
| `docs/AGENTS.md` | AI agents (this file) | Keep the status log (§9) current. It is not at the repo root, so harnesses that auto-load a root `AGENTS.md` won't find it; point them here |
| `site/` | Demo website (static) | Plain HTML/CSS/JS, no build. Read `site/README.md` before editing. Real audio goes in `site/demo/` and is listed in `site/demo/manifest.json`. Never commit copyrighted audio |
| `.github/workflows/pages.yml` | Deploys `site/` to GitHub Pages **only when a pull request into `prod` is merged** (user requirement, 2026-11-09). Runs on every push to `prod`; a `gate` job checks via the API that the pushed commit is a merged PR's `merge_commit_sha`, otherwise `deploy` is skipped with a notice. No build step, no path filter, no manual dispatch | Don't add other deploy triggers (e.g. `workflow_dispatch`, plain pushes) without asking. The static demo must stay deployable without model outputs |
| `Mindscape-genre-transfer/` | Untracked stray folder: an empty clone of the repo (`.git` only, nothing checked out) | Not part of the project. Don't commit it or work in it; ask the user before deleting it |
| `Group Project - Advanced_AI .pdf` (user's files, not in folder) | Brief | Project II = "Exploring Transfer Style in Music Generation". Deliverables: written document, code, presentation. Its sections 3 and 4 have headings copied from Project I; follow the bullet contents |

---

## 2. Verified technical facts (for planning and the web app)

All facts below were checked on 2026-11-09. Details and citations are in LR Appendix A (`docs/LITERATURE_REVIEW_Extended.md`) and SR Appendix A (`docs/LITERATURE_REVIEW.md`).

| Model | Licence | Genre-transfer entry point | Hardware (vendor figures) |
|---|---|---|---|
| **ACE-Step 1.5** (github.com/ace-step/ACE-Step-1.5) | MIT (code and weights) | task `cover`: `src_audio`, caption, `audio_cover_strength` 0–1 (1.0 = keep structure; 0.2 suggested for style transfer); `reference_audio`; tasks `repaint`, `lego`, `extract`, `complete` (last three: base model only) | DiT-only ≥4 GB; 8–16 GB tier = 2B turbo/sft + 0.6–1.7B LM; cover skips the LM; ~10 GB disk. LoRA example ≈12 GB (8 GB possible but slow, per community reports), so use a teammate's ≥12 GB GPU |
| **Stable Audio 3** (github.com/Stability-AI/stable-audio-3) | Stability AI Community Licence; gated HF download | `model.generate(init_audio=(sr, tensor), init_noise_level=0.1–1.0, prompt=..., duration=...)`; inpainting via `inpaint_audio`, `inpaint_mask_start_seconds`, `inpaint_mask_end_seconds` | Medium: CUDA + **FlashAttention required**, ~6.5 GB peak at 120 s; Small: CPU OK, ≤2 min |
| **Stable Audio Open 1.0** | Community Licence | stable-audio-tools `generate_diffusion_cond(init_audio=..., init_noise_level=...)`; diffusers `initial_audio_waveforms` | ≤47 s |
| **RAVE** (*cut in v3; replaced by the mel-AE*) | Pre-trained collections usually CC BY-NC 4.0 | Train per genre; run input through the model = timbre transfer | Training ≥8 GB GPU, days to weeks; ≥ ~3 h audio per genre |
| **BigVGAN v2 / Vocos** (Track B vocoder) | MIT | Mel-spectrogram → audio for the per-genre AE | BigVGAN v2 has 44 kHz checkpoints; HiFi-GAN is speech-only (don't use) |
| **LAION-CLAP / MERT / MuQ** (probe) | Open | Frozen embeddings → genre probe (style embeddings), CLAP score | Inference only. Use different encoders for steering and for evaluation |
| **MusicGen-Melody / -Style** | Code MIT, **weights CC BY-NC 4.0** | Melody (chroma) or 1.5–4.5 s style excerpt + text | — |

ACE-Step 1.5 ships a **Gradio UI** (`uv run acestep`, port 7860) and a **REST API** (`uv run acestep-api`, port 8001). The hosted fallback is fal.ai `fal-ai/stable-audio-3/medium/audio-to-audio` (paid; parameters: `prompt`, `audio_url`, `init_noise_level` default 0.9, `duration` ≤380, `num_inference_steps` default 8). It is an external service, so **ask the user before sending any audio to it.**

---

## 3. Machine & environment (verified 2026-11-04)

| Item | Value |
|---|---|
| OS / shell | Windows 11 Home; PowerShell 5.1 (no `&&`); Git Bash available |
| GPU | NVIDIA RTX 3080, **10 GB**, driver 610.88; 32 GB RAM; ~190 GB free on C: |
| Existing env | mamba env `advanced_ai`: Python 3.10, **torch 2.14.1+cpu (no CUDA)**. Don't use it for models and don't modify it |
| Project path | `C:\Users\david\OneDrive\Documents\School\Advanced AI Project\` (own folder since 2026-11-09; the repo root). Inside **OneDrive**, path has spaces. Quote paths and use `pathlib`. Keep audio, model weights and caches **outside OneDrive** (e.g., `C:\musicst\`), and point `HF_HOME` there |
| Git | Repo `github.com/DVelascoHerruzo/Mindscape-genre-transfer` (public). Initial commit `f180b9e` (2026-11-09, by the user). Remote branches (checked 2026-11-09): **`dev`** (default) and **`prod`**. The user committed the rename/link fixes as `8f07c3c` ("Document Update") on `dev` and pushed it. They now work on a local feature branch, `Frontend`, branched from `dev`. Flow: feature branch → `dev` → PR into `prod` (which deploys). The local `master` is stale (its upstream no longer exists on the remote). Ask before commits or pushes. Never commit data, weights or copyrighted audio (`.gitignore` covers them) |
| GitHub Pages | **Not enabled** on the new repo (API 404 on 2026-11-09). Deploys happen only on a **merged PR into `prod`** (workflow changed locally 2026-11-09, uncommitted and unpushed). Nothing deploys until (1) Pages is enabled with source "GitHub Actions", (2) the `github-pages` environment allows `prod` if its deployment branches are restricted, and (3) the new workflow reaches `prod` through a merged PR. Setup steps are in `site/README.md` ("Publish on GitHub Pages"). URL once live: <https://dvelascoherruzo.github.io/Mindscape-genre-transfer/> |
| Known risk | FlashAttention (Stable Audio 3 Medium) is hard to install on native Windows. Prefer ACE-Step first; WSL2 is the fallback |

Ask the user before creating environments, installing packages or downloading models (several GB each).

---

## 4. Web application guidance (started 2026-11-09)

**Current implementation: static demo site in `site/`.** It is the user's chosen direction: local hosting, GitHub-Pages style.

- **Files:** `index.html`; `css/style.css`; `js/background.js` (animated lights), `js/audio-core.js` (shared Web Audio graph), `js/synth.js` (browser-synth preview), `js/player.js` (manifest-based player with crossfades), `js/wheel.js` (SVG style wheel), `js/app.js` (UI wiring); `demo/manifest.json`.
- **Design language** (user-specified):
  - layout modelled on the *Pocket Bard* app: now-playing pill, transport with a play orb, a radial style wheel (outer ring = genres, inner ring = strength presets), sliders, bottom sheet;
  - look: **"mindscape" liquid glass**: frosted translucent panels over slowly moving audio-reactive lights;
  - colour themes (user-specified): **green & black** = normal state (original audio; the site starts here), **black & white** = Classical, **red & black** = Rock;
  - simple but interesting. Keep to that.
- **Constraints:**
  - It must keep working from `file://` (classic scripts, built-in manifest fallback) and on GitHub Pages (static only).
  - Live transforms need a local model server and stay optional.
  - Respect `prefers-reduced-motion`.
- **Real outputs:** add audio under `site/demo/audio/` and entries in `manifest.json` (format in `site/README.md`). Only our own or CC-licensed source audio; styled outputs are labelled AI-generated in the UI.

The guidance below still applies to the optional **local live mode** (upload → model server → result).

**Must-have scope** (from `Advanced AI Project.md`):

- upload a music file;
- style **buttons** or a **prompt**;
- run the transformation;
- play and download the result.

Nice-to-haves (history, sharing, deletion, roles, showcase, deployment, testing, monitoring) come only after the must-haves work.

**Recommended approach** (LR §10):

1. **Stack for live mode:** a small local Python server (FastAPI, or ACE-Step's own REST API behind an adapter) that the static site calls when `API_BASE` is set in `site/js/app.js`. No Gradio UI is needed, because the site is the UI.
2. **Folder for live mode:** `server/` at the repo root, with `app.py`, `backends/` (model adapters), `presets.yaml`, `requirements.txt`, `README.md`.
3. **Adapter interface:** every model behind `transform(input_path, target: str | None, prompt: str | None, strength: float, seed: int | None) -> output_path`.
4. **Build order:**
   - Build a **mock backend** first (returns the input, or a pitch-shifted or filtered copy) so the UI works without a GPU.
   - Then add the ACE-Step backend, calling its REST API or the Python `generate_music`.
   - Then add Stable Audio 3.
5. **Presets:** button → `{prompt, strength, (lora)}` in `presets.yaml`. Keep the values editable, because the evaluation phase will tune them.
6. **Jobs:** generation is slow, so use a queue (Gradio `queue()`, or a background task plus polling). Show progress, and cap uploads (e.g., ≤120 s, ≤20 MB).
7. **Audio I/O:** decode with ffmpeg/torchaudio; resample to the model's rate (ACE-Step 48 kHz; Stable Audio 44.1 kHz); loudness-normalise outputs.
8. **UI:** A/B player (original vs result), download button, the parameters used, and an **"AI-generated" label** on every output.
9. **Never** commit audio files or model weights. Delete uploads after processing unless history is explicitly in scope.

---

## 5. Guardrails

1. Stay within the AI scope in §0. If a request implies model training, data pipelines or notebooks, confirm with the user first.
2. Ask before installs, model downloads, `git` operations, sending audio to external APIs, and publishing anything.
3. Don't edit `docs/Advanced AI Project.md` or files outside this repository without being asked.
4. **No unverified citations.** Verify new references (§6) and mark vendor-only claims as such.
5. Use copyrighted songs only on the user's machine. Demo material should be the user's own or Creative Commons.
6. Report honestly: if something fails, say so and show the output.

---

## 6. Verifying references (literature review work)

- arXiv: `Invoke-WebRequest "http://export.arxiv.org/api/query?id_list=<id1>,<id2>&max_results=50"`, then parse titles and authors. One batched request at a time (rate limit about 1 per 3 s).
- Model facts: read the official GitHub README, docs and the Hugging Face model card. Note the date.
- Keep the reference list grouped by topic, as it is now. Add every new in-text citation to it.

---

## 7. Known pitfalls

- **ACE-Step `cover` vs `repaint`:** cover re-renders the whole track in a new style; repaint regenerates a time range.
- **Stable Audio 3 `init_noise_level`:** 1.0 means the input is ignored (pure generation). Genre transfer typically needs mid-to-high values, so tune them per preset.
- **Distilled models** (ACE-Step turbo, Stable Audio 3 post-trained) run without CFG, and guidance-scale settings are ignored.
- **Vocals:** transforming the full mix often garbles lyrics. The decompose-and-keep-vocals pipeline (LR §4) is the documented fix.
- **Evaluation independence:** never tune a model against the same genre classifier used to evaluate it.
- **OneDrive** may lock or upload large files, so keep them outside the project folder.

---

## 8. Open questions for the user

**Resolved 2026-11-09:**
- genres: Classical ↔ Rock first;
- Track B: mel-AE + vocoder;
- vocals: stretch goal;
- web: Gradio MVP (*superseded later the same day by the static demo site in `site/`*);
- time left: 10–14 weeks.

**Still open:**
- exact deadline;
- teammates' GPU specs;
- roles;
- whether to copy `docs/PLANNING_SUMMARY.md` §13 into `docs/Advanced AI Project.md`;
- git: what to do with the stale local `master` branch. Pages deploys only from merged PRs into `prod` (user decision, 2026-11-09);
- whether to delete the stray `Mindscape-genre-transfer/` folder.

---

## 9. Status log (append, newest last)

- **2026-11-04:** v1 docs created, assuming a MIDI-only project. Superseded.
- **2026-11-09:** The user clarified that the project is defined by `Advanced AI Project.md` (audio-upload genre-transfer web app). Rewrote `docs/LITERATURE_REVIEW.md` (v2, audio-first, 157 references with all arXiv IDs API-checked, research questions mapped to plan items), `docs/PLANNING_SUMMARY.md` (plan v2 + proposed changes) and this file. Scope for AI set to the lit review and docs, plus the web app when asked.
- **2026-11-09 (later):** Critical review and rework (plan approved by the user).
  - Created `docs/LITERATURE_REVIEW_SHORT.md` (v3: ≈5k words, 79 refs, all 72 arXiv IDs re-verified, evidence-graded table, new style-embeddings and personalisation sections).
  - Marked the long review as evidence and applied corrections (removed the unverifiable Suno claim, softened the ACE-Step Cover mechanism, verified the Louie et al. N=21).
  - Rewrote `docs/PLANNING_SUMMARY.md` (v3 scope tiers, timeline, honest assessment) and `docs/LIT_REVIEW_SUMMARY.md`.
  - Next: the user reviews; feasibility spikes on the RTX 3080 (team task); web app on request.
- **2026-11-09 (later):**
  - **Short review v3.1:** brief-compliance table (§1.5), symbolic-generation background, tools and libraries section (§2.4); 84 refs, ≈5.3k words.
  - **Plan:** three trained models are now must-haves, with a training plan (PLANNING_SUMMARY §6b) and LoRA promoted to MVP.
  - **Demo site built in `site/`:** Pocket-Bard-style wheel UI, liquid-glass mindscape look, browser-synth preview, manifest for real outputs, deep links.
  - **Verified:** `node --check` on all JS; headless-Chrome DevTools smoke test of every control, including a synthetic upload, at desktop and phone sizes, with 0 JS errors and 0 console warnings.
  - Next: fill `site/demo/manifest.json` with real outputs once the models run; optional local live mode.
- **2026-11-09 (later):** Added a **wide desktop layout (≥1100 px)** to `site/`:
  - three columns: Library | Stage | Listen & compare (the phone's sheet becomes a permanent panel with stat tiles);
  - "How it works" becomes a centred overlay;
  - phone and tablet layouts are unchanged. The breakpoint lives in CSS and in `desktopMQ` (`js/app.js`), and the two must match.
  - Verified with a headless-Chrome test at 1440, 1100, 900 and 390 px: layout, focus/inert handling, Escape-to-close, resize back to phone; 0 errors.
- **2026-11-09 (later):**
  - Preview track changed to Grieg's *In the Hall of the Mountain King* (public domain), with the melody checked against a public MIDI transcription.
  - Added the root `README.md`, `.gitignore` and the Pages workflow.
  - Created the public GitHub repo `mindscape-genre-transfer` and enabled Pages (at the user's request).
- **2026-11-09 (later):**
  - Colour themes now follow the state: green/black (original, default start), black/white (Classical), red/black (Rock). All hardcoded purple/navy tints were removed.
  - The rock arrangement's melody moved from the lead guitar to a bass guitar; power chords went up an octave.
  - Verified with theme screenshots plus the phone and desktop tests; 0 errors. Not yet committed.
- **2026-11-09 (later): repository reorganised by the user.**
  - The project moved from `Advanced AI/Project/` to its own folder, `Advanced AI Project/`, which is now the git root. `AGENTS.md` and `Advanced AI Project.md` moved into `docs/`.
  - New public repo `DVelascoHerruzo/Mindscape-genre-transfer` with branches `dev` (default) and `prod`. Initial commit `f180b9e` includes everything up to the colour-theme entry above.
  - Review files renamed (uncommitted): the short review became `docs/LITERATURE_REVIEW.md`, and the extended one became `docs/LITERATURE_REVIEW_Extended.md`. The "SR"/"LR" citation labels are unchanged.
  - This file was updated to the new layout.
  - **Cross-links fixed** (at the user's request): `README.md` (layout tree, document table, links, Pages URL), `docs/PLANNING_SUMMARY.md`, `docs/LIT_REVIEW_SUMMARY.md`, and the companion/status notes at the top of both reviews. Links inside `docs/` are now same-folder links (e.g. `Advanced%20AI%20Project.md`, `AGENTS.md`).
  - **Pages workflow** now triggers on `prod` instead of `main`. Pages itself still has to be enabled in the GitHub settings.
  - **Nothing committed** (the user said not to commit).
- **2026-11-09 (later): Pages deploys only on merged PRs into `prod`** (user request; "do not push").
  - `pages.yml` rewritten: push to `prod` → `gate` job (looks for a closed PR into `prod` whose `merge_commit_sha` equals the pushed SHA, retrying 3 times) → `deploy` job only if found. Removed the `site/**` path filter and `workflow_dispatch`. The static site is uploaded as it is, so the synth-only demo deploys now.
  - Why not `on: pull_request: types: [closed]`: those runs use the PR merge ref, which can clash with the `github-pages` environment's branch rules. Why not the `commits/{sha}/pulls` endpoint: it only finds merged PRs for commits on the default branch (`dev`).
  - Verified: the YAML parses (PyYAML); the gate script was dry-run against real API data. It found the PR for a real merge commit (actions/deploy-pages PR #440 with `base=main`), and it skipped with a notice for a fake SHA and for our repo (no PRs yet).
  - Docs updated: `site/README.md` (publish steps + one-time settings), `README.md`. Nothing committed or pushed; no GitHub settings changed.
