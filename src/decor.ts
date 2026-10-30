// Cómo se amueblan las salas y los callejones del laberinto, por nivel.
// Cada decoración recibe la sala (rectángulo), sus puertas y el generador
// aleatorio con semilla, y pone muebles, notas o pintadas.

import { F_SOLID, cellOf, flagsAt } from './world';
import { between, inward, pick, take, wallSpots, type Ctx, type Decor } from './maze';

const fits = (c: Ctx, w: number) => c.room.w >= w && c.room.d >= w;

/** Una pintada en una pared libre. */
const writing =
  (pool: readonly string[], color = true): Decor =>
  (c) => {
    const s = wallSpots(c, 0.6);
    if (!s.length) return;
    const p = pick(c.R, s);
    const text = pick(c.R, pool);
    const w = Math.min(3.2, Math.max(1.2, text.length * 0.16));
    if (color) c.b.prop('text', p.x + Math.sin(p.ry) * 0.02, p.z + Math.cos(p.ry) * 0.02, p.ry, { y: c.floor + between(c.R, 1.1, 1.8), text, w });
  };

/** Una nota pegada en la pared. */
const note =
  (pool: readonly [string, string][]): Decor =>
  (c) => {
    const s = wallSpots(c, 0.6);
    if (!s.length) return;
    const p = pick(c.R, s);
    const [title, text] = pick(c.R, pool);
    c.b.note(p.x + Math.sin(p.ry) * 0.05, p.z + Math.cos(p.ry) * 0.05, p.ry, title, text);
  };

/** Muebles junto a las paredes (con su hueco ocupado). */
const alongWalls =
  (n: [number, number], items: readonly { type: string; solid?: [number, number]; depth: number; y?: number }[]): Decor =>
  (c) => {
    const spots = take(c.R, wallSpots(c), Math.round(between(c.R, n[0], n[1] + 0.99)));
    // lo que es muy grande solo cabe en las salas grandes (si no, tapa el paso)
    const ok = items.filter((it) => it.depth <= 1.2 || Math.min(c.room.w, c.room.d) >= 6.5);
    if (!ok.length) return;
    for (const s of spots) {
      const it = pick(c.R, ok);
      const p = inward(s, it.depth / 2 + 0.02);
      const side = Math.abs(Math.sin(p.ry)) > 0.5;
      const solid = it.solid ? ((side ? [it.solid[1], it.solid[0]] : it.solid) as [number, number]) : undefined;
      c.b.prop(it.type, p.x, p.z, p.ry, { solid, y: it.y !== undefined ? c.floor + it.y : undefined });
    }
  };

/** Cosas sueltas por el suelo, lejos de las puertas. */
const scattered =
  (n: [number, number], types: readonly string[], solid?: [number, number]): Decor =>
  (c) => {
    const k = Math.round(between(c.R, n[0], n[1] + 0.99));
    for (let i = 0; i < k; i++) {
      const x = c.room.x + between(c.R, 0.7, c.room.w - 0.7);
      const z = c.room.z + between(c.R, 0.7, c.room.d - 0.7);
      if (c.doors.some((d) => Math.abs((d.dir < 2 ? z : x) - d.p) < d.w / 2 + 0.6 && Math.abs(d.dir === 0 ? c.room.x + c.room.w - x : d.dir === 1 ? x - c.room.x : d.dir === 2 ? c.room.z + c.room.d - z : z - c.room.z) < 1.4)) continue;
      c.b.prop(pick(c.R, types), x, z, c.R() * 6.28, { solid });
    }
  };

const both =
  (...ds: Decor[]): Decor =>
  (c) => {
    for (const d of ds) d(c);
  };

const nothing: Decor = () => {};

/** Columna en medio de la sala. */
const pillar: Decor = (c) => {
  if (!fits(c, 3.4)) return;
  c.b.solid(c.room.x + c.room.w / 2 - 0.3, c.room.z + c.room.d / 2 - 0.3, 0.6, 0.6);
};

/** Techo bajísimo: hay que pasar casi agachado. */
const lowCeil: Decor = (c) => {
  if (c.room.w * c.room.d > 20) return;
  c.b.open(c.room.x, c.room.z, c.room.w, c.room.d, { floor: c.floor, ceil: c.floor + 1.95, lamps: false });
};

