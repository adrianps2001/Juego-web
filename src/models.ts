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

// ---------------------------------------------------------------- esqueleto

/**
 * Músculo o miembro de ropa colgando de su pivote (de y = 0 a y = -len): el
 * radio pasa de r0 a r1 con un vientre muscular en el primer tercio y una
 * articulación marcada abajo.
 */
function muscle(len: number, r0: number, r1: number, belly = 0.18, knob = 0.08, seg = 10): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0005, -len - r1 * 0.45)];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 abajo, 1 arriba
    let r = r1 + (r0 - r1) * t;
    r *= 1 + belly * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25)), 1.6) + knob * Math.exp(-((t - 0.04) ** 2) / 0.004);
    pts.push(new THREE.Vector2(r, -len + t * len));
  }
  pts.push(new THREE.Vector2(0.0005, r0 * 0.5));
  return new THREE.LatheGeometry(pts, seg);
}

/** Pivote vacío en una posición, colgado de un padre. */
function joint(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

/** Añade una malla a un pivote. */
function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}

interface Arm {
  upper: THREE.Group;
  fore: THREE.Group;
  hand: THREE.Group;
}
interface Leg {
  thigh: THREE.Group;
  shin: THREE.Group;
  foot: THREE.Group;
}

/** Esqueleto de un bípedo: de la cadera salen la columna y las piernas. */
interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  arms: [Arm, Arm];
  legs: [Leg, Leg];
  hipY: number;
}

interface RigSpec {
  hipY: number; // altura de la cadera
  hipW: number; // media anchura entre las piernas
  thigh: number;
  shin: number;
  spine: number; // de la cadera al pecho
  chest: number; // del pecho a los hombros
  shoulderW: number;
  upper: number;
  fore: number;
  neck: number;
}

function makeRig(s: RigSpec): Rig {
  const root = new THREE.Group();
  const hips = joint(root, 0, s.hipY, 0);
  const spine = joint(hips, 0, 0.06, 0);
  const chest = joint(spine, 0, s.spine, 0);
  const neck = joint(chest, 0, s.chest + 0.02, 0);
  const head = joint(neck, 0, s.neck, 0);
  const arm = (side: number): Arm => {
    const upper = joint(chest, side * s.shoulderW, s.chest - 0.03, 0);
    upper.userData.y0 = upper.position.y;
    const fore = joint(upper, 0, -s.upper, 0);
    const hand = joint(fore, 0, -s.fore, 0);
    return { upper, fore, hand };
  };
  const leg = (side: number): Leg => {
    const thigh = joint(hips, side * s.hipW, -0.02, 0);
    const shin = joint(thigh, 0, -s.thigh, 0);
    const foot = joint(shin, 0, -s.shin, 0);
    return { thigh, shin, foot };
  };
  return { root, hips, spine, chest, neck, head, arms: [arm(-1), arm(1)], legs: [leg(-1), leg(1)], hipY: s.hipY };
}

/** Manera de andar: cada criatura la suya. */
interface Gait {
  stride: number; // amplitud de la zancada (rad)
  knee: number; // cuánto dobla la rodilla al pasar la pierna
  arm: number; // balanceo de los brazos
  elbow: number; // codo doblado al ir hacia delante
  bob: number; // sube y baja la cadera (m)
  sway: number; // va de lado a lado (m)
  twist: number; // gira la cadera (y el pecho al revés)
  lean: number; // se inclina hacia delante
}

/** Acerca un valor a su objetivo poco a poco (las poses no saltan de golpe). */
const ease = (v: number, target: number, k: number) => v + (target - v) * k;

/**
 * Ciclo de marcha: `phase` avanza con la velocidad y `amt` (0..1) mezcla
 * entre estar quieto y andar del todo. La rodilla se dobla al adelantar la
 * pierna, el pie se queda plano en el suelo, la cadera sube y baja dos veces
 * por ciclo y va de lado a lado, el pecho gira al revés que la cadera y la
 * cabeza mira al frente.
 */
function walk(r: Rig, phase: number, amt: number, g: Gait, k: number, arms = true, extra: { roll?: number; look?: number; nod?: number } = {}) {
  r.legs.forEach((l, i) => {
    const p = phase + i * Math.PI;
    const sw = Math.sin(p);
    const swing = Math.max(0, Math.cos(p)); // la pierna va hacia delante: se dobla la rodilla
    const thigh = g.stride * sw * amt + g.lean * amt * 0.4;
    const shin = -(0.05 + g.knee * swing * swing + 0.12 * Math.max(0, -sw)) * amt;
    l.thigh.rotation.x = ease(l.thigh.rotation.x, thigh, k);
    l.shin.rotation.x = ease(l.shin.rotation.x, shin, k);
    // el pie plano en el suelo, y al despegar se apoya en la punta
    l.foot.rotation.x = ease(l.foot.rotation.x, -(thigh + shin) * 0.85 + Math.max(0, -Math.cos(p) * sw) * 0.35 * amt, k);
    if (!arms) return;
    const a = r.arms[i];
    a.upper.rotation.x = ease(a.upper.rotation.x, -g.arm * sw * amt, k);
    a.upper.rotation.z = ease(a.upper.rotation.z, (i ? -1 : 1) * 0.06, k);
    a.fore.rotation.x = ease(a.fore.rotation.x, 0.1 + g.elbow * (0.5 - 0.5 * sw) * amt, k);
  });
  r.hips.position.y = ease(r.hips.position.y, r.hipY - g.bob * amt * (0.5 - 0.5 * Math.cos(2 * phase)) - g.lean * amt * 0.05, k);
  r.hips.position.x = ease(r.hips.position.x, g.sway * amt * Math.sin(phase), k);
  r.hips.rotation.y = ease(r.hips.rotation.y, g.twist * amt * Math.sin(phase), k);
  r.hips.rotation.z = ease(r.hips.rotation.z, -g.sway * 3 * amt * Math.sin(phase) + (extra.roll ?? 0), k);
  r.spine.rotation.x = ease(r.spine.rotation.x, g.lean * amt, k);
  r.chest.rotation.y = ease(r.chest.rotation.y, -g.twist * 1.6 * amt * Math.sin(phase), k);
  r.head.rotation.y = ease(r.head.rotation.y, g.twist * 0.6 * amt * Math.sin(phase) + (extra.look ?? 0), k);
  r.neck.rotation.x = ease(r.neck.rotation.x, -g.lean * amt * 0.6 + (extra.nod ?? 0), k);
}

/** Respirar: el pecho se hincha y los hombros suben un poco. */
function breathe(r: Rig, time: number, depth = 1) {
  const b = Math.sin(time * 1.7) * depth;
  r.chest.scale.set(1 + b * 0.012, 1 + b * 0.008, 1 + b * 0.02);
  for (const a of r.arms) a.upper.position.y = a.upper.userData.y0 + b * 0.004;
}

/** Cabeza humana: cráneo, mandíbula, pómulos, nariz, cejas y orejas. */
function humanHead(r: number, o: { nose?: number; jaw?: number; ears?: boolean; brow?: number; long?: number } = {}): THREE.BufferGeometry {
  const L = o.long ?? 1;
  const parts = [
    lumpy(place(new THREE.SphereGeometry(r, 20, 16), 0, 0.01, 0.01, 0, 0, 0, 0.92, 1.08 * L, 1.06), 0.003, 20),
    place(new THREE.SphereGeometry(r * 0.62, 12, 10), 0, -r * 0.62 * L, -r * 0.28, 0.2, 0, 0, 0.95, 0.85, 1) , // mandíbula y barbilla
    place(new THREE.SphereGeometry(r * 0.28, 8, 6), -r * 0.5, -r * 0.18, -r * 0.62, 0, 0, 0, 1, 0.7, 0.8), // pómulos
    place(new THREE.SphereGeometry(r * 0.28, 8, 6), r * 0.5, -r * 0.18, -r * 0.62, 0, 0, 0, 1, 0.7, 0.8),
    place(new THREE.SphereGeometry(r * 0.55, 10, 6), 0, r * 0.32, -r * 0.62, 0, 0, 0, 1.25, (o.brow ?? 0.3) , 0.55), // cejas
  ];
  if (o.nose !== 0) parts.push(place(new THREE.ConeGeometry(r * 0.16 * (o.nose ?? 1), r * 0.5 * (o.nose ?? 1), 6), 0, -r * 0.08, -r * 1.0, -Math.PI / 2 - 0.35, 0, 0, 1, 1, 0.8));
  if (o.ears) for (const s of [-1, 1]) parts.push(place(new THREE.SphereGeometry(r * 0.22, 8, 6), s * r * 0.95, 0, 0.02, 0, 0, 0, 0.45, 1, 0.8));
  return merge(parts);
}

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

