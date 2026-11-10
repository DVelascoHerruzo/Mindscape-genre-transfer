/* Music analysis for the MIDI pipeline (step 2 of MP3 → MIDI → genre → MP3).
   Input: mono audio (for tempo and beats) and the notes transcribed by Basic Pitch.
   Output: a "score": beat grid, downbeat, key, one chord per beat, the melody line
   and a cleaned note list. Plain functions with no DOM use, so the same file also
   runs in Node for tests (it attaches to globalThis). */
(function (root) {
  'use strict';

  const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  /* ---------- FFT (radix-2, in place) ---------- */
  function makeFFT(n) {
    const levels = Math.log2(n);
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    return function fft(re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j++, k += step) {
            const tr = re[j + half] * cos[k] + im[j + half] * sin[k];
            const ti = -re[j + half] * sin[k] + im[j + half] * cos[k];
            re[j + half] = re[j] - tr;
            im[j + half] = im[j] - ti;
            re[j] += tr;
            im[j] += ti;
          }
        }
      }
    };
  }

  /* ---------- onset envelope: log-magnitude spectral flux ---------- */
  function onsetEnvelope(samples, sr) {
    const N = 1024, HOP = 256;
    const fft = makeFFT(N);
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const maxBin = Math.min(N / 2, Math.round((8000 / sr) * N));
    const frames = Math.max(1, Math.floor((samples.length - N) / HOP) + 1);
    const re = new Float64Array(N), im = new Float64Array(N);
    let prev = new Float64Array(maxBin), cur = new Float64Array(maxBin);
    const flux = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
      const off = f * HOP;
      for (let i = 0; i < N; i++) {
        re[i] = (samples[off + i] || 0) * win[i];
        im[i] = 0;
      }
      fft(re, im);
      let sum = 0;
      for (let b = 1; b < maxBin; b++) {
        const mag = Math.log1p(100 * Math.sqrt(re[b] * re[b] + im[b] * im[b]));
        cur[b] = mag;
        const d = mag - prev[b];
        if (d > 0 && f > 0) sum += d;
      }
      flux[f] = sum;
      const t = prev; prev = cur; cur = t;
    }
    // Remove the slow trend (moving average over ~0.4 s), keep positive part, normalise.
    const fps = sr / HOP;
    const w = Math.max(1, Math.round(0.2 * fps));
    const env = new Float64Array(frames);
    let acc = 0;
    const pre = new Float64Array(frames + 1);
    for (let i = 0; i < frames; i++) { acc += flux[i]; pre[i + 1] = acc; }
    let mean = 0;
    for (let i = 0; i < frames; i++) {
      const a = Math.max(0, i - w), b = Math.min(frames, i + w + 1);
      env[i] = Math.max(0, flux[i] - (pre[b] - pre[a]) / (b - a));
      mean += env[i];
    }
    mean /= frames;
    let sd = 0;
    for (let i = 0; i < frames; i++) sd += (env[i] - mean) * (env[i] - mean);
    sd = Math.sqrt(sd / frames) || 1;
    for (let i = 0; i < frames; i++) env[i] /= sd;
    return { env, fps };
  }

  /* ---------- tempo: autocorrelation with a log-normal prior around 115 BPM ---------- */
  function estimateTempo(env, fps) {
    const minLag = Math.floor((60 * fps) / 200), maxLag = Math.ceil((60 * fps) / 55);
    const n = env.length;
    const ac = new Float64Array(maxLag + 2);
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      let s = 0;
      for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
      ac[lag] = s / Math.max(1, n - lag);
    }
    let best = minLag, bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const bpm = (60 * fps) / lag;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.9, 2));
      // Reward lags whose double also correlates (the beat, not the half-beat).
      const dbl = 2 * lag <= maxLag + 1 ? ac[2 * lag] || 0 : 0;
      const score = (ac[lag] + 0.5 * dbl) * prior;
      if (score > bestScore) { bestScore = score; best = lag; }
    }
    // Parabolic refinement of the peak.
    const y0 = ac[best - 1] || 0, y1 = ac[best], y2 = ac[best + 1] || 0;
    const denom = y0 - 2 * y1 + y2;
    const lag = denom < 0 ? best + (0.5 * (y0 - y2)) / denom : best;
    return { bpm: (60 * fps) / lag, period: lag };
  }

  /* ---------- beat tracking: dynamic programming (Ellis 2007) ---------- */
  function trackBeats(env, fps, period, tightness) {
    const n = env.length;
    tightness = tightness || 100;
    const cum = new Float64Array(n), back = new Int32Array(n).fill(-1);
    const lo = Math.round(period / 2), hi = Math.round(period * 2);
    for (let t = 0; t < n; t++) {
      let bestV = -Infinity, bestP = -1;
      for (let p = t - hi; p <= t - lo; p++) {
        if (p < 0) continue;
        const r = Math.log((t - p) / period);
        const v = cum[p] - tightness * r * r;
        if (v > bestV) { bestV = v; bestP = p; }
      }
      cum[t] = env[t] + (bestP >= 0 ? Math.max(0, bestV) : 0);
      back[t] = bestV > 0 ? bestP : -1;
    }
    let end = Math.max(0, n - Math.round(period)), endBest = end;
    for (let t = end; t < n; t++) if (cum[t] > cum[endBest]) endBest = t;
    const frames = [];
    for (let t = endBest; t >= 0; t = back[t]) frames.push(t);
    frames.reverse();
    return frames.map((f) => f / fps);
  }

  /* Fill gaps, then extend the beat list so it covers [before 0, after the end]. */
  function regulariseBeats(beats, bpm, duration) {
    const P = 60 / bpm;
    let list = beats.slice();
    if (list.length < 2) {
      list = [];
      for (let t = 0; t < duration + P; t += P) list.push(t);
    }
    const out = [list[0]];
    for (let i = 1; i < list.length; i++) {
      const gap = list[i] - out[out.length - 1];
      const k = Math.round(gap / P);
      if (k >= 2) for (let j = 1; j < k; j++) out.push(out[out.length - 1] + gap / k);
      if (gap > P * 0.4) out.push(list[i]);
    }
    while (out[0] > 0) out.unshift(out[0] - P);
    while (out[out.length - 1] < duration + P) out.push(out[out.length - 1] + P);
    return out;
  }

  /* ---------- beat grid: beat positions (fractional beat indices) ↔ seconds ---------- */
  function makeGrid(beats, offset) {
    const n = beats.length;
    const P = (beats[n - 1] - beats[0]) / (n - 1);
    function time(b) {
      if (b <= 0) return beats[0] + b * P;
      if (b >= n - 1) return beats[n - 1] + (b - (n - 1)) * P;
      const i = Math.floor(b);
      return beats[i] + (b - i) * (beats[i + 1] - beats[i]);
    }
    function pos(t) {
      if (t <= beats[0]) return (t - beats[0]) / P;
      if (t >= beats[n - 1]) return n - 1 + (t - beats[n - 1]) / P;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] <= t) lo = mid; else hi = mid;
      }
      return lo + (t - beats[lo]) / (beats[lo + 1] - beats[lo]);
    }
    return { beats, offset, period: P, n, time, pos, bar: (k) => offset + 4 * k };
  }

  /* ---------- notes ---------- */
  function cleanNotes(raw) {
    const notes = raw
      .map((r) => ({
        t: r.startTimeSeconds != null ? r.startTimeSeconds : r.t,
        d: r.durationSeconds != null ? r.durationSeconds : r.d,
        p: r.pitchMidi != null ? r.pitchMidi : r.p,
        v: Math.min(1, r.amplitude != null ? r.amplitude : r.v),
      }))
      .filter((n) => n.d >= 0.05 && n.v >= 0.18 && n.p >= 21 && n.p <= 108)
      .sort((a, b) => a.t - b.t || a.p - b.p);
    // Drop likely overtones: a quieter note an octave, a twelfth or two octaves above
    // a louder note that starts at the same moment.
    const keep = notes.filter((n) => !notes.some((m) => m !== n &&
      Math.abs(m.t - n.t) < 0.05 && [12, 19, 24].includes(n.p - m.p) && n.v < 0.85 * m.v));
    // Cap polyphony at 6 simultaneous onsets (keep the loudest).
    const out = [];
    for (let i = 0; i < keep.length;) {
      let j = i;
      while (j < keep.length && keep[j].t - keep[i].t < 0.03) j++;
      keep.slice(i, j).sort((a, b) => b.v - a.v).slice(0, 6).forEach((n) => out.push(n));
      i = j;
    }
    return out.sort((a, b) => a.t - b.t || a.p - b.p);
  }

  /* Skyline melody: the top line, kept monophonic. */
  function extractMelody(notes) {
    const cand = notes.filter((n) => n.p >= 48);
    const mel = [];
    let cur = null;
    for (let i = 0; i < cand.length;) {
      let j = i, maxV = 0;
      while (j < cand.length && cand[j].t - cand[i].t < 0.04) { maxV = Math.max(maxV, cand[j].v); j++; }
      const cluster = cand.slice(i, j).filter((n) => n.v >= 0.5 * maxV);
      i = j;
      const top = cluster.reduce((a, b) => (b.p > a.p ? b : a));
      if (cur && cur.t + cur.d > top.t + 0.05 && top.p < cur.p) continue; // a held melody note stays on top
      if (cur && cur.t + cur.d > top.t) cur.d = top.t - cur.t;
      cur = { t: top.t, d: top.d, p: top.p, v: top.v };
      mel.push(cur);
    }
    const kept = mel.filter((n) => n.d >= 0.06);
    // Remove isolated wild leaps (short notes far from both neighbours).
    return kept.filter((n, k) => {
      const a = kept[k - 1], b = kept[k + 1];
      return !(a && b && Math.abs(n.p - a.p) > 12 && Math.abs(n.p - b.p) > 12 && n.d < 0.25);
    });
  }

  /* ---------- key: Krumhansl–Kessler ---------- */
  function corr(a, b) {
    const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return num / (Math.sqrt(da * db) || 1);
  }
  function detectKey(notes) {
    const h = new Array(12).fill(0);
    notes.forEach((n) => { h[n.p % 12] += Math.min(n.d, 2) * n.v; });
    let best = { tonic: 0, mode: 'major', score: -Infinity };
    for (let t = 0; t < 12; t++) {
      const rot = h.slice(t).concat(h.slice(0, t));
      const sMaj = corr(rot, KK_MAJOR), sMin = corr(rot, KK_MINOR);
      if (sMaj > best.score) best = { tonic: t, mode: 'major', score: sMaj };
      if (sMin > best.score) best = { tonic: t, mode: 'minor', score: sMin };
    }
    best.name = PC_NAMES[best.tonic] + (best.mode === 'major' ? ' major' : ' minor');
    return best;
  }

  /* ---------- chords: one per beat, triad templates + key prior + Viterbi ---------- */
  function diatonic(key, root, quality) {
    const d = (root - key.tonic + 12) % 12;
    if (key.mode === 'major') return quality === 'maj' ? [0, 5, 7].includes(d) : [2, 4, 9].includes(d);
    return quality === 'min' ? [0, 5, 7].includes(d) : [3, 7, 8, 10].includes(d);
  }
  function detectChords(notes, grid, key, nBeats) {
    const states = [];
    for (let r = 0; r < 12; r++) {
      states.push({ root: r, quality: 'maj', pcs: [r, (r + 4) % 12, (r + 7) % 12] });
      states.push({ root: r, quality: 'min', pcs: [r, (r + 3) % 12, (r + 7) % 12] });
    }
    const S = states.length;
    const emit = [];
    for (let i = 0; i < nBeats; i++) {
      const a = grid.time(i), b = grid.time(i + 1);
      const chroma = new Array(12).fill(0);
      let lowP = 999, energy = 0;
      notes.forEach((n) => {
        const ov = Math.min(b, n.t + n.d) - Math.max(a, n.t);
        if (ov <= 0) return;
        const w = ov * n.v * (n.p < 55 ? 1.5 : 1);
        chroma[n.p % 12] += w;
        energy += w;
        if (ov > 0.3 * (b - a) && n.p < lowP) lowP = n.p;
      });
      const e = new Float64Array(S);
      if (energy > 1e-6) {
        const norm = Math.sqrt(chroma.reduce((s, x) => s + x * x, 0));
        states.forEach((st, k) => {
          const tw = [1, 0.8, 0.8];
          let dot = 0;
          st.pcs.forEach((pc, q) => { dot += chroma[pc] * tw[q]; });
          let score = dot / (norm * Math.sqrt(1 + 0.64 + 0.64));
          if (lowP < 999 && lowP % 12 === st.root) score += 0.15;
          if (diatonic(key, st.root, st.quality)) score += 0.1;
          e[k] = score * 8;
        });
      }
      emit.push(e);
    }
    // Viterbi: staying is free, changing costs a little.
    const SWITCH = 1.4;
    let prev = new Float64Array(S), cur;
    const back = [];
    for (let i = 0; i < nBeats; i++) {
      cur = new Float64Array(S);
      const bk = new Int16Array(S);
      let bestPrev = 0;
      for (let k = 1; k < S; k++) if (prev[k] > prev[bestPrev]) bestPrev = k;
      for (let k = 0; k < S; k++) {
        const stay = prev[k], move = prev[bestPrev] - SWITCH;
        if (stay >= move) { cur[k] = stay + emit[i][k]; bk[k] = k; }
        else { cur[k] = move + emit[i][k]; bk[k] = bestPrev; }
      }
      back.push(bk);
      prev = cur;
    }
    let k = 0;
    for (let j = 1; j < S; j++) if (prev[j] > prev[k]) k = j;
    const path = new Array(nBeats);
    for (let i = nBeats - 1; i >= 0; i--) { path[i] = k; k = back[i][k]; }
    return path.map((s) => {
      const st = states[s];
      return { root: st.root, quality: st.quality, name: PC_NAMES[st.root] + (st.quality === 'min' ? 'm' : '') };
    });
  }

  /* Downbeat: the beat phase (0–3) where bass-note onsets and chord changes line up best.
     (Onset strength is deliberately not used: the loudest onsets are usually the
     backbeat snare on beats 2 and 4.) */
  function chooseDownbeat(grid, notes, chords) {
    const score = [0, 0, 0, 0];
    for (let i = 0; i < chords.length; i++) {
      const t = grid.time(i);
      let s = 0;
      notes.forEach((n) => { if (n.p < 50 && Math.abs(n.t - t) < 0.08) s += n.v * Math.min(1, n.d / grid.period); });
      if (i > 0 && (chords[i].root !== chords[i - 1].root || chords[i].quality !== chords[i - 1].quality)) s += 1.5;
      score[i % 4] += s;
    }
    let best = 0;
    for (let k = 1; k < 4; k++) if (score[k] > score[best]) best = k;
    return best;
  }

  function rms(samples) {
    let s = 0;
    for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
    return Math.sqrt(s / Math.max(1, samples.length));
  }

  /* Build the full score from mono audio + transcribed notes. */
  function buildScore(opts) {
    const { samples, sr, duration } = opts;
    const notes = cleanNotes(opts.rawNotes || []);
    const { env, fps } = onsetEnvelope(samples, sr);
    let { bpm, period } = estimateTempo(env, fps);
    if (bpm < 70) { bpm *= 2; period /= 2; }
    if (bpm > 175) { bpm /= 2; period *= 2; }
    const tracked = trackBeats(env, fps, period);
    const beats = regulariseBeats(tracked, bpm, duration);
    const key = detectKey(notes);
    const grid0 = makeGrid(beats, 0);
    const nBeats = beats.length - 1;
    // Beats with no notes emit nothing, so Viterbi carries the previous chord through them.
    const chords = detectChords(notes, grid0, key, nBeats);
    const offset = chooseDownbeat(grid0, notes, chords);
    const melody = extractMelody(notes);
    return {
      duration,
      bpm: 60 / grid0.period,
      beats,
      offset,
      key,
      chords,
      melody,
      notes,
      rms: rms(samples),
      stats: { trackedBeats: tracked.length, notes: notes.length, melodyNotes: melody.length },
    };
  }

  root.GTAnalyse = {
    PC_NAMES,
    onsetEnvelope,
    estimateTempo,
    trackBeats,
    regulariseBeats,
    makeGrid,
    cleanNotes,
    extractMelody,
    detectKey,
    detectChords,
    chooseDownbeat,
    buildScore,
  };
})(typeof window !== 'undefined' ? window : globalThis);
