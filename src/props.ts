import * as THREE from 'three';
import { litMaterial, type LitParams } from './lighting';
import { canvasTexture, crateTexture, textTexture } from './textures';
import type { Prop } from './world';

// Muebles y objetos de decoración. Todos miran hacia +z (su frente) y se
// construyen con piezas simples. Los materiales se comparten para poder
// fusionar la geometría de todos los objetos estáticos del nivel.

const mats = new Map<string, THREE.Material>();
export function mat(color: number, extra: LitParams = {}, key = ''): THREE.Material {
  const k = color + key;
  let m = mats.get(k);
  if (!m) {
    m = litMaterial({ color, ...extra }, 0.15);
    mats.set(k, m);
  }
  return m;
}

/** Libera los materiales compartidos (al cambiar de nivel). */
export function disposePropMaterials() {
  for (const m of mats.values()) m.dispose();
  mats.clear();
  for (const m of texMats.values()) m.dispose();
  texMats.clear();
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  return mesh;
}

function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...children);
  return g;
}

// ---- oficina (Nivel 0) ----

function chair(): THREE.Group {
  const fabric = mat(0x2d2f36);
  const metal = mat(0x555555);
  const g = group(
    box(0.48, 0.08, 0.46, fabric, 0, 0.47, 0),
    box(0.46, 0.5, 0.07, fabric, 0, 0.78, 0.22),
    cyl(0.03, 0.03, 0.36, metal, 0, 0.27, 0, 8),
    box(0.06, 0.04, 0.3, fabric, -0.25, 0.62, 0.02),
    box(0.06, 0.04, 0.3, fabric, 0.25, 0.62, 0.02),
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.04, 0.03, 0.32, metal, Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, a);
    const wheel = cyl(0.03, 0.03, 0.04, mat(0x111111), Math.sin(a) * 0.3, 0.03, Math.cos(a) * 0.3, 6);
    g.add(leg, wheel);
  }
  return g;
}

function desk(): THREE.Group {
  const top = mat(0x8a7656);
  const metal = mat(0x6d6d66);
  const g = group(box(1.6, 0.05, 0.8, top, 0, 0.74, 0));
  for (const x of [-0.75, 0.75]) g.add(box(0.05, 0.72, 0.75, metal, x, 0.36, 0));
  g.add(box(1.45, 0.4, 0.03, metal, 0, 0.5, -0.36)); // faldón
  g.add(box(0.45, 0.55, 0.7, metal, 0.5, 0.42, 0)); // cajonera
  for (const y of [0.3, 0.5, 0.65]) g.add(box(0.12, 0.02, 0.02, mat(0x222222), 0.5, y, 0.36));
  // monitor viejo y papeles
  g.add(box(0.4, 0.35, 0.35, mat(0xbcb6a2), -0.3, 0.95, -0.15), box(0.33, 0.25, 0.01, mat(0x0d0f0d), -0.3, 0.97, 0.03));
  g.add(box(0.3, 0.005, 0.22, mat(0xe8e4d8), 0.35, 0.77, 0.1, 0.3));
  return g;
}

function cabinet(): THREE.Group {
  const m = mat(0x7b7f78);
  const g = group(box(0.5, 1.3, 0.6, m, 0, 0.65, 0));
  for (const y of [0.25, 0.58, 0.91, 1.2]) g.add(box(0.15, 0.03, 0.02, mat(0x2a2a2a), 0, y, 0.31));
  return g;
}

function chairStack(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const c = chair();
    c.position.y = i * 0.12;
    c.rotation.y = (i % 2) * 0.15;
    g.add(c);
  }
  return g;
}

function partition(w = 4): THREE.Group {
  const fabric = mat(0x7d7867);
  const frame = mat(0x9a968a);
  return group(box(w, 1.35, 0.08, fabric, 0, 0.7, 0), box(w, 0.04, 0.1, frame, 0, 1.39, 0), box(0.06, 1.4, 0.1, frame, w / 2, 0.7, 0), box(0.06, 1.4, 0.1, frame, -w / 2, 0.7, 0));
}

function plant(): THREE.Group {
  const g = group(cyl(0.22, 0.16, 0.4, mat(0x6b4a33), 0, 0.2, 0), cyl(0.2, 0.2, 0.02, mat(0x2a1f14), 0, 0.39, 0));
  const dead = mat(0x5d5532);
  for (let i = 0; i < 6; i++) {
    const leaf = box(0.04, 0.6, 0.12, dead, 0, 0.6, 0);
    leaf.rotation.set(0.5 + (i % 2) * 0.3, (i / 6) * Math.PI * 2, 0.3);
    leaf.position.set(Math.sin(i) * 0.08, 0.6, Math.cos(i) * 0.08);
    g.add(leaf);
  }
  return g;
}

function vending(): THREE.Group {
  const body = mat(0x8c1d1d);
  const g = group(box(0.95, 1.85, 0.85, body, 0, 0.925, 0));
  g.add(box(0.6, 1.3, 0.02, mat(0x101414, { emissive: 0x0a0d0d }), -0.1, 1.15, 0.43));
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) g.add(box(0.1, 0.16, 0.05, mat([0xd9b23c, 0x3d7bd6, 0xe0e0e0, 0x5aa04a][c]), -0.32 + c * 0.15, 0.65 + r * 0.24, 0.39));
  g.add(box(0.2, 0.5, 0.02, mat(0x333333), 0.33, 1.3, 0.43), box(0.6, 0.15, 0.02, mat(0x111111), -0.1, 0.25, 0.43));
  return g;
}

