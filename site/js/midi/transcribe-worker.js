/* Step 1 of the pipeline: audio → MIDI notes with Spotify's Basic Pitch
   (pretrained, Apache-2.0, https://github.com/spotify/basic-pitch-ts).
   Runs as a module worker so its TensorFlow.js copy stays apart from Magenta's
   and the page stays responsive.
   In:  { samples: Float32Array (mono, 22 050 Hz) }
   Out: { type: 'progress', value: 0..1 } … then { type: 'done', notes } or { type: 'error', message } */
import {
  BasicPitch,
  outputToNotesPoly,
  noteFramesToTime,
} from 'https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/+esm';
import * as tf from 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.19.0/+esm';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json';
let basicPitch = null;

// Basic Pitch's defaults (Python CLI): onset 0.5, frame 0.3, minimum note ≈127 ms (11 frames).
const ONSET_THRESHOLD = 0.5;
const FRAME_THRESHOLD = 0.3;
const MIN_NOTE_FRAMES = 11;

self.onmessage = async (e) => {
  try {
    const t0 = performance.now();
    try { await tf.ready(); } catch (err) { /* falls back to the default backend */ }
    if (!basicPitch) basicPitch = new BasicPitch(tf.loadGraphModel(MODEL_URL));
    const frames = [], onsets = [], contours = [];
    await basicPitch.evaluateModel(
      e.data.samples,
      (f, o, c) => {
        frames.push(...f);
        onsets.push(...o);
        contours.push(...c);
      },
      (p) => self.postMessage({ type: 'progress', value: p }),
    );
    const notes = noteFramesToTime(outputToNotesPoly(frames, onsets, ONSET_THRESHOLD, FRAME_THRESHOLD, MIN_NOTE_FRAMES))
      .map((n) => ({ t: n.startTimeSeconds, d: n.durationSeconds, p: n.pitchMidi, v: n.amplitude }));
    self.postMessage({ type: 'done', notes, backend: tf.getBackend(), seconds: (performance.now() - t0) / 1000 });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
