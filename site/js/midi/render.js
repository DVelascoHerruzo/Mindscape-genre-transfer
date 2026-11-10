/* Step 4 of the pipeline: MIDI → audio.
   Renders an arrangement offline (OfflineAudioContext, 44.1 kHz stereo) with
   - sampled instruments: FluidR3_GM soundfont, one MP3 per note from the
     midi-js-soundfonts CDN (CC BY 3.0, https://github.com/gleitz/midi-js-soundfonts);
   - synthesised drum kits (no CC-licensed GM drum kit is available as samples);
   - per-genre effects: distortion, room/hall reverb, delay, lo-fi tape chain,
     sidechain "pumping", master compression.
   The result is loudness-matched to the original clip and has exactly its length,
   so the player can switch between them at the same position. */
(function () {
  'use strict';

  const SR = 44100;
  const SF_BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  /* id → soundfont name, GM program, playable range, envelope, loop for long notes. */
  const INSTRUMENTS = {
    piano: { sf: 'acoustic_grand_piano', program: 0, attack: 0.002, release: 0.35 },
    brightPiano: { sf: 'bright_acoustic_piano', program: 1, attack: 0.002, release: 0.3 },
    ep: { sf: 'electric_piano_1', program: 4, attack: 0.003, release: 0.4 },
    celesta: { sf: 'celesta', program: 8, attack: 0.002, release: 0.8 },
    vibes: { sf: 'vibraphone', program: 11, attack: 0.002, release: 0.6 },
    rockOrgan: { sf: 'rock_organ', program: 18, attack: 0.02, release: 0.12, loop: true },
    steelGtr: { sf: 'acoustic_guitar_steel', program: 25, attack: 0.002, release: 0.25 },
    jazzGtr: { sf: 'electric_guitar_jazz', program: 26, attack: 0.002, release: 0.2 },
    cleanGtr: { sf: 'electric_guitar_clean', program: 27, attack: 0.002, release: 0.2 },
    odGtr: { sf: 'overdriven_guitar', program: 29, attack: 0.003, release: 0.15, loop: true },
    distGtr: { sf: 'distortion_guitar', program: 30, attack: 0.003, release: 0.08, loop: true },
    acBass: { sf: 'acoustic_bass', program: 32, attack: 0.003, release: 0.12 },
    fingerBass: { sf: 'electric_bass_finger', program: 33, attack: 0.003, release: 0.1 },
    pickBass: { sf: 'electric_bass_pick', program: 34, attack: 0.002, release: 0.08 },
    synthBass: { sf: 'synth_bass_1', program: 38, attack: 0.002, release: 0.06 },
    violin: { sf: 'violin', program: 40, attack: 0.04, release: 0.25, loop: true },
    viola: { sf: 'viola', program: 41, attack: 0.04, release: 0.25, loop: true },
    cello: { sf: 'cello', program: 42, attack: 0.04, release: 0.3, loop: true },
    contrabass: { sf: 'contrabass', program: 43, attack: 0.05, release: 0.3, loop: true },
    strings: { sf: 'string_ensemble_1', program: 48, attack: 0.15, release: 0.6, loop: true },
    synthStrings: { sf: 'synth_strings_1', program: 50, attack: 0.2, release: 0.8, loop: true },
    choir: { sf: 'choir_aahs', program: 52, attack: 0.25, release: 0.9, loop: true },
    tenorSax: { sf: 'tenor_sax', program: 66, attack: 0.02, release: 0.12, loop: true },
    squareLead: { sf: 'lead_1_square', program: 80, attack: 0.002, release: 0.08, loop: true },
    sawLead: { sf: 'lead_2_sawtooth', program: 81, attack: 0.005, release: 0.15, loop: true },
    warmPad: { sf: 'pad_2_warm', program: 89, attack: 0.5, release: 1.5, loop: true },
    polySynth: { sf: 'pad_3_polysynth', program: 90, attack: 0.01, release: 0.3, loop: true },
    haloPad: { sf: 'pad_7_halo', program: 94, attack: 0.6, release: 1.8, loop: true },
  };

  /* ---------- samples ---------- */
  const cache = new Map();   // "sf:pitch" → Promise<AudioBuffer|null>
  const resolved = new Map(); // "sf:pitch" → { buffer, rate }
  let decodeCtx = null;
  let active = 0;
  const waiting = [];
  function limit(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(() => {
          active--;
          if (waiting.length) waiting.shift()();
        });
      };
      if (active < 12) run(); else waiting.push(run);
    });
  }
  const noteName = (p) => NAMES[p % 12] + (Math.floor(p / 12) - 1);
  function fetchSample(sf, p) {
    const key = sf + ':' + p;
    if (!cache.has(key)) {
      if (p < 21 || p > 108) { cache.set(key, Promise.resolve(null)); return cache.get(key); }
      if (!decodeCtx) decodeCtx = new OfflineAudioContext(2, 1, SR);
      cache.set(key, limit(() => fetch(SF_BASE + sf + '-mp3/' + noteName(p) + '.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab ? decodeCtx.decodeAudioData(ab) : null))
        .catch(() => null)));
    }
    return cache.get(key);
  }
  /* The exact pitch if it exists, otherwise the nearest one, re-pitched. */
  async function sampleFor(sf, p) {
    const key = sf + ':' + p;
    if (resolved.has(key)) return resolved.get(key);
    let result = null;
    for (const d of [0, 1, -1, 2, -2, 3, -3, 5, -5, 7, -7, 12, -12]) {
      const buf = await fetchSample(sf, p + d);
      if (buf) { result = { buffer: buf, rate: Math.pow(2, -d / 12) }; break; }
    }
    resolved.set(key, result);
    return result;
  }
  async function preload(arr, onProgress) {
    const jobs = [];
    arr.tracks.forEach((t) => {
      const inst = INSTRUMENTS[t.inst];
      if (!inst) return;
      new Set(t.notes.map((n) => n.p)).forEach((p) => jobs.push([inst.sf, p]));
    });
    let done = 0;
    await Promise.all(jobs.map(([sf, p]) => sampleFor(sf, p).then(() => {
      done++;
      if (onProgress) onProgress(done / jobs.length);
    })));
  }

  /* ---------- building blocks ---------- */
  function impulse(ctx, seconds, decay) {
    const len = Math.floor(SR * seconds);
    const buf = ctx.createBuffer(2, len, SR);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function shaperCurve(k) {
    const n = 2048, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
  function filter(ctx, type, f, q) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q != null) b.Q.value = q;
    return b;
  }
  function gain(ctx, v) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }
  function noiseBuffer(ctx, seconds) {
    const len = Math.floor(SR * seconds);
    const buf = ctx.createBuffer(1, len, SR);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  /* Vinyl: sparse crackle + faint hiss. */
  function vinylBuffer(ctx, seconds, amount) {
    const len = Math.floor(SR * seconds);
    const buf = ctx.createBuffer(2, len, SR);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.012 * amount;
        if (Math.random() < 0.00035 * amount) {
          const amp = (Math.random() * 0.5 + 0.2) * amount;
          for (let j = 0; j < 40 && i + j < len; j++) d[i + j] += amp * (Math.random() * 2 - 1) * Math.exp(-j / 6);
        }
      }
    }
    return buf;
  }

  /* ---------- synthesised drums ---------- */
  const KITS = {
    rock: { kick: [120, 48, 0.38, 0.35], snare: [1900, 0.22, 185, 0.6], hat: [7800, 0.05], gain: 1 },
    metal: { kick: [150, 52, 0.2, 0.8], snare: [2300, 0.18, 210, 0.55], hat: [8500, 0.04], gain: 1 },
    pop: { kick: [110, 45, 0.42, 0.3], snare: [2000, 0.2, 190, 0.5], hat: [8000, 0.045], gain: 1, clap: true },
    jazz: { kick: [90, 50, 0.3, 0.05], snare: [3500, 0.28, 180, 0.15], hat: [8200, 0.06], gain: 0.9, brush: true },
    lofi: { kick: [85, 42, 0.5, 0.1], snare: [1500, 0.2, 170, 0.5], hat: [6500, 0.04], gain: 0.9 },
    '909': { kick: [190, 48, 0.42, 0.6], snare: [2200, 0.18, 200, 0.4], hat: [9000, 0.05], gain: 1, metallic: true, clap: true },
  };
  function drumVoice(ctx, out, noise, kit, kind, t, v) {
    const K = KITS[kit] || KITS.rock;
    const level = Math.pow(v, 1.4) * K.gain;
    const env = (node, peak, dec, start) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + (start || 0.001));
      g.gain.exponentialRampToValueAtTime(0.0008, t + dec);
      node.connect(g);
      g.connect(out);
      return g;
    };
    const osc = (type, f0, f1, dur, peak, dec) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(o, peak, dec);
      o.start(t);
      o.stop(t + dec + 0.05);
    };
    const noiseHit = (type, f, q, peak, dec, offset) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const fl = filter(ctx, type, f, q);
      s.connect(fl);
      const tt = t + (offset || 0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(peak, tt + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0008, tt + dec);
      fl.connect(g);
      g.connect(out);
      s.start(tt, Math.random() * 0.5);
      s.stop(tt + dec + 0.05);
    };
    const metal = (peak, dec, hp) => { // 808/909-style metallic cluster
      const hpf = filter(ctx, 'highpass', hp, 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dec);
      hpf.connect(g);
      g.connect(out);
      [205.3, 304.4, 369.6, 522.7, 540, 800].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f * 2.2;
        o.connect(hpf);
        o.start(t);
        o.stop(t + dec + 0.05);
      });
    };
    switch (kind) {
      case 'kick': {
        const [f0, f1, dec, click] = K.kick;
        osc('sine', f0, f1, 0.12, 0.95 * level, dec);
        if (click) noiseHit('highpass', 3000, 0.7, 0.25 * click * level, 0.012);
        break;
      }
      case 'snare': {
        const [nf, dec, tf, toneAmt] = K.snare;
        if (K.brush) noiseHit('lowpass', nf, 0.5, 0.35 * level, dec);
        else noiseHit('bandpass', nf, 0.8, 0.7 * level, dec);
        osc('triangle', tf * 1.4, tf, 0.03, toneAmt * 0.6 * level, 0.1);
        break;
      }
      case 'rim': noiseHit('bandpass', 2500, 4, 0.5 * level, 0.04); osc('triangle', 1700, 0, 0, 0.3 * level, 0.03); break;
      case 'clap':
        [0, 0.011, 0.022].forEach((o) => noiseHit('bandpass', 1300, 1.2, 0.5 * level, 0.03, o));
        noiseHit('bandpass', 1300, 1.2, 0.4 * level, 0.18, 0.03);
        break;
      case 'hat':
        if (K.metallic) metal(0.18 * level, K.hat[1], 7000);
        else noiseHit('highpass', K.hat[0], 0.7, 0.32 * level, K.hat[1]);
        break;
      case 'pedal': noiseHit('highpass', 7000, 0.7, 0.18 * level, 0.04); break;
      case 'ohat':
        if (K.metallic) metal(0.16 * level, 0.3, 7000);
        else noiseHit('highpass', K.hat[0] - 800, 0.7, 0.26 * level, 0.32);
        break;
      case 'ride':
        noiseHit('bandpass', 5200, 1.5, 0.18 * level, 0.9);
        metal(0.05 * level, 0.7, 4000);
        break;
      case 'crash': noiseHit('highpass', 3500, 0.6, 0.45 * level, 1.7); break;
      case 'tom1': osc('sine', 230, 180, 0.2, 0.7 * level, 0.35); break;
      case 'tom2': osc('sine', 170, 130, 0.2, 0.7 * level, 0.4); break;
      case 'tom3': osc('sine', 120, 90, 0.25, 0.75 * level, 0.45); break;
      default: break;
    }
  }

  /* ---------- the render ---------- */
  async function render(arr, opts) {
    opts = opts || {};
    await preload(arr, opts.onLoad);
    const length = Math.max(1, Math.round(arr.duration * SR));
    const ctx = new OfflineAudioContext(2, length, SR);
    const M = arr.master || {};
    const beat = arr.beat || 0.5;

    // Master: mix → [lo-fi] → compressor → out
    const mix = gain(ctx, 0.8);
    let tail = mix;
    if (M.lofi) {
      const hp = filter(ctx, 'highpass', 70, 0.7);
      const lp = filter(ctx, 'lowpass', M.lofi === 'heavy' ? 3200 : 4500, 0.6);
      const sat = ctx.createWaveShaper();
      sat.curve = shaperCurve(4);
      tail.connect(hp); hp.connect(lp); lp.connect(sat);
      tail = sat;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.2;
    tail.connect(comp);
    comp.connect(ctx.destination);
    if (M.lofi) {
      const vin = ctx.createBufferSource();
      vin.buffer = vinylBuffer(ctx, Math.min(arr.duration, 8), M.lofi === 'heavy' ? 1.4 : 0.8);
      vin.loop = true;
      vin.connect(ctx.destination);
      vin.start(0);
    }

    // Shared reverb and delay sends
    const rv = M.reverb || { seconds: 1.5, decay: 3, wet: 0.12 };
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, rv.seconds, rv.decay);
    const reverbOut = gain(ctx, rv.wet * 2.2);
    reverb.connect(reverbOut);
    reverbOut.connect(mix);
    let delayIn = null;
    if (M.delay) {
      delayIn = gain(ctx, 1);
      const dl = ctx.createDelay(4);
      dl.delayTime.value = Math.min(3.9, M.delay.beats * beat);
      const fb = gain(ctx, M.delay.feedback);
      const tone = filter(ctx, 'lowpass', 3200, 0.5);
      const wet = gain(ctx, M.delay.wet * 2);
      delayIn.connect(dl); dl.connect(tone); tone.connect(fb); fb.connect(dl);
      tone.connect(wet); wet.connect(mix);
    }

    // Sidechain "pump": ducked tracks dip on every kick.
    const duck = gain(ctx, 1);
    duck.connect(mix);
    if (M.sidechain && arr.drums) {
      arr.drums.hits.filter((h) => h.k === 'kick').forEach((h) => {
        duck.gain.setValueAtTime(0.3, h.t);
        duck.gain.setTargetAtTime(1, h.t + 0.02, beat * 0.22);
      });
    }

    // Tape wow for lo-fi
    let wow = null;
    if (M.lofi) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.55;
      wow = gain(ctx, M.lofi === 'heavy' ? 14 : 7); // cents
      lfo.connect(wow);
      lfo.start(0);
    }

    // Instrument tracks
    for (const tr of arr.tracks) {
      const inst = INSTRUMENTS[tr.inst];
      if (!inst) continue;
      const input = gain(ctx, tr.gain * 0.5);
      let node = input;
      if (tr.lowpass) { const lp = filter(ctx, 'lowpass', tr.lowpass, 0.7); node.connect(lp); node = lp; }
      if (tr.dist) {
        const pre = gain(ctx, 1 + tr.dist * 6);
        const sh = ctx.createWaveShaper();
        sh.curve = shaperCurve(20 + tr.dist * 200);
        sh.oversample = '2x';
        const cab = filter(ctx, 'lowpass', 5200, 0.8);
        const post = gain(ctx, 1 / (1 + tr.dist * 3));
        node.connect(pre); pre.connect(sh); sh.connect(cab); cab.connect(post);
        node = post;
      }
      const pan = ctx.createStereoPanner();
      pan.pan.value = tr.pan || 0;
      node.connect(pan);
      pan.connect(tr.duck ? duck : mix);
      if (tr.reverb) { const s = gain(ctx, tr.reverb); pan.connect(s); s.connect(reverb); }
      if (tr.delay && delayIn) { const s = gain(ctx, tr.delay); pan.connect(s); s.connect(delayIn); }

      for (const n of tr.notes) {
        const smp = resolved.get(inst.sf + ':' + n.p);
        if (!smp) continue;
        const src = ctx.createBufferSource();
        src.buffer = smp.buffer;
        src.playbackRate.value = smp.rate;
        const avail = smp.buffer.duration / smp.rate;
        if (inst.loop && n.d > avail - 0.4) {
          src.loop = true;
          src.loopStart = 1.2;
          src.loopEnd = smp.buffer.duration - 0.1;
        }
        if (wow) wow.connect(src.detune);
        const g = ctx.createGain();
        const peak = Math.pow(n.v, 1.3);
        const end = n.t + n.d;
        const atk = Math.min(inst.attack, n.d * 0.5);
        g.gain.setValueAtTime(0, n.t);
        g.gain.linearRampToValueAtTime(peak, n.t + atk);
        g.gain.setValueAtTime(peak, end);
        g.gain.setTargetAtTime(0, end, inst.release / 3);
        src.connect(g);
        g.connect(input);
        src.start(n.t);
        src.stop(Math.min(arr.duration + 0.1, end + inst.release * 2 + 0.05));
      }
    }

    // Drums
    if (arr.drums) {
      const bus = gain(ctx, arr.drums.gain * 0.55);
      bus.connect(mix);
      const send = gain(ctx, 0.08);
      bus.connect(send);
      send.connect(reverb);
      const noise = noiseBuffer(ctx, 2);
      arr.drums.hits.forEach((h) => drumVoice(ctx, bus, noise, arr.drums.kit, h.k, h.t, h.v));
    }

    const buffer = await ctx.startRendering();
    normalise(buffer, opts.targetRms);
    return buffer;
  }

  /* Match the original's loudness, then soft-limit peaks below −1 dBFS. */
  function normalise(buffer, targetRms) {
    const chans = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
    let sum = 0, n = 0;
    chans.forEach((d) => { for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; n++; } });
    const rms = Math.sqrt(sum / Math.max(1, n));
    if (rms < 1e-6) return;
    const target = Math.min(0.2, Math.max(0.07, targetRms || 0.12));
    const g = target / rms;
    const knee = 0.75, ceil = 0.891; // −1 dBFS
    chans.forEach((d) => {
      for (let i = 0; i < d.length; i++) {
        let x = d[i] * g;
        const a = Math.abs(x);
        if (a > knee) x = Math.sign(x) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
        d[i] = isFinite(x) ? x : 0;
      }
    });
  }

  window.GTRender = { render, INSTRUMENTS };
})();
