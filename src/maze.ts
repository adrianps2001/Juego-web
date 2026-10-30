// Generador de laberintos para los niveles. El mapa se divide en bloques
// (normalmente de 4 m); cada bloque es un trozo de pasillo o una sala pequeña
// y se une a sus vecinos con un árbol (todo se puede alcanzar) más algunas
// uniones de sobra (bucles: varios caminos). Lo que no es árbol ni bucle es
// pared: así salen callejones sin salida y salas que no llevan a ninguna parte.
//
// Todo sale de una semilla fija: todos los jugadores ven el mismo laberinto.

import type { Builder } from './world';

export type Rng = () => number;

/** Generador aleatorio con semilla (mulberry32). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(R: Rng, a: readonly T[]): T => a[Math.floor(R() * a.length)];
export const between = (R: Rng, a: number, b: number) => a + R() * (b - a);

// direcciones: 0 = este (+x), 1 = oeste (-x), 2 = sur (+z), 3 = norte (-z)
export const DX = [1, -1, 0, 0];
export const DZ = [0, 0, 1, -1];
export const OPP = [1, 0, 3, 2];
/** Orientación (ry) de algo que mira hacia cada dirección. */
export const FACE = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Hueco de paso en el borde de un bloque: dirección, posición lateral (absoluta) y ancho. */
export interface Arm {
  dir: number;
  p: number;
  w: number;
}

export interface Style {
  wall: number[];
  floorMat: number[];
  ceilMat?: number[];
  /** Altura del techo de las salas y de los pasillos (sobre el suelo). */
  room: [number, number];
  hall: [number, number];
  /** Anchos de pasillo y de puerta. */
  widths: number[];
  doors: number[];
  /** Probabilidades: sala, sala unida a la de al lado, a oscuras, fluorescente, parpadeo. */
  rooms: number;
  merge: number;
  dark: number;
  lamp: number;
  flicker: number;
  /** Desniveles posibles entre bloques (se elige uno por bloque). */
  steps: number[];
  wet?: number;
  deep?: number;
  /** Puertas en arco (zona de arcos). */
  arches?: boolean;
  /** Probabilidad de que un paso vaya recto (sin desplazarse a un lado). */
  straight?: number;
  decor?: Decor[];
  ends?: Decor[];
}

export interface Block {
  bx: number;
  bz: number;
  x: number;
  z: number;
  kind: 'hall' | 'room' | 'drop' | 'broken';
  group: number; // salas unidas: mismo número
  floor: number;
  ceil: number;
  dark: boolean;
  arms: Arm[];
  style: Style;
  /** Zona abierta: el cruce del pasillo o la sala entera (si está unida, la del grupo). */
  area: Rect;
}

export interface Ctx {
  b: Builder;
  R: Rng;
  block: Block;
  room: Rect;
  floor: number;
  ceil: number;
  doors: Arm[];
  storey: number;
}
export type Decor = (c: Ctx) => void;

export interface Port {
  bx: number;
  bz: number;
  dir: number;
  p?: number;
  w?: number;
}

export interface MazeOpts {
  ox: number;
  oz: number;
  B: number;
  nx: number;
  nz: number;
  storey: number;
  floor: number;
  /** Zonas con su estilo (en bloques); manda la última que contiene el bloque. */
  regions: { x: number; z: number; w: number; h: number; style: Style }[];
  /** Bloques reservados para piezas hechas a mano (no se tocan). */
  reserved: { x: number; z: number; w: number; h: number }[];
  /** Pasos obligados desde un bloque hacia una pieza. */
  ports: Port[];
  /** Fracción de uniones de sobra (bucles). */
  loops: number;
  /** Tipo obligado de algunos bloques ("bx,bz"). */
  force?: Map<string, Block['kind']>;
  /** Pares de paredes que cambian cuando nadie mira (cambio periférico). */
  shifts?: number;
  /** Bloques en los que no se ponen salas unidas (p. ej. debajo de huecos). */
  single?: Set<string>;
}

