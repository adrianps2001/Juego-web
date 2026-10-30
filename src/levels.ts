// Diseño de los niveles, basado en la Backrooms Wiki (backrooms-wiki.wikidot.com,
// CC BY-SA 3.0). Coordenadas en metros: x hacia la derecha, z hacia abajo
// (sur). Orientación de objetos y puertas (ry): 0 mira al sur (+z), PI al
// norte (-z), PI/2 al este (+x), -PI/2 al oeste (-x).
//
// Materiales de pared/suelo/techo: el número elige la variante de textura del
// tema del nivel (ver textures.ts).

import { L0_DECOR, L0_ENDS, L1_DECOR, L1_ENDS, L2_DECOR, L2_ENDS } from './decor';
import { FACE, OPP, between, makeRng, maze, pick, take, wallSpots, type Block, type Maze, type Port, type Rng, type Style } from './maze';
import { Builder, F_PIT, F_SOLID, cellOf, flagsAt, type EntityKind, type ItemKind, type LevelDef, type LevelMap } from './world';


export const LEVELS: LevelDef[] = [
  {
    name: 'Nivel 0',
    title: 'El Umbral',
    theme: 'lobby',
    lampSpacing: 3,
    lampRadius: 6.5,
    lampPower: 0.85,
    flickerChance: 0.1,
    ambient: 0.025,
    tint: [1, 0.95, 0.78],
    sanityDrain: 0.25,
    staminaRegen: 1,
    fog: { color: 0x3a3218, near: 4, far: 28 },
    blackouts: false,
    isolation: true,
  },
  {
    name: 'Nivel 1',
    title: 'La Zona Habitable',
    theme: 'habitable',
    lampSpacing: 7,
    lampRadius: 10,
    lampPower: 0.8,
    flickerChance: 0.15,
    ambient: 0.02,
    tint: [0.85, 0.93, 1],
    sanityDrain: 0.3,
    staminaRegen: 1,
    fog: { color: 0x121518, near: 3, far: 28 },
    blackouts: true,
  },
  {
    name: 'Nivel 2',
    title: 'Pipe Dreams',
    theme: 'pipes',
    lampSpacing: 6,
    lampRadius: 5.5,
    lampPower: 0.65,
    flickerChance: 0.5,
    ambient: 0.02,
    tint: [1, 0.62, 0.36],
    sanityDrain: 0.45,
    staminaRegen: 0.6,
    fog: { color: 0x150b06, near: 1, far: 22 },
    blackouts: false,
    circuits: true,
  },
];

/** Nivel especial: el jugador ha salido de estos tres niveles. */
export const ESCAPED = LEVELS.length;

// ===========================================================================
// Cómo se construyen ahora los niveles
// Cada nivel es un laberinto de bloques (ver maze.ts): salas pequeñas,
// pasillos de anchos distintos que se tuercen, callejones sin salida y
// varios caminos. Hay dos plantas de laberinto, una encima de la otra,
// unidas por escaleras, suelos rotos y puertas que dan a una sala sin suelo
// (se cae a la sala de abajo, que es de doble altura). Las salas míticas y los
// sitios del lore son piezas hechas a mano encajadas en el laberinto.
// ===========================================================================

interface BRect {
  x: number;
  z: number;
  w: number;
  h: number;
}

/** Escalera de una planta a la de arriba en 2 × 1 bloques (sube al este o al oeste). */
interface Stair {
  x: number;
  z: number;
  up: 0 | 1;
}

const sq = (r: BRect, B: number) => ({ X: r.x * B, Z: r.z * B, W: r.w * B, D: r.h * B });

function stairwell(b: Builder, B: number, st: Stair, f0: number, f1: number, wall: number): { p0: Port; p1: Port } {
  const X = st.x * B;
  const L = 2 * B;
  const zc = st.z * B + B / 2;
  const land = 1.2;
  const top = 0.4;
  const run = L - land - top;
  const c = 2.6;
  b.storey(0);
  if (st.up === 0) {
    b.open(X, zc - 0.8, land, 1.6, { floor: f0, ceil: f0 + c, wall, lamps: false }).lamp(X + 0.6, zc, { flicker: true });
    b.ramp(X + land, zc - 0.8, run, 1.6, 0, f0, f1, true, f1 + c);
    b.storey(1);
    b.open(X + land, zc - 0.8, run + top, 1.6, { floor: f1, ceil: f1 + c, wall, lamps: false }).hole(X + land, zc - 0.8, run, 1.6);
    b.lamp(X + L - 0.2, zc);
  } else {
    b.open(X + L - land, zc - 0.8, land, 1.6, { floor: f0, ceil: f0 + c, wall, lamps: false }).lamp(X + L - 0.6, zc, { flicker: true });
    b.ramp(X + top, zc - 0.8, run, 1.6, 1, f0, f1, true, f1 + c);
    b.storey(1);
    b.open(X, zc - 0.8, run + top, 1.6, { floor: f1, ceil: f1 + c, wall, lamps: false }).hole(X + top, zc - 0.8, run, 1.6);
    b.lamp(X + 0.2, zc);
  }
  b.storey(0);
  const e = st.up === 0;
  return {
    p0: { bx: e ? st.x - 1 : st.x + 2, bz: st.z, dir: e ? 0 : 1, p: zc, w: 1.6 },
    p1: { bx: e ? st.x + 2 : st.x - 1, bz: st.z, dir: e ? 1 : 0, p: zc, w: 1.6 },
  };
}

/** Pozo con balcón: abajo, un anillo alrededor del pozo; arriba, un balcón con barandilla. */
function shaftRoom(b: Builder, B: number, r: BRect, f1: number, o: { wall: number; abyss?: boolean; floorMat?: number; c1?: number }) {
  const { X, Z, W, D } = sq(r, B);
  const pad = 3;
  b.storey(0);
  b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { ceil: 3, wall: o.wall, floorMat: o.floorMat, lamps: false });
  for (const [x, z] of [[X + 1.4, Z + 1.4], [X + W - 1.4, Z + 1.4], [X + 1.4, Z + D - 1.4], [X + W - 1.4, Z + D - 1.4]]) b.lamp(x, z, { flicker: x > X + W / 2 });
  if (o.abyss) {
    b.pit(X + pad, Z + pad, W - 2 * pad, D - 2 * pad).zone('abyss', X + pad, Z + pad, W - 2 * pad, D - 2 * pad);
  }
  b.storey(1);
  b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { floor: f1, ceil: f1 + (o.c1 ?? 3), wall: o.wall, floorMat: o.floorMat, lamps: false });
  const h = pad - 0.5;
  b.hole(X + h, Z + h, W - 2 * h, D - 2 * h);
  const inner = W - 2 * h;
  b.prop('railing', X + W / 2, Z + h - 0.05, Math.PI, { w: inner });
  b.prop('railing', X + h - 0.05, Z + D / 2, -Math.PI / 2, { w: inner });
  b.prop('railing', X + W - h + 0.05, Z + D / 2, Math.PI / 2, { w: inner });
  // la barandilla de este lado está rota
  b.prop('railing', X + h + inner * 0.2, Z + D - h + 0.05, 0, { w: inner * 0.4 });
  for (const [x, z] of [[X + 1.2, Z + 1.2], [X + W - 1.2, Z + D - 1.2]]) b.lamp(x, z, { flicker: true });
  b.storey(0);
}

/** Abre un pasito desde el borde de una pieza hacia dentro, donde llega cada puerta del laberinto. */
function stubs(b: Builder, B: number, ports: Port[], depth: number, o: { floor?: number; ceil?: number } = {}) {
  for (const p of ports) {
    const w = p.w ?? 1.6;
    const lat = p.p ?? 0;
    // el borde está al otro lado del bloque del laberinto
    const ex = (p.bx + (p.dir === 0 ? 1 : 0)) * B;
    const ez = (p.bz + (p.dir === 2 ? 1 : 0)) * B;
    if (p.dir === 0) b.open(ex, lat - w / 2, depth, w, o);
    else if (p.dir === 1) b.open(ex - depth, lat - w / 2, depth, w, o);
    else if (p.dir === 2) b.open(lat - w / 2, ez, w, depth, o);
    else b.open(lat - w / 2, ez - depth, w, depth, o);
  }
}

