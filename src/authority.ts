import { ESCAPED, LEVELS, getMap, setSession } from './levels';
import { Anim } from './models';
import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  TICK_MS,
  type ClientMessage,
  type EntityState,
  type Flare,
  type HostMessage,
  type PlayerState,
} from './protocol';
import {
  CELL,
  F_SOLID,
  cellOf,
  center,
  distanceField,
  floorAt,
  gridAt,
  inZone,
  lineOfSight,
  setShift,
  walkable,
  type Crate,
  type EntityKind,
  type ItemKind,
  type LevelMap,
} from './world';

export interface Outbox {
  sendTo: (id: string, msg: HostMessage) => void;
  broadcast: (msg: HostMessage) => void;
}

const PATH_EVERY = 0.2; // segundos entre recálculos de caminos
const PATH_CELLS = 90; // alcance de la búsqueda de caminos (casillas de 0,5 m)
const FLARE_TIME = 25;

// cómo es cada criatura (según la Backrooms Wiki)
const SPEC: Record<EntityKind, { eye: number; wake: number; walk: number; run: number; reach: number; damage: number; cooldown: number }> = {
  figure: { eye: 1.7, wake: 30, walk: 0.8, run: 0.8, reach: 0, damage: 0, cooldown: 40 },
  smiler: { eye: 1.6, wake: 30, walk: 1.6, run: 4.3, reach: 0.9, damage: 55, cooldown: 25 },
  hound: { eye: 0.85, wake: 45, walk: 1.4, run: 4.6, reach: 1.15, damage: 22, cooldown: 1.2 },
  faceling: { eye: 1.95, wake: 60, walk: 1.0, run: 3.6, reach: 1.0, damage: 15, cooldown: 1.5 },
  skinstealer: { eye: 1.6, wake: 40, walk: 0.9, run: 4.2, reach: 1.2, damage: 45, cooldown: 3 },
  clump: { eye: 0.6, wake: 40, walk: 1.5, run: 6.2, reach: 1.0, damage: 35, cooldown: 2 },
  duller: { eye: 1.6, wake: 20, walk: 0, run: 0, reach: 1.3, damage: 30, cooldown: 25 },
};

interface Lair {
  level: number;
  kind: EntityKind;
  x: number;
  z: number;
  lines?: string[];
  s?: number; // planta
  entity: number | null;
  cooldown: number;
}

interface Entity extends EntityState {
  lair: Lair;
  mode: 'idle' | 'wander' | 'stalk' | 'chase' | 'stare' | 'flee' | 'listen' | 'warn' | 'disguised';
  timer: number; // tiempo en el modo actual
  attackCd: number;
  target: string | null;
  goal: { x: number; z: number } | null;
  anger: number;
  stare: number;
  close: number; // tiempo que llevas demasiado cerca (Skin-Stealer)
  sayCd: number;
  vx: number; // velocidad actual (se acelera y frena con suavidad)
  vz: number;
}

/** Radio de las criaturas al chocar con las paredes. */
const BODY = 0.28;
const DIRS8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
/** Criaturas a la vez por nivel, como mucho. */
const MAX_ACTIVE = 3;

interface Player extends PlayerState {
  speed: number;
  lastT: number;
  shoutTimer: number;
}

/**
 * Lógica de la partida que solo ejecuta el anfitrión: quién está en la sala,
 * qué objetos se han recogido, cómo cambia el laberinto y qué hacen las
 * criaturas.
 */
export class Authority {
  private players = new Map<string, Player>();
  private entities: Entity[] = [];
  private lairs: Lair[] = [];
  private picked = new Set<string>();
  private flares: Flare[] = [];
  private nextId = 1;
  private timer: number;
  private pathClock = 0;
  private fields = new Map<string, Int16Array>();
  private blackout = LEVELS.map(() => 0); // segundos de Parpadeo que quedan
  private nextBlackout = LEVELS.map(() => 70 + Math.random() * 60);
  private circuit = LEVELS.map(() => 0); // segundos con el circuito fundido
  private nextCircuit = LEVELS.map(() => 30 + Math.random() * 40);
  private shiftClock = LEVELS.map(() => 6);
  private loopEmpty = LEVELS.map(() => 0);
  private masks = new Map<string, Uint8Array>();

  /** Semilla de esta partida: dónde están los objetos y las criaturas. */
  private session = Math.floor(Math.random() * 0xffffffff) >>> 0;

