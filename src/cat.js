// 고양이 '베리' — 코드로 만든 로우폴리 모델 + 걷기/달리기/점프/대기 애니메이션.
// Meshy 등으로 만든 GLB가 생기면 main.js 에서 이 모델 대신 불러오면 된다.
import * as THREE from 'three';

export const BERRY_COLORS = {
  fur: 0x9aa0a8,     // 은회색
  stripe: 0x5f646c,  // 등 줄무늬
  white: 0xf4f1ea,   // 가슴·주둥이·발
  pink: 0xf2a7b5,    // 코·귀 안쪽
  eye: 0x1d2a1f,
  iris: 0x8fcf5a,    // 초록 눈
  collar: 0xc2185b,  // 베리색 목걸이
  bell: 0xf5c542,
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function blob(geo, material, pos, scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = true;
  return m;
}

export function createBerry() {
  const C = BERRY_COLORS;
  const M = {
    fur: mat(C.fur), stripe: mat(C.stripe), white: mat(C.white), pink: mat(C.pink),
    eye: mat(C.eye, { roughness: 0.3 }), iris: mat(C.iris, { roughness: 0.3, emissive: 0x1a2a0a }),
    collar: mat(C.collar), bell: mat(C.bell, { metalness: 0.7, roughness: 0.3 }),
  };
  const sphere = new THREE.SphereGeometry(1, 20, 14);

  const root = new THREE.Group();        // 바닥 기준점 (y=0이 발바닥)
  const body = new THREE.Group();        // 통통 튀는 몸통
  root.add(body);

  // 몸통
  body.add(blob(sphere, M.fur, [0, 0.58, 0], [0.34, 0.31, 0.58]));
  body.add(blob(sphere, M.white, [0, 0.5, 0.3], [0.25, 0.24, 0.3]));
  for (let i = 0; i < 3; i++) {
    const s = blob(new THREE.CapsuleGeometry(0.035, 0.42, 4, 8), M.stripe, [0, 0.87, -0.25 + i * 0.2]);
    s.rotation.z = Math.PI / 2;
    s.scale.set(1, 1, 0.7);
    body.add(s);
  }

  // 머리
  const head = new THREE.Group();
  head.position.set(0, 0.92, 0.5);
  body.add(head);
  head.add(blob(sphere, M.fur, [0, 0, 0], [0.3, 0.27, 0.27]));
  head.add(blob(sphere, M.white, [0, -0.08, 0.2], [0.16, 0.11, 0.1]));
  head.add(blob(sphere, M.pink, [0, -0.02, 0.28], [0.035, 0.028, 0.025]));
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.115, 0.04, 0.22);
    eye.add(blob(sphere, M.iris, [0, 0, 0], [0.06, 0.07, 0.04]));
    eye.add(blob(sphere, M.eye, [0, 0, 0.025], [0.025, 0.055, 0.02]));
    eye.add(blob(sphere, M.white, [sx * -0.018, 0.025, 0.04], [0.012, 0.012, 0.01]));
    head.add(eye);

    const ear = new THREE.Group();
    ear.position.set(sx * 0.16, 0.2, -0.02);
    ear.rotation.z = -sx * 0.25;
    ear.add(blob(new THREE.ConeGeometry(0.1, 0.2, 4), M.fur, [0, 0, 0]));
    ear.add(blob(new THREE.ConeGeometry(0.06, 0.13, 4), M.pink, [0, -0.02, 0.03]));
    head.add(ear);

    for (const dy of [-0.02, 0.02]) {           // 수염
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.22), M.white);
      w.position.set(sx * 0.17, -0.07 + dy, 0.22);
      w.rotation.z = Math.PI / 2 + sx * dy * 4;
      head.add(w);
    }
  }

  // 목걸이 + 방울
  const collar = blob(new THREE.TorusGeometry(0.2, 0.03, 8, 20), M.collar, [0, 0.8, 0.42]);
  collar.rotation.x = Math.PI / 2 - 0.5;
  body.add(collar);
  body.add(blob(sphere, M.bell, [0, 0.66, 0.56], [0.045, 0.045, 0.045]));

  // 다리 (엉덩이/어깨에서 회전)
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.3, 4, 10);
  const legs = [];
  for (const [x, z] of [[-0.17, 0.33], [0.17, 0.33], [-0.17, -0.35], [0.17, -0.35]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.48, z);
    pivot.add(blob(legGeo, M.fur, [0, -0.2, 0]));
    pivot.add(blob(sphere, M.white, [0, -0.43, 0.03], [0.09, 0.05, 0.11]));
    root.add(pivot);
    legs.push(pivot);
  }

  // 꼬리 — 관절 7개가 이어진 체인
  const tailJoints = [];
  let parent = body;
  const tailBase = new THREE.Group();
  tailBase.position.set(0, 0.7, -0.52);
  tailBase.rotation.x = -0.9;
  body.add(tailBase);
  parent = tailBase;
  for (let i = 0; i < 7; i++) {
    const j = new THREE.Group();
    j.position.y = i === 0 ? 0 : 0.11;
    const r = 0.055 - i * 0.004;
    j.add(blob(new THREE.CapsuleGeometry(r, 0.08, 4, 8), i >= 5 ? M.stripe : M.fur, [0, 0.05, 0]));
    parent.add(j);
    tailJoints.push(j);
    parent = j;
  }

  let phase = 0, idleT = 0, blinkT = 2;
  const eyes = head.children.filter(c => c.isGroup && c.children.length === 3);

  // speed: 수평 속도(m/s), grounded: 착지 여부, dt: 초
  function update(dt, speed, grounded) {
    idleT += dt;
    const moving = speed > 0.3;
    phase += dt * (moving ? 2.2 + speed * 1.1 : 0);
    const swing = moving ? Math.min(0.9, 0.35 + speed * 0.06) : 0;

    if (grounded) {
      const s = Math.sin(phase * 2 * Math.PI / 2);
      legs[0].rotation.x = s * swing;
      legs[3].rotation.x = s * swing;
      legs[1].rotation.x = -s * swing;
      legs[2].rotation.x = -s * swing;
      body.position.y = moving ? Math.abs(Math.sin(phase * Math.PI)) * 0.05 : Math.sin(idleT * 2) * 0.008;
      body.rotation.x = moving ? Math.sin(phase * Math.PI) * 0.03 : 0;
    } else {
      legs[0].rotation.x = legs[1].rotation.x = -0.7;   // 앞발 뻗기
      legs[2].rotation.x = legs[3].rotation.x = 0.8;    // 뒷발 차기
      body.rotation.x = -0.12;
    }

    head.rotation.y = moving ? 0 : Math.sin(idleT * 0.6) * 0.35;
    head.rotation.x = moving ? Math.sin(phase * Math.PI) * 0.04 : Math.sin(idleT * 0.9) * 0.05;

    const wag = moving ? 0.25 : 0.12;
    tailJoints.forEach((j, i) => {
      j.rotation.z = Math.sin(idleT * (moving ? 6 : 2) - i * 0.6) * wag;
      j.rotation.x = 0.16 + (moving ? -0.05 : 0.02 * i);
    });

    blinkT -= dt;                                        // 눈 깜빡임
    const closed = blinkT < 0.12;
    if (blinkT < 0) blinkT = 2 + Math.random() * 3;
    for (const e of eyes) e.scale.y = closed ? 0.15 : 1;
  }

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { object: root, update };
}
