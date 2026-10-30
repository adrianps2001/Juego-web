// Diseño de los niveles, basado en la Backrooms Wiki (backrooms-wiki.wikidot.com,
// CC BY-SA 3.0). Coordenadas en metros: x hacia la derecha, z hacia abajo
// (sur). Orientación de objetos y puertas (ry): 0 mira al sur (+z), PI al
// norte (-z), PI/2 al este (+x), -PI/2 al oeste (-x).
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
    fog: { color: 0x3a3218, near: 6, far: 36 },
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
    fog: { color: 0x121518, near: 3, far: 34 },
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
// NIVEL 0 — «El Umbral»
// Laberinto amarillo de salas y pasillos al azar, con escalones; moqueta
// beis empapada y fluorescentes que zumban. Variaciones de la wiki:
//  - Salas de columnas en cuadrícula (moqueta más seca), enormes.
//  - Zonas de arcos: paredes pálidas con huecos en arco, moqueta muy húmeda.
//  - Agujeros en cuadrícula, negros: nadie ha sobrevivido a una caída.
//  - Zonas de apagón: sin luz, paredes rugosas, suelo con fluido.
//  - Habitaciones Rojas: el papel se despega; el pasillo no tiene fin.
//  - «Cambio periférico»: partes del laberinto cambian cuando nadie mira.
//  - Entidades: no confirmadas. Solo figuras oscuras que acechan.
// Además, plantas unas encima de otras: oficinas de dos pisos, un gran atrio
// con balcones, una planta de arriba con huecos que caen a la sala de
// columnas y una pasarela sobre los agujeros. Se sale por una escalera de
// mantenimiento que baja y baja hasta el Nivel 1.
// Plantas: 0 = suelo (y 0), 1 = arriba (y 4,6).
// Paredes: 0 amarillo · 1 pálido · 2 oficina · 3 yeso rugoso · 4 rojo despegado
// Suelos: 0 moqueta · 1 linóleo · 2 moqueta seca · 3 moqueta roja
// ===========================================================================
const UP0 = { floor: 4.6, ceil: 7.4 };

