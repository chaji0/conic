// 자동차(스트릿뷰 도로망 주행)와 세워 둔 자전거 — 전부 InstancedMesh 로 그려 드로우콜을 최소화한다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

// 부품 지오메트리에 색을 정점색으로 굽고 위치·회전·크기를 적용한다
function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  geo = geo.toNonIndexed();
  _c.setHex(color);
  const n = geo.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[3 * i] = _c.r; col[3 * i + 1] = _c.g; col[3 * i + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  _q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  geo.applyMatrix4(_m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2])));
  return geo;
}
const merged = parts => mergeGeometries(parts, false);
const vcMat = extra => new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });

// ---------- 자동차 (앞 = +x) ----------
function carGeometries() {
  const white = 0xffffff;                                   // 인스턴스 색으로 칠해지는 부분은 흰색으로 굽는다
  const body = merged([
    part(new THREE.BoxGeometry(3.6, 1.0, 1.8), white, [0, 0.85, 0]),
    part(new THREE.BoxGeometry(1.9, 0.75, 1.6), white, [-0.2, 1.55, 0]),
  ]);
  const wheels = [[-1.15, -0.85], [-1.15, 0.85], [1.15, -0.85], [1.15, 0.85]]
    .map(([x, z]) => part(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14), 0x1c1c1c, [x, 0.42, z], [Math.PI / 2, 0, 0]));
  const parts = merged([
    ...wheels,
    part(new THREE.BoxGeometry(1.7, 0.6, 1.5), 0x9fd0ec, [-0.2, 1.6, 0]),                       // 창문
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), 0xfff3c4, [1.82, 0.85, -0.6], [0, 0, Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), 0xfff3c4, [1.82, 0.85, 0.6], [0, 0, Math.PI / 2]),
    part(new THREE.BoxGeometry(0.1, 0.22, 0.35), 0xd3372f, [-1.82, 0.85, -0.6]),
    part(new THREE.BoxGeometry(0.1, 0.22, 0.35), 0xd3372f, [-1.82, 0.85, 0.6]),
    part(new THREE.BoxGeometry(0.12, 0.08, 1.4), 0x2a2f38, [1.85, 0.5, 0]),
  ]);
  const beamGeo = new THREE.ConeGeometry(0.9, 6, 14, 1, true);
  beamGeo.rotateZ(-Math.PI / 2); beamGeo.translate(4.8, 0.7, 0);
  const beams = mergeGeometries([beamGeo.clone().translate(0, 0, -0.6), beamGeo.clone().translate(0, 0, 0.6)], false);
  return { body, parts, beams };
}

const CAR_COLORS = [0xd3372f, 0x2f6fd3, 0xf2c14e, 0x3fae5e, 0x9b59b6, 0xf4f4f4, 0x2b2f36, 0xff8c4d, 0x2ec4b6, 0xbfc6cf];

