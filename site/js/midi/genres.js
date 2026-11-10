/* Genre recipes for the MIDI arranger (arranger.js).
   Each genre has:
     ai        – which pretrained-model parts it uses at the Bold preset (models.js);
     patterns  – its main one-bar drum pattern ([step 0–15, kind, velocity]), also used
                 to seed DrumsRNN / GrooVAE;
     build(A)  – writes the arrangement with the toolkit A (see arranger.js).
   Strength presets: A.level 0 = Subtle (the transcription re-orchestrated),
   1 = Balanced (melody + new accompaniment), 2 = Bold (+ AI parts, extra layers). */
(function (root) {
  'use strict';

  const fold = (p, lo, hi) => root.GTArranger.fold(p, lo, hi);
  const vel = (v, base, range) => base + range * v;

  /* ---------- shared building blocks ---------- */
  function nearestPc(pc, prev, lo, hi) {
    let best = null;
    for (let p = lo; p <= hi; p++) if ((p % 12 + 12) % 12 === (pc + 12) % 12 && (best === null || Math.abs(p - prev) < Math.abs(best - prev))) best = p;
    return best === null ? fold(pc, lo, hi) : best;
  }

  /* Subtle: every transcribed note, re-voiced on the genre's instruments. */
  function subtle(A, cfg) {
    A.track('keys', cfg.keys, Object.assign({ gain: 0.8 }, cfg.keysOpts));
    A.track('low', cfg.bass, Object.assign({ gain: 0.8 }, cfg.bassOpts));
    const [lo, hi] = cfg.bassRange || [28, 55];
    A.allNotes({ quantize: cfg.quantize == null ? 0.3 : cfg.quantize, swing: cfg.swing, swingSub: cfg.sub }).forEach((n) => {
      if (n.p < 48) A.note('low', n.b, n.len, fold(n.p, lo, hi), vel(n.v, 0.35, 0.5));
      else A.note('keys', n.b, n.len, n.p, vel(n.v, 0.3, 0.55));
    });
    if (cfg.light) {
      A.drums(cfg.kit, cfg.drumGain == null ? 0.5 : cfg.drumGain);
      A.playDrums(cfg.light, { swing: cfg.swing, swingSub: cfg.sub });
    }
  }

  function lead(A, id, inst, trackOpts, melOpts, velBase) {
    A.track(id, inst, trackOpts);
    const notes = A.melody(melOpts);
    notes.forEach((n) => A.note(id, n.b, n.len, n.p, vel(n.v, velBase == null ? 0.55 : velBase, 0.4)));
    return notes;
  }

  /* Hits per bar: [[beat position, length, velocity], …]; a list of patterns cycles by bar. */
  function comp(A, id, patterns, kind, lo, hi, opts) {
    opts = opts || {};
    const strumBeats = opts.strum ? opts.strum / A.grid.period : 0;
    A.eachBar((b0, k, i) => {
      const pat = patterns[i % patterns.length];
      pat.forEach(([pos, len, v, dir]) => {
        const b = A.swing(b0 + pos, opts.swing || 0, opts.swingSub || 8) + (opts.late || 0);
        const chord = A.chordAt(b + 0.01);
        let notes = A.voicing(chord, kind, lo, hi, id);
        if (dir === 'U') notes = notes.slice().reverse();
        notes.forEach((p, j) => A.note(id, b + j * strumBeats, len, p, v * (dir === 'U' ? 0.8 : 1)));
      });
    });
  }

  /* Bass line from a per-bar figure: [[beat position, length, velocity, degree]],
     degree: 'R' root, '5' fifth, '8' octave, 'A' chromatic approach to the next bar's root. */
  function bassFigure(A, id, figure, lo, hi, opts) {
    opts = opts || {};
    A.eachBar((b0) => {
      figure.forEach(([pos, len, v, deg]) => {
        const b = A.swing(b0 + pos, opts.swing || 0, opts.swingSub || 8);
        const chord = A.chordAt(b + 0.01);
        const r = fold(chord.root, lo, hi);
        let p = r;
        if (deg === '5') p = r + 7 > hi ? r - 5 : r + 7;
        else if (deg === '8') p = r + 12 > hi ? r : r + 12;
        else if (deg === 'A') {
          const next = fold(A.chordAt(b0 + 4.01).root, lo, hi);
          p = next + (next - 1 >= lo ? -1 : 1);
        }
        A.note(id, b, len, p, v);
      });
    });
  }

  function straightBass(A, id, step, len, lo, hi, v) {
    A.eachBar((b0) => {
      for (let pos = 0; pos < 4 - 1e-6; pos += step) {
        const chord = A.chordAt(b0 + pos + 0.01);
        A.note(id, b0 + pos, len, fold(chord.root, lo, hi), v * (pos % 1 === 0 ? 1 : 0.85));
      }
    });
  }

  function walkingBass(A, id, lo, hi) {
    let prev = Math.round((lo + hi) / 2);
    A.eachBar((b0) => {
      for (let beat = 0; beat < 4; beat++) {
        const b = b0 + beat;
        const chord = A.chordAt(b + 0.01), prevChord = A.chordAt(b - 0.99), next = A.chordAt(b + 1.01);
        const third = chord.quality === 'min' ? 3 : 4;
        let p;
        if (beat === 0 || chord.root !== prevChord.root) p = nearestPc(chord.root, prev, lo, hi);
        else if (beat === 3 || next.root !== chord.root) {
          const target = nearestPc(next.root, prev, lo, hi);
          p = target + (A.rand() < 0.5 && target - 1 >= lo ? -1 : 1);
        } else {
          const opts = [third, 7, 12, 9].map((i) => nearestPc(chord.root + i, prev, lo, hi)).filter((x) => x !== prev);
          p = opts[Math.floor(A.rand() * opts.length)];
        }
        A.note(id, A.swing(b, 0), 0.92, p, beat === 0 ? 0.75 : 0.6);
        prev = p;
      }
    });
  }

  function sustainedChords(A, id, kind, lo, hi, v, maxLen, overlap) {
    A.chordSegments().forEach((seg) => {
      for (let b = seg.b0; b < seg.b1; b += maxLen) {
        const len = Math.min(maxLen, seg.b1 - b);
        A.voicing(seg.chord, kind, lo, hi, id).forEach((p) => A.note(id, b, len + (overlap || 0), p, v));
      }
    });
  }

  function alberti(A, id, gain) {
    A.track(id, 'piano', { gain, pan: 0.15, reverb: 0.3 });
    A.eachBar((b0) => {
      for (let e = 0; e < 8; e++) {
        const b = b0 + e / 2;
        const v3 = A.voicing(A.chordAt(b + 0.01), 'triad', 52, 69, id + ':rh');
        A.note(id, b, 0.5, v3[[0, 2, 1, 2][e % 4]], e % 2 ? 0.32 : 0.42);
      }
      [0, 2].forEach((beat) => {
        const r = fold(A.chordAt(b0 + beat + 0.01).root, 36, 47);
        A.note(id, b0 + beat, 2, r, 0.5);
      });
    });
  }

  function arpeggio(A, id, kind, lo, hi, step, v) {
    let i = 0;
    A.eachBar((b0) => {
      for (let pos = 0; pos < 4 - 1e-6; pos += step) {
        const notes = A.voicing(A.chordAt(b0 + pos + 0.01), kind, lo, hi, id);
        const seq = notes.concat(notes.map((p) => p + 12).filter((p) => p <= hi + 12));
        A.note(id, b0 + pos, step * 0.9, seq[i++ % seq.length], v * (pos % 1 === 0 ? 1 : 0.8));
      }
    });
  }

  function aiChorale(A, voices, specs) {
    A.useModel('Coconet');
    voices.forEach((voice, i) => {
      const s = specs[i];
      if (!s) return;
      A.track(s.id, s.inst, s.opts);
      voice.forEach((n) => A.note(s.id, n.b, n.len + (s.overlap || 0), fold(n.p + (s.shift || 0), s.lo, s.hi), s.v));
    });
  }

  /* ---------- drum patterns ---------- */
  const eighths = (kind, on, off) => [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, kind, s % 4 === 0 ? on : off]);
  const PAT = {
    rock: [[0, 'kick', 0.95], [8, 'kick', 0.9], [10, 'kick', 0.7], [4, 'snare', 0.95], [12, 'snare', 0.95]].concat(eighths('hat', 0.6, 0.42)),
    metal: [[0, 'kick', 0.95], [2, 'kick', 0.85], [4, 'kick', 0.85], [6, 'kick', 0.85], [8, 'kick', 0.95], [10, 'kick', 0.85], [12, 'kick', 0.85], [14, 'kick', 0.85],
      [4, 'snare', 1], [12, 'snare', 1]].concat(eighths('ride', 0.6, 0.45)),
    metalBold: [...Array(16).keys()].map((s) => [s, 'kick', s % 2 ? 0.7 : 0.85]).concat([[4, 'snare', 1], [12, 'snare', 1]], eighths('ride', 0.6, 0.45)),
    pop: [[0, 'kick', 0.95], [6, 'kick', 0.6], [8, 'kick', 0.9], [4, 'snare', 0.85], [12, 'snare', 0.85], [4, 'clap', 0.5], [12, 'clap', 0.5]].concat(eighths('hat', 0.5, 0.33)),
    electronic: [[0, 'kick', 1], [4, 'kick', 1], [8, 'kick', 1], [12, 'kick', 1], [4, 'clap', 0.75], [12, 'clap', 0.75],
      [2, 'ohat', 0.55], [6, 'ohat', 0.55], [10, 'ohat', 0.55], [14, 'ohat', 0.55]],
    electronicHats: [1, 3, 5, 7, 9, 11, 13, 15].map((s) => [s, 'hat', 0.22]),
    lofi: [[0, 'kick', 0.9], [7, 'kick', 0.5], [10, 'kick', 0.8], [4, 'snare', 0.7], [12, 'snare', 0.7], [15, 'hat', 0.15]].concat(eighths('hat', 0.4, 0.28)),
    jazz: [[0, 'ride', 0.6], [4, 'ride', 0.55], [6, 'ride', 0.35], [8, 'ride', 0.6], [12, 'ride', 0.55], [14, 'ride', 0.35],
      [4, 'pedal', 0.35], [12, 'pedal', 0.35], [0, 'kick', 0.14], [8, 'kick', 0.12]],
  };
  const only = (pat, kinds, scale) => pat.filter((h) => kinds.includes(h[1])).map(([s, k, v]) => [s, k, v * (scale || 1)]);

  /* ---------- the eight genres ---------- */
  const GENRES = {
    classical: {
      ai: ['chorale'],
      patterns: {},
      build(A) {
        A.master({ reverb: { seconds: 3.4, decay: 2.2, wet: 0.32 } });
        if (A.level === 0) {
          subtle(A, { keys: 'piano', bass: 'piano', quantize: 0.15, keysOpts: { reverb: 0.3 }, bassOpts: { reverb: 0.3 }, bassRange: [24, 60] });
          return;
        }
        const ch = A.level === 2 && A.ai.chorale;
        if (ch) {
          aiChorale(A, ch.voices, [
            { id: 'violin1', inst: 'violin', lo: 55, hi: 96, v: 0.62, opts: { pan: -0.35, gain: 0.95, reverb: 0.3 } },
            { id: 'violin2', inst: 'violin', lo: 55, hi: 88, v: 0.45, opts: { pan: 0.35, gain: 0.7, reverb: 0.3 } },
            { id: 'viola', inst: 'viola', lo: 48, hi: 79, v: 0.5, opts: { pan: -0.12, gain: 0.75, reverb: 0.3 } },
            { id: 'cello', inst: 'cello', lo: 36, hi: 67, v: 0.55, opts: { pan: 0.22, gain: 0.85, reverb: 0.3 } },
          ]);
          A.track('contrabass', 'contrabass', { gain: 0.45, reverb: 0.3 });
          ch.voices[3].forEach((n) => A.note('contrabass', n.b, n.len, fold(n.p - 12, 28, 55), 0.45));
          alberti(A, 'piano', 0.3);
          return;
        }
        if (A.level === 2) A.fallback('harmony: rule-based (Coconet unavailable)');
        lead(A, 'violin', 'violin', { pan: -0.2, gain: 1, reverb: 0.3 }, { quantize: 0.35, center: 76, lo: 55, hi: 96, legato: 0.5 });
        alberti(A, 'piano', 0.75);
        A.track('cello', 'cello', { pan: 0.3, gain: 0.55, reverb: 0.3 });
        A.chordSegments().forEach((s) => {
          for (let b = s.b0; b < s.b1; b += 2) A.note('cello', b, Math.min(2, s.b1 - b), fold(s.chord.root, 36, 55), 0.45);
        });
        if (A.level === 2) {
          A.track('strings', 'strings', { gain: 0.35, reverb: 0.35 });
          sustainedChords(A, 'strings', 'triad', 55, 76, 0.4, 4, 0.2);
        }
      },
    },

    jazz: {
      ai: ['improv', 'groove'],
      patterns: { main: PAT.jazz },
      build(A) {
        A.master({ reverb: { seconds: 1.6, decay: 3, wet: 0.16 } });
        if (A.level === 0) {
          subtle(A, { keys: 'piano', bass: 'acBass', quantize: 0.6, swing: 0.8, light: only(PAT.jazz, ['ride', 'pedal'], 0.8), kit: 'jazz', drumGain: 0.7 });
          return;
        }
        const bold = A.level === 2;
        lead(A, 'lead', bold ? 'tenorSax' : 'vibes', { gain: bold ? 0.8 : 0.9, pan: -0.1, reverb: 0.2 },
          { quantize: 0.8, swing: 1, center: bold ? 66 : 72, lo: bold ? 46 : 53, hi: bold ? 80 : 89, legato: 0.3 });
        A.track('comp', 'piano', { gain: 0.5, pan: 0.25, reverb: 0.18 });
        comp(A, 'comp', [[[0, 1.2, 0.5], [1.5, 0.5, 0.45]], [[1, 0.5, 0.42], [2.5, 1.2, 0.48]], [[0, 0.6, 0.45], [2.5, 0.5, 0.42], [3.5, 0.4, 0.38]]],
          'rootless', 50, 72, { swing: 1 });
        A.track('bass', 'acBass', { gain: 1, reverb: 0.08 });
        walkingBass(A, 'bass', 28, 50);
        A.drums('jazz', 0.8);
        A.playDrums(PAT.jazz, { swing: 1, groove: bold, jitter: 0.02 });
        A.eachBar((b0) => {
          [1.5, 2.5, 3.5].forEach((pos) => { if (A.rand() < 0.35) A.hit('snare', A.swing(b0 + pos, 1), 0.16); });
        });
        if (bold) {
          if (A.ai.improv && A.ai.improv.length) {
            A.useModel('ImprovRNN');
            A.track('fills', 'vibes', { gain: 0.7, pan: 0.35, reverb: 0.22 });
            A.ai.improv.forEach((n) => A.note('fills', A.swing(n.b, 1), n.len, fold(n.p, 55, 86), 0.5));
          } else A.fallback('melodic fills: none (ImprovRNN unavailable)');
        }
      },
    },

    ambient: {
      ai: ['chorale'],
      patterns: {},
      build(A) {
        A.master({ reverb: { seconds: 6, decay: 1.6, wet: 0.5 }, delay: { beats: 0.75, feedback: 0.42, wet: 0.28 } });
        if (A.level === 0) {
          A.track('keys', 'piano', { gain: 0.75, reverb: 0.55, delay: 0.25 });
          A.allNotes({ quantize: 0.1 }).forEach((n) => A.note('keys', n.b, n.len * 1.3, n.p, vel(n.v, 0.2, 0.45)));
          A.track('pad', 'warmPad', { gain: 0.4, reverb: 0.5 });
          sustainedChords(A, 'pad', 'open', 43, 67, 0.35, 8, 0.6);
          return;
        }
        A.track('pad', 'warmPad', { gain: 0.5, reverb: 0.5 });
        sustainedChords(A, 'pad', 'add9', 48, 74, 0.4, 8, 0.8);
        A.track('halo', 'haloPad', { gain: 0.22, reverb: 0.6 });
        sustainedChords(A, 'halo', 'open', 67, 86, 0.3, 8, 0.8);
        A.track('sub', 'synthStrings', { gain: 0.35, reverb: 0.4 });
        A.chordSegments().forEach((s) => A.note('sub', s.b0, s.b1 - s.b0 + 0.5, fold(s.chord.root, 36, 47), 0.4));
        A.track('lead', 'celesta', { gain: 0.85, reverb: 0.5, delay: 0.35 });
        A.melody({ quantize: 0.5, center: 79, lo: 60, hi: 96 }).forEach((n) => A.note('lead', n.b, Math.min(n.len * 1.6, 3), n.p, vel(n.v, 0.4, 0.4)));
        if (A.level === 2) {
          const ch = A.ai.chorale;
          if (ch) {
            aiChorale(A, ch.voices, [null,
              { id: 'choirA', inst: 'choir', lo: 55, hi: 76, v: 0.42, overlap: 0.3, opts: { gain: 0.45, pan: -0.3, reverb: 0.6 } },
              { id: 'choirT', inst: 'choir', lo: 48, hi: 69, v: 0.42, overlap: 0.3, opts: { gain: 0.45, pan: 0.3, reverb: 0.6 } },
              { id: 'choirB', inst: 'choir', lo: 40, hi: 60, v: 0.4, overlap: 0.3, opts: { gain: 0.4, reverb: 0.6 } }]);
          } else {
            A.fallback('choir voices: arpeggio instead (Coconet unavailable)');
            A.track('arp', 'vibes', { gain: 0.35, pan: 0.3, reverb: 0.5, delay: 0.4 });
            arpeggio(A, 'arp', 'add9', 60, 84, 0.5, 0.35);
          }
        }
      },
    },

    lofi: {
      ai: ['groove'],
      patterns: { main: PAT.lofi },
      build(A) {
        A.master({ lofi: A.level === 2 ? 'heavy' : 'light', reverb: { seconds: 1.4, decay: 3, wet: 0.16 } });
        if (A.level === 0) {
          subtle(A, { keys: 'ep', bass: 'fingerBass', quantize: 0.5, swing: 0.5, sub: 16, light: only(PAT.lofi, ['kick', 'snare', 'hat'], 0.6), kit: 'lofi', drumGain: 0.6, bassOpts: { lowpass: 900 } });
          return;
        }
        A.track('keys', 'ep', { gain: 0.7, pan: -0.1, reverb: 0.18 });
        comp(A, 'keys', [[[0, 1.9, 0.5], [2.5, 1.4, 0.44]]], 'ninth', 50, 76, { late: 0.04 });
        A.track('bass', 'fingerBass', { gain: 0.95, lowpass: 900 });
        bassFigure(A, 'bass', [[0, 1.5, 0.75, 'R'], [2.5, 1, 0.65, 'R'], [3.75, 0.25, 0.45, 'A']], 31, 50, { swing: 0.5, swingSub: 16 });
        lead(A, 'lead', 'jazzGtr', { gain: 0.8, pan: 0.2, lowpass: 3500, reverb: 0.2 },
          { quantize: 0.7, swing: 0.5, swingSub: 16, center: 69, lo: 52, hi: 86, legato: 0.25 });
        if (A.level === 2) {
          A.track('double', 'ep', { gain: 0.3, pan: -0.25, reverb: 0.3 });
          A.getTrack('lead').notes.forEach((n) => A.getTrack('double').notes.push({ t: n.t, d: n.d, p: n.p + 12, v: n.v * 0.7 }));
        }
        A.drums('lofi', 0.85);
        A.playDrums(PAT.lofi, { swing: 0.55, swingSub: 16, groove: A.level === 2, jitter: 0.03 });
      },
    },

    pop: {
      ai: ['fills'],
      patterns: { main: PAT.pop },
      build(A) {
        A.master({ reverb: { seconds: 1.8, decay: 3, wet: 0.18 } });
        if (A.level === 0) {
          subtle(A, { keys: 'brightPiano', bass: 'fingerBass', quantize: 0.4, light: only(PAT.pop, ['hat', 'kick'], 0.6), kit: 'pop' });
          return;
        }
        A.track('piano', 'brightPiano', { gain: 0.45, pan: -0.15, reverb: 0.2 });
        comp(A, 'piano', [[[0, 0.9, 0.5], [1, 0.9, 0.4], [2, 0.9, 0.45], [3, 0.9, 0.4]]], 'triad', 53, 72);
        A.track('gtr', 'steelGtr', { gain: 0.45, pan: 0.4, reverb: 0.15 });
        comp(A, 'gtr', [[[0, 1, 0.55, 'D'], [1, 0.5, 0.45, 'D'], [1.5, 0.5, 0.4, 'U'], [2.5, 0.5, 0.4, 'U'], [3, 0.5, 0.45, 'D'], [3.5, 0.5, 0.38, 'U']]],
          'open', 40, 64, { strum: 0.012 });
        A.track('bass', 'fingerBass', { gain: 0.95 });
        bassFigure(A, 'bass', [[0, 1.4, 0.8, 'R'], [1.5, 0.45, 0.6, '5'], [2, 0.95, 0.75, 'R'], [3, 0.45, 0.6, '8'], [3.5, 0.45, 0.55, 'A']], 31, 52);
        lead(A, 'lead', 'brightPiano', { gain: 0.85, reverb: 0.2 }, { quantize: 0.6, center: 74, lo: 57, hi: 93 }, 0.6);
        if (A.level === 2) {
          A.track('pad', 'synthStrings', { gain: 0.3, reverb: 0.3 });
          sustainedChords(A, 'pad', 'triad', 60, 79, 0.4, 4, 0.1);
        }
        A.drums('pop', 0.9);
        A.playDrums(PAT.pop, { crashEvery: 8, fills: A.level === 2 });
      },
    },

    electronic: {
      ai: ['fills'],
      patterns: { main: PAT.electronic },
      build(A) {
        A.master({ sidechain: true, reverb: { seconds: 1.8, decay: 3, wet: 0.14 }, delay: { beats: 0.75, feedback: 0.3, wet: 0.15 } });
        if (A.level === 0) {
          subtle(A, { keys: 'polySynth', bass: 'synthBass', quantize: 0.6, light: only(PAT.electronic, ['kick', 'ohat'], 0.7), kit: '909', keysOpts: { duck: true }, bassOpts: { duck: true } });
          return;
        }
        A.track('pad', 'polySynth', { gain: 0.42, duck: true, reverb: 0.2 });
        comp(A, 'pad', [[[0, 4, 0.5]]], 'seventh', 55, 77);
        A.track('bass', 'synthBass', { gain: 0.9, duck: true });
        bassFigure(A, 'bass', [[0.5, 0.4, 0.8, 'R'], [1.5, 0.4, 0.8, 'R'], [2.5, 0.4, 0.8, 'R'], [3.5, 0.4, 0.8, 'R']], 33, 47);
        lead(A, 'lead', 'sawLead', { gain: 0.5, delay: 0.18, reverb: 0.15 }, { quantize: 0.8, center: 72, lo: 55, hi: 91 }, 0.6);
        A.drums('909', 0.9);
        A.playDrums(PAT.electronic, { crashEvery: 8, fills: A.level === 2 });
        if (A.level === 2) {
          A.playDrums(PAT.electronicHats, {});
          A.track('arp', 'squareLead', { gain: 0.22, pan: 0.3, duck: true, delay: 0.25 });
          arpeggio(A, 'arp', 'triad', 60, 79, 0.25, 0.5);
        }
      },
    },

    metal: {
      ai: ['fills'],
      patterns: { main: PAT.metal },
      build(A) {
        A.master({ reverb: { seconds: 1.2, decay: 3, wet: 0.1 } });
        if (A.level === 0) {
          subtle(A, { keys: 'odGtr', bass: 'pickBass', quantize: 0.5, light: [[0, 'kick', 0.7], [8, 'kick', 0.7], [4, 'snare', 0.7], [12, 'snare', 0.7]], kit: 'metal', keysOpts: { dist: 0.15, gain: 0.6 } });
          return;
        }
        const bold = A.level === 2;
        const steps = bold ? [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15] : [0, 2, 4, 6, 8, 10, 12, 14];
        [['rhyL', -0.75, 0], ['rhyR', 0.75, 0.006]].forEach(([id, pan, late]) => {
          A.track(id, 'distGtr', { gain: 0.5, pan, dist: 0.3, reverb: 0.06 });
          A.eachBar((b0) => {
            steps.forEach((s) => {
              const b = b0 + s / 4;
              const chord = A.chordAt(b + 0.01), prev = A.chordAt(b - 0.24);
              const changed = chord.root !== prev.root || s === 0;
              const notes = A.voicing(chord, 'power', 38, 49, id);
              (changed ? notes : notes.slice(0, 2)).forEach((p) => A.note(id, b + late / A.grid.period, changed ? 0.45 : 0.2, p, changed ? 0.9 : 0.7));
            });
          });
        });
        A.track('bass', 'pickBass', { gain: 0.85, dist: 0.1 });
        straightBass(A, 'bass', 0.5, 0.45, 28, 40, 0.8);
        const mel = lead(A, 'lead', 'distGtr', { gain: 0.6, dist: 0.2, reverb: 0.12 }, { quantize: 0.7, center: 69, lo: 52, hi: 88 }, 0.65);
        if (bold) {
          A.track('harm', 'distGtr', { gain: 0.38, pan: 0.3, dist: 0.2, reverb: 0.12 });
          mel.forEach((n) => A.note('harm', n.b, n.len, A.thirdAbove(n.p), 0.55));
        }
        A.drums('metal', 0.95);
        A.playDrums(bold ? PAT.metalBold : PAT.metal, { crashEvery: 2, fills: bold });
      },
    },

    rock: {
      ai: ['fills', 'groove'],
      patterns: { main: PAT.rock },
      build(A) {
        A.master({ reverb: { seconds: 1.4, decay: 3, wet: 0.12 } });
        if (A.level === 0) {
          subtle(A, { keys: 'odGtr', bass: 'pickBass', quantize: 0.4, light: only(PAT.rock, ['hat', 'kick', 'snare'], 0.55), kit: 'rock', keysOpts: { gain: 0.6, dist: 0.08 } });
          return;
        }
        const bold = A.level === 2;
        (bold ? [['rhyL', -0.7, 0], ['rhyR', 0.7, 0.008]] : [['rhy', -0.3, 0]]).forEach(([id, pan, late]) => {
          A.track(id, 'distGtr', { gain: bold ? 0.45 : 0.55, pan, dist: 0.15, reverb: 0.08 });
          A.eachBar((b0) => {
            for (let e = 0; e < 8; e++) {
              const b = b0 + e / 2;
              A.voicing(A.chordAt(b + 0.01), 'power', 40, 51, id).forEach((p) => A.note(id, b + late / A.grid.period, 0.45, p, e % 2 ? 0.62 : 0.8));
            }
          });
        });
        A.track('bass', 'pickBass', { gain: 0.9 });
        straightBass(A, 'bass', 0.5, 0.45, 28, 43, 0.78);
        const mel = lead(A, 'lead', 'odGtr', { gain: 0.75, pan: 0.1, dist: 0.1, reverb: 0.15 }, { quantize: 0.6, center: 67, lo: 52, hi: 88 }, 0.6);
        if (bold) {
          A.track('octave', 'odGtr', { gain: 0.3, pan: -0.2, dist: 0.1, reverb: 0.15 });
          mel.forEach((n) => A.note('octave', n.b, n.len, n.p + 12, 0.5));
          A.track('organ', 'rockOrgan', { gain: 0.22, reverb: 0.2 });
          sustainedChords(A, 'organ', 'triad', 55, 74, 0.4, 4, 0);
        }
        A.drums('rock', 0.95);
        A.playDrums(PAT.rock, { crashEvery: 4, fills: bold, groove: bold });
      },
    },
  };

  root.GTGenres = GENRES;
})(typeof window !== 'undefined' ? window : globalThis);
