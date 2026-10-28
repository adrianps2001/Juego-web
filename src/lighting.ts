import * as THREE from 'three';
import { grimeTexture } from './textures';
import { CELL, F_DEEP, F_RED, F_WET, type LevelMap, type Theme } from './world';

/**
 * Uniforms compartidos por todos los materiales "iluminados". Al cambiar de
 * nivel solo se cambian sus valores; los shaders no se recompilan.
 */
export const lightUniforms = {
  uLightMap: { value: null as THREE.Texture | null },
  uDetailMap: { value: null as THREE.Texture | null },
  uLmScale: { value: new THREE.Vector2(1, 1) },
  uFlicker: { value: 1 },
  uCircuit: { value: 1 }, // 0 = el circuito de las luces parpadeantes se ha fundido
  uTint: { value: new THREE.Color(1, 1, 1) },
  uAmbient: { value: 0.02 },
  uBlackout: { value: 0 }, // 1 = todos los fluorescentes apagados
  // linternas y bengalas: la linterna propia (0), las de los compañeros y las bengalas
  uTorchPos: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
  uTorchDir: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, -1)) },
  uTorchPower: { value: [0, 0, 0, 0, 0, 0] },
  uTorchCount: { value: 0 }, // cuántas de las anteriores están encendidas (las primeras)
  // suciedad en coordenadas del mundo (manchas, humedad, chorretones)
  uGrimeMap: { value: null as THREE.Texture | null },
  uGrimeTint: { value: new THREE.Color(0.55, 0.45, 0.25) },
  uGrimeAmount: { value: 0.6 },
};

const GRIME: Record<Theme, [number, number, number, number]> = {
  lobby: [0.55, 0.45, 0.24, 0.6],
  habitable: [0.42, 0.42, 0.4, 0.65],
  pipes: [0.33, 0.25, 0.18, 0.7],
};

export const MAX_TORCHES = 6;
const TORCH_RANGE = 22; // metros
const TORCH_COS = Math.cos(0.42); // apertura del haz

// alturas guardadas en el mapa de luz: de -8 a +16 m
const H_MIN = -8;
const H_RANGE = 24;

/**
 * Crea las texturas del nivel y actualiza los uniforms:
 * - mapa de luz: R = luz fija, G = luz parpadeante (ambas a la mitad para
 *   llegar hasta 2), B = altura del suelo, A = altura del techo;
 * - mapa de detalle (suavizado): R = humedad, G = "rojo" (Habitaciones Rojas).
 */
export function useLevelLight(map: LevelMap): THREE.DataTexture[] {
  const L = map.def;
  const n = map.w * map.h;
  const data = new Uint8Array(n * 4);
  const enc = (y: number) => Math.max(0, Math.min(255, ((y - H_MIN) / H_RANGE) * 255));
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.min(255, map.light[i * 2] * 127.5);
    data[i * 4 + 1] = Math.min(255, map.light[i * 2 + 1] * 127.5);
    data[i * 4 + 2] = enc(map.floor[i]);
    data[i * 4 + 3] = enc(map.ceil[i]);
  }
  const light = dataTexture(data, map.w, map.h);

  // detalle: valores por casilla y luego un desenfoque para que no haya bordes
  let wet: Float32Array = new Float32Array(n);
  let red: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = map.flags[i];
    wet[i] = f & F_DEEP ? 1 : f & F_WET ? 0.75 : 0;
    red[i] = f & F_RED ? 1 : 0;
  }
  for (let pass = 0; pass < 3; pass++) {
    wet = blur(wet, map.w, map.h);
    red = blur(red, map.w, map.h);
  }
  const det = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = ((i % map.w) + 0.5) * CELL;
    const z = (Math.floor(i / map.w) + 0.5) * CELL;
    det[i * 4] = Math.min(255, wet[i] * 255);
    det[i * 4 + 1] = Math.min(255, red[i] * 255);
    // variación de color a gran escala (precalculada aquí para no hacerla en cada píxel)
    det[i * 4 + 2] = (valueNoise(x * 0.3, z * 0.3, 1) * 0.6 + valueNoise(x * 0.9, z * 0.9, 2) * 0.4) * 255;
    det[i * 4 + 3] = 255;
  }
  const detail = dataTexture(det, map.w, map.h);

  lightUniforms.uLightMap.value?.dispose();
  lightUniforms.uDetailMap.value?.dispose();
  lightUniforms.uLightMap.value = light;
  lightUniforms.uDetailMap.value = detail;
  lightUniforms.uLmScale.value.set(1 / (map.w * CELL), 1 / (map.h * CELL));
  lightUniforms.uTint.value.setRGB(...L.tint);
  lightUniforms.uAmbient.value = L.ambient;
  lightUniforms.uCircuit.value = 1;
  const [r, g, b, amount] = GRIME[L.theme];
  lightUniforms.uGrimeMap.value = grimeTexture();
  lightUniforms.uGrimeTint.value.setRGB(r, g, b);
  lightUniforms.uGrimeAmount.value = amount;
  return [light, detail];
}