/** Geometría de un bloque redondeado (cápsula estirada a lo ancho). */
function roundedGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const r = Math.min(w, d) / 2;
  return new THREE.CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 4, 12).scale(w / (2 * r), 1, d / (2 * r));
}

/** Bota: puntera redondeada, caña y suela, desde el tobillo hacia delante. */
const bootGeo = () =>
  merge([
    lumpy(place(new THREE.CapsuleGeometry(0.055, 0.15, 4, 10), 0, -0.035, -0.06, Math.PI / 2, 0, 0, 1.05, 1, 0.8), 0.003, 40),
    place(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), 0, 0.01, 0),
    place(new THREE.BoxGeometry(0.115, 0.022, 0.25), 0, -0.07, -0.06),
  ]);

const WALK: Gait = { stride: 0.42, knee: 0.75, arm: 0.35, elbow: 0.35, bob: 0.035, sway: 0.018, twist: 0.12, lean: 0.03 };
const RUN: Gait = { stride: 0.7, knee: 1.5, arm: 0.75, elbow: 1.0, bob: 0.06, sway: 0.012, twist: 0.2, lean: 0.25 };

interface Explorer {
  h: Humanoid;
  rig: Rig;
}

/**
 * Explorador: chaqueta con capucha, mochila con esterilla, pantalón de
 * bolsillos y botas; la linterna en la mano derecha. Anda con un ciclo de
 * marcha completo (rodillas, tobillos, cadera que sube, baja y gira, brazos)
 * y, quieto, respira y cambia el peso de pierna.
 */
function makeExplorer(color: number, name: string): Explorer {
  const jacket = litMaterial({ color }, 0.1);
  const pants = skinMat('pants', { base: '#3a404c', mottle: '#20242c' });
  const skin = skinMat('human', { base: '#d6a688', mottle: '#b9806a' });
  const dark = litMaterial({ color: 0x1e1e1e }, 0.1);
  const hairMat = litMaterial({ color: 0x2a1d14 }, 0.1);
  const pack = skinMat('canvas', { base: '#5f4d34', mottle: '#3e3222', stitches: '#2a2116' });
  const strap = litMaterial({ color: 0x2b2620 }, 0.1);
  const r = makeRig({ hipY: 0.91, hipW: 0.095, thigh: 0.44, shin: 0.43, spine: 0.22, chest: 0.26, shoulderW: 0.205, upper: 0.29, fore: 0.27, neck: 0.09 });

  put(r.hips, cached('ex-pelvis', () => merge([place(roundedGeo(0.34, 0.2, 0.22), 0, -0.02, 0), place(new THREE.BoxGeometry(0.35, 0.045, 0.235), 0, 0.07, 0)])), pants);
  put(r.spine, cached('ex-belly', () => place(trunk([[0.001, -0.02], [0.152, -0.02], [0.158, 0.1], [0.172, 0.23], [0.001, 0.24]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.66)), jacket);
  put(r.chest, cached('ex-chest', () => place(trunk([[0.001, -0.02], [0.172, -0.02], [0.19, 0.11], [0.214, 0.2], [0.19, 0.265], [0.075, 0.3], [0.001, 0.3]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.64)), jacket);
  put(
    r.chest,
    cached('ex-straps', () =>
      merge([
        place(new THREE.BoxGeometry(0.012, 0.3, 0.01), 0, 0.12, -0.132), // cremallera
        place(new THREE.TorusGeometry(0.11, 0.04, 6, 14, Math.PI), 0, 0.27, 0.05, -1.25, 0, 0, 1, 1, 0.9), // capucha
        place(new THREE.BoxGeometry(0.035, 0.34, 0.014), -0.095, 0.11, -0.13, 0.06), // tirantes
        place(new THREE.BoxGeometry(0.035, 0.34, 0.014), 0.095, 0.11, -0.13, 0.06),
        place(new THREE.BoxGeometry(0.2, 0.025, 0.012), 0, 0.15, -0.135), // cinta del pecho
      ]),
    ),
    strap,
  );
  const packMesh = put(r.chest, cached('ex-pack', () => merge([place(roundedGeo(0.32, 0.4, 0.16), 0, 0.08, 0.19), place(roundedGeo(0.28, 0.1, 0.06), 0, 0.27, 0.22), place(roundedGeo(0.22, 0.14, 0.05), 0, -0.02, 0.27)])), pack);
  packMesh.renderOrder = 0;
  put(r.chest, cached('ex-roll', () => place(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 10), 0, 0.34, 0.2, 0, 0, Math.PI / 2)), litMaterial({ color: 0x4f6a3a }, 0.1));
  put(r.neck, cached('ex-neck', () => place(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 10), 0, 0.03, 0)), skin);
  put(r.head, cached('ex-head', () => place(humanHead(0.105, { ears: true }), 0, 0.1, 0)), skin);
  put(r.head, cached('ex-hair', () => lumpy(place(new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.13, 0.012, 0.32, 0, 0, 0.98, 1.05, 1.08), 0.007, 30)), hairMat);
  put(
    r.head,
    cached('ex-eyes', () => merge([-1, 1].flatMap((s) => [place(new THREE.SphereGeometry(0.013, 8, 6), s * 0.038, 0.115, -0.093), place(new THREE.BoxGeometry(0.038, 0.008, 0.01), s * 0.038, 0.143, -0.1, 0, 0, s * -0.12)]))),
    new THREE.MeshBasicMaterial({ color: 0x15100c }),
  );
  for (const l of r.legs) {
    put(l.thigh, cached('ex-thigh', () => merge([muscle(0.44, 0.088, 0.062, 0.12), place(new THREE.BoxGeometry(0.04, 0.12, 0.1), 0.08, -0.22, 0)])), pants);
    put(l.shin, cached('ex-shin', () => muscle(0.43, 0.066, 0.048, 0.2)), pants);
    put(l.foot, cached('ex-boot', bootGeo), dark);
  }
  for (const a of r.arms) {
    put(a.upper, cached('ex-upper', () => muscle(0.29, 0.068, 0.052, 0.14)), jacket);
    put(a.fore, cached('ex-fore', () => merge([muscle(0.27, 0.056, 0.044, 0.12), place(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), 0, -0.25, 0)])), jacket);
    put(a.hand, cached('ex-hand', () => handGeo(4, 0.075, 0.012, 0.05, 0, 0.5)), skin);
  }
  // linterna en la mano derecha, apuntando hacia delante
  const torch = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 10), dark);
  tube.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.033, 12), new THREE.MeshBasicMaterial({ color: 0x333333 }));
  lens.position.z = -0.101;
  lens.rotation.y = Math.PI;
  torch.add(tube, lens);
  torch.rotation.x = -Math.PI / 2;
  torch.position.set(0, -0.06, 0);
  r.arms[1].hand.add(torch);
  const beamGeo = new THREE.ConeGeometry(1.3, 7, 24, 1, true);
  beamGeo.translate(0, -3.5, 0);
  beamGeo.rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.rotation.x = Math.PI;
  beam.position.z = -0.1;
  beam.visible = false;
  torch.add(beam);

  const group = r.root;
  group.add(makeLabel(name));
  let phase = 0;
  let amt = 0;
  let time = Math.random() * 10;
  const h: Humanoid = {
    group,
    setLight(on) {
      beam.visible = on;
      (lens.material as THREE.MeshBasicMaterial).color.set(on ? 0xfff6dd : 0x333333);
    },
    animate(dt, speed) {
      time += dt;
      const moving = speed > 0.3;
      amt = ease(amt, moving ? Math.min(1, speed / 2.2) : 0, 1 - Math.exp(-6 * dt));
      phase += dt * (moving ? 2.4 + speed * 1.5 : 0);
      const k = 1 - Math.exp(-14 * dt);
      // quieto: cambia el peso de una pierna a otra y mira alrededor
      const still = 1 - amt;
      walk(r, phase, amt, speed > 4 ? RUN : WALK, k, true, { roll: Math.sin(time * 0.45) * 0.025 * still, look: Math.sin(time * 0.3) * 0.3 * still });
      // la mano derecha sostiene la linterna al frente; con un poco de vaivén
      const torchArm = r.arms[1];
      torchArm.upper.rotation.x = ease(torchArm.upper.rotation.x, 1.12 + Math.sin(phase * 2) * 0.04 * amt + Math.sin(time * 1.3) * 0.015, k);
      torchArm.upper.rotation.z = ease(torchArm.upper.rotation.z, -0.08, k);
      torchArm.fore.rotation.x = ease(torchArm.fore.rotation.x, 0.32, k);
      breathe(r, time, still);
    },
  };
  return { h, rig: r };
}

