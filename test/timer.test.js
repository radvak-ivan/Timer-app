import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntervalTimer, PHASE, buildPhases, formatTime, totalDuration } from '../js/timer.js';

function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

function makeTimer(t, settings, clock) {
  const events = [];
  const timer = new IntervalTimer(
    buildPhases(settings),
    {
      onPhaseStart: (p) => events.push(`${p.type}:${p.round}`),
      onCountdown: (s) => events.push(`cd:${s}`),
      onFinish: () => events.push('finish'),
    },
    { now: clock.now, tickMs: 1e9 }, // ticks are driven manually below
  );
  t.after(() => timer.destroy()); // never leave an interval keeping the process alive
  return { timer, events };
}

test('buildPhases orders prepare, work and rest, without trailing rest', () => {
  const phases = buildPhases({ prepare: 10, work: 30, rest: 15, rounds: 3 });
  assert.deepEqual(
    phases.map((p) => `${p.type}:${p.round}`),
    ['prepare:1', 'work:1', 'rest:1', 'work:2', 'rest:2', 'work:3'],
  );
  assert.equal(totalDuration(phases), 10 + 30 * 3 + 15 * 2);
});

test('buildPhases skips prepare and rest when zero', () => {
  const phases = buildPhases({ prepare: 0, work: 20, rest: 0, rounds: 2 });
  assert.deepEqual(phases.map((p) => p.type), [PHASE.WORK, PHASE.WORK]);
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(4.2), '0:05');
  assert.equal(formatTime(90), '1:30');
  assert.equal(formatTime(3725), '1:02:05');
});

test('runs through all phases and finishes', (t) => {
  const clock = fakeClock();
  const { timer, events } = makeTimer(t, { prepare: 0, work: 5, rest: 3, rounds: 2 }, clock);
  timer.start();
  for (let i = 0; i < 140; i++) {
    clock.advance(100);
    timer.tick();
  }
  assert.deepEqual(events, [
    'work:1', 'cd:3', 'cd:2', 'cd:1',
    'rest:1', 'cd:2', 'cd:1', // 3 s phase: no "3" beep on top of the start tone
    'work:2', 'cd:3', 'cd:2', 'cd:1',
    'finish',
  ]);
  assert.equal(timer.finished, true);
  assert.equal(timer.running, false);
});

test('pause freezes remaining time', (t) => {
  const clock = fakeClock();
  const { timer } = makeTimer(t, { prepare: 0, work: 10, rest: 0, rounds: 1 }, clock);
  timer.start();
  clock.advance(4000);
  timer.tick();
  timer.pause();
  clock.advance(60000);
  assert.equal(timer.state().remaining, 6);
  timer.start();
  clock.advance(1000);
  timer.tick();
  assert.equal(timer.state().remaining, 5);
});

test('catches up when ticks are delayed', (t) => {
  const clock = fakeClock();
  const { timer, events } = makeTimer(t, { prepare: 0, work: 5, rest: 5, rounds: 2 }, clock);
  timer.start();
  clock.advance(8000); // past work 1 and 3 s into rest 1
  timer.tick();
  assert.equal(timer.phase.type, PHASE.REST);
  assert.equal(timer.state().remaining, 2);
  assert.ok(events.includes('rest:1'));
});

test('skip moves to the next phase and reset returns to start', (t) => {
  const clock = fakeClock();
  const { timer } = makeTimer(t, { prepare: 5, work: 20, rest: 10, rounds: 2 }, clock);
  timer.start();
  timer.skip();
  assert.equal(timer.phase.type, PHASE.WORK);
  assert.equal(timer.state().remaining, 20);
  timer.reset();
  assert.equal(timer.index, 0);
  assert.equal(timer.running, false);
});
