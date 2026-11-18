/*
 * game.js — Drum Kit: instrument (+ loop recorder and rhythm challenge in later steps).
 * Plain script, no modules. Depends on js/arcade-shell.js (window.Arcade).
 */
(function () {
  'use strict';

  var A = window.Arcade, T = A.theme;

  // ------------------------------------------------------------------ pad table (single source of truth)
  // Looked up by event.code, so Shift / Caps Lock / keyboard layout case never matter.
  var PADS = [
    { id: 'tom1',  key: 'w', code: 'KeyW', file: 'sounds/tom-1.mp3',     img: 'images/tom1.png',  color: T.cyan,    label: 'W', name: 'Tom 1', shape: 'circle' },
    { id: 'tom2',  key: 'a', code: 'KeyA', file: 'sounds/tom-2.mp3',     img: 'images/tom2.png',  color: T.blue,    label: 'A', name: 'Tom 2', shape: 'circle' },
    { id: 'tom3',  key: 's', code: 'KeyS', file: 'sounds/tom-3.mp3',     img: 'images/tom3.png',  color: T.green,   label: 'S', name: 'Tom 3', shape: 'circle' },
    { id: 'tom4',  key: 'd', code: 'KeyD', file: 'sounds/tom-4.mp3',     img: 'images/tom4.png',  color: T.yellow,  label: 'D', name: 'Tom 4', shape: 'circle' },
    { id: 'snare', key: 'j', code: 'KeyJ', file: 'sounds/snare.mp3',     img: 'images/snare.png', color: T.coral,   label: 'J', name: 'Snare', shape: 'bar' },
    { id: 'crash', key: 'k', code: 'KeyK', file: 'sounds/crash.mp3',     img: 'images/crash.png', color: T.magenta, label: 'K', name: 'Crash', shape: 'ring' },
    { id: 'kick',  key: 'l', code: 'KeyL', file: 'sounds/kick-bass.mp3', img: 'images/kick.png',  color: T.brass,   label: 'L', name: 'Kick',  shape: 'square' }
  ];
  var PAD_BY_CODE = {}, PAD_BY_KEY = {};
  PADS.forEach(function (p, i) { p.index = i; PAD_BY_CODE[p.code] = p; PAD_BY_KEY[p.key] = p; });

  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ------------------------------------------------------------------ stage
  A.init({ game: 'drums', title: 'Drum Kit', onRestart: onRestart, onPauseChange: onPauseChange });
  var root = document.getElementById('drums');
  var frame = document.querySelector('.arcade-frame');
  frame.style.aspectRatio = '';
  frame.appendChild(root);

  var padsEl = document.getElementById('pads');
  var splashLayer = document.getElementById('splashLayer');

  PADS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pad pad-' + p.id;
    b.style.setProperty('--c', p.color);
    b.style.backgroundImage = 'url("' + p.img + '")'; // inline, so the path resolves against the page, not css/
    b.setAttribute('aria-label', p.name + ' (key ' + p.label + ')');
    b.innerHTML = '<span class="pad-flash"></span><span class="pad-name">' + p.name + '</span><span class="pad-key">' + p.label + '</span>';
    p.el = b; p.flashEl = b.firstChild;
    b.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return; // ignore right / middle mouse buttons
      e.preventDefault();       // no focus steal, no text selection, no synthetic mouse events
      hit(p, pointerVelocity(e), e);
    });
    // Keyboard activation of a focused pad (Tab + Enter/Space) arrives as a click with detail 0.
    b.addEventListener('click', function (e) { if (e.detail === 0) hit(p, 1, e); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    padsEl.appendChild(b);
  });

  // Pressure from a pen (or a touch screen that really reports it); mice and most touch screens
  // report a constant 0.5 "pressed" value, which would just halve every hit, so they count as 1.
  function pointerVelocity(e) {
    var pr = e.pressure;
    if (!(pr > 0)) return 1;
    if (e.pointerType === 'mouse') return 1;
    if (e.pointerType === 'touch' && pr === 0.5) return 1;
    return Math.max(0.25, Math.min(1, pr));
  }

  // ------------------------------------------------------------------ audio
  var buffers = null, loading = null, pendingHit = null;

  function ctx() { return A.sfx.context(); }
  function resumeAudio() { var c = ctx(); if (c && c.state === 'suspended') c.resume(); }

  function loadSamples() {
    if (loading) return loading;
    loading = Promise.all(PADS.map(function (p) { return A.sfx.sample(p.file); })).then(function (list) {
      buffers = list;
      if (pendingHit && performance.now() - pendingHit.t < 250) play(pendingHit.pad, pendingHit.vel, 0);
      pendingHit = null;
      renderHud();
      return list;
    }, function (err) {
      loading = null; // allow a retry on the next gesture
      A.ui.toast('Could not load the drum sounds');
      if (window.console) console.warn('Drum Kit: sample load failed', err);
    });
    renderHud();
    return loading;
  }

  // delay is seconds from now (0 = immediately)
  function play(pad, vel, delay) {
    if (!buffers || !buffers[pad.index]) return false;
    A.sfx.playSample(buffers[pad.index], { vol: vel == null ? 1 : vel, delay: delay || 0 });
    return true;
  }

  // ------------------------------------------------------------------ a hit from the player
  function hit(pad, vel, e) {
    resumeAudio();
    if (!buffers) {
      pendingHit = { pad: pad, vel: vel, t: performance.now() };
      loadSamples();
    } else {
      play(pad, vel, 0);
    }
    flashPad(pad);
    splash(pad);
  }

  // ------------------------------------------------------------------ visuals
  function flashPad(pad) {
    var el = pad.el;
    if (!el.animate) return;
    if (!reducedMotion.matches) {
      el.animate([{ transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 90, easing: 'ease-out' });
    }
    pad.flashEl.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
    el.animate([{ borderColor: pad.color }, { borderColor: pad.color, offset: 0.5 }, { borderColor: '' }], { duration: 260 });
  }

  var MAX_SPLASHES = 12;
  function splash(pad) {
    if (reducedMotion.matches) return;
    while (splashLayer.childElementCount >= MAX_SPLASHES) splashLayer.removeChild(splashLayer.firstChild);
    var w = splashLayer.clientWidth || 600, h = splashLayer.clientHeight || 400;
    var s = document.createElement('div');
    var size, x, y, r = Math.floor(Math.random() * 180) + 'deg';
    switch (pad.shape) {
      case 'bar': {
        var bw = w * (0.5 + Math.random() * 0.4), bh = 14 + Math.random() * 16;
        s.style.width = bw + 'px'; s.style.height = bh + 'px';
        x = Math.random() * (w - bw * 0.5) - bw * 0.25; y = Math.random() * (h - bh);
        break;
      }
      case 'ring':
        size = Math.min(w, h) * (0.5 + Math.random() * 0.4);
        s.style.width = s.style.height = size + 'px';
        x = (w - size) * Math.random(); y = (h - size) * Math.random();
        break;
      case 'square':
        size = Math.min(w, h) * 0.6;
        s.style.width = s.style.height = size + 'px';
        x = (w - size) / 2; y = (h - size) / 2; r = '0deg';
        break;
      default: // circle (toms) — size by pitch: higher tom, smaller circle
        size = Math.min(w, h) * (0.18 + 0.07 * pad.index + Math.random() * 0.1);
        s.style.width = s.style.height = size + 'px';
        x = (w - size) * Math.random(); y = (h - size) * Math.random();
    }
    s.className = 'splash splash-' + pad.shape;
    s.style.setProperty('--c', pad.color);
    s.style.setProperty('--x', Math.round(x) + 'px');
    s.style.setProperty('--y', Math.round(y) + 'px');
    s.style.setProperty('--r', r);
    s.addEventListener('animationend', function () { if (s.parentNode) s.parentNode.removeChild(s); });
    splashLayer.appendChild(s);
  }

  // ------------------------------------------------------------------ HUD
  function renderHud() {
    var items = {};
    if (!buffers) items.Sound = loading ? 'loading…' : 'tap any pad to start';
    items.Keys = 'W A S D J K L';
    A.ui.hud(items);
  }

  // ------------------------------------------------------------------ keyboard
  function isFormField(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;            // the shell already used it (R restart, P/Esc pause, overlay keys)
    if (isFormField(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
    var pad = PAD_BY_CODE[e.code];             // never build a selector from user input
    if (pad) {
      e.preventDefault();
      if (!e.repeat) hit(pad, 1, e);            // holding a key does not machine-gun
    }
  });

  // First gesture anywhere starts loading the samples (the autoplay policy needs a gesture first).
  function firstGesture() {
    resumeAudio(); loadSamples();
    document.removeEventListener('pointerdown', firstGesture, true);
    document.removeEventListener('keydown', firstGesture, true);
  }
  document.addEventListener('pointerdown', firstGesture, true);
  document.addEventListener('keydown', firstGesture, true);

  // ------------------------------------------------------------------ shell hooks
  function onRestart() { /* nothing to reset in free play */ }
  function onPauseChange(paused) { /* nothing runs in free play */ }

  renderHud();
})();
