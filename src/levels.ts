// Diseño de los niveles. Coordenadas en metros: x hacia la derecha, z hacia
// abajo (sur). Orientación de objetos y puertas (ry): 0 mira al sur (+z),
// PI al norte (-z), PI/2 al este (+x), -PI/2 al oeste (-x).
//
// Materiales de pared/suelo/techo: el número elige la variante de textura del
// tema del nivel (ver textures.ts).

import { Builder, type LevelDef, type LevelMap } from './world';

const N = Math.PI;
const S = 0;
const E = Math.PI / 2;
const W = -Math.PI / 2;

export const LEVELS: LevelDef[] = [
  {
    name: 'Nivel 0',
    title: 'El Vestíbulo',
    theme: 'lobby',
    lampSpacing: 3,
    lampRadius: 6.5,
    lampPower: 0.85,
    flickerChance: 0.12,
    ambient: 0.025,
    tint: [1, 0.95, 0.78],
    sanityDrain: 0.25,
    staminaRegen: 1,
    fog: { color: 0x3a3218, near: 6, far: 36 },
    blackouts: false,
  },
  {
    name: 'Nivel 1',
    title: 'Zona Habitable',
    theme: 'habitable',
    lampSpacing: 7,
    lampRadius: 10,
    lampPower: 0.8,
    flickerChance: 0.2,
    ambient: 0.02,
    tint: [0.85, 0.93, 1],
    sanityDrain: 0.35,
    staminaRegen: 1,
    fog: { color: 0x121518, near: 3, far: 32 },
    blackouts: true,
  },
  {
    name: 'Nivel 2',
    title: 'Tuberías',
    theme: 'pipes',
    lampSpacing: 6,
    lampRadius: 5,
    lampPower: 0.6,
    flickerChance: 0.35,
    ambient: 0.012,
    tint: [1, 0.55, 0.3],
    sanityDrain: 0.5,
    staminaRegen: 0.6,
    fog: { color: 0x150b06, near: 1, far: 20 },
    blackouts: false,
  },
];

/** Nivel especial: el jugador ha escapado de los Backrooms. */
export const ESCAPED = LEVELS.length;