/** Explorador (los jugadores). */
export function makeHumanoid(color: number, name: string): Humanoid {
  return makeExplorer(color, name).h;
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
  const pawGeo = cached('hound-paw', () => place(handGeo(4, 0.12, 0.012, 0.07, 0.045, 0.3), 0, 0, -0.02, (Math.PI / 2) * 0.85, 0, 0));
  // patas: delante izquierda, delante derecha, detrás izquierda, detrás derecha
  const limbs: { upper: THREE.Group; lower: THREE.Group; paw: THREE.Group; front: boolean; walk: number; bound: number }[] = [];
  for (const [x, z, front, walkPh, boundPh] of [[-0.2, -0.38, true, 0.25, 0], [0.2, -0.38, true, 0.75, 0.15], [-0.18, 0.38, false, 0, Math.PI], [0.18, 0.38, false, 0.5, Math.PI + 0.15]] as const) {
    const upper = hang(upperGeo, skin);
    upper.position.set(x, 0, z);
    const lower = hang(lowerGeo, skin);
    lower.position.y = -0.42;
    upper.add(lower);
    const paw = joint(lower, 0, -0.42, 0);
    put(paw, pawGeo, skin);
    body.add(upper);
    limbs.push({ upper, lower, paw, front, walk: walkPh * Math.PI * 2, bound: boundPh });
  }

  let cycle = 0;
  let amt = 0;
  let lunge = 0;
  return {
    group,
    eye: 0.85,
    animate(dt, time, anim) {
      const run = anim === Anim.Run || anim === Anim.Flee;
      const moving = run || anim === Anim.Walk;
      const growl = anim === Anim.Growl || anim === Anim.Attack;
      const k = 1 - Math.exp(-16 * dt);
      amt = ease(amt, moving ? 1 : 0, 1 - Math.exp(-7 * dt));
      cycle += dt * (run ? 10 : moving ? 5 : 0);
      for (const l of limbs) {
        // al paso, una pata detrás de otra; a la carrera, a saltos (las de delante juntas y luego las de detrás)
        const p = cycle + (run ? l.bound : l.walk);
        const s = Math.sin(p);
        const lift = Math.max(0, Math.cos(p)); // la pata va hacia delante, en el aire
        const amp = run ? 0.75 : 0.42;
        const upper = s * amp * amt + (growl ? (l.front ? -0.25 : 0.35) : 0);
        // codo hacia atrás en las de delante; corvejón hacia delante en las de detrás
        const bend = (0.15 + lift * (run ? 1.3 : 0.8)) * amt + (growl ? 0.45 : 0.12 * (1 - amt));
        const lower = l.front ? -bend : bend;
        l.upper.rotation.x = ease(l.upper.rotation.x, upper, k);
        l.lower.rotation.x = ease(l.lower.rotation.x, lower, k);
        // la mano/pie se queda plana en el suelo y se dobla al despegar
        l.paw.rotation.x = ease(l.paw.rotation.x, -(upper + lower) * 0.9 + (l.front ? 1 : -1) * lift * 0.5 * amt, k);
      }
      // la espalda se dobla y se estira a la carrera; al paso, se balancea
      const flex = Math.sin(cycle * 1) * amt;
      const breath = Math.sin(time * (growl ? 9 : 3.2));
      body.position.y = ease(body.position.y, 0.75 + (run ? Math.abs(Math.sin(cycle)) * 0.1 : moving ? Math.abs(Math.sin(cycle * 2)) * 0.025 : breath * 0.008) - (growl ? 0.17 : 0), k);
      body.rotation.x = ease(body.rotation.x, (run ? -0.1 + flex * 0.12 : growl ? 0.14 : 0) + Math.sin(time * 40) * 0.01 * (growl ? 1 : 0), k);
      body.rotation.z = ease(body.rotation.z, moving && !run ? Math.sin(cycle) * 0.04 : 0, k);
      torso.scale.set(1 + breath * 0.02, 1 + breath * 0.03, 1);
      // la cabeza: baja y por delante al correr; husmea quieto; tiembla al gruñir
      head.rotation.x = ease(head.rotation.x, growl ? 0.3 + Math.sin(time * 30) * 0.04 : run ? 0.15 + Math.sin(cycle * 2) * 0.06 : Math.sin(time * 0.8 + seed) * 0.12 + Math.max(0, Math.sin(time * 6)) * 0.03 * (1 - amt), k);
      head.rotation.y = ease(head.rotation.y, moving ? Math.sin(cycle) * 0.06 : Math.sin(time * 0.5 + seed) * 0.4, k);
      // jadea quieto; la boca abierta del todo al gruñir
      jaw.position.y = growl ? -0.17 - Math.abs(Math.sin(time * 14)) * 0.01 : -0.12 - Math.max(0, Math.sin(time * 7)) * 0.02 * (1 - amt);
      // al atacar se lanza con todo el cuerpo hacia delante
      lunge = anim === Anim.Attack ? Math.abs(Math.sin(time * 12)) : ease(lunge, 0, k);
      head.position.z = -0.6 - lunge * 0.15;
      body.position.z = -lunge * 0.12;
    },
  };
}

/**
 * Faceling: alguien alto y delgado, de cuello largo, con traje, camisa y
 * corbata. La piel es pálida como la porcelana y la cara está lisa: solo se
 * adivina el relieve de la nariz y de las cejas. Quieto no se mueve nada salvo
 * la cabeza, que se ladea despacio (y a veces da un respingo); anda rígido,
 * como un maniquí; hostil, echa los brazos al frente y corre a trompicones.
 */
