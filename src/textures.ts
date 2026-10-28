import * as THREE from 'three';
import type { Theme } from './world';

// Todas las texturas se dibujan en un <canvas>: no hace falta ningún archivo.

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvasTexture(w: number, h: number, paint: Painter, repeat = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, density = 0.6) {
  const n = w * h * density;
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * amount;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random(), 1 + Math.random());
  }
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, count: number, maxR: number, y0 = 0, y1 = h) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = y0 + Math.random() * (y1 - y0);
    const r = maxR * (0.3 + Math.random() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const ox of [-w, 0, w]) {
      ctx.fillRect(x - r + ox, y - r, r * 2, r * 2);
    }
  }
}

// ---- paredes: la textura cubre toda la altura (zócalo abajo) ----

const wallpaper: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#c8b25e';
  ctx.fillRect(0, 0, w, h);
  const stripe = w / 6;
  for (let x = 0; x < w; x += stripe) {
    ctx.fillStyle = 'rgba(125, 98, 32, 0.13)';
    ctx.fillRect(x, 0, stripe * 0.22, h);
    ctx.fillStyle = 'rgba(255, 240, 170, 0.07)';
    ctx.fillRect(x + stripe * 0.5, 0, stripe * 0.08, h);
  }
  // motivo de rombos
  ctx.fillStyle = 'rgba(115, 88, 28, 0.17)';
  const step = stripe / 2;
  for (let x = stripe * 0.11; x < w; x += stripe) {
    for (let y = 0; y < h; y += step) {
      const s = step * 0.32;
      ctx.beginPath();
      ctx.moveTo(x + stripe * 0.25, y);
      ctx.lineTo(x + stripe * 0.25 + s, y + s);
      ctx.lineTo(x + stripe * 0.25, y + 2 * s);
      ctx.lineTo(x + stripe * 0.25 - s, y + s);
      ctx.fill();
    }
  }
  // humedad que sube desde el suelo y manchas sueltas
  const damp = ctx.createLinearGradient(0, h, 0, h * 0.6);
  damp.addColorStop(0, 'rgba(70, 52, 15, 0.35)');
  damp.addColorStop(1, 'rgba(70, 52, 15, 0)');
  ctx.fillStyle = damp;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  blotches(ctx, w, h, 'rgba(95, 72, 20, 0.16)', 7, w / 5);
  blotches(ctx, w, h, 'rgba(80, 60, 15, 0.22)', 4, w / 8, h * 0.8, h);
  noise(ctx, w, h, 0.08);
  // zócalo de madera
  const bh = h * 0.045;
  ctx.fillStyle = '#6b5232';
  ctx.fillRect(0, h - bh, w, bh);
  ctx.fillStyle = 'rgba(255,230,180,0.25)';
  ctx.fillRect(0, h - bh, w, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, h - bh - 2, w, 2);
  // moldura del techo
  ctx.fillStyle = 'rgba(90, 70, 25, 0.35)';
  ctx.fillRect(0, 0, w, 3);
};

const concreteWall: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#8b8d8e';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.18, 1);
  blotches(ctx, w, h, 'rgba(40, 45, 50, 0.28)', 10, w / 4);
  // juntas de los bloques de hormigón
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  const bw = w / 2;
  const bhh = h / 10;
  for (let row = 0; row < 10; row++) {
    ctx.fillRect(0, row * bhh, w, 2);
    const off = row % 2 ? bw / 2 : 0;
    for (let x = off; x < w; x += bw) ctx.fillRect(x, row * bhh, 2, bhh);
  }
  // franja de seguridad amarilla y negra abajo
  const sh = h * 0.08;
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, h - sh, w, sh);
  ctx.fillStyle = '#1b1b1b';
  for (let x = -sh; x < w + sh; x += sh * 1.4) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + sh * 0.7, h);
    ctx.lineTo(x + sh * 1.4, h - sh);
    ctx.lineTo(x + sh * 0.7, h - sh);
    ctx.fill();
  }
  noise(ctx, w, sh, 0.25, 1);
};

