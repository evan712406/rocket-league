/** Original stadium, engine and impact sounds, synthesized entirely in the browser. */
export class GameAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.playing = false;
    this.elapsed = 0;
    this.lastHit = -10;
    this.noiseBuffer = null;
  }

  async unlock() {
    try {
      if (!this.context) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        this.context = new Context();
        this.build();
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // Audio is optional; a denied autoplay request must never interrupt a match.
    }
  }

  build() {
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.35 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 16;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.15;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this.gameGain = ctx.createGain();
    this.gameGain.gain.value = 0;
    this.gameGain.connect(this.master);

    // Seeded noise makes a reusable original waveform without external assets.
    const length = ctx.sampleRate * 3;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    let seed = 4271;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = seed / 2147483648 - 1;
    }

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineFilter.Q.value = 0.65;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.gameGain);
    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 42;
    this.engine.connect(this.engineFilter);
    this.engine.start();
    this.harmonic = ctx.createOscillator();
    this.harmonic.type = 'triangle';
    this.harmonic.frequency.value = 84;
    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.35;
    this.harmonic.connect(harmonicGain);
    harmonicGain.connect(this.engineFilter);
    this.harmonic.start();

    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    const boostHigh = ctx.createBiquadFilter();
    boostHigh.type = 'highpass';
    boostHigh.frequency.value = 550;
    const boostLow = ctx.createBiquadFilter();
    boostLow.type = 'lowpass';
    boostLow.frequency.value = 3600;
    const boost = this.noise(true);
    boost.connect(boostHigh);
    boostHigh.connect(boostLow);
    boostLow.connect(this.boostGain);
    this.boostGain.connect(this.gameGain);
    boost.start();

    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    const crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 630;
    crowdFilter.Q.value = 0.45;
    const crowd = this.noise(true);
    crowd.connect(crowdFilter);
    crowdFilter.connect(this.crowdGain);
    this.crowdGain.connect(this.gameGain);
    crowd.start(0, 1.2);
  }

  noise(loop = false) {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = loop;
    return source;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.35 : 0, this.context.currentTime, 0.025);
  }

  activate() {
    if (!this.context || this.context.state !== 'running') return false;
    if (!this.playing) {
      this.gameGain.gain.setTargetAtTime(1, this.context.currentTime, 0.025);
      this.playing = true;
    }
    return true;
  }

  update({ speed = 0, boosting = false, grounded = true } = {}, dt = 0.016) {
    if (!this.activate()) return;
    const time = this.context.currentTime;
    const velocity = Math.min(80, Math.abs(Number(speed) || 0));
    const rpm = 43 + velocity * 3.4 + (boosting ? 22 : 0);
    this.elapsed += Math.max(0, Number(dt) || 0);
    this.engine.frequency.setTargetAtTime(rpm, time, 0.055);
    this.harmonic.frequency.setTargetAtTime(rpm * 2.008, time, 0.055);
    this.engineFilter.frequency.setTargetAtTime(280 + velocity * 22 + (boosting ? 260 : 0), time, 0.08);
    this.engineGain.gain.setTargetAtTime((grounded ? 0.09 : 0.065) + Math.min(velocity / 500, 0.065), time, 0.06);
    this.boostGain.gain.setTargetAtTime(boosting ? 0.13 : 0, time, boosting ? 0.018 : 0.045);
    const swell = 0.018 + 0.005 * Math.sin(this.elapsed * 0.65) + 0.003 * Math.sin(this.elapsed * 1.7);
    this.crowdGain.gain.setTargetAtTime(swell, time, 0.3);
  }

  tone(frequency, delay, duration, volume = 0.18, type = 'sine', endFrequency = frequency) {
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.gameGain);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  burst(volume, duration, frequency, highpass = false) {
    const ctx = this.context;
    const start = ctx.currentTime;
    const source = this.noise();
    const filter = ctx.createBiquadFilter();
    filter.type = highpass ? 'bandpass' : 'lowpass';
    filter.Q.value = highpass ? 0.5 : 0.7;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.4), start + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + Math.min(0.05, duration / 5));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.gameGain);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(start, Math.random());
    source.stop(start + duration + 0.03);
  }

  hit(intensity = 1, ball = false) {
    if (!this.activate()) return;
    const time = this.context.currentTime;
    // Solver contact callbacks may repeat every frame while objects touch.
    if (time - this.lastHit < 0.055) return;
    this.lastHit = time;
    const power = Math.max(0.08, Math.min(1.4, Number(intensity) || 0));
    this.burst(power * (ball ? 0.2 : 0.15), ball ? 0.13 : 0.19, ball ? 1750 : 850);
    this.tone(ball ? 170 : 94, 0, 0.13 + power * 0.08, power * 0.23, 'sine', ball ? 65 : 34);
  }

  countdown() {
    if (!this.activate()) return;
    this.tone(480, 0, 0.18, 0.24, 'sine');
    this.tone(960, 0, 0.1, 0.04, 'triangle');
  }

  kickoff() {
    if (!this.activate()) return;
    this.tone(640, 0, 0.3, 0.2, 'triangle', 960);
    this.tone(1280, 0.075, 0.35, 0.12, 'sine');
  }

  goal() {
    if (!this.activate()) return;
    [261.63, 329.63, 392, 523.25, 659.25].forEach((frequency, i) => {
      this.tone(frequency, i * 0.085, 1.1, 0.085, 'triangle');
      this.tone(frequency * 2, 0.42 + i * 0.06, 0.9, 0.035, 'sine');
    });
    this.burst(0.28, 2.5, 1400, true);
  }

  stop() {
    this.playing = false;
    if (!this.context || !this.gameGain) return;
    const time = this.context.currentTime;
    this.gameGain.gain.setTargetAtTime(0, time, 0.035);
    this.engineGain.gain.setTargetAtTime(0, time, 0.035);
    this.boostGain.gain.setTargetAtTime(0, time, 0.035);
    this.crowdGain.gain.setTargetAtTime(0, time, 0.035);
  }
}

export default GameAudio;
