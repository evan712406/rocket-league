import './style.css';
import { GameScene } from './scene.js';
import { ArenaPhysics, FIXED_DT, botControls } from './physics.js';
import { MatchController } from './match.js';
import { GameInput } from './input.js';
import { GameUI } from './ui.js';
import { GameAudio } from './audio.js';

const canvas = document.getElementById('game-canvas');
const audio = new GameAudio();
let scene;
try {
  scene = new GameScene(canvas);
} catch (error) {
  const warning = document.createElement('div');
  warning.className = 'webgl-error';
  warning.textContent = 'La 3D ne peut pas démarrer. Activez l’accélération graphique dans Chrome, puis rechargez la page.';
  document.body.append(warning);
  console.error(error);
  throw error;
}
let ui;
let input;
let ballCam = false;
let sound = true;
let accumulator = 0;
let goalFlash = 0;
let renderedView = 'menu';
const physics = new ArenaPhysics((event) => {
  if (event.type === 'hit' && match.phase === 'playing') audio.hit(event.intensity, event.ball);
});
const match = new MatchController((event) => {
  if (event.type === 'reset') {
    physics.resetKickoff();
    accumulator = 0;
    scene.resetCamera?.();
  }
  if (event.type === 'tick') audio.countdown();
  if (event.type === 'go') audio.kickoff();
  if (event.type === 'goal') {
    goalFlash = 1;
    scene.goalBurst?.(event.team);
    ui.showGoal(event.team);
    audio.goal();
  }
  if (event.type === 'overtime') ui.showNotice('PROLONGATION · BUT EN OR');
  if (event.type === 'finish') { audio.stop(); input.setActive(false); }
});

function start(options) {
  audio.unlock();
  physics.createCars(options.mode);
  match.start(options);
  goalFlash = 0;
  input.setActive(true);
  renderedView = '';
}

function pause() {
  match.pause();
  if (match.phase === 'paused') { input.setActive(false); audio.stop(); }
}

ui = new GameUI({
  start,
  pause,
  resume: () => { if (match.phase === 'paused') { match.resume(); input.setActive(true); } },
  restart: () => start({ mode: match.mode, difficulty: match.difficulty }),
  menu: () => { match.menu(); input.setActive(false); audio.stop(); physics.resetKickoff(); goalFlash = 0; },
  ballCam: () => { ballCam = !ballCam; },
  sound: (enabled) => { sound = enabled; audio.setEnabled(enabled); },
  rebind: (action, code) => input.rebind(action, code),
  quality: (value) => scene.setQuality?.(value),
});
input = new GameInput(canvas, { pause, resume: () => { if (match.phase === 'paused') { match.resume(); input.setActive(true); } }, ballCam: () => { ballCam = !ballCam; } });
ui.setBindings?.(input.bindings);

let previousTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.max(0, (now - previousTime) / 1000);
  const dt = Math.min(0.1, elapsed);
  previousTime = now;
  // The match clock uses real time; slow rendering must not lengthen a five-minute match.
  match.update(elapsed);
  const live = ['playing', 'countdown', 'goal'].includes(match.phase);
  if (live) {
    accumulator += dt;
    // Physics stays deterministic at 120 Hz, independent of rendering refresh rate.
    while (accumulator >= FIXED_DT) {
      const controls = {};
      if (match.phase === 'playing') {
        controls.player = input.controls();
        for (const car of physics.cars) if (car.id !== 'player') controls[car.id] = botControls(physics, car, match.difficulty);
      } else input.controls();
      physics.step(FIXED_DT, controls);
      accumulator -= FIXED_DT;
      if (match.phase === 'playing') {
        const team = physics.detectGoal();
        if (team) match.goal(team);
      }
    }
  } else accumulator = 0;
  const player = physics.getPlayer();
  if (live) audio.update({ speed: match.phase === 'playing' ? player.speed : 0, boosting: match.phase === 'playing' && player.boosting, grounded: player.grounded }, dt);
  else audio.stop();
  goalFlash = Math.max(0, goalFlash - dt * 0.45);
  const state = {
    ...physics.snapshot(),
    scores: match.scores, remaining: match.overtime ? match.overtimeElapsed : match.remaining, overtime: match.overtime,
    boost: player.boost, speed: player.speed, ballCam,
    mode: match.mode, difficulty: match.difficulty, phase: match.phase,
    countdown: match.countdown, winner: match.winner, sound, goalFlash,
  };
  const view = match.phase === 'menu' ? 'menu' : match.phase === 'paused' ? 'pause' : match.phase === 'finished' ? 'finished' : 'playing';
  if (view !== renderedView) {
    ui.setView(view, state);
    renderedView = view;
  }
  ui.update(state);
  scene.update(state, dt, input.camera());
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => scene.resize());

// Local development inspection only; never included as a production game API.
if (import.meta.env.DEV) {
  window.apexDebug = { physics, match, input, scene, start, pause, getState: () => ({ phase: match.phase, scores: { ...match.scores }, remaining: match.remaining, boost: physics.getPlayer().boost, ballCam }) };
}
