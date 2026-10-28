import { onSettings } from './settings';

// Todo el sonido se sintetiza con Web Audio: no hay archivos de audio.

// zumbido de fondo de cada nivel (luego se multiplica por el volumen de ambiente)
const HUM_GAIN = [0.03, 0.02, 0.014];

export class Sound {
  private ctx = new AudioContext();
  private master = this.ctx.createGain();
  private ambientBus = this.ctx.createGain(); // zumbido
  private sfxBus = this.ctx.createGain(); // pasos, Smilers y efectos
  private stopListening: () => void;
  private hum = this.ctx.createGain();
  private drone = this.ctx.createGain();
  private whine = this.ctx.createGain();
  private whisper = this.ctx.createGain();
  private growl = this.ctx.createGain(); // Hound cerca
  private clickTimer = 0;
  private noiseBuffer: AudioBuffer;
  private humLevel = HUM_GAIN[0];

  constructor() {
    this.master.connect(this.ctx.destination);
    this.ambientBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.stopListening = onSettings((st) => {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(st.master, t, 0.05);
      this.ambientBus.gain.setTargetAtTime(st.ambient, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(st.sfx, t, 0.05);
    });

    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // zumbido eléctrico de los fluorescentes
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 900;
    this.osc('sawtooth', 120, humFilter, 0.5);
    this.osc('sine', 60, humFilter, 1);
    this.osc('square', 240, humFilter, 0.08);
    humFilter.connect(this.hum).connect(this.ambientBus);

    // presencia de un Smiler: grave y desafinado, con un pitido agudo
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    this.osc('sawtooth', 43, droneFilter, 1);
    this.osc('sawtooth', 45.7, droneFilter, 1);
    droneFilter.connect(this.drone).connect(this.sfxBus);
    this.osc('sine', 1760, this.whine, 1);
    this.whine.connect(this.sfxBus);
    this.drone.gain.value = 0;
    this.whine.gain.value = 0;

    // gruñido grave y entrecortado de los Hounds
    const growlFilter = this.ctx.createBiquadFilter();
    growlFilter.type = 'lowpass';
    growlFilter.frequency.value = 380;
    const growlSrc = this.ctx.createBufferSource();
    growlSrc.buffer = this.noiseBuffer;
    growlSrc.loop = true;
    const trem = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(trem.gain);
    lfo.start();
    growlSrc.connect(growlFilter).connect(trem).connect(this.growl).connect(this.sfxBus);
    this.osc('sawtooth', 62, growlFilter, 0.6);
    growlSrc.start();
    this.growl.gain.value = 0;

    // susurros cuando se pierde la cordura
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 4;
    src.connect(band).connect(this.whisper).connect(this.sfxBus);
    src.start();
    this.whisper.gain.value = 0;
  }

  private osc(type: OscillatorType, freq: number, dest: AudioNode, gain: number) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    o.connect(g).connect(dest);
    o.start();
  }

  setLevel(level: number) {
    this.humLevel = HUM_GAIN[level] ?? 0;
  }

  /** Se llama cada fotograma con el estado actual (cercanía de cada criatura, 0-1). */
  update(flicker: number, smiler: number, hound: number, stealer: number, insanity: number, dark: boolean) {
    const t = this.ctx.currentTime;
    this.hum.gain.setTargetAtTime(this.humLevel * flicker * (dark ? 0.3 : 1), t, 0.05);
    this.drone.gain.setTargetAtTime(0.35 * smiler, t, 0.1);
    this.whine.gain.setTargetAtTime(0.012 * smiler * smiler, t, 0.1);
    this.growl.gain.setTargetAtTime(0.5 * hound * hound, t, 0.15);
    // el Skin-Stealer chasquea los huesos de vez en cuando
    this.clickTimer -= 1 / 60;
    if (stealer > 0.05 && this.clickTimer <= 0) {
      this.clickTimer = 0.2 + Math.random() * (1.5 - stealer);
      this.burst(0.02, 2500 + Math.random() * 2000, 0.25 * stealer, 'bandpass');
    }
    const wobble = 0.5 + 0.5 * Math.sin(t * 3.1) * Math.sin(t * 1.7);
    this.whisper.gain.setTargetAtTime(0.06 * insanity * wobble, t, 0.2);
  }

  private burst(duration: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + duration);
  }

  step(level: number) {
    // moqueta amortiguada, hormigón seco, rejilla metálica
    if (level === 0) this.burst(0.12, 500, 0.25);
    else if (level === 1) this.burst(0.08, 1800, 0.18);
    else this.burst(0.1, 3000, 0.12, 'bandpass');
  }

  beep(freq: number, duration = 0.15) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + duration);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + duration);
  }

  click() {
    this.burst(0.03, 4000, 0.3, 'highpass');
  }

  scream() {
    this.burst(1.5, 2500, 0.9, 'bandpass');
    this.burst(1.2, 200, 0.8);
  }

  hurt(kind: string) {
    this.burst(0.25, kind === 'hound' ? 600 : 1500, 0.7);
    this.tone(kind === 'skinstealer' ? 900 : 180, kind === 'skinstealer' ? 300 : 90, 0.35, 'sawtooth', 0.25);
  }

  thud() {
    this.burst(0.3, 160, 0.9);
    this.tone(70, 40, 0.3, 'sine', 0.6);
  }

  pickup() {
    this.tone(600, 900, 0.12, 'triangle', 0.15);
  }

  use(kind: string) {
    if (kind === 'agua') for (let i = 0; i < 3; i++) setTimeout(() => this.tone(300, 180, 0.12, 'sine', 0.25), i * 220);
    else if (kind === 'barrita') for (let i = 0; i < 4; i++) setTimeout(() => this.burst(0.06, 3000, 0.3, 'highpass'), i * 120);
    else if (kind === 'vendas') this.burst(0.5, 4000, 0.35, 'highpass');
    else this.tone(1200, 1600, 0.08, 'square', 0.08);
  }

  crate() {
    this.tone(140, 90, 0.4, 'sawtooth', 0.12);
    this.burst(0.2, 900, 0.4);
  }

  door() {
    this.tone(90, 60, 0.6, 'sawtooth', 0.15);
    this.burst(0.4, 500, 0.5);
  }

  hiss() {
    this.burst(0.6, 5000, 0.35, 'highpass');
  }

  clunk() {
    this.burst(0.15, 300, 0.9);
    this.tone(55, 30, 0.5, 'square', 0.3);
  }

  glitch() {
    for (let i = 0; i < 6; i++) setTimeout(() => this.tone(200 + Math.random() * 1800, 100 + Math.random() * 400, 0.06, 'square', 0.15), i * 50);
    this.burst(0.5, 2000, 0.5, 'bandpass');
  }

  private tone(f0: number, f1: number, duration: number, type: OscillatorType, gain: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + duration);
  }

  close() {
    this.stopListening();
    void this.ctx.close();
  }
}
