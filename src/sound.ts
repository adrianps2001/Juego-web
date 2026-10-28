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
  private level = 0;
  private spike = 0; // subida repentina del zumbido (Nivel 0)
  private ambientTimer = 4;
  private whir = this.ctx.createGain(); // máquinas del Nivel 2

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

    // zumbido de máquinas viejas (Nivel 2, salas de máquinas)
    const whirFilter = this.ctx.createBiquadFilter();
    whirFilter.type = 'bandpass';
    whirFilter.frequency.value = 160;
    whirFilter.Q.value = 2;
    this.osc('sawtooth', 50, whirFilter, 0.6);
    this.osc('triangle', 151, whirFilter, 0.4);
    whirFilter.connect(this.whir).connect(this.ambientBus);
    this.whir.gain.value = 0;
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
    this.level = level;
    this.humLevel = HUM_GAIN[level] ?? 0;
  }

  /** Cercanía de una máquina (0-1). */
  setWhir(k: number) {
    this.whir.gain.setTargetAtTime(0.08 * k, this.ctx.currentTime, 0.3);
  }

  /** El zumbido sube de golpe durante unos segundos. */
  humSpike() {
    this.spike = 1;
  }

  /** Se llama cada fotograma con el estado actual (cercanía de cada criatura, 0-1). */
  update(flicker: number, smiler: number, hound: number, stealer: number, insanity: number, dark: boolean, dt = 1 / 60) {
    const t = this.ctx.currentTime;
    this.spike = Math.max(0, this.spike - dt * 0.25);
    this.hum.gain.setTargetAtTime(this.humLevel * flicker * (dark ? 0.3 : 1) * (1 + this.spike * 4), t, 0.05);
    this.ambient(dt, insanity, dark);
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

  /** Ruidos de fondo de cada nivel, de vez en cuando y desde un lado al azar. */
  private ambient(dt: number, insanity: number, dark: boolean) {
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 5 + Math.random() * 12 - insanity * 4;
    const pan = Math.random() * 2 - 1;
    const r = Math.random();
    if (this.level === 0) {
      // arañazos detrás de las paredes, susurros o un paso que no es tuyo
      if (r < 0.4) this.scratch(0.25, pan);
      else if (r < 0.7 || dark) this.murmur(0.12, pan);
      else this.burst(0.12, 500, 0.12, 'lowpass', pan);
    } else if (this.level === 1) {
      if (r < 0.5) this.drip(0.2, pan);
      else if (r < 0.75) this.burst(0.5, 300, 0.2, 'lowpass', pan); // algo cae a lo lejos
      else this.tone(90, 70, 1.2, 'sawtooth', 0.04, pan); // un motor lejano
    } else if (this.level === 2) {
      if (r < 0.45) this.clang(0.25, pan);
      else if (r < 0.7) this.drip(0.18, pan);
      else this.burst(0.8, 4000, 0.06, 'highpass', pan); // vapor lejos
    }
  }

  private burst(duration: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass', pan = 0) {
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
    src.connect(f).connect(g).connect(this.panner(pan));
    src.start(t, Math.random());
    src.stop(t + duration);
  }

  private panner(pan: number): AudioNode {
    if (!pan) return this.sfxBus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    return p;
  }

  /** Uñas contra yeso, detrás de la pared (también avisa de un Duller). */
  scratch(gain = 0.3, pan = 0) {
    for (let i = 0; i < 5; i++) setTimeout(() => this.burst(0.09 + Math.random() * 0.08, 3200 + Math.random() * 1500, gain, 'bandpass', pan), i * (90 + Math.random() * 80));
  }

  /** Voz ahogada que no se entiende. */
  murmur(gain = 0.12, pan = 0) {
    for (let i = 0; i < 4 + Math.random() * 4; i++) {
      setTimeout(() => {
        const f = 140 + Math.random() * 90;
        this.tone(f, f * (0.8 + Math.random() * 0.4), 0.12 + Math.random() * 0.12, 'sawtooth', gain * 0.35, pan);
        this.burst(0.1, 900 + Math.random() * 600, gain * 0.5, 'bandpass', pan);
      }, i * 160);
    }
  }

  /** Lo que dice una criatura: sílabas imitando una voz humana. */
  voice(text: string, gain = 0.25, pan = 0) {
    const n = Math.min(10, Math.max(2, Math.round(text.length / 4)));
    const base = 170 + Math.random() * 60;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const f = base * (0.85 + Math.random() * 0.4);
        this.tone(f, f * 0.9, 0.14, 'sawtooth', gain * 0.3, pan);
        this.burst(0.08, 1200 + Math.random() * 1500, gain * 0.35, 'bandpass', pan);
      }, i * 150);
    }
  }

  drip(gain = 0.2, pan = 0) {
    this.tone(1400 + Math.random() * 600, 500, 0.08, 'sine', gain, pan);
  }

  /** Golpe metálico en las tuberías. */
  clang(gain = 0.25, pan = 0) {
    const f = 220 + Math.random() * 300;
    this.tone(f, f * 0.97, 1.4, 'triangle', gain, pan);
    this.tone(f * 2.76, f * 2.7, 0.9, 'sine', gain * 0.5, pan);
    this.burst(0.05, 2000, gain, 'bandpass', pan);
  }

  shout() {
    this.tone(260, 200, 0.7, 'sawtooth', 0.22);
    this.burst(0.6, 900, 0.5, 'bandpass');
  }

  /** Pomo de una puerta cerrada con llave. */
  rattle() {
    for (let i = 0; i < 3; i++) setTimeout(() => this.burst(0.06, 2500, 0.5, 'bandpass'), i * 90);
  }

  splash() {
    this.burst(0.25, 1100, 0.35, 'bandpass');
  }

  squeak(pan = 0) {
    this.tone(3200, 4200, 0.07, 'sine', 0.05, pan);
  }

  /** Susto: una nota aguda que se rompe. */
  sting() {
    this.tone(1800, 600, 0.6, 'sawtooth', 0.2);
    this.tone(95, 60, 0.9, 'square', 0.25);
  }

  flare() {
    this.burst(1.2, 3500, 0.35, 'highpass');
  }

  /**
   * Screamer: chillido agudo, disonante y distorsionado. Pasa por un limitador
   * para que no suene más fuerte que el resto, solo más desagradable.
   */
  screamer() {
    const t = this.ctx.currentTime;
    const dur = 0.85;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    out.gain.setValueAtTime(0.9, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    shaper.curve = curve;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    // tras el limitador, al nivel de los demás efectos fuertes (el grito al morir)
    const level = this.ctx.createGain();
    level.gain.value = 0.26;
    shaper.connect(hp).connect(out).connect(limiter).connect(level).connect(this.sfxBus);
    const pre = this.ctx.createGain();
    pre.gain.value = 0.25;
    pre.connect(shaper);
    // cuatro tonos agudos que chocan entre sí, con un temblor rápido
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 37;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = 90;
    vib.connect(vibGain);
    for (const [f, type] of [[1180, 'sawtooth'], [1253, 'square'], [1770, 'sawtooth'], [2490, 'square']] as [number, OscillatorType][]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * (0.97 + Math.random() * 0.06), t);
      o.frequency.exponentialRampToValueAtTime(f * 0.72, t + dur);
      vibGain.connect(o.frequency);
      o.connect(pre);
      o.start(t);
      o.stop(t + dur);
    }
    vib.start(t);
    vib.stop(t + dur);
    // ruido rasposo y un golpe grave al principio
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 1.5;
    src.connect(band).connect(pre);
    src.start(t, Math.random());
    src.stop(t + dur);
    this.tone(90, 35, 0.35, 'square', 0.25);
  }

  /** Gorgoteo húmedo de un Clump. */
  gurgle(gain = 0.3, pan = 0) {
    for (let i = 0; i < 4; i++) setTimeout(() => this.tone(90 + Math.random() * 60, 50, 0.15, 'square', gain * 0.3, pan), i * 110);
  }

  step(level: number, quiet = false) {
    // moqueta amortiguada, hormigón seco, rejilla metálica
    if (quiet) this.burst(0.08, 400, 0.08);
    else if (level === 0) this.burst(0.12, 500, 0.25);
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
    else if (kind === 'lata') for (let i = 0; i < 3; i++) setTimeout(() => this.burst(0.08, 700, 0.3), i * 200);
    else if (kind === 'bengala') this.flare();
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

  private tone(f0: number, f1: number, duration: number, type: OscillatorType, gain: number, pan = 0) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.panner(pan));
    o.start(t);
    o.stop(t + duration);
  }

  close() {
    this.stopListening();
    void this.ctx.close();
  }
}
