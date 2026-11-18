/*
 * patterns.js — data for the Drum Kit: demo loops for the loop recorder (and, later, challenge patterns).
 * Plain script; exposes window.DRUM_PATTERNS. Pad letters: w a s d = toms 1–4, j = snare, k = crash, l = kick.
 */
(function () {
  'use strict';

  // Demo loops, in the same format as a shared link's hash: #b=<bpm>&l=<32 chars>|<32 chars>…
  var demos = [
    { name: 'Boom bap',          hash: '#b=90&l=l......l..l.....l......l..l.....|....j.......j.......j.......j...|k............................saw' },
    { name: 'Four on the floor', hash: '#b=120&l=l...l...l...l...l...l...l...l...|....j.......j.......j.......j...|k.w...w...w...w...w...w...w...w.' },
    { name: 'Half-time',         hash: '#b=140&l=l..l......l.....l..l..l....l....|........j...............j.......|.............dsa.............dsw' }
  ];

  window.DRUM_PATTERNS = { demos: demos };
})();
