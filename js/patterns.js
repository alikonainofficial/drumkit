/*
 * patterns.js — data for the Drum Kit: rhythm-challenge patterns and the loop recorder's demo beats.
 * Plain script; exposes window.DRUM_PATTERNS. Pad letters: w a s d = toms 1–4, j = snare, k = crash, l = kick.
 */
(function () {
  'use strict';

  // Challenge patterns are written one character per sixteenth, 4 bars = 64 characters ('.' = rest),
  // then turned into { name, bpm, steps: [{ step, pad }] } with pad = the pad's letter.
  function pattern(name, bpm, blurb, bars) {
    var text = bars.join(''), steps = [];
    if (text.length !== 64) throw new Error('patterns.js: "' + name + '" is ' + text.length + ' steps, expected 64');
    for (var i = 0; i < text.length; i++) if (text.charAt(i) !== '.') steps.push({ step: i, pad: text.charAt(i) });
    return { name: name, bpm: bpm, blurb: blurb, steps: steps };
  }

  var challenge = [
    pattern('Heartbeat', 80, 'Kick on every beat', [
      'l...l...l...l...', 'l...l...l...l...', 'l...l...l...l...', 'l...l...l...l...']),
    pattern('Backbeat', 85, 'Kick on 1 and 3, snare on 2 and 4', [
      'l...j...l...j...', 'l...j...l...j...', 'l...j...l...j...', 'l...j...l...j...']),
    pattern('Eighths', 90, 'Add tom 1 on the off-beats', [
      'l.w.j.w.l.w.j.w.', 'l.w.j.w.l.w.j.w.', 'l.w.j.w.l.w.j.w.', 'l.w.j.w.l.w.j.w.']),
    pattern('Tom fill', 90, 'Groove, then a fill down the toms in bar 4', [
      'l.w.j.w.l.w.j.w.', 'l.w.j.w.l.w.j.w.', 'l.w.j.w.l.w.j.w.', 'l.w.j.w.wwaassdd']),
    pattern('Syncopated', 95, 'Kicks off the beat — count the sixteenths', [
      'k..l..w.j..l.jw.', 'l..l.wl.j.w..j..', 'l..l..w.j..l.jw.', 'l..l.wl.j..lj.dd'])
  ];

  // Demo loops, in the same format as a shared link's hash: #b=<bpm>&l=<32 chars>|<32 chars>…
  var demos = [
    { name: 'Boom bap',          hash: '#b=90&l=l......l..l.....l......l..l.....|....j.......j.......j.......j...|k............................saw' },
    { name: 'Four on the floor', hash: '#b=120&l=l...l...l...l...l...l...l...l...|....j.......j.......j.......j...|k.w...w...w...w...w...w...w...w.' },
    { name: 'Half-time',         hash: '#b=140&l=l..l......l.....l..l..l....l....|........j...............j.......|.............dsa.............dsw' }
  ];

  window.DRUM_PATTERNS = { challenge: challenge, demos: demos, stars: [70, 85, 95] };
})();
