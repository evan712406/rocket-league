import './style.css';

const DEFAULT_BINDINGS = {
  forward: 'KeyZ', backward: 'KeyS', left: 'KeyQ', right: 'KeyD',
  jump: 'Space', boost: 'ShiftLeft', slide: 'ControlLeft', ballCam: 'KeyC',
  airRollLeft: 'KeyA', airRollRight: 'KeyE', pause: 'Escape',
};
const ACTION_LABELS = {
  forward: 'Accélérer / tangage', backward: 'Freiner / reculer', left: 'Tourner à gauche',
  right: 'Tourner à droite', jump: 'Saut / double saut', boost: 'Boost', slide: 'Dérapage',
  ballCam: 'Caméra ballon', airRollLeft: 'Roulis à gauche', airRollRight: 'Roulis à droite', pause: 'Pause',
};
function keyLabel(code) {
  if (code?.startsWith('Key')) return code.slice(3);
  if (code?.startsWith('Digit')) return code.slice(5);
  const labels = { Space: 'ESPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT D', ControlLeft: 'CTRL', ControlRight: 'CTRL D', Escape: 'ÉCHAP', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'ENTRÉE', AltLeft: 'ALT', AltRight: 'ALT D' };
  return labels[code] || code || '?';
}

export class GameUI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.mode = 'duel';
    this.difficulty = 'normal';
    this.soundEnabled = true;
    this.view = 'menu';
    this.bindings = { ...DEFAULT_BINDINGS };
    try {
      const saved = JSON.parse(localStorage.getItem('apex-drive-bindings') || '{}');
      for (const action of Object.keys(this.bindings)) if (typeof saved[action] === 'string') this.bindings[action] = saved[action];
    } catch { /* Storage is optional. */ }
    this.lastState = {};
    this.bindingAction = null;
    this.menuSettings = false;
    this.goalTimeout = null;
    this.noticeTimeout = null;
    this.elements = {};
    for (const id of ['ui-root', 'menu-shade', 'app-header', 'menu-view', 'menu-footer', 'hud', 'pause-view', 'finished-view', 'pause-actions', 'pause-title', 'difficulty-row', 'match-details', 'score-blue', 'score-orange', 'timer', 'hud-mode', 'overtime-label', 'speed', 'speed-bar', 'boost', 'boost-meter', 'countdown', 'countdown-text', 'goal-overlay', 'goal-team', 'goal-scorer', 'notice', 'ballcam-toggle', 'sound-toggle', 'settings-sound', 'finish-title', 'finish-message', 'finish-blue', 'finish-orange']) this.elements[id] = document.getElementById(id);
    this.bindEvents();
    this.renderBindings();
    this.setView('menu');
  }

  bindEvents() {
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
      this.mode = button.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(item => {
        const selected = item.dataset.mode === this.mode;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      this.elements['difficulty-row'].style.visibility = this.mode === 'training' ? 'hidden' : 'visible';
      const descriptions = { duel: ['VOUS CONTRE L’IA', '5 MINUTES'], doubles: ['2 ÉQUIPES · 4 VOITURES', '5 MINUTES'], training: ['LE TERRAIN EST À VOUS', 'SANS LIMITE'] };
      this.elements['match-details'].innerHTML = `<span><i></i> ${descriptions[this.mode][0]}</span><span>${descriptions[this.mode][1]}</span>`;
    }));
    document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
      this.difficulty = button.dataset.difficulty;
      document.querySelectorAll('[data-difficulty]').forEach(item => {
        const selected = item.dataset.difficulty === this.difficulty;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
    }));
    document.getElementById('play-button').addEventListener('click', () => this.callbacks.start?.({ mode: this.mode, difficulty: this.difficulty }));
    document.getElementById('pause-button').addEventListener('click', () => this.callbacks.pause?.());
    document.getElementById('resume-button').addEventListener('click', () => this.closeSettings());
    document.getElementById('close-pause').addEventListener('click', () => this.closeSettings());
    document.getElementById('restart-button').addEventListener('click', () => this.callbacks.restart?.());
    document.getElementById('finish-restart').addEventListener('click', () => this.callbacks.restart?.());
    document.getElementById('back-menu-button').addEventListener('click', () => this.callbacks.menu?.());
    document.getElementById('finish-menu').addEventListener('click', () => this.callbacks.menu?.());
    document.getElementById('brand-home').addEventListener('click', event => { event.preventDefault(); this.callbacks.menu?.(); });
    document.getElementById('ballcam-toggle').addEventListener('click', () => this.callbacks.ballCam?.());
    const toggleSound = () => { this.soundEnabled = !this.soundEnabled; this.setSound(this.soundEnabled); this.callbacks.sound?.(this.soundEnabled); };
    this.elements['sound-toggle'].addEventListener('click', toggleSound);
    this.elements['settings-sound'].addEventListener('click', toggleSound);
    document.getElementById('quality-select').addEventListener('change', event => this.callbacks.quality?.(event.target.value));
    document.getElementById('menu-controls').addEventListener('click', () => {
      this.menuSettings = true;
      this.elements['pause-actions'].classList.add('hidden');
      this.elements['pause-title'].textContent = 'À vous de jouer.';
      this.elements['pause-view'].classList.remove('hidden');
    });
    window.addEventListener('keydown', event => {
      if (!this.bindingAction) {
        if (this.menuSettings && event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.closeSettings(); }
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      const action = this.bindingAction;
      const code = /^[a-z]$/i.test(event.key) ? `Key${event.key.toUpperCase()}` : event.code;
      this.bindingAction = null;
      this.bindings[action] = code;
      try { localStorage.setItem('apex-drive-bindings', JSON.stringify(this.bindings)); } catch { /* Storage is optional. */ }
      this.callbacks.rebind?.(action, code);
      this.renderBindings();
      this.showNotice(`${ACTION_LABELS[action]} : ${keyLabel(code)}`);
    }, true);
  }

  renderBindings() {
    document.querySelectorAll('[data-binding]').forEach(element => { element.textContent = keyLabel(this.bindings[element.dataset.binding]); });
    const grid = document.getElementById('bindings-grid');
    grid.replaceChildren();
    for (const [action, label] of Object.entries(ACTION_LABELS)) {
      const row = document.createElement('div');
      row.className = 'binding-row';
      const text = document.createElement('span');
      text.textContent = label;
      const button = document.createElement('button');
      button.className = `binding-button${this.bindingAction === action ? ' waiting' : ''}`;
      button.textContent = this.bindingAction === action ? 'UNE TOUCHE…' : keyLabel(this.bindings[action]);
      button.setAttribute('aria-label', `${label}, touche ${keyLabel(this.bindings[action])}, modifier`);
      button.addEventListener('click', () => { this.bindingAction = action; this.renderBindings(); });
      row.append(text, button);
      grid.append(row);
    }
  }

  closeSettings() {
    this.bindingAction = null;
    this.renderBindings();
    if (this.menuSettings) {
      this.menuSettings = false;
      this.elements['pause-view'].classList.add('hidden');
    } else this.callbacks.resume?.();
  }

  setSound(enabled) {
    this.soundEnabled = enabled;
    this.elements['sound-toggle'].classList.toggle('muted', !enabled);
    this.elements['sound-toggle'].setAttribute('aria-label', enabled ? 'Désactiver le son' : 'Activer le son');
    this.elements['settings-sound'].setAttribute('aria-checked', String(enabled));
    this.elements['settings-sound'].querySelector('b').textContent = enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ';
  }

  setView(view, detail = {}) {
    this.view = view;
    this.menuSettings = false;
    this.bindingAction = null;
    const menu = view === 'menu';
    const playing = view === 'playing';
    const paused = view === 'pause';
    const finished = view === 'finished';
    this.elements['ui-root'].classList.toggle('ui-menu', menu);
    this.elements['ui-root'].classList.toggle('ui-playing', playing);
    this.elements['ui-root'].classList.toggle('ui-paused', paused);
    this.elements['ui-root'].classList.toggle('ui-finished', finished);
    this.elements['menu-view'].classList.toggle('hidden', !menu);
    this.elements['menu-footer'].classList.toggle('hidden', !menu);
    this.elements['menu-shade'].classList.toggle('hidden', !menu);
    this.elements['hud'].classList.toggle('hidden', menu || finished);
    this.elements['pause-view'].classList.toggle('hidden', !paused);
    this.elements['finished-view'].classList.toggle('hidden', !finished);
    this.elements['pause-actions'].classList.remove('hidden');
    this.elements['pause-title'].textContent = 'Pause.';
    if (!playing) {
      this.elements['countdown'].classList.add('hidden');
      this.elements['goal-overlay'].classList.add('hidden');
      clearTimeout(this.goalTimeout);
    }
    if (finished) {
      const state = { ...this.lastState, ...detail };
      const victory = state.winner === 'blue';
      this.elements['finished-view'].querySelector('.finish-card').classList.toggle('defeat', !victory);
      this.elements['finish-title'].textContent = victory ? 'VICTOIRE.' : 'DÉFAITE.';
      this.elements['finish-message'].textContent = victory ? 'Le terrain est à vous.' : 'La revanche vous attend.';
      this.elements['finish-blue'].textContent = state.scores?.blue ?? 0;
      this.elements['finish-orange'].textContent = state.scores?.orange ?? 0;
    }
  }

  update(state) {
    this.lastState = state;
    this.elements['score-blue'].textContent = state.scores?.blue ?? 0;
    this.elements['score-orange'].textContent = state.scores?.orange ?? 0;
    const remaining = Math.max(0, Math.ceil(state.remaining || 0));
    const time = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    this.elements.timer.textContent = state.mode === 'training' ? 'LIBRE' : state.overtime ? `+${time}` : time;
    this.elements['overtime-label'].classList.toggle('hidden', !state.overtime);
    this.elements['hud-mode'].textContent = state.mode === 'doubles' ? 'ÉQUIPE · 2V2' : state.mode === 'training' ? 'ENTRAÎNEMENT' : 'DUEL · 1V1';
    this.elements['ui-root'].classList.toggle('ui-training', state.mode === 'training');
    const boost = Math.max(0, Math.min(100, state.boost ?? 0));
    this.elements.boost.textContent = Math.round(boost);
    this.elements['boost-meter'].style.setProperty('--boost-angle', `${boost * 2.9}deg`);
    this.elements.speed.textContent = Math.round(Math.max(0, state.speed ?? 0));
    this.elements['speed-bar'].style.width = `${Math.min(100, (state.speed || 0) / 1.5)}%`;
    this.elements['ballcam-toggle'].classList.toggle('active', Boolean(state.ballCam));
    this.elements['ballcam-toggle'].setAttribute('aria-pressed', String(Boolean(state.ballCam)));
    if (typeof state.sound === 'boolean' && state.sound !== this.soundEnabled) this.setSound(state.sound);
    const showCountdown = state.countdown != null && state.countdown !== '' && this.view === 'playing';
    this.elements.countdown.classList.toggle('hidden', !showCountdown);
    if (showCountdown && this.elements['countdown-text'].textContent !== String(state.countdown)) {
      this.elements['countdown-text'].textContent = state.countdown;
      this.elements['countdown-text'].style.animation = 'none';
      void this.elements['countdown-text'].offsetWidth;
      this.elements['countdown-text'].style.animation = '';
    }
  }

  showGoal(team, scorer = '') {
    this.elements['goal-overlay'].classList.toggle('orange', team === 'orange');
    this.elements['goal-team'].textContent = team === 'orange' ? 'BRAISE MARQUE' : 'AZUR MARQUE';
    this.elements['goal-scorer'].textContent = scorer;
    this.elements['goal-overlay'].classList.remove('hidden');
    this.elements.countdown.classList.add('hidden');
    clearTimeout(this.goalTimeout);
    this.goalTimeout = setTimeout(() => this.elements['goal-overlay'].classList.add('hidden'), 2900);
  }

  showNotice(text) {
    this.elements.notice.textContent = text;
    this.elements.notice.classList.remove('hidden');
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.elements.notice.classList.add('hidden'), 2600);
  }
}
