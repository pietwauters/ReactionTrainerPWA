// A training session: start ring, the shuffled signals, end ring.
// Timing reproduces the Android thread loop:
//   ring, 1.4 s, then per signal: wait (random gap - 0.5 s), signal,
//   colour held 0.8 s after the (last) tone; after the last signal one more
//   random gap, the end ring and 1.4 s.

import { SIGNAL, TONE_MS, CHOICE_MS, AFTER_MS, randInt } from './exercises.js';

export const COLOR = { HIGH: '#00ff00', LOW: '#ff0000', NONE: '' };

const RING_S = 1.4;
const HOLD_S = (TONE_MS + AFTER_MS) / 1000;

export class Session {
  /**
   * @param audio     AudioEngine
   * @param visuals   Visuals (colour flashes)
   * @param metronome Metronome
   * @param options   () => ({ changeTempo, sync })  read live
   */
  constructor(audio, visuals, metronome, options) {
    this.audio = audio;
    this.visuals = visuals;
    this.metronome = metronome;
    this.options = options;
    this.active = false;
    this.phase = 'idle';
    this.onEnd = null;
  }

  start(exercise) {
    this.ex = exercise;
    this.queue = exercise.list.slice();
    this.timed = []; // [{at, fn}] actions that must happen at a later audio time
    const t0 = this.audio.now + 0.05;
    this.audio.play('ring', t0, 'signals', 'session');
    this.nextAt = t0 + RING_S + (this.#gap() - 500) / 1000;
    this.phase = 'signals';
    this.active = true;
  }

  stop() {
    if (!this.active) return;
    this.audio.cancel('session');
    this.visuals.clear();
    this.#finish();
  }

  #finish() {
    this.active = false;
    this.phase = 'idle';
    if (this.onEnd) this.onEnd();
  }

  #gap() {
    return randInt(this.ex.avg - this.ex.sigma, this.ex.avg + this.ex.sigma);
  }

  /** Called by the metronome for each point halfway after a sub tick. */
  syncPoint(time) {
    if (this.active && this.phase === 'signals' && this.#syncing() && time >= this.nextAt) {
      this.#fire(time);
    }
  }

  #syncing() {
    return this.options().sync && this.metronome.active && this.queue.length > 0;
  }

  schedule(horizon, now) {
    // deferred actions (tempo changes at the moment of the second tone)
    this.timed = this.timed.filter((a) => {
      if (a.at < horizon) { a.fn(); return false; }
      return true;
    });

    if (this.phase === 'signals') {
      if (this.queue.length === 0) {
        this.ringAt = this.lastEnd + this.#gap() / 1000;
        this.phase = 'outro';
      } else if (!this.#syncing() && this.nextAt < horizon) {
        this.#fire(Math.max(this.nextAt, now + 0.02));
      }
    }
    if (this.phase === 'outro' && this.ringAt < horizon) {
      this.audio.play('ring', this.ringAt, 'signals', 'session');
      this.endAt = this.ringAt + RING_S;
      this.phase = 'ending';
    }
    if (this.phase === 'ending' && now >= this.endAt) {
      this.#finish();
    }
  }

  #fire(t) {
    const type = this.queue.pop();
    const changeTempo = () => { if (this.options().changeTempo) this.metronome.randomizeTempo(); };
    const at = (time, fn) => this.timed.push({ at: time, fn });
    let last = t;

    switch (type) {
      case SIGNAL.HIGH:
        changeTempo();
        this.#sound('high', COLOR.HIGH, t);
        break;
      case SIGNAL.LOW:
        changeTempo();
        this.#sound('low', COLOR.LOW, t);
        break;
      case SIGNAL.DISTRACT:
        this.#sound('distract', COLOR.NONE, t);
        break;
      case SIGNAL.CHANGE:
        this.#sound('high', COLOR.HIGH, t);
        last = t + (TONE_MS + CHOICE_MS) / 1000;
        at(last, changeTempo);
        this.#sound('low', COLOR.LOW, last);
        break;
      case SIGNAL.ANTICIPATION: {
        this.#sound('high', COLOR.HIGH, t);
        this.visuals.at(t + HOLD_S, COLOR.NONE);
        const wait = randInt(3200 - this.ex.sigma, 3500 + this.ex.sigma);
        last = t + HOLD_S + (wait - 500) / 1000;
        at(last, changeTempo);
        this.#sound('low', COLOR.LOW, last);
        break;
      }
    }
    this.visuals.at(last + HOLD_S, COLOR.NONE);
    this.lastEnd = last + HOLD_S;
    this.nextAt = this.lastEnd + (this.#gap() - 500) / 1000;
  }

  #sound(name, color, t) {
    this.audio.play(name, t, 'signals', 'session');
    this.visuals.at(t, color);
  }
}
