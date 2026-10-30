import * as THREE from 'three';
import type { Hud } from './hud';
import { ITEM_INFO, Inventory } from './inventory';
import { Level3D } from './level3d';
import { loadThemeTextures, themeReady } from './textures';
import { ESCAPED, LEVELS, getMap } from './levels';
import { MAX_TORCHES, lightUniforms } from './lighting';
import { Anim, makeBattery, makeBottle, makeCan, makeEnemy, makeEnergyBar, makeFlareStick, makeHumanoid, makeLitFlare, makeMedkit, makeViewTorch, type EnemyModel, type Humanoid } from './models';
import { Post } from './post';
import { Screamer, type ScreamerKind } from './screamer';
import type { ClientMessage, EntityState, Flare, HostMessage, PlayerState, Pose } from './protocol';
import { getSettings, onSettings, type Settings } from './settings';
import type { Sound } from './sound';
import { F_DEEP, PLAYER_HEIGHT, STEP, cellOf, ceilOver, collideAll, flagsAt, floorUnder, gridAt, inZone, isDarkAll, setShift, type EntityKind, type ItemKind } from './world';

const EYE = 1.6;
const RADIUS = 0.3;
const WALK = 3.2;
const SPRINT = 5.6;
const CROUCH = 1.5;
const CROUCH_EYE = 1.0;
const GRAVITY = 20;
const JUMP = 4.6;
const RESPAWN_TIME = 4;
const TORCH_POWER = 1.6;
const MOUSE_SPEED = 0.0022;
// se dibuja a media resolución: se ve algo más borroso pero va fluido. Si el
// equipo no llega a ~40 FPS, la resolución baja sola (hasta MIN_PIXEL_RATIO)
const PIXEL_RATIO = 0.5;
const MIN_PIXEL_RATIO = 0.3;
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
  vx: number; // velocidad estimada entre actualizaciones (para anticipar)
  vz: number;
  at: number; // cuándo llegó la última actualización
}

type StateMsg = Extract<HostMessage, { t: 'state' }>;

const DEATH_TEXT: Record<string, [string, string]> = {
  smiler: ['Un Smiler te ha atrapado en la oscuridad.', 'ha sido atrapado por un Smiler'],
  hound: ['Un Hound te ha despedazado.', 'ha sido despedazado por un Hound'],
  faceling: ['Un Faceling te ha matado a golpes.', 'ha muerto a manos de un Faceling'],
  skinstealer: ['El Skin-Stealer te ha alcanzado.', 'ha sido alcanzado por un Skin-Stealer'],
  cordura: ['Has perdido la cordura.', 'ha perdido la cordura'],
  caida: ['La caída ha sido demasiado alta.', 'se ha matado en una caída'],
  vapor: ['El vapor te ha abrasado.', 'ha muerto abrasado por el vapor'],
  clump: ['Un Clump te ha aplastado.', 'ha sido aplastado por un Clump'],
  duller: ['Algo salió de la pared y te arrastró dentro.', 'ha sido arrastrado dentro de una pared'],
  figure: ['La figura ya no estaba lejos.', 'ha desaparecido en la oscuridad'],
  pozo: ['Has caído por un agujero. Nadie ha vuelto de ahí.', 'ha caído por uno de los agujeros del Nivel 0'],
  trabajador: ['Los trabajadores sombra no paran por nadie.', 'ha muerto en el sector en obras'],
  cristales: ['Te has desangrado con los cristales.', 'se ha desangrado'],
};