const mid = (blk: Block) => ({ x: blk.area.x + blk.area.w / 2, z: blk.area.z + blk.area.d / 2 });

/** Bloques donde se puede poner algo en el suelo (sin huecos). */
const solidGround = (m: Maze) => m.list.filter((k) => k.kind === 'hall' || k.kind === 'room');

/** Elige qué salas de abajo tendrán encima un suelo roto o una sala sin suelo. */
function vertical(b: Builder, R: Rng, m0: Maze, reserved1: BRect[], drops: number, broken: number, anyBroken: boolean) {
  const force = new Map<string, Block['kind']>();
  const free = (k: Block) => !reserved1.some((r) => k.bx >= r.x && k.bx < r.x + r.w && k.bz >= r.z && k.bz < r.z + r.h);
  const g = b.map;
  const clearCenter = (k: Block) => {
    const c = { x: k.x + m0.o.B / 2, z: k.z + m0.o.B / 2 };
    for (let dz = -0.75; dz <= 0.75; dz += 0.5) for (let dx = -0.75; dx <= 0.75; dx += 0.5) if (flagsAt(g, cellOf(c.x + dx), cellOf(c.z + dz)) & (F_SOLID | F_PIT)) return false;
    return true;
  };
  const rooms = m0.list.filter((k) => k.kind === 'room' && k.group < 0 && free(k) && clearCenter(k));
  const d = take(R, rooms, drops);
  for (const k of d) force.set(`${k.bx},${k.bz}`, 'drop');
  const rest = (anyBroken ? m0.list : rooms).filter((k) => !d.includes(k) && free(k) && clearCenter(k) && k.kind !== 'drop');
  for (const k of take(R, rest, broken)) force.set(`${k.bx},${k.bz}`, 'broken');
  return force;
}

function scatterItems(b: Builder, R: Rng, mazes: Maze[], kinds: ItemKind[], n: number) {
  const spots = mazes.flatMap((m) => [...m.ends, ...take(R, m.rooms, 30)].map((k) => ({ k, s: m.o.storey })));
  for (const { k, s } of take(R, spots, n)) {
    if (k.kind !== 'hall' && k.kind !== 'room') continue;
    const c = mid(k);
    b.storey(s);
    b.item(pick(R, kinds), c.x + between(R, -0.4, 0.4), c.z + between(R, -0.4, 0.4));
  }
  b.storey(0);
}

function scatterLairs(b: Builder, R: Rng, mazes: Maze[], start: Block, list: [EntityKind, string[]?][]) {
  const near = mazes[0].dist(start);
  const spots = mazes.flatMap((m) => solidGround(m).filter((k) => m.o.storey > 0 || (near.get(k) ?? 99) > 8).map((k) => ({ k, s: m.o.storey })));
  for (const [kind, lines] of list) {
    const { k, s } = pick(R, spots);
    const c = mid(k);
    b.storey(s);
    b.lair(kind, c.x, c.z, lines);
  }
  b.storey(0);
}

function wakes(b: Builder, R: Rng, mazes: Maze[], n: number) {
  for (const m of mazes) {
    for (const k of take(R, solidGround(m), n)) {
      const c = mid(k);
      b.storey(m.o.storey);
      b.wake(c.x, c.z);
    }
  }
  b.storey(0);
}

const ports = (list: [number, number, number, number?, number?][]): Port[] => list.map(([bx, bz, dir, p, w]) => ({ bx, bz, dir, p, w }));

// direcciones del laberinto: este, oeste, sur, norte
const DE = 0;
const DW = 1;
const DS = 2;
const DN = 3;

// ===========================================================================
// NIVEL 0 — «El Umbral»
// Un laberinto de papel amarillo, moqueta húmeda y fluorescentes, de dos
// plantas. Salas pequeñas, pasillos que se tuercen, sitios que no llevan a
// ningún lado y paredes que cambian cuando nadie mira. Piezas:
//  - Sala de columnas (la única sala grande).
//  - Sala de los agujeros, con una pasarela en cruz por encima.
//  - La caída infinita: un pozo con pisos y pisos hacia abajo.
//  - El pasillo largo, que se apaga al fondo.
//  - La sala altísima con la escalera que acaba en la pared.
//  - Las Habitaciones Rojas.
//  - La puerta de MANTENIMIENTO y la escalera que baja al Nivel 1.
// Zonas con otro aire: arcos (al oeste), oficinas (al noreste), apagón (al sureste).
// Paredes: 0 amarillo · 1 pálido · 2 oficina · 3 yeso rugoso · 4 rojo despegado
// Suelos: 0 moqueta · 1 linóleo · 2 moqueta seca · 3 moqueta roja
// ===========================================================================

const L0_YELLOW: Style = {
  wall: [0],
  floorMat: [0, 0, 2],
  ceilMat: [0],
  room: [2.6, 3.0],
  hall: [2.45, 2.8],
  widths: [1.2, 1.4, 1.6, 2, 2, 2.5, 3],
  doors: [0.9, 1.1, 1.4, 1.8],
  rooms: 0.45,
  merge: 0.28,
  dark: 0.08,
  lamp: 0.75,
  flicker: 0.12,
  steps: [0, 0, 0, 0, 0.25, -0.25],
  wet: 0.15,
  straight: 0.45,
  decor: L0_DECOR,
  ends: L0_ENDS,
};
const L0_ARCHES: Style = { ...L0_YELLOW, wall: [1], floorMat: [0], rooms: 0.55, arches: true, wet: 0.7, deep: 0.4, dark: 0.04 };
const L0_OFFICE: Style = { ...L0_YELLOW, wall: [2], floorMat: [1], ceilMat: [0, 1], rooms: 0.7, merge: 0.45, widths: [1.4, 1.6, 2], decor: [...L0_DECOR.slice(3, 7), ...L0_DECOR.slice(3, 7), ...L0_DECOR] };
const L0_BLACKOUT: Style = { ...L0_YELLOW, wall: [3], rooms: 0.3, dark: 0.85, lamp: 0.15, deep: 0.55, wet: 0.5 };
const L0_UPPER: Style = { ...L0_YELLOW, wall: [0, 0, 1], floorMat: [0, 2], room: [2.4, 2.9], hall: [2.3, 2.7], dark: 0.2, rooms: 0.4, steps: [0, 0, 0.25] };

