// ACECHADOR: criatura de prueba (negra, larguirucha, dos puntos por ojos).
// Todo lo suyo está en esta carpeta. Para quitarla: ENABLED = false, o borrar
// la carpeta y las líneas marcadas con "ACECHADOR" (buscar en src/).

/** Interruptor general. */
export const ENABLED = true;
/** Nivel en el que aparece, siempre (planta de abajo). */
export const LEVEL = 0;
/**
 * Dónde aparece (metros): el centro de la sala de columnas del Nivel 0
 * (PILLARS en levels.ts: de (24, 4) a (48, 20)). Si ahí hay una columna, se
 * usa el hueco libre más cercano.
 */
export const SPAWN = { x: 36, z: 12 };

/** Cómo es (mismos campos que el resto de criaturas en authority.ts). */
export const SPEC = {
  eye: 2.5,
  wake: 999, // aparece en cuanto hay alguien en su nivel y nunca se va por distancia
  walk: 1.5,
  run: 4.9, // corriendo le ganas (5,6 m/s); andando no
  reach: 1.7, // brazos larguísimos
  damage: 30,
  cooldown: 2.5,
};

/** Medidas del cuerpo (metros): muy alto, piernas y brazos larguísimos, torso estrecho. */
export const BODY = {
  thigh: 0.78,
  shin: 0.78,
  hipHeight: 1.46,
  hipWidth: 0.11,
  torso: 0.7,
  neck: 0.3,
  upperArm: 0.86,
  forearm: 0.92,
  shoulder: 0.19,
  height: 2.75,
  /** Encorvado de serie (radianes). */
  hunch: 0.22,
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
