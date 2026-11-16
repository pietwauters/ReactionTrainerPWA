// Lookahead scheduler ("A Tale of Two Clocks" pattern).
// A coarse JS timer wakes up every TICK_MS; each client then schedules all
// sounds that fall within the next LOOKAHEAD_S seconds on the precise audio
// clock. This replaces the Thread.sleep loops of the Android app.

const TICK_MS = 25;
const LOOKAHEAD_S = 0.12;

export class Scheduler {
  constructor(audio) {
    this.audio = audio;
    this.clients = []; // objects with schedule(horizon, now)
    this.timer = null;
  }

  add(client) {
    this.clients.push(client);
  }

  /** Start ticking if any client is active; stop when none are. */
  update() {
    const active = this.clients.some((c) => c.active);
    if (active && !this.timer) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.tick();
    } else if (!active && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tick() {
    const now = this.audio.now;
    const horizon = now + LOOKAHEAD_S;
    for (const c of this.clients) {
      if (c.active) c.schedule(horizon, now);
    }
    this.update();
  }
}
