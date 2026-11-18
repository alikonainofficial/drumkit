# Drum Kit

A drum kit in the browser: play the pads, record loops and share them as links, or take the rhythm challenge.

**Play it:** https://alikonainofficial.github.io/drumkit/

It is a plain static page (HTML, CSS and JavaScript, no build step) and part of the arcade at
[alikonainofficial.github.io](https://alikonainofficial.github.io/#arcade). It runs entirely in your browser:
nothing is uploaded anywhere, there are no accounts, and the page loads no fonts, scripts or anything else from other sites.
Your loop, scores and the mute setting are kept in your browser's `localStorage` only.

## Playing

| Key | Pad   |
|-----|-------|
| W   | Tom 1 |
| A   | Tom 2 |
| S   | Tom 3 |
| D   | Tom 4 |
| J   | Snare |
| K   | Crash |
| L   | Kick  |

- Keys work with Caps Lock or Shift held; holding a key down plays it once.
- On a phone or tablet, tap the pads — several fingers at once play several pads.
- Sound starts after your first tap or key press (browsers block audio until then).
- "Sound: on/off" at the top right mutes everything. With *reduce motion* turned on in your system settings,
  the full-screen splashes are switched off and only the pads flash.

The top bar switches between **Play** (just the kit), **Loop** and **Challenge**.

## Loop recorder

A loop is 2 bars of 4/4 (32 sixteenth notes). Tempo 70–140 BPM, 90 by default.

| Control | Key | What it does |
|---|---|---|
| ● Rec | Space | 4-beat count-in, then records one pass of the loop while the other layers play. Hits snap to the nearest sixteenth. The take ends by itself at the end of the loop and joins playback. |
| ▶ Play / ❚❚ Pause | Enter | Plays the layers on a loop. |
| BPM | | Tempo slider (locked while recording). |
| Metronome | | Click on every beat. |
| Layers 1–4 | 1–4 | Select a layer. With 4 layers, Rec replaces the selected one. |
| M | M | Mute the selected layer (or click M on any layer). |
| × | | Clear a layer. |
| Load a beat | | Three demo loops: Boom bap, Four on the floor, Half-time. |
| Share link | | Copies a link that contains the whole beat. |
| Copy pattern | | Copies just the beat text (`#b=…&l=…`). |

Your current beat is also saved in the browser, so reloading the page keeps it.

### Link format

The beat lives in the part of the URL after `#`, so links work on a static site and nothing is stored on a server:

```
https://alikonainofficial.github.io/drumkit/#b=90&l=l...j...l...j...l...j...l...j...|w.w.w.w.w.w.w.w.w.w.w.w.w.w.w.w.
```

- `b` — tempo in BPM (70–140).
- `l` — the layers, separated by `|`. Each layer is 32 characters, one per sixteenth note:
  `.` is a rest, a letter is the pad's key (`w a s d j k l`).
- Only one pad fits on one step of one layer, so pads hit together are written as separate layers.
  When a link has more than 4 layers, the extra ones are merged into layer 4 (the beat sounds the same).
- A layer shorter than 32 characters whose length divides 32 (for example 16) is repeated to fill the loop.

## Rhythm challenge

Five 4-bar patterns, from easy to hard: Heartbeat, Backbeat, Eighths, Tom fill and Syncopated.
Notes scroll from right to left toward the hit line; play the pad shown on each note as it crosses the line.
Press Start (Space or Enter), wait for the 4-beat count-in, then play along with the metronome.
The first time you play a pattern a quiet guide plays it with you (toggle it with the Guide button).
R restarts the run.

| Judgement | Timing | Points |
|---|---|---|
| Perfect | right pad within ±50 ms | 100 |
| Good | right pad within ±100 ms | 60 |
| Miss | no hit in time, or the wrong pad | 0 |

Hits that are nowhere near a note are shown as "extra" and do not count against you.
Accuracy is the average over all the notes in the pattern.

| Stars | Accuracy |
|---|---|
| ★ | 70% or more |
| ★★ | 85% or more |
| ★★★ | 95% or more |

Hitting every note (no misses) is a full combo. Your best accuracy and stars per pattern are saved in the browser,
and "Copy result" copies a line like:

```
🥁 Drum Kit · "Backbeat" · 92% ★★☆ · full combo
```

## Files

```
index.html
css/arcade-shell.css   shared arcade stage (same file in every arcade game; do not edit here)
css/game.css           pads, transport bar, challenge lane
js/arcade-shell.js     shared arcade shell: stage, HUD, overlays, storage, sound, share (do not edit here)
js/patterns.js         challenge patterns and demo loops
js/game.js             instrument, loop recorder, rhythm challenge
sounds/                drum samples
images/                pad art
```

### Stored data (`localStorage`)

| Key | Value |
|---|---|
| `arcade.drums.loop` | `{ bpm, layers: ['l...j...', …] }` — the current beat |
| `arcade.drums.challenge` | `{ 0: { best: 92, stars: 3 }, … }` — per pattern |
| `arcade.drums.best` | total challenge stars, 0–15 |
| `arcade.drums.plays` | number of finished challenge runs |
| `arcade.muted` | `'1'` when sound is off (shared by all arcade games) |
