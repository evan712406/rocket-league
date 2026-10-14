import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchController } from '../src/match.js';

function match(options) {
  const events = [];
  const controller = new MatchController((event) => events.push(event));
  controller.start(options);
  return { controller, events };
}

function startPlay(controller) {
  controller.update(3);
  assert.equal(controller.phase, 'playing');
}

test('a match starts with three countdown ticks and a five-minute clock', () => {
  const { controller, events } = match();
  assert.equal(controller.phase, 'countdown');
  assert.equal(controller.countdown, '3');
  assert.equal(controller.remaining, 300);
  assert.equal(events[0].type, 'reset');
  controller.update(1);
  assert.equal(controller.countdown, '2');
  controller.update(1);
  assert.equal(controller.countdown, '1');
  controller.update(1);
  assert.equal(controller.phase, 'playing');
  assert.equal(controller.countdown, 'GO !');
  assert.equal(controller.remaining, 300, 'kickoff does not consume game time');
  assert.equal(events.filter((event) => event.type === 'tick').length, 3);
  assert.equal(events.filter((event) => event.type === 'go').length, 1);
  controller.update(1);
  assert.equal(controller.remaining, 299);
  assert.equal(controller.countdown, null);
});

test('goals update the correct score once and reset the pitch for kickoff', () => {
  const { controller, events } = match();
  assert.equal(controller.goal('blue'), false, 'countdown cannot score');
  startPlay(controller);
  controller.update(10);
  assert.equal(controller.goal('blue'), true);
  assert.deepEqual(controller.scores, { blue: 1, orange: 0 });
  assert.equal(controller.phase, 'goal');
  assert.equal(controller.goal('blue'), false, 'the same goal cannot count during celebration');
  controller.update(3.21);
  assert.equal(controller.phase, 'countdown');
  assert.equal(controller.remaining, 290, 'celebration does not consume game time');
  assert.equal(events.filter((event) => event.type === 'reset').length, 2);
  startPlay(controller);
  assert.equal(controller.goal('orange'), true);
  assert.deepEqual(controller.scores, { blue: 1, orange: 1 });
});

test('pause freezes play, kickoff and goal celebration and resumes each phase', () => {
  for (const phase of ['countdown', 'playing', 'goal']) {
    const { controller } = match();
    if (phase !== 'countdown') startPlay(controller);
    if (phase === 'goal') controller.goal('orange');
    const remaining = controller.remaining;
    const timer = controller.timer;
    controller.pause();
    assert.equal(controller.phase, 'paused');
    controller.update(60);
    assert.equal(controller.remaining, remaining);
    assert.equal(controller.timer, timer);
    assert.equal(controller.goal('blue'), false);
    controller.resume();
    assert.equal(controller.phase, phase);
    controller.update(0.5);
    if (phase === 'playing') assert.equal(controller.remaining, remaining - 0.5);
    else assert.equal(controller.timer, timer - 0.5);
  }
});

test('a tie at zero starts overtime with a fresh kickoff and an advancing clock', () => {
  const { controller, events } = match();
  startPlay(controller);
  controller.update(300);
  assert.equal(controller.remaining, 0);
  assert.equal(controller.overtime, true);
  assert.equal(controller.phase, 'countdown');
  assert.ok(events.some((event) => event.type === 'overtime'));
  startPlay(controller);
  controller.update(7.5);
  assert.equal(controller.overtimeElapsed, 7.5);
  assert.equal(controller.remaining, 0);
  controller.pause();
  controller.update(12);
  assert.equal(controller.overtimeElapsed, 7.5);
  controller.resume();
});

test('the first overtime goal ends the match after the celebration', () => {
  const { controller, events } = match();
  startPlay(controller);
  controller.update(300);
  startPlay(controller);
  assert.equal(controller.goal('blue'), true);
  assert.equal(controller.phase, 'goal');
  controller.update(3.21);
  assert.equal(controller.phase, 'finished');
  assert.equal(controller.winner, 'blue');
  assert.ok(events.some((event) => event.type === 'finish' && event.winner === 'blue'));
  assert.equal(controller.goal('orange'), false);
  const score = { ...controller.scores };
  controller.update(100);
  assert.deepEqual(controller.scores, score);
});

test('a lead at the five-minute limit ends regulation without overtime', () => {
  const { controller } = match();
  startPlay(controller);
  controller.goal('orange');
  controller.update(3.21);
  startPlay(controller);
  controller.update(300);
  assert.equal(controller.phase, 'finished');
  assert.equal(controller.overtime, false);
  assert.equal(controller.remaining, 0);
  assert.equal(controller.winner, 'orange');
});

test('free training has no countdown or time limit and resets after goals', () => {
  const { controller, events } = match({ mode: 'training', difficulty: 'hard' });
  assert.equal(controller.phase, 'playing');
  assert.equal(controller.countdown, null);
  controller.update(3600);
  assert.equal(controller.phase, 'playing');
  assert.equal(controller.remaining, 300);
  assert.equal(controller.overtime, false);
  controller.goal('blue');
  controller.update(3.21);
  assert.equal(controller.phase, 'playing');
  assert.equal(controller.countdown, null);
  assert.equal(events.filter((event) => event.type === 'reset').length, 2);
});

test('restarting clears score, winner, overtime and restores selected settings', () => {
  const { controller } = match();
  startPlay(controller);
  controller.update(300);
  startPlay(controller);
  controller.update(6);
  controller.goal('orange');
  controller.update(3.21);
  controller.start({ mode: 'doubles', difficulty: 'easy' });
  assert.deepEqual(controller.scores, { blue: 0, orange: 0 });
  assert.equal(controller.winner, null);
  assert.equal(controller.overtime, false);
  assert.equal(controller.overtimeElapsed, 0);
  assert.equal(controller.remaining, 300);
  assert.equal(controller.phase, 'countdown');
  assert.equal(controller.countdown, '3');
  assert.equal(controller.mode, 'doubles');
  assert.equal(controller.difficulty, 'easy');
});

test('returning to menu stops the match clock and clears the countdown', () => {
  const { controller } = match();
  startPlay(controller);
  controller.update(25);
  controller.menu();
  controller.update(30);
  assert.equal(controller.phase, 'menu');
  assert.equal(controller.remaining, 275);
  assert.equal(controller.countdown, null);
});
