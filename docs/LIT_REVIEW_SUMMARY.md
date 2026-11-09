# Literature Review: Team Summary

**Quick reference for [LITERATURE_REVIEW.md](LITERATURE_REVIEW.md) (v3, the short review)** · 9 November 2026

> Use this page day to day. "→ SR §x" points to the short review (the main deliverable). "→ LR §x" points to the [extended evidence version](LITERATURE_REVIEW_Extended.md). The plan and decisions are in [PLANNING_SUMMARY.md](PLANNING_SUMMARY.md).
>
> **Current scope:** instrumental clips (~30 s), **Classical ↔ Rock** first, Pop later. Main model **ACE-Step 1.5 Cover**. Trained models (all must-haves): **M1 mel-spectrogram autoencoder + vocoder**, **M2 LoRA per genre**, **M3 genre / style-embedding probe**. The demo site lives in `site/`.

---

## 1. The 10 things to know

1. **"Genre" = timbre + composition + performance.** Most audio methods mainly change **timbre**. → SR §1.2
2. **Strength is everything.** A stronger genre change means less of the melody, rhythm and form survives. Every method has this knob. → SR §3.2, §6
3. **The practical tools are new and vendor-documented.** ACE-Step 1.5 *Cover* and Stable Audio 3 *audio-to-audio* work on real, full-quality audio, but nobody has independently evaluated them for genre transfer (evidence grade **D**). Testing them properly is part of *our* contribution. → SR §3.2, §3.7
4. **Peer-reviewed editing research is narrow.** It mostly uses AudioLDM 2 at 16 kHz, 5–10 s clips, and sometimes generated input. Gains are modest (e.g., MelodyFlow 2.68 vs 2.39 out of 5). → SR §3.3
5. **Melody control isn't perfect.** The best reported melody accuracy is **61 %** (MuseControlLite). → SR §3.5
6. **Autoencoder per genre = timbre change.** Build it cheaply as a mel-spectrogram autoencoder with a music-capable vocoder (BigVGAN v2 / Vocos), not RAVE (days to weeks of training). → SR §3.1
7. **Style embeddings come cheap.** Frozen music encoders + a small classifier separate genres well (GTZAN: MERT ≈79 %, MuQ ≈85 %). This is our "style embedding" deliverable. → SR §4
8. **LoRA per genre is promising but unproven** for audio-to-audio. One study found personalisation learns **rhythm more easily than melody**, which suits genre. → SR §5
9. **Evaluate with a curve, not a number.** Plot genre match vs recognisability across strengths, using ~5 metrics + a listening test. → SR §7
10. **No benchmark exists** for audio genre transfer, so a careful evaluation on real instrumental clips adds evidence the field lacks. → SR §9

---

## 2. Mini-glossary

| Term | Meaning |
|---|---|
| **Latent** | Compressed version of audio that models work on |
| **Autoencoder / VAE** | Network that compresses (encoder) and rebuilds (decoder) audio |
| **Mel-spectrogram** | Image-like time × frequency picture of audio |
| **Vocoder** | Turns a mel-spectrogram back into audio (BigVGAN, Vocos; HiFi-GAN is speech-only) |
| **Diffusion / flow model** | Turns noise into audio step by step; the noise level controls how much of an input is kept |
| **SDEdit / audio-to-audio / Cover** | Add some noise to *your* clip, then regenerate it with a new prompt |
| **Inversion** | Find the noise that exactly recreates your clip, then regenerate it (better structure; slower) |
| **Style embedding** | Vector describing *how* music sounds (genre, timbre), ideally not *what* is played |
| **Probe** | Small classifier trained on top of a frozen encoder's embeddings |
| **LoRA** | Small trainable add-on that teaches a big model a new style |
| **CLAP score** | How well audio matches a text prompt |
| **FAD / KAD** | Distance between generated and real audio collections (KAD works better with few samples) |
| **Chroma** | 12 pitch-class energies over time; a proxy for melody and harmony |

---

## 3. How the models work → SR §2

```
audio ─► AUTOENCODER (compress) ─► latents ─► DIFFUSION/FLOW TRANSFORMER ─► latents ─► DECODER ─► audio
                                                    ▲
                           text prompt · style example · BPM/key · strength (noise level)
```

- **2026 open models have converged** on latent diffusion transformers with flow objectives, distilled to about 8 steps (ACE-Step 1.5, Stable Audio 3).
- **Older and simpler alternative:** a mel-spectrogram model + vocoder. This is what our Track B uses.

---

