// EXPERIMENTAL: ask the phone to lower music from other apps (Spotify, ...)
// while a signal plays. A web page cannot set another app's volume; this
// relies on platform behaviour that differs per browser:
//
// Android (Chrome): an <audio> element with a clip shorter than ~5 s is
//   treated as a short sound and Chrome requests "transient, may duck" audio
//   focus. Android then lowers other apps until the clip ends. The clip is
//   silent; the signal itself still plays through Web Audio for exact timing.
//
// iOS (Safari 16.4+): switch navigator.audioSession to 'transient', which is
//   meant to duck other audio, and restore the normal type afterwards.
//
// The lowering starts when the signal is heard, never before, so a music dip
// cannot warn the athlete that a signal is coming.

const HOLD_MS = 1500; // also the length of sounds/duck-hold.wav

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class Ducker {
  constructor(audio) {
    this.audio = audio;
    this.timers = new Set();
    this.restoreTimer = 0;
    this.el = null;
  }

  /** Lower other apps' music when the sound scheduled at audio time `time` is heard. */
  at(time) {
    const delay = Math.max(0, (time + this.audio.outputLatency - this.audio.now) * 1000);
    const id = setTimeout(() => { this.timers.delete(id); this.#duck(); }, delay);
    this.timers.add(id);
  }

  /** Cancel pending ducks and give the music its volume back. */
  cancel() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.#restore();
  }

  #duck() {
    if (isIOS && navigator.audioSession) {
      try { navigator.audioSession.type = 'transient'; } catch { /* unsupported */ }
      clearTimeout(this.restoreTimer);
      this.restoreTimer = setTimeout(() => this.#restore(), HOLD_MS);
    } else {
      if (!this.el) {
        this.el = new Audio('sounds/duck-hold.wav');
        this.el.preload = 'auto';
      }
      this.el.currentTime = 0; // restarting keeps the focus during back-to-back signals
      this.el.play().catch(() => { /* not allowed or unsupported */ });
    }
  }

  #restore() {
    clearTimeout(this.restoreTimer);
    if (isIOS) {
      this.audio.setMixWithOthers(this.audio.mixWithOthers); // back to 'ambient'/'playback'
    } else if (this.el) {
      this.el.pause();
    }
  }
}
