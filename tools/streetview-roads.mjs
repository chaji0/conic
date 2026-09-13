// 각 도로가 구글 스트릿뷰로 갈 수 있는 길인지 확인해 map.json 의 도로마다 sv(0~1) 값을 붙인다.
// 도로를 30m 간격으로 표본 추출해 Street View 메타데이터(무료)로 "반경 12m 안에 파노라마가 있는가"를
// 묻고, OK 비율을 sv 로 저장한다. 게임은 sv ≥ 0.5 이고 차가 다닐 수 있는 종류의 도로에만 차를 보낸다.
//
//   node streetview-roads.mjs            ← 키는 .env 의 GOOGLE_MAPS_API_KEY (제작 단계 전용)
import fs from 'node:fs';

const here = new URL('./', import.meta.url);
const env = fs.readFileSync(new URL('../.env', here), 'utf8');
const KEY = env.match(/^GOOGLE_MAPS_API_KEY=(\S+)/m)?.[1];
if (!KEY) { console.error('.env 에 GOOGLE_MAPS_API_KEY 가 없습니다.'); process.exit(1); }

const mapFile = new URL('../data/map.json', here);
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const VEHICULAR = /^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)/;
const STEP = 30, RADIUS = 12, CONCURRENCY = 6;

const KX = 111320 * Math.cos(map.origin.lat * Math.PI / 180);
const toLatLon = (x, z) => [map.origin.lat - z / 110574, map.origin.lon + x / KX];

// 표본점 만들기
const jobs = [];
map.roads.forEach((r, idx) => {
  if (!VEHICULAR.test(r.k) || r.sv !== undefined) return;   // 이미 확인한 도로는 건너뜀
  const pts = [];
  let acc = 0, next = STEP / 2;
  for (let i = 0; i < r.p.length - 2; i += 2) {
    const ax = r.p[i], az = r.p[i + 1], dx = r.p[i + 2] - ax, dz = r.p[i + 3] - az, L = Math.hypot(dx, dz);
    for (; next < acc + L; next += STEP) { const t = (next - acc) / L; pts.push([ax + dx * t, az + dz * t]); }
    acc += L;
  }
  if (!pts.length) pts.push([r.p[0], r.p[1]]);
  jobs.push({ idx, pts });
});
const total = jobs.reduce((a, j) => a + j.pts.length, 0);
console.log(`도로 ${jobs.length}개, 표본 ${total}점 확인 중…`);

async function check(x, z) {
  const [lat, lon] = toLatLon(x, z);
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat.toFixed(6)},${lon.toFixed(6)}&radius=${RADIUS}&source=outdoor&key=${KEY}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const j = await fetch(url).then(r => r.json());
      if (j.status === 'OK') return 1;
      if (j.status === 'ZERO_RESULTS') return 0;
      throw new Error(j.status + ' ' + (j.error_message || ''));
    } catch (e) { if (attempt === 2) { console.warn('실패:', e.message); return 0; } await new Promise(r => setTimeout(r, 500)); }
  }
}

let done = 0;
async function worker() {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    let ok = 0;
    for (const [x, z] of job.pts) { ok += await check(x, z); done++; }
    map.roads[job.idx].sv = Math.round(ok / job.pts.length * 100) / 100;
    if (done % 200 < job.pts.length) console.log(`  ${done}/${total}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const withSv = map.roads.filter(r => r.sv !== undefined);
const drivable = withSv.filter(r => r.sv >= 0.5);
fs.writeFileSync(mapFile, JSON.stringify(map));
console.log(`완료: 차량 도로 ${withSv.length}개 중 스트릿뷰 있는 도로 ${drivable.length}개 → map.json 갱신`);
