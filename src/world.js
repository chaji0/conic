// data/map.json 으로 3D 동네를 세운다: 바닥(구역·도로), 건물, 나무, 담벼락, 가로등, 충돌 격자, 미니맵 이미지.
// 좌표계: 원점 = 단대부고, +x 동쪽, +z 남쪽, y 높이, 단위 m.
import * as THREE from 'three';

// 구역 색상과 그리는 순서(작을수록 먼저 = 아래)
export const AREA_STYLE = {
  residential: [0xe6e1d4, 0], commercial: [0xe2dacd, 0], school: [0xe8d5b5, 1], parking: [0xc8c5bf, 2],
  grass: [0xaed28f, 3], park: [0xa2cf84, 3], garden: [0xb3d993, 4], wood: [0x86b96f, 4],
  pitch: [0x72b56d, 5], playground: [0xebc690, 5], plaza: [0xd8d0c2, 5], water: [0x86bddb, 6],
};
const TREE_DENSITY = { park: 130, wood: 55, garden: 160, grass: 260 };   // m² 당 나무 1그루
const NO_TREE = new Set(['pitch', 'playground', 'water', 'parking', 'plaza']);
const GREENS = [0x5f9e4f, 0x6aa957, 0x4f8d45, 0x78b35e, 0x5a9853, 0x86b862];
const VEHICULAR_RE = /^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)/;
const WALLED_AREAS = { residential: { color: 0xd8d2c4, cap: 0x8e8a80, h: 1.5 }, school: { color: 0xa86a52, cap: 0xf1ebe0, h: 1.8 } };

const frac = v => v - Math.floor(v);
const hash01 = i => frac(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
const css = hex => '#' + hex.toString(16).padStart(6, '0');
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function project(origin, lat, lon) {
  const KX = 111320 * Math.cos(origin.lat * Math.PI / 180);
  return { x: (lon - origin.lon) * KX, z: -(lat - origin.lat) * 110574 };
}

// ---------- 폴리곤 도구 (p = [x0,z0,x1,z1,...]) ----------
function signedArea(p) {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
  return a / 2;
}
function reverseRing(p) {
  const r = [];
  for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]);
  return r;
}
function bboxOf(p) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i];
    if (p[i + 1] < minZ) minZ = p[i + 1]; if (p[i + 1] > maxZ) maxZ = p[i + 1];
  }
  return { minX, maxX, minZ, maxZ };
}
export function pointInPoly(p, x, z) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function closestOnPoly(p, x, z) {
  let best = Infinity, qx = 0, qz = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[2 * j], az = p[2 * j + 1], dx = p[2 * i] - ax, dz = p[2 * i + 1] - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * dx, cz = az + t * dz, d2 = (x - cx) ** 2 + (z - cz) ** 2;
    if (d2 < best) { best = d2; qx = cx; qz = cz; }
  }
  return { qx, qz, d: Math.sqrt(best) };
}
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
// 폴리곤을 안쪽으로 d 만큼 줄인 링 (단지 경계는 보통 도로 중심선을 따라 그려져 있어 담장은 인도 안쪽에 세워야 한다)
function insetRing(p, d) {
  const n = p.length / 2, s = signedArea(p) > 0 ? -1 : 1;    // 안쪽 방향 부호
  const lines = [];
  for (let i = 0; i < n; i++) {
    const ax = p[2 * i], az = p[2 * i + 1], bx = p[(2 * i + 2) % (2 * n)], bz = p[(2 * i + 3) % (2 * n)];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) continue;
    const nx = -(bz - az) / L * s * d, nz = (bx - ax) / L * s * d;
    lines.push([ax + nx, az + nz, bx + nx, bz + nz]);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const [ax, az, bx, bz] = lines[(i + lines.length - 1) % lines.length], [cx, cz, dx, dz] = lines[i];
    const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz, den = r1x * r2z - r1z * r2x;
    if (Math.abs(den) < 1e-6) { out.push(cx, cz); continue; }
    const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
    out.push(ax + r1x * t, az + r1z * t);
  }
  return out.length >= 6 ? out : p;
}
function triangulate(p) {
  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector2(p[i], p[i + 1]));
  try { return THREE.ShapeUtils.triangulateShape(pts, []); } catch { return []; }
}

