import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, useLevelLight } from './lighting';
import { makeBattery, makeBottle, makeExitDoor } from './models';
import { crateTexture, themeTextures } from './textures';
import { CELL, LEVELS, charAt, hash, isSolid, type LevelMap } from './world';

/** Escena fija de un nivel: paredes, suelo, techo, fluorescentes y objetos. */
export class Level3D {
  readonly group = new THREE.Group();
  private items = new Map<string, THREE.Object3D>();
  private flickerPanels: THREE.MeshBasicMaterial;
  private disposables: { dispose: () => void }[] = [];

  constructor(
    readonly map: LevelMap,
    picked: Set<string>,
  ) {
    const L = LEVELS[map.level];
    const tex = themeTextures(L.theme);
    this.disposables.push(useLevelLight(map), tex.wall, tex.floor, tex.ceiling);
    const W = map.w * CELL;
    const H = map.h * CELL;

    // ---- paredes: solo las caras que dan a una casilla libre ----
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const quad = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, along0: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = along0 / tex.wallScale;
      const u1 = (along0 + len) / tex.wallScale;
      const v = [
        [ax, 0, az, u0, 0],
        [bx, 0, bz, u1, 0],
        [bx, L.height, bz, u1, 1],
        [ax, L.height, az, u0, 1],
      ];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(v[k][0], v[k][1], v[k][2]);
        nor.push(nx, 0, nz);
        uv.push(v[k][3], v[k][4]);
      }
    };
    for (let cz = 0; cz < map.h; cz++) {
      for (let cx = 0; cx < map.w; cx++) {
        if (charAt(map, cx, cz) !== '#' && charAt(map, cx, cz) !== 'E') continue;
        const x0 = cx * CELL;
        const x1 = x0 + CELL;
        const z0 = cz * CELL;
        const z1 = z0 + CELL;
        // el orden de los vértices hace que la cara mire hacia fuera
        if (!isSolid(map, cx, cz - 1)) quad(x1, z0, x0, z0, 0, -1, W - x1);
        if (!isSolid(map, cx, cz + 1)) quad(x0, z1, x1, z1, 0, 1, x0);
        if (!isSolid(map, cx - 1, cz)) quad(x0, z0, x0, z1, -1, 0, z0);
        if (!isSolid(map, cx + 1, cz)) quad(x1, z1, x1, z0, 1, 0, H - z1);
      }
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.add(new THREE.Mesh(wallGeo, litMaterial({ map: tex.wall }, 0.4)));

    // ---- suelo y techo ----
    const plane = (y: number, up: boolean, texture: THREE.Texture, scale: number) => {
      const g = new THREE.PlaneGeometry(W, H);
      g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
      g.translate(W / 2, y, H / 2);
      const p = g.attributes.position;
      const u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / scale, p.getZ(i) / scale);
      return this.add(new THREE.Mesh(g, litMaterial({ map: texture }, 0)));
    };
    plane(0, true, tex.floor, tex.floorScale);
    plane(L.height, false, tex.ceiling, tex.ceilingScale);

    // ---- fluorescentes ----
    const pipes = L.theme === 'pipes';
    const housings: THREE.BufferGeometry[] = [];
    const steady: THREE.BufferGeometry[] = [];
    const flick: THREE.BufferGeometry[] = [];
    for (const lamp of map.lamps) {
      const rot = hash(map.level, lamp.x, lamp.z) < 0.5 ? 0 : Math.PI / 2;
      if (pipes) {
        // bombilla en una jaula colgando del techo
        const cable = new THREE.CylinderGeometry(0.01, 0.01, 0.35);
        cable.translate(lamp.x, L.height - 0.18, lamp.z);
        const cage = new THREE.CylinderGeometry(0.09, 0.07, 0.16, 8, 1, true);
        cage.translate(lamp.x, L.height - 0.43, lamp.z);
        housings.push(cable, cage);
        const bulb = new THREE.SphereGeometry(0.06, 12, 8);
        bulb.translate(lamp.x, L.height - 0.45, lamp.z);
        (lamp.flicker ? flick : steady).push(bulb);
      } else {
        const lw = L.theme === 'habitable' ? 1.6 : 1.25;
        const hang = L.theme === 'habitable' ? 0.5 : 0;
        const box = new THREE.BoxGeometry(lw + 0.1, 0.07, 0.42);
        box.rotateY(rot);
        box.translate(lamp.x, L.height - 0.035 - hang, lamp.z);
        housings.push(box);
        if (hang) {
          for (const s of [-1, 1]) {
            const chain = new THREE.CylinderGeometry(0.008, 0.008, hang);
            const ox = rot ? 0 : (s * lw) / 2.5;
            const oz = rot ? (s * lw) / 2.5 : 0;
            chain.translate(lamp.x + ox, L.height - hang / 2, lamp.z + oz);
            housings.push(chain);
          }
        }
        // dos tubos con difusor
        for (const s of [-1, 1]) {
          const tube = new THREE.BoxGeometry(lw, 0.02, 0.14);
          tube.translate(0, 0, s * 0.09);
          tube.rotateY(rot);
          tube.translate(lamp.x, L.height - 0.08 - hang, lamp.z);
          (lamp.flicker ? flick : steady).push(tube);
        }
      }
    }
    const glow = new THREE.Color(...L.tint).multiplyScalar(pipes ? 2.2 : 1.8);
    const steadyMat = new THREE.MeshBasicMaterial({ color: glow });
    this.flickerPanels = new THREE.MeshBasicMaterial({ color: glow.clone() });
    const merge = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!list.length) return;
      this.add(new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat));
      for (const g of list) g.dispose();
    };
    merge(housings, litMaterial({ color: pipes ? 0x3a3530 : 0xbdb8a6 }, 0));
    merge(steady, steadyMat);
    merge(flick, this.flickerPanels);

    // ---- detalles de cada tema ----
    if (pipes) this.buildPipes();
    if (L.theme === 'habitable') this.buildWarehouse();

    // ---- objetos y salidas ----
    for (const item of map.items) {
      if (picked.has(item.key)) continue;
      const obj = item.kind === 'agua' ? makeBottle() : makeBattery();
      obj.position.set(item.x, 0, item.z);
      obj.rotation.y = hash(item.x, item.z) * Math.PI * 2;
      this.items.set(item.key, obj);
      this.group.add(obj);
    }
    for (const exit of map.exits) {
      const door = makeExitDoor();
      door.position.set(exit.x, 0, exit.z);
      door.rotation.y = exit.ry;
      this.group.add(door);
    }
  }

  private add(mesh: THREE.Mesh): THREE.Mesh {
    this.group.add(mesh);
    return mesh;
  }

  /** Tuberías a lo largo de las paredes, cerca del techo. */
  private buildPipes() {
    const { map } = this;
    const h = LEVELS[map.level].height;
    const geos: THREE.BufferGeometry[] = [];
    // tramos horizontales junto a las paredes, en las cuatro orientaciones
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const;
    for (const [dx, dz] of dirs) {
      const alongX = dz !== 0;
      const outer = alongX ? map.h : map.w;
      const inner = alongX ? map.w : map.h;
      for (let a = 0; a < outer; a++) {
        let start = -1;
        for (let b = 0; b <= inner; b++) {
          const cx = alongX ? b : a;
          const cz = alongX ? a : b;
          const ok = b < inner && charAt(map, cx, cz) === '#' && !isSolid(map, cx + dx, cz + dz);
          if (ok && start < 0) start = b;
          if (ok || start < 0) continue;
          const len = (b - start) * CELL;
          if (b - start >= 2 && hash(a, start, dx, dz) < 0.75) {
            const mid = start * CELL + len / 2;
            const face = (a + (dx + dz > 0 ? 1 : 0)) * CELL;
            for (const [r, y, off] of [[0.09, h - 0.22, 0.13], [0.05, h - 0.45, 0.07]] as const) {
              if (r === 0.05 && hash(a, start, 7) < 0.4) continue;
              const g = new THREE.CylinderGeometry(r, r, len, 10);
              const sign = dx + dz;
              if (alongX) {
                g.rotateZ(Math.PI / 2);
                g.translate(mid, y, face + sign * off);
              } else {
                g.rotateX(Math.PI / 2);
                g.translate(face + sign * off, y, mid);
              }
              geos.push(g);
            }
          }
          start = -1;
        }
      }
    }
    // tramos verticales en algunas paredes
    for (let cz = 0; cz < map.h; cz++) {
      for (let cx = 0; cx < map.w; cx++) {
        if (charAt(map, cx, cz) !== '#' || isSolid(map, cx + 1, cz) || hash(cx, cz, 9) > 0.18) continue;
        const g = new THREE.CylinderGeometry(0.07, 0.07, h, 10);
        g.translate((cx + 1) * CELL + 0.1, h / 2, (cz + 0.5) * CELL);
        geos.push(g);
      }
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()));
    for (const g of geos) g.dispose();
    this.add(new THREE.Mesh(merged, litMaterial({ color: 0x7a4426 }, 0.2)));
  }

  /** Cajas y charcos del almacén. */
  private buildWarehouse() {
    const { map } = this;
    const crates: THREE.BufferGeometry[] = [];
    const puddles: THREE.BufferGeometry[] = [];
    for (let cz = 0; cz < map.h; cz++) {
      for (let cx = 0; cx < map.w; cx++) {
        const ch = charAt(map, cx, cz);
        const x = (cx + 0.5) * CELL;
        const z = (cz + 0.5) * CELL;
        if (ch === 'x') {
          const s = CELL * 0.84;
          const g = new THREE.BoxGeometry(s, s, s);
          g.rotateY((hash(cx, cz) - 0.5) * 0.2);
          g.translate(x, s / 2, z);
          crates.push(g);
          if (hash(cx, cz, 2) < 0.5) {
            const s2 = CELL * 0.6;
            const g2 = new THREE.BoxGeometry(s2, s2, s2);
            g2.rotateY(hash(cx, cz, 3));
            g2.translate(x, s + s2 / 2, z);
            crates.push(g2);
          }
        }
        if (ch === 'w') {
          const g = new THREE.CircleGeometry(CELL * (0.5 + hash(cx, cz) * 0.3), 18);
          g.scale(1, 0.7 + hash(cx, cz, 1) * 0.5, 1);
          g.rotateX(-Math.PI / 2);
          g.translate(x, 0.01, z);
          puddles.push(g);
        }
      }
    }
    if (crates.length) {
      const tex = crateTexture();
      this.disposables.push(tex);
      this.add(new THREE.Mesh(mergeGeometries(crates.map((g) => g.toNonIndexed())), litMaterial({ map: tex }, 0.3)));
    }
    if (puddles.length) {
      this.add(
        new THREE.Mesh(
          mergeGeometries(puddles.map((g) => g.toNonIndexed())),
          litMaterial({ color: 0x1c2630, transparent: true, opacity: 0.75 }, 0),
        ),
      );
    }
  }

  /** Brillo de los fluorescentes que parpadean (0-1). */
  setFlicker(f: number) {
    this.flickerPanels.color.setRGB(...LEVELS[this.map.level].tint).multiplyScalar((LEVELS[this.map.level].theme === 'pipes' ? 2.2 : 1.8) * f);
  }

  removeItem(key: string) {
    const obj = this.items.get(key);
    if (!obj) return;
    this.group.remove(obj);
    this.items.delete(key);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      }
    });
    for (const d of this.disposables) d.dispose();
  }
}