function level0(): LevelMap {
  const B = 4;
  const NX = 36;
  const NZ = 28;
  const F1 = 3.8;
  const b = new Builder(0, LEVELS[0], NX * B, NZ * B, { ceil: 2.8 });
  b.storey(1, 6.6).storey(0);
  const R = makeRng(1009);
  // lo que cambia en cada partida (objetos y criaturas)
  const C = makeRng((1009 * 7919) ^ session);

  const PILLARS = { x: 6, z: 1, w: 6, h: 4 };
  const PITS = { x: 18, z: 8, w: 4, h: 4 };
  const ABYSS = { x: 13, z: 13, w: 3, h: 3 };
  const HALL = { x: 2, z: 18, w: 16, h: 1 };
  const TALL = { x: 2, z: 22, w: 3, h: 3 };
  const RED = { x: 10, z: 21, w: 8, h: 5 };
  const EXIT = { x: 30, z: 12, w: 3, h: 2 };
  const STAIRS: Stair[] = [
    { x: 4, z: 6, up: 0 },
    { x: 15, z: 8, up: 1 },
    { x: 26, z: 4, up: 0 },
    { x: 24, z: 17, up: 1 },
    { x: 8, z: 14, up: 0 },
    { x: 31, z: 22, up: 1 },
    { x: 20, z: 25, up: 0 },
    { x: 32, z: 1, up: 1 },
  ];

  const p0: Port[] = [];
  const p1: Port[] = [];

  // ---- sala de columnas (la única sala grande) ----
  {
    const { X, Z, W, D } = sq(PILLARS, B);
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { ceil: 3.2, floorMat: 2, lamps: 3.5 });
    for (let x = X + 2.5; x < X + W - 1; x += 3) {
      for (let z = Z + 2.5; z < Z + D - 1; z += 3) {
        const off = Math.round(x * 7 + z * 3) % 5 === 0 ? 0.5 : 0;
        b.solid(x - 0.25 + off, z - 0.25, 0.5, 0.5);
      }
    }
    b.shift(X + 9.25, Z + 7.25, 1, 1, false).shift(X + 12.25, Z + 10.25, 1, 1, true, 0, true);
    b.item('agua', X + 4, Z + 13).item('barrita', X + 20, Z + 3);
    b.lair('figure', X + 21, Z + 13);
    b.prop('text', X + 0.55, Z + 13, Math.PI / 2, { y: 1.6, text: 'LAS COLUMNAS SE MUEVEN', w: 3 });
    p0.push(...ports([[5, 2, DE], [12, 3, DW], [8, 5, DN], [10, 5, DN], [9, 0, DS]]));
  }

  // ---- sala de los agujeros, con una pasarela en cruz por encima ----
  {
    const { X, Z, W, D } = sq(PITS, B);
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { ceil: 3.2, floorMat: 2, lamps: 4 });
    for (const dx of [2.5, 6.5, 13.5]) for (const dz of [2.5, 6.5, 13.5]) b.pit(X + dx - 0.8, Z + dz - 0.8, 1.6, 1.6);
    b.prop('text', X + 0.55, Z + 4, Math.PI / 2, { y: 1.6, text: 'NO MIRES ABAJO', w: 2.4 });
    b.storey(1);
    const up = { floor: F1, ceil: F1 + 2.8, lamps: false as const, wall: 0 };
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, up).hole(X + 0.25, Z + 0.25, W - 0.5, D - 0.5);
    b.open(X + 0.25, Z + 5, W - 0.5, 2, { ...up, lamps: 4 }).open(X + 5, Z + 0.25, 2, D - 0.5, { ...up, lamps: 4 });
    for (const [x, z, r, w] of [[X + 2.6, Z + 4.95, Math.PI, 4.7], [X + 11.5, Z + 4.95, Math.PI, 8.5], [X + 2.6, Z + 7.05, 0, 4.7], [X + 11.5, Z + 7.05, 0, 8.5], [X + 4.95, Z + 2.6, -Math.PI / 2, 4.7], [X + 7.05, Z + 2.6, Math.PI / 2, 4.7], [X + 4.95, Z + 11.5, -Math.PI / 2, 8.5]] as const) {
      b.prop('railing', x, z, r, { w });
    }
    b.storey(0);
    p0.push(...ports([[17, 10, DE], [22, 10, DW], [20, 7, DS], [20, 12, DN]]));
    p1.push(...ports([[17, 9, DE], [22, 9, DW], [19, 7, DS], [19, 12, DN]]));
  }

  // ---- la caída infinita ----
  {
    const { X, Z } = sq(ABYSS, B);
    shaftRoom(b, B, ABYSS, F1, { wall: 0, abyss: true });
    b.prop('text', X + 0.55, Z + 9.5, Math.PI / 2, { y: 1.7, text: 'NO TE ASOMES', w: 2.2 });
    b.note(X + 11.95, Z + 1.5, -Math.PI / 2, 'Nota temblorosa', 'Me asomé. Se ven pisos y pisos hacia abajo, todos iguales, todos con la luz encendida.\n\nEn uno de ellos había alguien mirando hacia arriba.');
    b.storey(1);
    b.prop('text', X + 0.55, Z + 9.5, Math.PI / 2, { y: F1 + 1.6, text: 'NO SALTES', w: 1.8 });
    b.storey(0);
    p0.push(...ports([[12, 14, DE], [16, 14, DW], [14, 12, DS], [14, 16, DN]]));
    p1.push(...ports([[12, 14, DE], [14, 12, DS]]));
  }

  // ---- el pasillo largo (se apaga al fondo) ----
  {
    const { X, Z, W } = sq(HALL, B);
    b.open(X, Z + 1, W, 2, { ceil: 2.6, wall: 0, floorMat: 2, lamps: false });
    for (let k = 0, x = X + 2; x < X + W - 10; x += 4, k++) b.lamp(x, Z + 2, { flicker: k % 5 === 3, broken: k % 7 === 6 });
    b.dark(X + W - 10, Z + 1, 10, 2);
    const side = ports([[5, 17, DS], [11, 17, DS], [8, 19, DN], [15, 19, DN]]);
    stubs(b, B, side, 1, { ceil: 2.4 });
    p0.push(...side, ...ports([[1, 18, DE], [18, 18, DW]]));
    b.note(X + W - 2, Z + 1.05, 0, 'Nota al final del pasillo', 'El pasillo siempre es más largo a la vuelta.');
    b.lair('figure', X + W - 4, Z + 2);
  }

  // ---- sala altísima con la escalera que acaba en la pared ----
  {
    const { X, Z } = sq(TALL, B);
    b.open(X + 0.25, Z + 0.25, 11.5, 11.5, { ceil: 8.5, wall: 0, lamps: 4 });
    b.ramp(X + 1, Z + 1, 2, 9.5, 2, 0, 5, true, 8.5).solid(X + 1, Z + 10.5, 2, 1.25);
    b.prop('door2wall', X + 2, Z + 10.45, Math.PI, { y: 5 }).prop('door2wall', X + 11.95, Z + 4, -Math.PI / 2, { y: 4.5 }).prop('door2wall', X + 7, Z + 0.55, 0, { y: 6 });
    for (const [x, z] of [[X + 5, Z + 5], [X + 9, Z + 5], [X + 5, Z + 9], [X + 9, Z + 9]]) b.solid(x - 0.5, z - 0.5, 1, 1);
    b.note(X + 11.95, Z + 9, -Math.PI / 2, 'Garabato a lápiz', 'Las escaleras no llevan a ninguna parte.\nLas puertas de arriba tampoco.\nNo subas.');
    b.item('pila', X + 10, Z + 10.5);
    p0.push(...ports([[3, 21, DS], [5, 23, DW]]));
  }

  // ---- Habitaciones Rojas ----
  let redOut: Port;
  {
    const { X, Z } = sq(RED, B);
    b.open(X + 16.75, Z, 2.5, 6, { wall: 4, lamps: 3 });
    b.open(X + 6, Z + 6, 20, 6, { wall: 4, floorMat: 3, lamps: 3.5 });
    b.open(X + 24, Z + 12, 2, 2, { floorMat: 3 });
    b.open(X, Z + 14, 32, 3.5, { wall: 4, floorMat: 3, lamps: false });
    for (let x = X + 1.5; x < X + 32; x += 3) b.lamp(x, Z + 15.75);
    b.red(X + 16.75, Z, 2.5, 6).red(X + 6, Z + 6, 20, 6).red(X, Z + 12, 32, 8);
    b.shift(X + 24, Z + 12, 2, 2, false, 4);
    b.loop({ axis: 'x', x0: X + 10, x1: X + 22, z0: Z + 14, z1: Z + 17.5 });
    for (const dx of [6, 12, 18, 24, 30]) b.prop('door2wall', X + dx, Z + 17.45, Math.PI);
    for (const dx of [3, 9, 21, 27]) b.prop('door2wall', X + dx, Z + 14.05, 0);
    b.prop('text', X + 15, Z + 17.44, Math.PI, { y: 2.1, text: 'SOLO LA PUERTA BLANCA ES DE VERDAD', w: 3.6 });
    b.zone('red', X, Z, 32, 20);
    b.prop('text', X + 16.8, Z + 4, Math.PI / 2, { y: 1.6, text: 'VUELVE', w: 1.4 });
    redOut = { bx: 14, bz: 20, dir: DS, p: X + 18, w: 2.5 };
    p0.push(redOut);
  }

  // ---- la puerta de MANTENIMIENTO y la escalera que baja al Nivel 1 ----
  {
    const { X, Z } = sq(EXIT, B);
    b.open(X, Z + 1.25, 1.2, 1.5, { ceil: 2.4, wall: 3, lamps: false });
    b.door(X + 0.1, Z + 2.25, -Math.PI / 2, { look: 'steel', locked: false, sign: 'MANTENIMIENTO' });
    b.ramp(X + 1.2, Z + 1.25, 9.6, 1.5, 1, -3.4, 0, true, 2.4);
    b.open(X + 10.8, Z + 1.25, 1.2, 6, { floor: -3.4, ceil: -1, wall: 3, lamps: false }).lamp(X + 11.4, Z + 4.5, { flicker: true });
    b.ramp(X + 1.2, Z + 5.75, 9.6, 1.5, 0, -6.8, -3.4, true, -1);
    b.open(X + 0.25, Z + 5.75, 0.95, 1.5, { floor: -6.8, ceil: -4.4, wall: 3, lamps: false }).lamp(X + 4, Z + 6.5, { flicker: true });
    b.exit(X + 0.6, Z + 6.5, -Math.PI / 2, 'NIVEL 1', true);
    b.note(X + 2, Z + 1.55, 0, 'Cartel oxidado', 'MANTENIMIENTO\nSolo personal autorizado.\n\nDebajo, a rotulador: «baja hasta que el papel amarillo se acabe».');
    p0.push({ bx: 29, bz: 12, dir: DE, p: Z + 2.25, w: 1.2 });
  }

  // ---- escaleras entre plantas ----
  for (const st of STAIRS) {
    const s = stairwell(b, B, st, 0, F1, 0);
    p0.push(s.p0);
    p1.push(s.p1);
  }

  // ---- el laberinto de abajo ----
  const stairRects = STAIRS.map((s) => ({ x: s.x, z: s.z, w: 2, h: 1 }));
  const reserved0 = [PILLARS, PITS, ABYSS, HALL, TALL, RED, EXIT, ...stairRects];
  const reserved1 = [PITS, ABYSS, TALL, ...stairRects];
  const m0 = maze(b, R, {
    ox: 0,
    oz: 0,
    B,
    nx: NX,
    nz: NZ,
    storey: 0,
    floor: 0,
    regions: [
      { x: 0, z: 0, w: NX, h: NZ, style: L0_YELLOW },
      { x: 0, z: 7, w: 10, h: 10, style: L0_ARCHES },
      { x: 24, z: 0, w: 12, h: 11, style: L0_OFFICE },
      { x: 21, z: 19, w: 15, h: 9, style: L0_BLACKOUT },
    ],
    reserved: reserved0,
    ports: p0,
    loops: 0.12,
    force: new Map([['1,1', 'room']]),
    single: new Set(['1,1']),
    shifts: 6,
  });

  // ---- el laberinto de arriba ----
  const force1 = vertical(b, R, m0, reserved1, 9, 12, false);
  b.storey(1);
  const m1 = maze(b, R, {
    ox: 0,
    oz: 0,
    B,
    nx: NX,
    nz: NZ,
    storey: 1,
    floor: F1,
    regions: [
      { x: 0, z: 0, w: NX, h: NZ, style: L0_UPPER },
      { x: 24, z: 0, w: 12, h: 11, style: { ...L0_OFFICE, room: L0_UPPER.room, hall: L0_UPPER.hall, steps: L0_UPPER.steps } },
    ],
    reserved: reserved1,
    ports: p1,
    loops: 0.1,
    force: force1,
    single: new Set(force1.keys()),
    shifts: 3,
  });
  b.storey(0);

  // la puerta blanca de las Habitaciones Rojas saca al pasillo de fuera
  {
    const out = m0.at(redOut.bx, redOut.bz)!;
    const c = mid(out);
    const { X, Z } = sq(RED, B);
    b.door(X + 15, Z + 14.05, 0, { look: 'white', locked: false, to: { x: c.x, z: c.z, ry: Math.PI }, label: 'Abrir la puerta blanca' });
  }

  // ---- donde te despiertas ----
  const start = m0.at(1, 1)!;
  {
    const r = start.area;
    b.spawn(r.x + r.w / 2, r.z + r.d / 2, FACE[start.arms[0]?.dir ?? 2]);
    b.lamp(r.x + r.w / 2, r.z + r.d / 2);
    const w = wallSpots({ b, R, block: start, room: r, floor: start.floor, ceil: start.ceil, doors: start.arms, storey: 0 }, 0.4)[0];
    if (w) b.note(w.x + Math.sin(w.ry) * 0.05, w.z + Math.cos(w.ry) * 0.05, w.ry, 'Nota arrugada', 'Si lees esto, has hecho noclip. Estás en el Nivel 0.\n\nEsto es un laberinto, y encima de este hay otro igual. Hay escaleras, suelos rotos y puertas que dan a salas sin suelo.\n\nPara salir, busca una puerta gris de MANTENIMIENTO. Está lejos. No sé dónde.');
  }

  scatterItems(b, C, [m0, m1], ['agua', 'agua', 'pila', 'pila', 'barrita', 'vendas', 'lata'], 60);
  scatterLairs(b, C, [m0, m1], start, [...Array.from({ length: 22 }, () => ['figure'] as [EntityKind]), ['smiler'], ['smiler'], ['smiler']]);
  wakes(b, R, [m0, m1], 8);
  return b.build();
}

