import * as THREE from 'three';
import { bonePosition, solveTwoBone } from './ik';

/**
 * Lo que el controlador necesita saber del mundo. Cada juego lo implementa
 * con su propio mapa (aquí: src/locomotionEnv.ts).
 */
export interface Env {
  /** Altura del suelo en (x, z) para alguien con los pies cerca de y. */
  floor(x: number, z: number, y: number): number;
  /** Altura del techo en (x, z) para alguien con los pies cerca de y. */
  ceil(x: number, z: number, y: number): number;
  /** ¿Hay pared (algo macizo) en ese punto? */
  solid(x: number, y: number, z: number): boolean;
}

export interface Limb {
  upper: THREE.Object3D; // muslo / brazo
  lower: THREE.Object3D; // espinilla / antebrazo (hijo de upper, en (0, -a, 0))
  a: number; // largo de upper
  b: number; // largo de lower (hasta el pie o la muñeca)
}

/**
 * Esqueleto bípedo. `root` es el objeto que se mueve desde fuera: su origen
 * está a la altura de los pies y mira hacia -Z. Todos los huesos cuelgan hacia
 * -Y en reposo (ver ik.ts).
 */
export interface BipedRig {
  root: THREE.Object3D;
  hips: THREE.Object3D; // hijo de root
  spine: THREE.Object3D; // tronco (hijo de hips)
  neck: THREE.Object3D;
  head: THREE.Object3D;
  legs: [Limb, Limb]; // izquierda, derecha (los muslos cuelgan de hips)
  arms: [Limb, Limb]; // los brazos cuelgan del tronco
  hipHeight: number; // altura de la cadera de pie
  height: number; // altura total de pie
  hipWidth: number; // separación de los pies (mitad)
}

export type Gait = 'idle' | 'walk' | 'run' | 'attack' | 'flee';

export interface BipedOptions {
  /** Escala de las zancadas (piernas largas → más). */
  stride?: number;
  /** Cuánto levanta los pies. */
  lift?: number;
  /** A partir de qué velocidad (m/s) apoya las manos en las paredes. */
  wallSpeed?: number;
  /** Con el techo así de bajo (fracción de su altura) baja las manos al suelo. */
  crawlBelow?: number;
  /** Postura encorvada de serie (radianes de la espalda hacia delante). */
  hunch?: number;
  /** Segundos de espera mínima entre dos apoyos de mano en la pared. */
  wallRest?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Un pie o una mano que se planta y da pasos de un punto a otro. */
class Stepper {
  pos = new THREE.Vector3();
  from = new THREE.Vector3();
  to = new THREE.Vector3();
  t = 1;
  dur = 0.3;
  lift = 0.1;
  get moving() {
    return this.t < 1;
  }
  start(to: THREE.Vector3, dur: number, lift: number) {
    this.from.copy(this.pos);
    this.to.copy(to);
    this.t = 0;
    this.dur = dur;
    this.lift = lift;
  }
  snap(p: THREE.Vector3) {
    this.pos.copy(p);
    this.to.copy(p);
    this.t = 1;
  }
  tick(dt: number) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.pos.lerpVectors(this.from, this.to, e);
    this.pos.y += Math.sin(Math.PI * this.t) * this.lift;
  }
}

