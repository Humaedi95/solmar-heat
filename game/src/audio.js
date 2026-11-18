// Solmar Heat — sound, synthesized with WebAudio. No audio files: every
// effect is an oscillator or a burst of filtered noise, so the game loads
// nothing over the network and plays the same anywhere.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuf = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
  }

  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        // engine hum: a low sawtooth whose pitch follows the car's speed
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 55;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        const engineFilter = this.ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 420;
        this.engineOsc.connect(engineFilter);
        engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
        // police siren: a square wave wobbling between two tones
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'square';
        this.sirenOsc.frequency.value = 780;
        this.sirenLfo = this.ctx.createOscillator();
        this.sirenLfo.type = 'sine';
        this.sirenLfo.frequency.value = 0.55;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 320;
        this.sirenLfo.connect(lfoGain);
        lfoGain.connect(this.sirenOsc.frequency);
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.ctx.destination);
        this.sirenOsc.start();
        this.sirenLfo.start();
      } catch (e) {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEngine(speed01, inCar) {
    if (!this.ctx || !this.engineOsc) return;
    const g = this.muted ? 0 : inCar ? 0.02 + 0.045 * speed01 : 0;
    this.engineGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + 95 * speed01, this.ctx.currentTime, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    const g = this.muted || !on ? 0 : 0.028;
    this.sirenGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.2);
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol || 0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) { /* audio is best-effort */ }
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted || !this.noiseBuf) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch (e) { /* audio is best-effort */ }
  }

  shot() { this.noise(0.14, 0.32, 2600); this.tone(190, 0.08, 'square', 0.1, 60); }
  punch() { this.tone(150, 0.1, 'sine', 0.2, 55); }
  thud() { this.tone(95, 0.12, 'sine', 0.22, 45); }
  crash() { this.noise(0.35, 0.3, 700); }
  door() { this.tone(210, 0.06, 'square', 0.08, 140); }
  horn() { this.tone(370, 0.22, 'square', 0.09); this.tone(466, 0.22, 'square', 0.07); }
  pickup() { this.tone(660, 0.09, 'sine', 0.14); setTimeout(() => this.tone(880, 0.12, 'sine', 0.14), 90); }
  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.14), i * 130));
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}
