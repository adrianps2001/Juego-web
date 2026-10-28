import * as THREE from 'three';
import type { Hud } from './hud';
import { Level3D } from './level3d';
import { lightUniforms } from './lighting';
import { makeHumanoid, makeSmiler, makeViewTorch, type Humanoid, type SmilerModel } from './models';
import { Post } from './post';
import type { ClientMessage, EntityState, PlayerState, Pose } from './protocol';
import type { Sound } from './sound';
import { ESCAPED, LEVELS, collide, getMap, isDarkAt, type Exit, type Item } from './world';

const EYE = 1.6;
const RADIUS = 0.3;
const WALK = 3.2;
const SPRINT = 5.6;
const CATCH_DIST = 0.8;
const RESPAWN_TIME = 4;
const TORCH_POWER = 22;

interface Remote {
  model: Humanoid;
  target: PlayerState;
  speed: number;
}

interface Smiler {
  model: SmilerModel;
  target: EntityState;
}

export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.03, 120);
  private flashlight = new THREE.SpotLight(0xfff1d6, 0, 26, 0.48, 0.5, 1.2);
  private ambient = new THREE.HemisphereLight(0xffffff, 0x222222, 0.04);
  private post: Post;
  private torch = makeViewTorch();
  private timer = new THREE.Timer();
  private level: Level3D | null = null;
  private picked: Set<string>;
  private remotes = new Map<string, Remote>();
  private smilers = new Map<number, Smiler>();
  private others: PlayerState[] = [];
  private keys = new Set<string>();
  private pressed = new Set<string>();

  private pose: Pose;
  private yaw = 0;
  private pitch = 0;
  private sanity = 100;
  private stamina = 100;
  private battery = 100;
  private dead = 0;
  private damage = 0;
  private time = 0;
  private flickerOut = 0;
  private bob = 0;
  private stepDist = 0;
  private sendAccum = 0;
  private running = true;

  constructor(
    private container: HTMLElement,
    private hud: Hud,
    private sound: Sound,
    private myId: string,
    picked: string[],
    spawn: { x: number; z: number },
    private send: (msg: ClientMessage) => void,
  ) {
    this.picked = new Set(picked);
    this.pose = { level: 0, x: spawn.x, z: spawn.z, ry: 0, light: false };

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(this.renderer.domElement);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.camera.rotation.order = 'YXZ';
    this.flashlight.position.set(0.2, -0.2, -0.3);
    this.flashlight.target.position.set(0.05, -0.1, -3);
    this.camera.add(this.flashlight, this.flashlight.target, this.torch.group);
    this.scene.add(this.camera, this.ambient);

    this.bindInput();
    this.resize();
    window.addEventListener('resize', this.resize);
    hud.show(true);
    this.enterLevel(0, false);
    this.renderer.setAnimationLoop(this.tick);
  }

  // ---------- red ----------

  onState(players: PlayerState[], entities: EntityState[]) {
    this.others = players.filter((p) => p.id !== this.myId);
    this.hud.setPlayers(players, this.myId);

    for (const p of this.others) {
      let r = this.remotes.get(p.id);
      if (!r) {
        r = { model: makeHumanoid(p.color, p.name), target: p, speed: 0 };
        r.model.group.position.set(p.x, 0, p.z);
        this.remotes.set(p.id, r);
        this.scene.add(r.model.group);
      }
      r.target = p;
      r.model.group.visible = p.level === this.pose.level;
      r.model.setLight(p.light);
    }
    for (const [id, r] of this.remotes) {
      if (!this.others.some((p) => p.id === id)) {
        this.scene.remove(r.model.group);
        this.remotes.delete(id);
      }
    }

    for (const e of entities) {
      let s = this.smilers.get(e.id);
      if (!s) {
        s = { model: makeSmiler(e.id), target: e };
        s.model.group.position.set(e.x, 0, e.z);
        this.smilers.set(e.id, s);
        this.scene.add(s.model.group);
      }
      s.target = e;
      s.model.group.visible = e.level === this.pose.level;
    }
    for (const [id, s] of this.smilers) {
      if (!entities.some((e) => e.id === id)) {
        this.scene.remove(s.model.group);
        this.smilers.delete(id);
      }
    }
  }

  onPicked(key: string, by: string) {
    this.picked.add(key);
    this.level?.removeItem(key);
    if (by !== this.myId) return;
    const level = Number(key.split(':')[0]);
    const item = getMap(level).items.find((i) => i.key === key);
    if (item?.kind === 'agua') {
      this.sanity = Math.min(100, this.sanity + 40);
      this.hud.notice('Has bebido agua de almendras. Te sientes más tranquilo.');
      this.sound.beep(520);
    } else if (item?.kind === 'pila') {
      this.battery = Math.min(100, this.battery + 50);
      this.hud.notice('Has recogido pilas para la linterna.');
      this.sound.beep(880);
    }
  }

  // ---------- niveles ----------

  private enterLevel(level: number, move = true) {
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
      this.level = null;
    }
    this.pose.level = level;
    this.hud.enterLevel(level);
    this.sound.setLevel(level);
    for (const r of this.remotes.values()) r.model.group.visible = r.target.level === level;
    for (const s of this.smilers.values()) s.model.group.visible = s.target.level === level;

    if (level === ESCAPED) {
      this.scene.fog = null;
      this.scene.background = new THREE.Color(0x000000);
      this.setLight(false);
      if (document.pointerLockElement) document.exitPointerLock();
      this.hud.setPrompt(null);
      this.hud.showLock(false);
      this.sendPose();
      return;
    }
    const L = LEVELS[level];
    const map = getMap(level);
    if (move) {
      this.pose.x = map.spawn.x + (Math.random() - 0.5);
      this.pose.z = map.spawn.z + (Math.random() - 0.5);
    }
    this.scene.background = new THREE.Color(L.fog.color);
    this.scene.fog = new THREE.Fog(L.fog.color, L.fog.near, L.fog.far);
    this.level = new Level3D(map, this.picked);
    this.scene.add(this.level.group);
    this.sendPose();
  }

  /** Tras escapar: volver a empezar desde el Nivel 0. */
  reenter() {
    this.sanity = 100;
    this.battery = 100;
    this.enterLevel(0);
  }

  // ---------- entrada ----------

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.renderer.domElement.addEventListener('click', this.lockPointer);
    document.getElementById('lock')!.addEventListener('click', this.lockPointer);
    this.hud.showLock(true);
  }

  private lockPointer = () => {
    if (this.pose.level !== ESCAPED) void this.renderer.domElement.requestPointerLock();
  };
  private onLockChange = () => {
    this.hud.showLock(document.pointerLockElement !== this.renderer.domElement && this.pose.level !== ESCAPED);
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.4, 1.4);
  };

  private resize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private setLight(on: boolean) {
    this.pose.light = on;
    this.flashlight.intensity = on ? TORCH_POWER : 0;
    this.torch.setOn(on);
  }

  // ---------- bucle principal ----------

  private tick = () => {
    if (!this.running) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.time += dt;
    this.updateFlicker(dt);
    this.damage = Math.max(0, this.damage - dt * 0.8);

    if (this.level) {
      if (this.dead > 0) this.updateDead(dt);
      else this.updateAlive(dt);
      this.updateOthers(dt);
    }
    this.pressed.clear();
    const insanity = this.level ? Math.max(0, 1 - this.sanity / 45) : 0;
    this.post.render(this.time, insanity, this.damage);
  };

  private updateFlicker(dt: number) {
    let f = 0.9 + 0.1 * Math.sin(this.time * 41) * Math.sin(this.time * 13.7);
    if (Math.random() < dt * 0.6) this.flickerOut = 0.05 + Math.random() * 0.25;
    if (this.flickerOut > 0) {
      this.flickerOut -= dt;
      f *= Math.random() < 0.5 ? 0.05 : 0.4;
    }
    lightUniforms.uFlicker.value = f;
    this.level?.setFlicker(f);
  }

  private updateDead(dt: number) {
    this.dead -= dt;
    this.camera.position.y = Math.max(0.3, this.camera.position.y - dt * 2);
    this.camera.rotation.z = Math.min(1.2, this.camera.rotation.z + dt);
    if (this.dead <= 0) {
      this.hud.showDeath(null);
      this.sanity = 60;
      this.stamina = 100;
      this.enterLevel(this.pose.level);
    }
  }

  private die(reason: 'smiler' | 'cordura', entity?: number) {
    this.dead = RESPAWN_TIME;
    this.damage = 1;
    this.setLight(false);
    this.sound.scream();
    this.hud.setPrompt(null);
    this.hud.showDeath(reason === 'smiler' ? 'Un Smiler te ha atrapado en la oscuridad.' : 'Has perdido la cordura.');
    this.send({
      t: 'died',
      reason: reason === 'smiler' ? 'ha sido atrapado por un Smiler' : 'ha perdido la cordura',
      entity,
    });
  }

  private updateAlive(dt: number) {
    const map = this.level!.map;
    const L = LEVELS[this.pose.level];
    const k = this.keys;

    // movimiento
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const moving = fwd !== 0 || side !== 0;
    const sprinting = moving && (k.has('ShiftLeft') || k.has('ShiftRight')) && this.stamina > 0;
    this.stamina = THREE.MathUtils.clamp(this.stamina + (sprinting ? -22 : 12) * dt, 0, 100);
    if (moving) {
      const len = Math.hypot(fwd, side);
      const speed = (sprinting ? SPRINT : WALK) * dt;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = ((-sin * fwd + cos * side) / len) * speed;
      const dz = ((-cos * fwd - sin * side) / len) * speed;
      const p = collide(map, this.pose.x + dx, this.pose.z + dz, RADIUS);
      const moved = Math.hypot(p.x - this.pose.x, p.z - this.pose.z);
      this.pose.x = p.x;
      this.pose.z = p.z;
      this.bob += moved * 2.4;
      this.stepDist += moved;
      if (this.stepDist > (sprinting ? 1.6 : 1.3)) {
        this.stepDist = 0;
        this.sound.step(this.pose.level);
      }
    }
    this.pose.ry = this.yaw;

    // linterna
    if (this.pressed.has('KeyF')) {
      this.sound.click();
      this.setLight(!this.pose.light && this.battery > 0);
    }
    if (this.pose.light) {
      this.battery = Math.max(0, this.battery - 1.1 * dt);
      if (this.battery === 0) this.setLight(false);
      // con poca pila la linterna falla
      else if (this.battery < 15) this.flashlight.intensity = Math.random() < 0.1 ? 4 : TORCH_POWER;
    }

    // Smilers cercanos
    let nearest = Infinity;
    let nearestId = 0;
    for (const s of this.smilers.values()) {
      if (s.target.level !== this.pose.level) continue;
      const pos = s.model.group.position;
      const d = Math.hypot(pos.x - this.pose.x, pos.z - this.pose.z);
      if (d < nearest) {
        nearest = d;
        nearestId = s.target.id;
      }
    }
    if (nearest < CATCH_DIST) return this.die('smiler', nearestId);

    // cordura
    const dark = isDarkAt(map, this.pose.x, this.pose.z);
    const company = this.others.some(
      (p) => p.level === this.pose.level && Math.hypot(p.x - this.pose.x, p.z - this.pose.z) < 8,
    );
    let drain = L.sanityDrain * (dark && !this.pose.light ? 3 : dark ? 1.8 : 1);
    if (nearest < 14) drain += 4 * (1 - nearest / 14);
    if (company) drain *= 0.5;
    this.sanity = Math.max(0, this.sanity - drain * dt);
    if (this.sanity === 0) return this.die('cordura');

    this.updateInteraction();

    // cámara y linterna en la mano
    const insanity = Math.max(0, 1 - this.sanity / 40);
    const bobY = moving ? Math.sin(this.bob) * 0.04 : 0;
    this.camera.position.set(this.pose.x, EYE + bobY, this.pose.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.time * 0.9) * 0.06 * insanity);
    this.camera.fov = 75 + Math.sin(this.time * 1.3) * 6 * insanity;
    this.camera.updateProjectionMatrix();
    this.torch.group.position.set(
      0.17 + (moving ? Math.cos(this.bob * 0.5) * 0.012 : 0),
      -0.17 - bobY * 0.4 + Math.sin(this.time * 1.5) * 0.003,
      -0.38,
    );

    this.hud.bars(this.sanity, this.stamina, this.battery);
    this.sound.update(lightUniforms.uFlicker.value, nearest < 25 ? 1 - nearest / 25 : 0, insanity, dark);

    this.sendAccum += dt;
    if (this.sendAccum >= 0.05) {
      this.sendAccum = 0;
      this.sendPose();
    }
  }

  private updateInteraction() {
    const map = this.level!.map;
    let item: Item | null = null;
    let exit: Exit | null = null;
    for (const i of map.items) {
      if (!this.picked.has(i.key) && Math.hypot(i.x - this.pose.x, i.z - this.pose.z) < 1.4) item = i;
    }
    for (const e of map.exits) {
      if (Math.hypot(e.x - this.pose.x, e.z - this.pose.z) < 1.5) exit = e;
    }
    const last = this.pose.level === LEVELS.length - 1;
    this.hud.setPrompt(
      exit
        ? last
          ? '[E] Abrir la puerta… ¿será la última?'
          : '[E] Abrir la puerta de salida'
        : item
          ? item.kind === 'agua'
            ? '[E] Beber agua de almendras'
            : '[E] Coger las pilas'
          : null,
    );
    if (!this.pressed.has('KeyE')) return;
    if (exit) {
      this.hud.setPrompt(null);
      this.sound.beep(220, 0.6);
      this.enterLevel(this.pose.level + 1);
    } else if (item) {
      this.send({ t: 'pickup', key: item.key });
    }
  }

  private updateOthers(dt: number) {
    const k = 1 - Math.exp(-10 * dt);
    for (const r of this.remotes.values()) {
      const g = r.model.group;
      const px = g.position.x;
      const pz = g.position.z;
      g.position.x += (r.target.x - px) * k;
      g.position.z += (r.target.z - pz) * k;
      const v = Math.hypot(g.position.x - px, g.position.z - pz) / Math.max(dt, 1e-3);
      r.speed += (v - r.speed) * Math.min(1, dt * 8);
      let diff = r.target.ry - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * k;
      r.model.animate(dt, r.speed);
    }
    for (const s of this.smilers.values()) {
      const g = s.model.group;
      g.position.x += (s.target.x - g.position.x) * k;
      g.position.z += (s.target.z - g.position.z) * k;
      // siempre mira hacia ti
      g.rotation.y = Math.atan2(g.position.x - this.pose.x, g.position.z - this.pose.z);
      s.model.animate(this.time);
    }
  }

  private sendPose() {
    this.send({ t: 'pose', pose: { ...this.pose } });
  }

  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.level?.dispose();
    this.post.dispose();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.getElementById('lock')!.removeEventListener('click', this.lockPointer);
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.hud.show(false);
    this.hud.showDeath(null);
    this.hud.showLock(false);
  }
}
