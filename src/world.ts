// El mundo como una rejilla 2,5D: cada casilla de 0,5 m tiene su altura de
// suelo y de techo, y puede ser pared, obstáculo, agujero, rampa o escalera.
// Un nivel puede tener varias plantas (rejillas apiladas): en una columna caben
// una sala abajo y otra encima. Los huecos del suelo de una planta dejan caer
// a la de abajo, y las escaleras las unen.
// No depende de Three.js: el anfitrión también lo usa para mover a los
// enemigos. Los niveles se diseñan en levels.ts con el constructor de abajo.

export const CELL = 0.5; // metros por casilla
export const STEP = 0.55; // altura máxima que se sube andando
export const PLAYER_HEIGHT = 1.75;

export const F_SOLID = 1; // pared de suelo a techo
export const F_BLOCK = 2; // obstáculo (mueble, caja): no deja pasar, pero sí la luz
export const F_PIT = 4; // agujero sin fondo
export const F_STAIRS = 8; // la rampa se dibuja como escalera
export const F_NOLAMP = 16; // zona a oscuras: no se ponen fluorescentes
export const F_WET = 32; // charco
export const F_RED = 64; // Habitación Roja
export const F_DEEP = 128; // fluido hasta los tobillos (cuesta andar)
export const F_HOLE = 256; // hueco en el suelo: se cae a la planta de abajo
export const F_SHAFT = 512; // debajo de un hueco: el techo es el de la planta de arriba

export type Theme = 'lobby' | 'habitable' | 'pipes';

export interface LevelDef {
  name: string;
  title: string;
  theme: Theme;
  lampSpacing: number;
  lampRadius: number;
  lampPower: number;
  flickerChance: number;
  ambient: number;
  tint: [number, number, number];
  sanityDrain: number;
  staminaRegen: number; // multiplicador (el calor del Nivel 2 cansa)
  fog: { color: number; near: number; far: number };
  blackouts: boolean; // apagones periódicos (el "Parpadeo" del Nivel 1)
  circuits?: boolean; // tramos de luces que se funden (Nivel 2)
  isolation?: boolean; // no se ve a los demás (Nivel 0)
}

export type ItemKind = 'agua' | 'pila' | 'barrita' | 'vendas' | 'lata' | 'bengala';
export type EntityKind = 'figure' | 'smiler' | 'hound' | 'faceling' | 'skinstealer' | 'clump' | 'duller';

export interface Item {
  s?: number; // planta (0 = la de abajo)
  key: string;
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
}
export interface Crate {
  s?: number; // planta (0 = la de abajo)
  key: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  pool: 'comida' | 'medico' | 'herramientas' | 'mixto'; // qué suele contener
  shelf?: boolean; // está en una estantería (se dibuja más alta)
}

/** Nota que se puede leer. */
export interface Note {
  s?: number; // planta (0 = la de abajo)
  key: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  title: string;
  text: string;
  wall: boolean; // pegada a la pared (si no, en el suelo o en una mesa)
  h: number; // altura sobre el suelo
}

/** Puerta: cerrada con llave, o que lleva a otro sitio del mapa. */
export interface Door {
  s?: number; // planta (0 = la de abajo)
  key: string;
  x: number;
  y: number;
  z: number;
  ry: number; // hacia dónde mira la puerta (su cara "de este lado")
  look: 'steel' | 'double' | 'wood' | 'white';
  locked: boolean;
  to?: { x: number; z: number; ry: number; s?: number }; // destino al cruzarla
  window?: boolean;
  sign?: string; // cartel encima (p. ej. SALIDA en verde)
  label?: string; // texto al interactuar
}

/** Bloque de pared que aparece o desaparece cuando nadie lo mira. */
export interface Shift {
  s?: number; // planta (0 = la de abajo)
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  closed: boolean; // estado inicial
  wall: number;
  pair?: number; // bloque con el que se turna (uno abierto, el otro cerrado)
}

/** Zona que se repite: al salir por un extremo se aparece por el otro. */
export interface Loop {
  s?: number; // planta (0 = la de abajo)
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  axis: 'x' | 'z';
  oneWay?: 1 | -1; // solo se repite al avanzar en ese sentido
  landmark?: { x: number; z: number }; // si la miras mientras andas, no se repite
}

/** Personaje que no ataca (patrulla de la M.E.G., trabajadores sombra). */
export interface Npc {
  s?: number; // planta (0 = la de abajo)
  kind: 'meg' | 'worker';
  x: number;
  z: number;
  ry: number;
  lines: string[];
  path?: [number, number][];
}