// ===========================================================================
// NIVEL 1 — «La Zona Habitable»
// Un laberinto de hormigón entre aparcamiento y almacén: pasillos anchos y
// estrechos, cuartos de almacenaje con cajas, charcos y goteras. Dos plantas
// unidas por escaleras y forjados rotos. Piezas: la Sala Manila (llegada), la
// Base Alpha de la M.E.G. (zona segura), el pasillo que no acaba, el sector en
// obras, el almacén Gild, el sector gótico con el Círculo de Ariadna, un
// aparcamiento bajo y el depósito inundado con la escalera al Nivel 2.
// Zona de pasillos seguros (blancos y estrechos) al este.
// Paredes: 0 hormigón gris · 1 hormigón blanco · 2 bloques con franja
//          3 ladrillo · 4 verde M.E.G. · 5 piedra gótica · 6 manila
// Suelos: 0 hormigón · 1 pintado · 2 goma · 3 baldosa. Techos: 0 hormigón · 1 placas
// ===========================================================================

const L1_CONCRETE: Style = {
  wall: [0, 0, 1, 2],
  floorMat: [0, 0, 1],
  ceilMat: [0],
  room: [3, 3.6],
  hall: [2.8, 3.4],
  widths: [1.6, 2, 2.5, 3, 4],
  doors: [1.4, 2, 2.5],
  rooms: 0.45,
  merge: 0.35,
  dark: 0.12,
  lamp: 0.7,
  flicker: 0.15,
  steps: [0],
  wet: 0.15,
  straight: 0.6,
  decor: L1_DECOR,
  ends: L1_ENDS,
};
const L1_SAFE: Style = { ...L1_CONCRETE, wall: [1], floorMat: [3, 1], ceilMat: [1], room: [2.6, 2.8], hall: [2.5, 2.6], widths: [1.2, 1.4, 1.6], doors: [0.9, 1.1], rooms: 0.55, merge: 0.1, dark: 0.05, lamp: 0.85, wet: 0 };
const L1_WET: Style = { ...L1_CONCRETE, wet: 0.5, deep: 0.2, dark: 0.2 };
const L1_UPPER: Style = { ...L1_CONCRETE, wall: [2, 0], floorMat: [1, 0], ceilMat: [0, 1], room: [2.8, 3.2], hall: [2.6, 3], rooms: 0.5, dark: 0.2 };

