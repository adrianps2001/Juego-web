import * as THREE from 'three';

// Cinemática inversa de dos huesos (hombro-codo-mano, cadera-rodilla-pie).
// Convención: en reposo cada hueso cuelga hacia -Y de su espacio local y el
// hueso de abajo es hijo del de arriba, colocado en (0, -largo, 0).

const _s = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _u = new THREE.Vector3();
const _l = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Vector3();
const _end = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qp = new THREE.Quaternion();
const _qu = new THREE.Quaternion();
const _ql = new THREE.Quaternion();
const _qt = new THREE.Quaternion();

/** Posición en el mundo del origen de un hueso (sin tocar sus hijos). */
export function bonePosition(bone: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  const parent = bone.parent;
  if (!parent) return out.copy(bone.position);
  parent.updateWorldMatrix(true, false);
  return out.copy(bone.position).applyMatrix4(parent.matrixWorld);
}

/** Orientación cuyo -Y apunta en `dir` y cuyo X está lo más cerca posible de `axis`. */
function basis(dir: THREE.Vector3, axis: THREE.Vector3, out: THREE.Quaternion) {
  _y.copy(dir).negate();
  _x.copy(axis).addScaledVector(_y, -axis.dot(_y));
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  out.setFromRotationMatrix(_m);
}

/**
 * Dobla dos huesos para que el extremo llegue a `target` (en coordenadas del
 * mundo). `pole` es hacia dónde se dobla la articulación del medio (las
 * rodillas hacia delante, los codos hacia atrás). Si no llega, estira.
 */
export function solveTwoBone(upper: THREE.Object3D, lower: THREE.Object3D, a: number, b: number, target: THREE.Vector3, pole: THREE.Vector3) {
  bonePosition(upper, _s);
  _dir.subVectors(target, _s);
  let d = _dir.length();
  if (d < 1e-5) return;
  _dir.divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-4);
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < 1e-8) _perp.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
  _perp.normalize();
  _u.copy(_dir).multiplyScalar(cosA).addScaledVector(_perp, sinA);
  _e.copy(_s).addScaledVector(_u, a);
  _end.copy(_s).addScaledVector(_dir, d);
  _l.subVectors(_end, _e).normalize();
  _n.crossVectors(_u, _perp).normalize();
  basis(_u, _n, _qu);
  basis(_l, _n, _ql);
  upper.parent!.getWorldQuaternion(_qp);
  upper.quaternion.copy(_qp.invert().multiply(_qu));
  lower.quaternion.copy(_qt.copy(_qu).invert().multiply(_ql));
  upper.updateMatrixWorld(true);
}
