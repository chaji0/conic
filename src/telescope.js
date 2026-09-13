// 옥상 천문대 — 카세그레인식 반사망원경 (별도 3D 장면, 전체 화면 오버레이)
// 「이차곡선과 빛」의 반사 망원경 탭을 옮겨 왔다: 빛 반사 원리(4단계 + 곡선 단면) · 조작 모드(조준·부경 레버·초점 노브).
// 광학 상수(로컬 좌표: 광축 = z, 빛은 +z 로 진행). 1 유닛 = 50 mm.
import * as THREE from 'three';

const MM3 = 50, KX = 4;
const F = 24, RM = 4.0, RH = 0.5, F1 = -24, F2 = 2.0;
const ZC = (F1 + F2) / 2, CC = (F2 - F1) / 2, ZS = -19.0, AA = Math.abs(ZS - ZC), BB2 = CC * CC - AA * AA;
const RS = 0.95;
const TR = 4.3, TZ0 = -20.4, TZ1 = 0.8, MOON_D = 28, ZSTART = TZ0 - MOON_D + 4;
const SHIFT = 9.8, TILT = Math.PI * 35 / 180, MOUNT_Y = 6.2, GROUND = -6.6;
const zp = r => -r * r / (4 * F);
const zh = r => ZC - AA * Math.sqrt(1 + r * r / BB2);

