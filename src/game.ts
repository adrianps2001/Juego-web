import * as THREE from 'three';
import type { PlayerState, Pose } from './protocol';

const ARENA_HALF = 24;
const MOVE_SPEED = 7;
const JUMP_SPEED = 7;
const GRAVITY = 20;

interface Avatar {
  group: THREE.Group;
  target: Pose;
}

/** Generador pseudoaleatorio con semilla: todos ven el mismo escenario. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.roundRect(0, 8, 256, 48, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }),
  );
  sprite.scale.set(2, 0.5, 1);
  sprite.position.y = 2.4;
  return sprite;
}

function makeAvatar(state: PlayerState): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: state.color, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 6, 16), material);
  body.position.y = 0.9;
  body.castShadow = true;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.2 }),
  );
  visor.position.set(0, 1.45, 0.38);
  group.add(body, visor, makeLabel(state.name));
  return group;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  private timer = new THREE.Timer();
  private avatars = new Map<string, Avatar>();
  private obstacles: THREE.Box3[] = [];
  private keys = new Set<string>();
  private camYaw = 0;
  private camPitch = 0.35;
  private velY = 0;
  private sendAccum = 0;
  private me: PlayerState;
  private running = true;

  constructor(
    container: HTMLElement,
    me: PlayerState,
    private sendPose: (pose: Pose) => void,
  ) {
    this.me = me;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.buildWorld();
    this.avatars.set(me.id, { group: makeAvatar(me), target: me });
    this.scene.add(this.avatars.get(me.id)!.group);

    this.bindInput();
    this.resize();
    window.addEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(this.tick);
  }

  private buildWorld() {
    this.scene.background = new THREE.Color(0x87b5e5);
    this.scene.fog = new THREE.Fog(0x87b5e5, 40, 90);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556b2f, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(15, 25, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 80 });
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(ARENA_HALF * 2, ARENA_HALF, 0x000000, 0x000000);
    (grid.material as THREE.Material).opacity = 0.12;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.01;
    this.scene.add(grid);

    const rand = seeded(42);
    const palette = [0xd9a066, 0xa0522d, 0x8e7cc3, 0x76a5af];
    for (let i = 0; i < 18; i++) {
      const w = 1 + rand() * 3;
      const h = 0.6 + rand() * 2.5;
      const d = 1 + rand() * 3;
      const x = (rand() - 0.5) * (ARENA_HALF * 2 - 6);
      const z = (rand() - 0.5) * (ARENA_HALF * 2 - 6);
      if (Math.hypot(x, z) < 5) continue; // deja libre el centro (zona de aparición)
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.7 }),
      );
      box.position.set(x, h / 2, z);
      box.castShadow = box.receiveShadow = true;
      this.scene.add(box);
      this.obstacles.push(new THREE.Box3().setFromObject(box));
    }
  }

  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => canvas.requestPointerLock());
    document.addEventListener('mousemove', this.onMouseMove);
  }

  private onKeyDown = (e: KeyboardEvent) => this.keys.add(e.code);
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    this.camYaw -= e.movementX * 0.0025;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + e.movementY * 0.0025, -0.2, 1.2);
  };

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement.parentElement!;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** Aplica el estado recibido de la red. */
  applySnapshot(players: PlayerState[]) {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      if (p.id === this.me.id) continue;
      let avatar = this.avatars.get(p.id);
      if (!avatar) {
        avatar = { group: makeAvatar(p), target: { ...p } };
        avatar.group.position.set(p.x, p.y, p.z);
        this.avatars.set(p.id, avatar);
        this.scene.add(avatar.group);
      }
      Object.assign(avatar.target, { x: p.x, y: p.y, z: p.z, ry: p.ry });
    }
    for (const [id, avatar] of this.avatars) {
      if (id !== this.me.id && !seen.has(id)) {
        this.scene.remove(avatar.group);
        this.avatars.delete(id);
      }
    }
  }

  private collides(x: number, y: number, z: number): boolean {
    const r = 0.45;
    const box = new THREE.Box3(new THREE.Vector3(x - r, y, z - r), new THREE.Vector3(x + r, y + 1.8, z + r));
    return this.obstacles.some((o) => o.intersectsBox(box));
  }

  /** Altura del suelo bajo el jugador (suelo o techo de una caja). */
  private groundHeight(x: number, y: number, z: number): number {
    let h = 0;
    for (const o of this.obstacles) {
      if (x > o.min.x - 0.3 && x < o.max.x + 0.3 && z > o.min.z - 0.3 && z < o.max.z + 0.3 && y >= o.max.y - 0.25) {
        h = Math.max(h, o.max.y);
      }
    }
    return h;
  }

  private updateLocal(dt: number) {
    const me = this.me;
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const right = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);

    if (forward || right) {
      const angle = Math.atan2(-right, forward) + this.camYaw;
      const dx = -Math.sin(angle) * MOVE_SPEED * dt;
      const dz = -Math.cos(angle) * MOVE_SPEED * dt;
      const lim = ARENA_HALF - 0.5;
      const nx = THREE.MathUtils.clamp(me.x + dx, -lim, lim);
      const nz = THREE.MathUtils.clamp(me.z + dz, -lim, lim);
      if (!this.collides(nx, me.y + 0.05, me.z)) me.x = nx;
      if (!this.collides(me.x, me.y + 0.05, nz)) me.z = nz;
      me.ry = angle + Math.PI;
    }

    const floor = this.groundHeight(me.x, me.y, me.z);
    const onGround = me.y <= floor + 0.001;
    if (onGround && this.keys.has('Space')) this.velY = JUMP_SPEED;
    this.velY -= GRAVITY * dt;
    me.y += this.velY * dt;
    if (me.y <= floor) {
      me.y = floor;
      this.velY = 0;
    }

    const avatar = this.avatars.get(me.id)!;
    avatar.group.position.set(me.x, me.y, me.z);
    avatar.group.rotation.y = me.ry;

    // cámara en tercera persona
    const dist = 7;
    const target = new THREE.Vector3(me.x, me.y + 1.5, me.z);
    this.camera.position.set(
      target.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist,
      target.y + Math.sin(this.camPitch) * dist,
      target.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist,
    );
    this.camera.lookAt(target);

    this.sendAccum += dt;
    if (this.sendAccum >= 0.05) {
      this.sendAccum = 0;
      this.sendPose({ x: me.x, y: me.y, z: me.z, ry: me.ry });
    }
  }

  private updateRemote(dt: number) {
    const k = 1 - Math.exp(-12 * dt); // interpolación suave
    for (const [id, a] of this.avatars) {
      if (id === this.me.id) continue;
      const pos = a.group.position;
      pos.x += (a.target.x - pos.x) * k;
      pos.y += (a.target.y - pos.y) * k;
      pos.z += (a.target.z - pos.z) * k;
      let diff = a.target.ry - a.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.group.rotation.y += diff * k;
    }
  }

  private tick = () => {
    if (!this.running) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.updateLocal(dt);
    this.updateRemote(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