// ---------------------------------------------------------------------------
// NIVEL 0 — El Vestíbulo
// Papel pintado amarillo, moqueta húmeda y fluorescentes que zumban. Salas
// de formas irregulares, una sala de columnas con una zona hundida, un
// pasillo de techo bajo, una sala altísima con escaleras que no llevan a
// ninguna parte, una gran zona a oscuras, "Las Caídas" (suelo a distintas
// alturas con agujeros que dejan caer al Nivel 1), oficinas abandonadas y la
// escalera de salida.
// Paredes: 0 papel amarillo, 1 papel viejo y manchado, 2 pintura de oficina.
// Suelos: 0 moqueta, 1 moqueta empapada, 2 linóleo. Techos: 0 placas, 1 placas rotas.
// ---------------------------------------------------------------------------
function level0(): LevelMap {
  const b = new Builder(0, LEVELS[0], 96, 72, { ceil: 2.8 });

  // sala inicial
  b.open(2, 2, 12, 10).spawn(8, 7);
  b.prop('outlet', 2.05, 9, E, { y: 0.35 }).prop('vent', 8, 2.05, S, { y: 2.3 });
  b.glitch(13.95, 3.5, W, 1.2, 1.6);

  // pasillo a la sala de columnas
  b.open(14, 5, 6, 2);

  // sala de columnas con zona hundida en el centro
  b.open(20, 2, 26, 20, { ceil: 3.2 });
  b.open(27, 8, 12, 8, { floor: -0.75, ceil: 3.2, floorMat: 1 }).wet(29, 10, 5, 4);
  b.ramp(27, 6.5, 12, 1.5, 3, -0.75, 0, true, 3.2);
  b.ramp(27, 16, 12, 1.5, 2, -0.75, 0, true, 3.2);
  for (let x = 22; x <= 44; x += 4) {
    for (let z = 4; z <= 20; z += 4) {
      if (x > 26 && x < 40 && z > 6 && z < 18) continue;
      b.solid(x - 0.25, z - 0.25, 0.5, 0.5);
    }
  }
  b.prop('chair', 33, 12.5, 2.2).prop('tile', 30, 9.5, 0.4).prop('hole', 30, 9.5, 0, { y: 3.2 });
  b.prop('hole', 36, 14, 0, { y: 3.2 }).prop('tube', 35.4, 13.2, 1.1);
  b.prop('hanglamp', 42, 18, 0.3);
  b.glitch(45.95, 13, W, 2, 2.2);

  // pasillo de techo bajo hacia la sala alta
  b.open(46, 4, 14, 2, { ceil: 2.05, lamps: 2.5 });

  // sala altísima con escaleras hacia el techo y una puerta en lo alto
  b.open(60, 2, 12, 12, { ceil: 7, lamps: 4 });
  b.ramp(62, 7, 1.5, 6, 3, 0, 3, true, 7);
  b.prop('door2wall', 66, 2.05, S, { y: 4.2 }).prop('door2wall', 71.45, 11.5, W);
  b.prop('outlet', 70, 13.95, N, { y: 5.5 }).prop('chair', 68, 11, 0.8);

  // gran zona a oscuras al este (con columnas y tabiques sueltos)
  b.open(72, 2, 22, 26, { dark: true, floorMat: 1, ceilMat: 1 });
  b.solid(71.5, 2, 0.5, 12, 1).open(71.5, 8, 0.5, 2, { dark: true });
  for (const [x, z] of [[76, 6], [82, 6], [88, 6], [76, 14], [88, 14], [82, 20], [76, 24], [90, 22]]) b.solid(x, z, 1, 1, 1);
  b.solid(80, 10, 6, 0.5, 1).solid(84, 15, 0.5, 6, 1).solid(78, 18, 0.5, 5, 1);
  b.wallMat(71, 1, 24, 28, 1).wet(80, 3, 6, 4).wet(86, 24, 6, 3);
  b.lamp(80, 12, { broken: true }).lamp(90, 18, { broken: true }).lamp(86, 4, { flicker: true });
  b.lair('smiler', 90, 4).lair('smiler', 80, 25).lair('smiler', 88, 12);
  b.item('agua', 92, 26).item('pila', 74, 4);
  b.glitch(93.95, 16, W, 2.5, 2.4).prop('door2wall', 72.05, 20, E);

  // laberinto oeste: pasillos estrechos y salas pequeñas
  b.open(4, 12, 2, 9);
  b.open(2, 21, 16, 2);
  b.open(2, 23, 6, 8, { wall: 1, ceilMat: 1 });
  b.open(10, 25, 8, 5, { wall: 1 }).open(12, 23, 2, 2);
  b.prop('chairstack', 3.5, 29, 0.3, { solid: [1, 1] }).item('pila', 6.5, 24);
  b.open(4, 31, 2, 5);
  b.open(2, 36, 10, 4, { wall: 1 }).item('agua', 3, 38.5);
  // pasillo sin salida: la pared del fondo falla y se puede atravesar (al Nivel 1)
  b.open(12, 32, 8, 2, { lamps: 3 }).open(11, 34, 2, 2);
  b.glitch(19.95, 33, W, 1.6, 2.2, true);
  b.prop('text', 19.95, 33, W, { y: 2.45, text: '¿?', w: 0.5 });

  // pasillo largo que lo une todo
  b.open(18, 24, 40, 2.5).open(30, 22, 2, 2);
  b.prop('tube', 40, 25.3, 0.2).prop('outlet', 50, 24.05, S, { y: 0.35 });
  b.glitch(57.95, 25.2, W, 2.4, 2.6);

  // LAS CAÍDAS: suelo a varias alturas y agujeros que caen al Nivel 1
  b.open(48, 26.5, 2.5, 3.5);
  b.open(40, 30, 30, 28, { ceil: 3.8, lamps: 6, floorMat: 1, ceilMat: 1 });
  b.open(44, 34, 8, 6, { floor: 1, ceil: 3.8, lamps: 4 });
  b.ramp(44, 40, 2, 3, 3, 0, 1, true, 3.8);
  b.open(56, 32, 10, 6, { floor: 1.8, ceil: 3.8, lamps: 4 });
  b.ramp(52, 35, 4, 2, 0, 1, 1.8, false, 3.8);
  b.pit(46, 46, 4, 3).pit(54, 42, 3, 6).pit(60, 48, 6, 4).pit(64, 38.5, 2, 3).pit(41, 54, 3, 2);
  b.open(42, 52, 14, 3, { floor: -1.2, ceil: 3.8 });
  b.ramp(56, 52, 4, 3, 0, -1.2, 0, true, 3.8);
  b.prop('tile', 50, 44, 1.3).prop('tile', 62, 46, 0.2).prop('hole', 58, 47, 0, { y: 3.8 });
  b.prop('hanglamp', 48, 50, 1.2).prop('text', 40.05, 44, E, { y: 1.5, text: 'NO MIRES ABAJO', w: 2.2 });
  b.lamp(68, 56, { broken: true }).dark(64, 52, 6, 6).lair('smiler', 67, 55);
  b.item('vendas', 60, 35).item('agua', 47, 36).item('barrita', 52, 53.5);
  b.glitch(69.95, 44, W, 3, 3);

  // conexión de la zona oscura con Las Caídas
  b.open(74, 28, 2.5, 10, { dark: true }).open(70, 35.5, 4.5, 2.5, { dark: true });

  // oficinas abandonadas (suroeste)
  b.open(6, 40, 2, 2);
  b.open(2, 42, 28, 16, { wall: 2, floorMat: 2, ceil: 2.7, lamps: 3.5 });
  for (const z of [44, 50]) {
    for (const x of [4, 10, 16, 22]) {
      b.prop('partition', x + 2, z, S, { solid: [4, 0.5], w: 4 });
      b.prop('partition', x, z + 2, E, { solid: [3.5, 0.5], w: 3.5 });
      b.prop('desk', x + 2, z + 1.2, N, { solid: [1.6, 0.8] });
      b.prop('chair', x + 1.7, z + 2.6, N + (x % 3) * 0.4);
    }
  }
  b.prop('cabinet', 28.6, 43.5, W, { solid: [0.6, 0.6] }).prop('cabinet', 28.6, 44.3, W, { solid: [0.6, 0.6] });
  b.prop('plant', 2.8, 56.8, 0, { solid: [0.6, 0.6] }).prop('plant', 29, 56.8, 0, { solid: [0.6, 0.6] });
  b.prop('tile', 13, 56, 0.7).prop('hole', 13, 56, 0, { y: 2.7 }).prop('box', 25, 56.5, 0.4, { solid: [0.6, 0.6] });
  b.item('pila', 11, 47).item('agua', 23, 53);
  b.solid(2, 58, 28, 0.5, 2).open(5, 58, 2, 0.5).open(18, 58, 2, 0.5);
  // sala de descanso y despacho
  b.open(2, 58.5, 11, 10, { wall: 2, floorMat: 2, ceil: 2.7, lamps: 3.5 });
  b.prop('vending', 3, 64, E, { solid: [1, 0.9] }).prop('cooler', 3, 61, E, { solid: [0.5, 0.5] });
  b.prop('table', 8, 64, 0.1, { solid: [1.6, 1] }).prop('chair', 8, 62.6, 0).prop('chair', 9, 65.6, N);
  b.item('barrita', 8.2, 64).item('vendas', 11.5, 67);
  b.open(14, 58.5, 10, 9, { wall: 2, floorMat: 2, ceil: 2.7, lamps: 4, dark: true });
  b.lamp(19, 63, { flicker: true });
  b.prop('desk', 19, 61, S, { solid: [1.6, 0.8] }).prop('chair', 19, 60, 0.4).prop('cabinet', 23.6, 60, W, { solid: [0.6, 0.6] });
  b.prop('text', 14.05, 63, E, { y: 1.6, text: 'NO ESTÁS SOLO', w: 2 });

  // de las oficinas a Las Caídas
  b.open(30, 48, 10, 2);

  // escalera de salida (bajando hacia el Nivel 1)
  b.open(64, 58, 4, 4);
  b.open(62, 62, 8, 8, { ceil: 3 });
  b.ramp(70, 62.5, 8, 3, 1, -2.5, 0, true, 3);
  b.open(78, 62, 6, 8, { floor: -2.5, ceil: 0.6, lamps: 3, wall: 1 });
  b.exit(83.9, 66, W, 'SALIDA ↓ NIVEL 1');
  b.prop('text', 62.05, 65, E, { y: 1.8, text: '↓ ESCALERAS', w: 2 });
  b.solid(70, 65.5, 8, 4.5).item('agua', 80, 68.5);

  return b.build();
}

