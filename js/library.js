// The exercise library: the built-in presets plus the user's own exercises.
// Own exercises are stored on this device (localStorage); sharing and backup
// come on top of this (they use the same definition format).

import { PRESETS, TYPES, normalizeDef, newId } from './exercises.js';

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
    return d;
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
