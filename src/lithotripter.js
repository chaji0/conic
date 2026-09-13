// 내과 — 체외 충격파 쇄석기 '시술 체험' (반타원체 반사경: F₁ 전극에서 나온 충격파가 F₂ 결석에 모인다)
// 「체외 충격파 쇄석기 3D 탐구」의 시술 체험 탭을 옮겨 왔다. 환자는 베리(또는 단붕이)가 테이블에 누워 있다.
// 단위: cm (1 cm = 10 mm). 결석이 완전히 부서지면 onCollected() 가 불려 도감에 카드가 들어간다.
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const DEG = Math.PI / 180;
const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
const fmt = (x, n = 1) => (Math.abs(x) < 5e-4 ? 0 : x).toFixed(n);

// 실제 제원: 도르니어 HM3 계열 — a=138mm, b=77.5mm, 개구 지름 150mm, 물속 음속 1.5 mm/µs
const A = 13.8, B = 7.75, Cq = Math.sqrt(A * A - B * B), E = Cq / A, LSEMI = B * B / A;
const F1 = [0, 0, -Cq], F2C = [0, 0, Cq];
const ZCUT = -3.48, UMAX = Math.acos(-ZCUT / A), PATH = 2 * A, ZONE_R = 0.6, ZONE_H = 3.0;
const rF1 = phi => LSEMI / (1 + E * Math.cos(phi));
const dirOf = (phi, psi) => [Math.sin(phi) * Math.cos(psi), Math.sin(phi) * Math.sin(psi), -Math.cos(phi)];
const hitOf = (phi, psi) => { const r = rF1(phi); return { r, p: add(F1, mul(dirOf(phi, psi), r)) }; };
const PHIMAX = (() => { const zof = ph => -Cq - rF1(ph) * Math.cos(ph); let lo = 1e-4, hi = Math.PI - 1e-4; for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (zof(m) < ZCUT) lo = m; else hi = m; } return (lo + hi) / 2; })();
function wavePt(phi, psi, s) { const h = hitOf(phi, psi); if (s <= h.r) return add(F1, mul(dirOf(phi, psi), s)); const u = norm(sub(h.p, F2C)); return add(F2C, mul(u, Math.max(0, PATH - s))); }
const epoint = (u, v) => [B * Math.sin(u) * Math.cos(v), B * Math.sin(u) * Math.sin(v), -A * Math.cos(u)];
const enorm = p => norm([p[0] / (B * B), p[1] / (B * B), p[2] / (A * A)]);

const PAPER = '#EFEFE3', ACC = '#2F45EC';
const MET_IN = [196, 197, 186], MET_OUT = [110, 111, 101], CASE = [74, 75, 68];
const LD = norm([0.42, -0.78, 0.78]);
function shade(base, t, extra) { const k = clamp(0.34 + 0.72 * t + (extra || 0), 0, 1.45); return 'rgb(' + Math.round(clamp(base[0] * k, 0, 255)) + ',' + Math.round(clamp(base[1] * k, 0, 255)) + ',' + Math.round(clamp(base[2] * k, 0, 255)) + ')'; }

const STONE = (() => {
  const NU = 7, NV = 12, v = [], f = [];
  const rnd = (i, j) => { const x = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i <= NU; i++) for (let j = 0; j < NV; j++) { const u = Math.PI * i / NU, w = 2 * Math.PI * j / NV, rr = 0.5 * (0.76 + 0.46 * rnd(i, j)); v.push([rr * Math.sin(u) * Math.cos(w), rr * Math.sin(u) * Math.sin(w), rr * Math.cos(u)]); }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) f.push([i * NV + j, i * NV + (j + 1) % NV, (i + 1) * NV + (j + 1) % NV, (i + 1) * NV + j]);
  return { v, f };
})();
const FRAG = (() => { const a = []; for (let i = 0; i < 11; i++) { const t = i * 2.399, u = Math.cos(i * 1.17); a.push(norm([Math.cos(t) * Math.sqrt(1 - u * u), Math.sin(t) * Math.sqrt(1 - u * u), u])); } return a; })();

