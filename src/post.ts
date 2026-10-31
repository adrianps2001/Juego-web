import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Grano, viñeta, aberración cromática y distorsión según la cordura. También
 * pasa los colores a sRGB: así todo el posprocesado es una sola pasada.
 */
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
    vec3 toSRGB(vec3 c) {
      c = max(c, vec3(0.0));
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }
    void main() {
      float ins = uInsanity;
      vec2 uv = vUv + vec2(sin(vUv.y * 18.0 + uTime * 2.1), cos(vUv.x * 15.0 + uTime * 1.7)) * 0.004 * ins;
      vec2 dir = uv - 0.5;
      float ca = 0.0015 + 0.009 * ins;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + dir * ca).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - dir * ca).b);
      col = toSRGB(col) * uBrightness;
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
  private target: THREE.WebGLRenderTarget;
  private film = new THREE.ShaderMaterial({ ...FilmShader, uniforms: THREE.UniformsUtils.clone(FilmShader.uniforms), depthTest: false, depthWrite: false });
  private quad = new FullScreenQuad(this.film);
  private ratio = 1;
  private w = 1;
  private h = 1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
  ) {
    // en coma flotante de 16 bits: sin bandas en las zonas oscuras
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  }

  setBrightness(v: number) {
    this.film.uniforms.uBrightness.value = v;
  }

  setPixelRatio(ratio: number) {
    this.ratio = ratio;
    this.setSize(this.w, this.h);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.target.setSize(Math.max(1, Math.floor(w * this.ratio)), Math.max(1, Math.floor(h * this.ratio)));
  }

  /** Compila en segundo plano los shaders de la escena tal como se usarán (dibujando en la imagen interna). */
  compile(): Promise<unknown> {
    this.renderer.setRenderTarget(this.target);
    const done = this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    return done;
  }

  render(time: number, insanity: number, damage: number) {
    const u = this.film.uniforms;
    u.uTime.value = time;
    u.uInsanity.value = insanity;
    u.uDamage.value = damage;
    u.tDiffuse.value = this.target.texture;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer);
  }

  dispose() {
    this.target.dispose();
    this.film.dispose();
    this.quad.dispose();
  }
}
