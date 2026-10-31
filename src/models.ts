import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial } from './lighting';
import { canvasTexture, labelTexture, smilerTexture, textTexture } from './textures';

// Modelos de personajes, criaturas y objetos, hechos con piezas simples.
// Las criaturas comparten geometrías y texturas entre ejemplares (se crean
// una vez); lo pequeño (pelo, dientes, dedos, costillas) va fusionado en una
// sola malla para no multiplicar las llamadas de dibujo.

// ---------------------------------------------------------------- ayudas

/** Geometría que se construye una vez y se reutiliza. */
const geoCache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => THREE.BufferGeometry) => geoCache.get(key) ?? geoCache.set(key, make()).get(key)!;

/** Junta varias geometrías en una (todas con posición, normal y uv). */
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(list, false) ?? list[0];
}

/** Aplica una transformación a una geometría (posición, giro y escala). */
function place(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
}

/** Desplaza los vértices a lo largo de la normal con un ruido suave: carne, bultos, huesos. */
function lumpy<T extends THREE.BufferGeometry>(g: T, amp: number, freq = 9, seed = 1): T {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = Math.sin(x * freq + seed) * Math.sin(y * freq * 1.3 + seed * 2.1) * Math.sin(z * freq * 0.9 + seed * 0.7) + 0.5 * Math.sin(x * freq * 2.3 - seed) * Math.sin(y * freq * 2.1 + z * 3);
    p.setXYZ(i, x + n.getX(i) * k * amp, y + n.getY(i) * k * amp, z + n.getZ(i) * k * amp);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Hueso de un miembro, colgando de su pivote (de y = 0 a y = -len): más
 * grueso arriba, con un bulto en la articulación de abajo (codo, rodilla).
 */
function bone(len: number, r0: number, r1: number, knob = 0.25, seg = 9): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0005, -len - r1 * 0.5)];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 abajo, 1 arriba
    let r = r1 + (r0 - r1) * t;
    r *= 1 + knob * Math.exp(-((t - 0.1) ** 2) / 0.006) + 0.12 * Math.exp(-((t - 0.85) ** 2) / 0.01);
    if (i === 0) r *= 0.8;
    pts.push(new THREE.Vector2(r, -len + t * len));
  }
  pts.push(new THREE.Vector2(0.0005, r0 * 0.6));
  return new THREE.LatheGeometry(pts, seg);
}

/** Tronco hecho girando un perfil (radio, altura): pecho, cintura, hombros. */
function trunk(profile: [number, number][], seg = 14): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

/** Mano: palma y dedos largos (y uñas o garras), en una sola geometría. */
function handGeo(fingers: number, len: number, r: number, spread: number, claw = 0, curl = 0.25): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [place(new THREE.SphereGeometry(r * 2.2, 8, 6), 0, -r * 1.5, 0, 0, 0, 0, 1, 1.3, 0.55)];
  for (let f = 0; f < fingers; f++) {
    const t = fingers === 1 ? 0 : f / (fingers - 1) - 0.5;
    const l = len * (1 - Math.abs(t) * 0.35);
    const e = new THREE.Euler(curl, 0, -t * 0.25);
    const base = new THREE.Vector3(t * spread, -r * 3, 0);
    parts.push(place(bone(l, r, r * 0.7, 0.3, 5), base.x, base.y, base.z, e.x, e.y, e.z));
    if (claw) {
      // la garra sigue al dedo desde la punta
      const tip = new THREE.Vector3(0, -l, 0).applyEuler(e).add(base);
      const c = new THREE.ConeGeometry(r * 0.8, claw, 5).rotateX(Math.PI).translate(0, -claw / 2, 0);
      parts.push(place(c, tip.x, tip.y, tip.z, e.x, e.y, e.z));
    }
  }
  return merge(parts);
}

/** Hilera de dientes (conos) a lo largo de un arco. */
function teethGeo(n: number, width: number, len: number, r: number, up: boolean, arc = 0.5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const l = len * (0.6 + 0.4 * Math.abs(Math.sin(i * 2.7)));
    parts.push(place(new THREE.ConeGeometry(r, l, 4), t * width, up ? -l / 2 : l / 2, -Math.cos(t * Math.PI) * arc * width * 0.4, up ? Math.PI : 0, 0, 0));
  }
  return merge(parts);
}

/** Generador aleatorio con semilla (para que las texturas salgan siempre iguales). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SkinOpts {
  base: string;
  mottle?: string; // manchas pequeñas
  bruise?: string; // moratones grandes
  veins?: string; // venas finas
  cracks?: string; // grietas (yeso)
  stitches?: string; // costuras
}

/** Piel pintada por código (128 px), una por tipo y compartida. */
const skinCache = new Map<string, THREE.Texture>();
function skinTex(key: string, o: SkinOpts): THREE.Texture {
  let t = skinCache.get(key);
  if (t) return t;
  t = canvasTexture(128, 128, (ctx, w, h) => {
    const R = seeded(key.length * 977 + key.charCodeAt(0));
    ctx.fillStyle = o.base;
    ctx.fillRect(0, 0, w, h);
    const blob = (color: string, n: number, r0: number, r1: number, a0: number, a1: number) => {
      for (let i = 0; i < n; i++) {
        const x = R() * w;
        const y = R() * h;
        const r = r0 + R() * (r1 - r0);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        ctx.globalAlpha = a0 + R() * (a1 - a0);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        // repetido en los bordes para que la textura no tenga costuras
        for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) ctx.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    };
    const lines = (color: string, n: number, steps: number, width: number, wander: number) => {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        let x = R() * w;
        let y = R() * h;
        let a = R() * Math.PI * 2;
        ctx.lineWidth = width * (0.5 + R());
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < steps; s++) {
          a += (R() - 0.5) * wander;
          x += Math.cos(a) * 4;
          y += Math.sin(a) * 4;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    if (o.mottle) blob(o.mottle, 90, 2, 9, 0.1, 0.3);
    if (o.bruise) blob(o.bruise, 7, 12, 30, 0.25, 0.55);
    if (o.veins) lines(o.veins, 16, 14, 0.9, 1.1);
    if (o.cracks) lines(o.cracks, 22, 9, 0.8, 2.2);
    if (o.stitches) {
      ctx.strokeStyle = o.stitches;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const x0 = R() * w;
        const y0 = R() * h;
        const a = R() * Math.PI;
        for (let s = 0; s < 9; s++) {
          const x = x0 + Math.cos(a) * s * 5;
          const y = y0 + Math.sin(a) * s * 5;
          ctx.beginPath();
          ctx.moveTo(x - Math.sin(a) * 3, y + Math.cos(a) * 3);
          ctx.lineTo(x + Math.sin(a) * 3, y - Math.cos(a) * 3);
          ctx.stroke();
        }
      }
    }
  });
  skinCache.set(key, t);
  return t;
}

/** Material de piel (o tela) con la textura pintada. */
const skinMat = (key: string, o: SkinOpts, extra: THREE.MeshBasicMaterialParameters = {}) => litMaterial({ map: skinTex(key, o), ...extra }, 0.1);

// ---------- jugadores ----------

export interface Humanoid {
  group: THREE.Group;
  setLight: (on: boolean) => void;
  animate: (dt: number, speed: number) => void;
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.roundRect(0, 8, 256, 48, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false }));
  sprite.scale.set(1.1, 0.275, 1);
  sprite.position.y = 2.05;
  return sprite;
}

/** Bloque redondeado: una cápsula estirada a lo ancho. */
function rounded(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const r = Math.min(w, d) / 2;
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 4, 12);
  g.scale(w / (2 * r), 1, d / (2 * r));
  return new THREE.Mesh(g, mat);
}

/** Pieza que cuelga de su pivote (para brazos y piernas). */
function hang(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(new THREE.Mesh(geo, mat));
  return pivot;
}

/**
 * Explorador: chaqueta con capucha, mochila con esterilla, pantalón de bolsillos
 * y botas; la linterna en la mano derecha.
 */
