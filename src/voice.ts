import type { MediaConnection, Peer } from 'peerjs';
import type { PlayerState, Pose } from './protocol';
import { onSettings, updateSettings } from './settings';
import type { Sound } from './sound';

/** Más allá de esto no se oye a nadie (metros). */
const RANGE = 24;
/** Volumen y filtro se recalculan estas veces por segundo. */
const RATE = 10;

interface Incoming {
  call: MediaConnection;
  el: HTMLAudioElement;
  src: MediaStreamAudioSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

/**
 * Chat de voz por proximidad. Quien activa el micrófono llama a cada
 * compañero y le manda su voz (llamadas directas entre navegadores, sin
 * pasar por el anfitrión). Cada voz que llega pasa por Web Audio: baja con la
 * distancia, suena desde su lado, se apaga en otro nivel y se oye ahogada si
 * hay paredes en medio.
 */
export class Voice {
  private stream: MediaStream | null = null;
  private asking = false;
  private out = new Map<string, MediaConnection>();
  private inc = new Map<string, Incoming>();
  private clock = 0;
  private stopSettings: () => void;

  constructor(
    private peer: Peer,
    private sound: Sound,
    private notice: (text: string) => void,
  ) {
    peer.on('call', this.onCall);
    this.stopSettings = onSettings((st) => void this.setEnabled(st.voice));
  }

  get active(): boolean {
    return !!this.stream;
  }

  private async setEnabled(on: boolean) {
    if (on && !this.stream && !this.asking) {
      this.asking = true;
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        this.notice('Micrófono activado: te oyen los compañeros que estén cerca.');
      } catch {
        this.notice('No se ha podido usar el micrófono (¿permiso denegado?).');
        updateSettings({ voice: false });
      } finally {
        this.asking = false;
      }
    } else if (!on && this.stream) {
      for (const c of this.out.values()) c.close();
      this.out.clear();
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
      this.notice('Micrófono desactivado.');
    }
  }

  /** Alguien me manda su voz: solo se recibe (mi voz va en mi propia llamada). */
  private onCall = (call: MediaConnection) => {
    if (call.metadata?.voice !== 1) return;
    this.drop(call.peer);
    call.answer();
    call.on('stream', (remote) => this.attach(call, remote));
    call.on('close', () => this.inc.get(call.peer)?.call === call && this.drop(call.peer));
    call.on('error', () => this.inc.get(call.peer)?.call === call && this.drop(call.peer));
  };

  private attach(call: MediaConnection, remote: MediaStream) {
    if (this.inc.get(call.peer)?.call === call) return;
    this.drop(call.peer);
    const ctx = this.sound.context;
    // Chrome no hace sonar una pista remota en Web Audio si no está también en un elemento (mudo)
    const el = new Audio();
    el.muted = true;
    el.srcObject = remote;
    void el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(remote);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 8000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(filter).connect(gain).connect(pan).connect(this.sound.voiceBus);
    this.inc.set(call.peer, { call, el, src, filter, gain, pan });
  }

  private drop(id: string) {
    const v = this.inc.get(id);
    if (!v) return;
    this.inc.delete(id);
    v.src.disconnect();
    v.pan.disconnect();
    v.el.srcObject = null;
    v.call.close();
  }

  /**
   * Cada fotograma: llama a quien falte, cuelga a quien se haya ido y ajusta
   * cada voz según dónde está.
   */
  update(dt: number, me: Pose, others: PlayerState[], panOf: (x: number, z: number) => number, walls: (p: PlayerState) => boolean) {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = 1 / RATE;
    const ids = new Set(others.map((p) => p.id));
    if (this.stream) {
      for (const p of others) {
        if (this.out.has(p.id)) continue;
        const call = this.peer.call(p.id, this.stream, { metadata: { voice: 1 } });
        if (!call) continue;
        this.out.set(p.id, call);
        const forget = () => this.out.get(p.id) === call && this.out.delete(p.id);
        call.on('close', forget);
        call.on('error', forget);
      }
    }
    for (const [id, c] of this.out) {
      if (ids.has(id)) continue;
      c.close();
      this.out.delete(id);
    }
    for (const id of [...this.inc.keys()]) if (!ids.has(id)) this.drop(id);
    const t = this.sound.context.currentTime;
    for (const [id, v] of this.inc) {
      const p = others.find((o) => o.id === id);
      let g = 0;
      let muffled = false;
      if (p && p.level === me.level) {
        const d = Math.hypot(p.x - me.x, p.z - me.z) + Math.abs(p.y - me.y) * 1.5;
        const k = Math.max(0, 1 - d / RANGE);
        // de cerca se oye casi entero; luego cae deprisa
        g = d < 2 ? 1 : k * k * 1.2;
        muffled = g > 0 && walls(p);
        if (muffled) g *= 0.55;
        v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, panOf(p.x, p.z) * 0.8)), t, 0.05);
      }
      v.gain.gain.setTargetAtTime(Math.min(1, g), t, 0.08);
      v.filter.frequency.setTargetAtTime(muffled ? 900 : 8000, t, 0.1);
    }
  }

  /** ¿Cuánto se oye ahora a este compañero? (0-1, para pruebas y el HUD) */
  level(id: string): number {
    return this.inc.get(id)?.gain.gain.value ?? 0;
  }

  get calls(): { out: number; in: number } {
    return { out: this.out.size, in: this.inc.size };
  }

  dispose() {
    this.stopSettings();
    this.peer.off('call', this.onCall);
    for (const c of this.out.values()) c.close();
    this.out.clear();
    for (const id of [...this.inc.keys()]) this.drop(id);
    for (const tr of this.stream?.getTracks() ?? []) tr.stop();
    this.stream = null;
  }
}
