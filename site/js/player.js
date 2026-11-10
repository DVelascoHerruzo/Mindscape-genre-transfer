/* Player: routes either the synth preview or real audio files (from the
   manifest or an upload) through the shared graph. File outputs crossfade
   between two <audio> elements and keep the playback position, so switching
   genre / strength / model / A-B feels instant. */
(function () {
  'use strict';

  const state = { style: 'classical', strength: 0.55, preset: 'balanced', ab: 'styled', model: 'synth' };
  const els = [new Audio(), new Audio()];
  els.forEach((el) => {
    el.preload = 'auto';
    el.loop = true;
  });
  let track = null, playing = false, active = 0, currentSrc = null, gains = null;

  function ensureGraph() {
    if (gains) return;
    const ctx = window.GTAudio.ensure();
    gains = els.map((el) => {
      const src = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(window.GTAudio.input);
      return g;
    });
  }

  function sourceFor() {
    if (!track || track.type === 'synth') return { src: null };
    if (state.ab === 'original') {
      return track.original ? { src: track.original } : { src: null, reason: 'This track has no original audio file.' };
    }
    const byModel = track.outputs && track.outputs[state.model];
    const byGenre = byModel && byModel[state.style];
    const src = byGenre && (byGenre[state.preset] || byGenre.balanced || byGenre.bold || byGenre.subtle);
    if (src) return { src };
    return {
      src: null,
      reason: track.upload
        ? 'Styled versions of uploads need the local model server (live mode).'
        : 'No ' + state.style + ' output from this model yet.',
    };
  }

  function waitForMetadata(el) {
    return new Promise((resolve) => {
      if (el.readyState >= 1) return resolve();
      const done = () => {
        el.removeEventListener('loadedmetadata', done);
        el.removeEventListener('error', done);
        resolve();
      };
      el.addEventListener('loadedmetadata', done);
      el.addEventListener('error', done);
    });
  }

  async function switchSource(src) {
    if (src === currentSrc) return;
    ensureGraph();
    const ctx = window.GTAudio.ctx;
    const from = active, to = 1 - active;
    const position = els[from].src ? els[from].currentTime : 0;
    currentSrc = src;
    els[to].src = src;
    await waitForMetadata(els[to]);
    if (currentSrc !== src) return; // a newer switch replaced this one
    if (isFinite(els[to].duration) && els[to].duration > 0) {
      try { els[to].currentTime = position % els[to].duration; } catch (e) { /* not seekable yet */ }
    }
    if (playing) {
      try { await els[to].play(); } catch (e) { /* blocked until a user gesture */ }
    }
    const now = ctx.currentTime;
    gains[to].gain.cancelScheduledValues(now);
    gains[to].gain.setTargetAtTime(1, now, 0.06);
    gains[from].gain.cancelScheduledValues(now);
    gains[from].gain.setTargetAtTime(0, now, 0.06);
    active = to;
    const old = els[from];
    setTimeout(() => { if (els[active] !== old) old.pause(); }, 400);
  }

  function apply() {
    if (!track) return { ok: false };
    if (track.type === 'synth') {
      window.GTSynth.setMix(state);
      return { ok: true };
    }
    const { src, reason } = sourceFor();
    if (!src) return { ok: false, reason };
    switchSource(src);
    return { ok: true };
  }

  function silenceFiles() {
    els.forEach((el) => el.pause());
    if (gains) {
      const now = window.GTAudio.ctx.currentTime;
      gains.forEach((g) => {
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(0, now, 0.03);
      });
    }
  }

  async function play() {
    if (!track) return { ok: false };
    const ctx = window.GTAudio.ensure();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (e) { /* ignore */ }
    }
    playing = true;
    if (track.type === 'synth') {
      silenceFiles();
      window.GTSynth.setMix(state);
      window.GTSynth.start();
      return { ok: true };
    }
    window.GTSynth.pause();
    const r = apply();
    if (!r.ok) {
      playing = false;
      return r;
    }
    const el = els[active];
    if (el.src) {
      try { await el.play(); } catch (e) { /* ignore */ }
      if (gains) gains[active].gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    }
    return { ok: true };
  }

  function pause() {
    playing = false;
    window.GTSynth.pause();
    els.forEach((el) => el.pause());
  }

  function toggle() {
    if (playing) {
      pause();
      return Promise.resolve({ ok: true });
    }
    return play();
  }

  function load(t, s) {
    const resume = playing;
    pause();
    silenceFiles();
    currentSrc = null;
    els.forEach((el) => {
      el.removeAttribute('src');
      el.load();
    });
    track = t;
    Object.assign(state, s || {});
    const r = apply();
    if (resume) play();
    return r;
  }

  function setState(s) {
    Object.assign(state, s);
    return apply();
  }

  window.GTPlayer = {
    load,
    setState,
    play,
    pause,
    toggle,
    get playing() { return playing; },
    get position() { return els[active].currentTime; }, // seconds into the current file
  };
})();
