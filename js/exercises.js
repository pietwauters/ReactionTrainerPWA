// Exercise definitions, levels and exercise-list generation.
//
// An exercise *definition* is a plain JSON object (stored, shared and backed
// up as is). The 8 programs of the Android app are built-in presets in the
// same format; they reproduce the Android logic exactly, including its
// integer arithmetic.
//
// Definition (format version 1), all times in ms:
//   {
//     v: 1, id, name,
//     builtIn?: true,
//     mix: { high, low, distract, change, anticipation },  // percentages
//     count: null | n,                    // null: follow the level
//     pause: null | { min, max },         // between signals; null: follow the level
//     change: { min, max },               // end of high tone -> start of low tone
//     anticipation: null | { min, max },  // same; null: follow the level
//     legacyRemainder?: type,             // presets only: Android rounding of the mix
//   }
// A pause is the silence between the end of a signal's (last) tone and the
// start of the next signal.

export const SIGNAL = Object.freeze({
  HIGH: 0,          // high tone, green
  LOW: 1,           // low tone, red
  DISTRACT: 2,      // distract tone, no colour
  CHANGE: 3,        // high, then low shortly after
  ANTICIPATION: 4,  // high, then low after a few seconds
});

/** Signal type keys, indexed by SIGNAL value. */
export const TYPES = Object.freeze(['high', 'low', 'distract', 'change', 'anticipation']);

/** Names shown in the app, by type key. */
export const TYPE_LABELS = Object.freeze({
  high: 'High', low: 'Low', distract: 'Distract', change: 'Change reaction', anticipation: 'Anticipation',
});

export const FORMAT_VERSION = 1;

export const TONE_MS = 300;    // duration of each signal tone
export const AFTER_MS = 500;   // colour stays this long after a tone ends

export const LEVELS = [
  { avg: 5700, sigma: 2500, n: 10 },
  { avg: 4750, sigma: 2000, n: 12 },
  { avg: 3750, sigma: 1600, n: 15 },
  { avg: 4750, sigma: 1800, n: 18 },
  { avg: 3050, sigma: 1000, n: 27 },
  { avg: 3050, sigma: 1000, n: 36 },
];

// Anticipation wait when following the level: randInt(BASE_MIN - sigma, BASE_MAX + sigma).
const ANTICIPATION_BASE_MIN = 3200;
const ANTICIPATION_BASE_MAX = 3500;
const CHANGE_DEFAULT = { min: 250, max: 250 };

const idiv = (a, b) => Math.trunc(a / b);
const mix = (high, low, distract, change, anticipation) => ({ high, low, distract, change, anticipation });

function preset(n, name, m, legacyRemainder) {
  return {
    v: FORMAT_VERSION, id: `preset-${n}`, name, builtIn: true,
    mix: m, count: null, pause: null, change: { ...CHANGE_DEFAULT }, anticipation: null,
    legacyRemainder,
  };
}

export const PRESETS = Object.freeze([
  preset(1, 'Only High tones', mix(100, 0, 0, 0, 0), 'high'),
  preset(2, 'High tones with distract', mix(80, 0, 20, 0, 0), 'distract'),
  preset(3, 'Both High and Low tones', mix(50, 50, 0, 0, 0), 'low'),
  preset(4, 'Both High and Low tones with distract', mix(40, 40, 20, 0, 0), 'distract'),
  preset(5, 'Change reaction (High followed by low)', mix(50, 0, 0, 50, 0), 'change'),
  preset(6, 'Change reaction (High followed by low)\nwith distract', mix(40, 0, 20, 40, 0), 'distract'),
  preset(7, 'High followed by low after some time', mix(0, 0, 0, 0, 100), 'anticipation'),
  preset(8, 'High followed by low after some time\nwith distract', mix(0, 0, 20, 0, 80), 'distract'),
].map(Object.freeze));

// ---------- definition validation ----------

