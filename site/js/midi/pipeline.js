/* The in-browser genre-transfer pipeline: MP3 → MIDI → genre → MP3.
     1. decode the upload (≤ MAX_SECONDS), resample to 22.05 kHz mono;
     2. transcribe to MIDI notes with Basic Pitch (transcribe-worker.js);
     3. analyse: beats, key, chords, melody (analyse.js);
     4. per genre × strength: arrange (arranger.js + genres.js, with Magenta models at Bold),
        render to audio (render.js) and hand back a WAV blob URL for the player.
   Nothing leaves the browser; only models and instrument samples are downloaded.

   const job = GTPipeline.create(file, { onProgress(stage, fraction) });
   await job.ready;                                  // score + original WAV
   const out = await job.render('jazz', 'balanced');   // { url, buffer, arrangement }
*/
(function () {
  'use strict';

  const MAX_SECONDS = 60;
  const WORKER_URL = 'js/midi/transcribe-worker.js';
  let worker = null;

  function supported() {
    if (location.protocol === 'file:') {
      return { ok: false, reason: 'Transforming uploads needs the site served over http (GitHub Pages, or "python -m http.server" in site/).' };
    }
    if (!window.OfflineAudioContext || !window.Worker) return { ok: false, reason: 'This browser cannot run the in-browser pipeline.' };
    return { ok: true };
  }

  function getWorker() {
    if (!worker) worker = new Worker(new URL(WORKER_URL, document.baseURI), { type: 'module' });
    return worker;
  }

  function transcribe(samples, onProgress) {
    return new Promise((resolve, reject) => {
      const w = getWorker();
      const onMsg = (e) => {
        const m = e.data;
        if (m.type === 'progress') { onProgress(m.value); return; }
        w.removeEventListener('message', onMsg);
        w.removeEventListener('error', onErr);
        if (m.type === 'done') resolve(m);
        else reject(new Error('Transcription failed: ' + m.message));
      };
      const onErr = (e) => {
        w.removeEventListener('message', onMsg);
        w.removeEventListener('error', onErr);
        worker = null;
        reject(new Error('The transcription worker could not start' + (e && e.message ? ': ' + e.message : '.')));
      };
      w.addEventListener('message', onMsg);
      w.addEventListener('error', onErr);
      w.postMessage({ samples });
    });
  }

  async function decode(file) {
    const ab = await file.arrayBuffer();
    const ctx = new OfflineAudioContext(2, 1, 44100);
    let full;
    try {
      full = await ctx.decodeAudioData(ab);
    } catch (e) {
      throw new Error('Could not decode this file. Try an MP3 or WAV.');
    }
    const len = Math.min(full.length, Math.round(MAX_SECONDS * full.sampleRate));
    const trimmed = full.length > len;
    // Stereo copy (trimmed) used as the "original" in A/B, so both versions have the same length.
    const orig = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: full.sampleRate });
    for (let c = 0; c < 2; c++) orig.copyToChannel(full.getChannelData(Math.min(c, full.numberOfChannels - 1)).subarray(0, len), c);
    // Mono 22.05 kHz for Basic Pitch.
    const monoCtx = new OfflineAudioContext(1, Math.ceil((len / full.sampleRate) * 22050), 22050);
    const src = monoCtx.createBufferSource();
    src.buffer = orig;
    src.connect(monoCtx.destination);
    src.start();
    const mono = await monoCtx.startRendering();
    return { orig, mono: mono.getChannelData(0), trimmed, fullSeconds: full.duration };
  }

  function create(file, opts) {
    opts = opts || {};
    const progress = (stage, f) => { if (opts.onProgress) opts.onProgress(stage, f); };
    const job = {
      name: file.name.replace(/\.[^.]+$/, ''),
      score: null,
      originalUrl: null,
      outputs: {},  // "genre:preset" → { url, buffer, arrangement }
      aiCache: {},
      info: {},
    };
    const promises = {};
    let queue = Promise.resolve();

    job.ready = (async () => {
      const t0 = performance.now();
      progress('Decoding', 0);
      const d = await decode(file);
      job.duration = d.orig.duration;
      job.info.trimmed = d.trimmed;
      job.info.fullSeconds = d.fullSeconds;
      job.originalUrl = URL.createObjectURL(window.GTExport.toWav(d.orig));
      progress('Transcribing', 0);
      const tr = await transcribe(d.mono, (f) => progress('Transcribing', f));
      job.info.transcribeSeconds = tr.seconds;
      job.info.backend = tr.backend;
      job.rawNotes = tr.notes;
      progress('Analysing', 0);
      await new Promise((r) => setTimeout(r, 0));
      job.score = window.GTAnalyse.buildScore({ samples: d.mono, sr: 22050, duration: d.orig.duration, rawNotes: tr.notes });
      job.info.analysisSeconds = (performance.now() - t0) / 1000;
      if (!job.score.notes.length) throw new Error('No notes were found in this clip.');
      progress('Ready', 1);
      return job.score;
    })();

    async function build(genre, preset, onStage) {
      const t0 = performance.now();
      const score = await job.ready;
      let ai = {};
      let errors = [];
      if (preset === 'bold' && window.GTModels) {
        const ctx = new window.GTArranger.Arrangement(score, genre, 1, {});
        const r = await window.GTModels.partsFor(genre, ctx, job.aiCache, (label, f) => onStage(label, f));
        ai = r.ai;
        errors = r.errors;
      }
      onStage('Arranging', 0);
      const arrangement = window.GTArranger.arrange(score, genre, preset, ai);
      arrangement.errors = errors;
      onStage('Rendering', 0);
      const buffer = await window.GTRender.render(arrangement, {
        targetRms: score.rms,
        onLoad: (f) => onStage('Samples', f),
      });
      const url = URL.createObjectURL(window.GTExport.toWav(buffer));
      return { url, buffer, arrangement, seconds: (performance.now() - t0) / 1000 };
    }

    /* Renders run one at a time; the newest request goes next. */
    const pending = [];
    function pump() {
      queue = queue.then(async () => {
        const item = pending.shift();
        if (!item) return;
        try {
          const out = await build(item.genre, item.preset, item.onStage);
          job.outputs[item.key] = out;
          item.resolve(out);
        } catch (err) {
          delete promises[item.key];
          item.reject(err);
        }
      });
    }
    job.render = function (genre, preset, onStage) {
      const key = genre + ':' + preset;
      if (promises[key]) {
        const ix = pending.findIndex((p) => p.key === key);
        if (ix > 0) pending.unshift(pending.splice(ix, 1)[0]);
        return promises[key];
      }
      promises[key] = new Promise((resolve, reject) => {
        pending.unshift({ key, genre, preset, resolve, reject, onStage: onStage || (() => {}) });
        pump();
      });
      return promises[key];
    };
    job.get = (genre, preset) => job.outputs[genre + ':' + preset] || null;
    job.dispose = function () {
      if (job.originalUrl) URL.revokeObjectURL(job.originalUrl);
      Object.values(job.outputs).forEach((o) => URL.revokeObjectURL(o.url));
    };
    job.exportMp3 = (genre, preset) => window.GTExport.toMp3(job.get(genre, preset).buffer);
    job.exportMidi = (genre, preset) => window.GTExport.arrangementToMidi(job.get(genre, preset).arrangement, programs());
    job.exportSourceMidi = () => window.GTExport.notesToMidi(job.score.notes, job.score.bpm, job.name);
    return job;
  }

  function programs() {
    const out = {};
    Object.entries(window.GTRender.INSTRUMENTS).forEach(([id, i]) => { out[id] = i.program; });
    return out;
  }

  window.GTPipeline = { supported, create, MAX_SECONDS };
})();
