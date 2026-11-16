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

const FADE_S = 0.003; // short fade to avoid clicks at tone edges

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
    const sr = this.ctx.sampleRate;
    // Synthesized tones, same frequencies and lengths as the Android app.
    this.buffers.high = this.#tone(8800, [[0, 300]], 300, sr);
    this.buffers.low = this.#tone(1760, [[0, 300]], 300, sr);
    this.buffers.distract = this.#tone(7040, [[0, 100], [150, 300]], 300, sr);

    await Promise.all(
      Object.entries(SAMPLE_FILES).map(async ([name, url]) => {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        this.buffers[name] = await new Promise((resolve, reject) =>
          this.ctx.decodeAudioData(data, resolve, reject));
      }),
    );
  }

  /** Sine tone, played only within the given [startMs, endMs] segments. */
  #tone(freq, segments, totalMs, sr) {
    const len = Math.round((totalMs / 1000) * sr);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const fade = Math.round(FADE_S * sr);
    for (const [a, b] of segments) {
      const s0 = Math.round((a / 1000) * sr);
      const s1 = Math.min(len, Math.round((b / 1000) * sr));
      for (let i = s0; i < s1; i++) {
        const env = Math.min(1, (i - s0) / fade, (s1 - 1 - i) / fade);
        d[i] = Math.sin((2 * Math.PI * i * freq) / sr) * env;
      }
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