export function makeFaceling(seed: number): EnemyModel {
  const skin = skinMat('faceling', { base: '#d9d0c4', mottle: '#c7baab', veins: 'rgba(110,120,150,0.22)' });
  const suit = litMaterial({ color: [0x3a3d44, 0x4a3d34, 0x2f3a33][Math.floor(seed) % 3] }, 0.1);
  const shirt = litMaterial({ color: 0xbcb6a8 }, 0.1);
  const black = litMaterial({ color: 0x111111 }, 0.1);
  const r = makeRig({ hipY: 1.02, hipW: 0.09, thigh: 0.5, shin: 0.49, spine: 0.26, chest: 0.3, shoulderW: 0.205, upper: 0.34, fore: 0.32, neck: 0.16 });
  put(r.hips, cached('fc-pelvis', () => merge([place(roundedGeo(0.32, 0.2, 0.2), 0, -0.02, 0), place(new THREE.BoxGeometry(0.33, 0.04, 0.21), 0, 0.07, 0)])), suit);
  put(r.spine, cached('fc-belly', () => place(trunk([[0.001, -0.02], [0.15, -0.02], [0.148, 0.12], [0.16, 0.26], [0.001, 0.27]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.64)), suit);
  put(r.chest, cached('fc-chest', () => place(trunk([[0.001, -0.02], [0.16, -0.02], [0.18, 0.14], [0.215, 0.25], [0.18, 0.31], [0.06, 0.34], [0.001, 0.34]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.62)), suit);
  put(r.chest, cached('fc-shirt', () => merge([place(new THREE.ConeGeometry(0.075, 0.28, 3), 0, 0.2, -0.122, Math.PI, 0, 0, 1, 1, 0.08), place(new THREE.TorusGeometry(0.052, 0.012, 4, 12), 0, 0.32, -0.01, Math.PI / 2)])), shirt);
  put(r.chest, cached('fc-tie', () => merge([place(new THREE.BoxGeometry(0.042, 0.28, 0.01), 0, 0.16, -0.132), place(new THREE.BoxGeometry(0.048, 0.045, 0.02), 0, 0.31, -0.13)])), litMaterial({ color: 0x3a1418 }, 0.1));
  put(r.chest, cached('fc-lapels', () => merge([place(new THREE.BoxGeometry(0.065, 0.26, 0.012), -0.07, 0.2, -0.125, 0, 0, -0.27), place(new THREE.BoxGeometry(0.065, 0.26, 0.012), 0.07, 0.2, -0.125, 0, 0, 0.27)])), black);
  put(r.spine, cached('fc-buttons', () => merge([0.06, 0.16].map((y) => place(new THREE.SphereGeometry(0.011, 6, 4), 0, y, -0.105)))), black);
  put(r.neck, cached('fc-neck', () => place(new THREE.CylinderGeometry(0.042, 0.052, 0.22, 10), 0, 0.07, 0)), skin);
  // cabeza lisa: sin ojos ni boca
  put(r.head, cached('fc-head', () => place(humanHead(0.1, { nose: 0.45, brow: 0.18, long: 1.2 }), 0, 0.12, 0)), skin);
  for (const l of r.legs) {
    put(l.thigh, cached('fc-thigh', () => merge([muscle(0.5, 0.078, 0.06, 0.06), place(new THREE.BoxGeometry(0.006, 0.48, 0.004), 0, -0.25, -0.075)])), suit);
    put(l.shin, cached('fc-shin', () => muscle(0.49, 0.062, 0.055, 0.04)), suit);
    put(l.foot, cached('fc-shoe', () => merge([lumpy(place(new THREE.CapsuleGeometry(0.048, 0.18, 4, 10), 0, -0.035, -0.07, Math.PI / 2, 0, 0, 1, 0.75, 1), 0.002, 40), place(new THREE.BoxGeometry(0.1, 0.015, 0.27), 0, -0.065, -0.07)])), black);
  }
  for (const a of r.arms) {
    put(a.upper, cached('fc-upper', () => muscle(0.34, 0.058, 0.048, 0.08)), suit);
    put(a.fore, cached('fc-fore', () => merge([muscle(0.32, 0.05, 0.042, 0.06), place(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 10), 0, -0.31, 0)])), suit);
    put(a.hand, cached('fc-hand', () => handGeo(5, 0.12, 0.011, 0.085, 0, 0.35)), skin);
  }
  const STIFF: Gait = { stride: 0.3, knee: 0.22, arm: 0.06, elbow: 0.04, bob: 0.008, sway: 0.004, twist: 0, lean: 0 };
  const LUNGE: Gait = { stride: 0.62, knee: 1.15, arm: 0, elbow: 0, bob: 0.05, sway: 0.01, twist: 0.05, lean: 0.32 };
  let phase = seed;
  let amt = 0;
  let twitch = 0;
  let twitchZ = 0;
  return {
    group: r.root,
    eye: 1.95,
    animate(dt, time, anim) {
      const moving = anim === Anim.Walk || anim === Anim.Run || anim === Anim.Flee;
      const hostile = anim === Anim.Run || anim === Anim.Attack;
      const k = 1 - Math.exp(-(hostile ? 22 : 10) * dt);
      amt = ease(amt, moving ? 1 : 0, 1 - Math.exp(-6 * dt));
      phase += dt * (anim === Anim.Run ? 7.5 : moving ? 3.4 : 0);
      // a veces, un respingo de la cabeza
      if ((twitch -= dt) <= 0 && Math.random() < dt * 0.25) {
        twitch = 0.18;
        twitchZ = (Math.random() - 0.5) * 0.9;
      }
      const tilt = Math.sin(time * 0.4 + seed) * 0.25 + (twitch > 0 ? twitchZ : 0) + (hostile ? 0.35 : 0);
      walk(r, phase, amt, hostile ? LUNGE : STIFF, k, !hostile, { nod: anim === Anim.Idle ? Math.sin(time * 0.3 + seed) * 0.15 : 0 });
      r.head.rotation.z = ease(r.head.rotation.z, tilt, twitch > 0 ? 0.6 : k);
      if (hostile) {
        // los brazos al frente, temblando, con las manos abiertas
        r.arms.forEach((a, i) => {
          a.upper.rotation.x = ease(a.upper.rotation.x, 1.35 + Math.sin(time * 9 + i) * 0.1, k);
          a.upper.rotation.z = ease(a.upper.rotation.z, (i ? -1 : 1) * 0.1, k);
          a.fore.rotation.x = ease(a.fore.rotation.x, 0.1 + Math.cos(time * 11 + i) * 0.08, k);
          a.hand.rotation.x = ease(a.hand.rotation.x, -0.3, k);
        });
      } else for (const a of r.arms) a.hand.rotation.x = ease(a.hand.rotation.x, 0, k);
      breathe(r, time, 0.4 * (1 - amt));
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
 * Skin-Stealer: casi dos metros y medio de criatura flaca y encorvada, de piel
 * amarillenta y estirada: costillas, clavículas y rodillas marcadas, ojos
 * blancos hundidos y una boca de oreja a oreja. Lleva colgando jirones de piel
 * humana (y una cara). Los brazos le cuelgan hasta las rodillas y se balancean
 * sueltos al andar; corre echado hacia delante, con las garras por delante.
 * Disfrazado es alguien con sudadera que llora de rodillas, tapándose la cara.
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
  back.position.set(0, 0.5, -0.02);
  back.rotation.x = 0.62;
  const dHead = new THREE.Mesh(cached('ss-dhead', () => humanHead(0.1, { ears: true })), skin);
  dHead.position.set(0, 0.74, -0.32);
  dHead.rotation.x = 0.6;
  dHead.add(new THREE.Mesh(cached('ss-dhair', () => hairGeo(26, 5, 0.11, 0.35, 10)), hairMat));
  // los brazos (con las manos en la cara) tiemblan con el llanto
  const arms0 = new THREE.Group();
  arms0.position.set(0, 0.7, -0.16);
  arms0.add(
    new THREE.Mesh(cached('ss-sleeves', () => merge([place(new THREE.CapsuleGeometry(0.052, 0.34, 4, 8), -0.13, -0.08, -0.14, 1.1, 0, 0.5), place(new THREE.CapsuleGeometry(0.052, 0.34, 4, 8), 0.13, -0.08, -0.14, 1.1, 0, -0.5)])), cloth),
    new THREE.Mesh(cached('ss-hands2', () => merge([place(handGeo(4, 0.06, 0.01, 0.04, 0, 0.6), -0.05, 0.06, -0.25, 2.3, 0, 0.4), place(handGeo(4, 0.06, 0.01, 0.04, 0, 0.6), 0.05, 0.06, -0.25, 2.3, 0, -0.4)])), skin),
  );
  // sentada sobre los talones: muslos hacia delante y espinillas en el suelo
  const legs0 = new THREE.Mesh(
    cached('ss-kneel', () =>
      merge([
        place(roundedGeo(0.34, 0.2, 0.22), 0, 0.24, 0.1),
        ...[-1, 1].flatMap((s) => [
          place(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), s * 0.1, 0.17, -0.08, Math.PI / 2 - 0.25),
          place(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), s * 0.1, 0.06, -0.04, Math.PI / 2),
        ]),
      ]),
    ),
    jeans,
  );
  const shoes0 = new THREE.Mesh(cached('ss-kneel-shoes', () => merge([-1, 1].map((s) => place(new THREE.BoxGeometry(0.09, 0.06, 0.2), s * 0.1, 0.07, 0.22, -0.9)))), litMaterial({ color: 0x1a1a1a }, 0.1));
  disguise.add(back, dHead, arms0, legs0, shoes0);

  // ---- forma real ----
  const r = makeRig({ hipY: 1.34, hipW: 0.1, thigh: 0.66, shin: 0.64, spine: 0.32, chest: 0.4, shoulderW: 0.21, upper: 0.5, fore: 0.52, neck: 0.15 });
  const real = r.root;
  put(r.hips, cached('ss-pelvis', () => merge([lumpy(place(new THREE.SphereGeometry(0.12, 12, 10), 0, -0.01, 0, 0, 0, 0, 1.15, 0.75, 0.8), 0.01, 18), ...[-1, 1].map((s) => place(new THREE.SphereGeometry(0.05, 8, 6), s * 0.11, 0.03, -0.03))])), pale);
  put(r.spine, cached('ss-belly', () => lumpy(place(trunk([[0.001, -0.02], [0.09, -0.02], [0.08, 0.12], [0.1, 0.24], [0.13, 0.33], [0.001, 0.34]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.7), 0.008, 16, 3)), pale);
  put(
    r.chest,
    cached('ss-torso', () =>
      merge([
        lumpy(place(trunk([[0.001, -0.02], [0.13, -0.02], [0.17, 0.16], [0.2, 0.3], [0.19, 0.38], [0.06, 0.43], [0.001, 0.43]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.68), 0.01, 14, 4),
        place(ribsGeo(6, -0.08, 0.06, 0.17, 0, 0.01), 0, 0.17, 0, Math.PI / 2, 0, 0),
        place(new THREE.CapsuleGeometry(0.025, 0.36, 4, 6), 0, 0.37, -0.05, 0, 0, Math.PI / 2), // clavículas
        ...[-1, 1].map((s) => lumpy(place(new THREE.SphereGeometry(0.07, 10, 8), s * 0.19, 0.36, 0, 0, 0, s * 0.4, 1.2, 0.8, 0.8), 0.008, 20)), // hombros
        ...[-1, 1].map((s) => place(new THREE.SphereGeometry(0.07, 8, 6), s * 0.08, 0.27, 0.11, 0, 0, 0, 1, 1.4, 0.4)), // omóplatos
      ]),
    ),
    pale,
  );
  // jirones de piel humana colgando y una cara
  for (let i = 0; i < 6; i++) {
    const flap = put(i < 3 ? r.chest : r.spine, cached(`ss-flap${i % 3}`, () => flapGeo(0.2, 0.4 + (i % 3) * 0.15, i + 11)), skin);
    const a = (i / 6) * Math.PI * 2 + 0.4;
    flap.position.set(Math.cos(a) * 0.15, i < 3 ? 0.3 : 0.3, Math.sin(a) * 0.11);
    flap.rotation.y = -a + Math.PI / 2;
  }
  const face = put(r.chest, cached('ss-face', () => new THREE.PlaneGeometry(0.17, 0.23)), litMaterial({ map: stolenFaceTex(), transparent: true, side: THREE.DoubleSide }, 0.1));
  face.position.set(0.06, 0.12, -0.13);
  face.rotation.set(0.2, Math.PI, 0.25);
  put(r.neck, cached('ss-neck', () => lumpy(place(new THREE.CylinderGeometry(0.036, 0.05, 0.2, 8), 0, 0.06, 0), 0.006, 30)), pale);
  const headG = new THREE.Group();
  headG.position.y = 0.12;
  r.head.add(headG);
  headG.add(
    new THREE.Mesh(cached('ss-skull', () => merge([lumpy(place(new THREE.SphereGeometry(0.14, 16, 12), 0, 0, 0, 0, 0, 0, 0.8, 1.4, 1), 0.01, 16, 6), place(new THREE.SphereGeometry(0.06, 8, 6), 0, -0.12, -0.04, 0, 0, 0, 1.5, 0.6, 1.4)])), pale),
    new THREE.Mesh(cached('ss-holes', () => merge([place(new THREE.SphereGeometry(0.04, 8, 6), -0.05, 0.04, -0.115), place(new THREE.SphereGeometry(0.04, 8, 6), 0.05, 0.04, -0.115), place(new THREE.SphereGeometry(0.1, 12, 6), 0, -0.1, -0.08, 0, 0, 0, 1.15, 0.22, 0.75)])), voidMat()),
    new THREE.Mesh(cached('eyes0.05|0.016', () => merge([place(new THREE.SphereGeometry(0.016, 8, 6), -0.05), place(new THREE.SphereGeometry(0.016, 8, 6), 0.05)])), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.5), fog: false })),
    new THREE.Mesh(cached('ss-teeth', () => merge([place(teethGeo(14, 0.2, 0.04, 0.005, true, 1.2), 0, -0.085, -0.13), place(teethGeo(13, 0.18, 0.035, 0.005, false, 1.2), 0, -0.115, -0.125)])), tooth),
  );
  headG.children[2].position.set(0, 0.04, -0.13);
  for (const l of r.legs) {
    put(l.thigh, cached('ss-thigh', () => muscle(0.66, 0.07, 0.045, 0.1, 0.35)), pale);
    put(l.shin, cached('ss-shin', () => muscle(0.64, 0.05, 0.032, 0.12, 0.3)), paleDark);
    put(l.foot, cached('ss-foot', () => merge([place(new THREE.SphereGeometry(0.04, 8, 6), 0, -0.02, 0), place(handGeo(5, 0.13, 0.011, 0.08, 0.03, 1.35), 0, 0, 0.02, 0, Math.PI, 0)])), paleDark);
  }
  for (const a of r.arms) {
    put(a.upper, cached('ss-upper', () => muscle(0.5, 0.055, 0.04, 0.08, 0.35)), pale);
    put(a.fore, cached('ss-fore', () => muscle(0.52, 0.042, 0.03, 0.1, 0.3)), paleDark);
    put(a.hand, cached('ss-hand', () => handGeo(5, 0.24, 0.01, 0.075, 0.06, 0.25)), paleDark);
  }
  group.add(disguise, real);

  const STALK: Gait = { stride: 0.5, knee: 1.2, arm: 0.15, elbow: 0.05, bob: 0.06, sway: 0.03, twist: 0.14, lean: 0.38 };
  const SPRINT: Gait = { stride: 0.85, knee: 1.7, arm: 0, elbow: 0, bob: 0.08, sway: 0.02, twist: 0.2, lean: 0.75 };
  let phase = seed;
  let amt = 0;
  let jerk = 0;
  let jerkZ = 0;
  // los brazos se balancean sueltos, con retraso (como un péndulo)
  const swing = [0, 0];
  const swingV = [0, 0];
  return {
    group,
    eye: 2.3,
    animate(dt, time, anim) {
      const disguised = anim === Anim.Disguise;
      disguise.visible = disguised;
      real.visible = !disguised;
      if (disguised) {
        // sollozos: los hombros dan sacudidas y la cabeza tiembla; a veces levanta un poco la vista
        const sob = Math.max(0, Math.sin(time * 9)) * (0.6 + 0.4 * Math.sin(time * 0.7));
        back.position.y = 0.5 + sob * 0.018;
        back.rotation.z = Math.sin(time * 19) * 0.012 * sob;
        dHead.position.y = 0.74 + sob * 0.014;
        dHead.rotation.x = 0.6 - Math.max(0, Math.sin(time * 0.35 + seed) - 0.85) * 3;
        arms0.position.y = 0.7 + sob * 0.012;
        arms0.rotation.z = Math.sin(time * 23) * 0.015 * sob;
        return;
      }
      const moving = anim === Anim.Walk || anim === Anim.Run || anim === Anim.Flee;
      const run = anim === Anim.Run || anim === Anim.Flee;
      const k = 1 - Math.exp(-14 * dt);
      amt = ease(amt, moving ? 1 : 0, 1 - Math.exp(-5 * dt));
      phase += dt * (run ? 8 : moving ? 2.6 : 0);
      if ((jerk -= dt) <= 0 && Math.random() < dt * 0.6) {
        jerk = 0.12;
        jerkZ = (Math.random() - 0.5) * 1.1;
      }
      walk(r, phase, amt, run ? SPRINT : STALK, k, false, { look: Math.sin(time * 0.5 + seed) * 0.3 * (1 - amt) });
      // encorvado incluso quieto, respirando hondo
      r.spine.rotation.x = ease(r.spine.rotation.x, (run ? SPRINT.lean : STALK.lean) * Math.max(amt, 0.75) + Math.sin(time * 1.4) * 0.03, k);
      r.head.rotation.z = ease(r.head.rotation.z, Math.sin(time * 0.6 + seed) * 0.15 + (jerk > 0 ? jerkZ : 0), jerk > 0 ? 0.7 : k);
      if (anim === Anim.Attack) {
        // se yergue y lanza zarpazos con los dos brazos
        const slash = Math.max(0, Math.sin(time * 10));
        r.arms.forEach((a, i) => {
          a.upper.rotation.x = ease(a.upper.rotation.x, 2.5 - slash * 1.8 + i * 0.2, 0.5);
          a.upper.rotation.z = ease(a.upper.rotation.z, (i ? -1 : 1) * 0.35, k);
          a.fore.rotation.x = ease(a.fore.rotation.x, 0.5 + slash * 0.6, 0.5);
        });
        r.spine.rotation.x = ease(r.spine.rotation.x, 0.05 + slash * 0.35, 0.4);
      } else if (run) {
        // a la carrera: las garras por delante, alternando
        r.arms.forEach((a, i) => {
          const s = Math.sin(phase + (i ? 0 : Math.PI));
          a.upper.rotation.x = ease(a.upper.rotation.x, 1.0 + s * 0.7, k);
          a.upper.rotation.z = ease(a.upper.rotation.z, (i ? -1 : 1) * 0.15, k);
          a.fore.rotation.x = ease(a.fore.rotation.x, 0.4 - s * 0.3, k);
        });
      } else {
        // los brazos cuelgan y se balancean solos
        r.arms.forEach((a, i) => {
          const drive = -STALK.stride * Math.sin(phase + i * Math.PI) * amt * 0.9 + r.spine.rotation.x * 0.6;
          swingV[i] += ((drive - swing[i]) * 30 - swingV[i] * 4) * dt;
          swing[i] += swingV[i] * dt;
          a.upper.rotation.x = swing[i];
          a.upper.rotation.z = (i ? -1 : 1) * 0.12;
          a.fore.rotation.x = ease(a.fore.rotation.x, 0.15 + Math.max(0, swingV[i]) * 0.08, k);
          a.hand.rotation.x = Math.sin(time * 3 + i) * 0.1;
        });
      }
      breathe(r, time, 1.6);
    },
  };
}

/** Pone la misma malla de sombra en cada hueso (la figura es toda negra). */
function shadowLimbs(r: Rig, mat: THREE.Material) {
  for (const l of r.legs) {
    put(l.thigh, cached('fig-thigh', () => muscle(0.5, 0.075, 0.05, 0.05)), mat);
    put(l.shin, cached('fig-shin', () => muscle(0.48, 0.05, 0.035, 0.05)), mat);
    put(l.foot, cached('fig-foot', () => place(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), 0, -0.03, -0.06, Math.PI / 2)), mat);
  }
  for (const a of r.arms) {
    put(a.upper, cached('fig-upper', () => muscle(0.48, 0.05, 0.035, 0.04)), mat);
    put(a.fore, cached('fig-fore', () => muscle(0.5, 0.036, 0.028, 0.04)), mat);
    put(a.hand, cached('fig-hand', () => handGeo(4, 0.2, 0.009, 0.05, 0, 0.15)), mat);
  }
}

/**
 * Figura oscura (Nivel 0): una silueta alta y flaca, de brazos que le llegan
 * a las rodillas y la cabeza adelantada. El borde se deshace como humo y, a
 * veces, se le ven dos puntos de luz donde irían los ojos. Casi no se mueve:
 * cuando anda parece flotar, y de vez en cuando da un tirón seco con la cabeza.
 */
export function makeFigure(): EnemyModel {
  const shadow = new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.88, depthWrite: false });
  const r = makeRig({ hipY: 1.0, hipW: 0.075, thigh: 0.5, shin: 0.48, spine: 0.3, chest: 0.36, shoulderW: 0.19, upper: 0.48, fore: 0.5, neck: 0.12 });
  const group = r.root;
  put(r.hips, cached('fig-hips', () => place(roundedGeo(0.24, 0.18, 0.15), 0, -0.02, 0)), shadow);
  put(r.spine, cached('fig-belly', () => place(trunk([[0.001, -0.02], [0.1, -0.02], [0.095, 0.15], [0.12, 0.3], [0.001, 0.31]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.6)), shadow);
  put(r.chest, cached('fig-chest', () => place(trunk([[0.001, -0.02], [0.12, -0.02], [0.16, 0.18], [0.19, 0.32], [0.08, 0.39], [0.001, 0.39]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.55)), shadow);
  put(r.neck, cached('fig-neck', () => place(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 8), 0, 0.04, 0)), shadow);
  put(r.head, cached('fig-head', () => place(new THREE.SphereGeometry(0.115, 14, 10), 0, 0.12, -0.03, 0.2, 0, 0, 0.88, 1.22, 1)), shadow);
  shadowLimbs(r, shadow);
  r.neck.rotation.x = 0.35; // la cabeza adelantada
  const wisp = new THREE.SpriteMaterial({ map: smoke(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  const wisps: THREE.Sprite[] = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(wisp);
    s.scale.setScalar(0.45 + (i % 3) * 0.12);
    s.position.set(Math.sin(i * 2.3) * 0.22, 0.4 + i * 0.2, Math.cos(i * 2.3) * 0.12);
    wisps.push(s);
  }
  const glints = put(r.head, cached('eyes0.04|0.008', () => merge([place(new THREE.SphereGeometry(0.008, 6, 4), -0.04), place(new THREE.SphereGeometry(0.008, 6, 4), 0.04)])), new THREE.MeshBasicMaterial({ color: 0x9a968a, fog: false }));
  glints.position.set(0, 0.14, -0.13);
  group.add(...wisps);
  const DRIFT: Gait = { stride: 0.18, knee: 0.15, arm: 0.03, elbow: 0.02, bob: 0, sway: 0.01, twist: 0.02, lean: 0.06 };
  let phase = 0;
  let amt = 0;
  let snap = 0;
  let snapY = 0;
  return {
    group,
    eye: 1.85,
    animate(dt, time, anim) {
      const moving = anim === Anim.Walk || anim === Anim.Run;
      const k = 1 - Math.exp(-6 * dt);
      amt = ease(amt, moving ? 1 : 0, 1 - Math.exp(-3 * dt));
      phase += dt * (moving ? 2 : 0);
      if ((snap -= dt) <= 0 && Math.random() < dt * 0.15) {
        snap = 0.6;
        snapY = (Math.random() - 0.5) * 1.2;
      }
      walk(r, phase, amt, DRIFT, k, true, { look: snap > 0 ? snapY : 0, nod: 0.35 });
      r.head.rotation.z = Math.sin(time * 0.35) * 0.18;
      for (const a of r.arms) a.upper.rotation.z = ease(a.upper.rotation.z, (a === r.arms[0] ? 1 : -1) * 0.04 + Math.sin(time * 0.8) * 0.02, k);
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
 * Clump: un nudo de torsos fundidos del que salen brazos y piernas, con dos
 * caras a medio hundir. Avanza arrastrándose: cada miembro se levanta, se
 * estira, se apoya y empuja, cada uno a su ritmo, y la masa entera palpita.
 */
export function makeClump(seed: number): EnemyModel {
  const flesh = skinMat('clump', { base: '#c29682', mottle: '#9a6a5a', bruise: '#6a3a40', veins: 'rgba(90,40,60,0.45)', stitches: '#3a1a1a' });
  const bruise = skinMat('clump2', { base: '#8a6252', mottle: '#5e3e36', bruise: '#3a2228', veins: 'rgba(60,20,30,0.5)' });
  const group = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 0.55;
  group.add(core);
  const mass = new THREE.Group();
  core.add(mass);
  mass.add(
    new THREE.Mesh(
      cached('clump-core2', () =>
        merge([
          lumpy(place(new THREE.SphereGeometry(0.3, 18, 12), 0, 0, 0, 0, 0, 0, 1.2, 0.8, 1), 0.04, 7, 1),
          // torsos fundidos, con sus costillas
          lumpy(place(trunk([[0.001, -0.25], [0.15, -0.23], [0.16, 0], [0.18, 0.18], [0.08, 0.26], [0.001, 0.27]]), 0.15, 0.1, 0.02, 0.5, 0.3, 1.1, 1, 1, 0.7), 0.012, 12, 2),
          lumpy(place(trunk([[0.001, -0.22], [0.14, -0.2], [0.15, 0], [0.16, 0.16], [0.07, 0.24], [0.001, 0.25]]), -0.16, 0.06, -0.06, -0.6, 0.9, -1.0, 1, 1, 0.7), 0.012, 12, 3),
          place(ribsGeo(5, -0.08, 0.08, 0.16, 0, 0.012), 0.15, 0.12, 0.02, 0.5, 0.3, 1.1 + Math.PI / 2),
          ...Array.from({ length: 8 }, (_, i) => place(new THREE.SphereGeometry(0.03, 6, 5), -0.25 + i * 0.07, 0.24 - Math.abs(i - 3.5) * 0.02, 0.1)), // una columna por fuera
        ]),
      ),
      bruise,
    ),
    new THREE.Mesh(cached('clump-faces', () => merge([lumpy(place(humanHead(0.09, { nose: 0.8 }), 0.12, 0.2, -0.3, -0.3, 0, 0), 0.006, 20), lumpy(place(humanHead(0.085, { nose: 0.8 }), -0.32, 0.05, 0.12, 0, -1.9, 0.6), 0.006, 20)])), flesh),
    new THREE.Mesh(
      cached('clump-mouths', () =>
        merge([
          place(new THREE.SphereGeometry(0.03, 8, 6), 0.12, 0.15, -0.38, 0, 0, 0, 1, 1.5, 0.5),
          place(new THREE.SphereGeometry(0.028, 8, 6), -0.4, 0.01, 0.13, 0, 0, 0.6, 0.5, 1.5, 1),
          ...[-1, 1].map((s) => place(new THREE.BoxGeometry(0.03, 0.006, 0.01), 0.12 + s * 0.035, 0.225, -0.385)),
        ]),
      ),
      voidMat(),
    ),
  );
  const limbs: { g: THREE.Group; lower: THREE.Group; end: THREE.Group; a: number; b: number; off: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const len = Math.round((0.45 + hashf(seed, i) * 0.35) * 20) / 20; // pocas medidas distintas: se comparten
    const foot = i % 4 === 0; // algunos acaban en un pie
    const seg = hang(cached(`clump-up${len}`, () => muscle(len, 0.07, 0.05, 0.15, 0.25)), i % 3 ? flesh : bruise);
    const lower = joint(seg, 0, -len, 0);
    put(lower, cached(`clump-mid${len}`, () => muscle(len * 0.9, 0.052, 0.036, 0.15, 0.2)), flesh);
    const end = joint(lower, 0, -len * 0.9, 0);
    put(end, cached(`clump-end${foot}`, () => (foot ? place(handGeo(5, 0.07, 0.012, 0.07, 0.015, 1.4), 0, 0, 0, 0, Math.PI, 0) : handGeo(4, 0.09, 0.011, 0.055, 0.02, 0.5))), flesh);
    g.add(seg);
    const a = (i / 14) * Math.PI * 2;
    const b = (hashf(seed, i + 30) - 0.5) * 1.6;
    g.rotation.set(0, a, 0);
    seg.rotation.z = 1.2 + b * 0.3;
    core.add(g);
    limbs.push({ g, lower, end, a, b, off: hashf(seed, i + 60) * Math.PI * 2 });
  }
  let cycle = seed;
  return {
    group,
    eye: 0.6,
    animate(dt, time, anim) {
      const run = anim === Anim.Run;
      const moving = run || anim === Anim.Walk;
      cycle += dt * (run ? 14 : moving ? 5 : 1.2);
      limbs.forEach((l, i) => {
        const seg = l.g.children[0];
        // cada miembro: se levanta y se estira hacia delante, se apoya y empuja hacia atrás
        const p = cycle + l.off;
        const up = Math.max(0, Math.sin(p));
        const reach = Math.cos(p);
        const amp = run ? 1 : moving ? 0.7 : 0.18;
        seg.rotation.x = reach * 0.6 * amp + Math.sin(time * 1.3 + i) * 0.04;
        seg.rotation.z = 1.2 + l.b * 0.3 - up * 0.55 * amp;
        l.lower.rotation.x = -0.3 - up * 0.9 * amp;
        l.end.rotation.x = 0.4 + up * 0.5 * amp;
      });
      // la masa palpita y se balancea con el esfuerzo
      const pulse = Math.sin(time * (run ? 7 : 2.2));
      mass.scale.set(1 + pulse * 0.025, 1 - pulse * 0.02, 1 + pulse * 0.025);
      core.position.y = 0.55 + (run ? Math.abs(Math.sin(cycle * 0.5)) * 0.12 : Math.sin(time * 2) * 0.02);
      core.rotation.y = run ? Math.sin(cycle * 0.3) * 0.2 : Math.sin(time * 0.4) * 0.08;
      core.rotation.z = Math.sin(cycle * 0.5) * (moving ? 0.08 : 0.02);
    },
  };
}

/**
 * Duller: humanoide gris y apagado, de piel agrietada como el yeso, que sale
 * de las paredes de cintura para arriba. Cuencas vacías, la boca floja y
 * abierta y brazos larguísimos que tantean y agarran; la cabeza le cuelga.
 */
export function makeDuller(): EnemyModel {
  const grey = skinMat('duller', { base: '#77736c', mottle: '#5d5953', cracks: 'rgba(38,36,32,0.75)' });
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const r = makeRig({ hipY: 0.85, hipW: 0.1, thigh: 0.4, shin: 0.4, spine: 0.3, chest: 0.36, shoulderW: 0.2, upper: 0.48, fore: 0.5, neck: 0.12 });
  body.add(r.root);
  // de la cintura para abajo se funde con la pared (se pierde en punta)
  put(r.hips, cached('dl-waist', () => lumpy(place(trunk([[0.001, -0.42], [0.06, -0.36], [0.13, -0.15], [0.15, 0.02], [0.001, 0.03]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.7), 0.015, 9, 4)), grey);
  put(r.spine, cached('dl-belly', () => lumpy(place(trunk([[0.001, -0.02], [0.13, -0.02], [0.12, 0.15], [0.15, 0.3], [0.001, 0.31]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.7), 0.012, 11, 5)), grey);
  put(r.chest, cached('dl-chest', () => merge([lumpy(place(trunk([[0.001, -0.02], [0.15, -0.02], [0.18, 0.18], [0.2, 0.31], [0.07, 0.39], [0.001, 0.39]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.7), 0.012, 11, 6), place(ribsGeo(5, -0.06, 0.06, 0.17, 0, 0.01), 0, 0.15, 0, Math.PI / 2, 0, 0)])), grey);
  put(r.neck, cached('dl-neck', () => place(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 8), 0, 0.04, 0)), grey);
  put(r.head, cached('dl-head', () => lumpy(place(new THREE.SphereGeometry(0.13, 14, 12), 0, 0.12, 0, 0, 0, 0, 0.85, 1.3, 0.9), 0.012, 12, 6)), grey);
  put(r.head, cached('dl-holes', () => merge([place(new THREE.SphereGeometry(0.035, 8, 6), -0.045, 0.15, -0.1), place(new THREE.SphereGeometry(0.035, 8, 6), 0.045, 0.15, -0.1), place(new THREE.SphereGeometry(0.04, 8, 6), 0, 0.01, -0.095, 0, 0, 0, 0.8, 1.7, 0.6)])), voidMat());
  for (const a of r.arms) {
    put(a.upper, cached('dl-upper', () => muscle(0.48, 0.058, 0.04, 0.06, 0.3)), grey);
    put(a.fore, cached('dl-fore', () => muscle(0.5, 0.042, 0.03, 0.06, 0.25)), grey);
    put(a.hand, cached('dl-hand', () => handGeo(4, 0.19, 0.011, 0.06, 0.02, 0.3)), grey);
  }
  return {
    group,
    eye: 1.8,
    animate(_dt, time, anim) {
      const out = anim === Anim.Attack || anim === Anim.Flee;
      body.visible = out;
      if (!out) return;
      body.position.z = -0.2;
      // se echa hacia delante a sacudidas; los brazos tantean y agarran por turnos
      const lurch = Math.sin(time * 2.6);
      r.spine.rotation.x = 0.35 + lurch * 0.12 + Math.sin(time * 31) * 0.01;
      r.chest.rotation.y = Math.sin(time * 1.9) * 0.15;
      r.arms.forEach((a, i) => {
        const g = Math.sin(time * 3.2 + i * Math.PI);
        a.upper.rotation.x = 1.25 + g * 0.35 + Math.sin(time * 14 + i) * 0.04;
        a.upper.rotation.z = (i ? -1 : 1) * (0.15 + Math.max(0, g) * 0.2);
        a.fore.rotation.x = 0.2 + Math.max(0, -g) * 0.6;
        a.hand.rotation.x = 0.3 + Math.max(0, -g) * 0.7; // cierra la mano al agarrar
      });
      // la cabeza le cuelga y se balancea
      r.neck.rotation.x = 0.35 + Math.sin(time * 1.3) * 0.1;
      r.head.rotation.z = Math.sin(time * 1.7) * 0.3;
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
  const { h, rig } = makeExplorer(0xb8d23a, 'M.E.G.');
  put(rig.chest, cached('meg-patch', () => place(new THREE.CircleGeometry(0.065, 14), 0.105, 0.14, -0.137, 0, Math.PI, 0)), litMaterial({ map: megPatch() }, 0.1));
  put(rig.head, cached('meg-helmet', () => merge([place(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.12, 0.005, 0, 0, 0, 1, 1.05, 1.08), place(new THREE.TorusGeometry(0.134, 0.014, 4, 18), 0, 0.122, 0.005, Math.PI / 2, 0, 0, 1, 1.08, 1)])), litMaterial({ color: 0x5e6b2e }, 0.1));
  put(rig.head, cached('meg-visor', () => place(new THREE.CylinderGeometry(0.128, 0.128, 0.04, 16, 1, true, Math.PI * 0.65, Math.PI * 0.7), 0, 0.15, 0.005)), new THREE.MeshBasicMaterial({ color: 0x1a2018 }));
  // bandas reflectantes del chaleco
  const band = new THREE.MeshBasicMaterial({ color: 0x9a9a92 });
  put(rig.chest, cached('meg-band-up', () => place(new THREE.CylinderGeometry(0.206, 0.2, 0.032, 16, 1, true), 0, 0.12, 0, 0, 0, 0, 1, 1, 0.66)), band);
  put(rig.spine, cached('meg-band-down', () => place(new THREE.CylinderGeometry(0.176, 0.172, 0.032, 16, 1, true), 0, 0.13, 0, 0, 0, 0, 1, 1, 0.68)), band);
  h.setLight(false);
  return { group: h.group, animate: (dt, _t, moving) => h.animate(dt, moving ? 1.4 : 0) };
}

/**
 * Trabajador sombra (sector en obras): una silueta negra sin cara, con mono
 * de trabajo, casco amarillo desgastado (lo único con color) y un martillo.
 * Quieto, martillea encorvado: sube el brazo despacio, golpea de golpe y todo
 * el cuerpo acompaña el golpe.
 */
export function makeWorker(seed: number): NpcModel {
  const dark = litMaterial({ color: 0x0c0c0c }, 0.1);
  const overall = skinMat('overall', { base: '#232c40', mottle: '#161c2a', stitches: '#10141c' });
  const r = makeRig({ hipY: 0.9, hipW: 0.1, thigh: 0.44, shin: 0.42, spine: 0.22, chest: 0.27, shoulderW: 0.22, upper: 0.3, fore: 0.28, neck: 0.09 });
  put(r.hips, cached('wk-pelvis', () => merge([place(roundedGeo(0.37, 0.2, 0.24), 0, -0.02, 0), place(new THREE.BoxGeometry(0.39, 0.06, 0.26), 0, 0.07, 0), place(new THREE.BoxGeometry(0.08, 0.1, 0.06), 0.16, 0.02, -0.08)])), overall);
  put(r.spine, cached('wk-belly', () => place(trunk([[0.001, -0.02], [0.165, -0.02], [0.17, 0.12], [0.18, 0.23], [0.001, 0.24]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.68)), overall);
  put(r.chest, cached('wk-chest', () => merge([place(trunk([[0.001, -0.02], [0.18, -0.02], [0.2, 0.12], [0.235, 0.21], [0.2, 0.27], [0.08, 0.3], [0.001, 0.3]]), 0, 0, 0, 0, 0, 0, 1, 1, 0.66), ...[-1, 1].map((s) => place(new THREE.BoxGeometry(0.04, 0.3, 0.012), s * 0.09, 0.12, -0.145))])), overall);
  put(r.neck, cached('wk-neck', () => place(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10), 0, 0.03, 0)), dark);
  put(r.head, cached('wk-head', () => lumpy(place(humanHead(0.11, { nose: 0.6, ears: true }), 0, 0.1, 0), 0.006, 16, 8)), dark);
  put(r.head, cached('wk-hat', () => merge([place(new THREE.SphereGeometry(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.15, 0.005, 0, 0, 0, 1, 1, 1.1), place(new THREE.CylinderGeometry(0.155, 0.155, 0.012, 16), 0, 0.152, -0.02, 0, 0, 0, 1, 1, 1.12)])), skinMat('hardhat', { base: '#b8921e', mottle: '#8a6a14', cracks: 'rgba(60,40,10,0.5)' }));
  const fume = new THREE.SpriteMaterial({ map: smoke(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false });
  const wisps = [0, 1].map((i) => {
    const s = new THREE.Sprite(fume);
    s.scale.setScalar(0.3);
    s.position.set(i ? 0.07 : -0.05, 0.06 + i * 0.1, 0.06);
    r.head.add(s);
    return s;
  });
  for (const l of r.legs) {
    put(l.thigh, cached('wk-thigh', () => muscle(0.44, 0.095, 0.068, 0.1)), overall);
    put(l.shin, cached('wk-shin', () => muscle(0.42, 0.072, 0.055, 0.12)), overall);
    put(l.foot, cached('ex-boot', bootGeo), dark);
  }
  for (const a of r.arms) {
    put(a.upper, cached('wk-upper', () => muscle(0.3, 0.07, 0.055, 0.16)), dark);
    put(a.fore, cached('wk-fore', () => muscle(0.28, 0.058, 0.046, 0.14)), dark);
    put(a.hand, cached('wk-hand', () => handGeo(4, 0.07, 0.013, 0.05, 0, 1.1)), dark);
  }
  const hammer = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.36, 6), litMaterial({ color: 0x6b4a2a }, 0.1));
  const headH = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.05), litMaterial({ color: 0x555555 }, 0.1));
  headH.position.y = 0.17;
  hammer.add(handle, headH);
  hammer.position.y = -0.07;
  hammer.rotation.x = Math.PI / 2;
  r.arms[1].hand.add(hammer);
  const HEAVY: Gait = { stride: 0.38, knee: 0.7, arm: 0.3, elbow: 0.3, bob: 0.045, sway: 0.03, twist: 0.1, lean: 0.12 };
  let phase = seed;
  let amt = 0;
  let time = seed;
  return {
    group: r.root,
    animate(dt, t, moving) {
      time = t + seed;
      const k = 1 - Math.exp(-14 * dt);
      amt = ease(amt, moving ? 1 : 0, 1 - Math.exp(-5 * dt));
      phase += dt * (moving ? 5 : 0);
      // el golpe: sube despacio y baja de golpe
      const u = (time * 0.75) % 1;
      const lift = u < 0.72 ? Math.sin(((u / 0.72) * Math.PI) / 2) : 1 - (u - 0.72) / 0.28;
      const work = 1 - amt;
      walk(r, phase, amt, HEAVY, k, moving, { nod: 0.25 * work });
      // encorvado sobre el trabajo, con las rodillas un poco dobladas
      r.spine.rotation.x = ease(r.spine.rotation.x, HEAVY.lean * amt + work * (0.35 + 0.12 * (1 - lift)), k);
      if (!moving) {
        for (const l of r.legs) {
          l.thigh.rotation.x = ease(l.thigh.rotation.x, 0.28, k);
          l.shin.rotation.x = ease(l.shin.rotation.x, -0.45, k);
          l.foot.rotation.x = ease(l.foot.rotation.x, 0.17, k);
        }
        r.hips.position.y = ease(r.hips.position.y, r.hipY - 0.04, k);
        const [left, right] = r.arms;
        right.upper.rotation.x = ease(right.upper.rotation.x, 0.4 + lift * 1.9, k * 1.6);
        right.upper.rotation.z = ease(right.upper.rotation.z, -0.15, k);
        right.fore.rotation.x = ease(right.fore.rotation.x, 0.3 + lift * 0.9, k * 1.6);
        left.upper.rotation.x = ease(left.upper.rotation.x, 0.9, k);
        left.fore.rotation.x = ease(left.fore.rotation.x, 0.7, k);
        r.chest.rotation.y = ease(r.chest.rotation.y, -0.15 * lift, k);
      }
      wisps.forEach((s, i) => (s.position.y = 0.06 + i * 0.1 + ((time * 0.3 + i * 0.5) % 0.15)));
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
