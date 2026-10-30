import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightUniforms, litMaterial, useLevelLight } from './lighting';
import { makeBattery, makeBottle, makeCan, makeEnergyBar, makeExitDoor, makeFlareStick, makeMedkit, makeMeg, makeMoth, makeRat, makeWorker, type NpcModel } from './models';
import { DYNAMIC_PROPS, buildProp, disposePropMaterials, makeCrate, mat } from './props';
import { canvasTexture, paperTexture, textTexture, themeTextures } from './textures';
import { CELL, F_HOLE, F_PIT, F_SHAFT, F_SOLID, F_STAIRS, collide, floorAt, floorUnder, hash, inZone, type Door, type ItemKind, type LevelMap, type Npc } from './world';

const PIT_DEPTH = 8;
// el nivel se trocea en bloques para que no se dibuje lo que queda fuera de la vista
// (bloques grandes: menos llamadas de dibujo; lo que queda fuera de la niebla no se dibuja igual)
const TILE = 40;
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
  private animated: { obj: THREE.Object3D; kind: string; seed: number }[] = [];
  private steam: { x: number; y: number; z: number; period: number; phase: number; sprites: THREE.Sprite[] }[] = [];
  private disposables: { dispose: () => void }[] = [];
  /** Objetos pequeños sueltos: se ocultan cuando están lejos (menos llamadas de dibujo). */
  private smalls: THREE.Object3D[] = [];
  private cullClock = 0;
  private upperOf = new Map<THREE.Material, THREE.Material>();
  private shiftMeshes = new Map<number, THREE.Object3D>();
  private glows: { sprite: THREE.Sprite; base: number; seed: number }[] = [];
  private moths: { obj: THREE.Group; flap: (t: number) => void; hx: number; hy: number; hz: number; seed: number }[] = [];
  private rats: { obj: THREE.Group; x: number; z: number; tx: number; tz: number; wait: number; seed: number; g: LevelMap }[] = [];
  /** Personajes que no atacan: se mueven aquí, en cada cliente. */
  readonly npcs: { def: Npc; model: NpcModel; x: number; y: number; z: number; ry: number; leg: number; pause: number }[] = [];
  /** Ventanas peligrosas: a veces se asoma algo. */
  readonly windows: { x: number; y: number; z: number; ry: number; face: THREE.Object3D }[] = [];

  constructor(
    readonly map: LevelMap,
    picked: Set<string>,
  ) {
    const L = map.def;
    const tex = themeTextures(L.theme);
    this.disposables.push(...useLevelLight(map), ...tex.walls, ...tex.wallUppers, ...tex.floors, ...tex.ceils);
    const wallMats = tex.walls.map((t, k) => litMaterial({ map: t }, 0.3, { snap: tex.wallSnap[k] ?? 0 }));
    // para las paredes más altas que la textura: la versión sin zócalo, que se repite hacia arriba
    this.upperOf = new Map(wallMats.map((m, k) => [m, litMaterial({ map: tex.wallUppers[k] }, 0.3, { snap: tex.wallSnap[k] ?? 0 })]));
    const floorMats = tex.floors.map((t, k) => litMaterial({ map: t }, 0, { snap: tex.floorSnap[k] ?? 0, cell: tex.floorCell[k] }));
    // los techos no se desplazan (las placas tienen que cuadrar), pero cada placa lleva su tono
    const ceilMats = tex.ceils.map((t, k) => litMaterial({ map: t }, 0, { cell: tex.ceilCell[k] }));
    const pitMat = litMaterial({ color: 0x75684e }, 0.3, true);
    const sink = new QuadSink();
    // fondo negro de los agujeros
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const g of map.storeys) {
      for (let i = 0; i < g.w * g.h; i++) {
        if (!(g.flags[i] & F_PIT)) continue;
        const cx = i % g.w;
        const cz = (i - cx) / g.w;
        // en la caída infinita no hay fondo
        if (inZone(map, 'abyss', (cx + 0.5) * CELL, (cz + 0.5) * CELL)) continue;
        const x0 = cx * CELL;
        const z0 = cz * CELL;
        const y = -PIT_DEPTH;
        sink.quad(voidMat, [x0, y, z0], [x0, y, z0 + CELL], [x0 + CELL, y, z0 + CELL], [x0 + CELL, y, z0], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      }
      this.buildGrid(g, sink, wallMats, floorMats, ceilMats, pitMat, tex.wallScale, tex.wallHeight, tex.floorScale, tex.ceilScale);
    }
    for (const m of sink.meshes()) this.group.add(m);
    this.buildShifts(wallMats, tex.wallScale, tex.wallHeight);
    this.buildDiags(wallMats, tex.wallScale, tex.wallHeight);
    this.buildAbyss(tex.walls[0], tex.wallScale, tex.wallHeight);


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
        if (p.type !== 'fog') this.smalls.push(obj);
        this.animated.push({ obj, kind: p.type, seed: hash(p.x * 10, p.z * 10) * 100 });
        if (p.type === 'violet') this.addGlow(obj, 0xa060ff, 1.4, 0.9);
        if (p.type === 'bulb') this.addGlow(obj, 0xffe0a0, 1.0, 0.7, -0.55);
      } else statics.add(obj);
    }
    for (const g of map.storeys) {
      if (L.theme === 'pipes') this.buildPipes(g, statics);
      if (L.theme === 'habitable') this.buildConduits(g, statics);
    }
    this.mergeStatics(statics);

    // objetos que se pueden coger, cajas y salidas
    for (const item of map.items) {
      if (picked.has(item.key)) continue;
      const obj = itemModel(item.kind);
      obj.position.set(item.x, item.y, item.z);
      obj.rotation.y = hash(item.x * 10, item.z * 10) * Math.PI * 2;
      this.items.set(item.key, obj);
      this.group.add(obj);
      this.smalls.push(obj);
    }
    for (const c of map.crates) {
      const obj = makeCrate(picked.has(c.key));
      obj.position.set(c.x, c.y + (c.shelf ? 1.21 : 0), c.z);
      obj.rotation.y = c.ry;
      this.crates.set(c.key, obj);
      this.group.add(obj);
      this.smalls.push(obj);
    }
    for (const e of map.exits) {
      const door = makeExitDoor(e.label);
      door.position.set(e.x, e.y, e.z);
      door.rotation.y = e.ry;
      this.group.add(door);
    }

    // puertas, notas, ventanas, personajes y bichos
    for (const d of map.doors) {
      const obj = makeDoor(d);
      obj.position.set(d.x, d.y, d.z);
      obj.rotation.y = d.ry;
      this.group.add(obj);
      this.smalls.push(obj);
      if (d.sign) this.addGlow(obj, 0x30ff60, 1.6, 0.5, 2.45, 0.25);
    }
    for (const n of map.notes) {
      const tex = noteTexture(n.title);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), litMaterial({ map: tex }, 0.2));
      paper.position.set(n.x + Math.sin(n.ry) * 0.012, n.y + n.h, n.z + Math.cos(n.ry) * 0.012);
      paper.rotation.y = n.ry;
      paper.rotation.z = (hash(n.x, n.z) - 0.5) * 0.25;
      if (!n.wall) {
        paper.rotation.set(-Math.PI / 2, 0, n.ry);
      }
      this.disposables.push(tex);
      this.group.add(paper);
      this.smalls.push(paper);
    }
    for (const w of map.windows) {
      const obj = makeWindow();
      obj.position.set(w.x, w.y, w.z);
      obj.rotation.y = w.ry;
      this.group.add(obj);
      this.smalls.push(obj);
      this.windows.push({ ...w, face: obj.getObjectByName('face')! });
    }
    for (const n of map.npcs) {
      const model = n.kind === 'meg' ? makeMeg() : makeWorker(hash(n.x, n.z) * 10);
      const y = floorAt(map.storeys[n.s ?? 0], n.x, n.z);
      model.group.position.set(n.x, y, n.z);
      model.group.rotation.y = n.ry;
      this.group.add(model.group);
      this.npcs.push({ def: n, model, x: n.x, y, z: n.z, ry: n.ry, leg: 0, pause: 0 });
    }
    for (const c of map.critters) {
      const seed = hash(c.x, c.z, 7) * 100;
      if (c.kind === 'moth') {
        for (let k = 0; k < 3; k++) {
          const m = makeMoth();
          const g = map.storeys[c.s ?? 0];
          const ceil = g.ceil[Math.floor(c.z / CELL) * g.w + Math.floor(c.x / CELL)];
          this.group.add(m.group);
          this.moths.push({ obj: m.group, flap: m.flap, hx: c.x, hy: ceil - 0.6, hz: c.z, seed: seed + k * 3.1 });
        }
      } else {
        const r = makeRat();
        this.group.add(r);
        this.rats.push({ obj: r, x: c.x, z: c.z, tx: c.x, tz: c.z, wait: 0, seed, g: map.storeys[c.s ?? 0] });
      }
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
    m: LevelMap,
    sink: QuadSink,
    wallMats: THREE.Material[],
    floorMats: THREE.Material[],
    ceilMats: THREE.Material[],
    pitMat: THREE.Material,
    wallScale: number,
    wallHeight: number,
    floorScale: number,
    ceilScale: number,
  ) {
    const C = CELL;
    // los bloques de cambio periférico se dibujan aparte (aparecen y desaparecen)
    const open = (i: number) => !(m.flags[i] & F_SOLID) || m.shiftCell[i] >= 0;

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
        // hueco a la planta de abajo: aire desde el forjado (guardado en floor)
        const hole = (m.flags[i] & F_HOLE) !== 0;
        // pozo bajo un hueco: lo de encima del forjado lo dibuja la planta de arriba
        const shaft = (m.flags[i] & F_SHAFT) !== 0;
        const ceil = m.ceil[i];
        const wallTop = shaft ? m.slab[i] : ceil;
        const bottom = pit ? -PIT_DEPTH : m.floor[i];

        // ---- suelo ----
        if (!pit && !hole) {
          const fm = floorMats[m.floorMat[i]] ?? floorMats[0];
          if (m.flags[i] & F_STAIRS) {
            this.stairs(m, sink, fm, wallMats[0], i, x0, z0, floorTex);
          } else if (m.rampDir[i] < 0) {
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
          }
        }

        // ---- techo ----
        const cm = ceilMats[m.ceilMat[i]] ?? ceilMats[0];
        if (!shaft) {
          addRun(`c|${cz}|${ceil}|${mid(cm)}|${Math.floor(x0 / TILE)}`, x0, x1, (a, b) =>
            sink.quad(cm, [a, ceil, z0], [b, ceil, z0], [b, ceil, z1], [a, ceil, z1], [0, -1, 0], [ceilTex(a, z0), ceilTex(b, z0), ceilTex(b, z1), ceilTex(a, z1)]),
          );
        }

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
          const myFloor0 = pit || hole ? bottom : fy(i, e0[0], e0[1]);
          const myFloor1 = pit || hole ? bottom : fy(i, e1[0], e1[1]);
          const base = bottom;
          const uvAt = (along: number, y: number) => [along / wallScale, (y - base) / wallHeight];
          const split = base + wallHeight;
          const face = (mt: THREE.Material, b0: number, b1: number, t0: number, t1: number) => {
            if (t0 - b0 < 0.005 && t1 - b1 < 0.005) return;
            const upper = this.upperOf.get(mt);
            if (upper && Math.max(t0, t1) > split + 0.01) {
              // por encima de la altura de la textura: parte superior repetida, sin zócalo
              const u0 = Math.max(b0, split);
              const u1 = Math.max(b1, split);
              const uv = (along: number, y: number) => [along / wallScale, (y - split) / wallHeight];
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
            face(wm, myFloor0, myFloor1, wallTop, wallTop);
            continue;
          }
          const otherPit = (m.flags[j] & (F_PIT | F_HOLE)) !== 0;
          // escalón o borde: la vecina tiene el suelo más alto (en un agujero
          // ya lo cubre la pared del agujero: dibujarla dos veces parpadea)
          if (!otherPit && !pit && !hole) {
            const o0 = fy(j, e0[0], e0[1]);
            const o1 = fy(j, e1[0], e1[1]);
            if (o0 > myFloor0 + 0.005 || o1 > myFloor1 + 0.005) {
              const stairsSide = m.flags[j] & F_STAIRS || m.flags[i] & F_STAIRS;
              face(stairsSide ? floorMats[0] : wallMats[m.wallMat[j]] ?? wallMats[0], myFloor0, myFloor1, Math.max(o0, myFloor0), Math.max(o1, myFloor1));
            }
          }
          if ((pit || hole) && !otherPit) {
            // paredes del agujero: desde el suelo de la vecina hasta el fondo
            // (o, en un hueco entre plantas, hasta el techo de la de abajo)
            const o0 = fy(j, e0[0], e0[1]);
            const o1 = fy(j, e1[0], e1[1]);
            face(pit ? pitMat : wallMats[0], bottom, bottom, o0, o1);
          }
          // techo más bajo en la vecina: cara que cuelga (en un pozo la pone la planta de arriba)
          if (!shaft && m.ceil[j] < ceil - 0.005) face(wallMats[0], m.ceil[j], m.ceil[j], ceil, ceil);
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
  private stairs(m: LevelMap, sink: QuadSink, fm: THREE.Material, riser: THREE.Material, i: number, x0: number, z0: number, floorTex: (x: number, z: number) => number[]) {
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

  /** Paño de pared vertical entre dos puntos (con la parte alta sin zócalo). */
  private panel(sink: QuadSink, mt: THREE.Material, p0: [number, number], p1: [number, number], base: number, top: number, n: number[], wallScale: number, wallHeight: number, along0: number) {
    const along1 = along0 + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const split = base + wallHeight;
    const upper = this.upperOf.get(mt);
    const q = (m: THREE.Material, b: number, t: number, ref: number) => {
      const uv = (al: number, y: number) => [al / wallScale, (y - ref) / wallHeight];
      sink.quad(m, [p0[0], b, p0[1]], [p1[0], b, p1[1]], [p1[0], t, p1[1]], [p0[0], t, p0[1]], n, [uv(along0, b), uv(along1, b), uv(along1, t), uv(along0, t)]);
    };
    if (upper && top > split + 0.01) {
      q(upper, split, top, split);
      q(mt, base, split, base);
    } else q(mt, base, top, base);
  }

  /** Bloques de "cambio periférico": paredes que se encienden y apagan. */
  private buildShifts(wallMats: THREE.Material[], wallScale: number, wallHeight: number) {
    for (const sh of this.map.shifts) {
      const m = this.map.storeys[sh.s ?? 0];
      const sink = new QuadSink();
      const mt = wallMats[sh.wall] ?? wallMats[0];
      for (let i = 0; i < m.shiftCell.length; i++) {
        if (m.shiftCell[i] !== sh.id) continue;
        const cx = i % m.w;
        const cz = (i - cx) / m.w;
        const x0 = cx * CELL;
        const z0 = cz * CELL;
        for (const [dx, dz] of DIRS) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= m.w || nz >= m.h) continue;
          const j = nz * m.w + nx;
          if (m.shiftCell[j] === sh.id) continue;
          if (m.flags[j] & F_SOLID && m.shiftCell[j] < 0) continue;
          // cara que mira hacia la vecina
          let p0: [number, number];
          let p1: [number, number];
          if (dx === 1) [p0, p1] = [[x0 + CELL, z0], [x0 + CELL, z0 + CELL]];
          else if (dx === -1) [p0, p1] = [[x0, z0 + CELL], [x0, z0]];
          else if (dz === 1) [p0, p1] = [[x0 + CELL, z0 + CELL], [x0, z0 + CELL]];
          else [p0, p1] = [[x0, z0], [x0 + CELL, z0]];
          const base = Math.min(m.floor[i], m.floor[j]);
          const along = dx !== 0 ? Math.min(p0[1], p1[1]) : Math.min(p0[0], p1[0]);
          const [a, b] = (dx !== 0 ? p0[1] < p1[1] : p0[0] < p1[0]) ? [p0, p1] : [p1, p0];
          this.panel(sink, mt, a, b, base, Math.max(m.ceil[i], m.ceil[j]), [dx, 0, dz], wallScale, wallHeight, along);
        }
      }
      const g = new THREE.Group();
      for (const mesh of sink.meshes()) g.add(mesh);
      g.visible = sh.closed;
      this.shiftMeshes.set(sh.id, g);
      this.group.add(g);
    }
  }

  /** ¿Se ve ahora el bloque (cerrado)? */
  shiftShown(id: number): boolean {
    return this.shiftMeshes.get(id)?.visible ?? false;
  }

  /** Muestra u oculta los bloques de cambio periférico. */
  setShiftVisible(id: number, closed: boolean) {
    const g = this.shiftMeshes.get(id);
    if (g) g.visible = closed;
  }

  /** Paneles en diagonal de los giros de 45° del Nivel 2. */
  /**
   * La caída infinita: un pozo con pisos y pisos hacia abajo (papel pintado,
   * bordes de forjado y puertas oscuras o iluminadas) que se pierden en la niebla.
   */
  private buildAbyss(wallTex: THREE.Texture, wallScale: number, wallHeight: number) {
    const FH = 3;
    const FLOORS = 28;
    for (const zn of this.map.zones) {
      if (zn.kind !== 'abyss') continue;
      const wall = { pos: [] as number[], uv: [] as number[], col: [] as number[] };
      const over = { pos: [] as number[], uv: [] as number[], col: [] as number[] };
      const quad = (t: typeof wall, p: number[][], uv: number[][], c: number[]) => {
        for (const k of [0, 1, 2, 0, 2, 3]) {
          t.pos.push(...p[k]);
          t.uv.push(...uv[k]);
          t.col.push(...c);
        }
      };
      const cx = zn.x + zn.w / 2;
      const cz = zn.z + zn.d / 2;
      // los cuatro lados, de esquina a esquina
      const sides: [number, number, number, number][] = [
        [zn.x, zn.z, zn.x + zn.w, zn.z],
        [zn.x + zn.w, zn.z, zn.x + zn.w, zn.z + zn.d],
        [zn.x + zn.w, zn.z + zn.d, zn.x, zn.z + zn.d],
        [zn.x, zn.z + zn.d, zn.x, zn.z],
      ];
      sides.forEach(([ax, az, bx, bz], side) => {
        const len = Math.hypot(bx - ax, bz - az);
        // hacia dentro del pozo
        const ix = Math.sign(cx - (ax + bx) / 2) * 0.02;
        const iz = Math.sign(cz - (az + bz) / 2) * 0.02;
        const P = (t: number, y: number, inset: number) => [ax + ((bx - ax) * t) / len + ix * inset, y, az + ((bz - az) * t) / len + iz * inset];
        for (let k = 0; k < FLOORS; k++) {
          const top = -k * FH;
          const bot = top - FH;
          // algunos pisos están a oscuras; cuanto más abajo, más apagado
          const lit = hash(this.map.level, k, side, 7) < 0.7 ? 1 : 0.35;
          const f = lit * Math.max(0.25, 0.95 - k * 0.025);
          const wc = [f, f * 0.97, f * 0.85];
          quad(wall, [P(0, bot, 1), P(len, bot, 1), P(len, top, 1), P(0, top, 1)], [[0, 0], [len / wallScale, 0], [len / wallScale, FH / wallHeight], [0, FH / wallHeight]], wc);
          // borde del forjado (moqueta y hormigón)
          const sc = [0.32 * f, 0.27 * f, 0.18 * f];
          quad(over, [P(0, top - 0.35, 2), P(len, top - 0.35, 2), P(len, top, 2), P(0, top, 2)], [[0, 0], [1, 0], [1, 1], [0, 1]], sc);
          // puertas: negras o con luz detrás
          const doors = 1 + Math.floor(hash(this.map.level, k, side, 3) * 2.5);
          for (let d = 0; d < doors; d++) {
            const w = 0.9 + hash(this.map.level, k, side, d, 5) * 0.6;
            const t0 = 0.4 + hash(this.map.level, k, side, d, 9) * Math.max(0, len - w - 0.8);
            const glow = hash(this.map.level, k, side, d, 11) < 0.35;
            const dc = glow ? [1.0 * f, 0.92 * f, 0.62 * f] : [0.015, 0.012, 0.008];
            quad(over, [P(t0, bot, 3), P(t0 + w, bot, 3), P(t0 + w, bot + 2.1, 3), P(t0, bot + 2.1, 3)], [[0, 0], [1, 0], [1, 1], [0, 1]], dc);
          }
        }
      });
      const mk = (t: typeof wall, m: THREE.Material) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(t.col, 3));
        const mesh = new THREE.Mesh(g, m);
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.disposables.push(g, m);
      };
      mk(wall, new THREE.MeshBasicMaterial({ map: wallTex, vertexColors: true, side: THREE.DoubleSide }));
      mk(over, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    }
  }

  private buildDiags(wallMats: THREE.Material[], wallScale: number, wallHeight: number) {
    const sink = new QuadSink();
    for (const d of this.map.diags) {
      const m = this.map.storeys[d.s ?? 0];
      const tx = Math.cos(d.ry);
      const tz = -Math.sin(d.ry);
      const p0: [number, number] = [d.x - (tx * d.w) / 2, d.z - (tz * d.w) / 2];
      const p1: [number, number] = [d.x + (tx * d.w) / 2, d.z + (tz * d.w) / 2];
      const i = Math.floor(d.z / CELL) * m.w + Math.floor(d.x / CELL);
      const base = floorAt(m, d.x + Math.sin(d.ry) * 0.3, d.z + Math.cos(d.ry) * 0.3);
      const top = m.ceil[i] ?? base + 2.6;
      this.panel(sink, wallMats[d.wall] ?? wallMats[0], p0, p1, Number.isFinite(base) ? base : 0, top, [Math.sin(d.ry), 0, Math.cos(d.ry)], wallScale, wallHeight, d.x + d.z);
    }
    for (const mesh of sink.meshes()) this.group.add(mesh);
  }

  /** Halo de luz alrededor de una bombilla o un cartel. */
  private addGlow(parent: THREE.Object3D, color: number, size: number, base: number, y = -0.14, z = 0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: base, fog: false }));
    s.scale.setScalar(size);
    s.position.set(0, y, z);
    parent.add(s);
    this.glows.push({ sprite: s, base, seed: Math.random() * 10 });
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
        const cable = new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4, 1, true);
        cable.translate(lamp.x, y - 0.18, lamp.z);
        const cage = new THREE.CylinderGeometry(0.09, 0.07, 0.16, 8, 1, true);
        cage.translate(lamp.x, y - 0.43, lamp.z);
        housings.push(cable, cage);
        const bulb = new THREE.SphereGeometry(0.06, 8, 6);
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
          const chain = new THREE.CylinderGeometry(0.008, 0.008, hang, 4, 1, true);
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
  private buildPipes(map: LevelMap, into: THREE.Group) {
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
          if (start >= 0 && k - start >= 6) {
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
              // (en el laberinto hay muchísimas paredes: no todas llevan todas las tuberías)
              if (hash(a, start, r * 100) < 0.45) continue;
              const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6, 1, true), m);
              if (alongX) {
                pipe.rotation.z = Math.PI / 2;
                pipe.position.set(mid, y, face + sign * off);
              } else {
                pipe.rotation.x = Math.PI / 2;
                pipe.position.set(face + sign * off, y, mid);
              }
              into.add(pipe);
              // bridas cada pocos metros
              for (let f = start * CELL + 1; f < start * CELL + len - 0.5; f += 4) {
                const flange = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.06, 6), steel);
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
  private buildConduits(map: LevelMap, into: THREE.Group) {
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
    // todos los colores lisos de un bloque van en una sola malla con color por vértice
    const plainMat = litMaterial({ vertexColors: true }, 0.15);
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      let m = o.material as THREE.Material;
      o.getWorldPosition(pos);
      if (m.userData.plain) {
        const c = (m as THREE.MeshBasicMaterial).color;
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
          col[k * 3] = c.r;
          col[k * 3 + 1] = c.g;
          col[k * 3 + 2] = c.b;
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        m = plainMat;
      }
      if (!ids.has(m)) ids.set(m, ids.size);
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

  update(time: number, flicker: number, blackout: number, dt = 0.016, torch: THREE.Vector3 | null = null, player: { x: number; z: number } | null = null) {
    const on = 1 - blackout;
    if (player && (this.cullClock -= dt) <= 0) {
      this.cullClock = 0.2;
      for (const o of this.smalls) {
        const dx = o.position.x - player.x;
        const dz = o.position.z - player.z;
        o.visible = dx * dx + dz * dz < 24 * 24;
      }
    }
    for (const g of this.glows) (g.sprite.material as THREE.SpriteMaterial).opacity = g.base * (0.85 + 0.15 * Math.sin(time * 3 + g.seed));
    this.steadyPanels.color.copy(this.glow).multiplyScalar(Math.max(0.03, on));
    this.flickerPanels.color.copy(this.glow).multiplyScalar(Math.max(0.03, flicker * on));
    this.group.children.forEach((c) => {
      if (c instanceof THREE.Mesh && c.material instanceof THREE.ShaderMaterial) c.material.uniforms.uTime.value = time;
    });
    for (const a of this.animated) {
      if (a.kind === 'hanglamp') a.obj.rotation.z = Math.sin(time * 0.7 + a.seed) * 0.05;
      if (a.kind === 'fog') a.obj.children.forEach((s, k) => (s.position.x += Math.sin(time * 0.1 + k + a.seed) * 0.003));
      if (a.kind === 'bulb') a.obj.rotation.z = Math.sin(time * 0.9 + a.seed) * 0.04;
      if (a.kind === 'drip') {
        // una gota cada pocos segundos, cae hasta el suelo
        const drop = a.obj.getObjectByName('drop')!;
        const period = 1.6 + (a.seed % 1.3);
        const t = (time + a.seed) % period;
        const floor = floorUnder(this.map, a.obj.position.x, a.obj.position.z, a.obj.position.y);
        const fall = 4.9 * t * t;
        drop.visible = a.obj.position.y - 0.1 - fall > floor;
        drop.position.y = -0.1 - fall;
      }
    }
    this.updateCritters(time, dt, torch);
    this.updateNpcs(time, dt, player);
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

  private updateCritters(time: number, dt: number, torch: THREE.Vector3 | null) {
    for (const m of this.moths) {
      // revolotean bajo el techo; si hay una linterna cerca, van hacia ella
      let hx = m.hx;
      let hy = m.hy;
      let hz = m.hz;
      if (torch && Math.hypot(torch.x - m.hx, torch.z - m.hz) < 8) {
        hx = torch.x;
        hy = torch.y + 0.3;
        hz = torch.z;
      }
      const t = time * 1.3 + m.seed;
      const tx = hx + Math.sin(t) * 0.8 + Math.sin(t * 2.7) * 0.3;
      const ty = hy + Math.sin(t * 1.9) * 0.25;
      const tz = hz + Math.cos(t * 1.1) * 0.8;
      const k = Math.min(1, dt * 1.5);
      const o = m.obj;
      const px = o.position.x;
      const pz = o.position.z;
      if (px === 0 && pz === 0) o.position.set(tx, ty, tz);
      o.position.x += (tx - o.position.x) * k;
      o.position.y += (ty - o.position.y) * k;
      o.position.z += (tz - o.position.z) * k;
      o.rotation.y = Math.atan2(o.position.x - px, o.position.z - pz);
      m.flap(time + m.seed);
    }
    for (const r of this.rats) {
      const dx = r.tx - r.x;
      const dz = r.tz - r.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        r.wait -= dt;
        if (r.wait <= 0) {
          const a = hash(r.seed, time) * Math.PI * 2;
          const len = 1 + hash(time, r.seed) * 3;
          const nx = r.x + Math.cos(a) * len;
          const nz = r.z + Math.sin(a) * len;
          const c = collide(r.g, nx, nz, floorAt(r.g, r.x, r.z), 0.15, 0.2);
          if (Math.hypot(c.x - nx, c.z - nz) < 0.01) {
            r.tx = nx;
            r.tz = nz;
          }
          r.wait = 0.5 + hash(r.seed, time, 3) * 4;
        }
      } else {
        const step = Math.min(d, dt * 2.4);
        r.x += (dx / d) * step;
        r.z += (dz / d) * step;
        r.obj.rotation.y = Math.atan2(-dx, -dz);
      }
      const y = floorAt(r.g, r.x, r.z);
      r.obj.position.set(r.x, Number.isFinite(y) ? y : 0, r.z);
    }
  }

  private updateNpcs(time: number, dt: number, player: { x: number; z: number } | null) {
    for (const n of this.npcs) {
      const path = n.def.path;
      let moving = false;
      if (path && path.length > 1) {
        if (n.pause > 0) n.pause -= dt;
        else {
          const [tx, tz] = path[n.leg % path.length];
          const dx = tx - n.x;
          const dz = tz - n.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.1) {
            n.leg++;
            n.pause = 1.5 + hash(n.leg, n.def.x) * 3;
          } else {
            const step = Math.min(d, dt * 1.1);
            n.x += (dx / d) * step;
            n.z += (dz / d) * step;
            n.ry = Math.atan2(dx, dz);
            moving = true;
          }
        }
      }
      // la M.E.G. no te quita ojo mientras estás cerca
      if (n.def.kind === 'meg' && player && Math.hypot(player.x - n.x, player.z - n.z) < 16) {
        const want = Math.atan2(n.x - player.x, n.z - player.z); // el modelo mira hacia -z
        n.ry += Math.atan2(Math.sin(want - n.ry), Math.cos(want - n.ry)) * Math.min(1, dt * 5);
      }
      const y = floorAt(this.map.storeys[n.def.s ?? 0], n.x, n.z);
      if (Number.isFinite(y)) n.y = y;
      n.model.group.position.set(n.x, n.y, n.z);
      n.model.group.rotation.y = n.ry;
      n.model.animate(dt, time, moving);
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

  /** La caja vuelve a estar cerrada (y llena). */
  restoreCrate(key: string) {
    const crate = this.crates.get(key);
    const lid = crate?.getObjectByName('lid');
    lid?.position.set(0, 0.63, 0);
    lid?.rotation.set(0, 0, 0);
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

function itemModel(kind: ItemKind): THREE.Group {
  switch (kind) {
    case 'agua': return makeBottle();
    case 'pila': return makeBattery();
    case 'barrita': return makeEnergyBar();
    case 'lata': return makeCan();
    case 'bengala': return makeFlareStick();
    default: return makeMedkit();
  }
}

/** Puerta según su aspecto. Las de paso libre se dibujan abiertas. */
function makeDoor(d: Door): THREE.Group {
  const colors = { steel: 0x4f5450, white: 0xcfcfc6, wood: 0x7a5a3a, double: 0xb8bab2 } as const;
  const leafMat = litMaterial({ color: colors[d.look] }, 0.3);
  const frameMat = litMaterial({ color: d.look === 'wood' ? 0x4a3420 : 0x2f322f }, 0.3);
  const metal = litMaterial({ color: 0xa0a09a }, 0.3);
  const g = new THREE.Group();
  const w = d.look === 'double' ? 1.8 : 1.0;
  const h = 2.1;
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(0.1, h + 0.1, 0.12), frameMat, -w / 2 - 0.05, (h + 0.1) / 2, 0.02);
  add(new THREE.BoxGeometry(0.1, h + 0.1, 0.12), frameMat, w / 2 + 0.05, (h + 0.1) / 2, 0.02);
  add(new THREE.BoxGeometry(w + 0.2, 0.1, 0.12), frameMat, 0, h + 0.05, 0.02);
  const passage = !d.locked && !d.to;
  const leaves = d.look === 'double' ? [-1, 1] : [1];
  for (const side of leaves) {
    const lw = w / leaves.length;
    const leaf = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(lw, h, 0.05), leafMat);
    slab.position.set((-side * lw) / 2, h / 2, 0);
    leaf.add(slab);
    // barra antipánico o manilla
    const bar = new THREE.Mesh(new THREE.BoxGeometry(lw * (d.look === 'double' ? 0.7 : 0.25), 0.05, 0.05), metal);
    bar.position.set(-side * (d.look === 'double' ? lw / 2 : lw * 0.8), 1.0, 0.05);
    leaf.add(bar);
    if (d.window || d.look === 'double') {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x050607 }));
      glass.position.set((-side * lw) / 2, 1.6, 0.027);
      leaf.add(glass);
    }
    // bisagra en el lado del marco
    leaf.position.set((side * w) / 2, 0, 0.0);
    if (passage) leaf.rotation.y = side * 1.25;
    g.add(leaf);
  }
  if (d.sign) {
    add(new THREE.BoxGeometry(0.7, 0.22, 0.08), litMaterial({ color: 0x222222 }, 0.3), 0, h + 0.35, 0.05);
    const sign = add(new THREE.PlaneGeometry(0.64, 0.17), new THREE.MeshBasicMaterial({ map: textTexture(d.sign, '#9dffab', '#063010', 256, 64), color: new THREE.Color(2, 2, 2), fog: false }), 0, h + 0.35, 0.092);
    sign.name = 'sign';
  }
  return g;
}

