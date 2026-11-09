# Genre Transfer for Recorded Music: A Short Literature Review

**Advanced AI · Group Project II: Exploring Style Transfer in Music Generation**
IE University · Version 3 (primary literature-review deliverable) · 9 November 2026
Authors: *[group members]*

> Companion documents: the extended evidence version with ≈150 sources is [LITERATURE_REVIEW_Extended.md](LITERATURE_REVIEW_Extended.md) (v2), and a one-page quick reference is [LIT_REVIEW_SUMMARY.md](LIT_REVIEW_SUMMARY.md). The project is defined in [`Advanced AI Project.md`](Advanced%20AI%20Project.md).

---

## Abstract

We review techniques and model architectures for changing the genre of a recorded piece of music while keeping it recognisable. The target application is a web tool that transforms an uploaded clip on request (by prompt or by preset). The first version focuses on instrumental clips and the classical ↔ rock pair.

We cover:

- the architectures that underpin current systems: neural audio autoencoders, autoregressive transformers, and latent diffusion and flow models;
- five families of transfer technique: per-domain autoencoders, partial noising ("audio-to-audio"/"cover"), inversion-based editing, control-conditioned regeneration, and exemplar-based style transfer;
- *style embeddings*, from hand-crafted descriptors to self-supervised encoders and weight-space adapters;
- fine-tuning for genre personalisation;
- content preservation and evaluation.

The evidence base has three limits. The most practical tools for audio genre transfer (released in 2026) are documented mainly by their vendors. Peer-reviewed editing research concentrates on short, low-sample-rate clips, often of generated music. No benchmark exists for audio genre transfer. We conclude with design implications: a tunable-strength diffusion transfer as the main mechanism, a mel-spectrogram autoencoder baseline, a frozen-encoder genre probe as the style-embedding extractor and metric, per-genre LoRA adapters, and an evaluation that reports style-versus-preservation trade-off curves on real recordings.

---

## Contents