// ---------- 공간 격자 ----------
function makeGrid(cell) {
  const cells = new Map();
  const key = (i, j) => i * 100000 + j;
  let stamp = 0;
  return {
    insert(o) {
      for (let i = Math.floor(o.minX / cell); i <= Math.floor(o.maxX / cell); i++)
        for (let j = Math.floor(o.minZ / cell); j <= Math.floor(o.maxZ / cell); j++) {
          const k = key(i, j);
          let c = cells.get(k);
          if (!c) cells.set(k, c = []);
          c.push(o);
        }
    },
    // fn 이 false 를 돌려주면 탐색 중단
    query(x, z, r, fn) {
      stamp++;
      for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++)
        for (let j = Math.floor((z - r) / cell); j <= Math.floor((z + r) / cell); j++) {
          const c = cells.get(key(i, j));
          if (!c) continue;
          for (const o of c) {
            if (o._s === stamp) continue;
            o._s = stamp;
            if (x + r < o.minX || x - r > o.maxX || z + r < o.minZ || z - r > o.maxZ) continue;
            if (fn(o) === false) return;
          }
        }
    },
  };
}

// ---------- 지형 ----------
// 모든 바닥 도형·건물 밑면·소품은 이 높이 위에 놓인다 (buildWorld 가 terrain 을 받아 설정). 기본은 평지.
let T = () => 0, inHill = () => false;
// 폴리라인의 긴 구간을 step 이하로 잘게 나눈다 (언덕 위에서 도로가 지형을 뚫고 나가지 않게)
function densify(p, step) {
  const out = [p[0], p[1]];
  for (let i = 0; i < p.length - 2; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az);
    const n = (inHill(ax, az) || inHill(bx, bz)) ? Math.max(1, Math.ceil(L / step)) : 1;
    for (let k = 1; k <= n; k++) out.push(ax + (bx - ax) * k / n, az + (bz - az) * k / n);
  }
  return out;
}

// ---------- 지오메트리 버퍼 ----------
const _c = new THREE.Color();
export class Buf {
  constructor(withUV = false) { this.pos = []; this.nor = []; this.col = []; this.uv = withUV ? [] : null; this.r = this.g = this.b = 1; this.depth = 0; }
  color(hex, k = 1) { _c.setHex(hex); this.r = _c.r * k; this.g = _c.g * k; this.b = _c.b * k; return this; }
  v(x, y, z, nx, ny, nz, u = 0, w = 0) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(this.r, this.g, this.b);
    if (this.uv) this.uv.push(u, w);
  }
  flatTri(y, ax, az, bx, bz, cx, cz) {       // 위(+y)를 보도록 감기 방향 보정. 언덕 위에서는 큰 삼각형을 잘게 나눈다
    if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) { [bx, cx] = [cx, bx]; [bz, cz] = [cz, bz]; }
    if (inHill(ax, az) || inHill(bx, bz) || inHill(cx, cz)) {
      const e = Math.max(Math.hypot(bx - ax, bz - az), Math.hypot(cx - bx, cz - bz), Math.hypot(ax - cx, az - cz));
      if (e > 9 && this.depth < 7) {
        this.depth = (this.depth || 0) + 1;
        const mabx = (ax + bx) / 2, mabz = (az + bz) / 2, mbcx = (bx + cx) / 2, mbcz = (bz + cz) / 2, mcax = (cx + ax) / 2, mcaz = (cz + az) / 2;
        this.flatTri(y, ax, az, mabx, mabz, mcax, mcaz); this.flatTri(y, mabx, mabz, bx, bz, mbcx, mbcz);
        this.flatTri(y, mcax, mcaz, mbcx, mbcz, cx, cz); this.flatTri(y, mabx, mabz, mbcx, mbcz, mcax, mcaz);
        this.depth--;
        return;
      }
    }
    this.v(ax, y + T(ax, az), az, 0, 1, 0); this.v(bx, y + T(bx, bz), bz, 0, 1, 0); this.v(cx, y + T(cx, cz), cz, 0, 1, 0);
  }
  quad(ax, az, bx, bz, y0, y1, nx, nz) {     // 수직 사각형 (a→b, 법선 n), 절대 높이
    this.v(ax, y0, az, nx, 0, nz); this.v(bx, y0, bz, nx, 0, nz); this.v(bx, y1, bz, nx, 0, nz);
    this.v(ax, y0, az, nx, 0, nz); this.v(bx, y1, bz, nx, 0, nz); this.v(ax, y1, az, nx, 0, nz);
  }
  quad4(ax, az, bx, bz, ya0, ya1, yb0, yb1, nx, nz) {   // 양 끝 높이가 다른 수직 사각형
    this.v(ax, ya0, az, nx, 0, nz); this.v(bx, yb0, bz, nx, 0, nz); this.v(bx, yb1, bz, nx, 0, nz);
    this.v(ax, ya0, az, nx, 0, nz); this.v(bx, yb1, bz, nx, 0, nz); this.v(ax, ya1, az, nx, 0, nz);
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}
export function fillPoly(buf, p, y) {
  for (const [a, b, c] of triangulate(p)) buf.flatTri(y, p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1], p[2 * c], p[2 * c + 1]);
}
function ribbon(buf, p, w, y) {
  const hw = w / 2;
  p = densify(p, 6);
  for (let i = 0; i < p.length - 2; i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    const nx = -(bz - az) / L * hw, nz = (bx - ax) / L * hw;
    buf.flatTri(y, ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz);
    buf.flatTri(y, ax + nx, az + nz, bx - nx, bz - nz, ax - nx, az - nz);
  }
  if (hw < 1.5) return;
  for (let i = 0; i < p.length; i += 2) {                        // 꺾이는 곳 둥글게
    const x = p[i], z = p[i + 1];
    for (let s = 0; s < 8; s++) {
      const a0 = s / 8 * Math.PI * 2, a1 = (s + 1) / 8 * Math.PI * 2;
      buf.flatTri(y, x, z, x + Math.cos(a0) * hw, z + Math.sin(a0) * hw, x + Math.cos(a1) * hw, z + Math.sin(a1) * hw);
    }
  }
}
function stripe(buf, p, off, width, dash, gap, y) {          // 차선: off 만큼 옆으로, dash/gap 반복
  const period = dash + gap;
  let acc = 0;
  p = densify(p, 6);
  for (let i = 0; i < p.length - 2; i += 2) {
    const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, L = Math.hypot(dx, dz);
    if (L < 0.01) continue;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const o0 = off - width / 2, o1 = off + width / 2;
    const m = acc % period;
    for (let s0 = m < dash ? -m : period - m; s0 < L; s0 += period) {
      const a0 = Math.max(0, s0), a1 = Math.min(L, s0 + dash);
      if (a1 - a0 < 0.05) continue;
      const P = (a, o) => [ax + ux * a + nx * o, az + uz * a + nz * o];
      const [p0x, p0z] = P(a0, o0), [p1x, p1z] = P(a1, o0), [p2x, p2z] = P(a1, o1), [p3x, p3z] = P(a0, o1);
      buf.flatTri(y, p0x, p0z, p1x, p1z, p2x, p2z);
      buf.flatTri(y, p0x, p0z, p2x, p2z, p3x, p3z);
    }
    acc += L;
  }
}
// 폴리라인을 따라 spacing 간격으로 점을 찍는다 → fn(x, z, nx, nz) (n = 왼쪽 법선)
function alongLine(p, spacing, start, fn) {
  let next = start, acc = 0;
  for (let i = 0; i < p.length - 2; i += 2) {
    const ax = p[i], az = p[i + 1], dx = p[i + 2] - ax, dz = p[i + 3] - az, L = Math.hypot(dx, dz);
    if (L < 0.01) continue;
    for (; next < acc + L; next += spacing) {
      const t = (next - acc) / L;
      fn(ax + dx * t, az + dz * t, -dz / L, dx / L);
    }
    acc += L;
  }
}

