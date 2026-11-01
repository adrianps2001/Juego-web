import type { LevelMap } from '../world';
import { SPEC } from './config';

// Comportamiento del Acechador (lo ejecuta el anfitrión). Te busca por el
// laberinto; si te ve o te oye, corre a por ti. Tras golpear se aparta un
// momento y vuelve. Si te pierde de vista un rato, vuelve a merodear.

/** Lo que necesita saber de la criatura (es un Entity de authority.ts). */
export interface Mob {
  x: number;
  z: number;
  anim: number;
  mode: string;
  timer: number;
  attackCd: number;
  target: string | null;
  close: number; // aquí: segundos sin verte
  lair: { x: number; z: number };
}

/** Lo que necesita saber de cada jugador. */
export interface Prey {
  id: string;
  x: number;
  z: number;
  noise: number;
  sprint: boolean;
}

/** Herramientas de movimiento y sentidos del anfitrión (authority.ts). */
export interface Tools<M, P> {
  chase(e: M, p: P, map: LevelMap, speed: number, dt: number): boolean;
  away(e: M, p: P, map: LevelMap, speed: number, dt: number): void;
  prowl(e: M, here: P[], map: LevelMap, speed: number, dt: number): boolean;
  wander(e: M, map: LevelMap, speed: number, radius: number, dt: number): void;
  sees(e: M, p: P, map: LevelMap): boolean;
  hit(e: M, p: P): void;
  setMode(e: M, mode: 'chase' | 'flee' | 'wander' | 'idle'): void;
}

const A = { Idle: 0, Walk: 1, Run: 2, Attack: 3, Flee: 4 };

export function acechadorThink<M extends Mob, P extends Prey>(e: M, here: P[], map: LevelMap, dt: number, t: Tools<M, P>) {
  let target = here.find((p) => p.id === e.target) ?? null;

  if (e.mode === 'flee') {
    // tras el golpe se aparta un poco… y vuelve
    e.anim = A.Flee;
    if (target) t.away(e, target, map, SPEC.run * 0.7, dt);
    if (e.timer > 2) {
      t.setMode(e, 'chase');
      e.target = target?.id ?? null;
    }
    return;
  }

  if (!target || e.mode !== 'chase') {
    for (const p of here) {
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      // te ve, te oye o te huele (a menos de 8 m, aunque haya paredes)
      if ((d < 30 && t.sees(e, p, map)) || d < p.noise * 22 || d < 8) {
        target = p;
        t.setMode(e, 'chase');
        e.target = p.id;
        e.close = 0;
        break;
      }
    }
  }

  if (target && e.mode === 'chase') {
    const d = Math.hypot(target.x - e.x, target.z - e.z);
    e.close = t.sees(e, target, map) ? 0 : e.close + dt;
    if (d < SPEC.reach && e.attackCd <= 0) {
      e.anim = A.Attack;
      t.hit(e, target);
      t.setMode(e, 'flee');
      e.target = target.id;
      return;
    }
    // sin verte 7 s, o demasiado lejos: te pierde
    if (e.close > 7 || d > 45 || !t.chase(e, target, map, SPEC.run, dt)) {
      t.setMode(e, 'wander');
      return;
    }
    e.anim = A.Run;
    return;
  }

  // nadie a la vista: va hacia donde hay gente, despacio; si no, ronda su zona
  if (t.prowl(e, here, map, SPEC.walk * 1.3, dt)) return;
  t.wander(e, map, SPEC.walk, 20, dt);
}
