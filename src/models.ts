import * as THREE from 'three';
import { litMaterial } from './lighting';
import { labelTexture, smilerTexture, textTexture } from './textures';

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

/** Explorador: cuerpo articulado con linterna en la mano derecha. */
export function makeHumanoid(color: number, name: string): Humanoid {
  const shirt = litMaterial({ color }, 0.1);
  const pants = litMaterial({ color: 0x2f3542 }, 0.1);
  const skin = litMaterial({ color: 0xd9a98a }, 0.1);
  const dark = litMaterial({ color: 0x1e1e1e }, 0.1);
  const pack = litMaterial({ color: 0x5b4a33 }, 0.1);

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = rounded(0.46, 0.62, 0.26, shirt);
  torso.position.y = 1.18;
  const backpack = rounded(0.36, 0.42, 0.16, pack);
  backpack.position.set(0, 1.2, 0.2);
  const hips = rounded(0.42, 0.22, 0.24, pants);
  hips.position.y = 0.86;

  const head = new THREE.Group();
  head.position.y = 1.6;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), skin);
  skull.scale.set(1, 1.12, 1.05);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
  hair.position.y = 0.02;
  hair.rotation.x = 0.25;
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  eyes.position.set(0, 0.02, -0.15);
  head.add(skull, hair, eyes);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), skin);
  neck.position.y = 1.5;

  const limb = (len: number, rad: number, mat: THREE.Material) => {
    const pivot = new THREE.Group();
    const g = new THREE.CapsuleGeometry(rad, len - rad * 2, 4, 10);
    g.translate(0, -len / 2, 0);
    pivot.add(new THREE.Mesh(g, mat));
    return pivot;
  };
  const legL = limb(0.82, 0.085, pants);
  legL.position.set(-0.11, 0.86, 0);
  const legR = limb(0.82, 0.085, pants);
  legR.position.set(0.11, 0.86, 0);
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), dark);
    shoe.position.set(0, -0.8, -0.05);
    leg.add(shoe);
  }
  const armL = limb(0.62, 0.065, shirt);
  armL.position.set(-0.3, 1.44, 0);
  const armR = limb(0.62, 0.065, shirt);
  armR.position.set(0.3, 1.44, 0);
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    hand.position.y = -0.62;
    arm.add(hand);
  }
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

  body.add(torso, backpack, hips, neck, head, legL, legR, armL, armR);
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

// ---------- Smiler ----------

const smilerFace = smilerTexture();

export interface SmilerModel {
  group: THREE.Group;
  animate: (time: number) => void;
}

/** Una silueta de sombra con la sonrisa y los ojos brillando. */
export function makeSmiler(seed: number): SmilerModel {
  const group = new THREE.Group();
  const shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.82, depthWrite: false });
  const blobs: THREE.Mesh[] = [];
  const shapes: [number, number, number, number][] = [
    [0, 1.55, 0, 0.42],
    [0, 1.05, 0.05, 0.5],
    [0, 0.55, 0.05, 0.4],
    [-0.35, 1.0, 0, 0.25],
    [0.35, 1.0, 0, 0.25],
    [-0.45, 0.55, -0.05, 0.16],
    [0.45, 0.55, -0.05, 0.16],
  ];
  for (const [x, y, z, r] of shapes) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), shadow);
    m.position.set(x, y, z);
    m.scale.y = 1.3;
    blobs.push(m);
    group.add(m);
  }
  const face = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: smilerFace, fog: false, transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.55) }),
  );
  face.scale.set(1.1, 1.1, 1);
  face.position.set(0, 1.55, -0.3);
  face.renderOrder = 2;
  group.add(face);
  return {
    group,
    animate(time) {
      blobs.forEach((b, i) => {
        b.position.x = shapes[i][0] + Math.sin(time * 1.7 + i * 2 + seed) * 0.04;
        b.scale.x = 1 + Math.sin(time * 2.3 + i) * 0.06;
      });
      face.position.y = 1.55 + Math.sin(time * 1.3 + seed) * 0.04;
      face.material.opacity = 0.85 + Math.random() * 0.15;
    },
  };
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
  const band = litMaterial({ color: 0xd8a619, emissive: 0x2a2000 }, 0.05);
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

const signTex = textTexture('SALIDA', '#8dff9b', '#06200b');

/** Puerta metálica de salida con el cartel verde encima. */
export function makeExitDoor(): THREE.Group {
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
  const signBox = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.08), litMaterial({ color: 0x222222 }, 0.3));
  signBox.position.set(0, h + 0.3, 0.02);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.15),
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