interface Hand {
  mode: 'swing' | 'wall' | 'ground';
  target: THREE.Vector3; // adonde va la mano (suavizado)
  wall: THREE.Vector3; // punto de la pared donde se apoya
  held: number; // tiempo apoyada
  ground: Stepper;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _sh = new THREE.Vector3();

/**
 * Locomoción procedural que tiene en cuenta el entorno: pasos con los pies
 * sobre el suelo real (escalones, rampas), se agacha bajo techos bajos (y si
 * es muy bajo, avanza con las manos en el suelo), apoya las manos en las
 * paredes al correr o al girar una esquina, se inclina en las curvas y al
 * acelerar, y gira la cabeza hacia lo que mira.
 *
 * Uso: crear con el esqueleto y el entorno, y llamar a update() cada
 * fotograma DESPUÉS de mover y girar `rig.root`.
 */
export class BipedLocomotion {
  private feet = [new Stepper(), new Stepper()];
  private hands: [Hand, Hand];
  private prev = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private acc = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private ready = false;
  private crouch = 0; // 0-1: cuánto se ha tenido que encoger
  private bend = 0; // radianes que encorva la espalda por el techo
  private squat = 0; // metros que baja la cadera por el techo
  private wallCool = 0; // espera hasta el próximo apoyo en la pared
  private lean = new THREE.Vector2(); // x: hacia delante, y: de lado
  private look = new THREE.Vector2(); // x: giro, y: arriba/abajo
  private hipsY = 0;
  private time = 0;
  private twitch = 0;
  private o: Required<BipedOptions>;

  constructor(
    private rig: BipedRig,
    private env: Env,
    opts: BipedOptions = {},
  ) {
    this.o = { stride: 1, lift: 0.1, wallSpeed: 2.2, crawlBelow: 0.62, hunch: 0, wallRest: 2, ...opts };
    const hand = (): Hand => ({ mode: 'swing', target: new THREE.Vector3(), wall: new THREE.Vector3(), held: 0, ground: new Stepper() });
    this.hands = [hand(), hand()];
  }

  /** Cuánto está agachado ahora (0-1). Útil para el juego (p. ej. altura de los ojos). */
  get crouching(): number {
    return this.crouch;
  }

  /** ¿Qué manos están apoyadas en una pared? (para pruebas y efectos) */
  get handsOnWall(): [boolean, boolean] {
    return [this.hands[0].mode === 'wall', this.hands[1].mode === 'wall'];
  }

  update(dt: number, gait: Gait, lookAt: THREE.Vector3 | null) {
    dt = Math.min(dt, 0.1);
    if (dt <= 0) return;
    this.time += dt;
    const { rig, env, o } = this;
    const root = rig.root;
    root.updateWorldMatrix(true, false);
    const pos = _p.setFromMatrixPosition(root.matrixWorld);
    const yaw = root.getWorldDirection(_v); // three: +Z local en el mundo
    this.fwd.set(-yaw.x, 0, -yaw.z).normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);

    // ---- velocidad y aceleración (suavizadas) ----
    if (!this.ready || pos.distanceTo(this.prev) > 3) this.reset(pos);
    _w.subVectors(pos, this.prev).divideScalar(dt).setY(0);
    const k = 1 - Math.exp(-dt * 10);
    _q.subVectors(_w, this.vel).divideScalar(dt);
    this.acc.lerp(_q, 1 - Math.exp(-dt * 6));
    this.vel.lerp(_w, k);
    this.prev.copy(pos);
    const speed = this.vel.length();

    // ---- ¿cabe de pie? techo justo encima y un poco por delante ----
    // (no cuentan las paredes ni los escalones: solo el techo que tiene encima de verdad)
    const ground = env.floor(pos.x, pos.z, pos.y);
    let room = Infinity;
    const dir = speed > 0.3 ? _w.copy(this.vel).divideScalar(speed) : _w.copy(this.fwd);
    for (const ahead of [0, 0.4]) {
      const x = pos.x + dir.x * ahead;
      const z = pos.z + dir.z * ahead;
      if (ahead && env.solid(x, pos.y + 1, z)) continue;
      const f = env.floor(x, z, pos.y);
      if (!Number.isFinite(f) || Math.abs(f - ground) > 0.35) continue;
      room = Math.min(room, env.ceil(x, z, pos.y) - Math.max(f, ground));
    }
    // primero encorva la espalda lo justo para que quepa la cabeza; si no basta, dobla las rodillas
    const deficit = Math.max(0, rig.height + 0.05 - room);
    const upperBody = rig.height - rig.hipHeight;
    const maxBend = 1.0;
    const bendDrop = upperBody * (1 - Math.cos(maxBend));
    const wantBend = deficit <= bendDrop ? Math.acos(1 - deficit / upperBody) : maxBend;
    const wantSquat = Math.min(rig.hipHeight * 0.5, Math.max(0, deficit - bendDrop));
    const kc = 1 - Math.exp(-dt * 4);
    this.bend += (wantBend - this.bend) * kc;
    this.squat += (wantSquat - this.squat) * kc;
    this.crouch = Math.min(1, this.bend / maxBend * 0.6 + (this.squat / (rig.hipHeight * 0.5)) * 0.4);
    const crawl = deficit > bendDrop + rig.hipHeight * 0.5;