function cooler(): THREE.Group {
  return group(
    box(0.32, 0.95, 0.32, mat(0xe5e2d8), 0, 0.475, 0),
    cyl(0.15, 0.15, 0.4, mat(0x9fc7e6, { transparent: true, opacity: 0.7 }, 't'), 0, 1.15, 0, 14),
    box(0.06, 0.04, 0.05, mat(0x3366aa), -0.06, 0.8, 0.17),
    box(0.06, 0.04, 0.05, mat(0xaa3333), 0.06, 0.8, 0.17),
  );
}

function table(): THREE.Group {
  const g = group(box(1.6, 0.05, 1, mat(0xcfc8b4), 0, 0.73, 0));
  for (const [x, z] of [[-0.72, -0.42], [0.72, -0.42], [-0.72, 0.42], [0.72, 0.42]]) g.add(cyl(0.025, 0.025, 0.72, mat(0x777777), x, 0.36, z, 6));
  g.add(box(0.08, 0.1, 0.08, mat(0xeeeeee), 0.3, 0.8, 0.1));
  return g;
}

function box_(): THREE.Group {
  return group(box(0.55, 0.4, 0.45, mat(0x9b7a4c), 0, 0.2, 0), box(0.55, 0.02, 0.1, mat(0xc9b38a), 0, 0.41, 0), box(0.4, 0.3, 0.35, mat(0x8a6a3e), 0.05, 0.55, 0, 0.3));
}

function fallenTile(): THREE.Group {
  const t = box(0.6, 0.02, 0.6, mat(0xd8d1b4), 0, 0.03, 0);
  t.rotation.z = 0.05;
  const bit = box(0.25, 0.02, 0.18, mat(0xcfc8aa), 0.45, 0.012, 0.2, 0.7);
  return group(t, bit);
}

function ceilingHole(): THREE.Group {
  // hueco negro donde falta una placa, con un cable colgando
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  hole.rotation.x = Math.PI / 2;
  hole.position.y = -0.01;
  const wire = cyl(0.008, 0.008, 0.5, mat(0x222222), 0.1, -0.25, 0.05, 4);
  return group(hole, wire);
}

function tube(): THREE.Group {
  const t = cyl(0.016, 0.016, 1.2, mat(0xe8e8e0, { emissive: 0x111111 }), 0, 0.016, 0, 8);
  t.rotation.z = Math.PI / 2;
  const shard = box(0.08, 0.005, 0.05, mat(0xdddddd), 0.75, 0.003, 0.1, 0.4);
  return group(t, shard);
}

function hangLamp(): THREE.Group {
  // fluorescente medio descolgado, colgando de un cable
  const housing = box(1.2, 0.06, 0.3, mat(0xb8b3a2), 0.4, -0.55, 0);
  housing.rotation.z = -0.55;
  const t = cyl(0.015, 0.015, 1.1, mat(0x9c9a92), 0.4, -0.6, 0.05, 6);
  t.rotation.z = Math.PI / 2 - 0.55;
  const cable = cyl(0.006, 0.006, 0.35, mat(0x222222), -0.1, -0.17, 0, 4);
  return group(housing, t, cable);
}

function outlet(): THREE.Group {
  return group(box(0.08, 0.12, 0.015, mat(0xe8e2cf), 0, 0, 0), box(0.012, 0.02, 0.005, mat(0x222222), -0.015, 0.02, 0.01), box(0.012, 0.02, 0.005, mat(0x222222), 0.015, 0.02, 0.01));
}

function wallVent(): THREE.Group {
  const g = group(box(0.5, 0.3, 0.02, mat(0xcfc9b4), 0, 0, 0));
  for (let i = 0; i < 5; i++) g.add(box(0.44, 0.02, 0.02, mat(0x3a362c), 0, -0.1 + i * 0.05, 0.012));
  return g;
}

function doorToWall(): THREE.Group {
  // una puerta normal... que da a la pared
  const frame = mat(0x6b5232);
  return group(
    box(0.9, 2.05, 0.04, mat(0x8a6a44), 0, 1.02, 0.02),
    box(0.08, 2.15, 0.06, frame, -0.49, 1.07, 0.02),
    box(0.08, 2.15, 0.06, frame, 0.49, 1.07, 0.02),
    box(1.06, 0.08, 0.06, frame, 0, 2.15, 0.02),
    cyl(0.03, 0.03, 0.04, mat(0xc0a060), 0.35, 1.0, 0.06, 8),
  );
}

// ---- almacén (Nivel 1) ----

function shelf(d = 6): THREE.Group {
  const steel = mat(0x2e5b8c);
  const beam = mat(0xd16c1a);
  const g = new THREE.Group();
  for (const x of [-0.55, 0.55]) for (let z = -d / 2; z <= d / 2 + 0.01; z += d / 3) g.add(box(0.07, 3.2, 0.07, steel, x, 1.6, z));
  const boxes = [mat(0x9b7a4c), mat(0x8a6a3e), mat(0xa88a5c)];
  for (const y of [0.15, 1.15, 2.15, 3.1]) {
    g.add(box(1.2, 0.08, d, beam, 0, y, 0), box(1.1, 0.03, d, mat(0x6d5c42), 0, y + 0.05, 0));
    if (y > 3) continue;
    for (let z = -d / 2 + 0.5; z < d / 2; z += 1.1) {
      const k = Math.abs(Math.sin(z * 7 + y * 3));
      if (k < 0.25) continue;
      const h = 0.4 + k * 0.4;
      g.add(box(0.9, h, 0.9, boxes[Math.floor(k * 3) % 3], 0, y + 0.06 + h / 2, z, k * 0.2));
    }
  }
  return g;
}

function pallet(): THREE.Group {
  const wood = mat(0xa1824f);
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) g.add(box(1.2, 0.025, 0.14, wood, 0, 0.13, -0.42 + i * 0.21));
  for (const z of [-0.42, 0, 0.42]) g.add(box(1.2, 0.1, 0.1, mat(0x8a6d40), 0, 0.06, z));
  return g;
}

