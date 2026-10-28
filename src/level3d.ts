import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightUniforms, litMaterial, useLevelLight } from './lighting';
import { makeBattery, makeBottle, makeEnergyBar, makeExitDoor, makeMedkit } from './models';
import { DYNAMIC_PROPS, buildProp, disposePropMaterials, makeCrate, mat } from './props';
import { canvasTexture, themeTextures, upperHalf } from './textures';
import { CELL, F_PIT, F_SOLID, F_STAIRS, F_WET, hash, type LevelMap } from './world';

const PIT_DEPTH = 8;
// el nivel se trocea en bloques para que no se dibuje lo que queda fuera de la vista
const TILE = 12;
const tileOf = (x: number, z: number) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;

type Buffers = { m: THREE.Material; pos: number[]; nor: number[]; uv: number[] };

/** Acumula quads por material y bloque, y los convierte en mallas. */
class QuadSink {
  private groups = new Map<string, Buffers>();
  private ids = new Map<THREE.Material, number>();

  quad(m: THREE.Material, a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[][]) {
    let id = this.ids.get(m);
    if (id === undefined) {
      id = this.ids.size;
      this.ids.set(m, id);
    }
    const key = `${id}|${tileOf((a[0] + c[0]) / 2, (a[2] + c[2]) / 2)}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { m, pos: [], nor: [], uv: [] };
      this.groups.set(key, g);
    }
    const v = [a, b, c, d];
    // orienta la cara hacia la normal pedida (así no importa el orden de los vértices)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const order = gx * n[0] + gy * n[1] + gz * n[2] < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of order) {
      g.pos.push(...v[k]);
      g.nor.push(...n);
      g.uv.push(...uv[k]);
    }
  }

  meshes(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const g of this.groups.values()) {
      const m = g.m;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      out.push(new THREE.Mesh(geo, m));
    }
    return out;
  }
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Escena 3D de un nivel. */
export class Level3D {
  readonly group = new THREE.Group();
  private items = new Map<string, THREE.Object3D>();
  private crates = new Map<string, THREE.Object3D>();
  private steadyPanels: THREE.MeshBasicMaterial;
  private flickerPanels: THREE.MeshBasicMaterial;
  private glow: THREE.Color;
  private glitchMat: THREE.ShaderMaterial;
  private animated: { obj: THREE.Object3D; kind: string; seed: number }[] = [];
  private steam: { x: number; y: number; z: number; period: number; phase: number; sprites: THREE.Sprite[] }[] = [];
  private disposables: { dispose: () => void }[] = [];
  private upperOf = new Map<THREE.Material, THREE.Material>();

  constructor(
    readonly map: LevelMap,
    picked: Set<string>,
  ) {
    const L = map.def;
    const tex = themeTextures(L.theme);
    this.disposables.push(useLevelLight(map), ...tex.walls, ...tex.floors, ...tex.ceils);
    const wallMats = tex.walls.map((t) => litMaterial({ map: t }, 0.3));
    // para las paredes más altas que la textura: la parte de arriba, sin zócalo
    const uppers = tex.walls.map(upperHalf);
    this.disposables.push(...uppers);
    this.upperOf = new Map(wallMats.map((m, k) => [m, litMaterial({ map: uppers[k] }, 0.3)]));
    const floorMats = tex.floors.map((t) => litMaterial({ map: t }, 0));
    const ceilMats = tex.ceils.map((t) => litMaterial({ map: t }, 0));
    const wetMat = litMaterial({ color: 0x1a2530, transparent: true, opacity: 0.55, depthWrite: false }, 0);
    const pitMat = litMaterial({ color: 0x3a3428 }, 0.3);
    const sink = new QuadSink();
    // fondo negro de los agujeros
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (let i = 0; i < map.w * map.h; i++) {
      if (!(map.flags[i] & F_PIT)) continue;
      const cx = i % map.w;
      const cz = (i - cx) / map.w;
      const x0 = cx * CELL;
      const z0 = cz * CELL;
      const y = -PIT_DEPTH;
      sink.quad(voidMat, [x0, y, z0], [x0, y, z0 + CELL], [x0 + CELL, y, z0 + CELL], [x0 + CELL, y, z0], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    }
    this.buildGrid(sink, wallMats, floorMats, ceilMats, wetMat, pitMat, tex.wallScale, tex.wallHeight, tex.floorScale, tex.ceilScale);
    for (const m of sink.meshes()) this.group.add(m);


    // fluorescentes
    this.glow = new THREE.Color(...L.tint).multiplyScalar(L.theme === 'pipes' ? 2.2 : 1.8);
    this.steadyPanels = new THREE.MeshBasicMaterial({ color: this.glow.clone() });
    this.flickerPanels = new THREE.MeshBasicMaterial({ color: this.glow.clone() });
    this.buildLamps();

    // muebles y objetos (los estáticos se fusionan por material)
    const statics = new THREE.Group();
    for (const p of map.props) {
      const obj = buildProp(p);
      if (!obj) continue;
      obj.position.set(p.x, p.y, p.z);
      obj.rotation.y = p.ry;
      if (DYNAMIC_PROPS.has(p.type)) {
        this.group.add(obj);
        this.animated.push({ obj, kind: p.type, seed: hash(p.x * 10, p.z * 10) * 100 });
      } else statics.add(obj);
    }
    if (L.theme === 'pipes') this.buildPipes(statics);
    if (L.theme === 'habitable') this.buildConduits(statics);
    this.mergeStatics(statics);

    // objetos que se pueden coger, cajas y salidas
    for (const item of map.items) {
      if (picked.has(item.key)) continue;
      const obj = item.kind === 'agua' ? makeBottle() : item.kind === 'pila' ? makeBattery() : item.kind === 'barrita' ? makeEnergyBar() : makeMedkit();
      obj.position.set(item.x, item.y, item.z);
      obj.rotation.y = hash(item.x * 10, item.z * 10) * Math.PI * 2;
      this.items.set(item.key, obj);
      this.group.add(obj);
    }
    for (const c of map.crates) {
      const obj = makeCrate(picked.has(c.key));
      obj.position.set(c.x, c.y, c.z);
      obj.rotation.y = c.ry;
      this.crates.set(c.key, obj);
      this.group.add(obj);
    }
    for (const e of map.exits) {
      const door = makeExitDoor(e.label);
      door.position.set(e.x, e.y, e.z);
      door.rotation.y = e.ry;
      this.group.add(door);
    }

    // paredes que fallan
    this.glitchMat = glitchMaterial(new THREE.Color(...L.tint));
    for (const g of map.glitches) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.h, 6, 6), g.noclip ? glitchMaterial(new THREE.Color(...L.tint), 1.6) : this.glitchMat);
      mesh.position.set(g.x, g.y, g.z);
      mesh.rotation.y = g.ry;
      this.group.add(mesh);
    }

    // escapes de vapor
    const puff = steamTexture();
    for (const v of map.vents) {
      const sprites: THREE.Sprite[] = [];
      for (let i = 0; i < 8; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xd8d0c8, transparent: true, opacity: 0, depthWrite: false }));
        this.group.add(s);
        sprites.push(s);
      }
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8), mat(0x6b3d22));
      nozzle.position.set(v.x, v.y + 0.12, v.z);
      this.group.add(nozzle);
      this.steam.push({ ...v, sprites });
    }
  }

  // ---------------------------------------------------------------- rejilla

  private buildGrid(
    sink: QuadSink,
    wallMats: THREE.Material[],
    floorMats: THREE.Material[],
    ceilMats: THREE.Material[],
    wetMat: THREE.Material,
    pitMat: THREE.Material,
    wallScale: number,
    wallHeight: number,
    floorScale: number,
    ceilScale: number,
  ) {
    const m = this.map;
    const C = CELL;
    const open = (i: number) => !(m.flags[i] & F_SOLID);

    /** Altura del suelo de la casilla i en el punto (x, z) de su borde. */
    const fy = (i: number, x: number, z: number) => {
      const dir = m.rampDir[i];
      if (dir < 0) return m.floor[i];
      const cx = i % m.w;
      const cz = (i - cx) / m.w;
      const fx = Math.min(1, Math.max(0, x / C - cx));
      const fz = Math.min(1, Math.max(0, z / C - cz));
      const t = dir === 0 ? fx : dir === 1 ? 1 - fx : dir === 2 ? fz : 1 - fz;
      return m.floor[i] + t * m.rampRise[i];
    };
    const floorTex = (x: number, z: number) => [x / floorScale, z / floorScale];
    const ceilTex = (x: number, z: number) => [x / ceilScale, z / ceilScale];

    // Caras que se pueden fusionar con sus vecinas en línea (mismo material y
    // alturas): se juntan antes de emitirlas para tener muchos menos triángulos.
    const runs = new Map<string, { emit: (from: number, to: number) => void; spans: [number, number][] }>();
    const addRun = (key: string, from: number, to: number, emit: (from: number, to: number) => void) => {
      let r = runs.get(key);
      if (!r) {
        r = { emit, spans: [] };
        runs.set(key, r);
      }
      r.spans.push([from, to]);
    };
    const matId = new Map<THREE.Material, number>();
    const mid = (mt: THREE.Material) => {
      if (!matId.has(mt)) matId.set(mt, matId.size);
      return matId.get(mt)!;
    };

    for (let cz = 0; cz < m.h; cz++) {
      for (let cx = 0; cx < m.w; cx++) {
        const i = cz * m.w + cx;
        if (!open(i)) continue;
        const x0 = cx * C;
        const x1 = x0 + C;
        const z0 = cz * C;
        const z1 = z0 + C;
        const pit = (m.flags[i] & F_PIT) !== 0;
        const ceil = m.ceil[i];

        // ---- suelo ----
        if (!pit) {
          const fm = floorMats[m.floorMat[i]] ?? floorMats[0];
          if (m.flags[i] & F_STAIRS) {
            this.stairs(sink, fm, wallMats[0], i, x0, z0, floorTex);
          } else if (m.rampDir[i] < 0 && !(m.flags[i] & F_WET)) {
            const y = m.floor[i];
            addRun(`f|${cz}|${y}|${mid(fm)}|${Math.floor(x0 / TILE)}`, x0, x1, (a, b) =>
              sink.quad(fm, [a, y, z0], [a, y, z1], [b, y, z1], [b, y, z0], [0, 1, 0], [floorTex(a, z0), floorTex(a, z1), floorTex(b, z1), floorTex(b, z0)]),
            );
          } else {
            const a = [x0, fy(i, x0, z0), z0];
            const b = [x0, fy(i, x0, z1), z1];
            const c = [x1, fy(i, x1, z1), z1];
            const d = [x1, fy(i, x1, z0), z0];
            const n = slopeNormal(m.rampDir[i], m.rampRise[i]);
            sink.quad(fm, a, b, c, d, n, [floorTex(x0, z0), floorTex(x0, z1), floorTex(x1, z1), floorTex(x1, z0)]);
            if (m.flags[i] & F_WET) {
              const e = 0.008;
              sink.quad(wetMat, [x0, a[1] + e, z0], [x0, b[1] + e, z1], [x1, c[1] + e, z1], [x1, d[1] + e, z0], n, [[0, 0], [0, 1], [1, 1], [1, 0]]);
            }
          }
        }

        // ---- techo ----
        const cm = ceilMats[m.ceilMat[i]] ?? ceilMats[0];
        addRun(`c|${cz}|${ceil}|${mid(cm)}|${Math.floor(x0 / TILE)}`, x0, x1, (a, b) =>
          sink.quad(cm, [a, ceil, z0], [b, ceil, z0], [b, ceil, z1], [a, ceil, z1], [0, -1, 0], [ceilTex(a, z0), ceilTex(b, z0), ceilTex(b, z1), ceilTex(a, z1)]),
        );

        // ---- caras verticales hacia cada vecina ----
        for (const [dx, dz] of DIRS) {
          const nx = cx + dx;
          const nz = cz + dz;
          const inMap = nx >= 0 && nz >= 0 && nx < m.w && nz < m.h;
          const j = inMap ? nz * m.w + nx : -1;
          // extremos del borde compartido, ordenados para que la cara mire hacia esta casilla
          let e0: [number, number];
          let e1: [number, number];
          if (dx === 1) [e0, e1] = [[x1, z1], [x1, z0]];
          else if (dx === -1) [e0, e1] = [[x0, z0], [x0, z1]];
          else if (dz === 1) [e0, e1] = [[x0, z1], [x1, z1]];
          else [e0, e1] = [[x1, z0], [x0, z0]];
          const n = [-dx, 0, -dz];
          const along0 = dx !== 0 ? e0[1] : e0[0];
          const along1 = dx !== 0 ? e1[1] : e1[0];
          const myFloor0 = pit ? -PIT_DEPTH : fy(i, e0[0], e0[1]);
          const myFloor1 = pit ? -PIT_DEPTH : fy(i, e1[0], e1[1]);
          const base = pit ? -PIT_DEPTH : m.floor[i];
          const uvAt = (along: number, y: number) => [along / wallScale, (y - base) / wallHeight];
          const split = base + wallHeight;
          const face = (mt: THREE.Material, b0: number, b1: number, t0: number, t1: number) => {
            if (t0 - b0 < 0.005 && t1 - b1 < 0.005) return;
            const upper = this.upperOf.get(mt);
            if (upper && Math.max(t0, t1) > split + 0.01) {
              // por encima de la altura de la textura: parte superior repetida, sin zócalo
              const u0 = Math.max(b0, split);
              const u1 = Math.max(b1, split);
              const uv = (along: number, y: number) => [along / wallScale, (y - split) / (wallHeight / 2)];
              sink.quad(upper, [e0[0], u0, e0[1]], [e1[0], u1, e1[1]], [e1[0], t1, e1[1]], [e0[0], t0, e0[1]], n, [uv(along0, u0), uv(along1, u1), uv(along1, t1), uv(along0, t0)]);
              if (Math.min(b0, b1) >= split) return;
              t0 = Math.min(t0, split);
              t1 = Math.min(t1, split);
            }
            if (b0 === b1 && t0 === t1) {
              // tramo recto: se fusiona con los del mismo plano
              const line = dx !== 0 ? e0[0] : e0[1];
              const lo = Math.min(along0, along1);
              const hi = Math.max(along0, along1);
              const bb = b0;
              const tt = t0;
              const nn = n;
              const bs = base;
              addRun(`w|${dx}|${dz}|${line}|${bb}|${tt}|${bs}|${mid(mt)}|${Math.floor(lo / TILE)}`, lo, hi, (a, b) => {
                const p = (al: number, y: number) => (dx !== 0 ? [line, y, al] : [al, y, line]);
                const uv = (al: number, y: number) => [al / wallScale, (y - bs) / wallHeight];
                sink.quad(mt, p(a, bb), p(b, bb), p(b, tt), p(a, tt), nn, [uv(a, bb), uv(b, bb), uv(b, tt), uv(a, tt)]);
              });
              return;
            }
            sink.quad(mt, [e0[0], b0, e0[1]], [e1[0], b1, e1[1]], [e1[0], t1, e1[1]], [e0[0], t0, e0[1]], n, [uvAt(along0, b0), uvAt(along1, b1), uvAt(along1, t1), uvAt(along0, t0)]);
          };

          if (j < 0 || !open(j)) {
            // pared maciza
            const wm = wallMats[j < 0 ? 0 : m.wallMat[j]] ?? wallMats[0];
            face(wm, myFloor0, myFloor1, ceil, ceil);
            continue;
          }
          const otherPit = (m.flags[j] & F_PIT) !== 0;
          // escalón o borde: la vecina tiene el suelo más alto
          if (!otherPit) {
            const o0 = fy(j, e0[0], e0[1]);
            const o1 = fy(j, e1[0], e1[1]);
            if (o0 > myFloor0 + 0.005 || o1 > myFloor1 + 0.005) {
              const stairsSide = m.flags[j] & F_STAIRS || m.flags[i] & F_STAIRS;
              face(stairsSide ? floorMats[0] : wallMats[m.wallMat[j]] ?? wallMats[0], myFloor0, myFloor1, Math.max(o0, myFloor0), Math.max(o1, myFloor1));
            }
          }
          if (pit && !otherPit) {
            // paredes del agujero: desde el suelo de la vecina hasta el fondo
            const o0 = fy(j, e0[0], e0[1]);
            const o1 = fy(j, e1[0], e1[1]);
            face(pitMat, -PIT_DEPTH, -PIT_DEPTH, o0, o1);
          }
          // techo más bajo en la vecina: cara que cuelga
          if (m.ceil[j] < ceil - 0.005) face(wallMats[0], m.ceil[j], m.ceil[j], ceil, ceil);
        }
      }
    }

    for (const r of runs.values()) {
      r.spans.sort((a, b) => a[0] - b[0]);
      let [from, to] = r.spans[0];
      for (let k = 1; k < r.spans.length; k++) {
        const [a, b] = r.spans[k];
        if (a <= to + 1e-4) to = Math.max(to, b);
        else {
          r.emit(from, to);
          [from, to] = [a, b];
        }
      }
      r.emit(from, to);
    }
  }

  /** Escalera: dos peldaños por casilla. */
  private stairs(sink: QuadSink, fm: THREE.Material, riser: THREE.Material, i: number, x0: number, z0: number, floorTex: (x: number, z: number) => number[]) {
    const m = this.map;
    const dir = m.rampDir[i];
    const rise = m.rampRise[i];
    const C = CELL;
    const steps = 2;
    for (let s = 0; s < steps; s++) {
      const top = Math.max(m.floor[i] + (rise * s) / steps, m.floor[i] + (rise * (s + 1)) / steps);
      // tramo [t0, t1] a lo largo de la dirección de subida
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const rect = (a: number, b: number): [number, number, number, number] => {
        if (dir === 0) return [x0 + a * C, z0, x0 + b * C, z0 + C];
        if (dir === 1) return [x0 + (1 - b) * C, z0, x0 + (1 - a) * C, z0 + C];
        if (dir === 2) return [x0, z0 + a * C, x0 + C, z0 + b * C];
        return [x0, z0 + (1 - b) * C, x0 + C, z0 + (1 - a) * C];
      };
      const [ax, az, bx, bz] = rect(t0, t1);
      sink.quad(fm, [ax, top, az], [ax, top, bz], [bx, top, bz], [bx, top, az], [0, 1, 0], [floorTex(ax, az), floorTex(ax, bz), floorTex(bx, bz), floorTex(bx, az)]);
      // contrahuella al principio del peldaño (mirando hacia abajo de la escalera)
      const lower = top - Math.abs(rise) / steps;
      const startEdge = rise > 0 ? t0 : t1;
      const [rx0, rz0, rx1, rz1] = rect(startEdge, startEdge);
      const down = rise > 0 ? -1 : 1; // la contrahuella mira hacia donde baja la escalera
      const n = dir === 0 ? [down, 0, 0] : dir === 1 ? [-down, 0, 0] : dir === 2 ? [0, 0, down] : [0, 0, -down];
      sink.quad(riser, [rx0, lower, rz0], [rx1, lower, rz1], [rx1, top, rz1], [rx0, top, rz0], n, [[0, 0], [1, 0], [1, 0.08], [0, 0.08]]);
    }
  }

  // ---------------------------------------------------------------- luces

  private buildLamps() {
    const { map } = this;
    const theme = map.def.theme;
    const housings: THREE.BufferGeometry[] = [];
    const steady: THREE.BufferGeometry[] = [];
    const flick: THREE.BufferGeometry[] = [];
    const dead: THREE.BufferGeometry[] = [];
    for (const lamp of map.lamps) {
      const rot = hash(map.level, lamp.x * 10, lamp.z * 10) < 0.5 ? 0 : Math.PI / 2;
      const y = lamp.y;
      const target = lamp.broken ? dead : lamp.flicker ? flick : steady;
      if (theme === 'pipes') {
        const cable = new THREE.CylinderGeometry(0.01, 0.01, 0.35);
        cable.translate(lamp.x, y - 0.18, lamp.z);
        const cage = new THREE.CylinderGeometry(0.09, 0.07, 0.16, 8, 1, true);
        cage.translate(lamp.x, y - 0.43, lamp.z);
        housings.push(cable, cage);
        const bulb = new THREE.SphereGeometry(0.06, 12, 8);
        bulb.translate(lamp.x, y - 0.45, lamp.z);
        target.push(bulb);
      } else {
        const lw = theme === 'habitable' ? 1.6 : 1.2;
        const hang = theme === 'habitable' && y > 3.5 ? 0.6 : 0;
        const box = new THREE.BoxGeometry(lw + 0.1, 0.07, 0.42);
        box.rotateY(rot);
        box.translate(lamp.x, y - 0.035 - hang, lamp.z);
        housings.push(box);
        for (const s of hang ? [-1, 1] : []) {
          const chain = new THREE.CylinderGeometry(0.008, 0.008, hang);
          chain.translate(lamp.x + (rot ? 0 : (s * lw) / 2.5), y - hang / 2, lamp.z + (rot ? (s * lw) / 2.5 : 0));
          housings.push(chain);
        }
        for (const s of [-1, 1]) {
          const tube = new THREE.BoxGeometry(lw, 0.02, 0.14);
          tube.translate(0, 0, s * 0.09);
          tube.rotateY(rot);
          tube.translate(lamp.x, y - 0.08 - hang, lamp.z);
          target.push(tube);
        }
      }
    }
    const merge = (list: THREE.BufferGeometry[], m: THREE.Material) => {
      const tiles = new Map<string, THREE.BufferGeometry[]>();
      for (const g of list) {
        g.computeBoundingBox();
        const c = g.boundingBox!.getCenter(new THREE.Vector3());
        const k = tileOf(c.x, c.z);
        const arr = tiles.get(k) ?? [];
        arr.push(g.index ? g.toNonIndexed() : g);
        tiles.set(k, arr);
      }
      for (const arr of tiles.values()) this.group.add(new THREE.Mesh(mergeGeometries(arr), m));
      for (const g of list) g.dispose();
    };
    merge(housings, litMaterial({ color: theme === 'pipes' ? 0x3a3530 : 0xbdb8a6 }, 0));
    merge(steady, this.steadyPanels);
    merge(flick, this.flickerPanels);
    merge(dead, new THREE.MeshBasicMaterial({ color: 0x2a2a26 }));
  }

  // ---------------------------------------------------------------- detalles

  /** Tuberías del Nivel 2 a lo largo de todas las paredes de los túneles. */
  private buildPipes(into: THREE.Group) {
    const { map } = this;
    const rust = mat(0x7a4426);
    const steel = mat(0x5a5a52);
    const copper = mat(0x8a5a2e);
    // sin tuberías delante de las puertas de salida
    const nearExit = (cx: number, cz: number) => map.exits.some((e) => Math.hypot((cx + 0.5) * CELL - e.x, (cz + 0.5) * CELL - e.z) < 1.6);
    for (const [dx, dz] of DIRS) {
      const alongX = dz !== 0;
      const outer = alongX ? map.h : map.w;
      const inner = alongX ? map.w : map.h;
      for (let a = 0; a < outer; a++) {
        let start = -1;
        let base = 0;
        for (let k = 0; k <= inner; k++) {
          const cx = alongX ? k : a;
          const cz = alongX ? a : k;
          const i = cz * map.w + cx;
          const ni = (cz + dz) * map.w + cx + dx;
          const ok = k < inner && !nearExit(cx, cz) && map.flags[i] & F_SOLID && cz + dz >= 0 && cz + dz < map.h && cx + dx >= 0 && cx + dx < map.w && !(map.flags[ni] & (F_SOLID | F_PIT)) && map.rampDir[ni] < 0 && (start < 0 || Math.abs(map.floor[ni] - base) < 0.01);
          if (ok && start < 0) {
            start = k;
            base = map.floor[ni];
          }
          if (ok) continue;
          if (start >= 0 && k - start >= 3) {
            const len = (k - start) * CELL;
            const mid = start * CELL + len / 2;
            const face = (a + (dx + dz > 0 ? 1 : 0)) * CELL;
            const sign = dx + dz;
            const ceil = map.ceil[(alongX ? (a + dz) * map.w + start : (start) * map.w + a + dx)] ?? 2.6;
            const layers: [number, number, number, THREE.Material][] = [
              [0.1, ceil - 0.22, 0.14, rust],
              [0.05, ceil - 0.45, 0.08, copper],
              [0.07, base + 0.35, 0.1, steel],
            ];
            for (const [r, y, off, m] of layers) {
              if (hash(a, start, r * 100) < 0.25) continue;
              const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
              if (alongX) {
                pipe.rotation.z = Math.PI / 2;
                pipe.position.set(mid, y, face + sign * off);
              } else {
                pipe.rotation.x = Math.PI / 2;
                pipe.position.set(face + sign * off, y, mid);
              }
              into.add(pipe);
              // bridas cada pocos metros
              for (let f = start * CELL + 1; f < start * CELL + len - 0.5; f += 2.5) {
                const flange = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.06, 10), steel);
                if (alongX) {
                  flange.rotation.z = Math.PI / 2;
                  flange.position.set(f, y, face + sign * off);
                } else {
                  flange.rotation.x = Math.PI / 2;
                  flange.position.set(face + sign * off, y, f);
                }
                into.add(flange);
              }
            }
          }
          start = -1;
        }
      }
    }
  }

  /** Conductos y bandejas de cables bajo el techo del almacén. */
  private buildConduits(into: THREE.Group) {
    const { map } = this;
    const metal = mat(0x6b7075);
    for (let cz = 8; cz < map.h; cz += 16) {
      let start = -1;
      for (let cx = 0; cx <= map.w; cx++) {
        const i = cz * map.w + cx;
        const ok = cx < map.w && !(map.flags[i] & F_SOLID) && map.ceil[i] > 4;
        if (ok && start < 0) start = cx;
        if (ok) continue;
        if (start >= 0 && cx - start > 6) {
          const len = (cx - start) * CELL;
          const y = map.ceil[cz * map.w + start] - 0.4;
          const duct = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, 0.5), metal);
          duct.position.set(start * CELL + len / 2, y, cz * CELL);
          into.add(duct);
        }
        start = -1;
      }
    }
  }

  /** Fusiona la geometría estática por material: muchas menos llamadas de dibujo. */
  private mergeStatics(root: THREE.Group) {
    root.updateMatrixWorld(true);
    const byKey = new Map<string, { m: THREE.Material; list: THREE.BufferGeometry[] }>();
    const ids = new Map<THREE.Material, number>();
    const pos = new THREE.Vector3();
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      const m = o.material as THREE.Material;
      if (!ids.has(m)) ids.set(m, ids.size);
      o.getWorldPosition(pos);
      const key = `${ids.get(m)}|${tileOf(pos.x, pos.z)}`;
      const entry = byKey.get(key) ?? { m, list: [] };
      entry.list.push(g);
      byKey.set(key, entry);
      o.geometry.dispose();
    });
    for (const { m, list } of byKey.values()) {
      const merged = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (merged) this.group.add(new THREE.Mesh(merged, m));
    }
  }

  // ---------------------------------------------------------------- por fotograma

  update(time: number, flicker: number, blackout: number) {
    const on = 1 - blackout;
    this.steadyPanels.color.copy(this.glow).multiplyScalar(Math.max(0.03, on));
    this.flickerPanels.color.copy(this.glow).multiplyScalar(Math.max(0.03, flicker * on));
    this.glitchMat.uniforms.uTime.value = time;
    this.group.children.forEach((c) => {
      if (c instanceof THREE.Mesh && c.material instanceof THREE.ShaderMaterial && c.material !== this.glitchMat) c.material.uniforms.uTime.value = time;
    });
    for (const a of this.animated) {
      if (a.kind === 'hanglamp') a.obj.rotation.z = Math.sin(time * 0.7 + a.seed) * 0.05;
      if (a.kind === 'fog') a.obj.children.forEach((s, k) => (s.position.x += Math.sin(time * 0.1 + k + a.seed) * 0.003));
    }
    for (const v of this.steam) {
      const t = (time + v.phase) % v.period;
      const active = t < 2.5;
      v.sprites.forEach((s, k) => {
        const life = (t * 1.6 + k / v.sprites.length) % 1;
        const m = s.material as THREE.SpriteMaterial;
        m.opacity = active ? 0.5 * (1 - life) : Math.max(0, m.opacity - 0.02);
        s.visible = m.opacity > 0.01;
        const spread = 0.15 + life * 0.8;
        s.position.set(v.x + Math.sin(k * 2.3) * spread * 0.4, v.y + 0.25 + life * 1.8, v.z + Math.cos(k * 1.7) * spread * 0.4);
        s.scale.setScalar(0.3 + life * 1.4);
      });
    }
  }

  /** ¿Hay vapor saliendo ahora mismo cerca de (x, y, z)? */
  steamAt(time: number, x: number, y: number, z: number): boolean {
    return this.map.vents.some((v) => (time + v.phase) % v.period < 2.5 && Math.hypot(v.x - x, v.z - z) < 1.1 && y < v.y + 2);
  }

  removeItem(key: string) {
    const obj = this.items.get(key);
    if (obj) {
      this.group.remove(obj);
      this.items.delete(key);
    }
    const crate = this.crates.get(key);
    if (crate) {
      const lid = crate.getObjectByName('lid');
      lid?.position.set(0.55, 0.05, 0.3);
      lid?.rotation.set(0, 0.6, 1.4);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
    for (const m of this.upperOf.values()) m.dispose();
    disposePropMaterials();
    for (const d of this.disposables) d.dispose();
    lightUniforms.uBlackout.value = 0;
  }
}

function slopeNormal(dir: number, rise: number): number[] {
  if (dir < 0 || rise === 0) return [0, 1, 0];
  const s = rise / CELL;
  const n = dir === 0 ? [-s, 1, 0] : dir === 1 ? [s, 1, 0] : dir === 2 ? [0, 1, -s] : [0, 1, s];
  const l = Math.hypot(n[0], n[1], n[2]);
  return n.map((v) => v / l);
}

/** Trozo de pared corrupto: bloques de colores, ruido y desgarros. */
function glitchMaterial(tint: THREE.Color, strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTint: { value: tint }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uStrength; varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float j = step(0.92, fract(sin(floor(uTime * 9.0) * 12.9898 + p.y * 3.0) * 43758.5));
        p.x += j * 0.08 * uStrength * sin(p.y * 40.0);
        p.z += sin(uTime * 3.0 + p.y * 8.0) * 0.015 * uStrength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uTint; uniform float uStrength; varying vec2 vUv;
      float r(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float t = floor(uTime * 12.0);
        vec2 cell = floor(vUv * vec2(10.0, 16.0));
        float tear = step(0.85, r(vec2(floor(vUv.y * 30.0), t)));
        vec2 uv = vUv + vec2(tear * (r(vec2(t, vUv.y)) - 0.5) * 0.3, 0.0);
        float n = r(floor(uv * vec2(24.0, 40.0)) + t);
        vec3 col = mix(uTint * vec3(0.78, 0.68, 0.33), vec3(n), 0.45);
        float block = step(0.8, r(cell + t * 0.37));
        col = mix(col, vec3(r(cell + 1.0), r(cell + 2.0), r(cell + 3.0)), block * 0.8);
        col *= 0.6 + 0.6 * step(0.3, r(vec2(t, 7.0)));
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
        float a = edge * (0.55 + 0.45 * n) * clamp(uStrength, 0.0, 1.0) * (0.75 + 0.25 * sin(uTime * 20.0));
        gl_FragColor = vec4(col, a);
      }`,
  });
}

let steamTex: THREE.Texture | null = null;
function steamTexture(): THREE.Texture {
  steamTex ??= canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    false,
  );
  return steamTex;
}