function level0(): LevelMap {
  const b = new Builder(0, LEVELS[0], 190, 150, { ceil: 2.8 });
  b.storey(1, 7.4).storey(0);

  // ---- donde te despiertas ----
  b.open(2, 2, 14, 12).spawn(6, 6, S);
  b.solid(9, 2, 0.5, 5).solid(2, 9, 5, 0.5);
  b.prop('outlet', 2.05, 12, E, { y: 0.35 }).prop('vent', 12, 2.05, S, { y: 2.3 });
  b.note(2.05, 5, E, 'Nota arrugada', 'Si lees esto, has hecho noclip. Estás en el Nivel 0.\n\nNo te acerques a los agujeros del suelo. Hay pisos encima de pisos: algunos suelos están rotos y se cae a lo de abajo.\n\nPara salir, busca una puerta gris de MANTENIMIENTO, al sureste, más allá de las terrazas. Detrás hay una escalera que no deja de bajar.');

  // ---- laberinto de salas y pasillos ----
  b.open(16, 5, 8, 2);
  b.open(24, 2, 10, 8).solid(28, 5, 1, 1);
  b.open(34, 4, 8, 2);
  b.open(26, 10, 2, 8);
  b.open(16, 18, 26, 2.5);
  b.open(4, 14, 2, 8);
  b.open(2, 22, 12, 8, { ceilMat: 1 }).solid(7, 22, 0.5, 4);
  b.open(14, 24, 2, 2).open(16, 18, 2, 8);
  // escaleras a una sala elevada y, desde ella, otra que sube a la planta de arriba
  b.ramp(34, 20.5, 2, 3, 2, 0, 1.2, true, 4);
  b.open(30, 23.5, 8, 8, { floor: 1.2, ceil: 4.2, lamps: 3.5 });
  b.ramp(30, 31.5, 2, 3, 3, 0, 1.2, true, 4);
  b.ramp(38, 24, 2, 10, 2, 1.2, UP0.floor, true, 4.2);
  b.open(26, 34.5, 12, 2);
  // la sala pequeña (tranquila)
  b.open(20, 28, 6, 5, { wall: 2, floorMat: 1, lamps: 3 }).open(22, 33, 2, 1.5).open(22, 34.5, 4, 2);
  b.note(20.05, 30.5, E, 'Escrito en la pared', 'AQUÍ NO LLEGA EL ZUMBIDO.\nDESCANSA.\nNO SALGAS SOLO.', true, 1.5);
  b.open(6, 30, 2, 8).open(2, 38, 30, 2).open(28, 36.5, 2, 1.5);
  b.open(10, 40, 2, 6);
  // cambio periférico: pares de huecos que se turnan
  b.shift(26, 12, 2, 0.5, true).shift(34, 4, 0.5, 2, false, 0, true);
  b.shift(14, 24, 0.5, 2, false).shift(6, 30, 2, 0.5, true, 0, true);
  b.shift(20, 38, 0.5, 2, true).shift(28, 36.5, 2, 0.5, false, 0, true);
  b.prop('tile', 9, 26, 0.5).prop('hole', 9, 26, 0, { y: 2.8 }).prop('tube', 36, 25.5, 1.3, { y: 1.2 });
  b.lair('figure', 33, 8).lair('figure', 3, 39);
  b.item('agua', 3, 28).item('pila', 33, 8.5);
  b.zone('whisper', 2, 22, 12, 8);

  // ---- sala de columnas (enorme, en cuadrícula) ----
  b.open(42, 2, 44, 28, { ceil: 3.2, floorMat: 2 }).open(40, 18, 2, 2.5);
  for (let x = 44.5; x < 86; x += 3) {
    for (let z = 4.5; z < 30; z += 3) {
      // algunas columnas desplazadas: el cambio periférico las descuadra
      const off = Math.round(x * 7 + z * 3) % 5 === 0 ? 0.5 : 0;
      b.solid(x - 0.25 + off, z - 0.25, 0.5, 0.5);
    }
  }
  b.shift(65.25, 13.25, 1, 1, false).shift(68.25, 16.25, 1, 1, true, 0, true);
  b.lair('figure', 84, 4).lair('figure', 60, 28);
  b.item('agua', 70, 10).item('barrita', 52, 26);
  b.prop('text', 42.05, 10, E, { y: 1.6, text: 'ELIGE UN RUMBO', w: 2.4 });

  // ---- agujeros en cuadrícula ----
  b.open(50, 30, 3, 4);
  b.open(44, 34, 26, 22, { ceil: 3, lamps: 4.5, ceilMat: 1 });
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 5; gz++) b.pit(46 + gx * 3.5, 36 + gz * 3.5, 1.5, 1.5);
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 3; gz++) b.pit(60 + gx * 2.5, 46 + gz * 2.5, 1.5, 1.5);
  b.item('vendas', 68.5, 54.5).prop('text', 44.05, 40, E, { y: 1.6, text: 'NO HAY FONDO', w: 2 });
  b.note(44.05, 46, E, 'Hoja de libreta', 'Tiré una pila por uno de los agujeros. Nunca la oí llegar.\n\nHay una pasarela por encima. Si te caes desde ahí, reza para no acertar en un agujero.');

  // ---- zona de arcos (paredes pálidas, moqueta empapada, estable) ----
  b.open(30, 52, 14, 2);
  b.open(2, 46, 28, 34, { wall: 1, lamps: 3.5 });
  for (const x of [9.5, 16.5, 23.5]) {
    b.solid(x, 46, 0.5, 34, 1);
    for (const z of [48.5, 55.5, 62.5, 69.5, 76.5]) if ((x + z) % 3 !== 0) b.arch(x, z, 0.5, 1.6, 2.2, E);
  }
  for (const z of [57.5, 68.5]) {
    b.solid(2, z, 28, 0.5, 1);
    for (const x of [5, 12.5, 19.5, 26.5]) b.arch(x, z, 1.6, 0.5, 2.2, S);
  }
  b.prop('blindarch', 2.05, 51, E, { w: 1.6, h: 2.2 }).prop('blindarch', 29.95, 74, W, { w: 1.6, h: 2.2 }).prop('blindarch', 6, 79.95, N, { w: 1.6, h: 2.2 });
  b.deep(2, 46, 28, 34, 0.12);
  b.item('agua', 4, 78).item('barrita', 27.5, 78);
  b.prop('text', 2.05, 63, E, { y: 1.5, text: 'AQUÍ NADA SE MUEVE', w: 2.6 });

  // ---- zona de apagón ----
  b.open(70, 40, 2, 2, { dark: true }).open(80, 30, 2, 2, { dark: true });
  b.open(72, 32, 36, 30, { dark: true, wall: 3, ceilMat: 1 });
  b.solid(80, 32, 0.5, 10, 3).solid(80, 46, 0.5, 16, 3).solid(88, 38, 0.5, 24, 3).solid(96, 32, 0.5, 18, 3).solid(96, 54, 0.5, 8, 3);
  b.solid(80, 46, 5, 0.5, 3).solid(88, 50, 5, 0.5, 3).solid(100, 44, 8, 0.5, 3);
  b.deep(72, 32, 36, 30, 0.15);
  b.lamp(76, 36, { broken: true }).lamp(92, 56, { broken: true });
  b.lair('figure', 104, 35).lair('figure', 84, 58).lair('figure', 92, 40);
  b.item('pila', 100, 35);
  b.note(72.05, 36, E, 'Nota casi ilegible', 'Aquí no llega el zumbido. Aquí no llega la luz.\nHay figuras al fondo que solo se mueven cuando no miras.\nEl suelo está hundido y mojado: no corras.');
  b.prop('text', 72.05, 45, E, { y: 1.6, text: 'SIGUE EL ZUMBIDO', w: 2.6 });

  // ---- Habitaciones Rojas ----
  b.open(90, 62, 2.5, 6, { wall: 4, lamps: 3 });
  b.open(80, 68, 20, 6, { wall: 4, floorMat: 3, lamps: 3.5 });
  b.open(98, 74, 2, 2, { floorMat: 3 });
  // el pasillo que no se acaba: se repite cada 12 m y la niebla roja no deja ver los extremos
  b.open(74, 76, 34, 3.5, { wall: 4, floorMat: 3, lamps: false });
  for (let x = 75.5; x < 108; x += 3) b.lamp(x, 77.75);
  b.red(90, 64, 2.5, 4).red(80, 68, 20, 6).red(74, 74, 34, 8);
  b.shift(98, 74, 2, 2, false, 4); // la entrada: se cierra a tu espalda
  b.loop({ axis: 'x', x0: 84, x1: 96, z0: 76, z1: 79.5 });
  for (const x of [80, 86, 92, 98, 104]) b.prop('door2wall', x, 79.45, N);
  for (const x of [77, 83, 95, 101, 107]) b.prop('door2wall', x, 76.05, S);
  // la única salida: la puerta blanca, la única de verdad entre tantas puertas falsas
  b.door(89, 76.05, S, { look: 'white', locked: false, to: { x: 92, z: 58.5, ry: N }, label: 'Abrir la puerta blanca' });
  b.prop('text', 89, 79.44, N, { y: 2.1, text: 'SOLO LA PUERTA BLANCA ES DE VERDAD', w: 3.6 });
  b.zone('red', 74, 62, 34, 20);
  b.prop('text', 90.05, 66, E, { y: 1.6, text: 'VUELVE', w: 1.4 });

  // ===================================================== zonas nuevas, planta 0

  // ---- de la sala de columnas a las oficinas ----
  b.open(86, 14, 26, 2.5, { lamps: 4 });
  b.shift(98, 14, 0.5, 2.5, false).shift(104, 11.5, 0.5, 2.5, true, 0, true);
  b.open(104, 11.5, 2, 2.5).open(104, 9.5, 8, 2);

  // ---- oficinas abandonadas (dos plantas, con un atrio en medio) ----
  b.open(112, 2, 40, 40, { wall: 2, floorMat: 1, lamps: 4 });
  b.solid(112, 22, 10, 0.5, 2).solid(140, 10, 0.5, 12, 2).solid(118, 32, 0.5, 10, 2);
  for (let x = 115; x < 150; x += 7) {
    for (let z = 5; z < 40; z += 7) {
      if (x > 123 && x < 141 && z > 11 && z < 29) continue; // el atrio
      if (x > 142 && z > 21) continue; // la escalera
      b.prop('partition', x, z - 1.2, 0, { w: 3.6 }).block(x - 1.8, z - 1.3, 3.6, 0.3);
      b.prop('desk', x, z + 0.6, N, { solid: [1.6, 0.8] }).prop('chair', x + 0.2, z + 1.8, (x * 1.3) % 6);
    }
  }
  b.prop('vending', 112.6, 30, E, { solid: [0.9, 0.85] }).prop('cooler', 151.6, 4, W, { solid: [0.4, 0.4] });
  b.prop('cabinet', 151.6, 12, W, { solid: [0.6, 0.5] }).prop('cabinet', 151.6, 13, W, { solid: [0.6, 0.5] });
  b.prop('plant', 124, 30, 0, { solid: [0.5, 0.5] }).prop('chairstack', 146, 4, 0.3, { solid: [0.6, 0.6] });
  b.prop('tile', 130, 36, 0.4).prop('hole', 130, 36, 0, { y: 2.8 });
  b.item('agua', 113, 40).item('pila', 150, 30);
  b.note(112.05, 18, E, 'Post-it amarillo', 'La escalera del fondo sube a otra planta de oficinas igual que esta. Desde allí arriba se ve el patio de abajo.\n\nNo te asomes mucho: no hay barandillas en todas partes.');
  b.lair('figure', 148, 6).lair('figure', 116, 38);
  // la escalera que sube a la planta de oficinas de arriba
  b.ramp(146, 24, 2, 12, 2, 0, UP0.floor, true);

  // ---- del apagón y las oficinas al gran atrio ----
  b.open(108, 50, 4, 2.5, { dark: true });
  b.open(130, 42, 2.5, 4, { lamps: false });

  // ---- el gran atrio: suelo hundido, balcón alrededor y caída libre al centro ----
  b.open(112, 46, 40, 40, { wall: 1, floorMat: 2, lamps: 6 });
  b.ramp(118, 49, 28, 3, 3, -2.4, 0, true);
  b.open(118, 52, 28, 28, { floor: -2.4, floorMat: 0, lamps: 6 });
  b.ramp(118, 80, 28, 3, 2, -2.4, 0, true);
  b.deep(124, 58, 16, 16, 0.1);
  b.prop('text', 112.05, 60, E, { y: 1.6, text: 'MIRA ARRIBA', w: 2 });
  b.item('vendas', 132, 66).item('agua', 120, 76);
  b.lair('figure', 145, 70);

  // ---- pasillos sin fin, al este (con desniveles) ----
  b.open(152, 20, 4, 2.5);
  b.corridor([[156, 21], [186, 21]], 2.5);
  b.corridor([[160, 4], [160, 96]], 2.5);
  b.corridor([[172, 4], [172, 60]], 2.5);
  b.corridor([[184, 4], [184, 96]], 2.5);
  b.corridor([[160, 4], [184, 4]], 2.5);
  b.corridor([[160, 40], [172, 40]], 2.5);
  b.corridor([[172, 60], [184, 60]], 2.5);
  b.corridor([[160, 78], [184, 78]], 2.5);
  b.corridor([[160, 96], [184, 96]], 2.5);
  // tramos elevados con escalones
  b.ramp(158.75, 44, 2.5, 4, 2, 0, 1.2, true, 4.2).open(158.75, 48, 2.5, 10, { floor: 1.2, ceil: 4.2 }).ramp(158.75, 58, 2.5, 4, 3, 0, 1.2, true, 4.2);
  b.ramp(182.75, 64, 2.5, 4, 2, 0, -1.2, true, 2).open(182.75, 68, 2.5, 6, { floor: -1.2, ceil: 1.8 }).ramp(182.75, 74, 2.5, 4, 3, 0, -1.2, true, 2);
  b.shift(170.75, 29, 2.5, 0.5, true).shift(158.75, 70, 2.5, 0.5, false, 0, true);
  b.shift(178, 58.75, 0.5, 2.5, false).shift(182.75, 40, 2.5, 0.5, true, 0, true);
  b.dark(170, 44, 4, 16);
  b.lair('figure', 172, 52).lair('figure', 184, 88).lair('figure', 160, 90);
  b.item('barrita', 184, 30).item('agua', 160, 66);
  b.prop('text', 184.05, 10, E, { y: 1.6, text: 'NO ESTABA AQUÍ ANTES', w: 2.8 });

  // ---- sala altísima con escaleras que acaban en la pared ----
  b.open(14, 80, 2.5, 6);
  b.open(4, 86, 30, 30, { ceil: 9, wall: 0, lamps: 5 });
  b.ramp(6, 90, 2.5, 18, 2, 0, 6, true, 9);
  b.solid(4, 108, 8, 8);
  b.prop('door2wall', 7.25, 107.95, N, { y: 6 }).prop('door2wall', 33.95, 100, W, { y: 4.5 }).prop('door2wall', 20, 86.05, S, { y: 6.5 });
  for (const [x, z] of [[14, 96], [24, 96], [14, 106], [24, 106]]) b.solid(x, z, 1.2, 1.2);
  b.note(4.05, 88, E, 'Garabato a lápiz', 'Las escaleras no llevan a ninguna parte.\nLas puertas de arriba tampoco.\nNo subas.');
  b.lair('figure', 28, 112);
  b.item('pila', 30, 90);

  // ---- Las Caídas: terrazas que bajan hacia el este ----
  b.open(34, 100, 10, 2.5);
  b.open(44, 88, 16, 40, { ceil: 3.2, floorMat: 2, lamps: 4 });
  b.open(60, 88, 16, 40, { floor: -1.5, ceil: 3.2, floorMat: 2, lamps: 4 });
  b.open(76, 88, 16, 40, { floor: -3, ceil: 3.2, floorMat: 0, lamps: 4.5 });
  b.open(92, 88, 16, 40, { floor: -4.5, ceil: 3.2, floorMat: 0, lamps: 5 });
  b.ramp(58, 92, 4, 3, 1, -1.5, 0, true, 3.2);
  b.ramp(74, 110, 4, 3, 1, -3, -1.5, true, 3.2);
  b.ramp(90, 120, 4, 3, 1, -4.5, -3, true, 3.2);
  for (const [x, z] of [[52, 96], [52, 116], [68, 100], [68, 120], [84, 96], [84, 116], [100, 104]]) b.solid(x, z, 0.6, 0.6);
  b.dark(92, 88, 16, 14);
  b.prop('text', 59.95, 106, W, { y: 1.6, text: 'NO MIRES ABAJO', w: 2.4 });
  b.note(44.05, 120, E, 'Hoja doblada', 'Las terrazas bajan y bajan. Cada salto parece pequeño hasta que miras atrás y no puedes volver a subir.\n\nUsa las escaleras.');
  b.lair('figure', 104, 124).lair('figure', 70, 90);
  b.item('agua', 66, 126).item('vendas', 98, 92);

  // ---- la salida: la puerta de mantenimiento y la escalera que baja ----
  b.open(108, 117, 6, 2.5, { floor: -4.5, ceil: -1.7 });
  b.open(114, 110, 16, 16, { floor: -4.5, ceil: -1.5, wall: 3, ceilMat: 1, lamps: 5 });
  b.prop('machine', 114.45, 114, E, { solid: [0.8, 2.4] }).prop('cabinet', 125, 110.45, S, { solid: [0.6, 0.5] });
  b.door(129.95, 117.25, W, { look: 'steel', locked: false, sign: 'MANTENIMIENTO' });
  b.open(130, 116, 2, 2.5, { floor: -4.5, ceil: -1.7 });
  b.ramp(132, 116, 18, 2.5, 1, -7, -4.5, true, -1.7);
  b.open(150, 114, 5, 6, { floor: -7, ceil: -4.2, wall: 3, lamps: false }).lamp(152.5, 117, { flicker: true });
  b.ramp(151, 120, 2.5, 18, 3, -9.5, -7, true, -4.2);
  b.open(148, 138, 10, 8, { floor: -9.5, ceil: -6.7, wall: 3, lamps: false }).lamp(153, 142, { flicker: true });
  b.exit(153, 143.5, S, 'NIVEL 1', true);
  b.note(129.95, 114, W, 'Cartel oxidado', 'MANTENIMIENTO\nSolo personal autorizado.\n\nDebajo, a rotulador: «baja hasta que el papel amarillo se acabe».');

  // ===================================================== planta 1 (arriba)
  b.storey(1);
  // rellano de la escalera del laberinto y pasillo hacia la pasarela
  b.hole(38, 24, 2, 10);
  b.open(38, 34, 6, 2, { ...UP0, lamps: 3 });

  // ---- pasarela sobre los agujeros: cruz de pasillos y caída libre al resto ----
  b.open(44, 34, 26, 22, { ...UP0, wall: 0, lamps: 4 });
  b.hole(44, 36, 26, 20);
  b.open(44, 34, 14, 2, UP0).open(56, 34, 2, 22, UP0).open(44, 44, 26, 2, UP0);
  for (const [x, z, r, w] of [[50, 36.05, 0, 6], [63, 43.95, N, 8], [63, 46.05, 0, 8], [55.95, 52, W, 6]] as const) b.prop('railing', x, z, r, { w });
  b.note(44.05, 35, E, 'Nota pegada a la barandilla', 'Abajo están los agujeros. Desde aquí parecen pequeños.\nLa barandilla se acaba de golpe.');
  b.lair('figure', 68, 45);

  // ---- la planta de arriba de la sala de columnas: con el suelo roto ----
  b.open(56, 28, 2, 6, { ...UP0, lamps: false });
  b.open(52, 4, 34, 24, { ...UP0, wall: 0, floorMat: 2, lamps: 4 });
  for (const [x, z] of [[60, 11], [72, 20], [78, 8], [66, 23]]) b.hole(x, z, 2, 2);
  for (let x = 58; x < 86; x += 9) for (let z = 7; z < 26; z += 9) b.solid(x, z, 0.6, 0.6);
  b.prop('text', 52.05, 12, E, { y: 1.6, text: 'EL SUELO CEDE', w: 2.4 });
  b.prop('tile', 61, 14, 0.3).prop('tile', 73, 18, 1.2);
  b.item('agua', 84, 26).item('pila', 54, 6);
  b.lair('figure', 82, 6);
  // pasillo hacia las oficinas de arriba
  b.open(86, 8, 26, 2.5, { ...UP0, lamps: 4 });

  // ---- oficinas de arriba, con el atrio y la escalera ----
  b.open(112, 2, 40, 40, { ...UP0, wall: 2, floorMat: 1, lamps: 4 });
  b.hole(126, 14, 12, 12);
  b.hole(146, 24, 2, 12);
  for (const [x, z, r, w] of [[132, 13.95, N, 12], [132, 26.05, 0, 8], [125.95, 20, W, 12], [138.05, 18, E, 6]] as const) b.prop('railing', x, z, r, { w });
  b.solid(112, 30, 12, 0.5, 2).solid(140, 2, 0.5, 8, 2);
  for (const [x, z] of [[116, 6], [122, 6], [146, 8], [116, 36], [122, 36], [140, 36]]) {
    b.prop('desk', x, z, N, { solid: [1.6, 0.8] }).prop('chair', x, z + 1.2, (x * 0.7) % 6);
  }
  // sala de reuniones
  b.prop('table', 116, 26, 0, { solid: [1.6, 1] }).prop('chair', 114.8, 26, E).prop('chair', 117.2, 26, W);
  b.prop('cabinet', 151.6, 30, W, { solid: [0.6, 0.5] }).prop('cabinet', 151.6, 31, W, { solid: [0.6, 0.5] }).prop('plant', 142, 3, 0);
  b.note(151.95, 20, W, 'Nota en el tablón', 'Desde la barandilla del patio se ve la planta de abajo.\nAlguien saltó. Abajo no había nadie.');
  b.item('barrita', 150, 40).item('vendas', 113, 3);
  b.lair('figure', 150, 4);
  // pasillo al balcón del gran atrio
  b.open(130, 42, 2.5, 4, { ...UP0, lamps: false });

  // ---- balcón del gran atrio (caída libre al suelo hundido) ----
  b.open(112, 46, 40, 40, { floor: UP0.floor, ceil: 9, wall: 1, floorMat: 2, lamps: 6 });
  b.hole(115, 49, 34, 34);
  for (const [x, z, r, w] of [[124, 48.95, N, 10], [146, 48.95, N, 4], [114.95, 60, W, 12], [149.05, 74, E, 10], [132, 83.05, 0, 14]] as const) b.prop('railing', x, z, r, { w });
  for (const [x, z] of [[115, 49], [148, 49], [115, 82], [148, 82]]) b.solid(x, z, 1, 1);
  b.storey(0);
  for (const [x, z] of [[115, 49], [148, 49], [115, 82], [148, 82]]) b.solid(x, z, 1, 1);
  b.storey(1);
  b.item('agua', 150, 84).item('pila', 113, 84);
  b.lair('figure', 113, 66);

  b.storey(0);
  return b.build();
}

