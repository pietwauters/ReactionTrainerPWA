// Audio engine: one AudioContext, a small mixer, synthesized signal tones and
// the metronome/ring samples.
//
// Mixer layout (every source goes through a bus so volumes, ducking and a
// future background-music player can be added without touching the rest):
//
//   signals   ─┐
//   metronome ─┤
//   music     ─┼─> master ─> destination
//   keepAlive ─┘
//
// music:     reserved for a future background-music player
// keepAlive: very quiet noise that stops Bluetooth speakers/headsets from
//            going to sleep during the silent gaps between signals

const SAMPLE_FILES = {
  tickMain: 'sounds/tick-main.wav',
  tickSub: 'sounds/tick-sub.wav',
  ring: 'sounds/ring.wav',
};

// About -50 dBFS. Brown noise is mostly low frequency, which phone and small
// Bluetooth speakers barely reproduce, so it is close to inaudible while the
// stream is never digital silence (what makes Bluetooth devices power down).
const KEEPALIVE_GAIN = 0.003;
const KEEPALIVE_FADE_S = 0.3;


export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buses = {};
    this.buffers = {};
    this.groups = new Map(); // group name -> Set of active sources
    this.loading = null;
    this.mixWithOthers = false;
    this.keepAliveSrc = null;
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
      keepAlive: mk(0),
    };
  }

  /** Start or stop the Bluetooth keep-alive noise (with a short fade). */
  setKeepAlive(on) {
    if (!this.ctx || !this.buffers.noise) return;
    const g = this.buses.keepAlive.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (on) {
      if (!this.keepAliveSrc) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers.noise;
        src.loop = true;
        src.loopStart = this.noiseLoopStart; // see #brownNoise
        src.loopEnd = this.buffers.noise.duration;
        src.connect(this.buses.keepAlive);
        src.start(t);
        this.keepAliveSrc = src;
      }
      g.linearRampToValueAtTime(KEEPALIVE_GAIN, t + KEEPALIVE_FADE_S);
    } else if (this.keepAliveSrc) {
      g.linearRampToValueAtTime(0, t + KEEPALIVE_FADE_S);
      this.keepAliveSrc.stop(t + KEEPALIVE_FADE_S);
      this.keepAliveSrc = null;
    }
  }

  /**
   * 4 s of brown noise, normalised to ±1. The last 50 ms are crossfaded into
   * the first 50 ms, so the end continues smoothly into sample `xf`; the loop
   * therefore restarts at xf (noiseLoopStart), not at 0.
   */
  #brownNoise() {
    const sr = this.ctx.sampleRate;
    const n = 4 * sr;
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // leaky integrator
      d[i] = last;
      peak = Math.max(peak, Math.abs(last));
    }
    // Crossfade the last 50 ms into the start so the loop point doesn't click.
    const xf = Math.round(0.05 * sr);
    for (let i = 0; i < xf; i++) {
      const a = i / xf;
      d[n - xf + i] = d[n - xf + i] * (1 - a) + d[i] * a;
    }
    for (let i = 0; i < n; i++) d[i] /= peak;
    this.noiseLoopStart = xf / sr;
    return buf;
  }

  async #loadAll() {
    // Signal tones: bit-exact copies of what the Android app generated.
    this.buffers.high = this.#androidTone(8800, false);
    this.buffers.low = this.#androidTone(1760, false);
    this.buffers.distract = this.#androidTone(7040, true);
    this.buffers.noise = this.#brownNoise();

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
