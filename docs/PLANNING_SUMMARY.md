# Project Plan v3: Genre-Transfer Web App

**Advanced AI · Group Project II (Exploring Style Transfer in Music Generation) · IE University**
Last updated: 9 November 2026 · Phase: **Literature Review** · Time left: **10–14 weeks**
Group: *[member names]* · Exact deadline: *[fill in]*

> This is the team plan. It builds on our own plan in [`Advanced AI Project.md`](Advanced%20AI%20Project.md), which is unchanged, and on the literature review:
> - [LITERATURE_REVIEW.md](LITERATURE_REVIEW.md): the main deliverable (the short review), cited as "SR §x";
> - [LITERATURE_REVIEW_Extended.md](LITERATURE_REVIEW_Extended.md): the extended evidence, cited as "LR §x";
> - [LIT_REVIEW_SUMMARY.md](LIT_REVIEW_SUMMARY.md): the quick reference.
>
> §3–§4 are the honest recommendations and the decisions taken on 9 Nov 2026. §13 lists the changes we could copy into `Advanced AI Project.md` if the group agrees.

---

## 1. Project definition (from our plan, unchanged)

> *A web application that takes an uploaded music file and with the user's input it can change it to another music genre.*

**Must-haves:**

- working models (autoencoder-style per genre; guided diffusion models);
- a web interface that takes the given file and performs the transformation;
- notebooks with model testing and evaluation;
- transformation guided by a prompt or a hard-coded style button.

**Deliverables:** literature review · working model · web application · presentation.

The official brief also asks us to *extract style embeddings*, *train the selected model and experiment with hyperparameters*, and to write a *short* literature review focused on techniques and architectures.

---

## 2. Honest assessment: where our original plan is unrealistic or weak

1. **Too much at once.** The plan has two model families, 2–3 genres, full songs with vocals, a web app with optional extras, deployment and a big evaluation, for a student team in 10–14 weeks. Each part is doable alone; together they risk ending with many half-finished pieces. **We need an MVP first.**
2. **Songs with vocals are the hardest case.** Transforming a full mix usually garbles lyrics. Keeping the vocals means separation plus tempo/key alignment of a new accompaniment. That is a project on its own. → **Instrumental first.**
3. **"Autoencoder per genre" will not beat the diffusion models.** Per-domain autoencoders mainly change the *sound* (timbre), not the *arrangement*. RAVE also needs days to weeks of training per genre and works best on single-instrument audio, not full mixes (SR §3.1). → Keep it as an **explainable baseline**, built the cheap way: a mel-spectrogram autoencoder plus a pretrained music-capable vocoder.
4. **Using only a pre-trained model risks the grade.** The brief says *"train the selected model on the collected dataset"*, *"experiment with different hyperparameters"* and *extract style embeddings*. Running ACE-Step alone shows none of these. → We **train three models**, all must-haves (§6b):
   - **M1:** a mel-spectrogram autoencoder that we design and train from scratch;
   - **M2:** **LoRA genre adapters** fine-tuned into the selected diffusion model (SR §5);
   - **M3:** a **genre / style-embedding probe** on frozen CLAP/MERT embeddings (SR §4).
5. **Too many candidate models.** The local-models list (ACE-Step 1.5, Stable Audio 3, Stable Audio Open, RAVE) would split the team. → **One primary model (ACE-Step 1.5)** and one backup (Stable Audio 3).
6. **Data phases are oversized for what we now need.** The diffusion model needs no training data. We need a small evaluation set plus training clips for the probe, the autoencoder and LoRA. → Shrink data collection and start feasibility tests **now**, during the lit-review weeks.
7. **Evaluation was undefined, then over-defined.** → About **5 metrics + a short listening test**. The headline result is a **trade-off curve**: how much it sounds like the target genre versus how recognisable it stays, as strength increases (SR §7).
8. **The web nice-to-haves add little to an Advanced AI grade.** History, roles, sharing, deployment and monitoring take real time. → **Gradio, must-haves only.**
9. **The vendor numbers are not facts about our machine.** VRAM and speed figures come from the model authors (SR §3.7: evidence grade D). → Our first experiment is to **measure** them on the RTX 3080.

---

## 3. Decisions taken (9 Nov 2026)