/** Ventana oscura: a veces se asoma una cara (se muestra desde el juego). */
function makeWindow(): THREE.Group {
  const g = new THREE.Group();
  const frame = litMaterial({ color: 0x3a3a34 }, 0.3);
  for (const [w, h, x, y] of [[1.1, 0.08, 0, 1.0], [1.1, 0.08, 0, 1.9], [0.08, 0.98, -0.55, 1.45], [0.08, 0.98, 0.55, 1.45], [0.04, 0.9, 0, 1.45]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frame);
    b.position.set(x, y, 0.03);
    g.add(b);
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.84), new THREE.MeshBasicMaterial({ color: 0x020304 }));
  glass.position.set(0, 1.45, 0.01);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: windowFace(), transparent: true, fog: false }));
  face.position.set(0.22, 1.5, 0.015);
  face.name = 'face';
  face.visible = false;
  g.add(glass, face);
  return g;
}

let faceTex: THREE.Texture | null = null;
function windowFace(): THREE.Texture {
  faceTex ??= canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(210,205,190,0.9)');
      g.addColorStop(0.7, 'rgba(120,115,105,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.3, h * 0.42, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#000';
      for (const x of [0.4, 0.6]) {
        ctx.beginPath();
        ctx.ellipse(x * w, 0.42 * h, 7, 10, 0, 0, 7);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(0.5 * w, 0.7 * h, 12, 5, 0, 0, 7);
      ctx.fill();
    },
    false,
  );
  return faceTex;
}

/** Papel de una nota: el título y unas líneas garabateadas. */
function noteTexture(title: string): THREE.Texture {
  const words = title.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).length > 18) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  lines.push(cur);
  for (let k = 0; k < 7; k++) lines.push('~ '.repeat(3 + ((k * 5) % 6)));
  return paperTexture(lines, { w: 192, h: 240, font: '15px "Comic Sans MS", cursive' });
}

function slopeNormal(dir: number, rise: number): number[] {
  if (dir < 0 || rise === 0) return [0, 1, 0];
  const s = rise / CELL;
  const n = dir === 0 ? [-s, 1, 0] : dir === 1 ? [s, 1, 0] : dir === 2 ? [0, 1, -s] : [0, 1, s];
  const l = Math.hypot(n[0], n[1], n[2]);
  return n.map((v) => v / l);
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

