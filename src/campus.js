// 단대부고 캠퍼스와 학교 올라가는 길(도곡로64길) — 이 구역만 손으로 정밀하게 짓는다.
// 참고 이미지: 빨간 벽돌 본관(흰 띠·정면 현관·계단·앞마당), 흰 체육관(파란 지붕), 초록 지붕 별관, 흙 운동장 + 농구장,
// 주차장, 옹벽 + 초록 펜스가 있는 오르막 진입로, 볼라드, 횡단보도, 벚나무, KB국민은행, 돌기둥 정문.
import * as THREE from 'three';
import { Buf, fillPoly, pointInPoly } from './world.js';
import { STEP } from './terrain.js';

const cen = p => { let x = 0, z = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; } return { x: x / (p.length / 2), z: z / (p.length / 2) }; };
const signedArea = p => { let a = 0; const n = p.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; } return a / 2; };
const reverse = p => { const r = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]); return r; };
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9); t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - ax - t * dx, z - az - t * dz); };

// 건물 이름별 외형
const STYLES = [
  { re: /부속고등학교$/, wall: 0xa8433a, band: 0xf1ebe0, roof: 0x6f6a66, glass: 0x2f4256, main: true },
  { re: /부속중학교/, wall: 0xb04c3f, band: 0xf1ebe0, roof: 0x6f6a66, glass: 0x2f4256 },
  { re: /소프트웨어/, wall: 0xc26a4a, band: 0xf4efe6, roof: 0x7a7470, glass: 0x33475c },
  { re: /체육관/, wall: 0xf1f1ee, band: 0xd9d9d4, roof: 0x2f5fa8, glass: 0x8fb4d9, gym: true },
  { re: /재능관/, wall: 0xe7dfcd, band: 0xf7f2e8, roof: 0x3f8f4a, glass: 0x33475c },
];
const DEFAULT_STYLE = { wall: 0xb8574a, band: 0xf1ebe0, roof: 0x6f6a66, glass: 0x2f4256 };