export function makeHumanoid(color: number, name: string): Humanoid {
  const shirt = litMaterial({ color }, 0.1);
  const pants = skinMat('pants', { base: '#3a404c', mottle: '#20242c' }, { color: 0xffffff });
  const skin = skinMat('human', { base: '#d6a688', mottle: '#b9806a' });
  const dark = litMaterial({ color: 0x1e1e1e }, 0.1);
  const hairMat = litMaterial({ color: 0x2a1d14 }, 0.1);
  const pack = skinMat('canvas', { base: '#5f4d34', mottle: '#3e3222', stitches: '#2a2116' });
  const strap = litMaterial({ color: 0x2b2620 }, 0.1);

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = new THREE.Mesh(
    cached('h-torso', () => place(trunk([[0.001, -0.31], [0.17, -0.3], [0.165, -0.15], [0.19, 0.05], [0.225, 0.2], [0.2, 0.29], [0.07, 0.33], [0.001, 0.33]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.62)),
    shirt,
  );
  torso.position.y = 1.18;
  const details = new THREE.Mesh(
    cached('h-details', () =>
      merge([
        place(new THREE.BoxGeometry(0.014, 0.52, 0.012), 0, 1.16, -0.142), // cremallera
        place(new THREE.TorusGeometry(0.13, 0.045, 6, 14, Math.PI), 0, 1.47, 0.05, -1.2, 0, 0, 1, 1, 0.9), // capucha
        place(new THREE.BoxGeometry(0.43, 0.05, 0.26), 0, 0.97, 0), // cinturón
        place(new THREE.BoxGeometry(0.035, 0.46, 0.015), -0.1, 1.24, -0.138, 0.05), // tirantes de la mochila
        place(new THREE.BoxGeometry(0.035, 0.46, 0.015), 0.1, 1.24, -0.138, 0.05),
      ]),
    ),
    strap,
  );
  const backpack = rounded(0.34, 0.44, 0.17, pack);
  backpack.position.set(0, 1.2, 0.21);
  const roll = new THREE.Mesh(cached('h-roll', () => place(new THREE.CylinderGeometry(0.065, 0.065, 0.4, 10), 0, 1.47, 0.24, 0, 0, Math.PI / 2)), litMaterial({ color: 0x4f6a3a }, 0.1));
  const hips = rounded(0.4, 0.22, 0.24, pants);
  hips.position.y = 0.86;

  const head = new THREE.Group();
  head.position.y = 1.6;
  const skull = new THREE.Mesh(
    cached('h-skull', () =>
      merge([
        place(new THREE.SphereGeometry(0.14, 18, 14), 0, 0, 0, 0, 0, 0, 1, 1.12, 1.05),
        place(new THREE.SphereGeometry(0.075, 10, 8), 0, -0.09, -0.04, 0, 0, 0, 1.2, 0.8, 1.1), // mandíbula
        place(new THREE.ConeGeometry(0.022, 0.06, 6), 0, -0.01, -0.155, -Math.PI / 2 - 0.3, 0, 0), // nariz
        place(new THREE.SphereGeometry(0.03, 8, 6), -0.14, 0, 0, 0, 0, 0, 0.5, 1, 0.8), // orejas
        place(new THREE.SphereGeometry(0.03, 8, 6), 0.14, 0, 0, 0, 0, 0, 0.5, 1, 0.8),
      ]),
    ),
    skin,
  );
  const hair = new THREE.Mesh(
    cached('h-hair', () => lumpy(place(new THREE.SphereGeometry(0.152, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), 0, 0.025, 0.01, 0.3, 0, 0, 1, 1.05, 1.08), 0.008, 30)),
    hairMat,
  );
  const eyes = new THREE.Mesh(
    cached('h-eyes', () => merge([place(new THREE.SphereGeometry(0.017, 8, 6), -0.05, 0.025, -0.135), place(new THREE.SphereGeometry(0.017, 8, 6), 0.05, 0.025, -0.135), place(new THREE.BoxGeometry(0.05, 0.01, 0.01), -0.05, 0.06, -0.14, 0, 0, 0.1), place(new THREE.BoxGeometry(0.05, 0.01, 0.01), 0.05, 0.06, -0.14, 0, 0, -0.1)])),
    new THREE.MeshBasicMaterial({ color: 0x15100c }),
  );
  head.add(skull, hair, eyes);
  const neck = new THREE.Mesh(cached('h-neck', () => new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10)), skin);
  neck.position.y = 1.5;

  const legGeo = cached('h-leg', () => merge([bone(0.82, 0.09, 0.07, 0.12), place(new THREE.BoxGeometry(0.05, 0.13, 0.11), 0.085, -0.35, 0)]));
  const bootGeo = cached('h-boot', () => merge([lumpy(place(new THREE.CapsuleGeometry(0.065, 0.16, 4, 10), 0, -0.8, -0.05, Math.PI / 2, 0, 0, 1, 1, 0.75), 0.004, 40), place(new THREE.BoxGeometry(0.13, 0.025, 0.24), 0, -0.85, -0.06)]));
  const legL = hang(legGeo, pants);
  legL.position.set(-0.11, 0.86, 0);
  const legR = hang(legGeo, pants);
  legR.position.set(0.11, 0.86, 0);
  for (const leg of [legL, legR]) leg.add(new THREE.Mesh(bootGeo, dark));
  const armGeo = cached('h-arm', () => bone(0.6, 0.075, 0.058, 0.15));
  const handGeom = cached('h-hand', () => place(handGeo(4, 0.07, 0.013, 0.05, 0, 0.5), 0, -0.6, 0));
  const armL = hang(armGeo, shirt);
  armL.position.set(-0.3, 1.44, 0);
  const armR = hang(armGeo, shirt);
  armR.position.set(0.3, 1.44, 0);
  for (const arm of [armL, armR]) arm.add(new THREE.Mesh(handGeom, skin));
  // linterna en la mano derecha; el brazo apunta hacia delante
  const torch = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), dark);
  tube.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color: 0x333333 }));
  lens.position.z = -0.101;
  lens.rotation.y = Math.PI;
  torch.add(tube, lens);
  torch.rotation.x = -Math.PI / 2; // alineada con el brazo
  torch.position.set(0, -0.64, 0);
  armR.add(torch);
  armR.rotation.x = 1.4; // brazo hacia delante

  const beamGeo = new THREE.ConeGeometry(1.3, 7, 24, 1, true);
  beamGeo.translate(0, -3.5, 0);
  beamGeo.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({
      color: 0xfff1c4,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.rotation.x = Math.PI;
  beam.position.z = -0.1;
  beam.visible = false;
  torch.add(beam);

  body.add(torso, details, backpack, roll, hips, neck, head, legL, legR, armL, armR);
  group.add(makeLabel(name));

  let phase = 0;
  return {
    group,
    setLight(on) {
      beam.visible = on;
      (lens.material as THREE.MeshBasicMaterial).color.set(on ? 0xfff6dd : 0x333333);
    },
    animate(dt, speed) {
      const moving = speed > 0.3;
      phase += dt * (moving ? 2.2 + speed * 1.6 : 0);
      const swing = moving ? Math.sin(phase) * Math.min(0.75, 0.25 + speed * 0.1) : 0;
      const ease = 1 - Math.exp(-12 * dt);
      legL.rotation.x += (swing - legL.rotation.x) * ease;
      legR.rotation.x += (-swing - legR.rotation.x) * ease;
      armL.rotation.x += (-swing * 0.8 - armL.rotation.x) * ease;
      armR.rotation.x = 1.4 + Math.sin(phase * 2) * 0.03;
      body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.04 : 0;
    },
  };
}

// ---------- enemigos ----------

/** Estado de animación que manda el anfitrión. */
export const Anim = { Idle: 0, Walk: 1, Run: 2, Attack: 3, Flee: 4, Growl: 5, Disguise: 6, Hidden: 8, Warn: 9 } as const;

export interface EnemyModel {
  group: THREE.Group;
  /** Altura de los ojos (para saber si se le está mirando). */
  eye: number;
  animate: (dt: number, time: number, anim: number) => void;
}

const smilerFace = smilerTexture();
let smokeTex: THREE.Texture | null = null;
function smoke(): THREE.Texture {
  smokeTex ??= canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    false,
  );
  return smokeTex;
}

/** Smiler: una masa de sombra que se retuerce, con ojos y sonrisa que brillan. */
export function makeSmiler(seed: number): EnemyModel {
  const group = new THREE.Group();
  const puffs: { s: THREE.Sprite; a: number; r: number; y: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    const y = 0.3 + (i / 16) * 1.5;
    s.scale.setScalar(0.7 + Math.sin(i) * 0.25 + (y > 1.2 ? 0.3 : 0));
    puffs.push({ s, a: i * 2.4, r: 0.12 + (i % 3) * 0.08, y });
    group.add(s);
  }
  const face = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: smilerFace, fog: false, transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.55) }),
  );
  face.scale.set(1.0, 1.0, 1);
  face.position.set(0, 1.55, 0);
  face.renderOrder = 2;
  group.add(face);
  return {
    group,
    eye: 1.6,
    animate(_dt, time, anim) {
      const fast = anim === Anim.Run ? 2.5 : 1;
      for (const p of puffs) {
        const a = p.a + time * 1.3 * fast + seed;
        p.s.position.set(Math.cos(a) * p.r, p.y + Math.sin(time * 2 + p.a) * 0.05, Math.sin(a) * p.r);
      }
      face.position.y = 1.55 + Math.sin(time * 1.3 + seed) * 0.04;
      face.material.opacity = anim === Anim.Attack ? 1 : 0.8 + Math.random() * 0.2;
      const grin = anim === Anim.Attack ? 1.35 : 1;
      face.scale.set(grin, grin, 1);
    },
  };
}

/** Ojos que brillan (puntos de luz que no apaga la niebla). */
function glowEyes(color: number, spread: number, size = 0.025): THREE.Mesh {
  const key = `eyes${spread}|${size}`;
  const geo = cached(key, () => merge([place(new THREE.SphereGeometry(size, 8, 6), -spread), place(new THREE.SphereGeometry(size, 8, 6), spread)]));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), fog: false }));
}

/** Material casi negro de los huecos (bocas, cuencas). */
const voidMat = () => new THREE.MeshBasicMaterial({ color: 0x0a0505 });

/** Costillas: arcos finos bajo la piel, de delante atrás (eje z). */
function ribsGeo(n: number, z0: number, z1: number, r: number, y = 0, thick = 0.012): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    parts.push(place(new THREE.TorusGeometry(r * (1 - Math.abs(t - 0.35) * 0.35), thick, 4, 14, Math.PI), 0, y, z0 + (z1 - z0) * t, 0, 0, Math.PI, 1, 0.9, 1));
  }
  return merge(parts);
}

