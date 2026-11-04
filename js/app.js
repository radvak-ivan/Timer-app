import { IntervalTimer, PHASE, buildPhases, formatTime, totalDuration } from './timer.js';
import { Sound } from './sound.js';

const SETTINGS_KEY = 'timer.settings';
const DEFAULTS = { work: 30, rest: 15, rounds: 8, prepare: 10 };
const RING_CIRCUMFERENCE = 2 * Math.PI * 90;

const PHASE_LABELS = {
  [PHASE.PREPARE]: 'Get ready',
  [PHASE.WORK]: 'Work',
  [PHASE.REST]: 'Rest',
};

const ICONS = {
  soundOn:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  soundOff:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" class="fill"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" class="fill"/></svg>',
};

const $ = (sel) => document.querySelector(sel);
const sound = new Sound();
let settings = loadSettings();
let timer = null;
let wakeLock = null;

// ---------- Settings ----------

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

function renderSettings() {
  document.querySelectorAll('.setting').forEach((el) => {
    const key = el.dataset.key;
    const value = settings[key];
    el.querySelector('.value').textContent =
      el.dataset.kind === 'time' ? (value === 0 ? 'Off' : formatTime(value)) : String(value);
    el.querySelector('[data-dir="-1"]').disabled = value <= Number(el.dataset.min);
    el.querySelector('[data-dir="1"]').disabled = value >= Number(el.dataset.max);
  });
  $('#total-time').textContent = formatTime(totalDuration(buildPhases(settings)));
}

function stepSetting(el, dir) {
  const key = el.dataset.key;
  const min = Number(el.dataset.min);
  const max = Number(el.dataset.max);
  let step = Number(el.dataset.step);
  // Bigger steps for longer times so reaching e.g. 5 minutes isn't tedious.
  if (el.dataset.kind === 'time') {
    const ref = dir > 0 ? settings[key] : settings[key] - 1;
    if (ref >= 300) step = 30;
    else if (ref >= 60) step = 15;
  }
  const next = Math.min(max, Math.max(min, settings[key] + dir * step));
  if (next === settings[key]) return false;
  settings[key] = next;
  renderSettings();
  saveSettings();
  return true;
}

// Tap to step once; press and hold to repeat with acceleration.
function bindSteppers() {
  document.querySelectorAll('.setting .step').forEach((btn) => {
    const setting = btn.closest('.setting');
    const dir = Number(btn.dataset.dir);
    let timeoutId = null;

    const stop = () => {
      clearTimeout(timeoutId);
      timeoutId = null;
    };
    const repeat = (delay) => {
      timeoutId = setTimeout(() => {
        if (stepSetting(setting, dir)) repeat(Math.max(50, delay * 0.85));
        else stop();
      }, delay);
    };

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stepSetting(setting, dir);
      repeat(400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    // Keyboard activation (Enter / Space).
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) stepSetting(setting, dir);
    });
  });
}

// ---------- Mute ----------

function renderMute() {
  document.querySelectorAll('.mute-btn').forEach((btn) => {
    btn.innerHTML = sound.muted ? ICONS.soundOff : ICONS.soundOn;
    btn.setAttribute('aria-pressed', String(sound.muted));
    btn.setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound');
    btn.classList.toggle('muted', sound.muted);
  });
}

// ---------- Running ----------

function showScreen(id) {
  $('#setup').hidden = id !== 'setup';
  $('#run').hidden = id !== 'run';
}

function startWorkout() {
  sound.unlock();
  const phases = buildPhases(settings);
  const workRounds = settings.rounds;

  timer = new IntervalTimer(phases, {
    onTick: (state) => renderRun(state, workRounds),
    onPhaseStart: (phase) => {
      document.body.dataset.phase = phase.type;
      if (phase.type === PHASE.WORK) sound.work();
      else if (phase.type === PHASE.REST) sound.rest();
      vibrate(phase.type === PHASE.WORK ? [300] : [150, 100, 150]);
    },
    onCountdown: () => sound.countdown(),
    onFinish: () => {
      sound.finish();
      vibrate([200, 100, 200, 100, 400]);
      document.body.dataset.phase = 'done';
      $('#phase-label').textContent = 'Done!';
      $('#round-label').textContent = 'Workout complete';
      releaseWakeLock();
      renderToggle();
    },
  });

  showScreen('run');
  timer.start();
  requestWakeLock();
  renderToggle();
}

function renderRun(state, workRounds) {
  if (!state.finished) {
    $('#phase-label').textContent = PHASE_LABELS[state.phase.type];
    $('#round-label').textContent = `Round ${state.phase.round} / ${workRounds}`;
  }
  $('#time-left').textContent = formatTime(state.remaining);
  $('#total-left').textContent = formatTime(state.totalRemaining);
  const progress = state.finished ? 1 : Math.min(1, Math.max(0, state.progress));
  $('#ring-progress').style.strokeDashoffset = String(RING_CIRCUMFERENCE * progress);
}

function renderToggle() {
  const btn = $('#toggle-btn');
  const finished = timer?.finished;
  const running = timer?.running;
  btn.innerHTML = running ? ICONS.pause : ICONS.play;
  btn.setAttribute('aria-label', finished ? 'Start again' : running ? 'Pause' : 'Resume');
  document.body.classList.toggle('paused', !!timer && !running && !finished);
}

function toggleRun() {
  if (!timer) return;
  sound.unlock();
  if (timer.finished) {
    timer.reset();
    timer.start();
    requestWakeLock();
  } else {
    timer.toggle();
    timer.running ? requestWakeLock() : releaseWakeLock();
  }
  renderToggle();
}

function resetRun() {
  if (!timer) return;
  const wasRunning = timer.running;
  timer.reset();
  document.body.dataset.phase = timer.phase.type;
  if (wasRunning) timer.start();
  else renderRun(timer.state(), settings.rounds);
  renderToggle();
}

function stopWorkout() {
  timer?.destroy();
  timer = null;
  releaseWakeLock();
  delete document.body.dataset.phase;
  document.body.classList.remove('paused');
  showScreen('setup');
}

// ---------- Device helpers ----------

function vibrate(pattern) {
  // Vibration stays on when muted so cues still work in quiet places.
  if (navigator.vibrate) navigator.vibrate(pattern);
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {
    /* not supported or denied */
  }
}

function releaseWakeLock() {
  wakeLock?.release();
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  // Wake locks are dropped when the page is hidden; re-acquire on return.
  if (document.visibilityState === 'visible' && timer?.running) requestWakeLock();
});

// ---------- Init ----------

bindSteppers();
renderSettings();
renderMute();

$('#start-btn').addEventListener('click', startWorkout);
$('#toggle-btn').addEventListener('click', toggleRun);
$('#reset-btn').addEventListener('click', resetRun);
$('#skip-btn').addEventListener('click', () => {
  timer?.skip();
  renderToggle();
});
$('#close-btn').addEventListener('click', stopWorkout);
document.querySelectorAll('.mute-btn').forEach((btn) =>
  btn.addEventListener('click', () => {
    sound.unlock();
    sound.toggleMuted();
    renderMute();
  }),
);

$('#ring-progress').style.strokeDasharray = String(RING_CIRCUMFERENCE);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