// ---------------------------------------------------------------------------
// NIVEL 1 — Zona Habitable
// Un almacén enorme de hormigón: columnas, estanterías, palés y bidones,
// charcos, niebla y fluorescentes que a veces se apagan del todo. Un muelle
// de carga elevado, un puesto de la M.E.G. con suministros, un sector a
// oscuras y un sótano inundado donde está la escalera al Nivel 2. Las cajas
// de suministros contienen objetos.
// Paredes: 0 bloques de hormigón, 1 pintura verde de oficina, 2 hormigón sucio.
// Suelos: 0 hormigón, 1 hormigón mojado, 2 suelo pintado. Techos: 0 hormigón.
// ---------------------------------------------------------------------------
function level1(): LevelMap {
  const b = new Builder(1, LEVELS[1], 100, 80, { ceil: 5.5 });

  // llegada y muelle de carga elevado
  b.open(2, 2, 8, 8, { floor: 1.2, ceil: 4.2, lamps: 4, wall: 2 }).spawn(5, 6);
  b.open(10, 5, 2, 2.5, { floor: 1.2, ceil: 4.2 });
  b.open(12, 2, 40, 10, { floor: 1.2, ceil: 6.5, lamps: 8, floorMat: 2 });
  for (const x of [16, 24, 32, 40, 48]) b.prop('dockdoor', x, 2.05, S, { y: 1.2 });
  b.prop('pallet', 18, 6, 0.1, { solid: [1.2, 1] }).prop('pallet', 18, 6, 0.1, { y: 1.35 });
  b.prop('barrel', 30, 4, 0, { solid: [0.7, 0.7] }).prop('barrel', 30.8, 4.3, 0, { solid: [0.7, 0.7] });
  b.crate(44, 6, 0.3, ['agua', 'barrita']);
  b.prop('text', 12.05, 7, E, { y: 2.5, text: 'MUELLE 3', w: 2.2 });

  // almacén principal
  b.open(2, 12, 60, 40, { ceil: 6.5 });
  b.ramp(24, 12, 4, 4, 3, 0, 1.2, false, 6.5);
  b.ramp(40, 12, 2, 2.5, 3, 0, 1.2, true, 6.5);
  for (const x of [10, 20, 30, 40, 50]) for (const z of [20, 30, 40]) b.solid(x - 0.5, z - 0.5, 1, 1);
  // estanterías en filas
  for (const [x, z] of [[6, 22], [6, 32], [14, 22], [14, 32], [34, 22], [34, 32], [44, 22], [44, 32]] as const) {
    b.prop('shelf', x, z + 3, 0, { solid: [1.2, 6], d: 6 });
  }
  b.prop('forklift', 26, 36, 0.6, { solid: [1.4, 2.4] });
  b.prop('pallet', 25, 25, 0.2, { solid: [1.2, 1] }).prop('pallet', 52, 45, 1.4, { solid: [1.2, 1] });
  b.prop('barrel', 55, 20, 0, { solid: [0.7, 0.7] }).prop('barrel', 56, 20.6, 0, { solid: [0.7, 0.7] }).prop('barrel', 55.4, 21.4, 0, { solid: [0.7, 0.7] });
  b.prop('cone', 22, 45, 0).prop('cone', 23, 46, 0).prop('cone', 30, 50, 0);
  b.wet(18, 40, 6, 4).wet(46, 26, 4, 3).wet(8, 46, 5, 3);
  b.crate(4, 14, 0, ['pila', 'agua']).crate(58, 48, 0.4, ['vendas']).crate(38, 46, 1.1, ['barrita', 'pila']);
  b.item('agua', 20, 34).item('pila', 47, 16);
  b.lair('faceling', 18, 28).lair('faceling', 48, 38);
  b.prop('text', 2.05, 30, E, { y: 2, text: 'NO CORRAS', w: 2.4 });
  b.prop('fog', 30, 28, 0).prop('fog', 12, 42, 0);

  // puesto de la M.E.G. (este)
  b.open(62, 18, 2, 2.5, { ceil: 3 });
  b.open(64, 12, 16, 14, { ceil: 3, wall: 1, floorMat: 2, lamps: 4 });
  b.solid(72, 12, 0.5, 9, 1).open(72, 16, 0.5, 2);
  b.prop('meg', 68, 14.5, S, { solid: [2, 1] }).prop('text', 64.05, 16, E, { y: 1.9, text: 'M.E.G. PUESTO 1', w: 2.6 });
  b.prop('cot', 75, 13.5, S, { solid: [2, 0.9] }).prop('cot', 78, 13.5, S, { solid: [2, 0.9] }).prop('radio', 79, 24, N, { solid: [0.5, 0.5] });
  b.crate(66, 24, 0, ['agua', 'vendas']).crate(77, 20, 0.2, ['pila', 'barrita']);
  b.item('agua', 70, 14.4);

  // pasillo al sector oscuro
  b.open(64, 26, 3, 14, { ceil: 3, wall: 2, lamps: 5 });
  b.lamp(65.5, 36, { flicker: true });

  // sector a oscuras
  b.open(64, 40, 34, 18, { ceil: 5, dark: true, floorMat: 1 });
  for (const x of [70, 78, 86, 94]) for (const z of [44, 51]) b.solid(x - 0.5, z - 0.5, 1, 1, 2);
  b.prop('barrel', 74, 48, 0, { solid: [0.7, 0.7] }).prop('pallet', 90, 55, 0.3, { solid: [1.2, 1] });
  b.lamp(80, 48, { broken: true }).lamp(92, 44, { broken: true });
  b.lair('smiler', 92, 42).lair('smiler', 84, 55).lair('hound', 76, 55);
  b.crate(95, 56, 0, ['agua', 'pila']).item('vendas', 66, 56.5);
  b.prop('fog', 82, 50, 0);

  // sótano inundado (más bajo), con rampa y escaleras desde el almacén
  b.open(20, 56, 44, 20, { floor: -2.5, ceil: 3, floorMat: 1, lamps: 8, wall: 2 });
  b.open(64, 62, 12, 14, { floor: -2.5, ceil: 3, floorMat: 1, lamps: 8, wall: 2 });
  b.ramp(30, 52, 5, 4, 3, -2.5, 0, false, 6.5);
  b.ramp(55, 52, 2, 4, 3, -2.5, 0, true, 6.5);
  b.ramp(72, 58, 3, 4, 3, -2.5, 0, true, 5);
  b.wet(22, 60, 20, 10).wet(46, 64, 14, 8).wet(62, 70, 10, 5);
  for (const x of [28, 40, 52, 64]) b.solid(x - 0.5, 66 - 0.5, 1, 1, 2);
  b.dark(56, 66, 20, 10).lamp(66, 70, { flicker: true });
  b.lair('hound', 48, 72).lair('faceling', 34, 62).lair('smiler', 72, 72);
  b.crate(22, 74, 0.2, ['agua', 'vendas']).item('pila', 44, 58);
  b.prop('barrel', 58, 58, 0, { solid: [0.7, 0.7] }).prop('fog', 36, 68, 0).prop('fog', 60, 70, 0);
  b.exit(66, 75.95, N, 'ESCALERA → NIVEL 2');
  b.prop('text', 60, 75.95, N, { y: 1.8, text: '→ ABAJO', w: 1.8 });

  return b.build();
}

