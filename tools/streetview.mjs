// 구글 스트릿뷰 Static API로 랜드마크 사진을 받아 streetview/<id>/ 에 저장 (Meshy 변환용 원본).
// 제작 단계 전용. 키는 .env 의 GOOGLE_MAPS_API_KEY 를 사용한다.
//
//   node tools/streetview.mjs --dry            ← 메타데이터만 확인 (무료, 요금 없음)
//   node tools/streetview.mjs                  ← 전체 랜드마크 × 4방향 이미지 다운로드 (유료 SKU 사용)
//   node tools/streetview.mjs daechi-station   ← 특정 랜드마크만
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const KEY = env.match(/^GOOGLE_MAPS_API_KEY=(\S+)/m)?.[1];
if (!KEY) { console.error('.env 에 GOOGLE_MAPS_API_KEY 가 없습니다.'); process.exit(1); }

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.filter(a => !a.startsWith('--'));
const { landmarks } = JSON.parse(fs.readFileSync(path.join(root, 'data/landmarks.json'), 'utf8'));
const HEADINGS = [0, 90, 180, 270];

for (const lm of landmarks) {
  if (only.length && !only.includes(lm.id)) continue;
  const loc = `${lm.lat},${lm.lon}`;
  // 학교처럼 도로에서 먼 곳은 반경을 넓혀 가며 가장 가까운 파노라마를 찾는다
  let meta;
  for (const radius of [80, 200, 400]) {
    meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc}&radius=${radius}&source=outdoor&key=${KEY}`).then(r => r.json());
    if (meta.status === 'OK') { meta.searchRadius = radius; break; }
  }
  if (meta.status !== 'OK') { console.log(`✗ ${lm.name}: ${meta.status}`); continue; }
  console.log(`✓ ${lm.name}: 파노라마 ${meta.pano_id} (${meta.date ?? '날짜 미상'}, 반경 ${meta.searchRadius}m)`);
  if (dry) continue;

  const dir = path.join(root, 'streetview', lm.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const h of HEADINGS) {
    const url = `https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=${meta.pano_id}&heading=${h}&pitch=10&fov=90&key=${KEY}`;
    const buf = Buffer.from(await fetch(url).then(r => r.arrayBuffer()));
    fs.writeFileSync(path.join(dir, `heading-${h}.jpg`), buf);
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`   → streetview/${lm.id}/ 에 4장 저장`);
}