// ===========================================================================
// NIVEL 1 — «La Zona Habitable»
// Un cruce infinito entre aparcamiento subterráneo y almacén abandonado.
//  - Llegada: la Sala Manila, llena de notas.
//  - Sector Aquila: gris, columnas enormes, tuberías del techo que gotean,
//    charcos, escombros. La Base Alpha de la M.E.G. está aquí.
//  - Marcas de la M.E.G.: tela de color con el águila, agua y una nota.
//  - Sector Gild: almacén con estanterías y muchas cajas.
//  - Sector gótico: arcos y columnas redondas; el Círculo de Ariadna.
//  - Sector en obras: trabajadores de sombra que no hacen caso a nadie.
//  - Pasillos: tras puertas con luz verde de SALIDA; estrechos, seguros, con
//    salas sin sentido (oficina, enfermería, sala acolchada, cuadros...).
//  - Geometría no euclídea: un pasillo que no acaba si no miras tu referencia.
//  - Parpadeo: apagones totales en los que salen las criaturas.
//  - Salida: un pasillo que sigue más de lo normal y baja al Nivel 2.
// Paredes: 0 hormigón gris · 1 hormigón blanco · 2 bloques con franja
//          3 ladrillo · 4 verde M.E.G. · 5 piedra gótica · 6 manila
// Suelos: 0 hormigón · 1 pintado · 2 goma · 3 baldosa. Techos: 0 hormigón · 1 placas
// ===========================================================================
function level1(): LevelMap {
  const b = new Builder(1, LEVELS[1], 200, 172, { ceil: 5.5 });

  // ---- la Sala Manila ----
  b.open(2, 2, 8, 7, { ceil: 3, wall: 6, floorMat: 3, ceilMat: 1, lamps: 3 }).spawn(5, 6);
  b.open(10, 4.5, 2, 2, { ceil: 3 });
  b.note(2.05, 4, E, 'Nota clavada en la pared', 'Si estás leyendo esto, has hecho noclip. Saliste del Nivel 0 por una pared que parpadeaba y ahora estás en el Nivel 1, la Zona Habitable.\n\nNo estás solo. Aquí hay gente.');
  b.note(2.05, 7, E, 'Nota con letra apretada', 'Busca telas de colores con el águila de la M.E.G. Suelen dejar agua de almendras y una nota al lado.\n\nLa Base Alpha está al este de este sector. Las patrullas visten de amarillo lima.');
  b.note(6, 2.05, S, 'Nota escrita a toda prisa', 'Cuando se apaguen TODAS las luces (lo llamamos Parpadeo), NO enciendas la linterna en los salones. Busca la luz verde de una salida y métete en los pasillos. Ahí casi nunca entra nada.\n\nY no corras: oyen muy bien.');
  b.note(9.95, 3, W, 'Nota a lápiz', 'Las distancias aquí mienten. Elige una referencia (una columna pintada, un panel eléctrico, una caja) y camina hacia ella sin dejar de mirarla.');
  b.item('agua', 8.5, 8.2);

  // ---- sector Aquila ----
  b.open(12, 2, 58, 48, { ceil: 5.5, lamps: 7 });
  for (let x = 18; x < 70; x += 8) for (let z = 8; z < 50; z += 8) b.solid(x - 0.6, z - 0.6, 1.2, 1.2);
  // tuberías del techo que gotean y dejan charcos
  for (const [x, z] of [[22, 12], [38, 20], [54, 14], [30, 36], [46, 42], [62, 30]]) {
    b.prop('drip', x, z, 0, { y: 5.4 }).wet(x - 1.5, z - 1.2, 3, 2.4);
  }
  b.prop('pipe', 41, 12, E, { y: 5.2, w: 56 }).prop('pipe', 41, 36, E, { y: 5.0, w: 56 });
  // escombros: madera, embalajes y metal
  for (const [x, z, r] of [[26, 26, 0.3], [50, 8, 1.2], [60, 44, 2.1], [16, 40, 0.8]]) b.prop('debris', x, z, r, { solid: [1.6, 1.2] });
  b.crate(34, 28, 0.2, 'comida').crate(58, 22, 1.1, 'herramientas').crate(14, 47, 0.5, 'mixto');
  // marca de la M.E.G.
  b.prop('megcloth', 69.95, 6, W, { y: 2 }).item('agua', 69, 6.5);
  b.note(69.95, 7.6, W, 'Nota atada a una tela lima', '¡Hola, viajero! Esta agua es para ti, cortesía de la M.E.G.\n\nSigue los pasillos hasta ver gente: te llevaremos a un lugar seguro. Deja la botella vacía aquí, por favor. ¡Suerte!', true, 1.3);
  // una columna pintada de naranja: referencia para el pasillo que no acaba
  b.prop('paint', 66.61, 32, E, { y: 0, h: 5.5 }); // cara este de la columna
  b.lair('hound', 30, 44).lair('smiler', 66, 46).lair('duller', 12.6, 30).lair('duller', 12.6, 18);
  b.lair('skinstealer', 48, 30, ['¿Hola?', '¿Hay alguien ahí?', 'Me he perdido…', 'Hola. Hola. Hola.']);
  b.dark(60, 40, 10, 10);

  // ---- Base Alpha de la M.E.G. ----
  b.open(70, 9.5, 2, 3.5, { ceil: 3.2 });
  b.open(72, 2, 26, 22, { ceil: 3.2, wall: 4, floorMat: 3, lamps: 4 }).zone('safe', 72, 2, 26, 22);
  b.solid(84, 2, 0.5, 9, 4).solid(84, 15, 0.5, 9, 4);
  b.prop('megflag', 72.05, 5, E, { y: 1.8 }).prop('megflag', 97.95, 12, W, { y: 1.8 });
  b.npc({ kind: 'meg', x: 74, z: 11, ry: W, lines: ['¡Eh! Tranquilo, estás a salvo. Esto es la Base Alpha de la M.E.G.', 'Si se apagan las luces, no enciendas la linterna en los salones.', 'Las cajas aparecen cuando no miras. Coge lo que te haga falta.'] });
  b.npc({ kind: 'meg', x: 90, z: 5, ry: S, lines: ['Si te muerde un Hound, véndate rápido.', 'Recuerda: la sangre roja, vivo. La sangre clara, aléjate.', 'Bebe agua de almendras: calma la cabeza.'] });
  b.npc({ kind: 'meg', x: 92, z: 20, ry: N, lines: ['Para bajar al Nivel 2, cruza el sector gótico hacia el sur: el depósito inundado.', 'Al sur hay un sector en obras. No te acerques a los trabajadores.', 'Allí abajo hace calor. Lleva pilas.'] });
  b.prop('cot', 77, 3.5, S, { solid: [2, 0.9] }).prop('cot', 80, 3.5, S, { solid: [2, 0.9] }).prop('cot', 77, 22.5, N, { solid: [2, 0.9] });
  b.prop('meg', 90, 9, S, { solid: [2, 1] }).prop('radio', 96, 3, S, { solid: [0.5, 0.5] }).prop('tent', 79, 13, 0.3, { solid: [2.4, 2.4] });
  b.crate(95, 22, 0, 'medico').crate(87, 22, 0.1, 'comida');
  b.note(97.95, 16, W, 'Tablón de la M.E.G.', 'GUÍA RÁPIDA DE ENTIDADES\n\nSmilers: les atrae la luz. Apágala, mírales y aléjate despacio. Si corres o haces ruido, atacan.\n\nHounds: mírales a los ojos y grita (tecla G). No aguantarán mucho.\n\nSkin-Stealers: alguien solo que llora y pide ayuda... no te acerques. Aléjate con calma.\n\nDullers: si oyes arañar dentro de una pared, apártate de ella.\n\nClumps: no ven. Agáchate (C) y no hagas ruido.');

  // ---- pasillo de hormigón que no acaba (no euclídeo) ----
  b.open(70, 30, 30, 3, { ceil: 3.5, lamps: 5, wall: 0 });
  b.loop({ axis: 'x', x0: 73, x1: 96, z0: 30, z1: 33, oneWay: 1, landmark: { x: 98.5, z: 30.2 } });
  b.prop('panel', 98.5, 30.05, S, { y: 1 });
  b.note(70.5, 30.05, S, 'Garabato en la pared', 'Si el pasillo no se acaba, mira el panel eléctrico del fondo y NO apartes la vista mientras andas.', true, 1.6);

  // ---- sector en obras ----
  b.open(100, 26, 18, 24, { ceil: 5, wall: 2, lamps: 6 });
  b.solid(106, 34, 0.5, 8, 2).solid(110, 44, 6, 0.5, 2);
  b.prop('scaffold', 104, 30, 0, { solid: [3, 1.2] }).prop('scaffold', 113, 46, E, { solid: [3, 1.2] });
  for (const [x, z] of [[103, 40], [108, 47], [115, 30]]) b.prop('cone', x, z, 0);
  b.npc({ kind: 'worker', x: 104, z: 33, ry: N, lines: [], path: [[104, 33], [104, 42], [102, 42]] });
  b.npc({ kind: 'worker', x: 112, z: 42, ry: E, lines: [], path: [[108, 42], [116, 42], [116, 36]] });
  b.npc({ kind: 'worker', x: 114, z: 36, ry: W, lines: [] });
  b.note(100.5, 26.05, S, 'Cartel torcido', 'PELIGRO — OBRAS\nNo te acerques a los trabajadores. No contestan y no se apartan.', true, 1.8);
  b.crate(116, 48, 0.4, 'herramientas');

  // ---- sector Gild (almacén con estanterías) ----
  b.solid(12, 50, 58, 0.5, 2).open(20, 50, 12, 0.5).open(44, 50, 8, 0.5);
  b.open(12, 50.5, 44, 43.5, { ceil: 6, wall: 2, floorMat: 1, lamps: 6 });
  for (const x of [16, 22, 28, 34, 40, 46]) {
    for (const z of [56, 72]) {
      b.prop('shelf', x, z + 4, 0, { solid: [1.2, 8], d: 8 });
      b.crate(x, z + 1.5 + (x % 3), 0, x % 2 ? 'comida' : 'mixto', true);
    }
  }
  b.crate(52, 88, 0.3, 'medico').crate(18, 90, 1.2, 'mixto').crate(50, 60, 0.6, 'comida');
  b.prop('forklift', 48, 88, 0.6, { solid: [1.4, 2.4] }).prop('pallet', 30, 90, 0.2, { solid: [1.2, 1] });
  b.note(12.05, 66, E, 'Guía de cajas (Recolección M.E.G.)', 'Las cajas aparecen a tu espalda o después de un Parpadeo, y se esfuman si dejas de mirarlas.\n\nMira lo que hay antes de meter la mano: a veces hay cristales.\n\nPrioriza agua, latas, vendas y pilas. No cargues con lo que no necesites.');
  b.ramp(52, 60, 2.5, 24, 3, 0, 6.5, true, 10); // escalera a la entreplanta
  b.lair('smiler', 54, 92).lair('clump', 44, 66).lair('duller', 12.6, 80).lair('hound', 30, 64);
  b.dark(46, 84, 10, 10);

  // ---- sector gótico ----
  b.open(56, 54, 0.5, 6, { wall: 5 });
  b.open(56.5, 50, 41.5, 44, { ceil: 7, wall: 5, lamps: 6 });
  for (let x = 62; x < 98; x += 7) for (let z = 56; z < 94; z += 7) if (!(x >= 83 && z >= 82)) b.prop('roundpillar', x, z, 0, { solid: [1, 1], h: 7 });
  b.solid(76, 50, 0.5, 30, 5);
  for (const z of [56, 70]) b.arch(76, z, 0.5, 3, 4.5, E);
  // el Círculo de Ariadna: un pequeño puesto de curas
  b.open(84, 84, 12, 9, { ceil: 3.5, wall: 5, floorMat: 3, lamps: 3 }).solid(83.5, 84, 13, 0.5, 5).open(88, 84, 3, 0.5);
  b.solid(83.5, 84, 0.5, 10, 5).solid(96, 84, 0.5, 10, 5).solid(84, 93, 12, 1, 5);
  b.prop('bed', 90, 89, S, { solid: [1, 2.1] }).prop('table', 86, 91, 0, { solid: [1.6, 1] });
  b.crate(94, 91, 0, 'medico');
  b.note(84.05, 88, E, 'Círculo de Ariadna — Equipo Hipócrates', 'Si estás herido, coge lo que necesites del botiquín. Vuelve a buscarnos cuando puedas: siempre hace falta gente que sepa curar.');
  b.lair('hound', 66, 76).lair('hound', 90, 62).lair('smiler', 96, 52);

  // ---- los pasillos (seguros) ----
  // puertas dobles con luz verde de SALIDA (con un cuadro en el suelo delante)
  b.open(98, 74, 2, 2.5, { ceil: 3 });
  b.door(97.95, 75.25, W, { look: 'double', sign: 'SALIDA', locked: false, to: undefined });
  b.prop('floorpainting', 96, 75.2, 0.3, { w: 0.8, h: 0.6 });
  const cor = { ceil: 2.6, wall: 1, ceilMat: 1, lamps: 5 };
  b.corridor([[101, 75], [108, 75], [108, 63], [116, 63]], 2, cor);
  b.corridor([[108, 75], [108, 86], [116, 86], [116, 92]], 2, cor);
  b.corridor([[101, 75], [101, 90], [104, 90]], 2, cor);
  // salas sin sentido
  b.open(110, 64.5, 7, 5.5, { ceil: 2.6, wall: 1, ceilMat: 1, lamps: false }).open(112, 64, 1.5, 0.5, { ceil: 2.6 }); // oficina con ordenador viejo
  b.lamp(113.5, 67, { y: 2.2 }).prop('desk', 113.5, 68.5, N, { solid: [1.6, 0.8] }).prop('chair', 113.2, 67.2, 0.3).prop('bulb', 113.5, 67, 0, { y: 2.6 });
  b.open(109.5, 77, 6, 6, { ceil: 2.6, wall: 3, lamps: 4 }).open(109, 79, 0.5, 1.5, { ceil: 2.6 }); // sala de ladrillo
  b.open(109.5, 87.5, 5, 5.5, { ceil: 2.8, wall: 1, floorMat: 3, lamps: 4 }).open(111, 87, 1.5, 0.5, { ceil: 2.8 }); // enfermería
  b.prop('bed', 113, 90.5, E, { solid: [2.1, 1] }).prop('table', 110.8, 89.2, 0, { solid: [1.4, 0.8] }).item('vendas', 111, 91.8);
  b.open(102.5, 78, 4.5, 5, { ceil: 2.6, wall: 1, floorMat: 2, lamps: 3 }).open(102, 80, 0.5, 1.5, { ceil: 2.6 }); // sala acolchada con una silla medio hundida en el suelo
  b.prop('chair', 105, 80.5, 0.7, { y: -0.25 }).prop('padding', 108.95, 81.75, W, { w: 2.5 });
  b.open(102, 66, 4.5, 6, { ceil: 2.6, wall: 1, lamps: 3 }).open(106.5, 68, 0.5, 1.5, { ceil: 2.6 }); // sala de cuadros (en las paredes y en el suelo)
  b.prop('painting', 102.05, 68, E, { y: 1.5 }).prop('painting', 104.5, 66.05, S, { y: 1.5 }).prop('floorpainting', 104, 70, 0.4).prop('floorpainting', 105.2, 68.5, 1.9);
  // pasillo largo: la Skin-Stealer llora al fondo, con un rastro de sangre
  b.corridor([[104, 90], [104, 94]], 2, cor);
  b.prop('blood', 104, 92.5, 0.2).prop('blood', 104, 91, 1.4);
  b.lair('skinstealer', 104, 93.6, ['¿Hola?', 'Necesito ayuda, por favor.', 'Está todo suelto…', 'Ayúdame… ayú-da-me.', 'No me dejes aquí.']);
  b.note(100.05, 84, E, 'Nota de los Nómadas', 'Los pasillos son seguros, pero no te pierdas. Para dormir, busca una sala del tamaño de un dormitorio.\n\nNo uses los cerrojos: desaparecen cuando los miras.');
  b.note(104.95, 92, W, 'Nota manchada', 'La sangre roja, vivo.\nLa sangre clara, aléjate.');
  // al fondo, el pasillo se tuerce y sale al aparcamiento
  b.corridor([[116, 63], [116, 56], [121, 56]], 2, { ...cor, lamps: 6 });
  b.open(121, 54.5, 3, 3, { ceil: 2.6, wall: 1 });
  b.note(118, 55.05, S, 'Nota en el pasillo', 'La salida al Nivel 2 ya no está aquí. Ahora se baja por el depósito inundado, al sur del sector gótico: una escalera en la esquina sureste que se hunde en el agua.');

  // ================================================== zonas nuevas (planta baja)
  // ---- el aparcamiento de tres plantas (P0 aquí; P1 y P2 encima) ----
  const P0 = { ceil: 3.4, wall: 2, floorMat: 1, lamps: 8 };
  b.open(118, 36, 6, 3, { ceil: 3.4, wall: 2 }); // desde las obras
  b.open(124, 2, 72, 60, P0);
  for (let x = 132; x < 196; x += 10) for (let z = 10; z < 62; z += 10) if (!(x > 184 && z < 42) && !(x < 136 && z > 20)) b.solid(x - 0.4, z - 0.4, 0.8, 0.8);
  // rampa de coches a la P1 (con su muro)
  b.ramp(188, 10, 6, 30, 2, 0, 3.8, false, 7.2).solid(186.5, 10, 1.5, 28, 2);
  // coches y plazas
  for (const [x, z, r] of [[140, 6, 0], [143, 6, 0], [152, 6, 0], [168, 6, 0.08], [137, 56, N], [150, 56, N], [158, 56, N + 0.1], [174, 30, E], [148, 30, 0.3]] as const) {
    b.prop('car', x, z, r, { solid: [r === E ? 4.3 : 1.8, r === E ? 1.8 : 4.3] });
  }
  for (let x = 138; x < 182; x += 2.8) b.prop('parklines', x, 6, 0).prop('parklines', x, 56, 0);
  b.dark(160, 40, 24, 22);
  b.prop('text', 124.05, 20, E, { y: 1.6, text: 'P0 — SALIDA ↑', w: 2.6 });
  b.crate(194, 58, 0.3, 'mixto').item('pila', 176, 58);
  b.lair('smiler', 172, 52).lair('clump', 130, 58);
  b.note(124.05, 40, E, 'Ticket de aparcamiento', 'Entrada: --:--\nSalida: --:--\n\nPor detrás, a boli: «Arriba del todo no hay techo. Hay más techo.»');

  // ---- el hangar: nave altísima con galería y pasarelas a 6 m ----
  b.open(150, 62, 4, 4, { ceil: 3.4 });
  b.open(124, 66, 72, 64, { ceil: 5.6, wall: 0, floorMat: 0, lamps: 9 });
  b.ramp(124, 100, 2.5, 26, 3, 0, 6, true, 15).ramp(193.5, 74, 2.5, 26, 2, 0, 6, true, 15);
  for (const [x, z, r] of [[136, 76, 0], [139, 76, 0], [136, 118, 0.05], [176, 80, E], [182, 112, 0], [185, 112, 0], [148, 108, E], [168, 120, 0.1]] as const) {
    b.prop('container', x, z, r, { solid: r === E ? [6, 2.4] : [2.4, 6] });
  }
  b.prop('forklift', 152, 84, 0.4, { solid: [1.4, 2.4] }).prop('pallet', 170, 100, 0.2, { solid: [1.2, 1] }).prop('scaffold', 130, 70, 0, { solid: [3, 1.2] });
  b.crate(156, 124, 0.6, 'comida').crate(190, 70, 0, 'herramientas');
  b.lair('hound', 166, 88).lair('clump', 186, 126);
  b.note(126.5, 66.05, S, 'Pintado en la puerta del hangar', 'SI TE CAES DE LA PASARELA, NO GRITES.\nSUBE POR LAS ESCALERAS DE LAS ESQUINAS.', true, 1.6);
  // del hangar al depósito inundado
  b.ramp(116, 118, 8, 3, 0, -2, 0, true, 5);

  // ---- bloque de viviendas (dos plantas con patio) ----
  const R0 = { ceil: 3, wall: 3, floorMat: 3, ceilMat: 1, lamps: 4.5 };
  b.open(29, 94, 3, 18, { ceil: 3, wall: 3 }); // del almacén Gild al bloque
  b.open(18, 112, 24, 40, R0);
  b.open(22, 116, 16, 32, { ceil: 3, floorMat: 0, lamps: false }).wet(22, 116, 16, 32).deep(27, 126, 6, 8, 0.12);
  b.ramp(26, 148, 12, 4, 0, 0, 3.5, true, 6.5);
  for (const z of [112, 123, 134, 145]) {
    b.open(4, z, 12, 10, R0).open(16, z + 4, 2, 2, { ceil: 2.4 });
    b.open(44, z, 12, 10, R0).open(42, z + 4, 2, 2, { ceil: 2.4 });
  }
  const flat = (x: number, z: number, k: number) => {
    b.prop('bed', x + 2, z + 2, S, { solid: [1, 2.1] }).prop('table', x + 7, z + 6, 0, { solid: [1.4, 0.8] }).prop('chair', x + 7, z + 7, (k * 1.7) % 6);
    if (k % 2) b.prop('cabinet', x + 11.6, z + 2, W, { solid: [0.6, 0.5] });
    else b.prop('painting', x + 0.05, z + 6, E, { y: 1.5 });
  };
  [112, 123, 134, 145].forEach((z, k) => {
    flat(4, z, k);
    flat(44, z, k + 1);
  });
  b.prop('plant', 30, 132, 0, { solid: [0.5, 0.5] }).prop('foldchair', 25, 120, 0.7).prop('blood', 46, 140, 0.4);
  b.item('lata', 6, 114).item('vendas', 54, 154).item('agua', 10, 147);
  b.lair('skinstealer', 50, 116, ['¿Vecino?', '¿Me abres?', 'Se me ha olvidado la llave…', 'Ábreme. Ábreme. Ábreme.']);
  b.lair('duller', 4.6, 128).lair('hound', 34, 150);
  b.note(32, 111.95, N, 'Buzón lleno de cartas', 'Todas las cartas van dirigidas al mismo piso. Ninguna tiene remitente.\n\nEn una pone: «sube a la azotea del patio y cruza la pasarela por encima del agua».');

  // ---- el depósito inundado (y la escalera que baja al Nivel 2) ----
  b.open(80, 94, 3, 4, { ceil: 3.2, wall: 0 });
  b.ramp(80, 98, 3, 6, 3, -2, 0, true, 3.2);
  b.open(64, 104, 42, 62, { floor: -2, ceil: 5.5, wall: 0, floorMat: 0, lamps: 8 });
  b.open(106, 104, 10, 46, { floor: -2, ceil: 5.5, floorMat: 0, lamps: 8 });
  b.deep(66, 110, 36, 50, 0.15).deep(106, 110, 8, 36, 0.15);
  for (let x = 72; x < 116; x += 12) for (let z = 112; z < 166; z += 12) if (!(x > 104 && z > 146)) b.solid(x - 0.5, z - 0.5, 1, 1);
  for (const [x, z, r] of [[70, 118, 0.3], [96, 140, 1.2], [84, 158, 2.4], [110, 112, 0.8]] as const) b.prop('debris', x, z, r, { y: -2.1, solid: [1.6, 1.2] });
  b.prop('barrel', 90, 108, 0, { solid: [0.7, 0.7] }).prop('barrel', 91, 108.8, 0, { solid: [0.7, 0.7] });
  b.dark(64, 150, 20, 16);
  b.ramp(108, 150, 3, 14, 3, -6, -2, true, 1);
  b.open(106, 164, 8, 6, { floor: -6, ceil: -3, wall: 0, lamps: false }).lamp(110, 167, { flicker: true });
  b.exit(110, 169.5, S, 'NIVEL 2', true);
  b.prop('text', 109.5, 149.95, N, { y: 0.6, text: 'NIVEL 2 ↓', w: 2 });
  b.lair('smiler', 74, 156).lair('clump', 100, 120);
  b.item('bengala', 112, 130).crate(66, 106, 0.2, 'medico');
  b.note(105.95, 150.5, W, 'Nota en la escalera', 'Esta escalera baja más de lo que debería. Al fondo empieza el Nivel 2: túneles, calor y muy poca comida.');

  // ====================================================== planta 1 (arriba)
  // ---- entreplanta del almacén Gild: galería y pasarela sobre las estanterías ----
  b.storey(1);
  b.open(12, 50.5, 44, 43.5, { floor: 6.5, ceil: 10, wall: 2, floorMat: 2, lamps: 6 });
  b.hole(16, 54, 36, 36);
  b.open(16, 68, 36, 2, { floor: 6.5, ceil: 10 });
  b.hole(52, 60, 2.5, 24);
  for (const [x, z, r, w] of [[34, 67.95, N, 30], [34, 70.05, 0, 30], [34, 54.05, 0, 30], [34, 89.95, N, 30], [16.05, 72, W, 16]] as const) b.prop('railing', x, z, r, { w });
  b.crate(14, 52, 0.4, 'mixto').crate(54, 92, 1.1, 'comida').item('pila', 36, 69);
  b.prop('megcloth', 12.05, 60, E, { y: 8 }).item('agua', 13, 61);
  b.lair('hound', 14, 88);
  b.note(55.95, 52, W, 'Nota en la entreplanta', 'Desde aquí arriba se ven las cajas que aparecen entre las estanterías. Y lo que se mueve entre ellas.');
  // escalera de la entreplanta al bloque de viviendas
  b.ramp(40, 94, 2.5, 10, 3, 3.5, 6.5, true, 9.5);
  b.open(39.5, 104, 3, 8, { floor: 3.5, ceil: 6.5, wall: 3 });

  // ---- viviendas, planta de arriba: balcones sobre el patio ----
  const R1 = { floor: 3.5, ceil: 6.5, wall: 3, floorMat: 3, ceilMat: 1, lamps: 4.5 };
  b.open(18, 112, 24, 40, R1);
  b.open(22, 116, 16, 32, { floor: 3.5, ceil: 11, lamps: false });
  b.hole(22, 116, 16, 32).hole(26, 148, 12, 4);
  for (const [x, z, r, w] of [[30, 115.95, N, 16], [21.95, 132, W, 32], [38.05, 132, E, 32]] as const) b.prop('railing', x, z, r, { w });
  for (const z of [112, 123, 134, 145]) {
    b.open(4, z, 12, 10, R1).open(16, z + 4, 2, 2, { floor: 3.5, ceil: 5.9 });
    b.open(44, z, 12, 10, R1).open(42, z + 4, 2, 2, { floor: 3.5, ceil: 5.9 });
  }
  [112, 123, 134, 145].forEach((z, k) => b.prop('bed', 6, z + 2, S, { solid: [1, 2.1] }).prop('chair', 50 + (k % 2), z + 5, k));
  b.item('barrita', 8, 140).crate(54, 114, 0.5, 'mixto');
  b.lair('skinstealer', 8, 150, ['¿Hay alguien arriba?', 'Te he oído.', 'Baja, por favor.']);
  b.note(41.95, 125, W, 'Escrito en el marco de la puerta', 'La pasarela del depósito sale de este piso. No mires el agua: a veces devuelve la mirada.', true, 4.9);
  // salida a la pasarela del depósito
  b.ramp(56, 127, 8, 2, 0, 3.5, 6, true, 9);

  // ---- la pasarela sobre el depósito inundado ----
  b.open(64, 104, 52, 46, { floor: 6, ceil: 12, lamps: false }).open(64, 150, 42, 16, { floor: 6, ceil: 12, lamps: false });
  b.hole(64, 104, 52, 46).hole(64, 150, 42, 16);
  b.open(64, 127, 52, 2, { floor: 6, ceil: 12, lamps: 6 }).open(89, 110, 2, 17, { floor: 6, ceil: 12, lamps: 6 });
  b.hole(89, 116, 2, 2); // un tramo hundido: se cae al agua
  for (let x = 72; x < 116; x += 12) for (let z = 112; z < 166; z += 12) if (!(x > 104 && z > 146)) b.solid(x - 0.5, z - 0.5, 1, 1);
  for (const [x, z, r, w] of [[90, 126.95, N, 50], [90, 129.05, 0, 50], [88.95, 120, W, 16], [91.05, 120, E, 16]] as const) b.prop('railing', x, z, r, { w });
  b.item('vendas', 90, 120);
  b.note(55.95, 125.5, W, 'Cartel colgando', 'PASARELA EN MAL ESTADO\nUNA PERSONA CADA VEZ', true, 5);

  // ---- el hangar visto desde arriba: galería perimetral y dos pasarelas ----
  b.open(116, 127, 8, 2, { floor: 6, ceil: 12, lamps: false });
  b.open(124, 66, 72, 64, { floor: 6, ceil: 15, wall: 0, floorMat: 1, lamps: 8 });
  b.hole(128, 70, 64, 56).hole(124, 100, 2.5, 26).hole(193.5, 74, 2.5, 26);
  b.open(128, 97, 64, 2, { floor: 6, ceil: 15 }).open(159, 70, 2, 56, { floor: 6, ceil: 15 });
  for (const [x, z, r, w] of [[143, 96.95, N, 28], [143, 99.05, 0, 28], [176, 96.95, N, 30], [176, 99.05, 0, 30], [158.95, 83, W, 26], [161.05, 83, E, 26], [158.95, 113, W, 26], [161.05, 113, E, 26]] as const) {
    b.prop('railing', x, z, r, { w });
  }
  b.crate(194, 128, 0.2, 'herramientas').item('agua', 126, 68);
  b.lair('hound', 194, 68).lair('smiler', 160, 126);

  // ---- aparcamiento P1 ----
  const P1 = { floor: 3.8, ceil: 7.2, wall: 2, floorMat: 1, lamps: 8 };
  b.open(124, 2, 72, 60, P1);
  b.hole(188, 10, 6, 30).solid(186.5, 10, 1.5, 28, 2);
  b.ramp(126, 22, 6, 30, 3, 3.8, 7.6, false, 11).solid(132, 24, 1.5, 28, 2);
  for (let x = 142; x < 186; x += 10) for (let z = 10; z < 62; z += 10) b.solid(x - 0.4, z - 0.4, 0.8, 0.8);
  b.hole(163, 43, 6, 5).hole(144, 34, 4, 4);
  for (const [x, z, r] of [[146, 26, 0.2], [150, 14, E], [170, 56, N], [178, 18, 0]] as const) b.prop('car', x, z, r, { solid: [r === E ? 4.3 : 1.8, r === E ? 1.8 : 4.3] });
  b.prop('cone', 162, 42, 0).prop('cone', 169.5, 48.5, 0).prop('cone', 143, 33, 0);
  b.prop('text', 186.45, 46, W, { y: 5.4, text: 'P1', w: 1.2 });
  b.dark(136, 30, 20, 20);
  b.item('lata', 182, 50).crate(144, 58, 0.7, 'comida');
  b.lair('hound', 150, 40).lair('duller', 195.4, 30);
  b.note(166, 42.95, N, 'Nota junto al hueco', 'El suelo se vino abajo con un coche encima. El coche no está abajo.');

  // ====================================================== planta 2 (azotea)
  b.storey(2);
  const P2 = { floor: 7.6, ceil: 13, wall: 2, floorMat: 1, lamps: 10 };
  b.open(124, 2, 72, 60, P2);
  b.hole(126, 22, 6, 30).solid(132, 24, 1.5, 28, 2);
  b.hole(154, 14, 8, 5).hole(174, 32, 8, 4);
  for (const [x, z, r] of [[160, 8, 0.4], [184, 50, N], [150, 48, E]] as const) b.prop('car', x, z, r, { solid: [r === E ? 4.3 : 1.8, r === E ? 1.8 : 4.3] });
  b.prop('megflag', 195.95, 30, W, { y: 9.4 }).prop('tent', 186, 12, 0.3, { solid: [2.4, 2.4] }).prop('radio', 190, 8, S, { solid: [0.5, 0.5] });
  b.crate(192, 14, 0, 'medico').item('bengala', 184, 10).item('agua', 188, 16);
  b.note(195.95, 34, W, 'Puesto avanzado de la M.E.G. (abandonado)', 'Desde aquí arriba se oye todo el sector. Si algo sube por la rampa, se oye antes de verlo.\n\nDejamos un botiquín. No vuelvas a bajar por el hueco del centro: hay más caída de la que parece.');
  b.dark(124, 2, 20, 20);
  b.lair('smiler', 140, 10);

  b.storey(0);
  return b.build();
}

