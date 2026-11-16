// Audio engine: one AudioContext, a small mixer, synthesized signal tones and
// the metronome/ring samples.
//
// Mixer layout (every source goes through a bus so volumes, ducking and a
// future background-music player can be added without touching the rest):
//
//   signals   ─┐
//   metronome ─┼─> master ─> destination
//   music     ─┘   (music bus is reserved for a future background-music player)

const SAMPLE_FILES = {
  tickMain: 'sounds/tick-main.wav',
  tickSub: 'sounds/tick-sub.wav',
  ring: 'sounds/ring.wav',
};


export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buses = {};
    this.buffers = {};
    this.groups = new Map(); // group name -> Set of active sources
    this.loading = null;
    this.mixWithOthers = false;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Delay between scheduling a sound and hearing it (Bluetooth etc.). */
  get outputLatency() {
    if (!this.ctx) return 0;
    return this.ctx.outputLatency || this.ctx.baseLatency || 0;
  }

  /**
   * iOS audio session category.
   * 'playback': audio plays even with the silent switch on, but may pause
   *             music from other apps.
   * 'ambient':  mixes with music from other apps, but is muted by the
   *             silent switch.
   * Only Safari (16.4+) implements navigator.audioSession; elsewhere a no-op.
   */
  setMixWithOthers(mix) {
    this.mixWithOthers = mix;
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = mix ? 'ambient' : 'playback';
      }
    } catch { /* not supported */ }
  }

  /**
   * Must be called from a user gesture (tap). Creates/resumes the context
   * and loads all sounds. Safe to call repeatedly.
   */
  async unlock() {
    if (!this.ctx) {
      this.setMixWithOthers(this.mixWithOthers);
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.#buildMixer();
      // Play one silent sample inside the gesture: unlocks audio on older iOS.
      const silent = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = silent;
      src.connect(this.ctx.destination);
      src.start();
    }
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* retried on next tap */ }
    }
    if (!this.loading) this.loading = this.#loadAll();
    await this.loading;
  }

  #buildMixer() {
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const mk = (gain) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      g.connect(master);
      return g;
    };
    this.buses = {
      master,
      signals: mk(1.0),
      metronome: mk(1.0),
      music: mk(0.6), // reserved for background music
    };
  }

  async #loadAll() {
    // Signal tones: bit-exact copies of what the Android app generated.
    this.buffers.high = this.#androidTone(8800, false);
    this.buffers.low = this.#androidTone(1760, false);
    this.buffers.distract = this.#androidTone(7040, true);

    await Promise.all(
      Object.entries(SAMPLE_FILES).map(async ([name, url]) => {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        this.buffers[name] = await new Promise((resolve, reject) =>
          this.ctx.decodeAudioData(data, resolve, reject));
      }),
    );
  }

  /**
   * Reproduces genTone/genDistract from the Android MainActivity exactly,
   * including its byte-packing quirk: the high byte was written as
   * `val and (0xff00 ushr 8)` == `val and 0xff`, i.e. a copy of the low byte.
   * That turns the sine into a buzzy, harmonic-rich tone, which is the sound
   * users are trained on. 300 ms at 32 kHz, played back at 32 kHz.
   */
  #androidTone(freq, distract) {
    const SR = 32000;
    const n = (300 * SR) / 1000;
    const end1 = (100 * SR) / 1000;
    const end2 = end1 + (50 * SR) / 1000;
    const buf = this.ctx.createBuffer(1, n, SR); // the context resamples to its own rate
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const s = distract && i >= end1 && i < end2 ? 0 : Math.sin((2 * Math.PI * i) / (SR / freq));
      const lo = Math.trunc(s * 32767) & 0xff;           // (val and 0x00ff)
      const word = (lo << 8) | lo;                        // high byte = low byte
      d[i] = (word >= 0x8000 ? word - 0x10000 : word) / 32768; // little-endian signed 16-bit
    }
    return buf;
  }

  /** Schedule a buffer at audio-clock time `when` on a bus, tagged with a group. */
  play(name, when, bus = 'signals', group = 'default') {
    const buffer = this.buffers[name];
    if (!this.ctx || !buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.buses[bus]);
    src.start(Math.max(when, this.ctx.currentTime));
    let set = this.groups.get(group);
    if (!set) this.groups.set(group, (set = new Set()));
    set.add(src);
    src.onended = () => set.delete(src);
    return src;
  }

  /** Stop every scheduled or playing sound of a group. */
  cancel(group) {
    const set = this.groups.get(group);
    if (!set) return;
    for (const src of set) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    set.clear();
  }
}
