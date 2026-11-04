// Generated beeps via the Web Audio API, so no audio files are needed.
//
// Mobile quirks handled here:
// - Audio must be started from a user tap, so unlock() is called on Start and other taps.
// - iOS silences Web Audio when the ring/silent switch is on. Declaring a "playback"
//   audio session (iOS 17+), or playing a silent <audio> element on older iOS, moves
//   the page into the media category so beeps play even in silent mode.
// - iOS/Android can suspend the AudioContext (calls, backgrounding); it is resumed
//   before each beep and on every tap.

const MUTE_KEY = 'timer.muted';
const VOLUME = 0.9;

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.keepAlive = null;
    this.muted = readMuted();
  }

  /** Call from a user gesture (tap). Safe to call repeatedly. */
  unlock() {
    setPlaybackSession();

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      // A compressor lets the beeps be loud on small phone speakers without clipping.
      this.master = this.ctx.createDynamicsCompressor();
      this.master.connect(this.ctx.destination);
    }
    this.resume();

    // Playing a buffer synchronously inside the gesture is what actually unlocks iOS.
    const src = this.ctx.createBufferSource();
    src.buffer = this.ctx.createBuffer(1, 1, 22050);
    src.connect(this.ctx.destination);
    src.start(0);

    if (isIOS && !('audioSession' in navigator)) this.startKeepAlive();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  /** Silent looping media element: keeps older iOS in playback mode (ignores silent switch). */
  startKeepAlive() {
    if (!this.keepAlive) {
      this.keepAlive = new Audio(silentWavUrl());
      this.keepAlive.loop = true;
      this.keepAlive.setAttribute('playsinline', '');
    }
    this.keepAlive.play().catch(() => {});
  }

  /** Release the audio session when no workout is running. */
  stop() {
    this.keepAlive?.pause();
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

  beep(freq, durationMs, startOffset = 0, volume = VOLUME) {
    if (this.muted || !this.ctx) return;
    this.resume();
    const t0 = this.ctx.currentTime + startOffset + 0.01;
    const end = t0 + durationMs / 1000;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    // Triangle carries better than a pure sine on tiny speakers while staying pleasant.
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.setValueAtTime(volume, Math.max(t0 + 0.01, end - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(end + 0.02);
  }

  /** Short tick for the 3-2-1 countdown. */
  countdown() {
    this.beep(880, 160);
  }

  /** Start of a work phase: high, longer tone. */
  work() {
    this.beep(1320, 600);
  }

  /** Start of a rest phase: falling double tone. */
  rest() {
    this.beep(988, 250);
    this.beep(740, 400, 0.3);
  }

  /** Workout complete: rising triple tone. */
  finish() {
    this.beep(988, 200);
    this.beep(1175, 200, 0.24);
    this.beep(1568, 600, 0.48);
  }
}

function setPlaybackSession() {
  try {
    if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
  } catch {
    /* not supported */
  }
}

let silentUrl = null;

/** A 1-second silent 8 kHz mono WAV, built in memory. */
function silentWavUrl() {
  if (silentUrl) return silentUrl;
  const samples = 8000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true); // sample rate
  v.setUint32(28, 8000, true); // byte rate
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128); // 8-bit silence
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silentUrl;
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