// 스트릿뷰로 갈 수 있는 도로만으로 도로망 그래프를 만든다 (일방통행은 한 방향 간선만)
function buildGraph(roads) {
  const nodes = new Map(), list = [];
  const nodeAt = (x, z) => {
    const k = Math.round(x * 2) + '|' + Math.round(z * 2);
    let n = nodes.get(k);
    if (!n) { n = { x, z, out: [] }; nodes.set(k, n); list.push(n); }
    return n;
  };
  for (const r of roads) {
    const lane = Math.max(1.8, Math.min(3.2, r.w / 4));
    for (let i = 0; i < r.p.length - 2; i += 2) {
      const a = nodeAt(r.p[i], r.p[i + 1]), b = nodeAt(r.p[i + 2], r.p[i + 3]);
      if (a === b) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      a.out.push({ to: b, len, lane });
      if (!r.o) b.out.push({ to: a, len, lane });
    }
  }
  return list.filter(n => n.out.length);
}
// 교차로에서 다음 길: 왔던 길은 피하고 직진을 조금 선호하되 무작위
function pickNext(node, from, fx, fz) {
  let opts = node.out.filter(e => e.to !== from);
  if (!opts.length) opts = node.out;
  let best = null, bs = -Infinity;
  for (const e of opts) {
    const dx = e.to.x - node.x, dz = e.to.z - node.z, L = Math.hypot(dx, dz) || 1;
    const s = (dx * fx + dz * fz) / L + Math.random() * 1.4;
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}

export function createCars(scene, driveRoads, count = 14, terrainY = () => 0) {
  const graph = buildGraph(driveRoads);
  const n = graph.length ? count : 0;
  const g = carGeometries();
  const body = new THREE.InstancedMesh(g.body, vcMat({}), n);
  const parts = new THREE.InstancedMesh(g.parts, vcMat({}), n);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beams = new THREE.InstancedMesh(g.beams, beamMat, n);
  body.castShadow = parts.castShadow = true;
  scene.add(body, parts, beams);

  const cars = [];
  for (let i = 0; i < n; i++) {
    const node = graph[Math.floor(Math.random() * graph.length)];
    const edge = node.out[Math.floor(Math.random() * node.out.length)];
    cars.push({ node, edge, prev: null, t: Math.random(), speed: 7 + Math.random() * 3, offX: 0, offZ: 0, yaw: 0, init: false });
    body.setColorAt(i, _c.setHex(CAR_COLORS[i % CAR_COLORS.length]));
  }
  body.instanceColor && (body.instanceColor.needsUpdate = true);
  const up = new THREE.Vector3(0, 1, 0);

  function update(dt) {
    for (let i = 0; i < n; i++) {
      const c = cars[i];
      let a = c.node, e = c.edge;
      if (!e) continue;
      c.t += c.speed * dt / (e.len || 0.001);
      if (c.t >= 1) {
        const fx = (e.to.x - a.x) / (e.len || 1), fz = (e.to.z - a.z) / (e.len || 1);
        const next = pickNext(e.to, a, fx, fz);
        c.prev = a; c.node = e.to; c.edge = next; c.t = 0;
        if (!next) continue;
        a = e.to; e = next;
      }
      const b = e.to, t = c.t;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const sdx = b.x - a.x, sdz = b.z - a.z, sl = Math.hypot(sdx, sdz) || 0.001;
      const fx = sdx / sl, fz = sdz / sl;
      const tgtX = -fz * e.lane, tgtZ = fx * e.lane;           // 우측통행: 진행 방향의 오른쪽으로 차선만큼
      const k = c.init ? 1 - Math.pow(1e-7, dt) : 1;
      c.offX += (tgtX - c.offX) * k; c.offZ += (tgtZ - c.offZ) * k;
      const yaw = Math.atan2(sdx, sdz) - Math.PI / 2;
      c.yaw = c.init ? c.yaw + (((yaw - c.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * k : yaw;
      c.init = true;
      _q.setFromAxisAngle(up, c.yaw);
      const cx = x + c.offX, cz = z + c.offZ;
      _m.compose(_p.set(cx, terrainY(cx, cz), cz), _q, _s.set(1, 1, 1));
      body.setMatrixAt(i, _m); parts.setMatrixAt(i, _m); beams.setMatrixAt(i, _m);
    }
    body.instanceMatrix.needsUpdate = parts.instanceMatrix.needsUpdate = beams.instanceMatrix.needsUpdate = true;
  }
  // night: 0(낮) ~ 1(한밤)
  function setNight(night) { beamMat.opacity = night * 0.22; beams.visible = night > 0.02; }
  return { update, setNight, count: n, graph };
}

// ---------- 세워 둔 자전거 (앞 = +x) ----------
function bikeGeometries() {
  const white = 0xffffff;
  const frame = merged([
    part(new THREE.BoxGeometry(1.05, 0.07, 0.07), white, [0, 0.78, 0], [0, 0, 0.06]),
    part(new THREE.BoxGeometry(0.07, 0.55, 0.07), white, [-0.42, 0.6, 0], [0, 0, -0.35]),
    part(new THREE.BoxGeometry(0.07, 0.62, 0.07), white, [0.34, 0.6, 0], [0, 0, 0.3]),
    part(new THREE.BoxGeometry(0.62, 0.06, 0.06), white, [-0.32, 0.45, 0]),
  ]);
  const wheel = wx => [
    part(new THREE.TorusGeometry(0.42, 0.06, 6, 18), 0x1b1b1b, [wx, 0.42, 0]),
    part(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 14), 0xd6dbe2, [wx, 0.42, 0], [Math.PI / 2, 0, 0]),
  ];
  const parts = merged([
    ...wheel(-0.62), ...wheel(0.62),
    part(new THREE.BoxGeometry(0.3, 0.09, 0.16), 0x22262e, [-0.4, 0.92, 0]),
    part(new THREE.BoxGeometry(0.06, 0.42, 0.06), 0x3a3f48, [0.52, 0.98, 0]),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.62, 8), 0x22262e, [0.52, 1.18, 0], [Math.PI / 2, 0, 0]),
    part(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10), 0x2e3440, [0, 0.34, 0], [Math.PI / 2, 0, 0]),
    part(new THREE.BoxGeometry(0.06, 0.5, 0.06), 0x8d949e, [0, 0.25, -0.55]),                  // 거치대 기둥
  ]);
  return { frame, parts };
}
const BIKE_COLORS = [0x2f6fd3, 0xd3372f, 0x3fae5e, 0xf2c14e, 0x9b59b6, 0x2ec4b6, 0xff8c4d, 0x5a6b8a];

// spots: [{x, z, yaw, count}] — 각 거치대에 count 대를 옆으로 2.2m 간격으로 세운다
export function createBikes(scene, spots, terrainY = () => 0) {
  const list = [];
  for (const s of spots) for (let i = 0; i < s.count; i++) {
    const side = (i - (s.count - 1) / 2) * 1.0;          // 거치대 안에서 옆으로 1m 간격 (앞바퀴 방향 = yaw)
    list.push({ x: s.x + Math.cos(s.yaw) * side, z: s.z - Math.sin(s.yaw) * side, yaw: s.yaw + Math.PI / 2 });
  }
  const n = list.length;
  if (!n) return { count: 0 };
  const g = bikeGeometries();
  const frame = new THREE.InstancedMesh(g.frame, vcMat({}), n);
  const parts = new THREE.InstancedMesh(g.parts, vcMat({}), n);
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((b, i) => {
    _q.setFromAxisAngle(up, b.yaw);
    _m.compose(_p.set(b.x, terrainY(b.x, b.z), b.z), _q, _s.set(1, 1, 1));
    frame.setMatrixAt(i, _m); parts.setMatrixAt(i, _m);
    frame.setColorAt(i, _c.setHex(BIKE_COLORS[i % BIKE_COLORS.length]));
  });
  frame.castShadow = parts.castShadow = true;
  scene.add(frame, parts);
  return { count: n, list };
}
