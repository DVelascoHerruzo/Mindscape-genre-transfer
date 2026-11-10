/* Step 3 of the pipeline: MIDI → MIDI in another genre.
   GTArranger.arrange(score, genre, preset, ai) builds an arrangement from the analysed
   score (beat grid, chords, melody, notes) using the genre recipe in genres.js.
   "ai" holds the parts produced by the pretrained Magenta models (models.js); a recipe
   falls back to its rule-based parts when one is missing.

   Times inside recipes are beat positions on the song's own beat grid
   (1 = one beat, bar k starts at grid.bar(k)). They are converted to seconds here, so
   the result lines up with the original recording and A/B switching keeps its place.

   Arrangement = { genre, preset, bpm, duration, tracks: [{ id, inst, gain, pan, reverb,
   delay, dist, lowpass, duck, notes: [{ t, d, p, v }] }], drums: { kit, gain, hits:
   [{ t, k, v }] }, master: {...}, used: [model names], fallbacks: [text] } */
(function (root) {
  'use strict';

  const PRESET_LEVEL = { subtle: 0, balanced: 1, bold: 2 };
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const median = (xs) => {
    if (!xs.length) return 0;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  /* Move p by octaves into [lo, hi] (ranges narrower than an octave clamp instead). */
  function fold(p, lo, hi) {
    if (hi - lo < 11) return clamp(p, lo, hi);
    while (p < lo) p += 12;
    while (p > hi) p -= 12;
    return p;
  }

  function Arrangement(score, genre, level, ai) {
    const grid = root.GTAnalyse.makeGrid(score.beats, score.offset);
    const A = this;
    A.score = score;
    A.grid = grid;
    A.level = level;
    A.key = score.key;
    A.bpm = score.bpm;
    A.duration = score.duration;
    A.ai = ai || {};
    A.used = [];
    A.fallbacks = [];
    A.tracks = [];
    A.drumHits = [];
    A.kit = null;
    A.drumGain = 1;
    A.masterFx = { reverb: { seconds: 1.8, decay: 3, wet: 0.15 } };
    A.rand = mulberry32(1234 + level * 7 + genre.length * 31);
    A.prevVoicing = {};

    // Bars that overlap the clip: k from the first bar touching t=0 to the last before the end.
    const posEnd = grid.pos(score.duration);
    let k0 = Math.floor((grid.pos(0) - score.offset) / 4);
    const bars = [];
    for (let k = k0; grid.bar(k) < posEnd; k++) bars.push(k);
    A.barList = bars;
    A.firstBar = k0;
    A.posStart = grid.pos(0);
    A.posEnd = posEnd;
  }

  const P = Arrangement.prototype;

  /* ---------- tracks and notes ---------- */
  P.track = function (id, inst, opts) {
    const t = Object.assign({ id, inst, gain: 1, pan: 0, reverb: 0.15, delay: 0, dist: 0, lowpass: 0, duck: false, notes: [] }, opts || {});
    this.tracks.push(t);
    return t;
  };
  P.getTrack = function (id) { return this.tracks.find((t) => t.id === id); };
  P.note = function (trackId, b, len, p, v) {
    const tr = typeof trackId === 'string' ? this.getTrack(trackId) : trackId;
    const t = this.grid.time(b);
    const d = Math.max(0.03, this.grid.time(b + len) - t);
    if (t >= this.duration || t + d <= 0 || !isFinite(p)) return;
    tr.notes.push({ t: Math.max(0, t), d: t < 0 ? d + t : d, p: Math.round(p), v: clamp(v, 0.02, 1) });
  };
  P.hit = function (k, b, v) {
    const t = this.grid.time(b);
    if (t < 0 || t >= this.duration) return;
    this.drumHits.push({ t, k, v: clamp(v, 0.02, 1) });
  };
  P.drums = function (kit, gain) { this.kit = kit; this.drumGain = gain == null ? 1 : gain; };
  P.master = function (fx) { Object.assign(this.masterFx, fx); };
  P.useModel = function (name) { if (!this.used.includes(name)) this.used.push(name); };
  P.fallback = function (text) { if (!this.fallbacks.includes(text)) this.fallbacks.push(text); };

  /* ---------- harmony ---------- */
  P.chordAt = function (b) {
    const c = this.score.chords;
    return c[clamp(Math.floor(b + 1e-6), 0, c.length - 1)];
  };
  /* Chord segments in beat positions: [{ b0, b1, chord }], merged across repeated beats. */
  P.chordSegments = function () {
    const out = [];
    const c = this.score.chords;
    const start = Math.max(0, Math.floor(this.posStart)), end = Math.min(c.length, Math.ceil(this.posEnd));
    for (let i = start; i < end; i++) {
      const last = out[out.length - 1];
      if (last && last.chord.root === c[i].root && last.chord.quality === c[i].quality) last.b1 = i + 1;
      else out.push({ b0: i, b1: i + 1, chord: c[i] });
    }
    return out;
  };
  P.isDominant = function (chord) {
    return chord.quality === 'maj' && (chord.root - this.key.tonic + 12) % 12 === 7;
  };
  /* Chord tones as intervals above the root. */
  P.intervals = function (chord, kind) {
    const min = chord.quality === 'min';
    const dom = this.isDominant(chord);
    const third = min ? 3 : 4;
    const seventh = min || dom ? 10 : 11;
    switch (kind) {
      case 'power': return [0, 7, 12];
      case 'seventh': return [0, third, 7, seventh];
      case 'ninth': return [0, third, 7, seventh, 14];
      case 'rootless': return [third, 7, seventh, 14];
      case 'add9': return [0, 7, 14, third + 12];
      case 'open': return [0, 7, third + 12];
      default: return [0, third, 7];
    }
  };
  /* Voice a chord inside [lo, hi], moving as little as possible from the last voicing of this track. */
  P.voicing = function (chord, kind, lo, hi, trackId) {
    const ints = this.intervals(chord, kind);
    if (kind === 'power') {
      const r = fold(chord.root, lo, lo + 11);
      return ints.map((i) => r + i);
    }
    const pcs = ints.map((i) => (chord.root + i) % 12);
    const prev = this.prevVoicing[trackId];
    const target = prev ? prev.reduce((s, x) => s + x, 0) / prev.length : (lo + hi) / 2;
    let best = null, bestScore = Infinity;
    for (let inv = 0; inv < pcs.length; inv++) {
      const order = pcs.slice(inv).concat(pcs.slice(0, inv));
      for (let base = lo; base < lo + 12; base++) {
        if (base % 12 !== order[0]) continue;
        const cand = [base];
        for (let j = 1; j < order.length; j++) {
          let p = cand[j - 1] + 1;
          while (p % 12 !== order[j]) p++;
          cand.push(p);
        }
        for (const shift of [0, 12]) {
          const c = cand.map((p) => p + shift);
          if (c[c.length - 1] > hi || c[0] < lo) continue;
          const mean = c.reduce((s, x) => s + x, 0) / c.length;
          const score = Math.abs(mean - target) + 0.15 * (c[c.length - 1] - c[0]);
          if (score < bestScore) { bestScore = score; best = c; }
        }
      }
    }
    if (!best) best = pcs.map((pc) => fold(pc, lo, hi)).sort((a, b) => a - b);
    this.prevVoicing[trackId] = best;
    return best;
  };
  P.root = function (chord, lo, hi) { return fold(chord.root, lo, hi); };
  P.inKey = function (p) { return SCALES[this.key.mode].includes((p - this.key.tonic + 120) % 12); };
  /* Diatonic third above p (3 or 4 semitones, whichever is in the key). */
  P.thirdAbove = function (p) { return this.inKey(p + 4) ? p + 4 : p + 3; };

  /* ---------- rhythm ---------- */
  /* Swing: delay off-beat 8ths (sub 8) or 16ths (sub 16). amount 1 = full triplet feel. */
  P.swing = function (b, amount, sub) {
    if (!amount) return b;
    const f = b - Math.floor(b);
    if ((sub || 8) === 8) return Math.abs(f - 0.5) < 0.02 ? Math.floor(b) + 0.5 + amount / 6 : b;
    if (Math.abs(f - 0.25) < 0.02 || Math.abs(f - 0.75) < 0.02) return b + amount * 0.0833;
    return b;
  };
  P.eachBar = function (fn) {
    this.barList.forEach((k, i) => fn(this.grid.bar(k), k, i));
  };

  /* ---------- source material ---------- */
  function quantizeEvents(A, notes, opts) {
    const q = opts.quantize || 0, sw = opts.swing || 0, sub = opts.swingSub || 8;
    return notes.map((n) => {
      let b = A.grid.pos(n.t);
      let e = A.grid.pos(n.t + n.d);
      b += q * (Math.round(b * 4) / 4 - b);
      e += q * (Math.round(e * 4) / 4 - e);
      if (q >= 0.5) b = A.swing(Math.round(b * 4) / 4, sw, sub);
      return { b, len: Math.max(0.12, e - b), p: n.p, v: n.v };
    });
  }
  /* The melody, quantised (q 0–1), swung and moved by octaves to sit around `center`. */
  P.melody = function (opts) {
    opts = opts || {};
    const ev = quantizeEvents(this, this.score.melody, opts);
    const lo = opts.lo || 48, hi = opts.hi || 96;
    const shift = opts.center ? 12 * Math.round((opts.center - median(ev.map((e) => e.p))) / 12) : 0;
    ev.forEach((e) => { e.p = fold(e.p + shift, lo, hi); });
    if (opts.legato) {
      for (let i = 0; i < ev.length - 1; i++) {
        const gap = ev[i + 1].b - (ev[i].b + ev[i].len);
        if (gap > 0 && gap < opts.legato) ev[i].len = ev[i + 1].b - ev[i].b;
      }
    }
    for (let i = 0; i < ev.length - 1; i++) ev[i].len = Math.min(ev[i].len, Math.max(0.1, ev[i + 1].b - ev[i].b));
    return ev;
  };
  P.allNotes = function (opts) { return quantizeEvents(this, this.score.notes, opts || {}); };
  /* Steps of the melody that are silent for at least `minBeats` (for fills). */
  P.melodyGaps = function (minBeats) {
    const mel = this.melody({ quantize: 1 });
    const gaps = [];
    let cursor = Math.max(0, this.posStart);
    mel.forEach((n) => {
      if (n.b - cursor >= minBeats) gaps.push({ b0: cursor, b1: n.b });
      cursor = Math.max(cursor, n.b + n.len);
    });
    if (this.posEnd - cursor >= minBeats) gaps.push({ b0: cursor, b1: this.posEnd });
    return gaps;
  };

  /* ---------- drums ---------- */
  /* pattern: [[step 0–15, kind, velocity], …] for one 4/4 bar.
     opts: swing, swingSub, crashEvery (bars), fills (bool: use AI fills on phrase ends),
     groove (bool: use the AI-humanised 2-bar groove), from (first bar index, default all). */
  P.playDrums = function (pattern, opts) {
    opts = opts || {};
    const fills = opts.fills && this.ai.fills && this.ai.fills.length ? this.ai.fills : null;
    const groove = opts.groove && this.ai.groove && this.ai.groove.length ? this.ai.groove : null;
    if (opts.fills && !fills) this.fallback('drum fills: rule-based');
    if (opts.groove && !groove) this.fallback('drum feel: rule-based');
    if (fills) this.useModel('DrumsRNN');
    if (groove) this.useModel('GrooVAE');
    let fillIx = 0;
    this.eachBar((b0, k, i) => {
      const phraseBar = (k - this.firstBar) % 4;
      if (fills && phraseBar === 3 && i > 0) {
        fills[fillIx++ % fills.length].forEach((h) => this.hit(h.k, b0 + h.s / 4, h.v * (opts.vel || 1)));
        return;
      }
      if (groove) {
        const half = (k - this.firstBar) % 2;
        groove.filter((h) => h.s >= half * 16 && h.s < half * 16 + 16)
          .forEach((h) => this.hit(h.k, b0 + (h.s - half * 16) / 4, h.v * (opts.vel || 1)));
      } else {
        pattern.forEach(([s, kind, v]) => {
          const b = this.swing(b0 + s / 4, opts.swing || 0, opts.swingSub || 8);
          const jitter = opts.jitter ? (this.rand() - 0.5) * opts.jitter : 0;
          this.hit(kind, b + jitter, v * (opts.vel || 1) * (opts.jitter ? 0.9 + 0.2 * this.rand() : 1));
        });
      }
      if (opts.crashEvery && phraseBar === 0 && (k - this.firstBar) % opts.crashEvery === 0) this.hit('crash', b0, 0.75);
    });
  };

  P.finish = function (genreId, presetId) {
    this.tracks.forEach((t) => t.notes.sort((a, b) => a.t - b.t));
    this.drumHits.sort((a, b) => a.t - b.t);
    return {
      genre: genreId,
      preset: presetId,
      bpm: this.bpm,
      duration: this.duration,
      beat: this.grid.period,
      key: this.key,
      tracks: this.tracks.filter((t) => t.notes.length),
      drums: this.kit && this.drumHits.length ? { kit: this.kit, gain: this.drumGain, hits: this.drumHits } : null,
      master: this.masterFx,
      used: this.used,
      fallbacks: this.fallbacks,
    };
  };

  function arrange(score, genreId, presetId, ai) {
    const g = root.GTGenres && root.GTGenres[genreId];
    if (!g) throw new Error('Unknown genre: ' + genreId);
    const level = PRESET_LEVEL[presetId] != null ? PRESET_LEVEL[presetId] : 1;
    const A = new Arrangement(score, genreId, level, level === 2 ? ai : {});
    g.build(A);
    return A.finish(genreId, presetId);
  }

  root.GTArranger = { arrange, PRESET_LEVEL, fold, Arrangement };
})(typeof window !== 'undefined' ? window : globalThis);
