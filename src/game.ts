import * as THREE from 'three';
import type { Hud } from './hud';
import { ITEM_INFO, Inventory } from './inventory';
import { Level3D } from './level3d';
import { ESCAPED, LEVELS, getMap } from './levels';
import { MAX_TORCHES, lightUniforms } from './lighting';
import { makeBattery, makeBottle, makeEnemy, makeEnergyBar, makeHumanoid, makeMedkit, makeViewTorch, type EnemyModel, type Humanoid } from './models';
import { Post } from './post';
import type { ClientMessage, EntityState, PlayerState, Pose } from './protocol';
import { getSettings, onSettings, type Settings } from './settings';
import type { Sound } from './sound';
import { PLAYER_HEIGHT, STEP, ceilAt, collide, floorAt, isDarkAt, type EntityKind, type ItemKind } from './world';

const EYE = 1.6;
const RADIUS = 0.3;
const WALK = 3.2;
const SPRINT = 5.6;
const GRAVITY = 20;
const JUMP = 4.6;
const RESPAWN_TIME = 4;
const TORCH_POWER = 1.6;
const MOUSE_SPEED = 0.0022;
// se dibuja a media resolución: se ve algo más borroso pero va fluido
const PIXEL_RATIO = 0.5;
// movimientos de ratón más grandes que esto en un solo evento son fallos del navegador
const MAX_MOUSE_JUMP = 250;
// por debajo de esta altura se ha caído por un agujero
const VOID_Y = -6;

interface Remote {
  model: Humanoid;
  target: PlayerState;
  speed: number;
}

interface Enemy {
  model: EnemyModel;
  target: EntityState;
}

const DEATH_TEXT: Record<string, [string, string]> = {
  smiler: ['Un Smiler te ha atrapado en la oscuridad.', 'ha sido atrapado por un Smiler'],
  hound: ['Un Hound te ha despedazado.', 'ha sido despedazado por un Hound'],
  faceling: ['Un Faceling te ha matado a golpes.', 'ha muerto a manos de un Faceling'],
  skinstealer: ['El Skin-Stealer te ha alcanzado.', 'ha sido alcanzado por un Skin-Stealer'],
  cordura: ['Has perdido la cordura.', 'ha perdido la cordura'],
  caida: ['La caída ha sido demasiado alta.', 'se ha matado en una caída'],
  vapor: ['El vapor te ha abrasado.', 'ha muerto abrasado por el vapor'],
};

const HIT_TEXT: Record<EntityKind, string> = {
  smiler: '¡Un Smiler te ha atacado!',
  hound: '¡Un Hound te ha mordido!',
  faceling: '¡Un Faceling te ha golpeado!',
  skinstealer: '¡El Skin-Stealer te ha desgarrado!',
};

