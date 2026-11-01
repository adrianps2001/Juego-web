import type { Env } from './locomotion';
import { F_SOLID, cellOf, ceilOver, flagsAt, floorUnder, gridAt, type LevelMap } from './world';

/** El mapa de este juego visto por la locomoción procedural (src/locomotion). */
export function levelEnv(map: () => LevelMap | null): Env {
  return {
    floor(x, z, y) {
      const m = map();
      return m ? floorUnder(m, x, z, y) : 0;
    },
    ceil(x, z, y) {
      const m = map();
      return m ? ceilOver(m, x, z, y + 0.3) : Infinity;
    },
    solid(x, y, z) {
      const m = map();
      return !!m && (flagsAt(gridAt(m, x, z, y - 1), cellOf(x), cellOf(z)) & F_SOLID) !== 0;
    },
  };
}
