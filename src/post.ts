import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Grano, viñeta, aberración cromática y distorsión según la cordura. */
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uInsanity: { value: 0 },
    uDamage: { value: 0 },
    uBrightness: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uInsanity;
    uniform float uDamage;
    uniform float uBrightness;
    varying vec2 vUv;
    float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float ins = uInsanity;
      vec2 uv = vUv + vec2(sin(vUv.y * 18.0 + uTime * 2.1), cos(vUv.x * 15.0 + uTime * 1.7)) * 0.004 * ins;
      vec2 dir = uv - 0.5;
      float ca = 0.0015 + 0.009 * ins;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + dir * ca).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - dir * ca).b);
      col *= uBrightness;
      float gray = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(gray), ins * 0.65);
      float vig = smoothstep(0.95, 0.3, length(dir) * (1.0 + ins * 0.7));
      col *= mix(0.25, 1.0, vig);
      col += (rand(vUv * 731.0 + fract(uTime) * 91.0) - 0.5) * (0.06 + 0.1 * ins);
      // líneas que tiemblan de vez en cuando, como una cinta VHS
      float band = step(0.999 - ins * 0.03, rand(vec2(floor(vUv.y * 120.0), floor(uTime * 12.0))));
      col += band * (0.015 + 0.08 * ins);
      col = mix(col, vec3(0.5, 0.0, 0.0), uDamage);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  readonly composer: EffectComposer;
  private film: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass());
    this.film = new ShaderPass(FilmShader);
    this.composer.addPass(this.film);
  }

  setBrightness(v: number) {
    this.film.uniforms.uBrightness.value = v;
  }

  /** EffectComposer guarda su propia resolución: hay que avisarle aparte. */
  setPixelRatio(ratio: number) {
    this.composer.setPixelRatio(ratio);
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  render(time: number, insanity: number, damage: number) {
    this.film.uniforms.uTime.value = time;
    this.film.uniforms.uInsanity.value = insanity;
    this.film.uniforms.uDamage.value = damage;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