/** Escalera pegada a la pared que acaba contra el techo. */
const stairsToNowhere: Decor = (c) => {
  const r = c.room;
  if (r.d < 3.4 || r.w < 3) return;
  // en la pared oeste, si no hay puerta
  if (c.doors.some((d) => d.dir === 1)) return;
  c.b.ramp(r.x, r.z + 0.25, 1, 3, 3, c.floor, c.floor + 1.2, true, c.ceil);
  if ([0, 0.45].every((o) => flagsAt(c.b.map, cellOf(r.x + 0.1 + o), cellOf(r.z - 0.25)) & F_SOLID)) c.b.prop('door2wall', r.x + 0.5, r.z + 0.05, 0, { y: c.floor + 1.2 });
};

/** Un charco y una gotera. */
const puddle: Decor = (c) => {
  const r = c.room;
  c.b.wet(r.x + 0.5, r.z + 0.5, r.w - 1, r.d - 1).deep(r.x + 1, r.z + 1, r.w - 2, r.d - 2, 0.1);
  c.b.prop('drip', r.x + r.w / 2, r.z + r.d / 2, 0, { y: c.ceil - 0.05 });
};

/** Sala a oscuras con una sola bombilla que parpadea. */
const bulb: Decor = (c) => {
  const r = c.room;
  c.b.dark(r.x, r.z, r.w, r.d);
  c.b.prop('bulb', r.x + r.w / 2, r.z + r.d / 2, 0, { y: c.ceil });
  c.b.lamp(r.x + r.w / 2, r.z + r.d / 2, { flicker: true, y: c.ceil - 0.4 });
};

// ============================================================== Nivel 0

export const L0_WRITING = [
  'NO ESTÁS SOLO',
  'YA HAS ESTADO AQUÍ',
  'POR AQUÍ NO',
  'CUENTA LAS PUERTAS',
  'SIGUE EL ZUMBIDO',
  'NO MIRES ATRÁS',
  'SALIDA →',
  '← SALIDA',
  'DÍA 41',
  'ESTO NO ACABA',
  'VUELVE',
  'ME OYE',
  '¿CUÁNTO LLEVO AQUÍ?',
  'LA MOQUETA RESPIRA',
  'NO DUERMAS',
] as const;

export const L0_NOTES: [string, string][] = [
  ['Nota arrugada', 'He pasado por esta sala tres veces. Lo sé porque dejé una nota. Esta nota.'],
  ['Hoja doblada', 'Si encuentras una escalera, súbela. Arriba es igual, pero al menos es otro sitio.'],
  ['Papel húmedo', 'El zumbido cambia de tono cerca de la salida. O eso quiero creer.'],
  ['Nota a lápiz', 'Las paredes se mueven cuando no miras. Mira siempre una.'],
  ['Nota temblorosa', 'Hay un sitio donde el suelo se acaba y se ven pisos y pisos hacia abajo. No te asomes. Te llama.'],
  ['Post-it', 'Algunas puertas dan a una sala sin suelo. Abajo hay otra sala. Duele.'],
  ['Nota manchada', 'Busca la puerta gris de MANTENIMIENTO. Detrás hay una escalera que baja.'],
  ['Trozo de cuaderno', 'Llevo días siguiendo la pared de la derecha. Creo que he vuelto al principio.'],
  ['Nota sin firmar', 'Las figuras no se mueven si las miras. Pero no puedes mirar a todas.'],
  ['Ticket de compra', 'Total: 0,00\nGracias por su visita.\n\nPor detrás: «no hay salida por el techo».'],
];

const OFFICE = [
  { type: 'desk', solid: [1.6, 0.8] as [number, number], depth: 0.8 },
  { type: 'cabinet', solid: [0.6, 0.5] as [number, number], depth: 0.5 },
  { type: 'chairstack', solid: [0.6, 0.6] as [number, number], depth: 0.6 },
];

export const L0_DECOR: Decor[] = [
  nothing,
  nothing,
  alongWalls([1, 1], [{ type: 'outlet', depth: 0, y: 0.35 }]),
  scattered([2, 5], ['chair']),
  alongWalls([1, 2], OFFICE),
  both(alongWalls([1, 1], [{ type: 'desk', solid: [1.6, 0.8], depth: 0.8 }]), scattered([1, 1], ['chair'])),
  alongWalls([1, 1], [{ type: 'bed', solid: [1, 2.1], depth: 2.1 }]),
  alongWalls([2, 4], [{ type: 'door2wall', depth: 0 }]),
  alongWalls([1, 1], [{ type: 'vending', solid: [0.9, 0.85], depth: 0.85 }]),
  alongWalls([1, 3], [{ type: 'painting', depth: 0, y: 1.5 }]),
  writing(L0_WRITING),
  writing(L0_WRITING),
  pillar,
  lowCeil,
  bulb,
  stairsToNowhere,
  puddle,
  scattered([1, 2], ['tile', 'tube']),
  alongWalls([1, 1], [{ type: 'plant', solid: [0.5, 0.5], depth: 0.5 }, { type: 'cooler', solid: [0.4, 0.4], depth: 0.4 }]),
  note(L0_NOTES),
  both(scattered([6, 9], ['chair']), bulb),
];

