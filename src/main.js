// 베리의 대치동마실 — 렌더러, 조작(단붕이 방식), 카메라, 밤낮, 랜드마크, HUD, 전체 지도, 동시접속
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBerry } from './cat.js';
import { buildWorld, project, pointInPoly } from './world.js';
import { createTerrain } from './terrain.js';
import { buildCampus } from './campus.js';
import { createTelescope } from './telescope.js';
import { createCars, createBikes } from './vehicles.js';
import { createSky, phaseOf } from './sky.js';
import { createMultiplayer, ROOM } from './multiplayer.js';

const $ = s => document.querySelector(s);
const setLoad = t => { $('#load-msg').textContent = t; };
const nextFrame = () => new Promise(r => setTimeout(r, 16));   // 로딩 문구가 그려질 틈 (숨은 탭에서는 rAF 가 멈추므로 setTimeout)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapAngle = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const angleDamp = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url} (${r.status})`); return r.json(); });
const exists = async url => { if (location.protocol === 'file:') return false; try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; } };

const KIND = {
  school: ['🏫', '학교'], station: ['🚇', '지하철역'], apartment: ['🏢', '아파트 단지'], tower: ['🏙️', '초고층 단지'],
  park: ['🌳', '공원'], library: ['📚', '도서관'], stream: ['🌊', '하천'],
};
const FOUND_KEY = 'berry-daechi:found';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};
const BERRY_GLB = 'assets/models/berry.glb';
const BERRY_GLB_YAW = 0;       // Meshy 모델이 +z 가 아닌 방향을 보고 있으면 여기서 돌린다(라디안)
const SUN_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
const FOG_DAY = 0xcfe6f5;

// ---- 이동 (단붕이 탐험과 같은 값) ----
const PLAYER_SPEED = 11.5;     // m/s. 2km 지도라 실제 걸음보다 훨씬 빠르게 둔 값
const PLAYER_TURN = 2.4;       // rad/s
const RUN_MULT = 1.9;
const ZOOM_MIN = 5, ZOOM_MAX = 46;
const HOLD_MS = 300, HOLD_MOVE_DEADZONE = 14, JOY_MAX = 70, TAP_SLOP = 8;

main().catch(err => {
  console.error(err);
  setLoad(`불러오기 실패: ${err.message} — 'node tools/build-map.mjs' 를 실행했는지, 'node serve.js' 로 열었는지 확인하세요.`);
});

