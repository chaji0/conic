// 하늘과 밤낮 주기 — 낮 60초 → 해질녘 30초 → 밤 60초 → 새벽 30초 (총 3분)
// dayFactor: 1 = 밝은 낮, 0 = 한밤. 하늘 돔·별·해·달·조명 세기·안개 색을 매 프레임 맞춘다.
import * as THREE from 'three';

export const DAY_LEN = 60, DUSK_LEN = 30, NIGHT_LEN = 60, DAWN_LEN = 30;
export const CYCLE_LEN = DAY_LEN + DUSK_LEN + NIGHT_LEN + DAWN_LEN;

export function computeDayFactor(t) {
  const p = t % CYCLE_LEN;
  if (p < DAY_LEN) return 1;
  if (p < DAY_LEN + DUSK_LEN) return 1 - (p - DAY_LEN) / DUSK_LEN;
  if (p < DAY_LEN + DUSK_LEN + NIGHT_LEN) return 0;
  return (p - (DAY_LEN + DUSK_LEN + NIGHT_LEN)) / DAWN_LEN;
}
export function phaseOf(t) {
  const p = t % CYCLE_LEN;
  if (p < DAY_LEN) return { text: '☀️ 낮', cls: 'day' };
  if (p < DAY_LEN + DUSK_LEN) return { text: '🌇 해질녘', cls: 'dusk' };
  if (p < DAY_LEN + DUSK_LEN + NIGHT_LEN) return { text: '🌙 밤', cls: 'night' };
  return { text: '🌄 새벽', cls: 'dusk' };
}

const SKY = {
  dayTop: new THREE.Color(0x3f8fe0), dayBot: new THREE.Color(0xdff1fb),
  duskTop: new THREE.Color(0x3b2f66), duskBot: new THREE.Color(0xe08a46),
  nightTop: new THREE.Color(0x04060f), nightBot: new THREE.Color(0x121c33),
};
// f: 0=밤, 0.5=해질녘, 1=낮
function mix3(out, night, dusk, day, f) {
  return f < 0.5 ? out.copy(night).lerp(dusk, f * 2) : out.copy(dusk).lerp(day, (f - 0.5) * 2);
}

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
  const band = g.createLinearGradient(0, 300, 0, 620);
  band.addColorStop(0, 'rgba(90,80,160,0)'); band.addColorStop(0.5, 'rgba(150,140,220,0.30)'); band.addColorStop(1, 'rgba(90,80,160,0)');
  g.fillStyle = band; g.fillRect(0, 300, 1024, 320);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 1024, y = Math.random() < 0.45 ? 380 + Math.random() * 160 : Math.random() * 1024;
    const r = Math.random() < 0.94 ? Math.random() * 1.1 + 0.3 : Math.random() * 2 + 1.2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = `rgba(255,255,255,${(0.35 + Math.random() * 0.65).toFixed(2)})`; g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export function createSky(scene, { hemi, sun, ambient, fogColorDay }) {
  const group = new THREE.Group();
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: SKY.dayTop.clone() }, bottom: { value: SKY.dayBot.clone() } },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vPos; uniform vec3 top; uniform vec3 bottom; void main(){ float h = normalize(vPos).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, clamp(h*1.3,0.0,1.0)), 1.0); }',
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const R = 1400;                                  // 카메라 far 보다 작고 안개 far 보다 큼
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), skyMat);
  dome.renderOrder = -100;
  const stars = new THREE.Mesh(new THREE.SphereGeometry(R * 0.97, 24, 16),
    new THREE.MeshBasicMaterial({ map: starTexture(), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  stars.renderOrder = -99;
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff8e0, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  sunSprite.scale.set(90, 90, 1);
  sunSprite.position.set(500, 620, -560);
  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  moonSprite.scale.set(60, 60, 1);
  moonSprite.position.set(-540, 580, 500);
  group.add(dome, stars, sunSprite, moonSprite);
  scene.add(group);

  const cA = new THREE.Color(), cB = new THREE.Color();
  const fogDay = new THREE.Color(fogColorDay);
  let dayFactor = 1;
  return {
    group,
    get dayFactor() { return dayFactor; },
    get night() { return 1 - dayFactor; },
    get isNight() { return dayFactor < 0.35; },
    // 돔·해·달이 플레이어를 따라간다 (지도가 2km 라 원점에 고정하면 밖으로 나가버림)
    follow(x, z) { group.position.set(x, 0, z); },
    update(t) {
      dayFactor = computeDayFactor(t);
      const f = dayFactor;
      hemi.intensity = 0.25 + 1.65 * f;
      sun.intensity = 0.06 + 2.2 * f;
      ambient.intensity = 0.08 + 0.3 * f;
      sunSprite.material.opacity = Math.max(0, f * 0.95);
      moonSprite.material.opacity = Math.max(0, (1 - f) * 0.9);
      stars.material.opacity = Math.pow(1 - f, 1.6) * 0.95;
      mix3(cA, SKY.nightTop, SKY.duskTop, SKY.dayTop, f);
      mix3(cB, SKY.nightBot, SKY.duskBot, SKY.dayBot, f);
      skyMat.uniforms.top.value.copy(cA);
      skyMat.uniforms.bottom.value.copy(cB);
      mix3(cA, SKY.nightBot, SKY.duskBot, fogDay, f);
      scene.fog.color.copy(cA);
      scene.background.copy(cA);
      return f;
    },
  };
}
