// data/osm-raw.json(Overpass 원본) → data/map.json(게임용, 미터 단위 로컬 좌표)
// 좌표계: 원점 = 단대부고, +x = 동쪽, +z = 남쪽, y = 높이.   실행: node tools/build-map.mjs
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync(new URL('../data/osm-raw.json', import.meta.url), 'utf8'));
const ORIGIN = { lat: 37.49556, lon: 127.05647, name: '단대부고' };
const KX = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
const KZ = 110574;
const xz = (lat, lon) => [(lon - ORIGIN.lon) * KX, -(lat - ORIGIN.lat) * KZ];
const r1 = v => Math.round(v * 10) / 10;
const frac = v => v - Math.floor(v);

const [S, W, N, E] = raw.bbox;
const [minX, maxZ] = xz(S, W);
const [maxX, minZ] = xz(N, E);
const inBounds = (x, z, m = 0) => x >= minX - m && x <= maxX + m && z >= minZ - m && z <= maxZ + m;
const same = (a, b) => a.lat === b.lat && a.lon === b.lon;

function ringFlat(geom) {
  const g = geom.length > 1 && same(geom[0], geom[geom.length - 1]) ? geom.slice(0, -1) : geom;
  const f = [];
  for (const pt of g) {
    const [x, z] = xz(pt.lat, pt.lon);
    const n = f.length;
    if (n && Math.hypot(x - f[n - 2], z - f[n - 1]) < 0.3) continue;
    f.push(x, z);
  }
  if (f.length >= 4 && Math.hypot(f[0] - f[f.length - 2], f[1] - f[f.length - 1]) < 0.3) f.length -= 2;
  return f.length >= 6 ? f : null;
}
function area(f) {
  let a = 0;
  const n = f.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += f[2 * i] * f[2 * j + 1] - f[2 * j] * f[2 * i + 1]; }
  return Math.abs(a) / 2;
}
function centroid(f) {
  let x = 0, z = 0;
  for (let i = 0; i < f.length; i += 2) { x += f[i]; z += f[i + 1]; }
  return [x / (f.length / 2), z / (f.length / 2)];
}

// 멀티폴리곤 relation 의 outer 조각들을 닫힌 링으로 이어 붙인다
function outerRings(rel) {
  const segs = (rel.members || [])
    .filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry?.length > 1 && m.geometry.every(Boolean))
    .map(m => m.geometry.slice());
  const rings = [];
  while (segs.length) {
    let cur = segs.shift();
    for (let guard = 0; !same(cur[0], cur[cur.length - 1]) && guard < 500; guard++) {
      const end = cur[cur.length - 1];
      const i = segs.findIndex(s => same(s[0], end) || same(s[s.length - 1], end));
      if (i < 0) break;
      const s = segs.splice(i, 1)[0];
      cur = cur.concat(same(s[0], end) ? s.slice(1) : s.reverse().slice(1));
    }
    if (cur.length > 3 && same(cur[0], cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

function buildingHeight(t, a, id) {
  const h = num(t.height);
  if (h && h > 2) return h;
  const lv = num(t['building:levels']);
  if (lv && lv > 0) return lv * 3 + 1;
  const r = frac(Math.sin(id) * 43758.5453);
  switch (t.building) {
    case 'apartments': return 38 + r * 14;
    case 'house': case 'detached': return 7 + r * 3;
    case 'school': case 'university': case 'college': return 14 + r * 5;
    case 'kindergarten': return 7;
    case 'church': return 13 + r * 6;
    case 'garage': case 'garages': case 'shed': case 'kiosk': case 'roof': case 'hut': return 3.5;
    case 'hospital': return 28 + r * 10;
    case 'commercial': case 'retail': case 'office': return a > 1500 ? 30 + r * 25 : 14 + r * 10;
  }
  if (a < 80) return 6 + r * 3;
  if (a < 300) return 10 + r * 6;
  if (a < 1200) return 14 + r * 12;
  return 22 + r * 20;
}

const ROAD_W = {
  motorway: 26, trunk: 26, primary: 22, secondary: 16, tertiary: 11, unclassified: 7, residential: 7,
  living_street: 6, service: 5, pedestrian: 5, track: 4, footway: 2.5, path: 2.2, cycleway: 2.5, steps: 2.4,
};
function roadWidth(t) {
  const w = num(t.width);
  if (w && w > 1 && w < 60) return w;
  const lanes = num(t.lanes);
  if (lanes && /trunk|primary|secondary|tertiary/.test(t.highway)) return lanes * 3.3 + 1.5;
  if (t.highway.endsWith('_link')) return 8;
  return ROAD_W[t.highway] ?? 0;
}

function areaKind(t) {
  if (t.natural === 'water') return 'water';
  if (t.leisure === 'park') return 'park';
  if (t.leisure === 'garden') return 'garden';
  if (t.leisure === 'pitch' || t.leisure === 'track') return 'pitch';
  if (t.leisure === 'playground') return 'playground';
  if (/^(school|university|college|kindergarten)$/.test(t.amenity ?? '') || t.landuse === 'education') return 'school';
  if (t.amenity === 'parking') return 'parking';
  if (t.natural === 'wood' || t.natural === 'scrub' || t.landuse === 'forest') return 'wood';
  if (t.landuse === 'grass' || t.landuse === 'recreation_ground') return 'grass';
  if (t.landuse === 'residential') return 'residential';
  if (t.landuse === 'commercial') return 'commercial';
  if (t.highway === 'pedestrian' && t.area === 'yes') return 'plaza';
  return null;
}

const out = {
  origin: ORIGIN,
  bounds: { minX: r1(minX), maxX: r1(maxX), minZ: r1(minZ), maxZ: r1(maxZ) },
  attribution: '© OpenStreetMap contributors (ODbL)',
  buildings: [], roads: [], areas: [], pois: [],
  walls: [],        // 담벼락·울타리 폴리라인 {p, k(wall|fence|hedge), h}
  bikeParking: [],  // 자전거 거치대 {x, z, n(대수)}
  lamps: [],        // OSM 에 찍힌 가로등 위치 {x, z}
};

// 이전 map.json 의 스트릿뷰 확인값(sv)은 도로 종류 + 첫 두 점으로 이어 붙여 보존 (재수집해도 다시 확인할 필요 없음)
const prevSv = new Map();
try {
  const prev = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url), 'utf8'));
  for (const r of prev.roads) if (r.sv !== undefined) prevSv.set(r.k + '|' + r.p.slice(0, 4).join(','), r.sv);
} catch { /* 첫 실행 */ }

