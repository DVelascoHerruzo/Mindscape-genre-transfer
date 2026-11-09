/* Mindscape background: slowly drifting, audio-reactive light fields.
   Drawn at reduced resolution on a canvas and softened with a CSS blur.
   Exposes window.GTBackground.setPalette(name) and .setLevel(0..1). */
(function () {
  'use strict';

  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RENDER_SCALE = 0.5;   // draw at half resolution; the blur hides it
  const FRAME_MS = 1000 / 30; // the motion is slow, 30 fps is plenty

  /* Themes: green & black is the normal state (original audio),
     black & white for Classical, red & black for Rock.
     base = vertical gradient behind the lights; gain scales light strength. */
  const PALETTES = {
    green: {
      base: ['#03110a', '#010804', '#000201'],
      lights: ['#00c853', '#1de9b6', '#0b8f4a', '#2ee59d', '#00a86b', '#0a5c3a'],
      gain: 1,
    },
    mono: {
      base: ['#0d0d0d', '#060606', '#000000'],
      lights: ['#ffffff', '#cfcfcf', '#8c8c8c', '#e6e6e6', '#a6a6a6', '#5c5c5c'],
      gain: 0.7,
    },
    rock: {
      base: ['#140204', '#080102', '#000000'],
      lights: ['#ff1f3d', '#b3001b', '#ff4433', '#7a0010', '#e0002a', '#4d000a'],
      gain: 1,
    },
  };
  const toRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
  const rgb = (c) => rgba(c, 1);
  const unpack = (p) => ({ base: p.base.map(toRgb), lights: p.lights.map(toRgb), gain: p.gain });

  let current = unpack(PALETTES.green);
  let goal = unpack(PALETTES.green);
  const ease = (from, to, k) => { for (let i = 0; i < 3; i++) from[i] += (to[i] - from[i]) * k; };

  // Each light drifts on its own slow Lissajous path (positions are fractions of the screen).
  const LIGHTS = [
    { x: 0.20, y: 0.25, ax: 0.14, ay: 0.10, fx: 0.11, fy: 0.08, ph: 0.0, r: 0.55, c: 0 },
    { x: 0.80, y: 0.22, ax: 0.12, ay: 0.12, fx: 0.07, fy: 0.10, ph: 1.7, r: 0.50, c: 1 },
    { x: 0.55, y: 0.60, ax: 0.18, ay: 0.10, fx: 0.06, fy: 0.09, ph: 3.1, r: 0.62, c: 2 },
    { x: 0.15, y: 0.80, ax: 0.10, ay: 0.08, fx: 0.09, fy: 0.05, ph: 4.4, r: 0.45, c: 3 },
    { x: 0.88, y: 0.78, ax: 0.10, ay: 0.12, fx: 0.08, fy: 0.07, ph: 5.2, r: 0.48, c: 4 },
    { x: 0.50, y: 0.10, ax: 0.20, ay: 0.06, fx: 0.05, fy: 0.12, ph: 2.4, r: 0.40, c: 5 },
  ];

  let width = 2, height = 2, level = 0, levelTarget = 0, lastFrame = 0;
  const start = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(2, Math.floor(canvas.clientWidth * dpr * RENDER_SCALE));
    height = Math.max(2, Math.floor(canvas.clientHeight * dpr * RENDER_SCALE));
    canvas.width = width;
    canvas.height = height;
    draw(performance.now());
  }

  function draw(now) {
    const t = (now - start) / 1000;
    current.lights.forEach((c, i) => ease(c, goal.lights[i], 0.05));
    current.base.forEach((c, i) => ease(c, goal.base[i], 0.05));
    current.gain += (goal.gain - current.gain) * 0.05;
    level += (levelTarget - level) * 0.15;
    const span = Math.max(width, height);

    // Deep base
    ctx.globalCompositeOperation = 'source-over';
    const base = ctx.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, rgb(current.base[0]));
    base.addColorStop(0.55, rgb(current.base[1]));
    base.addColorStop(1, rgb(current.base[2]));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    // Drifting lights
    ctx.globalCompositeOperation = 'lighter';
    for (const L of LIGHTS) {
      const x = (L.x + L.ax * Math.sin(t * L.fx + L.ph)) * width;
      const y = (L.y + L.ay * Math.cos(t * L.fy + L.ph * 1.3)) * height;
      const r = L.r * span * (0.9 + 0.1 * Math.sin(t * 0.3 + L.ph) + level * 0.15);
      const a = (0.28 + level * 0.12) * current.gain;
      const c = current.lights[L.c];
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, a));
      g.addColorStop(0.4, rgba(c, a * 0.35));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Silk ribbons, like light folding through liquid glass
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const c = current.lights[(i * 2 + 1) % current.lights.length];
      const yb = height * (0.32 + i * 0.22);
      const amp = height * (0.1 + 0.04 * i);
      ctx.beginPath();
      ctx.moveTo(-width * 0.1, yb + Math.sin(t * 0.07 + i) * amp);
      ctx.bezierCurveTo(
        width * 0.3, yb - amp * Math.cos(t * 0.09 + i * 2),
        width * 0.7, yb + amp * Math.sin(t * 0.08 + i * 3),
        width * 1.1, yb - Math.cos(t * 0.06 + i) * amp
      );
      ctx.strokeStyle = rgba(c, (0.08 + level * 0.04) * current.gain);
      ctx.lineWidth = height * (0.09 - i * 0.02);
      ctx.stroke();
    }

    // Vignette keeps the edges deep
    ctx.globalCompositeOperation = 'source-over';
    const v = ctx.createRadialGradient(width / 2, height * 0.45, span * 0.15, width / 2, height / 2, span * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);
  }

  function loop(now) {
    if (now - lastFrame >= FRAME_MS) {
      lastFrame = now;
      draw(now);
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  if (!reduceMotion) requestAnimationFrame(loop);

  window.GTBackground = {
    setPalette(name) {
      goal = unpack(PALETTES[name] || PALETTES.green);
      if (reduceMotion) {
        current = unpack(PALETTES[name] || PALETTES.green);
        draw(performance.now());
      }
    },
    setLevel(v) {
      levelTarget = Math.max(0, Math.min(1, v || 0));
    },
  };
})();