const isMajor = k => /^(trunk|primary|secondary)/.test(k);
const isFoot = k => /footway|path|pedestrian|steps|living_street|track/.test(k);
function roadRank(r) {
  if (r.k === 'waterway') return 0;
  if (isFoot(r.k) || r.k === 'cycleway') return 1;
  if (r.k.endsWith('_link')) return 3;
  if (isMajor(r.k)) return 5;
  if (r.k === 'tertiary') return 4;
  return 2;
}
function roadColor(k) {
  if (k === 'waterway') return 0x86bddb;
  if (k === 'cycleway') return 0xbd8672;
  if (isFoot(k)) return 0xd3cab8;
  if (isMajor(k) || k.endsWith('_link')) return 0x4d5157;
  return 0x6a6e74;
}

function buildingStyle(b, i) {
  const r = hash01(i + 1);
  if (b.h >= 70) return { wall: pick([0x9fb4c6, 0xa9bac6, 0x8fa5b9], r), roof: 0x6f7f8c };
  switch (b.k) {
    case 'apartments': case 'residential':
      return { wall: pick([0xf4f1e9, 0xece7dc, 0xf1ece4, 0xe4e7ea, 0xefe9df], r), roof: 0x9aa3ab };
    case 'school': case 'university': case 'college': case 'kindergarten':
      return { wall: pick([0xd9a67f, 0xcf9b74, 0xe1b992], r), roof: 0x7e8c77 };
    case 'house': case 'detached':
      return { wall: pick([0xeadcc8, 0xdac8af], r), roof: 0xa65c4a };
    case 'church': return { wall: 0xebe2d2, roof: 0x8b5b4d };
  }
  return { wall: pick([0xd8d3cb, 0xcacdd1, 0xe2dacd, 0xc0c6cd, 0xd4c3b1, 0xbac4cd, 0xe6e1d6], r), roof: 0x8a8f95 };
}