export interface Maze {
  o: MazeOpts;
  list: Block[];
  at(bx: number, bz: number): Block | null;
  /** Callejones sin salida (un solo paso). */
  ends: Block[];
  rooms: Block[];
  /** Distancia en pasos desde un bloque a todos (BFS). */
  dist(from: Block): Map<Block, number>;
}

const key = (bx: number, bz: number) => `${bx},${bz}`;

/** El rectángulo tal como queda en la rejilla de casillas (como lo abre Builder.open). */
function snap(r: Rect): Rect {
  const x0 = Math.round(r.x / 0.5) * 0.5;
  const z0 = Math.round(r.z / 0.5) * 0.5;
  const x1 = Math.round((r.x + r.w) / 0.5) * 0.5;
  const z1 = Math.round((r.z + r.d) / 0.5) * 0.5;
  return { x: x0, z: z0, w: x1 - x0, d: z1 - z0 };
}

export function maze(b: Builder, R: Rng, o: MazeOpts): Maze {
  const { B, nx, nz, ox, oz } = o;
  const grid: (Block | null)[] = new Array(nx * nz).fill(null);
  const reserved = (bx: number, bz: number) => o.reserved.some((r) => bx >= r.x && bx < r.x + r.w && bz >= r.z && bz < r.z + r.h);
  const styleAt = (bx: number, bz: number) => {
    let s = o.regions[0].style;
    for (const r of o.regions) if (bx >= r.x && bx < r.x + r.w && bz >= r.z && bz < r.z + r.h) s = r.style;
    return s;
  };
  const at = (bx: number, bz: number) => (bx < 0 || bz < 0 || bx >= nx || bz >= nz ? null : grid[bz * nx + bx]);
  const list: Block[] = [];
  for (let bz = 0; bz < nz; bz++) {
    for (let bx = 0; bx < nx; bx++) {
      if (reserved(bx, bz)) continue;
      const style = styleAt(bx, bz);
      const forced = o.force?.get(key(bx, bz));
      const kind: Block['kind'] = forced ?? (R() < style.rooms ? 'room' : 'hall');
      const floor = o.floor + pick(R, style.steps);
      const room = kind !== 'hall';
      const ceil = floor + between(R, ...(room ? style.room : style.hall));
      const blk: Block = { bx, bz, x: ox + bx * B, z: oz + bz * B, kind, group: -1, floor, ceil, dark: R() < style.dark, arms: [], style, area: { x: 0, z: 0, w: 0, d: 0 } };
      grid[bz * nx + bx] = blk;
      list.push(blk);
    }
  }

  // ---- salas unidas (2 × 1 y alguna 2 × 2) ----
  let groups = 0;
  const groupRect = new Map<number, Rect>();
  for (const blk of list) {
    if (blk.kind !== 'room' || blk.group >= 0 || o.single?.has(key(blk.bx, blk.bz)) || R() >= blk.style.merge) continue;
    const free = (x: number, z: number) => {
      const n = at(x, z);
      return n && n.kind === 'room' && n.group < 0 && !o.single?.has(key(x, z)) ? n : null;
    };
    const horiz = R() < 0.5;
    const n1 = horiz ? free(blk.bx + 1, blk.bz) : free(blk.bx, blk.bz + 1);
    if (!n1) continue;
    const members = [blk, n1];
    if (R() < 0.35) {
      const a = horiz ? free(blk.bx, blk.bz + 1) : free(blk.bx + 1, blk.bz);
      const c = free(blk.bx + 1, blk.bz + 1);
      if (a && c) members.push(a, c);
    }
    const g = groups++;
    for (const m of members) {
      m.group = g;
      m.floor = blk.floor;
      m.ceil = blk.ceil;
      m.dark = blk.dark;
    }
    const x0 = Math.min(...members.map((m) => m.x));
    const z0 = Math.min(...members.map((m) => m.z));
    const x1 = Math.max(...members.map((m) => m.x)) + B;
    const z1 = Math.max(...members.map((m) => m.z)) + B;
    groupRect.set(g, { x: x0 + 0.25, z: z0 + 0.25, w: x1 - x0 - 0.5, d: z1 - z0 - 0.5 });
  }

  // ---- árbol + bucles (Kruskal) ----
  const parent = new Map<Block, Block>();
  const find = (a: Block): Block => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const blk of list) parent.set(blk, blk);
  // los bloques de una sala unida ya están unidos entre sí
  for (const blk of list) {
    if (blk.group < 0) continue;
    for (const d of [0, 2]) {
      const n = at(blk.bx + DX[d], blk.bz + DZ[d]);
      if (n && n.group === blk.group) parent.set(find(n), find(blk));
    }
  }
  const edges: [Block, Block, number][] = [];
  for (const blk of list) {
    for (const d of [0, 2]) {
      const n = at(blk.bx + DX[d], blk.bz + DZ[d]);
      if (n && !(n.group >= 0 && n.group === blk.group)) edges.push([blk, n, d]);
    }
  }
  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [edges[i], edges[j]] = [edges[j], edges[i]];
  }
  // las salas sin suelo van al final: quedan como hojas y no cortan caminos
  const isDrop = (e: [Block, Block, number]) => e[0].kind === 'drop' || e[1].kind === 'drop';
  edges.sort((a, b) => Number(isDrop(a)) - Number(isDrop(b)));
  const links: { a: Block; b: Block; d: number; loop: boolean; arm?: [Arm, Arm] }[] = [];
  const extra: [Block, Block, number][] = [];
  for (const e of edges) {
    const ra = find(e[0]);
    const rb = find(e[1]);
    if (ra !== rb) {
      parent.set(ra, rb);
      links.push({ a: e[0], b: e[1], d: e[2], loop: false });
    } else if (!isDrop(e)) extra.push(e);
  }
  for (const e of extra) if (R() < o.loops) links.push({ a: e[0], b: e[1], d: e[2], loop: true });

  // ---- pasos: ancho y posición ----
  const lateral = (blk: Block, d: number) => (d < 2 ? blk.z : blk.x) + B / 2;
  for (const l of links) {
    const { a, b: n, d } = l;
    const roomy = a.kind !== 'hall' || n.kind !== 'hall';
    const style = R() < 0.5 ? a.style : n.style;
    const w = roomy ? pick(R, style.doors) : pick(R, style.widths);
    const lim = Math.max(0, B / 2 - w / 2 - 0.45);
    const p = lateral(a, d) + (R() < (style.straight ?? 0.4) ? 0 : between(R, -lim, lim));
    const arm1 = { dir: d, p, w };
    const arm2 = { dir: OPP[d], p, w };
    a.arms.push(arm1);
    n.arms.push(arm2);
    l.arm = [arm1, arm2];
  }
  for (const port of o.ports) {
    const blk = at(port.bx, port.bz);
    if (!blk) continue;
    blk.arms.push({ dir: port.dir, p: port.p ?? lateral(blk, port.dir), w: port.w ?? 1.6 });
  }

  // ---- tallado ----
  const carve = (blk: Block) => {
    const s = blk.style;
    const wall = pick(R, s.wall);
    const area = {
      floor: blk.floor,
      ceil: blk.ceil,
      wall,
      floorMat: pick(R, s.floorMat),
      ceilMat: s.ceilMat ? pick(R, s.ceilMat) : undefined,
      lamps: false as const,
      dark: blk.dark,
    };
    const X = blk.x;
    const Z = blk.z;
    const open = (r: Rect, extra = {}) => {
      if (r.w > 0.01 && r.d > 0.01) b.open(r.x, r.z, r.w, r.d, { ...area, ...extra });
    };
    // de una zona (sala o cruce) hasta el borde del bloque (y un poco más si es una puerta de pieza)
    const arm = (from: Rect, a: Arm, room: boolean) => {
      const hw = a.w / 2;
      const isPort = !at(blk.bx + DX[a.dir], blk.bz + DZ[a.dir]);
      const over = isPort ? 0.35 : 0;
      let r: Rect;
      if (a.dir === 0) r = { x: from.x + from.w, z: a.p - hw, w: X + B + over - (from.x + from.w), d: a.w };
      else if (a.dir === 1) r = { x: X - over, z: a.p - hw, w: from.x - X + over, d: a.w };
      else if (a.dir === 2) r = { x: a.p - hw, z: from.z + from.d, w: a.w, d: Z + B + over - (from.z + from.d) };
      else r = { x: a.p - hw, z: Z - over, w: a.w, d: from.z - Z + over };
      if (room && s.arches && !isPort && r.w > 0.01 && r.d > 0.01) {
        open(r);
        b.arch(r.x, r.z, r.w, r.d, Math.min(2.2, blk.ceil - blk.floor - 0.2), a.dir < 2 ? Math.PI / 2 : 0);
      } else open(r);
    };
    if (blk.kind === 'hall') {
      const wm = Math.max(1.2, ...blk.arms.map((a) => a.w));
      const ns = blk.arms.filter((a) => a.dir >= 2);
      const ew = blk.arms.filter((a) => a.dir < 2);
      const cx = X + B / 2;
      const cz = Z + B / 2;
      const xs = ns.length ? ns.flatMap((a) => [a.p - a.w / 2, a.p + a.w / 2]) : [cx - wm / 2, cx + wm / 2];
      const zs = ew.length ? ew.flatMap((a) => [a.p - a.w / 2, a.p + a.w / 2]) : [cz - wm / 2, cz + wm / 2];
      // un callejón sin salida acaba en un cuartito
      if (blk.arms.length === 1) {
        const a = blk.arms[0];
        const half = Math.max(a.w, 1.6) / 2;
        if (a.dir < 2) zs.push(a.p - half, a.p + half);
        else xs.push(a.p - half, a.p + half);
      }
      const hub = { x: Math.min(...xs), z: Math.min(...zs), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
      blk.area = snap(hub);
      open(hub);
      for (const a of blk.arms) arm(hub, a, false);
    } else {
      const room = blk.group >= 0 ? groupRect.get(blk.group)! : { x: X + 0.25, z: Z + 0.25, w: B - 0.5, d: B - 0.5 };
      blk.area = snap(room);
      const first = blk.group < 0 || list.find((m) => m.group === blk.group) === blk;
      if (first) open(room);
      // el paso sale del borde de la sala (en una sala unida, del borde del grupo)
      for (const a of blk.arms) arm(room, a, true);
      if (blk.kind === 'drop' && o.storey > 0) b.hole(room.x, room.z, room.w, room.d);
      if (blk.kind === 'broken' && o.storey > 0) b.hole(X + B / 2 - 0.75, Z + B / 2 - 0.75, 1.5, 1.5);
    }
    if (s.wet && R() < s.wet) b.wet(blk.area.x, blk.area.z, blk.area.w, blk.area.d);
    if (s.deep && R() < s.deep) b.deep(blk.area.x, blk.area.z, blk.area.w, blk.area.d, 0.12);
  };
  for (const blk of list) carve(blk);

  // ---- fluorescentes ----
  const lit = new Set<number>();
  for (const blk of list) {
    if (blk.dark || blk.kind === 'drop') continue;
    const s = blk.style;
    if (blk.group >= 0) {
      if (lit.has(blk.group)) continue;
      lit.add(blk.group);
      const r = blk.area;
      const nxl = Math.max(1, Math.round(r.w / 3.6));
      const nzl = Math.max(1, Math.round(r.d / 3.6));
      for (let i = 0; i < nxl; i++) for (let j = 0; j < nzl; j++) if (R() < s.lamp + 0.2) b.lamp(r.x + ((i + 0.5) * r.w) / nxl, r.z + ((j + 0.5) * r.d) / nzl, { flicker: R() < s.flicker });
    } else if (R() < s.lamp) {
      const r = blk.area;
      const lx = blk.kind === 'broken' ? r.x + r.w * 0.25 : r.x + r.w / 2;
      b.lamp(lx, r.z + r.d / 2, { flicker: R() < s.flicker });
    }
  }

  // ---- paredes que cambian: pares de bucles, uno abierto y otro cerrado ----
  if (o.shifts) {
    const cands = links.filter((l) => l.loop && l.arm);
    for (let k = 0; k + 1 < cands.length && k / 2 < o.shifts; k += 2) {
      for (let j = 0; j < 2; j++) {
        const l = cands[k + j];
        const [a1] = l.arm!;
        const bx = l.d === 0 ? l.a.x + B : l.a.x;
        const bz = l.d === 2 ? l.a.z + B : l.a.z;
        const wall = pick(R, l.a.style.wall);
        if (l.d === 0) b.shift(bx - 0.5, a1.p - a1.w / 2, 1, a1.w, j === 0, wall, j === 1);
        else b.shift(a1.p - a1.w / 2, bz - 0.5, a1.w, 1, j === 0, wall, j === 1);
      }
    }
  }

  // ---- decoración ----
  const done = new Set<number>();
  const ends: Block[] = [];
  const rooms: Block[] = [];
  for (const blk of list) {
    const s = blk.style;
    if (blk.kind === 'hall') {
      if (blk.arms.length === 1) {
        ends.push(blk);
        if (s.ends?.length) pick(R, s.ends)({ b, R, block: blk, room: blk.area, floor: blk.floor, ceil: blk.ceil, doors: blk.arms, storey: o.storey });
      }
      continue;
    }
    if (blk.kind === 'drop' || blk.kind === 'broken') continue;
    if (blk.group >= 0) {
      if (done.has(blk.group)) continue;
      done.add(blk.group);
    }
    rooms.push(blk);
    const doors = blk.group >= 0 ? list.filter((m) => m.group === blk.group).flatMap((m) => m.arms) : blk.arms;
    if (doors.length === 1 && blk.group < 0) ends.push(blk);
    if (s.decor?.length) pick(R, s.decor)({ b, R, block: blk, room: blk.area, floor: blk.floor, ceil: blk.ceil, doors, storey: o.storey });
  }

  const dist = (from: Block) => {
    const out = new Map<Block, number>([[from, 0]]);
    const q = [from];
    while (q.length) {
      const c = q.shift()!;
      const nb: Block[] = [];
      for (const a of c.arms) {
        const n = at(c.bx + DX[a.dir], c.bz + DZ[a.dir]);
        if (n) nb.push(n);
      }
      if (c.group >= 0) nb.push(...list.filter((m) => m.group === c.group));
      for (const n of nb) {
        if (out.has(n)) continue;
        out.set(n, out.get(c)! + 1);
        q.push(n);
      }
    }
    return out;
  };

  return { o, list, at, ends, rooms, dist };
}

