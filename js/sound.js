// Generated beeps via the Web Audio API, so no audio files are needed.

const MUTE_KEY = 'timer.muted';

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
  }

  /** Must be called from a user gesture (e.g. tapping Start) on mobile browsers. */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  beep(freq, durationMs, startOffset = 0, volume = 0.4) {
    if (this.muted || !this.ctx) return;
    const t0 = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.02);
  }

  /** Short tick for the 3-2-1 countdown. */
  countdown() {
    this.beep(660, 150);
  }

  /** Start of a work phase: high, longer tone. */
  work() {
    this.beep(1046, 500, 0, 0.5);
  }

  /** Start of a rest phase: lower double tone. */
  rest() {
    this.beep(523, 250);
    this.beep(392, 350, 0.28);
  }

  /** Workout complete: rising triple tone. */
  finish() {
    this.beep(784, 200);
    this.beep(988, 200, 0.22);
    this.beep(1318, 500, 0.44, 0.5);
  }
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
