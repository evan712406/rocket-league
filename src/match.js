export class MatchController {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.phase = 'menu';
    this.mode = 'duel';
    this.difficulty = 'normal';
    this.scores = { blue: 0, orange: 0 };
    this.remaining = 300;
    this.overtime = false;
    this.overtimeElapsed = 0;
    this.winner = null;
    this.countdown = null;
    this.timer = 0;
    this.goTimer = 0;
  }

  start({ mode = 'duel', difficulty = 'normal' } = {}) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.scores = { blue: 0, orange: 0 };
    this.remaining = 300;
    this.overtime = false;
    this.overtimeElapsed = 0;
    this.winner = null;
    this.goTimer = 0;
    this.kickoff();
  }

  kickoff() {
    this.onEvent({ type: 'reset' });
    if (this.mode === 'training') {
      this.phase = 'playing';
      this.countdown = null;
      return;
    }
    this.phase = 'countdown';
    this.timer = 3;
    this.countdown = '3';
    this.onEvent({ type: 'tick' });
  }

  update(dt) {
    if (this.phase === 'paused' || this.phase === 'menu' || this.phase === 'finished') return;
    if (this.goTimer > 0) {
      this.goTimer = Math.max(0, this.goTimer - dt);
      if (!this.goTimer && this.phase === 'playing') this.countdown = null;
    }
    if (this.phase === 'countdown') {
      this.timer = Math.max(0, this.timer - dt);
      const next = String(Math.ceil(this.timer));
      if (this.timer <= 0) {
        this.phase = 'playing';
        this.countdown = 'GO !';
        this.goTimer = 0.7;
        this.onEvent({ type: 'go' });
      } else if (next !== this.countdown) {
        this.countdown = next;
        this.onEvent({ type: 'tick' });
      }
    } else if (this.phase === 'goal') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.mode !== 'training' && (this.overtime || this.remaining <= 0)) this.finish();
        else this.kickoff();
      }
    } else if (this.phase === 'playing' && this.overtime) {
      this.overtimeElapsed += dt;
    } else if (this.phase === 'playing' && this.mode !== 'training' && !this.overtime) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining === 0) {
        if (this.scores.blue === this.scores.orange) {
          this.overtime = true;
          this.onEvent({ type: 'overtime' });
          this.kickoff();
        } else this.finish();
      }
    }
  }

  goal(team) {
    if (this.phase !== 'playing') return false;
    this.scores[team]++;
    this.phase = 'goal';
    this.timer = 3.2;
    this.countdown = null;
    this.goTimer = 0;
    this.onEvent({ type: 'goal', team });
    return true;
  }

  finish() {
    this.phase = 'finished';
    this.countdown = null;
    this.winner = this.scores.blue > this.scores.orange ? 'blue' : 'orange';
    this.onEvent({ type: 'finish', winner: this.winner });
  }

  pause() {
    if (!['playing', 'countdown', 'goal'].includes(this.phase)) return;
    this.previousPhase = this.phase;
    this.phase = 'paused';
  }

  resume() {
    if (this.phase === 'paused') this.phase = this.previousPhase || 'playing';
  }

  menu() { this.phase = 'menu'; this.countdown = null; }
}