const grimeWall: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#54453a';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.2, 1);
  blotches(ctx, w, h, 'rgba(20, 10, 5, 0.4)', 10, w / 4);
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * w;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(25, 12, 4, 0.45)');
    g.addColorStop(1, 'rgba(25, 12, 4, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + Math.random() * 5, h * (0.3 + Math.random() * 0.7));
  }
  // remaches
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let x = w / 8; x < w; x += w / 4) {
    for (const y of [h * 0.1, h * 0.9]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

// ---- suelos y techos ----

const carpet: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#9a8449';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.22, 1.6);
  blotches(ctx, w, h, 'rgba(60, 45, 15, 0.28)', 6, w / 3);
};

const ceilingTiles: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#d8d1b4';
  ctx.fillRect(0, 0, w, h);
  // agujeritos típicos de las placas de techo
  ctx.fillStyle = 'rgba(80,70,40,0.25)';
  for (let i = 0; i < w * h * 0.01; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  noise(ctx, w, h, 0.1, 0.8);
  blotches(ctx, w, h, 'rgba(130, 105, 40, 0.18)', 3, w / 4);
  ctx.fillStyle = '#8f8670';
  for (let i = 0; i < w; i += w / 2) {
    ctx.fillRect(i, 0, 4, h);
    ctx.fillRect(0, i, w, 4);
  }
};

const concreteFloor: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#5c5e5f';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.18, 1);
  blotches(ctx, w, h, 'rgba(15, 20, 25, 0.4)', 8, w / 3);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, w, 2);
  ctx.fillRect(0, 0, 2, h);
  // líneas de aparcamiento
  ctx.fillStyle = 'rgba(220, 200, 120, 0.35)';
  ctx.fillRect(w * 0.48, h * 0.1, w * 0.04, h * 0.35);
};

const concreteCeiling: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#6b6d6f';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.15, 1);
  blotches(ctx, w, h, 'rgba(20, 20, 20, 0.3)', 6, w / 3);
};

const grate: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#1a1714';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#4a423a';
  const n = 8;
  for (let i = 0; i < n; i++) {
    ctx.fillRect((i * w) / n, 0, w / n / 3, h);
    ctx.fillRect(0, (i * h) / n, w, h / n / 6);
  }
  noise(ctx, w, h, 0.3, 1);
  blotches(ctx, w, h, 'rgba(80, 35, 10, 0.4)', 6, w / 4);
};

const pipeCeiling: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#3a302a';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.2, 1);
  blotches(ctx, w, h, 'rgba(10, 5, 0, 0.45)', 6, w / 3);
};

// ---- variantes extra ----

const oldWallpaper: Painter = (ctx, w, h) => {
  wallpaper(ctx, w, h);
  ctx.fillStyle = 'rgba(70, 55, 20, 0.28)';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 'rgba(60, 50, 15, 0.35)', 10, w / 4);
  blotches(ctx, w, h, 'rgba(50, 60, 30, 0.25)', 5, w / 6); // moho
  // papel despegado: tiras más claras con borde oscuro
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.6;
    const pw = 15 + Math.random() * 30;
    const ph = 40 + Math.random() * 120;
    ctx.fillStyle = 'rgba(205, 190, 140, 0.9)';
    ctx.fillRect(x, y, pw, ph);
    ctx.fillStyle = 'rgba(40, 30, 10, 0.5)';
    ctx.fillRect(x, y + ph, pw, 3);
    ctx.fillRect(x + pw, y, 2, ph);
  }
};

const officePaint: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#c9bf9c';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.07, 0.8);
  blotches(ctx, w, h, 'rgba(110, 95, 60, 0.15)', 6, w / 4);
  // media pared inferior más oscura con moldura
  ctx.fillStyle = '#8f8467';
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  ctx.fillStyle = '#5e5440';
  ctx.fillRect(0, h * 0.61, w, 5);
  noise(ctx, w, h * 0.38, 0.1, 0.8);
  ctx.fillStyle = '#3d362a';
  ctx.fillRect(0, h - h * 0.04, w, h * 0.04);
};