  constructor(private out: Outbox) {
    setSession(this.session);
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
      crouch: false,
      noise: 0,
      shout: false,
      dead: false,
      speed: 0,
      lastT: performance.now(),
      shoutTimer: 0,
    };
    this.players.set(id, p);
    this.out.sendTo(id, { t: 'welcome', id, color: p.color, picked: [...this.picked], x: p.x, z: p.z, session: this.session });
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
        if (msg.pose.shout) p.shoutTimer = 1;
        if (p.level !== prev) {
          if (p.level === ESCAPED) this.notice(`${p.name} ha encontrado la salida al Nivel 3`);
          else if (p.level > prev) this.notice(`${p.name} ha llegado al ${LEVELS[p.level].name}: ${LEVELS[p.level].title}`);
          else this.notice(`${p.name} ha vuelto a caer en los Backrooms`);
        }
        break;
      }
      case 'pickup': {
        if (this.picked.has(msg.key)) break;
        this.picked.add(msg.key);
        const level = Number(msg.key.split(':')[0]);
        const crate = getMap(level)?.crates.find((c) => c.key === msg.key);
        if (crate) this.out.broadcast({ t: 'picked', key: msg.key, by: id, ...openCrate(crate) });
        else this.out.broadcast({ t: 'picked', key: msg.key, by: id });
        break;
      }
      case 'flare':
        this.flares.push({ id: this.nextId++, level: msg.level, x: msg.x, y: msg.y, z: msg.z, left: FLARE_TIME });
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
    for (const p of this.players.values()) p.shoutTimer = Math.max(0, p.shoutTimer - dt);
    this.updateEvents(dt, alive);
    this.updateShifts(dt, alive);
    this.flares = this.flares.filter((f) => (f.left -= dt) > 0);
    this.pathClock -= dt;
    if (this.pathClock <= 0) {
      this.pathClock = PATH_EVERY;
      this.fields.clear();
    }
    this.wakeLairs(alive, dt);
    for (const e of [...this.entities]) this.think(e, alive, dt);
    this.out.broadcast({
      t: 'state',
      players: [...this.players.values()].map(({ speed: _s, lastT: _t, shoutTimer: _h, ...rest }) => rest),
      entities: this.entities.map(({ id, kind, level, x, y, z, ry, anim }) => ({ id, kind, level, x: round(x), y: round(y), z: round(z), ry: round(ry), anim })),
      blackout: this.blackout.map((b, i) => (b > 0 ? i : -1)).filter((i) => i >= 0),
      circuits: this.circuit.map((b, i) => (b > 0 ? i : -1)).filter((i) => i >= 0),
      shifts: LEVELS.flatMap((_, level) => getMap(level).shifts.filter((s) => s.closed).map((s) => `${level}:${s.id}`)),
      flares: this.flares.map((f) => ({ ...f, left: round(f.left) })),
    });
  }

  /** Parpadeo (Nivel 1) y circuitos fundidos (Nivel 2). */
  private updateEvents(dt: number, alive: Player[]) {
    LEVELS.forEach((L, level) => {
      const here = alive.some((p) => p.level === level);
      if (L.blackouts && here) {
        if (this.blackout[level] > 0) {
          this.blackout[level] -= dt;
          if (this.blackout[level] <= 0) {
            this.nextBlackout[level] = 70 + Math.random() * 80;
            this.restock(level); // tras un Parpadeo aparecen cajas nuevas
          }
        } else if ((this.nextBlackout[level] -= dt) <= 0) {
          this.blackout[level] = 18 + Math.random() * 10;
          this.fields.clear();
        }
      }
      if (L.circuits && here) {
        if (this.circuit[level] > 0) {
          this.circuit[level] -= dt;
          if (this.circuit[level] <= 0) this.nextCircuit[level] = 40 + Math.random() * 50;
        } else if ((this.nextCircuit[level] -= dt) <= 0) {
          this.circuit[level] = 15 + Math.random() * 20;
          this.fields.clear();
        }
      }
    });
  }

  private restock(level: number) {
    const keys = getMap(level)
      .crates.map((c) => c.key)
      .filter((k) => this.picked.has(k) && Math.random() < 0.6);
    for (const k of keys) this.picked.delete(k);
    if (keys.length) this.out.broadcast({ t: 'restock', keys });
  }

  /** Cambio periférico: el laberinto cambia donde nadie mira. */
  private updateShifts(dt: number, alive: Player[]) {
    LEVELS.forEach((_, level) => {
      const map = getMap(level);
      if (!map.shifts.length) return;
      const here = alive.filter((p) => p.level === level);
      // ¿lo ve alguien? (desde su planta; el bloque está en la suya)
      const seen = (x: number, z: number, g = map) =>
        here.some((p) => {
          if (Math.hypot(p.x - x, p.z - z) >= 35) return false;
          const pg = gridAt(map, p.x, p.z, p.y);
          return pg === g && lineOfSight(g, p.x, p.y + 1.6, p.z, x, floorAt(g, x, z) + 1, z);
        });
      // la entrada de las Habitaciones Rojas se cierra cuando alguien está dentro
      for (const loop of map.loops) {
        if (loop.oneWay) continue;
        const inside = here.some((p) => p.x > loop.x0 - 2 && p.x < loop.x1 + 2 && p.z > loop.z0 && p.z < loop.z1);
        this.loopEmpty[level] = inside ? 0 : this.loopEmpty[level] + dt;
        for (const sh of map.shifts) {
          if (sh.pair !== undefined) continue;
          const cx = sh.x + sh.w / 2;
          const cz = sh.z + sh.d / 2;
          if (inside && !sh.closed && !seen(cx, cz, map.storeys[sh.s ?? 0])) setShift(map, sh.id, true);
          if (!inside && sh.closed && this.loopEmpty[level] > 30) setShift(map, sh.id, false);
        }
      }
      this.shiftClock[level] -= dt;
      if (this.shiftClock[level] > 0 || !here.length) return;
      this.shiftClock[level] = 6 + Math.random() * 6;
      const pairs = map.shifts.filter((s) => s.pair !== undefined && s.pair > s.id);
      const sh = pairs[Math.floor(Math.random() * pairs.length)];
      if (!sh) return;
      const other = map.shifts[sh.pair!];
      const blocked = (s: typeof sh) => {
        const cx = s.x + s.w / 2;
        const cz = s.z + s.d / 2;
        // no cerrar encima de nadie
        return seen(cx, cz, map.storeys[s.s ?? 0]) || here.some((p) => Math.abs(p.x - cx) < s.w / 2 + 0.6 && Math.abs(p.z - cz) < s.d / 2 + 0.6);
      };
      if (blocked(sh) || blocked(other)) return;
      setShift(map, sh.id, !sh.closed);
      setShift(map, other.id, !other.closed);
      this.fields.clear();
    });
  }

  /** Casillas por las que puede ir un Smiler: lo oscuro (en un Parpadeo, todo). */
  private darkMask(map: LevelMap): Uint8Array {
    const level = map.level;
    if (this.blackout[level] > 0) return this.mask(`all${level}`, map, () => 1);
    if (this.circuit[level] > 0) return this.mask(`circ${level}|${map.storey}`, map, (i) => (map.light[i * 2] < 0.12 ? 1 : 0));
    return map.dark;
  }

  private mask(key: string, map: LevelMap, fn: (i: number) => number): Uint8Array {
    let m = this.masks.get(key);
    if (!m) {
      m = new Uint8Array(map.w * map.h);
      for (let i = 0; i < m.length; i++) m[i] = fn(i);
      this.masks.set(key, m);
    }
    return m;
  }

  /** Campo de distancias hacia un punto (cacheado unos instantes). */
  private field(map: LevelMap, x: number, z: number, darkOnly: boolean): Int16Array {
    const key = `${map.level}|${map.storey}|${cellOf(x)}|${cellOf(z)}|${darkOnly}`;
    let f = this.fields.get(key);
    if (!f) {
      f = distanceField(map, cellOf(x), cellOf(z), PATH_CELLS, darkOnly, this.darkMask(map));
      this.fields.set(key, f);
    }
    return f;
  }

  private wakeLairs(alive: Player[], dt: number) {
    for (const lair of this.lairs) {
      if (lair.entity !== null) continue;
      lair.cooldown -= dt;
      if (lair.cooldown > 0) continue;
      const lv = getMap(lair.level);
      const lg = lv.storeys[lair.s ?? 0];
      // solo despierta por quien anda por su misma planta
      const dists = alive.filter((p) => p.level === lair.level && gridAt(lv, p.x, p.z, p.y) === lg).map((p) => Math.hypot(p.x - lair.x, p.z - lair.z));
      if (!dists.length) continue;
      const near = Math.min(...dists);
      const spec = SPEC[lair.kind];
      const minDist = lair.kind === 'faceling' || lair.kind === 'duller' || lair.kind === 'skinstealer' ? 0 : lair.kind === 'figure' ? 12 : 7;
      if (near > spec.wake || near < minDist) continue;
      // no todas las guaridas tienen a alguien dentro (a veces, nada)
      if (Math.random() < 0.35) {
        lair.cooldown = 45 + Math.random() * 45;
        continue;
      }
      if (this.entities.filter((x) => x.level === lair.level && x.kind !== 'figure').length >= MAX_ACTIVE && lair.kind !== 'figure') {
        lair.cooldown = 15;
        continue;
      }
      const e: Entity = {
        id: this.nextId++,
        kind: lair.kind,
        level: lair.level,
        x: lair.x,
        y: Number.isFinite(floorAt(lg, lair.x, lair.z)) ? floorAt(lg, lair.x, lair.z) : 0,
        z: lair.z,
        ry: Math.random() * Math.PI * 2,
        anim: lair.kind === 'skinstealer' ? Anim.Disguise : lair.kind === 'duller' ? Anim.Hidden : Anim.Idle,
        lair,
        mode: lair.kind === 'skinstealer' ? 'disguised' : 'idle',
        timer: 0,
        attackCd: 0,
        target: null,
        goal: null,
        anger: 0,
        stare: 0,
        close: 0,
        sayCd: 2,
        vx: 0,
        vz: 0,
      };
      lair.entity = e.id;
      this.entities.push(e);
    }
  }

  private despawn(e: Entity, cooldown: number) {
    e.lair.entity = null;
    e.lair.cooldown = cooldown * 1.5;
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
    const level = getMap(e.level);
    const map = level.storeys[e.lair.s ?? 0];
    // solo cuenta quien está en su misma planta; en las zonas seguras (la Base Alpha) no persiguen a nadie
    const here = alive.filter((p) => p.level === e.level && gridAt(level, p.x, p.z, p.y) === map && !inZone(map, 'safe', p.x, p.z));
    const fy = floorAt(map, e.x, e.z);
    if (Number.isFinite(fy)) e.y = fy;
    e.timer += dt;
    e.attackCd -= dt;
    const nearest = closest(e, alive.filter((p) => p.level === e.level));
    if (!nearest || nearest.d > SPEC[e.kind].wake + 20) {
      this.despawn(e, 5);
      return;
    }
    switch (e.kind) {
      case 'figure':
        return this.figure(e, here, map, dt);
      case 'smiler':
        return this.smiler(e, here, map, dt);
      case 'hound':
        return this.hound(e, here, map, dt);
      case 'faceling':
        return this.faceling(e, here, map, dt);
      case 'skinstealer':
        return this.skinStealer(e, here, map, dt);
      case 'clump':
        return this.clump(e, here, map, dt);
      case 'duller':
        return this.duller(e, here, map, dt);
    }
  }

  /** Figura oscura (Nivel 0): te observa de lejos y se esfuma si la miras o te acercas. */
  private figure(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const near = closest(e, here);
    if (!near) return;
    e.ry = turn(e.ry, faceTo(e, near.p), dt * 3);
    e.anim = Anim.Idle;
    const watched = here.some((p) => facingDot(p, e) > 0.97 && this.sees(e, p, map) && e.timer > 1.2);
    if (near.d < 9 || watched) {
      this.despawn(e, SPEC.figure.cooldown);
      return;
    }
    // si nadie la mira, se acerca despacio (sin pasar de 10 m)
    const unseen = here.every((p) => facingDot(p, e) < 0.4);
    if (unseen && near.d > 10) {
      e.anim = Anim.Walk;
      this.follow(e, this.field(map, near.p.x, near.p.z, false), near.p, map, SPEC.figure.walk, dt);
    }
  }

  /**
   * Smiler: vive en lo oscuro y le atrae la luz. Si le miras y te alejas
   * despacio, no ataca; si corres o haces ruido, se lanza. Si apagas la luz
   * y no haces ruido, te pierde. Una bengala lo distrae.
   */
  private smiler(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.smiler;
    const mask = this.darkMask(map);
    // una bengala cerca: va hacia ella y se queda mirándola
    const flare = this.flares.find((f) => f.level === e.level && Math.hypot(f.x - e.x, f.z - e.z) < 22);
    if (flare) {
      e.target = null;
      e.mode = 'stalk';
      const d = Math.hypot(flare.x - e.x, flare.z - e.z);
      e.anim = d > 2 ? Anim.Walk : Anim.Idle;
      if (d > 2) this.follow(e, this.field(map, flare.x, flare.z, false), flare, map, spec.walk * 1.5, dt, mask);
      return;
    }
    let target = here.find((p) => p.id === e.target) ?? null;
    if (!target) {
      for (const p of here) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        const lit = p.light && d < 25 && this.sees(e, p, map);
        const loud = p.noise > 1 && d < 20;
        if (lit || loud) {
          target = p;
          e.target = p.id;
          e.mode = 'stalk';
          e.timer = 0;
          break;
        }
      }
    }
    if (!target) {
      // acecha por lo oscuro hacia donde hay gente; si no, vuelve a su sitio
      if (this.prowl(e, here, map, spec.walk, dt, mask)) return;
      e.anim = Anim.Idle;
      if (Math.hypot(e.x - e.lair.x, e.z - e.lair.z) > 0.5) {
        e.anim = Anim.Walk;
        this.follow(e, this.field(map, e.lair.x, e.lair.z, false), e.lair, map, spec.walk, dt, mask);
      } else if (e.timer > 20) this.despawn(e, 3);
      return;
    }
    const d = Math.hypot(target.x - e.x, target.z - e.z);
    // ¿pánico? correr o hacer ruido cerca lo hace atacar
    if (e.mode !== 'chase' && ((target.sprint && d < 15) || (target.noise > 1 && d < 20))) {
      e.mode = 'chase';
      e.timer = 0;
    }
    if (e.mode === 'chase') {
      if (d < spec.reach && e.attackCd <= 0) {
        this.hit(e, target);
        this.despawn(e, spec.cooldown); // tras atacar se desvanece
        return;
      }
      e.anim = Anim.Run;
      const ok = this.follow(e, this.field(map, target.x, target.z, true), target, map, spec.run, dt, mask);
      if (!ok || e.timer > 12) this.forget(e);
      return;
    }
    // acecho: si apagas la luz y no haces ruido, te pierde
    if (!target.light && target.noise < 0.5) {
      e.close += dt;
      if (e.close > 4) {
        e.close = 0;
        this.forget(e);
        return;
      }
    } else e.close = 0;
    // le mantienes la mirada: se queda quieto, sonriendo
    const eyeContact = facingDot(target, e) > 0.9 && this.sees(e, target, map);
    e.ry = turn(e.ry, faceTo(e, target), dt * 4);
    if (eyeContact || d < 3) {
      e.anim = Anim.Idle;
      return;
    }
    e.anim = Anim.Walk;
    this.follow(e, this.field(map, target.x, target.z, true), target, map, spec.walk, dt, mask);
  }

  private forget(e: Entity) {
    e.target = null;
    e.mode = 'idle';
    e.timer = 0;
  }

  /** Hound: te ataca al verte u oírte. Mirarle le frena un rato; gritar le espanta. */
  private hound(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.hound;
    let target = here.find((p) => p.id === e.target) ?? null;
    // un grito cerca le hace huir
    const shouter = here.find((p) => p.shoutTimer > 0 && Math.hypot(p.x - e.x, p.z - e.z) < 12);
    if (shouter && e.mode !== 'flee') {
      this.setMode(e, 'flee');
      e.target = shouter.id;
    }
    if (e.mode === 'flee') {
      e.anim = Anim.Flee;
      if (target) this.away(e, target, map, 4.2, dt);
      if (e.timer > 5) this.setMode(e, 'wander');
      return;
    }
    if (!target || e.mode === 'wander' || e.mode === 'idle') {
      target = null;
      for (const p of here) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        const sees = d < 18 && this.sees(e, p, map);
        const hears = d < p.noise * 22;
        if (sees || hears || d < 4) {
          target = p;
          break;
        }
      }
      if (target) {
        this.setMode(e, 'chase');
        e.target = target.id;
      }
    }
    if (e.mode === 'chase' || e.mode === 'stare') {
      if (!target) return this.setMode(e, 'wander');
      const d = Math.hypot(target.x - e.x, target.z - e.z);
      const staredAt = facingDot(target, e) > 0.85 && this.sees(e, target, map) && !target.sprint;
      // mirarle a los ojos le frena... pero no aguanta mucho
      if (d < 8 && staredAt && e.stare < 3.5) {
        if (e.mode !== 'stare') e.mode = 'stare';
        e.stare += dt;
        e.anim = Anim.Growl;
        e.ry = faceTo(e, target);
        return;
      }
      if (e.mode === 'stare') {
        e.mode = 'chase';
        e.timer = 0;
      }
      if (!staredAt) e.stare = Math.max(0, e.stare - dt * 0.5);
      if (d < spec.reach) {
        e.ry = faceTo(e, target);
        if (e.attackCd <= 0) this.hit(e, target);
        else if (e.attackCd < spec.cooldown - 0.4) e.anim = Anim.Growl;
        return;
      }
      if (d > 32 || e.timer > 40) return this.setMode(e, 'wander');
      e.anim = Anim.Run;
      if (!this.follow(e, this.field(map, target.x, target.z, false), target, map, spec.run, dt)) this.setMode(e, 'wander');
      return;
    }
    e.stare = 0;
    if (!this.prowl(e, here, map, spec.walk * 1.4, dt)) this.wander(e, map, spec.walk, 10, dt);
  }

  /** Faceling: pasea en grupo sin molestar, salvo que le deslumbres o le agobies. */
  private faceling(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.faceling;
    const glaring = here.find((p) => this.lights(p, e, map, 6, 0.93) || Math.hypot(p.x - e.x, p.z - e.z) < 1.2);
    e.anger = glaring ? e.anger + dt : Math.max(0, e.anger - dt * 0.3);
    if (e.anger > 3 && e.mode !== 'chase') {
      this.setMode(e, 'chase');
      e.target = glaring?.id ?? e.target;
    }
    if (e.mode === 'chase') {
      const target = here.find((p) => p.id === e.target);
      if (!target || e.timer > 12) {
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
      this.follow(e, this.field(map, target.x, target.z, false), target, map, spec.run, dt);
      return;
    }
    const near = closest(e, here);
    if (near && near.d < 5 && this.sees(e, near.p, map)) {
      e.anim = Anim.Idle;
      e.ry = turn(e.ry, faceTo(e, near.p), dt * 1.5);
      return;
    }
    if (!this.prowl(e, here, map, spec.walk, dt)) this.wander(e, map, spec.walk, 12, dt);
  }

  /**
   * Skin-Stealer (Nivel 1): parece una persona sola que pide ayuda. Si te
   * quedas cerca, le das la espalda o corres, se quita el disfraz y ataca.
   * Si te alejas con calma, no pasa nada.
   */
  private skinStealer(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.skinstealer;
    const near = closest(e, here);
    if (e.mode === 'disguised') {
      e.anim = Anim.Disguise;
      if (!near) return;
      e.ry = turn(e.ry, faceTo(e, near.p), dt * 2);
      // habla para atraerte
      e.sayCd -= dt;
      const lines = e.lair.lines ?? ['¿Hola?'];
      if (near.d < 9 && e.sayCd <= 0) {
        e.sayCd = 4 + Math.random() * 3;
        this.out.broadcast({ t: 'say', id: e.id, text: lines[Math.floor(Math.random() * lines.length)] });
      }
      const tooClose = near.d < 2.4;
      const turnedBack = near.d < 4 && facingDot(near.p, e) < 0;
      e.close = tooClose || turnedBack ? e.close + dt : Math.max(0, e.close - dt);
      if (e.close > (tooClose ? 2.5 : 1.2) || (near.p.sprint && near.d < 10)) {
        this.out.broadcast({ t: 'say', id: e.id, text: 'Hola.' });
        this.setMode(e, 'chase');
        e.target = near.p.id;
      }
      return;
    }
    if (e.mode === 'flee') {
      e.anim = Anim.Run;
      if (near) this.away(e, near.p, map, spec.run, dt);
      if (e.timer > 6) {
        this.setMode(e, 'disguised');
        e.close = 0;
      }
      return;
    }
    const target = here.find((p) => p.id === e.target);
    if (!target || e.timer > 20) {
      this.setMode(e, 'disguised');
      return;
    }
    const d = Math.hypot(target.x - e.x, target.z - e.z);
    if (d < spec.reach && e.attackCd <= 0) {
      this.hit(e, target);
      this.setMode(e, 'flee');
      return;
    }
    e.anim = Anim.Run;
    this.follow(e, this.field(map, target.x, target.z, false), target, map, spec.run, dt);
  }

  /** Clump: no ve. Se lanza hacia donde oye ruido y espera escuchando. */
  private clump(e: Entity, here: Player[], map: LevelMap, dt: number) {
    const spec = SPEC.clump;
    // ¿oye a alguien?
    for (const p of here) {
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < p.noise * 18 || d < 2.2) {
        e.goal = { x: p.x, z: p.z };
        e.target = p.id;
        if (e.mode !== 'chase') this.setModeKeepGoal(e, 'chase');
      }
    }
    const target = here.find((p) => p.id === e.target);
    if (target && Math.hypot(target.x - e.x, target.z - e.z) < spec.reach && e.attackCd <= 0) this.hit(e, target);
    if (e.mode === 'chase' && e.goal) {
      const d = Math.hypot(e.goal.x - e.x, e.goal.z - e.z);
      e.anim = Anim.Run;
      if (d < 0.6 || e.timer > 4) {
        this.setModeKeepGoal(e, 'listen');
        return;
      }
      if (!this.follow(e, this.field(map, e.goal.x, e.goal.z, false), e.goal, map, spec.run, dt)) this.setModeKeepGoal(e, 'listen');
      return;
    }
    if (e.mode === 'listen') {
      e.anim = Anim.Idle;
      if (e.timer > 2.5) this.setMode(e, 'wander');
      return;
    }
    // sin nada que oír, va tanteando hacia donde hay gente (o vuelve a su esquina)
    if (this.prowl(e, here, map, spec.walk, dt)) return;
    if (Math.hypot(e.x - e.lair.x, e.z - e.lair.z) > 0.5) {
      e.anim = Anim.Walk;
      this.follow(e, this.field(map, e.lair.x, e.lair.z, false), e.lair, map, spec.walk, dt);
    } else e.anim = Anim.Idle;
  }

  /**
   * Duller (Nivel 1): espera dentro de las paredes. Si estás pegado a una
   * cerca de él, se oye arañar; si sigues ahí, sale y te agarra.
   */
  private duller(e: Entity, here: Player[], map: LevelMap, _dt: number) {
    const spec = SPEC.duller;
    const nearWall = (p: Player) => wallDistance(map, p.x, p.z) < 1.1;
    const victim = here.find((p) => Math.hypot(p.x - e.lair.x, p.z - e.lair.z) < 5 && nearWall(p));
    if (e.mode === 'warn') {
      e.anim = Anim.Warn;
      if (!victim) {
        this.setMode(e, 'idle');
        e.anim = Anim.Hidden;
        e.lair.cooldown = 6;
        return;
      }
      if (e.timer > 2) {
        // sale de la pared justo al lado
        const w = nearestWall(map, victim.x, victim.z);
        e.x = w.x;
        e.z = w.z;
        e.ry = faceTo(e, victim);
        this.hit(e, victim);
        this.setMode(e, 'flee');
      }
      return;
    }
    if (e.mode === 'flee') {
      e.anim = Anim.Attack;
      if (e.timer > 1.2) this.despawn(e, spec.cooldown);
      return;
    }
    e.anim = Anim.Hidden;
    if (victim) {
      this.setMode(e, 'warn');
      e.x = e.lair.x;
      e.z = e.lair.z;
    }
  }

  // ------------------------------------------------------------------ utilidades

  private setMode(e: Entity, mode: Entity['mode']) {
    e.mode = mode;
    e.timer = 0;
    e.goal = null;
    if (mode === 'wander' || mode === 'idle' || mode === 'disguised') e.target = null;
  }

  private setModeKeepGoal(e: Entity, mode: Entity['mode']) {
    e.mode = mode;
    e.timer = 0;
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

  /**
   * Avanza hacia un punto. Si lo tiene a la vista y el camino está libre, va
   * en línea recta; si no, baja por el campo de distancias y apunta a la
   * casilla más lejana del camino a la que se puede ir recto (así recorta
   * las esquinas en vez de ir en zigzag de casilla en casilla).
   */
  private follow(e: Entity, field: Int16Array, p: { x: number; z: number }, map: LevelMap, speed: number, dt: number, mask?: Uint8Array): boolean {
    const w = map.w;
    const ex = cellOf(e.x);
    const ez = cellOf(e.z);
    const d0 = field[ez * w + ex];
    if (d0 < 0) return false;
    let tx = p.x;
    let tz = p.z;
    const direct = Math.hypot(p.x - e.x, p.z - e.z) < 16 && this.clear(map, e.x, e.z, p.x, p.z, mask);
    if (!direct) {
      let cx = ex;
      let cz = ez;
      let cur = d0;
      let best: [number, number] | null = null;
      let first: [number, number] | null = null;
      for (let k = 0; k < 18 && cur > 0; k++) {
        let nbx = -1;
        let nbz = -1;
        let nbv = cur;
        for (const [dx, dz] of DIRS8) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= map.h) continue;
          const v = field[nz * w + nx];
          if (v < 0 || v >= nbv) continue;
          // en diagonal solo si no se corta una esquina de pared
          if (dx && dz && (field[cz * w + nx] < 0 || field[nz * w + cx] < 0)) continue;
          nbv = v;
          nbx = nx;
          nbz = nz;
        }
        if (nbx < 0) break;
        cx = nbx;
        cz = nbz;
        cur = nbv;
        first ??= [cx, cz];
        if (this.clear(map, e.x, e.z, center(cx), center(cz), mask)) best = [cx, cz];
        else if (best) break;
      }
      const goal = best ?? first;
      if (!goal) return false;
      if (cur === 0 && best && best[0] === cx && best[1] === cz) {
        // el destino está a la vista desde el final del camino
        tx = p.x;
        tz = p.z;
      } else {
        tx = center(goal[0]);
        tz = center(goal[1]);
      }
    }
    this.steer(e, tx, tz, speed, dt, map, mask);
    return true;
  }

  /** Se aleja del jugador subiendo por el campo de distancias. */
  private away(e: Entity, p: Player, map: LevelMap, speed: number, dt: number) {
    const field = this.field(map, p.x, p.z, false);
    const w = map.w;
    let cx = cellOf(e.x);
    let cz = cellOf(e.z);
    let cur = field[cz * w + cx];
    for (let k = 0; k < 6; k++) {
      let moved = false;
      for (const [dx, dz] of DIRS8) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= map.h) continue;
        const v = field[nz * w + nx];
        if (v > cur && !(dx && dz && (field[cz * w + nx] < 0 || field[nz * w + cx] < 0))) {
          cur = v;
          cx = nx;
          cz = nz;
          moved = true;
        }
      }
      if (!moved) break;
    }
    this.steer(e, center(cx), center(cz), speed, dt, map);
  }

  /** Paseo sin rumbo cerca de su guarida. */
  /**
   * Merodear: en el laberinto casi nunca se ve a nadie de lejos, así que la
   * criatura va despacio por los pasillos hacia el jugador más cercano de su
   * planta (sin saber dónde está exactamente) hasta tenerlo cerca; entonces ya
   * le ve u oye con normalidad. Devuelve false si no hay nadie a quien buscar.
   */
  private prowl(e: Entity, here: Player[], map: LevelMap, speed: number, dt: number, mask?: Uint8Array): boolean {
    const near = closest(e, here);
    if (!near || near.d > 50) return false;
    if (near.d < 7) {
      e.anim = Anim.Idle;
      this.steer(e, e.x, e.z, 0, dt, map);
      e.ry = turn(e.ry, faceTo(e, near.p), dt * 2);
      return true;
    }
    if (e.mode !== 'wander') this.setMode(e, 'wander');
    e.anim = Anim.Walk;
    if (!this.follow(e, this.field(map, near.p.x, near.p.z, false), near.p, map, speed, dt, mask)) return false;
    return true;
  }

  private wander(e: Entity, map: LevelMap, speed: number, radius: number, dt: number) {
    if (e.mode !== 'wander') this.setMode(e, 'wander');
    if (!e.goal || Math.hypot(e.goal.x - e.x, e.goal.z - e.z) < 0.4 || e.timer > 12) {
      e.timer = 0;
      e.anim = Anim.Idle;
      this.steer(e, e.x, e.z, 0, dt, map); // frena
      if (Math.random() < 0.02) {
        for (let k = 0; k < 10; k++) {
          const gx = e.lair.x + (Math.random() - 0.5) * radius * 2;
          const gz = e.lair.z + (Math.random() - 0.5) * radius * 2;
          if (this.clear(map, e.x, e.z, gx, gz)) {
            e.goal = { x: gx, z: gz };
            break;
          }
        }
      }
      return;
    }
    e.anim = Anim.Walk;
    const bx = e.x;
    const bz = e.z;
    this.steer(e, e.goal.x, e.goal.z, speed, dt, map);
    if (Math.hypot(e.x - bx, e.z - bz) < speed * dt * 0.1) e.goal = null; // atascado
  }

  /** ¿Cabe la criatura en (x, z)? */
  private free(map: LevelMap, x: number, z: number, mask?: Uint8Array): boolean {
    for (const [ox, oz] of [[-BODY, -BODY], [BODY, -BODY], [-BODY, BODY], [BODY, BODY]]) {
      const cx = cellOf(x + ox);
      const cz = cellOf(z + oz);
      if (cx < 0 || cz < 0 || cx >= map.w || cz >= map.h || !walkable(map, cz * map.w + cx)) return false;
    }
    const i = cellOf(z) * map.w + cellOf(x);
    if (mask && !mask[i]) return false;
    return !inZone(map, 'safe', x, z);
  }

  /** ¿Se puede ir en línea recta de un punto a otro sin chocar ni saltar desniveles? */
  private clear(map: LevelMap, x0: number, z0: number, x1: number, z1: number, mask?: Uint8Array): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d / 0.25);
    let py = floorAt(map, x0, z0);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (!this.free(map, x, z, mask)) return false;
      const y = floorAt(map, x, z);
      if (!Number.isFinite(y) || Math.abs(y - py) > 0.6) return false;
      py = y;
    }
    return true;
  }

  /**
   * Movimiento con inercia: acelera y frena con suavidad, gira hacia donde va,
   * se separa de otras criaturas y resbala por las paredes en vez de quedarse
   * clavada.
   */
  private steer(e: Entity, tx: number, tz: number, speed: number, dt: number, map: LevelMap, mask?: Uint8Array) {
    const dx = tx - e.x;
    const dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    let wx = 0;
    let wz = 0;
    if (d > 0.05 && speed > 0) {
      const s = speed * Math.min(1, d / 0.5);
      wx = (dx / d) * s;
      wz = (dz / d) * s;
    }
    for (const o of this.entities) {
      if (o === e || o.level !== e.level) continue;
      const ox = e.x - o.x;
      const oz = e.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od < 0.9 && od > 1e-3) {
        wx += (ox / od) * (0.9 - od) * 3;
        wz += (oz / od) * (0.9 - od) * 3;
      }
    }
    const k = Math.min(1, dt * 7);
    e.vx += (wx - e.vx) * k;
    e.vz += (wz - e.vz) * k;
    this.move(e, e.vx * dt, e.vz * dt, map, mask);
    if (Math.hypot(e.vx, e.vz) > 0.25) e.ry = turn(e.ry, Math.atan2(-e.vx, -e.vz), dt * 7);
  }

  private move(e: Entity, mx: number, mz: number, map: LevelMap, mask?: Uint8Array) {
    const y0 = floorAt(map, e.x, e.z);
    // si está encajada (al aparecer junto a una pared), solo se comprueba el centro
    const stuck = !this.free(map, e.x, e.z, mask);
    const ok = (x: number, z: number) => {
      const fine = stuck ? walkable(map, cellOf(z) * map.w + cellOf(x)) : this.free(map, x, z, mask);
      return fine && Math.abs(floorAt(map, x, z) - y0) < 0.6;
    };
    if (ok(e.x + mx, e.z + mz)) {
      e.x += mx;
      e.z += mz;
    } else if (ok(e.x + mx, e.z)) {
      e.x += mx;
      e.vz *= 0.5;
    } else if (ok(e.x, e.z + mz)) {
      e.z += mz;
      e.vx *= 0.5;
    } else {
      e.vx *= 0.3;
      e.vz *= 0.3;
    }
  }
}