## 4. Techniques and how good the evidence is → SR §3

| Family | Idea | Best evidence | Weakness | Grade | Our use |
|---|---|---|---|---|---|
| **Per-genre autoencoder** | Encode, then decode with the target genre's decoder | UMTN, TimbreTron, Play as You Like | Timbre only | B–C | **Track B baseline** (mel-AE + vocoder) |
| **Partial noising (Cover / audio-to-audio)** | Noise the clip, regenerate with the prompt | Vendor docs; the trade-off is measured for timbre transfer (Andrade & Schlecht 2026) | One global knob; no independent evaluation | **D** | **Track A main** |
| **Inversion editing** | Recreate the noise, regenerate with attention control | ZETA, MusicMagus, Melodia, MelodyFlow | 16 kHz, short clips, modest gains | A–C | Background / comparison |
| **Inversion-free** | Edit by differences between predictions | EchoEdit, FlowEdit | New preprints | C | Watch |
| **Melody-conditioned** | Regenerate around the extracted melody | MuseControlLite 61 % melody accuracy | New performance; imperfect melody | A | Stretch baseline |
| **Style from an example** | Learn the style from a clip | MusicTI (72 listeners), MusicGen-Style | Short clips | A | Background |
| **Keep vocals + regenerate** | Separate stems, new accompaniment | SingSong, Diff-A-Riff | Alignment, artefacts | A–C | Stretch (vocals) |

**Grades:** A = peer-reviewed + code · B = peer-reviewed · C = preprint · D = vendor documentation only.

---

## 5. Style embeddings (brief requirement) → SR §4

| Family | Example | Use for us |
|---|---|---|
| Classifier embeddings | Essentia Discogs-EffNet (400 styles; Western bias) | Optional reference |
| Self-supervised encoders | **MERT** (GTZAN 78.6–79.3 %), **MuQ** (85.5 %) | **Probe input** |
| Audio–text embeddings | **LAION-CLAP**, MuLan, MusicCoCa | **Probe input** + CLAP score |
| Exemplar encoders | MusicGen-Style, VQ-VAE style codes, ACE-Step reference audio | Background |
| Weight-space style | Textual inversion, **LoRA** | **Per-genre adapters** |

**Our recipe:** frozen encoder → embeddings → small genre classifier.

- **Outputs:** (1) style embeddings + a t-SNE/UMAP plot, (2) a genre-adherence metric, (3) ranking of presets.
- ⚠ **Use a different encoder for judging than for steering**, to avoid circular evaluation.
- Numbers from different papers use different probing protocols, so don't compare them directly.

---

## 6. Models and tools → SR Appendix A

| Model / tool | Licence | Key setting | On our RTX 3080 (vendor figures; *measure!*) |
|---|---|---|---|
| **ACE-Step 1.5** Cover | MIT | `audio_cover_strength` 0–1 (0.2 suggested for style transfer) | DiT-only ≥4 GB; 2B model in the 8–16 GB tier. LoRA example ≈12 GB → use a teammate's GPU |
| **Stable Audio 3** audio-to-audio | Stability Community | `init_noise_level` 0–1 (0.1 close, 0.5 halfway, 1.0 = ignore input) | Medium ≈6.5 GB but needs FlashAttention; Small on CPU. LoRA ≥20–50 clips |
| **BigVGAN v2 / Vocos** | MIT | 44 kHz vocoder (BigVGAN v2) | Fine |
| **LAION-CLAP, MERT, MuQ** | Open | Embeddings | Fine |
| **HT-Demucs** | MIT | Remove vocals from rock tracks | Fine |
| **fadtk / KAD, Audiobox Aesthetics, librosa, mir_eval** | Open | Metrics | Fine |

---

## 7. Keeping the piece recognisable → SR §6

| Lever | Use in MVP? |
|---|---|
| 1. Strength (noise level / cover strength) | ✅ main experimental variable |
| 2. Inversion + attention control | ❌ (comparison only) |
| 3. Melody conditioning | ❌ (stretch) |
| 4. Keep stems (e.g., vocals) | ❌ (stretch, for Pop) |

⚠ Classical ↔ rock **adds or removes drums**, so measure **rhythm** separately from **melody**.

---

## 8. Evaluation cheat sheet → SR §7

| Question | Metric | Tool |
|---|---|---|
| Target genre? | Probe probability; CLAP score | Our probe; LAION-CLAP |
| Same piece? | Chroma similarity; beat/tempo agreement | librosa; Beat This! / madmom + mir_eval |
| Good audio? | KAD vs real target-genre clips; Audiobox Aesthetics | fadtk/KAD; Meta Audiobox Aesthetics |
| Practical? | Seconds per 30 s clip; peak VRAM | Our timing code |