const wetCarpet: Painter = (ctx, w, h) => {
  carpet(ctx, w, h);
  ctx.fillStyle = 'rgba(40, 32, 12, 0.35)';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 'rgba(20, 18, 8, 0.4)', 8, w / 3);
};

const linoleum: Painter = (ctx, w, h) => {
  const n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#a59d86' : '#b8b09a';
      ctx.fillRect((i * w) / n, (j * h) / n, w / n, h / n);
    }
  }
  noise(ctx, w, h, 0.12, 0.8);
  blotches(ctx, w, h, 'rgba(60, 50, 30, 0.2)', 5, w / 4);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i <= n; i++) {
    ctx.fillRect((i * w) / n, 0, 1.5, h);
    ctx.fillRect(0, (i * h) / n, w, 1.5);
  }
};

const brokenTiles: Painter = (ctx, w, h) => {
  ceilingTiles(ctx, w, h);
  blotches(ctx, w, h, 'rgba(110, 80, 20, 0.35)', 6, w / 3);
  blotches(ctx, w, h, 'rgba(60, 50, 20, 0.3)', 3, w / 5);
  // una placa combada y más oscura
  ctx.fillStyle = 'rgba(80, 65, 30, 0.25)';
  ctx.fillRect(w / 2 + 4, 4, w / 2 - 8, h / 2 - 8);
};

const greenOffice: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#b7b9b0';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.12, 1);
  ctx.fillStyle = '#4f6b58';
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
  noise(ctx, w, h * 0.45, 0.15, 1);
  blotches(ctx, w, h, 'rgba(30, 40, 30, 0.25)', 8, w / 4);
  ctx.fillStyle = '#2c3b31';
  ctx.fillRect(0, h * 0.55, w, 4);
};

const dirtyConcrete: Painter = (ctx, w, h) => {
  concreteWall(ctx, w, h);
  ctx.fillStyle = 'rgba(30, 25, 15, 0.3)';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 'rgba(20, 15, 5, 0.4)', 10, w / 3);
  // marca de agua: hasta donde llegó la inundación
  ctx.fillStyle = 'rgba(25, 30, 25, 0.4)';
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
};

const wetConcrete: Painter = (ctx, w, h) => {
  concreteFloor(ctx, w, h);
  ctx.fillStyle = 'rgba(10, 18, 25, 0.35)';
  ctx.fillRect(0, 0, w, h);
  blotches(ctx, w, h, 'rgba(120, 140, 160, 0.12)', 6, w / 3); // reflejos
};

const paintedFloor: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#5a5f5c';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.16, 1);
  ctx.fillStyle = 'rgba(214, 180, 40, 0.75)';
  ctx.fillRect(0, h * 0.45, w, h * 0.06);
  noise(ctx, w, h, 0.1, 0.5);
};

const beamCeiling: Painter = (ctx, w, h) => {
  concreteCeiling(ctx, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, h * 0.42, w, h * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, h * 0.42, w, 3);
};

