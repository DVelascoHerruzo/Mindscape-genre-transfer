/* Style wheel (SVG). Outer ring = genres; the selected genre rotates to the
   bottom under the accent arc. Inner ring = strength presets; a cyan arc
   glides to the selected one. The centre knob switches original / styled.
   Usage: GTWheel(svgElement, { genres, presets, onGenre, onPreset, onCenter }). */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const RAD = Math.PI / 180;
  const R = { knob: 52, innerIn: 60, innerOut: 116, outerIn: 121, outerOut: 190 };
  const PRESET_ANGLES = { subtle: 150, balanced: 270, bold: 30 }; // 0° = right, clockwise
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fmt = (n) => n.toFixed(2);
  const point = (r, a) => [r * Math.cos(a * RAD), r * Math.sin(a * RAD)];

  function sectorPath(r0, r1, a0, a1) {
    const large = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = point(r1, a0), [x1, y1] = point(r1, a1);
    const [x2, y2] = point(r0, a1), [x3, y3] = point(r0, a0);
    return `M${fmt(x0)} ${fmt(y0)}A${r1} ${r1} 0 ${large} 1 ${fmt(x1)} ${fmt(y1)}` +
      `L${fmt(x2)} ${fmt(y2)}A${r0} ${r0} 0 ${large} 0 ${fmt(x3)} ${fmt(y3)}Z`;
  }
  function arcPath(r, a0, a1) {
    const [x0, y0] = point(r, a0), [x1, y1] = point(r, a1);
    return `M${fmt(x0)} ${fmt(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${fmt(x1)} ${fmt(y1)}`;
  }
  /* Tangential label that always stays readable (never upside down). */
  function labelTransform(r, angle) {
    const [x, y] = point(r, angle);
    const n = ((angle % 360) + 360) % 360;
    const rot = n > 0 && n < 180 ? n - 90 : n + 90;
    return `translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rot)})`;
  }
  function node(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  /* The angle equivalent to `to` that is closest to `from` (shortest rotation). */
  const nearestAngle = (from, to) => from + ((((to - from) % 360) + 540) % 360) - 180;

  window.GTWheel = function (svg, opts) {
    const genres = opts.genres;
    const presets = opts.presets;
    const slice = 360 / genres.length;
    let offset = 90, offsetTarget = 90;
    let presetAngle = 270, presetTarget = 270;
    let raf = 0;

    const defs = node('defs', null, svg);
    defs.innerHTML =
      '<radialGradient id="wheelKnob" cx="38%" cy="30%" r="75%">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>' +
      '<stop offset="0.35" stop-color="#8a8a8a" stop-opacity="0.18"/>' +
      '<stop offset="1" stop-color="#050505" stop-opacity="0.92"/>' +
      '</radialGradient>' +
      '<filter id="wheelGlow" x="-50%" y="-50%" width="200%" height="200%">' +
      '<feGaussianBlur stdDeviation="3.2" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>';

    const glow = node('circle', { class: 'glow-ring', r: 195 }, svg);
    const outerRing = node('g', { class: 'ring ring-outer', role: 'radiogroup', 'aria-label': 'Genre' }, svg);
    const outerLabels = node('g', { 'aria-hidden': 'true' }, svg);
    node('path', { class: 'sel-arc', d: arcPath(186, 90 - slice / 2 + 6, 90 + slice / 2 - 6) }, svg);
    const innerRing = node('g', { class: 'ring ring-inner', role: 'radiogroup', 'aria-label': 'Strength preset' }, svg);
    const innerLabels = node('g', { 'aria-hidden': 'true' }, svg);
    const presetArc = node('g', null, svg);
    node('path', { class: 'preset-arc', d: arcPath(112.5, -52, 52) }, presetArc);

    // Outer ring: genres
    const outerSegs = genres.map((g, i) => {
      const base = i * slice;
      const seg = node('g', {
        class: 'seg' + (g.soon ? ' is-soon' : ''),
        role: 'radio',
        'aria-checked': 'false',
        'aria-label': g.soon ? `${g.label} (coming soon)` : g.label,
        tabindex: g.soon ? '-1' : '0',
      }, outerRing);
      node('path', { class: 'seg-path', d: sectorPath(R.outerIn, R.outerOut, base - slice / 2, base + slice / 2) }, seg);
      node('title', null, seg).textContent = g.soon ? `${g.label}: coming soon` : g.label;
      const lbl = node('text', { class: 'lbl' + (g.soon ? ' is-soon' : '') }, outerLabels);
      lbl.textContent = g.label;
      seg.addEventListener('click', () => opts.onGenre(g.id));
      seg.addEventListener('keydown', (e) => onGenreKey(e, i));
      return { g, base, seg, lbl };
    });

    function onGenreKey(e, i) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        opts.onGenre(genres[i].id);
        return;
      }
      const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1
        : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      let j = i;
      for (let k = 0; k < genres.length; k++) {
        j = (j + dir + genres.length) % genres.length;
        if (!genres[j].soon) break;
      }
      outerSegs[j].seg.focus();
      opts.onGenre(genres[j].id);
    }

    // Inner ring: strength presets (static positions)
    const innerSegs = presets.map((p) => {
      const c = PRESET_ANGLES[p.id];
      const seg = node('g', { class: 'seg', role: 'radio', 'aria-checked': 'false', 'aria-label': `${p.label} strength`, tabindex: '0' }, innerRing);
      node('path', { class: 'seg-path', d: sectorPath(R.innerIn, R.innerOut, c - 60, c + 60) }, seg);
      const lbl = node('text', { class: 'lbl lbl-inner', transform: labelTransform((R.innerIn + R.innerOut) / 2 + 2, c) }, innerLabels);
      lbl.textContent = p.label;
      seg.addEventListener('click', () => opts.onPreset(p.id));
      seg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          opts.onPreset(p.id);
        }
      });
      return { p, seg, lbl };
    });

    // Centre knob
    const knob = node('g', { class: 'knob', role: 'button', tabindex: '0', 'aria-label': 'Switch between original and styled' }, svg);
    node('circle', { class: 'knob-body', r: R.knob, fill: 'url(#wheelKnob)' }, knob);
    node('circle', { class: 'knob-inner', r: R.knob - 7 }, knob);
    const knobTop = node('text', { class: 'knob-top', y: -9 }, knob);
    const knobBottom = node('text', { class: 'knob-bottom', y: 10 }, knob);
    knob.addEventListener('click', () => opts.onCenter());
    knob.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        opts.onCenter();
      }
    });

    function draw() {
      outerRing.setAttribute('transform', `rotate(${fmt(offset)})`);
      outerSegs.forEach((s) => s.lbl.setAttribute('transform', labelTransform((R.outerIn + R.outerOut) / 2, s.base + offset)));
      presetArc.setAttribute('transform', `rotate(${fmt(presetAngle)})`);
    }
    function animate() {
      raf = 0;
      offset += (offsetTarget - offset) * 0.16;
      presetAngle += (presetTarget - presetAngle) * 0.2;
      if (Math.abs(offsetTarget - offset) < 0.05) offset = offsetTarget;
      if (Math.abs(presetTarget - presetAngle) < 0.05) presetAngle = presetTarget;
      draw();
      if (offset !== offsetTarget || presetAngle !== presetTarget) raf = requestAnimationFrame(animate);
    }
    function startAnimation() {
      if (reduceMotion) {
        offset = offsetTarget;
        presetAngle = presetTarget;
        draw();
        return;
      }
      if (!raf) raf = requestAnimationFrame(animate);
    }
    function markSelected(list, selected) {
      list.forEach((x) => {
        const on = x === selected;
        x.seg.classList.toggle('is-selected', on);
        x.lbl.classList.toggle('is-selected', on);
        x.seg.setAttribute('aria-checked', String(on));
      });
    }

    draw();

    return {
      setGenre(id, instant) {
        const s = outerSegs.find((x) => x.g.id === id);
        if (!s) return;
        offsetTarget = nearestAngle(offset, 90 - s.base); // bring it to the bottom
        markSelected(outerSegs, s);
        if (instant) {
          offset = offsetTarget;
          draw();
        } else {
          startAnimation();
        }
      },
      setPreset(id) {
        const s = innerSegs.find((x) => x.p.id === id);
        if (!s) return;
        presetTarget = nearestAngle(presetAngle, PRESET_ANGLES[id]);
        markSelected(innerSegs, s);
        startAnimation();
      },
      setCenter(top, bottom) {
        knobTop.textContent = top;
        knobBottom.textContent = bottom;
      },
      setLevel(v) {
        glow.style.opacity = (0.12 + v * 0.6).toFixed(3);
        glow.style.strokeWidth = (1.5 + v * 3).toFixed(2);
      },
    };
  };
})();
