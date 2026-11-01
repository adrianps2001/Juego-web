import * as THREE from 'three';
import type { Theme } from './world';

// Todas las texturas se generan por código. Las de superficies se calculan
// píxel a píxel con ruido "periódico": lo que sale por un borde entra por el
// opuesto, así que al repetirse no se nota ningún corte.
//
// Para que tampoco se note la repetición, las texturas base solo llevan
// detalle fino y uniforme. Las manchas grandes, la humedad y los chorretones
// se añaden en el shader (lighting.ts) con la textura de suciedad, en
// coordenadas del mundo y a escalas que no coinciden con las de la base.

/** Las texturas de pared son el doble de anchas que de "base": cubren más metros. */
const WX = 2;

export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvasTexture(w: number, h: number, paint: Painter, repeat = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- ruido

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor que se repite cada `px` × `py` celdas. */
function vnoise(x: number, y: number, px: number, py: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % px) + px) % px;
  const y0 = ((iy % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Ruido fractal periódico. u, v en [0, 1); `cells` = celdas de la primera octava. */
function fbm(u: number, v: number, cellsX: number, cellsY: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = cellsX << o;
    const cy = cellsY << o;
    sum += vnoise(u * cx, v * cy, cx, cy, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

type Rgb = [number, number, number];
type PixelFn = (u: number, v: number, x: number, y: number) => Rgb;

/** Pinta cada píxel con la función dada (u, v en [0, 1); v = 0 arriba). */
function pixels(fn: PixelFn): Painter {
  return (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = fn(x / w, y / h, x, y);
        const i = (y * w + x) * 4;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  };
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Pinta en un painter después de otro. */
const layers =
  (...ps: Painter[]): Painter =>
  (ctx, w, h) => {
    for (const p of ps) p(ctx, w, h);
  };

// Las texturas de pared cubren la altura de la pared: abajo llevan zócalo o
// franja. Para paredes más altas se usa la versión "upper" (sin zócalo) que
// sí se repite en vertical sin cortes.

// ---------------------------------------------------------------- Nivel 0

interface WallpaperOpts {
  base: Rgb;
  stripe: Rgb;
  stain: number;
  trim: boolean;
  pale?: boolean;
  peel?: boolean; // deja ver rojo debajo
}

function wallpaperPainter(o: WallpaperOpts, seed: number): Painter {
  const motif = o.pale ? 0.03 : 0.06;
  const base = pixels((u, v, x) => {
    // franjas verticales suaves (número entero por textura: sin cortes)
    const s = Math.sin(u * Math.PI * 2 * 6 * WX);
    const fine = Math.sin(u * Math.PI * 2 * 48 * WX) * 0.5 + 0.5;
    let c = mix(o.base, o.stripe, (s * 0.5 + 0.5) * 0.35 + fine * 0.08);
    // pequeño motivo de rombos impreso
    const du = (u * 12 * WX) % 1;
    const dv = (v * (o.trim ? 24 : 12)) % 1;
    const diamond = Math.abs(du - 0.5) + Math.abs(dv - 0.5) < 0.18 ? 1 : 0;
    c = mul(c, 1 - diamond * motif);
    // manchas muy suaves (las grandes las pone el shader) y grano del papel
    const stain = fbm(u, v, 3 * WX, o.trim ? 6 : 3, 4, seed);
    c = mul(c, 1 - smooth(0.55, 0.85, stain) * o.stain * 0.25);
    const grain = hash2(x, Math.floor(v * 4096), seed) * 0.06 - 0.03;
    c = mul(c, 1 + grain);
    if (o.peel) {
      const p = fbm(u, v, 4 * WX, o.trim ? 8 : 4, 3, seed + 7);
      if (p > 0.66) c = mix([150, 22, 18], [90, 10, 10], fbm(u, v, 16 * WX, 32, 2, seed + 9));
      else if (p > 0.63) c = mul(c, 0.55); // borde del papel despegado
    }
    if (o.trim) {
      // humedad que sube del suelo
      c = mul(c, 1 - smooth(0.75, 1.0, v) * 0.08);
    }
    return c;
  });
  if (!o.trim) return base;
  return layers(base, (ctx, w, h) => {
    const bh = Math.round(h * 0.045);
    ctx.fillStyle = '#6a5233';
    ctx.fillRect(0, h - bh, w, bh);
    ctx.fillStyle = 'rgba(255,230,180,0.22)';
    ctx.fillRect(0, h - bh, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, h - bh - 2, w, 2);
    ctx.fillStyle = 'rgba(80, 62, 25, 0.35)';
    ctx.fillRect(0, 0, w, 3);
  });
}

/** Yeso rugoso de las zonas de apagón. */
const roughPlaster = (seed: number): Painter =>
  pixels((u, v) => {
    const n = fbm(u, v, 8 * WX, 16, 5, seed);
    const m = fbm(u, v, 2 * WX, 4, 3, seed + 3);
    return mul([178, 160, 108], 0.75 + n * 0.45 - m * 0.06);
  });

/** Moqueta tipo bereber: bucles pequeños y humedad. */
const carpet = (base: Rgb, wet: number, seed: number): Painter =>
  pixels((u, v, x, y) => {
    const loops = Math.sin(u * Math.PI * 2 * 64) * Math.sin(v * Math.PI * 2 * 64);
    const fibres = hash2(x, y, seed) * 0.16 - 0.08;
    const tone = fbm(u, v, 4, 4, 4, seed) - 0.5;
    const damp = smooth(0.5, 0.8, fbm(u, v, 2, 2, 4, seed + 11)) * wet;
    let c = mul(base, 1 + loops * 0.07 + fibres + tone * 0.12);
    c = mul(c, 1 - damp * 0.1);
    return c;
  });

/** Placas de techo de 60 × 60 cm, con perforaciones y manchas. */
const ceilingTiles = (stained: number, seed: number): Painter =>
  pixels((u, v, x, y) => {
    const tu = (u * 2) % 1;
    const tv = (v * 2) % 1;
    const edge = Math.min(tu, 1 - tu, tv, 1 - tv);
    let c: Rgb = [214, 206, 180];
    const holes = hash2(x >> 1, y >> 1, seed) < 0.06 ? 0.82 : 1;
    c = mul(c, holes * (0.96 + hash2(x, y, seed + 1) * 0.06));
    // (el tono de cada placa y las manchas grandes se ponen en el shader)
    const stain = smooth(0.55, 0.8, fbm(u, v, 2, 2, 4, seed + 5)) * stained;
    c = mix(c, [150, 120, 60], stain * 0.12);
    if (edge < 0.012) c = [138, 130, 108];
    else if (edge < 0.022) c = mul(c, 0.88);
    return c;
  });

/** Linóleo de oficina en losetas. */
const linoleum = (seed: number): Painter =>
  pixels((u, v, x, y) => {
    const tu = Math.floor(u * 4);
    const tv = Math.floor(v * 4);
    let c: Rgb = (tu + tv) % 2 ? [168, 160, 138] : [186, 178, 156];
    c = mul(c, 0.94 + fbm(u, v, 8, 8, 3, seed) * 0.12 + hash2(x, y, seed) * 0.04);
    c = mul(c, 1 - smooth(0.6, 0.85, fbm(u, v, 2, 2, 3, seed + 4)) * 0.06);
    const eu = (u * 4) % 1;
    const ev = (v * 4) % 1;
    if (Math.min(eu, 1 - eu, ev, 1 - ev) < 0.01) c = mul(c, 0.7);
    return c;
  });

const officePaint = (seed: number, trim: boolean): Painter =>
  pixels((u, v) => {
    const n = fbm(u, v, 4 * WX, 8, 4, seed);
    let c = mul([202, 192, 158], 0.92 + n * 0.14);
    if (trim) {
      if (v > 0.62) c = mul([143, 132, 103], 0.92 + n * 0.14);
      if (Math.abs(v - 0.615) < 0.006) c = [94, 84, 64];
      if (v > 0.96) c = [61, 54, 42];
    }
    return c;
  });

// ---------------------------------------------------------------- Nivel 1 y 2

/** Hormigón: base, poros, manchas y grietas finas (todo periódico). */
const concrete = (base: Rgb, o: { stains?: number; seed: number; cracks?: number; leak?: number; wx?: number }): PixelFn => {
  const wx = o.wx ?? 1;
  return (u, v, x, y) => {
    // grano fino y uniforme: nada que llame la atención al repetirse
    const n = fbm(u, v, 12 * wx, 12, 4, o.seed);
    const pores = hash2(x, y, o.seed) < 0.02 ? 0.75 : 1;
    let c = mul(base, (0.88 + n * 0.24) * pores);
    const stain = smooth(0.52, 0.85, fbm(u, v, 2 * wx, 2, 4, o.seed + 1));
    c = mul(c, 1 - stain * (o.stains ?? 0.25) * 0.3);
    if (o.cracks) {
      // grietas finas solo en algunas zonas, no por toda la superficie
      const zone = smooth(0.6, 0.72, fbm(u, v, 2 * wx, 2, 3, o.seed + 5));
      const cr = Math.abs(fbm(u, v, 3 * wx, 3, 4, o.seed + 2) - 0.5);
      const line = 1 - smooth(0.0015 * o.cracks, 0.004 * o.cracks, cr);
      c = mul(c, 1 - line * zone * 0.3);
    }
    if (o.leak) {
      // chorretones verticales de agua y óxido
      const col = fbm(u, 0, 24 * wx, 1, 2, o.seed + 3);
      const streak = smooth(0.62, 0.8, col) * smooth(1, 0.2, v + fbm(u, v, 4 * wx, 4, 2, o.seed + 4) * 0.4);
      c = mix(c, mul(c, 0.6), streak * o.leak * 0.35);
    }
    return c;
  };
};

const blockWall = (base: Rgb, seed: number, trim: 'hazard' | 'none'): Painter =>
  layers(
    pixels((u, v, x, y) => {
      let c = concrete(base, { seed, stains: 0.3, leak: 0.5, wx: WX })(u, v, x, y);
      // juntas de los bloques (2 × 10 por cada 256 px, al tresbolillo)
      const rows = 10;
      const row = Math.floor(v * rows);
      const bu = (u * 2 * WX + (row % 2) * 0.5) % 1;
      const bv = (v * rows) % 1;
      if (bv < 0.03 || bu < 0.012) c = mul(c, 0.72);
      return c;
    }),
    (ctx, w, h) => {
      if (trim !== 'hazard') return;
      const sh = h * 0.08;
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(0, h - sh, w, sh);
      ctx.fillStyle = '#1b1b1b';
      const n = 6 * WX; // número entero de franjas por textura: sin cortes
      const step = w / n;
      for (let k = -1; k <= n; k++) {
        const x = k * step;
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + step / 2, h);
        ctx.lineTo(x + step, h - sh);
        ctx.lineTo(x + step / 2, h - sh);
        ctx.fill();
      }
      // la pintura está gastada: se mezcla con ruido
      const img = ctx.getImageData(0, h - sh, w, sh);
      for (let i = 0; i < img.data.length; i += 4) {
        const k = 0.75 + hash2(i, 7, 43) * 0.3;
        img.data[i] *= k;
        img.data[i + 1] *= k;
        img.data[i + 2] *= k;
      }
      ctx.putImageData(img, 0, h - sh);
    },
  );

const paintedWall = (top: Rgb, bottom: Rgb | null, seed: number): Painter =>
  pixels((u, v, x, y) => {
    let c = concrete(top, { seed, stains: 0.18, wx: WX })(u, v, x, y);
    if (bottom) {
      if (v > 0.55) c = concrete(bottom, { seed: seed + 9, stains: 0.25, wx: WX })(u, v, x, y);
      if (Math.abs(v - 0.55) < 0.005) c = mul(bottom, 0.6);
    }
    return c;
  });

/** Ladrillo (colores del Nivel 2: marrón barro y casi negro). */
const brick = (a: Rgb, b: Rgb, seed: number): Painter =>
  pixels((u, v, x, y) => {
    const rows = 16;
    const cols = 4 * WX;
    const row = Math.floor(v * rows);
    const bu = u * cols + (row % 2) * 0.5;
    const col = Math.floor(bu) % cols;
    const fu = bu % 1;
    const fv = (v * rows) % 1;
    const mortar = fu < 0.04 || fv < 0.1;
    const tone = hash2(col, row, seed);
    let c = mortar ? ([96, 88, 78] as Rgb) : mix(a, b, tone);
    c = mul(c, 0.88 + fbm(u, v, 8 * WX, 16, 3, seed + 1) * 0.24 + hash2(x, y, seed) * 0.06);
    // polvo blanquecino (las paredes del Nivel 2 son "calcáreas")
    c = mix(c, [150, 140, 125], smooth(0.55, 0.85, fbm(u, v, 3 * WX, 6, 3, seed + 2)) * 0.1);
    return c;
  });

const rustMetal = (seed: number): Painter =>
  pixels((u, v, x, y) => {
    const n = fbm(u, v, 6 * WX, 12, 5, seed);
    let c = mul([82, 70, 60], 0.85 + n * 0.3);
    const rust = smooth(0.5, 0.75, fbm(u, v, 3 * WX, 6, 4, seed + 1));
    c = mix(c, [124, 62, 24], rust * 0.4);
    // paneles con remaches
    const pu = (u * 2 * WX) % 1;
    const pv = (v * 4) % 1;
    if (pu < 0.008 * WX || pv < 0.006) c = mul(c, 0.5);
    const ru = (u * 2 * WX) % 0.5;
    const rv = (v * 4) % 1;
    if (Math.hypot(ru - 0.04, rv - 0.06) < 0.012) c = mul(c, 0.55);
    return mul(c, 1 + hash2(x, y, seed) * 0.05);
  });

const grate = (seed: number): Painter =>
  pixels((u, v, x, y) => {
    const gu = (u * 10) % 1;
    const gv = (v * 10) % 1;
    const bar = gu < 0.28 || gv < 0.16;
    let c: Rgb = bar ? [74, 66, 58] : [16, 14, 12];
    c = mul(c, 0.85 + fbm(u, v, 4, 4, 3, seed) * 0.3 + hash2(x, y, seed) * 0.05);
    if (bar) c = mix(c, [120, 60, 25], smooth(0.55, 0.8, fbm(u, v, 3, 3, 3, seed + 1)) * 0.6);
    return c;
  });

// ---------------------------------------------------------------- catálogo

/** Texturas de un tema (T = textura de Three.js, o imagen en el worker). */
export interface ThemeData<T> {
  walls: T[];
  wallUppers: T[]; // versión sin zócalo, que se repite en vertical
  floors: T[];
  ceils: T[];
  wallScale: number; // metros de ancho que cubre la textura de pared
  wallHeight: number; // metros de alto (el zócalo queda abajo)
  floorScale: number;
  ceilScale: number;
  /**
   * Cada cuánto (en fracción de la textura) se repite el dibujo regular de
   * cada textura: el shader solo desplaza la textura en múltiplos de esto para
   * que juntas, ladrillos y losetas sigan alineados. 0 = desplazamiento libre.
   */
  wallSnap: number[];
  floorSnap: number[];
  /** Tamaño en metros de las losetas/placas (para dar a cada una un tono); 0 = no son losetas. */
  floorCell: number[];
  ceilCell: number[];
}

export type ThemeTextures = ThemeData<THREE.Texture>;

const cache = new Map<Theme, ThemeTextures>();
const pending = new Map<Theme, Promise<ThemeTextures>>();

/** Texturas de un tema ya generadas (o generadas ahora mismo, bloqueando). */
export function themeTextures(theme: Theme): ThemeTextures {
  let t = cache.get(theme);
  if (!t) {
    t = buildTheme(theme, canvasTexture);
    cache.set(theme, t);
  }
  return t;
}

export const themeReady = (theme: Theme) => cache.has(theme);

let worker: Worker | null | undefined;

/**
 * Genera las texturas de un tema en un hilo aparte (Web Worker), para que el
 * juego no se congele al cambiar de nivel. Si el navegador no puede, las
 * genera aquí.
 */
export function loadThemeTextures(theme: Theme): Promise<ThemeTextures> {
  const done = cache.get(theme);
  if (done) return Promise.resolve(done);
  let p = pending.get(theme);
  if (p) return p;
  if (worker === undefined) {
    try {
      worker = typeof OffscreenCanvas !== 'undefined' ? new Worker(new URL('./texworker.ts', import.meta.url), { type: 'module' }) : null;
    } catch {
      worker = null;
    }
  }
  const w = worker;
  if (!w) return Promise.resolve(themeTextures(theme));
  p = new Promise<ThemeTextures>((resolve) => {
    const onMessage = (e: MessageEvent<{ theme: Theme; data?: ThemeData<ImageBitmap>; error?: string }>) => {
      if (e.data.theme !== theme) return;
      w.removeEventListener('message', onMessage);
      if (!e.data.data) {
        resolve(themeTextures(theme));
        return;
      }
      const wrap = (img: ImageBitmap) => {
        const tex = new THREE.Texture(img);
        tex.flipY = false; // el worker ya la manda girada
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
      };
      const d = e.data.data;
      const t: ThemeTextures = { ...d, walls: d.walls.map(wrap), wallUppers: d.wallUppers.map(wrap), floors: d.floors.map(wrap), ceils: d.ceils.map(wrap) };
      if (!cache.has(theme)) cache.set(theme, t);
      resolve(cache.get(theme)!);
    };
    w.addEventListener('message', onMessage);
    w.postMessage(theme);
  });
  pending.set(theme, p);
  return p;
}

export function buildTheme<T>(theme: Theme, make: (w: number, h: number, p: Painter) => T): ThemeData<T> {
  const wall = (p: Painter) => make(256 * WX, 512, p);
  const sq = (p: Painter, s = 512) => make(s, s, p);
  const pair = (mk: (trim: boolean) => Painter) => [wall(mk(true)), wall(mk(false))];
  const build = (list: ((trim: boolean) => Painter)[]) => {
    const p = list.map(pair);
    return { walls: p.map((x) => x[0]), wallUppers: p.map((x) => x[1]) };
  };
  switch (theme) {
    case 'lobby': {
      // 0 papel amarillo · 1 papel pálido (arcos) · 2 pintura de oficina · 3 yeso rugoso (apagón) · 4 papel rojo despegado
      const w = build([
        (trim) => wallpaperPainter({ base: [201, 178, 92], stripe: [176, 150, 70], stain: 0.28, trim }, 11),
        (trim) => wallpaperPainter({ base: [214, 202, 150], stripe: [196, 182, 128], stain: 0.2, trim, pale: true }, 12),
        (trim) => officePaint(13, trim),
        () => roughPlaster(14),
        (trim) => wallpaperPainter({ base: [176, 92, 64], stripe: [150, 60, 45], stain: 0.35, trim, peel: true }, 15),
      ]);
      return {
        ...w,
        // 0 moqueta · 1 linóleo · 2 moqueta más seca y clara (salas de columnas) · 3 moqueta roja espesa
        floors: [sq(carpet([150, 126, 82], 1, 21)), sq(linoleum(22)), sq(carpet([166, 142, 96], 0.4, 23)), sq(carpet([118, 40, 30], 0.8, 24))],
        ceils: [sq(ceilingTiles(0.3, 31)), sq(ceilingTiles(1, 32))],
        wallScale: 1.6 * WX,
        wallHeight: 2.8,
        floorScale: 3,
        ceilScale: 1.2,
        wallSnap: [1 / 12, 1 / 12, 0, 0, 1 / 12],
        floorSnap: [0, 0.5, 0, 0],
        floorCell: [0, 3 / 4, 0, 0],
        ceilCell: [0.6, 0.6],
      };
    }
    case 'habitable': {
      // 0 hormigón gris (Aquila) · 1 hormigón blanco (pasillos) · 2 bloques con franja (almacén)
      // 3 ladrillo · 4 pintura verde (M.E.G.) · 5 piedra cálida (sector gótico) · 6 manila
      const w = build([
        (trim) => pixels(concrete([132, 134, 136], { seed: 41, stains: 0.3, leak: trim ? 0.6 : 0.3, cracks: 1, wx: WX })),
        (trim) => paintedWall([196, 196, 190], trim ? [168, 168, 160] : null, 42),
        (trim) => blockWall([140, 142, 144], 43, trim ? 'hazard' : 'none'),
        () => brick([120, 62, 46], [92, 48, 38], 44),
        (trim) => paintedWall([186, 188, 178], trim ? [79, 107, 88] : null, 45),
        () => pixels(concrete([150, 136, 116], { seed: 46, stains: 0.25, cracks: 1, wx: WX })),
        (trim) => paintedWall([214, 198, 148], trim ? [178, 160, 116] : null, 47), // 6 manila
      ]);
      return {
        ...w,
        // 0 hormigón · 1 hormigón pintado · 2 goma acolchada · 3 baldosa de enfermería
        floors: [
          sq(pixels(concrete([98, 100, 101], { seed: 51, stains: 0.35, cracks: 2 }))),
          sq(pixels(concrete([92, 98, 94], { seed: 52, stains: 0.2 }))),
          sq(pixels((u, v) => mul([70, 72, 78], 0.85 + fbm(u, v, 8, 8, 3, 53) * 0.2 + (((u * 8) % 1 < 0.04 || (v * 8) % 1 < 0.04) ? -0.3 : 0)))),
          sq(linoleum(54)),
        ],
        ceils: [sq(pixels(concrete([110, 112, 114], { seed: 61, stains: 0.35 }))), sq(ceilingTiles(0.6, 62))],
        wallScale: 2.4 * WX,
        wallHeight: 3,
        floorScale: 5,
        ceilScale: 4,
        wallSnap: [0, 0, 1 / 4, 1 / 8, 0, 0, 0],
        floorSnap: [0, 0, 1 / 8, 0.5],
        floorCell: [0, 0, 0, 5 / 4],
        ceilCell: [0, 2],
      };
    }
    case 'pipes': {
      // 0 hormigón polvoriento · 1 ladrillo marrón barro · 2 ladrillo negro · 3 metal oxidado
      const w = build([
        () => pixels((u, v, x, y) => mix(concrete([96, 84, 72], { seed: 71, stains: 0.45, cracks: 2, leak: 0.7, wx: WX })(u, v, x, y), [150, 140, 125], smooth(0.6, 0.9, fbm(u, v, 3 * WX, 6, 3, 72)) * 0.1)),
        () => brick([108, 74, 50], [82, 56, 40], 73),
        () => brick([46, 40, 36], [30, 26, 24], 74),
        () => rustMetal(75),
      ]);
      return {
        ...w,
        // 0 hormigón sucio · 1 rejilla
        floors: [sq(pixels(concrete([74, 66, 58], { seed: 81, stains: 0.45, cracks: 2 }))), sq(grate(82), 256)],
        ceils: [sq(pixels(concrete([58, 50, 44], { seed: 91, stains: 0.5 })))],
        wallScale: 1.8 * WX,
        wallHeight: 2.6,
        floorScale: 2.5,
        ceilScale: 3,
        wallSnap: [0, 1 / 8, 1 / 8, 1 / 4],
        floorSnap: [0, 0.1],
        floorCell: [0, 0],
        ceilCell: [0],
      };
    }
  }
}

// ---------------------------------------------------------------- suciedad

let grimeTex: THREE.Texture | null = null;

/**
 * Textura de suciedad (se repite sin cortes y se muestrea a varias escalas):
 * R = manchas grandes, G = manchas medianas, B = ruido estirado en vertical
 * (chorretones). No lleva espacio de color: son datos.
 */
export function grimeTexture(): THREE.Texture {
  if (grimeTex) return grimeTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      img.data[i] = fbm(u, v, 4, 4, 5, 501) * 255;
      img.data[i + 1] = fbm(u, v, 8, 8, 4, 502) * 255;
      img.data[i + 2] = fbm(u, v, 32, 2, 3, 503) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  grimeTex = tex;
  return tex;
}

// ---------------------------------------------------------------- objetos

export function crateTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    pixels((u, v, x, y) => {
      const grain = Math.sin((v * 40 + fbm(u, v, 2, 8, 3, 101) * 6) * Math.PI) * 0.06;
      return mul([140, 106, 62], 0.88 + grain + hash2(x, y, 102) * 0.06);
    })(ctx, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 1; k < 6; k++) ctx.fillRect(0, (k * h) / 6, w, 2);
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

/** Lienzo con texto de varias líneas (notas, carteles). */
export function paperTexture(lines: string[], o: { w?: number; h?: number; bg?: string; ink?: string; font?: string } = {}): THREE.CanvasTexture {
  const w = o.w ?? 256;
  const h = o.h ?? 320;
  return canvasTexture(
    w,
    h,
    (ctx) => {
      ctx.fillStyle = o.bg ?? '#ece4cc';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = o.ink ?? '#2a2418';
      ctx.font = o.font ?? '16px "Comic Sans MS", cursive';
      lines.forEach((l, i) => ctx.fillText(l, 14, 30 + i * 22));
    },
    false,
  );
}

export { fbm, hash2 };