function barrel(): THREE.Group {
  const color = [0x2c5f8a, 0x8a2c2c, 0x3d6b35][Math.floor(Math.random() * 3)];
  const m = mat(color);
  return group(cyl(0.3, 0.3, 0.9, m, 0, 0.45, 0, 12), cyl(0.31, 0.31, 0.03, mat(0x333333), 0, 0.3, 0, 12), cyl(0.31, 0.31, 0.03, mat(0x333333), 0, 0.62, 0, 12), cyl(0.28, 0.28, 0.01, mat(0x444444), 0, 0.9, 0, 12));
}

function forklift(): THREE.Group {
  const yellow = mat(0xd6a51c);
  const dark = mat(0x222222);
  const g = group(box(1.1, 0.7, 1.8, yellow, 0, 0.6, 0), box(1.0, 0.5, 0.6, yellow, 0, 1.15, 0.5), box(0.5, 0.45, 0.5, dark, 0, 1.0, -0.1));
  for (const x of [-0.5, 0.5]) {
    g.add(box(0.06, 2.2, 0.06, dark, x, 1.2, -1.15));
    for (const z of [-0.6, 0.6]) {
      const w = cyl(0.25, 0.25, 0.2, dark, x * 1.15, 0.25, z, 12);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
  }
  g.add(box(1.0, 0.06, 0.08, dark, 0, 2.3, -1.15), box(0.12, 0.05, 1.0, mat(0x777777), -0.3, 0.1, -1.65), box(0.12, 0.05, 1.0, mat(0x777777), 0.3, 0.1, -1.65));
  for (const x of [-0.45, 0.45]) for (const z of [-0.2, 0.75]) g.add(box(0.04, 1.2, 0.04, dark, x, 1.8, z));
  g.add(box(1.0, 0.04, 1.0, dark, 0, 2.4, 0.28));
  return g;
}

function cone(): THREE.Group {
  return group(box(0.4, 0.03, 0.4, mat(0xd65a1c), 0, 0.015, 0), cyl(0.02, 0.15, 0.6, mat(0xe0661f), 0, 0.32, 0, 12), cyl(0.09, 0.11, 0.08, mat(0xeeeeee), 0, 0.35, 0, 12));
}

function dockDoor(): THREE.Group {
  const g = group(box(3.4, 3.2, 0.06, mat(0x7c8288), 0, 1.6, 0));
  for (let y = 0.1; y < 3.2; y += 0.2) g.add(box(3.4, 0.03, 0.08, mat(0x5a5f64), 0, y, 0.01));
  g.add(box(3.6, 0.15, 0.1, mat(0xc9a227), 0, 3.25, 0), box(0.1, 3.3, 0.1, mat(0xc9a227), -1.75, 1.65, 0), box(0.1, 3.3, 0.1, mat(0xc9a227), 1.75, 1.65, 0));
  return g;
}

function meg(): THREE.Group {
  // mesa de la M.E.G. con suministros y una lámpara
  const g = table();
  g.add(cyl(0.035, 0.035, 0.25, mat(0xf2ead5, { transparent: true, opacity: 0.85 }, 'a'), -0.5, 0.88, 0, 10));
  g.add(cyl(0.035, 0.035, 0.25, mat(0xf2ead5, { transparent: true, opacity: 0.85 }, 'a'), -0.4, 0.88, 0.1, 10));
  g.add(box(0.3, 0.2, 0.2, mat(0xeeeeee), 0.5, 0.86, 0), box(0.08, 0.2, 0.02, mat(0xcc2222), 0.5, 0.86, 0.105), box(0.2, 0.08, 0.02, mat(0xcc2222), 0.5, 0.86, 0.106));
  g.add(box(0.5, 0.02, 0.35, mat(0xd9d3be), 0, 0.77, -0.1, 0.2), cyl(0.05, 0.08, 0.3, mat(0x333333), 0.2, 0.9, -0.3, 8));
  return g;
}

function cot(): THREE.Group {
  const g = group(box(1.9, 0.05, 0.75, mat(0x56603f), 0, 0.42, 0), box(0.5, 0.1, 0.6, mat(0xd0ccbc), -0.7, 0.5, 0), box(1.0, 0.06, 0.72, mat(0x4a5537), 0.3, 0.48, 0));
  for (const x of [-0.9, 0.9]) for (const z of [-0.33, 0.33]) g.add(box(0.04, 0.42, 0.04, mat(0x444444), x, 0.21, z));
  return g;
}

function radio(): THREE.Group {
  return group(box(0.5, 0.75, 0.5, mat(0x3c3c34), 0, 0.375, 0), box(0.4, 0.25, 0.3, mat(0x22251f), 0, 0.88, 0), box(0.25, 0.08, 0.01, mat(0x2a6b2a, { emissive: 0x0c3a0c }, 'e'), 0, 0.9, 0.16), cyl(0.005, 0.005, 0.6, mat(0x999999), 0.15, 1.3, 0, 4));
}

// ---- túneles (Nivel 2) ----

function tank(): THREE.Group {
  const rust = mat(0x6d4a32);
  const g = group(cyl(0.95, 0.95, 2.6, rust, 0, 1.3, 0, 20), cyl(0.97, 0.97, 0.08, mat(0x3a2a1e), 0, 0.5, 0, 20), cyl(0.97, 0.97, 0.08, mat(0x3a2a1e), 0, 2.2, 0, 20));
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), rust);
  top.position.y = 2.6;
  const pipe = cyl(0.1, 0.1, 1.5, mat(0x7a4426), 0, 3.4, 0, 10);
  g.add(top, pipe, box(0.3, 0.3, 0.1, mat(0xd0c8a0), 0, 1.6, 0.95));
  return g;
}

