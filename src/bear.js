// 단붕이 — 사람처럼 걷는 곰돌이 마스코트. 갈색 곰 머리(둥근 귀·베이지 주둥이·검은 코·큰 눈), 자주색 폴로셔츠(흰 깃),
// 베이지 다리, 갈색 발·손, 왼팔에 낀 청록색 책. 걷기 애니메이션 + 자전거 타기 자세.
import * as THREE from 'three';

const C = { fur: 0x6b3a2a, furDark: 0x4e2a1e, muzzle: 0xf0d9b8, skin: 0xf3dcbc, nose: 0x1a1a1a, eye: 0x111111, white: 0xffffff,
  shirt: 0x8e2246, collar: 0xf4ead8, book: 0x1fb8a8, bookPage: 0xf7f4ea, tongue: 0xe0607a };
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
function blob(geo, material, pos, scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material); m.position.set(...pos); m.scale.set(...scale); m.castShadow = true; return m;
}
const lerp = (a, b, t) => a + (b - a) * t;

export function createDanbung() {
  const M = { fur: mat(C.fur), furDark: mat(C.furDark), muzzle: mat(C.muzzle), skin: mat(C.skin), nose: mat(C.nose, { roughness: 0.2 }),
    eye: mat(C.eye, { roughness: 0.2 }), white: mat(C.white), shirt: mat(C.shirt), collar: mat(C.collar), book: mat(C.book), page: mat(C.bookPage), tongue: mat(C.tongue) };
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  body.position.y = 0;

  // 다리 (엉덩이에서 회전) — 베이지 다리 + 갈색 큰 발
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.19, 0.62, 0);
    hip.add(blob(new THREE.CapsuleGeometry(0.13, 0.3, 4, 10), M.skin, [0, -0.2, 0]));
    hip.add(blob(sphere, M.fur, [0, -0.5, 0.06], [0.2, 0.13, 0.26]));      // 발
    body.add(hip); legs.push(hip);
  }
  // 몸통 (셔츠) + 깃 + 아랫배(베이지)
  const torso = blob(sphere, M.shirt, [0, 0.98, 0], [0.42, 0.4, 0.34]);
  body.add(torso);
  body.add(blob(sphere, M.skin, [0, 0.72, 0.02], [0.36, 0.2, 0.3]));
  const collar = blob(new THREE.TorusGeometry(0.2, 0.05, 8, 20), M.collar, [0, 1.3, 0.02]);
  collar.rotation.x = Math.PI / 2; body.add(collar);
  body.add(blob(sphere, M.collar, [0, 1.12, 0.33], [0.05, 0.12, 0.02]));   // 단추 줄
  // 팔 (어깨에서 회전) — 셔츠 소매 + 갈색 손
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.42, 1.2, 0);
    sh.add(blob(new THREE.CapsuleGeometry(0.1, 0.2, 4, 10), M.shirt, [sx * 0.04, -0.14, 0]));
    sh.add(blob(sphere, M.fur, [sx * 0.05, -0.42, 0.02], [0.12, 0.13, 0.12]));
    body.add(sh); arms.push(sh);
  }
  const book = blob(new THREE.BoxGeometry(0.08, 0.34, 0.26), M.book, [-0.56, 0.86, 0.02]);
  book.add(blob(new THREE.BoxGeometry(0.03, 0.3, 0.22), M.page, [0.03, 0, 0]));
  body.add(book);
  // 머리
  const head = new THREE.Group(); head.position.set(0, 1.62, 0.02);
  body.add(head);
  head.add(blob(sphere, M.fur, [0, 0.16, 0], [0.4, 0.38, 0.38]));
  head.add(blob(sphere, M.muzzle, [0, 0.02, 0.3], [0.2, 0.14, 0.14]));
  head.add(blob(sphere, M.nose, [0, 0.09, 0.42], [0.07, 0.05, 0.05]));
  const mouth = blob(sphere, M.tongue, [0, -0.04, 0.37], [0.08, 0.04, 0.05]); head.add(mouth);
  for (const sx of [-1, 1]) {
    head.add(blob(sphere, M.white, [sx * 0.15, 0.24, 0.32], [0.085, 0.1, 0.05]));
    head.add(blob(sphere, M.eye, [sx * 0.14, 0.23, 0.36], [0.045, 0.06, 0.03]));
    head.add(blob(sphere, M.white, [sx * 0.125, 0.26, 0.385], [0.014, 0.014, 0.01]));
    head.add(blob(sphere, M.furDark, [sx * 0.16, 0.35, 0.3], [0.07, 0.015, 0.02]));      // 눈썹
    const ear = blob(sphere, M.fur, [sx * 0.33, 0.48, -0.02], [0.13, 0.13, 0.08]);
    ear.add(blob(sphere, M.muzzle, [0, 0, 0.5], [0.6, 0.6, 0.5]));
    head.add(ear);
  }
  const eyes = head.children.filter((c, i) => c.material === M.eye);

  let phase = 0, idleT = 0, blinkT = 2, riding = 0, rideTarget = 0;
  function update(dt, speed) {
    idleT += dt;
    const moving = speed > 0.3;
    riding = lerp(riding, rideTarget, 1 - Math.exp(-8 * dt));
    phase += dt * (moving ? 2.4 + speed * 0.9 : 0);
    const swing = moving ? Math.min(0.8, 0.3 + speed * 0.05) : 0;
    const s = Math.sin(phase * Math.PI);
    // 걷기: 다리 교차, 팔 반대로. 자전거: 다리를 페달 돌리듯, 팔은 앞으로 뻗어 핸들 잡기
    legs[0].rotation.x = lerp(s * swing, Math.sin(phase * Math.PI * 1.5) * 0.6 - 0.6, riding);
    legs[1].rotation.x = lerp(-s * swing, -Math.sin(phase * Math.PI * 1.5) * 0.6 - 0.6, riding);
    arms[0].rotation.x = lerp(-s * swing * 0.7, -1.1, riding);
    arms[1].rotation.x = lerp(s * swing * 0.7, -1.1, riding);
    arms[0].rotation.z = lerp(0.15, 0.05, riding); arms[1].rotation.z = lerp(-0.15, -0.05, riding);
    body.position.y = lerp(moving ? Math.abs(s) * 0.06 : Math.sin(idleT * 2) * 0.01, 0.55, riding);
    body.rotation.x = lerp(moving ? 0.04 : 0, 0.25, riding);
    head.rotation.y = moving ? Math.sin(phase * Math.PI * 0.5) * 0.06 : Math.sin(idleT * 0.6) * 0.3;
    head.rotation.x = lerp(0, -0.2, riding);
    blinkT -= dt;
    const closed = blinkT < 0.12;
    if (blinkT < 0) blinkT = 2 + Math.random() * 3;
    for (const e of eyes) e.scale.y = closed ? 0.2 : 1;
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { object: root, update, height: 2.1, setRiding(v) { rideTarget = v ? 1 : 0; } };
}