    // ---- pies ----
    const legLen = rig.legs[0].a + rig.legs[0].b;
    const stepDur = THREE.MathUtils.clamp(0.5 - speed * 0.06, 0.16, 0.5) * Math.sqrt(o.stride) * (1 + this.crouch * 0.3);
    const thr = (speed < 0.15 ? 0.1 : Math.min(legLen * 0.8, 0.16 + speed * 0.13)) * o.stride;
    for (let i = 0; i < 2; i++) {
      const foot = this.feet[i];
      const other = this.feet[1 - i];
      const side = i === 0 ? -1 : 1;
      this.target(pos, side * rig.hipWidth, 0, stepDur * 0.55, _q);
      _q.y = env.floor(_q.x, _q.z, pos.y + 0.5);
      if (!Number.isFinite(_q.y)) _q.y = ground;
      const err = Math.hypot(foot.to.x - _q.x, foot.to.z - _q.z);
      const free = !other.moving || other.t > (speed > 2.5 ? 0.45 : 0.9);
      const worse = err >= Math.hypot(other.to.x - _q.x, other.to.z - _q.z) - 0.05 || !free;
      if (!foot.moving && free && err > thr && worse) foot.start(_q, stepDur, o.lift + speed * 0.025);
      foot.tick(dt);
    }

    // ---- cadera: altura según los pies, agachado y zancada ----
    const fy = (this.feet[0].pos.y + this.feet[1].pos.y) / 2;
    let hy = Math.max(fy, ground) + rig.hipHeight - this.squat - (crawl ? rig.hipHeight * 0.12 : 0);
    // en mitad de un paso el cuerpo sube un poco
    for (const f of this.feet) if (f.moving) hy += Math.sin(Math.PI * f.t) * 0.025 * (1 + speed * 0.15);
    // las piernas tienen que llegar al suelo
    for (const f of this.feet) {
      const h = Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z);
      hy = Math.min(hy, f.pos.y + Math.sqrt(Math.max(0.01, (legLen * 0.97) ** 2 - h * h)));
    }
    this.hipsY += (hy - this.hipsY) * (1 - Math.exp(-dt * 14));
    rig.hips.position.set(0, this.hipsY - pos.y, 0);

    // ---- inclinación: hacia delante al correr y acelerar, hacia dentro en las curvas ----
    const accF = this.acc.dot(this.fwd);
    const accR = this.acc.dot(this.right);
    const wantF = THREE.MathUtils.clamp(speed * 0.07 + accF * 0.025, -0.25, 0.55);
    const wantR = THREE.MathUtils.clamp(accR * 0.05, -0.35, 0.35);
    const kl = 1 - Math.exp(-dt * 6);
    this.lean.x += (wantF - this.lean.x) * kl;
    this.lean.y += (wantR - this.lean.y) * kl;
    rig.hips.rotation.set(-this.lean.x * 0.3, 0, -this.lean.y);
    rig.spine.rotation.set(-(o.hunch + this.lean.x * 0.7 + this.bend + (crawl ? 0.35 : 0)), 0, 0);

