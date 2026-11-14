# Drum Kit — implementation plan

Repo: `alikonainofficial/drumkit` · Live: `https://alikonainofficial.github.io/drumkit/` · Game id for storage: `drums`

## 0. What the repo is today

`index.html` (seven `<button class="w drum">w</button>`-style pads, a Google Font), `index.js` (~60 lines), `styles.css`, seven PNG pad images, seven MP3 samples in `sounds/` (`tom-1..4`, `snare`, `crash`, `kick-bass`; ~180 KB total). Keys `w a s d j k l` map to tom1, tom2, tom3, tom4, snare, crash, kick.

Known defects:

- `buttonAnimation(event.key)` runs `document.querySelector("." + key)` for **every** keydown: unmapped keys (Shift, Enter, arrows, any other letter) return `null` and `activeButton.classList` throws; Space makes the selector `". "`, which itself throws. The console fills with errors as soon as anyone types.
- `event.key` is case-sensitive: with Shift/Caps Lock, "W" plays nothing. The `default:` branch references an undefined `buttonInnerHTML` (ReferenceError).
- `new Audio(file).play()` per hit: 50–150 ms latency; a sample cannot retrigger while playing.
- Key auto-repeat not filtered (holding a key machine-guns). Single touch only; no multi-touch.
- No goal, no loop, no sharing.