// 건물 외벽 텍스처: 낮(창문·층 슬래브) + 밤(불 켜진 창문만, emissiveMap 용). 4칸을 한 타일로 해서 창문마다 불빛이 다르다
function facadeTextures(rnd) {
  const W = 256, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#e2e2e2'; g.fillRect(0, 56, W, 8);               // 층 슬래브
  const n = document.createElement('canvas'); n.width = W; n.height = H;
  const ng = n.getContext('2d');
  ng.fillStyle = '#000000'; ng.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const x0 = i * 64;
    g.fillStyle = '#7d8c9b'; g.fillRect(x0 + 12, 16, 40, 30);      // 창
    g.fillStyle = '#a6b4c1'; g.fillRect(x0 + 12, 16, 40, 8);
    g.fillStyle = '#c9c9c9'; g.fillRect(x0 + 31, 16, 2, 30);
    if (rnd() < 0.62) { ng.fillStyle = rnd() < 0.5 ? '#ffe2a0' : '#ffd27a'; ng.fillRect(x0 + 13, 17, 38, 28); }
  }
  const day = new THREE.CanvasTexture(c), night = new THREE.CanvasTexture(n);
  for (const t of [day, night]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  day.colorSpace = THREE.SRGBColorSpace;
  return { day, night };
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,230,160,1)'); grad.addColorStop(0.4, 'rgba(255,220,140,0.45)'); grad.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// skipZones: 랜드마크 모델이 대신 서는 원 · skipPoly: 이 폴리곤 안 건물은 campus.js 가 직접 짓는다 · terrain: 지형
export function buildWorld(scene, map, { skipZones = [], skipPoly = null, terrain = null } = {}) {
  const B = map.bounds;
  const inB = (x, z, m = 0) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;
  const rnd = mulberry32(20260913);
  if (terrain) { T = terrain.y; inHill = terrain.inHill; }
  // 바닥 레이어: 땅만 깊이를 쓰고, 그 위 층은 polygonOffset 으로 항상 땅보다 앞에 판정되게 해 멀리서도 z-fighting 이 없다
  const flatMat = off => new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off });
  const addFlat = (buf, order, off) => { const m = buf.mesh(flatMat(off)); m.renderOrder = order; m.receiveShadow = true; scene.add(m); return m; };
  const colliders = makeGrid(20);
  const roadGrid = makeGrid(30);

  // 땅
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(B.maxX - B.minX + 1600, B.maxZ - B.minZ + 1600),
    new THREE.MeshLambertMaterial({ color: 0xdad5c8 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2);
  ground.receiveShadow = true;
  ground.renderOrder = -10;
  scene.add(ground);
  if (terrain) {                                   // 언덕 부분만 촘촘한 격자로 덮어 지형을 만든다
    const hb = terrain.bbox, W = hb.maxX - hb.minX, H = hb.maxZ - hb.minZ;
    const geo = new THREE.PlaneGeometry(W, H, Math.round(W / 4), Math.round(H / 4));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (hb.minX + hb.maxX) / 2, z = pos.getZ(i) + (hb.minZ + hb.maxZ) / 2;
      pos.setXYZ(i, x, T(x, z) + 0.01, z);
    }
    geo.computeVertexNormals();
    const hill = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xdad5c8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    hill.receiveShadow = true;
    hill.renderOrder = -9.5;
    scene.add(hill);
  }

  // 구역
  const areas = map.areas.filter(a => AREA_STYLE[a.k]).sort((a, b) => AREA_STYLE[a.k][1] - AREA_STYLE[b.k][1]);
  const areaBuf = new Buf();
  for (const a of areas) { areaBuf.color(AREA_STYLE[a.k][0]); fillPoly(areaBuf, a.p, 0); }
  addFlat(areaBuf, -9, -2);

  // 도로: 보도 → 차도 → 차선
  const roads = [...map.roads].sort((a, b) => roadRank(a) - roadRank(b));
  const roadBuf = new Buf();
  roadBuf.color(0xc6beb0);
  for (const r of roads) if (r.w >= 7 && r.k !== 'waterway') ribbon(roadBuf, r.p, r.w + 3.6, 0);
  for (const r of roads) { roadBuf.color(roadColor(r.k)); ribbon(roadBuf, r.p, r.w, 0); }
  for (const r of roads) {
    if (!(isMajor(r.k) || r.k === 'tertiary') || r.w < 10) continue;
    if (!r.o) {
      roadBuf.color(0xe6c14a);
      stripe(roadBuf, r.p, -0.2, 0.15, 1e9, 0, 0);
      stripe(roadBuf, r.p, 0.2, 0.15, 1e9, 0, 0);
    }
    roadBuf.color(0xf0f0ec);
    const lanes = Math.max(2, Math.round(r.w / 3.4));
    for (let l = 1; l < lanes; l++) {
      const off = -r.w / 2 + l * r.w / lanes;
      if (!r.o && Math.abs(off) < 0.5) continue;
      stripe(roadBuf, r.p, off, 0.15, 3, 5, 0);
    }
  }
  addFlat(roadBuf, -8, -4);

  // 도로 격자 (이름·빈자리 탐색) + 차가 다닐 수 있는 도로 (스트릿뷰 확인된 차량 도로)
  const driveRoads = [];
  for (const r of map.roads) {
    for (let i = 0; i < r.p.length - 2; i += 2) {
      const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3], pad = r.w / 2 + 1;
      roadGrid.insert({ ax, az, bx, bz, w: r.w, n: r.n || null, k: r.k,
        minX: Math.min(ax, bx) - pad, maxX: Math.max(ax, bx) + pad, minZ: Math.min(az, bz) - pad, maxZ: Math.max(az, bz) + pad });
    }
    if (VEHICULAR_RE.test(r.k) && (r.sv ?? 0) >= 0.5) driveRoads.push(r);
  }
  const onAnyRoad = (x, z, pad) => {
    let hit = false;
    roadGrid.query(x, z, pad, o => { if (o.k !== 'waterway' && segDist(x, z, o.ax, o.az, o.bx, o.bz) < o.w / 2 + pad) { hit = true; return false; } });
    return hit;
  };

  // 건물
  const addPolyCollider = (p, h) => colliders.insert({ p, h, ...bboxOf(p) });
  const tex = facadeTextures(rnd);
  const wallBuf = new Buf(true), roofBuf = new Buf();
  const drawn = [];
  map.buildings.forEach((b, i) => {
    let p = b.p;
    const bb = bboxOf(p), cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
    if (skipZones.some(s => Math.hypot(cx - s.x, cz - s.z) < s.r)) return;
    if (skipPoly && pointInPoly(skipPoly, cx, cz)) { addPolyCollider(p, T(cx, cz) + b.h); return; }   // 캠퍼스 건물은 campus.js 가 그림
    if (signedArea(p) > 0) p = reverseRing(p);                     // 벽 법선이 바깥을 보도록
    const { wall, roof } = buildingStyle(b, i);
    const k = 0.9 + hash01(i + 7) * 0.14, h = b.h, n = p.length / 2;
    // 언덕 위 건물: 바닥은 가운데 높이, 벽은 땅속으로 4m 더 내려 비탈에서 뜨지 않게
    const base = T(cx, cz), y0 = base - (base > 0.01 ? 4 : 0), y1 = base + h;
    wallBuf.color(wall, k);
    roofBuf.color(roof, k);
    let acc = 0;
    for (let e = 0; e < n; e++) {
      const ax = p[2 * e], az = p[2 * e + 1], bx = p[(2 * e + 2) % (2 * n)], bz = p[(2 * e + 3) % (2 * n)];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const nx = -dz / L, nz = dx / L, u0 = acc / 3.2, u1 = (acc + L) / 3.2, v1 = (y1 - y0) / 3;
      acc += L;
      wallBuf.v(ax, y0, az, nx, 0, nz, u0, 0); wallBuf.v(bx, y0, bz, nx, 0, nz, u1, 0); wallBuf.v(bx, y1, bz, nx, 0, nz, u1, v1);
      wallBuf.v(ax, y0, az, nx, 0, nz, u0, 0); wallBuf.v(bx, y1, bz, nx, 0, nz, u1, v1); wallBuf.v(ax, y1, az, nx, 0, nz, u0, v1);
    }
    for (const [a, b2, c] of triangulate(p)) roofBuf.v(p[2 * a], y1, p[2 * a + 1], 0, 1, 0), roofBuf.v(p[2 * b2], y1, p[2 * b2 + 1], 0, 1, 0), roofBuf.v(p[2 * c], y1, p[2 * c + 1], 0, 1, 0);
    addPolyCollider(p, y1);
    drawn.push(b);
  });
  const facadeMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.day, emissive: 0xffffff, emissiveMap: tex.night, emissiveIntensity: 0 });
  const walls = wallBuf.mesh(facadeMat);
  const roofs = roofBuf.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const m of [walls, roofs]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  const insideBuilding = (x, z, pad = 0) => {
    let hit = false;
    colliders.query(x, z, pad, o => {
      if (o.circle) return;
      if (pointInPoly(o.p, x, z) || (pad > 0 && closestOnPoly(o.p, x, z).d < pad)) { hit = true; return false; }
    });
    return hit;
  };

  // 담벼락: 아파트 단지·학교 경계를 따라 세우되, 길(차도·골목·보행로)이 지나는 곳은 문으로 비운다
  const fenceBuf = new Buf();
  let wallLen = 0;
  // 담장 한 구간 (x0,z0)→(x1,z1): 양면 + 갓돌, 그리고 충돌용 얇은 사각형
  function wallRun(x0, z0, x1, z1, H, color, cap) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.1) return;
    if (L > 8 && (inHill(x0, z0) || inHill(x1, z1))) {              // 비탈에서는 땅을 따라가도록 잘게
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      wallRun(x0, z0, mx, mz, H, color, cap); wallRun(mx, mz, x1, z1, H, color, cap);
      return;
    }
    const nx = -(z1 - z0) / L, nz = (x1 - x0) / L, hw = 0.18, cw = 0.25;
    const b0 = T(x0, z0), b1 = T(x1, z1), t0 = b0 + H, t1 = b1 + H;
    fenceBuf.color(color);
    fenceBuf.quad4(x0 + nx * hw, z0 + nz * hw, x1 + nx * hw, z1 + nz * hw, b0 - 0.3, t0, b1 - 0.3, t1, nx, nz);
    fenceBuf.quad4(x1 - nx * hw, z1 - nz * hw, x0 - nx * hw, z0 - nz * hw, b1 - 0.3, t1, b0 - 0.3, t0, -nx, -nz);
    fenceBuf.color(cap);
    fenceBuf.v(x0 + nx * cw, t0, z0 + nz * cw, 0, 1, 0); fenceBuf.v(x1 + nx * cw, t1, z1 + nz * cw, 0, 1, 0); fenceBuf.v(x1 - nx * cw, t1, z1 - nz * cw, 0, 1, 0);
    fenceBuf.v(x0 + nx * cw, t0, z0 + nz * cw, 0, 1, 0); fenceBuf.v(x1 - nx * cw, t1, z1 - nz * cw, 0, 1, 0); fenceBuf.v(x0 - nx * cw, t0, z0 - nz * cw, 0, 1, 0);
    const cp = [x0 + nx * hw, z0 + nz * hw, x1 + nx * hw, z1 + nz * hw, x1 - nx * hw, z1 - nz * hw, x0 - nx * hw, z0 - nz * hw];
    colliders.insert({ p: cp, h: Math.max(t0, t1), ...bboxOf(cp) });
    wallLen += L;
  }
  for (const a of map.areas) {
    const st = WALLED_AREAS[a.k];
    if (!st || (skipPoly && a.p === skipPoly)) continue;          // 단대부고 캠퍼스 담장은 campus.js 가 옹벽으로 짓는다
    const p = insetRing(a.p, 5), n = p.length / 2;
    for (let e = 0; e < n; e++) {
      const ax = p[2 * e], az = p[2 * e + 1], bx = p[(2 * e + 2) % (2 * n)], bz = p[(2 * e + 3) % (2 * n)];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.2) continue;
      // 3m 칸으로 나눠 길·건물이 지나는 칸(문)만 빼고, 남은 칸은 이어 붙여 한 구간으로 그린다
      const ux = (bx - ax) / L, uz = (bz - az) / L, pieces = Math.max(1, Math.ceil(L / 3));
      let runStart = -1;
      const flush = endT => { if (runStart >= 0) wallRun(ax + ux * runStart, az + uz * runStart, ax + ux * endT, az + uz * endT, st.h, st.color, st.cap); runStart = -1; };
      for (let k = 0; k < pieces; k++) {
        const t0 = k / pieces * L, t1 = (k + 1) / pieces * L, mx = ax + ux * (t0 + t1) / 2, mz = az + uz * (t0 + t1) / 2;
        // 길이 지나는 칸(단지 출입구·보행로)과 건물이 걸친 칸은 문으로 비운다
        if (!inB(mx, mz) || onAnyRoad(mx, mz, 1.2) || insideBuilding(mx, mz, 0.3)) { flush(t0); continue; }
        if (runStart < 0) runStart = t0;
      }
      flush(L);
    }
  }
  for (const w of map.walls || []) {                               // OSM 에 직접 그려진 담장
    for (let i = 0; i < w.p.length - 2; i += 2)
      wallRun(w.p[i], w.p[i + 1], w.p[i + 2], w.p[i + 3], w.h, w.k === 'hedge' ? 0x5f9e4f : 0xc9c3b7, w.k === 'hedge' ? 0x4f8d45 : 0x8e8a80);
  }
  const fences = fenceBuf.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  fences.receiveShadow = true;           // 얇고 낮아 그림자는 생략 (그림자 패스 부담)
  scene.add(fences);

  // 나무: 공원 안 + 큰길 가로수
  const blockers = map.areas.filter(a => NO_TREE.has(a.k)).map(a => ({ p: a.p, ...bboxOf(a.p) }));
  const blockedByArea = (x, z) => blockers.some(a => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ && pointInPoly(a.p, x, z));
  const trees = [];
  for (const a of map.areas) {
    const dens = TREE_DENSITY[a.k];
    if (!dens) continue;
    const bb = bboxOf(a.p), want = Math.min(500, Math.floor(Math.abs(signedArea(a.p)) / dens));
    for (let got = 0, tries = 0; got < want && tries < want * 4; tries++) {
      const x = bb.minX + rnd() * (bb.maxX - bb.minX), z = bb.minZ + rnd() * (bb.maxZ - bb.minZ);
      if (!inB(x, z) || !pointInPoly(a.p, x, z) || insideBuilding(x, z, 2) || blockedByArea(x, z)) continue;
      trees.push(x, z, 0.75 + rnd() * 0.6);
      got++;
    }
  }
  for (const r of map.roads) {
    if (r.w < 10 || r.k === 'waterway') continue;
    alongLine(r.p, 14, 6, (px, pz, nx, nz) => {
      for (const side of [-1, 1]) {
        const x = px + nx * side * (r.w / 2 + 1.7), z = pz + nz * side * (r.w / 2 + 1.7);
        if (inB(x, z) && !insideBuilding(x, z, 2)) trees.push(x, z, 0.85 + rnd() * 0.35);
      }
    });
  }
  const treeCount = Math.min(trees.length / 3, 8000);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6).translate(0, 1.2, 0),
    new THREE.MeshLambertMaterial({ color: 0x7a5a3f }), treeCount);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.9, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), treeCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < treeCount; i++) {
    const x = trees[3 * i], z = trees[3 * i + 1], s = trees[3 * i + 2];
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    m4.compose(v3.set(x, T(x, z), z), q, sc.set(s, s * (0.85 + rnd() * 0.35), s));
    trunks.setMatrixAt(i, m4);
    crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, _c.setHex(pick(GREENS, rnd())));
    colliders.insert({ circle: true, x, z, r: 0.3 * s, h: T(x, z) + 3, minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
  }
  for (const m of [trunks, crowns]) { m.castShadow = true; m.computeBoundingSphere(); scene.add(m); }

  // 가로등: 차가 다니는 도로 양쪽 인도에 28m 간격. 수백 개라 InstancedMesh + Points(글로우), 재질은 공유
  const lampSpots = [];
  const lampHere = (x, z, face) => { if (inB(x, z) && !insideBuilding(x, z, 1.2) && !onAnyRoad(x, z, 0.6)) lampSpots.push(x, z, face); };
  for (const l of map.lamps || []) lampHere(l.x, l.z, 0);
  for (const r of driveRoads) {
    if (r.w < 7) continue;
    alongLine(r.p, 32, 16, (px, pz, nx, nz) => {
      for (const side of [-1, 1]) lampHere(px + nx * side * (r.w / 2 + 1.4), pz + nz * side * (r.w / 2 + 1.4), Math.atan2(-nx * side, -nz * side));
    });
  }
  const lampCount = Math.min(lampSpots.length / 3, 1200);
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 4.6, 6).translate(0, 2.3, 0);
  const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 5).rotateZ(Math.PI / 2).translate(0.75, 4.6, 0);
  const headGeo = new THREE.CylinderGeometry(0.4, 0.55, 0.9, 8).translate(1.45, 4.55, 0);
  const poolGeo = new THREE.CircleGeometry(3.6, 12).rotateX(-Math.PI / 2).translate(1.45, 0.06, 0);
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe6a8, emissive: 0xffcf6a, emissiveIntensity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffdf9e, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poles = new THREE.InstancedMesh(poleGeo, darkMat, lampCount), arms = new THREE.InstancedMesh(armGeo, darkMat, lampCount);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampCount), pools = new THREE.InstancedMesh(poolGeo, poolMat, lampCount);
  const glowPos = [];
  for (let i = 0; i < lampCount; i++) {
    const x = lampSpots[3 * i], z = lampSpots[3 * i + 1], face = lampSpots[3 * i + 2];
    const y = T(x, z);
    q.setFromAxisAngle(up, face);
    m4.compose(v3.set(x, y, z), q, sc.set(1, 1, 1));
    poles.setMatrixAt(i, m4); arms.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); pools.setMatrixAt(i, m4);
    glowPos.push(x + 1.45 * Math.cos(face), y + 4.5, z - 1.45 * Math.sin(face));
    colliders.insert({ circle: true, x, z, r: 0.2, h: y + 4.6, minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
  }
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
  const glowMat = new THREE.PointsMaterial({ map: glowTexture(), size: 3.2, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const glow = new THREE.Points(glowGeo, glowMat);
  scene.add(poles, arms, heads, pools, glow);

  const namedPois = map.pois.filter(p => p.n && p.k !== 'exit');

  // 미니맵 이미지 (1px = 1m)
  const mapImage = document.createElement('canvas');
  mapImage.width = Math.ceil(B.maxX - B.minX);
  mapImage.height = Math.ceil(B.maxZ - B.minZ);
  {
    const g = mapImage.getContext('2d');
    const path = p => { g.beginPath(); for (let i = 0; i < p.length; i += 2) g[i ? 'lineTo' : 'moveTo'](p[i] - B.minX, p[i + 1] - B.minZ); };
    g.fillStyle = '#ebe6da'; g.fillRect(0, 0, mapImage.width, mapImage.height);
    for (const a of areas) { g.fillStyle = css(AREA_STYLE[a.k][0]); path(a.p); g.closePath(); g.fill(); }
    g.lineCap = g.lineJoin = 'round';
    for (const r of roads) {
      g.strokeStyle = r.k === 'waterway' ? '#86bddb' : isMajor(r.k) ? '#fff1b8' : isFoot(r.k) ? '#f6f2ea' : '#ffffff';
      g.lineWidth = Math.max(1.5, r.w);
      path(r.p); g.stroke();
    }
    for (const b of map.buildings) {
      g.fillStyle = b.h >= 70 ? '#8fa3b5' : /school|university|kindergarten/.test(b.k) ? '#d6a882' : '#bdb4a6';
      path(b.p); g.closePath(); g.fill();
    }
  }

  return {
    bounds: B,
    mapImage,
    driveRoads,
    buildingCount: drawn.length,
    treeCount,
    lampCount,
    wallLen,

    addBoxCollider(minX, minZ, maxX, maxZ, h) { addPolyCollider([minX, minZ, maxX, minZ, maxX, maxZ, minX, maxZ], h); },

    // 밤 조명: night 0(낮) ~ 1(한밤)
    setNight(night) {
      facadeMat.emissiveIntensity = night * 0.95;
      headMat.emissiveIntensity = night * 1.5;
      glowMat.opacity = night * 0.75;
      poolMat.opacity = night * 0.3;
      glow.visible = pools.visible = night > 0.02;     // 낮에는 아예 그리지 않음 (반투명 원반 수백 개는 채우기 부담)
    },

    y: (x, z) => T(x, z),
    colliders,
    addCollider(o) { colliders.insert(o); },

    // pos(x,y,z)를 반지름 R 원으로 보고 건물·담장·나무 밖으로 밀어낸다 (y 가 지붕보다 높으면 통과)
    collide(pos, R) {
      for (let pass = 0; pass < 2; pass++) {
        colliders.query(pos.x, pos.z, R, o => {
          if (pos.y >= o.h - 0.05) return;
          if (o.circle) {
            const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + R;
            if (d < m && d > 1e-6) { pos.x = o.x + dx / d * m; pos.z = o.z + dz / d * m; }
            return;
          }
          const inside = pointInPoly(o.p, pos.x, pos.z);
          const { qx, qz, d } = closestOnPoly(o.p, pos.x, pos.z);
          if (d < 1e-6) return;
          if (inside) { pos.x = qx + (qx - pos.x) / d * R; pos.z = qz + (qz - pos.z) / d * R; }
          else if (d < R) { pos.x = qx + (pos.x - qx) / d * R; pos.z = qz + (pos.z - qz) / d * R; }
        });
      }
      pos.x = Math.min(B.maxX - 2, Math.max(B.minX + 2, pos.x));
      pos.z = Math.min(B.maxZ - 2, Math.max(B.minZ + 2, pos.z));
    },

    solidAt(x, y, z) {
      let hit = false;
      colliders.query(x, z, 0, o => {
        if (!o.circle && y < o.h && pointInPoly(o.p, x, z)) { hit = true; return false; }
      });
      return hit;
    },

    insideBuilding,
    onAnyRoad,

    // (x,z) 근처에서 건물·도로와 r 이상 떨어진 빈자리
    findOpenSpot(x, z, r, maxR = 60) {
      for (let R = 0; R <= maxR; R += 3) {
        const steps = R ? Math.max(6, Math.round(R * 2)) : 1;
        for (let s = 0; s < steps; s++) {
          const ang = s / steps * Math.PI * 2, px = x + Math.cos(ang) * R, pz = z + Math.sin(ang) * R;
          if (inB(px, pz, 5) && !insideBuilding(px, pz, r) && !onAnyRoad(px, pz, r)) return { x: px, z: pz };
        }
      }
      return { x, z };
    },

    roadAt(x, z) {
      let best = null;
      roadGrid.query(x, z, 0, o => {
        if (segDist(x, z, o.ax, o.az, o.bx, o.bz) < o.w / 2 + 2.5 && (!best || o.w > best.w)) best = o;
      });
      return best?.n ?? null;
    },

    poisNear(x, z, r, max = 3) {
      return namedPois
        .map(p => ({ p, d: Math.hypot(p.x - x, p.z - z) }))
        .filter(o => o.d < r)
        .sort((a, b) => a.d - b.d)
        .slice(0, max)
        .map(o => o.p);
    },
  };
}
