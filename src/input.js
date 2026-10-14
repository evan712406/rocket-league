export const DEFAULT_BINDINGS = Object.freeze({
  forward: 'KeyZ', backward: 'KeyS', left: 'KeyQ', right: 'KeyD',
  jump: 'Space', boost: 'ShiftLeft', slide: 'ControlLeft', ballCam: 'KeyC',
  airRollLeft: 'KeyA', airRollRight: 'KeyE', pause: 'Escape',
});
const keyboardCode = (event) => /^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}` : event.code;

export class GameInput {
  constructor(canvas, actions) {
    this.canvas = canvas;
    this.actions = actions;
    this.keys = new Set();
    this.jumpQueued = false;
    this.lookX = 0;
    this.lookY = 0;
    this.active = false;
    this.bindings = { ...DEFAULT_BINDINGS };
    try {
      const saved = JSON.parse(localStorage.getItem('apex-drive-bindings') || '{}');
      for (const action of Object.keys(this.bindings)) if (typeof saved[action] === 'string') this.bindings[action] = saved[action];
    } catch { /* Storage is optional. */ }
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(keyboardCode(e)));
    window.addEventListener('blur', () => { this.clear(); if (this.active) this.actions.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.active) { this.clear(); this.actions.pause(); } });
    canvas.addEventListener('click', () => {
      if (this.active && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
    });
    let wasLocked = false;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (wasLocked && !locked && this.active) this.actions.pause();
      wasLocked = locked;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.active && (document.pointerLockElement === canvas || e.buttons === 1)) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
  }

  keyDown(e) {
    if (document.querySelector('[data-rebinding="true"]')) return;
    const code = keyboardCode(e);
    if (!this.active) {
      if (code === this.bindings.pause && !e.repeat) this.actions.resume?.();
      return;
    }
    if (Object.values(this.bindings).includes(code) || code === 'ShiftRight' || code === 'ControlRight') e.preventDefault();
    if (e.repeat) return;
    this.keys.add(code);
    if (code === this.bindings.jump) this.jumpQueued = true;
    if (code === this.bindings.ballCam) this.actions.ballCam();
    if (code === this.bindings.pause) this.actions.pause();
  }

  held(action) {
    const key = this.bindings[action];
    return this.keys.has(key) || (key === 'ShiftLeft' && this.keys.has('ShiftRight')) || (key === 'ControlLeft' && this.keys.has('ControlRight'));
  }

  controls() {
    const result = {
      throttle: Number(this.held('forward')) - Number(this.held('backward')),
      steer: Number(this.held('left')) - Number(this.held('right')),
      boost: this.held('boost'), slide: this.held('slide'),
      roll: Number(this.held('airRollLeft')) - Number(this.held('airRollRight')),
      jumpPressed: this.jumpQueued,
    };
    this.jumpQueued = false;
    return result;
  }

  camera() {
    const result = { lookX: this.lookX, lookY: this.lookY };
    this.lookX = 0; this.lookY = 0;
    return result;
  }

  setActive(active) {
    this.active = active;
    this.clear();
    if (!active && document.pointerLockElement) document.exitPointerLock?.();
  }

  clear() { this.keys.clear(); this.jumpQueued = false; this.lookX = 0; this.lookY = 0; }

  rebind(action, code) {
    if (!Object.hasOwn(DEFAULT_BINDINGS, action)) return;
    this.bindings[action] = code;
    this.clear();
    try { localStorage.setItem('apex-drive-bindings', JSON.stringify(this.bindings)); } catch { /* Optional storage. */ }
  }
}