| Topic | Decision |
|---|---|
| Literature review | New **short review** = main deliverable; long review kept as evidence |
| First genres | **Classical ↔ Rock**; Pop is the 3rd genre later |
| Content scope | **Instrumental clips (~30 s) first**; vocals are a stretch goal |
| Trained models (all must) | **M1** mel-spectrogram AE genre translator (designed + trained from scratch) · **M2** LoRA genre adapters on the diffusion model · **M3** genre/style-embedding probe. See §6b |
| Web demo | **Static demo site** in `site/` (local, GitHub-Pages-ready), Pocket-Bard-style wheel UI with a liquid-glass "mindscape" look. Live transforms later via a local model server (§9) |
| Autoencoder route | **Mel-spectrogram autoencoder** (shared encoder, one decoder per genre) + **pretrained vocoder** (BigVGAN v2 or Vocos; HiFi-GAN is speech-only) |
| Primary diffusion model | **ACE-Step 1.5** *Cover* (MIT; Windows launchers; Gradio UI + REST API) |
| Backup | Stable Audio 3 *audio-to-audio* (Medium needs FlashAttention; Small runs on CPU) |
| Time | 10–14 weeks remaining |
| Compute | RTX 3080 (10 GB) is the reference machine; teammates also have GPUs (specs to collect) |

---

## 4. Priority tiers

| Tier | Item | Why |
|---|---|---|
| **MVP (must)** | ACE-Step 1.5 Cover on 30 s instrumental clips, classical ↔ rock, with 2 presets tuned by a strength sweep | Fastest route to a working, demonstrable feature |
| | Genre / style-embedding probe (frozen CLAP and/or MERT/MuQ + small classifier) | Satisfies "style embeddings" + "train"; doubles as a metric and preset tuner |
| | **M1** Mel-autoencoder per genre + pretrained vocoder, trained from scratch | Satisfies "autoencoder per genre" and "train the selected model"; explainable |
| | **M2** LoRA per genre (compare against prompt-only Cover) | Trains the *selected* diffusion model on our data; open research question (SR §5) |
| | Evaluation notebook: 5 metrics + trade-off curves + short listening test | Answers "how to evaluate" |
| | Demo site: style wheel, Classical/Rock, strength + mood, A/B, AI label | Satisfies the web-app must-have (§9) |
| **Should** | Local live mode for the demo site (upload → model server → result) | Real transforms of user uploads |
| | Stable Audio 3 audio-to-audio as a second backend | Comparison between models; only if FlashAttention installs or Small is good enough |
| | Pop as the 3rd genre | Original plan's genre; vocals make it harder |
| **Stretch** | Keep-vocals pipeline (separate → keep vocals → new accompaniment → re-mix) | Needed for real pop songs |
| | MusicGen-Melody baseline; one inversion-based editor (e.g., ZETA) | Literature comparison |
| | Web nice-to-haves (history, filters) | Only if everything else is done |
| **Cut / defer** | RAVE (replaced by the mel-AE); symbolic MIDI route; Stable Audio Open 1.0 (fallback only); auth/roles/sharing/deployment/monitoring | Cost far above benefit for this course |

---

## 5. MVP pipeline

```
 UPLOAD (≤30–60 s, instrumental)        TRANSFORM                                   SHOW
┌───────────────────────────┐   ┌─────────────────────────────────────────┐   ┌──────────────────────┐
│ MP3/WAV                   │──►│ A. ACE-Step 1.5 Cover (strength preset) │──►│ Gradio: A/B player,  │
│ + button (Classical/Rock) │   │ B. Mel-AE (genre decoder) + vocoder     │   │ download, parameters,│
│   or prompt               │   │ (+ LoRA adapter if ready)               │   │ "AI-generated" label │
└───────────────────────────┘   └─────────────────────────────────────────┘   └──────────────────────┘
             │                                     │
             ▼                                     ▼
   decode, resample, loudness     STYLE-EMBEDDING PROBE (CLAP/MERT + classifier)
                                  → genre score for each output; used for preset tuning and evaluation
```

Each model sits behind one function, `transform(audio, target_genre or prompt, strength) → audio`, so the app and the notebooks share code.

---

## 6. Work tracks (2 people per approach, as in our plan)

### Track A: Diffusion (2 people)

