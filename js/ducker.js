// Keep music from other apps (Spotify, ...) turned down while the app runs.
//
// A web page cannot set another app's volume, but on Android Chrome treats an
// <audio> element with a clip shorter than ~5 s as a short sound and requests
// "transient, may duck" audio focus. Android then lowers other apps for as
// long as that element keeps playing. So we play a silent 1.5 s clip and
// rewind it every second, so it never ends and the focus is never released.
// Pausing it gives the music its normal volume back.
//
// Android only: on iOS an <audio> element would pause other apps instead of
// lowering them, and iOS has no web API to duck other audio.

const REWIND_MS = 1000; // must be shorter than sounds/duck-hold.wav (1.5 s)

export const duckingSupported = !(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export class Ducker {
  constructor() {
    this.el = null;
    this.timer = 0;
  }

  set(on) {
    if (!duckingSupported) return;
    if (on && !this.timer) {
      if (!this.el) {
        this.el = new Audio('sounds/duck-hold.wav');
        this.el.preload = 'auto';
      }
      this.el.currentTime = 0;
      this.el.play().catch(() => { /* not allowed or unsupported */ });
      this.timer = setInterval(() => { this.el.currentTime = 0; }, REWIND_MS);
    } else if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
      this.el.pause();
    }
  }
}
