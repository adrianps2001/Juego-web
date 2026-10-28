// Screamers: una cara que ocupa toda la pantalla durante un instante, con
// sacudidas, cortes de imagen y destellos. Todo se dibuja por código.

export type ScreamerKind = 'smiler' | 'hound' | 'skinstealer' | 'face';

const W = 320;
const H = 240;
const DURATION = 0.75; // segundos

export class Screamer {
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private face = document.createElement('canvas');
  private start = 0;
  private raf = 0;

  constructor() {
    this.el = document.getElementById('screamer')!;
    this.canvas = this.el.querySelector('canvas')!;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.face.width = W;
    this.face.height = H;
  }

  get active(): boolean {
    return !this.el.hidden;
  }

  play(kind: ScreamerKind) {
    drawFace(this.face.getContext('2d')!, kind);
    this.start = performance.now();
    this.el.hidden = false;
    cancelAnimationFrame(this.raf);
    this.frame();
  }

  private frame = () => {
    const t = (performance.now() - this.start) / 1000;
    if (t > DURATION) {
      this.el.hidden = true;
      this.el.style.filter = '';
      return;
    }
    const g = this.ctx;
    const k = t / DURATION;
    // la cara se abalanza hacia la pantalla
    const zoom = 1 + k * 0.5 + Math.random() * 0.06;
    const sx = (Math.random() - 0.5) * 30;
    const sy = (Math.random() - 0.5) * 24;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2 + sx, H / 2 + sy);
    g.rotate((Math.random() - 0.5) * 0.12);
    g.scale(zoom, zoom);
    g.drawImage(this.face, -W / 2, -H / 2);
    g.restore();
    // franjas desplazadas (fallo de imagen)
    for (let i = 0; i < 6; i++) {
      const y = Math.random() * H;
      const h = 4 + Math.random() * 22;
      g.drawImage(this.canvas, 0, y, W, h, (Math.random() - 0.5) * 60, y, W, h);
    }
    // ruido
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 70;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // destellos: negativo, rojo o quemado
    const r = Math.random();
    this.el.style.filter = r < 0.18 ? 'invert(1)' : r < 0.4 ? 'sepia(1) saturate(6) hue-rotate(-50deg) contrast(1.6)' : r < 0.5 ? 'brightness(2.2) contrast(2)' : 'contrast(1.3)';
    this.el.style.opacity = t > DURATION - 0.12 ? String((DURATION - t) / 0.12) : '1';
    this.raf = requestAnimationFrame(this.frame);
  };
}

// ---------------------------------------------------------------- caras

function drawFace(g: CanvasRenderingContext2D, kind: ScreamerKind) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  if (kind === 'smiler') smiler(g);
  else if (kind === 'hound') hound(g);
  else if (kind === 'skinstealer') skinStealer(g);
  else hollow(g);
  // viñeta
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.65);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.95)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

const jit = (n: number) => (Math.random() - 0.5) * n;

/** Smiler: oscuridad, dos ojos alargados y una sonrisa enorme llena de dientes. */
function smiler(g: CanvasRenderingContext2D) {
  g.shadowColor = '#fff';
  g.shadowBlur = 18;
  g.fillStyle = '#f4f4ec';
  for (const [x, a] of [[0.33, 0.35], [0.67, -0.35]]) {
    g.beginPath();
    g.ellipse(x * W + jit(6), 0.3 * H, 30, 13, a, 0, Math.PI * 2);
    g.fill();
  }
  // sonrisa de oreja a oreja
  g.beginPath();
  g.moveTo(0.06 * W, 0.48 * H);
  g.quadraticCurveTo(0.5 * W, 1.12 * H, 0.94 * W, 0.48 * H);
  g.quadraticCurveTo(0.5 * W, 0.72 * H, 0.06 * W, 0.48 * H);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = '#000';
  g.lineWidth = 3;
  for (let i = 1; i < 22; i++) {
    const x = 0.06 + (0.88 * i) / 22;
    const y0 = 0.5 + Math.sin((i / 22) * Math.PI) * 0.12;
    g.beginPath();
    g.moveTo(x * W, y0 * H);
    g.lineTo((x + jit(0.01)) * W, (y0 + 0.11 + Math.sin((i / 22) * Math.PI) * 0.12) * H);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0.1 * W, 0.6 * H);
  g.quadraticCurveTo(0.5 * W, 0.86 * H, 0.9 * W, 0.6 * H);
  g.stroke();
}