| Step | Task | Done when |
|---|---|---|
| A1 | Install ACE-Step 1.5 on the RTX 3080; Cover one classical and one rock clip | Output saved; **measured** time + peak VRAM |
| A2 | Strength sweep (e.g., 0.1–0.9) on the evaluation clips, both directions | Trade-off data for §8 |
| A3 | Pick preset values (prompt + strength) per direction using the probe + listening | `presets` table agreed |
| A4 | **M2:** LoRA per genre (ACE-Step example uses ~12 GB → use a teammate's ≥12 GB GPU; else Stable Audio 3 LoRA, Medium ≈6.5 GB / Small ≈2.5 GB on the RTX 3080) | With vs without LoRA compared (§6b) |
| A5 *(should)* | Stable Audio 3 backend | Same sweep, same metrics |

### Track B: Mel-spectrogram autoencoder (1–2 people)

| Step | Task | Done when |
|---|---|---|
| B1 | Pick the vocoder (BigVGAN v2 44 kHz or Vocos) and check reconstruction quality on our clips | Vocoded originals sound acceptable |
| B2 | Train a shared encoder + classical decoder + rock decoder on mel-spectrograms | Reconstructions per genre |
| B3 | Transfer: encode clip → decode with the other genre's decoder → vocode | Outputs for the evaluation set |
| B4 | Notebook explanation (architecture, latent space, why it mostly changes timbre) | Ready for report and slides |

### Track C: Style embeddings + evaluation (1 person; joins A/B later)

| Step | Task | Done when |
|---|---|---|
| C1 | Extract embeddings (CLAP + MERT or MuQ) for training clips | Embeddings cached |
| C2 | Train a genre probe (logistic regression or small MLP); report accuracy; plot embeddings (t-SNE/UMAP) | "Style embedding" deliverable |
| C3 | Evaluation notebook (§8) used by Tracks A and B | Shared metrics code |

---

## 6b. Training plan: the models we actually train

The brief requires us to *train the selected model on the collected dataset* and *experiment with different hyperparameters*. We train **three models**:
- **M2** trains the selected diffusion model (fine-tuning).
- **M1** is a model we design and train end-to-end.
- **M3** produces our style embeddings.

Every run is logged in one experiment table: run id, model, data version, hyperparameters, metrics, notes.

| | **M1: Mel-AE genre translator** (our own model) | **M2: LoRA genre adapters** (fine-tuning the selected model) | **M3: Style-embedding probe** |
|---|---|---|---|
| What it is | Shared encoder + one decoder per genre on mel-spectrograms. Audio via a frozen **BigVGAN v2** vocoder (44 kHz, 128 mel bands); use the vocoder's own mel settings | One adapter per genre on **ACE-Step 1.5** (fallback: Stable Audio 3 Small/Medium) | Small classifier on frozen embeddings → {classical, rock} |
| Training data | Hours of classical (MusicNet) + rock (FMA/Jamendo), cut into 4–8 s windows | ~20–50 instrumental 30 s clips per genre, with captions | Hundreds of labelled clips per genre (+ GTZAN sanity check) |
| Objective | L1 mel reconstruction. Optional: domain-confusion loss on the latent (UMTN idea); adversarial loss | The model's own diffusion/flow loss via the official LoRA scripts | Cross-entropy |
| Hyperparameters to sweep | latent channels {64, 128}; domain-confusion weight {0, 0.1, 0.5}; learning rate {1e-4, 3e-4}; window 4 s vs 8 s | rank {8, 16, 32}; steps {500, 1000, 2000}; clips {20, 50}; learning rate (default and ×⅓/×3) | encoder {CLAP, MERT or MuQ}; classifier {logistic regression, 1-layer MLP}; MERT layer |
| Compute | RTX 3080; hours per run (*estimate; measure in the smoke test*) | ACE-Step ≈12 GB → teammate GPU; SA3 Small ≈2.5 GB fits the RTX 3080 | Minutes |
| Success criteria (*numbers set after the smoke test*) | Vocoded reconstructions recognisable; transfer raises the target-genre probe score while chroma similarity stays high | Higher target-genre probe / CLAP score than prompt-only Cover **at the same strength**, without lower chroma similarity | Held-out accuracy well above chance; clear clusters in t-SNE/UMAP |
| Deliverable | Training notebook, loss curves, ablation table | Before/after table + audio examples on the demo site | Accuracy table + embedding plot |

**Milestones:**
- **Week 3 smoke tests:**
  - M1 trained end-to-end on ~10 min of audio, through the vocoder;
  - M2: one 200-step LoRA run;
  - M3 on ~50 clips.
- **Week 5:** full data ready.
- **Weeks 6–8:** full runs + sweeps.

If a smoke test fails, we still have two weeks to switch to the fallback (e.g., SA3 LoRA instead of ACE-Step LoRA).

---

## 7. Data plan (classical + rock)

| Use | Classical | Rock | Amount |
|---|---|---|---|
| Probe, AE and LoRA training | MusicNet recordings (CC BY 4.0; chamber/solo, so "classical" = chamber timbre) | FMA rock sub-genres / MTG-Jamendo rock (CC); instrumental, or vocals removed with Demucs | AE: as many 5–10 s windows as possible (hours of audio); LoRA: ~20–50 clips per genre; probe: hundreds of clips per genre |
| Evaluation set | MusicNet held-out recordings | Held-out FMA/Jamendo tracks | 20–50 × 30 s per genre, **never used for training** |
| Sanity check | GTZAN classical (research use; known errors) | GTZAN rock | 100 clips each |

Keep a **licence log** (file, source, licence, use). Store audio outside OneDrive.

---

## 8. Evaluation plan (compact)

| Question | Metric |
|---|---|
| Sounds like the target genre? | Probe probability (use a *different* encoder than any used for steering); CLAP score vs target prompt |
| Still the same piece? | Chroma similarity (melody/harmony); beat/tempo agreement (rhythm; important for classical ↔ rock) |
| Sounds good? | KAD vs real target-genre clips (works with small sets); Audiobox Aesthetics |
| Practical? | Seconds per 30 s clip; peak VRAM on the RTX 3080 |
| People's view | Listening test: 1–5 for genre match, recognisability, quality; ≥15 listeners; blind and random order |

**Headline figure:** genre match vs recognisability across strengths, one curve per method (ACE-Step, ACE-Step + LoRA, mel-AE).

---

## 9. Web demo (started 9 Nov 2026)

- **Static demo site** in [`site/`](../site/): plain HTML/CSS/JS with no build step. Run it locally with `python -m http.server` inside `site/`, or open `index.html` directly. It can be published to **GitHub Pages** unchanged.
- **UI (modelled on the Pocket Bard app):**
  - a "now playing" pill;
  - transport controls with a glowing play orb;
  - a **style wheel**: outer ring = genres (Classical and Rock active; others "soon"), inner ring = strength presets (Subtle / Balanced / Bold);
  - **Strength** and **Mood** sliders;
  - A/B compare (original vs styled);
  - a bottom sheet to compare models.
- **Look:** a "mindscape" of liquid-glass panels over slowly moving, audio-reactive lights.
- **Audio today:** a browser-synthesised preview (Grieg's *In the Hall of the Mountain King*, 1875, public domain) shows instant style switching before our models produce anything.
- **Audio later:** real outputs are listed in `site/demo/manifest.json` (per track: original + one file per model × genre × preset). Switching style keeps the playback position.
- **Live transforms** (upload → model → result) need a local model server (ACE-Step REST API behind our adapter). That can't run on GitHub Pages, so it becomes a *local-only* mode in the Web App phase (should-have).
- Uploads never leave the browser, and every styled output is labelled AI-generated.

---

## 10. Timeline (10–14 weeks; replaces the original phase table)

| Week | Focus | Key outputs |
|---|---|---|
| 1–2 *(now)* | Literature review **+ feasibility spikes** (A1 on the RTX 3080; vocoder check B1) | Short review done; measured ACE-Step speed/VRAM; demo site skeleton ✅ |
| 3 | Topic research → design + **training smoke tests** (M1–M3, §6b) | Encoders chosen; preset plan; every training pipeline runs end-to-end on a tiny subset |
| 4 | Data collection (classical + rock) | Training clips, evaluation set, licence log |
| 5 | Data preparation + embeddings | Mel-spectrograms, cached embeddings, probe v1 (C1–C2) |
| 6–8 | Modelling | **M1** mel-AE and **M2** LoRA full runs + hyperparameter sweeps; A2–A3 strength sweep + presets; A5 SA3 *(should)* |
| 9–10 | Evaluation | Metrics, trade-off curves, listening test |
| 11–12 | Demo site filled with real outputs + presentation + report | Demo site with model comparisons, slides, written document; optional local live mode |
| 13–14 | Buffer → Pop as 3rd genre or stretch items | Only if the MVP is done |

---

## 11. Roles (from our plan)

| Role | Main tasks |
|---|---|
| **Data Engineer** | Data plan §7, licence log, preprocessing, evaluation set |
| **Data Scientists (≥3)** | Track A (2), Track B (1–2), Track C (1, can overlap) |
| **Software Engineers (1–2)** | Demo site (`site/`), output manifest, model adapter; optional local live mode |
| **Data Visualizer** | Trade-off curves, embedding plots, spectrogram/waveform figures, slides |
| **DevOps** *(optional)* | CUDA environment on each GPU machine; no public deployment in the MVP |

---

## 12. Compute & risks

**Compute.**

- The RTX 3080 (10 GB) is the reference machine for inference and the mel-AE.
- **Collect teammates' GPU specs**: any ≥12 GB card should take the LoRA runs.
- Create a new CUDA-enabled Python environment. The class environment `advanced_ai` is CPU-only.
- WSL2 is the fallback if FlashAttention (Stable Audio 3 Medium) won't install on Windows.

| Risk | Mitigation |
|---|---|
| ACE-Step doesn't fit or is slow on the RTX 3080 | Measure in weeks 1–2; DiT-only/turbo mode; Stable Audio 3 Small (CPU) as fallback |
| Melody/rhythm not preserved | Strength sweep and presets; rhythm metric; instrumental-only scope |
| Mel-AE output sounds poor | Expected for a baseline; report honestly; check the vocoder first (B1) |
| LoRA needs more VRAM | Teammate GPU or Stable Audio 3 LoRA; it's a "should", not a must |
| Not enough instrumental rock | Remove vocals with Demucs (note the artefacts); use MTG-Jamendo tags |
| Evaluation circularity | Use different encoders for steering and for judging |
| Licences / copyrighted uploads | Licence log; demo with our own or CC music; AI-generated label |
| Time | Tiers in §4; buffer weeks 13–14 |

---

## 13. Proposed changes to `Advanced AI Project.md` (for the group to accept)

| Section | Change |
|---|---|
| Focus | "2–3 styles" → **Classical ↔ Rock first (instrumental), Pop later** |
| Must have: models | "autoencoder-style per genre" → **mel-spectrogram AE + pretrained vocoder (baseline)**; "guided diffusion" → **ACE-Step 1.5 Cover (primary), Stable Audio 3 (backup)** |
| New must-have | **Three trained models:** M1 mel-AE, M2 LoRA per genre, M3 genre/style-embedding probe (§6b) |
| Risks | Add: vendor figures unverified on our GPU; FlashAttention on Windows; evaluation circularity |
| Data Collection | MusicNet (classical) + FMA/MTG-Jamendo (rock) audio; Kaggle pop MIDI not needed for the MVP |
| Evaluation | 5 metrics + listening test + trade-off curves |
| Web App | Static demo site (local, GitHub-Pages-ready) with the style wheel; optional local live mode; nice-to-haves only after the MVP |
| Timelines | Replace with §10 (spikes now; shorter data phase; buffer) |
| Local models | ACE-Step 1.5 (primary), Stable Audio 3 (backup); drop RAVE; Stable Audio Open 1.0 fallback only |

---

## 14. Still open

1. Exact deadline and presentation date.
2. Teammates' GPU models/VRAM.
3. Who takes which role and track.
4. Whether to copy §13 into `Advanced AI Project.md`.

---

## 15. Documents & sources

- `Group Project - Advanced_AI .pdf`: official brief (Project II).
- [`Advanced AI Project.md`](Advanced%20AI%20Project.md): our original plan.
- [LITERATURE_REVIEW.md](LITERATURE_REVIEW.md): **main review** (≈5.3k words, 84 references, evidence table, brief-compliance table §1.5).
- [LITERATURE_REVIEW_Extended.md](LITERATURE_REVIEW_Extended.md): extended evidence (157 references).
- [LIT_REVIEW_SUMMARY.md](LIT_REVIEW_SUMMARY.md): quick reference.
- [AGENTS.md](AGENTS.md): instructions for AI assistants.
- Key links:
  - ACE-Step 1.5: https://github.com/ace-step/ACE-Step-1.5
  - Stable Audio 3: https://github.com/Stability-AI/stable-audio-3
  - BigVGAN: https://github.com/NVIDIA/BigVGAN
  - LAION-CLAP: https://github.com/LAION-AI/CLAP
  - MusicNet: https://zenodo.org/records/5120004
  - FMA: https://github.com/mdeff/fma
  - MTG-Jamendo: https://mtg.github.io/mtg-jamendo-dataset