for (const e of raw.elements) {
  const t = e.tags || {};

  if (e.type === 'node') {
    const [x, z] = xz(e.lat, e.lon);
    if (!inBounds(x, z)) continue;
    if (t.amenity === 'bicycle_parking') { out.bikeParking.push({ x: r1(x), z: r1(z), n: num(t.capacity) || 6 }); continue; }
    if (t.highway === 'street_lamp') { out.lamps.push({ x: r1(x), z: r1(z) }); continue; }
    const kind = t.railway === 'subway_entrance' ? 'exit' : t.railway === 'station' ? 'station' : t.shop ? 'shop' : t.amenity || t.tourism;
    if (!kind || (!t.name && kind !== 'exit')) continue;
    out.pois.push({ x: r1(x), z: r1(z), k: kind, n: t.name || t.ref || '' });
    continue;
  }

  const geom = e.geometry;
  const closed = e.type === 'way' && geom?.length > 3 && same(geom[0], geom[geom.length - 1]);
  const rings = e.type === 'relation' ? outerRings(e) : closed ? [geom] : [];

  if (t.amenity === 'bicycle_parking' && rings.length) {
    const f = ringFlat(rings[0]);
    if (f) { const [cx, cz] = centroid(f); if (inBounds(cx, cz)) out.bikeParking.push({ x: r1(cx), z: r1(cz), n: num(t.capacity) || 8 }); }
    continue;
  }

  if (t.barrier && e.type === 'way' && geom && !t.building) {
    const k = /fence|guard_rail/.test(t.barrier) ? 'fence' : t.barrier === 'hedge' ? 'hedge' : 'wall';
    const h = Math.min(3, Math.max(0.6, num(t.height) || (k === 'hedge' ? 1.2 : k === 'fence' ? 1.5 : 1.8)));
    let run = [];
    const flush = () => { if (run.length >= 4) out.walls.push({ p: run.map(r1), k, h: r1(h) }); run = []; };
    for (const pt of geom) { const [x, z] = xz(pt.lat, pt.lon); if (inBounds(x, z, 30)) run.push(x, z); else flush(); }
    flush();
    continue;
  }

  if (t.building) {
    for (const g of rings) {
      const f = ringFlat(g);
      if (!f) continue;
      const [cx, cz] = centroid(f);
      const a = area(f);
      if (!inBounds(cx, cz) || a < 8) continue;
      out.buildings.push({ p: f.map(r1), h: r1(buildingHeight(t, a, e.id)), k: t.building, ...(t.name && { n: t.name }) });
    }
    continue;
  }

  const ak = areaKind(t);
  if (ak && rings.length && !(t.highway && t.area !== 'yes')) {
    for (const g of rings) {
      const f = ringFlat(g);
      if (!f) continue;
      const [cx, cz] = centroid(f);
      if (!inBounds(cx, cz, 400)) continue;
      out.areas.push({ p: f.map(r1), k: ak, ...(t.name && { n: t.name }) });
    }
    continue;
  }

  if (e.type === 'way' && geom && (t.highway || t.waterway)) {
    if (t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage') continue;
    if (t.highway && /proposed|construction|platform|elevator|corridor|bus_stop|raceway/.test(t.highway)) continue;
    const w = t.waterway
      ? (num(t.width) || (t.waterway === 'river' ? 20 : t.waterway === 'stream' ? 6 : 3))
      : roadWidth(t);
    if (!w) continue;
    const k = t.waterway ? 'waterway' : t.highway;
    const extra = { ...(t.name && { n: t.name }), ...(t.oneway === 'yes' && { o: 1 }) };
    let run = [];
    const flush = () => {
      if (run.length >= 4) {
        const p = run.map(r1), sv = prevSv.get(k + '|' + p.slice(0, 4).join(','));
        out.roads.push({ p, w: r1(w), k, ...extra, ...(sv !== undefined && { sv }) });
      }
      run = [];
    };
    for (const pt of geom) {
      const [x, z] = xz(pt.lat, pt.lon);
      if (inBounds(x, z, 60)) run.push(x, z); else flush();
    }
    flush();
  }
}

const file = new URL('../data/map.json', import.meta.url);
fs.writeFileSync(file, JSON.stringify(out));
const kb = (fs.statSync(file).size / 1024).toFixed(0);
const svCount = out.roads.filter(r => r.sv !== undefined).length;
console.log(`건물 ${out.buildings.length} · 도로 ${out.roads.length} (스트릿뷰 확인 ${svCount}) · 구역 ${out.areas.length} · POI ${out.pois.length} · 담벼락 ${out.walls.length} · 자전거 거치대 ${out.bikeParking.length} · 가로등 ${out.lamps.length}`);
console.log(`영역 ${r1(maxX - minX)}m × ${r1(maxZ - minZ)}m → data/map.json (${kb} KB)`);
