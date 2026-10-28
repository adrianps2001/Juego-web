import * as THREE from 'three';
import { litMaterial } from './lighting';
import { canvasTexture, labelTexture, smilerTexture, textTexture } from './textures';

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

// ---------- enemigos ----------

/** Estado de animación que manda el anfitrión. */
export const Anim = { Idle: 0, Walk: 1, Run: 2, Attack: 3, Flee: 4, Growl: 5 } as const;

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

/** Pieza articulada: un cilindro que cuelga de su pivote. */
function segment(len: number, r0: number, r1: number, m: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  const g = new THREE.CylinderGeometry(r1, r0, len, 8);
  g.translate(0, -len / 2, 0);
  pivot.add(new THREE.Mesh(g, m));
  return pivot;
}

function glowEyes(color: number, spread: number, size = 0.025): THREE.Group {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), fog: false });
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), m);
    e.position.x = s * spread;
    g.add(e);
  }
  return g;
}

/** Hound: humanoide pálido que va a cuatro patas, con melena negra. */
export function makeHound(seed: number): EnemyModel {
  const skin = litMaterial({ color: 0x9c9a8e }, 0.1);
  const hair = litMaterial({ color: 0x0c0b0a, side: THREE.DoubleSide }, 0.1);
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.75;
  group.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.75, 6, 12), skin);
  torso.rotation.x = Math.PI / 2 - 0.15;
  const ribs = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 4, 10), litMaterial({ color: 0x8a877b }, 0.1));
  ribs.rotation.x = Math.PI / 2;
  ribs.position.set(0, -0.08, -0.1);
  body.add(torso, ribs);

  const head = new THREE.Group();
  head.position.set(0, 0.12, -0.6);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin);
  skull.scale.set(0.9, 1, 1.15);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), litMaterial({ color: 0x5a2222 }, 0.1));
  jaw.position.set(0, -0.12, -0.06);
  const eyes = glowEyes(0xff2a10, 0.06, 0.018);
  eyes.position.set(0, 0.02, -0.16);
  head.add(skull, jaw, eyes);
  // melena: mechones largos que cuelgan
  for (let i = 0; i < 14; i++) {
    const len = 0.5 + Math.sin(i * 3.1 + seed) * 0.15;
    const strand = new THREE.Mesh(new THREE.PlaneGeometry(0.07, len), hair);
    const a = (i / 14) * Math.PI * 2;
    strand.position.set(Math.cos(a) * 0.13, -len / 2 + 0.1, Math.sin(a) * 0.1 + 0.03);
    strand.rotation.set(0.25, a, 0);
    head.add(strand);
  }
  body.add(head);

  const limbs: { upper: THREE.Group; lower: THREE.Group; phase: number }[] = [];
  for (const [x, z, phase] of [[-0.2, -0.38, 0], [0.2, -0.38, Math.PI], [-0.18, 0.38, Math.PI], [0.18, 0.38, 0]] as const) {
    const upper = segment(0.42, 0.06, 0.07, skin);
    upper.position.set(x, 0, z);
    const lower = segment(0.42, 0.04, 0.055, skin);
    lower.position.y = -0.42;
    upper.add(lower);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.16), skin);
    hand.position.set(0, -0.42, -0.05);
    lower.add(hand);
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

/** Faceling: humanoide alto y pálido, vestido, sin cara. */
export function makeFaceling(seed: number): EnemyModel {
  const skin = litMaterial({ color: 0xd2c7b8 }, 0.1);
  const suit = litMaterial({ color: [0x3a3d44, 0x4a3d34, 0x2f3a33][Math.floor(seed) % 3] }, 0.1);
  const shirt = litMaterial({ color: 0xbcb6a8 }, 0.1);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 12), suit);
  torso.scale.set(1.2, 1, 0.75);
  torso.position.y = 1.32;
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.25, 0.02), shirt);
  collar.position.set(0, 1.5, -0.15);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 10), skin);
  neck.position.y = 1.78;
  const head = new THREE.Group();
  head.position.y = 1.95;
  // cabeza lisa: sin ojos, sin boca
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skin);
  skull.scale.set(0.95, 1.25, 1.05);
  head.add(skull);
  const legL = segment(0.95, 0.07, 0.08, suit);
  legL.position.set(-0.1, 0.98, 0);
  const legR = segment(0.95, 0.07, 0.08, suit);
  legR.position.set(0.1, 0.98, 0);
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.26), litMaterial({ color: 0x111111 }, 0.1));
    shoe.position.set(0, -0.95, -0.05);
    leg.add(shoe);
  }
  const armL = segment(0.82, 0.045, 0.055, suit);
  armL.position.set(-0.28, 1.65, 0);
  const armR = segment(0.82, 0.045, 0.055, suit);
  armR.position.set(0.28, 1.65, 0);
  for (const arm of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), skin);
    hand.position.y = -0.87;
    arm.add(hand);
  }
  body.add(torso, collar, neck, head, legL, legR, armL, armR);
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

