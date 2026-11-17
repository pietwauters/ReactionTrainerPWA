// UI wiring and persisted settings.

import { AudioEngine } from './audio.js';
import { Scheduler } from './scheduler.js';
import { Metronome } from './metronome.js';
import { Session } from './session.js';
import { Visuals } from './visuals.js';
import { setWakeLock } from './wakelock.js';
import { Ducker, duckingSupported } from './ducker.js';
import { PRESETS, LEVELS, buildExercise, mixSummary } from './exercises.js';
import { Library } from './library.js';
import { Picker } from './picker.js';
import { Editor } from './editor.js';

const $ = (id) => document.getElementById(id);

// ---------- settings (per-device convenience only) ----------
const STORE_KEY = 'reactiontrainer.settings.v1';
const defaults = {
  exerciseId: 'preset-1', level: 1, base: 20, noteValue: 4, beatsPerBar: 2,
  changeTempo: false, sync: false, mix: false, btKeepAlive: false, duck: false, hintDismissed: false,
};

// Set to true by a future background-music player; while music plays it keeps
// Bluetooth devices awake by itself, so the keep-alive noise is not needed.
let musicPlaying = false;
let settings = { ...defaults };
try {
  const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  if (stored.program && !stored.exerciseId) stored.exerciseId = `preset-${stored.program}`; // before custom exercises
  delete stored.program;
  Object.assign(settings, stored);
} catch { /* ignore */ }
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

// ---------- engine ----------
const audio = new AudioEngine();
audio.mixWithOthers = settings.mix;
const scheduler = new Scheduler(audio);
const metronome = new Metronome(audio);
const visuals = new Visuals(audio, document.body);
const ducker = new Ducker();
const session = new Session(audio, visuals, metronome, () => ({
  changeTempo: settings.changeTempo,
  sync: settings.sync,
}));
metronome.mainBase = metronome.base = settings.base;
metronome.noteValue = settings.noteValue;
metronome.beatsPerBar = settings.beatsPerBar;
metronome.onSubTickMidpoint = (t) => session.syncPoint(t);
scheduler.add(metronome); // metronome first so sync points exist before the session looks
scheduler.add(session);

const library = new Library();
const currentDef = () => library.get(settings.exerciseId) ?? PRESETS[0];
const build = () => buildExercise(currentDef(), settings.level);
let exercise = build();

// ---------- rendering ----------
function render() {
  const def = currentDef();
  const presetNo = PRESETS.indexOf(def) + 1;
  $('btnProgram').textContent = presetNo ? `Program ${presetNo}` : def.name;
  $('btnLevel').textContent = `Level ${settings.level}`;
  $('description').textContent = presetNo ? def.name : mixSummary(def);
  $('summary').textContent = `${exercise.count} signals; ${exercise.totalSeconds} seconds`;

  $('btnStart').textContent = session.active ? 'Stop' : 'Start';
  $('btnStart').classList.toggle('running', session.active);
  $('btnProgram').disabled = session.active;
  $('btnLevel').disabled = session.active;

  $('btnMetronome').textContent = metronome.active ? 'Stop metronome' : 'Start metronome';
  $('btnMetronome').classList.toggle('running', metronome.active);
  $('btnUpper').textContent = metronome.beatsPerBar;
  $('btnLower').textContent = metronome.noteValue;
  $('tempo').textContent = metronome.clicksPerMinute;
  const randomised = metronome.active && metronome.base !== metronome.mainBase;
  $('tempoNow').textContent = randomised ? `now ${metronome.currentClicksPerMinute}` : '';

  $('swChange').checked = settings.changeTempo;
  $('swSync').checked = settings.sync;
  $('swMix').checked = settings.mix;
  $('swKeepAlive').checked = settings.btKeepAlive;
  $('swDuck').checked = settings.duck;
}

/** Keep-alive noise: only during an exercise, and only when no music is playing. */
function refreshKeepAlive() {
  audio.setKeepAlive(settings.btKeepAlive && session.active && !musicPlaying);
}

/** Other apps' music turned down while an exercise or the metronome runs (Android). */
function refreshDucking() {
  ducker.set(settings.duck && (session.active || metronome.active) && !musicPlaying);
}

function refreshRunning() {
  scheduler.update();
  setWakeLock(session.active || metronome.active);
  refreshKeepAlive();
  refreshDucking();
  render();
}

metronome.onChange = () => {
  settings.base = metronome.mainBase;
  settings.noteValue = metronome.noteValue;
  settings.beatsPerBar = metronome.beatsPerBar;
  save();
  render();
};
session.onEnd = refreshRunning;