1. [Introduction](#1-introduction)
2. [Architectures for music generation](#2-architectures-for-music-generation)
3. [Genre-transfer techniques](#3-genre-transfer-techniques)
4. [Style embeddings](#4-style-embeddings)
5. [Genre personalisation by fine-tuning](#5-genre-personalisation-by-fine-tuning)
6. [Preserving content](#6-preserving-content)
7. [Evaluation](#7-evaluation)
8. [Data and ethics](#8-data-and-ethics)
9. [Synthesis: gaps and design implications](#9-synthesis-gaps-and-design-implications)
10. [Conclusion](#10-conclusion)
- [References](#references) · [Appendix A: Models and tools](#appendix-a-models-and-tools) · [Appendix B: Data for classical and rock](#appendix-b-data-for-classical-and-rock) · [Appendix C: Search and verification log](#appendix-c-search-and-verification-log)

---

## 1. Introduction

### 1.1 Task and scope

A user uploads a recording and asks for it in another genre, either by typing a prompt or by pressing a preset button. The output should clearly belong to the target genre and still be recognisably the same piece. The project roadmap also requires that we *"develop a method to extract style embeddings from music samples"*, *"implement the style transfer mechanism"*, and *"train the selected model … [and] experiment with different hyperparameters"*.

This review is scoped to the first version of the system: **instrumental clips of about 30 s, transferred between classical and rock**. Pop and songs with vocals are later extensions. We therefore discuss them only where they shape the design.

### 1.2 What changes and what stays

Dai, Zhang & Xia (2018) separate musical style into three levels:

- **composition**: harmony, rhythm, texture, form;
- **performance**: timing, dynamics, articulation;
- **timbre**: instruments, production, sound.

A genre bundles all three. Classical → rock means distorted guitars and drums (timbre), a backbeat and power-chord voicings (composition), and dense, compressed production (performance and sound). The *content* listeners use to recognise a piece is mainly its melody, harmony, rhythm or tempo, and form. Recent work calls these facets "music context" that an editor should preserve (Vishe et al., 2025). The central tension of the field follows directly: **the more of the composition level a method changes, the more of the content it risks losing.**

### 1.3 Research questions

| RQ | Question | Section |
|---|---|---|
| RQ1 | Which architectures underpin current music generation and editing, and what do they allow us to manipulate? | §2 |
| RQ2 | Which techniques can change the genre of an existing recording, and how strong is the evidence for each? | §3 |
| RQ3 | How are *style embeddings* extracted and used? | §4–5 |
| RQ4 | How can content (melody, rhythm, form) be preserved? | §6 |
| RQ5 | How should genre transfer be evaluated? | §7 |

### 1.4 Method and evidence grading

**Sources.** We searched arXiv (cs.SD, eess.AS, cs.LG), ISMIR/TISMIR, ICASSP, Interspeech and the major machine-learning venues, plus official repositories and model cards, for work from 2016 to November 2026. All arXiv identifiers were verified against the arXiv API. Experimental details in the evidence table (§3.7) were read from the papers' experiment sections. Appendix C logs the process.

**Grading.** Because the field moves quickly and much evidence is vendor-produced, each key method is graded:

- **A**: peer-reviewed, with public code or weights;
- **B**: peer-reviewed, without code;
- **C**: preprint;
- **D**: vendor technical report or documentation with no independent evaluation of the capability we need.

### 1.5 How this review meets the brief

The brief (Project II, roadmap item 1): *"Conduct a short literature review on music generation, style transfer, and related AI techniques (focus mostly on techniques and model architectures). Identify key research papers, tools, and libraries in the field."*

| Brief criterion | Where it is addressed |
|---|---|
| Short | ≈5.3k-word main body (references and appendices excluded) |
| Music generation | §2.1–2.3: audio and symbolic generation architectures |
| Style transfer | §3: five technique families, evidence-graded table §3.7; §6 content preservation |
| Related AI techniques | §4 style embeddings and probing; §5 fine-tuning (LoRA, DreamBooth, textual inversion); §7 evaluation |
| Focus on techniques and model architectures | §2–§5 make up most of the review |
| Key research papers | §3.7 evidence table; topic-grouped reference list |
| Tools and libraries | §2.4 and Appendix A |

---

## 2. Architectures for music generation

### 2.1 Compressing audio

Raw audio is too long to model directly: 30 s of stereo at 44.1 kHz is 2.6 million samples. Every current system first compresses it, and the compression decides what a model can manipulate. There are three options.

**1. Spectrogram plus vocoder.** Mel-spectrograms are compact and image-like. A neural *vocoder* turns them back into audio.

- HiFi-GAN was designed and evaluated for speech (22.05 kHz; LJSpeech and VCTK) (Kong et al., 2020).
- BigVGAN was trained only on speech but generalises zero-shot to music. On MUSDB18-HQ it scored a similarity MOS of 4.20 (base model), against 4.08 for HiFi-GAN and 4.57 for ground truth (Lee et al., 2023). Its v2 checkpoints, trained on diverse audio including instruments, offer 44 kHz models (MIT licence).
- Vocos reaches ViSQOL 4.55 on MUSDB18, against 4.54 for BigVGAN and 4.39 for HiFi-GAN (Siuzdak, 2023).

Good universal vocoders therefore exist for music. This matters for any student-built spectrogram model (§3.1).

**2. Discrete codec tokens.** Neural codecs such as EnCodec (Défossez et al., 2022) quantise audio into parallel token streams at roughly 50 Hz for language models.

**3. Continuous latent autoencoders.** Variational autoencoders (Kingma & Welling, 2014), usually trained with adversarial losses (Goodfellow et al., 2014), produce low-rate continuous latents for diffusion models. Examples:

| Autoencoder | Input | Latent | Compression |
|---|---|---|---|
| Stable Audio 2 (Evans et al., 2024) | — | 21.5 Hz | — |
| ACE-Step 1.5 (Gong et al., 2026) | 48 kHz stereo | 64-dim at 25 Hz | — |
| SAME (Parker et al., 2026) | 44.1 kHz stereo | 256-dim at ≈10.8 Hz | 4096× |

SAME is trained with semantic losses, including chroma, so its latents are aligned with musical content (Parker et al., 2026).

### 2.2 Generative models

**Autoencoders as generators.** An autoencoder trained on one domain reconstructs inputs "as" that domain. This is the basis of per-domain timbre transfer, and RAVE adds real-time synthesis (Caillon & Esling, 2021). Autoencoders alone do not model long-range musical structure.

**Autoregressive transformers.** MusicLM (Agostinelli et al., 2023) and MusicGen (Copet et al., 2023) predict codec tokens conditioned on text, and MusicGen can also condition on melody. Their strength is flexible conditioning. Their weakness for editing is that there is no natural "partial" generation that starts from an existing recording.

**Symbolic generation.** Before audio models matured, music generation was largely symbolic (MIDI):
- MuseGAN generated multi-track piano-rolls with GANs (Dong et al., 2018).
- MusicVAE learned hierarchical latent spaces whose attribute vectors allow simple style arithmetic (Roberts et al., 2018).
- Music Transformer modelled long expressive performances with relative attention (Huang, C.-Z. A. et al., 2019).

Symbolic style transfer gives exact control of notes but loses timbre and production. This is why an audio-first project treats it as background (§3.7).

**Diffusion and flow models.**

- Denoising diffusion (Ho et al., 2020) learns to reverse a noising process.
- DDIM (Song et al., 2021) makes sampling deterministic and invertible.
- Latent diffusion (Rombach et al., 2022) works in an autoencoder's latent space.
- Diffusion transformers (Peebles & Xie, 2023) replace U-Nets.
- Flow matching (Lipman et al., 2023) learns near-straight noise-to-data paths.

Diffusion dominates *editing* for two reasons. The noise level is a natural knob for how much of the input to keep, and invertibility allows an input to be reconstructed and then re-generated.

The 2026 open systems have converged on the same recipe: **latent diffusion transformers trained with flow objectives**, distilled to about 8 sampling steps. This holds for ACE-Step 1.5 (Gong et al., 2026) and Stable Audio 3 (Evans et al., 2026). Earlier systems include AudioLDM 2 (Liu, H. et al., 2023) and Stable Audio Open (Evans et al., 2025). The systems differ mainly in their autoencoder, training data, conditioning and distillation, not in their core architecture.

### 2.3 Conditioning

- **Text:** a frozen encoder (T5Gemma in Stable Audio 3; Qwen3 embeddings in ACE-Step 1.5) or a joint audio–text embedding such as CLAP (Wu, Y. et al., 2023) or the MuLan model used by MusicLM.
- **Classifier-free guidance** trades prompt adherence against diversity (Ho & Salimans, 2022). Distilled models typically run without it.
- **Planning:** ACE-Step 1.5 adds a language-model planner that writes metadata (BPM, key, structure) before rendering (Gong et al., 2026).

### 2.4 Key tools and libraries

| Purpose | Tools and libraries |
|---|---|
| Deep learning | PyTorch and torchaudio; Hugging Face `diffusers` (Stable Audio pipeline) and `peft` (LoRA) |
| Generation and editing | ACE-Step 1.5 (Python API, Gradio UI, REST API); Stability AI `stable-audio-3` and `stable-audio-tools`; Meta AudioCraft (MusicGen, MusicGen-Style, MelodyFlow) |
| Vocoders | BigVGAN (Lee et al., 2023); Vocos (Siuzdak, 2023) |
| Embeddings | LAION-CLAP; MERT and MuQ (Hugging Face); Essentia models |
| Audio analysis | librosa (spectrograms, chroma); mir_eval (melody and beat metrics); Beat This! (Foscarin et al., 2024) |
| Separation | Demucs / HT-Demucs (Rouard et al., 2023) |
| Evaluation | fadtk (FAD), KAD, Audiobox Aesthetics |
| Interfaces | Gradio (Abid et al., 2019); Web Audio API for browser demos |
| Symbolic (background) | pretty_midi, music21, MidiTok |

**Answer to RQ1:** current systems manipulate music in a compressed latent space, and diffusion/flow models make the *degree* of change controllable. This property underpins most of the transfer techniques below.

---

## 3. Genre-transfer techniques

### 3.1 Per-domain autoencoders and spectrogram translation

The oldest audio approach trains a model of the *target* domain and passes the input through it:

- The **Universal Music Translation Network** uses a shared WaveNet encoder, trained with a domain-confusion loss to remove domain identity, and *one decoder per domain* (Mor et al., 2019).
- **TimbreTron** applies CycleGAN (Zhu et al., 2017) to constant-Q spectrograms with a WaveNet vocoder (Huang, S. et al., 2019).
- **Play as You Like** transfers between genres and instruments with timbre-enhanced spectral features (Lu, C.-Y. et al., 2019).
- **MelGAN-VC** translates mel-spectrograms of arbitrary length with a GAN (Pasini, 2019).
- **RAVE** re-renders any input in the timbre of its training domain (Caillon & Esling, 2021).
- A **self-supervised VQ-VAE** separates content codes from a reference style embedding (Cífka et al., 2021).

**Appraisal.** Across these works the demonstrated change is mostly **timbral**. Pitch and rhythm come from the input, which explains both their strong preservation and their limited ability to produce a genre's *arrangement* (Grinstein et al. (2018) reached the same conclusion for statistics-based audio style transfer). Costs differ greatly:

- WaveNet decoders are slow to sample.
- RAVE training takes days to weeks per model (Caillon & Esling, 2021; IRCAM tutorial).
- A mel-spectrogram autoencoder with a pretrained universal vocoder (§2.1) is far cheaper. It combines the UMTN idea (shared encoder, per-genre decoders) with a vocoder validated on music.

We found no published evaluation of this combination for genre transfer. It is a *design adaptation*, not an established method, and it should be presented as a baseline whose expected behaviour is timbre-level change. (Grades: UMTN, TimbreTron, Play as You Like **B**; RAVE **C**, code available.)

### 3.2 Partial noising: SDEdit, "audio-to-audio" and "cover"

SDEdit adds noise to an input up to an intermediate level and denoises it under a new condition. The level trades realism under the new condition against faithfulness to the input (Meng et al., 2022).

Andrade & Schlecht (2026) quantify this for audio. Using pitch-based Jaccard distance (faithfulness) against FAD (target realism), they show that the initialisation time governs the balance in timbre transfer and MIDI-to-real synthesis.

The technique is now built into the open models most relevant to us:

- **Stable Audio 3** has an *audio-to-audio* mode with `init_noise_level`: 0.1 gives "a close variation", 0.5 "a halfway blend", and 1.0 pure generation (Evans et al., 2026; library documentation). The technical report evaluates generation and inpainting. We found no reported evaluation of audio-to-audio transfer.
- **ACE-Step 1.5** offers a *Cover* task with `audio_cover_strength` in [0, 1], where 1.0 means strong structural adherence. The documentation suggests 0.2 for style transfer. The report presents Cover as one task within a unified masked generative framework but does not evaluate it separately (Gong et al., 2026).

**Appraisal.** This is the simplest and fastest mechanism, and the only one with mature, open, full-bandwidth implementations for real recordings. Its weakness is structural: a single global knob, where "stronger edits require deeper corruption of the very rhythm, transients, timbre, and long-range form that should remain unchanged" (Fu et al., 2026). For our purposes the evidence is **grade D**. Testing it is therefore part of the project's contribution.

### 3.3 Inversion-based editing

Inversion methods recover the noise trajectory that reproduces the input and then regenerate it under a new prompt. They often constrain attention maps, as in image editing (Hertz et al., 2023), to keep structure.

- **ZETA** (Manor & Michaeli, 2024) applies DDPM inversion to AudioLDM 2 for text-based edits of real music. It was evaluated on 34 MusicDelta excerpts with CLAP, LPAPS and FAD, and with a crowd-sourced preference study against SDEdit, DDIM inversion and MusicGen-Melody. **A**
- **MusicMagus** (Zhang, Y. et al., 2024) edits the text embedding and adds a cross-attention constraint. Its genre-style experiments (e.g., jazz → rock, country → metal) used 5 s, 16 kHz clips *generated by AudioLDM 2*, with 26 listeners. The authors report notable failure cases. **A**
- **MelodyFlow** (Le Lan et al., 2024) is a flow-matching DiT on 48 kHz stereo latents with an adapted ReNoise inversion. In listening tests, its average editing score was 2.68 on a 1–5 scale, against 2.52 for AudioLDM 2 with DDPM inversion and 2.39 for MusicGen-Melody. The authors note it does not follow direct instructions such as instrument swaps. **C**
- **Melodia** (Yang, Y. et al., 2026) probes AudioLDM 2's attention to guide training-free edits. On its 2,015-pair benchmark it reports CLAP 0.39, LPAPS 3.11 and chroma similarity 0.68, against CLAP 0.34 and LPAPS 4.06 for a DDPM-inversion baseline, with 77 listeners. No code is stated. **B**
- **MusRec** (Boudaghi & Zare, 2025) extends zero-shot editing to real recordings with rectified-flow DiTs. **C**

**Appraisal.** Inversion consistently beats naive noising on structure preservation in the authors' own comparisons. Most evidence, however, comes from one backbone (AudioLDM 2, 16 kHz), short clips (5–10 s) and sometimes generated rather than real music. Subjective gains are modest (MelodyFlow: 2.68 vs 2.39 out of 5). These results show that inversion helps; they do not show that it is ready for a full-bandwidth web application.

### 3.4 Inversion-free editing

A 2024–26 line of work avoids inversion. It integrates the difference between source- and target-conditioned predictions directly: FlowEdit for images (Kulikov et al., 2025) and EchoEdit for audio (Fu et al., 2026). A recent survey places these within audio editing more broadly (Pan et al., 2026). These are recent preprints, with mostly short-clip, author-run evaluations (**C**).

### 3.5 Control-conditioned regeneration

These methods extract controls from the input and generate new audio under them plus the target prompt:

- **MusicGen-Melody** uses the chromagram (Copet et al., 2023).
- **Music ControlNet** adds time-varying melody, dynamics and rhythm controls (Wu, S.-L. et al., 2024).
- **JASCO** combines chords, melody and drums with text (Tal et al., 2024).
- **MuseControlLite** (Tsai et al., 2025) adds 85 M-parameter adapters to Stable Audio Open. On 586 instrumental Song Describer clips it reports **61.1 % melody accuracy**, against 56.6 % for a Stable Audio Open ControlNet and 43.1 % for MusicGen-Stereo-Large-Melody. **A**

**Appraisal.** Explicit control is the most direct protection for melody. Even the best reported accuracy, however, leaves about 40 % of frames off-target. The output is also a *new performance*, so production details and expressive timing are not carried over.

### 3.6 Exemplar-based style transfer

- **MusicTI** (Li, S. et al., 2024) learns a time-varying pseudo-word from a style example, on a mel-spectrogram diffusion model (Riffusion; Forsgren & Martiros, 2022). On 5 s clips it reports CLAP-based content preservation of 0.46 and style fit of 0.28. In a 72-person study it scored 3.91 / 3.70 / 3.66 for content, style and overall, against 2.81 / 2.70 / 2.83 for MusicGen. **A**
- **Stylus** achieves training-free transfer by injecting the style example's attention keys and values into a frozen image diffusion model (Wang, H. et al., 2024). **C**
- **MusicGen-Style** conditions generation on a 1.5–4.5 s audio excerpt mixed with text (Rouard et al., 2024). **A**

**Appraisal.** These methods show that a *style example* can steer transfer more precisely than text. The evidence again rests on short clips.

### 3.7 Evidence summary

| Method | Backbone / rate | Clips evaluated | Real or generated input | Listening test | Code / weights | Grade |
|---|---|---|---|---|---|---|
| Per-domain AEs (UMTN, TimbreTron) | WaveNet decoders | Short excerpts | Real | Yes | Limited | B |
| RAVE | Own VAE | Domain-specific | Real | — | Yes | C |
| ZETA | AudioLDM 2 | 34 excerpts, 10 s windows | Real | Yes (crowd) | Examples page | A |
| MusicMagus | AudioLDM 2, 16 kHz | 5 s | **Generated** | 26 | Yes | A |
| MelodyFlow | Own DiT, 48 kHz | Not stated | Real (held-out) | Yes (crowd) | Release stated | C |
| Melodia | AudioLDM 2, 16 kHz | 2,015 pairs | Mixed | 77 | Not stated | B |
| MusicTI | Riffusion | 5 s | Real | 72 | Yes | A |
| MuseControlLite | Stable Audio Open | 47 s | Real | 34 | Yes | A |
| ACE-Step 1.5 *Cover* | Own DiT, 48 kHz | Cover not evaluated | — | Arena (generation only) | MIT | D |
| Stable Audio 3 *audio-to-audio* | Own DiT, 44.1 kHz | Not evaluated | — | MOS (generation) | Community licence | D |

Decomposition-based pipelines (keep the vocal stem and regenerate the accompaniment; Donahue et al., 2023; Nistal et al., 2024; stems via Rouard et al., 2023) and the symbolic route (transcribe → transfer in MIDI → re-synthesise; Brunner et al., 2018; Wu & Yang, 2023) are outside the instrumental MVP. They are covered in the extended review.

**Answer to RQ2:** five families exist. The most deployable (partial noising in 2026 open models) has the weakest independent evidence. The best-evidenced methods (inversion, control-conditioned) are tested mainly on short, low-rate clips.

---

## 4. Style embeddings

### 4.1 What a style embedding is

A style embedding is a vector that summarises *how* a piece sounds, ideally independently of *what* is played. It serves five uses: classifying, retrieving, conditioning a generator, steering between styles, and evaluating outputs. The literature offers five families.

### 4.2 Families

**1. Statistics and hand-crafted descriptors.** Feature correlations (Gram matrices) were the first "style" representation in neural style transfer. In audio they capture sound texture rather than musical structure (Grinstein et al., 2018). Descriptors such as tempo, spectral and chroma statistics are interpretable but weak at separating genres on their own.

**2. Supervised classifier embeddings.** The penultimate layer of a genre classifier is a ready-made style space. Essentia's Discogs-EffNet models were trained on 400 Discogs styles, and their model cards warn of over-representation of Western, particularly electronic, music (MTG-UPF, 2026).

**3. Self-supervised music encoders.** These are frozen backbones whose embeddings are evaluated by *probing*: a small classifier is trained on top and the backbone is left unchanged. MARBLE standardises this protocol with frozen features and lightweight task heads, using the "fail-filtered" GTZAN split of 930 tracks for genre (Yuan et al., 2023). Reported GTZAN genre accuracies:

| Encoder | GTZAN accuracy | Protocol | Source |
|---|---|---|---|
| MERT-95M | 78.6 % | MLP probe | Li, Y. et al., 2024 |
| MERT-330M | 79.3 % | MLP probe | Li, Y. et al., 2024 |
| MuQ | 85.5 ± 0.9 % | Linear probe | Zhu et al., 2025 |
| Previous state of the art cited in these papers | 83.5 % | — | — |

Protocols differ between papers (MLP vs linear probes, layer selection), so numbers should not be pooled. They do show that **frozen general-purpose embeddings separate genres well with a very small trained head.**

**4. Joint audio–text embeddings.** CLAP (Wu, Y. et al., 2023) and MuLan (Agostinelli et al., 2023) place audio and text in one space. A text prompt and an audio example can then be compared directly. This underlies both the *CLAP score* metric and the content/style scores used to evaluate MusicTI (Li, S. et al., 2024). Magenta RealTime steers live generation with a weighted average of MusicCoCa embeddings of text and audio prompts, which is effectively style interpolation (Lyria Team, 2025).

**5. Embeddings learned inside generators.** Examples:

- exemplar encoders: MusicGen-Style's quantised audio conditioner (Rouard et al., 2024); the style embedding of a self-supervised VQ-VAE (Cífka et al., 2021); ACE-Step 1.5's reference-audio input;
- *weight-space* style representations: textual-inversion pseudo-words (Gal et al., 2023; Li, S. et al., 2024) and LoRA adapters (§5).

### 4.3 How embeddings are applied

- **Conditioning:** fed to a generator as input.
- **Steering:** interpolated or averaged to blend styles.
- **Selection:** used to rank candidate prompts or presets.
- **Evaluation:** as a classifier probability, an embedding distance, or the basis of distribution metrics (FAD/KAD, §7).

**Answer to RQ3.** A frozen pretrained encoder with a small trained probe is a well-evidenced, inexpensive way to *extract* style embeddings and *quantify* genre membership. Adapters and pseudo-words are the established way to *inject* a learned style into a generator.

**Caveat.** If the same embedding space is used to steer and to evaluate, the evaluation becomes circular. The literature's use of independent metrics (e.g., CLAP alongside listening tests) suggests using two different encoders for these roles.

---

## 5. Genre personalisation by fine-tuning

Parameter-efficient fine-tuning makes it practical to teach a large pretrained generator a new concept from few examples:

- **LoRA** adds low-rank trainable matrices to frozen weights (Hu et al., 2022).
- **DreamBooth** fine-tunes on a handful of subject examples (Ruiz et al., 2023).
- **Textual inversion** learns a new token embedding instead of weights (Gal et al., 2023).

**Music evidence:**

- Plitsis et al. (2024) applied textual inversion and DreamBooth to text-to-music diffusion in a few-shot setting. Similarity metrics agreed with user preferences, and "current personalization approaches tend to learn rhythmic music constructs more easily than melody". This is encouraging for genres, which are largely rhythmic and timbral.
- JEN-1 DreamStyler (Chen, B. et al., 2024) learns a concept from two minutes of reference music. It reports that full fine-tuning overfits and that multiple concepts can conflict, which motivates tuning only selected parameters.
- **Tooling:** Stable Audio 3 publishes LoRA training for its open models, needing "at minimum ~20–50 clips" (Evans et al., 2026; documentation). ACE-Step 1.5 documents LoRA training with an example of 8 songs in about 1 hour on an RTX 3090 using about 12 GB (Gong et al., 2026; documentation).

**Appraisal.** Personalisation is well established for images and promising for music. However, we found **no peer-reviewed evaluation of genre-level adapters used for *audio-to-audio* transfer**. Small datasets also raise overfitting and memorisation risks (§8). A per-genre adapter is therefore a reasonable *trained* style representation, but its benefit over prompting alone must be measured, not assumed.

---

## 6. Preserving content

Four levers recur in the literature:

1. **Limit the corruption.** Lower the noise level or raise the cover strength. This is the realism–faithfulness trade-off (Meng et al., 2022; Andrade & Schlecht, 2026).
2. **Invert and constrain attention.** This preserves structure better than naive noising in authors' comparisons (Manor & Michaeli, 2024; Le Lan et al., 2024; Yang, Y. et al., 2026).
3. **Condition on extracted melody or rhythm.** MuseControlLite reached 61 % melody accuracy at best (Tsai et al., 2025).
4. **Keep stems that carry identity, and regenerate the rest** (Donahue et al., 2023; Nistal et al., 2024).

**Appraisal.** Reported preservation is modest everywhere. Chroma similarity of about 0.7 (Melodia) and melody accuracy of about 60 % mean recognisable but imperfect tunes. Preservation is also multi-faceted: melody, harmony, rhythm, structure and timbre can each survive or not independently (Vishe et al., 2025).

For classical ↔ rock this is concrete. Rock adds drums and a backbeat, and classical removes them, so **rhythm** preservation must be measured separately from **melody** preservation.

**Answer to RQ4:** use the strength lever as the primary, measured variable. Treat stem- and control-based levers as extensions.

---

## 7. Evaluation

### 7.1 What the reviewed papers measure

Evaluations converge on three axes plus cost (Lerch et al., 2025): **target adherence**, **source preservation** and **quality**.

| Metric type | Used by |
|---|---|
| CLAP score (adherence) | Almost all reviewed papers |
| LPAPS (perceptual distance to source) | ZETA, MelodyFlow, Melodia |
| Chroma similarity | MusicMagus, Melodia |
| Melody accuracy | MuseControlLite |
| FAD (realism) | ZETA, MelodyFlow, Melodia |
| Listening tests on relevance, consistency and overall quality, usually 1–5 or 0–100 | All |

### 7.2 Metric choices and their evidence

| Axis | Metric | Evidence and caveats |
|---|---|---|
| Adherence | Genre-probe probability (§4) | Standard probing protocol (Yuan et al., 2023). Use an encoder independent of any steering signal |
| Adherence | CLAP score vs target prompt | Ubiquitous; comparable to the literature |
| Preservation | Chroma similarity; beat/tempo agreement | Chroma used in editing papers. Rhythm needs a separate measure for classical ↔ rock (§6). MuseCPEval provides a multi-facet framework (Vishe et al., 2025) |
| Quality | FAD or **KAD** vs a target-genre reference set | FAD (Kilgour et al., 2019) is sensitive to embedding choice, sample size and reference quality (Gui et al., 2024). KAD is unbiased and converges with fewer samples (Chung et al., 2025), which helps our small test sets |
| Quality | Audiobox Aesthetics | Reference-free predictor of production quality and enjoyment (Tjandra et al., 2025) |
| Human | Listening test on relevance / consistency / overall quality | Mirrors the scales above, so results are comparable. Reported panel sizes range from 14 (Stable Audio 3) to 77 (Melodia) |

### 7.3 Pitfalls

- **Numbers are not comparable across papers.** Clip lengths, sample rates and benchmarks differ.
- **Vendor metrics are not independent.** ACE-Step 1.5's style- and lyric-alignment scores come from its authors' own reward models (Gong et al., 2026).
- **GTZAN has known flaws.** It contains repetitions and mislabellings (Sturm, 2013), so it suits only sanity checks.
- **Single-point results mislead.** Results should be reported as **trade-off curves over the strength parameter**, because any method can win one axis by sacrificing another.

**Answer to RQ5:** a compact protocol of probe probability, CLAP score, chroma and beat agreement, KAD and Audiobox Aesthetics, plus a short listening test, is well grounded in current practice.

---

## 8. Data and ethics

**Data for classical and rock.**

- **Classical:** MusicNet provides 330 freely licensed classical recordings, about 34 h, CC BY 4.0 (Thickstun et al., 2017). Its repertoire is chamber and solo music, so a model trained on it learns chamber rather than orchestral timbres.
- **Rock:** the Free Music Archive has 106,574 tracks in a 161-genre hierarchy including rock, under per-track Creative Commons licences (Defferrard et al., 2017). MTG-Jamendo has more than 55,000 Creative Commons tracks with 195 genre, instrument and mood tags (Bogdanov et al., 2019). Instrumental rock can be selected through tags, or vocals can be removed by source separation (Rouard et al., 2023) at the cost of artefacts.
- **Sanity checks and prompts:** GTZAN (Tzanetakis & Cook, 2002) provides 100 clips per genre for probe checks only. The Song Describer Dataset (1.1k captions of 706 CC-licensed recordings; Manco et al., 2023) supports prompt-adherence tests.

**Ethics.**

- **Licences and data provenance.** ACE-Step 1.5 is MIT-licensed, and its model card cites licensed, royalty-free and synthetic training data. Stable Audio 3 was trained on licensed AudioSparx and Creative Commons Freesound audio under a community licence (Evans et al., 2026). MusicGen weights are non-commercial (Copet et al., 2023).
- **Uploads.** Users will often upload copyrighted recordings, and a transformed recording is a derivative work.
- **Labelling.** EU AI Act Article 50 has required machine-readable marking of synthetic audio since 2 August 2026 (Regulation (EU) 2024/1689). Watermarking tools exist (San Roman et al., 2024).
- **Memorisation.** Small fine-tuning sets raise memorisation risk (Batlle-Roca et al., 2024).
- **Bias.** Genre taxonomies and datasets are Western-centric.
- **Musicians.** The political economy of AI music raises concerns for musicians' livelihoods (Morreale, 2021).

---

## 9. Synthesis: gaps and design implications

### 9.1 Gaps

1. **No benchmark exists for audio genre transfer**, and editing papers evaluate on incompatible sets.
2. **The most deployable tools have the weakest evidence.** For full-bandwidth transfer of real recordings (ACE-Step 1.5 Cover, Stable Audio 3 audio-to-audio), the only evidence is vendor documentation.
3. **Peer-reviewed editing evidence is narrow.** It centres on AudioLDM 2 at 16 kHz, clips of 5–10 s and sometimes generated inputs.
4. **Style embeddings are well studied for classification** but rarely used to *control or select* transfers.
5. **Genre-level adapters for audio-to-audio transfer are unevaluated.**

### 9.2 Implications for our design

1. **Main mechanism.** Use partial-noising transfer in a 2026 open model as the main mechanism, and treat *strength* as the central experimental variable (§3.2, §6).
2. **Autoencoder baseline.** A per-genre mel-spectrogram autoencoder with a shared encoder and a pretrained universal vocoder (BigVGAN or Vocos) is the evidence-backed form of the "autoencoder per genre" idea. Its expected outcome is timbre-level change with strong preservation (§3.1, §2.1).
3. **Style embeddings.** Extract them with frozen encoders (CLAP; MERT or MuQ) plus a small trained genre probe. Use the probe as an adherence metric and to rank presets, with a second encoder for evaluation to avoid circularity (§4).
4. **Trained style representation.** Use per-genre LoRA adapters, and measure them against prompt-only transfer (§5).
5. **Evaluation.** Use real, instrumental, full-bandwidth clips, report trade-off curves, and add a short listening test on standard scales (§7).

Implications 1, 4 and 5 directly address gaps 2, 3 and 5. A carefully evaluated project can therefore add evidence the literature currently lacks.

---

## 10. Conclusion

Changing the genre of a recording has moved from timbre-only autoencoder translation to latent diffusion and flow models. In these models the amount of change is a controllable parameter, and since 2026 open models expose this directly as audio-to-audio and cover modes.

Research on music editing explains why the core difficulty is preservation, and offers inversion, explicit controls and stem-based pipelines to manage it. Its evidence, however, comes mostly from short, low-rate clips.

Style embeddings, from frozen self-supervised encoders to weight-space adapters, give a principled way to represent, inject and measure genre. Because no benchmark for audio genre transfer exists and the most practical tools are vendor-documented, a transparent evaluation is a contribution in itself. That means trade-off curves, independent embedding-based metrics and listening tests on real recordings.

---

## References

*All arXiv identifiers verified via the arXiv API (9 Nov 2026). arXiv:XXXX.XXXXX → https://arxiv.org/abs/XXXX.XXXXX*

**Foundations**
- Goodfellow, I., et al. (2014). Generative adversarial networks. arXiv:1406.2661.
- Hertz, A., et al. (2023). Prompt-to-prompt image editing with cross attention control. *ICLR 2023*. arXiv:2208.01626.
- Ho, J., Jain, A., & Abbeel, P. (2020). Denoising diffusion probabilistic models. *NeurIPS 2020*. arXiv:2006.11239.
- Ho, J., & Salimans, T. (2022). Classifier-free diffusion guidance. arXiv:2207.12598.
- Kingma, D. P., & Welling, M. (2014). Auto-encoding variational Bayes. *ICLR 2014*. arXiv:1312.6114.
- Kulikov, V., Kleiner, M., Huberman-Spiegelglas, I., & Michaeli, T. (2025). FlowEdit: Inversion-free text-based editing using pre-trained flow models. *ICCV 2025*. arXiv:2412.08629.
- Lipman, Y., et al. (2023). Flow matching for generative modeling. *ICLR 2023*. arXiv:2210.02747.
- Meng, C., et al. (2022). SDEdit: Guided image synthesis and editing with stochastic differential equations. *ICLR 2022*. arXiv:2108.01073.
- Peebles, W., & Xie, S. (2023). Scalable diffusion models with transformers. *ICCV 2023*. arXiv:2212.09748.
- Rombach, R., et al. (2022). High-resolution image synthesis with latent diffusion models. *CVPR 2022*. arXiv:2112.10752.
- Song, J., Meng, C., & Ermon, S. (2021). Denoising diffusion implicit models. *ICLR 2021*. arXiv:2010.02502.
- Zhu, J.-Y., Park, T., Isola, P., & Efros, A. A. (2017). Unpaired image-to-image translation using cycle-consistent adversarial networks. *ICCV 2017*. arXiv:1703.10593.

**Personalisation**
- Chen, B., Li, P., Yao, Y., et al. (2024). JEN-1 DreamStyler: Customized musical concept learning via pivotal parameters tuning. arXiv:2406.12292.
- Gal, R., et al. (2023). An image is worth one word: Personalizing text-to-image generation using textual inversion. *ICLR 2023*. arXiv:2208.01618.
- Hu, E. J., et al. (2022). LoRA: Low-rank adaptation of large language models. *ICLR 2022*. arXiv:2106.09685.
- Plitsis, M., Kouzelis, T., Paraskevopoulos, G., et al. (2024). Investigating personalization methods in text to music generation. *ICASSP 2024*. arXiv:2309.11140.
- Ruiz, N., et al. (2023). DreamBooth: Fine tuning text-to-image diffusion models for subject-driven generation. *CVPR 2023*. arXiv:2208.12242.

**Audio representations and vocoders**
- Défossez, A., Copet, J., Synnaeve, G., & Adi, Y. (2022). High fidelity neural audio compression (EnCodec). arXiv:2210.13438.
- Kong, J., Kim, J., & Bae, J. (2020). HiFi-GAN: Generative adversarial networks for efficient and high fidelity speech synthesis. *NeurIPS 2020*. arXiv:2010.05646.
- Lee, S., Ping, W., Ginsburg, B., et al. (2023). BigVGAN: A universal neural vocoder with large-scale training. *ICLR 2023*. arXiv:2206.04658. Code: https://github.com/NVIDIA/BigVGAN
- Parker, J. D., Evans, Z., Carr, C. J., Zukowski, Z., Taylor, J., Rice, M., & Pons, J. (2026). SAME: A semantically-aligned music autoencoder. arXiv:2605.18613.
- Siuzdak, H. (2023). Vocos: Closing the gap between time-domain and Fourier-based neural vocoders for high-quality audio synthesis. arXiv:2306.00814.

**Music generation models**
- Agostinelli, A., et al. (2023). MusicLM: Generating music from text (incl. MuLan conditioning and MusicCaps). arXiv:2301.11325.
- Copet, J., et al. (2023). Simple and controllable music generation (MusicGen). *NeurIPS 2023*. arXiv:2306.05284.
- Dong, H.-W., Hsiao, W.-Y., Yang, L.-C., & Yang, Y.-H. (2018). MuseGAN: Multi-track sequential generative adversarial networks for symbolic music generation and accompaniment. *AAAI 2018*. arXiv:1709.06298.
- Evans, Z., et al. (2024). Long-form music generation with latent diffusion. *ISMIR 2024*. arXiv:2404.10301.
- Evans, Z., Parker, J. D., Carr, C. J., Zukowski, Z., Taylor, J., & Pons, J. (2025). Stable Audio Open. *ICASSP 2025*. arXiv:2407.14358.
- Evans, Z., Parker, J. D., Rice, M., Carr, C. J., Zukowski, Z., Taylor, J., & Pons, J. (2026). Stable Audio 3. arXiv:2605.17991. Library and docs: https://github.com/Stability-AI/stable-audio-3
- Forsgren, S., & Martiros, H. (2022). Riffusion: Stable diffusion for real-time music generation. https://riffusion.com
- Gong, J., Song, Y., Zhao, W., Wang, S., Xu, S., Guo, J., & Yang, X. (2026). ACE-Step 1.5: Pushing the boundaries of open-source music generation. arXiv:2602.00744. Code and docs: https://github.com/ace-step/ACE-Step-1.5
- Huang, C.-Z. A., et al. (2019). Music Transformer. *ICLR 2019*. arXiv:1809.04281.
- Liu, H., et al. (2023). AudioLDM 2: Learning holistic audio generation with self-supervised pretraining. *IEEE/ACM TASLP*. arXiv:2308.05734.
- Lyria Team, Caillon, A., McWilliams, B., et al. (2025). Live music models (Magenta RealTime). arXiv:2508.04651.
- Roberts, A., Engel, J., Raffel, C., Hawthorne, C., & Eck, D. (2018). A hierarchical latent vector model for learning long-term structure in music (MusicVAE). *ICML 2018*. arXiv:1803.05428.

**Style and timbre transfer**
- Andrade, C., & Schlecht, S. J. (2026). Audio-to-audio via diffusion warm initialization. arXiv:2606.18968.
- Caillon, A., & Esling, P. (2021). RAVE: A variational autoencoder for fast and high-quality neural audio synthesis. arXiv:2111.05011.
- Cífka, O., Ozerov, A., Şimşekli, U., & Richard, G. (2021). Self-supervised VQ-VAE for one-shot music style transfer. *ICASSP 2021*. arXiv:2102.05749.
- Dai, S., Zhang, Z., & Xia, G. G. (2018). Music style transfer: A position paper. *MUME 2018*. arXiv:1803.06841.
- Grinstein, E., Duong, N. Q. K., Ozerov, A., & Pérez, P. (2018). Audio style transfer. *ICASSP 2018*. arXiv:1710.11385.
- Huang, S., Li, Q., Anil, C., Bao, X., Oore, S., & Grosse, R. B. (2019). TimbreTron: A WaveNet(CycleGAN(CQT(Audio))) pipeline for musical timbre transfer. *ICLR 2019*. arXiv:1811.09620.
- Li, S., et al. (2024). Music style transfer with time-varying inversion of diffusion models (MusicTI). *AAAI 2024*. arXiv:2402.13763.
- Lu, C.-Y., Xue, M.-X., Chang, C.-C., Lee, C.-R., & Su, L. (2019). Play as you like: Timbre-enhanced multi-modal music style transfer. *AAAI 2019*. arXiv:1811.12214.
- Mor, N., Wolf, L., Polyak, A., & Taigman, Y. (2019). A universal music translation network. *ICLR 2019*. arXiv:1805.07848.
- Pasini, M. (2019). MelGAN-VC: Voice conversion and audio style transfer on arbitrarily long samples using spectrograms. arXiv:1910.03713.
- Wang, H., et al. (2024). Repurposing image diffusion models for training-free music style transfer on mel-spectrograms (Stylus). Accepted to *ICIP 2026*. arXiv:2411.15913.

**Music editing**
- Boudaghi, A., & Zare, H. (2025). MusRec: Zero-shot text-to-music editing via rectified flow and diffusion transformers. arXiv:2511.04376.
- Fu, Z., et al. (2026). EchoEdit: Stabilizing inversion-free audio editing via optimal transport geometry. arXiv:2606.15149.
- Le Lan, G., et al. (2024). High fidelity text-guided music editing via single-stage flow matching (MelodyFlow). arXiv:2407.03648.
- Manor, H., & Michaeli, T. (2024). Zero-shot unsupervised and text-based audio editing using DDPM inversion. *ICML 2024*. arXiv:2402.10009.
- Pan, C., et al. (2026). Audio editing in the era of foundation models: A survey. arXiv:2606.23139.
- Yang, Y., et al. (2026). Melodia: Training-free music editing guided by attention probing in diffusion models. *AAAI 2026*. arXiv:2511.08252.
- Zhang, Y., Ikemiya, Y., Xia, G., et al. (2024). MusicMagus: Zero-shot text-to-music editing via diffusion models. *IJCAI 2024*. arXiv:2402.06178.

**Controllable generation**
- Rouard, S., Adi, Y., Copet, J., et al. (2024). Audio conditioning for music generation via discrete bottleneck features (MusicGen-Style). *ISMIR 2024*. arXiv:2407.12563.
- Tal, O., et al. (2024). Joint audio and symbolic conditioning for temporally controlled text-to-music generation (JASCO). arXiv:2406.10970.
- Tsai, F.-D., et al. (2025). MuseControlLite: Multifunctional music generation with lightweight conditioners. *ICML 2025*. arXiv:2506.18729.
- Wu, S.-L., Donahue, C., Watanabe, S., & Bryan, N. J. (2024). Music ControlNet: Multiple time-varying controls for music generation. *IEEE/ACM TASLP*. arXiv:2311.07069.

**Decomposition, accompaniment and symbolic routes**
- Brunner, G., Wang, Y., Wattenhofer, R., & Zhao, S. (2018). Symbolic music genre transfer with CycleGAN. *ICTAI 2018*. arXiv:1809.07575.
- Donahue, C., et al. (2023). SingSong: Generating musical accompaniments from singing. arXiv:2301.12662.
- Nistal, J., Pasini, M., Aouameur, C., et al. (2024). Diff-A-Riff: Musical accompaniment co-creation via latent diffusion models. *ISMIR 2024*. arXiv:2406.08384.
- Rouard, S., Massa, F., & Défossez, A. (2023). Hybrid transformers for music source separation (HT-Demucs). *ICASSP 2023*. arXiv:2211.08553.
- Wu, S.-L., & Yang, Y.-H. (2023). MuseMorphose: Full-song and fine-grained piano music style transfer with one Transformer VAE. *IEEE/ACM TASLP*, 31. arXiv:2105.04090.

**Embeddings and probing**
- Li, Y., et al. (2024). MERT: Acoustic music understanding model with large-scale self-supervised training. *ICLR 2024*. arXiv:2306.00107.
- MTG-UPF. (2026). Essentia models (Discogs-EffNet, MAEST). https://essentia.upf.edu/models.html
- Wu, Y., et al. (2023). Large-scale contrastive language-audio pretraining with feature fusion and keyword-to-caption augmentation (LAION-CLAP). *ICASSP 2023*. arXiv:2211.06687.
- Yuan, R., et al. (2023). MARBLE: Music audio representation benchmark for universal evaluation. *NeurIPS 2023 Datasets and Benchmarks*. arXiv:2306.10548.
- Zhu, H., et al. (2025). MuQ: Self-supervised music representation learning with mel residual vector quantization. arXiv:2501.01108.

**Evaluation**
- Chung, Y., et al. (2025). KAD: No more FAD! An effective and efficient evaluation metric for audio generation. arXiv:2502.15602.
- Gui, A., Gamper, H., Braun, S., & Emmanouilidou, D. (2024). Adapting Fréchet audio distance for generative music evaluation. *ICASSP 2024*. arXiv:2311.01616.
- Kilgour, K., Zuluaga, M., Roblek, D., & Sharifi, M. (2019). Fréchet audio distance. *Interspeech 2019*. arXiv:1812.08466.
- Lerch, A., Arthur, C., Bryan-Kinns, N., Ford, C., Sun, Q., & Vinay, A. (2025). Survey on the evaluation of generative models in music. arXiv:2506.05104 (accepted to *ACM Computing Surveys*).
- Sturm, B. L. (2013). The GTZAN dataset: Its contents, its faults, their effects on evaluation, and its future use. arXiv:1306.1461.
- Tjandra, A., et al. (2025). Meta Audiobox Aesthetics: Unified automatic quality assessment for speech, music, and sound. arXiv:2502.05139.
- Vishe, Y., et al. (2025). Evaluating music context preservation: A multi-facet framework for music editing systems. Accepted to *ISMIR 2026*. arXiv:2512.14629.

**Tools**
- Abid, A., et al. (2019). Gradio: Hassle-free sharing and testing of ML models in the wild. *ICML 2019 HILL Workshop*. arXiv:1906.02569.
- Foscarin, F., Schlüter, J., & Widmer, G. (2024). Beat this! Accurate beat tracking without DBN postprocessing. *ISMIR 2024*. arXiv:2407.21658.

**Data**
- Bogdanov, D., Won, M., Tovstogan, P., Porter, A., & Serra, X. (2019). The MTG-Jamendo dataset for automatic music tagging. *ICML 2019 Workshop on Machine Learning for Music Discovery*.
- Defferrard, M., Benzi, K., Vandergheynst, P., & Bresson, X. (2017). FMA: A dataset for music analysis. *ISMIR 2017*. arXiv:1612.01840.
- Manco, I., et al. (2023). The Song Describer Dataset: A corpus of audio captions for music-and-language evaluation. *NeurIPS 2023 ML for Audio Workshop*. arXiv:2311.10057.
- Thickstun, J., Harchaoui, Z., & Kakade, S. (2017). Learning features of music from scratch (MusicNet). *ICLR 2017*. arXiv:1611.09827.
- Tzanetakis, G., & Cook, P. (2002). Musical genre classification of audio signals. *IEEE Transactions on Speech and Audio Processing*, 10(5).

**Ethics and provenance**
- Batlle-Roca, R., Liao, W.-H., Serra, X., Mitsufuji, Y., & Gómez, E. (2024). Towards assessing data replication in music generation with music similarity metrics on raw audio. *ISMIR 2024*.
- European Parliament & Council. (2024). Regulation (EU) 2024/1689 (AI Act), Article 50.
- Morreale, F. (2021). Where does the buck stop? Ethical and political issues with AI in music creation. *Transactions of ISMIR*, 4(1), 105–113.
- San Roman, R., et al. (2024). Proactive detection of voice cloning with localized watermarking (AudioSeal). *ICML 2024*. arXiv:2401.17264.

---

## Appendix A: Models and tools

*Facts are from official repositories and documentation (accessed 9 Nov 2026). Hardware figures are the vendors' and must be confirmed on our machine (RTX 3080, 10 GB).*

| Model / tool | Licence | Transfer entry point | Hardware notes |
|---|---|---|---|
| **ACE-Step 1.5** (≈2B DiT; turbo = 8 steps) | MIT | *Cover*: `audio_cover_strength` 0–1 (0.2 suggested for style transfer); reference audio; LoRA training | DiT-only ≥4 GB; 8–16 GB tier runs the 2B model. LoRA example ≈12 GB (8 GB possible but slow, per community reports). <10 s per song on an RTX 3090 |
| **Stable Audio 3** Small (459M) / Medium (1.4B) | Stability AI Community Licence | *Audio-to-audio*: `init_audio`, `init_noise_level` 0–1; inpainting; LoRA (≥20–50 clips) | Small runs on CPU. Medium ≈6.5 GB peak and needs FlashAttention (hard to install on Windows) |
| **Stable Audio Open 1.0** | Community Licence | `init_audio` / `init_noise_level` (stable-audio-tools) | ≤47 s; fallback |
| **Vocoders** BigVGAN v2 / Vocos | MIT / MIT | Mel → audio for the AE baseline | BigVGAN v2 has 44 kHz checkpoints |
| **Encoders** LAION-CLAP, MERT, MuQ | Open | Style embeddings, probe, CLAP score | Inference only |
| **Separation** HT-Demucs | MIT | Vocal removal for rock data | — |
| **Evaluation** fadtk (FAD), KAD, Audiobox Aesthetics, librosa / mir_eval | Open | §7 metrics | — |

## Appendix B: Data for classical and rock

| Use | Classical | Rock |
|---|---|---|
| Probe / AE / LoRA training | MusicNet audio (≈34 h; CC BY 4.0; chamber/solo) | FMA rock sub-genres or MTG-Jamendo rock tag (CC); instrumental or vocals removed |
| Evaluation set (≈20–50 × 30 s per genre, held out by recording) | MusicNet test split recordings | Held-out FMA/Jamendo tracks |
| Probe sanity check | GTZAN classical (100 clips) | GTZAN rock (100 clips) |
| Prompt tests | Song Describer (CC) | Song Describer (CC) |

## Appendix C: Search and verification log

| Date | Action |
|---|---|
| 4 Nov 2026 | v1 (symbolic-focused) review; ≈100 sources |
| 9 Nov 2026 | v2 extended review (audio-first, 157 references); three arXiv API verification batches (≈110 IDs) |
| 9 Nov 2026 | v3: re-read the experiment sections of ZETA, MusicMagus, MelodyFlow, Melodia, MusicTI, MuseControlLite (arXiv HTML) for the evidence table; MERT, MuQ and MARBLE for probing evidence; BigVGAN, HiFi-GAN and Vocos for vocoder evidence. Verified the new arXiv IDs (vocoders, MARBLE, personalisation). Checked the Song Describer and MTG-Jamendo counts, Louie et al. (CHI 2020) via the authors' page, and ACE-Step LoRA memory reports. Removed an unverifiable claim about a commercial "cover" feature |
| 9 Nov 2026 | v3.1: added the brief-compliance table (§1.5), symbolic generation background (MuseGAN, MusicVAE, Music Transformer) and the key tools and libraries section (§2.4). All new arXiv IDs had already been verified in the v1/v2 batches |