export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.03, 120);
  private torchPower = 0; // intensidad de la linterna propia (0 = apagada)
  private post: Post;
  private torch = makeViewTorch();
  private held = new THREE.Group(); // objeto seleccionado, en la mano izquierda
  private heldKind: ItemKind | null = null;
  private useAnim = 0;
  private timer = new THREE.Timer();
  private level: Level3D | null = null;
  private picked: Set<string>;
  private remotes = new Map<string, Remote>();
  private enemies = new Map<number, Enemy>();
  private others: PlayerState[] = [];
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private inventory = new Inventory();
  private blackoutLevels: number[] = [];

  private pose: Pose;
  private vy = 0;
  private onGround = true;
  private eyeY = EYE;
  private yaw = 0;
  private pitch = 0;
  private health = 100;
  private sanity = 100;
  private stamina = 100;
  private exhausted = false;
  private boost = 0; // segundos de energía ilimitada (barrita)
  private battery = 100;
  private dead = 0;
  private damage = 0;
  private shake = 0;
  private time = 0;
  private flickerOut = 0;
  private bob = 0;
  private stepDist = 0;
  private sendAccum = 0;
  private running = true;
  private settings: Settings = getSettings();
  private stopSettings: () => void;
  private hudTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private lockedAt = 0;
  private hurtSound = 0;

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
    this.pose = { level: 0, x: spawn.x, y: 0, z: spawn.z, ry: 0, light: false, sprint: false, dead: false };

    this.renderer.setPixelRatio(PIXEL_RATIO);
    container.appendChild(this.renderer.domElement);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.post.setPixelRatio(PIXEL_RATIO);
    this.camera.rotation.order = 'YXZ';
    this.held.position.set(-0.2, -0.22, -0.4);
    this.camera.add(this.torch.group, this.held);
    this.scene.add(this.camera);

    this.bindInput();
    this.resize();
    this.stopSettings = onSettings((st) => this.applySettings(st));
    window.addEventListener('resize', this.resize);
    hud.show(true);
    this.enterLevel(0, false);
    this.refreshInventory();
    this.renderer.setAnimationLoop(this.tick);
  }

  // ---------------------------------------------------------------- red

  onState(players: PlayerState[], entities: EntityState[], blackout: number[]) {
    this.others = players.filter((p) => p.id !== this.myId);
    this.hud.setPlayers(players, this.myId);

    const wasDark = this.blackoutLevels.includes(this.pose.level);
    this.blackoutLevels = blackout;
    const isDark = blackout.includes(this.pose.level);
    if (isDark !== wasDark && this.level) {
      this.sound.clunk();
      this.hud.notice(isDark ? 'Se han apagado todas las luces…' : 'Las luces vuelven a encenderse.');
    }

    for (const p of this.others) {
      let r = this.remotes.get(p.id);
      if (!r) {
        r = { model: makeHumanoid(p.color, p.name), target: p, speed: 0 };
        r.model.group.position.set(p.x, p.y, p.z);
        this.remotes.set(p.id, r);
        this.scene.add(r.model.group);
      }
      r.target = p;
      r.model.group.visible = p.level === this.pose.level && !p.dead;
      r.model.setLight(p.light);
    }
    for (const [id, r] of this.remotes) {
      if (!this.others.some((p) => p.id === id)) {
        this.scene.remove(r.model.group);
        this.remotes.delete(id);
      }
    }

    for (const e of entities) {
      let en = this.enemies.get(e.id);
      if (!en) {
        en = { model: makeEnemy(e.kind, e.id), target: e };
        en.model.group.position.set(e.x, this.floorY(e.x, e.z), e.z);
        en.model.group.rotation.y = e.ry;
        this.enemies.set(e.id, en);
        this.scene.add(en.model.group);
      }
      en.target = e;
      en.model.group.visible = e.level === this.pose.level;
    }
    for (const [id, en] of this.enemies) {
      if (!entities.some((e) => e.id === id)) {
        this.scene.remove(en.model.group);
        this.enemies.delete(id);
      }
    }
  }

  onPicked(key: string, by: string) {
    this.picked.add(key);
    this.level?.removeItem(key);
    if (by !== this.myId) return;
    const level = Number(key.split(':')[0]);
    const map = getMap(level);
    const item = map.items.find((i) => i.key === key);
    const crate = map.crates.find((c) => c.key === key);
    const got = item ? [item.kind] : crate ? crate.contents : [];
    const lost: ItemKind[] = [];
    for (const kind of got) if (!this.inventory.add(kind)) lost.push(kind);
    if (got.length) this.sound.pickup();
    if (crate) this.hud.notice(`Caja de suministros: ${got.map((k) => ITEM_INFO[k].name).join(', ')}.`);
    else if (item) this.hud.notice(`Has cogido: ${ITEM_INFO[item.kind].name}.`);
    if (lost.length) this.hud.notice(`No te caben en el inventario: ${lost.map((k) => ITEM_INFO[k].name).join(', ')}.`);
    this.refreshInventory();
  }

  onHit(damage: number, kind: EntityKind) {
    if (this.dead > 0 || !this.level) return;
    this.health -= damage;
    this.damage = Math.min(1, this.damage + 0.4 + damage / 100);
    this.shake = 0.4;
    this.sound.hurt(kind);
    this.hud.notice(HIT_TEXT[kind]);
    if (this.health <= 0) this.die(kind);
  }

  // ---------------------------------------------------------------- niveles

  private enterLevel(level: number, move = true) {
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
      this.level = null;
    }
    this.pose.level = level;
    this.hud.enterLevel(level);
    this.sound.setLevel(level);
    for (const r of this.remotes.values()) r.model.group.visible = r.target.level === level && !r.target.dead;
    for (const e of this.enemies.values()) e.model.group.visible = e.target.level === level;

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
    this.pose.y = floorAt(map, this.pose.x, this.pose.z);
    this.eyeY = this.pose.y + EYE;
    this.vy = 0;
    this.scene.background = new THREE.Color(L.fog.color);
    this.scene.fog = new THREE.Fog(L.fog.color, L.fog.near, L.fog.far);
    // más allá de la niebla no se ve nada: no hace falta dibujarlo
    this.camera.far = L.fog.far + 4;
    this.camera.updateProjectionMatrix();
    this.level = new Level3D(map, this.picked);
    this.scene.add(this.level.group);
    this.sendPose();
  }

  /** Tras escapar: volver a empezar desde el Nivel 0. */
  reenter() {
    this.sanity = 100;
    this.health = 100;
    this.battery = 100;
    this.enterLevel(0);
  }

  private floorY(x: number, z: number): number {
    if (!this.level) return 0;
    const y = floorAt(this.level.map, x, z);
    return Number.isFinite(y) ? y : 0;
  }

  // ---------------------------------------------------------------- entrada

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.renderer.domElement.addEventListener('click', this.lockPointer);
    this.hud.showLock(true);
  }

  /** Captura el ratón para jugar (el botón «Continuar» del menú de pausa). */
  lockPointer = () => {
    if (this.pose.level === ESCAPED) return;
    const canvas = this.renderer.domElement;
    // movimiento "en bruto", sin la aceleración del sistema (si el navegador lo admite)
    canvas.requestPointerLock({ unadjustedMovement: true })?.catch(() => canvas.requestPointerLock());
  };
  private locked = () => document.pointerLockElement === this.renderer.domElement;
  private onLockChange = () => {
    this.lockedAt = performance.now();
    this.hud.showLock(!this.locked() && this.pose.level !== ESCAPED);
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.keys.has(e.code)) this.pressed.add(e.code);
    this.keys.add(e.code);
    const n = Number(e.key);
    if (n >= 1 && n <= this.inventory.slots.length) this.select(n - 1);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseDown = (e: MouseEvent) => {
    if (this.locked() && e.button === 0) this.pressed.add('Use');
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.locked()) return;
    const n = this.inventory.slots.length;
    this.select((this.inventory.selected + (e.deltaY > 0 ? 1 : -1) + n) % n);
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked()) return;
    // Chrome a veces manda un salto enorme de golpe (al capturar el ratón o
    // al cambiar de ventana): se ignora para que la cámara no pegue un giro
    if (Math.abs(e.movementX) > MAX_MOUSE_JUMP || Math.abs(e.movementY) > MAX_MOUSE_JUMP) return;
    if (performance.now() - this.lockedAt < 150) return;
    const speed = MOUSE_SPEED * this.settings.sensitivity;
    this.yaw -= e.movementX * speed;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * speed * (this.settings.invertY ? -1 : 1), -1.4, 1.4);
  };

  private resize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private applySettings(st: Settings) {
    this.settings = st;
    this.post.setBrightness(st.brightness);
    this.hud.showFps(st.showFps);
  }

  private setLight(on: boolean) {
    this.pose.light = on;
    this.torchPower = on ? TORCH_POWER : 0;
    this.torch.setOn(on);
  }

  // ---------------------------------------------------------------- inventario

  private select(i: number) {
    this.inventory.selected = i;
    this.refreshInventory();
  }

  private refreshInventory() {
    this.hud.setInventory(this.inventory.slots, this.inventory.selected);
    const kind = this.inventory.current()?.kind ?? null;
    if (kind === this.heldKind) return;
    this.heldKind = kind;
    this.held.clear();
    if (!kind) return;
    const model = kind === 'agua' ? makeBottle() : kind === 'pila' ? makeBattery() : kind === 'barrita' ? makeEnergyBar() : makeMedkit();
    model.scale.setScalar(kind === 'agua' ? 0.45 : 0.6);
    model.rotation.set(0.3, 0.6, kind === 'agua' ? 0 : 0.4);
    model.traverse((o) => {
      o.renderOrder = 10;
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).depthTest = false;
    });
    this.held.add(model);
  }

  private useItem() {
    const s = this.inventory.current();
    if (!s) return;
    const k = s.kind;
    if (k === 'agua' && this.sanity > 97) return this.hud.notice('Ahora mismo estás tranquilo.');
    if (k === 'pila' && this.battery > 97) return this.hud.notice('La linterna ya está cargada.');
    if (k === 'vendas' && this.health > 97) return this.hud.notice('No estás herido.');
    this.inventory.takeSelected();
    this.useAnim = 0.5;
    this.sound.use(k);
    if (k === 'agua') {
      this.sanity = Math.min(100, this.sanity + 35);
      this.health = Math.min(100, this.health + 5);
    } else if (k === 'pila') {
      this.battery = Math.min(100, this.battery + 50);
    } else if (k === 'barrita') {
      this.stamina = 100;
      this.exhausted = false;
      this.boost = 15;
    } else {
      this.health = Math.min(100, this.health + 40);
    }
    this.hud.notice(`${ITEM_INFO[k].name}: ${ITEM_INFO[k].hint.toLowerCase()}.`);
    this.refreshInventory();
  }

  // ---------------------------------------------------------------- bucle

  private tick = () => {
    if (!this.running) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.time += dt;
    this.updateFlicker(dt);
    this.damage = Math.max(0, this.damage - dt * 0.8);
    this.shake = Math.max(0, this.shake - dt);

    if (this.level) {
      if (this.dead > 0) this.updateDead(dt);
      else this.updateAlive(dt);
      this.updateOthers(dt);
      const target = this.blackoutLevels.includes(this.pose.level) ? 1 : 0;
      const b = lightUniforms.uBlackout;
      b.value += (target - b.value) * Math.min(1, dt * (target ? 6 : 2)) * (target && Math.random() < 0.3 ? 0.2 : 1);
      this.level.update(this.time, lightUniforms.uFlicker.value, b.value);
    }
    this.pressed.clear();
    this.updateTorches();
    this.countFps();
    const insanity = this.level ? Math.max(0, 1 - this.sanity / 45) : 0;
    this.post.render(this.time, insanity, this.damage);
  };

  private torchDir = new THREE.Vector3();

  /** Pasa al shader las linternas encendidas: la propia y las de los compañeros. */
  private updateTorches() {
    const { uTorchPos, uTorchDir, uTorchPower } = lightUniforms;
    let n = 0;
    if (this.level && this.dead <= 0 && this.torchPower > 0) {
      this.camera.getWorldDirection(this.torchDir);
      uTorchPos.value[0].copy(this.camera.position);
      uTorchDir.value[0].copy(this.torchDir);
      uTorchPower.value[0] = this.torchPower;
      n = 1;
    }
    for (const r of this.remotes.values()) {
      if (n >= MAX_TORCHES) break;
      if (!r.target.light || r.target.level !== this.pose.level || r.target.dead) continue;
      const g = r.model.group.position;
      const ry = r.model.group.rotation.y;
      uTorchPos.value[n].set(g.x, g.y + 1.35, g.z);
      uTorchDir.value[n].set(-Math.sin(ry), -0.15, -Math.cos(ry)).normalize();
      uTorchPower.value[n] = TORCH_POWER;
      n++;
    }
    for (let i = n; i < MAX_TORCHES; i++) uTorchPower.value[i] = 0;
  }

  private countFps() {
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsTime >= 500) {
      this.hud.setFps(Math.round((this.fpsFrames * 1000) / (now - this.fpsTime)));
      this.fpsFrames = 0;
      this.fpsTime = now;
    }
  }

  private updateFlicker(dt: number) {
    let f = 0.9 + 0.1 * Math.sin(this.time * 41) * Math.sin(this.time * 13.7);
    if (Math.random() < dt * 0.6) this.flickerOut = 0.05 + Math.random() * 0.25;
    if (this.flickerOut > 0) {
      this.flickerOut -= dt;
      f *= Math.random() < 0.5 ? 0.05 : 0.4;
    }
    lightUniforms.uFlicker.value = f;
  }

  private updateDead(dt: number) {
    this.dead -= dt;
    this.camera.position.y = Math.max(this.pose.y + 0.3, this.camera.position.y - dt * 2);
    this.camera.rotation.z = Math.min(1.2, this.camera.rotation.z + dt);
    if (this.dead <= 0) {
      this.hud.showDeath(null);
      this.health = 70;
      this.sanity = 60;
      this.stamina = 100;
      this.exhausted = false;
      this.pose.dead = false;
      this.enterLevel(this.pose.level);
    }
  }

  private die(reason: string) {
    if (this.dead > 0) return;
    const [mine, theirs] = DEATH_TEXT[reason] ?? DEATH_TEXT.cordura;
    this.dead = RESPAWN_TIME;
    this.damage = 1;
    this.pose.dead = true;
    this.setLight(false);
    this.sound.scream();
    this.hud.setPrompt(null);
    this.hud.showDeath(mine);
    this.send({ t: 'died', reason: theirs });
    this.sendPose();
  }

  private updateAlive(dt: number) {
    const map = this.level!.map;
    const L = map.def;
    const k = this.keys;

    // ---- movimiento horizontal ----
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const moving = fwd !== 0 || side !== 0;
    const wantSprint = moving && (k.has('ShiftLeft') || k.has('ShiftRight'));
    const sprinting = wantSprint && !this.exhausted && this.stamina > 0;
    this.boost = Math.max(0, this.boost - dt);
    if (sprinting && this.boost <= 0) this.stamina -= 22 * dt;
    else if (!sprinting) this.stamina += 12 * L.staminaRegen * dt * (moving ? 0.7 : 1);
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0, 100);
    // al vaciarse la energía no se puede volver a correr hasta recuperar la mitad
    if (this.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && this.stamina >= 50) this.exhausted = false;
    this.pose.sprint = sprinting;

    if (moving) {
      const len = Math.hypot(fwd, side);
      const speed = (sprinting ? SPRINT : WALK) * (this.onGround ? 1 : 0.85) * dt;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = ((-sin * fwd + cos * side) / len) * speed;
      const dz = ((-cos * fwd - sin * side) / len) * speed;
      const p = collide(map, this.pose.x + dx, this.pose.z + dz, this.pose.y, RADIUS);
      const moved = Math.hypot(p.x - this.pose.x, p.z - this.pose.z);
      this.pose.x = p.x;
      this.pose.z = p.z;
      if (this.onGround) {
        this.bob += moved * 2.4;
        this.stepDist += moved;
        if (this.stepDist > (sprinting ? 1.6 : 1.3)) {
          this.stepDist = 0;
          this.sound.step(this.pose.level);
        }
      }
    }
    this.pose.ry = this.yaw;

    // ---- vertical: escalones, saltos y caídas ----
    const g = floorAt(map, this.pose.x, this.pose.z);
    if (this.onGround && g <= this.pose.y && this.pose.y - g < STEP && this.vy <= 0) {
      this.pose.y = g; // bajar escaleras y rampas pegado al suelo
    } else if (g > this.pose.y && g - this.pose.y <= STEP + 0.05) {
      this.pose.y = g; // subir un escalón
      this.vy = Math.max(0, this.vy);
    } else {
      this.vy -= GRAVITY * dt;
      this.pose.y += this.vy * dt;
      if (this.pose.y <= g) {
        if (this.vy < -8.5) {
          const dmg = Math.round((-this.vy - 8.5) * 9);
          this.health -= dmg;
          this.damage = Math.min(1, this.damage + 0.5);
          this.sound.thud();
          if (this.health <= 0) return this.die('caida');
        } else if (this.vy < -3) this.sound.step(this.pose.level);
        this.pose.y = g;
        this.vy = 0;
      }
    }
    this.onGround = this.pose.y <= g + 0.001;
    const ceil = ceilAt(map, this.pose.x, this.pose.z);
    if (this.pose.y + PLAYER_HEIGHT > ceil && this.vy > 0) this.vy = 0;
    if (this.onGround && this.pressed.has('Space')) this.vy = JUMP;
    if (this.pose.y < VOID_Y) return this.fallThrough();

    // ---- linterna ----
    if (this.pressed.has('KeyF')) {
      this.sound.click();
      this.setLight(!this.pose.light && this.battery > 0);
    }
    if (this.pose.light) {
      this.battery = Math.max(0, this.battery - 1.1 * dt);
      if (this.battery === 0) this.setLight(false);
      // con poca pila la linterna falla
      else if (this.battery < 15) this.torchPower = Math.random() < 0.1 ? 0.2 : TORCH_POWER;
    }

    // ---- objetos ----
    if (this.pressed.has('Use') || this.pressed.has('KeyQ')) this.useItem();
    this.useAnim = Math.max(0, this.useAnim - dt);

    // ---- criaturas cerca ----
    let smiler = 0;
    let hound = 0;
    let stealer = 0;
    for (const e of this.enemies.values()) {
      if (e.target.level !== this.pose.level) continue;
      const pos = e.model.group.position;
      const d = Math.hypot(pos.x - this.pose.x, pos.z - this.pose.z);
      const near = Math.max(0, 1 - d / 22);
      if (e.target.kind === 'smiler') smiler = Math.max(smiler, near);
      if (e.target.kind === 'hound') hound = Math.max(hound, near * (e.target.anim >= 2 ? 1 : 0.4));
      if (e.target.kind === 'skinstealer') stealer = Math.max(stealer, near);
    }
    const threat = Math.max(smiler, hound, stealer);

    // ---- cordura y salud ----
    const dark = isDarkAt(map, this.pose.x, this.pose.z) || lightUniforms.uBlackout.value > 0.5;
    const company = this.others.some((p) => p.level === this.pose.level && !p.dead && Math.hypot(p.x - this.pose.x, p.z - this.pose.z) < 8);
    let drain = L.sanityDrain * (dark && !this.pose.light ? 3 : dark ? 1.8 : 1) + threat * 3;
    if (company) drain *= 0.5;
    this.sanity = Math.max(0, this.sanity - drain * dt);
    if (this.sanity === 0) {
      // sin cordura, el cuerpo empieza a fallar
      this.health -= 4 * dt;
      if (this.health <= 0) return this.die('cordura');
    }
    if (this.level!.steamAt(this.time, this.pose.x, this.pose.y, this.pose.z)) {
      this.health -= 15 * dt;
      this.damage = Math.min(1, this.damage + dt);
      this.hurtSound -= dt;
      if (this.hurtSound <= 0) {
        this.hurtSound = 0.6;
        this.sound.hiss();
      }
      if (this.health <= 0) return this.die('vapor');
    }

    // ---- glitches que se pueden atravesar ----
    for (const gl of map.glitches) {
      if (gl.noclip && Math.hypot(gl.x - this.pose.x, gl.z - this.pose.z) < 0.7 && Math.abs(gl.y - this.pose.y - 1) < 1.5) {
        this.sound.glitch();
        this.damage = 0.6;
        this.hud.notice('Has hecho noclip a través de la pared…');
        return this.enterLevel(this.pose.level + 1);
      }
    }

    this.updateInteraction();

    // ---- cámara y manos ----
    const insanity = Math.max(0, 1 - this.sanity / 40);
    const bobY = moving && this.onGround ? Math.sin(this.bob) * 0.04 : 0;
    const targetEye = this.pose.y + EYE;
    this.eyeY = targetEye > this.eyeY ? this.eyeY + (targetEye - this.eyeY) * Math.min(1, dt * 14) : targetEye;
    const sx = (Math.random() - 0.5) * this.shake * 0.1;
    this.camera.position.set(this.pose.x + sx, this.eyeY + bobY, this.pose.z);
    // con poca cordura la cámara se inclina un poco y el zoom respira, sin tocar hacia dónde miras
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * this.shake * 0.05, this.yaw, Math.sin(this.time * 0.9) * 0.02 * insanity);
    const fov = this.settings.fov + Math.sin(this.time * 1.3) * 2 * insanity + (sprinting ? 4 : 0);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }
    this.torch.group.position.set(0.17 + (moving ? Math.cos(this.bob * 0.5) * 0.012 : 0), -0.17 - bobY * 0.4 + Math.sin(this.time * 1.5) * 0.003, -0.38);
    const lift = Math.sin(Math.min(1, this.useAnim / 0.5) * Math.PI);
    this.held.position.set(-0.19 + lift * 0.08, -0.2 - bobY * 0.4 + lift * 0.12, -0.38 + lift * 0.06);
    this.held.rotation.x = lift * 0.9;

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.hud.bars(this.health, this.sanity, this.stamina, this.battery, this.exhausted);
    }
    this.sound.update(lightUniforms.uFlicker.value * (1 - lightUniforms.uBlackout.value), smiler, hound, stealer, insanity, dark);

    this.sendAccum += dt;
    if (this.sendAccum >= 0.05) {
      this.sendAccum = 0;
      this.sendPose();
    }
  }

  /** Caer por un agujero: se atraviesa el suelo hacia el nivel siguiente. */
  private fallThrough() {
    this.sound.glitch();
    this.damage = 0.8;
    this.health = Math.max(5, this.health - 10);
    this.hud.notice('Has caído a través del suelo…');
    this.enterLevel(Math.min(this.pose.level + 1, ESCAPED));
  }

  private updateInteraction() {
    const map = this.level!.map;
    const near = (o: { x: number; y: number; z: number }, r: number) => Math.hypot(o.x - this.pose.x, o.z - this.pose.z) < r && Math.abs(o.y - this.pose.y) < 1.4;
    const item = map.items.find((i) => !this.picked.has(i.key) && near(i, 1.4));
    const crate = map.crates.find((c) => !this.picked.has(c.key) && near(c, 1.5));
    const exit = map.exits.find((e) => near(e, 1.5));
    const last = this.pose.level === LEVELS.length - 1;
    let prompt: string | null = null;
    if (exit) prompt = last ? '[E] Abrir la puerta… ¿será la última?' : `[E] ${exit.label}`;
    else if (crate) prompt = '[E] Abrir la caja de suministros';
    else if (item) prompt = this.inventory.fits(item.kind) ? `[E] Coger ${ITEM_INFO[item.kind].name.toLowerCase()}` : 'Inventario lleno';
    this.hud.setPrompt(prompt);
    if (!this.pressed.has('KeyE')) return;
    if (exit) {
      this.hud.setPrompt(null);
      this.sound.door();
      this.enterLevel(this.pose.level + 1);
    } else if (crate) {
      this.sound.crate();
      this.send({ t: 'pickup', key: crate.key });
    } else if (item && this.inventory.fits(item.kind)) {
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
      g.position.y += (r.target.y - g.position.y) * k;
      const v = Math.hypot(g.position.x - px, g.position.z - pz) / Math.max(dt, 1e-3);
      r.speed += (v - r.speed) * Math.min(1, dt * 8);
      let diff = r.target.ry - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * k;
      r.model.animate(dt, r.speed);
    }
    for (const e of this.enemies.values()) {
      const g = e.model.group;
      g.position.x += (e.target.x - g.position.x) * k;
      g.position.z += (e.target.z - g.position.z) * k;
      g.position.y = this.floorY(g.position.x, g.position.z);
      let diff = e.target.ry - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * k;
      e.model.animate(dt, this.time, e.target.anim);
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
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.stopSettings();
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.hud.show(false);
    this.hud.showDeath(null);
    this.hud.showLock(false);
  }
}