// ===========================================================================
// NIVEL 2 — «Pipe Dreams»
// Túneles de mantenimiento euclídeos, estrechos, que giran a 45° y miden
// múltiplos de 5 m. Paredes de hormigón polvoriento o ladrillo, tapadas por
// tuberías y máquinas que ya no funcionan. Luces escasas, cableadas en serie
// (si una falla, se apaga todo un tramo) y alguna luz violeta de emergencia.
//  - Puertas de acero: casi todas cerradas. Unas dan a salas, otras a un
//    pasillo que vuelve a la misma puerta y otras... al Vacío.
//  - Ventanas al final de algunos túneles: no te acerques.
//  - Smilers por todas partes en lo oscuro, Clumps en las esquinas, Hounds
//    en manada, Facelings en grupo, polillas y ratas.
// Paredes: 0 hormigón polvoriento · 1 ladrillo marrón · 2 ladrillo negro · 3 metal oxidado
// Suelos: 0 hormigón sucio · 1 rejilla
// ===========================================================================

/** Túnel con esquinas a 45° (paneles diagonales en cada giro). */
function tunnel(b: Builder, pts: [number, number][], o: Parameters<Builder['open']>[4] = {}, wall = 0) {
  b.corridor(pts, 2, o);
  for (let k = 1; k < pts.length - 1; k++) {
    const [px, pz] = pts[k];
    const d1 = [Math.sign(px - pts[k - 1][0]), Math.sign(pz - pts[k - 1][1])];
    const d2 = [Math.sign(pts[k + 1][0] - px), Math.sign(pts[k + 1][1] - pz)];
    if (d1[0] * d2[0] + d1[1] * d2[1] !== 0) continue;
    const c = 1;
    const ox = px + d1[0] - d2[0];
    const oz = pz + d1[1] - d2[1];
    const fx = -d1[0] + d2[0];
    const fz = -d1[1] + d2[1];
    b.diag(ox + (fx * c) / 2, oz + (fz * c) / 2, Math.atan2(fx, fz), c * Math.SQRT2, wall);
  }
}