export const L0_ENDS: Decor[] = [nothing, nothing, nothing, writing(L0_WRITING), note(L0_NOTES), alongWalls([1, 1], [{ type: 'outlet', depth: 0, y: 0.35 }]), scattered([1, 1], ['tile'])];

// ============================================================== Nivel 1

export const L1_WRITING = ['NO CORRAS', 'LUZ = MUERTE', 'M.E.G. →', 'NO ABRAS', 'AQUÍ HUBO GENTE', 'PARPADEO = ESCÓNDETE', 'SECTOR 7', 'NO HAY AGUA', 'CUIDADO ARRIBA'] as const;

export const L1_NOTES: [string, string][] = [
  ['Nota de la M.E.G.', 'Las cajas aparecen a tu espalda. Míralas antes de meter la mano: a veces hay cristales.'],
  ['Nota de un Nómada', 'Para dormir, busca una sala del tamaño de un dormitorio y no cierres la puerta.'],
  ['Nota con letra apretada', 'Cuando se apaguen TODAS las luces, no enciendas la linterna. Quédate quieto contra una pared.'],
  ['Hoja de inventario', 'Pasillo 14: 6 cajas.\nPasillo 15: 6 cajas.\nPasillo 16: no existe.\nPasillo 17: 6 cajas.'],
  ['Nota manchada', 'La sangre roja, vivo.\nLa sangre clara, aléjate.'],
  ['Papel pegado con cinta', 'Las escaleras de este sector suben a un almacén igual que este. Arriba hay huecos en el suelo: mira dónde pisas.'],
  ['Nota de la M.E.G.', 'Para bajar al Nivel 2, busca el depósito inundado. Está lejos de la Sala Manila. Mucho.'],
  ['Nota rota', '…y la puerta daba a una sala sin suelo. Caí al piso de abajo. Me rompí algo. No sé qué.'],
];

const STORE = [
  { type: 'shelf', solid: [3, 0.8] as [number, number], depth: 0.8 },
  { type: 'pallet', solid: [1.2, 1] as [number, number], depth: 1 },
  { type: 'barrel', solid: [0.7, 0.7] as [number, number], depth: 0.7 },
  { type: 'box', solid: [0.6, 0.6] as [number, number], depth: 0.6 },
];

const crates =
  (n: [number, number]): Decor =>
  (c) => {
    for (const s of take(c.R, wallSpots(c), Math.round(between(c.R, n[0], n[1] + 0.99)))) {
      const p = inward(s, 0.45);
      c.b.crate(p.x, p.z, p.ry, pick(c.R, ['comida', 'medico', 'herramientas', 'mixto'] as const));
    }
  };

const megMark: Decor = (c) => {
  const s = wallSpots(c, 0.6);
  if (!s.length) return;
  const p = pick(c.R, s);
  c.b.prop('megcloth', p.x + Math.sin(p.ry) * 0.05, p.z + Math.cos(p.ry) * 0.05, p.ry, { y: c.floor + 2 });
  const q = inward(p, 0.5);
  c.b.item('agua', q.x, q.z);
};

export const L1_DECOR: Decor[] = [
  nothing,
  crates([1, 1]),
  both(alongWalls([1, 3], STORE), crates([0, 1])),
  alongWalls([2, 3], STORE),
  scattered([1, 2], ['debris'], [1.6, 1.2]),
  puddle,
  bulb,
  both(alongWalls([1, 2], [{ type: 'cot', solid: [2, 0.9], depth: 0.9 }]), scattered([1, 1], ['foldchair'])),
  both(alongWalls([1, 1], [{ type: 'desk', solid: [1.6, 0.8], depth: 0.8 }, { type: 'pc', solid: [1.2, 0.8], depth: 0.8 }]), scattered([1, 1], ['chair'])),
  both(alongWalls([2, 3], [{ type: 'padding', depth: 0, y: 0 }]), scattered([1, 1], ['chair'])),
  both(alongWalls([1, 3], [{ type: 'painting', depth: 0, y: 1.5 }]), scattered([1, 2], ['floorpainting'])),
  both(alongWalls([1, 1], [{ type: 'bed', solid: [1, 2.1], depth: 2.1 }]), scattered([0, 1], ['blood'])),
  scattered([2, 4], ['cone']),
  megMark,
  writing(L1_WRITING),
  note(L1_NOTES),
  pillar,
];