    // ---- cabeza: mira a lo que le interesa (con límites) ----
    let lookYaw = 0;
    let lookPitch = 0;
    if (lookAt) {
      const dx = lookAt.x - pos.x;
      const dz = lookAt.z - pos.z;
      const want = Math.atan2(-dx, -dz);
      const cur = Math.atan2(-this.fwd.x, -this.fwd.z);
      lookYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), -1.3, 1.3);
      lookPitch = THREE.MathUtils.clamp(Math.atan2(lookAt.y - (this.hipsY + rig.height - rig.hipHeight), Math.hypot(dx, dz)), -0.7, 0.7);
    }
    const kh = 1 - Math.exp(-dt * 7);
    this.look.x += (lookYaw - this.look.x) * kh;
    this.look.y += (lookPitch - this.look.y) * kh;
    // de vez en cuando, un tirón de cabeza
    this.twitch -= dt;
    const jerk = this.twitch < 0.12 && this.twitch > 0 ? 0.25 : 0;
    if (this.twitch < 0) this.twitch = 2 + Math.random() * 5;
    rig.spine.rotation.y = this.look.x * 0.3;
    // el cuello compensa casi toda la curva de la espalda: la cabeza sigue mirando al frente
    rig.neck.rotation.set((this.bend + o.hunch) * 0.75 + this.lean.x * 0.5 + this.look.y * 0.4, this.look.x * 0.3, 0);
    rig.head.rotation.set(this.look.y * 0.6, this.look.x * 0.4, jerk);

    root.updateMatrixWorld(true);

    // ---- piernas (IK): rodillas hacia delante ----
    for (let i = 0; i < 2; i++) {
      const leg = rig.legs[i];
      _pole.copy(this.fwd).addScaledVector(this.right, i === 0 ? -0.15 : 0.15);
      solveTwoBone(leg.upper, leg.lower, leg.a, leg.b, this.feet[i].pos, _pole);
    }

    // ---- brazos: balanceo, pared, suelo o ataque ----
    this.wallCool = Math.max(0, this.wallCool - dt);
    for (let i = 0; i < 2; i++) this.arm(i, dt, gait, speed, crawl, lookAt, pos);
  }

  /** Punto en el suelo relativo al cuerpo, adelantado según la velocidad. */
  private target(pos: THREE.Vector3, side: number, ahead: number, lead: number, out: THREE.Vector3) {
    return out.copy(pos).addScaledVector(this.right, side).addScaledVector(this.fwd, ahead).addScaledVector(this.vel, lead);
  }

  private reset(pos: THREE.Vector3) {
    this.ready = true;
    this.prev.copy(pos);
    this.vel.set(0, 0, 0);
    this.acc.set(0, 0, 0);
    this.hipsY = pos.y + this.rig.hipHeight;
    for (let i = 0; i < 2; i++) {
      this.target(pos, (i === 0 ? -1 : 1) * this.rig.hipWidth, 0, 0, _q);
      _q.y = this.env.floor(_q.x, _q.z, pos.y + 0.5);
      if (!Number.isFinite(_q.y)) _q.y = pos.y;
      this.feet[i].snap(_q);
      this.hands[i].mode = 'swing';
      this.hands[i].target.copy(pos).setY(pos.y + 0.8);
    }
  }

  private arm(i: number, dt: number, gait: Gait, speed: number, crawl: boolean, lookAt: THREE.Vector3 | null, pos: THREE.Vector3) {
    const { rig, env, o } = this;
    const arm = rig.arms[i];
    const h = this.hands[i];
    const side = i === 0 ? -1 : 1;
    const reach = (arm.a + arm.b) * 0.95;
    const sh = bonePosition(arm.upper, _sh);
    const want = _q;

    if (gait === 'attack' && lookAt && lookAt.distanceTo(sh) < reach * 2) {
      // zarpazo: las dos manos a por ti
      want.copy(lookAt).addScaledVector(this.right, side * 0.15);
      h.mode = 'swing';
    } else if (crawl) {
      // techo muy bajo: las manos al suelo, delante, como otro par de patas
      if (h.mode !== 'ground') h.ground.snap(h.target);
      h.mode = 'ground';
      this.target(pos, side * rig.hipWidth * 1.6, reach * 0.55, h.ground.dur * 0.5, want);
      want.y = env.floor(want.x, want.z, pos.y + 0.5) + 0.03;
      if (!Number.isFinite(want.y)) want.y = pos.y;
      const other = this.hands[1 - i].ground;
      const err = h.ground.to.distanceTo(want);
      if (!h.ground.moving && (!other.moving || other.t > 0.6) && err > 0.15 + speed * 0.12) h.ground.start(want, THREE.MathUtils.clamp(0.4 - speed * 0.05, 0.16, 0.4), 0.12);
      h.ground.tick(dt);
      want.copy(h.ground.pos);
    } else {
      if (h.mode === 'ground') h.mode = 'swing';
      // ¿apoyada en la pared? se suelta enseguida: es un impulso, no un agarre
      if (h.mode === 'wall') {
        h.held += dt;
        const behind = _v.subVectors(h.wall, sh).dot(this.fwd);
        if (h.wall.distanceTo(sh) > reach * 1.02 || behind < -0.25 || h.held > 0.45 || speed < o.wallSpeed * 0.6) {
          h.mode = 'swing';
          this.wallCool = o.wallRest + Math.random() * o.wallRest;
        }
      }
      // solo de vez en cuando: al doblar una esquina corriendo (la mano de dentro del giro)
      // o, rara vez, al pasar rozando una pared
      const running = gait === 'run' || gait === 'flee';
      const other = this.hands[1 - i].mode === 'wall';
      if (h.mode === 'swing' && !other && this.wallCool <= 0 && running && speed > o.wallSpeed) {
        const accR = this.acc.dot(this.right);
        const corner = Math.abs(accR) > 3 && Math.sign(accR) === side;
        const brush = Math.random() < dt * 0.5;
        if (corner || brush) {
          const y = sh.y - 0.15;
          const dirs = corner ? [[0.75, 0.65], [1, 0.15]] : [[1, 0.1]];
          const limit = corner ? reach : reach * 0.6;
          for (const [sd, f] of dirs) {
            _w.copy(this.right).multiplyScalar(side * sd).addScaledVector(this.fwd, f).normalize();
            let hit = -1;
            for (let t = 0.2; t <= limit; t += 0.06) {
              if (env.solid(sh.x + _w.x * t, y, sh.z + _w.z * t)) {
                hit = t;
                break;
              }
            }
            if (hit > 0) {
              h.mode = 'wall';
              h.held = 0;
              h.wall.set(sh.x + _w.x * (hit - 0.03), y + 0.1 * Math.random(), sh.z + _w.z * (hit - 0.03));
              this.wallCool = 0.3;
              break;
            }
          }
        }
      }
      if (h.mode === 'wall') want.copy(h.wall);
      else {
        // balanceo contrario a la pierna del mismo lado; corriendo, codos doblados
        const foot = this.feet[1 - i].pos;
        const swing = THREE.MathUtils.clamp(_v.subVectors(foot, pos).dot(this.fwd), -0.6, 0.6);
        const run = gait === 'run' || gait === 'flee' || speed > 2.5;
        want
          .copy(sh)
          .addScaledVector(UP, -reach * (run ? 0.74 : 0.95) + this.squat * 0.6)
          .addScaledVector(this.fwd, swing * (run ? 1.1 : 0.7) + (this.bend + o.hunch) * 0.3)
          .addScaledVector(this.right, side * (0.08 + (run ? 0.06 : 0)));
        // la mano no atraviesa el suelo
        const f = env.floor(want.x, want.z, pos.y + 0.5);
        if (Number.isFinite(f)) want.y = Math.max(want.y, f + 0.05);
      }
    }
    const fast = h.mode === 'ground' ? 22 : h.mode === 'wall' ? 16 : 10;
    h.target.lerp(want, 1 - Math.exp(-dt * fast));
    // codos hacia atrás (y un poco hacia fuera solo si la mano está apoyada de lado)
    _pole.copy(this.fwd).multiplyScalar(-1).addScaledVector(this.right, side * (h.mode === 'wall' ? 0.35 : 0.12)).addScaledVector(UP, -0.2);
    solveTwoBone(arm.upper, arm.lower, arm.a, arm.b, h.target, _pole);
  }
}