function level1(): LevelMap {
  const B = 5;
  const NX = 32;
  const NZ = 26;
  const F1 = 4.2;
  const b = new Builder(1, LEVELS[1], NX * B, NZ * B, { ceil: 3.4 });
  b.storey(1, 7.4).storey(0);
  const R = makeRng(2027);
  // lo que cambia en cada partida (objetos y criaturas)
  const C = makeRng((2027 * 7919) ^ session);

  const MANILA = { x: 1, z: 1, w: 2, h: 2 };
  const ALPHA = { x: 6, z: 1, w: 5, h: 4 };
  const LOOP = { x: 14, z: 3, w: 6, h: 1 };
  const BUILD = { x: 22, z: 1, w: 4, h: 4 };
  const GILD = { x: 2, z: 9, w: 5, h: 4 };
  const GOTHIC = { x: 12, z: 10, w: 4, h: 4 };
  const PARK = { x: 2, z: 18, w: 5, h: 4 };
  const DEPOT = { x: 25, z: 20, w: 4, h: 3 };
  const STAIRS: Stair[] = [
    { x: 9, z: 7, up: 0 },
    { x: 17, z: 6, up: 1 },
    { x: 28, z: 7, up: 0 },
    { x: 10, z: 17, up: 1 },
    { x: 19, z: 19, up: 0 },
    { x: 14, z: 23, up: 1 },
    { x: 23, z: 13, up: 0 },
    { x: 4, z: 15, up: 1 },
  ];
  const p0: Port[] = [];
  const p1: Port[] = [];

  // ---- la Sala Manila (llegada) ----
  {
    const { X, Z } = sq(MANILA, B);
    b.open(X + 0.25, Z + 0.25, 9.5, 9.5, { ceil: 3, wall: 6, floorMat: 3, ceilMat: 1, lamps: 3 });
    b.spawn(X + 4, Z + 6, 0);
    b.note(X + 0.55, Z + 3, Math.PI / 2, 'Nota clavada en la pared', 'Si estás leyendo esto, has hecho noclip. Bajaste del Nivel 0 por una escalera que no se acababa y ahora estás en el Nivel 1, la Zona Habitable.\n\nNo estás solo. Aquí hay gente.');
    b.note(X + 0.55, Z + 7, Math.PI / 2, 'Nota con letra apretada', 'Busca telas de colores con el águila de la M.E.G. Suelen dejar agua de almendras al lado.\n\nLa Base Alpha está al este de aquí. Las patrullas visten de amarillo lima.');
    b.note(X + 5, Z + 0.55, 0, 'Nota escrita a toda prisa', 'Cuando se apaguen TODAS las luces (lo llamamos Parpadeo), NO enciendas la linterna. Quédate quieto.\n\nY no corras: oyen muy bien.');
    b.note(X + 9.95, Z + 4.5, -Math.PI / 2, 'Nota a lápiz', 'Esto es un laberinto de almacenes. Arriba hay otro. Las distancias mienten: elige una referencia y no la pierdas.');
    b.item('agua', X + 8, Z + 8.5);
    p0.push(...ports([[3, 1, DW], [1, 3, DN]]));
  }

  // ---- Base Alpha de la M.E.G. (zona segura) ----
  {
    const { X, Z, W, D } = sq(ALPHA, B);
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { ceil: 3.2, wall: 4, floorMat: 3, lamps: 4 }).zone('safe', X, Z, W, D);
    b.solid(X + 12, Z + 0.25, 0.5, 7, 4).solid(X + 12, Z + 12, 0.5, 7.75, 4);
    b.prop('megflag', X + 0.55, Z + 4, Math.PI / 2, { y: 1.8 }).prop('megflag', X + W - 0.05, Z + 10, -Math.PI / 2, { y: 1.8 });
    b.npc({ kind: 'meg', x: X + 3, z: Z + 10, ry: -Math.PI / 2, lines: ['¡Eh! Tranquilo, estás a salvo. Esto es la Base Alpha de la M.E.G.', 'Si se apagan las luces, no enciendas la linterna en los pasillos.', 'Las cajas aparecen cuando no miras. Coge lo que te haga falta.'] });
    b.npc({ kind: 'meg', x: X + 18, z: Z + 4, ry: 0, lines: ['Si te muerde un Hound, véndate rápido.', 'Arriba hay otro almacén. Hay forjados rotos: mira dónde pisas.', 'Bebe agua de almendras: calma la cabeza.'] });
    b.npc({ kind: 'meg', x: X + 20, z: Z + 16, ry: Math.PI, lines: ['Para bajar al Nivel 2, busca el depósito inundado. Al sureste, muy lejos de aquí.', 'Al este hay un sector en obras. No te acerques a los trabajadores.', 'Allí abajo hace calor. Lleva pilas.'] });
    b.prop('cot', X + 4, Z + 1.5, 0, { solid: [2, 0.9] }).prop('cot', X + 7, Z + 1.5, 0, { solid: [2, 0.9] }).prop('cot', X + 4, Z + 18.5, Math.PI, { solid: [2, 0.9] });
    b.prop('meg', X + 18, Z + 8, 0, { solid: [2, 1] }).prop('radio', X + 23, Z + 1.5, 0, { solid: [0.5, 0.5] }).prop('tent', X + 7, Z + 11, 0.3, { solid: [2.4, 2.4] });
    b.crate(X + 22, Z + 18.5, 0, 'medico').crate(X + 15, Z + 18.5, 0.1, 'comida');
    b.note(X + W - 0.05, Z + 14, -Math.PI / 2, 'Tablón de la M.E.G.', 'GUÍA RÁPIDA DE ENTIDADES\n\nSmilers: les atrae la luz. Apágala, mírales y aléjate despacio.\n\nHounds: mírales a los ojos y grita (tecla G).\n\nSkin-Stealers: alguien solo que llora y pide ayuda... no te acerques.\n\nDullers: si oyes arañar dentro de una pared, apártate de ella.\n\nClumps: no ven. Agáchate (C) y no hagas ruido.');
    p0.push(...ports([[5, 2, DE], [8, 5, DN, X + 14], [11, 3, DW]]));
  }

  // ---- el pasillo de hormigón que no acaba ----
  {
    const { X, Z } = sq(LOOP, B);
    b.open(X, Z + 1, 30, 3, { ceil: 3.5, lamps: 5, wall: 0 });
    b.loop({ axis: 'x', x0: X + 3, x1: X + 26, z0: Z + 1, z1: Z + 4, oneWay: 1, landmark: { x: X + 28.5, z: Z + 1.2 } });
    b.prop('panel', X + 28.5, Z + 1.05, 0, { y: 1 });
    b.note(X + 0.5, Z + 1.05, 0, 'Garabato en la pared', 'Si el pasillo no se acaba, mira el panel eléctrico del fondo y NO apartes la vista mientras andas.', true, 1.6);
    p0.push(...ports([[13, 3, DE], [20, 3, DW]]));
  }

  // ---- sector en obras ----
  {
    const { X, Z } = sq(BUILD, B);
    b.open(X + 0.25, Z + 0.25, 19.5, 19.5, { ceil: 5, wall: 2, lamps: 6 });
    b.solid(X + 6, Z + 8, 0.5, 8, 2).solid(X + 10, Z + 16, 6, 0.5, 2);
    b.prop('scaffold', X + 4, Z + 4, 0, { solid: [3, 1.2] }).prop('scaffold', X + 15, Z + 18, Math.PI / 2, { solid: [3, 1.2] });
    for (const [x, z] of [[X + 3, Z + 14], [X + 8, Z + 18], [X + 16, Z + 4]]) b.prop('cone', x, z, 0);
    b.npc({ kind: 'worker', x: X + 4, z: Z + 7, ry: Math.PI, lines: [], path: [[X + 4, Z + 7], [X + 4, Z + 15], [X + 2, Z + 15]] });
    b.npc({ kind: 'worker', x: X + 12, z: Z + 13, ry: Math.PI / 2, lines: [], path: [[X + 8, Z + 13], [X + 17, Z + 13], [X + 17, Z + 8]] });
    b.npc({ kind: 'worker', x: X + 16, z: Z + 9, ry: -Math.PI / 2, lines: [] });
    b.note(X + 0.5, Z + 0.55, 0, 'Cartel torcido', 'PELIGRO — OBRAS\nNo te acerques a los trabajadores. No contestan y no se apartan.', true, 1.8);
    b.crate(X + 18, Z + 2, 0.4, 'herramientas');
    p0.push(...ports([[21, 2, DE], [23, 5, DN]]));
  }

  // ---- almacén Gild ----
  {
    const { X, Z, W, D } = sq(GILD, B);
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { ceil: 6, wall: 2, floorMat: 1, lamps: 6 });
    for (const x of [X + 4, X + 9, X + 14, X + 19]) {
      b.prop('shelf', x, Z + 6, 0, { solid: [1.2, 6], d: 6 });
      b.prop('shelf', x, Z + 14, 0, { solid: [1.2, 6], d: 6 });
      b.crate(x, Z + 4 + (x % 3), 0, x % 2 ? 'comida' : 'mixto', true);
    }
    b.prop('forklift', X + 22, Z + 17, 0.6, { solid: [1.4, 2.4] });
    b.note(X + 0.55, Z + 10, Math.PI / 2, 'Guía de cajas (Recolección M.E.G.)', 'Las cajas aparecen a tu espalda o después de un Parpadeo, y se esfuman si dejas de mirarlas.\n\nMira lo que hay antes de meter la mano: a veces hay cristales.');
    b.lair('clump', X + 12, Z + 10);
    p0.push(...ports([[4, 8, DS], [7, 11, DW], [3, 13, DN]]));
  }

  // ---- sector gótico y el Círculo de Ariadna ----
  {
    const { X, Z } = sq(GOTHIC, B);
    b.open(X + 0.25, Z + 0.25, 19.5, 19.5, { ceil: 7, wall: 5, lamps: 5 });
    for (let x = X + 3; x < X + 20; x += 5) for (let z = Z + 3; z < Z + 20; z += 5) if (!(x > X + 11 && z > Z + 11)) b.prop('roundpillar', x, z, 0, { solid: [1, 1], h: 7 });
    b.solid(X + 11.5, Z + 11.5, 8.25, 0.5, 5).solid(X + 11.5, Z + 11.5, 0.5, 8.25, 5).open(X + 11.5, Z + 15, 0.5, 1.6, { ceil: 3 });
    b.open(X + 12, Z + 12, 7.75, 7.75, { ceil: 3.5, wall: 5, floorMat: 3, lamps: 3 });
    b.prop('bed', X + 16, Z + 15, 0, { solid: [1, 2.1] }).crate(X + 18, Z + 18.5, 0, 'medico');
    b.note(X + 12.05, Z + 18, Math.PI / 2, 'Círculo de Ariadna — Equipo Hipócrates', 'Si estás herido, coge lo que necesites del botiquín.');
    b.lair('hound', X + 5, Z + 15);
    p0.push(...ports([[11, 12, DE], [13, 9, DS], [14, 14, DN], [16, 11, DW]]));
  }

  // ---- aparcamiento bajo ----
  {
    const { X, Z, W, D } = sq(PARK, B);
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { ceil: 2.6, wall: 2, floorMat: 1, lamps: 6 });
    for (let x = X + 5; x < X + W - 2; x += 5) for (const z of [Z + 6, Z + 14]) b.solid(x - 0.4, z - 0.4, 0.8, 0.8, 2);
    for (const [dx, dz, r] of [[3, 3, 0], [8, 3, 0.05], [13, 17, Math.PI], [21, 17, Math.PI], [17, 10, Math.PI / 2]] as const) {
      b.prop('car', X + dx, Z + dz, r, { solid: r === Math.PI / 2 ? [4.3, 1.8] : [1.8, 4.3] });
    }
    for (let x = X + 2; x < X + W - 2; x += 2.8) b.prop('parklines', x, Z + 3, 0);
    b.dark(X + 12, Z + 0.25, 12.75, D - 0.5);
    b.lair('smiler', X + 20, Z + 10);
    b.prop('text', X + 0.55, Z + 10, Math.PI / 2, { y: 1.5, text: 'P-1', w: 1 });
    p0.push(...ports([[4, 17, DS], [7, 20, DW]]));
  }

  // ---- el depósito inundado y la escalera al Nivel 2 ----
  {
    const { X, Z } = sq(DEPOT, B);
    b.open(X + 6, Z, 2, 2, { ceil: 3, wall: 0 });
    b.ramp(X + 6, Z + 2, 2, 4, 3, -1.5, 0, true, 3);
    b.open(X + 0.25, Z + 6, 19.5, 8.75, { floor: -1.5, ceil: 3, wall: 0, lamps: 5 });
    b.open(X + 0.25, Z + 0.25, 5.5, 5.75, { floor: -1.5, ceil: 3, wall: 0, lamps: false });
    b.deep(X + 0.5, Z + 0.5, 19, 14, 0.15);
    for (const [x, z] of [[X + 5, Z + 10], [X + 11, Z + 10]]) b.solid(x - 0.5, z - 0.5, 1, 1);
    b.prop('debris', X + 14, Z + 8, 1.2, { y: -1.6, solid: [1.6, 1.2] }).prop('barrel', X + 3, Z + 13, 0, { solid: [0.7, 0.7] });
    b.ramp(X + 16, Z + 2, 2, 4, 2, -4, -1.5, true, 0.5);
    b.open(X + 16, Z + 0.25, 2, 1.75, { floor: -4, ceil: -1.6, wall: 0, lamps: false }).lamp(X + 17, Z + 1, { flicker: true });
    b.exit(X + 17, Z + 0.6, Math.PI, 'NIVEL 2', true);
    b.note(X + 16.05, Z + 5, Math.PI / 2, 'Nota en la escalera', 'Esta escalera baja más de lo que debería. Al fondo empieza el Nivel 2: túneles, calor y muy poca comida.');
    b.lair('clump', X + 3, Z + 3);
    p0.push(...ports([[26, 19, DS, X + 7, 2]]));
  }

  for (const st of STAIRS) {
    const s = stairwell(b, B, st, 0, F1, 0);
    p0.push(s.p0);
    p1.push(s.p1);
  }

  const stairRects = STAIRS.map((s) => ({ x: s.x, z: s.z, w: 2, h: 1 }));
  const reserved0 = [MANILA, ALPHA, LOOP, BUILD, GILD, GOTHIC, PARK, DEPOT, ...stairRects];
  const reserved1 = [BUILD, GILD, GOTHIC, ...stairRects];
  const m0 = maze(b, R, {
    ox: 0,
    oz: 0,
    B,
    nx: NX,
    nz: NZ,
    storey: 0,
    floor: 0,
    regions: [
      { x: 0, z: 0, w: NX, h: NZ, style: L1_CONCRETE },
      { x: 0, z: 0, w: 14, h: 8, style: L1_WET },
      { x: 20, z: 8, w: 12, h: 9, style: L1_SAFE },
    ],
    reserved: reserved0,
    ports: p0,
    loops: 0.14,
  });
  const force1 = vertical(b, R, m0, reserved1, 8, 10, false);
  b.storey(1);
  const m1 = maze(b, R, {
    ox: 0,
    oz: 0,
    B,
    nx: NX,
    nz: NZ,
    storey: 1,
    floor: F1,
    regions: [{ x: 0, z: 0, w: NX, h: NZ, style: L1_UPPER }],
    reserved: reserved1,
    ports: p1,
    loops: 0.12,
    force: force1,
    single: new Set(force1.keys()),
  });
  b.storey(0);

  const start = m0.at(3, 1) ?? m0.list[0];
  scatterItems(b, C, [m0, m1], ['agua', 'pila', 'barrita', 'vendas', 'lata', 'bengala', 'agua', 'pila'], 60);
  scatterLairs(b, C, [m0, m1], start, [
    ['hound'],
    ['hound'],
    ['hound'],
    ['hound'],
    ['hound'],
    ['smiler'],
    ['smiler'],
    ['smiler'],
    ['smiler'],
    ['smiler'],
    ['duller'],
    ['duller'],
    ['duller'],
    ['duller'],
    ['clump'],
    ['clump'],
    ['clump'],
    ['clump'],
    ['skinstealer', ['¿Hay alguien?', 'Por favor…', 'Te oigo. Ven.']],
    ['skinstealer', ['¿Hola?', '¿Hay alguien ahí?', 'Me he perdido…', 'Hola. Hola. Hola.']],
    ['skinstealer', ['¿Vecino?', 'Ayúdame… ayú-da-me.', 'No me dejes aquí.']],
  ]);
  wakes(b, R, [m0, m1], 6);
  return b.build();
}