// ---------------------------------------------------------------- ayudas para decorar

/** Sitios junto a las paredes de una sala (lejos de las puertas), mirando hacia dentro. */
export function wallSpots(c: Ctx, gap = 1.0): { x: number; z: number; ry: number; side: number }[] {
  const r = c.room;
  const out: { x: number; z: number; ry: number; side: number }[] = [];
  // lado: 0 = pared oeste (mira al este), 1 = pared este, 2 = pared norte, 3 = pared sur
  const sides: [number, number, number, number, number, number][] = [
    [r.x, r.z, 0, 1, FACE[0], 1],
    [r.x + r.w, r.z, 0, 1, FACE[1], 0],
    [r.x, r.z, 1, 0, FACE[2], 3],
    [r.x, r.z + r.d, 1, 0, FACE[3], 2],
  ];
  sides.forEach(([x0, z0, ax, az, ry, doorDir], side) => {
    const len = ax ? r.w : r.d;
    for (let t = 0.7; t <= len - 0.7; t += 0.9) {
      const x = x0 + ax * t;
      const z = z0 + az * t;
      const blocked = c.doors.some((d) => d.dir === doorDir && Math.abs((ax ? x : z) - d.p) < d.w / 2 + gap);
      if (!blocked) out.push({ x, z, ry, side });
    }
  });
  return out;
}

/** Mueve un sitio de pared hacia dentro de la sala. */
export function inward(s: { x: number; z: number; ry: number }, by: number) {
  return { x: s.x + Math.sin(s.ry) * by, z: s.z + Math.cos(s.ry) * by, ry: s.ry };
}

/** Saca n elementos distintos al azar. */
export function take<T>(R: Rng, a: T[], n: number): T[] {
  const c = a.slice();
  const out: T[] = [];
  while (c.length && out.length < n) out.push(c.splice(Math.floor(R() * c.length), 1)[0]);
  return out;
}
