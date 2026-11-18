/*
 * game.js — Drum Kit: instrument + loop recorder + rhythm challenge.
 * Plain script, no modules. Depends on js/arcade-shell.js (window.Arcade) and js/patterns.js (window.DRUM_PATTERNS).
 */
(function () {
  'use strict';

  var A = window.Arcade, T = A.theme;
  var DATA = window.DRUM_PATTERNS || { demos: [], challenge: [], stars: [70, 85, 95] };

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

  var STEPS = 32;                 // loop = 2 bars of 4/4 in sixteenths
  var MAX_LAYERS = 4;
  var BPM_MIN = 70, BPM_MAX = 140, BPM_DEFAULT = 90;
  var LOOKAHEAD = 0.1;            // seconds scheduled ahead
  var TICK_MS = 25;               // scheduler interval

  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ------------------------------------------------------------------ small helpers
  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mod(n, m) { return ((n % m) + m) % m; }
  // Buttons should not keep focus after a mouse click, so Space / Enter stay transport shortcuts.
  function noMouseFocus(b) { b.addEventListener('mousedown', function (e) { e.preventDefault(); }); return b; }

  // ------------------------------------------------------------------ stage
  A.init({ game: 'drums', title: 'Drum Kit', onRestart: onRestart, onPauseChange: onPauseChange });
  var root = $('drums');
  var frame = document.querySelector('.arcade-frame');
  frame.style.aspectRatio = '';
  // Before the shell's overlay rather than after it: both are positioned without a z-index,
  // so DOM order decides which paints on top, and the overlay (results / pause) must win.
  frame.insertBefore(root, frame.querySelector('.arcade-overlay'));

  var padsEl = $('pads');
  var splashLayer = $('splashLayer');

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
      if (pendingHit && performance.now() - pendingHit.t < 250) play(pendingHit.pad, pendingHit.vel);
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

  // when = audio-clock time to start (omit for "now"). playSample takes a delay relative to currentTime, and
  // currentTime moves while JS runs, so the delay is computed right at the call to keep scheduled hits exact.
  function play(pad, vel, when) {
    if (!buffers || !buffers[pad.index]) return false;
    var c = ctx(), delay = when == null ? 0 : Math.max(0, when - c.currentTime);
    A.sfx.playSample(buffers[pad.index], { vol: vel == null ? 1 : vel, delay: delay });
    return true;
  }

  // The audio-clock time that is reaching the speakers right now (scheduled time minus output latency).
  // Inputs and visuals are compared against this, so what you hear, see and judge all line up.
  function audibleNow(perfT) {
    var c = ctx(); if (!c) return 0;
    if (perfT == null) perfT = performance.now();
    if (c.getOutputTimestamp) {
      var ts = c.getOutputTimestamp();
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (perfT - ts.performanceTime) / 1000;
    }
    return c.currentTime - (c.outputLatency || c.baseLatency || 0) - (performance.now() - perfT) / 1000;
  }
  // Audio-clock time of an input event (event.timeStamp is on the performance.now() clock).
  function eventAudioTime(e) {
    var t = e && e.timeStamp > 0 && e.timeStamp <= performance.now() + 5 ? e.timeStamp : performance.now();
    return audibleNow(t);
  }

  // ------------------------------------------------------------------ a hit from the player
  function hit(pad, vel, e) {
    resumeAudio();
    if (!buffers) {
      pendingHit = { pad: pad, vel: vel, t: performance.now() };
      loadSamples();
    } else {
      play(pad, vel);
    }
    flashPad(pad);
    splash(pad);
    if (rec) recordHit(pad, eventAudioTime(e));
    if (ch && ch.state === 'run') judgeHit(pad, eventAudioTime(e));
  }

  // ------------------------------------------------------------------ visuals
  function flashPad(pad, quiet) {
    var el = pad.el;
    if (!el.animate) return;
    if (!reducedMotion.matches && !quiet) {
      el.animate([{ transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 90, easing: 'ease-out' });
    }
    pad.flashEl.animate([{ opacity: quiet ? 0.45 : 0.6 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
    el.animate([{ borderColor: pad.color }, { borderColor: pad.color, offset: 0.5 }, { borderColor: '' }], { duration: 260 });
  }

  var MAX_SPLASHES = 12;
  function splash(pad) {
    if (reducedMotion.matches) return;
    while (splashLayer.childElementCount >= MAX_SPLASHES) splashLayer.removeChild(splashLayer.firstChild);
    var w = splashLayer.clientWidth || 600, hgt = splashLayer.clientHeight || 400;
    var s = document.createElement('div');
    var size, x, y, r = Math.floor(Math.random() * 180) + 'deg';
    switch (pad.shape) {
      case 'bar': {
        var bw = w * (0.5 + Math.random() * 0.4), bh = 14 + Math.random() * 16;
        s.style.width = bw + 'px'; s.style.height = bh + 'px';
        x = Math.random() * (w - bw * 0.5) - bw * 0.25; y = Math.random() * (hgt - bh);
        break;
      }
      case 'ring':
        size = Math.min(w, hgt) * (0.5 + Math.random() * 0.4);
        s.style.width = s.style.height = size + 'px';
        x = (w - size) * Math.random(); y = (hgt - size) * Math.random();
        break;
      case 'square':
        size = Math.min(w, hgt) * 0.6;
        s.style.width = s.style.height = size + 'px';
        x = (w - size) / 2; y = (hgt - size) / 2; r = '0deg';
        break;
      default: // circle (toms) — size by pitch: higher tom, smaller circle
        size = Math.min(w, hgt) * (0.18 + 0.07 * pad.index + Math.random() * 0.1);
        s.style.width = s.style.height = size + 'px';
        x = (w - size) * Math.random(); y = (hgt - size) * Math.random();
    }
    s.className = 'splash splash-' + pad.shape;
    s.style.setProperty('--c', pad.color);
    s.style.setProperty('--x', Math.round(x) + 'px');
    s.style.setProperty('--y', Math.round(y) + 'px');
    s.style.setProperty('--r', r);
    s.addEventListener('animationend', function () { if (s.parentNode) s.parentNode.removeChild(s); });
    splashLayer.appendChild(s);
  }

  // =================================================================== LOOP RECORDER

  // A layer is { steps: [32 × array of pad indices], muted }. One step may hold several pads; when a layer is
  // written to the URL / storage it becomes one or more 32-char rows (several pads on one step → extra rows).
  var bpm = BPM_DEFAULT;
  var layers = [];
  var selected = 0;
  var metronomeOn = true;

  function emptySteps() { var a = []; for (var i = 0; i < STEPS; i++) a.push([]); return a; }
  function layerHits(steps) { var n = 0; steps.forEach(function (s) { n += s.length; }); return n; }
  function sixteenth() { return 60 / bpm / 4; }
  function beatLen() { return 60 / bpm; }

  // ---------------------------------------------------- encoding (section 4: #b=<bpm>&l=<32>|<32>…)
  function layerToRows(steps) {
    var depth = 0, rows = [];
    steps.forEach(function (s) { depth = Math.max(depth, s.length); });
    for (var d = 0; d < depth; d++) {
      var r = '';
      for (var i = 0; i < STEPS; i++) r += steps[i][d] != null ? PADS[steps[i][d]].key : '.';
      rows.push(r);
    }
    return rows;
  }
  function allRows() {
    var rows = [];
    layers.forEach(function (L) { rows = rows.concat(layerToRows(L.steps)); });
    return rows;
  }
  function encodeHash() { return '#b=' + bpm + '&l=' + allRows().join('|'); }

  // One row of text → 32 steps. Unknown characters are rests. A row whose length divides 32 (e.g. 16) is tiled.
  function rowToSteps(row) {
    row = String(row).toLowerCase();
    if (row.length > 0 && row.length < STEPS && STEPS % row.length === 0) {
      var t = ''; while (t.length < STEPS) t += row; row = t;
    }
    var steps = emptySteps();
    for (var i = 0; i < STEPS && i < row.length; i++) {
      var p = PAD_BY_KEY[row.charAt(i)];
      if (p) steps[i].push(p.index);
    }
    return steps;
  }
  // Returns { bpm, layers } or null when the text has no beat in it.
  function decodeBeat(text) {
    if (!text) return null;
    text = String(text).replace(/^#/, '');
    try { text = decodeURIComponent(text); } catch (err) { /* keep raw */ }
    var params = {};
    text.split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i > 0) params[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
    if (params.l == null) return null;
    var b = parseInt(params.b, 10);
    var out = { bpm: isFinite(b) ? clamp(b, BPM_MIN, BPM_MAX) : BPM_DEFAULT, layers: [] };
    params.l.split('|').slice(0, 32).forEach(function (row) {
      var steps = rowToSteps(row);
      if (!layerHits(steps)) return;
      if (out.layers.length < MAX_LAYERS) { out.layers.push(steps); return; }
      // More rows than layers: fold the extra rows into the last layer, so the beat still sounds the same.
      var last = out.layers[MAX_LAYERS - 1];
      steps.forEach(function (s, i) { s.forEach(function (p) { if (last[i].indexOf(p) < 0) last[i].push(p); }); });
    });
    return out.layers.length ? out : null;
  }
  function applyBeat(beat) {
    stopTransport(); tr.pausedStep = 0;
    bpm = beat.bpm;
    layers = beat.layers.map(function (steps) { return { steps: steps, muted: false }; });
    selected = 0;
    syncBpmUi();
    saveLoop();
    renderLayers();
  }

  // ---------------------------------------------------- persistence: storage + address bar
  function saveLoop() {
    var rows = allRows();
    if (rows.length) A.store.set('loop', { bpm: bpm, layers: rows });
    else A.store.remove('loop');
    var hash = rows.length ? encodeHash() : '';
    if (location.hash !== hash) {
      try { history.replaceState(null, '', location.pathname + location.search + hash); } catch (err) { /* sandboxed frame */ }
    }
  }
  function loadInitialBeat() {
    var fromHash = decodeBeat(location.hash);
    if (fromHash) { applyBeat(fromHash); return 'hash'; }
    var saved = A.store.get('loop', null);
    if (saved && saved.layers && saved.layers.length) {
      var beat = decodeBeat('b=' + (saved.bpm | 0) + '&l=' + saved.layers.join('|'));
      if (beat) { applyBeat(beat); return 'store'; }
    }
    return null;
  }
  window.addEventListener('hashchange', function () {
    var beat = decodeBeat(location.hash);
    if (beat && location.hash !== encodeHash()) { setMode('loop'); applyBeat(beat); setStatus('Beat loaded from the link — press Play'); }
  });

  // ---------------------------------------------------- transport UI
  var ui = buildTransport();

  function buildTransport() {
    var bar = h('div', 'transport');
    bar.id = 'transport';

    var row = h('div', 'transport-row');
    var recBtn = noMouseFocus(h('button', 'tbtn tbtn-rec', '● Rec'));
    recBtn.title = 'Record a layer (Space)';
    var playBtn = noMouseFocus(h('button', 'tbtn tbtn-play', '▶ Play'));
    playBtn.title = 'Play / pause (Enter)';

    var bpmWrap = h('label', 'tbpm');
    var bpmText = h('span', 'tbpm-k', 'BPM');
    var bpmInput = h('input'); bpmInput.type = 'range'; bpmInput.min = BPM_MIN; bpmInput.max = BPM_MAX; bpmInput.step = 1; bpmInput.value = bpm;
    bpmInput.setAttribute('aria-label', 'Tempo in beats per minute');
    var bpmVal = h('span', 'tbpm-v', String(bpm));
    bpmWrap.appendChild(bpmText); bpmWrap.appendChild(bpmInput); bpmWrap.appendChild(bpmVal);

    var metroBtn = noMouseFocus(h('button', 'tbtn tbtn-metro', 'Metronome'));
    metroBtn.title = 'Click on every beat';

    var demoSel = h('select', 'tselect');
    demoSel.setAttribute('aria-label', 'Load a beat');
    var o0 = h('option', null, 'Load a beat…'); o0.value = ''; demoSel.appendChild(o0);
    DATA.demos.forEach(function (d, i) { var o = h('option', null, d.name); o.value = String(i); demoSel.appendChild(o); });

    var shareBtn = noMouseFocus(h('button', 'tbtn', 'Share link'));
    var copyBtn = noMouseFocus(h('button', 'tbtn', 'Copy pattern'));
    [recBtn, playBtn, metroBtn, shareBtn, copyBtn].forEach(function (b) { b.type = 'button'; });

    row.appendChild(recBtn); row.appendChild(playBtn); row.appendChild(bpmWrap); row.appendChild(metroBtn);
    row.appendChild(demoSel); row.appendChild(shareBtn); row.appendChild(copyBtn);
    bar.appendChild(row);

    var status = h('div', 'tstatus', ''); status.setAttribute('aria-live', 'polite');
    bar.appendChild(status);

    var prog = h('div', 'tprogress');
    var cells = [];
    for (var i = 0; i < STEPS; i++) { var c = h('span', 'tcell' + (i % 4 === 0 ? ' tcell-beat' : '') + (i % 16 === 0 ? ' tcell-bar' : '')); prog.appendChild(c); cells.push(c); }
    bar.appendChild(prog);

    var layersEl = h('div', 'tlayers');
    var layerRows = [];
    for (var L = 0; L < MAX_LAYERS; L++) {
      var lr = h('div', 'tlayer');
      var sel = noMouseFocus(h('button', 'tlayer-sel', String(L + 1))); sel.type = 'button';
      var strip = h('div', 'tlayer-strip');
      var dots = [];
      for (var s = 0; s < STEPS; s++) { var d = h('span', 'tdot' + (s % 4 === 0 ? ' tdot-beat' : '')); strip.appendChild(d); dots.push(d); }
      var mute = noMouseFocus(h('button', 'tlayer-btn tlayer-mute', 'M')); mute.type = 'button';
      var clr = noMouseFocus(h('button', 'tlayer-btn', '×')); clr.type = 'button';
      lr.appendChild(sel); lr.appendChild(strip); lr.appendChild(mute); lr.appendChild(clr);
      layersEl.appendChild(lr);
      (function (idx) {
        sel.addEventListener('click', function () { selected = idx; renderLayers(); });
        mute.addEventListener('click', function () { toggleMute(idx); });
        clr.addEventListener('click', function () { clearLayer(idx); });
      })(L);
      layerRows.push({ row: lr, sel: sel, dots: dots, mute: mute, clr: clr });
    }
    bar.appendChild(layersEl);

    root.insertBefore(bar, padsEl);

    recBtn.addEventListener('click', toggleRecord);
    playBtn.addEventListener('click', togglePlay);
    metroBtn.addEventListener('click', function () { metronomeOn = !metronomeOn; renderTransport(); });
    bpmInput.addEventListener('input', function () { setBpm(+bpmInput.value); });
    bpmInput.addEventListener('change', function () { bpmInput.blur(); });
    demoSel.addEventListener('change', function () {
      var d = DATA.demos[+demoSel.value];
      demoSel.value = ''; demoSel.blur();
      if (!d) return;
      var beat = decodeBeat(d.hash);
      if (beat) { applyBeat(beat); setStatus('Loaded “' + d.name + '” — press Play'); }
    });
    shareBtn.addEventListener('click', function () {
      if (!layers.length) { A.ui.toast('Record or load a beat first'); return; }
      A.share.copy(location.origin + location.pathname + encodeHash(), 'Link copied');
    });
    copyBtn.addEventListener('click', function () {
      if (!layers.length) { A.ui.toast('Record or load a beat first'); return; }
      A.share.copy(encodeHash(), 'Pattern copied');
    });

    return { bar: bar, rec: recBtn, play: playBtn, bpm: bpmInput, bpmVal: bpmVal, metro: metroBtn, demo: demoSel,
             share: shareBtn, copy: copyBtn, status: status, cells: cells, layerRows: layerRows };
  }

  function setStatus(text) { ui.status.textContent = text || ''; }
  function syncBpmUi() { ui.bpm.value = bpm; ui.bpmVal.textContent = String(bpm); }

  function setBpm(v) {
    v = clamp(Math.round(v) || BPM_DEFAULT, BPM_MIN, BPM_MAX);
    if (v === bpm) return;
    // While playing, the next unscheduled step keeps its time and the new tempo applies from there on.
    if (tr.state === 'playing' && !ch) { tr.origin = tr.nextTime; tr.originN = tr.n; }
    bpm = v; syncBpmUi();
    if (!ch) tr.sx = sixteenth();
    saveLoop();
  }

  function renderTransport() {
    var busy = tr.state === 'countin' || !!rec;
    ui.rec.classList.toggle('is-on', busy);
    ui.rec.textContent = busy ? '■ Stop rec' : '● Rec';
    ui.play.textContent = tr.state === 'playing' && !rec ? '❚❚ Pause' : '▶ Play';
    ui.play.classList.toggle('is-on', tr.state === 'playing');
    ui.metro.classList.toggle('is-on', metronomeOn);
    ui.metro.setAttribute('aria-pressed', metronomeOn ? 'true' : 'false');
    ui.bpm.disabled = busy; ui.demo.disabled = busy;
  }

  function renderLayers() {
    selected = clamp(selected, 0, Math.max(0, layers.length - 1));
    ui.layerRows.forEach(function (lr, i) {
      var L = layers[i];
      var recTarget = rec && rec.layer === L;
      lr.row.classList.toggle('is-empty', !L);
      lr.row.classList.toggle('is-selected', i === selected && !!L);
      lr.row.classList.toggle('is-muted', !!(L && L.muted));
      lr.row.classList.toggle('is-recording', !!recTarget);
      lr.sel.setAttribute('aria-pressed', i === selected ? 'true' : 'false');
      lr.sel.title = L ? 'Select layer ' + (i + 1) + (layers.length >= MAX_LAYERS ? ' (Rec replaces the selected layer)' : '') : 'Empty layer';
      lr.mute.disabled = !L; lr.clr.disabled = !L || !!rec;
      lr.mute.setAttribute('aria-pressed', L && L.muted ? 'true' : 'false');
      lr.mute.title = 'Mute layer ' + (i + 1) + ' (M mutes the selected layer)';
      lr.clr.title = 'Clear layer ' + (i + 1);
      var steps = recTarget ? rec.steps : (L ? L.steps : null);
      for (var s = 0; s < STEPS; s++) {
        var dot = lr.dots[s], cell = steps ? steps[s] : null;
        if (cell && cell.length) { dot.style.background = PADS[cell[cell.length - 1]].color; dot.classList.add('on'); dot.title = cell.map(function (p) { return PADS[p].name; }).join(' + '); }
        else if (dot.classList.contains('on')) { dot.style.background = ''; dot.classList.remove('on'); dot.title = ''; }
      }
    });
    renderTransport();
    renderHud();
  }

  function toggleMute(i) { if (!layers[i]) return; layers[i].muted = !layers[i].muted; renderLayers(); }
  function clearLayer(i) {
    if (!layers[i] || rec) return;
    layers.splice(i, 1);
    if (selected >= layers.length) selected = Math.max(0, layers.length - 1);
    if (!layers.length) stopTransport();
    saveLoop(); renderLayers();
  }

  // ---------------------------------------------------- the clock: lookahead scheduler on audio time
  // Step n (counted from origin) plays at origin + (n - originN) * sixteenth — computed, never accumulated,
  // so there is no drift however long the loop runs.
  var tr = { state: 'stopped', timer: 0, origin: 0, originN: 0, n: 0, sx: 0.1667, nextTime: 0, startStep: 0, pausedStep: 0, countIn: null };
  var rec = null; // { layer, steps, start, end, replace }
  var visQ = [];  // { t, type: 'pad'|'step'|'count', pad, step, n }

  function stepTime(n) { return tr.origin + (n - tr.originN) * tr.sx; }

  function startClock(atTime, fromStep) {
    tr.origin = atTime; tr.originN = 0; tr.n = 0; tr.nextTime = atTime; tr.startStep = fromStep || 0; tr.sx = sixteenth();
    clearInterval(tr.timer);
    tr.timer = setInterval(schedule, TICK_MS);
    schedule();
  }
  function schedule() {
    var c = ctx(); if (!c) return;
    var horizon = c.currentTime + LOOKAHEAD;
    while (tr.nextTime < horizon) {
      if (ch) {                                      // the challenge runs once through its 64 steps
        if (tr.n >= ch.total) break;
        challengeStep(tr.n, tr.nextTime);
      } else {
        scheduleStep(mod(tr.startStep + tr.n, STEPS), tr.nextTime);
      }
      tr.n++;
      tr.nextTime = stepTime(tr.n);
    }
  }
  function scheduleStep(step, t) {
    if (metronomeOn && step % 4 === 0) tick(t, step === 0 || step === 16);
    layers.forEach(function (L) {
      if (L.muted) return;
      var steps = L.steps;
      if (rec && rec.layer === L) {
        if (t < rec.end - 0.001) return;      // silent while it is being (re)recorded
        steps = rec.steps;                     // from the next pass on, the new take plays
      }
      steps[step].forEach(function (pi) {
        play(PADS[pi], 0.9, t);
        visQ.push({ t: t, type: 'pad', pad: PADS[pi] });
      });
    });
    visQ.push({ t: t, type: 'step', step: step });
  }
  // Metronome / count-in clicks, scheduled on the audio clock (same sounds as the shell's tick / countdown presets).
  function tick(t, accent) {
    var delay = Math.max(0, t - ctx().currentTime);
    A.sfx.tone({ freq: accent ? 1320 : 880, dur: 0.03, type: 'square', vol: accent ? 0.2 : 0.15, delay: delay });
  }
  function countdownBeep(t, last) {
    var delay = Math.max(0, t - ctx().currentTime);
    A.sfx.tone({ freq: last ? 880 : 440, dur: last ? 0.4 : 0.12, type: 'square', vol: 0.3, delay: delay });
  }

  function stopTransport() {
    clearInterval(tr.timer); tr.timer = 0;
    if (tr.state === 'playing') tr.pausedStep = shownStep == null ? 0 : mod(shownStep + 1, STEPS);
    tr.state = 'stopped';
    if (rec) cancelRecording();
    visQ.length = 0; shownStep = null;
    ui.cells.forEach(function (c) { c.classList.remove('is-now'); });
    renderTransport();
  }

  var shownStep = null; // the step whose sound is reaching the speakers now

  function togglePlay() {
    if (rec || tr.state === 'countin') { stopTransport(); tr.pausedStep = 0; setStatus('Recording cancelled'); renderLayers(); return; }
    if (tr.state === 'playing') { stopTransport(); setStatus('Paused'); return; }
    if (!layers.length) { setStatus('Nothing to play yet — press Rec (Space) or load a beat'); return; }
    ensureAudioThen(function () {
      tr.state = 'playing';
      startClock(ctx().currentTime + 0.06, tr.pausedStep || 0);
      setStatus('Playing');
      renderTransport();
    });
  }

  // Start (or wait for) the samples, then run fn. Needed because the first click may also be the first gesture.
  function ensureAudioThen(fn) {
    resumeAudio();
    if (buffers) { fn(); return; }
    var p = loadSamples();
    if (p) p.then(function () { if (buffers) fn(); });
  }

  function toggleRecord() {
    if (tr.state === 'countin' || rec) { stopTransport(); tr.pausedStep = 0; setStatus('Recording cancelled'); renderLayers(); return; }
    ensureAudioThen(startRecording);
  }

  function startRecording() {
    stopTransport();
    var c = ctx();
    var beat = beatLen(), t0 = c.currentTime + 0.1;
    var start = t0 + 4 * beat;                       // 4-beat count-in, then the loop starts at step 0
    var target, replace = false;
    if (layers.length >= MAX_LAYERS) { target = layers[selected]; replace = true; }
    else { target = { steps: emptySteps(), muted: false, pending: true }; layers.push(target); selected = layers.length - 1; }
    rec = { layer: target, steps: emptySteps(), start: start, end: start + STEPS * sixteenth(), replace: replace };
    countInThenClock(t0, beat, sixteenth());
    setStatus('Count-in…');
    renderLayers();
  }

  // 4-beat count-in (tick, tick, tick, long beep) from t0, then the step clock starts on the downbeat.
  // Used by the recorder and the challenge. schedule() keeps 100 ms ahead, so it begins just before the downbeat.
  function countInThenClock(t0, beat, sx) {
    var start = t0 + 4 * beat;
    for (var i = 0; i < 4; i++) {
      var bt = t0 + i * beat;
      if (i < 3) tick(bt, false); else countdownBeep(bt, true);
      visQ.push({ t: bt, type: 'count', n: 4 - i });
    }
    tr.state = 'countin';
    tr.countIn = { start: t0, end: start };
    tr.origin = start; tr.originN = 0; tr.n = 0; tr.nextTime = start; tr.startStep = 0; tr.sx = sx;
    clearInterval(tr.timer);
    tr.timer = setInterval(function () {
      if (tr.state === 'countin' && ctx().currentTime >= start - LOOKAHEAD) tr.state = 'playing';
      if (tr.state === 'playing') schedule();
    }, TICK_MS);
    return start;
  }

  function recordHit(pad, t) {
    if (!rec) return;
    var sx = sixteenth(), rel = (t - rec.start) / sx;
    if (rel < -0.5 || t >= rec.end) return;          // before the count-in ends, or after the take
    var step = mod(Math.round(rel), STEPS);
    var cell = rec.steps[step];
    if (cell.indexOf(pad.index) < 0) cell.push(pad.index);
    renderLayers();
  }

  function finishRecording() {
    var r = rec; rec = null;
    var n = layerHits(r.steps);
    if (!n) {
      if (!r.replace) layers.splice(layers.indexOf(r.layer), 1);
      selected = clamp(selected, 0, Math.max(0, layers.length - 1));
      setStatus(r.replace ? 'Nothing recorded — layer kept' : 'Nothing recorded');
      if (!layers.length) stopTransport();
    } else {
      r.layer.steps = r.steps; delete r.layer.pending;
      setStatus('Layer ' + (layers.indexOf(r.layer) + 1) + ' recorded — ' + n + ' hit' + (n === 1 ? '' : 's') + (layers.length < MAX_LAYERS ? '. Rec again to add a layer' : ''));
      saveLoop();
    }
    renderLayers();
  }
  function cancelRecording() {
    var r = rec; rec = null;
    if (!r.replace) { var i = layers.indexOf(r.layer); if (i >= 0) layers.splice(i, 1); }
    selected = clamp(selected, 0, Math.max(0, layers.length - 1));
  }

  // =================================================================== RHYTHM CHALLENGE

  var WIN_PERFECT = 0.050, WIN_GOOD = 0.100;          // ± seconds
  var SCORE = { perfect: 100, good: 60, miss: 0 };
  var STAR_AT = DATA.stars || [70, 85, 95];
  var CH_STEPS = 64;                                  // 4 bars
  var LANE_AHEAD_STEPS = 32;                          // 2 bars visible ahead of the hit line

  var chIndex = 0;
  var guideOverride = {};                             // pattern index → guide on/off chosen by the player
  var ch = null;  // { state: 'countin'|'run', idx, pattern, sx, start, total, notes:[{t, pad, step, el, result}], combo, maxCombo, counts, extras }

  function challengeRecords() { var r = A.store.get('challenge', {}); return r && typeof r === 'object' ? r : {}; }
  function starsFor(acc) { var n = 0; STAR_AT.forEach(function (t) { if (acc >= t) n++; }); return n; }
  function starText(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆'; return s; }
  function totalStars() {
    var r = challengeRecords(), n = 0;
    DATA.challenge.forEach(function (p, i) { if (r[i]) n += clamp(r[i].stars | 0, 0, 3); });
    return n;
  }
  function guideOn(idx) { return guideOverride[idx] != null ? guideOverride[idx] : !challengeRecords()[idx]; } // on the first time

  var cui = buildChallenge();

  function buildChallenge() {
    var panel = h('div', 'challenge');
    panel.id = 'challenge';

    var picker = h('div', 'ch-picker');
    var pickBtns = DATA.challenge.map(function (p, i) {
      var b = noMouseFocus(h('button', 'ch-pick')); b.type = 'button';
      b.innerHTML = '<span class="ch-pick-n">' + (i + 1) + '</span><span class="ch-pick-name"></span><span class="ch-pick-stars"></span>';
      b.querySelector('.ch-pick-name').textContent = p.name;
      b.addEventListener('click', function () { selectPattern(i); });
      picker.appendChild(b);
      return b;
    });
    panel.appendChild(picker);

    var row = h('div', 'ch-row');
    var startBtn = noMouseFocus(h('button', 'tbtn tbtn-start', '▶ Start')); startBtn.type = 'button';
    startBtn.title = 'Start / stop (Space or Enter)';
    var guideBtn = noMouseFocus(h('button', 'tbtn', 'Guide')); guideBtn.type = 'button';
    guideBtn.title = 'Play the pattern quietly while you drum';
    var info = h('div', 'ch-info');
    row.appendChild(startBtn); row.appendChild(guideBtn); row.appendChild(info);
    panel.appendChild(row);

    var lane = h('div', 'lane');
    var hitLine = h('div', 'lane-hitline');
    var notesEl = h('div', 'lane-notes');
    var labels = h('div', 'lane-labels');
    var combo = h('div', 'lane-combo');
    var big = h('div', 'lane-big');
    lane.appendChild(notesEl); lane.appendChild(hitLine); lane.appendChild(labels); lane.appendChild(combo); lane.appendChild(big);
    panel.appendChild(lane);

    var status = h('div', 'tstatus ch-status', ''); status.setAttribute('aria-live', 'polite');
    panel.appendChild(status);

    root.insertBefore(panel, padsEl);

    startBtn.addEventListener('click', toggleChallenge);
    guideBtn.addEventListener('click', function () { guideOverride[chIndex] = !guideOn(chIndex); renderChallenge(); });

    return { panel: panel, pick: pickBtns, start: startBtn, guide: guideBtn, info: info, lane: lane, notes: notesEl,
             labels: labels, combo: combo, big: big, status: status };
  }

  function selectPattern(i) {
    if (ch) return;
    chIndex = mod(i, DATA.challenge.length);
    clearLane();
    renderChallenge();
    setChStatus('Press Start (Space) — a 4-beat count-in, then play along');
  }
  function setChStatus(t) { cui.status.textContent = t || ''; }

  function renderChallenge() {
    var recs = challengeRecords(), p = DATA.challenge[chIndex];
    cui.pick.forEach(function (b, i) {
      b.classList.toggle('is-selected', i === chIndex);
      b.disabled = !!ch && i !== chIndex;
      b.querySelector('.ch-pick-stars').textContent = recs[i] ? starText(recs[i].stars | 0) : '';
      b.setAttribute('aria-pressed', i === chIndex ? 'true' : 'false');
    });
    cui.start.textContent = ch ? '■ Stop' : '▶ Start';
    cui.start.classList.toggle('is-on', !!ch);
    var g = guideOn(chIndex);
    cui.guide.textContent = 'Guide: ' + (g ? 'on' : 'off');
    cui.guide.classList.toggle('is-on', g);
    cui.guide.setAttribute('aria-pressed', g ? 'true' : 'false');
    cui.guide.disabled = !!ch;
    if (p) cui.info.textContent = p.blurb + ' · ' + p.bpm + ' BPM · ' + p.steps.length + ' notes';
    renderHud();
  }

  function clearLane() {
    cui.notes.innerHTML = ''; cui.labels.innerHTML = ''; cui.combo.textContent = ''; cui.big.textContent = '';
  }

  function toggleChallenge() {
    if (ch) { abortChallenge('Stopped'); return; }
    ensureAudioThen(startChallenge);
  }

  function startChallenge() {
    if (ch || mode !== 'challenge') return;
    A.ui.hideOverlay();
    stopTransport();
    var p = DATA.challenge[chIndex];
    var c = ctx(), beat = 60 / p.bpm, sx = beat / 4, t0 = c.currentTime + 0.1;
    var start = t0 + 4 * beat;
    clearLane();
    var notes = p.steps.map(function (s) {
      var pad = PAD_BY_KEY[s.pad];
      var el = h('div', 'lane-note', pad.label);
      el.style.setProperty('--c', pad.color);
      cui.notes.appendChild(el);
      return { t: start + s.step * sx, step: s.step, pad: pad, el: el, result: null };
    });
    ch = { state: 'countin', idx: chIndex, pattern: p, sx: sx, start: start, total: CH_STEPS, notes: notes, next: 0,
           guide: guideOn(chIndex), combo: 0, maxCombo: 0, counts: { perfect: 0, good: 0, miss: 0 }, extras: 0,
           end: start + (p.steps[p.steps.length - 1].step) * sx + WIN_GOOD + 0.05 };
    countInThenClock(t0, beat, sx);
    setChStatus('Count-in…');
    renderChallenge();
    positionNotes(audibleNow());
  }

  // Scheduler callback for challenge step n (0–63): metronome on every beat, the quiet guide if on.
  function challengeStep(n, t) {
    if (n % 4 === 0) tick(t, n % 16 === 0);
    if (!ch.guide) return;
    ch.notes.forEach(function (note) { if (note.step === n) play(note.pad, 0.25, t); });
  }

  function showChallengeCount(n) { cui.big.textContent = String(n); setChStatus('Count-in ' + n); }

  function judgeHit(pad, t) {
    var best = null, bestD = Infinity, other = null, otherD = Infinity;
    for (var i = 0; i < ch.notes.length; i++) {
      var note = ch.notes[i];
      if (note.result) continue;
      var d = Math.abs(t - note.t);
      if (d > WIN_GOOD) continue;
      if (note.pad === pad) { if (d < bestD) { best = note; bestD = d; } }
      else if (d < otherD) { other = note; otherD = d; }
    }
    if (best) judge(best, bestD <= WIN_PERFECT ? 'perfect' : 'good', t - best.t);
    else if (other) judge(other, 'miss', null, 'wrong pad');
    else { ch.extras++; floatLabel('extra', 'extra'); }
  }

  function judge(note, result, offset, why) {
    note.result = result;
    ch.counts[result]++;
    if (result === 'miss') ch.combo = 0;
    else { ch.combo++; ch.maxCombo = Math.max(ch.maxCombo, ch.combo); }
    note.el.classList.add('is-' + result);
    var label = result === 'perfect' ? 'Perfect' : result === 'good' ? 'Good' : 'Miss';
    if (why) label += ' · ' + why;
    else if (offset != null && result === 'good') label += offset < 0 ? ' · early' : ' · late';
    floatLabel(label, result);
    cui.combo.textContent = ch.combo > 1 ? ch.combo + ' combo' : '';
    renderHud();
  }

  function floatLabel(text, kind) {
    // one judgement label at a time (plus one "extra"), so fast passages stay readable
    Array.prototype.slice.call(cui.labels.children).forEach(function (old) {
      if ((kind === 'extra') === old.classList.contains('lane-label-extra')) cui.labels.removeChild(old);
    });
    var l = h('div', 'lane-label lane-label-' + kind, text);
    l.addEventListener('animationend', function () { if (l.parentNode) l.parentNode.removeChild(l); });
    cui.labels.appendChild(l);
  }

  function positionNotes(now) {
    // 2 bars ahead; on a narrow (phone) lane 2 bars of sixteenths would overlap, so show 1 bar there
    var w = cui.lane.clientWidth, hitX = Math.round(w * 0.12), span = (w < 600 ? 16 : LANE_AHEAD_STEPS) * ch.sx;
    for (var i = 0; i < ch.notes.length; i++) {
      var note = ch.notes[i], x = hitX + (note.t - now) / span * (w - hitX);
      if (x > w + 40 || x < -60) { if (note.vis !== false) { note.el.style.visibility = 'hidden'; note.vis = false; } continue; }
      if (note.vis !== true) { note.el.style.visibility = ''; note.vis = true; }
      note.el.style.transform = 'translate(' + x.toFixed(1) + 'px, -50%)';
    }
  }

  function updateChallenge(now) {
    if (!ch) return;
    if (ch.state === 'countin' && now >= ch.start - WIN_GOOD) { ch.state = 'run'; }
    if (ch.state === 'run' && now >= ch.start) { if (cui.big.textContent) cui.big.textContent = ''; if (/^Count-in/.test(cui.status.textContent)) setChStatus('Go!'); }
    positionNotes(now);
    // Notes whose window has passed without a hit are misses.
    for (var i = 0; i < ch.notes.length; i++) {
      var note = ch.notes[i];
      if (!note.result && now > note.t + WIN_GOOD) judge(note, 'miss');
    }
    if (now >= ch.end) finishChallenge();
  }

  function accuracyOf(c) {
    var n = c.notes.length; if (!n) return 0;
    var sum = c.counts.perfect * SCORE.perfect + c.counts.good * SCORE.good + c.counts.miss * SCORE.miss;
    return Math.round(sum / n);
  }

  function finishChallenge() {
    var c = ch; ch = null;
    clearInterval(tr.timer); tr.timer = 0; tr.state = 'stopped'; visQ.length = 0;
    var acc = accuracyOf(c), stars = starsFor(acc), full = c.counts.miss === 0;
    A.store.bumpPlays();
    var all = challengeRecords(), prev = all[c.idx], isBest = !prev || acc > (prev.best | 0);
    if (isBest) { all[c.idx] = { best: acc, stars: Math.max(stars, prev ? prev.stars | 0 : 0) }; A.store.set('challenge', all); }
    A.store.set('best', totalStars());
    var best = all[c.idx].best;
    if (full) { A.sfx.play('win'); stageFlash(); }
    setChStatus(full ? 'Full combo!' : 'Done — ' + acc + '%');
    renderChallenge();

    var shareText = '🥁 Drum Kit · "' + c.pattern.name + '" · ' + acc + '% ' + starText(stars) + (full ? ' · full combo' : '');
    var buttons = [{ label: 'Retry', onClick: function () { ensureAudioThen(startChallenge); } }];
    if (c.idx < DATA.challenge.length - 1) buttons.push({ label: 'Next pattern', onClick: function () { selectPattern(c.idx + 1); ensureAudioThen(startChallenge); } });
    buttons.push({ label: 'Copy result', keepOpen: true, onClick: function () { A.share.copy(shareText, 'Result copied'); } });
    A.ui.overlay({
      kicker: (c.idx + 1) + ' / ' + DATA.challenge.length + ' · ' + escapeHtml(c.pattern.name),
      title: acc + '% <span class="ch-stars">' + starText(stars) + '</span>',
      lines: [
        (isBest && prev ? 'New best! ' : '') + 'Best ' + best + '%' + (full ? ' · full combo' : ''),
        c.counts.perfect + ' perfect · ' + c.counts.good + ' good · ' + c.counts.miss + ' miss' + (c.extras ? ' · ' + c.extras + ' extra' : '') + ' · max combo ' + c.maxCombo
      ],
      buttons: buttons,
      hint: 'Space to retry',
      action: function () { ensureAudioThen(startChallenge); }
    });
  }

  function abortChallenge(msg) {
    if (!ch) return;
    ch = null;
    clearInterval(tr.timer); tr.timer = 0; tr.state = 'stopped'; visQ.length = 0;
    clearLane();
    setChStatus(msg ? msg + ' — press Start to try again' : '');
    renderChallenge();
  }

  function stageFlash() {
    if (!root.animate) return;
    var f = h('div', 'stage-flash'); root.appendChild(f);
    var a = f.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: reducedMotion.matches ? 250 : 600, easing: 'ease-out' });
    a.onfinish = function () { if (f.parentNode) f.parentNode.removeChild(f); };
  }

  function escapeHtml(t) { return String(t).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  // =================================================================== MODES: Play / Loop / Challenge

  var mode = 'play';
  var modeBar = (function () {
    var bar = h('div', 'modes'); bar.setAttribute('role', 'tablist');
    var btns = {};
    [['play', 'Play'], ['loop', 'Loop'], ['challenge', 'Challenge']].forEach(function (m) {
      var b = noMouseFocus(h('button', 'mode-btn', m[1])); b.type = 'button'; b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { setMode(m[0]); });
      bar.appendChild(b); btns[m[0]] = b;
    });
    root.insertBefore(bar, ui.bar);
    return btns;
  })();

  function setMode(m) {
    if (m === mode && modeBar[m].classList.contains('is-on')) return;
    if (ch) abortChallenge();
    if (tr.state !== 'stopped' || rec) { var wasRec = !!rec || tr.state === 'countin'; stopTransport(); setStatus(wasRec ? 'Recording cancelled' : 'Paused'); renderLayers(); }
    A.ui.hideOverlay();
    mode = m;
    Object.keys(modeBar).forEach(function (k) {
      modeBar[k].classList.toggle('is-on', k === m);
      modeBar[k].setAttribute('aria-selected', k === m ? 'true' : 'false');
    });
    ui.bar.hidden = m !== 'loop';
    cui.panel.hidden = m !== 'challenge';
    root.setAttribute('data-mode', m);
    if (m === 'challenge') selectPattern(chIndex);
    renderHud();
  }

  // ---------------------------------------------------- per-frame: visuals follow the audible clock
  function update() {
    if (!visQ.length && !rec && !ch) return;
    var now = audibleNow();
    var i = 0;
    while (i < visQ.length && visQ[i].t <= now) {
      var ev = visQ[i++];
      if (ev.type === 'pad') flashPad(ev.pad, true);
      else if (ev.type === 'step') {
        if (shownStep != null) ui.cells[shownStep].classList.remove('is-now');
        shownStep = ev.step; ui.cells[shownStep].classList.add('is-now');
        if (rec && now >= rec.start - 0.01 && now < rec.end) setStatus('● Recording layer ' + (layers.indexOf(rec.layer) + 1) + ' — bar ' + (ev.step < 16 ? 1 : 2) + ' of 2');
      } else if (ev.type === 'count') {
        if (ch) showChallengeCount(ev.n); else setStatus('Count-in ' + ev.n);
      }
    }
    if (i) visQ.splice(0, i);
    if (rec && now >= rec.end) finishRecording();
    if (ch) updateChallenge(now);
  }
  A.loop(update, function () {});

  // ---------------------------------------------------- keyboard
  function isFormField(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  function isButton(t) { return t && t.tagName === 'BUTTON'; }
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;            // the shell already used it (R restart, P/Esc pause, overlay keys)
    if (isFormField(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
    var pad = PAD_BY_CODE[e.code];             // never build a selector from user input
    if (pad) {
      e.preventDefault();
      if (!e.repeat) hit(pad, 1, e);            // holding a key does not machine-gun
      return;
    }
    var isSpace = e.code === 'Space', isEnter = e.code === 'Enter' || e.code === 'NumpadEnter';
    if (isButton(e.target) && (isSpace || isEnter)) return; // native button activation
    if (mode === 'loop') {
      if (isSpace) { e.preventDefault(); if (!e.repeat) toggleRecord(); return; }
      if (isEnter) { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
      if (e.repeat) return;
      if (e.code === 'KeyM') { toggleMute(selected); return; }
      var dm = /^Digit([1-4])$/.exec(e.code);
      if (dm && layers[+dm[1] - 1]) { selected = +dm[1] - 1; renderLayers(); }
    } else if (mode === 'challenge') {
      if (isSpace || isEnter) { e.preventDefault(); if (!e.repeat) toggleChallenge(); }
    } else if (isSpace) {
      e.preventDefault(); // free play: Space does nothing (and does not scroll)
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

  // ------------------------------------------------------------------ HUD
  function renderHud() {
    var items = {};
    if (!buffers) items.Sound = loading ? 'loading…' : 'tap any pad to start';
    items.Keys = 'W A S D J K L';
    if (mode === 'loop') items.Loop = 'Space rec · Enter play';
    if (mode === 'challenge' && DATA.challenge.length) {
      var p = DATA.challenge[chIndex];
      items.Pattern = (chIndex + 1) + '/' + DATA.challenge.length + ' ' + escapeHtml(p.name);
      if (ch) {
        var judged = ch.counts.perfect + ch.counts.good + ch.counts.miss;
        items.Combo = String(ch.combo);
        items.Accuracy = judged ? Math.round((ch.counts.perfect * SCORE.perfect + ch.counts.good * SCORE.good) / judged) + '%' : '—';
      } else {
        var r = challengeRecords()[chIndex];
        items.Best = r ? r.best + '% ' + starText(r.stars | 0) : '—';
      }
      items.Stars = totalStars() + '/' + DATA.challenge.length * 3;
    }
    A.ui.hud(items);
  }

  // ------------------------------------------------------------------ shell hooks
  function onRestart() { // R: back to the top of the loop / restart the challenge
    if (mode === 'challenge') { if (ch) abortChallenge(); ensureAudioThen(startChallenge); return; }
    if (rec || tr.state === 'countin') return;
    var wasPlaying = tr.state === 'playing';
    stopTransport(); tr.pausedStep = 0;
    if (wasPlaying) togglePlay();
  }
  function onPauseChange(paused) { // P / Esc / tab hidden: stop the clock (timers are throttled in background tabs)
    if (paused && ch) { abortChallenge('Paused'); return; }
    if (paused && (tr.state !== 'stopped' || rec)) { var wasRec = !!rec || tr.state === 'countin'; stopTransport(); setStatus(wasRec ? 'Recording cancelled' : 'Paused'); renderLayers(); }
  }

  // ------------------------------------------------------------------ boot
  var source = loadInitialBeat();
  setMode(source ? 'loop' : 'play');
  if (source === 'hash') setStatus('Beat loaded from the link — press Play');
  else if (source === 'store') setStatus('Your last beat — press Play');
  else setStatus('Press Rec (Space) to record a layer, or load a beat');
  renderLayers();
})();
