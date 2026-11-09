/* Browser-synthesised preview (a stand-in, NOT a model output).
   One public-domain theme (Edvard Grieg, "In the Hall of the Mountain King",
   Peer Gynt, 1875) is arranged three ways: a plain sketch ("original"),
   a classical arrangement (piano + Alberti accompaniment + hall reverb) and a
   rock arrangement (the theme on a driven bass guitar, power chords, drums).
   All three play in sync; style and strength only move the layer gains, so
   switching is instant and keeps the beat. Real model outputs replace this
   once they are listed in demo/manifest.json. */
(function () {
  'use strict';

  const BPM = 120;
  const STEP = 60 / BPM / 4;   // one sixteenth note in seconds
  const BAR = 16;              // sixteenths per 4/4 bar
  const TOTAL = BAR * 8;       // 8-bar loop (16 s)
  const LOOKAHEAD = 0.12;      // seconds scheduled ahead of the clock

  // The theme in B minor, notes as [midi, step length, sounding length] in sixteenths.
  // Staccato eighths sound for one sixteenth ("molto marcato").
  // Checked against a public transcription (flutetunes.com).
  const PHRASE = [
    [[59, 2, 1], [61, 2, 1], [62, 2, 1], [64, 2, 1], [66, 2, 1], [62, 2, 1], [66, 4, 2]],          // B C# D E F# D F#
    [[65, 2, 1], [61, 2, 1], [65, 4, 2], [64, 2, 1], [60, 2, 1], [64, 4, 2]],                      // E# C# E#  E C E
    [[59, 2, 1], [61, 2, 1], [62, 2, 1], [64, 2, 1], [66, 2, 1], [62, 2, 1], [66, 2, 1], [71, 2, 1]], // B C# D E F# D F# B
    [[69, 2, 1], [66, 2, 1], [62, 2, 1], [66, 2, 1], [69, 8, 8]],                                  // A F# D F# A
  ];
  // Second statement an octave higher, as in the score.
  const MELODY = PHRASE.concat(PHRASE.map((bar) => bar.map(([m, len, sound]) => [m + 12, len, sound])));
  const melodyAt = [];
  let cursor = 0;
  MELODY.forEach((bar) => bar.forEach(([midi, len, sound]) => {
    melodyAt[cursor] = { midi, sound };
    cursor += len;
  }));

  // One chord per half bar: a B-minor pedal (Grieg's ostinato) with D major at phrase ends.
  const HARMONY = 'BBBBBBDDBBBBBBDD';
  const CHORDS = {
    B: { root: 47, tones: [47, 50, 54] }, // B2 · D3 F#3
    D: { root: 50, tones: [50, 54, 57] }, // D3 · F#3 A3
  };
  const ALBERTI = [0, 2, 1, 2];        // root, fifth, third, fifth

  const mix = { style: 'classical', strength: 0.55, ab: 'styled' };
  let ctx = null, layers = null, bus = null, noise = null;
  let running = false, timer = null, nextTime = 0, step = 0;

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- graph ---------- */
  function gainNode(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function lowpass(f) {
    const b = ctx.createBiquadFilter();
    b.type = 'lowpass';
    b.frequency.value = f;
    b.Q.value = 0.7;
    return b;
  }
  function link(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[0];
  }
  function shaper(k) {
    const n = 2048, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    const s = ctx.createWaveShaper();
    s.curve = curve;
    s.oversample = '4x';
    return s;
  }
  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function whiteNoise(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function build() {
    if (layers) return;
    ctx = window.GTAudio.ensure();

    layers = { original: gainNode(0), classical: gainNode(0), rock: gainNode(0) };
    Object.values(layers).forEach((g) => g.connect(window.GTAudio.input));

    bus = {};
    bus.original = layers.original;
    // Classical: dry signal plus a hall reverb.
    bus.classical = gainNode(1);
    bus.classical.connect(layers.classical);
    const hall = ctx.createConvolver();
    hall.buffer = impulse(2.8, 2.6);
    link(bus.classical, hall, gainNode(0.45), layers.classical);
    // Rock: heavily driven rhythm guitar, a lightly driven bass guitar carrying the theme, drums.
    bus.rhythm = link(gainNode(1), shaper(260), lowpass(3200), gainNode(0.4), layers.rock);
    bus.bassGtr = link(gainNode(1), shaper(25), lowpass(2400), gainNode(0.95), layers.rock);
    bus.kit = link(gainNode(0.75), layers.rock);

    noise = whiteNoise(1);
    applyMix(true);
  }

  /* ---------- voices ---------- */
  function osc(type, freq, t, end, dest, detune) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }
  function envelope(dest, t, peak, attack, hold, release) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(dest);
    return { g, end: t + attack + hold + release };
  }

  function sine(midi, t, dur, dest, peak) {
    const { g, end } = envelope(dest, t, peak, 0.02, Math.max(0.01, dur - 0.12), 0.1);
    osc('sine', hz(midi), t, end, g);
  }
  function piano(midi, t, dest, peak, dur) {
    const f0 = hz(midi);
    const end = t + Math.min(1.6, (dur || 1.6) + 0.35); // short notes are damped
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f0 * 7), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(350, f0 * 1.6), end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(g);
    g.connect(dest);
    osc('triangle', f0, t, end, lp);
    const overtone = gainNode(0.28);
    overtone.connect(lp);
    osc('sine', f0 * 2, t, end, overtone);
  }
  function guitar(midis, t, dur, peak) {
    const { g, end } = envelope(bus.rhythm, t, peak, 0.004, Math.max(0.01, dur - 0.05), 0.045);
    midis.forEach((m) => {
      osc('sawtooth', hz(m), t, end, g, -7);
      osc('sawtooth', hz(m), t, end, g, 7);
    });
  }
  /* Rock: the theme on a picked, lightly driven bass guitar.
     A resonant low-pass opens on the pick and closes as the note rings. */
  function bassGuitar(midi, t, dur, peak) {
    const f0 = hz(midi);
    const { g, end } = envelope(bus.bassGtr, t, peak, 0.004, Math.max(0.02, dur - 0.04), 0.07);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 2.5;
    tone.frequency.setValueAtTime(Math.min(5000, f0 * 14), t);              // bright pick attack…
    tone.frequency.exponentialRampToValueAtTime(Math.max(260, f0 * 3), end); // …that darkens
    tone.connect(g);
    osc('sawtooth', f0, t, end, tone);
    osc('square', f0, t, end, tone, 4);
    const body = gainNode(0.6);
    body.connect(g);
    osc('sine', f0, t, end, body); // round low end
  }
  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(bus.kit);
    o.start(t);
    o.stop(t + 0.32);
  }
  function noiseHit(t, type, freq, peak, decay) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    s.connect(f);
    f.connect(g);
    g.connect(bus.kit);
    s.start(t, Math.random() * 0.5);
    s.stop(t + decay + 0.02);
  }
  function snare(t) {
    noiseHit(t, 'bandpass', 1800, 0.45, 0.18);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g);
    g.connect(bus.kit);
    o.start(t);
    o.stop(t + 0.1);
  }
  function hat(t, open) {
    noiseHit(t, 'highpass', 7200, open ? 0.12 : 0.07, open ? 0.22 : 0.05);
  }

  /* ---------- arrangement ---------- */
  function scheduleStep(s, t) {
    const chord = CHORDS[HARMONY[Math.floor(s / 8)]];
    const inBar = s % BAR;
    const note = melodyAt[s];

    if (note) {
      const dur = note.sound * STEP;
      sine(note.midi, t, dur, bus.original, 0.2);         // sketch
      piano(note.midi, t, bus.classical, 0.22, dur);      // classical
      bassGuitar(note.midi - 12, t, dur, 0.34);           // rock: theme on bass, an octave down
    }
    if (s % 8 === 0) {
      sine(chord.root, t, 8 * STEP * 0.95, bus.original, 0.13);
      piano(chord.root - 12, t, bus.classical, 0.1);
    }
    if (s % 2 === 0) {
      piano(chord.tones[ALBERTI[(s / 2) % 4]], t, bus.classical, 0.06, STEP * 2); // Alberti accompaniment
      // Power chords an octave above the bass so the two don't muddy each other.
      guitar([chord.root + 12, chord.root + 19, chord.root + 24], t, STEP * 1.5, 0.45);
      hat(t, inBar === 14);
    }
    if (inBar === 0 || inBar === 6 || inBar === 8) kick(t);
    if (inBar === 4 || inBar === 12 || (s >= TOTAL - 8 && s % 2 === 1)) snare(t); // backbeat + fill
  }

  function tick() {
    // If the tab was throttled, skip ahead instead of firing a burst of late notes.
    if (nextTime < ctx.currentTime - 0.05) nextTime = ctx.currentTime + 0.02;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % TOTAL;
    }
  }

  /* ---------- mixing ---------- */
  function applyMix(immediate) {
    if (!layers) return;
    const k = mix.ab === 'original' ? 0 : Math.max(0, Math.min(1, mix.strength));
    const values = { original: Math.cos((k * Math.PI) / 2), classical: 0, rock: 0 };
    if (mix.style === 'classical' || mix.style === 'rock') values[mix.style] = Math.sin((k * Math.PI) / 2);
    const now = ctx.currentTime;
    Object.keys(layers).forEach((name) => {
      const p = layers[name].gain;
      p.cancelScheduledValues(now);
      if (immediate) p.setValueAtTime(values[name], now);
      else p.setTargetAtTime(values[name], now, 0.08);
    });
  }

  function setMix(m) {
    if (m) {
      mix.style = m.style;
      mix.strength = m.strength;
      mix.ab = m.ab;
    }
    applyMix(false);
  }

  function start() {
    build();
    if (running) return;
    running = true;
    nextTime = ctx.currentTime + 0.05;
    tick();
    timer = setInterval(tick, 25);
  }

  function pause() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  window.GTSynth = {
    start,
    pause,
    setMix,
    get running() { return running; },
  };
})();
