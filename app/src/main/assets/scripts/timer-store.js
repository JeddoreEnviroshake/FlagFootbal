const TIMER_KEY = 'synqro_timer_v1';

const TimerStore = {
  // Read persisted timer state
  load() {
    try { return JSON.parse(localStorage.getItem(TIMER_KEY)) || null; }
    catch { return null; }
  },
  // Persist { endAt: number, running: boolean, label?: string }
  save(state) {
    localStorage.setItem(TIMER_KEY, JSON.stringify(state));
  },
  clear() { localStorage.removeItem(TIMER_KEY); },

  start(durationMs, label = '') {
    const endAt = Date.now() + durationMs;
    this.save({ endAt, running: true, label });
    return endAt;
  },
  pause() {
    const s = this.load();
    if (!s || !s.running) return;
    const remainingMs = Math.max(0, s.endAt - Date.now());
    this.save({ running: false, remainingMs, label: s.label || '' });
  },
  resume() {
    const s = this.load();
    if (!s || s.running === true) return;
    const endAt = Date.now() + (s.remainingMs || 0);
    this.save({ endAt, running: true, label: s.label || '' });
  },
  stop() { this.clear(); },

  // Returns {remainingMs, running}
  getRemaining() {
    const s = this.load();
    if (!s) return { remainingMs: 0, running: false };
    if (!s.running) return { remainingMs: s.remainingMs || 0, running: false };
    return { remainingMs: Math.max(0, s.endAt - Date.now()), running: true };
  }
};