/** Skin-Stealer: criatura altísima y esquelética envuelta en jirones de piel humana. */
export function makeSkinStealer(seed: number): EnemyModel {
  const hide = litMaterial({ color: 0x4a2a22 }, 0.1);
  const bone = litMaterial({ color: 0x6b4d3e }, 0.1);
  const skin = litMaterial({ color: 0xc9a48a, side: THREE.DoubleSide }, 0.1);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const spine = new THREE.Group();
  spine.position.y = 1.35;
  body.add(spine);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.7, 4, 10), hide);
  chest.position.y = 0.4;
  spine.add(chest);
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 4, 12, Math.PI), bone);
    rib.position.set(0, 0.2 + i * 0.1, -0.02);
    rib.rotation.set(Math.PI / 2, 0, Math.PI);
    spine.add(rib);
  }
  // jirones de piel colgando
  for (let i = 0; i < 6; i++) {
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.5 + (i % 3) * 0.15), skin);
    const a = (i / 6) * Math.PI * 2;
    flap.position.set(Math.cos(a) * 0.19, 0.45, Math.sin(a) * 0.19);
    flap.rotation.y = -a + Math.PI / 2;
    spine.add(flap);
  }
  const head = new THREE.Group();
  head.position.y = 1.0;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), hide);
  skull.scale.set(0.85, 1.35, 1);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10, Math.PI * 0.6, Math.PI * 0.8, 0.3, 1.6), skin);
  mask.scale.set(0.9, 1.3, 1.05);
  mask.rotation.y = Math.PI;
  const eyes = glowEyes(0xffd27a, 0.05, 0.016);
  eyes.position.set(0, 0.04, -0.13);
  head.add(skull, mask, eyes);
  spine.add(head);
  const legs: THREE.Group[] = [];
  for (const x of [-0.12, 0.12]) {
    const upper = segment(0.75, 0.04, 0.06, hide);
    upper.position.set(x, 1.4, 0);
    const lower = segment(0.75, 0.03, 0.045, bone);
    lower.position.y = -0.75;
    upper.add(lower);
    body.add(upper);
    legs.push(upper);
  }
  const arms: THREE.Group[] = [];
  for (const x of [-0.24, 0.24]) {
    const upper = segment(0.7, 0.035, 0.05, hide);
    upper.position.set(x, 0.8, 0);
    const lower = segment(0.75, 0.025, 0.035, bone);
    lower.position.y = -0.7;
    upper.add(lower);
    // dedos largos
    for (let f = -1; f <= 1; f++) {
      const finger = segment(0.22, 0.006, 0.01, bone);
      finger.position.set(f * 0.02, -0.75, 0);
      finger.rotation.x = 0.2;
      lower.add(finger);
    }
    spine.add(upper);
    arms.push(upper);
  }
  let cycle = seed;
  return {
    group,
    eye: 2.35,
    animate(dt, time, anim) {
      const moving = anim === Anim.Walk || anim === Anim.Run;
      cycle += dt * (anim === Anim.Run ? 8 : moving ? 3 : 0);
      const sw = moving ? Math.sin(cycle) * 0.5 : 0;
      legs[0].rotation.x = sw;
      legs[1].rotation.x = -sw;
      arms[0].rotation.x = anim === Anim.Attack ? 1.6 : -sw * 0.7 + 0.1;
      arms[1].rotation.x = anim === Anim.Attack ? 1.6 : sw * 0.7 + 0.1;
      spine.rotation.x = 0.25 + (anim === Anim.Run ? 0.25 : 0); // jorobado
      // sacudidas bruscas de cabeza
      head.rotation.z = Math.sin(time * 0.6 + seed) * 0.2 + (Math.random() < 0.02 ? (Math.random() - 0.5) * 0.8 : 0);
      head.rotation.y = anim === Anim.Idle ? Math.sin(time * 0.3) * 0.5 : 0;
    },
  };
}

export function makeEnemy(kind: string, seed: number): EnemyModel {
  switch (kind) {
    case 'hound':
      return makeHound(seed);
    case 'faceling':
      return makeFaceling(seed);
    case 'skinstealer':
      return makeSkinStealer(seed);
    default:
      return makeSmiler(seed);
  }
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

/** Botiquín con vendas. */
export function makeMedkit(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.2), litMaterial({ color: 0xe8e4dc, emissive: 0x1a1a1a }, 0.05));
  box.position.y = 0.06;
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
