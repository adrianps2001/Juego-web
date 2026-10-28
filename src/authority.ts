import { ESCAPED, LEVELS, getMap } from './levels';
import { Anim } from './models';
import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  TICK_MS,
  type ClientMessage,
  type EntityState,
  type HostMessage,
  type PlayerState,
} from './protocol';
import { cellOf, center, distanceField, floorAt, lineOfSight, walkable, type EntityKind, type LevelMap } from './world';

export interface Outbox {
  sendTo: (id: string, msg: HostMessage) => void;
  broadcast: (msg: HostMessage) => void;
}

const PATH_EVERY = 0.2; // segundos entre recálculos de caminos
const PATH_CELLS = 90; // alcance de la búsqueda de caminos (casillas de 0,5 m)

// cómo es cada criatura
const SPEC: Record<EntityKind, { eye: number; wake: number; walk: number; run: number; reach: number; damage: number; cooldown: number }> = {
  smiler: { eye: 1.6, wake: 28, walk: 1.5, run: 2.6, reach: 0.9, damage: 60, cooldown: 25 },
  hound: { eye: 0.85, wake: 45, walk: 1.4, run: 4.6, reach: 1.15, damage: 22, cooldown: 1.2 },
  faceling: { eye: 1.95, wake: 60, walk: 1.0, run: 3.6, reach: 1.0, damage: 15, cooldown: 1.5 },
  skinstealer: { eye: 2.35, wake: 35, walk: 1.5, run: 4.2, reach: 1.2, damage: 45, cooldown: 6 },
};

interface Lair {
  level: number;
  kind: EntityKind;
  x: number;
  z: number;
  entity: number | null;
  cooldown: number;
}

interface Entity extends EntityState {
  lair: Lair;
  mode: 'idle' | 'wander' | 'chase' | 'stare' | 'flee';
  timer: number; // tiempo en el modo actual
  attackCd: number;
  target: string | null;
  goal: { x: number; z: number } | null;
  anger: number;
  stare: number;
}

interface Player extends PlayerState {
  speed: number;
  lastX: number;
  lastZ: number;
  lastT: number;
}

/**
 * Lógica de la partida que solo ejecuta el anfitrión: quién está en la sala,
 * qué objetos se han recogido, dónde están los enemigos y qué hacen.
 */
export class Authority {
  private players = new Map<string, Player>();
  private entities: Entity[] = [];
  private lairs: Lair[] = [];
  private picked = new Set<string>();
  private nextEntity = 1;
  private timer: number;
  private pathClock = 0;
  private fields = new Map<string, Int16Array>();
  private blackout = LEVELS.map(() => 0); // segundos de apagón que quedan
  private nextBlackout = LEVELS.map(() => 60 + Math.random() * 60);
  private allDark = new Map<number, Uint8Array>();

  constructor(private out: Outbox) {
    LEVELS.forEach((_, level) => {
      for (const l of getMap(level).lairs) this.lairs.push({ level, ...l, entity: null, cooldown: 0 });
    });
    this.timer = window.setInterval(() => this.tick(TICK_MS / 1000), TICK_MS);
  }