const HIT_TEXT: Record<EntityKind, string> = {
  smiler: '¡Un Smiler te ha atacado!',
  hound: '¡Un Hound te ha mordido!',
  faceling: '¡Un Faceling te ha golpeado!',
  skinstealer: '¡El Skin-Stealer te ha desgarrado!',
  clump: '¡Un Clump se te ha echado encima!',
  duller: '¡Algo te ha agarrado desde la pared!',
  figure: 'Una figura oscura te ha tocado…',
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
  private circuitLevels: number[] = [];
  private closedShifts = new Set<string>();
  private flares = new Map<number, { data: Flare; model: ReturnType<typeof makeLitFlare> }>();
  private crouching = false;
  private shoutCool = 0;
  private shoutSend = false;
  private noteKey: string | null = null;
  private npcTalk = new Map<object, number>();
  private bumpCool = 0;
  private windowCool = 20;
  private humTimer = 30;
  private screamer = new Screamer();
  private screamCool = 0;
  private phantomCool = 120;
  private warnCool = 0;
  private zoneNow = '';
  private prevX = 0;

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
  private pixelRatio = PIXEL_RATIO;
  private levelToken = 0;
  private lastFloor = 0; // último suelo pisado (para saber si se cae a un agujero)
  private loopWraps = 0;
  private frameAvg = 1 / 60;
  private resClock = 3;

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
    this.pose = { level: 0, x: spawn.x, y: 0, z: spawn.z, ry: 0, light: false, sprint: false, crouch: false, noise: 0, shout: false, dead: false };

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
    // precarga las texturas de los demás niveles en segundo plano
    for (const L of LEVELS) void loadThemeTextures(L.theme);
    this.refreshInventory();
    this.renderer.setAnimationLoop(this.tick);
  }

  // ---------------------------------------------------------------- red

  onState(msg: StateMsg) {
    const { players, entities, blackout } = msg;
    this.circuitLevels = msg.circuits;
    this.applyShifts(msg.shifts);
    this.syncFlares(msg.flares);
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
      r.model.group.visible = this.canSee(p);
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
        en = { model: makeEnemy(e.kind, e.id), target: e, vx: 0, vz: 0, at: performance.now() };
        en.model.group.position.set(e.x, e.y, e.z);
        en.model.group.rotation.y = e.ry;
        this.enemies.set(e.id, en);
        this.scene.add(en.model.group);
      }
      const now = performance.now();
      const gap = Math.max(0.02, (now - en.at) / 1000);
      const jump = Math.hypot(e.x - en.target.x, e.z - en.target.z);
      // velocidad suavizada; un salto grande (aparece, sale de una pared) no cuenta
      const vx = jump < 2 ? (e.x - en.target.x) / gap : 0;
      const vz = jump < 2 ? (e.z - en.target.z) / gap : 0;
      en.vx += (vx - en.vx) * 0.5;
      en.vz += (vz - en.vz) * 0.5;
      en.at = now;
      if (jump >= 2) en.model.group.position.set(e.x, e.y, e.z);
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

  onPicked(key: string, by: string, items?: ItemKind[], junk?: string, hurt?: number) {
    this.picked.add(key);
    this.level?.removeItem(key);
    if (by !== this.myId) return;
    const level = Number(key.split(':')[0]);
    const map = getMap(level);
    const item = map.items.find((i) => i.key === key);
    const crate = map.crates.find((c) => c.key === key);
    const got = item ? [item.kind] : (items ?? []);
    const lost: ItemKind[] = [];
    for (const kind of got) if (!this.inventory.add(kind)) lost.push(kind);
    if (got.length) this.sound.pickup();
    if (crate) {
      const parts = got.map((k) => ITEM_INFO[k].name);
      if (junk) parts.push(junk);
      this.hud.notice(`Caja: ${parts.length ? parts.join(', ') : 'vacía'}.`);
      if (hurt) {
        this.health -= hurt;
        this.damage = Math.min(1, this.damage + 0.4);
        this.sound.hurt('cristales');
        this.hud.notice('¡Te has cortado con los cristales!');
        if (this.health <= 0) this.die('cristales');
      }
    } else if (item) this.hud.notice(`Has cogido: ${ITEM_INFO[item.kind].name}.`);
    if (lost.length) this.hud.notice(`No te caben en el inventario: ${lost.map((k) => ITEM_INFO[k].name).join(', ')}.`);
    this.refreshInventory();
  }

  /** Tras un Parpadeo, algunas cajas vuelven a estar llenas. */
  onRestock(keys: string[]) {
    for (const k of keys) {
      this.picked.delete(k);
      this.level?.restoreCrate(k);
    }
  }

  /** Una criatura dice algo (el Skin-Stealer imitando voces). */
  onSay(id: number, text: string) {
    const e = this.enemies.get(id);
    if (!e || e.target.level !== this.pose.level || !this.level) return;
    const p = e.model.group.position;
    const d = Math.hypot(p.x - this.pose.x, p.z - this.pose.z);
    if (d > 16) return;
    this.hud.say(`«${text}»`);
    this.sound.voice(text, 0.3 * (1 - d / 18), this.panOf(p.x, p.z));
  }

  /** -1 izquierda, 1 derecha: de qué lado suena algo. */
  private panOf(x: number, z: number): number {
    const a = Math.atan2(x - this.pose.x, z - this.pose.z);
    // hacia dónde mira la cámara: (-sin yaw, -cos yaw)
    return Math.sin(a - (this.yaw + Math.PI)) * -1;
  }

  private canSee(p: PlayerState): boolean {
    return p.level === this.pose.level && !p.dead;
  }

  private applyShifts(list: string[]) {
    this.closedShifts = new Set(list);
    if (!this.level) return;
    const map = this.level.map;
    for (const sh of map.shifts) {
      const closed = this.closedShifts.has(`${this.pose.level}:${sh.id}`);
      // en el anfitrión el mapa ya lo ha cambiado la autoridad: se compara con lo que se ve
      if (closed !== sh.closed) setShift(map, sh.id, closed);
      if (closed !== this.level.shiftShown(sh.id)) this.level.setShiftVisible(sh.id, closed);
    }
  }

  private syncFlares(list: Flare[]) {
    for (const f of list) {
      let fl = this.flares.get(f.id);
      if (!fl) {
        fl = { data: f, model: makeLitFlare() };
        fl.model.group.position.set(f.x, f.y, f.z);
        fl.model.group.rotation.y = f.id;
        this.scene.add(fl.model.group);
        this.flares.set(f.id, fl);
      }
      fl.data = f;
      fl.model.group.visible = f.level === this.pose.level;
    }
    for (const [id, fl] of this.flares) {
      if (list.some((f) => f.id === id)) continue;
      this.scene.remove(fl.model.group);
      this.flares.delete(id);
    }
  }

  onHit(damage: number, kind: EntityKind) {
    if (this.dead > 0 || !this.level) return;
    this.health -= damage;
    this.damage = Math.min(1, this.damage + 0.4 + damage / 100);
    this.shake = 0.4;
    this.sound.hurt(kind);
    this.hud.notice(HIT_TEXT[kind]);
    this.scare(kind === 'smiler' || kind === 'hound' || kind === 'skinstealer' ? kind : 'face');
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
      this.levelToken++;
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
      this.pose.x = map.spawn.x + (Math.random() - 0.5) * 0.6;
      this.pose.z = map.spawn.z + (Math.random() - 0.5) * 0.6;
      this.pose.y = map.spawn.y;
      this.yaw = (map.spawn as { ry?: number }).ry ?? this.yaw;
    }
    this.pose.y = floorUnder(map, this.pose.x, this.pose.z, this.pose.y + 0.5);
    this.eyeY = this.pose.y + EYE;
    this.vy = 0;
    this.scene.background = new THREE.Color(L.fog.color);
    this.scene.fog = new THREE.Fog(L.fog.color, L.fog.near, L.fog.far);
    // más allá de la niebla no se ve nada: no hace falta dibujarlo
    this.camera.far = L.fog.far + 4;
    this.camera.updateProjectionMatrix();
    this.zoneNow = '';
    this.noteKey = null;
    this.hud.showNote(null);
    this.sendPose();
    // las texturas se generan en otro hilo (normalmente ya están precargadas)
    const token = ++this.levelToken;
    const build = () => {
      if (token !== this.levelToken || !this.running) return;
      this.level = new Level3D(map, this.picked);
      this.scene.add(this.level.group);
      this.applyShifts([...this.closedShifts]);
      for (const fl of this.flares.values()) fl.model.group.visible = fl.data.level === level;
    };
    if (themeReady(L.theme)) build();
    else void loadThemeTextures(L.theme).then(build);
  }

  /** Tras escapar: volver a empezar desde el Nivel 0. */
  reenter() {
    this.sanity = 100;
    this.health = 100;
    this.battery = 100;
    this.enterLevel(0);
  }

  floorY(x: number, z: number, y = Infinity): number {
    if (!this.level) return 0;
    const f = floorUnder(this.level.map, x, z, y);
    return Number.isFinite(f) ? f : 0;
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
    // Ctrl+W cerraría la pestaña: con Ctrl solo se agacha
    if (e.code === 'ControlLeft' && this.locked()) e.preventDefault();
    const n = Number(e.key);
    if (n >= 1 && n <= this.inventory.used) this.select(n - 1);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseDown = (e: MouseEvent) => {
    if (this.locked() && e.button === 0) this.pressed.add('Use');
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.locked()) return;
    const n = this.inventory.used;
    if (n === 0) return;
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
    const model = kind === 'agua' ? makeBottle() : kind === 'pila' ? makeBattery() : kind === 'barrita' ? makeEnergyBar() : kind === 'lata' ? makeCan() : kind === 'bengala' ? makeFlareStick() : makeMedkit();
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
    if (k === 'bengala' && !this.throwFlare()) return this.hud.notice('Aquí no hay sitio para lanzarla.');
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
    } else if (k === 'lata') {
      this.health = Math.min(100, this.health + 25);
      this.stamina = Math.min(100, this.stamina + 30);
    } else if (k === 'bengala') {
      // ya lanzada
    } else {
      this.health = Math.min(100, this.health + 40);
    }
    this.hud.notice(`${ITEM_INFO[k].name}: ${ITEM_INFO[k].hint.toLowerCase()}.`);
    this.refreshInventory();
  }

  /** Lanza una bengala unos metros por delante: atrae a los Smilers. */
  private throwFlare(): boolean {
    const map = this.level!.map;
    let x = this.pose.x;
    let z = this.pose.z;
    const dx = -Math.sin(this.yaw);
    const dz = -Math.cos(this.yaw);
    for (let d = 0; d < 6; d += 0.25) {
      const nx = this.pose.x + dx * d;
      const nz = this.pose.z + dz * d;
      const c = collideAll(map, nx, nz, this.pose.y, 0.15, 0.3);
      if (Math.hypot(c.x - nx, c.z - nz) > 0.01) break;
      x = nx;
      z = nz;
    }
    if (Math.hypot(x - this.pose.x, z - this.pose.z) < 0.5) return false;
    const y = floorUnder(map, x, z, this.pose.y + 0.3);
    this.send({ t: 'flare', level: this.pose.level, x, y: Number.isFinite(y) ? y : this.pose.y, z });
    return true;
  }

  // ---------------------------------------------------------------- bucle

  private tick = () => {
    if (!this.running) return;
    this.timer.update();
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 0.05);
    this.adaptResolution(raw);
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
      // circuito fundido (Nivel 2): los fluorescentes en serie se apagan a la vez
      const c = lightUniforms.uCircuit;
      const ct = this.circuitLevels.includes(this.pose.level) ? 0 : 1;
      if (ct !== Math.round(c.value) && Math.abs(ct - c.value) > 0.5 && ct === 0) this.sound.clunk();
      c.value += (ct - c.value) * Math.min(1, dt * (ct ? 1.5 : 8));
      this.level.update(this.time, lightUniforms.uFlicker.value * c.value, b.value, dt, this.pose.light && this.dead <= 0 ? this.camera.position : null, this.pose);
      for (const fl of this.flares.values()) fl.model.update(this.time, fl.data.left);
    }
    this.pressed.clear();
    this.updateTorches();
    this.countFps();
    const insanity = this.level ? Math.max(0, 1 - this.sanity / 45) : 0;
    this.post.render(this.time, insanity, this.damage);
  };

  /** Resolución dinámica: baja si los fotogramas tardan, sube si sobra tiempo. */
  private adaptResolution(raw: number) {
    if (raw > 0.25) return; // pestaña en segundo plano
    this.frameAvg += (raw - this.frameAvg) * 0.05;
    this.resClock -= raw;
    if (this.resClock > 0) return;
    this.resClock = 2;
    let r = this.pixelRatio;
    if (this.frameAvg > 1 / 40 && r > MIN_PIXEL_RATIO + 0.001) r -= 0.05;
    else if (this.frameAvg < 1 / 56 && r < PIXEL_RATIO - 0.001) r += 0.05;
    if (r === this.pixelRatio) return;
    this.pixelRatio = r;
    this.renderer.setPixelRatio(r);
    this.post.setPixelRatio(r);
    this.resize();
  }

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
    // bengalas: luz roja en todas direcciones (potencia > 2)
    for (const fl of this.flares.values()) {
      if (n >= MAX_TORCHES) break;
      if (fl.data.level !== this.pose.level) continue;
      const g = fl.model.group.position;
      uTorchPos.value[n].set(g.x, g.y + 0.25, g.z);
      uTorchPower.value[n] = 2 + Math.min(1, fl.data.left / 3) * (0.85 + Math.random() * 0.3);
      n++;
    }
    for (const r of this.remotes.values()) {
      if (n >= MAX_TORCHES) break;
      if (!r.target.light || !r.model.group.visible) continue;
      const g = r.model.group.position;
      const ry = r.model.group.rotation.y;
      uTorchPos.value[n].set(g.x, g.y + 1.35, g.z);
      uTorchDir.value[n].set(-Math.sin(ry), -0.15, -Math.cos(ry)).normalize();
      uTorchPower.value[n] = TORCH_POWER;
      n++;
    }
    for (let i = n; i < MAX_TORCHES; i++) uTorchPower.value[i] = 0;
    lightUniforms.uTorchCount.value = n;
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
      this.camera.rotation.z = 0;
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
    if (!this.scare(reason === 'smiler' || reason === 'hound' || reason === 'skinstealer' ? reason : 'face')) this.sound.scream();
    this.hud.setPrompt(null);
    this.hud.showDeath(mine);
    this.send({ t: 'died', reason: theirs });
    this.sendPose();
  }

  private updateAlive(dt: number) {
    const map = this.level!.map;
    const L = map.def;
    const k = this.keys;
    this.prevX = this.pose.x;

    // con una nota abierta no te mueves; E (o moverse) la cierra
    if (this.noteKey) {
      if (this.pressed.has('KeyE') || this.pressed.has('Escape') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((c) => this.pressed.has(c))) {
        this.noteKey = null;
        this.hud.showNote(null);
        this.pressed.delete('KeyE');
      }
    }

    // ---- agacharse ----
    const wantCrouch = k.has('KeyC') || k.has('ControlLeft');
    // no puedes levantarte si el techo es bajo
    const ceilHere = ceilOver(map, this.pose.x, this.pose.z, this.pose.y);
    this.crouching = wantCrouch || (this.crouching && ceilHere - this.pose.y < PLAYER_HEIGHT);
    this.pose.crouch = this.crouching;

    // ---- movimiento horizontal ----
    const fwd = this.noteKey ? 0 : (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = this.noteKey ? 0 : (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const moving = fwd !== 0 || side !== 0;
    const wantSprint = moving && !this.crouching && (k.has('ShiftLeft') || k.has('ShiftRight'));
    const sprinting = wantSprint && !this.exhausted && this.stamina > 0;
    this.boost = Math.max(0, this.boost - dt);
    if (sprinting && this.boost <= 0) this.stamina -= 22 * dt;
    else if (!sprinting) this.stamina += 12 * L.staminaRegen * dt * (moving ? 0.7 : 1);
    this.stamina = THREE.MathUtils.clamp(this.stamina, 0, 100);
    // al vaciarse la energía no se puede volver a correr hasta recuperar la mitad
    if (this.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && this.stamina >= 50) this.exhausted = false;
    this.pose.sprint = sprinting;
    // fluido hasta los tobillos: cuesta andar y hace ruido
    const deep = (flagsAt(gridAt(map, this.pose.x, this.pose.z, this.pose.y), cellOf(this.pose.x), cellOf(this.pose.z)) & F_DEEP) !== 0;

    if (moving) {
      const len = Math.hypot(fwd, side);
      const base = this.crouching ? CROUCH : sprinting ? SPRINT : WALK;
      const speed = base * (this.onGround ? 1 : 0.85) * (deep ? 0.6 : 1) * dt;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = ((-sin * fwd + cos * side) / len) * speed;
      const dz = ((-cos * fwd - sin * side) / len) * speed;
      const p = collideAll(map, this.pose.x + dx, this.pose.z + dz, this.pose.y, RADIUS, this.crouching ? 1.1 : PLAYER_HEIGHT);
      const moved = Math.hypot(p.x - this.pose.x, p.z - this.pose.z);
      this.pose.x = p.x;
      this.pose.z = p.z;
      if (this.onGround) {
        this.bob += moved * (this.crouching ? 1.6 : 2.4);
        this.stepDist += moved;
        if (this.stepDist > (sprinting ? 1.6 : this.crouching ? 0.9 : 1.3)) {
          this.stepDist = 0;
          if (deep) this.sound.splash();
          else this.sound.step(this.pose.level, this.crouching);
        }
      }
    }
    this.pose.ry = this.yaw;

    // ---- ruido: lo que oyen los Clumps, los Hounds y los Smilers ----
    this.shoutCool = Math.max(0, this.shoutCool - dt);
    if (this.pressed.has('KeyG') && this.shoutCool <= 0) {
      this.shoutCool = 3;
      this.shoutSend = true;
      this.sound.shout();
      this.hud.say('¡EH! ¡FUERA!', 1.5);
    }
    let noise = !moving ? 0 : this.crouching ? 0.15 : sprinting ? 1.25 : 0.5;
    if (deep && moving) noise += 0.4;
    if (this.shoutCool > 2) noise = 1.6;
    this.pose.noise = noise;

    // ---- zonas que se repiten (pasillos sin fin, Habitaciones Rojas) ----
    this.updateLoops(map);

    // ---- vertical: escalones, saltos y caídas ----
    const g = floorUnder(map, this.pose.x, this.pose.z, this.pose.y);
    if (this.onGround && g <= this.pose.y && this.pose.y - g < STEP && this.vy <= 0) {
      this.pose.y = g; // bajar escaleras y rampas pegado al suelo
    } else if (g > this.pose.y && g - this.pose.y <= STEP + 0.05) {
      this.pose.y = g; // subir un escalón
      this.vy = Math.max(0, this.vy);
    } else {
      this.vy -= GRAVITY * dt;
      this.pose.y += this.vy * dt;
      if (this.pose.y <= g) {
        // caer un piso (unos 4 m) duele un poco; mucho más, bastante
        if (this.vy < -10) {
          const dmg = Math.round((-this.vy - 10) * 6);
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
    const ceil = ceilOver(map, this.pose.x, this.pose.z, this.pose.y);
    if (this.pose.y + PLAYER_HEIGHT > ceil && this.vy > 0) this.vy = 0;
    if (this.onGround && this.pressed.has('Space') && !this.crouching) this.vy = JUMP;
    // en el Nivel 0 nadie ha sobrevivido a los agujeros
    // caer por un agujero sin fondo (no por un hueco a otra planta)
    if (!Number.isFinite(g) && this.pose.y < this.lastFloor + VOID_Y) return L.isolation ? this.die('pozo') : this.fallThrough();
    if (Number.isFinite(g) && this.onGround) this.lastFloor = g;

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
    if (!this.noteKey && (this.pressed.has('Use') || this.pressed.has('KeyQ'))) this.useItem();
    this.useAnim = Math.max(0, this.useAnim - dt);

    // ---- criaturas cerca ----
    let smiler = 0;
    let hound = 0;
    let stealer = 0;
    this.warnCool = Math.max(0, this.warnCool - dt);
    for (const e of this.enemies.values()) {
      if (e.target.level !== this.pose.level) continue;
      const pos = e.model.group.position;
      const d = Math.hypot(pos.x - this.pose.x, pos.z - this.pose.z);
      const near = Math.max(0, 1 - d / 22);
      const kind = e.target.kind;
      if (kind === 'smiler') smiler = Math.max(smiler, near);
      if (kind === 'hound') hound = Math.max(hound, near * (e.target.anim >= 2 ? 1 : 0.4));
      if (kind === 'skinstealer' && e.target.anim !== Anim.Disguise) stealer = Math.max(stealer, near);
      // un Duller a punto de salir: arañazos dentro de la pared
      if (kind === 'duller' && e.target.anim === Anim.Warn && d < 8 && this.warnCool <= 0) {
        this.warnCool = 0.8;
        this.sound.scratch(0.45 * (1 - d / 9), this.panOf(pos.x, pos.z));
        this.hud.say('Algo araña dentro de la pared, justo a tu lado…', 1.5);
      }
      if (kind === 'clump' && e.target.anim === Anim.Run && d < 14 && this.warnCool <= 0) {
        this.warnCool = 0.6;
        this.sound.gurgle(0.4 * (1 - d / 15), this.panOf(pos.x, pos.z));
      }
    }
    const threat = Math.max(smiler, hound, stealer);

    // ---- zonas: Habitaciones Rojas, el Vacío, zonas seguras ----
    const zone = inZone(map, 'void', this.pose.x, this.pose.z) ? 'void' : inZone(map, 'red', this.pose.x, this.pose.z) ? 'red' : inZone(map, 'safe', this.pose.x, this.pose.z) ? 'safe' : inZone(map, 'meeting', this.pose.x, this.pose.z) ? 'meeting' : inZone(map, 'whisper', this.pose.x, this.pose.z) ? 'whisper' : '';
    if (zone !== this.zoneNow) this.enterZone(zone);

    // ---- cordura y salud ----
    const dark = isDarkAll(map, this.pose.x, this.pose.z, this.pose.y) || lightUniforms.uBlackout.value > 0.5;
    const company = this.others.some((p) => this.canSee(p) && Math.hypot(p.x - this.pose.x, p.z - this.pose.z) < 8);
    let drain = L.sanityDrain * (dark && !this.pose.light ? 3 : dark ? 1.8 : 1) + threat * 3;
    if (zone === 'red') drain *= 2.2;
    if (zone === 'void') drain = 2.5;
    if (zone === 'whisper') drain *= 1.6;
    if (company) drain *= 0.5;
    if (zone === 'safe') drain = -1.5;
    this.sanity = THREE.MathUtils.clamp(this.sanity - drain * dt, 0, 100);
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
    if (this.updateNpcs(dt)) return;
    this.updateScares(dt, map);

    // ---- salidas a las que basta con llegar (el final de una escalera que baja) ----
    for (const e of map.exits) {
      if (e.walk && Math.hypot(e.x - this.pose.x, e.z - this.pose.z) < 1.3 && Math.abs(e.y - this.pose.y) < 1.5) return this.passExit();
    }

    this.updateInteraction();

    // ---- cámara y manos ----
    const insanity = Math.max(0, 1 - this.sanity / 40);
    const bobY = moving && this.onGround ? Math.sin(this.bob) * (this.crouching ? 0.02 : 0.04) : 0;
    const targetEye = this.pose.y + (this.crouching ? CROUCH_EYE : EYE);
    this.eyeY = targetEye > this.eyeY ? this.eyeY + (targetEye - this.eyeY) * Math.min(1, dt * 10) : Math.max(targetEye, this.eyeY - dt * 6);
    if (this.pose.y + EYE - this.eyeY > 2) this.eyeY = targetEye;
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
    this.sound.update(lightUniforms.uFlicker.value * lightUniforms.uCircuit.value * (1 - lightUniforms.uBlackout.value), smiler, hound, stealer, insanity, dark, dt);
    this.sound.setWhir(this.machineNear(map));

    this.sendAccum += dt;
    if (this.sendAccum >= 0.05) {
      this.sendAccum = 0;
      this.sendPose();
    }
  }

  /** Cercanía (0-1) de la máquina o depósito más próximo. */
  private machineNear(map: ReturnType<typeof getMap>): number {
    let best = 0;
    for (const p of map.props) {
      if (p.type !== 'machine' && p.type !== 'tank') continue;
      const d = Math.hypot(p.x - this.pose.x, p.z - this.pose.z);
      best = Math.max(best, 1 - d / 12);
    }
    return best;
  }

  /** Pasillos que se repiten: al salir por un extremo apareces en el otro. */
  private updateLoops(map: ReturnType<typeof getMap>) {
    for (const l of map.loops) {
      if (this.pose.z < l.z0 || this.pose.z > l.z1 || this.pose.x < l.x0 - 1 || this.pose.x > l.x1 + 1) continue;
      const len = l.x1 - l.x0;
      // mirar fijamente la referencia rompe la ilusión
      if (l.landmark) {
        const a = Math.atan2(l.landmark.x - this.pose.x, l.landmark.z - this.pose.z);
        const look = Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
        const diff = Math.abs(Math.atan2(Math.sin(a - look), Math.cos(a - look)));
        if (diff < 0.6 && Math.abs(this.pitch) < 0.5) continue;
      }
      const forward = l.oneWay ?? 0;
      if (this.prevX <= l.x1 && this.pose.x > l.x1 && forward >= 0) {
        this.pose.x -= len;
        this.loopTeleport(-len);
      } else if (this.prevX >= l.x0 && this.pose.x < l.x0 && forward <= 0) {
        this.pose.x += len;
        this.loopTeleport(len);
      }
    }
  }

  private loopTeleport(dx: number) {
    this.camera.position.x += dx;
    this.prevX += dx;
    this.loopWraps++;
    if (this.loopWraps === 3 && this.zoneNow === 'red') this.hud.notice('El pasillo no se acaba. Busca la pared que parpadea.');
    if (Math.random() < 0.3) this.sound.humSpike();
  }

  private enterZone(zone: string) {
    const prev = this.zoneNow;
    this.zoneNow = zone;
    const L = this.level!.map.def;
    const fog = this.scene.fog as THREE.Fog;
    if (zone === 'void') {
      fog.color.set(0x000000);
      fog.near = 0.5;
      fog.far = 9;
      (this.scene.background as THREE.Color).set(0x000000);
      this.hud.notice('No hay nada. Absolutamente nada.');
    } else if (zone === 'red') {
      // niebla roja espesa: no se ven los extremos del pasillo que se repite
      fog.color.set(0x220605);
      fog.near = 1.5;
      fog.far = 10;
      (this.scene.background as THREE.Color).set(0x220605);
    } else if (prev === 'void' || prev === 'red') {
      fog.color.set(L.fog.color);
      fog.near = L.fog.near;
      fog.far = L.fog.far;
      (this.scene.background as THREE.Color).set(L.fog.color);
    }
    if (zone === 'red' && prev !== 'red') this.hud.notice('El papel de las paredes se despega. Debajo, todo es rojo.');
    if (zone === 'safe') this.hud.notice('Zona segura: aquí no entran las entidades.');
  }

  /** Personajes de la M.E.G. y trabajadores sombra. Devuelve true si mueres. */
  private updateNpcs(dt: number): boolean {
    this.bumpCool = Math.max(0, this.bumpCool - dt);
    for (const n of this.level!.npcs) {
      if (n.def.kind !== 'worker') continue;
      const d = Math.hypot(n.x - this.pose.x, n.z - this.pose.z);
      if (d < 0.75 && this.bumpCool <= 0) {
        this.bumpCool = 1.5;
        this.health -= 12;
        this.damage = Math.min(1, this.damage + 0.4);
        this.shake = 0.3;
        // empujón
        const k = 0.6 / Math.max(d, 0.1);
        const p = collideAll(this.level!.map, this.pose.x + (this.pose.x - n.x) * k, this.pose.z + (this.pose.z - n.z) * k, this.pose.y, RADIUS);
        this.pose.x = p.x;
        this.pose.z = p.z;
        this.sound.hurt('worker');
        this.hud.notice('Un trabajador sombra te ha arrollado sin mirarte.');
        if (this.health <= 0) {
          this.die('trabajador');
          return true;
        }
      }
    }
    return false;
  }

  /** Sustos: caras en las ventanas, subidas del zumbido. */
  private updateScares(dt: number, map: ReturnType<typeof getMap>) {
    this.windowCool -= dt;
    for (const w of this.level!.windows) {
      if (w.face.visible) {
        if ((w.face.userData.left -= dt) <= 0) w.face.visible = false;
        continue;
      }
      if (this.windowCool > 0) continue;
      const d = Math.hypot(w.x - this.pose.x, w.z - this.pose.z);
      if (d > 7 || d < 1.5) continue;
      const a = Math.atan2(w.x - this.pose.x, w.z - this.pose.z);
      const look = Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
      if (Math.abs(Math.atan2(Math.sin(a - look), Math.cos(a - look))) > 0.4) continue;
      if (Math.random() > dt * 0.5) continue;
      w.face.visible = true;
      w.face.userData.left = 0.35;
      this.windowCool = 45;
      if (!this.scare('face', true)) this.sound.sting();
      this.sanity = Math.max(0, this.sanity - 12);
      this.shake = 0.25;
    }
    // alucinaciones: a oscuras y con poca cordura, a veces aparece una cara
    this.phantomCool -= dt;
    const dark = isDarkAll(map, this.pose.x, this.pose.z, this.pose.y) || lightUniforms.uBlackout.value > 0.5;
    if (this.phantomCool <= 0 && dark && this.sanity < 50 && Math.random() < dt * (0.02 + (50 - this.sanity) / 1500)) {
      this.phantomCool = 90 + Math.random() * 90;
      if (this.scare(Math.random() < 0.5 ? 'face' : 'smiler', true)) this.sanity = Math.max(0, this.sanity - 8);
    }
    // Nivel 0: el zumbido sube de golpe de vez en cuando
    if (map.def.isolation) {
      this.humTimer -= dt;
      if (this.humTimer <= 0) {
        this.humTimer = 40 + Math.random() * 60;
        this.sound.humSpike();
      }
    }
  }

  /**
   * Screamer a pantalla completa. No se repite seguido (si te muerden varias
   * veces seguidas solo salta una vez). Devuelve si ha saltado.
   */
  private scare(kind: ScreamerKind, minor = false): boolean {
    if (!this.settings.screamers || this.screamCool > performance.now() || this.screamer.active) return false;
    this.screamCool = performance.now() + (minor ? 20000 : 6000);
    this.screamer.play(kind);
    this.sound.screamer();
    this.shake = 0.6;
    return true;
  }

  /** Bajar al nivel siguiente sin pantalla de carga: un parpadeo a negro y sigues bajando. */
  private passExit() {
    this.hud.fade();
    this.sound.clunk();
    this.enterLevel(this.pose.level + 1);
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
    // solo lo que tienes delante
    const ahead = (o: { x: number; z: number }) => {
      const a = Math.atan2(o.x - this.pose.x, o.z - this.pose.z);
      const look = Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
      return Math.abs(Math.atan2(Math.sin(a - look), Math.cos(a - look))) < 1.1 || Math.hypot(o.x - this.pose.x, o.z - this.pose.z) < 0.6;
    };
    const item = map.items.find((i) => !this.picked.has(i.key) && near(i, 1.4));
    const crate = map.crates.find((c) => !this.picked.has(c.key) && near({ ...c, y: c.y + (c.shelf ? 1.2 : 0) }, 1.5));
    const exit = map.exits.find((e) => !e.walk && near(e, 1.5));
    const door = map.doors.find((d) => (d.locked || d.to) && near(d, 1.4) && ahead(d));
    const note = map.notes.find((n) => near(n, 1.4) && ahead(n));
    const npc = this.level!.npcs.find((n) => Math.hypot(n.x - this.pose.x, n.z - this.pose.z) < 1.8 && ahead(n));
    const last = this.pose.level === LEVELS.length - 1;
    let prompt: string | null = null;
    if (this.noteKey) prompt = null;
    else if (exit) prompt = last ? '[E] Abrir la puerta… ¿qué habrá más abajo?' : `[E] ${exit.label}`;
    else if (crate) prompt = '[E] Abrir la caja';
    else if (item) prompt = this.inventory.fits(item.kind) ? `[E] Coger ${ITEM_INFO[item.kind].name.toLowerCase()}` : 'Inventario lleno';
    else if (note) prompt = `[E] Leer: ${note.title}`;
    else if (npc) prompt = npc.def.kind === 'meg' ? '[E] Hablar con la patrulla de la M.E.G.' : 'Un trabajador sombra. No te mira.';
    else if (door) prompt = door.locked ? '[E] Probar la puerta' : `[E] ${door.label ?? 'Cruzar la puerta'}`;
    this.hud.setPrompt(prompt);
    if (!this.pressed.has('KeyE') || this.noteKey) return;
    if (exit) {
      this.hud.setPrompt(null);
      this.sound.door();
      this.enterLevel(this.pose.level + 1);
    } else if (crate) {
      this.sound.crate();
      this.send({ t: 'pickup', key: crate.key });
    } else if (item && this.inventory.fits(item.kind)) {
      this.send({ t: 'pickup', key: item.key });
    } else if (note) {
      this.noteKey = note.key;
      this.hud.showNote(note.title, note.text);
      this.sound.click();
    } else if (npc) {
      if (npc.def.kind === 'meg') {
        const i = this.npcTalk.get(npc) ?? 0;
        this.npcTalk.set(npc, i + 1);
        const line = npc.def.lines[i % npc.def.lines.length];
        this.hud.say(`M.E.G.: «${line}»`, 6);
        this.sound.voice(line, 0.2);
        // dan un poco de calma
        this.sanity = Math.min(100, this.sanity + 5);
      } else {
        this.hud.say(npc.def.lines[0] ?? '…', 3);
      }
    } else if (door) {
      if (door.locked) {
        this.sound.rattle();
        this.hud.notice(door.window ? 'Cerrada. Por el ventanuco solo se ve negro.' : 'Está cerrada con llave.');
      } else if (door.to) {
        this.sound.door();
        this.pose.x = door.to.x;
        this.pose.z = door.to.z;
        const tg = map.storeys[door.to.s ?? 0];
        this.pose.y = floorUnder(map, this.pose.x, this.pose.z, tg.floor[cellOf(this.pose.z) * tg.w + cellOf(this.pose.x)] + 0.5);
        this.eyeY = this.pose.y + EYE;
        this.yaw = door.to.ry + Math.PI;
        this.prevX = this.pose.x;
        this.sendPose();
      }
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
    const now = performance.now();
    for (const e of this.enemies.values()) {
      const g = e.model.group;
      // posición anticipada: la última conocida más lo que habrá avanzado desde entonces
      const ahead = Math.min(0.12, (now - e.at) / 1000);
      const tx = e.target.x + e.vx * ahead;
      const tz = e.target.z + e.vz * ahead;
      const ke = 1 - Math.exp(-14 * dt);
      g.position.x += (tx - g.position.x) * ke;
      g.position.z += (tz - g.position.z) * ke;
      g.position.y += (e.target.y - g.position.y) * ke;
      let diff = e.target.ry - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * (1 - Math.exp(-8 * dt));
      e.model.animate(dt, this.time, e.target.anim);
    }
  }

  private sendPose() {
    this.pose.shout = this.shoutSend;
    this.shoutSend = false;
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
