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
//    Son las más estables: nunca cambian.
//  - Agujeros en cuadrícula, negros: nadie ha sobrevivido a una caída.
//  - Zonas de apagón: sin luz, paredes rugosas, silencio, suelo hundido con
//    fluido hasta los tobillos.
//  - Habitaciones Rojas: el papel se despega y deja ver rojo; la moqueta se
//    vuelve espesa. Una vez dentro, el pasillo no tiene fin.
//  - «Cambio periférico»: partes del laberinto cambian cuando nadie mira.
//  - «Efecto aislamiento»: no se ve a los demás, salvo en una sala pequeña.
//  - Entidades: no confirmadas. Solo figuras oscuras que acechan.
//  - Salida: lanzarse a través de una pared que parpadea (al Nivel 1).
// Paredes: 0 amarillo · 1 pálido · 2 oficina · 3 yeso rugoso · 4 rojo despegado
// Suelos: 0 moqueta · 1 linóleo · 2 moqueta seca · 3 moqueta roja
// ===========================================================================
function level0(): LevelMap {
  const b = new Builder(0, LEVELS[0], 110, 84, { ceil: 2.8 });

  // ---- donde te despiertas ----
  b.open(2, 2, 14, 12).spawn(6, 6);
  b.solid(9, 2, 0.5, 5).solid(2, 9, 5, 0.5);
  b.prop('outlet', 2.05, 12, E, { y: 0.35 }).prop('vent', 12, 2.05, S, { y: 2.3 });
  b.glitch(15.95, 11, W, 1.2, 1.6);
  b.note(2.05, 5, E, 'Nota arrugada', 'Si lees esto, has hecho noclip. Estás en el Nivel 0.\n\nAquí no hay nadie. Aunque tus amigos hayan caído contigo, no los verás. Solo en una sala pequeña, al oeste, nos encontramos de verdad.\n\nNo te acerques a los agujeros del suelo. Y si una pared parpadea… atraviésala.');

  // ---- laberinto de salas y pasillos ----
  b.open(16, 5, 8, 2);
  b.open(24, 2, 10, 8).solid(28, 5, 1, 1);
  b.open(34, 4, 8, 2);
  b.open(26, 10, 2, 8);
  b.open(16, 18, 26, 2.5);
  b.open(4, 14, 2, 8);
  b.open(2, 22, 12, 8, { ceilMat: 1 }).solid(7, 22, 0.5, 4);
  b.open(14, 24, 2, 2).open(16, 18, 2, 8);
  // escaleras a una sala elevada y bajada por el otro lado
  b.ramp(34, 20.5, 2, 3, 2, 0, 1.2, true, 4);
  b.open(30, 23.5, 10, 8, { floor: 1.2, ceil: 4.2, lamps: 3.5 });
  b.ramp(30, 31.5, 2, 3, 3, 0, 1.2, true, 4);
  b.open(26, 34.5, 14, 2);
  // la sala pequeña donde sí se puede ver a los demás
  b.open(20, 28, 6, 5, { wall: 2, floorMat: 1, lamps: 3 }).open(22, 33, 2, 1.5).open(22, 34.5, 4, 2).zone('meeting', 20, 28, 6, 5);
  b.note(20.05, 30.5, E, 'Escrito en la pared', 'AQUÍ SÍ TE VEO.\nAQUÍ SÍ ME VES.\nNO SALGAS SOLO.', true, 1.5);
  b.open(6, 30, 2, 8).open(2, 38, 30, 2).open(28, 36.5, 2, 1.5);
  b.open(10, 40, 2, 6);
  // cambio periférico: pares de huecos que se turnan
  b.shift(26, 12, 2, 0.5, true).shift(34, 4, 0.5, 2, false, 0, true);
  b.shift(14, 24, 0.5, 2, false).shift(6, 30, 2, 0.5, true, 0, true);
  b.shift(20, 38, 0.5, 2, true).shift(28, 36.5, 2, 0.5, false, 0, true);
  b.prop('tile', 9, 26, 0.5).prop('hole', 9, 26, 0, { y: 2.8 }).prop('tube', 36, 25.5, 1.3, { y: 1.2 });
  b.glitch(39.95, 27, W, 1.4, 2, false, 2.3);
  b.lair('figure', 38, 35.5).lair('figure', 3, 39).lair('figure', 33, 8);
  b.item('agua', 3, 28).item('pila', 33, 8.5);
  b.zone('whisper', 2, 22, 12, 8);

  // ---- sala de columnas (enorme, en cuadrícula) ----
  b.open(42, 2, 44, 28, { ceil: 3.2, floorMat: 2 }).open(40, 18, 2, 2.5);
  for (let x = 44.5; x < 86; x += 3) {
    for (let z = 4.5; z < 30; z += 3) {
      // algunas columnas desplazadas: el cambio periférico las descuadra
      const off = (Math.round(x * 7 + z * 3) % 5 === 0) ? 0.5 : 0;
      b.solid(x - 0.25 + off, z - 0.25, 0.5, 0.5);
    }
  }
  b.shift(65.25, 13.25, 1, 1, false).shift(68.25, 16.25, 1, 1, true, 0, true);
  b.glitch(85.95, 16, W, 1.6, 2.4, true); // pared que parpadea: salida al Nivel 1
  b.lair('figure', 84, 4).lair('figure', 60, 28);
  b.item('agua', 70, 10).item('barrita', 52, 26);
  b.prop('text', 42.05, 10, E, { y: 1.6, text: 'ELIGE UN RUMBO', w: 2.4 });

  // ---- agujeros en cuadrícula ----
  b.open(50, 30, 3, 4);
  b.open(44, 34, 26, 22, { ceil: 3, lamps: 4.5, ceilMat: 1 });
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 5; gz++) b.pit(46 + gx * 3.5, 36 + gz * 3.5, 1.5, 1.5);
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 3; gz++) b.pit(60 + gx * 2.5, 46 + gz * 2.5, 1.5, 1.5);
  b.item('vendas', 68.5, 54.5).prop('text', 44.05, 40, E, { y: 1.6, text: 'NO HAY FONDO', w: 2 });
  b.note(44.05, 46, E, 'Hoja de libreta', 'Tiré una pila por uno de los agujeros. Nunca la oí llegar.\n\nEl suelo de alrededor cede. Rodéalos pegado a la pared.');

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
  // arcos ciegos en los fondos (decoran, no llevan a ningún sitio)
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
  b.glitch(107.95, 47, W, 1.4, 2.2, true);
  b.lair('figure', 104, 35).lair('figure', 84, 58).lair('figure', 92, 40);
  b.item('pila', 100, 35);
  b.note(72.05, 36, E, 'Nota casi ilegible', 'Aquí no llega el zumbido. Aquí no llega la luz.\nHay figuras al fondo que solo se mueven cuando no miras.\nEl suelo está hundido y mojado: no corras.');
  b.prop('text', 72.05, 41, E, { y: 1.6, text: 'SIGUE EL ZUMBIDO', w: 2.6 });

  // ---- Habitaciones Rojas ----
  b.open(90, 62, 2.5, 6, { wall: 4, lamps: 3 });
  b.open(80, 68, 20, 6, { wall: 4, floorMat: 3, lamps: 3.5 });
  b.open(98, 74, 2, 2, { floorMat: 3 });
  b.open(74, 76, 34, 3.5, { wall: 4, floorMat: 3, lamps: 3.5 });
  b.red(90, 64, 2.5, 4).red(80, 68, 20, 6).red(74, 74, 34, 8);
  b.shift(98, 74, 2, 2, false, 4); // la entrada: se cierra a tu espalda
  b.loop({ axis: 'x', x0: 78, x1: 104, z0: 76, z1: 79.5 });
  for (const x of [80, 86, 92, 98, 104]) b.prop('door2wall', x, 79.45, N);
  b.glitch(91, 76.05, S, 1.2, 2, true); // casi nadie la encuentra
  b.zone('red', 74, 62, 34, 20);
  b.prop('text', 90.05, 66, E, { y: 1.6, text: 'VUELVE', w: 1.4 });

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
  const b = new Builder(1, LEVELS[1], 120, 96, { ceil: 5.5 });

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
  b.prop('paint', 69.4, 31.5, W, { y: 0, h: 5.5 });
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
  b.npc({ kind: 'meg', x: 92, z: 20, ry: N, lines: ['Para bajar al Nivel 2, busca un pasillo que siga más de lo normal.', 'Al sur hay un sector en obras. No te acerques a los trabajadores.', 'Allí abajo hace calor. Lleva pilas.'] });
  b.prop('cot', 77, 3.5, S, { solid: [2, 0.9] }).prop('cot', 80, 3.5, S, { solid: [2, 0.9] }).prop('cot', 77, 22.5, N, { solid: [2, 0.9] });
  b.prop('meg', 90, 9, S, { solid: [2, 1] }).prop('radio', 96, 3, S, { solid: [0.5, 0.5] }).prop('tent', 79, 13, 0.3, { solid: [2.4, 2.4] });
  b.crate(95, 22, 0, 'medico').crate(87, 22, 0.1, 'comida');
  b.note(97.95, 16, W, 'Tablón de la M.E.G.', 'GUÍA RÁPIDA DE ENTIDADES\n\nSmilers: les atrae la luz. Apágala, mírales y aléjate despacio. Si corres o haces ruido, atacan.\n\nHounds: mírales a los ojos y grita (tecla G). No aguantarán mucho.\n\nSkin-Stealers: alguien solo que llora y pide ayuda... no te acerques. Aléjate con calma.\n\nDullers: si oyes arañar dentro de una pared, apártate de ella.\n\nClumps: no ven. Agáchate (C) y no hagas ruido.');

  // ---- pasillo de hormigón que no acaba (no euclídeo) ----
  b.open(70, 30, 30, 3, { ceil: 3.5, lamps: 5, wall: 0 });
  b.loop({ axis: 'x', x0: 73, x1: 96, z0: 30, z1: 33, oneWay: 1, landmark: { x: 99, z: 31.5 } });
  b.prop('panel', 99.95, 31.5, W, { y: 1 });
  b.note(70.5, 29.6, S, 'Garabato en la pared', 'Si el pasillo no se acaba, mira el panel eléctrico del fondo y NO apartes la vista mientras andas.', true, 1.6);

  // ---- sector en obras ----
  b.open(100, 26, 18, 24, { ceil: 5, wall: 2, lamps: 6 });
  b.solid(106, 34, 0.5, 8, 2).solid(110, 44, 6, 0.5, 2);
  b.prop('scaffold', 104, 30, 0, { solid: [3, 1.2] }).prop('scaffold', 113, 46, E, { solid: [3, 1.2] });
  for (const [x, z] of [[103, 40], [108, 47], [115, 30]]) b.prop('cone', x, z, 0);
  b.npc({ kind: 'worker', x: 104, z: 33, ry: N, lines: [], path: [[104, 33], [104, 42], [102, 42]] });
  b.npc({ kind: 'worker', x: 112, z: 42, ry: E, lines: [], path: [[108, 42], [116, 42], [116, 36]] });
  b.npc({ kind: 'worker', x: 114, z: 36, ry: W, lines: [] });
  b.note(100.5, 25.6, S, 'Cartel torcido', 'PELIGRO — OBRAS\nNo te acerques a los trabajadores. No contestan y no se apartan.', true, 1.8);
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
  b.prop('forklift', 51, 76, 0.6, { solid: [1.4, 2.4] }).prop('pallet', 30, 90, 0.2, { solid: [1.2, 1] });
  b.note(12.05, 66, E, 'Guía de cajas (Recolección M.E.G.)', 'Las cajas aparecen a tu espalda o después de un Parpadeo, y se esfuman si dejas de mirarlas.\n\nMira lo que hay antes de meter la mano: a veces hay cristales.\n\nPrioriza agua, latas, vendas y pilas. No cargues con lo que no necesites.');
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
  b.prop('chair', 105, 80.5, 0.7, { y: -0.25 }).prop('padding', 106.95, 80.5, W, { w: 5 });
  b.open(102, 66, 4.5, 6, { ceil: 2.6, wall: 1, lamps: 3 }).open(106.5, 68, 0.5, 1.5, { ceil: 2.6 }); // sala de cuadros (en las paredes y en el suelo)
  b.prop('painting', 102.05, 68, E, { y: 1.5 }).prop('painting', 104.5, 66.05, S, { y: 1.5 }).prop('floorpainting', 104, 70, 0.4).prop('floorpainting', 105.2, 68.5, 1.9);
  // pasillo largo: la Skin-Stealer llora al fondo, con un rastro de sangre
  b.corridor([[104, 90], [104, 94]], 2, cor);
  b.prop('blood', 104, 92.5, 0.2).prop('blood', 104, 91, 1.4);
  b.lair('skinstealer', 104, 93.6, ['¿Hola?', 'Necesito ayuda, por favor.', 'Está todo suelto…', 'Ayúdame… ayú-da-me.', 'No me dejes aquí.']);
  b.note(100.05, 84, E, 'Nota de los Nómadas', 'Los pasillos son seguros, pero no te pierdas. Para dormir, busca una sala del tamaño de un dormitorio.\n\nNo uses los cerrojos: desaparecen cuando los miras.');
  b.note(104.95, 92, W, 'Nota manchada', 'La sangre roja, vivo.\nLa sangre clara, aléjate.');
  // el pasillo que sigue más de lo normal y baja
  b.corridor([[116, 63], [116, 56], [114, 56]], 2, { ...cor, lamps: 6 });
  b.ramp(104, 55, 10, 2, 0, -3, 0, true, 2.6);
  b.open(100, 55, 4, 2, { floor: -3, ceil: -0.4, wall: 1, ceilMat: 1, lamps: 3 });
  b.exit(100.05, 56, E, 'ESCALERA → NIVEL 2');
  b.note(110, 55.05, S, 'Nota en la escalera', 'Este pasillo sigue más de lo que debería. Al fondo empieza el Nivel 2: túneles, calor y muy poca comida.');

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
  const b = new Builder(2, LEVELS[2], 132, 82, { ceil: 2.6 });
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
  tunnel(b, [[85, 60], [95, 60]], low);
  b.window(95.95, 60, W);
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
  b.door(46, 4.05, S, { look: 'steel', locked: false, to: { x: 106, z: 8, ry: N }, label: 'Abrir la puerta' });
  b.open(102, 2, 10, 9, { ceil: 2.8, wall: 0, floorMat: 0, lamps: 4 });
  b.door(106, 10.95, N, { look: 'steel', locked: false, to: { x: 46, z: 6, ry: S } });
  b.prop('pc', 103, 3, S, { solid: [1.2, 0.8] }).prop('pc', 105, 3, S, { solid: [1.2, 0.8] }).crate(110, 4, 0, 'herramientas').crate(110, 8, 0.4, 'comida');
  // a un pasillo de oficina que vuelve a la misma puerta
  b.door(89.05, 20, E, { look: 'white', locked: false, to: { x: 103, z: 16.75, ry: E }, label: 'Abrir la puerta' });
  b.open(102, 15, 26, 3.5, { ceil: 2.8, wall: 0, floorMat: 0, lamps: 4 });
  b.door(127.95, 16.75, W, { look: 'white', locked: false, to: { x: 90, z: 20, ry: W }, label: 'Abrir la puerta' });
  // al Vacío
  b.door(70.95, 40, W, { look: 'steel', locked: false, window: true, to: { x: 117, z: 49, ry: S }, label: 'Abrir la puerta (por el ventanuco se ve todo negro)' });
  b.open(102, 22, 28, 56, { ceil: 6, dark: true, floorMat: 0 }).zone('void', 102, 22, 28, 56);
  b.door(117, 48, N, { look: 'steel', locked: false, to: { x: 70, z: 40, ry: E }, label: 'Volver por la puerta' });
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

  // ---- salida ----
  b.exit(85, 75.95, N, 'SALIDA → NIVEL 3');
  b.note(84.05, 73, E, 'Nota en la puerta', 'Por aquí se llega al Nivel 3, la Estación Eléctrica. Más calor y más máquinas. Buena suerte.', true, -1);

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
