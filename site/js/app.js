/* App wiring: state, wheel, sliders, transport, tracks, model sheet, toasts. */
(function () {
  'use strict';

  /* Live mode (later): base URL of the local model server, e.g. 'http://localhost:8000'.
     Static hosting (GitHub Pages) cannot run models, so the demo keeps this null and
     plays pre-rendered outputs listed in demo/manifest.json. */
  const API_BASE = null;

  // Outer ring order: calm genres on one side, loud on the other; Classical and Rock meet at the seam.
  // Every genre has a recipe in js/midi/genres.js; colours pair with js/background.js PALETTES.
  const GENRES = [
    { id: 'classical', label: 'Classical', accent: '#f2f2f2', accent2: '#9a9a9a', palette: 'mono' }, // black & white
    { id: 'jazz', label: 'Jazz', accent: '#ffc247', accent2: '#ffe3a3', palette: 'jazz' },
    { id: 'ambient', label: 'Ambient', accent: '#5b8cff', accent2: '#b8ccff', palette: 'ambient' },
    { id: 'lofi', label: 'Lo-fi', accent: '#b48cff', accent2: '#dccbff', palette: 'lofi' },
    { id: 'pop', label: 'Pop', accent: '#ff4fa3', accent2: '#ffb3d6', palette: 'pop' },
    { id: 'electronic', label: 'Electronic', accent: '#19e6ff', accent2: '#a6f6ff', palette: 'electronic' },
    { id: 'metal', label: 'Metal', accent: '#ff7a1a', accent2: '#ffc08a', palette: 'metal' },
    { id: 'rock', label: 'Rock', accent: '#ff2a3d', accent2: '#ff8a8a', palette: 'rock' }, // red & black
  ];
  // The built-in browser-synth preview only has these two arrangements.
  const SYNTH_GENRES = ['classical', 'rock'];
  const PRESETS = [
    { id: 'subtle', label: 'Subtle', value: 0.25 },
    { id: 'balanced', label: 'Balanced', value: 0.55 },
    { id: 'bold', label: 'Bold', value: 0.85 },
  ];
  const MODELS = {
    midi: { label: 'MIDI pipeline', short: 'MIDI', note: 'Basic Pitch transcribes the audio to MIDI, a genre arranger rewrites it (with Magenta Coconet, DrumsRNN, GrooVAE and ImprovRNN at Bold) and a soundfont sampler renders it back to audio, all in your browser.' },
    synth: { label: 'Browser preview', short: 'Preview', note: 'Synthesised live in your browser to show style switching. Not a model output.' },
    'ace-step': { label: 'ACE-Step 1.5 Cover', short: 'ACE-Step', note: 'Pre-trained diffusion transformer, Cover task. Strength sets how much of the original structure is kept.' },
    'ace-step-lora': { label: 'ACE-Step + LoRA', short: 'LoRA', note: 'Cover with our per-genre LoRA adapter (M2), fine-tuned on our classical and rock clips.' },
    'mel-ae': { label: 'Mel-AE (ours)', short: 'Mel-AE', note: 'Our autoencoder (M1): shared encoder, one decoder per genre, BigVGAN vocoder.' },
  };
  // The site's normal state (hearing the original): green & black.
  const ORIGINAL_THEME = { accent: '#2ee59d', accent2: '#a8ffd8', palette: 'green' };
  const DEFAULT_MANIFEST = {
    tracks: [{
      id: 'mountain-king',
      type: 'synth',
      title: 'In the Hall of the Mountain King',
      artist: 'E. Grieg · browser preview',
      length: '16 s loop',
      license: 'Public-domain composition (Grieg, Peer Gynt, 1875), synthesised live in your browser. Not a model output.',
    }],
  };

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const app = $('app');
  const state = {
    tracks: [], index: 0,
    genre: 'classical', preset: 'balanced', strength: 0.55, mood: 0.5,
    ab: 'original', // start in the normal (green) state; picking a style switches to styled
    model: 'synth', prompt: '',
    autoOriginal: false, // true when we fell back to the original because no styled output existed
  };
  // Wide screens get the three-column layout (must match the CSS breakpoint).
  const desktopMQ = window.matchMedia('(min-width: 1100px)');
  const isDesktop = () => desktopMQ.matches;

  /* ---------- helpers ---------- */
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) {
      try {
        if (v === null) window.localStorage.removeItem(k);
        else window.localStorage.setItem(k, v);
      } catch (e) { /* storage unavailable: favourites just won't persist */ }
    },
  };
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast');
    const sheet = $('sheet');
    // On phones, sit above the model sheet when it is open, so the two never overlap.
    t.style.bottom = !isDesktop() && sheet.classList.contains('is-open') ? (sheet.offsetHeight + 22) + 'px' : '';
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), ms || 3400);
  }
  const genreById = (id) => GENRES.find((g) => g.id === id);
  const presetById = (id) => PRESETS.find((p) => p.id === id);
  const nearestPreset = (v) => PRESETS.reduce((a, b) => (Math.abs(b.value - v) < Math.abs(a.value - v) ? b : a));
  const currentTrack = () => state.tracks[state.index];
  function modelsFor(track) {
    if (!track) return [];
    if (track.type === 'synth') return ['synth'];
    return Object.keys(track.outputs || {}).filter((k) => MODELS[k]);
  }
  const hasStyled = (track) => modelsFor(track).length > 0;
  const moodLabel = (v) => (v < 0.34 ? 'Dark' : v > 0.66 ? 'Bright' : 'Neutral');
  /* Pipeline uploads render each genre × strength on demand; until it is ready we keep playing the original. */
  const styledPending = (track) => !!(track && track.job && !track.error && state.ab === 'styled' && !track.job.get(state.genre, state.preset));
  const playerState = () => ({
    style: state.genre, strength: state.strength, preset: state.preset, model: state.model,
    ab: styledPending(currentTrack()) ? 'original' : state.ab,
  });
  function setSlider(id, value) {
    const el = $(id);
    el.value = value;
    el.style.setProperty('--val', value + '%');
  }

  /* ---------- wheel ---------- */
  const wheel = window.GTWheel($('wheel'), {
    genres: GENRES,
    presets: PRESETS,
    onGenre: selectGenre,
    onPreset: (id) => selectPreset(id),
    onCenter: () => setAB(state.ab === 'styled' ? 'original' : 'styled'),
  });

  function selectGenre(id) {
    const g = genreById(id);
    if (!g) return;
    if (g.soon) {
      toast(`${g.label} comes after Classical and Rock.`);
      return;
    }
    state.genre = id;
    wheel.setGenre(id);
    ensureStyled();
    push();
  }

  /* Touching a style control means "let me hear the style". */
  function ensureStyled() {
    if (state.ab === 'original' && hasStyled(currentTrack())) {
      state.ab = 'styled';
      state.autoOriginal = false;
    }
  }

  function selectPreset(id) {
    const p = presetById(id);
    state.preset = id;
    state.strength = p.value;
    setSlider('strength', Math.round(p.value * 100));
    wheel.setPreset(id);
    ensureStyled();
    push();
  }

  function setAB(ab) {
    state.ab = ab;
    state.autoOriginal = false;
    push();
  }

  /* Ask the pipeline for the current genre × strength of an upload (no-op if done or queued). */
  function requestStyled(track) {
    if (!styledPending(track) || track.requested[state.genre + ':' + state.preset]) return;
    const g = state.genre, p = state.preset, key = g + ':' + p;
    track.requested[key] = true;
    track.job.render(g, p, (stage, f) => {
      track.stage = { label: stage, f };
      if (track === currentTrack()) render();
    }).then((out) => {
      track.stage = null;
      track.outputs.midi[g] = track.outputs.midi[g] || {};
      track.outputs.midi[g][p] = out.url;
      if (track !== currentTrack()) return;
      if (state.genre === g && state.preset === p && state.ab === 'styled') {
        push();
        const a = out.arrangement;
        toast(`${genreById(g).label} · ${presetById(p).label} ready${a.used.length ? ' · AI parts: ' + a.used.join(', ') : ''}`);
      } else render();
    }).catch((err) => {
      delete track.requested[key];
      track.stage = null;
      if (!track.error) toast('Could not render this version: ' + err.message, 6000);
      if (track === currentTrack()) render();
    });
  }

  /* Send the state to the player; fall back to the original if a styled file is missing. */
  function push() {
    const track = currentTrack();
    if (track && track.type === 'synth' && state.ab === 'styled' && !SYNTH_GENRES.includes(state.genre)) {
      toast(`The built-in preview only has Classical and Rock. Upload an MP3 to hear it as ${genreById(state.genre).label}.`, 5200);
      state.ab = 'original';
      state.autoOriginal = true;
    }
    if (track && track.job) requestStyled(track);
    const r = window.GTPlayer.setState(playerState());
    if (r && !r.ok && r.reason) {
      toast(r.reason);
      if (state.ab === 'styled') {
        state.ab = 'original';
        state.autoOriginal = true;
        window.GTPlayer.setState(playerState());
      }
    }
    render();
  }

  /* ---------- rendering ---------- */
  function updateMarquee() {
    const viewport = document.querySelector('.np-viewport');
    const text = $('npText');
    text.classList.remove('is-scrolling');
    const overflow = text.scrollWidth - viewport.clientWidth;
    if (overflow > 4) {
      text.style.setProperty('--shift', `-${overflow + 16}px`);
      text.classList.add('is-scrolling');
    }
  }

  function render() {
    const track = currentTrack();
    const g = genreById(state.genre);
    const p = presetById(state.preset);
    const styled = state.ab === 'styled';

    const pending = styledPending(track);
    const busy = !!(track && track.job && track.stage && (track.analysing || pending));

    const theme = styled ? g : ORIGINAL_THEME;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-2', theme.accent2);
    if (window.GTBackground) window.GTBackground.setPalette(theme.palette);
    if (busy) {
      const f = track.stage.f;
      wheel.setCenter(track.stage.label.toUpperCase(), f > 0 && f < 1 ? Math.round(f * 100) + '%' : (pending ? g.label : '…'));
    } else {
      wheel.setCenter(styled ? p.label.toUpperCase() : 'NOW HEARING', styled ? g.label : 'Original');
    }
    app.classList.toggle('is-busy', busy);

    $('npTrack').textContent = track
      ? `${track.title} — ${styled ? `${g.label} · ${p.label}${pending ? ' (rendering…)' : ''}` : 'Original'}`
      : '—';
    updateMarquee();
    $('strengthOut').textContent = `${nearestPreset(state.strength).label} · ${Math.round(state.strength * 100)}%`;
    $('abBtn').setAttribute('aria-pressed', String(!styled));
    document.querySelectorAll('[data-ab]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.ab === state.ab)));

    const playing = window.GTPlayer.playing;
    app.classList.toggle('is-playing', playing);
    $('playBtn').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('favBtn').setAttribute('aria-pressed', String(!!track && store.get('mindscape:fav:' + track.id) === '1'));

    const available = modelsFor(track);
    document.querySelectorAll('#modelPills .pill').forEach((b) => {
      const on = available.includes(b.dataset.model);
      b.disabled = !on;
      b.hidden = !on; // only models with outputs for this track are shown
      b.setAttribute('aria-checked', String(on && b.dataset.model === state.model));
    });
    const m = MODELS[state.model];
    $('modelNote').textContent = track && track.job
      ? pipelineNote(track)
      : available.length
        ? (m ? m.note : '')
        : (track && track.upload
          ? 'This browser or page cannot run the in-browser pipeline, so the upload plays as the original.'
          : 'No model outputs listed for this track yet.');
    renderDownloads(track);

    // Desktop "Listen & compare" panel: stat tiles + details
    const pct = Math.round(state.strength * 100);
    $('statStrength').textContent = pct + '%';
    $('statPreset').textContent = nearestPreset(state.strength).label + ' preset';
    $('statRing').style.setProperty('--p', styled ? pct : 0);
    $('statGenre').textContent = styled ? g.label : 'Original';
    $('statMode').textContent = styled ? 'Styled version' : 'Unchanged source';
    $('dTrack').textContent = track ? track.title : '—';
    $('dMood').textContent = moodLabel(state.mood);
    $('dSource').textContent = track && track.license ? track.license : '—';
  }

  /* What the pipeline is doing / did for the current upload. */
  function pipelineNote(track) {
    const job = track.job;
    if (track.error) return 'The pipeline stopped: ' + track.error;
    if (track.analysing) {
      const s = track.stage;
      return `Step 1–2: ${s ? s.label : 'Starting'}${s && s.f > 0 && s.f < 1 ? ' ' + Math.round(s.f * 100) + '%' : ''}. Basic Pitch is transcribing your audio to MIDI in this browser.`;
    }
    const sc = job.score;
    const facts = `${sc.key.name} · ${Math.round(sc.bpm)} BPM · ${sc.notes.length} notes transcribed${job.info.trimmed ? ` · first ${window.GTPipeline.MAX_SECONDS} s` : ''}.`;
    if (state.ab !== 'styled') return `${facts} Pick a genre and strength to transform it.`;
    const out = job.get(state.genre, state.preset);
    if (!out) return `${facts} Step 3–4: ${track.stage ? track.stage.label : 'queued'}… (re-arranging as ${genreById(state.genre).label}, then rendering).`;
    const a = out.arrangement;
    const parts = a.used.length ? `Pretrained models in this version: ${a.used.join(', ')}.` : 'Rule-based genre arrangement.';
    const fb = a.fallbacks.length ? ` Fallbacks: ${a.fallbacks.join('; ')}.` : '';
    return `${facts} ${parts}${fb} Rendered in ${out.seconds.toFixed(1)} s.`;
  }

  function renderDownloads(track) {
    const job = track && track.job && !track.error && !track.analysing ? track.job : null;
    const out = job && state.ab === 'styled' ? job.get(state.genre, state.preset) : null;
    $('dlMp3').disabled = !out;
    $('dlMidi').disabled = !out;
    $('dlSrc').disabled = !job;
    $('downloads').hidden = !(track && track.job);
  }
  async function runDownload(btn, make, filename) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing…';
    try {
      window.GTExport.download(await make(), filename);
    } catch (err) {
      toast('Download failed: ' + err.message);
    } finally {
      btn.textContent = label;
      render();
    }
  }

  function buildModelPills() {
    const box = $('modelPills');
    Object.keys(MODELS).forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill';
      b.dataset.model = id;
      b.setAttribute('role', 'radio');
      b.textContent = MODELS[id].label;
      b.addEventListener('click', () => {
        state.model = id;
        push();
      });
      box.appendChild(b);
    });
  }

  const NOTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
  const UPLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/></svg>';

  function trackRow(opts) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'track glass' + (opts.className ? ' ' + opts.className : '');
    if (opts.current) b.setAttribute('aria-current', 'true');
    const art = document.createElement('span');
    art.className = 'track-art';
    if (opts.colors) { // otherwise the art follows the current theme colour
      art.style.setProperty('--h1', opts.colors[0]);
      art.style.setProperty('--h2', opts.colors[1]);
    }
    art.innerHTML = opts.icon;
    const meta = document.createElement('span');
    meta.className = 'track-meta';
    const title = document.createElement('span');
    title.className = 'track-title';
    title.textContent = opts.title;
    const sub = document.createElement('span');
    sub.className = 'track-sub';
    sub.textContent = opts.sub;
    meta.append(title, sub);
    const tags = document.createElement('span');
    tags.className = 'track-tags';
    opts.tags.forEach((t) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.textContent = t;
      tags.appendChild(c);
    });
    b.append(art, meta, tags);
    b.addEventListener('click', opts.onClick);
    li.appendChild(b);
    return li;
  }

  function renderTracks() {
    const list = $('trackList');
    list.textContent = '';
    state.tracks.forEach((t, i) => {
      const models = modelsFor(t);
      const tags = t.job
        ? [t.error ? 'Error' : t.analysing ? 'Analysing…' : 'MIDI pipeline']
        : t.upload ? ['Original only'] : models.map((m) => MODELS[m].short);
      list.appendChild(trackRow({
        title: t.title,
        sub: [t.artist, t.length].filter(Boolean).join(' · '),
        tags,
        colors: t.upload ? ['#5a5a5a', '#0d0d0d'] : null,
        icon: NOTE_ICON,
        current: i === state.index,
        className: i === state.index ? 'is-current' : '',
        onClick: () => {
          loadTrack(i);
          selectTab('style');
        },
      }));
    });
    list.appendChild(trackRow({
      title: 'Upload your own clip',
      sub: 'MP3 / WAV, up to 60 s · transformed in your browser',
      tags: [],
      colors: ['#3a3a3a', '#0d0d0d'],
      icon: UPLOAD_ICON,
      className: 'is-upload',
      onClick: () => $('fileInput').click(),
    }));
  }

  /* ---------- tracks ---------- */
  function loadTrack(i) {
    const n = state.tracks.length;
    if (!n) return;
    state.index = ((i % n) + n) % n;
    const track = currentTrack();
    const models = modelsFor(track);
    if (!models.includes(state.model) && models.length) state.model = models[0];
    if (!hasStyled(track)) {
      if (state.ab === 'styled') state.autoOriginal = true;
      state.ab = 'original';
    } else if (state.autoOriginal) {
      // Back on a track with styled outputs: restore what the user was hearing.
      state.ab = 'styled';
      state.autoOriginal = false;
    }
    window.GTPlayer.load(track, playerState());
    renderTracks();
    render();
  }

  function loadManifest() {
    return fetch('demo/manifest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((m) => (m && Array.isArray(m.tracks) && m.tracks.length ? m : DEFAULT_MANIFEST))
      .catch(() => DEFAULT_MANIFEST); // file:// or missing manifest → built-in demo
  }

  /* ---------- tabs ---------- */
  const TABS = ['style', 'tracks', 'about'];
  function moveIndicator() {
    const sel = document.querySelector('.tab[aria-selected="true"]');
    const ind = $('tabIndicator');
    if (!sel) return;
    ind.style.width = sel.offsetWidth + 'px';
    ind.style.transform = `translateX(${sel.offsetLeft}px)`;
  }
  function selectTab(name, focus) {
    TABS.forEach((n) => {
      const tab = $('tab-' + n);
      const on = n === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      $('panel-' + n).classList.toggle('is-active', on);
      if (on && focus) tab.focus();
    });
    syncLayout();
    if (name === 'about' && isDesktop()) $('aboutClose').focus();
  }

  /* ---------- sheet ---------- */
  function setSheet(open) {
    $('toast').classList.remove('is-visible'); // it would sit in the wrong place
    $('sheet').classList.toggle('is-open', open);
    $('sheetBtn').setAttribute('aria-expanded', String(open));
    syncLayout();
  }

  /* ---------- layout ----------
     Phone/tablet: one panel at a time (tabs) and a slide-up model sheet.
     Desktop: library, stage and the compare panel are always visible;
     "How it works" opens as an overlay. Only what is visible is interactive. */
  function setInert(el, on) {
    if (on) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
  function syncLayout() {
    const desk = isDesktop();
    const active = TABS.find((n) => $('tab-' + n).getAttribute('aria-selected') === 'true') || 'style';
    TABS.forEach((n) => setInert($('panel-' + n), desk ? n === 'about' && active !== 'about' : n !== active));
    app.classList.toggle('about-open', desk && active === 'about');
    const sheet = $('sheet');
    const sheetVisible = desk || sheet.classList.contains('is-open');
    setInert(sheet, !sheetVisible);
    sheet.setAttribute('aria-hidden', String(!sheetVisible));
    moveIndicator();
  }
  function closeAbout() {
    selectTab('style');
    $('menuBtn').focus();
  }

  /* ---------- events ---------- */
  $('playBtn').addEventListener('click', () => {
    window.GTPlayer.toggle().then((r) => {
      if (r && r.ok === false && r.reason) toast(r.reason);
      render();
    });
    render();
  });
  $('prevBtn').addEventListener('click', () => loadTrack(state.index - 1));
  $('nextBtn').addEventListener('click', () => loadTrack(state.index + 1));
  $('favBtn').addEventListener('click', () => {
    const t = currentTrack();
    if (!t) return;
    const key = 'mindscape:fav:' + t.id;
    const on = store.get(key) === '1';
    store.set(key, on ? null : '1');
    render();
  });
  $('queueBtn').addEventListener('click', () => {
    if (isDesktop()) { // the library is always visible: just move focus to it
      const row = document.querySelector('#trackList .track.is-current') || document.querySelector('#trackList .track');
      if (row) row.focus();
      return;
    }
    selectTab('tracks');
  });
  $('menuBtn').addEventListener('click', () => (app.classList.contains('about-open') ? closeAbout() : selectTab('about')));
  $('aboutClose').addEventListener('click', closeAbout);
  $('scrim').addEventListener('click', closeAbout);
  $('abBtn').addEventListener('click', () => setAB(state.ab === 'styled' ? 'original' : 'styled'));
  document.querySelectorAll('[data-ab]').forEach((b) => b.addEventListener('click', () => setAB(b.dataset.ab)));

  TABS.forEach((n) => $('tab-' + n).addEventListener('click', () => selectTab(n)));
  document.querySelector('.tabs').addEventListener('keydown', (e) => {
    const cur = TABS.findIndex((n) => $('tab-' + n).getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowRight') { e.preventDefault(); selectTab(TABS[(cur + 1) % TABS.length], true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); selectTab(TABS[(cur + TABS.length - 1) % TABS.length], true); }
  });

  $('strength').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    e.target.style.setProperty('--val', v + '%');
    state.strength = v / 100;
    const p = nearestPreset(state.strength);
    if (p.id !== state.preset) {
      state.preset = p.id;
      wheel.setPreset(p.id);
    }
    ensureStyled();
    push();
  });
  $('mood').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    e.target.style.setProperty('--val', v + '%');
    state.mood = v / 100;
    window.GTAudio.setMood(state.mood);
    $('moodOut').textContent = moodLabel(state.mood);
    $('dMood').textContent = moodLabel(state.mood);
  });

  $('uploadBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && !file.type.startsWith('audio/')) {
      toast('Please choose an audio file (MP3 or WAV).');
      return;
    }
    const old = state.tracks.findIndex((t) => t.upload);
    if (old >= 0) {
      const o = state.tracks[old];
      URL.revokeObjectURL(o.fileUrl || o.original);
      if (o.job) o.job.dispose();
      state.tracks.splice(old, 1);
    }
    const support = window.GTPipeline ? window.GTPipeline.supported() : { ok: false, reason: 'The pipeline scripts did not load.' };
    const track = {
      id: 'upload-' + Date.now(),
      type: 'file',
      upload: true,
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: 'Your upload · stays in this browser',
      original: URL.createObjectURL(file),
      outputs: support.ok ? { midi: {} } : {},
      license: 'Your own file. It never leaves this browser. Styled versions are AI-generated (MIDI pipeline).',
      requested: {},
    };
    track.fileUrl = track.original;
    state.tracks.push(track);
    if (support.ok) startPipeline(track, file);
    loadTrack(state.tracks.length - 1);
    selectTab('style');
    toast(support.ok
      ? 'Transcribing your clip to MIDI in this browser… You can already pick a genre.'
      : support.reason + ' Playing your original.', 5600);
  });

  function startPipeline(track, file) {
    track.analysing = true;
    track.stage = { label: 'Decoding', f: 0 };
    track.job = window.GTPipeline.create(file, {
      onProgress: (label, f) => {
        track.stage = { label, f };
        if (track === currentTrack()) render();
      },
    });
    track.job.ready.then((score) => {
      track.analysing = false;
      track.stage = null;
      track.original = track.job.originalUrl; // decoded copy: same length as the styled renders
      track.length = Math.round(track.job.duration) + ' s';
      if (!state.tracks.includes(track)) return;
      renderTracks();
      if (track !== currentTrack()) return;
      toast(`Transcribed ${score.notes.length} notes · ${score.key.name} · ${Math.round(score.bpm)} BPM${track.job.info.trimmed ? ` · first ${window.GTPipeline.MAX_SECONDS} s` : ''}.`, 5200);
      push();
    }).catch((err) => {
      track.analysing = false;
      track.stage = null;
      track.error = err.message;
      track.outputs = {};
      if (!state.tracks.includes(track)) return;
      if (track === currentTrack()) {
        state.ab = 'original';
        toast(err.message + ' Playing your original.', 6000);
        push();
      }
      renderTracks();
    });
  }

  $('dlMp3').addEventListener('click', (e) => {
    const t = currentTrack(), g = state.genre, p = state.preset;
    runDownload(e.currentTarget, () => t.job.exportMp3(g, p), `${t.title} - ${genreById(g).label} ${presetById(p).label} (AI).mp3`);
  });
  $('dlMidi').addEventListener('click', (e) => {
    const t = currentTrack(), g = state.genre, p = state.preset;
    runDownload(e.currentTarget, () => t.job.exportMidi(g, p), `${t.title} - ${genreById(g).label} ${presetById(p).label}.mid`);
  });
  $('dlSrc').addEventListener('click', (e) => {
    const t = currentTrack();
    runDownload(e.currentTarget, () => t.job.exportSourceMidi(), `${t.title} - transcription.mid`);
  });

  const dialog = $('promptDialog');
  $('promptBtn').addEventListener('click', () => {
    if (typeof dialog.showModal !== 'function') {
      toast('Custom prompts need a newer browser.');
      return;
    }
    dialog.returnValue = '';
    $('promptText').value = state.prompt;
    dialog.showModal();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return;
    state.prompt = $('promptText').value.trim();
    if (state.prompt) applyPrompt(state.prompt);
    else toast('Prompt cleared.');
  });

  /* Text prompt → genre, strength and mood by keywords (order matters: "heavy metal" before "rock"). */
  const PROMPT_GENRES = [
    ['metal', /metal|djent|thrash|double.?kick|headbang/],
    ['lofi', /lo.?fi|study|chillhop|vinyl|tape|boom.?bap|hip.?hop|beats to/],
    ['jazz', /jazz|swing|bebop|sax|lounge|walking bass|big band|blue note/],
    ['electronic', /electr|edm|house|techno|dance|club|synth|trance|disco|rave/],
    ['ambient', /ambient|dream|atmos|ethereal|space|drone|meditat|calm|float/],
    ['classical', /classic|orchestr|string|quartet|baroque|bach|mozart|symphon|violin|chamber|choral/],
    ['rock', /rock|guitar|grunge|punk|garage|indie|power.?chord|band/],
    ['pop', /pop|radio|catchy|ballad|chart|upbeat|happy/],
  ];
  function applyPrompt(text) {
    const t = text.toLowerCase();
    const hit = PROMPT_GENRES.find(([, re]) => re.test(t));
    const preset = /subtle|light|gentle|slight|faithful|a bit|a little|hint/.test(t) ? 'subtle'
      : /bold|extreme|full|wild|totally|completely|radical|crazy|very|max/.test(t) ? 'bold' : null;
    const mood = /dark|moody|sad|gloomy|night|melanchol/.test(t) ? 0.2 : /bright|sunny|shiny|cheer|joy/.test(t) ? 0.8 : null;
    if (mood !== null) {
      state.mood = mood;
      setSlider('mood', Math.round(mood * 100));
      window.GTAudio.setMood(mood);
      $('moodOut').textContent = moodLabel(mood);
    }
    if (!hit) {
      toast('No genre recognised in the prompt. Try words like "orchestral", "swing", "lo-fi", "techno" or "heavy metal".', 6000);
      return;
    }
    if (preset) selectPreset(preset);
    selectGenre(hit[0]);
    toast(`Prompt → ${genreById(hit[0]).label} · ${presetById(state.preset).label}${mood !== null ? ' · ' + moodLabel(mood) : ''}`);
  }

  $('infoBtn').addEventListener('click', () => {
    const t = currentTrack();
    const m = MODELS[state.model];
    const parts = [];
    if (state.ab === 'styled' && m && hasStyled(t)) parts.push(`${m.label}: ${m.note}`);
    if (t && t.license) parts.push(t.license);
    toast(parts.join(' ') || 'No details for this track.', 5600);
  });

  $('sheetBtn').addEventListener('click', () => setSheet(!$('sheet').classList.contains('is-open')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (app.classList.contains('about-open')) closeAbout();
      else if (!isDesktop() && $('sheet').classList.contains('is-open')) setSheet(false);
    }
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      $('playBtn').click();
    }
  });
  window.addEventListener('resize', () => {
    moveIndicator();
    updateMarquee();
  });
  desktopMQ.addEventListener('change', () => {
    syncLayout();
    updateMarquee();
  });

  /* ---------- audio-reactive visuals ---------- */
  let lastLevel = -1;
  function levelLoop() {
    const lvl = window.GTAudio.level();
    if (Math.abs(lvl - lastLevel) > 0.004) {
      lastLevel = lvl;
      app.style.setProperty('--level', lvl.toFixed(3));
      wheel.setLevel(lvl);
      if (window.GTBackground) window.GTBackground.setLevel(lvl);
    }
    requestAnimationFrame(levelLoop);
  }

  /* ---------- init ---------- */
  setSlider('strength', Math.round(state.strength * 100));
  setSlider('mood', Math.round(state.mood * 100));
  window.GTAudio.setMood(state.mood);
  wheel.setGenre(state.genre, true);
  wheel.setPreset(state.preset);
  buildModelPills();
  selectTab('style');
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { moveIndicator(); updateMarquee(); });
  loadManifest().then((m) => {
    state.tracks = m.tracks.filter((t) => t && t.id && t.title);
    if (!state.tracks.length) state.tracks = DEFAULT_MANIFEST.tracks.slice();
    loadTrack(0);
    applyDeepLink();
  });

  /* Deep links for presentations, e.g. ?genre=rock&preset=bold&tab=tracks&ab=original&sheet=open */
  function applyDeepLink() {
    const q = new URLSearchParams(window.location.search);
    const g = genreById(q.get('genre'));
    if (g && !g.soon) selectGenre(g.id);
    if (presetById(q.get('preset'))) selectPreset(q.get('preset'));
    if (q.get('ab') === 'original' || q.get('ab') === 'styled') setAB(q.get('ab'));
    if (TABS.includes(q.get('tab'))) selectTab(q.get('tab'));
    if (q.get('sheet') === 'open') setSheet(true);
  }
  requestAnimationFrame(levelLoop);

  // Console / test hook: inspect the current track, its pipeline job and the UI state.
  window.GTDebug = { state, get track() { return currentTrack(); }, applyPrompt };
})();
