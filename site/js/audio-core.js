/* Shared Web Audio graph used by the synth preview and the file player:
   input → mood (low-pass + high-shelf) → compressor → analyser → speakers.
   The AudioContext is created lazily on the first user gesture (play). */
(function () {
  'use strict';

  let ctx = null;
  let input, tone, shelf, comp, analyser, samples;
  let mood = 0.5;
  let smooth = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    input = ctx.createGain();
    input.gain.value = 0.85;

    tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.4;

    shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 5000;

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    samples = new Float32Array(analyser.fftSize);

    input.connect(tone);
    tone.connect(shelf);
    shelf.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);

    applyMood(true);
    return ctx;
  }

  /* Mood 0 = dark (muffled), 0.5 = neutral, 1 = bright (open + shelf boost). */
  function applyMood(immediate) {
    if (!ctx) return;
    const cutoff = mood <= 0.5
      ? 600 * Math.pow(9000 / 600, mood / 0.5)
      : 9000 * Math.pow(19000 / 9000, (mood - 0.5) / 0.5);
    const shelfDb = mood > 0.5 ? (mood - 0.5) * 16 : 0;
    const t = ctx.currentTime;
    if (immediate) {
      tone.frequency.setValueAtTime(cutoff, t);
      shelf.gain.setValueAtTime(shelfDb, t);
    } else {
      tone.frequency.setTargetAtTime(cutoff, t, 0.06);
      shelf.gain.setTargetAtTime(shelfDb, t, 0.06);
    }
  }

  function setMood(v) {
    mood = Math.max(0, Math.min(1, v));
    applyMood(false);
  }

  /* Smoothed loudness 0..1 for visuals (fast attack, slow release). */
  function level() {
    if (!analyser || ctx.state !== 'running') {
      smooth *= 0.92;
      return smooth;
    }
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const v = Math.min(1, Math.sqrt(sum / samples.length) * 2.2);
    smooth += (v - smooth) * (v > smooth ? 0.35 : 0.08);
    return smooth;
  }

  window.GTAudio = {
    ensure,
    setMood,
    level,
    get ctx() { return ctx; },
    get input() { return input; },
  };
})();
