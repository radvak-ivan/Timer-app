// Beep sounds for the timer.
//
// The beeps are synthesised in JavaScript into small WAV clips and played through
// <audio> elements, the same way music or video plays. On iPhone this matters:
// Safari mutes Web Audio when the ring/silent switch is on, but media playback
// still plays (at media volume).
//
// iOS only lets an <audio> element play from code after it has played once
// during a user tap, so unlock() must be called from a tap (Start, mute button).

const MUTE_KEY = 'timer.muted';
const SAMPLE_RATE = 44100;
const VOLUME = 0.9;

// Each sound is a list of tones: [frequency Hz, duration ms, start offset ms].
const SOUNDS = {
  countdown: [[880, 160, 0]],
  work: [[1320, 600, 0]],
  rest: [
    [988, 250, 0],
    [740, 400, 300],
  ],
  finish: [
    [988, 200, 0],
    [1175, 200, 240],
    [1568, 600, 480],
  ],
};

export class Sound {
  constructor() {
    this.muted = readMuted();
    this.players = {};
    this.unlocked = false;
    for (const [name, tones] of Object.entries(SOUNDS)) {
      const el = new Audio(wavUrl(renderTones(tones)));
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      this.players[name] = el;
    }
  }

  /** Call from a user tap. Plays every clip silently once so iOS allows later playback. */
  unlock() {
    try {
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }
    if (this.unlocked) return;
    this.unlocked = true;
    for (const el of Object.values(this.players)) {
      el.muted = true;
      const done = () => {
        // Skip if a real beep was requested on this element meanwhile (it unmuted it).
        if (!el.muted) return;
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      };
      const p = el.play();
      if (p && p.then) p.then(done, () => {
        el.muted = false;
        this.unlocked = false; // try again on the next tap
      });
      else done();
    }
  }

  stop() {
    for (const el of Object.values(this.players)) el.pause();
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

  play(name) {
    if (this.muted) return;
    const el = this.players[name];
    el.muted = false;
    el.currentTime = 0;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
  }

  countdown() {
    this.play('countdown');
  }

  work() {
    this.play('work');
  }

  rest() {
    this.play('rest');
  }

  finish() {
    this.play('finish');
  }
}

/** Mix tones into one buffer of samples in the range -1..1 (triangle waves with soft edges). */
export function renderTones(tones) {
  const lengthMs = Math.max(...tones.map(([, dur, off]) => off + dur)) + 20;
  const out = new Float32Array(Math.ceil((lengthMs / 1000) * SAMPLE_RATE));
  for (const [freq, dur, off] of tones) {
    const start = Math.floor((off / 1000) * SAMPLE_RATE);
    const n = Math.floor((dur / 1000) * SAMPLE_RATE);
    const attack = 0.01 * SAMPLE_RATE;
    const release = 0.05 * SAMPLE_RATE;
    for (let i = 0; i < n; i++) {
      const phase = (i * freq) / SAMPLE_RATE;
      const tri = 4 * Math.abs(phase - Math.floor(phase + 0.5)) - 1;
      const env = Math.min(1, i / attack, (n - i) / release);
      out[start + i] += tri * env * VOLUME;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

/** Encode samples as a 16-bit mono WAV and return a blob URL. */
function wavUrl(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i] * 0x7fff, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