**Listening test:**

- 1–5 ratings for genre match, recognisability and quality;
- ≥15 listeners; blind and random order (reported panels range from 14 to 77).

**Pitfalls:**

- Numbers aren't comparable across papers.
- Vendor scores aren't independent.
- GTZAN has errors; use it only for sanity checks.

---

## 9. Data (classical + rock) → SR §8, Appendix B

| Use | Classical | Rock |
|---|---|---|
| Training (probe / AE / LoRA) | **MusicNet** audio (~34 h, CC BY 4.0; chamber/solo timbre!) | **FMA** rock / **MTG-Jamendo** rock (CC); instrumental, or vocals removed with Demucs |
| Evaluation (20–50 × 30 s, held out) | MusicNet held-out recordings | Held-out FMA/Jamendo tracks |
| Sanity check | GTZAN classical | GTZAN rock |

Keep a **licence log**. Don't train on evaluation recordings.

---

## 10. Ethics checklist → SR §8

- [ ] Model licence table: ACE-Step MIT · Stability Community · MusicGen non-commercial.
- [ ] Training-data provenance: SA3 uses licensed AudioSparx + CC Freesound; ACE-Step cites licensed, royalty-free and synthetic data.
- [ ] Uploads are usually copyrighted, so transformed versions are derivative works. Demo with our own or CC music.
- [ ] EU AI Act Art. 50: label outputs as **AI-generated**.
- [ ] Small fine-tuning sets → check for memorisation.
- [ ] Genre labels and datasets are Western-centric.

---

## 11. If you only read 12 sources

| # | Source | Why |
|---|---|---|
| 1 | Dai, Zhang & Xia (2018), [arXiv:1803.06841](https://arxiv.org/abs/1803.06841) | What "style" means |
| 2 | Gong et al. (2026), ACE-Step 1.5, [arXiv:2602.00744](https://arxiv.org/abs/2602.00744) | Our main model |
| 3 | Evans et al. (2026), Stable Audio 3, [arXiv:2605.17991](https://arxiv.org/abs/2605.17991) | Backup model |
| 4 | Meng et al. (2022), SDEdit, [arXiv:2108.01073](https://arxiv.org/abs/2108.01073) | The idea behind Cover / audio-to-audio |
| 5 | Mor et al. (2019), Universal Music Translation Network, [arXiv:1805.07848](https://arxiv.org/abs/1805.07848) | "One decoder per genre" design |
| 6 | Lee et al. (2023), BigVGAN, [arXiv:2206.04658](https://arxiv.org/abs/2206.04658) | Vocoder for the mel-AE |
| 7 | Manor & Michaeli (2024), ZETA, [arXiv:2402.10009](https://arxiv.org/abs/2402.10009) | Inversion editing of real music |
| 8 | Tsai et al. (2025), MuseControlLite, [arXiv:2506.18729](https://arxiv.org/abs/2506.18729) | Melody control evidence |
| 9 | Li, Y. et al. (2024), MERT, [arXiv:2306.00107](https://arxiv.org/abs/2306.00107) | Encoder for the style probe |
| 10 | Plitsis et al. (2024), music personalisation, [arXiv:2309.11140](https://arxiv.org/abs/2309.11140) | Evidence for LoRA/DreamBooth on music |
| 11 | Vishe et al. (2025), MuseCPEval, [arXiv:2512.14629](https://arxiv.org/abs/2512.14629) | Measuring "same piece" |
| 12 | Lerch et al. (2025), evaluation survey, [arXiv:2506.05104](https://arxiv.org/abs/2506.05104) | Evaluation best practice |

---

## 12. Where to find what

| Topic | Short review | Extended review |
|---|---|---|
| Research questions | SR §1.3 | LR §1.2 |
| Architectures | SR §2 | LR §2 |
| Techniques + evidence table | SR §3 (table §3.7) | LR §3 |
| Style embeddings | SR §4 | LR §3.8 |
| Fine-tuning / LoRA | SR §5 | LR §3.8 |
| Preservation | SR §6 | LR §4 |
| Evaluation | SR §7 | LR §7 |
| Data & ethics | SR §8 | LR §8, §11 |
| Decomposition tools, web-app patterns | — | LR §5, §10 |
| Gaps and design implications | SR §9 | LR §12 |