/** Pelo: mechones largos y finos que cuelgan desde un casquete (una sola malla). */
function hairGeo(n: number, seed: number, r: number, len: number, front: number): THREE.BufferGeometry {
  const R = seeded(seed * 1000 + 7);
  const parts: THREE.BufferGeometry[] = [lumpy(place(new THREE.SphereGeometry(r * 1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, 0.01, 0.01), 0.01, 25, seed)];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    const overFace = i < front; // los primeros caen por delante de la cara
    const l = len * (0.55 + R() * 0.6) * (overFace ? 0.7 : 1);
    const x = overFace ? (R() - 0.5) * r * 1.4 : Math.cos(a) * r * 0.95;
    const z = overFace ? -r * (0.95 + R() * 0.1) : Math.sin(a) * r * 0.95;
    const strand = new THREE.ConeGeometry(0.013 + R() * 0.01, l, 3).rotateX(Math.PI).translate(0, -l / 2, 0);
    parts.push(place(strand, x, r * 0.35, z, (R() - 0.5) * 0.35 + (overFace ? -0.1 : 0.15), 0, (R() - 0.5) * 0.35));
  }
  return merge(parts);
}

/**
 * Hound: humanoide flaco y gris que va a cuatro patas, con la melena negra y
 * enmarañada tapándole la cara. Ojos rojos hundidos, mandíbula llena de
 * dientes, y las costillas y la columna marcadas bajo la piel.
 */
export function makeHound(seed: number): EnemyModel {
  const skin = skinMat('hound', { base: '#8e8b80', mottle: '#5f5c52', bruise: '#4e3a3a', veins: 'rgba(60,40,55,0.5)' });
  const hairMat = litMaterial({ color: 0x0b0a09 }, 0.1);
  const gum = litMaterial({ color: 0x4a1414 }, 0.1);
  const tooth = litMaterial({ color: 0xc9bd98 }, 0.1);
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.75;
  group.add(body);

  // el tronco, tumbado: el pecho hacia delante (-z), la cadera atrás
  const torso = new THREE.Mesh(
    cached('hound-torso', () => {
      const profile: [number, number][] = [[0.001, -0.52], [0.12, -0.5], [0.16, -0.32], [0.13, -0.08], [0.19, 0.18], [0.21, 0.36], [0.15, 0.5], [0.001, 0.54]];
      const radius = (y: number) => {
        for (let i = 1; i < profile.length; i++) if (y <= profile[i][1]) return profile[i - 1][0] + ((profile[i][0] - profile[i - 1][0]) * (y - profile[i - 1][1])) / (profile[i][1] - profile[i - 1][1]);
        return 0;
      };
      // la columna asoma a lo largo del lomo (que, tumbado, es el lado +z del perfil)
      const spine = Array.from({ length: 12 }, (_, i) => {
        const y = -0.4 + i * 0.075;
        return place(new THREE.SphereGeometry(0.024, 6, 5), 0, y, radius(y) * 0.85 * 0.93, 0, 0, 0, 1, 1.4, 0.8);
      });
      return merge([place(merge([lumpy(place(trunk(profile), 0, 0, 0, 0, 0, 0, 1, 1, 0.85), 0.012, 12, 2), ...spine]), 0, 0, 0, -Math.PI / 2 + 0.15, 0, 0), ribsGeo(6, -0.4, -0.1, 0.19, 0.02)]);
    }),
    skin,
  );
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 0.12, -0.6);
  const skull = new THREE.Mesh(
    cached('hound-skull', () =>
      merge([
        lumpy(place(new THREE.SphereGeometry(0.15, 16, 12), 0, 0, 0, 0, 0, 0, 0.85, 0.9, 1.3), 0.008, 18, 3),
        place(new THREE.SphereGeometry(0.06, 8, 6), 0, 0.05, -0.15, 0, 0, 0, 1.8, 0.6, 0.8), // ceja de hueso
        place(new THREE.SphereGeometry(0.05, 8, 6), 0, -0.04, -0.17, 0, 0, 0, 1.2, 0.7, 1), // hocico
      ]),
    ),
    skin,
  );
  const sockets = new THREE.Mesh(cached('hound-sockets', () => merge([place(new THREE.SphereGeometry(0.035, 8, 6), -0.055, 0.025, -0.165), place(new THREE.SphereGeometry(0.035, 8, 6), 0.055, 0.025, -0.165)])), voidMat());
  const eyes = glowEyes(0xff1a08, 0.055, 0.013);
  eyes.position.set(0, 0.025, -0.188);
  const upperTeeth = new THREE.Mesh(cached('hound-teeth-up', () => place(teethGeo(11, 0.13, 0.055, 0.008, true), 0, -0.075, -0.17)), tooth);
  const mouth = new THREE.Mesh(cached('hound-mouth', () => place(new THREE.SphereGeometry(0.07, 10, 8), 0, -0.1, -0.12, 0, 0, 0, 1, 0.6, 1.2)), gum);
  // mandíbula de abajo (se abre al gruñir)
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, -0.06);
  jaw.add(
    new THREE.Mesh(cached('hound-jaw', () => lumpy(place(new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0, 0.02, -0.07, 0, 0, 0, 0.8, 0.5, 1.4), 0.005, 20)), skin),
    new THREE.Mesh(cached('hound-teeth-down', () => place(teethGeo(10, 0.11, 0.045, 0.007, false), 0, 0.02, -0.15)), tooth),
  );
  const hair = new THREE.Mesh(cached(`hound-hair${Math.floor(seed) % 3}`, () => hairGeo(46, Math.floor(seed) % 3, 0.15, 0.62, 16)), hairMat);
  hair.position.set(0, 0.06, 0.02);
  head.add(skull, sockets, eyes, mouth, upperTeeth, jaw, hair);
  body.add(head);

  const upperGeo = cached('hound-upper', () => bone(0.42, 0.06, 0.042, 0.4));
  const lowerGeo = cached('hound-lower', () => bone(0.42, 0.042, 0.03, 0.35));
  const handG = cached('hound-hand', () => place(handGeo(4, 0.12, 0.012, 0.07, 0.045, 0.3), 0, -0.42, -0.02, Math.PI / 2 * 0.85, 0, 0));
  const limbs: { upper: THREE.Group; lower: THREE.Group; phase: number }[] = [];
  for (const [x, z, phase] of [[-0.2, -0.38, 0], [0.2, -0.38, Math.PI], [-0.18, 0.38, Math.PI], [0.18, 0.38, 0]] as const) {
    const upper = hang(upperGeo, skin);
    upper.position.set(x, 0, z);
    const lower = hang(lowerGeo, skin);
    lower.position.y = -0.42;
    upper.add(lower);
    lower.add(new THREE.Mesh(handG, skin));
    body.add(upper);
    limbs.push({ upper, lower, phase });
  }

  let cycle = 0;
  return {
    group,
    eye: 0.85,
    animate(dt, time, anim) {
      const speed = anim === Anim.Run ? 9 : anim === Anim.Walk || anim === Anim.Flee ? 4.5 : 0;
      cycle += dt * speed;
      const amp = anim === Anim.Run ? 0.75 : 0.4;
      for (const l of limbs) {
        const s = speed ? Math.sin(cycle + l.phase) : 0;
        l.upper.rotation.x = s * amp;
        l.lower.rotation.x = speed ? -Math.max(0, Math.cos(cycle + l.phase)) * amp * 1.2 : 0.15;
      }
      const growl = anim === Anim.Growl || anim === Anim.Attack;
      body.position.y = 0.75 + (speed ? Math.abs(Math.sin(cycle)) * 0.06 : Math.sin(time * 2 + seed) * 0.01) - (growl ? 0.15 : 0);
      body.rotation.x = anim === Anim.Run ? -0.08 : growl ? 0.12 : 0;
      head.rotation.x = growl ? 0.3 + Math.sin(time * 30) * 0.03 : Math.sin(time * 0.8 + seed) * 0.1;
      head.rotation.y = speed ? 0 : Math.sin(time * 0.5 + seed) * 0.4;
      jaw.position.y = growl ? -0.17 : -0.12;
      if (anim === Anim.Attack) head.position.z = -0.6 - Math.abs(Math.sin(time * 12)) * 0.15;
      else head.position.z = -0.6;
    },
  };
}

/**
 * Faceling: humanoide alto, de piel pálida como la porcelana, con traje y
 * corbata. La cara es lisa: solo se adivina dónde irían la nariz y las cejas.
 */
