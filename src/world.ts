// Datos de los niveles a partir de los mapas de maps.ts. No depende de
// Three.js: el anfitrión también lo usa para mover a los Smilers.

import { MAPS } from './maps';

export type Theme = 'lobby' | 'habitable' | 'pipes';

export interface LevelDef {
  name: string;
  title: string;
  theme: Theme;
  height: number; // altura del techo
  lampEvery: number; // un fluorescente cada N casillas iluminadas
  lampOffset: number;
  lampRadius: number; // alcance de cada fluorescente, en metros
  lampPower: number;
  flickerChance: number;
  ambient: number;
  tint: [number, number, number]; // color de la luz
  smilerSpeed: number;
  sanityDrain: number; // cordura perdida por segundo con luz
  fog: { color: number; near: number; far: number };
}

export const LEVELS: LevelDef[] = [
  {
    name: 'Nivel 0',
    title: 'El Vestíbulo',
    theme: 'lobby',
    height: 2.8,
    lampEvery: 4,
    lampOffset: 2,
    lampRadius: 7.5,
    lampPower: 0.95,
    flickerChance: 0.12,
    ambient: 0.025,
    tint: [1, 0.95, 0.78],
    smilerSpeed: 2.4,
    sanityDrain: 0.3,
    fog: { color: 0x3a3218, near: 8, far: 42 },
  },
  {
    name: 'Nivel 1',
    title: 'Zona Habitable',
    theme: 'habitable',
    height: 4.2,
    lampEvery: 6,
    lampOffset: 1,
    lampRadius: 10,
    lampPower: 0.8,
    flickerChance: 0.2,
    ambient: 0.02,
    tint: [0.85, 0.93, 1],
    smilerSpeed: 2.9,
    sanityDrain: 0.45,
    fog: { color: 0x121518, near: 4, far: 34 },
  },
  {
    name: 'Nivel 2',
    title: 'Tuberías',
    theme: 'pipes',
    height: 2.6,
    lampEvery: 2,
    lampOffset: 1,
    lampRadius: 4.5,
    lampPower: 0.5,
    flickerChance: 0.35,
    ambient: 0.012,
    tint: [1, 0.55, 0.3],
    smilerSpeed: 3.2,
    sanityDrain: 0.6,
    fog: { color: 0x120a05, near: 1, far: 20 },
  },
];

/** Nivel especial: el jugador ha escapado de los Backrooms. */
export const ESCAPED = LEVELS.length;

export const CELL = 1.25; // metros por casilla
export const LM_RES = 2; // texels del mapa de luz por casilla
const SOLID = '#Ex';
const BLOCKS_LIGHT = '#E';

export function hash(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  h = Math.imul(h ^ (h >>> 16), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export type ItemKind = 'agua' | 'pila';

export interface Item {
  key: string;
  kind: ItemKind;
  x: number;
  z: number;
}

export interface Exit {
  x: number; // centro de la cara de la puerta
  z: number;
  ry: number; // hacia dónde mira la puerta
}

export interface Lamp {
  x: number;
  z: number;
  flicker: boolean;
}

export interface LevelMap {
  level: number;
  w: number;
  h: number;
  rows: string[];
  spawn: { x: number; z: number };
  items: Item[];
  exits: Exit[];
  lairs: { x: number; z: number }[];
  lamps: Lamp[];
  /** Luz por texel: [fija, parpadeante] intercalados. */
  light: Float32Array;
  /** 1 si la casilla está a oscuras (los Smilers pueden pisarla). */
  dark: Uint8Array;
}

const cache = new Map<number, LevelMap>();

export function getMap(level: number): LevelMap {
  let map = cache.get(level);
  if (!map) {
    map = parseMap(level);
    cache.set(level, map);
  }
  return map;
}

export const center = (c: number) => (c + 0.5) * CELL;
export const cellOf = (v: number) => Math.floor(v / CELL);

export function charAt(map: LevelMap, cx: number, cz: number): string {
  return map.rows[cz]?.[cx] ?? '#';
}

export const isSolid = (map: LevelMap, cx: number, cz: number) => SOLID.includes(charAt(map, cx, cz));

export function isDarkAt(map: LevelMap, x: number, z: number): boolean {
  const cx = cellOf(x);
  const cz = cellOf(z);
  return cx >= 0 && cz >= 0 && cx < map.w && cz < map.h && map.dark[cz * map.w + cx] === 1;
}

function parseMap(level: number): LevelMap {
  const L = LEVELS[level];
  const rows = MAPS[level].trim().split('\n');
  const w = rows[0].length;
  const h = rows.length;
  const map: LevelMap = {
    level,
    w,
    h,
    rows,
    spawn: { x: center(1), z: center(1) },
    items: [],
    exits: [],
    lairs: [],
    lamps: [],
    light: new Float32Array(w * LM_RES * h * LM_RES * 2),
    dark: new Uint8Array(w * h),
  };

  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      const ch = rows[cz][cx];
      const x = center(cx);
      const z = center(cz);
      const key = `${level}:${cx}:${cz}`;
      if (ch === 'S') map.spawn = { x, z };
      if (ch === 'M') map.lairs.push({ x, z });
      if (ch === 'A' || ch === 'B') {
        const ox = (hash(level, cx, cz, 1) - 0.5) * CELL * 0.4;
        const oz = (hash(level, cx, cz, 2) - 0.5) * CELL * 0.4;
        map.items.push({ key, kind: ch === 'A' ? 'agua' : 'pila', x: x + ox, z: z + oz });
      }
      if (ch === 'E') {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!isSolid(map, cx + dx, cz + dz)) {
            map.exits.push({ x: x + (dx * CELL) / 2, z: z + (dz * CELL) / 2, ry: Math.atan2(dx, dz) });
            break;
          }
        }
      }
      if ('.SABw'.includes(ch) && cx % L.lampEvery === L.lampOffset % L.lampEvery && cz % L.lampEvery === L.lampOffset % L.lampEvery) {
        map.lamps.push({ x, z, flicker: hash(level, cx, cz, 3) < L.flickerChance });
      }
    }
  }

  bakeLight(map);
  dilateLight(map);
  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      if (isSolid(map, cx, cz)) continue;
      const i = ((cz * LM_RES + LM_RES / 2) * w * LM_RES + cx * LM_RES + LM_RES / 2) * 2;
      if (map.light[i] + map.light[i + 1] < 0.12) map.dark[cz * w + cx] = 1;
    }
  }
  return map;
}

