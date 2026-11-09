# Changing the Genre of a Song with Generative AI: A Literature Review

**Advanced AI · Group Project II: Exploring Style Transfer in Music Generation**
IE University · Research phase · Version 2 · 9 November 2026
Authors: *[group members]*

> **Status: extended evidence version (v2).** The primary literature-review deliverable is now [LITERATURE_REVIEW_SHORT.md](LITERATURE_REVIEW_SHORT.md) (v3, 9 Nov 2026). This document is kept as the full evidence base. Its scope recommendations (§12.3) are superseded by the v3 scope decisions in [PLANNING_SUMMARY.md](PLANNING_SUMMARY.md): classical + rock, instrumental MVP, mel-spectrogram autoencoder instead of RAVE, genre probe + LoRA as trained components. Corrections from the v3 verification pass have been applied here.
>
> **Scope.** This review supports the project defined in `Advanced AI Project.md`: *"A web application that takes an uploaded music file and with the user's input it can change it to another music genre"*. The plan uses autoencoder-style models per genre and guided diffusion models, steered by a text prompt or by predefined style buttons, starting with 2–3 genres. Version 1 of this review (4 Nov 2026) assumed a MIDI-only system and has been replaced. Its symbolic-music material survives in condensed form in §3.10.

---

## Executive summary

1. **Our task already has a literature, under several names.** It appears as *music style transfer*, *genre transfer*, *text-guided music editing*, *audio-to-audio generation* and *cover generation*. Dai, Zhang & Xia's (2018) split of style into composition, performance and timbre is the most useful way to say what "changing genre" means (§1.3).
2. **Open models can already do genre transfer on audio, locally.** ACE-Step 1.5 (MIT licence) has a dedicated **Cover** task with an `audio_cover_strength` control. Its docs suggest 0.2 for style transfer. The open **Stable Audio 3** library has an **audio-to-audio** mode with `init_noise_level`. Vendor documentation suggests both fit an RTX 3080 (10 GB). The diffusion track of the plan is therefore feasible without training a model from scratch (§3.4, §9).
3. **Every method has the same trade-off.** The more the source is noised or "forgotten", the stronger the genre change and the weaker the preservation of melody, rhythm and form (Meng et al., 2022; Fu et al., 2026). All practical systems expose this as a single knob (noise level, cover strength, inversion depth), and our web app should too (§4).
4. **"Autoencoder per genre" approaches mostly change timbre, not genre.** Per-domain autoencoders and translation networks (Mor et al., 2019; Caillon & Esling, 2021; Lu et al., 2019) keep the input's pitch and rhythm and re-render its sound in the target domain's timbre. RAVE needs hours of audio per domain and days of training. These are valuable as a class-methods baseline, but expectations need adjusting (§3.3).
5. **Melody preservation has four established strategies.** (a) Limit the noise. (b) Invert the audio and control attention (ZETA, MusicMagus, MEDIC, Melodia). (c) Condition explicitly on melody or chroma (MusicGen-Melody, Music ControlNet, JASCO, MuseControlLite, MelodyFlow). (d) Decompose the song, keep the vocals or lead, and regenerate the accompaniment (SingSong, Diff-A-Riff, StemGen, STAGE, ACE-Step "lego/complete") (§4).
6. **Decomposition is solved well enough to use.** Source separation (HT-Demucs, BS-/Mel-RoFormer, SCNet), transcription (Basic Pitch, MT3, YourMT3+) and beat, key and structure analysis (madmom, Beat This!, All-In-One) are open and mature (§5).
7. **Evaluation can go well beyond manual listening.** Measure *style adherence* (CLAP score, a genre classifier, FAD/KAD against a target-genre reference), *preservation* (chroma similarity, melody and beat accuracy, MuseCPEval), *quality* (Audiobox Aesthetics, SongEval) and *efficiency*, then confirm with a listening test. There is no standard benchmark for audio genre transfer, so we must define our own protocol (§7).
8. **Data: our named sources are mostly MIDI.** For audio, MusicNet's recordings (classical, CC BY 4.0) and the Free Music Archive (CC-licensed, 161 genres) are the most usable. GTZAN is famous but flawed and copyrighted (§8).
9. **Licences and law matter for a public app.** ACE-Step 1.5 is MIT. Stable Audio uses the Stability AI Community Licence. MusicGen weights and common RAVE checkpoints are non-commercial. Uploaded songs are usually copyrighted. EU AI Act Article 50 marking duties have applied since 2 Aug 2026 (§11).
10. **The web app has well-trodden patterns.** Gradio is the fastest path, and ACE-Step and AudioCraft ship Gradio UIs. Generation takes seconds to minutes, so it needs a job queue. Style buttons are best implemented as curated prompt-plus-strength presets, which matches HCI findings on "AI-steering" tools (§6, §10).

---

## Table of contents