export function makeFaceling(seed: number): EnemyModel {
  const skin = skinMat('faceling', { base: '#d9d0c4', mottle: '#c7baab', veins: 'rgba(110,120,150,0.22)' });
  const suit = litMaterial({ color: [0x3a3d44, 0x4a3d34, 0x2f3a33][Math.floor(seed) % 3] }, 0.1);
  const shirt = litMaterial({ color: 0xbcb6a8 }, 0.1);
  const black = litMaterial({ color: 0x111111 }, 0.1);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const torso = new THREE.Mesh(cached('face-torso', () => place(trunk([[0.001, -0.42], [0.2, -0.4], [0.18, -0.16], [0.2, 0.08], [0.26, 0.28], [0.21, 0.37], [0.06, 0.42], [0.001, 0.42]]), 0, 1.32, 0, 0, 0, 0, 1, 1, 0.65)), suit);
  const front = new THREE.Mesh(
    cached('face-front', () =>
      merge([
        place(new THREE.ConeGeometry(0.08, 0.3, 3), 0, 1.56, -0.138, Math.PI, 0, 0, 1, 1, 0.08), // camisa en V
        place(new THREE.BoxGeometry(0.05, 0.016, 0.03), 0, 1.66, -0.15), // cuello
      ]),
    ),
    shirt,
  );
  const tie = new THREE.Mesh(cached('face-tie', () => merge([place(new THREE.BoxGeometry(0.045, 0.32, 0.012), 0, 1.48, -0.148), place(new THREE.BoxGeometry(0.05, 0.05, 0.02), 0, 1.65, -0.15)])), litMaterial({ color: 0x3a1418 }, 0.1));
  const lapels = new THREE.Mesh(
    cached('face-lapels', () => merge([place(new THREE.BoxGeometry(0.07, 0.3, 0.015), -0.075, 1.55, -0.14, 0, 0, -0.25), place(new THREE.BoxGeometry(0.07, 0.3, 0.015), 0.075, 1.55, -0.14, 0, 0, 0.25), ...[1.3, 1.18].map((y) => place(new THREE.SphereGeometry(0.012, 6, 4), 0, y, -0.15))])),
    black,
  );
  const neck = new THREE.Mesh(cached('face-neck', () => new THREE.CylinderGeometry(0.05, 0.058, 0.22, 10)), skin);
  neck.position.y = 1.78;
  const head = new THREE.Group();
  head.position.y = 1.95;
  // cabeza lisa: sin ojos ni boca, solo el relieve de la nariz y las cejas
  const skull = new THREE.Mesh(
    cached('face-skull', () =>
      merge([
        lumpy(place(new THREE.SphereGeometry(0.13, 22, 16), 0, 0, 0, 0, 0, 0, 0.92, 1.28, 1.02), 0.003, 14),
        place(new THREE.SphereGeometry(0.03, 8, 6), 0, -0.01, -0.12, 0, 0, 0, 0.7, 1.6, 0.6),
        place(new THREE.SphereGeometry(0.05, 8, 6), 0, 0.06, -0.105, 0, 0, 0, 1.6, 0.35, 0.5),
        place(new THREE.SphereGeometry(0.05, 8, 6), 0, -0.12, -0.08, 0, 0, 0, 1, 0.6, 0.8),
      ]),
    ),
    skin,
  );
  head.add(skull);
  const legGeo = cached('face-leg', () => bone(0.95, 0.08, 0.065, 0.1));
  const shoeGeo = cached('face-shoe', () => lumpy(place(new THREE.CapsuleGeometry(0.055, 0.17, 4, 10), 0, -0.97, -0.06, Math.PI / 2, 0, 0, 1, 0.6, 1), 0.003, 30));
  const legL = hang(legGeo, suit);
  legL.position.set(-0.1, 0.98, 0);
  const legR = hang(legGeo, suit);
  legR.position.set(0.1, 0.98, 0);
  for (const leg of [legL, legR]) leg.add(new THREE.Mesh(shoeGeo, black));
  const armGeo = cached('face-arm', () => bone(0.82, 0.058, 0.045, 0.15));
  const handG = cached('face-hand', () => merge([place(handGeo(5, 0.12, 0.011, 0.09, 0, 0.45), 0, -0.84, 0), place(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), 0, -0.8, 0)]));
  const armL = hang(armGeo, suit);
  armL.position.set(-0.28, 1.65, 0);
  const armR = hang(armGeo, suit);
  armR.position.set(0.28, 1.65, 0);
  for (const arm of [armL, armR]) arm.add(new THREE.Mesh(handG, skin));
  body.add(torso, front, tie, lapels, neck, head, legL, legR, armL, armR);
  let cycle = seed;
  return {
    group,
    eye: 1.95,
    animate(dt, time, anim) {
      const moving = anim === Anim.Walk || anim === Anim.Run || anim === Anim.Flee;
      cycle += dt * (anim === Anim.Run ? 7 : moving ? 3.2 : 0);
      const sw = moving ? Math.sin(cycle) * (anim === Anim.Run ? 0.6 : 0.35) : 0;
      legL.rotation.x = sw;
      legR.rotation.x = -sw;
      const hostile = anim === Anim.Run || anim === Anim.Attack;
      armL.rotation.x = hostile ? 1.3 + Math.sin(time * 9) * 0.1 : -sw * 0.6;
      armR.rotation.x = hostile ? 1.3 + Math.cos(time * 9) * 0.1 : sw * 0.6;
      // la cabeza se inclina despacio, como si te observara
      head.rotation.z = Math.sin(time * 0.4 + seed) * 0.25;
      head.rotation.x = anim === Anim.Idle ? Math.sin(time * 0.3 + seed) * 0.15 : 0;
      body.position.y = moving ? Math.abs(Math.cos(cycle)) * 0.03 : 0;
    },
  };
}

/** Jirón de piel con el borde inferior desgarrado. */
function flapGeo(w: number, h: number, seed: number): THREE.BufferGeometry {
  const R = seeded(seed);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  const n = 6;
  for (let i = 0; i <= n; i++) s.lineTo(w / 2 - (w * i) / n, -h * (0.6 + R() * 0.4));
  s.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(s);
  // un poco curvado, como piel que cuelga
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * Math.PI) * 0.03 + p.getY(i) * -0.05);
  g.computeVertexNormals();
  return g;
}

let stolenFace: THREE.Texture | null = null;
/** La cara de alguien, arrancada: ojos cerrados y la boca abierta. */
function stolenFaceTex(): THREE.Texture {
  stolenFace ??= canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#c99a80';
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.36, h * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,50,40,0.5)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.93, w * 0.3, h * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2018';
      ctx.lineWidth = 3;
      for (const x of [0.37, 0.63]) {
        ctx.beginPath();
        ctx.arc(w * x, h * 0.42, 9, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
      ctx.fillStyle = '#1a0806';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.7, 11, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a1a12';
      ctx.fillRect(w * 0.18, h * 0.04, w * 0.64, h * 0.14);
    },
    false,
  );
  return stolenFace;
}

/**
 * Skin-Stealer: alto, flaco y de piel amarillenta y estirada, con los ojos
 * blancos y hundidos y una boca que llega casi a las orejas. Lleva colgando
 * jirones de piel humana (y una cara). Disfrazado es alguien encogido que llora.
 */