export function createTelescope({ isNight }) {
  const $ = s => document.querySelector(s);
  const root = $('#tel'), CV = $('#cvTel'), EYE = $('#telEyeCv'), SEC = $('#cvSec');
  let ren = null, scene = null, cam = null, ready = false, open = false, raf = 0;
  let scope = null, optic = null, gMirror = null, gRay = null, gPrin = null, gLabel = null, moon = null, moonLabel = null, focusGlow = null, f1Glow = null;
  let rays = [], labels = [], envT = null, TUBE = null, EYES = null, stars = null;
  let prin = false, step = 1, tPrev = 0, dragged = false, night = true;
  const PL = { on: false, yaw: 0, pitch: 0, dSec: 0, knob: 0, m1: false, m2: false, m3: false, blur: 0, err: 0, tanx: 0, tany: 0 };

  // ---------- 광선 추적 ----------
  function hitSec(P, sh = 0) {
    const D = { x: -P.x, y: -P.y, z: F1 - P.z };
    let lo = 0, hi = 1;
    const g = t => { const x = P.x + D.x * t, y = P.y + D.y * t, z = P.z + D.z * t; return z - (zh(Math.hypot(x, y)) + sh); };
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
    const t = (lo + hi) / 2; return { x: P.x + D.x * t, y: P.y + D.y * t, z: P.z + D.z * t };
  }
  function traceCas(r0) {
    const sh = PL.dSec / MM3, zi = F2 + PL.knob * KX / MM3;
    const P = { r: r0, z: zp(r0) };
    let D = { r: -r0, z: F1 - P.z }; const L0 = Math.hypot(D.r, D.z); D = { r: D.r / L0, z: D.z / L0 };
    const g = t => { const r = Math.abs(P.r + D.r * t), z = P.z + D.z * t; return z - (zh(r) + sh); };
    let lo = 0, hi = (F1 - 0.5 - P.z) / D.z;
    if (g(hi) > 0) return null;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
    const t = (lo + hi) / 2, rh = P.r + D.r * t, zhit = P.z + D.z * t;
    if (Math.abs(rh) > RS * 1.15) return null;
    let n = { r: -2 * rh / BB2, z: 2 * (zhit - ZC - sh) / (AA * AA) };
    const nl = Math.hypot(n.r, n.z); n = { r: n.r / nl, z: n.z / nl };
    const dn = D.r * n.r + D.z * n.z;
    const R = { r: D.r - 2 * dn * n.r, z: D.z - 2 * dn * n.z };
    if (R.z <= 0.02) return null;
    const t2 = (zi - zhit) / R.z;
    return { rh, zh: zhit, end: rh + R.r * t2, zi };
  }
  function casBlur() {
    const ends = [1.1, 1.9, 2.7, 3.5].map(r => traceCas(r)).filter(Boolean).map(o => o.end);
    if (!ends.length) return { blur: 9, off: 0 };
    const m = ends.reduce((a, b) => a + b, 0) / ends.length;
    return { blur: Math.sqrt(ends.reduce((a, b) => a + (b - m) * (b - m), 0) / ends.length) + Math.abs(m) * 0.25, off: m };
  }
  function pathOf(r0, phi) {
    const P = { x: r0 * Math.cos(phi), y: r0 * Math.sin(phi), z: zp(r0) };
    const A = { x: P.x, y: P.y, z: ZSTART };
    if (PL.on) {
      const o = traceCas(r0);
      if (!o) return [A, P, hitSec(P, PL.dSec / MM3), { x: 0, y: 0, z: F2 }];
      return [A, P, { x: o.rh * Math.cos(phi), y: o.rh * Math.sin(phi), z: o.zh }, { x: o.end * Math.cos(phi), y: o.end * Math.sin(phi), z: o.zi }];
    }
    return [A, P, hitSec(P), { x: 0, y: 0, z: F2 }];
  }
  const FOCUS = () => ({ x: 0, y: 0, z: F2 });

  // ---------- 텍스처 · 도우미 ----------
  function radialTex(stops, size = 128) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), h = size / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(s => g.addColorStop(s[0], s[1]));
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }
  let MOONC = null;
  function moonCanvas() {
    if (MOONC) return MOONC;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#C9C6BE'; x.fillRect(0, 0, 1024, 512);
    const blob = (cx, cy, rx, ry, col, a) => { x.save(); x.globalAlpha = a; x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); x.restore(); };
    [[300, 190, 88, 66], [400, 150, 54, 42], [250, 265, 70, 52], [470, 215, 46, 40], [180, 150, 44, 34], [520, 140, 34, 28], [360, 255, 40, 30], [600, 190, 52, 38]]
      .forEach(b => blob(b[0], b[1], b[2], b[3], '#8E8A84', .55));
    for (let i = 0; i < 220; i++) {
      const cx = Math.random() * 1024, cy = Math.random() * 512, r = 2 + Math.random() * 16;
      blob(cx, cy, r, r, '#9E9A93', .35);
      x.save(); x.globalAlpha = .30; x.strokeStyle = '#E8E5DE'; x.lineWidth = 1.2; x.beginPath(); x.arc(cx - r * .15, cy - r * .15, r, 0, 7); x.stroke(); x.restore();
    }
    for (let i = 0; i < 9; i++) {
      const cx = Math.random() * 1024, cy = Math.random() * 512, r = 18 + Math.random() * 26;
      blob(cx, cy, r, r, '#7F7C76', .45);
      x.save(); x.globalAlpha = .5; x.strokeStyle = '#EFEDE7'; x.lineWidth = 2.4; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); x.restore();
    }
    MOONC = c; return c;
  }
  function textSprite(txt, col, px, sc = 1) {
    const c = document.createElement('canvas'), m = c.getContext('2d');
    const font = '700 ' + px + 'px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
    m.font = font; const w = Math.ceil(m.measureText(txt).width) + 18, h = px + 15;
    c.width = w * 2; c.height = h * 2; const y = c.getContext('2d');
    y.scale(2, 2); y.font = font; y.textBaseline = 'middle';
    y.fillStyle = 'rgba(10,11,14,.62)'; y.beginPath(); y.roundRect(0, 0, w, h, h / 2); y.fill();
    y.fillStyle = col; y.fillText(txt, 9, h / 2 + 1);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false }));
    const s = sc * 0.0165; sp.scale.set(w * s, h * s, 1); sp.renderOrder = 12;
    sp.userData.bw = w * s; sp.userData.bh = h * s;
    return sp;
  }
  function envMap() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#CBDCEE'); g.addColorStop(.30, '#7C8EA8'); g.addColorStop(.49, '#333A47'); g.addColorStop(.52, '#12141A'); g.addColorStop(1, '#080A0D');
    x.fillStyle = g; x.fillRect(0, 0, 256, 128);
    x.fillStyle = 'rgba(255,250,235,.95)'; x.beginPath(); x.arc(70, 24, 15, 0, 7); x.fill();
    x.fillStyle = 'rgba(150,190,255,.5)'; x.fillRect(0, 44, 256, 3);
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(ren); const e = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose();
    return e;
  }
  const lathe = (pts, mat) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), mat); m.rotation.x = Math.PI / 2; return m; };
  function lineOf(pts, col, op, dash) {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, p.z)));
    const m = dash ? new THREE.LineDashedMaterial({ color: col, transparent: true, opacity: op, dashSize: .5, gapSize: .45 }) : new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op });
    const l = new THREE.Line(g, m); if (dash) l.computeLineDistances(); return l;
  }
  function segLine(a, b, c0, c1, op) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([...c0, ...c1]), 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: op }));
  }
  function tubeOf(pts, col, rad = .08, op = .95) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 2), rad, 8, false),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthTest: false, depthWrite: false }));
    m.renderOrder = 11; return m;
  }

  // ---------- 씬 ----------
  function buildScene(env) {
    const N = 420, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), R = 150 + Math.random() * 80;
      pos[i * 3] = R * Math.sin(b) * Math.cos(a); pos[i * 3 + 1] = Math.abs(R * Math.sin(b) * Math.sin(a)) * .9 - 10; pos[i * 3 + 2] = R * Math.cos(b);
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    stars = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xC8DAF0, size: .7, transparent: true, opacity: .6 }));
    scene.add(stars);
    // 옥상 바닥
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: .95 }));
    roof.rotation.x = -Math.PI / 2; roof.position.y = GROUND - 0.02; scene.add(roof);
    const grid = new THREE.GridHelper(120, 24, 0x555c68, 0x3f454f); grid.position.y = GROUND; scene.add(grid);
    grid.material.transparent = true; grid.material.opacity = .35;
    for (let k = 0; k < 4; k++) {            // 옥상 난간
      const rail = new THREE.Mesh(new THREE.BoxGeometry(k % 2 ? 0.3 : 120, 1.2, k % 2 ? 120 : 0.3), new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: .8 }));
      rail.position.set(k === 1 ? 60 : k === 3 ? -60 : 0, GROUND + 0.6, k === 0 ? 60 : k === 2 ? -60 : 0); scene.add(rail);
    }
    const metal = new THREE.MeshStandardMaterial({ color: 0x4A5262, metalness: .75, roughness: .35, envMap: env });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2A303C, metalness: .5, roughness: .55, envMap: env });
    const top = new THREE.Vector3(0, MOUNT_Y - 2.6, 0);
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3 + Math.PI / 6;
      const foot = new THREE.Vector3(Math.cos(a) * 5.4, GROUND, Math.sin(a) * 5.4);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.24, .17, foot.distanceTo(top), 16), metal);
      leg.position.copy(foot.clone().add(top).multiplyScalar(.5));
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(top).normalize());
      scene.add(leg);
    }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.55, .7, 2.4, 20), dark); col.position.set(0, MOUNT_Y - 1.5, 0); scene.add(col);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.2), dark); head.position.set(0, MOUNT_Y - .2, 0); scene.add(head);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TR + .25, .28, 12, 48), dark);
    const mt = new THREE.CanvasTexture(moonCanvas());
    moon = new THREE.Mesh(new THREE.SphereGeometry(4.2, 48, 32), new THREE.MeshStandardMaterial({ map: mt, roughness: 1, metalness: 0, emissive: 0xFFFFFF, emissiveMap: mt, emissiveIntensity: .55 }));
    scene.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,255,240,.30)'], [.35, 'rgba(220,230,255,.12)'], [1, 'rgba(200,215,255,0)']], 256), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(24, 24, 1); moon.add(halo);

    scope = new THREE.Group(); optic = new THREE.Group(); scope.add(optic);
    scope.position.set(0, MOUNT_Y, 0); scope.rotation.x = TILT; scene.add(scope);
    optic.position.z = SHIFT;
    TUBE = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR, TZ1 - TZ0, 64, 1, true),
      new THREE.MeshPhysicalMaterial({ color: 0x6E7C93, metalness: .55, roughness: .35, envMap: env, transparent: true, opacity: .20, side: THREE.DoubleSide }));
    TUBE.rotation.x = Math.PI / 2; TUBE.position.z = (TZ0 + TZ1) / 2; optic.add(TUBE);
    const ringMat = new THREE.LineBasicMaterial({ color: 0xA9BED6, transparent: true, opacity: .30 });
    for (let i = 0; i <= 4; i++) {
      const z = TZ0 + (TZ1 - TZ0) * i / 4, p = [];
      for (let k = 0; k <= 72; k++) { const a = k / 72 * Math.PI * 2; p.push(new THREE.Vector3(TR * Math.cos(a), TR * Math.sin(a), z)); }
      optic.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), ringMat));
    }
    ring.position.z = -9.8; optic.add(ring);
    const dsk = document.createElement('canvas'); dsk.width = dsk.height = 256;
    { const x = dsk.getContext('2d'), g = x.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, '#F2F7FF'); g.addColorStop(.62, '#C3D4E6'); g.addColorStop(1, '#7E93AC'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
    const mMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, map: new THREE.CanvasTexture(dsk), metalness: 1, roughness: .08, envMap: env, side: THREE.DoubleSide });
    const pp = []; for (let i = 0; i <= 48; i++) { const r = RH + (RM - RH) * i / 48; pp.push(new THREE.Vector2(r, zp(r))); }
    optic.add(lathe(pp, mMat));
    const backMat = new THREE.MeshStandardMaterial({ color: 0x2C313C, metalness: .35, roughness: .7, envMap: env, side: THREE.DoubleSide });
    const bp = []; for (let i = 0; i <= 48; i++) { const r = RH + (RM - RH) * i / 48; bp.push(new THREE.Vector2(r, zp(r) + .42)); }
    optic.add(lathe(bp, backMat));
    optic.add(lathe([new THREE.Vector2(RM, zp(RM)), new THREE.Vector2(RM, zp(RM) + .42)], backMat));
    optic.add(lathe([new THREE.Vector2(RH, zp(RH)), new THREE.Vector2(RH, zp(RH) + .42)], backMat));
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x39404E, metalness: .55, roughness: .4, envMap: env });
    const e1 = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, 2.3, 32), eyeMat);
    e1.rotation.x = Math.PI / 2; e1.position.set(0, 0, F2 + .7); optic.add(e1);
    EYES = { eyeCas: e1 };
    const front = new THREE.Vector3(0, 0, TZ0); optic.localToWorld(front);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(scope.quaternion).normalize();
    moon.position.copy(front).add(dir.clone().multiplyScalar(MOON_D));
    moonLabel = textSprite('달', '#EAF2FF', 21, 1);
    moonLabel.position.copy(moon.position).add(new THREE.Vector3(0, 5.6, 0)); scene.add(moonLabel);
    labels.push({ sp: moonLabel, steps: [1] });
  }
  function buildMirror(env) {
    if (gMirror) optic.remove(gMirror);
    gMirror = new THREE.Group();
    const mMat = new THREE.MeshStandardMaterial({ color: 0xD2E0EE, metalness: 1, roughness: .06, envMap: env, side: THREE.DoubleSide });
    const hold = new THREE.MeshStandardMaterial({ color: 0x39404E, metalness: .4, roughness: .6, envMap: env });
    const sp = []; for (let i = 0; i <= 40; i++) { const r = RS * i / 40; sp.push(new THREE.Vector2(r, zh(r))); }
    gMirror.add(lathe(sp, mMat));
    const bk = []; for (let i = 0; i <= 40; i++) { const r = RS * i / 40; bk.push(new THREE.Vector2(r, zh(r) + .3)); }
    gMirror.add(lathe(bk, hold));
    gMirror.add(lathe([new THREE.Vector2(RS, zh(RS)), new THREE.Vector2(RS, zh(RS) + .3)], hold));
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3, v = new THREE.Mesh(new THREE.BoxGeometry(TR - RS + .3, .07, .45), hold);
      v.position.set(Math.cos(a) * (RS + TR) / 2, Math.sin(a) * (RS + TR) / 2, ZS - .1); v.rotation.z = a; gMirror.add(v);
    }
    gMirror.position.z = PL.on ? PL.dSec / MM3 : 0;
    optic.add(gMirror);
  }
  function buildRays() {
    if (gRay) optic.remove(gRay);
    gRay = new THREE.Group(); rays = [];
    const pkTex = radialTex([[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,232,170,.95)'], [.55, 'rgba(255,190,70,.4)'], [1, 'rgba(255,170,50,0)']], 128);
    const C = [[1, .66, .24], [1, .80, .38], [1, .92, .66], [1, 1, .95]];
    [1.75, 3.35].forEach((r0, ri) => {
      for (let k = 0; k < 8; k++) {
        const phi = k * 2 * Math.PI / 8 + ri * Math.PI / 8;
        const pts = pathOf(r0, phi), segs = [];
        for (let i = 0; i < 3; i++) segs.push(segLine(pts[i], pts[i + 1], C[i], C[i + 1], .5));
        segs.forEach(l => gRay.add(l));
        const cum = [0]; let L = 0;
        for (let i = 0; i < 3; i++) { L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z); cum.push(L); }
        const gp = [pts[0], pts[1], { x: 0, y: 0, z: F1 }], gc = [0]; let GL = 0;
        for (let i = 0; i < 2; i++) { GL += Math.hypot(gp[i + 1].x - gp[i].x, gp[i + 1].y - gp[i].y, gp[i + 1].z - gp[i].z); gc.push(GL); }
        const gh = segLine(gp[1], gp[2], C[1], C[3], .5); gRay.add(gh);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pkTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        gRay.add(sp);
        rays.push({ pts, cum, segs, sp, gp, gc, gh, ph: (k / 8) * 0.6 + ri * 0.3 });
      }
    });
    const fp = FOCUS();
    focusGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex([[0, 'rgba(255,255,255,.95)'], [.2, 'rgba(255,238,190,.8)'], [.5, 'rgba(255,195,95,.28)'], [1, 'rgba(255,175,60,0)']], 128), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    focusGlow.position.set(fp.x, fp.y, fp.z); focusGlow.scale.set(3, 3, 1); gRay.add(focusGlow);
    f1Glow = new THREE.Sprite(focusGlow.material.clone()); f1Glow.position.set(0, 0, F1); f1Glow.scale.set(3, 3, 1); gRay.add(f1Glow);
    optic.add(gRay);
    applyStep();
  }
  function buildLabels() {
    if (gLabel) optic.remove(gLabel);
    gLabel = new THREE.Group(); labels = labels.filter(L => L.sp === moonLabel);
    const add = (txt, p, steps, col) => { const s = textSprite(txt, col || '#EAF2FF', 21, 1); s.position.set(p.x, p.y, p.z); gLabel.add(s); labels.push({ sp: s, steps }); };
    add('주경 (포물면)', { x: 0, y: RM + 1.7, z: zp(RM) + .2 }, [2, 3]);
    add('구멍', { x: 0, y: 1.5, z: zp(0) - .3 }, [3], '#FFD9A0');
    add('부경 (쌍곡면)', { x: 0, y: RS + 2.6, z: ZS }, [3]);
    add('접안부', { x: 0, y: -1.9, z: F2 + 1.4 }, [4]);
    add('초점', { x: 0, y: 1.9, z: F1 }, [2], '#FFD9A0');
    optic.add(gLabel);
  }
  function buildPrin() {
    if (gPrin) optic.remove(gPrin);
    gPrin = new THREE.Group();
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xFF6A5A, depthTest: false });
    const mk = (p, txt, dy = 1.4) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(.26, 20, 14), dotMat); d.position.set(p.x, p.y, p.z); d.renderOrder = 12; gPrin.add(d);
      const s = textSprite(txt, '#FFD9A0', 21, 1); s.position.set(p.x, p.y + dy, p.z); gPrin.add(s);
    };
    const CUR = 0x7FD8FF;
    mk({ x: 0, y: 0, z: F1 }, '포물선의 초점 = 쌍곡선의 한 초점');
    rays.forEach(R => gPrin.add(lineOf([R.pts[2], { x: 0, y: 0, z: F1 }], 0xFFFFFF, .16, true)));
    const EXT = RM * 1.32;
    [[1, 0], [0, 1]].forEach(ax => { const pr = []; for (let i = -48; i <= 48; i++) { const r = EXT * i / 48; pr.push({ x: r * ax[0], y: r * ax[1], z: zp(Math.abs(r)) }); } gPrin.add(tubeOf(pr, CUR, .085, .95)); });
    const pl = textSprite('포물선 — 주경의 단면', '#7FD8FF', 21, 1); pl.position.set(0, EXT + 1.1, zp(EXT)); gPrin.add(pl);
    mk({ x: 0, y: 0, z: F2 }, '쌍곡선의 다른 초점 — 상', -1.7);
    const HE = RS * 2.6;
    [[1, 0], [0, 1]].forEach(ax => {
      const s1 = [], s2 = [];
      for (let i = -40; i <= 40; i++) { const r = HE * i / 40; s1.push({ x: r * ax[0], y: r * ax[1], z: zh(Math.abs(r)) }); s2.push({ x: r * ax[0], y: r * ax[1], z: 2 * ZC - zh(Math.abs(r)) }); }
      gPrin.add(tubeOf(s1, CUR, .085, .95)); gPrin.add(tubeOf(s2, CUR, .05, .38));
    });
    const hl = textSprite('쌍곡선 — 부경의 단면', '#7FD8FF', 21, 1); hl.position.set(0, -(HE + 1.2), zh(HE)); gPrin.add(hl);
    const hl2 = textSprite('쌍곡선의 다른 가지', '#9DB6C8', 19, 1); hl2.position.set(0, -(HE + 1.0), 2 * ZC - zh(HE)); gPrin.add(hl2);
    gPrin.add(lineOf([{ x: 0, y: 0, z: TZ0 - 3 }, { x: 0, y: 0, z: TZ1 + 3 }], 0xFFFFFF, .14, true));
    gPrin.visible = prin; optic.add(gPrin);
  }

  // ---------- 단계 · 카메라 ----------
  function applyStep() {
    root.querySelectorAll('#telSteps button:not(.nx)').forEach((b, i) => b.classList.toggle('on', i + 1 === step));
    if (PL.on) {
      rays.forEach(R => { R.segs.forEach(l => l.visible = true); R.sp.visible = true; if (R.gh) R.gh.visible = false; });
      labels.forEach(L => { L.sp.visible = false; });
      if (f1Glow) f1Glow.visible = false;
      $('#telEye').hidden = false;
      return;
    }
    const vis = step <= 2 ? 1 : 3;
    rays.forEach(R => { R.segs.forEach((l, i) => { l.visible = i < vis; }); R.sp.visible = true; if (R.gh) R.gh.visible = (step === 2); });
    if (focusGlow) focusGlow.visible = step >= 4;
    if (f1Glow) f1Glow.visible = (step === 2);
    labels.forEach(L => { L.sp.visible = L.steps.indexOf(step) >= 0 && (L.sp !== moonLabel || night); });
    $('#telEye').hidden = step !== 4;
    camTo(step);
  }
  const camGoal = { r: 60, th: 2.15, ph: 1.25 }, orb = { r: 74, th: 2.34, ph: 1.44 };
  let goalTgt = null, curTgt = null;
  const worldOf = (z, y = 0) => { const v = new THREE.Vector3(0, y, z); optic.localToWorld(v); return v; };
  function camTo(s) {
    if (!optic) return;
    if (s === 1) { const mt2 = new THREE.Vector3(0, MOUNT_Y, 0); goalTgt = moon ? mt2.clone().lerp(moon.position, .44) : mt2; camGoal.r = 74; camGoal.th = 2.34; camGoal.ph = 1.44; }
    else if (s === 2) { goalTgt = worldOf(-13); camGoal.r = 40; camGoal.th = 1.62; camGoal.ph = 1.30; }
    else if (s === 3) { goalTgt = worldOf(-9.5); camGoal.r = 40; camGoal.th = 1.48; camGoal.ph = 1.30; }
    else { const f = FOCUS(); goalTgt = worldOf(f.z - 1.5, f.y); camGoal.r = 23; camGoal.th = 4.62; camGoal.ph = 1.42; }
    if (!dragged) { orb.th = camGoal.th; orb.ph = camGoal.ph; }
  }

  // ---------- 접안 화면 ----------
  let eyeT0 = 0;
  function drawEye(now) {
    const box = EYE.getBoundingClientRect(); if (!box.width) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (EYE.width !== Math.round(box.width * dpr)) { EYE.width = Math.round(box.width * dpr); EYE.height = Math.round(box.height * dpr); }
    const x = EYE.getContext('2d'), W = EYE.width, H = EYE.height, R = Math.min(W, H) / 2;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    x.fillStyle = '#07080B'; x.beginPath(); x.arc(W / 2, H / 2, R, 0, 7); x.fill();
    if (night) {
      const t = Math.min(1, (now - eyeT0) / 1600);
      let foc = t * t * (3 - 2 * t), offX = 0, offY = 0, extraBlur = 0, bright = 1;
      if (PL.on) {
        foc = 1;
        const K = R * 1.05 / Math.tan(1.2 * Math.PI / 180);
        offX = Math.max(-R * 2, Math.min(R * 2, -PL.tanx * K)); offY = Math.max(-R * 2, Math.min(R * 2, -PL.tany * K));
        extraBlur = Math.min(24, PL.blur * MM3 * 7);
        bright = Math.max(0.06, Math.exp(-Math.pow(PL.err / 1.2, 2))) * (0.35 + 0.65 * Math.exp(-PL.blur * 3));
      }
      x.save(); x.beginPath(); x.arc(W / 2, H / 2, R * .97, 0, 7); x.clip();
      x.translate(W / 2, H / 2); x.rotate(Math.PI);
      const sc = (0.55 + 0.45 * foc) * R * 1.55 / 512;
      x.globalAlpha = (.25 + .75 * foc) * (PL.on ? bright : 1);
      x.filter = 'blur(' + (((1 - foc) * 9) + extraBlur).toFixed(1) + 'px)';
      x.drawImage(moonCanvas(), 190, 60, 520, 400, -520 * sc + offX, -400 * sc + offY, 1040 * sc, 800 * sc);
      x.filter = 'none'; x.restore();
      x.save(); x.beginPath(); x.arc(W / 2, H / 2, R * .97, 0, 7); x.clip();
      const ph = x.createLinearGradient(W / 2 - R, 0, W / 2 + R * .45, 0);
      ph.addColorStop(0, 'rgba(4,5,8,.80)'); ph.addColorStop(.45, 'rgba(4,5,8,.20)'); ph.addColorStop(1, 'rgba(4,5,8,0)');
      x.fillStyle = ph; x.fillRect(0, 0, W, H); x.restore();
    }
    const g = x.createRadialGradient(W / 2, H / 2, R * .55, W / 2, H / 2, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
    x.fillStyle = g; x.beginPath(); x.arc(W / 2, H / 2, R, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 2 * dpr; x.beginPath(); x.arc(W / 2, H / 2, R - 1, 0, 7); x.stroke();
  }

  // ---------- 단면 인셋 ----------
  const RMIR = 0.85, RHOLE = 0.12, SD = 0.5, HA = 0.37, HC = (SD + 1) / 2, HX0 = (SD - 1) / 2, HB2 = HC * HC - HA * HA, SP = 1.0;
  const sPar = y => -y * y / (4 * SP), sHyp = y => HX0 - HA * Math.sqrt(1 + y * y / HB2), sHyp2 = y => HX0 + HA * Math.sqrt(1 + y * y / HB2);
  const SF1 = { x: -SP, y: 0 }, SF2 = { x: SD, y: 0 }, SEC_Y = [-0.85, -0.65, -0.45, 0.45, 0.65, 0.85];
  function secPath(y0) {
    const P = { x: sPar(y0), y: y0 }, A = { x: -1.85, y: y0 }, D = { x: SF1.x - P.x, y: SF1.y - P.y };
    const SH = PL.on ? PL.dSec / 200 : 0;
    let lo = 0, hi = 1; const g = t => { const x = P.x + D.x * t, y = P.y + D.y * t; return x - (sHyp(y) + SH); };
    if (g(1) > 0) return [A, P, { x: P.x + D.x, y: P.y + D.y }];
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
    const t = (lo + hi) / 2, Q = { x: P.x + D.x * t, y: P.y + D.y * t };
    if (!PL.on) return [A, P, Q, SF2];
    const cx = HX0 + SH; let nx = (Q.x - cx) / (HA * HA), ny = -Q.y / HB2;
    const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
    const dn = D.x * nx + D.y * ny, Rx = D.x - 2 * dn * nx, Ry = D.y - 2 * dn * ny;
    const xi = SD + PL.knob * KX / 200;
    if (Rx <= 1e-6) return [A, P, Q];
    return [A, P, Q, { x: xi, y: Q.y + Ry * (xi - Q.x) / Rx }];
  }
  let secPaths = [], secKey = null;
  function drawSec(now) {
    const box = SEC.getBoundingClientRect(); if (!box.width) return;
    const k = PL.on + '|' + PL.dSec + '|' + PL.knob;
    if (secKey !== k) {
      secPaths = SEC_Y.map(y0 => { const pts = secPath(y0), cum = [0]; let L = 0; for (let i = 0; i < 3; i++) { L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); cum.push(L); } return { pts, cum, ph: (y0 + 1) * 0.37 }; });
      secKey = k;
    }
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (SEC.width !== Math.round(box.width * dpr)) { SEC.width = Math.round(box.width * dpr); SEC.height = Math.round(box.height * dpr); }
    const x = SEC.getContext('2d'), W = box.width, H = box.height;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    const XMIN = -1.95, XMAX = 0.78, YR = 1.12;
    const sc = Math.min((W - 16) / (XMAX - XMIN), (H - 14) / (2 * YR));
    const ox = 8 + (W - 16 - (XMAX - XMIN) * sc) / 2 - XMIN * sc, oy = H / 2;
    const X = p => ox + p.x * sc, Y = p => oy - p.y * sc;
    const vis = PL.on ? 3 : (step === 1 ? 1 : step === 2 ? 2 : 3);
    const kor = "600 11px 'Malgun Gothic',system-ui,sans-serif", mth = "italic 700 13px Georgia,serif";
    const txt = (str, px, py, col, font = kor, align = 'left') => { x.font = font; x.textAlign = align; x.textBaseline = 'middle'; x.lineWidth = 3; x.strokeStyle = 'rgba(10,11,15,.85)'; x.strokeText(str, px, py); x.fillStyle = col; x.fillText(str, px, py); };
    const curve = (fn, y0, y1, col, lw, dash) => { x.save(); x.setLineDash(dash || []); x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.beginPath(); for (let i = 0; i <= 40; i++) { const y = y0 + (y1 - y0) * i / 40, p = { x: fn(y), y }; if (i === 0) x.moveTo(X(p), Y(p)); else x.lineTo(X(p), Y(p)); } x.stroke(); x.restore(); };
    x.save(); x.setLineDash([3, 4]); x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 1; x.beginPath(); x.moveTo(X({ x: XMIN, y: 0 }), oy); x.lineTo(X({ x: XMAX, y: 0 }), oy); x.stroke(); x.restore();
    curve(sPar, -YR, YR, 'rgba(127,216,255,.35)', 1, [3, 3]);
    curve(sPar, RHOLE, RMIR, '#7FD8FF', 3.2); curve(sPar, -RMIR, -RHOLE, '#7FD8FF', 3.2);
    txt('포물선 (주경)', X({ x: sPar(RMIR) + 0.02, y: 0 }) + 6, Y({ x: 0, y: RMIR }) + 2, '#7FD8FF');
    const show = step >= 3 || prin || PL.on, SH = PL.on ? PL.dSec / 200 : 0, hypS = y => sHyp(y) + SH;
    curve(hypS, -0.72, 0.72, 'rgba(127,216,255,' + (show ? .35 : .18) + ')', 1, [3, 3]);
    curve(hypS, -0.42, 0.42, show ? '#7FD8FF' : 'rgba(127,216,255,.55)', show ? 3.2 : 2);
    if (PL.on) {
      if (Math.abs(PL.dSec) <= 1) { x.fillStyle = '#B78CFF'; x.beginPath(); x.arc(X(SF1), Y(SF1), 4.5, 0, 7); x.fill(); txt('두 초점 겹침 ✓', X(SF1), Y(SF1) - 11, '#B78CFF', kor, 'center'); }
      else { x.fillStyle = '#7FD8FF'; x.beginPath(); x.arc(X(SF1), Y(SF1), 3.4, 0, 7); x.fill(); x.fillStyle = '#FF6A5A'; x.beginPath(); x.arc(X({ x: SF1.x + SH, y: 0 }), Y(SF1), 3.4, 0, 7); x.fill();
        txt('포물선 초점', X(SF1), Y(SF1) - 11, '#7FD8FF', kor, 'center'); txt('쌍곡선 초점', X({ x: SF1.x + SH, y: 0 }), Y(SF1) + 13, '#FF6A5A', kor, 'center'); }
    }
    if (prin) { curve(sHyp2, -0.72, 0.72, 'rgba(127,216,255,.30)', 1, [3, 3]); }
    if (show) txt('쌍곡선 (부경)', X({ x: sHyp(0.42), y: 0 }) - 6, Y({ x: 0, y: 0.42 }) - 9, '#7FD8FF', kor, 'right');
    if (PL.on) { const xi = SD + PL.knob * KX / 200; x.save(); x.strokeStyle = '#FFD98A'; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(X({ x: xi, y: -0.15 }), Y({ x: 0, y: -0.15 })); x.lineTo(X({ x: xi, y: 0.15 }), Y({ x: 0, y: 0.15 })); x.stroke(); x.restore(); txt('접안부', X({ x: xi, y: 0 }), Y({ x: 0, y: 0.15 }) - 9, '#FFD98A'); }
    const t = now / 1000;
    secPaths.forEach(R => {
      const P = step === 2 && !PL.on ? [R.pts[0], R.pts[1], SF1] : R.pts;
      for (let i = 0; i < vis; i++) {
        const a = P[i], b = P[i + 1]; if (!a || !b) continue;
        const g = x.createLinearGradient(X(a), Y(a), X(b), Y(b));
        g.addColorStop(0, ['rgba(255,168,61,.75)', 'rgba(255,204,97,.8)', 'rgba(255,236,170,.85)'][i]); g.addColorStop(1, ['rgba(255,204,97,.8)', 'rgba(255,236,170,.85)', 'rgba(255,255,244,.9)'][i]);
        x.strokeStyle = g; x.lineWidth = 1.4; x.beginPath(); x.moveTo(X(a), Y(a)); x.lineTo(X(b), Y(b)); x.stroke();
      }
      const CU = step === 2 && !PL.on ? [0, R.cum[1], R.cum[1] + Math.hypot(SF1.x - P[1].x, SF1.y - P[1].y)] : R.cum;
      const L = CU[vis], u = ((t * 0.16 + R.ph) % 1) * L;
      let i = 0; while (i < vis - 1 && CU[i + 1] < u) i++;
      const f = (u - CU[i]) / ((CU[i + 1] - CU[i]) || 1), a = P[i], b = P[i + 1]; if (!a || !b) return;
      const px = X(a) + (X(b) - X(a)) * f, py = Y(a) + (Y(b) - Y(a)) * f;
      const rg = x.createRadialGradient(px, py, 0, px, py, 6); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.4, 'rgba(255,225,150,.8)'); rg.addColorStop(1, 'rgba(255,170,50,0)');
      x.fillStyle = rg; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill();
    });
    const focus = (p, label, col, dy, glow) => {
      if (glow) { const r = 9 + 2 * Math.sin(t * 4), g = x.createRadialGradient(X(p), Y(p), 0, X(p), Y(p), r * 2.2); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.35, 'rgba(255,225,150,.55)'); g.addColorStop(1, 'rgba(255,170,50,0)'); x.fillStyle = g; x.beginPath(); x.arc(X(p), Y(p), r * 2.2, 0, 7); x.fill(); }
      x.fillStyle = col; x.beginPath(); x.arc(X(p), Y(p), 3.2, 0, 7); x.fill(); txt(label, X(p), Y(p) + dy, col, mth, 'center');
    };
    if (!PL.on) focus(SF1, 'F', '#FF6A5A', -13, step === 2);
    if (step >= 3 || prin) focus(SF2, 'F′', '#FF6A5A', 14, step >= 4);
  }

  // ---------- 조작 모드 ----------
  const joyEl = $('#joy'), joyS = $('#joyStick'), leverEl = $('#lever'), leverH = $('#leverHandle'), dialEl = $('#dial'), dialF = $('#dialFace');
  let joyVec = [0, 0], joyActive = false, dialAng = 0, dialPrev = null, leverDrag = false;
  function playRebuild() { if (!ready) return; buildMirror(envT); buildRays(); if (EYES) EYES.eyeCas.position.z = F2 + .7 + (PL.on ? PL.knob * KX / MM3 : 0); }
  function leverSet(v, silent) {
    v = Math.max(-20, Math.min(20, v)); PL.dSec = v;
    const trackH = leverEl.clientHeight || 76, t = 1 - (v + 20) / 40;
    leverH.style.top = (4 + t * (trackH - 15 - 8)) + 'px';
    $('#leverVal').textContent = PL.dSec.toFixed(1) + ' mm';
    if (!silent) playRebuild();
  }
  function leverMove(e) { const r = leverEl.getBoundingClientRect(), t = Math.max(0, Math.min(1, (e.clientY - r.top - 8) / (r.height - 16))); leverSet((1 - t) * 40 - 20); }
  leverEl.addEventListener('pointerdown', e => { leverDrag = true; leverEl.setPointerCapture(e.pointerId); e.stopPropagation(); leverMove(e); });
  leverEl.addEventListener('pointermove', e => { if (leverDrag) leverMove(e); });
  for (const t of ['pointerup', 'pointercancel']) leverEl.addEventListener(t, () => leverDrag = false);
  function dialShow() { dialF.style.transform = 'rotate(' + dialAng + 'rad)'; $('#dialVal').textContent = PL.knob.toFixed(1) + ' mm'; }
  function dialAdd(da, silent) { dialAng += da; PL.knob = Math.max(-40, Math.min(40, PL.knob + da / (2 * Math.PI) * 10)); dialShow(); if (!silent) playRebuild(); }
  dialEl.addEventListener('pointerdown', e => { dialEl.setPointerCapture(e.pointerId); e.stopPropagation(); const r = dialEl.getBoundingClientRect(); dialPrev = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); });
  dialEl.addEventListener('pointermove', e => { if (dialPrev === null) return; const r = dialEl.getBoundingClientRect(), a = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); let d = a - dialPrev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; dialPrev = a; dialAdd(d); });
  for (const t of ['pointerup', 'pointercancel']) dialEl.addEventListener(t, () => dialPrev = null);
  function joyMove(e) { const r = joyEl.getBoundingClientRect(); let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; const L = Math.hypot(dx, dy), M = 20; if (L > M) { dx *= M / L; dy *= M / L; } joyVec = [dx / M, dy / M]; joyS.style.left = (20 + dx) + 'px'; joyS.style.top = (20 + dy) + 'px'; }
  joyEl.addEventListener('pointerdown', e => { joyActive = true; joyEl.setPointerCapture(e.pointerId); e.stopPropagation(); joyMove(e); });
  joyEl.addEventListener('pointermove', e => { if (joyActive) joyMove(e); });
  for (const t of ['pointerup', 'pointercancel']) joyEl.addEventListener(t, () => { joyActive = false; joyVec = [0, 0]; joyS.style.left = '20px'; joyS.style.top = '20px'; $('#joyVal').textContent = '·'; });
  function playScatter() {
    const r = (a, b) => a + Math.random() * (b - a), sg = () => Math.random() < 0.5 ? -1 : 1;
    PL.yaw = sg() * r(0.04, 0.10); PL.pitch = sg() * r(0.03, 0.08); PL.dSec = sg() * r(6, 16); PL.knob = sg() * r(5, 16);
    if (scope) { scope.rotation.order = 'YXZ'; scope.rotation.y = PL.yaw; scope.rotation.x = TILT + PL.pitch; }
    leverSet(PL.dSec, true); dialShow(); playRebuild();
  }
  function helpMsg() {
    if (!scope || !moon) return '먼저 조작 모드를 켜 주세요!';
    const fr = worldOf(TZ0), md = moon.position.clone().sub(fr).normalize();
    const errNow = new THREE.Vector3(0, 0, -1).applyQuaternion(scope.quaternion).angleTo(md) * 180 / Math.PI;
    if (errNow > 0.3) {
      const test = (dy, dp) => new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(TILT + PL.pitch + dp, PL.yaw + dy, 0, 'YXZ'))).angleTo(md);
      const base = test(0, 0);
      const dir = [test(-0.02, 0) < base ? '오른쪽' : (test(0.02, 0) < base ? '왼쪽' : ''), test(0, -0.02) < base ? '아래' : (test(0, 0.02) < base ? '위' : '')].filter(Boolean).join(' ');
      return '달이 시야 밖이에요. 미동 스틱을 ' + (dir || '조금씩') + ' 쪽으로 밀어 봐요 (오차 ' + errNow.toFixed(1) + '°)';
    }
    if (Math.abs(PL.dSec) > 1) return '부경 레버를 ' + (PL.dSec > 0 ? '아래로' : '위로') + ' — 두 초점 사이 ' + Math.abs(PL.dSec).toFixed(1) + ' mm';
    if (Math.abs(PL.knob) > 4.5) return '초점 노브를 ' + (PL.knob > 0 ? '반시계' : '시계') + ' 방향으로 살살 (' + PL.knob.toFixed(1) + ' mm)';
    return '정렬 완료! 선명한 달입니다.';
  }
  $('#tcNew').addEventListener('click', playScatter);
  let helpT = 0;
  $('#tcHelp').addEventListener('click', () => { const b = $('#helpBub'); b.textContent = helpMsg(); b.classList.add('show'); clearTimeout(helpT); helpT = setTimeout(() => b.classList.remove('show'), 5000); });
  function setPlay(on) {
    if (on && !night) { const b = $('#helpBub'); b.textContent = '🌙 달은 밤에만 보여요. 밤이 되면 다시 와요!'; b.classList.add('show'); clearTimeout(helpT); helpT = setTimeout(() => b.classList.remove('show'), 3500); return; }
    PL.on = on;
    $('#telPlay').classList.toggle('on', on);
    root.classList.toggle('playing', on);
    if (on) {
      eyeT0 = performance.now() - 2000;
      playScatter();
      if (scope) { goalTgt = worldOf(-7); camGoal.r = 48; camGoal.th = 1.9; camGoal.ph = 1.32; dragged = false; orb.th = camGoal.th; orb.ph = camGoal.ph; }
      applyStep();
    } else {
      PL.yaw = PL.pitch = 0; PL.dSec = 0; PL.knob = 0;
      $('#telStat').textContent = '';
      if (scope) { scope.rotation.order = 'YXZ'; scope.rotation.y = 0; scope.rotation.x = TILT; }
      playRebuild(); applyStep();
    }
  }
  $('#telPlay').addEventListener('click', () => setPlay(!PL.on));
  $('#telPrin').addEventListener('click', function () { prin = !prin; this.classList.toggle('on', prin); if (gPrin) gPrin.visible = prin; if (TUBE) TUBE.material.opacity = prin ? .09 : .20; });
  root.querySelectorAll('#telSteps button:not(.nx)').forEach((b, i) => b.addEventListener('click', () => { step = i + 1; dragged = false; if (step === 4) eyeT0 = performance.now(); if (ready) applyStep(); }));
  $('#telNext').addEventListener('click', () => { step = step % 4 + 1; dragged = false; if (step === 4) eyeT0 = performance.now(); if (ready) applyStep(); });
  $('#telClose').addEventListener('click', () => close());

  // ---------- 시점 조작 ----------
  let drag = null, pinch = 0;
  CV.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; dragged = true; CV.setPointerCapture(e.pointerId); });
  CV.addEventListener('pointermove', e => { if (!drag) return; orb.th -= (e.clientX - drag.x) * 0.0075; orb.ph = Math.max(.20, Math.min(2.9, orb.ph - (e.clientY - drag.y) * 0.0065)); drag = { x: e.clientX, y: e.clientY }; });
  for (const t of ['pointerup', 'pointercancel']) CV.addEventListener(t, () => { drag = null; });
  CV.addEventListener('wheel', e => { e.preventDefault(); camGoal.r = orb.r = Math.max(9, Math.min(120, orb.r * (1 + e.deltaY * 0.0012))); }, { passive: false });
  CV.addEventListener('touchstart', e => { if (e.touches.length === 2) { dragged = true; pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: true });
  CV.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); camGoal.r = orb.r = Math.max(9, Math.min(120, orb.r * pinch / d)); pinch = d; } }, { passive: true });

  function resize() {
    if (!ren) return;
    const r = CV.getBoundingClientRect(); if (!r.width) return;
    ren.setPixelRatio(Math.min(2, devicePixelRatio || 1)); ren.setSize(r.width, r.height, false);
    cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  function tick(now) {
    if (!open) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(.05, (now - (tPrev || now)) / 1000); tPrev = now;
    if (goalTgt) {
      if (!curTgt) curTgt = goalTgt.clone();
      curTgt.lerp(goalTgt, 1 - Math.pow(0.008, dt));
      orb.r += (camGoal.r - orb.r) * (1 - Math.pow(0.02, dt));
      if (!dragged) { orb.th += (camGoal.th - orb.th) * (1 - Math.pow(0.02, dt)); orb.ph += (camGoal.ph - orb.ph) * (1 - Math.pow(0.02, dt)); }
      const s = Math.sin(orb.ph);
      cam.position.set(curTgt.x + orb.r * s * Math.sin(orb.th), curTgt.y + orb.r * Math.cos(orb.ph), curTgt.z + orb.r * s * Math.cos(orb.th));
      cam.lookAt(curTgt);
    }
    const t = now / 1000, vis = PL.on ? 3 : (step === 1 ? 1 : step === 2 ? 2 : 3);
    rays.forEach(R => {
      const P = (!PL.on && step === 2) ? R.gp : R.pts, CU = (!PL.on && step === 2) ? R.gc : R.cum;
      const L = CU[vis], u = ((t * 0.11 + R.ph) % 1) * L;
      let i = 0; while (i < vis - 1 && CU[i + 1] < u) i++;
      const f = (u - CU[i]) / ((CU[i + 1] - CU[i]) || 1), a = P[i], b = P[i + 1];
      R.sp.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
      const k = .6 + .28 * Math.sin(t * 5 + R.ph * 9); R.sp.scale.set(k, k, 1);
    });
    const q = 2.6 + .8 * Math.sin(t * 2.4);
    if (focusGlow && focusGlow.visible) focusGlow.scale.set(q, q, 1);
    if (f1Glow && f1Glow.visible) f1Glow.scale.set(q, q, 1);
    if (moon) moon.rotation.y += dt * 0.012;
    const lk = orb.r / 20;
    scene.traverse(o => { if (o.isSprite && o.userData.bw) o.scale.set(o.userData.bw * lk, o.userData.bh * lk, 1); });
    if (PL.on && scope && joyActive) {
      PL.yaw = Math.max(-0.14, Math.min(0.14, PL.yaw - joyVec[0] * dt * 0.022));
      PL.pitch = Math.max(-0.12, Math.min(0.12, PL.pitch - joyVec[1] * dt * 0.018));
      scope.rotation.order = 'YXZ'; scope.rotation.y = PL.yaw; scope.rotation.x = TILT + PL.pitch;
      $('#joyVal').textContent = '조준 중…';
    }
    if (PL.on && scope && moon) {
      const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(scope.quaternion), md = moon.position.clone().sub(worldOf(TZ0)).normalize();
      PL.err = fw.angleTo(md) * 180 / Math.PI;
      const lo = md.clone().applyQuaternion(scope.quaternion.clone().invert());
      PL.tanx = lo.x / Math.max(0.2, -lo.z); PL.tany = lo.y / Math.max(0.2, -lo.z);
      PL.blur = casBlur().blur;
      if (focusGlow) { const k = Math.max(0.4, 2.6 - PL.blur * 10); focusGlow.scale.set(k, k, 1); focusGlow.visible = PL.err < 1.6; }
      const ok1 = PL.err <= 0.3, ok2 = Math.abs(PL.dSec) <= 1, ok3 = ok1 && ok2 && PL.blur * MM3 <= 0.9;
      PL.m1 = ok1; PL.m2 = ok2; PL.m3 = ok3;
      $('#tcM1').classList.toggle('done', ok1); $('#tcM2').classList.toggle('done', ok2); $('#tcM3').classList.toggle('done', ok3);
      $('#telStat').textContent = '오차 ' + PL.err.toFixed(2) + '° · 초점 사이 ' + Math.abs(PL.dSec).toFixed(1) + ' mm · 흐림 ' + (PL.blur * MM3).toFixed(1) + ' mm' + (ok3 ? ' — 정렬 완료 ✓' : '');
    }
    ren.render(scene, cam);
    if (step === 4 || PL.on) drawEye(now);
    drawSec(now);
  }

  function init() {
    if (ready) return;
    ren = new THREE.WebGLRenderer({ canvas: CV, antialias: true });
    ren.setClearColor(0x0C0E14, 1);
    ren.toneMapping = THREE.ACESFilmicToneMapping; ren.toneMappingExposure = 1.12;
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(36, 2, .4, 600);
    envT = envMap();
    scene.add(new THREE.HemisphereLight(0x93AAC8, 0x14161C, .6));
    const d1 = new THREE.DirectionalLight(0xFFF3DE, 1.15); d1.position.set(-14, 20, 12); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xA6C6FF, .45); d2.position.set(14, -6, -16); scene.add(d2);
    buildScene(envT); buildMirror(envT); buildRays(); buildLabels(); buildPrin();
    ready = true;
  }
  function applyNight() {
    night = !!isNight();
    if (moon) moon.visible = night;
    if (stars) stars.visible = night;
    if (ren) ren.setClearColor(night ? 0x0C0E14 : 0x6f9fd6, 1);
    $('#telMoonNote').hidden = night;
    if (!night && PL.on) setPlay(false);
    applyStep();
  }
  function openTel() {
    if (open) return;
    root.hidden = false; open = true;
    init(); resize(); applyNight();
    step = 1; dragged = false; eyeT0 = performance.now(); applyStep();
    tPrev = 0; raf = requestAnimationFrame(tick);
  }
  function close() {
    if (!open) return;
    if (PL.on) setPlay(false);
    open = false; root.hidden = true; cancelAnimationFrame(raf);
  }
  return { open: openTel, close, get isOpen() { return open; }, refreshNight: () => { if (open) applyNight(); } };
}
