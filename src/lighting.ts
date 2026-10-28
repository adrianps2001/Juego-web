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
};

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

/**
 * Material Lambert que, además de las luces reales (la linterna), recibe la
 * luz precalculada de los fluorescentes leyendo el mapa de luz por posición.
 * `offset` desplaza la muestra a lo largo de la normal (para las paredes).
 */
export function litMaterial(params: THREE.MeshLambertMaterialParameters = {}, offset = 0.35): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial(params);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lightUniforms);
    shader.uniforms.uLmOffset = { value: offset };
    shader.vertexShader =
      'uniform float uLmOffset;\nvarying vec3 vLmPos;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vec4 lmWorld = modelMatrix * vec4(transformed, 1.0);
  vLmPos = lmWorld.xyz + normalize(mat3(modelMatrix) * objectNormal) * uLmOffset;`,
      );
    shader.fragmentShader =
      `uniform sampler2D uLightMap;
uniform vec2 uLmScale;
uniform float uFlicker;
uniform vec3 uTint;
uniform float uAmbient;
uniform float uHeight;
varying vec3 vLmPos;
` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  vec4 lm = texture2D(uLightMap, vLmPos.xz * uLmScale);
  float lmLight = 2.0 * (lm.r + lm.g * uFlicker);
  // un poco más oscuro abajo, como si la luz viniera del techo
  lmLight *= mix(0.62, 1.0, clamp(vLmPos.y / uHeight, 0.0, 1.0));
  totalEmissiveRadiance += diffuseColor.rgb * (uTint * lmLight + uAmbient);`,
      );
  };
  mat.customProgramCacheKey = () => 'lit';
  return mat;
}