function valueNoise(x: number, z: number, seed: number): number {
  const h = (a: number, b: number) => {
    const v = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * fx;
  const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * fx;
  return a + (b - a) * fz;
}

function dataTexture(data: Uint8Array, w: number, h: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function blur(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let k = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue;
          s += src[zz * w + xx];
          k++;
        }
      }
      out[z * w + x] = Math.max(src[z * w + x] * 0.6, s / k);
    }
  }
  return out;
}

export type LitParams = THREE.MeshBasicMaterialParameters & { emissive?: THREE.ColorRepresentation };

/** Opciones de las superficies del nivel (paredes, suelos y techos). */
export interface WorldOpts {
  /**
   * Desplazar la textura al azar por zonas para que no se vea la repetición.
   * Valor = paso del desplazamiento (fracción de textura) para que el dibujo
   * regular siga alineado; 0 = libre; omitido = no desplazar (techos).
   */
  snap?: number;
  /** Tamaño en metros de cada loseta o placa: a cada una le toca un tono. */
  cell?: number;
}

/**
 * Material ligero para todo el mundo: no usa las luces de Three.js (que se
 * calculan en cada píxel aunque estén apagadas). Combina la luz precalculada
 * de los fluorescentes, leída del mapa de luz por posición, con hasta
 * MAX_TORCHES linternas calculadas a mano. `offset` desplaza la muestra del
 * mapa de luz a lo largo de la normal (para las paredes).
 *
 * Con `world`, además aplica el mapa de detalle (humedad, rojo) y una
 * variación de color a gran escala que disimula la repetición de texturas.
 */
export function litMaterial(params: LitParams = {}, offset = 0.35, worldOpts: boolean | WorldOpts = false): THREE.MeshBasicMaterial {
  const { emissive, ...basic } = params;
  const mat = new THREE.MeshBasicMaterial(basic);
  const emissiveColor = new THREE.Color(emissive ?? 0x000000);
  const world = worldOpts !== false;
  const wo: WorldOpts = typeof worldOpts === 'object' ? worldOpts : {};
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lightUniforms);
    shader.uniforms.uLmOffset = { value: offset };
    shader.uniforms.uEmissive = { value: emissiveColor };
    shader.uniforms.uTileSnap = { value: wo.snap ?? -1 };
    shader.uniforms.uCell = { value: wo.cell ?? 0 };
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
${world ? '#define LM_WORLD' : ''}
uniform sampler2D uLightMap;
uniform sampler2D uDetailMap;
uniform vec2 uLmScale;
uniform float uFlicker;
uniform float uCircuit;
uniform vec3 uTint;
uniform float uAmbient;
uniform float uBlackout;
uniform vec3 uEmissive;
uniform vec3 uTorchPos[MAX_TORCHES];
uniform vec3 uTorchDir[MAX_TORCHES];
uniform float uTorchPower[MAX_TORCHES];
uniform int uTorchCount;
uniform sampler2D uGrimeMap;
uniform vec3 uGrimeTint;
uniform float uGrimeAmount;
uniform float uTileSnap;
uniform float uCell;
varying vec3 vLmPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
` +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        world
          ? `// coordenadas en metros sobre la superficie: xz en suelos y techos, (horizontal, altura) en paredes
  vec3 an = abs(vWorldNormal);
  bool isWall = an.y < 0.5;
  vec2 wp = !isWall ? vWorldPos.xz : (an.x > an.z ? vec2(vWorldPos.z, vWorldPos.y) : vec2(vWorldPos.x, vWorldPos.y));
  // dos escalas que no coinciden entre sí ni con la textura base
  float g1 = texture2D(uGrimeMap, wp * 0.137 + vec2(0.31, 0.73)).r;
  float g2 = texture2D(uGrimeMap, mat2(0.8, -0.6, 0.6, 0.8) * wp * 0.371).g;