export function makeSkinStealer(seed: number): EnemyModel {
  const pale = skinMat('stealer', { base: '#c2b98e', mottle: '#9c9266', veins: 'rgba(110,70,50,0.5)', bruise: '#8a7a48' });
  const paleDark = skinMat('stealer2', { base: '#a39a70', mottle: '#7d7552', veins: 'rgba(90,50,40,0.5)' });
  const skin = skinMat('stolen', { base: '#d2a58a', mottle: '#b07a64', bruise: '#7a3a30', stitches: '#4a1a14' }, { side: THREE.DoubleSide });
  const cloth = skinMat('hoodie', { base: '#4f4740', mottle: '#3a332d', stitches: '#2a2420' });
  const jeans = skinMat('jeans', { base: '#33405a', mottle: '#24304a' });
  const hairMat = litMaterial({ color: 0x2a1d14 }, 0.1);
  const tooth = litMaterial({ color: 0xd8d0b0 }, 0.1);
  const group = new THREE.Group();

  // ---- disfraz: alguien de rodillas, encogido, tapándose la cara ----
  const disguise = new THREE.Group();
  const back = new THREE.Mesh(
    cached('ss-back', () => merge([place(trunk([[0.001, -0.3], [0.17, -0.28], [0.2, 0.05], [0.21, 0.2], [0.12, 0.3], [0.001, 0.31]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.75), lumpy(place(new THREE.SphereGeometry(0.13, 12, 8), 0, 0.27, 0.05, 0, 0, 0, 1.1, 1, 1), 0.01, 20)])),
    cloth,
  );
  back.position.set(0, 0.62, 0.05);
  back.rotation.x = 0.55;
  const dHead = new THREE.Mesh(cached('ss-dhead', () => new THREE.SphereGeometry(0.12, 14, 10)), skin);
  dHead.position.set(0, 0.92, -0.22);
  dHead.add(new THREE.Mesh(cached('ss-dhair', () => hairGeo(26, 5, 0.12, 0.35, 10)), hairMat));
  const legs = new THREE.Mesh(
    cached('ss-legs', () => merge([place(new THREE.CapsuleGeometry(0.075, 0.38, 4, 8), -0.1, 0.12, 0.02, Math.PI / 2), place(new THREE.CapsuleGeometry(0.075, 0.38, 4, 8), 0.1, 0.12, 0.02, Math.PI / 2)])),
    jeans,
  );
  const shoes = new THREE.Mesh(cached('ss-shoes', () => merge([place(new THREE.BoxGeometry(0.1, 0.07, 0.22), -0.1, 0.05, 0.32), place(new THREE.BoxGeometry(0.1, 0.07, 0.22), 0.1, 0.05, 0.32)])), litMaterial({ color: 0x1a1a1a }, 0.1));
  const sleeves = new THREE.Mesh(
    cached('ss-sleeves', () => merge([place(new THREE.CapsuleGeometry(0.055, 0.36, 4, 8), -0.13, 0.78, -0.26, 1.1, 0, 0.5), place(new THREE.CapsuleGeometry(0.055, 0.36, 4, 8), 0.13, 0.78, -0.26, 1.1, 0, -0.5)])),
    cloth,
  );
  const hands = new THREE.Mesh(cached('ss-hands', () => merge([place(handGeo(4, 0.06, 0.01, 0.04, 0, 0.6), -0.05, 0.98, -0.34, 2.6, 0, 0.4), place(handGeo(4, 0.06, 0.01, 0.04, 0, 0.6), 0.05, 0.98, -0.34, 2.6, 0, -0.4)])), skin);
  disguise.add(back, dHead, legs, shoes, sleeves, hands);

  // ---- forma real ----
  const real = new THREE.Group();
  const spine = new THREE.Group();
  spine.position.y = 1.3;
  real.add(spine);
  const chest = new THREE.Mesh(
    cached('ss-chest', () =>
      merge([
        lumpy(place(trunk([[0.001, -0.06], [0.12, -0.04], [0.09, 0.16], [0.16, 0.42], [0.21, 0.62], [0.2, 0.76], [0.06, 0.86], [0.001, 0.86]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.7), 0.01, 14, 4),
        place(ribsGeo(6, -0.07, 0.07, 0.17, 0, 0.01), 0, 0.52, 0, Math.PI / 2, 0, 0),
        place(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8), 0, 0.92, 0),
        ...[-1, 1].map((sx) => lumpy(place(new THREE.SphereGeometry(0.075, 10, 8), sx * 0.2, 0.78, 0, 0, 0, sx * 0.4, 1.3, 0.8, 0.8), 0.008, 20)),
        place(new THREE.CapsuleGeometry(0.03, 0.36, 4, 6), 0, 0.8, -0.02, 0, 0, Math.PI / 2), // clavículas
      ]),
    ),
    pale,
  );
  spine.add(chest);
  // piel humana colgando a jirones (el disfraz que se quita) y una cara
  for (let i = 0; i < 6; i++) {
    const flap = new THREE.Mesh(cached(`ss-flap${i % 3}`, () => flapGeo(0.22, 0.45 + (i % 3) * 0.15, i + 11)), skin);
    const a = (i / 6) * Math.PI * 2;
    flap.position.set(Math.cos(a) * 0.19, 0.5, Math.sin(a) * 0.15);
    flap.rotation.y = -a + Math.PI / 2;
    spine.add(flap);
  }
  const face = new THREE.Mesh(cached('ss-face', () => new THREE.PlaneGeometry(0.18, 0.24)), litMaterial({ map: stolenFaceTex(), transparent: true, side: THREE.DoubleSide }, 0.1));
  face.position.set(0.06, 0.18, -0.13);
  face.rotation.set(0.2, Math.PI, 0.25);
  spine.add(face);
  const head = new THREE.Group();
  head.position.y = 1.0;
  const skull = new THREE.Mesh(
    cached('ss-skull', () =>
      merge([
        lumpy(place(new THREE.SphereGeometry(0.14, 16, 12), 0, 0, 0, 0, 0, 0, 0.8, 1.4, 1), 0.01, 16, 6),
        place(new THREE.SphereGeometry(0.06, 8, 6), 0, -0.12, -0.04, 0, 0, 0, 1.5, 0.6, 1.4), // mandíbula ancha
      ]),
    ),
    pale,
  );
  // ojos blancos y hundidos; la boca, de oreja a oreja
  const holes = new THREE.Mesh(
    cached('ss-holes', () => merge([place(new THREE.SphereGeometry(0.04, 8, 6), -0.05, 0.04, -0.115), place(new THREE.SphereGeometry(0.04, 8, 6), 0.05, 0.04, -0.115), place(new THREE.SphereGeometry(0.1, 12, 6), 0, -0.1, -0.08, 0, 0, 0, 1.15, 0.22, 0.75)])),
    voidMat(),
  );
  const eyes = new THREE.Mesh(cached('eyes0.05|0.016', () => merge([place(new THREE.SphereGeometry(0.016, 8, 6), -0.05), place(new THREE.SphereGeometry(0.016, 8, 6), 0.05)])), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.5), fog: false }));
  eyes.position.set(0, 0.04, -0.13);
  const teeth = new THREE.Mesh(cached('ss-teeth', () => merge([place(teethGeo(14, 0.2, 0.04, 0.005, true, 1.2), 0, -0.085, -0.13), place(teethGeo(13, 0.18, 0.035, 0.005, false, 1.2), 0, -0.115, -0.125)])), tooth);
  head.add(skull, holes, eyes, teeth);
  spine.add(head);
  const legsR: THREE.Group[] = [];
  const thigh = cached('ss-thigh', () => bone(0.68, 0.07, 0.05, 0.3));
  const shin = cached('ss-shin', () => merge([bone(0.68, 0.05, 0.035, 0.28), place(handGeo(5, 0.12, 0.011, 0.08, 0.03, 1.35), 0, -0.68, 0, 0, Math.PI, 0)]));
  for (const x of [-0.12, 0.12]) {
    const upper = hang(thigh, pale);
    upper.position.set(x, 1.36, 0);
    const lower = hang(shin, paleDark);
    lower.position.y = -0.68;
    upper.add(lower);
    real.add(upper);
    legsR.push(upper);
  }
  const arms: THREE.Group[] = [];
  const upperArm = cached('ss-arm', () => bone(0.62, 0.055, 0.042, 0.3));
  const forearm = cached('ss-forearm', () => merge([bone(0.66, 0.042, 0.03, 0.25), place(handGeo(5, 0.22, 0.01, 0.075, 0.06, 0.35), 0, -0.66, 0)]));
  for (const x of [-0.24, 0.24]) {
    const upper = hang(upperArm, pale);
    upper.position.set(x, 0.8, 0);
    const lower = hang(forearm, paleDark);
    lower.position.y = -0.62;
    upper.add(lower);
    spine.add(upper);
    arms.push(upper);
  }
  group.add(disguise, real);
  let cycle = seed;
  return {
    group,
    eye: 2.3,
    animate(dt, time, anim) {
      const disguised = anim === Anim.Disguise;
      disguise.visible = disguised;
      real.visible = !disguised;
      if (disguised) {
        // sollozos
        back.position.y = 0.62 + Math.max(0, Math.sin(time * 9)) * 0.015;
        dHead.position.y = 0.92 + Math.max(0, Math.sin(time * 9)) * 0.012;
        return;
      }
      const moving = anim === Anim.Walk || anim === Anim.Run;
      cycle += dt * (anim === Anim.Run ? 9 : moving ? 3 : 0);
      const sw = moving ? Math.sin(cycle) * 0.55 : 0;
      legsR[0].rotation.x = sw;
      legsR[1].rotation.x = -sw;
      arms[0].rotation.x = anim === Anim.Attack ? 1.7 : -sw * 0.7 + 0.2;
      arms[1].rotation.x = anim === Anim.Attack ? 1.7 : sw * 0.7 + 0.2;
      spine.rotation.x = 0.2 + (anim === Anim.Run ? 0.3 : 0);
      head.rotation.z = Math.sin(time * 0.6 + seed) * 0.15 + (Math.random() < 0.02 ? (Math.random() - 0.5) * 0.8 : 0);
    },
  };
}

/**
 * Figura oscura (Nivel 0): una silueta alta y flaca, de brazos demasiado
 * largos y la cabeza un poco adelantada. El borde se deshace como humo y, a
 * veces, se le ven dos puntos de luz donde irían los ojos.
 */
