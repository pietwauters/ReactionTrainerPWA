// Programs, levels and exercise-list generation.
// Direct port of generate_exercise_list / generate_base_exercise / set_Level_vars
// from the Android MainActivity.kt, keeping its integer arithmetic.

export const SIGNAL = Object.freeze({
  HIGH: 0,          // high tone, green
  LOW: 1,           // low tone, red
  DISTRACT: 2,      // distract tone, no colour
  CHANGE: 3,        // high, then low shortly after
  ANTICIPATION: 4,  // high, then low after a few seconds
});

export const TONE_MS = 300;    // duration of each signal tone
export const CHOICE_MS = 250;  // gap between high and low in a change reaction
export const AFTER_MS = 500;   // colour stays this long after a tone ends

export const PROGRAMS = [
  'Only High tones',
  'High tones with distract',
  'Both High and Low tones',
  'Both High and Low tones with distract',
  'Change reaction (High followed by low)',
  'Change reaction (High followed by low)\nwith distract',
  'High followed by low after some time',
  'High followed by low after some time\nwith distract',
];

export const LEVELS = [
  { avg: 5700, sigma: 2500, n: 10 },
  { avg: 4750, sigma: 2000, n: 12 },
  { avg: 3750, sigma: 1600, n: 15 },
  { avg: 4750, sigma: 1800, n: 18 },
  { avg: 3050, sigma: 1000, n: 27 },
  { avg: 3050, sigma: 1000, n: 36 },
];

const idiv = (a, b) => Math.trunc(a / b);

// Counts per signal type for a program: [high, low, distract, change, anticipation]
function programCounts(program, n) {
  switch (program) {
    case 1: return [n, 0, 0, 0, 0];
    case 2: return [idiv(n * 8, 10), 0, n - idiv(n * 8, 10), 0, 0];
    case 3: return [idiv(n, 2), n - idiv(n, 2), 0, 0, 0];
    case 4: return [idiv(n * 4, 10), idiv(n * 4, 10), n - idiv(n * 8, 10), 0, 0];
    case 5: return [idiv(n, 2), 0, 0, n - idiv(n, 2), 0];
    case 6: return [idiv(n * 4, 10), 0, n - idiv(n * 8, 10), idiv(n * 4, 10), 0];
    case 7: return [0, 0, 0, 0, n];
    case 8: return [0, 0, n - idiv(n * 8, 10), 0, idiv(n * 8, 10)];
    default: return [n, 0, 0, 0, 0];
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build a complete exercise for a program (1..8) and level (1..6).
 * Returns the shuffled signal list plus the timing parameters (ms).
 */
export function buildExercise(program, level) {
  const lv = LEVELS[level - 1] ?? LEVELS[0];
  const [nHigh, nLow, nDistract, nChange, nAnticipation] = programCounts(program, lv.n);

  const list = [];
  for (let i = 0; i < nHigh; i++) list.push(SIGNAL.HIGH);
  for (let i = 0; i < nLow; i++) list.push(SIGNAL.LOW);
  for (let i = 0; i < nDistract; i++) list.push(SIGNAL.DISTRACT);
  for (let i = 0; i < nChange; i++) list.push(SIGNAL.CHANGE);
  for (let i = 0; i < nAnticipation; i++) list.push(SIGNAL.ANTICIPATION);
  shuffle(list);

  const count = list.length;
  let avg = lv.avg;
  // A change reaction takes longer, so shorten the average gap to keep the total time.
  if (nChange !== 0) {
    avg = idiv(count * avg - nChange * (CHOICE_MS + TONE_MS), count);
  }

  const totalMs =
    (nHigh + nLow + nDistract) * (TONE_MS + avg) +
    nChange * (TONE_MS + CHOICE_MS + TONE_MS + avg) +
    nAnticipation * (TONE_MS + TONE_MS + 3500 + avg);

  return {
    program,
    level,
    list,
    avg,
    sigma: lv.sigma,
    count,
    totalSeconds: idiv(totalMs, 1000),
  };
}

/** Uniform random integer in [lo, hi), like Kotlin's Random.nextLong(lo, hi). */
export function randInt(lo, hi) {
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo));
}