#ifdef USE_MAP
  vec4 sampledDiffuseColor;
  if (uTileSnap >= 0.0) {
    // cada zona desplaza la textura a su manera y se funde con la de al lado
    float idx = g1 * 10.0 + g2 * 3.0;
    float ii = floor(idx);
    float ff = fract(idx);
    vec2 oa = fract(sin(vec2(3.1, 7.7) * ii) * 43.7);
    vec2 ob = fract(sin(vec2(3.1, 7.7) * (ii + 1.0)) * 43.7);
    if (uTileSnap > 0.0) {
      oa = floor(oa / uTileSnap) * uTileSnap;
      ob = floor(ob / uTileSnap) * uTileSnap;
    }
    // en las paredes solo en horizontal: el zócalo se queda en su sitio
    if (isWall) {
      oa.y = 0.0;
      ob.y = 0.0;
    }
    // solo en la franja de transición hace falta leer la textura dos veces
    float bl = smoothstep(0.3, 0.7, ff);
    if (bl <= 0.0) sampledDiffuseColor = texture2D(map, vMapUv + oa);
    else if (bl >= 1.0) sampledDiffuseColor = texture2D(map, vMapUv + ob);
    else sampledDiffuseColor = mix(texture2D(map, vMapUv + oa), texture2D(map, vMapUv + ob), bl);
  } else {
    sampledDiffuseColor = texture2D(map, vMapUv);
  }
  diffuseColor *= sampledDiffuseColor;
