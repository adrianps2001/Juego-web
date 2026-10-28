import {
  MAX_PLAYERS,
  PLAYER_COLORS,
  TICK_MS,
  type ClientMessage,
  type EntityState,
  type HostMessage,
  type PlayerState,
} from './protocol';
import { CELL, ESCAPED, LEVELS, cellOf, center, darkDistances, getMap } from './world';

export interface Outbox {
  sendTo: (id: string, msg: HostMessage) => void;
  broadcast: (msg: HostMessage) => void;
}

const WAKE_RANGE = 28; // un Smiler sale de su guarida si hay alguien a esta distancia
const CHASE_CELLS = 36; // distancia máxima (en casillas) a la que persigue
const FLASHLIGHT_RANGE = 14;
const LAIR_COOLDOWN = 20; // segundos hasta que una guarida vuelve a tener Smiler

interface Lair {
  level: number;
  x: number;
  z: number;
  entity: number | null;
  cooldown: number;
}

/**
 * Lógica de la partida que solo ejecuta el anfitrión: quién está en la sala,
 * qué objetos se han recogido y dónde están los Smilers.
 */
export class Authority {
  private players = new Map<string, PlayerState>();
  private entities: (EntityState & { lair: Lair })[] = [];
  private lairs: Lair[] = [];
  private picked = new Set<string>();
  private nextEntity = 1;
  private timer: number;

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
    const p: PlayerState = {
      id,
      name,
      color: PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0],
      level: 0,
      x: spawn.x + (Math.random() - 0.5) * 2,
      z: spawn.z + (Math.random() - 0.5) * 2,
      ry: 0,
      light: false,
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
        Object.assign(p, msg.pose);
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
        this.removeEntity(msg.entity);
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

  private removeEntity(id?: number) {
    const e = this.entities.find((x) => x.id === id);
    if (!e) return;
    e.lair.entity = null;
    e.lair.cooldown = LAIR_COOLDOWN;
    this.entities = this.entities.filter((x) => x !== e);
  }

  private tick(dt: number) {
    const players = [...this.players.values()].filter((p) => p.level < ESCAPED);
    this.wakeLairs(players, dt);
    for (const e of [...this.entities]) this.moveEntity(e, players, dt);
    this.out.broadcast({
      t: 'state',
      players: [...this.players.values()],
      entities: this.entities.map(({ id, level, x, z }) => ({ id, level, x, z })),
    });
  }

  private wakeLairs(players: PlayerState[], dt: number) {
    for (const lair of this.lairs) {
      if (lair.entity !== null) continue;
      lair.cooldown -= dt;
      if (lair.cooldown > 0) continue;
      const dists = players.filter((p) => p.level === lair.level).map((p) => Math.hypot(p.x - lair.x, p.z - lair.z));
      if (!dists.length || Math.min(...dists) > WAKE_RANGE || Math.min(...dists) < 6) continue;
      const e = { id: this.nextEntity++, level: lair.level, x: lair.x, z: lair.z, lair };
      lair.entity = e.id;
      this.entities.push(e);
    }
  }

  private moveEntity(e: EntityState & { lair: Lair }, players: PlayerState[], dt: number) {
    const map = getMap(e.level);
    const same = players.filter((p) => p.level === e.level);
    const ex = cellOf(e.x);
    const ez = cellOf(e.z);

    // elige como objetivo al jugador más cercano por camino a oscuras
    let goal: { x: number; z: number } | null = null;
    let next: [number, number] | null = null;
    let best = Infinity;
    for (const p of same) {
      const dist = darkDistances(map, cellOf(p.x), cellOf(p.z), CHASE_CELLS);
      const d = dist[ez * map.w + ex];
      if (d < 0 || d >= best) continue;
      best = d;
      goal = p;
      next = null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = (ez + dz) * map.w + ex + dx;
        if (dist[n] === d - 1 && (d - 1 > 0 || map.dark[n])) next = [ex + dx, ez + dz];
      }
    }

    if (!goal) {
      // nadie a su alcance: vuelve a la guarida y desaparece allí
      if (Math.hypot(e.x - e.lair.x, e.z - e.lair.z) < 0.3) {
        if (!same.some((p) => Math.hypot(p.x - e.x, p.z - e.z) < WAKE_RANGE)) this.removeEntity(e.id);
        return;
      }
      const home = darkDistances(map, cellOf(e.lair.x), cellOf(e.lair.z), 200);
      const d = home[ez * map.w + ex];
      goal = e.lair;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (d > 0 && home[(ez + dz) * map.w + ex + dx] === d - 1) next = [ex + dx, ez + dz];
      }
      if (d < 0) {
        e.x = e.lair.x;
        e.z = e.lair.z;
        return;
      }
    }

    // se queda quieto si alguien le apunta con la linterna
    const lit = same.some((p) => {
      if (!p.light) return false;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > FLASHLIGHT_RANGE || d < 0.01) return false;
      return (-Math.sin(p.ry) * dx - Math.cos(p.ry) * dz) / d > 0.93;
    });
    if (lit) return;

    // hacia el centro de la siguiente casilla o, si ya está en la misma, hacia el jugador
    const tx = next ? center(next[0]) : goal.x;
    const tz = next ? center(next[1]) : goal.z;
    const dx = tx - e.x;
    const dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return;
    const step = Math.min(d, LEVELS[e.level].smilerSpeed * dt);
    const nx = e.x + (dx / d) * step;
    const nz = e.z + (dz / d) * step;
    // nunca entra en casillas iluminadas
    if (map.dark[cellOf(nz) * map.w + cellOf(nx)]) {
      e.x = nx;
      e.z = nz;
    } else if (!next) {
      // pegado al borde de la luz: se acerca todo lo que puede
      e.x = Math.min(Math.max(nx, ex * CELL + 0.05), (ex + 1) * CELL - 0.05);
      e.z = Math.min(Math.max(nz, ez * CELL + 0.05), (ez + 1) * CELL - 0.05);
    }
  }
}