export function makeFigure(): EnemyModel {
  const shadow = new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.88, depthWrite: false });
  const group = new THREE.Group();
  const silhouette = new THREE.Mesh(
    cached('figure', () =>
      merge([
        place(trunk([[0.001, 0.82], [0.13, 0.85], [0.1, 1.05], [0.17, 1.35], [0.22, 1.58], [0.12, 1.68], [0.05, 1.72], [0.001, 1.74]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.55),
        place(new THREE.SphereGeometry(0.13, 12, 10), 0, 1.86, -0.05, 0.2, 0, 0, 0.9, 1.2, 1),
        ...[-0.08, 0.08].map((x) => place(bone(0.86, 0.07, 0.045, 0.15), x, 0.86, 0)),
        ...[-0.24, 0.24].map((x) => merge([place(bone(1.02, 0.05, 0.035, 0.15), x, 1.6, 0, 0, 0, x > 0 ? 0.06 : -0.06), place(handGeo(4, 0.18, 0.01, 0.05, 0, 0.2), x * 1.25, 0.58, 0)])),
      ]),
    ),
    shadow,
  );
  const wisp = new THREE.SpriteMaterial({ map: smoke(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  const wisps: THREE.Sprite[] = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(wisp);
    s.scale.setScalar(0.45 + (i % 3) * 0.12);
    s.position.set(Math.sin(i * 2.3) * 0.22, 0.4 + i * 0.2, Math.cos(i * 2.3) * 0.12);
    wisps.push(s);
  }
  const glints = new THREE.Mesh(cached('eyes0.04|0.008', () => merge([place(new THREE.SphereGeometry(0.008, 6, 4), -0.04), place(new THREE.SphereGeometry(0.008, 6, 4), 0.04)])), new THREE.MeshBasicMaterial({ color: 0x9a968a, fog: false }));
  glints.position.set(0, 1.88, -0.16);
  group.add(silhouette, glints, ...wisps);
  return {
    group,
    eye: 1.85,
    animate(_dt, time) {
      // contorno inestable, como si no estuviera del todo ahí
      shadow.opacity = 0.7 + Math.sin(time * 7) * 0.1 + (Math.random() < 0.05 ? -0.4 : 0);
      group.scale.x = 1 + Math.sin(time * 3.1) * 0.03;
      wisp.opacity = shadow.opacity * 0.55;
      wisps.forEach((s, i) => (s.position.x = Math.sin(i * 2.3 + time * 0.6) * 0.22));
      glints.visible = Math.sin(time * 0.45) > 0.75;
    },
  };
}

/**
 * Clump: un nudo de cuerpos fundidos del que salen brazos y piernas. En la
 * masa se adivinan dos caras a medio hundir, con la boca abierta.
 */
export function makeClump(seed: number): EnemyModel {
  const flesh = skinMat('clump', { base: '#c29682', mottle: '#9a6a5a', bruise: '#6a3a40', veins: 'rgba(90,40,60,0.45)', stitches: '#3a1a1a' });
  const bruise = skinMat('clump2', { base: '#8a6252', mottle: '#5e3e36', bruise: '#3a2228', veins: 'rgba(60,20,30,0.5)' });
  const group = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  group.add(core);
  const blob = new THREE.Mesh(
    cached('clump-core', () =>
      merge([
        lumpy(place(new THREE.SphereGeometry(0.35, 18, 12), 0, 0, 0, 0, 0, 0, 1.2, 0.8, 1), 0.04, 7, 1),
        lumpy(place(new THREE.CapsuleGeometry(0.17, 0.4, 4, 10), 0.12, 0.12, 0.05, 0.4, 0, 1.2), 0.02, 9, 2),
        lumpy(place(new THREE.CapsuleGeometry(0.15, 0.35, 4, 10), -0.15, 0.08, -0.08, -0.5, 0.8, -0.9), 0.02, 9, 3),
      ]),
    ),
    bruise,
  );
  const faces = new THREE.Mesh(cached('clump-faces', () => merge([lumpy(place(new THREE.SphereGeometry(0.11, 12, 10), 0.12, 0.2, -0.3, 0, 0, 0, 0.9, 1.15, 0.8), 0.006, 20), lumpy(place(new THREE.SphereGeometry(0.1, 12, 10), -0.32, 0.05, 0.12, 0, 0, 0.6, 0.9, 1.1, 0.8), 0.006, 20)])), flesh);
  const mouths = new THREE.Mesh(
    cached('clump-mouths', () =>
      merge([
        place(new THREE.SphereGeometry(0.035, 8, 6), 0.12, 0.14, -0.38, 0, 0, 0, 1, 1.5, 0.5),
        place(new THREE.SphereGeometry(0.03, 8, 6), -0.4, 0.02, 0.1, 0, 0, 0.6, 0.5, 1.5, 1),
        ...[-1, 1].map((s) => place(new THREE.BoxGeometry(0.035, 0.006, 0.01), 0.12 + s * 0.04, 0.24, -0.385)),
      ]),
    ),
    voidMat(),
  );
  core.add(blob, faces, mouths);
  const limbs: { g: THREE.Group; a: number; b: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const len = Math.round((0.45 + hashf(seed, i) * 0.35) * 20) / 20; // pocas medidas distintas: se comparten
    const seg = hang(cached(`clump-up${len}`, () => bone(len, 0.065, 0.05, 0.3)), i % 3 ? flesh : bruise);
    const foot = i % 4 === 0; // algunos acaban en un pie
    const lower = hang(
      cached(`clump-low${len}|${foot}`, () =>
        merge([bone(len * 0.9, 0.05, 0.035, 0.3), foot ? place(handGeo(5, 0.07, 0.012, 0.07, 0.015, 1.4), 0, -len * 0.9, 0, 0, Math.PI, 0) : place(handGeo(4, 0.09, 0.011, 0.055, 0.02, 0.5), 0, -len * 0.9, 0)]),
      ),
      flesh,
    );
    lower.position.y = -len;
    seg.add(lower);
    g.add(seg);
    const a = (i / 14) * Math.PI * 2;
    const b = (hashf(seed, i + 30) - 0.5) * 1.6;
    g.rotation.set(0, a, 0);
    seg.rotation.z = 1.2 + b * 0.3;
    core.add(g);
    limbs.push({ g, a, b });
  }
  let cycle = seed;
  return {
    group,
    eye: 0.6,
    animate(dt, time, anim) {
      const run = anim === Anim.Run;
      cycle += dt * (run ? 16 : anim === Anim.Walk ? 6 : 1.5);
      limbs.forEach((l, i) => {
        const seg = l.g.children[0];
        seg.rotation.x = Math.sin(cycle + i * 1.3) * (run ? 0.8 : 0.25);
        seg.rotation.z = 1.2 + l.b * 0.3 + Math.cos(cycle * 0.7 + i) * (run ? 0.4 : 0.1);
      });
      core.position.y = 0.55 + (run ? Math.abs(Math.sin(cycle * 0.5)) * 0.12 : Math.sin(time * 2) * 0.02);
      core.rotation.y = run ? Math.sin(cycle * 0.3) * 0.2 : 0;
    },
  };
}

/**
 * Duller: humanoide gris y apagado, de piel agrietada como el yeso, que sale
 * de las paredes. Cuencas vacías, la boca floja y abierta, y brazos larguísimos.
 */
export function makeDuller(): EnemyModel {
  const grey = skinMat('duller', { base: '#77736c', mottle: '#5d5953', cracks: 'rgba(38,36,32,0.75)' });
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const torso = new THREE.Mesh(
    cached('duller-torso', () =>
      merge([
        lumpy(place(trunk([[0.001, 0.55], [0.07, 0.6], [0.15, 0.95], [0.18, 1.3], [0.22, 1.5], [0.14, 1.62], [0.05, 1.66], [0.001, 1.67]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.7), 0.012, 11, 5),
        place(ribsGeo(5, -0.06, 0.06, 0.18, 0, 0.01), 0, 1.3, 0, Math.PI / 2, 0, 0),
        place(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 8), 0, 1.7, 0),
      ]),
    ),
    grey,
  );
  const head = new THREE.Mesh(cached('duller-head', () => lumpy(place(new THREE.SphereGeometry(0.15, 14, 12), 0, 1.84, 0, 0, 0, 0, 0.85, 1.3, 0.9), 0.012, 12, 6)), grey);
  const holes = new THREE.Mesh(cached('duller-holes', () => merge([place(new THREE.SphereGeometry(0.04, 8, 6), -0.05, 1.87, -0.115), place(new THREE.SphereGeometry(0.04, 8, 6), 0.05, 1.87, -0.115), place(new THREE.SphereGeometry(0.045, 8, 6), 0, 1.7, -0.11, 0, 0, 0, 0.8, 1.6, 0.6)])), voidMat());
  const arms: THREE.Group[] = [];
  const armGeo = cached('duller-arm', () => merge([bone(1.0, 0.06, 0.04, 0.3), place(handGeo(4, 0.19, 0.011, 0.06, 0.02, 0.3), 0, -1.0, 0)]));
  for (const x of [-0.27, 0.27]) {
    const arm = hang(armGeo, grey);
    arm.position.set(x, 1.55, 0);
    body.add(arm);
    arms.push(arm);
  }
  body.add(torso, head, holes);
  return {
    group,
    eye: 1.8,
    animate(_dt, time, anim) {
      const out = anim === Anim.Attack || anim === Anim.Flee;
      body.visible = out;
      if (!out) return;
      for (const a of arms) a.rotation.x = 1.4 + Math.sin(time * 14) * 0.15;
      body.position.z = -0.2;
    },
  };
}

function hashf(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function makeEnemy(kind: string, seed: number): EnemyModel {
  switch (kind) {
    case 'hound':
      return makeHound(seed);
    case 'faceling':
      return makeFaceling(seed);
    case 'skinstealer':
      return makeSkinStealer(seed);
    case 'figure':
      return makeFigure();
    case 'clump':
      return makeClump(seed);
    case 'duller':
      return makeDuller();
    default:
      return makeSmiler(seed);
  }
}

// ---------- personajes que no atacan ----------

export interface NpcModel {
  group: THREE.Group;
  animate: (dt: number, time: number, moving: boolean) => void;
}

let eagleTex: THREE.Texture | null = null;
/** Parche de la M.E.G.: el águila negra sobre fondo lima. */
function megPatch(): THREE.Texture {
  eagleTex ??= canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#c4dc3a';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#151510';
      ctx.beginPath();
      // alas abiertas, cuerpo y cabeza
      ctx.moveTo(6, 24);
      ctx.lineTo(26, 30);
      ctx.lineTo(32, 18);
      ctx.lineTo(38, 30);
      ctx.lineTo(58, 24);
      ctx.lineTo(42, 40);
      ctx.lineTo(36, 52);
      ctx.lineTo(28, 52);
      ctx.lineTo(22, 40);
      ctx.closePath();
      ctx.fill();
    },
    false,
  );
  return eagleTex;
}

/** Miembro de una patrulla de la M.E.G.: uniforme lima, casco, chaleco reflectante y el águila. */
export function makeMeg(): NpcModel {
  const h = makeHumanoid(0xb8d23a, 'M.E.G.');
  const patch = new THREE.Mesh(cached('meg-patch', () => new THREE.CircleGeometry(0.07, 14)), litMaterial({ map: megPatch() }, 0.1));
  patch.position.set(0.11, 1.32, -0.148);
  patch.rotation.y = Math.PI;
  const helmet = new THREE.Mesh(
    cached('meg-helmet', () => merge([place(new THREE.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.64, 0), place(new THREE.TorusGeometry(0.17, 0.018, 4, 18), 0, 1.645, 0, Math.PI / 2)])),
    litMaterial({ color: 0x5e6b2e }, 0.1),
  );
  const visor = new THREE.Mesh(cached('meg-visor', () => place(new THREE.CylinderGeometry(0.165, 0.165, 0.05, 16, 1, true, Math.PI * 0.65, Math.PI * 0.7), 0, 1.66, 0)), new THREE.MeshBasicMaterial({ color: 0x1a2018 }));
  // bandas reflectantes del chaleco
  const stripes = new THREE.Mesh(
    cached('meg-stripes', () => merge([1.06, 1.26].map((y) => place(new THREE.CylinderGeometry(0.205, 0.2, 0.035, 16, 1, true), 0, y, 0, 0, 0, 0, 1, 1, 0.66)))),
    new THREE.MeshBasicMaterial({ color: 0x9a9a92 }),
  );
  h.group.add(patch, helmet, visor, stripes);
  h.setLight(false);
  return { group: h.group, animate: (dt, _t, moving) => h.animate(dt, moving ? 1.4 : 0) };
}

/**
 * Trabajador sombra (sector en obras): una silueta negra sin cara, con mono
 * de trabajo, casco amarillo desgastado (lo único con color) y un martillo.
 */
export function makeWorker(seed: number): NpcModel {
  const dark = litMaterial({ color: 0x0c0c0c }, 0.1);
  const overall = skinMat('overall', { base: '#232c40', mottle: '#161c2a', stitches: '#10141c' });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    cached('worker-torso', () => merge([place(trunk([[0.001, -0.34], [0.2, -0.32], [0.19, -0.1], [0.21, 0.12], [0.24, 0.26], [0.1, 0.34], [0.001, 0.35]]), 0, 1.2, 0, 0, 0, 0, 1, 1, 0.66), place(new THREE.BoxGeometry(0.36, 0.06, 0.26), 0, 0.92, 0)])),
    overall,
  );
  const head = new THREE.Mesh(cached('worker-head', () => lumpy(place(new THREE.SphereGeometry(0.15, 14, 10), 0, 1.7, 0, 0, 0, 0, 0.95, 1.12, 1), 0.012, 14, 8)), dark);
  const hat = new THREE.Mesh(
    cached('worker-hat', () => merge([place(new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.77, 0), place(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 16), 0, 1.775, -0.02)])),
    skinMat('hardhat', { base: '#b8921e', mottle: '#8a6a14', cracks: 'rgba(60,40,10,0.5)' }),
  );
  const fume = new THREE.SpriteMaterial({ map: smoke(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
  const wisps = [0, 1].map((i) => {
    const s = new THREE.Sprite(fume);
    s.scale.setScalar(0.35);
    s.position.set(i ? 0.08 : -0.06, 1.62 + i * 0.12, 0.05);
    return s;
  });
  const legs: THREE.Group[] = [];
  const legGeo = cached('worker-leg', () => merge([bone(0.85, 0.09, 0.075, 0.1), place(new THREE.BoxGeometry(0.14, 0.09, 0.28), 0, -0.85, -0.05)]));
  for (const x of [-0.11, 0.11]) {
    const l = hang(legGeo, overall);
    l.position.set(x, 0.88, 0);
    group.add(l);
    legs.push(l);
  }
  const armGeo = cached('worker-arm', () => merge([bone(0.6, 0.065, 0.05, 0.15), place(handGeo(4, 0.07, 0.013, 0.05, 0, 0.6), 0, -0.6, 0)]));
  const armL = hang(armGeo, dark);
  armL.position.set(-0.28, 1.45, 0);
  const armR = hang(armGeo, dark);
  armR.position.set(0.28, 1.45, 0);
  const hammer = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), litMaterial({ color: 0x6b4a2a }, 0.1));
  const headH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), litMaterial({ color: 0x555555 }, 0.1));
  headH.position.y = 0.17;
  hammer.add(handle, headH);
  hammer.position.y = -0.62;
  hammer.rotation.x = Math.PI / 2;
  armR.add(hammer);
  group.add(torso, head, hat, ...wisps, armL, armR);
  let cycle = seed;
  return {
    group,
    animate(dt, time, moving) {
      cycle += dt * (moving ? 3 : 0);
      const sw = moving ? Math.sin(cycle) * 0.35 : 0;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      // martillea sin parar
      armR.rotation.x = moving ? -sw : 1.2 + Math.max(0, Math.sin(time * 5 + seed)) * 0.9;
      armL.rotation.x = moving ? sw : 0.6;
    },
  };
}