#endif`
          : '#include <map_fragment>',
      ).replace(
        '#include <opaque_fragment>',
        `vec4 lm = texture2D(uLightMap, vLmPos.xz * uLmScale);
  float lmFloor = lm.b * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)};
  float lmCeil = lm.a * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)};
  float above = vWorldPos.y - lmFloor;
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float wet = 0.0;
#ifdef LM_WORLD
  vec4 dm = texture2D(uDetailMap, vLmPos.xz * uLmScale);
  // variación de color a gran escala: rompe la repetición de las texturas
  diffuseColor.rgb *= mix(0.84, 1.1, dm.b);
  // humedad: en el suelo y subiendo un poco por la base de las paredes
  wet = dm.r * (vWorldNormal.y > 0.5 ? 1.0 : clamp(1.0 - above / 0.55, 0.0, 1.0));
  diffuseColor.rgb *= mix(1.0, 0.52, wet);
  // Habitaciones Rojas: todo vira al rojo
  float lum = dot(diffuseColor.rgb, vec3(0.45, 0.4, 0.15));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum * 1.55, lum * 0.22, lum * 0.18), dm.g * 0.9);
  // losetas y placas: cada una con su tono, y alguna manchada
  if (uCell > 0.0) {
    vec2 cid = floor(wp / uCell + 0.001);
    float h = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    diffuseColor.rgb *= 0.91 + h * 0.12;
    if (h > 0.92) diffuseColor.rgb *= mix(vec3(1.0), uGrimeTint, 0.55);
  }
  // suciedad: manchas grandes por todas partes
  float grime = smoothstep(0.5, 0.78, g1 * 0.65 + g2 * 0.35) * 0.8;
  if (isWall) {
    float h01 = clamp(above / max(lmCeil - lmFloor, 0.5), 0.0, 1.0);
    // humedad que sube desde el suelo, con el borde irregular
    grime += (1.0 - smoothstep(0.02, 0.1 + g2 * 0.4, h01)) * 0.45;
    // chorretones que bajan desde el techo
    // (anchos e irregulares, y solo en algunas zonas, para que no parezcan costuras)
    float st = texture2D(uGrimeMap, vec2(wp.x * 0.11, wp.y * 0.012)).b;
    float streak = smoothstep(0.56, 0.8, st) * smoothstep(0.42, 0.7, g2);
    grime += streak * smoothstep(0.3, 1.0, h01 + g1 * 0.3) * 0.45;
  }
  diffuseColor.rgb *= mix(vec3(1.0), uGrimeTint, clamp(grime, 0.0, 1.0) * uGrimeAmount);
#endif
  float lmLight = 2.0 * (lm.r + lm.g * uFlicker * uCircuit) * (1.0 - uBlackout);
  // un poco más oscuro abajo, como si la luz viniera del techo
  lmLight *= mix(0.55, 1.0, clamp(above / max(lmCeil - lmFloor, 0.5), 0.0, 1.0));
  // los agujeros: cuanto más hondo, más oscuro
  lmLight *= clamp(1.0 + above * 0.65, 0.0, 1.0);
  // un poco de sombreado según hacia dónde mira la cara: da volumen a columnas y muebles
  lmLight *= 0.8 + 0.2 * abs(dot(vWorldNormal, vec3(0.74, 0.42, 0.52)));
  vec3 light = uTint * lmLight + uAmbient;
  // lo mojado brilla un poco con la luz del techo, sobre todo de lado
  float fres = pow(1.0 - max(dot(vWorldNormal, viewDir), 0.0), 3.0);
  vec3 sheen = uTint * lmLight * wet * fres * 0.35;
  for (int i = 0; i < MAX_TORCHES; i++) {
    if (i >= uTorchCount) break;
    if (uTorchPower[i] <= 0.0) continue;
    vec3 d = vWorldPos - uTorchPos[i];
    float dist = length(d);
    vec3 dir = d / max(dist, 0.001);
    // potencia > 2: luz que alumbra en todas direcciones (bengala)
    float omni = step(2.0, uTorchPower[i]);
    float cone = mix(smoothstep(${TORCH_COS.toFixed(3)}, ${(TORCH_COS + 0.07).toFixed(3)}, dot(dir, uTorchDir[i])), 1.0, omni);
    float range = mix(${TORCH_RANGE.toFixed(1)}, 9.0, omni);
    float fall = clamp(1.0 - dist / range, 0.0, 1.0);
    float facing = mix(0.35, 1.0, max(dot(vWorldNormal, -dir), 0.0));
    float power = mix(uTorchPower[i], (uTorchPower[i] - 2.0) * 1.6, omni);
    vec3 col = mix(vec3(1.0, 0.94, 0.82), vec3(1.0, 0.35, 0.25), omni);
    light += col * power * cone * fall * fall * facing;
    // reflejo en superficies mojadas
    if (wet > 0.01) {
      vec3 h = normalize(-dir + viewDir);
      sheen += col * power * cone * fall * wet * pow(max(dot(vWorldNormal, h), 0.0), 24.0) * 0.8;
    }
  }
  outgoingLight = diffuseColor.rgb * light + sheen + uEmissive;
  #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (world ? 'lit-world' : 'lit');
  return mat;
}
