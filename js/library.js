// The exercise library (built-in presets plus own exercises) and the drill library.
// Own exercises are stored on this device (localStorage); sharing and backup
// come on top of this (they use the same definition format).

import { PRESETS, TYPES, normalizeDef, newId } from './exercises.js';
import { normalizeDrill, drillFits } from './drills.js';

const STORE_KEY = 'reactiontrainer.exercises.v1';

export class Library {
  constructor() {
    this.custom = [];
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (Array.isArray(raw)) this.custom = raw.map(normalizeDef).filter((d) => d && !d.builtIn);
    } catch { /* ignore */ }
  }

  #persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.custom)); } catch { /* ignore */ }
  }

  get presets() { return PRESETS; }

  get(id) {
    return PRESETS.find((d) => d.id === id) ?? this.custom.find((d) => d.id === id) ?? null;
  }

  /** Insert or replace an own exercise; returns the stored definition. */
  save(def) {
    const d = normalizeDef({ ...def, builtIn: false, legacyRemainder: undefined });
    delete d.builtIn;
    delete d.legacyRemainder;
    const i = this.custom.findIndex((x) => x.id === d.id);
    if (i >= 0) this.custom[i] = d; else this.custom.push(d);
    this.#persist();
    // ask the browser not to clear our storage when space runs low (best effort)
    navigator.storage?.persist?.().catch(() => {});
    return d;
  }

  /** Replace all own exercises (restoring a backup). */
  replaceAll(defs) {
    this.custom = [];
    for (const d of defs) this.save(d);
    this.#persist();
  }

  remove(id) {
    this.custom = this.custom.filter((d) => d.id !== id);
    this.#persist();
  }

  /** An unsaved copy of a definition, as a starting point for a new exercise. */
  copyOf(def) {
    const d = structuredClone(def);
    delete d.builtIn;
    delete d.legacyRemainder;
    d.id = newId();
    d.name = this.#uniqueName(`${def.name.replace(/\s*\n\s*/g, ' ')} (copy)`);
    return d;
  }

  /** An unsaved new exercise with sensible defaults. */
  blank() {
    const mix = Object.fromEntries(TYPES.map((t) => [t, 0]));
    mix.high = 50;
    mix.low = 50;
    return normalizeDef({ id: newId(), name: this.#uniqueName('My exercise'), mix });
  }

  #uniqueName(base) {
    const names = new Set(this.custom.map((d) => d.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
  }
}

// ---------- drills ----------

const DRILL_KEY = 'reactiontrainer.drills.v1';

export class DrillLibrary {
  constructor() {
    this.all = [];
    try {
      const raw = JSON.parse(localStorage.getItem(DRILL_KEY) || '[]');
      if (Array.isArray(raw)) this.all = raw.map(normalizeDrill).filter(Boolean);
    } catch { /* ignore */ }
  }

  #persist() {
    try { localStorage.setItem(DRILL_KEY, JSON.stringify(this.all)); } catch { /* ignore */ }
    navigator.storage?.persist?.().catch(() => {});
  }

  get(id) { return this.all.find((d) => d.id === id) ?? null; }

  /** Drills that fit an exercise, sorted by name. */
  forExercise(def) {
    return this.all.filter((d) => drillFits(d, def)).sort(byName);
  }

  sorted() { return this.all.slice().sort(byName); }

  /** Insert or replace a drill; returns the stored drill (or null if invalid). */
  save(drill) {
    const d = normalizeDrill(drill);
    if (!d) return null;
    const i = this.all.findIndex((x) => x.id === d.id);
    if (i >= 0) this.all[i] = d; else this.all.push(d);
    this.#persist();
    return d;
  }

  replaceAll(drills) {
    this.all = drills.map(normalizeDrill).filter(Boolean);
    this.#persist();
  }

  remove(id) {
    this.all = this.all.filter((d) => d.id !== id);
    this.#persist();
  }

  /** An unsaved copy, e.g. to keep both versions of a shared drill. */
  copyOf(drill) {
    const names = new Set(this.all.map((d) => d.name));
    let name = `${drill.name} (copy)`;
    for (let i = 2; names.has(name); i++) name = `${drill.name} (copy ${i})`;
    return { ...structuredClone(drill), id: newId(), name };
  }
}

const byName = (a, b) => a.name.localeCompare(b.name);