// ---------- bichos ambientales ----------

let wingTex: THREE.Texture | null = null;
/** Ala de polilla: polvo pardo, nervios oscuros y un ojo falso. */
function mothWing(): THREE.Texture {
  wingTex ??= canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.2, h / 2, 2, w * 0.4, h / 2, w * 0.6);
      g.addColorStop(0, '#6a5a44');
      g.addColorStop(1, '#3a3024');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(25,18,10,0.7)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.quadraticCurveTo(w * 0.5, h / 2 + (i - 2.5) * 6, w, (i / 5) * h);
        ctx.stroke();
      }
      for (const [r, c] of [[11, '#1a120a'], [8, '#b89a5a'], [4, '#0a0604']] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(w * 0.62, h * 0.48, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    false,
  );
  return wingTex;
}

/** Deathmoth pequeña (las del Nivel 2 son más pequeñas). */
export function makeMoth(): { group: THREE.Group; flap: (t: number) => void } {
  const wingMat = litMaterial({ map: mothWing(), side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }, 0.05);
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    cached('moth-body', () =>
      merge([
        place(trunk([[0.001, -0.1], [0.018, -0.08], [0.03, -0.03], [0.028, 0.02], [0.001, 0.03]], 8), 0, 0, 0.03, -Math.PI / 2, 0, 0),
        lumpy(place(new THREE.SphereGeometry(0.032, 8, 6), 0, 0, -0.01), 0.006, 60),
        place(new THREE.SphereGeometry(0.018, 6, 5), 0, 0, -0.05),
        ...[-1, 1].map((s) => place(new THREE.ConeGeometry(0.003, 0.08, 3), s * 0.02, 0.02, -0.09, -1.1, 0, s * 0.4)),
      ]),
    ),
    litMaterial({ color: 0x4a3f30 }, 0.05),
  );
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    // ala con forma (más ancha delante), con la raíz pegada al cuerpo
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.02);
    shape.bezierCurveTo(0.08, 0.1, 0.2, 0.08, 0.22, -0.02);
    shape.bezierCurveTo(0.2, -0.1, 0.08, -0.12, 0, -0.04);
    const g = new THREE.ShapeGeometry(shape, 6);
    const uv = g.attributes.uv;
    const p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.22, (p.getY(i) + 0.12) / 0.24);
    if (s < 0) g.scale(-1, 1, 1);
    const w = new THREE.Mesh(g, wingMat);
    w.rotation.x = Math.PI / 2;
    wings.push(w);
  }
  group.add(body, ...wings);
  return {
    group,
    flap(t) {
      wings[0].rotation.y = Math.sin(t * 30) * 0.9;
      wings[1].rotation.y = -Math.sin(t * 30) * 0.9;
    },
  };
}

/** Death Rat: rata pelada, de piel rosácea y ojos rojos. */
export function makeRat(): THREE.Group {
  const skin = skinMat('rat', { base: '#a08070', mottle: '#7a5a50', veins: 'rgba(110,40,50,0.4)' });
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    cached('rat-body', () =>
      merge([
        lumpy(place(trunk([[0.001, -0.1], [0.045, -0.08], [0.055, 0], [0.045, 0.07], [0.025, 0.12], [0.001, 0.13]], 10), 0, 0.055, 0.02, -Math.PI / 2, 0, 0, 1, 0.85, 1), 0.004, 60),
        place(new THREE.ConeGeometry(0.032, 0.09, 8), 0, 0.055, -0.15, -Math.PI / 2, 0, 0), // hocico
        ...[-1, 1].map((s) => place(new THREE.CircleGeometry(0.018, 8), s * 0.025, 0.085, -0.11, 0, s * 0.5, 0)), // orejas
        ...[-1, 1].flatMap((s) => [-0.07, 0.06].map((z) => place(new THREE.SphereGeometry(0.012, 6, 4), s * 0.04, 0.012, z, 0, 0, 0, 1, 0.6, 1.6))), // patas
      ]),
    ),
    skin,
  );
  const tail = new THREE.Mesh(
    cached('rat-tail', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, 0.1), new THREE.Vector3(0.02, 0.02, 0.18), new THREE.Vector3(-0.03, 0.01, 0.27), new THREE.Vector3(0.02, 0.01, 0.35)]), 12, 0.006, 4)),
    skin,
  );
  const eyes = glowEyes(0xb01010, 0.02, 0.006);
  eyes.position.set(0, 0.07, -0.12);
  group.add(body, tail, eyes);
  return group;
}