const rustMetal: Painter = (ctx, w, h) => {
  ctx.fillStyle = '#4b3a2c';
  ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0.25, 1);
  blotches(ctx, w, h, 'rgba(120, 55, 15, 0.45)', 12, w / 4);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let x = 0; x < w; x += w / 2) ctx.fillRect(x, 0, 3, h);
  for (let y = 0; y < h; y += h / 4) ctx.fillRect(0, y, w, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (let x = 6; x < w; x += w / 2) for (let y = 6; y < h; y += h / 4) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** Mitad superior de una textura de pared, estirada (sin zócalo ni franjas). */
export function upperHalf(tex: THREE.Texture): THREE.CanvasTexture {
  const src = tex.image as HTMLCanvasElement;
  return canvasTexture(src.width, src.height, (ctx, w, h) => ctx.drawImage(src, 0, 0, w, h / 2, 0, 0, w, h));
}

export interface ThemeTextures {
  walls: THREE.Texture[];
  floors: THREE.Texture[];
  ceils: THREE.Texture[];
  wallScale: number; // metros de ancho que cubre la textura de pared
  wallHeight: number; // metros de alto (el zócalo queda abajo)
  floorScale: number;
  ceilScale: number;
}

export function themeTextures(theme: Theme): ThemeTextures {
  const wall = (p: Painter) => canvasTexture(256, 512, p);
  const sq = (p: Painter) => canvasTexture(256, 256, p);
  switch (theme) {
    case 'lobby':
      return {
        walls: [wall(wallpaper), wall(oldWallpaper), wall(officePaint)],
        floors: [sq(carpet), sq(wetCarpet), sq(linoleum)],
        ceils: [sq(ceilingTiles), sq(brokenTiles)],
        wallScale: 1.4,
        wallHeight: 2.8,
        floorScale: 2.5,
        ceilScale: 1.2,
      };
    case 'habitable':
      return {
        walls: [wall(concreteWall), wall(greenOffice), wall(dirtyConcrete)],
        floors: [sq(concreteFloor), sq(wetConcrete), sq(paintedFloor)],
        ceils: [sq(beamCeiling)],
        wallScale: 2.4,
        wallHeight: 3,
        floorScale: 5,
        ceilScale: 4,
      };
    case 'pipes':
      return {
        walls: [wall(grimeWall), wall(rustMetal)],
        floors: [sq(grate), sq(concreteFloor)],
        ceils: [sq(pipeCeiling)],
        wallScale: 1.6,
        wallHeight: 2.6,
        floorScale: 1.2,
        ceilScale: 3,
      };
  }
}

export function crateTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a6a3e';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += h / 6) {
      ctx.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.1})`;
      ctx.fillRect(0, y, w, 3);
    }
    noise(ctx, w, h, 0.2, 1);
    ctx.strokeStyle = '#5b4224';
    ctx.lineWidth = 22;
    ctx.strokeRect(11, 11, w - 22, h - 22);
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(w - 20, h - 20);
    ctx.stroke();
  });
}

export function labelTexture(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    96,
    (ctx, w, h) => {
      ctx.fillStyle = '#f4efe0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c9a66b';
      ctx.fillRect(0, 0, w, 10);
      ctx.fillRect(0, h - 10, w, 10);
      ctx.fillStyle = '#5a3d1c';
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('AGUA DE', w / 4, 44);
      ctx.fillText('ALMENDRAS', w / 4, 70);
      ctx.fillText('AGUA DE', (w * 3) / 4, 44);
      ctx.fillText('ALMENDRAS', (w * 3) / 4, 70);
    },
    false,
  );
}

/** Cara del Smiler: ojos y sonrisa brillantes sobre fondo transparente. */
export function smilerTexture(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#f6f6f0';
      for (const x of [0.36, 0.64]) {
        ctx.beginPath();
        ctx.ellipse(x * s, 0.36 * s, 0.065 * s, 0.04 * s, x < 0.5 ? 0.3 : -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(0.16 * s, 0.55 * s);
      ctx.quadraticCurveTo(0.5 * s, 1.0 * s, 0.84 * s, 0.55 * s);
      ctx.quadraticCurveTo(0.5 * s, 0.76 * s, 0.16 * s, 0.55 * s);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 2.5;
      for (let i = 1; i < 14; i++) {
        const x = 0.16 + (0.68 * i) / 14;
        ctx.beginPath();
        ctx.moveTo(x * s, 0.58 * s);
        ctx.lineTo(x * s, 0.82 * s);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0.2 * s, 0.67 * s);
      ctx.quadraticCurveTo(0.5 * s, 0.8 * s, 0.8 * s, 0.67 * s);
      ctx.stroke();
    },
    false,
  );
}

export function textTexture(text: string, color: string, bg: string, w = 256, h = 64): THREE.CanvasTexture {
  return canvasTexture(
    w,
    h,
    (ctx) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.floor(h * 0.6)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 2);
    },
    false,
  );
}