/** Contenido de una caja de suministros (al abrirla). Puede haber sorpresas. */
function openCrate(c: Crate): { items: ItemKind[]; junk?: string; hurt?: number } {
  const pools: Record<Crate['pool'], [ItemKind, number][]> = {
    comida: [['agua', 0.55], ['lata', 0.6], ['barrita', 0.35]],
    medico: [['vendas', 0.75], ['agua', 0.4]],
    herramientas: [['pila', 0.65], ['bengala', 0.45]],
    mixto: [['agua', 0.3], ['lata', 0.25], ['pila', 0.3], ['vendas', 0.2], ['bengala', 0.15], ['barrita', 0.2]],
  };
  const items: ItemKind[] = [];
  for (const [kind, chance] of pools[c.pool]) if (Math.random() < chance) items.push(kind);
  const r = Math.random();
  if (r < (c.pool === 'herramientas' || c.pool === 'mixto' ? 0.15 : 0.06)) return { items, junk: 'cristales rotos', hurt: 10 };
  if (!items.length || r > 0.75) {
    const junk = ['unos juguetes de hojalata', 'un ovillo de lana', 'un montón de ratones muertos', 'trozos de madera', 'una libreta en blanco', 'tazas desparejadas'];
    return { items, junk: junk[Math.floor(Math.random() * junk.length)] };
  }
  return { items };
}

/** Distancia del punto a la pared más cercana (búsqueda en la rejilla). */
function wallDistance(map: LevelMap, x: number, z: number): number {
  return Math.hypot(nearestWall(map, x, z).x - x, nearestWall(map, x, z).z - z);
}

function nearestWall(map: LevelMap, x: number, z: number): { x: number; z: number } {
  const cx = cellOf(x);
  const cz = cellOf(z);
  let best = { x, z: z + 99 };
  let bd = Infinity;
  for (let j = cz - 4; j <= cz + 4; j++) {
    for (let i = cx - 4; i <= cx + 4; i++) {
      if (i < 0 || j < 0 || i >= map.w || j >= map.h || !(map.flags[j * map.w + i] & F_SOLID)) continue;
      // punto más cercano de esa casilla, separado un poco hacia fuera
      const px = Math.min(Math.max(x, i * CELL), (i + 1) * CELL);
      const pz = Math.min(Math.max(z, j * CELL), (j + 1) * CELL);
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        const k = d > 0.01 ? 0.35 / d : 0;
        best = { x: px + (x - px) * k, z: pz + (z - pz) * k };
      }
    }
  }
  return best;
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
