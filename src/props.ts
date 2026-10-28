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

// ---------------------------------------------------------------------------

/** Objetos que se mueven o tienen textura propia: no se fusionan. */
export const DYNAMIC_PROPS = new Set(['text', 'fog', 'hanglamp']);

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