// ---------------------------------------------------------------------------
// NIVEL 2 — Tuberías
// Túneles de mantenimiento estrechos y calurosos, llenos de tuberías, con
// bombillas rojizas y mucha oscuridad. Dos alturas unidas por escaleras y un
// salto sin vuelta, una sala de calderas y escapes de vapor que queman.
// Paredes: 0 hormigón sucio, 1 metal oxidado. Suelos: 0 rejilla, 1 hormigón.
// ---------------------------------------------------------------------------
function level2(): LevelMap {
  const b = new Builder(2, LEVELS[2], 84, 64, { ceil: 2.6 });
  const t = 2; // ancho de los túneles

  // llegada
  b.open(2, 2, 8, 6, { lamps: 3, floorMat: 1 }).spawn(4, 5);
  b.prop('text', 2.05, 4, E, { y: 1.6, text: 'NIVEL 2', w: 1.6 });

  // red superior
  b.corridor([[6, 5], [40, 5], [78, 5], [78, 20]], t, { dark: true });
  b.corridor([[14, 5], [14, 34]], t, { dark: true });
  b.corridor([[14, 20], [40, 20]], t, { dark: true });
  b.corridor([[40, 5], [40, 24], [60, 24]], t, { dark: true });
  b.corridor([[60, 6], [60, 40]], t, { dark: true });
  b.corridor([[24, 20], [24, 12]], 2, { dark: true });
  b.corridor([[30, 20], [30, 40]], t, { dark: true });
  b.corridor([[60, 14], [78, 14]], 2, { dark: true });
  // luces sueltas a lo largo de los túneles
  for (const [x, z] of [[10, 5], [26, 5], [48, 5], [66, 5], [14, 14], [14, 28], [32, 20], [40, 14], [50, 24], [60, 32], [78, 12], [30, 32]]) {
    b.lamp(x, z, { flicker: (x + z) % 3 === 0 });
  }

  // sala de calderas
  b.open(44, 9, 12, 10, { ceil: 4.5, wall: 1, floorMat: 1, lamps: 5 }).open(41, 11.5, 3, 2).open(56, 15, 3, 2);
  b.prop('tank', 47, 12, 0, { solid: [2.4, 2.4] }).prop('tank', 53, 12, 0, { solid: [2.4, 2.4] }).prop('tank', 47, 16.5, 0, { solid: [2.4, 2.4] });
  b.prop('gauge', 55.95, 11, W, { y: 1.5 }).prop('valve', 44.05, 16, E, { y: 1.2 });
  b.item('agua', 53, 17).vent(50, 17.5, 6);

  // escaleras a la red inferior y salto sin vuelta
  b.ramp(13, 34, 2, 6, 3, -2.4, 0, true);
  b.ramp(59, 40, 2, 4, 3, -2.4, 0, true);
  b.open(29, 41, 2, 2, { floor: -2.4, dark: true });

  // red inferior
  const low = { floor: -2.4, dark: true };
  b.corridor([[14, 41], [14, 58], [50, 58]], t, low);
  b.corridor([[30, 44], [70, 44], [70, 60]], t, low);
  b.corridor([[50, 44], [50, 58]], t, low);
  b.corridor([[22, 58], [22, 50]], 2, low);
  b.open(36, 50, 10, 6, { floor: -2.4, ceil: -0.4, wall: 1, floorMat: 1, lamps: 5 });
  b.open(38, 45, 2, 5, { floor: -2.4, dark: true });
  b.prop('tank', 43, 53, 0, { solid: [2.4, 2.4] }).prop('valve', 36.05, 52, E, { y: -1.3 });
  for (const [x, z] of [[14, 48], [30, 58], [44, 44], [62, 44], [70, 52], [50, 52]]) b.lamp(x, z, { flicker: true });

  // vapor, objetos y criaturas
  for (const [x, z] of [[26, 5], [40, 16], [60, 30], [14, 52], [44, 58], [70, 48]]) b.vent(x, z);
  b.item('pila', 24, 12.5).item('vendas', 78, 19).item('agua', 22, 50.5).item('pila', 66, 14).item('barrita', 30, 39);
  b.item('vendas', 49, 50);
  b.prop('barrel', 77, 7, 0, { solid: [0.7, 0.7] }).prop('wires', 40, 20, 0).prop('wires', 14, 46, 0).prop('wires', 60, 36, 0);
  b.prop('metaldoor', 40.95, 30, W).prop('metaldoor', 78.95, 10, W).prop('metaldoor', 14.95, 56, W);
  b.lair('smiler', 34, 5).lair('smiler', 60, 34).lair('smiler', 22, 56);
  b.lair('hound', 50, 56).lair('skinstealer', 78, 18).lair('skinstealer', 64, 44);
  b.exit(70, 60.95, N, 'SALIDA');

  return b.build();
}

const builders = [level0, level1, level2];
const cache = new Map<number, LevelMap>();

export function getMap(level: number): LevelMap {
  let map = cache.get(level);
  if (!map) {
    map = builders[level]();
    cache.set(level, map);
  }
  return map;
}