This stays a DOM page (pads are buttons). The shell provides the stage chrome, store, share, rng, and the Web Audio sample player (`Arcade.sfx.sample` / `playSample`). Use the shell for store, sfx, share, rng and the stage chrome. Put a `<canvas id="gameCanvas" width="800" height="600" style="display:none">` in the page so `Arcade.init` has something to wrap (the inline style beats the shell's `.arcade-frame canvas { display:block }`), then move your DOM into the frame: `const frame = document.querySelector('.arcade-frame'); frame.style.aspectRatio = ''; frame.appendChild(yourRootElement)`. Overlays, HUD, toast, mute and the back link then work unchanged.

## 1. Target

1. An **instrument** that responds instantly (Web Audio buffers, polyphony, multi-touch) with Patatap-style audiovisual feedback per pad.
2. A **loop recorder**: 2 bars at 90 BPM, count-in, metronome, 1/16 quantize, up to 4 layers, mute/clear, the pattern encoded in the URL hash so a beat can be shared as a link.
3. A **rhythm challenge**: five patterns, scrolling note lane, Perfect/Good/Miss windows, accuracy %, stars saved locally.

## 2. File layout after

```
index.html
css/arcade-shell.css   (copied, unmodified)
css/game.css           pads, lane, transport bar
js/arcade-shell.js     (copied, unmodified)
js/patterns.js         challenge patterns + the demo loops
js/game.js             instrument + recorder + challenge
sounds/                keep
images/                keep (pad art)
```
Delete `styles.css`, `index.js`, the Google Font.

## 3. Steps

### Step 1 — Instrument: zero latency, no crashes, multi-touch, visuals
1. Pad table (single source of truth): `PADS = [{ id:'tom1', key:'w', code:'KeyW', file:'sounds/tom-1.mp3', color: theme.cyan, label:'W' }, …]` for w a s d j k l. Lookup by `event.code` (not `event.key`), so Caps/Shift do not matter; ignore `event.repeat`; ignore codes not in the table (no selector built from user input, ever).
2. Audio: on the first `pointerdown`/`keydown`, `Promise.all(PADS.map(p => Arcade.sfx.sample(p.file)))` → store buffers; until loaded, show "tap any pad to start" in the HUD. Hit = `Arcade.sfx.playSample(buffer, { vol })`. Polyphonic by construction.
3. Pads: `pointerdown` per pad (multi-touch works because each pointer fires its own event; `touch-action: none` on the pad grid). Velocity: none from a keyboard; from a pointer, use `e.pressure` when > 0 else 1.
4. Visuals per hit: the pad scales 0.94 → 1 (90 ms) and flashes its colour; a full-stage burst: a `div.splash` absolutely positioned in the stage, in the pad's colour, random shape per pad type (circle for toms, bar for snare, ring for crash, expanding square for kick), animating `scale/opacity` over 350 ms and removed on `animationend`. Cap at 12 live splashes.
5. Keyboard hint on each pad (`W`, `A`…), a "Keys: W A S D J K L" line in the HUD.
6. Reduced motion: pad flash only, no splashes.

Acceptance: no errors for any key; hits land under 10 ms after input; two thumbs can play two pads at once; Caps Lock does not matter.

### Step 2 — Loop recorder
1. Transport bar above the pads: `● Rec` (Space), `▶/❚❚ Play` (Enter), `BPM 90` (fixed display, maybe 70–140 slider), `Metronome` toggle, `Layers: 1 2 3 4` with mute (M) and clear (×) per layer, `Share link`.
2. Timing: all scheduling against `Arcade.sfx.context().currentTime`. Loop length = 2 bars of 4/4 = 32 sixteenths; at 90 BPM one sixteenth = 60/90/4 = 0.1667 s; loop = 5.333 s.
3. **Record:** on Rec, a 4-beat count-in (`tick`, last beat `countdown(true)`), then recording for one loop length while the existing layers play; every hit is stored as `{ step: round(elapsed / sixteenth) % 32, pad }` (quantized). Recording ends automatically at the loop end and the new layer joins playback. Max 4 layers; recording when 4 exist replaces the selected layer.
4. **Playback:** a lookahead scheduler (`setInterval` 25 ms, schedule hits up to 100 ms ahead with `playSample(buffer, { delay })`), the standard Web Audio pattern; highlight the pad when its hit plays; a 32-step progress bar under the transport.
5. **URL hash encoding:** `#b=90&l=<layer1>|<layer2>…` where each layer is 32 chars, one per sixteenth, `.` = rest, else the pad letter (`w a s d j k l`); several pads on one step → separate layers. Example: `#b=90&l=l...j...l...j...l...j...l...j...|k.....k.....k...`. On load, if the hash has `l=`, decode, build the layers, show "Press Play". `Share link` copies `location.origin + location.pathname + hash` via `Arcade.share.copy`. Add `Copy pattern` too: the same text without the URL.
6. Persist the current layers in `arcade.drums.loop` so a reload keeps the beat.
7. Ship 3 demo loops in `patterns.js` ("Boom bap", "Four on the floor", "Half-time") as hash strings behind a "Load a beat" dropdown.

Acceptance: record a kick/snare layer, add hats on a second layer, hear them together in time, copy the link, open it in a private window, press Play, same beat.

### Step 3 — Rhythm challenge
1. Mode switch: **Play** / **Loop** / **Challenge**.
2. `patterns.js`: five patterns, each `{ name, bpm, steps: [{ step, pad }] }` over 4 bars (64 sixteenths), easy → hard: (1) kick on beats, (2) kick + snare backbeat, (3) + hats on eighths, (4) tom fill in bar 4, (5) syncopated. Stars thresholds: ★ ≥ 70%, ★★ ≥ 85%, ★★★ ≥ 95%.
3. Lane: a horizontal strip above the pads; notes are coloured squares in the pad's colour moving right-to-left toward a hit line at the left; 2 bars visible ahead. Count-in, then metronome; the pattern also plays quietly as a guide the first time (toggle).
4. Judging per note: hit the right pad within ±50 ms → Perfect (100), ±100 ms → Good (60), else Miss (0); wrong pad = Miss; extra hits are ignored but shown as "extra". Score = average over notes → accuracy %. Floating "Perfect" / "Good" / "Miss" labels at the hit line; a combo counter; full combo → `win` fanfare and a stage flash.
5. Results overlay: accuracy, stars, `Best 92%`, buttons "Retry", "Next pattern", "Copy result" → `🥁 Drum Kit · "Boom bap" · 92% ★★★ · full combo`. `arcade.drums.challenge = { [patternIndex]: { best, stars } }`, `arcade.drums.best` = total stars (0–15) for the portfolio card.
6. Challenge playback uses the same scheduler as the loop recorder; input timing compares the input time (`performance.now()` mapped to audio time at start) to the scheduled note time.

### Step 4 — Polish and ship
- Autoplay policy: nothing plays until a gesture; the HUD says so.
- Keep the pad images; on the dark theme add a subtle border in the pad colour.
- README: keys, loop recorder, link format, challenge scoring, nothing uploaded anywhere.

## 4. Data formats

- `arcade.drums.best` → number, total stars 0–15
- `arcade.drums.loop` → `{ bpm, layers: ['l...j...', …] }`
- `arcade.drums.challenge` → `{ 0: { best: 92, stars: 3 }, … }`
- `arcade.drums.plays` → number of challenge runs
- URL hash: `#b=<bpm>&l=<32 chars>|<32 chars>…` (chars: `.` or `w a s d j k l`)
- Share: `🥁 Drum Kit · "{pattern}" · {acc}% {stars} · full combo` (omit "full combo" when not)

## 5. Test checklist

- [ ] Mash the keyboard including Space, Shift, arrows: zero console errors
- [ ] Caps Lock on: pads still play
- [ ] Two simultaneous touches play two pads
- [ ] Recorded loop stays in time over 5 minutes of playback (no drift: scheduler uses audio time)
- [ ] Shared link reproduces the beat in another browser
- [ ] Challenge: Perfect/Good/Miss windows behave; stars and best persist; copy string correct
- [ ] Mute button silences everything; reduced motion disables splashes