/** Zona marcada para efectos (sala de encuentro, zona segura, etc.). */
export interface Zone {
  kind: 'meeting' | 'safe' | 'void' | 'red' | 'whisper' | 'abyss';
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Panel de pared en diagonal (giros de 45°). */
export interface Diag {
  s?: number; // planta (0 = la de abajo)
  x: number;
  z: number;
  ry: number;
  w: number;
  wall: number;
}
export interface Exit {
  s?: number; // planta (0 = la de abajo)
  x: number;
  y: number;
  z: number;
  ry: number;
  label: string;
  walk?: boolean; // basta con llegar (sin puerta)
}
export interface Lair {
  s?: number; // planta (0 = la de abajo)
  kind: EntityKind;
  x: number;
  z: number;
  /** Frases que dice (Skin-Stealer disfrazado). */
  lines?: string[];
}
export interface Lamp {
  s?: number; // planta (0 = la de abajo)
  x: number;
  y: number;
  z: number;
  flicker: boolean;
  broken: boolean; // fluorescente roto: está, pero no da luz
  forced?: boolean; // puesto a mano (se respeta aunque la zona sea oscura)
}
export interface Prop {
  s?: number; // planta (0 = la de abajo)
  type: string;
  x: number;
  y: number;
  z: number;
  ry: number;
  w?: number;
  d?: number;
  h?: number;
  text?: string;
}
export interface Glitch {
  x: number;
  y: number;
  z: number;
  ry: number;
  w: number;
  h: number;
  noclip: boolean;
}
export interface Vent {
  s?: number; // planta (0 = la de abajo)
  x: number;
  y: number;
  z: number;
  period: number;
  phase: number;
}

export interface LevelMap {
  level: number;
  def: LevelDef;
  w: number;
  h: number;
  flags: Uint16Array;
  floor: Float32Array;
  ceil: Float32Array;
  rampDir: Int8Array; // -1 sin rampa; 0 sube hacia +x, 1 hacia -x, 2 hacia +z, 3 hacia -z
  rampRise: Float32Array;
  wallMat: Uint8Array;
  floorMat: Uint8Array;
  ceilMat: Uint8Array;
  spawn: { x: number; y: number; z: number; s?: number; ry?: number };
  items: Item[];
  crates: Crate[];
  exits: Exit[];
  lairs: Lair[];
  lamps: Lamp[];
  props: Prop[];
  glitches: Glitch[];
  vents: Vent[];
  notes: Note[];
  doors: Door[];
  shifts: Shift[];
  loops: Loop[];
  npcs: Npc[];
  zones: Zone[];
  diags: Diag[];
  /** Ventanas peligrosas al final de algunos túneles. */
  windows: { x: number; y: number; z: number; ry: number; s?: number }[];
  /** Puntos donde viven bichos ambientales (polillas, ratas). */
  critters: { kind: 'moth' | 'rat'; x: number; z: number; s?: number }[];
  /** Sitios donde se despierta tras caer al vacío. */
  wakes: { x: number; z: number; s: number }[];
  /** Bloque de "cambio periférico" al que pertenece cada casilla (-1 = ninguno). */
  shiftCell: Int16Array;
  /** Luz por casilla: [fija, parpadeante] intercalados. */
  light: Float32Array;
  /** 1 si la casilla está a oscuras. */
  dark: Uint8Array;
  /** En las casillas F_SHAFT: altura del techo original (donde empieza el forjado de arriba). */
  slab: Float32Array;
  /** Número de esta planta. */
  storey: number;
  /** Todas las plantas del nivel (comparten las listas de objetos). storeys[0] es el nivel. */
  storeys: LevelMap[];
  /** Alturas a partir de las cuales empieza cada planta superior (para la luz). */
  splits: number[];
}

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

export const cellOf = (v: number) => Math.floor(v / CELL);
export const center = (c: number) => (c + 0.5) * CELL;

export function inside(map: LevelMap, cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < map.w && cz < map.h;
}

export function flagsAt(map: LevelMap, cx: number, cz: number): number {
  return inside(map, cx, cz) ? map.flags[cz * map.w + cx] : F_SOLID;
}

/** Altura del suelo en un punto (con rampas). -Infinity si es un agujero. */
export function floorAt(map: LevelMap, x: number, z: number): number {
  const cx = cellOf(x);
  const cz = cellOf(z);
  if (!inside(map, cx, cz)) return 0;
  const i = cz * map.w + cx;
  if (map.flags[i] & (F_PIT | F_HOLE)) return -Infinity;
  const dir = map.rampDir[i];
  if (dir < 0) return map.floor[i];
  const fx = x / CELL - cx;
  const fz = z / CELL - cz;
  const t = dir === 0 ? fx : dir === 1 ? 1 - fx : dir === 2 ? fz : 1 - fz;
  return map.floor[i] + t * map.rampRise[i];
}

/** Punto más alto del suelo de una casilla. */
export function cellTop(map: LevelMap, cx: number, cz: number): number {
  const i = cz * map.w + cx;
  return map.floor[i] + Math.max(0, map.rampRise[i]);
}

export function ceilAt(map: LevelMap, x: number, z: number): number {
  const cx = cellOf(x);
  const cz = cellOf(z);
  return inside(map, cx, cz) ? map.ceil[cz * map.w + cx] : 0;
}

/** ¿Impide esta casilla el paso a alguien con los pies a la altura y? */
export function blocksAt(map: LevelMap, cx: number, cz: number, y: number, height = PLAYER_HEIGHT): boolean {
  if (!inside(map, cx, cz)) return true;
  const i = cz * map.w + cx;
  const f = map.flags[i];
  if (f & (F_SOLID | F_BLOCK)) return true;
  if (f & (F_PIT | F_HOLE)) return false;
  if (cellTop(map, cx, cz) > y + STEP) return true;
  return map.ceil[i] < Math.max(y, map.floor[i]) + height;
}

export function isDarkAt(map: LevelMap, x: number, z: number): boolean {
  const cx = cellOf(x);
  const cz = cellOf(z);
  return inside(map, cx, cz) && map.dark[cz * map.w + cx] === 1;
}

/** Empuja un círculo de radio r fuera de las casillas que le bloquean. */
export function collide(map: LevelMap, x: number, z: number, y: number, r: number, height = PLAYER_HEIGHT) {
  const cx = cellOf(x);
  const cz = cellOf(z);
  for (let iter = 0; iter < 3; iter++) {
    for (let j = cz - 1; j <= cz + 1; j++) {
      for (let i = cx - 1; i <= cx + 1; i++) {
        if (!blocksAt(map, i, j, y, height)) continue;
        const x0 = i * CELL;
        const x1 = x0 + CELL;
        const z0 = j * CELL;
        const z1 = z0 + CELL;
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

/** ¿Se ve un punto desde otro? Lo cortan las paredes, el suelo y el techo. */
export function lineOfSight(map: LevelMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / (CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const y = y0 + (y1 - y0) * t;
    const cx = cellOf(x);
    const cz = cellOf(z);
    if (!inside(map, cx, cz)) return false;
    const i = cz * map.w + cx;
    if (map.flags[i] & F_SOLID) return false;
    if (!(map.flags[i] & (F_PIT | F_HOLE)) && y < map.floor[i] - 0.05) return false;
    if (y > map.ceil[i]) return false;
  }
  return true;
}

/** ¿Puede un enemigo pisar esta casilla? */
export function walkable(map: LevelMap, i: number): boolean {
  return (map.flags[i] & (F_SOLID | F_BLOCK | F_PIT | F_HOLE)) === 0;
}

// ---------------------------------------------------------------------------
// Consultas sobre todas las plantas (para el jugador)
// ---------------------------------------------------------------------------

/** ¿Cabe alguien con los pies a la altura y en esta casilla de esta planta? */
function passable(g: LevelMap, cx: number, cz: number, y: number, height: number): boolean {
  if (!inside(g, cx, cz)) return false;
  const i = cz * g.w + cx;
  const f = g.flags[i];
  if (f & (F_SOLID | F_BLOCK)) return false;
  if (f & F_PIT) return g.ceil[i] >= y + height;
  // hueco: es aire desde el forjado (guardado en floor) hasta el techo
  if (f & F_HOLE) return g.ceil[i] >= y + height && y >= g.floor[i] - 0.05;
  // en un pozo, por encima del forjado manda la planta de arriba (barandillas, etc.)
  if (f & F_SHAFT && y > g.slab[i] - 0.05) return false;
  if (cellTop(g, cx, cz) > y + STEP) return false;
  return g.ceil[i] >= Math.max(y, g.floor[i]) + height;
}

/** ¿Bloquea esta columna a alguien con los pies a la altura y? (en todas las plantas) */
export function blocksAll(map: LevelMap, cx: number, cz: number, y: number, height = PLAYER_HEIGHT): boolean {
  for (const g of map.storeys) if (passable(g, cx, cz, y, height)) return false;
  return true;
}

/** Suelo más alto que se puede pisar desde la altura y (cae por los huecos). */
export function floorUnder(map: LevelMap, x: number, z: number, y = Infinity): number {
  let best = -Infinity;
  for (const g of map.storeys) {
    const cx = cellOf(x);
    const cz = cellOf(z);
    if (!inside(g, cx, cz) || g.flags[cz * g.w + cx] & F_SOLID) continue;
    const f = floorAt(g, x, z);
    if (f <= y + STEP + 0.05 && f > best) best = f;
  }
  if (best === -Infinity && map.storeys.length === 1) return floorAt(map, x, z);
  return best;
}

/** Planta en la que está alguien con los pies a la altura y. */
export function gridAt(map: LevelMap, x: number, z: number, y = Infinity): LevelMap {
  if (map.storeys.length === 1) return map;
  let best: LevelMap | null = null;
  let bestF = -Infinity;
  for (const g of map.storeys) {
    const cx = cellOf(x);
    const cz = cellOf(z);
    if (!inside(g, cx, cz) || g.flags[cz * g.w + cx] & F_SOLID) continue;
    const f = floorAt(g, x, z);
    if (f <= y + STEP + 0.05 && f > bestF) {
      bestF = f;
      best = g;
    }
  }
  if (best) return best;
  let k = 0;
  for (const s of map.splits) if (y >= s) k++;
  return map.storeys[Math.min(k, map.storeys.length - 1)];
}

/** Techo encima de alguien con los pies a la altura y. */
export function ceilOver(map: LevelMap, x: number, z: number, y = Infinity): number {
  return ceilAt(gridAt(map, x, z, y), x, z);
}

export function isDarkAll(map: LevelMap, x: number, z: number, y = Infinity): boolean {
  return isDarkAt(gridAt(map, x, z, y), x, z);
}

/** Como collide, pero teniendo en cuenta todas las plantas. */
export function collideAll(map: LevelMap, x: number, z: number, y: number, r: number, height = PLAYER_HEIGHT) {
  const cx = cellOf(x);
  const cz = cellOf(z);
  for (let iter = 0; iter < 3; iter++) {
    for (let j = cz - 1; j <= cz + 1; j++) {
      for (let i = cx - 1; i <= cx + 1; i++) {
        if (!blocksAll(map, i, j, y, height)) continue;
        const x0 = i * CELL;
        const x1 = x0 + CELL;
        const z0 = j * CELL;
        const z1 = z0 + CELL;
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

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Distancias (en casillas) desde (tx, tz) por casillas transitables, sin
 * subir ni bajar escalones de más de STEP. Con `darkOnly`, solo por la
 * oscuridad (la casilla de origen cuenta aunque esté iluminada). -1 = no llega.
 */
export function distanceField(map: LevelMap, tx: number, tz: number, maxDist: number, darkOnly = false, dark = map.dark): Int16Array {
  const dist = new Int16Array(map.w * map.h).fill(-1);
  if (!inside(map, tx, tz)) return dist;
  const start = tz * map.w + tx;
  const queue = new Int32Array(map.w * map.h);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const idx = queue[head++];
    const d = dist[idx];
    if (d >= maxDist) continue;
    const cx = idx % map.w;
    const cz = (idx - cx) / map.w;
    const fy = map.floor[idx] + map.rampRise[idx] / 2;
    for (const [dx, dz] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
      const n = nz * map.w + nx;
      if (dist[n] !== -1 || !walkable(map, n)) continue;
      if (darkOnly && !dark[n]) continue;
      if (Math.abs(map.floor[n] + map.rampRise[n] / 2 - fy) > STEP) continue;
      dist[n] = d + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Constructor de niveles (coordenadas en metros)
// ---------------------------------------------------------------------------

export interface AreaOpts {
  floor?: number;
  ceil?: number;
  wall?: number; // material de las paredes que rodean la zona
  floorMat?: number;
  ceilMat?: number;
  lamps?: number | false; // separación entre fluorescentes (false = ninguno)
  dark?: boolean;
}

export class Builder {
  private grids: LevelMap[] = [];
  private cur = 0;
  private lampCandidates: Lamp[] = [];
  private itemCount = 0;
  private holes: { s: number; x: number; z: number; w: number; d: number }[] = [];

  constructor(
    level: number,
    def: LevelDef,
    wMeters: number,
    hMeters: number,
    private defaults: { ceil: number },
  ) {
    const w = Math.round(wMeters / CELL);
    const h = Math.round(hMeters / CELL);
    const n = w * h;
    const first: LevelMap = {
      level,
      def,
      w,
      h,
      flags: new Uint16Array(n).fill(F_SOLID),
      floor: new Float32Array(n),
      ceil: new Float32Array(n).fill(defaults.ceil),
      rampDir: new Int8Array(n).fill(-1),
      rampRise: new Float32Array(n),
      wallMat: new Uint8Array(n),
      floorMat: new Uint8Array(n),
      ceilMat: new Uint8Array(n),
      spawn: { x: 2, y: 0, z: 2 },
      items: [],
      crates: [],
      exits: [],
      lairs: [],
      lamps: [],
      props: [],
      glitches: [],
      vents: [],
      notes: [],
      doors: [],
      shifts: [],
      loops: [],
      npcs: [],
      zones: [],
      diags: [],
      windows: [],
      critters: [],
      wakes: [],
      shiftCell: new Int16Array(n).fill(-1),
      light: new Float32Array(n * 2),
      dark: new Uint8Array(n),
      slab: new Float32Array(n),
      storey: 0,
      storeys: [],
      splits: [],
    };
    first.storeys = [first];
    this.grids = [first];
  }

  /** La planta en la que se está construyendo. */
  get map(): LevelMap {
    return this.grids[this.cur];
  }

  /**
   * Pasa a construir en otra planta (la crea si no existe). Las plantas
   * comparten las listas de objetos; cada una tiene su rejilla.
   */
  storey(k: number, ceil = this.defaults.ceil): this {
    const first = this.grids[0];
    while (this.grids.length <= k) {
      const n = first.w * first.h;
      const g: LevelMap = {
        ...first,
        flags: new Uint16Array(n).fill(F_SOLID),
        floor: new Float32Array(n),
        ceil: new Float32Array(n).fill(ceil),
        rampDir: new Int8Array(n).fill(-1),
        rampRise: new Float32Array(n),
        wallMat: new Uint8Array(n),
        floorMat: new Uint8Array(n),
        ceilMat: new Uint8Array(n),
        shiftCell: new Int16Array(n).fill(-1),
        light: new Float32Array(n * 2),
        dark: new Uint8Array(n),
        slab: new Float32Array(n),
        storey: this.grids.length,
      };
      this.grids.push(g);
      first.storeys.push(g);
    }
    for (const g of this.grids) g.storeys = first.storeys;
    this.cur = k;
    return this;
  }

  private each(x: number, z: number, w: number, d: number, fn: (i: number, cx: number, cz: number) => void) {
    const m = this.map;
    const cx0 = Math.max(0, Math.round(x / CELL));
    const cz0 = Math.max(0, Math.round(z / CELL));
    const cx1 = Math.min(m.w, Math.round((x + w) / CELL));
    const cz1 = Math.min(m.h, Math.round((z + d) / CELL));
    for (let cz = cz0; cz < cz1; cz++) for (let cx = cx0; cx < cx1; cx++) fn(cz * m.w + cx, cx, cz);
  }

  /** Zona transitable (sala, pasillo). Pone fluorescentes salvo que se pida lo contrario. */
  open(x: number, z: number, w: number, d: number, o: AreaOpts = {}): this {
    const m = this.map;
    const floor = o.floor ?? 0;
    const ceil = o.ceil ?? floor + this.defaults.ceil;
    this.each(x, z, w, d, (i) => {
      m.flags[i] = (m.flags[i] & F_WET) | (o.dark ? F_NOLAMP : 0);
      m.floor[i] = floor;
      m.ceil[i] = ceil;
      m.rampDir[i] = -1;
      m.rampRise[i] = 0;
      if (o.floorMat !== undefined) m.floorMat[i] = o.floorMat;
      if (o.ceilMat !== undefined) m.ceilMat[i] = o.ceilMat;
    });
    if (o.wall !== undefined) this.wallMat(x - CELL, z - CELL, w + 2 * CELL, d + 2 * CELL, o.wall);
    const s = o.lamps ?? m.def.lampSpacing;
    if (s && !o.dark) {
      const nx = Math.max(1, Math.round(w / s));
      const nz = Math.max(1, Math.round(d / s));
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          const lx = x + ((a + 0.5) * w) / nx;
          const lz = z + ((b + 0.5) * d) / nz;
          const h = hash(m.level, Math.round(lx * 10), Math.round(lz * 10), this.cur);
          this.lampCandidates.push({ x: lx, y: ceil, z: lz, flicker: h < m.def.flickerChance, broken: false, s: this.cur });
        }
      }
    }
    return this;
  }

  /** Pared maciza (de suelo a techo). */
  solid(x: number, z: number, w: number, d: number, wall?: number): this {
    this.each(x, z, w, d, (i) => {
      this.map.flags[i] = F_SOLID;
      if (wall !== undefined) this.map.wallMat[i] = wall;
    });
    return this;
  }

  wallMat(x: number, z: number, w: number, d: number, mat: number): this {
    this.each(x, z, w, d, (i) => {
      if (this.map.flags[i] & F_SOLID) this.map.wallMat[i] = mat;
    });
    return this;
  }

  /** Zona sin fluorescentes (a oscuras). */
  dark(x: number, z: number, w: number, d: number): this {
    this.each(x, z, w, d, (i) => (this.map.flags[i] |= F_NOLAMP));
    return this;
  }

  /** Obstáculo (mueble, caja...) que no deja pasar. */
  block(x: number, z: number, w: number, d: number): this {
    this.each(x, z, w, d, (i) => (this.map.flags[i] |= F_BLOCK));
    return this;
  }

  /** Agujero sin fondo (caer es morir en el Nivel 0). */
  pit(x: number, z: number, w: number, d: number): this {
    this.each(x, z, w, d, (i) => (this.map.flags[i] = (this.map.flags[i] & ~F_SOLID) | F_PIT | F_NOLAMP));
    return this;
  }

  /**
   * Hueco en el suelo de esta planta: se cae a la planta de abajo (que tiene
   * que estar abierta debajo). También sirve de hueco de escalera.
   */
  hole(x: number, z: number, w: number, d: number): this {
    if (this.cur === 0) throw new Error('hole() solo en plantas superiores');
    this.each(x, z, w, d, (i) => (this.map.flags[i] = (this.map.flags[i] & ~F_SOLID) | F_HOLE | F_NOLAMP));
    this.holes.push({ s: this.cur, x, z, w, d });
    return this;
  }

  wet(x: number, z: number, w: number, d: number): this {
    this.each(x, z, w, d, (i) => (this.map.flags[i] |= F_WET));
    return this;
  }

  /**
   * Rampa o escalera de y0 a y1 que sube en la dirección dir
   * (0 = +x, 1 = -x, 2 = +z, 3 = -z).
   */
  ramp(x: number, z: number, w: number, d: number, dir: 0 | 1 | 2 | 3, y0: number, y1: number, stairs = false, ceil?: number): this {
    const m = this.map;
    const along = dir < 2 ? Math.round(w / CELL) : Math.round(d / CELL);
    const rise = (y1 - y0) / along;
    const top = Math.max(y0, y1);
    this.each(x, z, w, d, (i, cx, cz) => {
      const k = dir === 0 ? cx - Math.round(x / CELL) : dir === 1 ? Math.round((x + w) / CELL) - 1 - cx : dir === 2 ? cz - Math.round(z / CELL) : Math.round((z + d) / CELL) - 1 - cz;
      m.flags[i] = (stairs ? F_STAIRS : 0) | (m.flags[i] & F_NOLAMP);
      m.floor[i] = y0 + k * rise;
      m.rampDir[i] = dir;
      m.rampRise[i] = rise;
      m.ceil[i] = Math.max(ceil ?? top + this.defaults.ceil, m.floor[i] + PLAYER_HEIGHT + 0.3);
    });
    return this;
  }

  lamp(x: number, z: number, opts: { flicker?: boolean; broken?: boolean; y?: number } = {}): this {
    this.lampCandidates.push({ x, y: opts.y ?? NaN, z, flicker: !!opts.flicker, broken: !!opts.broken, forced: true, s: this.cur });
    return this;
  }

  /** Donde se aparece al entrar al nivel; ry = hacia dónde se mira (como las puertas). */
  spawn(x: number, z: number, ry?: number): this {
    const sp = { x, y: NaN, z, s: this.cur, ry: ry === undefined ? undefined : ry + Math.PI };
    this.grids[0].spawn = sp;
    return this;
  }

  /** Mueble u objeto decorativo. `solid` = tamaño del hueco que bloquea. */
  prop(type: string, x: number, z: number, ry = 0, o: { solid?: [number, number]; y?: number; w?: number; d?: number; h?: number; text?: string } = {}): this {
    this.map.props.push({ type, x, y: o.y ?? NaN, z, ry, w: o.w, d: o.d, h: o.h, text: o.text, s: this.cur });
    if (o.solid) {
      const [sw, sd] = Math.abs(Math.sin(ry)) > 0.7 ? [o.solid[1], o.solid[0]] : o.solid;
      this.block(x - sw / 2, z - sd / 2, sw, sd);
    }
    return this;
  }

  item(kind: ItemKind, x: number, z: number): this {
    this.map.items.push({ key: `${this.map.level}:i${this.itemCount++}`, kind, x, y: NaN, z, s: this.cur });
    return this;
  }

  crate(x: number, z: number, ry: number, pool: Crate['pool'] = 'mixto', shelf = false): this {
    this.map.crates.push({ key: `${this.map.level}:c${this.map.crates.length}`, x, y: NaN, z, ry, pool, shelf, s: this.cur });
    return shelf ? this : this.block(x - 0.45, z - 0.45, 0.9, 0.9);
  }

  /** Nota legible. */
  note(x: number, z: number, ry: number, title: string, text: string, wall = true, y?: number): this {
    this.map.notes.push({ key: `${this.map.level}:n${this.map.notes.length}`, x, y: NaN, z, ry, title, text, wall, h: y ?? (wall ? 1.45 : 0.01), s: this.cur });
    return this;
  }

  /** Puerta. Si `to` existe, al cruzarla se aparece allí. */
  door(x: number, z: number, ry: number, o: Partial<Omit<Door, 'key' | 'x' | 'y' | 'z' | 'ry'>> = {}): this {
    this.map.doors.push({ key: `${this.map.level}:d${this.map.doors.length}`, x, y: NaN, z, ry, look: 'steel', locked: !o.to, ...o, s: this.cur });
    return this;
  }

  /** Bloque que aparece y desaparece cuando nadie lo mira ("cambio periférico"). */
  shift(x: number, z: number, w: number, d: number, closed: boolean, wall = 0, pairWithPrevious = false): this {
    const id = this.map.shifts.length;
    this.map.shifts.push({ id, x, z, w, d, closed, wall, s: this.cur });
    if (pairWithPrevious && id > 0) {
      this.map.shifts[id].pair = id - 1;
      this.map.shifts[id - 1].pair = id;
    }
    return this;
  }

  loop(l: Loop): this {
    this.map.loops.push({ ...l, s: this.cur });
    return this;
  }

  npc(n: Npc): this {
    this.map.npcs.push({ ...n, s: this.cur });
    return this.block(n.x - 0.25, n.z - 0.25, 0.5, 0.5);
  }

  zone(kind: Zone['kind'], x: number, z: number, w: number, d: number): this {
    this.map.zones.push({ kind, x, z, w, d });
    return this;
  }

  /** Zona roja: suelo y paredes que viran al rojo. */
  red(x: number, z: number, w: number, d: number): this {
    this.each(x, z, w, d, (i) => (this.map.flags[i] |= F_RED));
    return this;
  }

  /** Suelo hundido con fluido hasta los tobillos. */
  deep(x: number, z: number, w: number, d: number, drop = 0.15): this {
    this.each(x, z, w, d, (i) => {
      if (this.map.flags[i] & (F_SOLID | F_PIT)) return;
      this.map.flags[i] |= F_DEEP;
      this.map.floor[i] -= drop;
    });
    return this;
  }

  /**
   * Hueco en una pared con forma de arco: casillas abiertas con el techo más
   * bajo y una moldura curva encima.
   */
  arch(x: number, z: number, w: number, d: number, top = 2.2, ry = 0): this {
    const m = this.map;
    this.each(x, z, w, d, (i) => {
      m.flags[i] &= ~F_SOLID;
      m.ceil[i] = m.floor[i] + top;
    });
    return this.prop('arch', x + w / 2, z + d / 2, ry, { w: Math.max(w, d), h: top });
  }

  /** Panel diagonal que corta una esquina (los túneles giran a 45°). */
  diag(x: number, z: number, ry: number, w: number, wall = 0): this {
    const m = this.map;
    m.diags.push({ x, z, ry, w, wall, s: this.cur });
    // lo que queda detrás del panel no se puede pisar
    const nx = -Math.sin(ry);
    const nz = -Math.cos(ry);
    for (let t = -w / 2; t <= w / 2; t += CELL / 2) {
      for (let k = 0.1; k < w / 2; k += CELL / 2) {
        const px = x + Math.cos(ry) * t + nx * k;
        const pz = z - Math.sin(ry) * t + nz * k;
        const i = cellOf(pz) * m.w + cellOf(px);
        if (i >= 0 && i < m.flags.length && !(m.flags[i] & F_SOLID)) m.flags[i] |= F_BLOCK;
      }
    }
    return this;
  }

  window(x: number, z: number, ry: number): this {
    this.map.windows.push({ x, y: NaN, z, ry, s: this.cur });
    return this;
  }

  /** Sitio donde se despierta tras caer al vacío. */
  wake(x: number, z: number): this {
    this.map.wakes.push({ x, z, s: this.cur });
    return this;
  }

  critter(kind: 'moth' | 'rat', x: number, z: number): this {
    this.map.critters.push({ kind, x, z, s: this.cur });
    return this;
  }

  /**
   * Salida. Con `walk`, basta con llegar (p. ej. al final de una escalera que
   * baja); si no, es una puerta contra una pared que se abre con E.
   */
  exit(x: number, z: number, ry: number, label = 'SALIDA', walk = false): this {
    this.map.exits.push({ x, y: NaN, z, ry, label, walk, s: this.cur });
    return this;
  }

  lair(kind: EntityKind, x: number, z: number, lines?: string[]): this {
    this.map.lairs.push({ kind, x, z, lines, s: this.cur });
    return this;
  }

  /** Pasillo que une puntos alineados en ejes, con el ancho dado. */
  corridor(points: [number, number][], width: number, o: AreaOpts = {}): this {
    const hw = width / 2;
    for (let k = 1; k < points.length; k++) {
      const [ax, az] = points[k - 1];
      const [bx, bz] = points[k];
      const x0 = Math.min(ax, bx) - hw;
      const z0 = Math.min(az, bz) - hw;
      this.open(x0, z0, Math.abs(bx - ax) + width, Math.abs(bz - az) + width, o);
    }
    return this;
  }

  vent(x: number, z: number, period = 7): this {
    const n = this.map.vents.length;
    this.map.vents.push({ x, y: NaN, z, period, phase: hash(this.map.level, n, 61) * period, s: this.cur });
    return this;
  }

  build(): LevelMap {
    const grids = this.grids;
    const m = grids[0];
    // suelo más bajo de cada planta (sus forjados empiezan por debajo)
    const baseOf = grids.map((g) => {
      let lo = Infinity;
      for (let i = 0; i < g.flags.length; i++) if (!(g.flags[i] & (F_SOLID | F_HOLE | F_PIT))) lo = Math.min(lo, g.floor[i]);
      return lo;
    });
    // huecos: la planta de abajo ve el techo de la de arriba (es un pozo)
    for (const h of this.holes) {
      this.cur = h.s;
      const below = grids[h.s - 1];
      this.each(h.x, h.z, h.w, h.d, (i) => {
        const up = grids[h.s];
        // (si después se abrió suelo encima, ya no es hueco)
        if (below.flags[i] & F_SOLID || !(up.flags[i] & F_HOLE)) return;
        // el forjado empieza en el techo de abajo (o un poco por debajo del suelo de arriba)
        // (cada zona de la planta puede tener su altura: se usa la del suelo abierto antes del hueco)
        const upFloor = up.floor[i] > below.floor[i] ? up.floor[i] : baseOf[h.s];
        const slab = Math.min(below.flags[i] & F_SHAFT ? below.slab[i] : below.ceil[i], upFloor - 0.25);
        below.flags[i] |= F_SHAFT;
        below.slab[i] = slab;
        below.ceil[i] = up.ceil[i];
        up.floor[i] = slab; // el hueco va del forjado hacia arriba
      });
    }
    // dónde empieza cada planta superior (para elegir su mapa de luz)
    m.splits = [];
    for (let k = 1; k < grids.length; k++) m.splits.push(Number.isFinite(baseOf[k]) ? baseOf[k] - 1.2 : 1e9);
    for (const g of grids) g.splits = m.splits;

    const fix = (o: { x: number; y: number; z: number; ry?: number; s?: number }) => {
      if (!Number.isNaN(o.y)) return;
      const g = grids[o.s ?? 0] ?? m;
      // lo que está pegado a una pared toma la altura del suelo de delante
      let x = o.x;
      let z = o.z;
      if (flagsAt(g, cellOf(x), cellOf(z)) & F_SOLID && o.ry !== undefined) {
        x += Math.sin(o.ry) * 0.4;
        z += Math.cos(o.ry) * 0.4;
      }
      const y = floorAt(g, x, z);
      o.y = Number.isFinite(y) ? y : 0;
    };
    fix(m.spawn as { x: number; y: number; z: number; s?: number });
    for (const list of [m.items, m.crates, m.exits, m.props, m.vents, m.doors, m.notes, m.windows] as { x: number; y: number; z: number }[][]) list.forEach(fix);
    // (las zonas que se solapan dejan fluorescentes repetidos: se quedan los últimos)
    const taken = new Map<number, Lamp[]>();
    const key = (s: number, bx: number, bz: number) => (s * 4096 + bz) * 4096 + bx;
    for (let k = this.lampCandidates.length - 1; k >= 0; k--) {
      const l = this.lampCandidates[k];
      if (l.forced) continue;
      const bx = Math.floor(l.x / 1.5);
      const bz = Math.floor(l.z / 1.5);
      let dup = false;
      for (let j = -1; j <= 1 && !dup; j++) {
        for (let i = -1; i <= 1 && !dup; i++) dup = !!taken.get(key(l.s ?? 0, bx + i, bz + j))?.some((o) => Math.hypot(o.x - l.x, o.z - l.z) < 1.5);
      }
      if (dup) {
        this.lampCandidates.splice(k, 1);
        continue;
      }
      const kk = key(l.s ?? 0, bx, bz);
      taken.set(kk, [...(taken.get(kk) ?? []), l]);
    }
    for (const l of this.lampCandidates) {
      const g = grids[l.s ?? 0];
      const cx = cellOf(l.x);
      const cz = cellOf(l.z);
      const f = flagsAt(g, cx, cz);
      if (f & (F_SOLID | F_PIT | F_HOLE)) continue;
      if (f & F_NOLAMP && !l.forced) continue;
      if (Number.isNaN(l.y)) l.y = g.ceil[cz * g.w + cx];
      else if (!l.forced) l.y = g.ceil[cz * g.w + cx];
      m.lamps.push(l);
    }
    // bloques de cambio periférico: casillas abiertas en la geometría fija
    for (const sh of m.shifts) {
      this.cur = sh.s ?? 0;
      this.each(sh.x, sh.z, sh.w, sh.d, (i) => {
        const g = this.map;
        g.shiftCell[i] = sh.id;
        g.flags[i] &= ~F_SOLID;
      });
    }
    for (const g of grids) bakeLight(g);
    for (const sh of m.shifts) setShift(m, sh.id, sh.closed);
    for (const g of grids) {
      for (let i = 0; i < g.w * g.h; i++) {
        if (g.flags[i] & F_SOLID) continue;
        if (g.light[i * 2] + g.light[i * 2 + 1] < 0.12) g.dark[i] = 1;
      }
    }
    this.cur = 0;
    return m;
  }
}

/** Luz de los fluorescentes con sombras de las paredes (en 2D). */
function bakeLight(m: LevelMap) {
  const r = m.def.lampRadius;
  const rc = Math.ceil(r / CELL);
  for (const lamp of m.lamps) {
    if (lamp.broken || (lamp.s ?? 0) !== m.storey) continue;
    const lx = cellOf(lamp.x);
    const lz = cellOf(lamp.z);
    for (let j = Math.max(0, lz - rc); j <= Math.min(m.h - 1, lz + rc); j++) {
      for (let i = Math.max(0, lx - rc); i <= Math.min(m.w - 1, lx + rc); i++) {
        const x = center(i);
        const z = center(j);
        const d = Math.hypot(x - lamp.x, z - lamp.z);
        if (d >= r) continue;
        const idx = j * m.w + i;
        if (m.flags[idx] & F_SOLID) continue;
        // la luz no cruza paredes ni llega a suelos tapados
        if (!lineOfSight(m, lamp.x, lamp.y - 0.1, lamp.z, x, Math.max(m.floor[idx], lamp.y - 3) + 0.1, z)) continue;
        const f = 1 - d / r;
        m.light[idx * 2 + (lamp.flicker ? 1 : 0)] += m.def.lampPower * f * f * (1.6 - 0.6 * f);
      }
    }
  }
  // las casillas de pared copian la luz de sus vecinas libres; si no, el
  // filtrado de la textura oscurecería el suelo y el techo junto a ellas
  for (let pass = 0; pass < 2; pass++) {
    const src = m.light.slice();
    for (let j = 1; j < m.h - 1; j++) {
      for (let i = 1; i < m.w - 1; i++) {
        const idx = j * m.w + i;
        if (!(m.flags[idx] & (F_SOLID | F_PIT | F_HOLE))) continue;
        for (const ch of [0, 1]) {
          let best = src[idx * 2 + ch];
          for (const [dx, dz] of NEIGHBORS) best = Math.max(best, src[((j + dz) * m.w + i + dx) * 2 + ch] * 0.92);
          m.light[idx * 2 + ch] = best;
        }
      }
    }
  }
}

/** Abre o cierra un bloque de cambio periférico. */
export function setShift(map: LevelMap, id: number, closed: boolean) {
  const sh = map.shifts[id];
  if (!sh) return;
  sh.closed = closed;
  const g = map.storeys[sh.s ?? 0] ?? map;
  for (let i = 0; i < g.shiftCell.length; i++) {
    if (g.shiftCell[i] !== id) continue;
    if (closed) g.flags[i] |= F_SOLID;
    else g.flags[i] &= ~F_SOLID;
  }
}

/** ¿Está el punto dentro de alguna zona de ese tipo? */
export function inZone(map: LevelMap, kind: Zone['kind'], x: number, z: number): boolean {
  return map.zones.some((zn) => zn.kind === kind && x >= zn.x && x <= zn.x + zn.w && z >= zn.z && z <= zn.z + zn.d);
}