const clampInt = (x, lo, hi, dflt) => {
  const v = Math.round(Number(x));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

function range(r, lo, hi, dflt) {
  if (r == null) return dflt;
  const a = clampInt(r.min, lo, hi, null);
  const b = clampInt(r.max, lo, hi, null);
  if (a == null || b == null) return dflt;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/**
 * Turn untrusted input (a shared link, a backup file) into a valid definition.
 * Missing or invalid fields get defaults. Returns null if nothing usable is left.
 */
export function normalizeDef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const m = {};
  for (const t of TYPES) m[t] = clampInt(raw.mix?.[t], 0, 100, 0);
  if (TYPES.every((t) => m[t] === 0)) return null;
  const def = {
    v: FORMAT_VERSION,
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : newId(),
    name: (typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'My exercise').slice(0, 80),
    mix: m,
    count: raw.count == null ? null : clampInt(raw.count, 1, 200, null),
    pause: range(raw.pause, 0, 60000, null),
    change: range(raw.change, 0, 10000, { ...CHANGE_DEFAULT }),
    anticipation: range(raw.anticipation, 0, 30000, null),
  };
  if (raw.builtIn) def.builtIn = true;
  if (TYPES.includes(raw.legacyRemainder)) def.legacyRemainder = raw.legacyRemainder;
  return def;
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ??
    `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- building an exercise ----------

/** Number of signals per type, [high, low, distract, change, anticipation]. */
export function signalCounts(def, n) {
  const pct = TYPES.map((t) => def.mix[t] || 0);

  if (def.legacyRemainder) {
    // Android: every type gets trunc(pct * n) and one type gets the rest.
    // (The Android app computed the rest as n - trunc(rest% * n), which lost
    // a signal in programs 4 and 6 at levels 2 and 5; fixed here.)
    const r = TYPES.indexOf(def.legacyRemainder);
    const counts = pct.map((p, i) => (i === r ? 0 : idiv(p * n, 100)));
    counts[r] = n - counts.reduce((a, b) => a + b, 0);
    return counts;
  }

  // Largest remainder, and every type in the mix gets at least one signal.
  const sum = pct.reduce((a, b) => a + b, 0);
  const exact = pct.map((p) => (p * n) / sum);
  const counts = exact.map((x, i) => (pct[i] > 0 ? Math.max(1, Math.floor(x)) : 0));
  let total = counts.reduce((a, b) => a + b, 0);
  while (total < n) {
    let best = -1;
    for (let i = 0; i < counts.length; i++) {
      if (pct[i] > 0 && (best < 0 || exact[i] - counts[i] > exact[best] - counts[best])) best = i;
    }
    counts[best]++; total++;
  }
  while (total > n) {
    let best = -1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 1 && (best < 0 || exact[i] - counts[i] < exact[best] - counts[best])) best = i;
    }
    if (best < 0) break; // fewer signals than types in the mix
    counts[best]--; total--;
  }
  return counts;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** What "follow the level" means for a level (1..6): count and ranges in ms. */
export function levelDefaults(level) {
  const lv = LEVELS[level - 1] ?? LEVELS[0];
  return {
    count: lv.n,
    pause: { min: lv.avg - lv.sigma, max: lv.avg + lv.sigma },
    anticipation: { min: ANTICIPATION_BASE_MIN - lv.sigma, max: ANTICIPATION_BASE_MAX + lv.sigma },
  };
}

/** Short description of the mix, e.g. "High 40% · Low 40% · Distract 20%". */
export function mixSummary(def) {
  return TYPES.filter((t) => def.mix[t] > 0).map((t) => `${TYPE_LABELS[t]} ${def.mix[t]}%`).join(' · ');
}

const withNominal = (r) => ({ ...r, nominal: idiv(r.min + r.max, 2) });

/**
 * Build a runnable exercise from a definition and a level (1..6).
 * Returns the shuffled signal list and the resolved timing ranges (ms);
 * `nominal` is the value used for the duration estimate.
 */
export function buildExercise(def, level) {
  const lv = LEVELS[level - 1] ?? LEVELS[0];
  const counts = signalCounts(def, def.count ?? lv.n);
  const [nHigh, nLow, nDistract, nChange, nAnticipation] = counts;

  const list = [];
  counts.forEach((c, type) => { for (let i = 0; i < c; i++) list.push(type); });
  shuffle(list);
  const count = list.length;

  const change = withNominal(def.change ?? CHANGE_DEFAULT);

  let pause;
  if (def.pause) {
    pause = withNominal(def.pause);
  } else {
    let avg = lv.avg;
    // A change reaction takes longer, so shorten the average pause to keep the total time.
    if (nChange !== 0) avg = idiv(count * avg - nChange * (change.nominal + TONE_MS), count);
    pause = { min: avg - lv.sigma, max: avg + lv.sigma, nominal: avg };
  }

  const anticipation = def.anticipation
    ? withNominal(def.anticipation)
    : { min: ANTICIPATION_BASE_MIN - lv.sigma, max: ANTICIPATION_BASE_MAX + lv.sigma, nominal: ANTICIPATION_BASE_MAX };

  const totalMs =
    (nHigh + nLow + nDistract) * (TONE_MS + pause.nominal) +
    nChange * (TONE_MS + change.nominal + TONE_MS + pause.nominal) +
    nAnticipation * (TONE_MS + TONE_MS + anticipation.nominal + pause.nominal);

  return {
    def,
    level,
    list,
    count,
    timing: { pause, change, anticipation },
    totalSeconds: idiv(totalMs, 1000),
  };
}

/** Uniform random integer in [lo, hi), like Kotlin's Random.nextLong(lo, hi). */
export function randInt(lo, hi) {
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo));
}