  join(id: string, rawName: string): boolean {
    if (this.players.size >= MAX_PLAYERS) return false;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const name = rawName.trim().slice(0, 16) || 'Jugador';
    const spawn = getMap(0).spawn;
    const p: Player = {
      id,
      name,
      color: PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0],
      level: 0,
      x: spawn.x + (Math.random() - 0.5) * 2,
      y: spawn.y,
      z: spawn.z + (Math.random() - 0.5) * 2,
      ry: 0,
      light: false,
      sprint: false,
      dead: false,
      speed: 0,
      lastX: 0,
      lastZ: 0,
      lastT: performance.now(),
    };
    this.players.set(id, p);
    this.out.sendTo(id, { t: 'welcome', id, color: p.color, picked: [...this.picked], x: p.x, z: p.z });
    this.notice(`${name} ha caído en los Backrooms`);
    return true;
  }

  leave(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.notice(`${p.name} ha desaparecido`);
  }

  handle(id: string, msg: ClientMessage) {
    const p = this.players.get(id);
    if (!p) return;
    switch (msg.t) {
      case 'pose': {
        const prev = p.level;
        const now = performance.now();
        const dt = Math.max(0.01, (now - p.lastT) / 1000);
        const v = Math.hypot(msg.pose.x - p.x, msg.pose.z - p.z) / dt;
        Object.assign(p, msg.pose);
        p.speed = msg.pose.level === prev ? p.speed * 0.6 + Math.min(v, 10) * 0.4 : 0;
        p.lastT = now;
        if (p.level !== prev) {
          if (p.level === ESCAPED) this.notice(`¡${p.name} ha escapado de los Backrooms!`);
          else if (p.level > prev) this.notice(`${p.name} ha llegado al ${LEVELS[p.level].name}: ${LEVELS[p.level].title}`);
          else this.notice(`${p.name} ha vuelto a caer en los Backrooms`);
        }
        break;
      }
      case 'pickup':
        if (!this.picked.has(msg.key)) {
          this.picked.add(msg.key);
          this.out.broadcast({ t: 'picked', key: msg.key, by: id });
        }
        break;
      case 'died':
        this.notice(`${p.name} ${msg.reason}`);
        break;
    }
  }

  stop() {
    window.clearInterval(this.timer);
  }

  private notice(text: string) {
    this.out.broadcast({ t: 'notice', text });
  }

  // ------------------------------------------------------------------ bucle

  private tick(dt: number) {
    const alive = [...this.players.values()].filter((p) => p.level < ESCAPED && !p.dead);
    this.updateBlackouts(dt, alive);
    this.pathClock -= dt;
    if (this.pathClock <= 0) {
      this.pathClock = PATH_EVERY;
      this.fields.clear();
    }
    this.wakeLairs(alive, dt);
    for (const e of [...this.entities]) this.think(e, alive, dt);
    this.out.broadcast({
      t: 'state',
      players: [...this.players.values()].map(({ speed: _s, lastX: _x, lastZ: _z, lastT: _t, ...rest }) => rest),
      entities: this.entities.map(({ id, kind, level, x, z, ry, anim }) => ({ id, kind, level, x: round(x), z: round(z), ry: round(ry), anim })),
      blackout: this.blackout.map((b, i) => (b > 0 ? i : -1)).filter((i) => i >= 0),
    });
  }

  private updateBlackouts(dt: number, alive: Player[]) {
    LEVELS.forEach((L, level) => {
      if (!L.blackouts || !alive.some((p) => p.level === level)) return;
      if (this.blackout[level] > 0) {
        this.blackout[level] -= dt;
        if (this.blackout[level] <= 0) this.nextBlackout[level] = 70 + Math.random() * 80;
        return;
      }
      this.nextBlackout[level] -= dt;
      if (this.nextBlackout[level] <= 0) {
        this.blackout[level] = 16 + Math.random() * 8;
        this.fields.clear();
      }
    });
  }

  /** Casillas por las que puede ir un Smiler (en un apagón, todas). */
  private darkMask(map: LevelMap): Uint8Array {
    if (this.blackout[map.level] <= 0) return map.dark;
    let all = this.allDark.get(map.level);
    if (!all) {
      all = new Uint8Array(map.w * map.h).fill(1);
      this.allDark.set(map.level, all);
    }
    return all;
  }

  /** Campo de distancias hacia un jugador (cacheado unos instantes). */
  private field(map: LevelMap, p: Player, darkOnly: boolean): Int16Array {
    const key = `${p.id}|${map.level}|${darkOnly}`;
    let f = this.fields.get(key);
    if (!f) {
      f = distanceField(map, cellOf(p.x), cellOf(p.z), PATH_CELLS, darkOnly, this.darkMask(map));
      this.fields.set(key, f);
    }
    return f;
  }

  private wakeLairs(alive: Player[], dt: number) {
    for (const lair of this.lairs) {
      if (lair.entity !== null) continue;
      lair.cooldown -= dt;
      if (lair.cooldown > 0) continue;
      const dists = alive.filter((p) => p.level === lair.level).map((p) => Math.hypot(p.x - lair.x, p.z - lair.z));
      if (!dists.length) continue;
      const near = Math.min(...dists);
      const spec = SPEC[lair.kind];
      if (near > spec.wake || near < (lair.kind === 'faceling' ? 0 : 7)) continue;
      const e: Entity = {
        id: this.nextEntity++,
        kind: lair.kind,
        level: lair.level,
        x: lair.x,
        z: lair.z,
        ry: Math.random() * Math.PI * 2,
        anim: Anim.Idle,
        lair,
        mode: 'idle',
        timer: 0,
        attackCd: 0,
        target: null,
        goal: null,
        anger: 0,
        stare: 0,
      };
      lair.entity = e.id;
      this.entities.push(e);
    }
  }

  private despawn(e: Entity, cooldown: number) {
    e.lair.entity = null;
    e.lair.cooldown = cooldown;
    this.entities = this.entities.filter((x) => x !== e);
  }

  private hit(e: Entity, p: Player) {
    const spec = SPEC[e.kind];
    e.attackCd = spec.cooldown;
    e.anim = Anim.Attack;
    this.out.sendTo(p.id, { t: 'hit', damage: spec.damage, kind: e.kind });
  }

  // ------------------------------------------------------------------ comportamientos

  private think(e: Entity, alive: Player[], dt: number) {
    const map = getMap(e.level);
    const here = alive.filter((p) => p.level === e.level);
    e.timer += dt;
    e.attackCd -= dt;
    const nearest = closest(e, here);
    if (!nearest || nearest.d > SPEC[e.kind].wake + 20) {
      this.despawn(e, 5);
      return;
    }
    switch (e.kind) {
      case 'smiler':
        return this.smiler(e, here, map, dt);
      case 'hound':
        return this.hound(e, here, map, dt);
      case 'faceling':
        return this.faceling(e, here, map, dt);
      case 'skinstealer':
        return this.skinStealer(e, here, map, dt);
    }
  }

  /** Acecha en la oscuridad. Se queda quieto si le apuntan con una linterna. */
  private smiler(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.smiler;
    let best: { p: Player; d: number; f: Int16Array } | null = null;
    for (const p of here) {
      const f = this.field(map, p, true);
      const d = f[cellOf(e.z) * map.w + cellOf(e.x)];
      if (d >= 0 && (!best || d < best.d)) best = { p, d, f };
    }
    if (!best) {
      e.anim = Anim.Idle;
      if (e.timer > 8) this.despawn(e, 4);
      return;
    }
    e.timer = 0;
    if (here.some((p) => this.lights(p, e, map, 14, 0.93))) {
      e.anim = Anim.Idle;
      return;
    }
    const dist = Math.hypot(best.p.x - e.x, best.p.z - e.z);
    if (dist < spec.reach && e.attackCd <= 0) {
      this.hit(e, best.p);
      this.despawn(e, spec.cooldown); // tras atacar se desvanece
      return;
    }
    e.anim = Anim.Run;
    this.follow(e, best.f, best.p, map, spec.run * (this.blackout[e.level] > 0 ? 1.3 : 1), dt, this.darkMask(map));
  }

  /** Persigue a quien huye; si le plantas cara, gruñe y acaba retirándose. */
  private hound(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.hound;
    let target = here.find((p) => p.id === e.target) ?? null;
    if (!target || e.mode === 'wander' || e.mode === 'idle') {
      // ¿ve u oye a alguien?
      target = null;
      for (const p of here) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        const sees = d < 18 && this.sees(e, p, map);
        const hears = p.sprint && d < 22;
        if (sees || hears || d < 4) {
          target = p;
          break;
        }
      }
      if (target && e.mode !== 'flee') {
        e.target = target.id;
        e.mode = 'chase';
        e.timer = 0;
      }
    }

    if (e.mode === 'flee') {
      e.anim = Anim.Flee;
      const from = target ?? closest(e, here)?.p;
      if (from) this.away(e, from, map, 4, dt);
      if (e.timer > 4) this.setMode(e, 'wander');
      return;
    }
    if (e.mode === 'chase' || e.mode === 'stare') {
      if (!target) return this.setMode(e, 'wander');
      const d = Math.hypot(target.x - e.x, target.z - e.z);
      const facing = facingDot(target, e) > 0.85 && this.sees(e, target, map);
      // plantar cara: mirarle sin correr y sin moverse mucho
      if (d < 7 && facing && !target.sprint && target.speed < 1.6) {
        if (e.mode !== 'stare') this.setMode(e, 'stare');
        e.stare += dt;
        e.anim = Anim.Growl;
        e.ry = faceTo(e, target);
        if (e.stare > 2.5) {
          e.stare = 0;
          this.setMode(e, 'flee');
        }
        return;
      }
      if (e.mode === 'stare') this.setMode(e, 'chase');
      e.stare = Math.max(0, e.stare - dt);
      if (d < spec.reach) {
        e.ry = faceTo(e, target);
        if (e.attackCd <= 0) this.hit(e, target);
        else if (e.attackCd < spec.cooldown - 0.4) e.anim = Anim.Growl;
        return;
      }
      if (d > 32 || e.timer > 40) return this.setMode(e, 'wander');
      const f = this.field(map, target, false);
      e.anim = Anim.Run;
      if (!this.follow(e, f, target, map, spec.run, dt)) this.setMode(e, 'wander');
      return;
    }
    this.wander(e, map, spec.walk, 10, dt);
  }

  /** Pasea sin hacer nada... salvo que le deslumbren con la linterna. */
  private faceling(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.faceling;
    const glaring = here.find((p) => this.lights(p, e, map, 6, 0.93));
    e.anger = glaring ? e.anger + dt : Math.max(0, e.anger - dt * 0.3);
    if (e.anger > 3 && e.mode !== 'chase') {
      this.setMode(e, 'chase');
      e.target = glaring?.id ?? e.target;
    }
    if (e.mode === 'chase') {
      const target = here.find((p) => p.id === e.target);
      if (!target || e.timer > 15) {
        e.anger = 0;
        return this.setMode(e, 'wander');
      }
      const d = Math.hypot(target.x - e.x, target.z - e.z);
      if (d < spec.reach) {
        e.ry = faceTo(e, target);
        if (e.attackCd <= 0) this.hit(e, target);
        return;
      }
      e.anim = Anim.Run;
      this.follow(e, this.field(map, target, false), target, map, spec.run, dt);
      return;
    }
    // si alguien está cerca, se para a "mirarle"
    const near = closest(e, here);
    if (near && near.d < 5 && this.sees(e, near.p, map)) {
      e.anim = Anim.Idle;
      e.ry = turn(e.ry, faceTo(e, near.p), dt * 1.5);
      return;
    }
    this.wander(e, map, spec.walk, 14, dt);
  }

  /** Solo se mueve cuando nadie le mira. */
  private skinStealer(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.skinstealer;
    const watched = here.some((p) => {
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      return d < 30 && facingDot(p, e) > 0.55 && this.sees(e, p, map);
    });
    if (e.mode === 'flee') {
      const from = closest(e, here);
      if (from) this.away(e, from.p, map, spec.run, dt);
      e.anim = Anim.Run;
      if (e.timer > 5) this.setMode(e, 'idle');
      return;
    }
    if (watched) {
      e.anim = Anim.Idle; // se queda congelado... hasta que apartas la vista
      return;
    }
    let best: { p: Player; d: number; f: Int16Array } | null = null;
    for (const p of here) {
      const f = this.field(map, p, false);
      const d = f[cellOf(e.z) * map.w + cellOf(e.x)];
      if (d >= 0 && (!best || d < best.d)) best = { p, d, f };
    }
    if (!best) return this.wander(e, map, spec.walk, 8, dt);
    const d = Math.hypot(best.p.x - e.x, best.p.z - e.z);
    if (d < spec.reach && e.attackCd <= 0) {
      this.hit(e, best.p);
      this.setMode(e, 'flee');
      return;
    }
    e.anim = Anim.Run;
    this.follow(e, best.f, best.p, map, spec.run, dt);
  }

  // ------------------------------------------------------------------ utilidades

  private setMode(e: Entity, mode: Entity['mode']) {
    e.mode = mode;
    e.timer = 0;
    e.goal = null;
    if (mode === 'wander' || mode === 'idle') e.target = null;
  }

  /** ¿Ve la criatura al jugador? */
  private sees(e: Entity, p: Player, map: LevelMap): boolean {
    const ey = floorAt(map, e.x, e.z) + SPEC[e.kind].eye;
    return lineOfSight(map, e.x, ey, e.z, p.x, p.y + 1.5, p.z);
  }

  /** ¿Le está dando el jugador con la linterna? */
  private lights(p: Player, e: Entity, map: LevelMap, range: number, cos: number): boolean {
    if (!p.light) return false;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    return d < range && facingDot(p, e) > cos && this.sees(e, p, map);
  }

  /** Avanza hacia el jugador siguiendo el campo de distancias. */
  private follow(e: Entity, field: Int16Array, p: Player, map: LevelMap, speed: number, dt: number, mask?: Uint8Array): boolean {
    const ex = cellOf(e.x);
    const ez = cellOf(e.z);
    const d = field[ez * map.w + ex];
    if (d < 0) return false;
    let tx = p.x;
    let tz = p.z;
    if (d > 1) {
      let found = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (ez + dz) * map.w + ex + dx;
        if (field[n] === d - 1) {
          tx = center(ex + dx);
          tz = center(ez + dz);
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    this.step(e, tx, tz, speed, dt, map, mask);
    return true;
  }

  /** Se aleja del jugador (hacia la casilla vecina más lejana). */
  private away(e: Entity, p: Player, map: LevelMap, speed: number, dt: number) {
    const field = this.field(map, p, false);
    const ex = cellOf(e.x);
    const ez = cellOf(e.z);
    let best = field[ez * map.w + ex];
    let tx = e.x;
    let tz = e.z;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = field[(ez + dz) * map.w + ex + dx];
      if (v > best) {
        best = v;
        tx = center(ex + dx);
        tz = center(ez + dz);
      }
    }
    this.step(e, tx, tz, speed, dt, map);
  }

  /** Paseo sin rumbo cerca de su guarida. */
  private wander(e: Entity, map: LevelMap, speed: number, radius: number, dt: number) {
    if (e.mode !== 'wander') this.setMode(e, 'wander');
    if (!e.goal || Math.hypot(e.goal.x - e.x, e.goal.z - e.z) < 0.3 || e.timer > 12) {
      e.timer = 0;
      e.anim = Anim.Idle;
      if (Math.random() < 0.02) {
        // elige un sitio alcanzable cerca de la guarida
        for (let k = 0; k < 10; k++) {
          const gx = e.lair.x + (Math.random() - 0.5) * radius * 2;
          const gz = e.lair.z + (Math.random() - 0.5) * radius * 2;
          const i = cellOf(gz) * map.w + cellOf(gx);
          if (i >= 0 && i < map.w * map.h && walkable(map, i) && Math.abs(map.floor[i] - floorAt(map, e.x, e.z)) < 0.6) {
            e.goal = { x: gx, z: gz };
            break;
          }
        }
      }
      return;
    }
    e.anim = Anim.Walk;
    const before = e.x + e.z;
    this.step(e, e.goal.x, e.goal.z, speed, dt, map);
    if (Math.abs(e.x + e.z - before) < 1e-4) e.goal = null; // atascado
  }

  /** Mueve en línea recta respetando paredes, desniveles y (si se da) la máscara. */
  private step(e: Entity, tx: number, tz: number, speed: number, dt: number, map: LevelMap, mask?: Uint8Array) {
    const dx = tx - e.x;
    const dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return;
    const s = Math.min(d, speed * dt);
    const nx = e.x + (dx / d) * s;
    const nz = e.z + (dz / d) * s;
    e.ry = turn(e.ry, Math.atan2(-dx, -dz), dt * 8);
    const i = cellOf(nz) * map.w + cellOf(nx);
    if (!walkable(map, i)) return; // pared, obstáculo o agujero
    if (Math.abs(floorAt(map, nx, nz) - floorAt(map, e.x, e.z)) > 0.6) return;
    if (mask && !mask[i]) return;
    e.x = nx;
    e.z = nz;
  }
}

function closest(e: { x: number; z: number }, list: Player[]): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of list) {
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (!best || d < best.d) best = { p, d };
  }
  return best;
}

/** Coseno del ángulo entre hacia dónde mira el jugador y la dirección a la criatura. */
function facingDot(p: Player, e: { x: number; z: number }): number {
  const dx = e.x - p.x;
  const dz = e.z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  return (-Math.sin(p.ry) * dx - Math.cos(p.ry) * dz) / d;
}

function faceTo(e: { x: number; z: number }, p: { x: number; z: number }): number {
  return Math.atan2(-(p.x - e.x), -(p.z - e.z));
}

function turn(from: number, to: number, k: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * Math.min(1, k);
}

const round = (v: number) => Math.round(v * 100) / 100;