export const L1_ENDS: Decor[] = [nothing, nothing, writing(L1_WRITING), note(L1_NOTES), crates([1, 1]), scattered([1, 1], ['box', 'pallet'])];

// ============================================================== Nivel 2

export const L2_WRITING = ['NO ABRAS', 'CALIENTE', 'SIGUE LAS TUBERÍAS', 'NO MIRES LA VENTANA', 'ELLOS OYEN', '↓ ABAJO NO', 'B.N.T.G.'] as const;

export const L2_NOTES: [string, string][] = [
  ['Nota en una tubería', 'Las luces van en serie: si una se rompe, se apaga todo el tramo. Lleva pilas.'],
  ['Diario arrugado', 'Día 40. Vinieron por los túneles de abajo, en manada. Primero el gruñido, luego las uñas en el hormigón.'],
  ['Nota de un trabajador', 'Las rejillas de los túneles de arriba están sueltas. Si pisas una, acabas abajo.'],
  ['Escrito con rotulador', 'NO ABRAS LAS PUERTAS QUE DAN A LO NEGRO.\nDentro no hay nada. Nada de nada.'],
  ['Nota sudada', 'La salida al Nivel 3 está lejos de donde llegas. Muy lejos. Sigue las tuberías gruesas.'],
  ['Hoja quemada', 'Los Clumps esperan en las esquinas. Si oyes pasos que no son tuyos, quédate quieto.'],
];

const MACHINES = [
  { type: 'machine', solid: [0.8, 2.4] as [number, number], depth: 0.8 },
  { type: 'tank', solid: [2.4, 2.4] as [number, number], depth: 2.4 },
  { type: 'barrel', solid: [0.7, 0.7] as [number, number], depth: 0.7 },
  { type: 'trolley', solid: [1.2, 0.7] as [number, number], depth: 0.7 },
  { type: 'gauge', depth: 0, y: 1.5 },
  { type: 'valve', depth: 0, y: 1.2 },
];

const steam: Decor = (c) => c.b.vent(c.room.x + c.room.w / 2, c.room.z + c.room.d / 2, 5 + c.R() * 5);

const window_: Decor = (c) => {
  const s = wallSpots(c, 0.3);
  if (!s.length) return;
  const p = pick(c.R, s);
  c.b.window(p.x + Math.sin(p.ry) * 0.05, p.z + Math.cos(p.ry) * 0.05, p.ry);
};

const steelDoor: Decor = (c) => {
  const s = wallSpots(c, 0.3);
  if (!s.length) return;
  const p = pick(c.R, s);
  c.b.door(p.x + Math.sin(p.ry) * 0.05, p.z + Math.cos(p.ry) * 0.05, p.ry, { look: c.R() < 0.7 ? 'steel' : 'white', locked: true, window: c.R() < 0.4 });
};

const violet: Decor = (c) => c.b.prop('violet', c.room.x + c.room.w / 2, c.room.z + c.room.d / 2, 0, { y: c.ceil - 0.05 });

export const L2_DECOR: Decor[] = [
  alongWalls([1, 3], MACHINES),
  alongWalls([2, 4], MACHINES),
  both(alongWalls([1, 2], MACHINES), steam),
  scattered([1, 3], ['toolbox', 'wires', 'cords', 'glass', 'paper', 'foldchair', 'woodpile', 'ladder']),
  both(alongWalls([1, 1], [{ type: 'cot', solid: [2, 0.9], depth: 0.9 }]), scattered([1, 1], ['paper'])),
  steelDoor,
  violet,
  writing(L2_WRITING),
  note(L2_NOTES),
  bulb,
];

export const L2_ENDS: Decor[] = [nothing, window_, window_, steelDoor, steelDoor, violet, writing(L2_WRITING), note(L2_NOTES), scattered([1, 1], ['toolbox', 'wires', 'paper', 'glass'])];
