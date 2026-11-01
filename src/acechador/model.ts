import * as THREE from 'three';
import { BipedLocomotion, type BipedRig, type Env, type Gait } from '../locomotion';
import { BODY } from './config';

// Cuerpo del Acechador: todo negro mate menos dos puntos blancos por ojos.
// Esqueleto de Object3D con cápsulas finas; la animación es la locomoción
// procedural (src/locomotion), que mira suelo, techo y paredes.

const black = new THREE.MeshBasicMaterial({ color: 0x030303 });
// los ojos se ven aunque haya niebla: dos puntos en la oscuridad
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf4f1e8, fog: false });

const geos = new Map<string, THREE.BufferGeometry>();
/** Cápsula que cuelga hacia -Y desde su hueso (cacheada por medidas). */
function limbGeo(len: number, r0: number, r1: number): THREE.BufferGeometry {
  const key = `${len}|${r0}|${r1}`;
  let g = geos.get(key);
  if (!g) {
    const pts: THREE.Vector2[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // un poco más gruesa arriba, con una articulación marcada abajo
      const r = r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * 0.006;
      pts.push(new THREE.Vector2(Math.max(0.004, r), -t * len));
    }
    pts.unshift(new THREE.Vector2(0.001, r0 * 0.6));
    pts.push(new THREE.Vector2(0.001, -len - r1 * 0.6));
    g = new THREE.LatheGeometry(pts, 7);
    geos.set(key, g);
  }
  return g;
}

function bone(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const b = new THREE.Object3D();
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat = black): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}

export interface AcechadorModel {
  group: THREE.Group;
  eye: number;
  animate: (dt: number, time: number, anim: number) => void;
  setEnv: (env: Env, focus: () => THREE.Vector3 | null) => void;
  loco: () => BipedLocomotion | null;
}

/** Anim (models.ts): 0 quieto, 1 andar, 2 correr, 3 atacar, 4 huir. */
const GAIT: Gait[] = ['idle', 'walk', 'run', 'attack', 'flee'];

export function makeAcechador(): AcechadorModel {
  const B = BODY;
  const group = new THREE.Group();
  const hips = bone(group, 0, B.hipHeight, 0);
  mesh(hips, limbGeo(0.18, 0.11, 0.08)).position.y = 0.05;
  // tronco: de la cadera hacia arriba (el hueso cuelga a -Y, así que se gira la malla)
  const spine = bone(hips, 0, 0.05, 0);
  const torso = mesh(spine, limbGeo(B.torso, 0.085, 0.13));
  torso.rotation.x = Math.PI;
  torso.scale.set(1.3, 1, 0.75);
  const neck = bone(spine, 0, B.torso, 0);
  const neckMesh = mesh(neck, limbGeo(B.neck, 0.032, 0.028));
  neckMesh.rotation.x = Math.PI;
  const head = bone(neck, 0, B.neck, 0);
  const skull = mesh(head, new THREE.SphereGeometry(0.11, 10, 8));
  skull.scale.set(0.85, 1.35, 0.95);
  skull.position.set(0, 0.12, 0);
  // los ojos: dos puntos pequeños, algo separados
  const eyeGeo = new THREE.SphereGeometry(0.014, 6, 4);
  for (const s of [-1, 1]) mesh(head, eyeGeo, eyeMat).position.set(s * 0.038, 0.15, -0.098);

  const arms = [-1, 1].map((s) => {
    const upper = bone(spine, s * B.shoulder, B.torso - 0.06, 0);
    mesh(upper, limbGeo(B.upperArm, 0.05, 0.034));
    const lower = bone(upper, 0, -B.upperArm, 0);
    mesh(lower, limbGeo(B.forearm, 0.034, 0.024));
    // manos con dedos larguísimos
    const hand = bone(lower, 0, -B.forearm, 0);
    for (let f = 0; f < 4; f++) {
      const finger = mesh(hand, limbGeo(0.17 + (f === 1 || f === 2 ? 0.04 : 0), 0.009, 0.004));
      finger.position.set((f - 1.5) * 0.017, -0.01, 0);
      finger.rotation.set(-0.15, 0, (f - 1.5) * 0.12);
    }
    return { upper, lower, a: B.upperArm, b: B.forearm + 0.08 };
  }) as BipedRig['arms'];

  const legs = [-1, 1].map((s) => {
    const upper = bone(hips, s * B.hipWidth, 0, 0);
    mesh(upper, limbGeo(B.thigh, 0.068, 0.042));
    const lower = bone(upper, 0, -B.thigh, 0);
    mesh(lower, limbGeo(B.shin, 0.042, 0.026));
    const foot = mesh(lower, limbGeo(0.2, 0.024, 0.012));
    foot.position.set(0, -B.shin, 0);
    foot.rotation.x = Math.PI / 2; // el pie apunta hacia delante (-Z)
    return { upper, lower, a: B.thigh, b: B.shin };
  }) as BipedRig['legs'];

  const rig: BipedRig = { root: group, hips, spine, neck, head, legs, arms, hipHeight: B.hipHeight, height: B.height, hipWidth: B.hipWidth };
  let loco: BipedLocomotion | null = null;
  let focus: () => THREE.Vector3 | null = () => null;

  return {
    group,
    eye: B.height - 0.2,
    setEnv(env, f) {
      loco = new BipedLocomotion(rig, env, { stride: 1.35, lift: 0.12, wallSpeed: 1.1 });
      focus = f;
    },
    loco: () => loco,
    animate(dt, _time, anim) {
      if (!loco || !group.visible) return;
      // solo mira a quien tiene cerca
      const f = focus();
      const near = f && f.distanceTo(group.position) < 25 ? f : null;
      loco.update(dt, GAIT[anim] ?? 'walk', near);
    },
  };
}