function level2(): LevelMap {
  const b = new Builder(2, LEVELS[2], 232, 142, { ceil: 2.6 });
  const dark = { dark: true };
  const lit = { lamps: 6 };

  // ---- llegada ----
  b.open(2, 2, 8, 6, { lamps: 3, floorMat: 1, wall: 1 }).spawn(4, 5);
  b.prop('text', 2.05, 4, E, { y: 1.7, text: 'NIVEL 2', w: 1.6 });

  // ---- túneles de arriba ----
  tunnel(b, [[5, 5], [45, 5]], lit);
  tunnel(b, [[45, 5], [45, 25], [70, 25]], dark);
  tunnel(b, [[15, 5], [15, 35]], lit, 1);
  tunnel(b, [[15, 20], [45, 20]], dark);
  tunnel(b, [[70, 10], [70, 45]], lit);
  tunnel(b, [[45, 5], [90, 5], [90, 25]], dark, 2);
  tunnel(b, [[70, 15], [90, 15]], dark);
  tunnel(b, [[30, 20], [30, 40]], lit);
  tunnel(b, [[25, 20], [25, 10]], dark);
  b.window(25, 9.05, S);
  // sala de máquinas
  b.open(50, 9, 14, 11, { ceil: 4.5, wall: 3, floorMat: 1, lamps: 5 }).open(46, 11, 4, 2).open(64, 15, 5, 2);
  b.prop('tank', 53, 12, 0, { solid: [2.4, 2.4] }).prop('tank', 60, 12, 0, { solid: [2.4, 2.4] }).prop('tank', 53, 17.5, 0, { solid: [2.4, 2.4] });
  b.prop('machine', 63.6, 10.5, W, { solid: [0.8, 2.4] }).prop('gauge', 50.05, 15, E, { y: 1.5 }).prop('valve', 50.05, 18, E, { y: 1.2 });
  b.vent(57, 18.5, 6).item('agua', 60, 18.5);

  // ---- escaleras a los túneles de abajo y un salto sin vuelta ----
  b.ramp(14, 36, 2, 8, 3, -2.5, 0, true);
  b.ramp(69, 45, 2, 4, 3, -2.5, 0, true);
  b.open(29, 41, 2, 8, { floor: -2.5, dark: true });

  // ---- túneles de abajo ----
  const low = { floor: -2.5, dark: true };
  tunnel(b, [[15, 45], [15, 70], [55, 70]], low, 1);
  tunnel(b, [[30, 50], [85, 50], [85, 75]], low, 2);
  tunnel(b, [[55, 50], [55, 70]], { floor: -2.5, lamps: 6 });
  tunnel(b, [[25, 70], [25, 60]], low);
  b.window(25, 59.05, S);
  tunnel(b, [[85, 60], [104, 60]], low);
  // restos de un campamento abandonado (Aiding Stragglers)
  b.open(36, 55, 10, 7, { floor: -2.5, ceil: -0.2, wall: 1, floorMat: 1, lamps: 4 }).open(40, 51, 2, 4, { floor: -2.5, dark: true });
  b.prop('cot', 38.5, 57, E, { solid: [0.9, 2] }).prop('table', 43, 59, 0.2, { solid: [1.6, 1] }).prop('foldchair', 43, 57.8, 0.5);
  b.crate(44.5, 56, 0, 'comida');
  b.note(36.05, 58, E, 'Diario arrugado', 'Día 40. Vinieron por los túneles de abajo, en manada. Primero el gruñido, luego el ruido de las uñas en el hormigón.\n\nSi lees esto: los Hounds no aguantan que les mires, pero solo un momento. Grita y corre.');

  // ---- luces: tramos en serie y alguna violeta de emergencia ----
  for (const [x, z] of [[45, 12], [45, 22], [60, 25], [80, 5], [90, 18], [80, 15], [20, 20], [38, 20]]) b.lamp(x, z, { flicker: true });
  for (const [x, z, y] of [[25, 14, 2.3], [90, 10, 2.3], [15, 62, -0.2], [70, 50, -0.2], [85, 68, -0.2], [30, 46, -0.2]]) b.prop('violet', x, z, 0, { y });

  // ---- puertas de acero ----
  // cerradas (algunas con ventanuco que da a lo negro)
  for (const [x, z, r, win] of [[44.05, 15, E, 1], [15.95, 28, W, 0], [70.95, 35, W, 1], [30.95, 30, W, 0], [60, 4.05, S, 1], [84.05, 58, E, 0], [55.95, 64, W, 1]] as const) {
    b.door(x, z, r, { look: (x * 3) % 2 ? 'white' : 'steel', locked: true, window: !!win });
  }
  // a una sala con cajas y ordenadores
  b.door(46, 4.05, S, { look: 'steel', locked: false, to: { x: 38, z: 90, ry: N }, label: 'Abrir la puerta' });
  b.open(34, 86, 10, 9, { ceil: 2.8, wall: 0, floorMat: 0, lamps: 4 });
  b.door(38, 94.95, N, { look: 'steel', locked: false, to: { x: 46, z: 6, ry: S } });
  b.prop('pc', 35, 87, S, { solid: [1.2, 0.8] }).prop('pc', 37, 87, S, { solid: [1.2, 0.8] }).crate(42, 88, 0, 'herramientas').crate(42, 92, 0.4, 'comida');
  // a un pasillo de oficina que vuelve a la misma puerta
  b.door(89.05, 20, E, { look: 'white', locked: false, to: { x: 35, z: 101.75, ry: E }, label: 'Abrir la puerta' });
  b.open(34, 100, 26, 3.5, { ceil: 2.8, wall: 0, floorMat: 0, lamps: 4 });
  b.door(59.95, 101.75, W, { look: 'white', locked: false, to: { x: 90, z: 20, ry: W }, label: 'Abrir la puerta' });
  // al Vacío
  b.door(70.95, 40, W, { look: 'steel', locked: false, window: true, to: { x: 17, z: 111, ry: S }, label: 'Abrir la puerta (por el ventanuco se ve todo negro)' });
  b.open(2, 84, 28, 56, { ceil: 6, dark: true, floorMat: 0 }).zone('void', 2, 84, 28, 56);
  b.door(17, 110, N, { look: 'steel', locked: false, to: { x: 70, z: 40, ry: E }, label: 'Volver por la puerta' });
  b.note(69.05, 42, E, 'Escrito con rotulador', 'NO ABRAS LAS PUERTAS QUE DAN A LO NEGRO.\nDentro no hay nada. Nada de nada.\nY la puerta se aleja.', true, 1.4);

  // ---- objetos sueltos por los túneles ----
  for (const [x, z, r, y] of [[10, 4.6, 0, 0], [40, 19.6, 0, 0], [69.6, 30, E, 0], [14.6, 52, E, -2.5], [50, 49.6, 0, -2.5], [85.4, 66, E, -2.5]] as const) b.prop('trolley', x, z, r, { y, solid: [1.2, 0.7] });
  for (const [x, z, y] of [[46.4, 25.6, 0], [90.6, 7, 0], [55.6, 66, -2.5], [14.4, 64, -2.5]] as const) b.prop('barrel', x, z, 0, { y, solid: [0.7, 0.7] });
  for (const [x, z, t, y] of [[20, 4.4, 'toolbox', 0], [70, 20, 'ladder', 0], [33, 50.4, 'woodpile', -2.5], [75, 50.4, 'cords', -2.5], [15, 30, 'glass', 0], [60, 70.4, 'paper', -2.5], [86, 5.4, 'foldchair', 0]] as const) b.prop(t, x, z, (x * 0.7) % 3, { y });
  b.prop('wires', 40, 20, 0).prop('wires', 15, 46, 0, { y: -2.5 }).prop('wires', 70, 36, 0);
  b.prop('machine', 15.95, 12, W, { solid: [0.8, 2.4] }).prop('machine', 44.05, 25, E, { solid: [0.8, 2.4] }).prop('machine', 85.95, 55, W, { y: -2.5, solid: [0.8, 2.4] });
  for (const [x, z] of [[26, 5], [45, 16], [70, 30], [15, 55], [44, 70], [85, 65]]) b.vent(x, z);
  b.prop('text', 54.05, 52, E, { y: -0.9, text: 'OFFICE SPACE EL3A →', w: 3 });
  b.note(15.95, 8, W, 'Nota en una tubería', 'Las luces van en serie: si una se rompe, se apaga todo el tramo.\nLleva siempre pilas. Y no te acerques a las ventanas del final de los túneles.');
  b.note(85.95, 64, W, 'Nota de un trabajador de la B.N.T.G.', 'Desde el apagón los Smilers no se han ido. Viven en lo oscuro y vienen a la luz.\n\nLos Clumps esperan en las esquinas. Si oyes pasos que no son tuyos, quédate quieto.', true, -1.1);

  // ---- objetos ----
  b.item('pila', 25, 12.5).item('vendas', 90, 23).item('agua', 25, 66).item('pila', 80, 15.5).item('barrita', 30, 39).item('bengala', 55, 60).item('lata', 85, 72);

  // ---- criaturas ----
  b.lair('smiler', 35, 5).lair('smiler', 70, 38).lair('smiler', 22, 70).lair('smiler', 90, 22).lair('smiler', 80, 50);
  b.lair('clump', 45, 24).lair('clump', 15, 69).lair('clump', 84, 51);
  b.lair('hound', 50, 70).lair('hound', 52, 69);
  b.lair('faceling', 35, 50).lair('faceling', 36.5, 50).lair('faceling', 66, 50);
  for (const [x, z] of [[45, 12], [80, 5], [55, 60], [15, 48]]) b.critter('moth', x, z);
  for (const [x, z] of [[20, 70], [60, 50], [70, 20], [30, 5]]) b.critter('rat', x, z);

  // ================================================== zonas nuevas (planta baja)
  // ---- hacia el este: del laberinto viejo a la sala de calderas ----
  tunnel(b, [[90, 5], [136, 5]], dark, 2);
  tunnel(b, [[90, 25], [116, 25], [116, 40]], lit, 1);
  b.ramp(115, 40, 2, 10, 3, -2.5, 0, true);
  b.lamp(110, 25, { flicker: true }).prop('violet', 128, 5, 0, { y: 2.3 });
  b.prop('trolley', 100, 24.4, 0, { solid: [1.2, 0.7] }).prop('barrel', 134, 6.4, 0, { solid: [0.7, 0.7] });
  b.note(116.95, 32, W, 'Nota pegada con cinta', 'Al este hay una sala de calderas enorme. Las calderas siguen calientes aunque nadie las enciende.\n\nArriba hay pasarelas. Abajo, por el sur, la cisterna: no te caigas.');

  // ---- sala de bombas (hundida) ----
  b.open(104, 50, 24, 28, { floor: -2.5, ceil: 6, wall: 3, floorMat: 1, lamps: 6 });
  for (const [x, z] of [[110, 56], [110, 66], [120, 56], [120, 66]]) b.prop('tank', x, z, 0, { y: -2.5, solid: [2.4, 2.4] });
  b.prop('machine', 127.6, 72, W, { y: -2.5, solid: [0.8, 2.4] }).prop('gauge', 104.05, 70, E, { y: -1 }).prop('valve', 104.05, 74, E, { y: -1.3 });
  b.prop('pipe', 116, 51, E, { y: 4.6, w: 24 }).prop('pipe', 116, 77, E, { y: 4.2, w: 24 });
  b.wet(112, 70, 8, 6).item('pila', 125, 52);
  b.lair('clump', 105, 76).lair('smiler', 126, 60);
  tunnel(b, [[128, 64], [140, 64]], { floor: -2.5, dark: true }, 3);
  b.ramp(140, 63, 8, 2, 0, -2.5, 0, true).open(148, 56, 4, 9, { lamps: false });

  // ---- la sala de calderas: nave de 14 m con galería y pasarelas ----
  b.open(136, 4, 56, 52, { ceil: 4.6, wall: 3, floorMat: 1, lamps: 7 });
  b.ramp(189.5, 10, 2.5, 20, 2, 0, 5, true, 9.5).ramp(160, 53, 20, 2.5, 0, 0, 5, true, 9.5);
  for (const [x, z] of [[148, 14], [148, 42], [178, 14], [178, 42], [152, 28], [174, 28]]) {
    b.prop('tank', x - 1.2, z, 0, { solid: [2.4, 2.4] }).prop('tank', x + 1.2, z, 0, { solid: [2.4, 2.4] });
    b.prop('gauge', x, z - 1.25, N, { y: 1.5 });
  }
  for (const z of [10, 46]) b.prop('pipe', 164, z, E, { y: 3.8, w: 50 });
  b.prop('machine', 136.45, 20, E, { solid: [0.8, 2.4] }).prop('machine', 136.45, 36, E, { solid: [0.8, 2.4] });
  b.wet(158, 24, 12, 8).item('agua', 186, 52).crate(140, 52, 0.3, 'herramientas');
  b.lair('hound', 164, 18).lair('hound', 166, 19).lair('smiler', 186, 6).lair('faceling', 150, 50);
  for (const [x, z] of [[164, 30], [140, 10]]) b.critter('moth', x, z);
  b.critter('rat', 188, 40);
  b.prop('text', 136.05, 46, E, { y: 1.8, text: 'CALDERAS — NO TOCAR', w: 3.2 });

  // ---- la red de túneles del este ----
  tunnel(b, [[190, 44], [226, 44]], lit, 2);
  tunnel(b, [[204, 5], [204, 132]], dark);
  tunnel(b, [[226, 5], [226, 132]], dark, 1);
  tunnel(b, [[204, 5], [226, 5]], lit);
  tunnel(b, [[204, 80], [226, 80]], lit, 2);
  tunnel(b, [[204, 110], [226, 110]], dark);
  tunnel(b, [[204, 132], [226, 132]], lit);
  tunnel(b, [[215, 110], [215, 124]], { lamps: 7 }, 1);
  tunnel(b, [[204, 20], [214, 20]], dark);
  b.window(214.95, 20, W);
  for (const [x, z] of [[204, 30], [226, 60], [204, 96], [226, 120], [215, 5]]) b.lamp(x, z, { flicker: true });
  for (const [x, z] of [[204, 64], [226, 96], [215, 132]]) b.prop('violet', x, z, 0, { y: 2.3 });
  b.prop('trolley', 226.6, 30, E, { solid: [0.7, 1.2] }).prop('barrel', 203.4, 88, 0, { solid: [0.7, 0.7] }).prop('ladder', 226, 70, 0.4);
  for (const [x, z] of [[204, 50], [226, 100]]) b.vent(x, z);
  b.door(203.05, 70, E, { look: 'steel', locked: true, window: true }).door(226.95, 24, W, { look: 'white', locked: true });
  b.item('vendas', 226, 8).item('barrita', 204, 120).item('lata', 216, 80);
  b.lair('smiler', 226, 88).lair('clump', 204, 131).lair('hound', 215, 44).lair('faceling', 222, 110).lair('faceling', 223.5, 110);
  for (const [x, z] of [[204, 100], [226, 50]]) b.critter('rat', x, z);

  // ---- la cisterna: una sima de 6 m bajo los túneles, con una pasarela ----
  tunnel(b, [[85, 75], [85, 100], [100, 100]], low, 2);
  b.open(100, 90, 56, 44, { floor: -9, ceil: -3, wall: 0, floorMat: 0, lamps: 9 });
  b.deep(102, 92, 52, 40, 0.15);
  for (let x = 112; x < 156; x += 14) for (const z of [94, 108, 122]) b.solid(x - 0.6, z - 0.6, 1.2, 1.2);
  for (const [x, z, r] of [[106, 118, 0.6], [140, 128, 2.2], [128, 96, 1.4]] as const) b.prop('debris', x, z, r, { y: -9.1, solid: [1.6, 1.2] });
  b.ramp(156, 128, 16, 3, 0, -9, -2.5, true, 1);
  b.open(156, 99, 8, 2, { floor: -2.5, dark: true });
  tunnel(b, [[163, 100], [163, 129.5]], low, 2);
  tunnel(b, [[163, 129.5], [190, 129.5]], { floor: -2.5, lamps: 7 }, 2);
  b.ramp(190, 128.5, 13, 2, 0, -2.5, 0, true);
  b.item('bengala', 150, 130).crate(104, 132, 0.4, 'medico');
  b.lair('hound', 120, 115).lair('hound', 122, 116).lair('smiler', 150, 94);
  b.note(84.05, 92, E, 'Diario de un trabajador', 'La cisterna se llenó y se vació. Ahora solo queda un charco enorme y la pasarela.\n\nSi te caes, sube por la escalera de la esquina sureste. Si oyes uñas, no mires atrás.');

  // ====================================================== planta 1 (arriba)
  b.storey(1);
  // ---- galería y pasarelas de la sala de calderas ----
  b.open(136, 4, 56, 52, { floor: 5, ceil: 9.5, wall: 3, floorMat: 1, lamps: 6 });
  b.hole(140, 8, 48, 44).hole(189.5, 10, 2.5, 20).hole(160, 53, 20, 2.5);
  b.open(140, 27, 48, 2, { floor: 5, ceil: 9.5 }).open(163, 8, 2, 44, { floor: 5, ceil: 9.5 });
  b.hole(150, 27, 2, 2); // una rejilla que falta
  for (const [x, z, r, w] of [[145, 26.95, N, 10], [145, 29.05, 0, 10], [175, 26.95, N, 24], [175, 29.05, 0, 24], [162.95, 17, W, 18], [165.05, 17, E, 18], [162.95, 40, W, 22], [165.05, 40, E, 22]] as const) {
    b.prop('railing', x, z, r, { w });
  }
  b.prop('valve', 191.55, 40, W, { y: 6.2 }).item('pila', 164, 52).crate(190, 54, 0.2, 'comida');
  b.lair('smiler', 140, 54).lair('clump', 164, 9);
  b.note(191.95, 34, W, 'Nota en la barandilla', 'Desde aquí arriba se ve todo. Ellos también te ven a ti.\n\nFalta una rejilla en la pasarela del oeste.', true, 6.5);

  // ---- los túneles altos: pasan por encima de los de abajo, con rejillas rotas ----
  const high = { floor: 5, ceil: 7.6 };
  tunnel(b, [[138, 10], [100, 10], [100, 30], [30, 30], [30, 8]], { ...high, lamps: 7 }, 3);
  b.window(30, 7.05, S);
  b.hole(29, 22, 1, 2).hole(69, 29, 2, 1).hole(99, 24, 1, 2);
  b.prop('pipe', 65, 30, E, { y: 7.3, w: 70 }).prop('wires', 60, 30, 0, { y: 5 });
  b.item('agua', 100, 12).item('barrita', 40, 30);
  b.lair('smiler', 64, 30).lair('faceling', 100, 28);
  b.note(100.95, 18, W, 'Garabato en la tubería', 'LAS REJILLAS ESTÁN SUELTAS.\nSI PISAS UNA, ACABAS EN LOS TÚNELES DE ABAJO.', true, 6.4);

  // ---- la pasarela de la cisterna (a la altura de los túneles de abajo) ----
  b.open(100, 90, 56, 44, { floor: -2.5, ceil: 4, lamps: false });
  b.hole(100, 90, 56, 44);
  b.open(100, 99, 56, 2, { floor: -2.5, ceil: 4, lamps: 7 });
  b.hole(128, 99, 2, 1);
  for (let x = 112; x < 156; x += 14) for (const z of [94, 108, 122]) b.solid(x - 0.6, z - 0.6, 1.2, 1.2);
  for (const [x, z, r, w] of [[114, 98.95, N, 26], [114, 101.05, 0, 26], [143, 98.95, N, 26], [143, 101.05, 0, 26]] as const) b.prop('railing', x, z, r, { w });

  b.storey(0);

  // ---- salida ----
  b.exit(215, 124.95, N, 'SALIDA → NIVEL 3');
  b.note(214.05, 122, E, 'Nota en la puerta', 'Por aquí se llega al Nivel 3, la Estación Eléctrica. Más calor y más máquinas. Buena suerte.', true);

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