1. [Introduction](#1-introduction)
2. [How music generative models work](#2-how-music-generative-models-work)
3. [Changing the genre of an existing recording](#3-changing-the-genre-of-an-existing-recording)
4. [Preserving melody and musical identity](#4-preserving-melody-and-musical-identity)
5. [Decomposing music into its elements](#5-decomposing-music-into-its-elements)
6. [Steering the transformation: prompts and style buttons](#6-steering-the-transformation-prompts-and-style-buttons)
7. [Evaluating genre transfer](#7-evaluating-genre-transfer)
8. [Data](#8-data)
9. [Existing models, projects and hardware fit](#9-existing-models-projects-and-hardware-fit)
10. [Web application: related systems and design patterns](#10-web-application-related-systems-and-design-patterns)
11. [Ethical, legal and societal considerations](#11-ethical-legal-and-societal-considerations)
12. [Discussion: research gaps and implications for the project plan](#12-discussion-research-gaps-and-implications-for-the-project-plan)
13. [Conclusion](#13-conclusion)
14. [References](#references)
- [Appendix A: Model fact sheets](#appendix-a-model-fact-sheets)
- [Appendix B: Search log](#appendix-b-search-log)

---

## 1. Introduction

### 1.1 The task

A user uploads a recording, typically an MP3 of a mixed song, and asks for it in another genre, either by typing a prompt ("make it a jazz trio") or by pressing a predefined style button ("Classical", "Rock"). The system must produce new audio in which the target genre is clearly audible while the song stays recognisable. This sits between two well-studied problems. **Generation** creates music from text (§2). **Editing** changes selected attributes of an existing signal while keeping the rest (Pan et al., 2026). Genre transfer is an unusually *global* edit: it may change instrumentation, timbre, rhythm, groove, harmony voicing and production all at once. That is why it is harder to do while preserving content than, say, swapping one instrument.

### 1.2 Research questions

The research questions below are derived directly from the goals, risks and must-haves in `Advanced AI Project.md`.

| # | Research question | Plan item it serves | Answered in |
|---|---|---|---|
| RQ1 | How do modern music generative models (autoencoders, VAEs, transformers, diffusion) represent and generate audio? | Goal: *"How the music models work"* | §2 |
| RQ2 | Which methods can change the genre of an existing song, and how do they compare? | Goal: *"Modify songs based on characteristics"*; must-have models | §3 |
| RQ3 | How can melody and musical identity be preserved during the change? | Risk: *"Models are unable to maintain the melodic characteristics"* | §4 |
| RQ4 | How can a song be decomposed into elements (stems, melody, chords, beats)? | Risk: *"Decomposition of music elements"* | §5 |
| RQ5 | How should a free-text prompt and predefined buttons steer the transformation? | Must-have: *"Transformation guided by prompt or a hard-coded style button"* | §6 |
| RQ6 | How can results be evaluated beyond manual checks? | Goal: *"How to evaluate results"*; Evaluation-phase risk | §7 |
| RQ7 | What data exists for 2–3 genres, and can we legally use it? | Risk: *"Data collection"*; Data Collection phase | §8 |
| RQ8 | Which existing models and projects can we build on, given our GPU and licences? | "Local models" list; Modelling-phase risk of heavy computation | §9 |
| RQ9 | How are such models put behind a web application? | Deliverable: Web App | §10 |

### 1.3 What "genre" is and what must be preserved

Dai, Zhang & Xia (2018) distinguish three levels of musical style:

- **composition style**: harmony, rhythm, texture and form;
- **performance style**: timing, dynamics and articulation;
- **timbre/sound style**: instruments, production and mixing.

A genre is a bundle of all three. A "rock" version of a classical piece differs in instruments and distortion (timbre), in a driving backbeat (composition and rhythm), and in tight, loud production (performance and sound). Most audio-domain methods act mainly on the **timbre/sound** level, and some reach the **composition** level (§3).

What users usually mean by "the same song" is its **melody** (especially the vocal line and lyrics), its **harmonic progression**, its **structure** (verse and chorus order) and often its **tempo**. Recent evaluation work calls the facets that should stay unchanged *music context preservation* (Vishe et al., 2025). Defining this split explicitly is the first design decision of any genre-transfer system.

### 1.4 Review method

We searched arXiv (cs.SD, eess.AS, cs.LG), Google Scholar, ISMIR and TISMIR proceedings, ICASSP, Interspeech, NeurIPS, ICML, ICLR, AAAI, IJCAI and ACM MM. We also searched GitHub, Hugging Face and vendor documentation for systems. Queries combined *music / song / audio* with *style transfer, genre transfer, editing, cover, audio-to-audio, timbre transfer, accompaniment, melody conditioning, source separation, evaluation* and the names of specific models. We included work that proposes, enables, evaluates or deploys a way to transform existing music, plus foundational generative-modelling papers needed to explain how the models work. Coverage runs from 2016 to November 2026.

**Verification.** arXiv identifiers, titles, authors and abstracts were checked against the arXiv API on 9 Nov 2026. Model capabilities, licences and hardware figures were taken from official repositories, model cards and technical reports. Where a figure comes only from a vendor, we say so. Several 2026 papers are recent preprints that have not yet been peer-reviewed.

### 1.5 Structure

§2 explains how the models work. §3 surveys methods for changing genre. §4–§6 address the plan's risks and control requirements. §7 covers evaluation and §8 data. §9 matches existing models to our hardware. §10 covers the web application and §11 ethics. §12 turns the findings into concrete changes to the project plan.

---

## 2. How music generative models work

### 2.1 Representing audio

Digital audio is a waveform sampled 44,100 or 48,000 times per second per channel. Three minutes of stereo audio at 48 kHz is about 17 million numbers, far too long for a neural network to model sample by sample. Time–frequency representations help:

- the short-time Fourier transform (STFT) and the perceptually spaced **mel-spectrogram**;
- the **constant-Q transform (CQT)**, whose log-spaced bins align with musical pitch;
- the **chromagram**, which folds pitch into the 12 pitch classes and is a common proxy for melody and harmony.

Spectrogram models need a *vocoder* to turn spectrograms back into audio. Modern systems mostly avoid this by working in the latent space of a learned audio autoencoder (§2.2).

### 2.2 Compressing audio: neural codecs and latent autoencoders

Almost every current music generator first compresses audio with an **autoencoder** and then models the compressed representation.

| Representation | Examples | Output | Used by |
|---|---|---|---|
| **Discrete codec tokens** (residual vector quantisation, RVQ) | SoundStream (Zeghidour et al., 2021); EnCodec (Défossez et al., 2022); DAC (Kumar et al., 2023) | Several parallel streams of integer tokens at about 50 Hz | Autoregressive LMs: MusicLM, MusicGen |
| **Continuous VAE latents** | Stable Audio's VAE (latent rate 21.5 Hz; Evans et al., 2024b); Music2Latent (Pasini et al., 2024); ACE-Step 1.5's 1-D VAE (48 kHz stereo → 64-dim latents at 25 Hz, 1920× compression; Gong et al., 2026); **SAME** (44.1 kHz stereo → 256-dim latents at ≈10.8 Hz, 4096× compression, trained with chroma and other semantic-alignment losses; Parker et al., 2026) | Low-rate sequences of real-valued vectors | Latent diffusion and flow models: Stable Audio, ACE-Step |
| **Real-time VAEs** | RAVE (Caillon & Esling, 2021) | Compact latent; fast enough for live use | Timbre transfer, instruments |

The **variational autoencoder** (Kingma & Welling, 2014) underlies most of these. An encoder maps audio to a distribution over latent codes, and a decoder reconstructs audio from samples of that distribution. Adversarial (GAN) losses (Goodfellow et al., 2014) are usually added so the decoded audio sounds crisp rather than blurry. Low latent rates are what make minute-long generation tractable. Stable Audio 3's SAME autoencoder pushes this to about 11 latent frames per second, which enables tracks of more than six minutes (Evans et al., 2026).

### 2.3 Families of generative models

**Autoencoders and VAEs as generators.** A VAE trained on one domain learns to reconstruct only that domain. Feeding it audio from elsewhere yields a reconstruction "in the style" of its training data. This is the basis of per-domain timbre transfer (§3.3). On their own, VAEs model long musical structure poorly, so they are usually paired with a second model over the latents.

**GANs** (Goodfellow et al., 2014) pit a generator against a discriminator. In music they appear mainly in spectrogram translation (CycleGAN-style; Zhu et al., 2017; Huang, S. et al., 2019; Pasini, 2019) and as training losses for codecs and decoders.

**Autoregressive transformers** predict the next token of a codec sequence:

- **Jukebox** (Dhariwal et al., 2020) uses hierarchical VQ-VAE tokens and is very slow to sample.
- **MusicLM** (Agostinelli et al., 2023) conditions on **MuLan**, a joint music–text embedding (Huang, Q. et al., 2022).
- **MusicGen** (Copet et al., 2023) is a single-stage transformer over interleaved EnCodec streams, from 300 M to 3.3 B parameters, trained on 20 k hours of licensed music.
- **YuE** (Yuan et al., 2025) is a LLaMA-2-architecture family for full songs with lyrics, using track-decoupled (vocal/accompaniment) token prediction.
- **Magenta RealTime** (Lyria Team, 2025) streams music in real time, steered by text or audio prompts.

**Diffusion and flow models** learn to reverse a gradual noising process:

- **DDPM** (Ho et al., 2020) trains a network to remove noise step by step. **DDIM** (Song et al., 2021) makes sampling deterministic and *invertible*, which is essential for editing (§3.5).
- **Latent diffusion** (Rombach et al., 2022) runs the process in an autoencoder's latent space.
- **Diffusion transformers (DiT)** (Peebles & Xie, 2023) replace the U-Net with a transformer.
- **Flow matching** (Lipman et al., 2023) and **rectified flow** (Liu et al., 2023) learn near-straight paths from noise to data, so fewer steps are needed.

Music systems in this family include:

- spectrogram diffusion: Riffusion (Forsgren & Martiros, 2022);
- latent diffusion: Moûsai (Schneider et al., 2023), Noise2Music (Huang, Q. et al., 2023), AudioLDM and AudioLDM 2 (Liu, H. et al., 2023a, 2023b), MusicLDM (Chen et al., 2024), JEN-1 (Li, P. et al., 2023);
- the **Stable Audio** line: timing-conditioned latent diffusion (Evans et al., 2024a); long-form DiT up to 4 min 45 s (Evans et al., 2024b); **Stable Audio Open** trained on Creative Commons data (Evans et al., 2025); Stable Audio Open Small (Novack et al., 2025); **Stable Audio 3** (Evans et al., 2026);
- full-song generators **DiffRhythm** (Ning et al., 2025) and **ACE-Step** (Gong et al., 2025; 2026);
- hybrid autoregressive-plus-diffusion song models **SongBloom** (Yang, C. et al., 2025) and **LeVo** (Lei et al., 2025).

### 2.4 Conditioning and guidance

Models are steered by **conditioning signals**:

- text, through a frozen encoder: T5 in Stable Audio, T5Gemma in Stable Audio 3, Qwen3 embeddings in ACE-Step 1.5;
- joint audio–text embeddings: MuLan, CLAP (Wu, Y. et al., 2023), MusicCoCa in Magenta RT;
- timing and metadata: duration, BPM, key;
- time-varying controls: melody, chords, rhythm (§4).

**Classifier-free guidance** (Ho & Salimans, 2022) mixes conditional and unconditional predictions. Its *guidance scale* trades prompt adherence for diversity. ACE-Step 1.5 adds a **language-model planner** (Qwen3, 0.6–4 B parameters) that first writes metadata (BPM, key, duration, structure) before the diffusion transformer renders audio (Gong et al., 2026).

### 2.5 Speed: few-step sampling

Interactive applications need fast sampling. Two recent techniques cut it dramatically:

- **Adversarial post-training (ARC)** brings Stable Audio models down to a few steps (Novack et al., 2025). Stable Audio 3's post-trained models use 8 steps without CFG.
- **Distribution-matching distillation** gives ACE-Step 1.5's "turbo" model 8 steps, with a 4-minute track in about 1 s on an A100 (Gong et al., 2026).

These speedups are what make a responsive web app realistic on a single consumer GPU.

### 2.6 Landscape of music generators relevant to us

| Model (year) | Type | Open weights | Edits existing audio? | Notes |
|---|---|---|---|---|
| MusicGen / -Melody / -Style (2023–24) | AR transformer over EnCodec | Yes (CC BY-NC 4.0 weights) | Indirectly: regenerates from melody (chroma) or a style excerpt | §3.7–3.8 |
| AudioLDM 2 (2023) | Latent diffusion (16 kHz) | Yes | Via inversion (ZETA, MusicMagus, MEDIC, Melodia) | Common research backbone |
| Stable Audio Open 1.0 (2024) | Latent DiT | Yes (Community Licence) | Yes: `init_audio` + `init_noise_level` | Up to 47 s; CC-licensed training data |
| MelodyFlow (2024) | Flow-matching DiT (48 kHz stereo) | Released by Meta | Yes: text-guided editing via latent inversion | §3.5 |
| YuE (2025) | AR (LLaMA-2 architecture) | Yes | In-context learning from a reference track | Songs with lyrics |
| Magenta RealTime (2025) | Streaming AR | Yes (CC BY 4.0) | Style from text/audio prompts, live | §3.8 |
| **ACE-Step 1.5** (2026) | LM planner + ≈2 B DiT | Yes (MIT) | **Yes: Cover, Repaint, Lego, Extract, Complete** | §3.4, App. A |
| **Stable Audio 3** (2026) | Flow-matching DiT on SAME latents | Small and Medium open; Large API-only | **Yes: audio-to-audio, inpainting, continuation** | §3.4, App. A |

---

## 3. Changing the genre of an existing recording

### 3.1 A taxonomy of approaches

| Family | Core idea | Typical strength | Typical weakness | Key works |
|---|---|---|---|---|
| A. Feature-statistics transfer | Match texture statistics (Gram matrices) of a style example | Simple | Changes sound texture only | Ulyanov & Lebedev 2016; Grinstein et al. 2018 |
| B. Per-domain autoencoders and translation networks | Encode the input, decode with a model of the target domain | Keeps pitch and rhythm almost perfectly | Mainly timbre change; per-genre training | Mor et al. 2019; Huang, S. et al. 2019; Lu et al. 2019; Pasini 2019; Caillon & Esling 2021 |
| C. Partial noising (SDEdit / audio-to-audio / cover) | Add noise to the input, denoise under the target prompt | Training-free, one knob | Strength trades genre change against fidelity | Meng et al. 2022; Stable Audio; ACE-Step Cover |
| D. Inversion-based editing | Recover the noise that reproduces the input, then regenerate under a new prompt with attention control | Better structure preservation | Slow; sensitive to inversion quality; mostly short clips | Manor & Michaeli 2024; Zhang, Y. et al. 2024a; Liu, Hu. et al. 2025; Yang, Y. et al. 2026 |
| E. Inversion-free editing | Build an edit path from the difference between source- and target-conditioned predictions | Faster; fewer reconstruction errors | Very recent; few music evaluations | Kulikov et al. 2025; Fu et al. 2026; Ge et al. 2026 |
| F. Control-conditioned regeneration | Extract melody, chords or rhythm, then generate new audio under those controls plus the target prompt | Explicit melody preservation | New performance, not an "edit"; may lose vocals or lyrics | Copet et al. 2023; Wu, S.-L. et al. 2024; Tal et al. 2024; Tsai et al. 2025 |
| G. Exemplar and adapter style | Learn the style from audio examples (textual inversion, audio prompts, LoRA) | Captures specific styles | Needs examples or fine-tuning | Li, S. et al. 2024; Rouard et al. 2024; Hu et al. 2022 |
| H. Decompose and regenerate | Separate stems, keep the vocals or lead, generate a new accompaniment | Keeps the singer and lyrics | Separation artefacts; mixing | Donahue et al. 2023; Nistal et al. 2024; Parker et al. 2024; Strano et al. 2025 |
| I. Instruction-tuned editors | Train on (instruction, before, after) triples | Natural-language edits | Paired data is scarce | Wang, Yu. et al. 2023; Han et al. 2023; Zhang, Y. et al. 2025 |
| J. Symbolic route | Transcribe to MIDI, transfer symbolically, re-synthesise | Exact control of notes; cheap | Transcription errors; synthetic sound; vocals lost | §3.10 |

### 3.2 Feature-statistics transfer

Following image style transfer (Gatys et al., 2016), Ulyanov & Lebedev (2016) and Grinstein et al. (2018) optimised spectrograms to match the content features of one signal and the Gram-matrix "style" statistics of another. The results transfer *sound texture* convincingly, but not rhythm, harmony or form. This early finding still frames the field: **"style as statistics" captures timbre, not genre.**

### 3.3 Per-domain autoencoders and translation networks ("autoencoder per genre")

This family corresponds most directly to the plan's *"autoencoder-style per genre"* must-have.

- **Universal Music Translation Network** (Mor et al., 2019). A shared WaveNet encoder is trained with a *domain-confusion* loss so that its code carries no domain identity. **One decoder per domain** then renders the code as, for example, piano or orchestra. It translated across instruments and styles, but WaveNet decoding is slow.
- **TimbreTron** (Huang, S. et al., 2019) applies CycleGAN to CQT spectrograms and re-synthesises with a WaveNet. **Play as You Like** (Lu, C.-Y. et al., 2019) does multi-modal style transfer between genres and instruments with timbre-enhanced spectral features. **MelGAN-VC** (Pasini, 2019) translates spectrograms of arbitrary length with a GAN, for both voice conversion and audio style transfer.
- **RAVE** (Caillon & Esling, 2021) is a fast VAE with adversarial fine-tuning. A RAVE model trained on one domain re-renders any input in that domain's timbre, and its documentation notes it can act "as a style transfer tool" by default because of its high compression. Practical requirements:
  - roughly 3 h or more of homogeneous audio per model (community guidance);
  - several days to weeks of training (the paper reports about 7 days; IRCAM's tutorial estimates 3–4 days for phase 1 plus 4 days to 3 weeks for phase 2);
  - a GPU with at least 8 GB.

  The official IRCAM tutorial trains a RAVE model on **MusicNet**, one of our two named datasets. Pre-trained community checkpoints are commonly CC BY-NC 4.0.
- **Self-supervised VQ-VAE** (Cífka et al., 2021) separates content codes from a style embedding taken from a reference recording, giving one-shot timbre transfer. **DDSP** (Engel et al., 2020) re-synthesises from pitch and loudness with interpretable synthesisers.
- **Recent diffusion-era timbre transfer:**
  - Lee et al. (2026) inject noise only into the latent channels that carry instrument identity, and clamp early denoising steps to re-impose the input's melodic and rhythmic structure. No training is needed.
  - AdaTT (Kim, D. et al., 2026) adapts pitch and loudness controls to the target instrument.
  - Andrade & Schlecht (2026) study *warm initialisation* of diffusion from the source audio for timbre transfer and **MIDI-to-real synthesis**. They show how the initialisation time trades faithfulness (pitch Jaccard distance) against target realism (FAD).

**Assessment.** These methods preserve melody and rhythm very well because they barely change them. For *genre* that is a limitation: a "metal" RAVE model applied to a piano sonata gives the sonata's notes played with metal-like timbre, not a metal arrangement. Per-genre autoencoders are a sound **class-methods baseline** and a good teaching vehicle for "how the models work". Genre changes in rhythm and arrangement require generative models (C–H) or the symbolic route (J).

### 3.4 Partial noising: SDEdit, "audio-to-audio" and "cover"

**SDEdit** (Meng et al., 2022) is the simplest guided-diffusion editor:

1. Add noise to the input up to an intermediate level *t*.
2. Run the reverse process under a new condition (e.g., "jazz piano trio").

Small *t* keeps structure, and large *t* gives more freedom. Riffusion's image-to-image mode (Forsgren & Martiros, 2022) applied the idea to spectrogram images. It is now built into the main open tools:

- **stable-audio-tools** (Stable Audio Open 1.0): `generate_diffusion_cond(..., init_audio=(sr, audio), init_noise_level=...)`. The audio is encoded to latents and used as the starting point. The Hugging Face `diffusers` StableAudioPipeline accepts `initial_audio_waveforms`, but its documentation shows no strength parameter.
- **Stable Audio 3** (`stable-audio-3` library): an explicit *audio-to-audio editing* mode, `model.generate(init_audio=..., init_noise_level=0.9, prompt=..., duration=...)`. The docs describe 0.1 as "a close variation", 0.5 as "a halfway blend" and 1.0 as pure generation. Inpainting and continuation are separate modes. The hosted fal.ai endpoint uses a default of 0.9 (Stability AI, 2026; fal.ai, 2026).
- **ACE-Step 1.5 Cover**: one task within ACE-Step's unified masked generative framework. The technical report does not detail its exact mechanism or evaluate it separately. It takes `src_audio`, a caption and `audio_cover_strength` ∈ [0, 1], where 1.0 means strong adherence to the source structure. The docs suggest 0.2 for style transfer. A separate `reference_audio` input supplies a style example (Gong et al., 2026; ACE-Step docs).

**Assessment.** This is the fastest route to a working genre-transfer feature for our app. The weakness is that a single global knob trades genre change against fidelity. EchoEdit's authors put it this way: "stronger edits require deeper corruption of the very rhythm, transients, timbre, and long-range form that should remain unchanged" (Fu et al., 2026).

### 3.5 Inversion-based zero-shot editing

Instead of random noise, these methods find the noise trajectory that *reproduces* the input, so that regeneration starts from the input's exact "coordinates". They then change the prompt while constraining attention maps to keep structure. This draws on Prompt-to-Prompt (Hertz et al., 2023) and null-text inversion (Mokady et al., 2023). Methods for music:

| Method | Backbone | Mechanism | Edits demonstrated |
|---|---|---|---|
| **ZETA / ZEUS** (Manor & Michaeli, 2024; ICML) | AudioLDM 2 | DDPM inversion; text-based edits (ZETA) and unsupervised editing directions (ZEUS) | Genre, instrument, style of real music |
| **MusicMagus** (Zhang, Y. et al., 2024a; IJCAI) | AudioLDM 2 | Edit the text in latent embedding space plus a cross-attention consistency constraint | Genre, mood, instrument of *generated* music |
| **MEDIC** (Liu, Hu. et al., 2025; ACM MM) | Diffusion | Disentangled inversion control | Consistent and non-rigid edits |
| **MelodyFlow** (Le Lan et al., 2024) | Flow-matching DiT on 48 kHz stereo VAE latents | ReNoise inversion adapted to flow matching; beats naive DDIM inversion | Text-guided stereo music editing |
| **Melodia** (Yang, Y. et al., 2026; AAAI oral) | AudioLDM 2 | Probes the model's attention maps (cross-attention maps encode distinct musical characteristics) and uses this to guide training-free edits; no text description of the source is needed | Instrument, genre, mood while preserving melody and rhythm |
| **MusRec** (Boudaghi & Zare, 2025) | Rectified-flow DiT | Zero-shot inversion and regeneration | Diverse edits of *real-world* music |
| **FlowSonic** (Boudaghi & Zare, 2026) | Rectified-flow DiT | Higher-order (Adams–Bashforth) integration for stable inversion | Real recordings |

**Assessment.** Inversion methods preserve structure better than plain SDEdit, and Melodia was motivated by exactly our risk 1. Many, however, are built on AudioLDM 2 (16 kHz audio, short clips) and are research code. Each edit costs an inversion pass plus generation. They suit the **evaluation and comparison** part of the project more than a production web app.

### 3.6 Inversion-free editing

A 2024–2026 line of work skips inversion. It integrates the *difference* between source-conditioned and target-conditioned predictions directly:

- FlowEdit for images (Kulikov et al., 2025);
- **EchoEdit** (Fu et al., 2026), which stabilises this with optimal-transport geometry;
- **DirectAudioEdit** (Ge et al., 2026);
- **Virtual Consistency** (Cervera et al., 2025), with large speed-ups and a 16-person user study;
- **FreeSonic** (Jiang, Yu. et al., 2026), using decoupled attention on a rectified-flow text-to-audio model.

These are promising for speed and fidelity but mostly unevaluated on whole-song genre changes. They are worth tracking, not building on.

### 3.7 Control-conditioned regeneration

Here the input is not edited at all. Selected *controls* are extracted from it, and new audio is generated under those controls plus the target prompt:

- **MusicGen-Melody** conditions on the chromagram of a reference (Copet et al., 2023). This is the classic "same tune, new style" baseline.
- **Music ControlNet** (Wu, S.-L. et al., 2024) adds time-varying melody, dynamics and rhythm controls.
- **JASCO** (Tal et al., 2024) combines symbolic controls (chords, melody) with audio controls (drums) and a global text prompt, using flow matching.
- **Hou et al. (2025)** add a ControlNet branch to a DiT for text-plus-melody *editing*, with a top-k CQT melody representation that supports long, variable-length music and style transfer.
- **MuseControlLite** (Tsai et al., 2025; ICML) uses lightweight conditioners with rotary positional embeddings. This improves melody-control accuracy from 56.6 % to 61.1 % while training far fewer parameters, and supports audio in- and out-painting.
- **DITTO / DITTO-2** (Novack et al., 2024a, 2024b) optimise the *initial noise* at inference time to match differentiable targets such as melody, intensity and structure, without fine-tuning.
- **Sketch2Sound** (García et al., 2024) controls generation with loudness, brightness and pitch curves plus text.

**Assessment.** This is the most direct answer to risk 1 for *instrumental* melody. The output is a new performance of the same tune, so production, timing details and lyrics are not carried over.

### 3.8 Exemplar and adapter-based style

- **Textual inversion for music.** MusicTI learns a time-varying pseudo-word from a style example (Li, S. et al., 2024). Stylus manipulates attention in a frozen image diffusion model over mel-spectrograms (Wang, H. et al., 2024). Demerlé et al. (2024) combine audio control with style transfer in latent diffusion.
- **Audio prompts.** MusicGen-Style conditions on a 1.5–4.5 s excerpt and mixes it with text via double guidance (Rouard et al., 2024). Magenta RealTime averages MusicCoCa embeddings of text and audio prompts into one style vector (Lyria Team, 2025). ACE-Step 1.5 accepts `reference_audio`.
- **LoRA adapters** (Hu et al., 2022) bridge the plan's "per genre" idea with diffusion. Each genre becomes a small adapter on a shared pre-trained model:
  - Stable Audio 3: LoRA documentation for Small and Medium; "at minimum ~20–50 clips"; about 6.5 GB of VRAM for Medium.
  - ACE-Step 1.5: LoRA training in its UI; docs quote "8 songs, 1 hour on 3090 (12GB VRAM)".

### 3.9 Instruction-tuned and agentic editors

- **AUDIT** (Wang, Yu. et al., 2023) and **InstructME** (Han et al., 2023) train latent-diffusion editors on instruction triples. InstructME targets music editing and remixing.
- **Instruct-MusicGen** (Zhang, Y. et al., 2025; ISMIR) instruction-tunes MusicGen to add, remove or separate stems.
- **M²UGen** (Liu, S. et al., 2023) couples an LLM with music encoders and decoders.
- **Loop Copilot** (Zhang, Y. et al., 2024b) uses an LLM to orchestrate several music models in a conversational loop.
- **MusicWeaver** (Wang, X. et al., 2025) inserts an explicit, editable "song program" between intent and audio.

Paired editing data is scarce, so instruction-tuned genre transfer remains limited. The agentic pattern (an LLM turning a free-text request into tool calls and parameters) is relevant to our prompt interface (§6).

### 3.10 The symbolic route

Both datasets named in our plan are partly or wholly MIDI: the Kaggle pop set is 50 MIDI files, and MusicNet includes MIDI scores. The plan also wants some members to apply class models (transformers, autoencoders, VAEs). The symbolic route therefore remains relevant:

**audio → transcription (Basic Pitch, MT3, YourMT3+) → symbolic style transfer → re-synthesis (FluidSynth, or diffusion-based MIDI-to-real rendering).**

Key symbolic methods:

- **CycleGAN genre transfer** on piano-rolls (Brunner, Wang et al., 2018);
- **MIDI-VAE** with dedicated style dimensions (Brunner, Konrad et al., 2018);
- **EC²-VAE**, which separates pitch from rhythm (Yang, R. et al., 2019);
- **Poly-Dis**, which separates chord from accompaniment texture (Wang, Z. et al., 2020);
- **Groove2Groove** for one-shot accompaniment style transfer (Cífka et al., 2020);
- **MuseMorphose**, a Transformer VAE with bar-level attribute control (Wu & Yang, 2023);
- **AccoMontage** for retrieval-based accompaniment (Zhao & Xia, 2021);
- **ImprovNet**, cross-genre corruption–refinement with 79 % of listeners identifying the jazz versions of classical pieces (Bhandari et al., 2025);
- **Polyffusion** for diffusion with texture control (Min et al., 2023);
- **MIDI-GPT** for style-conditioned infilling (Pasquier et al., 2025).

Symbolic methods give **exact** melody preservation and run cheaply, but they lose vocals and production. Their output also sounds synthetic unless rendered carefully. Warm-initialised diffusion for MIDI-to-real synthesis (Andrade & Schlecht, 2026) may narrow that gap.

### 3.11 Summary: fit to our plan

| Family | Uses an uploaded MP3 directly? | Prompt/button control | Melody preservation | Genre change | Compute for us | Fit |
|---|---|---|---|---|---|---|
| B. Per-genre AE (RAVE / own VAE) | Yes | Button = choose decoder | High | Low–medium (timbre) | Days of training per genre | Class-methods baseline |
| C. SDEdit / Cover (ACE-Step 1.5, Stable Audio 3) | Yes | Prompt + strength | Medium, tunable | High | Inference only; fits 10 GB per docs | **Primary diffusion track** |
| D/E. Inversion and inversion-free editing | Yes | Prompt | Medium–high | Medium–high | Research code; slow | Comparison / stretch |
| F. Melody-conditioned regeneration | Via extracted melody | Prompt | High (melody), low (vocals) | High | MusicGen-size models | Strong baseline |
| G. LoRA per genre | Yes (with C) | Button = adapter | As C | Higher for niche genres | ≈6.5 GB training per docs | Stretch goal |
| H. Decompose and regenerate | Yes | Prompt | High (keeps vocals) | Medium–high | Separation + generation | Recommended for songs with vocals |
| J. Symbolic | Via transcription | Button | Exact | Medium (arrangement) | Cheap | Class-methods track with MIDI data |

---

## 4. Preserving melody and musical identity

*(Plan risk 1: "Models are unable to maintain the melodic characteristics")*

The literature identifies four levers, and they combine well:

1. **Limit the corruption.** In SDEdit-style transfer, preservation is controlled by the noise level or cover strength. Meng et al. (2022) framed this as a realism–faithfulness trade-off. Andrade & Schlecht (2026) measured it in audio with pitch-based Jaccard distance against FAD. Practical implication: **expose the strength** (or set it per preset) and pick defaults empirically.
2. **Invert and constrain attention.** Inversion plus attention control keeps temporal structure better than plain noising (Manor & Michaeli, 2024; Le Lan et al., 2024). Melodia was motivated by the observation that existing editors often "fail to preserve the source music's temporal structure, including melody and rhythm". Its probing of AudioLDM 2 found that cross-attention maps encode distinct musical characteristics, which it uses to guide structure-preserving edits (Yang, Y. et al., 2026).
3. **Condition on melody explicitly.** Chroma, top-k CQT or pitch contours extracted from the input are fed as time-varying controls (Copet et al., 2023; Wu, S.-L. et al., 2024; Hou et al., 2025; Tsai et al., 2025). Lee et al. (2026) instead clamp early denoising steps to the input's structure.
4. **Decompose and keep what matters.** Separate the vocals (or lead), generate a new accompaniment conditioned on them, and re-mix. SingSong generates instrumental accompaniment for input vocals. It was trained on vocal/instrumental pairs produced *by source separation* (Donahue et al., 2023). Diff-A-Riff generates accompaniments controllable by audio references and/or text (Nistal et al., 2024). StemGen "listens" to context and generates a fitting stem (Parker et al., 2024). STAGE fine-tunes MusicGen to produce single-stem accompaniment for a given mixture (Strano et al., 2025). ACE-Step 1.5 provides **Extract** (stem separation), **Lego** (add a named track) and **Complete** as built-in tasks, and lists vocal-to-BGM generation (Gong et al., 2026). YuE's in-context-learning mode can take separate vocal and instrumental reference tracks (Yuan et al., 2025).

**Recommendation from the literature.** For songs with vocals, *decompose → keep vocals → regenerate accompaniment in the target genre → re-mix* preserves identity (singer, lyrics, melody) far better than transforming the full mix. For instrumental music, Cover or audio-to-audio with a tuned strength, optionally with melody conditioning, is the practical choice.

---

## 5. Decomposing music into its elements

*(Plan risk 2: "Decomposition of music elements")*

| Element | Task | Mature open tools | Notes |
|---|---|---|---|
| Stems (vocals, drums, bass, other) | Music source separation | **HT-Demucs** (Rouard et al., 2023); **BS-RoFormer** (Lu, W.-T. et al., 2024); **Mel-RoFormer** (Wang, J.-C. et al., 2023); **SCNet** (Tong et al., 2024); ACE-Step 1.5 *Extract* | The SDX23 challenge documents the state of the art (Fabbro et al., 2024). MoisesDB adds finer stems (Pereira et al., 2023). Community wrappers (e.g., python-audio-separator) bundle many models. |
| Notes (MIDI) | Automatic transcription | **Basic Pitch** (Bittner et al., 2022); **MT3** (Gardner et al., 2022); **YourMT3+** (Chang et al., 2024) | Polyphonic full-mix transcription is still error-prone; transcribe separated stems |
| Melody / pitch contour | f0 estimation | **CREPE** (Kim, J. W. et al., 2018) on separated vocals; chroma/CQT features (librosa) | Basis of melody-preservation metrics (§7) |
| Beats, downbeats, tempo | Beat tracking | **madmom** (Böck et al., 2016); **Beat This!** (Foscarin et al., 2024) | Needed to keep tempo and align re-mixed stems |
| Structure (verse/chorus) | Segmentation | **All-In-One** (Kim, T. & Nam, 2023) | Also outputs beats and downbeats |
| Key, chords | Harmony analysis | librosa/Essentia key estimation; madmom chord recognition | Can feed prompts ("in A minor") or controls |
| Global descriptors | Music understanding | ACE-Step 1.5 *understand_music* (BPM, key, time signature, caption); CLAP / MERT / MuQ embeddings (Wu, Y. et al., 2023; Li, Y. et al., 2024; Zhu et al., 2025) | Auto-captioning the input helps build prompts |

Latent representations are also becoming more "musically decomposed". SAME is trained with a chroma loss so that its latents align with musical content (Parker et al., 2026). Older work separates content from style inside the model (Mor et al., 2019; Cífka et al., 2021). For our project, decomposition is **not a research risk but an engineering step** with well-supported open tools. The remaining risk is separation artefacts, which should be checked in evaluation.

---

## 6. Steering the transformation: prompts and style buttons

*(Must-have: "Transformation guided by prompt or a hard-coded style button")*

**Prompts.** Text-conditioned models respond to genre, instrument, mood and production terms. Captioned datasets show the vocabulary that models were trained on: MusicCaps (Agostinelli et al., 2023), LP-MusicCaps (Doh et al., 2023) and the Song Describer Dataset (Manco et al., 2023). ACE-Step 1.5 trains on captions covering "over 2,000 musical styles" and accepts structured fields (BPM, key, time signature). Prompt adherence can be tuned with the guidance scale on non-distilled models. Distilled "turbo" or post-trained models typically run without CFG.

**Buttons as presets.** A style button is best implemented as a **curated preset**: a tested prompt (or LoRA adapter), a strength value and optional metadata (BPM range, instruments). The interface stays simple while quality stays controlled. HCI research on generative music tools supports this. Louie et al. (2020) built **"AI-steering tools"** for music novices: voice lanes, example-based sliders, semantic sliders and multiple alternatives. In a study with 21 participants, the tools increased users' trust, control, comprehension and sense of collaboration with the AI. The AI Song Contest study documents how musicians need fine-grained, decomposable control to co-create with AI (Huang, C.-Z. A. et al., 2020).

**Free text to parameters.** LLM-orchestrated systems translate requests into model calls and parameters (Zhang, Y. et al., 2024b; Liu, S. et al., 2023). ACE-Step 1.5's built-in LM "Planner" and *format_sample* functions rewrite user text into structured captions and metadata (Gong et al., 2026). A lightweight version (mapping a prompt to the nearest preset plus free-text tags) is a reasonable design.

---

## 7. Evaluating genre transfer

*(Goal 3, and the Evaluation-phase risk "Evaluation methods other than manual checks are unknown")*

### 7.1 What to measure

Editing and style-transfer evaluations converge on three axes plus cost (Lerch et al., 2025; Kader & Karmaker, 2025; Pan et al., 2026):

1. **Target adherence**: does it sound like the target genre or prompt?
2. **Source preservation**: is the song still recognisable?
3. **Quality**: is it good, artefact-free audio?
4. **Efficiency**: seconds per clip and peak VRAM. This matters for a web app.

Results should be reported **jointly**, ideally as curves over the strength parameter, because each method can win any single axis trivially.

### 7.2 Objective metrics

| Axis | Metric | How | Tools / notes |
|---|---|---|---|
| Adherence | **CLAP score** | Cosine similarity between the output's audio embedding and the target prompt's text embedding | LAION-CLAP (Wu, Y. et al., 2023); used in Stable Audio and editing papers |
| Adherence | **Genre-classifier probability / accuracy** | Run a pre-trained or self-trained genre classifier on the outputs | Essentia models (Discogs-EffNet, 400 Discogs styles; AGPL library, CC BY-NC-SA models; the model cards note Western/electronic over-representation). Alternative: logistic regression on CLAP/MERT/MuQ embeddings trained on FMA or GTZAN. Never train the transfer model against the same classifier |
| Adherence | **FAD / KAD to a target-genre reference set** | Distribution distance between embeddings of outputs and real music of the target genre | FAD (Kilgour et al., 2019); embedding choice, sample size and reference quality strongly affect FAD, so use `fadtk`-style corrections (Gui et al., 2024). KAD is unbiased and converges with fewer samples (Chung et al., 2025), which helps with our small test sets |
| Preservation | **Chroma / CQT similarity** | Frame-wise cosine similarity of chromagrams (source vs output) | Melody metric used for MusicGen-Melody (Copet et al., 2023) |
| Preservation | **Melody accuracy** | Pitch contour of the separated vocals/lead (CREPE), compared with `mir_eval` raw pitch accuracy | Robust to timbre change |
| Preservation | **Rhythm / tempo** | Beat F-measure and tempo difference between source and output beat tracks | madmom / Beat This! + `mir_eval` |
| Preservation | **Structure** | Correlation of self-similarity matrices | Classic MIR technique |
| Preservation | **Lyrics** | Word error rate of Whisper transcripts (Radford et al., 2023), source vs output | Only if vocals are kept or regenerated |
| Preservation | **MuseCPEval** | Multi-facet "music context preservation" framework covering four categories of facets | Vishe et al. (2025), accepted at ISMIR 2026; the most directly relevant framework for our risk 1 |
| Quality | **Audiobox Aesthetics** | Predicted Production Quality, Production Complexity, Content Enjoyment, Content Usefulness | Tjandra et al. (2025); reference-free |
| Quality | **SongEval** | Predicted coherence, musicality, memorability, clarity, naturalness | Yao et al. (2025); designed for full songs |
| Quality | FAD vs a high-quality reference | As above | — |
| Originality | Replication check | Similarity to training data | MiRA (Batlle-Roca et al., 2024) |

### 7.3 Subjective evaluation

Listening tests remain the gold standard. Common designs are:

- **MOS** ratings (e.g., 1–5 for genre match, recognisability and overall quality);
- **A/B preference** between systems;
- **MUSHRA**-style multi-stimulus tests.

Stable Audio 3 reports MOS on overall quality, relevance and musicality with 14 listeners (Evans et al., 2026). **Music Arena** collects live pairwise preferences and ranks models with Bradley–Terry scores (Kim, Y. et al., 2025). ACE-Step 1.5 used it for its comparison with commercial systems (Gong et al., 2026). Good practice: blind and randomised presentation, real-music anchors, reporting listener expertise, confidence intervals, and no cherry-picking (Lerch et al., 2025).

### 7.4 Pitfalls

- **Vendor metrics are not independent.** ACE-Step 1.5's "style alignment" and "lyric alignment" scores come from its authors' own reward models, and Stable Audio 3's benchmarks are run by its authors.
- **Objective metrics correlate imperfectly with perception** (Kader & Karmaker, 2025; Gui et al., 2024).
- **Genre classifiers inherit taxonomy and cultural bias** (e.g., Discogs-style labels; GTZAN's known faults, Sturm, 2013).
- **Separation artefacts** can distort preservation metrics computed on separated stems.

There is **no standard benchmark for audio genre transfer**. Editing papers use their own prompt sets on MusicCaps, Song Describer or generated audio. Our project must define and justify its own protocol (§12).

---

## 8. Data

*(Plan risk 3: "Data collection")*

### 8.1 What each approach needs

| Approach | Data needed | Approximate amount |
|---|---|---|
| Pre-trained diffusion (Cover / audio-to-audio) | Test songs per genre only | 20–50 source clips per genre for evaluation |
| LoRA per genre | Style examples | Stable Audio 3 docs: "at minimum ~20–50 clips"; ACE-Step docs: 8 songs as an example |
| RAVE / own autoencoder per genre | Homogeneous audio per genre | ≥ ~3 h per genre (community guidance), more is better |
| Genre classifier (evaluation) | Labelled clips | Hundreds per genre (e.g., GTZAN has 100 per genre) |
| Symbolic models | MIDI per genre | Hundreds to thousands of phrases |

### 8.2 Datasets

| Dataset | Content | Licence | Use for us |
|---|---|---|---|
| **MusicNet** (Thickstun et al., 2017) | 330 classical recordings (≈34 h) with aligned note labels; MIDI scores available separately (2.6 MB) | Zenodo record: CC BY 4.0 | **Classical audio** (RAVE, LoRA, test set) and MIDI (symbolic track). The audio archive is 11.1 GB |
| **Kaggle music_midi_dataset** | 50 pop MIDI files | CC BY-SA 4.0 (uploader's claim) | Symbolic track only; too small; rendering to audio sounds synthetic |
| **FMA** (Defferrard et al., 2017) | 106,574 tracks, 161 genres, with small/medium/large/full subsets | Creative Commons (per track) | **Best open multi-genre audio source** (rock, pop, electronic, hip-hop, folk…) |
| **MTG-Jamendo** (Bogdanov et al., 2019) | 55k+ full tracks with genre, instrument and mood tags | Creative Commons | Additional CC audio per genre |
| **GTZAN** (Tzanetakis & Cook, 2002) | 1,000 × 30 s clips, 10 genres (incl. classical, pop, rock, metal, jazz) | Copyrighted commercial audio; research use | Classifier training/benchmark; documented repetitions and mislabelings (Sturm, 2013) |
| **Song Describer** (Manco et al., 2023) | Captions for CC-licensed recordings | CC | Prompt-adherence evaluation; used by Stable Audio 3 |
| **MusicCaps** (Agostinelli et al., 2023) | 5.5k captioned 10-s clips (YouTube IDs) | Captions CC BY-SA; audio not distributed | Prompt vocabulary |
| **MUSDB18** (Rafii et al., 2017) / **MoisesDB** (Pereira et al., 2023) | Multitrack songs with stems | Research licences | Testing separation quality |
| **Slakh2100** (Manilow et al., 2019) | Synthesised multitrack from Lakh MIDI | CC BY 4.0 | Paired MIDI–audio |
| **Lakh MIDI**, **POP909** | Large symbolic collections | CC BY 4.0; MIT | Symbolic track supplements |

**Observations.**

1. The two datasets named in the plan are classical audio+MIDI (MusicNet) and pop **MIDI** (Kaggle). For an **audio** pipeline, pop and rock/metal audio should come from **FMA** or **MTG-Jamendo**, which are both Creative Commons-licensed.
2. Training is optional for the diffusion track. Data mainly serves **evaluation** (source and reference sets) and optional **LoRA** or **per-genre autoencoders**.
3. MP3 handling is routine (ffmpeg/librosa/torchaudio). Mixed sample rates must be resampled to each model's rate (44.1 kHz for Stable Audio, 48 kHz for ACE-Step).

---

## 9. Existing models, projects and hardware fit

Our hardware is a single **NVIDIA RTX 3080 (10 GB)** with 32 GB RAM. The plan's "Local models" list (ACE-Step 1.5, Stable Audio 3, Stable Audio Open 1.0, RAVE) is well chosen. The table summarises verified facts, and Appendix A has fact sheets.

| Model / project | Licence | Genre-transfer mechanism | Fit for RTX 3080 10 GB (vendor figures) | Interfaces |
|---|---|---|---|---|
| **ACE-Step 1.5** (2B DiT "turbo", 8 steps) | **MIT** (code and weights) | Cover (`audio_cover_strength`), `reference_audio`, Repaint, Lego/Extract/Complete (base model), LoRA | **Likely yes.** The docs list 8–16 GB as 2B turbo/sft + 0.6–1.7B LM, and ≥4 GB for DiT-only. Cover skips the LM. "Under 10 seconds" per full song on an RTX 3090 | Gradio UI (`localhost:7860`), REST API (`:8001`), Python API, ComfyUI |
| **Stable Audio 3 Medium** (1.4B DiT + SAME-L) | Stability AI Community Licence (free under US$1 M revenue); gated download | Audio-to-audio (`init_audio`, `init_noise_level`), inpainting/continuation, LoRA | **Probably.** Peak ≈6.5 GB for 120 s (measured on H200). **Requires a CUDA GPU with FlashAttention**, which supports Ampere cards but is often awkward to install on Windows (consider WSL2) | `stable-audio-3` Python library and CLI; ComfyUI; hosted fal.ai endpoint (listed at US$0.0417 per audio) |
| **Stable Audio 3 Small-Music** (459M DiT) | Community Licence | Audio-to-audio, up to 2 min | Runs on **CPU** | Same library |
| **Stable Audio Open 1.0** | Community Licence; trained on CC data | `init_audio` + `init_noise_level` (stable-audio-tools); `initial_audio_waveforms` (diffusers) | Not verified by us | stable-audio-tools Gradio; diffusers |
| **RAVE** | Pre-trained collections commonly CC BY-NC 4.0 (check the repo) | Per-domain timbre transfer | Training: ≥8 GB recommended (IRCAM tutorial), days to weeks | Python, Max/MSP and Pure Data (`nn~`) |
| **MusicGen-Melody / -Style** | Code MIT; **weights CC BY-NC 4.0** | Regenerate from chroma melody; style excerpt + text | Not verified by us (300M–3.3B models) | AudioCraft; Gradio demos |
| **MelodyFlow** | Check AudioCraft | Text-guided editing via flow inversion | Not verified | AudioCraft |
| **AudioLDM 2 editors** (ZETA, MusicMagus, MEDIC, Melodia) | Research code (various) | Inversion editing | Moderate (16 kHz model) | Research scripts |
| **YuE** | Open | In-context learning with reference tracks | Large; not verified | CLI |
| **Magenta RealTime** | Code Apache 2.0; weights CC BY 4.0 | Live generation steered by text/audio style embeddings | Runs on free Colab TPUs; GPU figures not official | Colab, Python |
| **Separation** (Demucs, RoFormer, SCNet) | Mostly MIT / open | Decomposition | Yes | Python packages |

**Assessment.** The plan's worry that existing solutions may need "very large amount of computation to transfer the genre successfully" is answered, at least for inference. ACE-Step 1.5 reports under 10 s per full song on an RTX 3090, and Stable Audio 3 reports sub-2-second generation on datacenter GPUs. Vendor memory figures suggest both fit in 10 GB, which we must confirm on our own machine. The genuine compute risks are **(a) training per-genre autoencoders from scratch** (days per genre) and **(b) Windows tooling** (FlashAttention, model downloads of about 10 GB, CUDA builds).

---

## 10. Web application: related systems and design patterns

### 10.1 Existing interfaces to learn from

- ACE-Step 1.5 ships a **Gradio** UI and a **REST API** server, so a web app can call it as a service.
- AudioCraft includes Gradio demos for MusicGen and MusicGen-Style.
- stable-audio-tools has a Gradio interface, and Stable Audio 3 is integrated into ComfyUI.
- Gradio was designed for exactly this kind of "upload → model → playback" sharing of ML models (Abid et al., 2019). It has built-in audio input/output components and request queueing.

### 10.2 Architecture options

| Option | Pros | Cons | Suits |
|---|---|---|---|
| **Gradio app** (single Python process) | Fastest to build; audio components, queue and share link built in; same language as the models | Limited custom UI; harder to add user accounts and history | Must-have scope |
| **FastAPI backend + React/Next.js frontend** | Full control (history, filters, roles, sharing); clean API | More engineering; needs a job queue and file storage | Nice-to-have scope |
| **Model as a separate service** (e.g., ACE-Step REST API) behind either | Keeps heavy models isolated; swappable backends | Two processes to manage | Recommended in both cases |

### 10.3 Recurring design patterns

1. **Asynchronous jobs.** Generation takes seconds to minutes, so the server should queue jobs and report progress (Gradio queue, or a task queue with polling or websockets) rather than block a request.
2. **A common model adapter.** Wrap every backend (ACE-Step, Stable Audio, per-genre AE) behind one interface, e.g. `transform(audio, target, prompt, strength) → audio`. The UI can then switch models, and the evaluation notebooks can reuse the same code.
3. **Audio hygiene.**
   - Decode MP3 with ffmpeg.
   - Resample to the model's rate.
   - Loudness-normalise.
   - Cap the duration (e.g., 30–120 s for the demo).
   - Process longer songs in sections, or use models that support long durations (Stable Audio 3 Medium up to 6 min 20 s; ACE-Step up to 600 s).
4. **Comparison UI.** Original and transformed audio side by side (waveform via wavesurfer.js, or spectrograms), A/B toggling, download, and the parameters used. This doubles as a tool for qualitative evaluation.
5. **Presets plus an advanced panel.** Buttons map to curated prompt + strength presets (§6). An "advanced" panel exposes strength, steps and seed.
6. **Provenance labelling.** Mark outputs as AI-generated, and optionally watermark them (AudioSeal; San Roman et al., 2024), in line with EU AI Act Article 50 (§11).
7. **Deployment.** Run on a local GPU first. Hosted APIs (fal.ai's Stable Audio 3 audio-to-audio endpoint) can serve as a fallback. Public deployment must respect model licences (§11).

---

## 11. Ethical, legal and societal considerations

**Uploaded content.** Users will typically upload commercial, copyrighted songs. A genre-transformed version is a derivative work. A public demo should restrict uploads to content the user has rights to (or CC-licensed examples), avoid storing uploads longer than necessary, and avoid redistributing outputs of copyrighted inputs.

**Model training data and licences.**

- ACE-Step 1.5 is MIT-licensed. Its model card cites licensed, royalty-free and synthetic (MIDI-to-audio) training data, though the paper does not detail the sources.
- Stable Audio 3 was trained on 1.28 M recordings from AudioSparx (licensed) and Freesound (CC0/CC-BY/CC-Sampling+) (Evans et al., 2026). Stable Audio Open 1.0 was trained on Creative Commons data from Freesound and the Free Music Archive (Evans et al., 2025).
- MusicGen weights are CC BY-NC 4.0, trained on licensed music (Copet et al., 2023). Common RAVE checkpoints are non-commercial.

These differences matter if the app is ever deployed publicly.

**Industry context.** Record labels sued Suno and Udio in 2024. Universal settled with Udio (Oct 2025), and Warner settled with Udio and Suno (Nov 2025), converting the disputes into licensing deals. Sony and Universal continued litigating against Suno into 2026 (Berger, 2025; Digital Music News, 2026). Training-data provenance is now a mainstream legal issue.

**Transparency.** EU AI Act **Article 50** obligations apply from **2 August 2026**. Providers of systems generating synthetic audio must mark outputs in a machine-readable way. The Commission's Code of Practice on transparency of AI-generated content (2026) gives guidance and notes that no single marking technique is sufficient. Watermarking tools such as AudioSeal (San Roman et al., 2024) exist.

**Vocals and identity.** Regenerating or cloning vocals raises consent and impersonation issues. A decompose-and-keep-vocals design avoids synthesising a person's voice.

**Memorisation.** Generative models can reproduce training data (Batlle-Roca et al., 2024).

**Cultural bias.** Genre labels and captioning vocabularies are Western- and English-centric. Essentia's Discogs-based models note Western/electronic over-representation, and GTZAN covers 10 mostly Anglo-American genres. "Genre transfer" can reproduce stereotypes of what a genre "sounds like".

**Impact on musicians.** See Holzapfel, Sturm & Coeckelbergh (2018), Sturm et al. (2019), Morreale (2021) and Barnett (2023). Framing the app as a creative tool (re-arrangement, ideation, education) and crediting sources is a minimum norm.

---

## 12. Discussion: research gaps and implications for the project plan

### 12.1 Answers to the research questions

| RQ | Short answer |
|---|---|
| RQ1 | Modern systems compress audio with an autoencoder (codec tokens or VAE latents), then model the latents with an autoregressive transformer or a diffusion/flow transformer, conditioned on text and other controls (§2) |
| RQ2 | Ten families exist (§3.1). For uploaded audio, partial noising/Cover in pre-trained diffusion models is the most practical. Inversion, control-conditioned and decompose-and-regenerate methods improve preservation. Per-genre autoencoders mostly change timbre |
| RQ3 | Limit corruption, invert with attention control, condition on melody, or keep separated vocals and regenerate the rest (§4) |
| RQ4 | Mature open tools exist for stems, notes, pitch, beats, structure and key (§5) |
| RQ5 | Text prompts plus curated presets (prompt + strength + optional LoRA). Steering tools improve users' sense of control (§6) |
| RQ6 | Measure adherence (CLAP, classifier, FAD/KAD), preservation (chroma, melody, beats, MuseCPEval), quality (Audiobox Aesthetics, SongEval), efficiency, plus a listening test (§7) |
| RQ7 | MusicNet (classical audio, CC BY 4.0) and FMA/MTG-Jamendo (CC pop/rock/metal etc.). The Kaggle pop MIDI suits the symbolic track only (§8) |
| RQ8 | ACE-Step 1.5 (MIT) and Stable Audio 3 (Community Licence) fit our GPU per vendor docs and both expose genre-transfer controls. RAVE training and Windows tooling are the real compute risks (§9) |
| RQ9 | Gradio for must-haves, FastAPI + React for nice-to-haves, with a job queue, a model adapter and an A/B comparison UI (§10) |

### 12.2 Gaps in the literature

1. **No benchmark for audio genre transfer.** Editing papers evaluate on their own prompt sets, often on short clips (10 s, 16 kHz for AudioLDM 2-based editors).
2. **Full songs with vocals are under-studied.** Most editing work targets instrumental clips. Decompose-and-regenerate pipelines exist but are rarely evaluated end-to-end for genre change.
3. **Preservation metrics are inconsistent.** MuseCPEval (Vishe et al., 2025) is the first attempt at a comprehensive framework.
4. **Most 2026 methods are unreviewed preprints.** Many inversion-free editors are, and vendor benchmarks are not independent.
5. **Genre definitions are taxonomy-dependent and culturally biased.**

### 12.3 Proposed changes to the project plan

The table maps each part of `Advanced AI Project.md` to what the literature implies. Section numbers refer to this review.

| Plan item (current) | Finding | Proposed change |
|---|---|---|
| Must-have: "autoencoder-style per genre" | Per-domain AEs change timbre, not arrangement; RAVE needs ≥ ~3 h/genre and days of training (§3.3) | Keep it as the **class-methods track** with adjusted expectations: (a) RAVE or own spectrogram/latent VAE per genre, starting from MusicNet (classical), and/or (b) the symbolic VAE/transformer route on the MIDI data (§3.10). Present it as a baseline that preserves melody |
| Must-have: "guided diffusion models" | ACE-Step 1.5 Cover and Stable Audio 3 audio-to-audio work locally (§3.4, §9) | Make these the **primary diffusion track**. Spike both in week 1 of modelling. Add LoRA-per-genre as a stretch goal (§3.8) |
| Risk: melody preservation | Four levers (§4) | Add a **"Preservation strategy" section**: strength sweeps, a decompose-and-keep-vocals pipeline, and optional melody conditioning (MusicGen-Melody baseline) |
| Risk: decomposition of elements | Mature tools (§5) | Add a **"Pre-processing / analysis" stage** to the pipeline: separation (Demucs/RoFormer or ACE-Step Extract), BPM/key detection, melody extraction |
| Data Collection: MusicNet + Kaggle pop MIDI | The audio pipeline needs audio; Kaggle pop is 50 MIDI files (§8) | Choose 2–3 genres (e.g., classical, pop, rock). Use **MusicNet audio** (classical) and **FMA / MTG-Jamendo** (pop, rock) for audio; keep the MIDI data for the symbolic track. Add a **data licence log** |
| Evaluation: "methods other than manual checks are unknown" | Established metrics and protocols exist (§7) | Add an **Evaluation framework** section: CLAP score, genre classifier, FAD/KAD, chroma and melody similarity, beat F1, Audiobox Aesthetics, runtime/VRAM, plus a listening test. Report trade-off curves over strength |
| Must-have: prompt or style button | Presets + steering-tool literature (§6) | Define **presets** (button → prompt + strength (+ LoRA)), and an advanced panel for strength |
| Web App | Gradio/FastAPI patterns, job queue, adapters (§10) | Add a **Web app architecture** section: model adapter interface, async jobs, A/B player, AI-output labelling. Gradio for the must-have scope; FastAPI + React only if nice-to-haves are pursued |
| Timeline: Modelling 3 weeks, "if started late, training might take too much time" | The diffusion track needs no training; RAVE does | Start the **RAVE / AE training early** (during data preparation). Run diffusion feasibility spikes first. Training is only needed for LoRA and the class-methods track |
| (Missing) Ethics and licences | Licence differences; uploads; EU AI Act (§11) | Add an **Ethics & licensing** section and a model-licence table |
| (Missing) Compute | Vendor VRAM figures; Windows/FlashAttention risk (§9) | Add a **Compute & environment** section: CUDA-enabled environment, WSL2 fallback, model download sizes |

---

## 13. Conclusion

The literature shows that our project, a web app that changes the genre of an uploaded song by prompt or button, has become feasible on consumer hardware only very recently. In 2026, open models gained explicit cover and audio-to-audio modes: ACE-Step 1.5 and Stable Audio 3. Research on music editing explains why the central difficulty is *preservation*. Every method trades genre change against fidelity to the source's melody, rhythm and form, and the best results come from combining a tunable strength with decomposition (keeping vocals), explicit melody conditioning or inversion-based attention control. Per-genre autoencoders remain a valuable, explainable baseline but act mainly on timbre. Evaluation can and should go beyond manual listening, with CLAP-based adherence, genre classifiers, FAD/KAD, chroma and melody similarity, aesthetics predictors and a structured listening test. Because no benchmark exists for audio genre transfer, a carefully designed evaluation protocol is itself a contribution the project can make.

---

## References

*arXiv identifiers verified against the arXiv API on 9 Nov 2026. "arXiv:XXXX.XXXXX" resolves at https://arxiv.org/abs/XXXX.XXXXX. Vendor documentation was accessed 9 Nov 2026.*

**Foundations of generative modelling**

- Goodfellow, I., et al. (2014). Generative adversarial networks. arXiv:1406.2661.
- Ho, J., Jain, A., & Abbeel, P. (2020). Denoising diffusion probabilistic models. *NeurIPS 2020*. arXiv:2006.11239.
- Ho, J., & Salimans, T. (2022). Classifier-free diffusion guidance. arXiv:2207.12598.
- Hu, E. J., et al. (2022). LoRA: Low-rank adaptation of large language models. *ICLR 2022*. arXiv:2106.09685.
- Kingma, D. P., & Welling, M. (2014). Auto-encoding variational Bayes. *ICLR 2014*. arXiv:1312.6114.
- Lipman, Y., et al. (2023). Flow matching for generative modeling. *ICLR 2023*. arXiv:2210.02747.
- Liu, X., Gong, C., & Liu, Q. (2023). Flow straight and fast: Learning to generate and transfer data with rectified flow. *ICLR 2023*. arXiv:2209.03003.
- Peebles, W., & Xie, S. (2023). Scalable diffusion models with transformers. *ICCV 2023*. arXiv:2212.09748.
- Rombach, R., et al. (2022). High-resolution image synthesis with latent diffusion models. *CVPR 2022*. arXiv:2112.10752.
- Song, J., Meng, C., & Ermon, S. (2021). Denoising diffusion implicit models. *ICLR 2021*. arXiv:2010.02502.
- Zhu, J.-Y., Park, T., Isola, P., & Efros, A. A. (2017). Unpaired image-to-image translation using cycle-consistent adversarial networks. *ICCV 2017*. arXiv:1703.10593.

**Editing and style transfer foundations (images)**

- Gatys, L. A., Ecker, A. S., & Bethge, M. (2016). Image style transfer using convolutional neural networks. *CVPR 2016*.
- Hertz, A., et al. (2023). Prompt-to-prompt image editing with cross attention control. *ICLR 2023*. arXiv:2208.01626.
- Kulikov, V., Kleiner, M., Huberman-Spiegelglas, I., & Michaeli, T. (2025). FlowEdit: Inversion-free text-based editing using pre-trained flow models. *ICCV 2025*. arXiv:2412.08629.
- Meng, C., et al. (2022). SDEdit: Guided image synthesis and editing with stochastic differential equations. *ICLR 2022*. arXiv:2108.01073.
- Mokady, R., et al. (2023). Null-text inversion for editing real images using guided diffusion models. *CVPR 2023*. arXiv:2211.09794.
- Zhang, L., Rao, A., & Agrawala, M. (2023). Adding conditional control to text-to-image diffusion models (ControlNet). *ICCV 2023*. arXiv:2302.05543.

**Audio representations, codecs and embeddings**

- Défossez, A., Copet, J., Synnaeve, G., & Adi, Y. (2022). High fidelity neural audio compression (EnCodec). arXiv:2210.13438.
- Huang, Q., et al. (2022). MuLan: A joint embedding of music audio and natural language. *ISMIR 2022*. arXiv:2208.12415.
- Kumar, R., et al. (2023). High-fidelity audio compression with improved RVQGAN (DAC). *NeurIPS 2023*. arXiv:2306.06546.
- Li, Y., et al. (2024). MERT: Acoustic music understanding model with large-scale self-supervised training. *ICLR 2024*. arXiv:2306.00107.
- Parker, J. D., Evans, Z., Carr, C. J., Zukowski, Z., Taylor, J., Rice, M., & Pons, J. (2026). SAME: A semantically-aligned music autoencoder. arXiv:2605.18613.
- Pasini, M., Lattner, S., & Fazekas, G. (2024). Music2Latent: Consistency autoencoders for latent audio compression. *ISMIR 2024*. arXiv:2408.06500.
- Wu, Y., et al. (2023). Large-scale contrastive language-audio pretraining with feature fusion and keyword-to-caption augmentation (LAION-CLAP). *ICASSP 2023*. arXiv:2211.06687.
- Zeghidour, N., et al. (2021). SoundStream: An end-to-end neural audio codec. arXiv:2107.03312.
- Zhu, H., et al. (2025). MuQ: Self-supervised music representation learning with mel residual vector quantization. arXiv:2501.01108.

**Music generation models**

- Agostinelli, A., et al. (2023). MusicLM: Generating music from text. arXiv:2301.11325.
- Chen, K., et al. (2024). MusicLDM: Enhancing novelty in text-to-music generation using beat-synchronous mixup strategies. *ICASSP 2024*. arXiv:2308.01546.
- Copet, J., et al. (2023). Simple and controllable music generation (MusicGen). *NeurIPS 2023*. arXiv:2306.05284.
- Dhariwal, P., et al. (2020). Jukebox: A generative model for music. arXiv:2005.00341.
- Evans, Z., Carr, C. J., Taylor, J., Hawley, S. H., & Pons, J. (2024a). Fast timing-conditioned latent audio diffusion (Stable Audio). *ICML 2024*. arXiv:2402.04825.
- Evans, Z., et al. (2024b). Long-form music generation with latent diffusion (Stable Audio 2). *ISMIR 2024*. arXiv:2404.10301.
- Evans, Z., Parker, J. D., Carr, C. J., Zukowski, Z., Taylor, J., & Pons, J. (2025). Stable Audio Open. *ICASSP 2025*. arXiv:2407.14358.
- Evans, Z., Parker, J. D., Rice, M., Carr, C. J., Zukowski, Z., Taylor, J., & Pons, J. (2026). Stable Audio 3. arXiv:2605.17991. Code: https://github.com/Stability-AI/stable-audio-3
- Forsgren, S., & Martiros, H. (2022). Riffusion: Stable diffusion for real-time music generation. https://riffusion.com
- Gong, J., et al. (2025). ACE-Step: A step towards music generation foundation model. arXiv:2506.00045.
- Gong, J., Song, Y., Zhao, W., Wang, S., Xu, S., Guo, J., & Yang, X. (2026). ACE-Step 1.5: Pushing the boundaries of open-source music generation. arXiv:2602.00744. Code: https://github.com/ace-step/ACE-Step-1.5
- Huang, Q., et al. (2023). Noise2Music: Text-conditioned music generation with diffusion models. arXiv:2302.03917.
- Lei, S., et al. (2025). LeVo: High-quality song generation with multi-preference alignment. *NeurIPS 2025*. arXiv:2506.07520.
- Li, P., et al. (2023). JEN-1: Text-guided universal music generation with omnidirectional diffusion models. arXiv:2308.04729.
- Liu, H., et al. (2023a). AudioLDM: Text-to-audio generation with latent diffusion models. *ICML 2023*. arXiv:2301.12503.
- Liu, H., et al. (2023b). AudioLDM 2: Learning holistic audio generation with self-supervised pretraining. *IEEE/ACM TASLP*. arXiv:2308.05734.
- Lyria Team, Caillon, A., McWilliams, B., et al. (2025). Live music models (Magenta RealTime). arXiv:2508.04651.
- Ning, Z., et al. (2025). DiffRhythm: Blazingly fast and embarrassingly simple end-to-end full-length song generation with latent diffusion. arXiv:2503.01183.
- Novack, Z., Evans, Z., Zukowski, Z., et al. (2025). Fast text-to-audio generation with adversarial post-training (ARC; Stable Audio Open Small). arXiv:2505.08175.
- Schneider, F., Kamal, O., Jin, Z., & Schölkopf, B. (2023). Moûsai: Text-to-music generation with long-context latent diffusion. arXiv:2301.11757.
- Yang, C., et al. (2025). SongBloom: Coherent song generation via interleaved autoregressive sketching and diffusion refinement. *NeurIPS 2025*. arXiv:2506.07634.
- Yuan, R., et al. (2025). YuE: Scaling open foundation models for long-form music generation. arXiv:2503.08638.

**Audio style and timbre transfer**

- Andrade, C., & Schlecht, S. J. (2026). Audio-to-audio via diffusion warm initialization. arXiv:2606.18968.
- Caillon, A., & Esling, P. (2021). RAVE: A variational autoencoder for fast and high-quality neural audio synthesis. arXiv:2111.05011. Code: https://github.com/acids-ircam/RAVE ; tutorial: https://forum.ircam.fr/article/detail/training-rave-models-on-custom-data/
- Cífka, O., Ozerov, A., Şimşekli, U., & Richard, G. (2021). Self-supervised VQ-VAE for one-shot music style transfer. *ICASSP 2021*. arXiv:2102.05749.
- Dai, S., Zhang, Z., & Xia, G. G. (2018). Music style transfer: A position paper. *MUME 2018*. arXiv:1803.06841.
- Demerlé, N., Esling, P., Doras, G., & Genova, D. (2024). Combining audio control and style transfer using latent diffusion. *ISMIR 2024*. arXiv:2408.00196.
- Engel, J., Hantrakul, L., Gu, C., & Roberts, A. (2020). DDSP: Differentiable digital signal processing. *ICLR 2020*. arXiv:2001.04643.
- Grinstein, E., Duong, N. Q. K., Ozerov, A., & Pérez, P. (2018). Audio style transfer. *ICASSP 2018*. arXiv:1710.11385.
- Huang, S., Li, Q., Anil, C., Bao, X., Oore, S., & Grosse, R. B. (2019). TimbreTron: A WaveNet(CycleGAN(CQT(Audio))) pipeline for musical timbre transfer. *ICLR 2019*. arXiv:1811.09620.
- Kim, D., et al. (2026). AdaTT: Text-guided instrument timbre transfer with target-adaptive structural control. *Interspeech 2026*. arXiv:2606.15813.
- Lee, C. H., Nistal, J., Lattner, S., et al. (2026). Diffusion timbre transfer via mutual information guided inpainting. arXiv:2601.01294.
- Li, S., et al. (2024). Music style transfer with time-varying inversion of diffusion models (MusicTI). *AAAI 2024*. arXiv:2402.13763.
- Lu, C.-Y., Xue, M.-X., Chang, C.-C., Lee, C.-R., & Su, L. (2019). Play as you like: Timbre-enhanced multi-modal music style transfer. *AAAI 2019*. arXiv:1811.12214.
- Mor, N., Wolf, L., Polyak, A., & Taigman, Y. (2019). A universal music translation network. *ICLR 2019*. arXiv:1805.07848.
- Pasini, M. (2019). MelGAN-VC: Voice conversion and audio style transfer on arbitrarily long samples using spectrograms. arXiv:1910.03713.
- Ulyanov, D., & Lebedev, V. (2016). Audio texture synthesis and style transfer [Blog post]. https://dmitryulyanov.github.io/audio-texture-synthesis-and-style-transfer/
- Wang, H., et al. (2024). Repurposing image diffusion models for training-free music style transfer on mel-spectrograms (Stylus). arXiv:2411.15913.

**Text-guided music and audio editing**

- Boudaghi, A., & Zare, H. (2025). MusRec: Zero-shot text-to-music editing via rectified flow and diffusion transformers. arXiv:2511.04376.
- Boudaghi, A., & Zare, H. (2026). FlowSonic: Stable zero-shot music editing via high-order trajectory integration. arXiv:2607.17526.
- Cervera, M., et al. (2025). Virtual consistency for audio editing. arXiv:2509.17219.
- Fu, Z., et al. (2026). EchoEdit: Stabilizing inversion-free audio editing via optimal transport geometry. arXiv:2606.15149.
- Ge, Z., et al. (2026). DirectAudioEdit: Inversion-free text-guided audio editing via diffusion prediction contrast. arXiv:2606.07356.
- Han, B., et al. (2023). InstructME: An instruction guided music edit and remix framework with latent diffusion models. arXiv:2308.14360.
- Jiang, Yu., et al. (2026). FreeSonic: Training-free temporal-aware decoupled attention for precise audio editing. *Interspeech 2026*. arXiv:2606.15186.
- Le Lan, G., et al. (2024). High fidelity text-guided music editing via single-stage flow matching (MelodyFlow). arXiv:2407.03648.
- Liu, Hu., et al. (2025). MEDIC: Zero-shot music editing with disentangled inversion control. *ACM Multimedia 2025*. arXiv:2407.13220.
- Liu, S., et al. (2023). M²UGen: Multi-modal music understanding and generation with the power of large language models. arXiv:2311.11255.
- Manor, H., & Michaeli, T. (2024). Zero-shot unsupervised and text-based audio editing using DDPM inversion (ZETA/ZEUS). *ICML 2024*. arXiv:2402.10009.
- Pan, C., et al. (2026). Audio editing in the era of foundation models: A survey. arXiv:2606.23139.
- Wang, X., et al. (2025). MusicWeaver: Programmable long-form music generation with provably local editing. arXiv:2509.21714.
- Wang, Yu., et al. (2023). AUDIT: Audio editing by following instructions with latent diffusion models. *NeurIPS 2023*. arXiv:2304.00830.
- Yang, Y., et al. (2026). Melodia: Training-free music editing guided by attention probing in diffusion models. *AAAI 2026*. arXiv:2511.08252.
- Zhang, Y., Ikemiya, Y., Xia, G., et al. (2024a). MusicMagus: Zero-shot text-to-music editing via diffusion models. *IJCAI 2024*. arXiv:2402.06178.
- Zhang, Y., et al. (2024b). Loop Copilot: Conducting AI ensembles for music generation and iterative editing. arXiv:2310.12404.
- Zhang, Y., et al. (2025). Instruct-MusicGen: Unlocking text-to-music editing for music language models via instruction tuning. *ISMIR 2025*. arXiv:2405.18386.

**Controllable generation (melody, rhythm, style conditioning)**

- García, H. F., et al. (2024). Sketch2Sound: Controllable audio generation via time-varying signals and sonic imitations. arXiv:2412.08550.
- Hou, S., et al. (2025). Editing music with melody and text: Using ControlNet for diffusion transformer. *ICASSP 2025*. arXiv:2410.05151.
- Novack, Z., McAuley, J., Berg-Kirkpatrick, T., & Bryan, N. J. (2024a). DITTO: Diffusion inference-time T-optimization for music generation. *ICML 2024*. arXiv:2401.12179.
- Novack, Z., et al. (2024b). DITTO-2: Distilled diffusion inference-time T-optimization for music generation. arXiv:2405.20289.
- Rouard, S., Adi, Y., Copet, J., et al. (2024). Audio conditioning for music generation via discrete bottleneck features (MusicGen-Style). *ISMIR 2024*. arXiv:2407.12563.
- Tal, O., et al. (2024). Joint audio and symbolic conditioning for temporally controlled text-to-music generation (JASCO). arXiv:2406.10970.
- Tsai, F.-D., et al. (2025). MuseControlLite: Multifunctional music generation with lightweight conditioners. *ICML 2025*. arXiv:2506.18729.
- Wu, S.-L., Donahue, C., Watanabe, S., & Bryan, N. J. (2024). Music ControlNet: Multiple time-varying controls for music generation. *IEEE/ACM TASLP*. arXiv:2311.07069.

**Accompaniment and stem generation**

- Donahue, C., et al. (2023). SingSong: Generating musical accompaniments from singing. arXiv:2301.12662.
- Nistal, J., Pasini, M., Aouameur, C., et al. (2024). Diff-A-Riff: Musical accompaniment co-creation via latent diffusion models. *ISMIR 2024*. arXiv:2406.08384.
- Parker, J. D., et al. (2024). StemGen: A music generation model that listens. *ICASSP 2024*. arXiv:2312.08723.
- Strano, G., et al. (2025). STAGE: Stemmed accompaniment generation through prefix-based conditioning. arXiv:2504.05690.

**Decomposition and analysis**

- Bittner, R. M., et al. (2022). A lightweight instrument-agnostic model for polyphonic note transcription and multipitch estimation (Basic Pitch). *ICASSP 2022*. arXiv:2203.09893.
- Böck, S., et al. (2016). madmom: A new Python audio and music signal processing library. *ACM MM 2016*. arXiv:1605.07008.
- Chang, S., et al. (2024). YourMT3+: Multi-instrument music transcription with enhanced transformer architectures and cross-dataset stem augmentation. *MLSP 2024*. arXiv:2407.04822.
- Fabbro, G., et al. (2024). The Sound Demixing Challenge 2023 – Music demixing track. *TISMIR*. arXiv:2308.06979.
- Foscarin, F., Schlüter, J., & Widmer, G. (2024). Beat this! Accurate beat tracking without DBN postprocessing. *ISMIR 2024*. arXiv:2407.21658.
- Gardner, J., et al. (2022). MT3: Multi-task multitrack music transcription. *ICLR 2022*. arXiv:2111.03017.
- Kim, J. W., Salamon, J., Li, P., & Bello, J. P. (2018). CREPE: A convolutional representation for pitch estimation. *ICASSP 2018*. arXiv:1802.06182.
- Kim, T., & Nam, J. (2023). All-in-one metrical and functional structure analysis with neighborhood attentions on demixed audio. *WASPAA 2023*. arXiv:2307.16425.
- Lu, W.-T., Wang, J.-C., Kong, Q., & Hung, Y.-N. (2024). Music source separation with band-split RoPE transformer (BS-RoFormer). *ICASSP 2024*. arXiv:2309.02612.
- Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid transformers for music source separation (HT-Demucs). *ICASSP 2023*. arXiv:2211.08553.
- Tong, W., et al. (2024). SCNet: Sparse compression network for music source separation. *ICASSP 2024*. arXiv:2401.13276.
- Wang, J.-C., Lu, W.-T., & Won, M. (2023). Mel-band RoFormer for music source separation. *ISMIR 2023 LBD*. arXiv:2310.01809.

**Evaluation**

- Chung, Y., et al. (2025). KAD: No more FAD! An effective and efficient evaluation metric for audio generation. arXiv:2502.15602.
- Gui, A., Gamper, H., Braun, S., & Emmanouilidou, D. (2024). Adapting Fréchet audio distance for generative music evaluation. *ICASSP 2024*. arXiv:2311.01616.
- Kader, F. B., & Karmaker, S. (2025). A survey on evaluation metrics for music generation. arXiv:2509.00051.
- Kilgour, K., Zuluaga, M., Roblek, D., & Sharifi, M. (2019). Fréchet audio distance: A reference-free metric for evaluating music enhancement algorithms. *Interspeech 2019*. arXiv:1812.08466.
- Kim, Y., et al. (2025). Music Arena: Live evaluation for text-to-music. *NeurIPS 2025 Creative AI Track*. arXiv:2507.20900.
- Lerch, A., Arthur, C., Bryan-Kinns, N., Ford, C., Sun, Q., & Vinay, A. (2025). Survey on the evaluation of generative models in music. arXiv:2506.05104 (accepted to *ACM Computing Surveys*).
- MTG-UPF. (2026). Essentia models (Discogs-EffNet, MAEST). https://essentia.upf.edu/models.html
- Radford, A., et al. (2023). Robust speech recognition via large-scale weak supervision (Whisper). *ICML 2023*. arXiv:2212.04356.
- Tjandra, A., et al. (2025). Meta Audiobox Aesthetics: Unified automatic quality assessment for speech, music, and sound. arXiv:2502.05139.
- Vishe, Y., et al. (2025). Evaluating music context preservation: A multi-facet framework for music editing systems (MuseCPEval). *ISMIR 2026*. arXiv:2512.14629.
- Yao, J., et al. (2025). SongEval: A benchmark dataset for song aesthetics evaluation. arXiv:2505.10793.

**Datasets**

- Agostinelli, A., et al. (2023). MusicCaps, released with MusicLM. arXiv:2301.11325.
- Bogdanov, D., Won, M., Tovstogan, P., Porter, A., & Serra, X. (2019). The MTG-Jamendo dataset for automatic music tagging. *ICML 2019 Workshop on ML for Music Discovery*.
- Defferrard, M., Benzi, K., Vandergheynst, P., & Bresson, X. (2017). FMA: A dataset for music analysis. *ISMIR 2017*. arXiv:1612.01840.
- Doh, S., Choi, K., Lee, J., & Nam, J. (2023). LP-MusicCaps: LLM-based pseudo music captioning. *ISMIR 2023*. arXiv:2307.16372.
- Kaggle. (n.d.). music_midi_dataset (kritanjalijain): 50 pop MIDI files, CC BY-SA 4.0. https://www.kaggle.com/datasets/kritanjalijain/music-midi-dataset
- Manco, I., et al. (2023). The Song Describer Dataset: A corpus of audio captions for music-and-language evaluation. *NeurIPS 2023 ML4Audio Workshop*. arXiv:2311.10057.
- Manilow, E., Wichern, G., Seetharaman, P., & Le Roux, J. (2019). Cutting music source separation some Slakh. *WASPAA 2019*.
- Pereira, I., Araújo, F., Korzeniowski, F., & Vogl, R. (2023). MoisesDB: A dataset for source separation beyond 4-stems. *ISMIR 2023*. arXiv:2307.15913.
- Rafii, Z., Liutkus, A., Stöter, F.-R., Mimilakis, S. I., & Bittner, R. (2017). The MUSDB18 corpus for music separation. Zenodo.
- Sturm, B. L. (2013). The GTZAN dataset: Its contents, its faults, their effects on evaluation, and its future use. arXiv:1306.1461.
- Thickstun, J., Harchaoui, Z., & Kakade, S. (2017). Learning features of music from scratch (MusicNet). *ICLR 2017*. arXiv:1611.09827. Data: https://zenodo.org/records/5120004
- Tzanetakis, G., & Cook, P. (2002). Musical genre classification of audio signals (GTZAN). *IEEE Transactions on Speech and Audio Processing*, 10(5).

**Symbolic music (condensed from v1)**

- Bhandari, K., et al. (2025). ImprovNet: Generating controllable musical improvisations with iterative corruption refinement. *IJCNN 2025*. arXiv:2502.04522.
- Brunner, G., Konrad, A., Wang, Y., & Wattenhofer, R. (2018). MIDI-VAE: Modeling dynamics and instrumentation of music with applications to style transfer. *ISMIR 2018*. arXiv:1809.07600.
- Brunner, G., Wang, Y., Wattenhofer, R., & Zhao, S. (2018). Symbolic music genre transfer with CycleGAN. *ICTAI 2018*. arXiv:1809.07575.
- Cífka, O., Şimşekli, U., & Richard, G. (2020). Groove2Groove: One-shot music style transfer with supervision from synthetic data. *IEEE/ACM TASLP*, 28, 2638–2650.
- Min, L., Jiang, J., Xia, G., & Zhao, J. (2023). Polyffusion: A diffusion model for polyphonic score generation with internal and external controls. *ISMIR 2023*. arXiv:2307.10304.
- Pasquier, P., et al. (2025). MIDI-GPT: A controllable generative model for computer-assisted multitrack music composition. *AAAI 2025*. arXiv:2501.17011.
- Wang, Z., Wang, D., Zhang, Y., & Xia, G. (2020). Learning interpretable representation for controllable polyphonic music generation (Poly-Dis). *ISMIR 2020*. arXiv:2008.07122.
- Wu, S.-L., & Yang, Y.-H. (2023). MuseMorphose: Full-song and fine-grained piano music style transfer with one Transformer VAE. *IEEE/ACM TASLP*, 31. arXiv:2105.04090.
- Yang, R., et al. (2019). Deep music analogy via latent representation disentanglement (EC²-VAE). *ISMIR 2019*. arXiv:1906.03626.
- Zhao, J., & Xia, G. (2021). AccoMontage: Accompaniment arrangement via phrase selection and style transfer. *ISMIR 2021*. arXiv:2108.11213.

**HCI and web applications**

- Abid, A., et al. (2019). Gradio: Hassle-free sharing and testing of ML models in the wild. *ICML 2019 HILL Workshop*. arXiv:1906.02569.
- Huang, C.-Z. A., Koops, H. V., Newton-Rex, E., Dinculescu, M., & Cai, C. J. (2020). AI Song Contest: Human-AI co-creation in songwriting. *ISMIR 2020*. arXiv:2010.05388.
- Louie, R., Coenen, A., Huang, C.-Z. A., Terry, M., & Cai, C. J. (2020). Novice-AI music co-creation via AI-steering tools for deep generative models. *CHI 2020*.
- fal.ai. (2026). Stable Audio 3 Medium audio-to-audio API. https://fal.ai/models/fal-ai/stable-audio-3/medium/audio-to-audio
- Stability AI. (2026, May 20). Stable Audio 3.0 announcement. https://stability.ai/news-updates/meet-stable-audio-3-the-model-family-built-for-artistic-experimentation-with-open-weight-models

**Ethics, law and provenance**

- Barnett, J. (2023). The ethical implications of generative audio models: A systematic literature review. *AIES 2023*.
- Batlle-Roca, R., Liao, W.-H., Serra, X., Mitsufuji, Y., & Gómez, E. (2024). Towards assessing data replication in music generation with music similarity metrics on raw audio. *ISMIR 2024*.
- Berger, V. (2025, Dec 18). Launch, train, settle: How Suno and Udio's licensing deals made copyright infringement profitable. *Forbes*.
- Digital Music News. (2026, Apr 9). Universal Music Group and Suno hit settlement talk impasse.
- European Commission. (2026). Code of Practice on transparency of AI-generated content. https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
- European Parliament & Council. (2024). Regulation (EU) 2024/1689 (AI Act), Art. 50.
- Holzapfel, A., Sturm, B. L., & Coeckelbergh, M. (2018). Ethical dimensions of music information retrieval technology. *TISMIR*, 1(1), 44–55.
- Morreale, F. (2021). Where does the buck stop? Ethical and political issues with AI in music creation. *TISMIR*, 4(1), 105–113.
- San Roman, R., et al. (2024). Proactive detection of voice cloning with localized watermarking (AudioSeal). *ICML 2024*. arXiv:2401.17264.
- Sturm, B. L. T., Iglesias, M., Ben-Tal, O., Miron, M., & Gómez, E. (2019). Artificial intelligence and music: Open questions of copyright law and engineering praxis. *Arts*, 8(3), 115.

**Background surveys**

- Briot, J.-P., Hadjeres, G., & Pachet, F.-D. (2017). Deep learning techniques for music generation – A survey. arXiv:1709.01620.
- Ji, S., Yang, X., & Luo, J. (2023). A survey on deep learning for symbolic music generation. *ACM Computing Surveys*, 56(1).
- Wei, M., et al. (2024). Prevailing research areas for music AI in the era of foundation models. arXiv:2409.09378.

---

## Appendix A: Model fact sheets

### A.1 ACE-Step 1.5 (ACE Studio & StepFun, Jan 2026; arXiv:2602.00744)

| Item | Detail |
|---|---|
| Architecture | Qwen3-based LM planner (0.6B / 1.7B / 4B) writes metadata (BPM, key, duration, structure); ≈2B DiT renders audio (4B "XL" DiT released Apr 2026); 1-D VAE, 48 kHz stereo → 64-dim latents at 25 Hz |
| Variants | base and sft (50 steps, CFG), turbo (8 steps, no CFG, distilled); XL versions of each |
| Tasks | text2music, **cover**, repaint, lego (add track), extract (stem separation), complete; reference audio; vocal-to-BGM listed. Lego, Extract and Complete are base-model only |
| Cover inputs | `src_audio`, caption, `audio_cover_strength` 0–1 (1.0 = strong structure adherence; 0.2 suggested for style transfer), optional lyrics |
| Other inputs | lyrics (`[Instrumental]` for none), bpm 30–300, keyscale, timesignature, vocal_language, duration 10–600 s, guidance_scale (non-turbo), inference_steps, shift, seed |
| Hardware | "<4 GB" headline (smallest config with offload). Tiers: ≤6 GB 2B turbo no-LM INT8 + offload; 6–8 GB +0.6B LM; 8–16 GB 2B turbo/sft + 0.6–1.7B LM; XL ≥12 GB (offload + quant). Disk ~10 GB. Speed: <2 s/song A100; <10 s RTX 3090 |
| Interfaces | Gradio UI (`uv run acestep`, :7860); REST API (`uv run acestep-api`, :8001); Python `generate_music(...)`; LoRA training tab |
| Licence and data | MIT (code and weights). Model card cites licensed, royalty-free and synthetic MIDI-to-audio data |
| Evaluation (authors) | AudioBox aesthetics, SongEval, own style/lyric reward models, Music Arena (ranked between Suno v4.5 and v5 per the authors) |

### A.2 Stable Audio 3 (Stability AI, May 2026; arXiv:2605.17991)

| Item | Detail |
|---|---|
| Family | Small-Music and Small-SFX (459M DiT, ≤2 min, CPU-capable); **Medium** (1.4B DiT, ≤6 min 20 s, CUDA + FlashAttention); Large (2.7B, API/enterprise only) |
| Architecture | Flow-matching latent DiT; SAME autoencoder (44.1 kHz stereo, 4096× downsampling, 256-dim latents ≈10.8 Hz); T5Gemma text encoder; ARC post-training (8 steps, no CFG); base checkpoints (50 steps, CFG) also released |
| Modes (open library) | text-to-audio; **audio-to-audio** (`init_audio`, `init_noise_level`: 0.1 close variation, 0.5 halfway, 1.0 pure generation); inpainting/continuation (`inpaint_audio`, start/end seconds) |
| Excluded by design | Instruction editing, lyrics editing, ControlNet-style controls ("could be added by fine-tuning") |
| Hardware | Medium peak VRAM ≈6.5 GB at 120 s (measured on H200); LoRA training ≈6.5 GB (Medium), ≈2.5 GB (Small); "at minimum ~20–50 clips" |
| Licence and data | Stability AI Community Licence (free under US$1M revenue; gated HF download). Trained on 1,278,902 recordings: AudioSparx (licensed) + Freesound (CC0/CC-BY/CC-Sampling+) |
| Evaluation (authors) | FAD (CLAP embeddings), CLAP score, MOS (14 listeners) on Song Describer |

### A.3 Stable Audio Open 1.0 (2024; arXiv:2407.14358)

Open-weights latent DiT trained on Creative Commons data (Freesound and FMA). Generates up to 47 s of stereo. Audio-to-audio via `init_audio` and `init_noise_level` in `stable-audio-tools`, or `initial_audio_waveforms` in diffusers. Stability AI Community Licence.

### A.4 RAVE (IRCAM, 2021; arXiv:2111.05011)

Real-time VAE with adversarial fine-tuning. Training a per-domain model and running any input through it gives timbre transfer. Training data: homogeneous audio, ≥ ~3 h (community guidance). Training time: days to weeks (paper ≈7 days; IRCAM tutorial 3–4 days + 4 days–3 weeks). GPU: ≥8 GB recommended in the tutorial; newer configurations need more. Pre-trained collections are commonly CC BY-NC 4.0.

### A.5 MusicGen-Melody / MusicGen-Style (Meta AudioCraft, 2023–24)

Autoregressive transformer over EnCodec tokens. Melody variant: chromagram conditioning. Style variant: 1.5–4.5 s audio excerpt plus text, balanced by double CFG (suggested `cfg_coef=3`, `cfg_coef_2=5`). Code MIT; weights CC BY-NC 4.0.

---

## Appendix B: Search log

| Date | Source | Query / action | Outcome |
|---|---|---|---|
| 4 Nov 2026 | arXiv, Scholar, ISMIR, GitHub | Symbolic music style transfer, datasets, evaluation (v1 of this review) | ≈100 sources; condensed into §3.10 |
| 9 Nov 2026 | arXiv API (3 batches, ≈110 IDs) | Verified titles, authors, dates and abstracts of all arXiv references | Corrected several mis-attributed IDs before citation |
| 9 Nov 2026 | Web search | "ACE-Step 1.5 … cover repaint VRAM"; "Stable Audio 3 release open weights" | ACE-Step 1.5 (arXiv:2602.00744); Stable Audio 3 (arXiv:2605.17991) |
| 9 Nov 2026 | GitHub / HF / vendor docs | ACE-Step-1.5 README, INFERENCE.md, INSTALL.md, HF card; stable-audio-3 README, inference.md, lora.md; stable-audio-tools generation.py; fal.ai API; diffusers docs | Verified tasks, parameters, VRAM, licences |
| 9 Nov 2026 | Web search | "music genre transfer audio diffusion 2025 2026"; "training-free music editing flow matching"; "survey text-guided music editing" | MelodyFlow, Melodia, MusRec, FlowSonic, EchoEdit, DirectAudioEdit, FreeSonic, MuseCPEval, audio-editing survey |
| 9 Nov 2026 | Web search | RAVE licence/training; Magenta RT; MusicGen-Style; YuE ICL; Essentia genre models | §3.3, §3.8, §7, §9 facts |
