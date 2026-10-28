import * as THREE from 'three';
import { CELL, LEVELS, LM_RES, type LevelMap } from './world';

/**
 * Uniforms compartidos por todos los materiales "iluminados". Al cambiar de
 * nivel solo se cambian sus valores; los shaders no se recompilan.
 */
export const lightUniforms = {
  uLightMap: { value: null as THREE.Texture | null },
  uLmScale: { value: new THREE.Vector2(1, 1) },
  uFlicker: { value: 1 },
  uTint: { value: new THREE.Color(1, 1, 1) },
  uAmbient: { value: 0.02 },
  uHeight: { value: 2.8 },
  // linternas: la propia (0) y las de los compañeros
  uTorchPos: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
  uTorchDir: { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, 0, -1)) },
  uTorchPower: { value: [0, 0, 0, 0] },
};

export const MAX_TORCHES = 4;
const TORCH_RANGE = 22; // metros
const TORCH_COS = Math.cos(0.42); // apertura del haz

/** Crea el mapa de luz del nivel como textura y actualiza los uniforms. */
export function useLevelLight(map: LevelMap): THREE.DataTexture {
  const L = LEVELS[map.level];
  const tw = map.w * LM_RES;
  const th = map.h * LM_RES;
  const data = new Uint8Array(tw * th * 4);
  for (let i = 0; i < tw * th; i++) {
    // se guarda la mitad para permitir valores de hasta 2
    data[i * 4] = Math.min(255, map.light[i * 2] * 127.5);
    data[i * 4 + 1] = Math.min(255, map.light[i * 2 + 1] * 127.5);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, tw, th, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  lightUniforms.uLightMap.value?.dispose();
  lightUniforms.uLightMap.value = tex;
  lightUniforms.uLmScale.value.set(1 / (map.w * CELL), 1 / (map.h * CELL));
  lightUniforms.uTint.value.setRGB(...L.tint);
  lightUniforms.uAmbient.value = L.ambient;
  lightUniforms.uHeight.value = L.height;
  return tex;
}

export type LitParams = THREE.MeshBasicMaterialParameters & { emissive?: THREE.ColorRepresentation };

/**
 * Material ligero para todo el mundo: no usa las luces de Three.js (que se
 * calculan en cada píxel aunque estén apagadas). Combina la luz precalculada
 * de los fluorescentes, leída del mapa de luz por posición, con hasta
 * MAX_TORCHES linternas calculadas a mano. `offset` desplaza la muestra del
 * mapa de luz a lo largo de la normal (para las paredes).
 */
export function litMaterial(params: LitParams = {}, offset = 0.35): THREE.MeshBasicMaterial {
  const { emissive, ...basic } = params;
  const mat = new THREE.MeshBasicMaterial(basic);
  const emissiveColor = new THREE.Color(emissive ?? 0x000000);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lightUniforms);
    shader.uniforms.uLmOffset = { value: offset };
    shader.uniforms.uEmissive = { value: emissiveColor };
    shader.vertexShader =
      'uniform float uLmOffset;\nvarying vec3 vLmPos;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vLmPos = vWorldPos + vWorldNormal * uLmOffset;`,
      );
    shader.fragmentShader =
      `#define MAX_TORCHES ${MAX_TORCHES}
uniform sampler2D uLightMap;
uniform vec2 uLmScale;
uniform float uFlicker;
uniform vec3 uTint;
uniform float uAmbient;
uniform float uHeight;
uniform vec3 uEmissive;
uniform vec3 uTorchPos[MAX_TORCHES];
uniform vec3 uTorchDir[MAX_TORCHES];
uniform float uTorchPower[MAX_TORCHES];
varying vec3 vLmPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
` +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `vec4 lm = texture2D(uLightMap, vLmPos.xz * uLmScale);
  float lmLight = 2.0 * (lm.r + lm.g * uFlicker);
  // un poco más oscuro abajo, como si la luz viniera del techo
  lmLight *= mix(0.62, 1.0, clamp(vLmPos.y / uHeight, 0.0, 1.0));
  vec3 light = uTint * lmLight + uAmbient;
  for (int i = 0; i < MAX_TORCHES; i++) {
    if (uTorchPower[i] <= 0.0) continue;
    vec3 d = vWorldPos - uTorchPos[i];
    float dist = length(d);
    vec3 dir = d / max(dist, 0.001);
    float cone = smoothstep(${TORCH_COS.toFixed(3)}, ${(TORCH_COS + 0.07).toFixed(3)}, dot(dir, uTorchDir[i]));
    float fall = clamp(1.0 - dist / ${TORCH_RANGE.toFixed(1)}, 0.0, 1.0);
    float facing = mix(0.35, 1.0, max(dot(vWorldNormal, -dir), 0.0));
    light += vec3(1.0, 0.94, 0.82) * uTorchPower[i] * cone * fall * fall * facing;
  }
  outgoingLight = diffuseColor.rgb * light + uEmissive;
  #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'lit';
  return mat;
}
