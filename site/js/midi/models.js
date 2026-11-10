/* Pretrained Magenta.js models used by the arranger at the Bold preset
   (https://github.com/magenta/magenta-js, Apache-2.0). Loaded only when needed.
     chorale – Coconet (Bach chorales): the melody becomes the soprano, the model writes
               alto, tenor and bass (4-bar chunks of 16th notes).
     fills   – DrumsRNN (drum_kit_rnn): continues two bars of the genre's pattern;
               the continuation is used as the last bar of each 4-bar phrase.
     groove  – GrooVAE (groovae_2bar_humanize): adds human timing and dynamics to the
               genre's 2-bar pattern.
     improv  – ImprovRNN (chord_pitches_improv): melodic answers in the gaps of the
               melody, conditioned on the detected chords.
   Every part is converted to beat positions on the song's grid. A failure returns
   null, and the arranger falls back to its rule-based part. */
(function () {
  'use strict';

  const MM_URL = 'https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1/dist/magentamusic.min.js';
  const CK = 'https://storage.googleapis.com/magentadata/js/checkpoints/';
  const URLS = {
    coconet: CK + 'coconet/bach',
    drums: CK + 'music_rnn/drum_kit_rnn',
    groove: CK + 'music_vae/groovae_2bar_humanize',
    improv: CK + 'music_rnn/chord_pitches_improv',
  };
  const KIND_TO_PITCH = { kick: 36, snare: 38, rim: 37, clap: 39, hat: 42, pedal: 44, ohat: 46, crash: 49, ride: 51, tom1: 50, tom2: 47, tom3: 43 };
  function pitchToKind(p) {
    if (p === 35 || p === 36) return 'kick';
    if (p === 37) return 'rim';
    if (p === 39) return 'clap';
    if ([38, 40, 27, 28, 31, 32, 33, 34].includes(p)) return 'snare';
    if ([42, 44].includes(p)) return 'hat';
    if (p === 46) return 'ohat';
    if ([49, 52, 55, 57].includes(p)) return 'crash';
    if ([51, 53, 59].includes(p)) return 'ride';
    if ([50, 48].includes(p)) return 'tom1';
    if ([47, 45].includes(p)) return 'tom2';
    if ([43, 41].includes(p)) return 'tom3';
    return 'hat';
  }

  let mmPromise = null;
  const models = {};

  function loadMagenta() {
    if (window.mm) return Promise.resolve(window.mm);
    if (mmPromise) return mmPromise;
    mmPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = MM_URL;
      s.async = true;
      s.onload = () => (window.mm ? resolve(window.mm) : reject(new Error('Magenta did not load')));
      s.onerror = () => reject(new Error('Could not load Magenta.js'));
      document.head.appendChild(s);
    }).then((mm) => {
      try { mm.logging.setVerbosity(mm.logging.Level.WARN); } catch (e) { /* older builds */ }
      return mm;
    });
    mmPromise.catch(() => { mmPromise = null; });
    return mmPromise;
  }

  async function model(name) {
    const mm = await loadMagenta();
    if (!models[name]) {
      const m = name === 'coconet' ? new mm.Coconet(URLS.coconet)
        : name === 'groove' ? new mm.MusicVAE(URLS.groove)
          : new mm.MusicRNN(URLS[name]);
      models[name] = m.initialize().then(() => m);
      models[name].catch(() => { delete models[name]; });
    }
    return models[name];
  }

  /* ---------- helpers ---------- */
  function quantizedSeq(mm, notes, totalSteps, extra) {
    return mm.NoteSequence.create(Object.assign({
      notes,
      totalQuantizedSteps: totalSteps,
      quantizationInfo: { stepsPerQuarter: 4 },
    }, extra || {}));
  }
  /* Melody on a 16th grid from bar `firstBar`: one pitch per step (null = rest). */
  function melodySteps(A) {
    const b0 = A.grid.bar(A.firstBar);
    const total = Math.ceil((A.posEnd - b0) * 4);
    const steps = new Array(total).fill(null);
    A.melody({ quantize: 1 }).forEach((n) => {
      const s0 = Math.round((n.b - b0) * 4), s1 = Math.max(s0 + 1, Math.round((n.b + n.len - b0) * 4));
      for (let s = Math.max(0, s0); s < Math.min(total, s1); s++) steps[s] = { p: n.p, start: s === s0 };
    });
    return { b0, total, steps };
  }
  function stepsToNotes(steps) {
    const notes = [];
    let cur = null;
    steps.forEach((x, s) => {
      if (x && cur && cur.p === x.p && !x.start) { cur.s1 = s + 1; return; }
      cur = x ? { p: x.p, s0: s, s1: s + 1 } : null;
      if (cur) notes.push(cur);
    });
    return notes;
  }
  function patternSeq(mm, pattern, bars) {
    const notes = [];
    for (let k = 0; k < bars; k++) {
      pattern.forEach(([s, kind, v]) => notes.push({
        pitch: KIND_TO_PITCH[kind] || 42,
        quantizedStartStep: k * 16 + s,
        quantizedEndStep: k * 16 + s + 1,
        velocity: Math.round(v * 110) + 10,
        isDrum: true,
      }));
    }
    return quantizedSeq(mm, notes, bars * 16);
  }
  const chordName = (c) => c.name; // e.g. "C", "F#m", "Bb" (parsed by Magenta's chord encoder)

  /* ---------- parts ---------- */
  async function chorale(A, onStep) {
    const mm = await loadMagenta();
    const coconet = await model('coconet');
    const { b0, total, steps } = melodySteps(A);
    const pitches = steps.filter(Boolean).map((x) => x.p).sort((a, b) => a - b);
    if (!pitches.length) return null;
    const med = pitches[Math.floor(pitches.length / 2)];
    const shift = 12 * Math.round((70 - med) / 12); // soprano around A4
    const CHUNK = 64;
    const voices = [[], [], [], []];
    const chunks = Math.ceil(total / CHUNK);
    for (let c = 0; c < chunks; c++) {
      const from = c * CHUNK, len = Math.min(CHUNK, total - from);
      const part = steps.slice(from, from + len).map((x) => x && { p: Math.min(81, Math.max(60, root12(x.p + shift))), start: x.start });
      const mel = stepsToNotes(part);
      if (mel.length && len >= 8) {
        const seq = quantizedSeq(mm, mel.map((n) => ({ pitch: n.p, instrument: 0, quantizedStartStep: n.s0, quantizedEndStep: n.s1 })), len);
        const out = await coconet.infill(seq, { temperature: 0.99, numIterations: 48 });
        const perVoice = [[], [], [], []].map(() => new Array(len).fill(null));
        out.notes.forEach((n) => { if (n.instrument >= 0 && n.instrument < 4) perVoice[n.instrument][n.quantizedStartStep] = { p: n.pitch, start: false }; });
        // Keep the given melody as the soprano (with its own note starts).
        perVoice[0] = part.map((x, s) => x || perVoice[0][s]);
        perVoice.forEach((v, i) => stepsToNotes(v).forEach((n) => voices[i].push({ b: b0 + (from + n.s0) / 4, len: (n.s1 - n.s0) / 4, p: n.p - shift })));
      }
      if (onStep) onStep((c + 1) / chunks);
    }
    return { voices };
    function root12(p) { while (p > 81) p -= 12; while (p < 60) p += 12; return p; }
  }

  async function fills(pattern) {
    const mm = await loadMagenta();
    const rnn = await model('drums');
    const seed = patternSeq(mm, pattern, 2);
    const out = [];
    for (const temp of [1.0, 1.15]) {
      const cont = await rnn.continueSequence(seed, 16, temp);
      const bar = cont.notes.map((n) => ({ s: n.quantizedStartStep, k: pitchToKind(n.pitch), v: 0.55 + 0.4 * ((n.velocity || 90) / 127) }))
        .filter((h) => h.s >= 0 && h.s < 16);
      if (bar.length) {
        if (!bar.some((h) => h.s === 0 && h.k === 'kick')) bar.push({ s: 0, k: 'kick', v: 0.85 });
        out.push(bar);
      }
    }
    return out.length ? out : null;
  }

  async function groove(pattern, bpm) {
    const mm = await loadMagenta();
    const vae = await model('groove');
    const seq = patternSeq(mm, pattern, 2);
    const z = await vae.encode([seq]);
    const outs = await vae.decode(z, undefined, undefined, 4, bpm);
    z.dispose();
    const res = outs[0];
    const stepSec = 60 / bpm / 4;
    const timed = res.notes.some((n) => n.startTime > 0); // unquantised output (seconds at `bpm`)
    const hits = res.notes.map((n) => {
      const s = timed ? n.startTime / stepSec : n.quantizedStartStep;
      return { s, k: pitchToKind(n.pitch), v: Math.min(1, 0.15 + 0.85 * ((n.velocity || 80) / 127)) };
    }).filter((h) => h.s >= -0.5 && h.s < 32);
    return hits.length ? hits.map((h) => Object.assign(h, { s: Math.max(0, h.s) })) : null;
  }

  async function improv(A) {
    const mm = await loadMagenta();
    const rnn = await model('improv');
    const { b0, total, steps } = melodySteps(A);
    const gaps = [];
    let run = 0;
    for (let s = 0; s <= total; s++) {
      if (s < total && !steps[s]) { run++; continue; }
      if (run >= 6 && s - run >= 8) gaps.push({ s0: s - run, s1: s });
      run = 0;
    }
    const out = [];
    for (const g of gaps.slice(0, 16)) {
      const seedSteps = steps.slice(Math.max(0, g.s0 - 16), g.s0).map((x) => x && { p: Math.min(83, Math.max(48, fit(x.p))), start: x.start });
      const seedNotes = stepsToNotes(seedSteps);
      if (!seedNotes.length) continue;
      const seedLen = seedSteps.length, len = Math.min(16, g.s1 - g.s0);
      const seq = quantizedSeq(mm, seedNotes.map((n) => ({ pitch: n.p, quantizedStartStep: n.s0, quantizedEndStep: n.s1 })), seedLen);
      const chords = [];
      for (let s = g.s0 - seedLen; s < g.s0 + len; s++) chords.push(chordName(A.chordAt(b0 + s / 4 + 0.01)));
      const cont = await rnn.continueSequence(seq, len, 1.0, chords);
      cont.notes.forEach((n) => {
        if (n.quantizedStartStep < len) out.push({ b: b0 + (g.s0 + n.quantizedStartStep) / 4, len: Math.max(0.25, (Math.min(len, n.quantizedEndStep) - n.quantizedStartStep) / 4), p: n.pitch });
      });
    }
    return out.length ? out : null;
    function fit(p) { while (p > 83) p -= 12; while (p < 48) p += 12; return p; }
  }

  /* Run the parts a genre asks for. Results are cached per score by the caller. */
  async function partsFor(genreId, A, cache, onStatus) {
    const g = window.GTGenres[genreId];
    const ai = {};
    const errors = [];
    const want = g.ai || [];
    const pattern = g.patterns && g.patterns.main;
    const jobs = {
      chorale: () => chorale(A, (f) => onStatus && onStatus('Coconet', f)),
      fills: () => fills(pattern),
      groove: () => groove(pattern, A.bpm),
      improv: () => improv(A),
    };
    for (const part of want) {
      if ((part === 'fills' || part === 'groove') && !pattern) continue;
      const key = part === 'chorale' || part === 'improv' ? part : part + ':' + genreId;
      try {
        if (onStatus) onStatus(LABEL[part], 0);
        if (!cache[key]) cache[key] = jobs[part]();
        ai[part] = await cache[key];
      } catch (err) {
        delete cache[key];
        ai[part] = null;
        errors.push(LABEL[part] + ': ' + (err && err.message ? err.message : err));
      }
    }
    return { ai, errors };
  }
  const LABEL = { chorale: 'Coconet', fills: 'DrumsRNN', groove: 'GrooVAE', improv: 'ImprovRNN' };

  window.GTModels = { loadMagenta, partsFor, URLS };
})();
