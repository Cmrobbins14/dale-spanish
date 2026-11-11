// Counts ACTIVE practice seconds during lessons and reviews.
// Pauses when the app is in the background or after a stretch of no taps,
// so leaving the iPad on the couch doesn't fill the daily goal.

const IDLE_AFTER_MS = 60_000; // no tap/key for a minute → paused
const TICK_MS = 1000;

export class ActiveTimer {
  /** @param {(seconds:number)=>void} onSeconds called with newly counted seconds */
  constructor(onSeconds) {
    this.onSeconds = onSeconds;
    this.running = false;
    this.lastInput = Date.now();
    this.pending = 0;
    this.total = 0;
    this._poke = () => { this.lastInput = Date.now(); };
    this._vis = () => { if (document.hidden) this.flush(); };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastInput = Date.now();
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, this._poke, { passive: true }));
    document.addEventListener('visibilitychange', this._vis);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Speech playback/listening counts as activity even without taps. */
  poke() { this._poke(); }

  tick() {
    if (document.hidden) return;
    if (Date.now() - this.lastInput > IDLE_AFTER_MS) return;
    this.pending += 1;
    this.total += 1;
    if (this.pending >= 15) this.flush();
  }

  flush() {
    if (this.pending > 0) {
      const s = this.pending;
      this.pending = 0;
      this.onSeconds(s);
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, this._poke));
    document.removeEventListener('visibilitychange', this._vis);
    this.flush();
  }
}