/** ¿Hay línea de visión entre dos puntos? (las paredes bloquean la luz) */
function lineOfSight(map: LevelMap, x0: number, z0: number, x1: number, z1: number): boolean {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / (CELL * 0.25));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (BLOCKS_LIGHT.includes(charAt(map, cellOf(x0 + (x1 - x0) * t), cellOf(z0 + (z1 - z0) * t)))) return false;
  }
  return true;
}

function bakeLight(map: LevelMap) {
  const L = LEVELS[map.level];
  const tw = map.w * LM_RES;
  const th = map.h * LM_RES;
  const texel = CELL / LM_RES;
  const r = L.lampRadius;
  for (const lamp of map.lamps) {
    const i0 = Math.max(0, Math.floor((lamp.x - r) / texel));
    const i1 = Math.min(tw - 1, Math.ceil((lamp.x + r) / texel));
    const j0 = Math.max(0, Math.floor((lamp.z - r) / texel));
    const j1 = Math.min(th - 1, Math.ceil((lamp.z + r) / texel));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * texel;
        const z = (j + 0.5) * texel;
        const d = Math.hypot(x - lamp.x, z - lamp.z);
        if (d >= r || !lineOfSight(map, lamp.x, lamp.z, x, z)) continue;
        const f = 1 - d / r;
        map.light[(j * tw + i) * 2 + (lamp.flicker ? 1 : 0)] += L.lampPower * f * f * (1.6 - 0.6 * f);
      }
    }
  }
}

/**
 * Los texels dentro de las paredes no reciben luz; si se quedan a cero, el
 * filtrado bilineal oscurece el techo y el suelo junto a ellas. Se rellenan
 * con la luz de sus vecinos libres.
 */
function dilateLight(map: LevelMap) {
  const tw = map.w * LM_RES;
  const th = map.h * LM_RES;
  const solid = (i: number, j: number) => isSolid(map, Math.floor(i / LM_RES), Math.floor(j / LM_RES));
  for (let pass = 0; pass < 2; pass++) {
    const src = map.light.slice();
    for (let j = 1; j < th - 1; j++) {
      for (let i = 1; i < tw - 1; i++) {
        if (!solid(i, j)) continue;
        for (const ch of [0, 1]) {
          let best = 0;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            best = Math.max(best, src[((j + dj) * tw + i + di) * 2 + ch]);
          }
          map.light[(j * tw + i) * 2 + ch] = Math.max(src[(j * tw + i) * 2 + ch], best * 0.9);
        }
      }
    }
  }
}

/** Empuja un círculo de radio r fuera de las paredes y cajas cercanas. */
export function collide(map: LevelMap, x: number, z: number, r: number): { x: number; z: number } {
  const cx = cellOf(x);
  const cz = cellOf(z);
  for (let iter = 0; iter < 3; iter++) {
    for (let j = cz - 1; j <= cz + 1; j++) {
      for (let i = cx - 1; i <= cx + 1; i++) {
        const ch = charAt(map, i, j);
        if (!SOLID.includes(ch)) continue;
        const inset = ch === 'x' ? CELL * 0.08 : 0;
        const x0 = i * CELL + inset;
        const x1 = (i + 1) * CELL - inset;
        const z0 = j * CELL + inset;
        const z1 = (j + 1) * CELL - inset;
        const px = Math.min(Math.max(x, x0), x1);
        const pz = Math.min(Math.max(z, z0), z1);
        const dx = x - px;
        const dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x += (dx / d) * (r - d);
          z += (dz / d) * (r - d);
        } else {
          const pushes = [x0 - r - x, x1 + r - x, z0 - r - z, z1 + r - z];
          const k = pushes.reduce((best, v, n) => (Math.abs(v) < Math.abs(pushes[best]) ? n : best), 0);
          if (k < 2) x += pushes[k];
          else z += pushes[k];
        }
      }
    }
  }
  return { x, z };
}

/**
 * Distancias (en casillas) desde (tx, tz) recorriendo solo casillas a
 * oscuras, hasta maxDist. -1 = inalcanzable. La casilla de origen cuenta
 * aunque esté iluminada.
 */
export function darkDistances(map: LevelMap, tx: number, tz: number, maxDist: number): Int16Array {
  const dist = new Int16Array(map.w * map.h).fill(-1);
  if (tx < 0 || tz < 0 || tx >= map.w || tz >= map.h) return dist;
  const queue = [tz * map.w + tx];
  dist[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const idx = queue[q];
    const d = dist[idx];
    if (d >= maxDist) continue;
    const cx = idx % map.w;
    const cz = (idx - cx) / map.w;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
      const n = nz * map.w + nx;
      if (dist[n] !== -1 || !map.dark[n]) continue;
      dist[n] = d + 1;
      queue.push(n);
    }
  }
  return dist;
}
