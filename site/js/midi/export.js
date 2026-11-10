/* Files out of the pipeline: WAV (for playback), MP3 (download, lamejs, LGPL-3.0)
   and MIDI (download, @tonejs/midi, MIT). The encoders load on first use. */
(function () {
  'use strict';

  const LAME_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
  const MIDI_URL = 'https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/build/Midi.js';
  const DRUM_PITCH = { kick: 36, snare: 38, rim: 37, clap: 39, hat: 42, pedal: 44, ohat: 46, crash: 49, ride: 51, tom1: 50, tom2: 47, tom3: 43 };
  const scripts = {};

  function loadScript(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (!scripts[url]) {
      scripts[url] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error(globalName + ' did not load')));
        s.onerror = () => { delete scripts[url]; reject(new Error('Could not load ' + url)); };
        document.head.appendChild(s);
      });
    }
    return scripts[url];
  }

  function toInt16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const x = Math.max(-1, Math.min(1, f32[i]));
      out[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
    }
    return out;
  }

  function toWav(buffer) {
    const ch = Math.min(2, buffer.numberOfChannels), sr = buffer.sampleRate, n = buffer.length;
    const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
    str(36, 'data'); data.setUint32(40, n * ch * 2, true);
    const chans = [];
    for (let c = 0; c < ch; c++) chans.push(toInt16(buffer.getChannelData(c)));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { data.setInt16(o, chans[c][i], true); o += 2; }
    return new Blob([data.buffer], { type: 'audio/wav' });
  }

  async function toMp3(buffer, kbps) {
    const lame = await loadScript(LAME_URL, 'lamejs');
    const ch = Math.min(2, buffer.numberOfChannels);
    const enc = new lame.Mp3Encoder(ch, buffer.sampleRate, kbps || 192);
    const L = toInt16(buffer.getChannelData(0));
    const R = ch > 1 ? toInt16(buffer.getChannelData(1)) : null;
    const parts = [];
    const BLOCK = 1152 * 20;
    for (let i = 0; i < L.length; i += BLOCK) {
      const out = R ? enc.encodeBuffer(L.subarray(i, i + BLOCK), R.subarray(i, i + BLOCK)) : enc.encodeBuffer(L.subarray(i, i + BLOCK));
      if (out.length) parts.push(new Uint8Array(out));
      if (i % (BLOCK * 20) === 0) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  /* Arrangement → multi-track MIDI (GM programs, drums on channel 10). */
  async function arrangementToMidi(arr, programs) {
    const Midi = (await loadScript(MIDI_URL, 'Midi')).Midi || window.Midi;
    const midi = new Midi();
    midi.header.setTempo(arr.bpm);
    midi.header.name = arr.genre + ' · ' + arr.preset;
    let channel = 0;
    arr.tracks.forEach((t) => {
      const tr = midi.addTrack();
      tr.name = t.id;
      if (channel === 9) channel++;
      tr.channel = channel++ % 16;
      tr.instrument.number = programs[t.inst] != null ? programs[t.inst] : 0;
      t.notes.forEach((n) => tr.addNote({ midi: n.p, time: n.t, duration: n.d, velocity: n.v }));
    });
    if (arr.drums) {
      const tr = midi.addTrack();
      tr.name = 'drums';
      tr.channel = 9;
      arr.drums.hits.forEach((h) => tr.addNote({ midi: DRUM_PITCH[h.k] || 42, time: h.t, duration: 0.1, velocity: h.v }));
    }
    return new Blob([midi.toArray()], { type: 'audio/midi' });
  }

  /* The raw transcription (what Basic Pitch heard) as a one-track piano MIDI. */
  async function notesToMidi(notes, bpm, name) {
    const Midi = (await loadScript(MIDI_URL, 'Midi')).Midi || window.Midi;
    const midi = new Midi();
    midi.header.setTempo(bpm);
    midi.header.name = name || 'transcription';
    const tr = midi.addTrack();
    tr.name = 'Basic Pitch transcription';
    notes.forEach((n) => tr.addNote({ midi: n.p, time: n.t, duration: n.d, velocity: Math.min(1, n.v) }));
    return new Blob([midi.toArray()], { type: 'audio/midi' });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  window.GTExport = { toWav, toMp3, arrangementToMidi, notesToMidi, download };
})();
