# Mindscape: genre transfer for recorded music

> Upload a piece of music, pick a genre on a style wheel, and hear it re-imagined while the tune stays recognisable.

**Advanced AI · Group Project II: *Exploring Style Transfer in Music Generation*** · IE University · 2026

**Live demo:** <https://dvelascoherruzo.github.io/mindscape-genre-transfer/>

---

## What this project is

We are building a web application that changes the **genre** of an uploaded recording, guided by a **text prompt** or a **preset style button**. The project has three strands:

- **How music generation models work:** audio autoencoders, diffusion and flow transformers, and style embeddings.
- **How to change a song's characteristics** without losing its melody.
- **How to evaluate** the results beyond listening by ear.

The first version targets **instrumental clips of about 30 s, transferred between Classical and Rock**. Pop and songs with vocals come later.

## Status (November 2026)

| Phase | Status |
|---|---|
| Literature review | ✅ Short review (main deliverable) + extended evidence version |
| Planning | ✅ Plan v3: scope tiers, training plan, timeline |
| Demo site | ✅ Phone and desktop UI, with a browser-synthesised preview track. Real model outputs come next |
| Data collection, modelling, evaluation | ⏳ Next phases |

## Approach in brief

| Part | Choice | Why |
|---|---|---|
| Main transfer mechanism | **ACE-Step 1.5** *Cover* task (pre-trained latent diffusion transformer). Backup: **Stable Audio 3** audio-to-audio | Open models that change the genre of real audio, with a strength control |
| **M1**, our own model | Mel-spectrogram autoencoder: shared encoder, one decoder per genre, pretrained **BigVGAN** vocoder | The "autoencoder per genre" idea, trained from scratch |
| **M2**, fine-tuning | **LoRA** genre adapters on the diffusion model | Trains the selected model on our classical and rock data |
| **M3**, style embeddings | Genre probe on frozen **CLAP / MERT** embeddings | Extracts style embeddings and scores every output |
| Evaluation | Genre probe and CLAP score (target genre), chroma and beat agreement (same piece), KAD and Audiobox Aesthetics (quality), runtime, plus a listening test | Shown as trade-off curves over the strength setting |

Details: [docs/PLANNING_SUMMARY.md](docs/PLANNING_SUMMARY.md) · evidence: [docs/LITERATURE_REVIEW_SHORT.md](docs/LITERATURE_REVIEW_SHORT.md)

## Repository layout

```
.
├── README.md                     ← you are here
├── Advanced AI Project.md        ← the team's original project plan
├── AGENTS.md                     ← instructions for AI coding assistants
├── docs/
│   ├── LITERATURE_REVIEW_SHORT.md  ← main literature review (≈5.3k words, 84 refs)
│   ├── LITERATURE_REVIEW.md        ← extended evidence version (157 refs)
│   ├── LIT_REVIEW_SUMMARY.md       ← one-page team quick reference
│   └── PLANNING_SUMMARY.md         ← plan v3: scope, training plan, timeline, risks
├── site/                         ← static demo website (GitHub Pages)
│   ├── index.html, css/, js/
│   ├── demo/manifest.json        ← list of demo tracks and model outputs
│   └── README.md                 ← how to run it and how to add outputs
└── .github/workflows/pages.yml   ← deploys site/ to GitHub Pages
```

## Documents

| Document | For | Contents |
|---|---|---|
| [Literature review (short)](docs/LITERATURE_REVIEW_SHORT.md) | Graders, team | Architectures, five families of transfer technique with an evidence table, style embeddings, fine-tuning, content preservation, evaluation, data and ethics |
| [Literature review (extended)](docs/LITERATURE_REVIEW.md) | Evidence | The full 157-reference survey behind the short review |
| [Literature review summary](docs/LIT_REVIEW_SUMMARY.md) | Team | Quick reference: key facts, tables, checklists |
| [Plan v3](docs/PLANNING_SUMMARY.md) | Team | Honest scope assessment, MVP/should/stretch tiers, training plan for M1–M3, timeline, roles, risks |
| [Demo site guide](site/README.md) | Developers | Running locally, layouts, adding model outputs, deep links |

## Run the demo locally

```bash
cd site
python -m http.server 8000
# open http://localhost:8000
```

You can also just open `site/index.html`. It falls back to the built-in preview track. The site works on phones (tabs and a slide-up sheet) and on desktops (a three-column layout at ≥ 1100 px).

Until our models produce outputs, the demo plays Grieg's *In the Hall of the Mountain King* (1875, public domain), **synthesised in the browser** in three synchronised arrangements (plain, classical, rock). This shows the interaction; it is not a model output. To add real outputs, see [site/README.md](site/README.md#adding-real-model-outputs).

## Data, audio and licensing

- **No copyrighted audio lives in this repository.** Training and evaluation audio is stored locally, outside git. Planned sources are MusicNet (CC BY 4.0) and Creative Commons tracks from the Free Music Archive and MTG-Jamendo.
- **Published demo outputs** (`site/demo/audio/`) may only use our own or Creative Commons source audio, credited in the manifest. Every styled clip is AI-generated and labelled as such in the UI.
- **Models and their licences:** ACE-Step 1.5 is MIT; Stable Audio 3 uses the Stability AI Community Licence; BigVGAN is MIT. See the literature review, Appendix A.
- **Fonts:** Inter and Poppins (SIL Open Font License), via Google Fonts.
- **Code licence:** not chosen yet (all rights reserved until the team decides).

## Team

*[Group member names and roles]* · Advanced AI, IE University, 2026.

## Acknowledgements

This project builds on open research and tools including ACE-Step, Stable Audio, BigVGAN, LAION-CLAP, MERT, MusicNet, the Free Music Archive and MTG-Jamendo. Full references are in the [literature review](docs/LITERATURE_REVIEW_SHORT.md#references).
