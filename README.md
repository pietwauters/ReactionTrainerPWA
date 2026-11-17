# Reaction Trainer (PWA)

Audio and colour reaction trainer with a metronome. This is the web version of
the Android app, installable on Android and iOS and fully usable offline.

## Use

Open the site and tap **Start**. Install it to the home screen for a full-screen app:

- **Android (Chrome):** menu → *Install app* / *Add to Home screen*
- **iPhone/iPad (Safari):** Share → *Add to Home Screen*

The screen stays on while a session or the metronome runs (iOS stops web audio
when the screen locks).

## Signals

| Signal | Sound | Screen |
|---|---|---|
| High | 8800 Hz, 300 ms | green |
| Low | 1760 Hz, 300 ms | red |
| Distract | 7040 Hz with a short gap | no colour |
| Change | high, low 250 ms later | green → red |
| Anticipation | high, low ~3–4 s later | green → white → red |

Programs set the mix of signals, levels set the number of signals and the gaps.

## Own exercises

Tap the **Program** button to open the exercise list. Next to each exercise, ✎
opens it: built-in programs can be viewed and copied, own exercises can be
edited and deleted. **New exercise** starts from scratch.

An exercise has a name and a signal mix in percent (adding up to 100). The
number of signals, the pause between signals and the anticipation wait follow
the selected level unless you switch that off and enter your own values. For a
change reaction you set the time between the high and the low tone.

Own exercises are stored on the device (browser storage).

## Develop

No build step: plain HTML, CSS and ES modules.

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

| File | Purpose |
|---|---|
| `js/exercises.js` | exercise definition format, the 8 built-in presets, levels, exercise generation (port of the Android logic) |
| `js/library.js` | built-in presets plus own exercises, stored in localStorage |
| `js/picker.js` | exercise list dialog |
| `js/editor.js` | exercise editor dialog |
| `js/audio.js` | AudioContext, mixer buses (signals / metronome / music), tones and samples |
| `js/scheduler.js` | lookahead scheduler on the audio clock |
| `js/metronome.js` | metronome |
| `js/session.js` | a training session |
| `js/visuals.js` | colour flashes in sync with the audio |
| `js/wakelock.js` | keep the screen on while running |
| `js/ducker.js` | Android: turn other apps' music down while training |
| `sw.js` | offline cache — **bump `VERSION` on every change** |

## Deploy

GitHub Pages serves the `main` branch root. Push, and the site updates within a minute;
installed apps pick up the new version on the next launch after `VERSION` in `sw.js` is bumped.