// ---------- controls ----------
$('btnStart').addEventListener('click', async () => {
  if (session.active) { session.stop(); return; }
  await audio.unlock();
  if (session.active) return; // a second tap while the audio was unlocking
  exercise = build(); // fresh shuffle each run
  session.start(exercise);
  refreshRunning();
});

$('btnMetronome').addEventListener('click', async () => {
  if (metronome.active) { metronome.stop(); refreshRunning(); return; }
  await audio.unlock();
  if (metronome.active) return; // a second tap while the audio was unlocking
  metronome.start();
  refreshRunning();
});

// ---------- exercise list and editor ----------
function selectExercise(def) {
  settings.exerciseId = def.id;
  exercise = build();
  save(); render();
}

const editor = new Editor({
  getLevel: () => settings.level,
  onSave: (def) => {
    const saved = library.save(def);
    picker.close();
    selectExercise(saved);
  },
  onCopy: (def) => editor.open(library.copyOf(def), 'new', 'New exercise'),
  onDelete: (def) => {
    library.remove(def.id);
    if (settings.exerciseId === def.id) selectExercise(PRESETS[0]);
    picker.render(settings.exerciseId);
  },
});

const picker = new Picker(library, {
  onSelect: selectExercise,
  onEdit: (def) => {
    const n = PRESETS.indexOf(def) + 1;
    if (n) editor.open(def, 'preset', `Program ${n}`);
    else editor.open(def, 'edit', 'Edit exercise');
  },
  onNew: () => editor.open(library.blank(), 'new', 'New exercise'),
});

$('btnProgram').addEventListener('click', () => picker.open(settings.exerciseId));

$('btnLevel').addEventListener('click', () => {
  settings.level = settings.level % LEVELS.length + 1;
  exercise = build();
  save(); render();
});

$('btnUpper').addEventListener('click', () => metronome.cycleBeatsPerBar());
$('btnLower').addEventListener('click', () => metronome.cycleNoteValue());
$('btnMinus').addEventListener('click', () => metronome.slower());
$('btnPlus').addEventListener('click', () => metronome.faster());

$('swChange').addEventListener('change', (e) => { settings.changeTempo = e.target.checked; save(); });
$('swSync').addEventListener('change', (e) => { settings.sync = e.target.checked; save(); });
$('swMix').addEventListener('change', (e) => {
  settings.mix = e.target.checked;
  audio.setMixWithOthers(settings.mix);
  save();
});
$('swKeepAlive').addEventListener('change', (e) => {
  settings.btKeepAlive = e.target.checked;
  save();
  refreshKeepAlive();
});
$('swDuck').addEventListener('change', (e) => {
  settings.duck = e.target.checked;
  save();
  refreshDucking();
});
if (!duckingSupported) $('duckSetting').hidden = true;

/** Close a dialog when the backdrop (outside the dialog box) is tapped. */
function closeOnTapOutside(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return; // a tap on something inside it
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
}
closeOnTapOutside($('pickerDialog'));

// ---------- iOS "Add to Home Screen" hint ----------
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIOS && !standalone && !settings.hintDismissed) {
  $('installHint').hidden = false;
  $('btnHintClose').addEventListener('click', () => {
    $('installHint').hidden = true;
    settings.hintDismissed = true;
    save();
  });
}

// ---------- share ----------
const APP_URL = 'https://pietwauters.github.io/ReactionTrainerPWA/'; // the QR code in icons/share-qr.svg encodes this
const shareData = { title: 'Reaction Trainer', text: 'Reaction trainer with metronome', url: APP_URL };
$('shareUrl').textContent = APP_URL;
if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) $('btnShareLink').hidden = false;

$('btnShare').addEventListener('click', () => $('shareDialog').showModal());
$('btnShareClose').addEventListener('click', () => $('shareDialog').close());
closeOnTapOutside($('shareDialog'));
$('btnShareLink').addEventListener('click', () => {
  navigator.share(shareData).catch(() => { /* cancelled */ });
});
$('btnCopyLink').addEventListener('click', async () => {
  const btn = $('btnCopyLink');
  try {
    await navigator.clipboard.writeText(APP_URL);
    btn.textContent = 'Copied!';
  } catch {
    btn.textContent = 'Copy failed';
  }
  setTimeout(() => { btn.textContent = 'Copy link'; }, 1500);
});

// ---------- offline support ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
  });
}

render();