function gauge(): THREE.Group {
  const face = cyl(0.12, 0.12, 0.04, mat(0xe0dccb), 0, 0, 0.02, 16);
  face.rotation.x = Math.PI / 2;
  const needle = box(0.01, 0.09, 0.01, mat(0xaa1111), 0.02, 0.02, 0.045);
  needle.rotation.z = -0.8;
  const rim = cyl(0.13, 0.13, 0.03, mat(0x7a5b2e), 0, 0, 0.01, 16);
  rim.rotation.x = Math.PI / 2;
  return group(rim, face, needle, cyl(0.03, 0.03, 0.2, mat(0x6b3d22), 0, -0.2, 0.03, 8));
}

function valve(): THREE.Group {
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 16), mat(0xa1261c));
  wheel.position.z = 0.12;
  const pipe = cyl(0.06, 0.06, 0.12, mat(0x6b3d22), 0, 0, 0.06, 10);
  pipe.rotation.x = Math.PI / 2;
  return group(pipe, wheel, box(0.32, 0.02, 0.02, mat(0xa1261c), 0, 0, 0.12), box(0.02, 0.32, 0.02, mat(0xa1261c), 0, 0, 0.12));
}

function wires(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const w = cyl(0.01, 0.01, 0.6 + i * 0.25, mat(0x151515), (i - 1.5) * 0.12, -(0.3 + i * 0.12), 0, 4);
    w.rotation.z = (i - 1.5) * 0.15;
    g.add(w);
  }
  return g;
}

function metalDoor(): THREE.Group {
  const steel = mat(0x4f5450);
  return group(
    box(1.0, 2.1, 0.05, steel, 0, 1.05, 0.025),
    box(0.1, 2.2, 0.08, mat(0x2f322f), -0.55, 1.1, 0.03),
    box(0.1, 2.2, 0.08, mat(0x2f322f), 0.55, 1.1, 0.03),
    box(1.2, 0.1, 0.08, mat(0x2f322f), 0, 2.2, 0.03),
    box(0.3, 0.06, 0.06, mat(0x999999), 0.3, 1.0, 0.08),
    box(0.6, 0.12, 0.01, mat(0xc9a227), 0, 1.7, 0.055),
  );
}

// ---- piezas con textura propia ----

const texMats = new Map<string, THREE.Material>();
const texCache = new Map<string, THREE.Texture>();
/** Material con una textura dibujada a mano (la textura se guarda entre niveles). */
function texMat(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, extra: LitParams = {}): THREE.Material {
  let m = texMats.get(key);
  if (!m) {
    let t = texCache.get(key);
    if (!t) {
      t = canvasTexture(w, h, paint, false);
      texCache.set(key, t);
    }
    m = litMaterial({ map: t, ...extra }, 0.2);
    texMats.set(key, m);
  }
  return m;
}

function plane(w: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Plano tumbado en el suelo. */
function decal(w: number, d: number, m: THREE.Material, y = 0.012): THREE.Mesh {
  const mesh = plane(w, d, m, 0, y, 0);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ---- Nivel 0 ----

/** Molduras curvas en lo alto de un hueco: el hueco parece un arco. */
function arch(w = 1.6, h = 2.2): THREE.Group {
  const r = Math.min(0.55, w / 2);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h - r);
  s.lineTo(-w / 2, h + 0.01);
  s.lineTo(w / 2, h + 0.01);
  s.lineTo(w / 2, h - r);
  s.absellipse(0, h - r, w / 2, r, 0, Math.PI, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -0.25);
  // las UV de la extrusión van en metros: se escalan como la pared
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.6, uv.getY(i) / 2.4);
  return group(new THREE.Mesh(geo, mat(0xd8cc8c)));
}

/** Arco ciego: un arco dibujado en la pared que no lleva a ninguna parte. */
function blindArch(w = 1.6, h = 2.2): THREE.Group {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  const inner = new THREE.Mesh(new THREE.ShapeGeometry(s, 12), mat(0x6e6438));
  inner.position.z = 0.012;
  const frame = new THREE.Mesh(new THREE.ShapeGeometry(s, 12), mat(0xb9ac6c));
  frame.scale.set(1.12, 1.05, 1);
  frame.position.z = 0.006;
  return group(frame, inner);
}

// ---- Nivel 1 ----

/** Tubería con fuga en el techo: gotea (la gota se anima). */
function drip(): THREE.Group {
  const p = cyl(0.09, 0.09, 1.2, mat(0x5d6366), 0, 0, 0, 10);
  p.rotation.z = Math.PI / 2;
  const joint = cyl(0.13, 0.13, 0.12, mat(0x7a4426), 0, 0, 0, 10);
  joint.rotation.z = Math.PI / 2;
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0x8aa0aa, transparent: true, opacity: 0.8 }));
  drop.name = 'drop';
  drop.scale.y = 1.6;
  return group(p, joint, drop);
}

/** Tubería larga bajo el techo (w = largo). */
function longPipe(w = 20): THREE.Group {
  const m = mat(0x5d6366);
  const p = cyl(0.14, 0.14, w, m, 0, 0, 0, 12);
  p.rotation.z = Math.PI / 2;
  const g = group(p);
  for (let x = -w / 2 + 1.5; x < w / 2; x += 3) {
    const f = cyl(0.19, 0.19, 0.08, mat(0x464b4e), x, 0, 0, 12);
    f.rotation.z = Math.PI / 2;
    g.add(f, box(0.04, 0.35, 0.04, mat(0x333333), x + 0.3, 0.2, 0));
  }
  return g;
}

