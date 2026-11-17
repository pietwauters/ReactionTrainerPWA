// Drills: descriptions of real exercises (what the students do on each signal).
//
// A drill is linked to exercises by signal type: it fits every exercise that
// uses exactly the signal types the drill has a response for. Distract is
// optional on both sides (it usually means "don't react").
//
// Definition (format version 1):
//   {
//     v: 1, id, name,
//     start: '',                       // start position
//     responses: { high, low, distract, change, anticipation },  // text per signal type
//     notes: '',
//     video: '',                       // optional http(s) link
//   }

import { TYPES, newId } from './exercises.js';

export const DRILL_VERSION = 1;

/** Labels for the response fields, by type key. */
export const RESPONSE_LABELS = Object.freeze({
  high: 'High tone',
  low: 'Low tone',
  distract: 'Distract tone',
  change: 'Change reaction (high, then low)',
  anticipation: 'Anticipation (high, then low later)',
});

const LIMITS = { name: 80, start: 1000, response: 1000, notes: 2000, video: 500 };

const text = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/**
 * Turn untrusted input (a shared link, a backup file) into a valid drill.
 * Returns null if it has no name or no response for any signal except Distract.
 */
export function normalizeDrill(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const responses = {};
  for (const t of TYPES) responses[t] = text(raw.responses?.[t], LIMITS.response);
  const video = text(raw.video, LIMITS.video);
  const drill = {
    v: DRILL_VERSION,
    id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : newId(),
    name: text(raw.name, LIMITS.name),
    start: text(raw.start, LIMITS.start),
    responses,
    notes: text(raw.notes, LIMITS.notes),
    video: /^https?:\/\/\S+$/i.test(video) ? video : '', // never javascript: or other schemes
  };
  if (!drill.name || drillTypes(drill).length === 0) return null;
  return drill;
}

/** Signal types the drill responds to, without Distract. */
export function drillTypes(drill) {
  return TYPES.filter((t) => t !== 'distract' && drill.responses[t]);
}

/** Signal types an exercise uses, without Distract. */
export function exerciseTypes(def) {
  return TYPES.filter((t) => t !== 'distract' && def.mix[t] > 0);
}

/** Does the drill fit the exercise (same signal types, Distract optional)? */
export function drillFits(drill, def) {
  return drillTypes(drill).join() === exerciseTypes(def).join();
}

/** Compact text for the drill's signals, e.g. "High · Low". */
export function typesSummary(types, labels) {
  return types.map((t) => labels[t]).join(' · ');
}

/** Copy of a drill for sharing or backup: empty fields left out. */
export function compactDrill(drill) {
  const d = { v: drill.v, id: drill.id, name: drill.name, responses: {} };
  for (const t of TYPES) if (drill.responses[t]) d.responses[t] = drill.responses[t];
  for (const k of ['start', 'notes', 'video']) if (drill[k]) d[k] = drill[k];
  return d;
}

export function sameDrill(a, b) {
  return JSON.stringify(compactDrill(normalizeDrill(a))) === JSON.stringify(compactDrill(normalizeDrill(b)));
}