/** Hound: cara humanoide gris, pelo negro, ojos rojos y la mandíbula abierta. */
function hound(g: CanvasRenderingContext2D) {
  const skin = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.5, W * 0.45);
  skin.addColorStop(0, '#6d655c');
  skin.addColorStop(1, '#1d1a17');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(W / 2, H * 0.55, W * 0.36, H * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  // pelo enmarañado
  g.strokeStyle = '#050505';
  g.lineWidth = 3;
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W;
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + jit(40), H * 0.15, x + jit(60), H * (0.2 + Math.random() * 0.35));
    g.stroke();
  }
  // ojos
  for (const x of [0.36, 0.64]) {
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(x * W, 0.38 * H, 26, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = '#f00';
    g.shadowBlur = 20;
    g.fillStyle = '#e01010';
    g.beginPath();
    g.arc(x * W + jit(6), 0.38 * H, 7, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }
  // boca abierta con colmillos
  g.fillStyle = '#120404';
  g.beginPath();
  g.ellipse(W / 2, 0.75 * H, W * 0.2, H * 0.2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8d0b0';
  for (let i = 0; i < 9; i++) {
    const x = W / 2 - W * 0.17 + (i * W * 0.34) / 8;
    g.beginPath();
    g.moveTo(x - 6, 0.6 * H);
    g.lineTo(x + 6, 0.6 * H);
    g.lineTo(x + jit(4), 0.6 * H + 18 + Math.random() * 16);
    g.fill();
    g.beginPath();
    g.moveTo(x - 6, 0.92 * H);
    g.lineTo(x + 6, 0.92 * H);
    g.lineTo(x + jit(4), 0.92 * H - 14 - Math.random() * 12);
    g.fill();
  }
}

/** Skin-Stealer: piel amarillenta estirada, ojos hundidos y blancos. */
function skinStealer(g: CanvasRenderingContext2D) {
  const skin = g.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.5, W * 0.5);
  skin.addColorStop(0, '#d8c98c');
  skin.addColorStop(1, '#3a3218');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(W / 2, H * 0.55, W * 0.3, H * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  // pliegues de piel que no es suya
  g.strokeStyle = 'rgba(80,60,20,0.6)';
  g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    const y = H * (0.15 + Math.random() * 0.8);
    g.moveTo(W * 0.25, y);
    g.bezierCurveTo(W * 0.4, y + jit(30), W * 0.6, y + jit(30), W * 0.75, y + jit(20));
    g.stroke();
  }
  for (const x of [0.4, 0.6]) {
    g.fillStyle = '#0b0803';
    g.beginPath();
    g.ellipse(x * W, 0.4 * H, 20, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fbfbf2';
    g.beginPath();
    g.arc(x * W + jit(4), 0.42 * H, 5, 0, Math.PI * 2);
    g.fill();
  }
  // boca estirada hasta la barbilla
  g.fillStyle = '#080402';
  g.beginPath();
  g.ellipse(W / 2, 0.8 * H, 22, 42, 0, 0, Math.PI * 2);
  g.fill();
}

/** Cara hueca genérica (figuras, alucinaciones, ventanas). */
function hollow(g: CanvasRenderingContext2D) {
  const skin = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.5, W * 0.45);
  skin.addColorStop(0, '#bdb6a6');
  skin.addColorStop(1, '#222');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(W / 2, H * 0.52, W * 0.3, H * 0.58, 0, 0, Math.PI * 2);
  g.fill();
  for (const x of [0.38, 0.62]) {
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(x * W, 0.4 * H, 24, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x * W + jit(8), 0.4 * H + jit(8), 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#000';
  g.beginPath();
  g.ellipse(W / 2, 0.76 * H, 30, 46, 0, 0, Math.PI * 2);
  g.fill();
  // grietas
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    let x = W * (0.3 + Math.random() * 0.4);
    let y = H * (0.1 + Math.random() * 0.3);
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) g.lineTo((x += jit(24)), (y += 6 + Math.random() * 10));
    g.stroke();
  }
}
