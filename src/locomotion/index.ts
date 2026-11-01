// Locomoción procedural reutilizable (solo depende de three.js).
//
// Para usarla con otra criatura u otro proyecto:
//  1. Monta un esqueleto con Object3D que cumpla BipedRig (huesos colgando
//     hacia -Y, raíz en los pies mirando a -Z).
//  2. Implementa Env con tu mapa (suelo, techo y paredes).
//  3. Crea new BipedLocomotion(rig, env) y llama a update(dt, gait, mirarA)
//     cada fotograma después de mover la raíz.
export { solveTwoBone, bonePosition } from './ik';
export { BipedLocomotion, type BipedOptions, type BipedRig, type Env, type Gait, type Limb } from './biped';