async function main() {
  setLoad('동네 지도를 펼치는 중…');
  const embedded = window.BERRY_DATA;          // 단일 HTML 빌드는 데이터를 파일 안에 담고 있다
  const [map, { landmarks }] = embedded
    ? [embedded.map, embedded]
    : await Promise.all([getJSON('data/map.json'), getJSON('data/landmarks.json')]);

  // ---------- 렌더러 · 장면 · 조명 ----------
  const canvas = $('#game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_DAY);
  scene.fog = new THREE.Fog(FOG_DAY, 260, 1000);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const hemi = new THREE.HemisphereLight(0xeaf4ff, 0xb9a88c, 1.9);
  const sun = new THREE.DirectionalLight(0xfff0da, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 800 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(hemi, sun, sun.target, ambient);
  const sky = createSky(scene, { hemi, sun, ambient, fogColorDay: FOG_DAY });

  // ---------- 랜드마크 좌표 · 교체 모델 ----------
  for (const lm of landmarks) Object.assign(lm, project(map.origin, lm.lat, lm.lon), { radius: lm.radius ?? 35 });
  const skipZones = [];
  for (const lm of landmarks) {
    if (lm.model && await exists(lm.model)) {
      lm.hasModel = true;
      skipZones.push({ x: lm.x, z: lm.z, r: lm.replaceRadius ?? 30 });
    }
  }

  // 단대부고 캠퍼스(원점을 품은 이름 없는 학교 구역)는 언덕 위에 있고, 서쪽 정문에서 골목이 올라온다
  const campusPoly = map.areas.find(a => a.k === 'school' && !a.n && pointInPoly(a.p, 0, 0))?.p ?? [-60, -60, 60, -60, 60, 60, -60, 60];
  const GATE = { x: -85, z: 3.5 }, DIR_IN = { x: 0.93, z: -0.36 };
  const terrain = createTerrain(campusPoly, GATE, DIR_IN);

  setLoad(`건물 ${map.buildings.length.toLocaleString()}채 세우는 중…`);
  await nextFrame();
  const world = buildWorld(scene, map, { skipZones, skipPoly: campusPoly, terrain });
  setLoad('단대부고 캠퍼스를 짓는 중…');
  await nextFrame();
  const campus = buildCampus(scene, world, map, terrain, { campus: campusPoly, gate: GATE, dirIn: DIR_IN });

  const loader = new GLTFLoader();
  for (const lm of landmarks.filter(l => l.hasModel)) {
    setLoad(`${lm.name} 모델 불러오는 중…`);
    try { await placeLandmarkModel(lm); } catch (e) { console.warn(`${lm.model} 불러오기 실패`, e); }
  }
  async function placeLandmarkModel(lm) {
    const obj = (await loader.loadAsync(lm.model)).scene;
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.multiplyScalar((lm.modelHeight ?? 20) / (size.y || 1));
    obj.rotation.y = THREE.MathUtils.degToRad(lm.modelYaw ?? 0);
    let box = new THREE.Box3().setFromObject(obj);
    obj.position.set(lm.x - (box.min.x + box.max.x) / 2, -box.min.y, lm.z - (box.min.z + box.max.z) / 2);
    obj.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    scene.add(obj);
    box = new THREE.Box3().setFromObject(obj);
    world.addBoxCollider(box.min.x, box.min.z, box.max.x, box.max.z, box.max.y);
  }

  // ---------- 자동차 · 자전거 ----------
  setLoad('자동차와 자전거를 놓는 중…');
  await nextFrame();
  const cars = createCars(scene, world.driveRoads, 14, terrain.y);
  const bikeSpots = [];
  const exits = map.pois.filter(p => p.k === 'exit');
  for (const e of exits) {
    if (bikeSpots.length >= 26) break;
    const s = world.findOpenSpot(e.x + 6, e.z + 6, 4, 30);
    if (bikeSpots.some(b => Math.hypot(b.x - s.x, b.z - s.z) < 12)) continue;
    bikeSpots.push({ x: s.x, z: s.z, yaw: (bikeSpots.length % 2) * Math.PI / 2, count: 4 + (bikeSpots.length % 3) });
  }
  const dandae = landmarks.find(l => l.id === 'dandae');
  if (dandae) {   // 정문 안쪽 옆 빈터 (도로 밖)
    const s = world.findOpenSpot(GATE.x + DIR_IN.x * 24 - DIR_IN.z * 12, GATE.z + DIR_IN.z * 24 + DIR_IN.x * 12, 4, 40);
    bikeSpots.push({ x: s.x, z: s.z, yaw: Math.atan2(DIR_IN.x, DIR_IN.z), count: 6 });
  }
  const bikes = createBikes(scene, bikeSpots, terrain.y);

  // ---------- 베리 ----------
  setLoad('베리 깨우는 중…');
  let berry = createBerry();
  if (await exists(BERRY_GLB)) {
    try { berry = await loadBerryModel(); } catch (e) { console.warn('berry.glb 불러오기 실패 — 기본 베리 사용', e); }
  }
  scene.add(berry.object);
  async function loadBerryModel() {
    const gltf = await loader.loadAsync(BERRY_GLB);
    const obj = gltf.scene;
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(1.2 / (size.y || 1));
    obj.rotation.y = BERRY_GLB_YAW;
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const root = new THREE.Group();
    root.add(obj);
    const mixer = gltf.animations.length ? new THREE.AnimationMixer(obj) : null;
    const action = mixer?.clipAction(gltf.animations[0]).play();
    return {
      object: root,
      update(dt, speed) { if (mixer) { action.timeScale = speed > 0.3 ? speed / 4 : 0.15; mixer.update(dt); } },
    };
  }

  // ---------- 랜드마크 표시 ----------
  const found = new Set(store.get(FOUND_KEY, []).filter(id => landmarks.some(l => l.id === id)));
  const beamGeo = new THREE.CylinderGeometry(1.1, 1.1, 90, 16, 1, true).translate(0, 45, 0);
  const ringGeo = new THREE.RingGeometry(2.6, 3.4, 40).rotateX(-Math.PI / 2);
  const PINK = 0xff5c9a, MINT = 0x2fcf9c;

  function makeLabel(text, small = false) {
    const font = `700 ${small ? 36 : 44}px "Malgun Gothic", "Apple SD Gothic Neo", "Segoe UI Emoji", sans-serif`;
    const c = document.createElement('canvas');
    let g = c.getContext('2d');
    g.font = font;
    c.width = Math.ceil(g.measureText(text).width) + 56;
    c.height = small ? 70 : 84;
    g = c.getContext('2d');
    g.font = font;
    g.fillStyle = 'rgba(255, 251, 244, 0.94)';
    g.strokeStyle = small ? '#8fb7e8' : '#e88fb2';
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(3, 3, c.width - 6, c.height - 6, 38);
    g.fill();
    g.stroke();
    g.fillStyle = '#5a2340';
    g.textBaseline = 'middle';
    g.fillText(text, 28, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.userData.aspect = c.width / c.height;
    sprite.renderOrder = 20;
    return sprite;
  }
  for (const lm of landmarks) {
    const group = new THREE.Group();
    group.position.set(lm.x, terrain.y(lm.x, lm.z), lm.z);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.2, depthWrite: false }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 0.2;
    const label = makeLabel(`${KIND[lm.kind]?.[0] ?? '📍'} ${lm.name}`);
    group.add(beam, ring, label);
    scene.add(group);
    lm.marker = { beam, ring, label };
    paintMarker(lm);
  }
  function paintMarker(lm) {
    const c = found.has(lm.id) ? MINT : PINK;
    lm.marker.beam.material.color.setHex(c);
    lm.marker.ring.material.color.setHex(c);
  }

  // ---------- 플레이어 · 입력 (단붕이 방식: 회전 + 전진/후진, 톡/끌기/꾹 누르기, 핀치) ----------
  const spawn = { x: GATE.x - DIR_IN.x * 14, z: GATE.z - DIR_IN.z * 14 };      // 단대부고 정문 앞 오르막길, 정문을 바라보고
  const spawnYaw = Math.atan2(DIR_IN.x, DIR_IN.z);
  const player = { pos: new THREE.Vector3(spawn.x, terrain.y(spawn.x, spawn.z), spawn.z), yaw: spawnYaw, speed: 0, walkT: 0, running: false };
  const orbit = { azimuth: player.yaw + Math.PI, pitch: 0.42, radius: 12, dragging: false, moved: false, lastX: 0, lastY: 0 };
  const input = { fwd: false, back: false, left: false, right: false, run: false };
  const keyHeld = { fwd: false, back: false, left: false, right: false, run: false };
  const keyMap = { ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ShiftLeft: 'run', ShiftRight: 'run' };
  const clock = new THREE.Clock();
  let started = false, cardOpen = false, nearest = null, mapShown = true, nearTelescope = false;
  const telescope = createTelescope({ isNight: () => sky.isNight });
  const uiBlocking = () => cardOpen || !started || telescope.isOpen;

  // e.code 가 비어 오는 환경(일부 가상 키보드·자동화)을 위해 e.key 로 보충
  const codeOf = e => {
    if (e.code) return e.code;
    const k = e.key ?? '';
    if (k === ' ') return 'Space';
    if (k === 'Shift') return 'ShiftLeft';
    if (/^[a-z]$/i.test(k)) return 'Key' + k.toUpperCase();
    return k;
  };
  addEventListener('keydown', e => {
    const code = codeOf(e);
    const k = keyMap[code];
    if (k) { input[k] = keyHeld[k] = true; e.preventDefault(); }
    if (!started) { if ((code === 'Enter' || code === 'NumpadEnter') && !$('#start').hidden) start(); return; }
    if (e.repeat) return;
    if (telescope.isOpen) { if (code === 'Escape') telescope.close(); return; }
    switch (code) {
      case 'KeyE': if (cardOpen) closeCard(); else if (nearTelescope) telescope.open(); else if (nearest) openCard(nearest); break;
      case 'Escape': closeCard(); break;
      case 'KeyM': setMapShown(!mapShown); break;
      case 'KeyR': respawn(); break;
      case 'KeyH': $('#help').hidden = !$('#help').hidden; break;
    }
  });
  addEventListener('keyup', e => { const k = keyMap[codeOf(e)]; if (k) input[k] = keyHeld[k] = false; });
  addEventListener('blur', () => { for (const k in input) input[k] = keyHeld[k] = false; resetAllPointers(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetAllPointers(); });

  // 터치용 방향 버튼 (누르고 있는 동안)
  function bindHold(id, key) {
    const el = $(id);
    const set = v => ev => { ev.preventDefault(); input[key] = v; };
    el.addEventListener('pointerdown', set(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, set(false));
  }
  bindHold('#btn-up', 'fwd'); bindHold('#btn-down', 'back'); bindHold('#btn-left', 'left'); bindHold('#btn-right', 'right'); bindHold('#btn-run', 'run');
  if ('ontouchstart' in window) $('#dpad').hidden = false;

  // --- 포인터: 톡 = 근처 장소 보기, 짧게 끌기 = 시점 회전, 꾹 누른 채(300ms) = 가상 조이스틱 이동, 두 손가락 = 핀치 줌 ---
  let touchMoveMode = false, holdTimer = null, holdStartX = 0, holdStartY = 0, activePointerId = null;
  const activePointers = new Map();
  const pinch = { active: false, startDist: 0, startRadius: 12 };
  let suppressPick = false;
  const joyEl = $('#joystick'), joyKnob = $('#joystick-knob');
  const zoomSlider = $('#zoom-slider');
  zoomSlider.value = orbit.radius;
  zoomSlider.addEventListener('input', () => { orbit.radius = parseFloat(zoomSlider.value); });
  function setZoom(r) { orbit.radius = clamp(r, ZOOM_MIN, ZOOM_MAX); zoomSlider.value = orbit.radius; }
  function pinchDistance() {
    const [a, b] = [...activePointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  function clearTouchMove() {
    touchMoveMode = false;
    for (const k of ['fwd', 'back', 'left', 'right']) input[k] = keyHeld[k];   // 키보드로 누르고 있던 키는 유지
    joyEl.hidden = true;
  }
  function enterTouchMove(x, y) {
    touchMoveMode = true;
    holdStartX = x; holdStartY = y;
    joyEl.style.left = x + 'px'; joyEl.style.top = y + 'px';
    joyEl.hidden = false;
    joyKnob.style.transform = 'translate(-50%,-50%)';
  }
  function updateJoystick(x, y) {
    let dx = x - holdStartX, dy = y - holdStartY;
    input.fwd = dy < -HOLD_MOVE_DEADZONE; input.back = dy > HOLD_MOVE_DEADZONE;
    input.left = dx < -HOLD_MOVE_DEADZONE; input.right = dx > HOLD_MOVE_DEADZONE;
    const d = Math.hypot(dx, dy);
    if (d > JOY_MAX) { dx = dx / d * JOY_MAX; dy = dy / d * JOY_MAX; }
    joyKnob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
  }
  function startPinch() {
    clearTimeout(holdTimer);
    if (touchMoveMode) clearTouchMove();
    orbit.dragging = false;
    suppressPick = true;
    pinch.active = true;
    pinch.startDist = pinchDistance();
    pinch.startRadius = orbit.radius;
  }
  function endPointer() {
    clearTimeout(holdTimer);
    if (touchMoveMode) clearTouchMove();
    orbit.dragging = false;
    activePointerId = null;
  }
  function resetAllPointers() { activePointers.clear(); pinch.active = false; suppressPick = false; endPointer(); }
  canvas.addEventListener('pointerdown', e => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) { startPinch(); return; }
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    orbit.dragging = true; orbit.moved = false; suppressPick = false;
    orbit.lastX = holdStartX = e.clientX; orbit.lastY = holdStartY = e.clientY;
    clearTimeout(holdTimer);
    if (e.pointerType === 'mouse') return;      // 마우스는 길게 눌러도 이동 모드로 안 감 (PC 는 키보드로 걷는다)
    holdTimer = setTimeout(() => {
      if (uiBlocking() || activePointers.size >= 2) return;
      if (orbit.dragging) enterTouchMove(orbit.lastX, orbit.lastY);
    }, HOLD_MS);
  });
  addEventListener('pointermove', e => {
    if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.active && activePointers.size >= 2) {
      const d = pinchDistance();
      if (d > 4 && pinch.startDist > 4) setZoom(pinch.startRadius * (pinch.startDist / d));
      return;
    }
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if (touchMoveMode) { updateJoystick(e.clientX, e.clientY); return; }
    if (!orbit.dragging) return;
    if (Math.hypot(e.clientX - holdStartX, e.clientY - holdStartY) > TAP_SLOP) orbit.moved = true;   // 탭/드래그는 시작점 기준
    orbit.azimuth -= (e.clientX - orbit.lastX) * 0.007;
    orbit.pitch = clamp(orbit.pitch + (e.clientY - orbit.lastY) * 0.007, 0.08, 1.45);
    orbit.lastX = e.clientX; orbit.lastY = e.clientY;
  });
  function releasePointer(e, doPick) {
    const tracked = activePointers.has(e.pointerId);
    if (!tracked && activePointers.size > 0) return;      // HUD 버튼에서 뗀 손가락이 걷는 손가락을 건드리면 안 됨
    activePointers.delete(e.pointerId);
    if (pinch.active && activePointers.size < 2) {
      pinch.active = false;
      const rest = [...activePointers.entries()][0];
      if (rest) {
        const [id, p] = rest;
        orbit.lastX = holdStartX = p.x; orbit.lastY = holdStartY = p.y;
        activePointerId = id; orbit.dragging = true; orbit.moved = true;
      }
    }
    if (activePointers.size === 0) {
      const wasMove = touchMoveMode, wasDrag = orbit.dragging, moved = orbit.moved, blocked = suppressPick;
      endPointer();
      suppressPick = false;
      if (doPick && !blocked && !wasMove && wasDrag && !moved) onTap();
    }
  }
  addEventListener('pointerup', e => releasePointer(e, true));
  addEventListener('pointercancel', e => releasePointer(e, false));
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(orbit.radius + e.deltaY * 0.02); }, { passive: false });
  for (const [id, dir] of [['#zoom-in', -1], ['#zoom-out', 1]]) {
    const el = $(id);
    let timer = null;
    const step = () => setZoom(orbit.radius + dir * 2.2);
    el.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); step(); clearInterval(timer); timer = setInterval(step, 90); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearInterval(timer));
  }
  function onTap() {
    if (!started || telescope.isOpen) return;
    if (cardOpen) { closeCard(); return; }
    if (nearTelescope) telescope.open(); else if (nearest) openCard(nearest);
  }

  function respawn() {
    player.pos.set(spawn.x, terrain.y(spawn.x, spawn.z), spawn.z);
    player.yaw = spawnYaw;
    orbit.azimuth = player.yaw + Math.PI;
    toast('🏫 단대부고 앞으로 돌아왔어요');
  }

  const _step = new THREE.Vector3();
  function updatePlayer(dt) {
    if (uiBlocking()) { player.speed = 0; return; }
    if (input.left) player.yaw += PLAYER_TURN * dt;
    if (input.right) player.yaw -= PLAYER_TURN * dt;
    const move = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
    player.running = !!input.run && move !== 0;
    if (move !== 0) {
      const spd = PLAYER_SPEED * (player.running ? RUN_MULT : 1);
      _step.set(player.pos.x + Math.sin(player.yaw) * move * spd * dt, player.pos.y, player.pos.z + Math.cos(player.yaw) * move * spd * dt);
      world.collide(_step, 0.45);
      player.speed = Math.hypot(_step.x - player.pos.x, _step.z - player.pos.z) / Math.max(dt, 1e-4);
      player.pos.x = _step.x; player.pos.z = _step.z;
    } else player.speed = 0;
    player.pos.y = terrain.y(player.pos.x, player.pos.z);   // 언덕을 따라 오르내린다
  }

  // ---------- 카메라 (궤도; 걷는 동안 등 뒤로 따라옴, 건물에 가리면 당겨짐) ----------
  const camDir = new THREE.Vector3();
  let camCur = orbit.radius;
  function updateCamera(dt) {
    const moving = input.fwd || input.back || input.left || input.right;
    if (moving && (!orbit.dragging || touchMoveMode)) orbit.azimuth = angleDamp(orbit.azimuth, player.yaw + Math.PI, 1 - Math.pow(0.0005, dt), 1);
    const fx = player.pos.x, fy = player.pos.y + 0.9, fz = player.pos.z;
    const cp = Math.cos(orbit.pitch);
    camDir.set(Math.sin(orbit.azimuth) * cp, Math.sin(orbit.pitch), Math.cos(orbit.azimuth) * cp);
    let d = orbit.radius;
    for (let s = 1; s <= orbit.radius; s += 0.7) {
      if (world.solidAt(fx + camDir.x * s, fy + camDir.y * s, fz + camDir.z * s)) { d = Math.max(1.4, s - 0.8); break; }
    }
    camCur = d < camCur ? d : damp(camCur, d, 4, dt);
    camera.position.set(fx + camDir.x * camCur, fy + camDir.y * camCur + 0.6, fz + camDir.z * camCur);
    camera.lookAt(fx, fy + 0.4, fz);
  }

  // ---------- 랜드마크 근접 · 발견 · 카드 ----------
  function updateLandmarks(t) {
    nearest = null;
    let nd = Infinity;
    for (const lm of landmarks) {
      const d = Math.hypot(player.pos.x - lm.x, player.pos.z - lm.z);
      lm.dist = d;
      const { beam, ring, label } = lm.marker;
      ring.scale.setScalar(1 + Math.sin(t * 2.4 + lm.x) * 0.07);
      beam.material.opacity = d < lm.radius ? 0.08 : 0.2;
      const s = clamp(d / 60, 1, 6) * 2.8;
      label.scale.set(s * label.userData.aspect, s, 1);
      label.position.y = 12 + s * 1.2;
      label.material.opacity = clamp(1.6 - d / 650, 0, 1);
      label.visible = label.material.opacity > 0.02;
      if (d < lm.radius && d < nd) { nd = d; nearest = lm; }
    }
    if (nearest && !found.has(nearest.id)) discover(nearest);
    const ts = campus.telescopeSpot;
    nearTelescope = Math.hypot(player.pos.x - ts.x, player.pos.z - ts.z) < 7;
    const prompt = $('#prompt');
    prompt.hidden = !started || cardOpen || telescope.isOpen || !(nearest || nearTelescope);
    if (nearTelescope) prompt.innerHTML = `<kbd>E</kbd> 🔭 옥상 천문대에 올라가기 (화면을 톡 눌러도 돼요)`;
    else if (nearest) prompt.innerHTML = `<kbd>E</kbd> ${KIND[nearest.kind]?.[0] ?? '📍'} ${nearest.name} 둘러보기 (화면을 톡 눌러도 돼요)`;
  }
  function discover(lm) {
    found.add(lm.id);
    store.set(FOUND_KEY, [...found]);
    paintMarker(lm);
    if (found.size === landmarks.length) toast(`🎉 모든 장소를 발견했어요! 베리는 이제 대치동 토박이 (${found.size}/${landmarks.length})`, 5000);
    else toast(`🐾 새 장소 발견! ${lm.name} (${found.size}/${landmarks.length})`);
  }
  const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  function openCard(lm) {
    const card = $('#card');
    card.querySelector('.emoji').textContent = KIND[lm.kind]?.[0] ?? '📍';
    card.querySelector('.kind').textContent = KIND[lm.kind]?.[1] ?? '장소';
    card.querySelector('h2').textContent = lm.name;
    card.querySelector('.desc').textContent = lm.desc;
    const d0 = Math.hypot(lm.x, lm.z);
    const dir = DIRS[Math.round(((Math.atan2(lm.x, -lm.z) * 180 / Math.PI) + 360) % 360 / 45) % 8];
    card.querySelector('.meta').textContent = d0 < 50 ? '🐾 베리의 산책 출발점' : `🧭 단대부고에서 ${dir}쪽으로 약 ${Math.round(d0 / 10) * 10}m`;
    card.hidden = false;
    cardOpen = true;
  }
  function closeCard() { $('#card').hidden = true; cardOpen = false; }
  $('#card-close').addEventListener('click', closeCard);
  $('#card').addEventListener('click', e => { if (e.target.id === 'card') closeCard(); });

  let toastTimer = 0;
  function toast(text, ms = 2800) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ---------- HUD · 전체 지도 (항상 표시) ----------
  function updateHud() {
    const road = world.roadAt(player.pos.x, player.pos.z);
    const near = landmarks.filter(l => l.dist < 160).sort((a, b) => a.dist - b.dist)[0];
    $('#where').textContent = `📍 ${road ?? '골목 · 단지 안'}${near ? ` · ${near.name} 근처` : ''}`;
    const shops = world.poisNear(player.pos.x, player.pos.z, 35);
    $('#nearby').textContent = shops.length ? `주변: ${shops.map(p => p.n).join(' · ')}` : '';
    $('#found').textContent = `발견한 장소 ${found.size} / ${landmarks.length}`;
    const ph = phaseOf(clock.elapsedTime);
    const badge = $('#time-badge');
    badge.textContent = ph.text;
    badge.className = ph.cls;
  }
  const B = world.bounds, img = world.mapImage;
  const bm = $('#bigmap-canvas'), bg = bm.getContext('2d');
  const mapWrap = $('#bigmap');
  function setMapShown(v) { mapShown = v; mapWrap.hidden = !v; }
  function drawArrow(g, x, y, yaw, size) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI - yaw);
    g.beginPath();
    g.moveTo(0, -size); g.lineTo(size * 0.72, size * 0.78); g.lineTo(0, size * 0.38); g.lineTo(-size * 0.72, size * 0.78);
    g.closePath();
    g.fillStyle = '#c2185b'; g.strokeStyle = '#fff'; g.lineWidth = size * 0.22;
    g.fill(); g.stroke();
    g.restore();
  }
  let peerList = [];
  function drawBigMap() {
    const dpr = Math.min(devicePixelRatio, 2);
    const cw = mapWrap.clientWidth - 16, ch = Math.round(cw * img.height / img.width);
    if (cw < 40) return;
    if (bm.width !== Math.round(cw * dpr)) { bm.width = Math.round(cw * dpr); bm.height = Math.round(ch * dpr); bm.style.width = cw + 'px'; bm.style.height = ch + 'px'; }
    const k = bm.width / img.width;
    bg.drawImage(img, 0, 0, bm.width, bm.height);
    bg.textAlign = 'center'; bg.textBaseline = 'middle';
    const dotR = Math.max(4, 7 * dpr * cw / 520);
    for (const lm of landmarks) {
      const x = (lm.x - B.minX) * k, y = (lm.z - B.minZ) * k, got = found.has(lm.id);
      bg.beginPath(); bg.arc(x, y, dotR, 0, Math.PI * 2);
      bg.fillStyle = got ? '#2fcf9c' : '#ff5c9a'; bg.fill();
      bg.lineWidth = 1.5 * dpr; bg.strokeStyle = '#fff'; bg.stroke();
      if (cw >= 300) {
        bg.font = `700 ${Math.max(9, 10.5 * dpr * cw / 520)}px "Malgun Gothic", sans-serif`;
        bg.lineWidth = 3 * dpr; bg.strokeStyle = 'rgba(255,255,255,.95)';
        const name = got ? lm.name : '???';
        bg.strokeText(name, x, y + dotR + 7 * dpr);
        bg.fillStyle = '#5a2340'; bg.fillText(name, x, y + dotR + 7 * dpr);
      }
    }
    for (const p of peerList) {
      const x = (p.x - B.minX) * k, y = (p.z - B.minZ) * k;
      bg.beginPath(); bg.arc(x, y, dotR * 0.8, 0, Math.PI * 2); bg.fillStyle = '#3f7fd0'; bg.fill();
      bg.lineWidth = 1.2 * dpr; bg.strokeStyle = '#fff'; bg.stroke();
    }
    drawArrow(bg, (player.pos.x - B.minX) * k, (player.pos.z - B.minZ) * k, player.yaw, Math.max(7, 11 * dpr * cw / 520));
  }
  mapWrap.addEventListener('click', () => setMapShown(false));
  $('#map-btn').addEventListener('click', () => setMapShown(true));

  // ---------- 동시접속 (다른 친구들도 고양이로 보인다) ----------
  const peers = new Map();      // id -> {cat, tag, target}
  const mpStatus = $('#mp-status');
  const mp = createMultiplayer({
    onStatus(state, text) {
      mpStatus.hidden = false;
      mpStatus.className = state || '';
      $('#mp-status-text').textContent = text;
    },
    onPeers(list) {
      peerList = list;
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        let peer = peers.get(p.id);
        if (!peer) {
          const cat = createBerry();
          cat.object.position.set(p.x, 0, p.z);
          const tag = makeLabel(p.name, true);
          tag.position.y = 1.9;
          tag.scale.set(1.9 * tag.userData.aspect, 1.9, 1);
          cat.object.add(tag);
          scene.add(cat.object);
          peer = { cat, tag, name: p.name, x: p.x, z: p.z, ry: p.ry };
          peers.set(p.id, peer);
        }
        if (peer.name !== p.name) { peer.cat.object.remove(peer.tag); peer.tag = makeLabel(p.name, true); peer.tag.position.y = 1.9; peer.tag.scale.set(1.9 * peer.tag.userData.aspect, 1.9, 1); peer.cat.object.add(peer.tag); peer.name = p.name; }
        peer.x = p.x; peer.z = p.z; peer.ry = p.ry;
      }
      for (const [id, peer] of peers) if (!seen.has(id)) { scene.remove(peer.cat.object); peers.delete(id); }
    },
  });
  function updatePeers(dt) {
    for (const peer of peers.values()) {
      const o = peer.cat.object, k = Math.min(1, dt * 8);
      const dx = (peer.x - o.position.x) * k, dz = (peer.z - o.position.z) * k;
      o.position.x += dx; o.position.z += dz;
      o.position.y = terrain.y(o.position.x, o.position.z);
      o.rotation.y = peer.ry;
      peer.cat.update(dt, Math.hypot(dx, dz) / Math.max(dt, 1e-4) * 0.4, true);
    }
  }

  // ---------- 시작 · 메인 루프 ----------
  let playerName = '베리';
  function start() {
    started = true;
    const typed = $('#player-name').value.trim();
    playerName = typed ? typed.slice(0, 10) : '베리';
    $('#loading').hidden = true;
    $('#hud').hidden = false;
    clock.getDelta();
    toast(`🐈 ${playerName}, 단대부고 앞에 도착했어요! ↑ 로 걷고 ←→ 로 돌아요`);
    mp.connect(playerName);
  }
  $('#start').addEventListener('click', start);
  addEventListener('beforeunload', () => mp.leave());

  let frame = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    frame++;
    const f = sky.update(t);
    const night = Math.pow(1 - f, 1.2);
    world.setNight(night);
    cars.setNight(night);
    campus.setNight(night);
    if (telescope.isOpen && frame % 30 === 0) telescope.refreshNight();
    updatePlayer(dt);
    berry.object.position.copy(player.pos);
    berry.object.rotation.y = player.yaw;
    berry.update(dt, player.speed * 0.4, true);
    updateCamera(dt);
    sky.follow(player.pos.x, player.pos.z);
    sun.position.set(player.pos.x + SUN_DIR.x * 300, SUN_DIR.y * 300, player.pos.z + SUN_DIR.z * 300);
    sun.target.position.set(player.pos.x, 0, player.pos.z);
    cars.update(dt);
    updateLandmarks(t);
    updatePeers(dt);
    if (started) {
      if (frame % 6 === 0) updateHud();
      if (mapShown && frame % 3 === 0) drawBigMap();
      mp.send(t, player.pos.x, player.pos.z, player.yaw);
    }
    renderer.render(scene, camera);
  });

  window.__berry = { player, orbit, world, landmarks, found, cars, input, sky, renderer, scene, camera, clock, setMapShown, terrain, campus, telescope };   // 디버그·테스트용
  setLoad(`건물 ${world.buildingCount.toLocaleString()}채 · 나무 ${world.treeCount.toLocaleString()}그루 · 가로등 ${world.lampCount.toLocaleString()}개 · 담장 ${(world.wallLen / 1000).toFixed(1)}km · 자동차 ${cars.count}대 · 자전거 ${bikes.count}대 · 방 "${ROOM}"`);
  $('#start').hidden = false;
}