/** Montón de escombros: losas rotas, madera y hierros. */
function debris(): THREE.Group {
  const conc = mat(0x8a8780);
  const wood = mat(0x7a6040);
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const s = 0.25 + ((i * 37) % 10) / 25;
    const b = box(s, s * 0.45, s * 0.8, conc, Math.sin(i * 2.1) * 0.5, s * 0.2, Math.cos(i * 1.7) * 0.4, i);
    b.rotation.z = Math.sin(i) * 0.4;
    g.add(b);
  }
  for (let i = 0; i < 3; i++) {
    const plank = box(1.4, 0.04, 0.18, wood, Math.sin(i * 4) * 0.3, 0.25 + i * 0.08, Math.cos(i * 3) * 0.3, i * 1.1);
    plank.rotation.z = 0.25 - i * 0.2;
    g.add(plank);
  }
  for (let i = 0; i < 3; i++) {
    const bar = cyl(0.012, 0.012, 1.1, mat(0x5a3a26), Math.sin(i * 3) * 0.4, 0.4, Math.cos(i * 5) * 0.3, 4);
    bar.rotation.set(0.9 + i * 0.3, i, 0.6);
    g.add(bar);
  }
  return g;
}

function megPainter(big: boolean) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#b6d63a';
    ctx.fillRect(0, 0, w, h);
    // tela: arrugas
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},0.05)`;
      ctx.fillRect(0, Math.random() * h, w, 1 + Math.random() * 4);
    }
    // águila esquemática
    ctx.fillStyle = '#20240e';
    const cx = w / 2;
    const cy = h * (big ? 0.42 : 0.45);
    const s = Math.min(w, h) * 0.32;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.55);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.2);
    ctx.lineTo(cx + s * 1.1, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.8, cy - s * 0.05);
    ctx.lineTo(cx + s * 0.35, cy + s * 0.1);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.6);
    ctx.lineTo(cx, cy + s * 0.45);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.6);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.1);
    ctx.lineTo(cx - s * 0.8, cy - s * 0.05);
    ctx.lineTo(cx - s * 1.1, cy - s * 0.5);
    ctx.lineTo(cx - s * 0.18, cy - s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold ${Math.floor(h * 0.12)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('M.E.G.', cx, h * 0.88);
  };
}

/** Tela lima de la M.E.G. clavada en la pared. */
function megCloth(): THREE.Group {
  const cloth = plane(1.2, 0.9, texMat('megcloth', 256, 192, megPainter(true)), 0, 0, 0.02);
  cloth.rotation.x = 0.04;
  return group(cloth, box(0.03, 0.03, 0.03, mat(0x777777), -0.55, 0.42, 0.02), box(0.03, 0.03, 0.03, mat(0x777777), 0.55, 0.42, 0.02));
}

function megFlag(): THREE.Group {
  return group(plane(0.7, 1.2, texMat('megflag', 128, 220, megPainter(false)), 0, 0, 0.02), box(0.8, 0.03, 0.04, mat(0x444444), 0, 0.6, 0.03));
}

/** Franja de pintura naranja en una columna o pared: sirve de referencia. */
function paint(h = 3): THREE.Group {
  return group(box(1.2, h, 0.01, mat(0xd8641e), 0, h / 2, 0.006), box(1.2, 0.08, 0.012, mat(0xf0f0e8), 0, 1.6, 0.008));
}

/** Cuadro eléctrico con piloto rojo: punto de referencia del pasillo infinito. */
function elecPanel(): THREE.Group {
  return group(
    box(0.6, 0.85, 0.15, mat(0x8a8f86), 0, 0.42, 0.075),
    box(0.55, 0.8, 0.01, mat(0x9aa096), 0, 0.42, 0.155),
    box(0.06, 0.06, 0.02, mat(0xff2a1a, { emissive: 0xaa1100 }, 'e'), 0.18, 0.72, 0.16),
    box(0.3, 0.1, 0.01, mat(0xe8c020), -0.08, 0.66, 0.16),
    box(0.03, 0.12, 0.03, mat(0x222222), 0.22, 0.4, 0.17),
    cyl(0.02, 0.02, 1.2, mat(0x333333), -0.2, 1.4, 0.06, 6),
  );
}

function tent(): THREE.Group {
  const canvas = mat(0x5f6b3a);
  const s = new THREE.Shape();
  s.moveTo(-1.1, 0);
  s.lineTo(0, 1.5);
  s.lineTo(1.1, 0);
  s.lineTo(-1.1, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: false });
  geo.translate(0, 0, -1.1);
  const g = group(new THREE.Mesh(geo, canvas));
  // entrada oscura
  const door = new THREE.Shape();
  door.moveTo(-0.45, 0);
  door.lineTo(0, 0.95);
  door.lineTo(0.45, 0);
  const d = new THREE.Mesh(new THREE.ShapeGeometry(door), mat(0x161810));
  d.position.z = 1.11;
  g.add(d, cyl(0.02, 0.02, 1.6, mat(0x333333), 0, 0.8, 1.15, 4));
  return g;
}

/** Andamio de obra. */
function scaffold(): THREE.Group {
  const pipe = mat(0x9a9a92);
  const plank = mat(0xa07e48);
  const g = new THREE.Group();
  for (const x of [-1.4, 0, 1.4]) for (const z of [-0.55, 0.55]) g.add(cyl(0.03, 0.03, 3.2, pipe, x, 1.6, z, 6));
  for (const y of [0.1, 1.5, 2.9]) {
    g.add(box(2.9, 0.05, 0.05, pipe, 0, y, -0.55), box(2.9, 0.05, 0.05, pipe, 0, y, 0.55));
    if (y > 1) g.add(box(2.9, 0.05, 1.15, plank, 0, y + 0.05, 0));
  }
  const brace = cyl(0.025, 0.025, 2.0, pipe, -0.7, 0.8, 0.56, 6);
  brace.rotation.z = 0.78;
  g.add(brace, box(0.5, 0.3, 0.35, mat(0x6b6b66), 0.6, 3.1, 0), box(0.6, 0.12, 0.4, mat(0x8a8780), -0.8, 1.6, 0.1));
  return g;
}

/** Columna redonda gótica con basa y capitel. */
function roundPillar(h = 6): THREE.Group {
  const stone = mat(0xa79c88);
  return group(cyl(0.42, 0.42, h, stone, 0, h / 2, 0, 16), box(1.0, 0.3, 1.0, stone, 0, 0.15, 0), cyl(0.5, 0.42, 0.25, stone, 0, 0.42, 0, 16), cyl(0.6, 0.42, 0.45, stone, 0, h - 0.4, 0, 16), box(1.25, 0.2, 1.25, stone, 0, h - 0.1, 0));
}

/** Cama de enfermería. */
function bed(): THREE.Group {
  const metal = mat(0xb8bcbc);
  const g = group(box(0.95, 0.12, 2.0, metal, 0, 0.5, 0), box(0.9, 0.14, 1.95, mat(0xe8e8e0), 0, 0.62, 0), box(0.6, 0.1, 0.35, mat(0xf4f4ee), 0, 0.73, -0.75), box(0.92, 0.04, 1.2, mat(0x8fa6b8), 0, 0.71, 0.3));
  for (const z of [-0.95, 0.95]) g.add(box(0.95, z < 0 ? 0.6 : 0.35, 0.04, metal, 0, z < 0 ? 0.85 : 0.7, z));
  for (const x of [-0.42, 0.42]) for (const z of [-0.9, 0.9]) g.add(cyl(0.02, 0.02, 0.45, metal, x, 0.22, z, 6), cyl(0.04, 0.04, 0.03, mat(0x222222), x, 0.03, z, 8));
  return g;
}

/** Paredes acolchadas de goma (sala de goma). */
function padding(w = 4): THREE.Group {
  const m = texMat('padding', 128, 128, (ctx, cw, ch) => {
    ctx.fillStyle = '#a8a292';
    ctx.fillRect(0, 0, cw, ch);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const g = ctx.createRadialGradient((x + 0.5) * (cw / 2), (y + 0.5) * (ch / 2), 4, (x + 0.5) * (cw / 2), (y + 0.5) * (ch / 2), cw / 2.6);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(60,50,30,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(x * (cw / 2), y * (ch / 2), cw / 2, ch / 2);
      ctx.fillStyle = '#6a6250';
      ctx.beginPath();
      ctx.arc(x * (cw / 2), y * (ch / 2), 3, 0, 7);
      ctx.fill();
    }
  });
  const mesh = plane(w, 2.6, m, 0, 1.3, 0.03);
  const geo = mesh.geometry;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 0.8), uv.getY(i) * (2.6 / 0.8));
  (m as THREE.MeshBasicMaterial).map!.wrapS = (m as THREE.MeshBasicMaterial).map!.wrapT = THREE.RepeatWrapping;
  return group(mesh);
}

function artPainter(seed: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const r = (k: number) => Math.abs(Math.sin(seed * 91.7 + k * 12.3)) % 1;
    ctx.fillStyle = `hsl(${r(1) * 360}, 25%, ${20 + r(2) * 20}%)`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `hsla(${r(i + 3) * 360}, ${30 + r(i) * 40}%, ${30 + r(i + 9) * 40}%, 0.7)`;
      ctx.beginPath();
      ctx.ellipse(r(i + 4) * w, r(i + 5) * h, 6 + r(i + 6) * w * 0.3, 6 + r(i + 7) * h * 0.3, r(i) * 3, 0, 7);
      ctx.fill();
    }
    // algo que parece una cara si se mira mucho rato
    ctx.fillStyle = 'rgba(10,10,10,0.6)';
    ctx.fillRect(w * 0.38, h * 0.38, w * 0.06, h * 0.05);
    ctx.fillRect(w * 0.56, h * 0.38, w * 0.06, h * 0.05);
    ctx.fillRect(w * 0.42, h * 0.6, w * 0.16, h * 0.02);
  };
}

let paintingSeed = 0;
function painting(): THREE.Group {
  const k = paintingSeed++ % 4;
  return group(box(0.9, 0.7, 0.04, mat(0x5a3a1a), 0, 0, 0.02), plane(0.78, 0.58, texMat('art' + k, 128, 96, artPainter(k + 1)), 0, 0, 0.042));
}

function floorPainting(w = 0.9, h = 0.7): THREE.Group {
  const k = paintingSeed++ % 4;
  const g = group(box(w, 0.04, h, mat(0x5a3a1a), 0, 0.02, 0));
  const art = decal(w - 0.1, h - 0.1, texMat('art' + k, 128, 96, artPainter(k + 1)), 0.042);
  g.add(art);
  return g;
}

/** Mancha de sangre en el suelo. */
function blood(): THREE.Group {
  const m = texMat(
    'blood',
    128,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(90,8,6,0.85)';
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        ctx.ellipse(w / 2 + Math.sin(i * 2.4) * w * 0.25 * (i / 14), h / 2 + Math.cos(i * 1.3) * h * 0.3 * (i / 14), 4 + ((i * 7) % 18), 3 + ((i * 5) % 12), i, 0, 7);
        ctx.fill();
      }
    },
    { transparent: true, depthWrite: false },
  );
  return group(decal(1.1, 1.1, m));
}

/** Bombilla sola colgando de un cable. */
function bulb(): THREE.Group {
  const cord = cyl(0.006, 0.006, 0.5, mat(0x111111), 0, -0.25, 0, 4);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
  b.position.y = -0.55;
  return group(cord, cyl(0.03, 0.03, 0.06, mat(0x333333), 0, -0.5, 0, 8), b);
}

// ---- Nivel 2 ----

/** Máquina vieja de suelo a techo, llena de diales y tubos. */
function machine(): THREE.Group {
  const body = mat(0x4d5048);
  const rust = mat(0x6d4a32);
  const g = group(box(0.8, 2.5, 2.2, body, 0, 1.25, 0), box(0.85, 0.15, 2.3, rust, 0, 0.08, 0), box(0.85, 0.12, 2.3, rust, 0, 2.45, 0));
  for (let i = 0; i < 4; i++) {
    const d = cyl(0.09, 0.09, 0.03, mat(0xd8d2b8), 0.41, 1.5 + (i % 2) * 0.3, -0.6 + i * 0.4, 12);
    d.rotation.z = Math.PI / 2;
    g.add(d);
  }
  g.add(box(0.02, 0.5, 0.8, mat(0x22251f), 0.41, 0.8, 0.4), box(0.03, 0.08, 0.08, mat(0x5a1a12), 0.42, 1.1, -0.7));
  for (const z of [-0.8, 0.8]) g.add(cyl(0.07, 0.07, 1.2, mat(0x7a4426), 0.2, 3.0, z, 8));
  for (let k = 0; k < 6; k++) g.add(box(0.02, 0.04, 1.8, mat(0x2a2c27), 0.405, 0.3 + k * 0.08, 0));
  return g;
}

/** Carrito con ruedas, con trastos encima. */
function trolley(): THREE.Group {
  const metal = mat(0x6b6e6a);
  const g = group(box(1.1, 0.04, 0.6, metal, 0, 0.3, 0), box(1.1, 0.04, 0.6, metal, 0, 0.8, 0));
  for (const x of [-0.52, 0.52]) for (const z of [-0.27, 0.27]) g.add(cyl(0.018, 0.018, 0.85, metal, x, 0.45, z, 6), cyl(0.05, 0.05, 0.04, mat(0x111111), x, 0.05, z, 8));
  g.add(box(0.4, 0.25, 0.3, mat(0x8a2c22), -0.2, 0.95, 0), box(0.3, 0.12, 0.2, mat(0x9b7a4c), 0.25, 0.38, 0.05), cyl(0.06, 0.06, 0.2, mat(0x2c5f8a), 0.3, 0.92, -0.1, 8));
  return g;
}

function toolbox(): THREE.Group {
  return group(box(0.5, 0.22, 0.24, mat(0xa82020), 0, 0.11, 0), box(0.3, 0.03, 0.03, mat(0x222222), 0, 0.26, 0), box(0.12, 0.02, 0.3, mat(0x888888), 0.4, 0.01, 0.1, 0.5));
}

/** Escalera de mano tumbada en el suelo. */
function ladder(): THREE.Group {
  const al = mat(0xa8aaa6);
  const g = group(box(2.2, 0.04, 0.05, al, 0, 0.03, -0.2), box(2.2, 0.04, 0.05, al, 0, 0.03, 0.2));
  for (let x = -1; x <= 1.01; x += 0.33) g.add(box(0.03, 0.03, 0.4, al, x, 0.03, 0));
  return g;
}

function woodpile(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) g.add(box(1.6, 0.08, 0.2, mat(i % 2 ? 0x7a6040 : 0x6a5236), Math.sin(i) * 0.1, 0.04 + Math.floor(i / 3) * 0.08, -0.25 + (i % 3) * 0.24, Math.sin(i * 3) * 0.08));
  return g;
}

/** Cables tirados por el suelo. */
function cords(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.22 + i * 0.05, 0.012, 4, 18), mat(i === 1 ? 0xc06010 : 0x151515));
    t.rotation.x = Math.PI / 2;
    t.position.set(i * 0.15, 0.015 + i * 0.012, Math.sin(i) * 0.1);
    g.add(t);
  }
  const loose = cyl(0.012, 0.012, 1.6, mat(0x151515), 0.9, 0.012, 0.2, 4);
  loose.rotation.set(0, 0.4, Math.PI / 2);
  g.add(loose);
  return g;
}

/** Cristales de un fluorescente roto. */
function glass(): THREE.Group {
  const m = mat(0xdde6e8, { transparent: true, opacity: 0.6 }, 'g');
  const g = new THREE.Group();
  for (let i = 0; i < 10; i++) g.add(box(0.05 + (i % 3) * 0.03, 0.004, 0.03 + (i % 2) * 0.03, m, Math.sin(i * 2.7) * 0.4, 0.004, Math.cos(i * 1.9) * 0.3, i));
  const t = cyl(0.016, 0.016, 0.5, mat(0xe8e8e0), 0.2, 0.016, -0.1, 6);
  t.rotation.z = Math.PI / 2;
  g.add(t);
  return g;
}

function paper(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) g.add(box(0.21, 0.003, 0.29, mat(i % 2 ? 0xe8e4d8 : 0xd8d2bc), Math.sin(i * 2) * 0.5, 0.003 + i * 0.001, Math.cos(i * 3) * 0.4, i * 0.9));
  return g;
}

function foldChair(): THREE.Group {
  const m = mat(0x5a5f5a);
  const g = group(box(0.42, 0.03, 0.4, m, 0, 0.45, 0), box(0.42, 0.3, 0.03, m, 0, 0.8, -0.2));
  for (const x of [-0.19, 0.19]) {
    const a = cyl(0.012, 0.012, 0.95, m, x, 0.47, 0, 4);
    a.rotation.x = 0.35;
    const b = cyl(0.012, 0.012, 0.6, m, x, 0.3, 0.02, 4);
    b.rotation.x = -0.4;
    g.add(a, b);
  }
  return g;
}

/** Mesa con un ordenador viejo de tubo. */
function pc(): THREE.Group {
  const g = table();
  g.remove(g.children[g.children.length - 1]);
  g.add(box(0.45, 0.4, 0.42, mat(0xc8c0a8), 0, 0.96, -0.1), box(0.36, 0.28, 0.01, mat(0x0c1a10, { emissive: 0x08200c }, 'e'), 0, 0.98, 0.115));
  g.add(box(0.5, 0.03, 0.18, mat(0xc8c0a8), 0, 0.77, 0.3), box(0.4, 0.12, 0.38, mat(0xbab29a), 0.55, 0.81, -0.1));
  return g;
}

/** Luz de emergencia violeta (la luz se dibuja como un halo). */
function violet(): THREE.Group {
  const cage = cyl(0.1, 0.1, 0.12, mat(0x2a2a2a), 0, -0.06, 0, 8);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb070ff }));
  b.position.y = -0.14;
  b.name = 'glow';
  return group(cage, b);
}

// ---------------------------------------------------------------------------

/** Objetos que se mueven o tienen textura propia: no se fusionan. */
export const DYNAMIC_PROPS = new Set(['text', 'fog', 'hanglamp', 'drip', 'bulb', 'violet']);

export function buildProp(p: Prop): THREE.Object3D | null {
  switch (p.type) {
    case 'chair': return chair();
    case 'desk': return desk();
    case 'cabinet': return cabinet();
    case 'chairstack': return chairStack();
    case 'partition': return partition(p.w);
    case 'plant': return plant();
    case 'vending': return vending();
    case 'cooler': return cooler();
    case 'table': return table();
    case 'box': return box_();
    case 'tile': return fallenTile();
    case 'hole': return ceilingHole();
    case 'tube': return tube();
    case 'hanglamp': return hangLamp();
    case 'outlet': return outlet();
    case 'vent': return wallVent();
    case 'door2wall': return doorToWall();
    case 'shelf': return shelf(p.d);
    case 'pallet': return pallet();
    case 'barrel': return barrel();
    case 'forklift': return forklift();
    case 'cone': return cone();
    case 'dockdoor': return dockDoor();
    case 'meg': return meg();
    case 'cot': return cot();
    case 'radio': return radio();
    case 'tank': return tank();
    case 'gauge': return gauge();
    case 'valve': return valve();
    case 'wires': return wires();
    case 'metaldoor': return metalDoor();
    case 'arch': return arch(p.w, p.h);
    case 'blindarch': return blindArch(p.w, p.h);
    case 'drip': return drip();
    case 'pipe': return longPipe(p.w);
    case 'debris': return debris();
    case 'megcloth': return megCloth();
    case 'megflag': return megFlag();
    case 'paint': return paint(p.h);
    case 'panel': return elecPanel();
    case 'tent': return tent();
    case 'scaffold': return scaffold();
    case 'roundpillar': return roundPillar(p.h);
    case 'bed': return bed();
    case 'padding': return padding(p.w);
    case 'painting': return painting();
    case 'floorpainting': return floorPainting(p.w, p.h);
    case 'blood': return blood();
    case 'bulb': return bulb();
    case 'machine': return machine();
    case 'trolley': return trolley();
    case 'toolbox': return toolbox();
    case 'ladder': return ladder();
    case 'woodpile': return woodpile();
    case 'cords': return cords();
    case 'glass': return glass();
    case 'paper': return paper();
    case 'foldchair': return foldChair();
    case 'pc': return pc();
    case 'violet': return violet();
    case 'text': {
      const w = p.w ?? 2;
      const tex = textTexture(p.text ?? '', 'rgba(150, 20, 15, 0.85)', 'rgba(0,0,0,0)', 512, Math.round(512 / (w / 0.35)));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.35), litMaterial({ map: tex, transparent: true, depthWrite: false }, 0.3));
      mesh.position.z = 0.012;
      return group(mesh);
    }
    case 'fog': {
      // jirones de niebla baja que se mueven despacio
      const g = new THREE.Group();
      const tex = fogTexture();
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9aa4ab, transparent: true, opacity: 0.18, depthWrite: false }));
        s.scale.set(5 + Math.random() * 4, 1.6, 1);
        s.position.set((Math.random() - 0.5) * 8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 8);
        g.add(s);
      }
      return g;
    }
  }
  return null;
}

let fogTex: THREE.Texture | null = null;
function fogTexture(): THREE.Texture {
  fogTex ??= canvasTexture(
    128,
    64,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    false,
  );
  return fogTex;
}

/** Caja de suministros (Nivel 1). Abierta: sin tapa. */
export function makeCrate(open: boolean): THREE.Group {
  const tex = crateTex();
  const wood = litMaterial({ map: tex }, 0.2);
  const g = group(box(0.85, 0.6, 0.85, wood, 0, 0.3, 0));
  const lid = box(0.9, 0.06, 0.9, wood, 0, 0.63, 0);
  lid.name = 'lid';
  if (open) {
    lid.position.set(0.55, 0.05, 0.3);
    lid.rotation.set(0, 0.6, 1.4);
  }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), litMaterial({ map: stencil(), transparent: true }, 0.2));
  label.position.set(0, 0.35, 0.428);
  g.add(lid, label);
  return g;
}

let crateT: THREE.Texture | null = null;
const crateTex = () => (crateT ??= crateTexture());
let stencilT: THREE.Texture | null = null;
const stencil = () => (stencilT ??= textTexture('SUMINISTROS', 'rgba(20,20,20,0.85)', 'rgba(0,0,0,0)', 256, 64));