// ===========================================================================
// NIVEL 2 — «Pipe Dreams»
// Túneles de mantenimiento estrechos y calurosos, en dos alturas: los de
// abajo y los túneles altos, con rejillas sueltas que caen a los de abajo.
// Luces escasas en serie, violetas de emergencia, puertas de acero cerradas y
// ventanas al final de algunos túneles. Piezas: la sala de máquinas, la sala
// de calderas (con galería), el campamento abandonado, el pozo sin fondo y la
// salida al Nivel 3. Algunas puertas llevan a sitios sueltos: un almacén, un
// pasillo que vuelve a la misma puerta y el Vacío.
// Paredes: 0 hormigón polvoriento · 1 ladrillo marrón · 2 ladrillo negro · 3 metal oxidado
// Suelos: 0 hormigón sucio · 1 rejilla
// ===========================================================================

const L2_TUNNELS: Style = {
  wall: [0, 0, 1, 2, 3],
  floorMat: [0, 0, 1],
  room: [2.6, 3.2],
  hall: [2.35, 2.6],
  widths: [1.3, 1.5, 1.6, 1.8, 2.1],
  doors: [1.1, 1.3],
  rooms: 0.14,
  merge: 0.4,
  dark: 0.45,
  lamp: 0.55,
  flicker: 0.5,
  steps: [0, 0, 0, 0.25, -0.25],
  straight: 0.7,
  wet: 0.1,
  decor: L2_DECOR,
  ends: L2_ENDS,
};
const L2_DEEP: Style = { ...L2_TUNNELS, dark: 0.75, lamp: 0.25 };
const L2_HIGH: Style = { ...L2_TUNNELS, wall: [3, 0], floorMat: [1], room: [2.5, 2.9], hall: [2.3, 2.5], rooms: 0.1, steps: [0, 0, 0.25] };