// ---------- objetos ----------

const label = labelTexture();

export function makeBottle(): THREE.Group {
  const group = new THREE.Group();
  const profile = [
    [0, 0],
    [0.065, 0],
    [0.07, 0.01],
    [0.07, 0.19],
    [0.05, 0.23],
    [0.024, 0.26],
    [0.024, 0.29],
    [0, 0.29],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 20),
    litMaterial({ color: 0xe4f1ff, transparent: true, opacity: 0.55, emissive: 0x0b1218 }, 0.05),
  );
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.064, 0.064, 0.17, 20),
    litMaterial({ color: 0xf2ead5, transparent: true, opacity: 0.85, emissive: 0x15120c }, 0.05),
  );
  water.position.y = 0.095;
  const sticker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0715, 0.0715, 0.09, 20, 1, true),
    litMaterial({ map: label, emissive: 0x111111 }, 0.05),
  );
  sticker.position.y = 0.11;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.035, 12), litMaterial({ color: 0xf5f5f5, emissive: 0x222222 }, 0.05));
  cap.position.y = 0.305;
  group.add(water, sticker, glass, cap);
  return group;
}

export function makeBattery(): THREE.Group {
  const group = new THREE.Group();
  const body = litMaterial({ color: 0x1d1d1d, emissive: 0x0b0b0b }, 0.05);
  const band = litMaterial({ map: textTexture('AA  1.5V', '#1d1d1d', '#d8a619', 128, 32), emissive: 0x2a2000 }, 0.05);
  const metal = litMaterial({ color: 0xbbbbbb, emissive: 0x1a1a1a }, 0.05);
  for (const [x, rot] of [[-0.04, 0.2], [0.05, -0.3]] as const) {
    const cell = new THREE.Group();
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 14), body);
    a.position.y = -0.03;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 14), band);
    b.position.y = 0.045;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10), metal);
    tip.position.y = 0.076;
    cell.add(a, b, tip);
    cell.rotation.z = Math.PI / 2;
    cell.rotation.y = rot;
    cell.position.set(x, 0.03, x);
    group.add(cell);
  }
  return group;
}

/** Barrita energética envuelta. */
export function makeEnergyBar(): THREE.Group {
  const wrap = litMaterial({ map: textTexture('ENERGÍA', '#ffffff', '#c23a1c', 128, 32), emissive: 0x150500 }, 0.05);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.05), wrap);
  bar.position.y = 0.013;
  const end = (x: number) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.055), litMaterial({ color: 0xb0b0b0 }, 0.05));
    e.position.set(x, 0.013, 0);
    return e;
  };
  const g = new THREE.Group();
  g.add(bar, end(-0.087), end(0.087));
  return g;
}

/** Lata de conserva. */
export function makeCan(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 14), litMaterial({ map: textTexture('CONSERVA', '#f2ead0', '#7a2b1c', 128, 32), emissive: 0x100800 }, 0.05));
  body.position.y = 0.055;
  const metal = litMaterial({ color: 0xb8b8b0, emissive: 0x111111 }, 0.05);
  const rim = new THREE.Mesh(
    cached('can-rim', () =>
      merge([
        place(new THREE.TorusGeometry(0.044, 0.004, 4, 16), 0, 0.11, 0, Math.PI / 2),
        place(new THREE.TorusGeometry(0.044, 0.004, 4, 16), 0, 0.001, 0, Math.PI / 2),
        place(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 14), 0, 0.108, 0),
        place(new THREE.TorusGeometry(0.012, 0.003, 4, 10), 0.018, 0.112, 0, Math.PI / 2), // anilla
      ]),
    ),
    metal,
  );
  g.add(body, rim);
  return g;
}

/** Bengala (apagada). */
export function makeFlareStick(): THREE.Group {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 10), litMaterial({ color: 0xb2241a, emissive: 0x1a0000 }, 0.05));
  stick.rotation.z = Math.PI / 2;
  stick.position.y = 0.02;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 10), litMaterial({ color: 0xdddddd }, 0.05));
  cap.rotation.z = Math.PI / 2;
  cap.position.set(0.12, 0.02, 0);
  g.add(stick, cap);
  return g;
}

/** Bengala encendida en el suelo: chisporrotea en rojo. */
export function makeLitFlare(): { group: THREE.Group; update: (t: number, left: number) => void } {
  const g = makeFlareStick();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke(), color: new THREE.Color(3, 0.6, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(0.6);
  glow.position.set(-0.12, 0.05, 0);
  g.add(glow);
  return {
    group: g,
    update(t, left) {
      const k = Math.min(1, left / 3);
      glow.scale.setScalar((0.5 + Math.random() * 0.25) * k);
      (glow.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(t * 40) * 0.2;
    },
  };
}

/** Botiquín con vendas. */
export function makeMedkit(): THREE.Group {
  const g = new THREE.Group();
  const box = rounded(0.28, 0.2, 0.12, litMaterial({ color: 0xe8e4dc, emissive: 0x1a1a1a }, 0.05));
  box.rotation.x = Math.PI / 2;
  box.position.y = 0.06;
  const latches = new THREE.Mesh(cached('medkit-latch', () => merge([-0.07, 0.07].map((x) => place(new THREE.BoxGeometry(0.03, 0.04, 0.012), x, 0.07, -0.104)))), litMaterial({ color: 0x8a8a84 }, 0.05));
  g.add(latches);
  const red = litMaterial({ color: 0xc41e1e, emissive: 0x200000 }, 0.05);
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.005, 0.03), red);
  c1.position.y = 0.123;
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.1), red);
  c2.position.y = 0.123;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), litMaterial({ color: 0x333333 }, 0.05));
  handle.position.set(0, 0.06, -0.11);
  g.add(box, c1, c2, handle);
  return g;
}

/** Puerta metálica de salida con el cartel verde encima. */
export function makeExitDoor(label = 'SALIDA'): THREE.Group {
  const signTex = textTexture(label, '#8dff9b', '#06200b', 512, 64);
  const group = new THREE.Group();
  const frame = litMaterial({ color: 0x4a4a46 }, 0.3);
  const door = litMaterial({ color: 0x55665a }, 0.3);
  const metal = litMaterial({ color: 0xb0b0a8 }, 0.3);
  const w = 1.0;
  const h = 2.1;
  const post = new THREE.BoxGeometry(0.1, h, 0.08);
  const left = new THREE.Mesh(post, frame);
  left.position.set(-w / 2 - 0.05, h / 2, 0);
  const right = new THREE.Mesh(post, frame);
  right.position.set(w / 2 + 0.05, h / 2, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.1, 0.08), frame);
  top.position.set(0, h + 0.05, 0);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), door);
  slab.position.set(0, h / 2, -0.005);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, 0.05, 0.05), metal);
  bar.position.set(0, 1.0, 0.04);
  const window_ = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.45), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  window_.position.set(0, 1.6, 0.03);
  const signBox = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.2, 0.08), litMaterial({ color: 0x222222 }, 0.3));
  signBox.position.set(0, h + 0.3, 0.02);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.18, 0.15),
    new THREE.MeshBasicMaterial({ map: signTex, fog: false, color: new THREE.Color(2.2, 2.2, 2.2) }),
  );
  sign.position.set(0, h + 0.3, 0.061);
  group.add(left, right, top, slab, bar, window_, signBox, sign);
  return group;
}

// ---------- linterna en primera persona ----------

export interface ViewTorch {
  group: THREE.Group;
  setOn: (on: boolean) => void;
}

export function makeViewTorch(): ViewTorch {
  const group = new THREE.Group();
  const opts = { depthTest: false } as const;
  const metal = litMaterial({ color: 0x2a2a2a, emissive: 0x070707, ...opts }, 0);
  const grip = litMaterial({ color: 0x151515, emissive: 0x050505, ...opts }, 0);
  const skin = litMaterial({ color: 0xd9a98a, emissive: 0x120c08, ...opts }, 0);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x333333, ...opts });

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.2, 16), grip);
  tube.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, 0.06, 16), metal);
  head.rotation.x = -Math.PI / 2;
  head.position.z = -0.12;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), lensMat);
  lens.position.z = -0.151;
  lens.rotation.y = Math.PI;
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.02), metal);
  button.position.set(0, 0.024, -0.02);
  // mano sujetando la linterna y la manga
  const sleeve = litMaterial({ color: 0x3b4252, emissive: 0x08090b, ...opts }, 0);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), skin);
  hand.scale.set(1, 0.9, 1.6);
  hand.position.set(0.004, -0.008, 0.02);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.03, 4, 8), skin);
  thumb.rotation.x = Math.PI / 2;
  thumb.position.set(-0.022, 0.012, -0.01);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.08, 12), skin);
  wrist.rotation.x = Math.PI / 2;
  wrist.position.set(0.008, -0.01, 0.08);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.2, 12), sleeve);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0.012, -0.012, 0.21);
  group.add(tube, head, lens, button, hand, thumb, wrist, cuff);
  group.traverse((o) => (o.renderOrder = 10));
  group.position.set(0.17, -0.17, -0.38);
  group.rotation.set(0.05, 0.08, 0);
  return {
    group,
    setOn(on) {
      lensMat.color.set(on ? 0xfff6dd : 0x333333).multiplyScalar(on ? 2 : 1);
    },
  };
}
