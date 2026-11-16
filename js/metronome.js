// Metronome.
//
// Same model as the Android app, with clearer names:
//   base        tempo in bars of the note value per minute (Android "bpm")
//   noteValue   lower number of the time signature: 2, 4 or 8
//   beatsPerBar upper number of the time signature: 2, 3, 4 or 6
// Every tick is 60 / (base * noteValue) seconds apart, so
// clicks per minute = base * noteValue. Every beatsPerBar-th tick is accented.

import { randInt } from './exercises.js';

export const BASE_STEP = 2;
export const BASE_MIN = 2;

export class Metronome {
  constructor(audio) {
    this.audio = audio;
    this.mainBase = 20;     // tempo set by the user
    this.base = 20;         // current tempo (may be randomised by signals)
    this.noteValue = 4;
    this.beatsPerBar = 2;
    this.active = false;
    this.nextTime = 0;
    this.tickIndex = 0;
    this.onSubTickMidpoint = null; // (time) => void, used to sync signals
    this.onChange = null;          // () => void, UI refresh
  }

  get clicksPerMinute() { return this.mainBase * this.noteValue; }
  get currentClicksPerMinute() { return this.base * this.noteValue; }

  start() {
    this.base = this.mainBase;
    this.tickIndex = 0;
    this.nextTime = this.audio.now + 0.05;
    this.active = true;
    this.#changed();
  }

  stop() {
    this.active = false;
    this.audio.cancel('metronome');
    this.#changed();
  }

  faster() {
    this.mainBase += BASE_STEP;
    this.base = this.mainBase;
    this.#changed();
  }

  slower() {
    if (this.mainBase > BASE_STEP) this.mainBase -= BASE_STEP;
    this.base = this.mainBase;
    this.#changed();
  }

  /** Lower number: 2 -> 4 -> 8 -> 2 (back to 2/2). */
  cycleNoteValue() {
    switch (this.noteValue) {
      case 2: this.noteValue = 4; break;
      case 4: this.noteValue = 8; break;
      default: this.noteValue = 2; this.beatsPerBar = 2;
    }
    this.#changed();
  }

  /** Upper number; the allowed values depend on the note value. */
  cycleBeatsPerBar() {
    const n = this.noteValue;
    switch (this.beatsPerBar) {
      case 2: if (n > 2) this.beatsPerBar = 3; break;
      case 3: this.beatsPerBar = n > 3 ? 4 : 2; break;
      case 4: this.beatsPerBar = n > 7 ? 6 : 2; break;
      default: this.beatsPerBar = 2;
    }
    this.#changed();
  }

  /** Random tempo within -20%..+20% of the user's tempo ("Change tempo on signal"). */
  randomizeTempo() {
    const m = this.mainBase;
    this.base = Math.max(1, randInt(Math.trunc((4 * m) / 5), Math.trunc((6 * m) / 5)));
    this.#changed();
  }

  schedule(horizon, now) {
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.05; // fell behind (tab was suspended)
    while (this.nextTime < horizon) {
      const accent = this.tickIndex % this.beatsPerBar === 0;
      this.audio.play(accent ? 'tickMain' : 'tickSub', this.nextTime, 'metronome', 'metronome');
      const interval = 60 / (this.base * this.noteValue);
      if (!accent && this.onSubTickMidpoint) {
        this.onSubTickMidpoint(this.nextTime + interval / 2);
      }
      this.nextTime += interval;
      this.tickIndex++;
    }
  }

  #changed() {
    if (this.onChange) this.onChange();
  }
}
