// Core interval-timer logic. No DOM access here so it can be tested in Node.

export const PHASE = Object.freeze({
  PREPARE: 'prepare',
  WORK: 'work',
  REST: 'rest',
});

/**
 * Build the ordered list of phases for a workout.
 * Durations are in seconds. A rest phase is not added after the final round.
 */
export function buildPhases({ prepare = 0, work, rest = 0, rounds }) {
  const phases = [];
  if (prepare > 0) phases.push({ type: PHASE.PREPARE, duration: prepare, round: 1 });
  for (let round = 1; round <= rounds; round++) {
    phases.push({ type: PHASE.WORK, duration: work, round });
    if (rest > 0 && round < rounds) phases.push({ type: PHASE.REST, duration: rest, round });
  }
  return phases;
}

export function totalDuration(phases) {
  return phases.reduce((sum, p) => sum + p.duration, 0);
}

/** Format seconds as M:SS (or H:MM:SS for long workouts). */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Timestamp-based timer: remaining time is computed from the clock, not from
 * counting ticks, so it stays accurate even if ticks are delayed.
 *
 * Events (all optional):
 *   onTick(state)            - every tick while running
 *   onPhaseStart(phase, idx) - when a phase begins (including the first)
 *   onCountdown(secondsLeft) - once each for 3, 2, 1 seconds left in a phase
 *   onFinish()               - when the last phase ends
 */
export class IntervalTimer {
  constructor(phases, handlers = {}, { now = () => performance.now(), tickMs = 100 } = {}) {
    if (!phases.length) throw new Error('No phases to run');
    this.phases = phases;
    this.handlers = handlers;
    this.now = now;
    this.tickMs = tickMs;
    this.intervalId = null;
    this.reset();
  }

  get running() {
    return this.intervalId !== null;
  }

  get phase() {
    return this.phases[this.index];
  }

  reset() {
    this.stopInterval();
    this.index = 0;
    this.remainingMs = this.phases[0].duration * 1000;
    this.phaseEndAt = null;
    this.started = false;
    this.finished = false;
    this.lastCountdown = null;
  }

  start() {
    if (this.running || this.finished) return;
    if (!this.started) {
      this.started = true;
      this.emit('onPhaseStart', this.phase, this.index);
    }
    this.phaseEndAt = this.now() + this.remainingMs;
    this.intervalId = setInterval(() => this.tick(), this.tickMs);
    this.tick();
  }

  pause() {
    if (!this.running) return;
    this.remainingMs = Math.max(0, this.phaseEndAt - this.now());
    this.stopInterval();
    this.emit('onTick', this.state());
  }

  toggle() {
    this.running ? this.pause() : this.start();
  }

  /** Jump to the next phase immediately. */
  skip() {
    if (this.finished) return;
    if (!this.started) this.started = true;
    this.advance(this.running ? this.now() : null);
    this.emit('onTick', this.state());
  }

  tick() {
    if (!this.running) return;
    const t = this.now();
    // Catch up through any phases that ended while ticks were delayed.
    while (!this.finished && t >= this.phaseEndAt) {
      this.advance(this.phaseEndAt);
    }
    if (this.finished) return;

    this.remainingMs = this.phaseEndAt - t;
    const secondsLeft = Math.ceil(this.remainingMs / 1000);
    // Skip the countdown beep that would overlap the phase-start sound in short phases.
    const inCountdown = secondsLeft <= 3 && secondsLeft >= 1 && secondsLeft < this.phase.duration;
    if (inCountdown && secondsLeft !== this.lastCountdown) {
      this.lastCountdown = secondsLeft;
      this.emit('onCountdown', secondsLeft);
    }
    this.emit('onTick', this.state());
  }

  /** Move to the next phase. `from` is when it starts (null when paused). */
  advance(from) {
    this.lastCountdown = null;
    if (this.index >= this.phases.length - 1) {
      this.finished = true;
      this.remainingMs = 0;
      this.stopInterval();
      this.emit('onTick', this.state());
      this.emit('onFinish');
      return;
    }
    this.index++;
    this.remainingMs = this.phase.duration * 1000;
    if (from !== null) this.phaseEndAt = from + this.remainingMs;
    this.emit('onPhaseStart', this.phase, this.index);
  }

  state() {
    const elapsedBefore = totalDuration(this.phases.slice(0, this.index));
    const phaseElapsed = this.phase.duration - this.remainingMs / 1000;
    return {
      phase: this.phase,
      index: this.index,
      remaining: this.remainingMs / 1000,
      progress: this.phase.duration ? phaseElapsed / this.phase.duration : 1,
      totalRemaining: totalDuration(this.phases) - elapsedBefore - phaseElapsed,
      running: this.running,
      finished: this.finished,
    };
  }

  destroy() {
    this.stopInterval();
    this.handlers = {};
  }

  stopInterval() {
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  emit(name, ...args) {
    const fn = this.handlers[name];
    if (fn) fn(...args);
  }
}