function textTexture(text, { w = 512, h = 128, bg = '#f4f1ea', fg = '#1e2a3a', font = 'bold 44px "Malgun Gothic","Apple SD Gothic Neo",sans-serif', lines = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ls = lines || [text];
  ls.forEach((t, i) => g.fillText(t, w / 2, h / 2 + (i - (ls.length - 1) / 2) * (h / (ls.length + 0.4))));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function board(w, h, tex, { double = false } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, side: double ? THREE.DoubleSide : THREE.FrontSide }));
  m.castShadow = false;
  return m;
}
function box(w, h, d, color, extra = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, ...extra }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildCampus(scene, world, map, terrain, { campus, gate, dirIn }) {
  const T = terrain.y;
  const solid = new Buf(), glassBuf = new Buf(), flatBuf = new Buf(), lineBuf = new Buf();
  const group = new THREE.Group();
  scene.add(group);
  const px = -dirIn.z, pz = dirIn.x;                       // 정문 방향에 수직 (좌우)
  const inCampus = (x, z) => pointInPoly(campus, x, z);
  const buildings = map.buildings.filter(b => { const c = cen(b.p); return inCampus(c.x, c.z); });
  const pitch = map.areas.find(a => a.k === 'pitch' && inCampus(cen(a.p).x, cen(a.p).z));
  const parkings = map.areas.filter(a => a.k === 'parking' && inCampus(cen(a.p).x, cen(a.p).z));
  const pitchC = pitch ? cen(pitch.p) : { x: gate.x + 40, z: gate.z - 50 };
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffd27a, emissiveIntensity: 0 });
  const nightMats = [glassMat];
  const TEL = { x: gate.x + dirIn.x * 40, z: gate.z + dirIn.z * 40 };   // 옥상 천문대로 올라가는 자리 (본관 현관 앞에서 갱신)
  const CLINIC = { x: gate.x - 40, z: gate.z - 110 };                      // 내과 (KB국민은행 건물) — 간판 자리에서 갱신

  // ---------- 건물 (벽돌 + 층마다 흰 띠 + 창문 + 옥상 계단탑) ----------
  for (const b of buildings) {
    let p = b.p;
    if (signedArea(p) > 0) p = reverse(p);
    const c = cen(p), st = STYLES.find(s => s.re.test(b.n || '')) || DEFAULT_STYLE;
    const base = T(c.x, c.z), floors = Math.max(1, Math.round(b.h / 3.7)), fh = b.h / floors, top = base + b.h;
    const n = p.length / 2;
    solid.color(st.wall);
    for (let e = 0; e < n; e++) {
      const ax = p[2 * e], az = p[2 * e + 1], bx = p[(2 * e + 2) % (2 * n)], bz = p[(2 * e + 3) % (2 * n)];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.3) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L, ux = (bx - ax) / L, uz = (bz - az) / L;
      solid.color(st.wall);
      solid.quad(ax, az, bx, bz, base - 3, top, nx, nz);
      // 층 사이 흰 띠 (벽에서 6cm 튀어나옴)
      for (let f = 1; f <= floors; f++) {
        const y = base + f * fh - 0.25;
        solid.color(st.band);
        solid.quad(ax + nx * 0.06, az + nz * 0.06, bx + nx * 0.06, bz + nz * 0.06, y, y + 0.32, nx, nz);
      }
      // 창문: 층마다 2.6m 간격, 체육관은 위쪽 띠창
      if (st.gym) {
        for (let f = 0; f < floors; f++) {
          const y0 = base + f * fh + fh * 0.55, y1 = y0 + fh * 0.3;
          glassBuf.color(st.glass);
          glassBuf.quad(ax + ux * 1 + nx * 0.05, az + uz * 1 + nz * 0.05, bx - ux * 1 + nx * 0.05, bz - uz * 1 + nz * 0.05, y0, y1, nx, nz);
        }
      } else {
        const cnt = Math.floor((L - 1.2) / 2.6);
        for (let f = 0; f < floors; f++) for (let k = 0; k < cnt; k++) {
          const s0 = 0.6 + (L - 1.2 - cnt * 2.6) / 2 + k * 2.6 + 0.5, s1 = s0 + 1.6;
          const y0 = base + f * fh + 0.9, y1 = y0 + 1.5;
          glassBuf.color(st.glass);
          glassBuf.quad(ax + ux * s0 + nx * 0.05, az + uz * s0 + nz * 0.05, ax + ux * s1 + nx * 0.05, az + uz * s1 + nz * 0.05, y0, y1, nx, nz);
        }
      }
    }
    // 지붕 (체육관은 파란 지붕 + 능선, 재능관은 초록 지붕)
    solid.color(st.roof);
    const roofBuf = new Buf();
    for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(Array.from({ length: n }, (_, i) => new THREE.Vector2(p[2 * i], p[2 * i + 1])), []))
      solid.v(p[2 * i0], top, p[2 * i0 + 1], 0, 1, 0), solid.v(p[2 * i1], top, p[2 * i1 + 1], 0, 1, 0), solid.v(p[2 * i2], top, p[2 * i2 + 1], 0, 1, 0);
    // 난간(파라펫)
    solid.color(st.band);
    for (let e = 0; e < n; e++) {
      const ax = p[2 * e], az = p[2 * e + 1], bx = p[(2 * e + 2) % (2 * n)], bz = p[(2 * e + 3) % (2 * n)];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      solid.quad(ax, az, bx, bz, top, top + 0.9, nx, nz);
      solid.quad(bx - nx * 0.3, bz - nz * 0.3, ax - nx * 0.3, az - nz * 0.3, top, top + 0.9, -nx, -nz);
    }
    // 옥상 계단탑
    const tower = box(4.5, 3, 4.5, st.gym ? 0xd9d9d4 : st.wall);
    const cc = cen(p);
    tower.position.set(cc.x + (p[0] - cc.x) * 0.45, top + 1.5, cc.z + (p[1] - cc.z) * 0.45);
    group.add(tower);
    if (st.main) {                                             // 옥상 천문대: 반사망원경 (경통 + 삼각대) + 난간
      const tg = new THREE.Group(); tg.position.set(cc.x, top, cc.z);
      const pier = box(0.8, 1.6, 0.8, 0x39404e); pier.position.y = 0.8; tg.add(pier);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.6, 24), new THREE.MeshLambertMaterial({ color: 0x6e7c93 }));
      tube.rotation.x = Math.PI / 2 - 0.6; tube.position.set(0, 2.4, 0.4); tube.castShadow = true; tg.add(tube);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe9e4d8, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      dome.position.y = 0.2; tg.add(dome);
      const lbl = board(4.2, 1.0, textTexture('🔭 옥상 천문대', { bg: '#1e3a6e', fg: '#ffffff', font: 'bold 44px "Malgun Gothic",sans-serif', w: 420, h: 100 }), { double: true });
      lbl.position.y = 5.2; tg.add(lbl);
      lbl.material.emissive = new THREE.Color(0xffd166); lbl.material.emissiveMap = lbl.material.map;
      TEL.roofMat = lbl.material;
      group.add(tg);
    }
    if (st.gym) {                                                // 체육관 이름
      const s = board(10, 2.2, textTexture('체 육 관', { bg: '#f1f1ee', fg: '#3a4a5c', font: 'bold 70px "Malgun Gothic",sans-serif' }), { double: true });
      s.position.set(cc.x, top + 2.4, cc.z); s.rotation.y = Math.PI / 2; group.add(s);
    }

    // 본관: 운동장을 향한 면에 현관(기둥·차양·계단) + 앞마당 + 국기 게양대 + 간판
    if (st.main) {
      let best = null, bd = -Infinity;
      for (let e = 0; e < n; e++) {
        const ax = p[2 * e], az = p[2 * e + 1], bx = p[(2 * e + 2) % (2 * n)], bz = p[(2 * e + 3) % (2 * n)];
        const L = Math.hypot(bx - ax, bz - az); if (L < 12) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        const d = ((pitchC.x - mx) * nx + (pitchC.z - mz) * nz) / Math.hypot(pitchC.x - mx, pitchC.z - mz) + L / 200;
        if (d > bd) { bd = d; best = { mx, mz, nx, nz, ux: (bx - ax) / L, uz: (bz - az) / L, L }; }
      }
      if (best) {
        const { mx, mz, nx, nz, ux, uz } = best;
        const yaw = Math.atan2(nx, nz);
        const porch = new THREE.Group();
        porch.position.set(mx, base, mz); porch.rotation.y = yaw;
        const canopy = box(12, 0.5, 4.5, st.band); canopy.position.set(0, 4.3, 2.4); porch.add(canopy);
        for (const cx of [-5, -1.7, 1.7, 5]) { const col = box(0.5, 4.3, 0.5, st.band); col.position.set(cx, 2.15, 4.3); porch.add(col); }
        const door = box(4.5, 3.2, 0.2, 0x3a4c60); door.position.set(0, 1.6, 0.2); porch.add(door);
        for (let s = 0; s < 4; s++) { const step = box(16, 0.22, 1.1, 0xd8d3c8); step.position.set(0, 0.11 + s * 0.22, 5 + (3 - s) * 1.1); porch.add(step); }
        const sign = board(14, 1.4, textTexture('단국대학교사범대학부속고등학교', { bg: '#a8433a', fg: '#ffffff', font: 'bold 44px "Malgun Gothic",sans-serif' }));
        sign.position.set(0, b.h - 2.2, 0.12); porch.add(sign);
        group.add(porch);
        TEL.x = mx + nx * 9; TEL.z = mz + nz * 9;               // 현관 앞 = 옥상 천문대로 올라가는 자리
        const telSign = board(2.6, 0.7, textTexture('🔭 옥상 천문대 ↑', { bg: '#1e3a6e', fg: '#ffffff', font: 'bold 40px "Malgun Gothic",sans-serif', w: 360, h: 96 }), { double: true });
        telSign.position.set(mx + nx * 6.5 + ux * 5, base + 2.4, mz + nz * 6.5 + uz * 5); telSign.rotation.y = yaw; group.add(telSign);
        telSign.material.emissive = new THREE.Color(0xffd166); telSign.material.emissiveMap = telSign.material.map;   // 가까이 가면 반짝임
        TEL.signMat = telSign.material;
        const tp = box(0.1, 2.4, 0.1, 0x3a3f48); tp.position.set(mx + nx * 6.5 + ux * 5, base + 1.2, mz + nz * 6.5 + uz * 5); group.add(tp);
        // 앞마당 (밝은 포장) + 게양대
        flatBuf.color(0xe6e1d6);
        const fw = 30, fd = 22, ox = mx + nx * (fd / 2 + 5), oz = mz + nz * (fd / 2 + 5);
        const rect = [ox - ux * fw / 2 - nx * fd / 2, oz - uz * fw / 2 - nz * fd / 2, ox + ux * fw / 2 - nx * fd / 2, oz + uz * fw / 2 - nz * fd / 2,
          ox + ux * fw / 2 + nx * fd / 2, oz + uz * fw / 2 + nz * fd / 2, ox - ux * fw / 2 + nx * fd / 2, oz - uz * fw / 2 + nz * fd / 2];
        fillPoly(flatBuf, rect, 0.04);
        for (const s of [-4, 0, 4]) {
          const pole = box(0.12, 9, 0.12, 0xdddddd); const fx = mx + nx * 12 + ux * s, fz = mz + nz * 12 + uz * s;
          pole.position.set(fx, T(fx, fz) + 4.5, fz); group.add(pole);
          const flag = box(1.6, 1.0, 0.04, s === 0 ? 0xffffff : 0x2f5fa8); flag.position.set(fx + 0.85, T(fx, fz) + 8.4, fz); group.add(flag);
        }
        for (const s of [-9, 9]) {                                     // 벤치
          const bx2 = mx + nx * 15 + ux * s, bz2 = mz + nz * 15 + uz * s;
          const bench = box(1.8, 0.1, 0.5, 0x8b6b43); bench.position.set(bx2, T(bx2, bz2) + 0.45, bz2); bench.rotation.y = yaw; group.add(bench);
        }
      }
    }
  }

  // ---------- 운동장: 흙 바닥 + 흰 트랙선 + 농구장 + 초록 펜스 ----------
  if (pitch) {
    flatBuf.color(0xd6be86);
    fillPoly(flatBuf, pitch.p, 0.05);
    // 가장 긴 변 방향
    let bl = 0, ux = 1, uz = 0;
    const pp = pitch.p, pn = pp.length / 2;
    for (let e = 0; e < pn; e++) { const dx = pp[(2 * e + 2) % (2 * pn)] - pp[2 * e], dz = pp[(2 * e + 3) % (2 * pn)] - pp[2 * e + 1], L = Math.hypot(dx, dz); if (L > bl) { bl = L; ux = dx / L; uz = dz / L; } }
    const nx = -uz, nz = ux;
    const rect = (cx, cz, w, d) => [cx - ux * w / 2 - nx * d / 2, cz - uz * w / 2 - nz * d / 2, cx + ux * w / 2 - nx * d / 2, cz + uz * w / 2 - nz * d / 2,
      cx + ux * w / 2 + nx * d / 2, cz + uz * w / 2 + nz * d / 2, cx - ux * w / 2 + nx * d / 2, cz - uz * w / 2 + nz * d / 2];
    const ring = (cx, cz, w, d, t, y) => {   // 사각 테두리 선
      const o = rect(cx, cz, w, d), i = rect(cx, cz, w - 2 * t, d - 2 * t);
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        lineBuf.flatTri(y, o[2 * k], o[2 * k + 1], o[2 * k2], o[2 * k2 + 1], i[2 * k2], i[2 * k2 + 1]);
        lineBuf.flatTri(y, o[2 * k], o[2 * k + 1], i[2 * k2], i[2 * k2 + 1], i[2 * k], i[2 * k + 1]);
      }
    };
    // 축구장 라인
    lineBuf.color(0xffffff);
    ring(pitchC.x - ux * 8, pitchC.z - uz * 8, bl * 0.55, 36, 0.18, 0.07);
    // 농구장 (긴 변 끝 쪽)
    const bcx = pitchC.x + ux * (bl * 0.36), bcz = pitchC.z + uz * (bl * 0.36);
    flatBuf.color(0x4f9e5a); fillPoly(flatBuf, rect(bcx, bcz, 28, 15), 0.06);
    lineBuf.color(0xffffff); ring(bcx, bcz, 27, 14, 0.15, 0.08);
    for (const s of [-1, 1]) {                                     // 골대
      const hx = bcx + ux * s * 12.5, hz = bcz + uz * s * 12.5, y = T(hx, hz);
      const pole = box(0.15, 3.2, 0.15, 0x3a3f48); pole.position.set(hx, y + 1.6, hz); group.add(pole);
      const bb = box(1.8, 1.1, 0.06, 0xf4f4f4); bb.position.set(hx - ux * s * 0.6, y + 3.0, hz - uz * s * 0.6); bb.rotation.y = Math.atan2(ux, uz); group.add(bb);
    }
    // 펜스 (초록 그물 + 기둥), 운동장 둘레
    const fence = new Buf();
    for (let e = 0; e < pn; e++) {
      const ax = pp[2 * e], az = pp[2 * e + 1], bx = pp[(2 * e + 2) % (2 * pn)], bz = pp[(2 * e + 3) % (2 * pn)];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
      const fnx = -(bz - az) / L, fnz = (bx - ax) / L;
      const ya = T(ax, az), yb = T(bx, bz);
      fence.color(0x3f8f4a); fence.quad4(ax, az, bx, bz, ya + 0.1, ya + 3.2, yb + 0.1, yb + 3.2, fnx, fnz);
      for (let s = 0; s < L; s += 4) { const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L; const post = box(0.12, 3.4, 0.12, 0x556b5a); post.position.set(x, T(x, z) + 1.7, z); group.add(post); }
    }
    const fm = fence.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    group.add(fm);
  }

  // ---------- 주차장: 주차선 ----------
  lineBuf.color(0xffffff);
  for (const pk of parkings) {
    const p = pk.p, n = p.length / 2;
    let bl = 0, ux = 1, uz = 0, ax0 = p[0], az0 = p[1];
    for (let e = 0; e < n; e++) { const dx = p[(2 * e + 2) % (2 * n)] - p[2 * e], dz = p[(2 * e + 3) % (2 * n)] - p[2 * e + 1], L = Math.hypot(dx, dz); if (L > bl) { bl = L; ux = dx / L; uz = dz / L; ax0 = p[2 * e]; az0 = p[2 * e + 1]; } }
    const nx = -uz, nz = ux;
    for (let s = 1.5; s < bl; s += 2.5) {
      for (const side of [1, -1]) {
        const x0 = ax0 + ux * s, z0 = az0 + uz * s;
        for (let d = 0.5; d < 40; d += 0.5) {
          const x = x0 + nx * side * d, z = z0 + nz * side * d;
          if (!pointInPoly(p, x, z)) { if (d > 2) { const x1 = x0 + nx * side * 1, z1 = z0 + nz * side * 1, x2 = x0 + nx * side * Math.min(d - 0.5, 5.5), z2 = z0 + nz * side * Math.min(d - 0.5, 5.5); const w = 0.08; lineBuf.flatTri(0.05, x1 - ux * w, z1 - uz * w, x2 - ux * w, z2 - uz * w, x2 + ux * w, z2 + uz * w); lineBuf.flatTri(0.05, x1 - ux * w, z1 - uz * w, x2 + ux * w, z2 + uz * w, x1 + ux * w, z1 + uz * w); } break; }
        }
      }
    }
  }

  // ---------- 옹벽 + 초록 펜스 (캠퍼스 경계, 정문 쪽만 비움) ----------
  const wall = new Buf();
  const cn = campus.length / 2;
  for (let e = 0; e < cn; e++) {
    const ax = campus[2 * e], az = campus[2 * e + 1], bx = campus[(2 * e + 2) % (2 * cn)], bz = campus[(2 * e + 3) % (2 * cn)];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
    const outward = ((ax + bx) / 2 + nx - gate.x) * 0 + (pointInPoly(campus, (ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2) ? -1 : 1);
    const ox = nx * outward, oz = nz * outward;          // 바깥쪽 법선
    const pieces = Math.ceil(L / 3);
    for (let k = 0; k < pieces; k++) {
      const t0 = k / pieces * L, t1 = (k + 1) / pieces * L;
      const x0 = ax + ux * t0, z0 = az + uz * t0, x1 = ax + ux * t1, z1 = az + uz * t1, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (Math.hypot(mx - gate.x, mz - gate.z) < 7) continue;                                    // 정문
      if (world.onAnyRoad(mx + ox * 0.3, mz + oz * 0.3, 0.8) && !world.onAnyRoad(mx + ox * 4, mz + oz * 4, 0)) { /* 경계가 길 위 */ }
      const yo0 = T(x0 + ox * 1.5, z0 + oz * 1.5), yo1 = T(x1 + ox * 1.5, z1 + oz * 1.5);
      const yi0 = T(x0 - ox * 1.5, z0 - oz * 1.5), yi1 = T(x1 - ox * 1.5, z1 - oz * 1.5);
      const top0 = Math.max(yi0, yo0) + 0.3, top1 = Math.max(yi1, yo1) + 0.3;
      wall.color(0xc9c3b7);                                                                          // 콘크리트 옹벽 (바깥면)
      wall.quad4(x0 + ox * 0.3, z0 + oz * 0.3, x1 + ox * 0.3, z1 + oz * 0.3, yo0 - 0.5, top0, yo1 - 0.5, top1, ox, oz);
      wall.quad4(x1 - ox * 0.3, z1 - oz * 0.3, x0 - ox * 0.3, z0 - oz * 0.3, yi1 - 0.5, top1, yi0 - 0.5, top0, -ox, -oz);
      wall.color(0xb5afa3);
      wall.v(x0 + ox * 0.3, top0, z0 + oz * 0.3, 0, 1, 0); wall.v(x1 + ox * 0.3, top1, z1 + oz * 0.3, 0, 1, 0); wall.v(x1 - ox * 0.3, top1, z1 - oz * 0.3, 0, 1, 0);
      wall.v(x0 + ox * 0.3, top0, z0 + oz * 0.3, 0, 1, 0); wall.v(x1 - ox * 0.3, top1, z1 - oz * 0.3, 0, 1, 0); wall.v(x0 - ox * 0.3, top0, z0 - oz * 0.3, 0, 1, 0);
      wall.color(0x3f8f4a);                                                                          // 초록 그물 펜스
      wall.quad4(x0, z0, x1, z1, top0, top0 + 1.8, top1, top1 + 1.8, ox, oz);
      wall.quad4(x1, z1, x0, z0, top1, top1 + 1.8, top0, top0 + 1.8, -ox, -oz);
      const cp = [x0 + ox * 0.3, z0 + oz * 0.3, x1 + ox * 0.3, z1 + oz * 0.3, x1 - ox * 0.3, z1 - oz * 0.3, x0 - ox * 0.3, z0 - oz * 0.3];
      world.addCollider({ p: cp, h: Math.max(top0, top1) + 1.8, minX: Math.min(x0, x1) - 1, maxX: Math.max(x0, x1) + 1, minZ: Math.min(z0, z1) - 1, maxZ: Math.max(z0, z1) + 1 });
    }
  }
  const wallMesh = wall.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // ---------- 정문: 벽돌 기둥 + 철제 미닫이문(열림) + 교표 + 관리실 ----------
  {
    const gy = T(gate.x, gate.z), yaw = Math.atan2(dirIn.x, dirIn.z);
    for (const s of [-1, 1]) {
      const x = gate.x + px * s * 4.6, z = gate.z + pz * s * 4.6;
      const pillar = box(1.6, 3.4, 1.6, 0x9d4a3a); pillar.position.set(x, gy + 1.7, z); pillar.rotation.y = yaw; group.add(pillar);
      const cap = box(1.9, 0.25, 1.9, 0xe9e4d8); cap.position.set(x, gy + 3.5, z); cap.rotation.y = yaw; group.add(cap);
      // 열려 있는 철제 미닫이문 (기둥 안쪽으로 접혀 담장을 따라 놓임)
      for (let k = 0; k < 6; k++) {
        const bar = box(0.06, 2.2, 0.06, 0x6b7280); const off = 1.2 + k * 0.55;
        bar.position.set(x + px * s * off, gy + 1.1, z + pz * s * off); group.add(bar);
      }
      const rail = box(0.08, 0.08, 3.6, 0x6b7280); rail.position.set(x + px * s * 2.6, gy + 2.15, z + pz * s * 2.6); rail.rotation.y = yaw + Math.PI / 2; group.add(rail);
    }
    const emblem = board(0.9, 0.9, textTexture('高', { bg: '#f4e04d', fg: '#1a1a1a', font: 'bold 80px "Malgun Gothic",sans-serif', w: 128, h: 128 }));
    emblem.position.set(gate.x - px * 4.6 - dirIn.x * 0.82, gy + 2.3, gate.z - pz * 4.6 - dirIn.z * 0.82); emblem.rotation.y = yaw + Math.PI; group.add(emblem);
    // 관리실: 정문 오른쪽(들어가며 오른쪽) 벽돌 부스, 위쪽 큰 창, 초록 띠 간판
    {
      const gx = gate.x + px * 8.2 + dirIn.x * 2.2, gz = gate.z + pz * 8.2 + dirIn.z * 2.2, y0 = T(gx, gz);
      const booth = new THREE.Group(); booth.position.set(gx, y0, gz); booth.rotation.y = yaw;
      const base = box(4.4, 1.3, 3.4, 0x9d4a3a); base.position.y = 0.65; booth.add(base);
      const glass = box(4.2, 1.5, 3.2, 0x8fb4d9, { transparent: true, opacity: 0.75 }); glass.position.y = 2.05; booth.add(glass);
      for (const [x, z] of [[-2.1, -1.6], [2.1, -1.6], [-2.1, 1.6], [2.1, 1.6]]) { const post = box(0.16, 1.5, 0.16, 0x2a2f38); post.position.set(x, 2.05, z); booth.add(post); }
      const band = box(4.9, 0.75, 3.9, 0x2f6e4f); band.position.y = 3.15; booth.add(band);
      const roof = box(5.1, 0.18, 4.1, 0xd8d3c8); roof.position.y = 3.6; booth.add(roof);
      const ac = box(0.9, 0.5, 0.6, 0xcfd3d8); ac.position.set(1.4, 3.95, 0.6); booth.add(ac);
      const signTex = textTexture('단국대학교사범대학부속중고등학교', { bg: '#2f6e4f', fg: '#ffffff', font: 'bold 34px "Malgun Gothic",sans-serif', w: 700, h: 90 });
      const s1 = board(4.8, 0.62, signTex); s1.position.set(0, 3.15, -1.96); s1.rotation.y = Math.PI; booth.add(s1);      // 정문 쪽(바깥에서 보이는 면)
      const s2 = board(3.8, 0.62, signTex); s2.position.set(-2.46, 3.15, 0); s2.rotation.y = -Math.PI / 2; booth.add(s2);  // 진입로 쪽
      const door = box(0.9, 2.0, 0.08, 0x3a4c60); door.position.set(1.2, 1.0, 1.72); booth.add(door);
      group.add(booth);
      world.addCollider({ p: [gx - 2.6, gz - 2.2, gx + 2.6, gz - 2.2, gx + 2.6, gz + 2.2, gx - 2.6, gz + 2.2], h: y0 + 3.7, minX: gx - 3, maxX: gx + 3, minZ: gz - 3, maxZ: gz + 3 });
      const bin = box(0.7, 0.9, 0.6, 0x2f6fd3); bin.position.set(gx + px * 3.2, y0 + 0.45, gz + pz * 3.2); bin.rotation.y = yaw; group.add(bin);   // 파란 분리수거함
    }
    // 정문 앞 횡단보도 (노란 지그재그 + 흰 줄)
    lineBuf.color(0xf3d15a);
    for (let s = -3.2; s <= 3.2; s += 1.6) {
      const cx = gate.x - dirIn.x * 9 + px * s, cz = gate.z - dirIn.z * 9 + pz * s;
      const a = [cx - dirIn.x * 1.2 - px * 0.25, cz - dirIn.z * 1.2 - pz * 0.25, cx + dirIn.x * 1.2 - px * 0.25, cz + dirIn.z * 1.2 - pz * 0.25, cx + dirIn.x * 1.2 + px * 0.25, cz + dirIn.z * 1.2 + pz * 0.25, cx - dirIn.x * 1.2 + px * 0.25, cz - dirIn.z * 1.2 + pz * 0.25];
      fillPoly(lineBuf, a, 0.06);
    }
    // 파란 안내판: 정문이 아니라 언덕 아래 작은 사거리(은행 옆, 옹벽 아래)의 캠퍼스 옹벽에 붙어 있다
    {
      const target = { x: gate.x - 47, z: gate.z - 92 };
      let best = null;
      for (let e = 0; e < cn; e++) {
        const ax = campus[2 * e], az = campus[2 * e + 1], bx = campus[(2 * e + 2) % (2 * cn)], bz = campus[(2 * e + 3) % (2 * cn)];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        let t = ((target.x - ax) * dx + (target.z - az) * dz) / L2; t = Math.max(0.1, Math.min(0.9, t));
        const x = ax + dx * t, z = az + dz * t, d = Math.hypot(x - target.x, z - target.z);
        if (!best || d < best.d) { const L = Math.sqrt(L2), nx = -dz / L, nz = dx / L; const out = pointInPoly(campus, x + nx * 2, z + nz * 2) ? -1 : 1; best = { d, x, z, nx: nx * out, nz: nz * out }; }
      }
      // 옹벽 바깥 1.2m, 바깥 땅 기준 2.4m 높이 — 언덕 비탈이나 옹벽에 가리지 않게
      const sx = best.x + best.nx * 1.2, sz = best.z + best.nz * 1.2, yb = T(best.x + best.nx * 3, best.z + best.nz * 3);
      const sign = board(7, 2.6, textTexture('', { w: 700, h: 260, bg: '#1e3a6e', fg: '#ffffff', font: 'bold 40px "Malgun Gothic",sans-serif',
        lines: ['단국대학교 사범대학 부속 고등학교', '단국대학교 부속 소프트웨어 고등학교', '단국대학교 사범대학 부속 중학교'] }));
      sign.position.set(sx, yb + 2.6, sz); sign.rotation.y = Math.atan2(best.nx, best.nz); group.add(sign);
      for (const d of [-3.2, 3.2]) { const post = box(0.1, 3.9, 0.1, 0x3a3f48); post.position.set(sx + best.nz * d, yb + 1.95, sz - best.nx * d); group.add(post); }
      const sign2 = board(2.4, 1.2, textTexture('단대소고', { w: 240, h: 120, bg: '#ffffff', fg: '#1e3a6e', font: 'bold 52px "Malgun Gothic",sans-serif' }));
      sign2.position.set(sx + (best.nz) * 5.6, yb + 2.6, sz - (best.nx) * 5.6); sign2.rotation.y = sign.rotation.y; group.add(sign2);
      // 벽화 타일 (색 삼각형 몇 개)
      const tiles = new Buf();
      for (let k = 0; k < 10; k++) {
        const c = [0xf27d7d, 0xf2c14e, 0x6fc3df, 0x9bd37a, 0xf29cc4][k % 5], ox = (best.nz) * (7 + k * 1.6), oz = -(best.nx) * (7 + k * 1.6);
        tiles.color(c);
        const x0 = sx + ox - best.nx * 0.6, z0 = sz + oz - best.nz * 0.6, x1 = x0 + best.nz * 1.2, z1 = z0 - best.nx * 1.2, yt = T(x0 + best.nx * 2, z0 + best.nz * 2);
        tiles.v(x0, yt + 0.8 + (k % 2) * 0.6, z0, best.nx, 0, best.nz); tiles.v(x1, yt + 0.8, z1, best.nx, 0, best.nz); tiles.v(x1, yt + 2.0, z1, best.nx, 0, best.nz);
      }
      group.add(tiles.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
  }

  // ---------- 진입로(도곡로64길): 볼라드, 벚나무, 노란 중앙선 안내, KB국민은행 ----------
  const road = map.roads.find(r => r.n === '도곡로64길' && r.p.some((v, i) => i % 2 === 0 && Math.hypot(v - gate.x, r.p[i + 1] - gate.z) < 40));
  const cherryCrowns = [], bollards = [];
  if (road) {
    const p = road.p, hw = road.w / 2;
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 2; s < L; s += 4) {
        const x = ax + (bx - ax) * s / L, z = az + (bz - az) * s / L;
        if (Math.hypot(x - gate.x, z - gate.z) > 170) continue;                       // 정문 앞 170m 구간만
        for (const side of [-1, 1]) {
          const bx2 = x + nx * side * (hw + 1.0), bz2 = z + nz * side * (hw + 1.0);
          if (!world.insideBuilding(bx2, bz2, 0.3) && Math.hypot(bx2 - gate.x, bz2 - gate.z) > 6) bollards.push(bx2, bz2);
        }
        if (s % 12 < 4) for (const side of [-1, 1]) {
          const tx = x + nx * side * (hw + 2.4), tz = z + nz * side * (hw + 2.4);
          if (!world.insideBuilding(tx, tz, 1.5) && !world.onAnyRoad(tx, tz, 0.4) && Math.hypot(tx - gate.x, tz - gate.z) > 9) cherryCrowns.push(tx, tz);
        }
      }
    }
  }
  const up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const nb = bollards.length / 2;
  if (nb) {
    const bg = new THREE.CylinderGeometry(0.09, 0.1, 0.9, 8).translate(0, 0.45, 0);
    const bm = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0x2a2f38 }), nb);
    const yg = new THREE.CylinderGeometry(0.1, 0.1, 0.15, 8).translate(0, 0.7, 0);
    const ym = new THREE.InstancedMesh(yg, new THREE.MeshLambertMaterial({ color: 0xf3d15a }), nb);
    for (let i = 0; i < nb; i++) { const x = bollards[2 * i], z = bollards[2 * i + 1]; m4.compose(v3.set(x, T(x, z), z), q.identity(), sc); bm.setMatrixAt(i, m4); ym.setMatrixAt(i, m4); }
    group.add(bm, ym);
  }
  const nc = cherryCrowns.length / 2;
  if (nc) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.22, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: 0x5d4632 }), nc);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.2, 0), new THREE.MeshLambertMaterial({ color: 0xf2b8c6, flatShading: true }), nc);
    for (let i = 0; i < nc; i++) {
      const x = cherryCrowns[2 * i], z = cherryCrowns[2 * i + 1];
      q.setFromAxisAngle(up, i * 1.7); m4.compose(v3.set(x, T(x, z), z), q, sc.set(1, 0.9 + (i % 3) * 0.1, 1));
      trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4);
      world.addCollider({ circle: true, x, z, r: 0.25, h: T(x, z) + 3, minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
    }
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown);
  }
  // KB국민은행 간판 (은행 위치 근처 빈자리에 세운 노란 간판)
  const kb = map.pois.find(p => /KB국민은행/.test(p.n) && Math.hypot(p.x - gate.x, p.z - gate.z) < 200);
  if (kb) {
    const s = world.findOpenSpot(kb.x, kb.z, 1.5, 30), y = T(s.x, s.z);
    const sign = board(6, 1.4, textTexture('★b KB국민은행', { bg: '#ffbc00', fg: '#3a2a00', font: 'bold 64px "Malgun Gothic",sans-serif', w: 700, h: 160 }), { double: true });
    sign.position.set(s.x, y + 3.2, s.z); sign.rotation.y = Math.atan2(gate.x - s.x, gate.z - s.z) + Math.PI / 2; group.add(sign);
    for (const d of [-2.6, 2.6]) { const post = box(0.12, 3.9, 0.12, 0x3a3f48); post.position.set(s.x + Math.cos(sign.rotation.y) * d, y + 1.95, s.z - Math.sin(sign.rotation.y) * d); group.add(post); }
    nightMats.push(sign.material); sign.material.emissive = new THREE.Color(0xffbc00); sign.material.emissiveMap = sign.material.map; sign.material.emissiveIntensity = 0;
    // 같은 건물 2층의 '내과' 간판 — 가까이 가면 빛나고, E 로 쇄석기 시술 체험
    const cs = world.findOpenSpot(s.x + Math.cos(sign.rotation.y) * 9, s.z - Math.sin(sign.rotation.y) * 9, 1.5, 24);
    const clinic = board(4.6, 1.3, textTexture('🏥 내과 · 신장결석 클리닉', { bg: '#ffffff', fg: '#1e5aa8', font: 'bold 44px "Malgun Gothic",sans-serif', w: 640, h: 180 }), { double: true });
    clinic.position.set(cs.x, T(cs.x, cs.z) + 5.4, cs.z); clinic.rotation.y = sign.rotation.y; group.add(clinic);
    for (const d of [-2.0, 2.0]) { const post = box(0.12, 6.1, 0.12, 0x3a3f48); post.position.set(cs.x + Math.cos(clinic.rotation.y) * d, T(cs.x, cs.z) + 3.05, cs.z - Math.sin(clinic.rotation.y) * d); group.add(post); }
    clinic.material.emissive = new THREE.Color(0x4aa3ff); clinic.material.emissiveMap = clinic.material.map;
    CLINIC.x = cs.x; CLINIC.z = cs.z; CLINIC.signMat = clinic.material;
  }

  // 캠퍼스 안 가로수 (길과 건물 피해서)
  const treeSpots = [];
  for (let tries = 0; tries < 400 && treeSpots.length < 70; tries++) {
    const i = Math.floor(Math.random() * cn), ax = campus[2 * i], az = campus[2 * i + 1], bx = campus[(2 * i + 2) % (2 * cn)], bz = campus[(2 * i + 3) % (2 * cn)];
    const t = Math.random(), inset = 4 + Math.random() * 6;
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    let x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const s = pointInPoly(campus, x + nx * 3, z + nz * 3) ? 1 : -1;
    x += nx * s * inset; z += nz * s * inset;
    if (!inCampus(x, z) || world.insideBuilding(x, z, 2.5) || world.onAnyRoad(x, z, 1.5) || (pitch && pointInPoly(pitch.p, x, z)) || Math.hypot(x - gate.x, z - gate.z) < 10) continue;
    if (treeSpots.some(t2 => Math.hypot(t2.x - x, t2.z - z) < 5)) continue;
    treeSpots.push({ x, z });
  }
  if (treeSpots.length) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: 0x6b4f36 }), treeSpots.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1).translate(0, 4.3, 0), new THREE.MeshLambertMaterial({ color: 0x4f8d45, flatShading: true }), treeSpots.length);
    treeSpots.forEach((t, i) => { q.setFromAxisAngle(up, i); m4.compose(v3.set(t.x, T(t.x, t.z), t.z), q, sc.set(1, 1 + (i % 4) * 0.1, 1)); trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4);
      world.addCollider({ circle: true, x: t.x, z: t.z, r: 0.3, h: T(t.x, t.z) + 3, minX: t.x - 1, maxX: t.x + 1, minZ: t.z - 1, maxZ: t.z + 1 }); });
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown);
  }

  const solidMesh = solid.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  solidMesh.castShadow = solidMesh.receiveShadow = true;
  const glassMesh = glassBuf.mesh(glassMat);
  const flatMesh = flatBuf.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  flatMesh.renderOrder = -7; flatMesh.receiveShadow = true;
  const lineMesh = lineBuf.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
  lineMesh.renderOrder = -6;
  group.add(solidMesh, glassMesh, flatMesh, lineMesh);

  return {
    group,
    telescopeSpot: TEL,        // 이 근처(현관 앞)에서 E → 옥상 천문대
    clinicSpot: CLINIC,        // 이 근처에서 E → 내과 쇄석기 시술 체험
    setNight(night) { for (const m of nightMats) m.emissiveIntensity = night * (m === glassMat ? 0.9 : 1.2); },
  };
}
