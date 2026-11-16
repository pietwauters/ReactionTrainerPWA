// Colour flashes, synchronised to the audio clock.
// Each change is queued with the audio time of its sound and applied by a
// requestAnimationFrame loop when that sound actually reaches the speaker.

export class Visuals {
  constructor(audio, el) {
    this.audio = audio;
    this.el = el;
    this.queue = []; // sorted [{time, color}]
    this.raf = 0;
  }

  at(time, color) {
    this.queue.push({ time, color });
    this.queue.sort((a, b) => a.time - b.time);
    if (!this.raf) this.raf = requestAnimationFrame(() => this.#frame());
  }

  clear() {
    this.queue = [];
    this.#apply('');
  }

  #frame() {
    this.raf = 0;
    const heard = this.audio.now - this.audio.outputLatency;
    while (this.queue.length && this.queue[0].time <= heard) {
      this.#apply(this.queue.shift().color);
    }
    if (this.queue.length) this.raf = requestAnimationFrame(() => this.#frame());
  }

  #apply(color) {
    if (color) this.el.style.setProperty('--flash', color);
    else this.el.style.removeProperty('--flash');
    this.el.classList.toggle('flashing', !!color);
  }
}
