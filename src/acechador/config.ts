// ACECHADOR: criatura de prueba (negra, larguirucha, dos puntos por ojos).
// Todo lo suyo está en esta carpeta. Para quitarla: ENABLED = false, o borrar
// la carpeta y las líneas marcadas con "ACECHADOR" (buscar en src/).

/** Interruptor general. */
export const ENABLED = true;
/** Nivel en el que aparece, siempre, cerca del centro del mapa (planta de abajo). */
export const LEVEL = 0;

/** Cómo es (mismos campos que el resto de criaturas en authority.ts). */
export const SPEC = {
  eye: 2.15,
  wake: 999, // aparece en cuanto hay alguien en su nivel y nunca se va por distancia
  walk: 1.5,
  run: 4.9, // corriendo le ganas (5,6 m/s); andando no
  reach: 1.4, // brazos largos
  damage: 30,
  cooldown: 2.5,
};

/** Medidas del cuerpo (metros). */
export const BODY = {
  thigh: 0.64,
  shin: 0.64,
  hipHeight: 1.18,
  hipWidth: 0.13,
  torso: 0.62,
  neck: 0.22,
  upperArm: 0.62,
  forearm: 0.66,
  shoulder: 0.23,
  height: 2.35,
};

/** Dónde aparece: la casilla libre más cercana al centro de la planta de abajo. */
export function spawnPoint(map: { w: number; h: number; flags: Uint16Array }, cell: number, free: (i: number) => boolean): { x: number; z: number } {
  const cx = Math.floor(map.w / 2);
  const cz = Math.floor(map.h / 2);
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
