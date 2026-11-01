// ACECHADOR: criatura de prueba (negra, larguirucha, dos puntos por ojos).
// Todo lo suyo está en esta carpeta. Para quitarla: ENABLED = false, o borrar
// la carpeta y las líneas marcadas con "ACECHADOR" (buscar en src/).

/** Interruptor general. */
export const ENABLED = true;
/** Nivel en el que aparece, siempre (planta de abajo). */
export const LEVEL = 0;
/**
 * Radio de su cuerpo al chocar con paredes y columnas (las demás criaturas:
 * 0,28). Más grande no cabe por los pasillos de 1 m del Nivel 0.
 */
export const RADIUS = 0.3;
/** Para pruebas: no hace daño ni da sustos (ataca, pero sin efecto). */
export const HARMLESS = true;
/**
 * Dónde aparece (metros): el centro de la sala de columnas del Nivel 0
 * (PILLARS en levels.ts: de (24, 4) a (48, 20)). Si ahí hay una columna, se
 * usa el hueco libre más cercano.
 */
export const SPAWN = { x: 36, z: 12 };

/** Cómo es (mismos campos que el resto de criaturas en authority.ts). */
export const SPEC = {
  eye: 2.6,
  wake: 999, // aparece en cuanto hay alguien en su nivel y nunca se va por distancia
  walk: 1.3,
  run: 4.4, // corriendo le ganas de sobra (5,6 m/s); andando no
  reach: 1.7, // brazos larguísimos
  damage: 30,
  cooldown: 2.5,
};

/** Medidas del cuerpo (metros): muy alto, piernas largas y abiertas, brazos larguísimos. */
export const BODY = {
  thigh: 0.88,
  shin: 0.88,
  hipHeight: 1.66,
  hipWidth: 0.15,
  torso: 0.62,
  neck: 0.26,
  upperArm: 0.9,
  forearm: 0.96,
  shoulder: 0.21,
  height: 2.85,
  /** Encorvado de serie (radianes). */
  hunch: 0.2,
};

/** Dónde aparece: la casilla libre (con sitio alrededor) más cercana a SPAWN. */
export function spawnPoint(map: { w: number; h: number; flags: Uint16Array }, cell: number, free: (i: number) => boolean): { x: number; z: number } {
  const cx = Math.floor(SPAWN.x / cell);
  const cz = Math.floor(SPAWN.z / cell);
  for (let r = 0; r < Math.max(map.w, map.h); r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 1 || z < 1 || x >= map.w - 1 || z >= map.h - 1) continue;
        // con sitio alrededor (no pegado a una pared)
        if ([0, 1, -1, map.w, -map.w].every((o) => free(z * map.w + x + o))) return { x: (x + 0.5) * cell, z: (z + 0.5) * cell };
      }
    }
  }
  return { x: cx * cell, z: cz * cell };
}