function level2(): LevelMap {
  const B = 4;
  const NX = 40;
  const NZ = 28;
  const F1 = 3.9;
  const b = new Builder(2, LEVELS[2], 200, NZ * B, { ceil: 2.6 });
  b.storey(1, 6.4).storey(0);
  const R = makeRng(3011);
  // lo que cambia en cada partida (objetos y criaturas)
  const C = makeRng((3011 * 7919) ^ session);

  const MACHINE = { x: 8, z: 6, w: 3, h: 3 };
  const BOILER = { x: 22, z: 4, w: 6, h: 5 };
  const CAMP = { x: 4, z: 16, w: 2, h: 2 };
  const PIT = { x: 30, z: 18, w: 3, h: 3 };
  const EXIT = { x: 36, z: 22, w: 2, h: 1 };
  const STAIRS: Stair[] = [
    { x: 5, z: 10, up: 0 },
    { x: 14, z: 3, up: 1 },
    { x: 18, z: 14, up: 0 },
    { x: 26, z: 20, up: 1 },
    { x: 34, z: 8, up: 0 },
    { x: 12, z: 24, up: 1 },
    { x: 36, z: 15, up: 0 },
  ];
  const p0: Port[] = [];
  const p1: Port[] = [];

  // ---- sala de máquinas ----
  {
    const { X, Z } = sq(MACHINE, B);
    b.open(X + 0.25, Z + 0.25, 11.5, 11.5, { ceil: 4.5, wall: 3, floorMat: 1, lamps: 5 });
    for (const [x, z] of [[X + 3, Z + 3], [X + 8, Z + 3], [X + 3, Z + 8.5]]) b.prop('tank', x, z, 0, { solid: [2.4, 2.4] });
    b.prop('machine', X + 11.6, Z + 7, -Math.PI / 2, { solid: [0.8, 2.4] }).prop('gauge', X + 0.55, Z + 4, Math.PI / 2, { y: 1.5 }).prop('valve', X + 0.55, Z + 9, Math.PI / 2, { y: 1.2 });
    b.vent(X + 7, Z + 9, 6).item('agua', X + 9, Z + 10.5);
    p0.push(...ports([[7, 7, DE], [11, 7, DW], [9, 9, DN]]));
  }

  // ---- la sala de calderas: galería arriba y calderas abajo ----
  {
    const { X, Z, W, D } = sq(BOILER, B);
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { ceil: 3.4, wall: 3, floorMat: 1, lamps: 5 });
    for (const [x, z] of [[X + 7, Z + 7], [X + 7, Z + 13], [X + 17, Z + 7], [X + 17, Z + 13]]) {
      b.prop('tank', x - 1.2, z, 0, { solid: [2.4, 2.4] }).prop('tank', x + 1.2, z, 0, { solid: [2.4, 2.4] });
    }
    b.storey(1);
    b.open(X + 0.25, Z + 0.25, W - 0.5, D - 0.5, { floor: F1, ceil: F1 + 4.5, wall: 3, floorMat: 1, lamps: 5 });
    b.hole(X + 3, Z + 3, W - 6, D - 6);
    b.open(X + 3, Z + D / 2 - 1, W - 6, 2, { floor: F1, ceil: F1 + 4.5, lamps: 5 });
    b.hole(X + 8, Z + D / 2 - 1, 2, 1);
    b.prop('railing', X + W / 2, Z + D / 2 - 1.05, Math.PI, { w: W - 6 }).prop('railing', X + W / 2, Z + D / 2 + 1.05, 0, { w: W - 6 });
    b.note(X + W - 0.05, Z + 4, -Math.PI / 2, 'Nota en la barandilla', 'Desde aquí arriba se ve todo. Ellos también te ven a ti.\n\nFalta una rejilla en la pasarela.', true, F1 + 1.5);
    b.storey(0);
    b.lair('hound', X + 12, Z + 4).lair('hound', X + 13, Z + 5);
    b.prop('text', X + 0.55, Z + 15, Math.PI / 2, { y: 1.8, text: 'CALDERAS — NO TOCAR', w: 3.2 });
    p0.push(...ports([[21, 6, DE], [28, 6, DW], [24, 9, DN], [25, 3, DS]]));
    p1.push(...ports([[21, 5, DE], [28, 7, DW]]));
  }

  // ---- campamento abandonado ----
  {
    const { X, Z } = sq(CAMP, B);
    b.open(X + 0.25, Z + 0.25, 7.5, 7.5, { ceil: 2.6, wall: 1, floorMat: 1, lamps: 3 });
    b.prop('cot', X + 1.5, Z + 3, Math.PI / 2, { solid: [0.9, 2] }).prop('table', X + 5.5, Z + 5, 0.2, { solid: [1.6, 1] }).prop('foldchair', X + 5.5, Z + 3.8, 0.5);
    b.crate(X + 6.5, Z + 1.5, 0, 'comida');
    b.note(X + 0.55, Z + 6, Math.PI / 2, 'Diario arrugado', 'Día 40. Vinieron por los túneles de abajo, en manada. Primero el gruñido, luego el ruido de las uñas en el hormigón.\n\nSi lees esto: los Hounds no aguantan que les mires, pero solo un momento. Grita y corre.');
    p0.push(...ports([[4, 15, DS], [6, 17, DW]]));
  }

  // ---- el pozo sin fondo ----
  {
    shaftRoom(b, B, PIT, F1, { wall: 3, abyss: true, floorMat: 1 });
    const { X, Z } = sq(PIT, B);
    b.prop('text', X + 0.55, Z + 9.5, Math.PI / 2, { y: 1.7, text: '↓ ABAJO NO', w: 1.8 });
    p0.push(...ports([[29, 19, DE], [31, 17, DS]]));
    p1.push(...ports([[33, 19, DW]]));
  }

  // ---- salida al Nivel 3 ----
  {
    const { X, Z } = sq(EXIT, B);
    b.open(X, Z + 1.2, 7.6, 1.6, { ceil: 2.4, wall: 2, lamps: false }).lamp(X + 6, Z + 2, { flicker: true });
    b.exit(X + 7.55, Z + 2, -Math.PI / 2, 'SALIDA → NIVEL 3');
    b.note(X + 6, Z + 1.25, 0, 'Nota en la puerta', 'Por aquí se llega al Nivel 3, la Estación Eléctrica. Más calor y más máquinas. Buena suerte.');
    p0.push({ bx: 35, bz: 22, dir: DE, p: Z + 2, w: 1.6 });
  }

  for (const st of STAIRS) {
    const s = stairwell(b, B, st, 0, F1, 3);
    p0.push(s.p0);
    p1.push(s.p1);
  }

  const stairRects = STAIRS.map((s) => ({ x: s.x, z: s.z, w: 2, h: 1 }));
  const reserved0 = [MACHINE, BOILER, CAMP, PIT, EXIT, ...stairRects];
  const reserved1 = [MACHINE, BOILER, PIT, ...stairRects];
  const m0 = maze(b, R, {
    ox: 0,
    oz: 0,
    B,
    nx: NX,
    nz: NZ,
    storey: 0,
    floor: 0,
    regions: [
      { x: 0, z: 0, w: NX, h: NZ, style: L2_TUNNELS },
      { x: 0, z: 18, w: 22, h: 10, style: L2_DEEP },
    ],
    reserved: reserved0,
    ports: p0,
    loops: 0.1,
    force: new Map([['1,1', 'room']]),
    single: new Set(['1,1']),
  });
  const force1 = vertical(b, R, m0, reserved1, 4, 16, true);
  b.storey(1);
  const m1 = maze(b, R, {
    ox: 0,
    oz: 0,
    B,
    nx: NX,
    nz: NZ,
    storey: 1,
    floor: F1,
    regions: [{ x: 0, z: 0, w: NX, h: NZ, style: L2_HIGH }],
    reserved: reserved1,
    ports: p1,
    loops: 0.08,
    force: force1,
    single: new Set(force1.keys()),
  });
  b.storey(0);

  // ---- llegada ----
  const start = m0.at(1, 1)!;
  {
    const r = start.area;
    b.spawn(r.x + r.w / 2, r.z + r.d / 2, FACE[start.arms[0]?.dir ?? 0]);
    b.lamp(r.x + r.w / 2, r.z + r.d / 2);
    const ws = wallSpots({ b, R, block: start, room: r, floor: start.floor, ceil: start.ceil, doors: start.arms, storey: 0 }, 0.4);
    const w1 = ws[0];
    const w2 = ws.find((w) => w.side !== w1?.side);
    if (w1) b.prop('text', w1.x + Math.sin(w1.ry) * 0.03, w1.z + Math.cos(w1.ry) * 0.03, w1.ry, { y: 1.7, text: 'NIVEL 2', w: 1.6 });
    if (w2) b.note(w2.x + Math.sin(w2.ry) * 0.05, w2.z + Math.cos(w2.ry) * 0.05, w2.ry, 'Nota en una tubería', 'Las luces van en serie: si una se rompe, se apaga todo el tramo.\nLleva siempre pilas. Y no te acerques a las ventanas del final de los túneles.\n\nLa salida está muy lejos. Hay túneles encima de túneles.');
  }

  // ---- puertas a sitios sueltos (al este del mapa) ----
  {
    const near = m0.dist(start);
    const ends = m0.ends.filter((k) => k.kind === 'hall' && (near.get(k) ?? 0) > 10);
    const [e1, e2, e3] = take(R, ends, 3);
    const doorAt = (k: Block) => {
      const d = k.arms[0].dir;
      const od = OPP[d];
      const r = k.area;
      const x = od === 0 ? r.x + r.w - 0.05 : od === 1 ? r.x + 0.05 : r.x + r.w / 2;
      const z = od === 2 ? r.z + r.d - 0.05 : od === 3 ? r.z + 0.05 : r.z + r.d / 2;
      const ry = FACE[d];
      return { x, z, ry, front: { x: x + Math.sin(ry) * 1.2, z: z + Math.cos(ry) * 1.2, ry } };
    };
    // un almacén con cajas y ordenadores
    if (e1) {
      const d = doorAt(e1);
      b.door(d.x, d.z, d.ry, { look: 'steel', locked: false, to: { x: 171, z: 70, ry: Math.PI }, label: 'Abrir la puerta' });
      b.open(166, 64, 10, 9, { ceil: 2.8, wall: 0, floorMat: 0, lamps: 4 });
      b.door(171, 72.95, Math.PI, { look: 'steel', locked: false, to: d.front });
      b.prop('pc', 167, 65, 0, { solid: [1.2, 0.8] }).prop('pc', 169, 65, 0, { solid: [1.2, 0.8] }).crate(174, 66, 0, 'herramientas').crate(174, 70, 0.4, 'comida');
    }
    // un pasillo de oficina que vuelve a la misma puerta
    if (e2) {
      const d = doorAt(e2);
      b.door(d.x, d.z, d.ry, { look: 'white', locked: false, to: { x: 167, z: 79.75, ry: Math.PI / 2 }, label: 'Abrir la puerta' });
      b.open(166, 78, 26, 3.5, { ceil: 2.8, wall: 0, floorMat: 0, lamps: 4 });
      b.door(191.95, 79.75, -Math.PI / 2, { look: 'white', locked: false, to: d.front, label: 'Abrir la puerta' });
    }
    // al Vacío
    if (e3) {
      const d = doorAt(e3);
      b.door(d.x, d.z, d.ry, { look: 'steel', locked: false, window: true, to: { x: 180, z: 31, ry: 0 }, label: 'Abrir la puerta (por el ventanuco se ve todo negro)' });
      b.open(166, 4, 28, 56, { ceil: 6, dark: true, floorMat: 0 }).zone('void', 166, 4, 28, 56);
      b.door(180, 30, Math.PI, { look: 'steel', locked: false, to: d.front, label: 'Volver por la puerta' });
    }
  }

  scatterItems(b, C, [m0, m1], ['pila', 'pila', 'vendas', 'agua', 'barrita', 'bengala', 'lata', 'pila'], 60);
  scatterLairs(b, C, [m0, m1], start, [
    ...Array.from({ length: 9 }, () => ['smiler'] as [EntityKind]),
    ...Array.from({ length: 6 }, () => ['clump'] as [EntityKind]),
    ...Array.from({ length: 5 }, () => ['hound'] as [EntityKind]),
    ...Array.from({ length: 5 }, () => ['faceling'] as [EntityKind]),
  ]);
  for (const m of [m0, m1]) {
    b.storey(m.o.storey);
    for (const k of take(R, solidGround(m), 5)) b.critter(R() < 0.5 ? 'moth' : 'rat', mid(k).x, mid(k).z);
  }
  b.storey(0);
  wakes(b, R, [m0, m1], 6);
  return b.build();
}

const builders = [level0, level1, level2];
const cache = new Map<number, LevelMap>();

/**
 * Semilla de la partida: la elige el anfitrión y la reciben todos al entrar.
 * El laberinto es siempre el mismo; los objetos y las criaturas cambian.
 */
let session = 0;
export function setSession(seed: number) {
  if (seed === session) return;
  session = seed >>> 0;
  cache.clear();
}

export function getMap(level: number): LevelMap {
  let map = cache.get(level);
  if (!map) {
    map = builders[level]();
    cache.set(level, map);
  }
  return map;
}