export function createLithotripter({ onCollected }) {
  const $ = id => document.getElementById(id);
  const root = $('litho'), cv = $('lithoCv'), ctx = cv.getContext('2d'), aimCv = $('aimCv'), aimCtx = aimCv.getContext('2d');
  const SIM = { shots: 0, hits: 0, stone: 0, kid: 0, lung: 0, spl: 0, soft: 0, absorbed: 0, done: false, ramped: null, evHematuria: false, evHematoma: false, evLung: false, evSpl: false, kvHist: [], blood: [] };
  const S = { s: -1, kv: 18, slow: 0.55, pat: [1.4, -1.1], brAmp: 1.2, brT: 0, brHold: 0, simShield: false, auto: false, cut: true, spark: 0, impact: 0, broken: 0, brokeT: 0, zone: true };
  const cam = { dist: 66, az: -1.02, el: 0.40, target: [0, 1.5, 5], fov: 40 };
  let open = false, raf = 0, charKey = 'cat', collected = false;
  const breathY = () => S.brAmp * (S.brHold > 0 ? 0.06 : 1) * Math.sin(S.brT * 2 * Math.PI / 4.2);
  const patOff = () => [S.pat[0], S.pat[1] + breathY(), 0];
  const stonePos = () => { const o = patOff(); return [o[0], o[1], Cq]; };
  function organAt(b) {
    const z = Cq, inE = (c, r) => { const dx = (b[0] - c[0]) / r[0], dy = (b[1] - c[1]) / r[1], dz = (z - c[2]) / r[2]; return dx * dx + dy * dy + dz * dz <= 1; };
    if (inE([0, 0.9, Cq + 0.3], [3.0, 4.8, 3.2])) return 'kidney';
    if (inE([4.5, 9.5, 14.5], [3.9, 6.5, 4.9]) || inE([-4.5, 9.5, 14.5], [3.9, 6.5, 4.9])) return 'lung';
    if (inE([-6.3, 4.5, 13], [2.5, 3.5, 2.5])) return 'spleen';
    return 'soft';
  }

  // ---------- 카메라 · 깊이 정렬 렌더러 ----------
  let W = 0, H = 0, DPR = 1, EYE = [0, 0, 0], FW = [1, 0, 0], RT = [0, 1, 0], UP = [0, 0, 1], FOC = 1, HDIR = [1, 0, 0];
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function updateCam() {
    EYE = [cam.target[0] + cam.dist * Math.cos(cam.el) * Math.cos(cam.az), cam.target[1] + cam.dist * Math.cos(cam.el) * Math.sin(cam.az), cam.target[2] + cam.dist * Math.sin(cam.el)];
    FW = norm(sub(cam.target, EYE)); RT = norm(cross(FW, [0, 0, 1])); UP = cross(RT, FW); FOC = (H / 2) / Math.tan(cam.fov * DEG / 2);
  }
  function proj(p) { const v = sub(p, EYE), z = dot(v, FW); if (z < 0.25) return null; return { x: W / 2 + dot(v, RT) * FOC / z, y: H / 2 - dot(v, UP) * FOC / z, z }; }
  let prims = [];
  const push = (z, fn) => prims.push({ z, fn });
  const depth = pts => { let s = 0; for (const p of pts) s += len(sub(p, EYE)); return s / pts.length; };
  function polyNow(pts, fill, stroke, lw, dash) {
    const q = []; for (const p of pts) { const t = proj(p); if (!t) return; q.push(t); }
    ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.save(); ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); ctx.restore(); }
  }
  function segNow(a, b, color, lw, dash) { const p = proj(a), q = proj(b); if (!p || !q) return; ctx.save(); ctx.setLineDash(dash || []); ctx.strokeStyle = color; ctx.lineWidth = lw || 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.restore(); }
  const quad = (pts, fill, stroke, lw) => push(depth(pts), () => polyNow(pts, fill, stroke, lw));
  const line3 = (a, b, color, lw, dash) => push(depth([a, b]), () => segNow(a, b, color, lw, dash));
  const dot3 = (p, color, r, ring) => push(len(sub(p, EYE)), () => { const q = proj(p); if (!q) return; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fillStyle = color; ctx.fill(); if (ring) { ctx.lineWidth = 1.6; ctx.strokeStyle = ring; ctx.stroke(); } });
  function flush() { prims.sort((a, b) => b.z - a.z); for (const p of prims) p.fn(); prims = []; }
  function label(p, text, color, dx, dy, small) {
    const q = proj(p); if (!q) return;
    ctx.save(); ctx.font = (small ? '600 11.5px ' : '600 12.5px ') + "'Malgun Gothic',system-ui,sans-serif"; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const x = q.x + (dx || 0), y = q.y + (dy || 0);
    ctx.strokeStyle = 'rgba(239,239,227,.92)'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.strokeStyle = color; ctx.globalAlpha = .45; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(x - 3, y); ctx.stroke(); ctx.restore();
  }
  function mathLabel(p, text, color, dx, dy) { const q = proj(p); if (!q) return; ctx.save(); ctx.font = "italic 700 16px Georgia,serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = 'rgba(239,239,227,.92)'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeText(text, q.x + (dx || 0), q.y + (dy || 0)); ctx.fillStyle = color; ctx.fillText(text, q.x + (dx || 0), q.y + (dy || 0)); ctx.restore(); }
  const cutHide = p => S.cut && (p[0] * HDIR[0] + p[1] * HDIR[1]) > 0;

  // ---------- 장면 ----------
  function drawStone(cen, sc, base) {
    for (const q of STONE.f) {
      const p = q.map(k => add(cen, mul(STONE.v[k], sc)));
      if (cutHide(p[0])) continue;
      const n = norm(cross(sub(p[1], p[0]), sub(p[3], p[0])));
      quad(p, shade(base, Math.max(0, dot(n, LD))), 'rgba(0,0,0,.13)', .5);
    }
  }
  function drawReflector() {
    const NU = 18, NV = 44;
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const u0 = UMAX * i / NU, u1 = UMAX * (i + 1) / NU, v0 = 2 * Math.PI * j / NV, v1 = 2 * Math.PI * (j + 1) / NV;
      const p = [epoint(u0, v0), epoint(u0, v1), epoint(u1, v1), epoint(u1, v0)], cen = mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25);
      if (cutHide(cen)) continue;
      const n = enorm(cen), toEye = norm(sub(EYE, cen));
      if (dot(n, toEye) < 0) { const nn = mul(n, -1), t = Math.max(0, dot(nn, LD)), r = sub(mul(nn, 2 * dot(nn, LD)), LD); quad(p, shade(MET_IN, t, 0.55 * Math.pow(Math.max(0, dot(norm(r), toEye)), 18)), null, 0); }
      else quad(p, shade(MET_OUT, Math.max(0, dot(n, LD))), null, 0);
    }
    for (let j = 0; j < 64; j++) { const a = epoint(UMAX, 2 * Math.PI * j / 64), b = epoint(UMAX, 2 * Math.PI * (j + 1) / 64); if (cutHide(a)) continue; line3(a, b, '#7E7F72', 1.6); }
  }
  function drawCasing() {
    const R = 8.6, Z0 = -15.4, NV = 44;
    for (let j = 0; j < NV; j++) {
      const v0 = 2 * Math.PI * j / NV, v1 = 2 * Math.PI * (j + 1) / NV;
      const p = [[R * Math.cos(v0), R * Math.sin(v0), Z0], [R * Math.cos(v1), R * Math.sin(v1), Z0], [R * Math.cos(v1), R * Math.sin(v1), ZCUT], [R * Math.cos(v0), R * Math.sin(v0), ZCUT]];
      const cen = mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25);
      if (cutHide(cen)) continue;
      const n = norm([cen[0], cen[1], 0]);
      if (dot(n, norm(sub(EYE, cen))) < 0) continue;
      quad(p, shade(CASE, Math.max(0, dot(n, LD))), null, 0);
      quad([[R * Math.cos(v0), R * Math.sin(v0), ZCUT], [R * Math.cos(v1), R * Math.sin(v1), ZCUT], [7.5 * Math.cos(v1), 7.5 * Math.sin(v1), ZCUT], [7.5 * Math.cos(v0), 7.5 * Math.sin(v0), ZCUT]], shade(CASE, 0.75), null, 0);
    }
    for (let j = 0; j < NV; j++) { const v0 = 2 * Math.PI * j / NV, v1 = 2 * Math.PI * (j + 1) / NV, p = [[0, 0, Z0], [R * Math.cos(v0), R * Math.sin(v0), Z0], [R * Math.cos(v1), R * Math.sin(v1), Z0]]; if (cutHide(p[1])) continue; quad(p, shade(CASE, 0.18), null, 0); }
  }
  function drawElectrode() {
    const col = '#33342E';
    line3([0, 0, -15.2], [0, 0, -11.78], col, 7); line3([0, 0, -11.78], [0, 0, -11.62], '#9A9A8C', 5);
    line3([1.5, 0, -13.6], [1.5, 0, -10.6], col, 3.4); line3([1.5, 0, -10.6], [0.12, 0, -11.05], col, 3.2);
    if (S.spark > 0) { const k = S.spark; push(len(sub(F1, EYE)) - 0.01, () => { const q = proj(F1); if (!q) return; ctx.save(); ctx.globalAlpha = k; const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 26 * (1.2 - k * 0.5)); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.35, 'rgba(120,150,255,.75)'); g.addColorStop(1, 'rgba(47,69,236,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, 26 * (1.2 - k * 0.5), 0, 7); ctx.fill(); ctx.restore(); }); }
  }
  function drawWater() { for (let j = 0; j < 44; j++) { const v0 = 2 * Math.PI * j / 44, v1 = 2 * Math.PI * (j + 1) / 44, p = [[0, 0, ZCUT], [7.5 * Math.cos(v0), 7.5 * Math.sin(v0), ZCUT], [7.5 * Math.cos(v1), 7.5 * Math.sin(v1), ZCUT]]; if (cutHide(p[1])) continue; quad(p, 'rgba(47,69,236,.085)', null, 0); } }
  const cushRad = t => 7.5 + 1.5 * Math.sin(Math.PI * t) - 1.1 * t;
  function drawCushion() {
    const NV = 40, NT = 9, ZT = 2.0;
    for (let i = 0; i < NT; i++) for (let j = 0; j < NV; j++) {
      const t0 = i / NT, t1 = (i + 1) / NT, r0 = cushRad(t0), r1 = cushRad(t1), z0 = ZCUT + (ZT - ZCUT) * t0, z1 = ZCUT + (ZT - ZCUT) * t1, v0 = 2 * Math.PI * j / NV, v1 = 2 * Math.PI * (j + 1) / NV;
      const p = [[r0 * Math.cos(v0), r0 * Math.sin(v0), z0], [r0 * Math.cos(v1), r0 * Math.sin(v1), z0], [r1 * Math.cos(v1), r1 * Math.sin(v1), z1], [r1 * Math.cos(v0), r1 * Math.sin(v0), z1]];
      if (cutHide(mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25))) continue;
      quad(p, 'rgba(47,69,236,.10)', 'rgba(47,69,236,.10)', .5);
    }
    for (let j = 0; j < NV; j++) { const v0 = 2 * Math.PI * j / NV, v1 = 2 * Math.PI * (j + 1) / NV, r = cushRad(1), a = [r * Math.cos(v0), r * Math.sin(v0), ZT], b = [r * Math.cos(v1), r * Math.sin(v1), ZT]; if (cutHide(a)) continue; line3(a, b, 'rgba(47,69,236,.5)', 1.6); }
  }
  function drawTable() {
    const ZT = 1.95, ZB = 1.2, X0 = -15, X1 = 15, Y0 = -18, Y1 = 18, ST = 2.5;
    for (let x = X0; x < X1 - 0.01; x += ST) for (let y = Y0; y < Y1 - 0.01; y += ST) {
      const cx = x + ST / 2, cy = y + ST / 2;
      if (Math.hypot(cx, cy) < 8.6 || cutHide([cx, cy, ZT])) continue;
      quad([[x, y, ZT], [x + ST, y, ZT], [x + ST, y + ST, ZT], [x, y + ST, ZT]], '#E6E4D7', 'rgba(199,197,182,.55)', .5);
      if (Math.abs(y - Y0) < .01) quad([[x, y, ZB], [x + ST, y, ZB], [x + ST, y, ZT], [x, y, ZT]], '#D6D4C6', null, 0);
      if (Math.abs(x - X0) < .01) quad([[x, y, ZB], [x, y + ST, ZB], [x, y + ST, ZT], [x, y, ZT]], '#DBD9CB', null, 0);
    }
  }
  function bodyPt(th, y) { const n = 2.7, ex = 2 / n, cx = Math.cos(th), cz = Math.sin(th); return [14.5 * Math.sign(cx) * Math.pow(Math.abs(cx), ex), y, 14.4 + 12.4 * Math.sign(cz) * Math.pow(Math.abs(cz), ex)]; }
  // 환자 = 베리(흰 털) 또는 단붕이(갈색 털). 몸통은 같은 초타원 튜브, 머리쪽(+y)에 머리·귀, 다리쪽(−y)에 꼬리
  const furRGB = () => charKey === 'bear' ? '107,58,42' : '236,232,224';
  function drawBody() {
    const NT = 44, NY = 10, Y0 = -17, Y1 = 17, po = patOff(), sh = [po[0], po[1], 0], fur = furRGB();
    for (let i = 0; i < NT; i++) for (let j = 0; j < NY; j++) {
      const t0 = 2 * Math.PI * i / NT, t1 = 2 * Math.PI * (i + 1) / NT, y0 = Y0 + (Y1 - Y0) * j / NY, y1 = Y0 + (Y1 - Y0) * (j + 1) / NY;
      const p = [bodyPt(t0, y0), bodyPt(t1, y0), bodyPt(t1, y1), bodyPt(t0, y1)].map(q => add(q, sh)), cen = mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25);
      if (cen[2] < 1.9 || cen[2] > 18 || cutHide(cen)) continue;
      const n = norm(cross(sub(p[1], p[0]), sub(p[3], p[0]))), t = Math.abs(dot(n, LD));
      quad(p, 'rgba(' + fur + ',' + (0.22 + 0.2 * t).toFixed(3) + ')', null, 0);
    }
    const halfx = 14.5 * Math.pow(Math.max(0, 1 - Math.pow((18 - 14.4) / 12.4, 2.7)), 1 / 2.7);
    for (let y = -17; y < 17 - 0.01; y += 2.5) { const p = [[-halfx, y, 18], [halfx, y, 18], [halfx, y + 2.5, 18], [-halfx, y + 2.5, 18]].map(q => add(q, sh)); if (cutHide([0, y + 1.25, 18])) continue; quad(p, 'rgba(' + fur + ',.40)', 'rgba(150,130,116,.25)', .6); }
    // 머리 (머리쪽 = +y 끝), 귀, 눈·코, 꼬리
    const HC = add([0, 24, 11], sh), HR = charKey === 'bear' ? [7.5, 7, 7] : [6.5, 6, 6];
    ellipsoidMesh(HC, HR, 'rgba(' + fur + ',.55)', 'rgba(120,100,90,.12)', 10, 14);
    ellipsoidMesh(add(HC, [0, 5.5, -1.5]), charKey === 'bear' ? [3.2, 2.2, 2.2] : [2.6, 2.0, 1.8], charKey === 'bear' ? 'rgba(240,217,184,.8)' : 'rgba(230,225,216,.8)', null, 6, 8);   // 주둥이
    dot3(add(HC, [0, 7.4, -1.2]), charKey === 'bear' ? '#1a1a1a' : '#e79aa8', 4, null);                                                                          // 코
    for (const sx of [-1, 1]) {
      if (charKey === 'bear') ellipsoidMesh(add(HC, [sx * 6.5, -2, 3.5]), [2.4, 1.2, 2.4], 'rgba(107,58,42,.8)', null, 6, 8);
      else quad([add(HC, [sx * 3, -2, 5]), add(HC, [sx * 6.5, -3, 4.5]), add(HC, [sx * 4.2, 1, 10])], 'rgba(236,232,224,.9)', 'rgba(230,170,180,.6)', 1);   // 삼각 귀
      dot3(add(HC, [sx * 2.6, 5.2, 2.2]), '#1d2a1f', 2.6, null);                                                                                            // 눈
    }
    const tail = []; for (let i = 0; i <= 12; i++) { const t = i / 12; tail.push(add([Math.sin(t * 2.6) * 7, -19 - t * 10, 4 + Math.sin(t * 3) * 3], sh)); }
    for (let i = 0; i < 12; i++) line3(tail[i], tail[i + 1], charKey === 'bear' ? 'rgba(107,58,42,.9)' : 'rgba(236,232,224,.95)', charKey === 'bear' ? 5 : 7 - i * 0.3);
    // 콩팥
    const K = add(stonePos(), [0, 0.9, 0.3]), KR = [2.6, 4.4, 2.8];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 18; j++) {
      const u0 = Math.PI * i / 12, u1 = Math.PI * (i + 1) / 12, v0 = 2 * Math.PI * j / 18, v1 = 2 * Math.PI * (j + 1) / 18;
      const f = (u, v) => { const bend = 1 - 0.32 * Math.exp(-Math.pow((Math.sin(u) * Math.cos(v) + 1), 2) * 2.2); return [K[0] + KR[0] * Math.sin(u) * Math.cos(v) * bend, K[1] + KR[1] * Math.cos(u), K[2] + KR[2] * Math.sin(u) * Math.sin(v) * bend]; };
      const p = [f(u0, v0), f(u0, v1), f(u1, v1), f(u1, v0)], cen = mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25);
      if (cutHide(cen)) continue;
      const n = norm(cross(sub(p[1], p[0]), sub(p[3], p[0]))), t = Math.abs(dot(n, LD));
      quad(p, 'rgba(176,98,80,' + (0.14 + 0.20 * t).toFixed(3) + ')', null, 0);
    }
  }
  function ellipsoidMesh(C, R, fill, edge, NU2 = 10, NV2 = 14) {
    for (let i = 0; i < NU2; i++) for (let j = 0; j < NV2; j++) {
      const u0 = Math.PI * i / NU2, u1 = Math.PI * (i + 1) / NU2, v0 = 2 * Math.PI * j / NV2, v1 = 2 * Math.PI * (j + 1) / NV2;
      const f = (u, v) => [C[0] + R[0] * Math.sin(u) * Math.cos(v), C[1] + R[1] * Math.cos(u), C[2] + R[2] * Math.sin(u) * Math.sin(v)];
      const p = [f(u0, v0), f(u0, v1), f(u1, v1), f(u1, v0)];
      if (cutHide(mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25))) continue;
      quad(p, fill, edge, .5);
    }
  }
  function drawOrgans() {
    const po = patOff(), sh = [po[0], po[1], 0];
    ellipsoidMesh(add([4.5, 9.5, 14.5], sh), [3.7, 6.2, 4.6], 'rgba(214,130,130,' + (SIM.evLung ? 0.16 : 0.10) + ')', 'rgba(214,130,130,.18)');
    ellipsoidMesh(add([-4.5, 9.5, 14.5], sh), [3.7, 6.2, 4.6], 'rgba(214,130,130,' + (SIM.evLung ? 0.16 : 0.10) + ')', 'rgba(214,130,130,.18)');
    ellipsoidMesh(add([-6.3, 4.5, 13], sh), [2.2, 3.2, 2.2], 'rgba(150,70,110,.18)', 'rgba(150,70,110,.28)', 8, 10);
    for (const b of SIM.blood) { const w = add(b.p, sh); if (cutHide(w)) continue; push(len(sub(w, EYE)), () => { const q = proj(w); if (!q) return; ctx.fillStyle = 'rgba(178,34,30,' + b.a + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, b.r * FOC / q.z, 0, 7); ctx.fill(); }); }
  }
  function drawZone() {
    if (!S.zone) return;
    for (let k = -3; k <= 3; k++) { const z = Cq + ZONE_H * k / 3.2, rr = ZONE_R * Math.sqrt(Math.max(0, 1 - Math.pow(k / 3.4, 2))); for (let j = 0; j < 40; j++) { const v0 = 2 * Math.PI * j / 40, v1 = 2 * Math.PI * (j + 1) / 40, a = [rr * Math.cos(v0), rr * Math.sin(v0), z], b = [rr * Math.cos(v1), rr * Math.sin(v1), z]; if (cutHide(a)) continue; line3(a, b, 'rgba(47,69,236,.30)', 1); } }
    line3([0, 0, Cq - ZONE_H], [0, 0, Cq + ZONE_H], 'rgba(47,69,236,.30)', 1, [3, 4]);
  }
  function cutFaces() {
    if (!S.cut) return;
    const T = [-HDIR[1], HDIR[0], 0], at = s0 => [s0 * T[0], s0 * T[1], 0], fur = furRGB();
    { const Zb = 2.0, Zt = 18, N = 18, X = z => 14.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs((z - 14.4) / 12.4), 2.7)), 1 / 2.7);
      const smax = z => Math.min(Math.abs(T[0]) > 1e-3 ? X(z) / Math.abs(T[0]) : 99, Math.abs(T[1]) > 1e-3 ? 17 / Math.abs(T[1]) : 99);
      for (let i = 0; i < N; i++) { const z0 = Zb + (Zt - Zb) * i / N, z1 = Zb + (Zt - Zb) * (i + 1) / N, a = smax(z0), b = smax(z1); quad([add(at(-a), [0, 0, z0]), add(at(a), [0, 0, z0]), add(at(b), [0, 0, z1]), add(at(-b), [0, 0, z1])], 'rgba(230,200,190,.42)', null, 0); line3(add(at(a), [0, 0, z0]), add(at(b), [0, 0, z1]), 'rgba(' + fur + ',.9)', 2.2); line3(add(at(-a), [0, 0, z0]), add(at(-b), [0, 0, z1]), 'rgba(' + fur + ',.9)', 2.2); } }
    { const N = 26, TH = 0.55;
      for (let i = 0; i < N; i++) { const u0 = UMAX * i / N, u1 = UMAX * (i + 1) / N; for (const sg of [1, -1]) { const A2 = add(at(sg * B * Math.sin(u0)), [0, 0, -A * Math.cos(u0)]), B2 = add(at(sg * B * Math.sin(u1)), [0, 0, -A * Math.cos(u1)]), oA = add(at(sg * (B + TH) * Math.sin(u0)), [0, 0, -(A + TH) * Math.cos(u0)]), oB = add(at(sg * (B + TH) * Math.sin(u1)), [0, 0, -(A + TH) * Math.cos(u1)]); quad([A2, B2, oB, oA], '#7C7D70', '#5E5F54', .6); } } }
    { const ZT = 2.0, NT = 9; for (let i = 0; i < NT; i++) { const t0 = i / NT, t1 = (i + 1) / NT, r0 = cushRad(t0), r1 = cushRad(t1), z0 = ZCUT + (ZT - ZCUT) * t0, z1 = ZCUT + (ZT - ZCUT) * t1; quad([add(at(-r0), [0, 0, z0]), add(at(r0), [0, 0, z0]), add(at(r1), [0, 0, z1]), add(at(-r1), [0, 0, z1])], 'rgba(47,69,236,.10)', null, 0); } }
  }
  let WAVE_LINES = [], WAVE_CREST = [], WAVE_A = 0;
  function drawWave() {
    if (S.s < 0 || S.s > PATH) return;
    const NV = 26, NP = 24, s = S.s, g = [];
    for (let j = 0; j <= NV; j++) { const psi = 2 * Math.PI * j / NV, row = []; for (let i = 0; i <= NP; i++) row.push(wavePt(PHIMAX * i / NP, psi, s)); g.push(row); }
    const fade = 0.9 - 0.35 * Math.abs(s / PATH - 0.5) * 2;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NP; i++) { const p = [g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1]]; if (cutHide(mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25))) continue; quad(p, 'rgba(47,69,236,' + (0.075 * fade).toFixed(3) + ')', null, 0); }
    WAVE_LINES = []; for (let j = 0; j <= NV; j += 2) for (let i = 0; i < NP; i++) { if (cutHide(g[j][i])) continue; WAVE_LINES.push([g[j][i], g[j][i + 1]]); }
    WAVE_A = 0.62 * fade;
    WAVE_CREST = []; const T = [-HDIR[1], HDIR[0], 0], pc = Math.atan2(T[1], T[0]);
    for (const ps of [pc, pc + Math.PI]) { const row = []; for (let i = 0; i <= NP; i++) row.push(wavePt(PHIMAX * i / NP, ps, s)); WAVE_CREST.push(row); }
  }
  function drawRays() {
    for (const psi of [0, 2 * Math.PI / 3, 4 * Math.PI / 3]) for (const ph of [0.42, 0.95, 1.55, 2.15]) {
      const h = hitOf(ph, psi); if (cutHide(h.p)) continue;
      line3(F1, h.p, 'rgba(47,69,236,.38)', 1.1); line3(h.p, F2C, 'rgba(47,69,236,.38)', 1.1);
      if (S.s >= 0 && S.s <= PATH) dot3(wavePt(ph, psi, S.s), ACC, 3.2, PAPER);
    }
  }
  function drawScene() {
    updateCam();
    HDIR = norm([EYE[0] - cam.target[0], EYE[1] - cam.target[1], 0]);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#F4F4EA'); g.addColorStop(1, '#E7E7DA'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawCasing(); drawReflector(); drawElectrode(); drawWater(); drawCushion(); drawTable(); drawBody(); drawOrgans(); cutFaces(); drawZone(); drawRays(); drawWave();
    line3([0, 0, -A - 1], [0, 0, Cq + 5], 'rgba(35,36,29,.22)', 1, [3, 5]);
    dot3(F1, '#E0A200', 4.5, PAPER);
    const SP = stonePos();
    if (S.broken < 1) drawStone(SP, 1, [74, 71, 63]);
    else { const k = Math.min(1, (performance.now() - S.brokeT) / 900); for (let i = 0; i < FRAG.length; i++) drawStone(add(SP, mul(FRAG[i], 0.25 + 1.15 * k)), 0.30 + 0.06 * Math.sin(i * 2.3), [86, 82, 72]); }
    if (S.impact > 0) push(0, () => { const q = proj(F2C); if (!q) return; const k = S.impact, rr = 10 + 46 * (1 - k); ctx.save(); ctx.globalAlpha = k; const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rr); gg.addColorStop(0, 'rgba(255,255,255,.9)'); gg.addColorStop(.4, 'rgba(47,69,236,.5)'); gg.addColorStop(1, 'rgba(47,69,236,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, 7); ctx.fill(); ctx.restore(); });
    flush();
    if (S.s >= 0 && S.s <= PATH) {
      ctx.save(); ctx.strokeStyle = 'rgba(47,69,236,' + WAVE_A.toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
      for (const L of WAVE_LINES) { const a = proj(L[0]), b = proj(L[1]); if (!a || !b) continue; ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } ctx.stroke();
      ctx.strokeStyle = 'rgba(47,69,236,' + Math.min(1, WAVE_A * 1.5).toFixed(3) + ')'; ctx.lineWidth = 2.8; ctx.shadowColor = 'rgba(47,69,236,.45)'; ctx.shadowBlur = 8;
      for (const row of WAVE_CREST) { ctx.beginPath(); let started = false; for (const p of row) { const q = proj(p); if (!q) { started = false; continue; } if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y); } ctx.stroke(); }
      ctx.restore();
    }
    const psiF = Math.atan2(EYE[1], EYE[0]) + (S.cut ? Math.PI : 0), po = patOff();
    label(epoint(UMAX * 0.62, psiF), '반타원체 반사경', '#5F5D52', 16, -6);
    label(F1, '전극 · 고전압 방전', '#8A6A10', 24, 26);
    label([7.0 * Math.cos(psiF), 7.0 * Math.sin(psiF), -0.7], '물주머니', '#4257C9', 16, 4);
    label([12 * Math.cos(psiF), 12 * Math.sin(psiF), 1.95], '환자 테이블', '#7C7A6D', 14, -4);
    label(add([0, 24, 17], [po[0], po[1], 0]), (charKey === 'bear' ? '단붕이' : '베리') + ' (환자)', '#5a2340', 14, -8);
    label(add(stonePos(), [1.6, 0.9, 2.9]), '콩팥', '#9C5A48', 12, -4);
    label(stonePos(), '결석 (F₂)', '#3E3B33', 17, -15);
    if (S.zone) label([0, 0, Cq - ZONE_H], '초점 영역 Ø12 × 60 mm', ACC, 16, 26, true);
    label(add([3.2, 11, 17], [po[0], po[1], 0]), '폐 (충격파에 취약)', SIM.evLung ? '#C0392B' : '#B06868', 14, -6, true);
    label(add([-6.3, 4.5, 15.2], [po[0], po[1], 0]), '비장', '#96466E', 12, -6, true);
    mathLabel(F1, 'F₁', '#8A6A10', -17, -9); mathLabel(F2C, 'F₂', ACC, -18, 6);
    const o = patOff(), d = Math.hypot(o[0], o[1]) * 10;
    $('lithoHud').innerHTML = chip('어긋남', fmt(d, 0) + ' mm', d <= 7) + chip('발수', SIM.shots) + chip('명중률', SIM.shots ? Math.round(100 * SIM.hits / SIM.shots) + '%' : '—') + chip('파쇄', Math.round(SIM.stone * 100) + '%');
  }
  const chip = (k, v, acc) => '<div class="chip' + (acc ? ' acc' : '') + '"><i>' + k + '</i>' + v + '</div>';

  // ---------- 시뮬레이션 ----------
  const pressure = () => 40 * Math.pow(S.kv / 20, 2);
  function fire() { if (S.s >= 0) return; S.s = 0; S.spark = 1; }
  function simAlert(msg, cls) { const a = $('lithoAlert'); a.textContent = msg; a.className = cls || ''; a.classList.add('show'); clearTimeout(simAlert._t); simAlert._t = setTimeout(() => a.classList.remove('show'), 3400); }
  function slog(msg, cls) { const l = $('simLog'), d = document.createElement('div'); if (cls) d.className = cls; d.textContent = '[' + SIM.shots + '발] ' + msg; l.prepend(d); while (l.children.length > 9) l.lastChild.remove(); }
  function addBlood(b, org) { const z = org === 'lung' ? 14.0 : org === 'spleen' ? 13 : Cq + 0.2; for (let k = 0; k < (org === 'soft' ? 1 : 2); k++) SIM.blood.push({ p: [b[0] + (Math.random() - 0.5) * 1.1, b[1] + (Math.random() - 0.5) * 1.1, z + (Math.random() - 0.5) * 1.2], r: 0.14 + Math.random() * 0.16, a: 0.16 + Math.random() * 0.16 }); if (SIM.blood.length > 260) SIM.blood.splice(0, SIM.blood.length - 260); }
  const hemThresh = () => SIM.ramped === false ? 15 : 27;
  function syncAuto() { const b = $('btnAuto2'); b.classList.toggle('pri', S.auto); b.textContent = S.auto ? '연속 정지' : '연속 발사'; }
  function simImpact() {
    SIM.shots++; SIM.kvHist.push(S.kv);
    const o = patOff(), dmm = Math.hypot(o[0], o[1]) * 10, P = pressure(), bodyF = [-o[0], -o[1]];
    if (dmm <= 7) {
      SIM.hits++; SIM.stone = Math.min(1, SIM.stone + 0.022 * (P / 40)); SIM.kid += 0.10 * (P / 40);
      if (SIM.stone >= 1 && !SIM.done) {
        SIM.done = true; S.broken = 1; S.brokeT = performance.now(); S.auto = false; syncAuto();
        simAlert('결석이 완전히 부서졌습니다 — 파편은 소변으로 배출됩니다', 'good'); slog('파쇄 완료. 시술 목표 달성', 'good');
        if (!collected) { collected = true; setTimeout(() => onCollected && onCollected(), 1200); }
      }
    } else {
      const org = organAt(bodyF);
      if (org === 'lung' && S.simShield) { SIM.absorbed++; if (SIM.absorbed % 8 === 1) simAlert('스티로폼 차폐판이 충격파를 막았습니다', 'good'); }
      else {
        addBlood(bodyF, org);
        if (org === 'kidney') { SIM.kid += 1.0 * (P / 40);
          if (SIM.kid >= 7 && !SIM.evHematuria) { SIM.evHematuria = true; simAlert('혈뇨 — 소변에 피가 비칩니다', 'warn'); slog('혈뇨 발생', 'warn'); }
          if (SIM.kid >= hemThresh() && !SIM.evHematoma) { SIM.evHematoma = true; simAlert('신주위 혈종! 콩팥 주위에 피가 고이고 있습니다', 'bad'); slog('신주위 혈종' + (SIM.ramped === false ? ' (고전압 시작이 위험을 키움)' : ''), 'bad'); } }
        else if (org === 'lung') { SIM.lung++; if (SIM.lung >= 5 && !SIM.evLung) { SIM.evLung = true; simAlert('조준 실수! 폐포 출혈 — 기침과 객혈', 'bad'); slog('폐 좌상·객혈', 'bad'); } }
        else if (org === 'spleen') { SIM.spl++; if (SIM.spl >= 6 && !SIM.evSpl) { SIM.evSpl = true; simAlert('비장 피막하 혈종!', 'bad'); slog('비장 피막하 혈종', 'bad'); } }
        else SIM.soft++;
      }
    }
    if (SIM.shots === 40) { const avg = SIM.kvHist.reduce((a, b) => a + b, 0) / SIM.kvHist.length; if (avg > 20.5) { SIM.ramped = false; SIM.kid += 3; slog('처음부터 고전압 — 혈종 위험 증가 (램핑 위반)', 'warn'); } else { SIM.ramped = true; slog('낮은 전압으로 시작 — 올바른 램핑', 'good'); } }
    if (SIM.shots === 3000) { simAlert('권장 발수 3000발을 넘었습니다', 'warn'); slog('발수 한도 초과', 'warn'); }
    updateSimPanel();
  }
  function updateSimPanel() {
    $('c_shots').textContent = SIM.shots; $('c_acc').textContent = SIM.shots ? Math.round(100 * SIM.hits / SIM.shots) + ' %' : '—';
    $('c_stone').textContent = Math.round(SIM.stone * 100) + ' %'; $('barStone').style.width = (SIM.stone * 100) + '%';
    const k = Math.min(100, SIM.kid / hemThresh() * 100);
    $('c_kid').textContent = SIM.evHematoma ? '혈종 발생' : (SIM.evHematuria ? '혈뇨' : fmt(k, 0) + ' %'); $('barKid').style.width = k + '%';
  }
  function newPatient() {
    Object.assign(SIM, { shots: 0, hits: 0, stone: 0, kid: 0, lung: 0, spl: 0, soft: 0, absorbed: 0, done: false, ramped: null, evHematuria: false, evHematoma: false, evLung: false, evSpl: false, kvHist: [], blood: [] });
    S.broken = 0; S.auto = false; syncAuto();
    const r = () => (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 2.2);
    S.pat = [r(), r()]; S.kv = 18; $('sKv2').value = 18; $('nKv2').textContent = '18.0 kV';
    $('simLog').innerHTML = ''; $('repCard').style.display = 'none'; updateSimPanel();
    slog('새 환자 — 결석 위치가 바뀌었습니다. X선을 보고 테이블을 움직이세요');
  }
  // ---------- X선 조준 화면 ----------
  let aimTrail = [];
  function drawAimView() {
    const dpr = Math.min(2, devicePixelRatio || 1), Wp = 200;
    if (aimCv.width !== Wp * dpr) { aimCv.width = Wp * dpr; aimCv.height = Wp * dpr; }
    const x = aimCtx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, Wp, Wp);
    x.fillStyle = '#0D1016'; x.fillRect(0, 0, Wp, Wp);
    const c = Wp / 2, mm = Wp / 108;
    x.strokeStyle = 'rgba(127,216,255,.14)'; x.lineWidth = 1; for (const rr of [10, 20, 30, 40, 50]) { x.beginPath(); x.arc(c, c, rr * mm, 0, 7); x.stroke(); }
    x.strokeStyle = 'rgba(127,216,255,.4)'; x.beginPath(); x.moveTo(c, 8); x.lineTo(c, Wp - 8); x.moveTo(8, c); x.lineTo(Wp - 8, c); x.stroke();
    x.strokeStyle = '#7FD8FF'; x.lineWidth = 1.6; x.beginPath(); x.arc(c, c, 7 * mm, 0, 7); x.stroke();
    const o = patOff(), sx = c + o[0] * 10 * mm, sy = c - o[1] * 10 * mm;
    aimTrail.push([sx, sy]); if (aimTrail.length > 50) aimTrail.shift();
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1; x.beginPath(); aimTrail.forEach((p, i) => { if (i === 0) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]); }); x.stroke();
    x.strokeStyle = 'rgba(214,150,140,.5)'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(sx, sy - 9 * mm, 30 * mm, 47 * mm, 0, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(214,130,130,.45)'; x.beginPath(); x.ellipse(sx + 45 * mm, sy - 95 * mm, 37 * mm, 62 * mm, 0, 0, 7); x.stroke(); x.beginPath(); x.ellipse(sx - 45 * mm, sy - 95 * mm, 37 * mm, 62 * mm, 0, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(150,70,110,.5)'; x.beginPath(); x.ellipse(sx - 63 * mm, sy - 45 * mm, 23 * mm, 33 * mm, 0, 0, 7); x.stroke();
    x.fillStyle = 'rgba(214,130,130,.75)'; x.font = "600 10px 'Malgun Gothic',sans-serif"; x.textAlign = 'center'; x.fillText('▲ 머리쪽', c, 16);
    if (Math.abs(sx - c) > c - 14 || Math.abs(sy - c) > c - 14) { const ang = Math.atan2(sy - c, sx - c), ax = c + Math.cos(ang) * (c - 18), ay = c + Math.sin(ang) * (c - 18); x.save(); x.translate(ax, ay); x.rotate(ang); x.fillStyle = '#FFD98A'; x.beginPath(); x.moveTo(9, 0); x.lineTo(-4, -6); x.lineTo(-4, 6); x.closePath(); x.fill(); x.restore(); x.fillStyle = '#FFD98A'; x.fillText('결석', c + Math.cos(ang) * (c - 34), c + Math.sin(ang) * (c - 34) + 3); }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(sx, sy, 4.2, 0, 7); x.fill(); x.strokeStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(sx, sy, 7, 0, 7); x.stroke();
    const d = Math.hypot(o[0], o[1]) * 10;
    $('aimD').textContent = '어긋남 ' + fmt(d, 0) + ' mm' + (d <= 7 ? ' ✓' : ''); $('aimD').style.color = d <= 7 ? '#5EE0A0' : '#7FD8FF';
  }

  // ---------- 입력 ----------
  let last = null; const touches = new Map(); let pinch = null;
  const localPt = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); last = localPt(ev); touches.set(ev.pointerId, last); });
  cv.addEventListener('pointermove', ev => {
    const p = localPt(ev); if (touches.has(ev.pointerId)) touches.set(ev.pointerId, p);
    if (touches.size === 2) { const v = [...touches.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinch) cam.dist = clamp(cam.dist * pinch / d, 26, 170); pinch = d; last = null; return; }
    if (!last) return; if (ev.pointerType === 'mouse' && ev.buttons === 0) { last = p; return; }
    cam.az -= (p[0] - last[0]) * 0.008; cam.el = clamp(cam.el + (p[1] - last[1]) * 0.006, -0.35, 1.35); last = p;
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(t, ev => { touches.delete(ev.pointerId); if (touches.size < 2) pinch = null; if (t !== 'pointerleave' || !touches.size) last = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.09), 26, 170); }, { passive: false });
  let padStep = 1.0;
  root.querySelectorAll('.pad button[data-d]').forEach(b => b.onclick = () => { const d = b.dataset.d.split(',').map(Number); S.pat[0] = clamp(S.pat[0] + d[0] * padStep, -6, 6); S.pat[1] = clamp(S.pat[1] + d[1] * padStep, -6, 10); });
  $('padStep').onclick = () => { padStep = padStep === 1.0 ? 0.2 : 1.0; $('padStep').textContent = padStep === 1.0 ? '10 mm' : '2 mm'; };
  $('sBr').oninput = e => { S.brAmp = parseFloat(e.target.value) / 10; $('nBr').textContent = '±' + e.target.value + ' mm'; };
  $('btnHold').onclick = () => { if (S.brHold > 0) return; S.brHold = 5; };
  $('tShield').onchange = e => S.simShield = e.target.checked;
  $('btnShot2').onclick = fire;
  $('btnAuto2').onclick = () => { S.auto = !S.auto; syncAuto(); if (S.auto) fire(); };
  $('btnNew').onclick = newPatient;
  $('sKv2').oninput = e => { S.kv = parseFloat(e.target.value); $('nKv2').textContent = fmt(S.kv, 1) + ' kV'; };
  $('btnCut').onclick = () => { S.cut = !S.cut; $('btnCut').classList.toggle('pri', S.cut); $('btnCut').textContent = S.cut ? '단면 끄기' : '단면 보기'; };
  $('btnReset').onclick = () => { cam.az = -1.02; cam.el = 0.42; cam.dist = 66; cam.target = [0, 1.5, 5]; };
  $('btnEnd').onclick = () => {
    S.auto = false; syncAuto();
    const acc = SIM.shots ? Math.round(100 * SIM.hits / SIM.shots) : 0;
    const comps = [SIM.evHematoma ? '신주위 혈종' : null, SIM.evLung ? '폐포 출혈' : null, SIM.evSpl ? '비장 혈종' : null].filter(Boolean);
    let grade = 'A', note = '훌륭합니다. 정확한 조준과 램핑으로 안전하게 끝냈습니다.';
    if (!SIM.done) { grade = comps.length ? 'D' : 'C'; note = comps.length ? '결석은 남았는데 합병증이 생겼습니다. 조준부터 다시.' : '결석이 아직 남았습니다.'; }
    else if (comps.length >= 2 || SIM.evLung) { grade = 'C'; note = '결석은 깼지만 심각한 합병증이 생겼습니다.'; }
    else if (comps.length === 1 || acc < 45) { grade = 'B'; note = '결석 파쇄 성공. 다만 조직 손상이 적지 않았습니다.'; }
    $('repCard').style.display = '';
    $('repBox').innerHTML = '<div class="kv"><span>평가</span><b>' + grade + '</b></div><div class="kv"><span>총 발수 / 명중률</span><b>' + SIM.shots + '발 / ' + acc + '%</b></div><div class="kv"><span>파쇄</span><b>' + Math.round(SIM.stone * 100) + '%</b></div><div class="kv"><span>혈뇨</span><b>' + (SIM.evHematuria ? '있음 (일시적)' : '없음') + '</b></div><div class="kv"><span>합병증</span><b>' + (comps.length ? comps.join(', ') : '없음') + '</b></div><div class="kv"><span>램핑</span><b>' + (SIM.ramped === false ? '위반' : '준수') + '</b></div><div class="note">' + note + '</div>';
  };
  $('lithoClose').onclick = () => close();
  addEventListener('resize', () => { if (open) resize(); });

  let t0 = 0, autoWait = 0;
  function loop(t) {
    if (!open) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - (t0 || t)) / 1000); t0 = t;
    if (S.s >= 0) { S.s += PATH * dt / S.slow; if (S.s >= PATH) { S.s = -1; S.impact = 1; simImpact(); } }
    else if (S.auto) { autoWait -= dt; if (autoWait <= 0) { fire(); autoWait = 0.35; } }
    S.brT += dt;
    if (S.brHold > 0) { S.brHold -= dt; $('btnHold').textContent = '숨 참는 중… ' + fmt(Math.max(0, S.brHold), 0) + '초'; if (S.brHold <= 0) $('btnHold').textContent = '숨 참기 (5초)'; }
    drawAimView();
    if (S.spark > 0) S.spark = Math.max(0, S.spark - dt * 4.5);
    if (S.impact > 0) S.impact = Math.max(0, S.impact - dt * 2.2);
    drawScene();
  }
  function openL(char = 'cat') {
    if (open) return;
    charKey = char; open = true; root.hidden = false;
    $('lithoPatient').textContent = (char === 'bear' ? '🐻 단붕이' : '🐈 베리') + '가 테이블에 누웠어요';
    resize(); newPatient(); t0 = 0; raf = requestAnimationFrame(loop);
  }
  function close() { if (!open) return; open = false; S.auto = false; root.hidden = true; cancelAnimationFrame(raf); }
  return { open: openL, close, get isOpen() { return open; } };
}
