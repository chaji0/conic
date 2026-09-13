// OpenStreetMap(Overpass)에서 대상 영역의 건물·도로·공원·물·역·학교를 받아 data/osm-raw.json 에 저장.
// 제작 단계 전용 — 게임 실행 중에는 호출하지 않는다.   실행: node tools/fetch-osm.mjs
import fs from 'node:fs';

// 남, 서, 북, 동 — 단대부고·대치역·한티역·도곡역·은마아파트·양재천을 포함하는 영역
const BBOX = [37.4870, 127.0480, 37.5040, 127.0720];
const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const b = BBOX.join(',');
const query = `[out:json][timeout:120];
(
  way["building"](${b});
  relation["building"](${b});
  way["highway"](${b});
  way["leisure"~"park|garden|pitch|playground|track"](${b});
  relation["leisure"="park"](${b});
  way["landuse"~"grass|forest|recreation_ground|residential|education|commercial"](${b});
  way["natural"~"water|wood|scrub"](${b});
  relation["natural"="water"](${b});
  way["waterway"](${b});
  way["amenity"~"school|university|college|kindergarten|parking"](${b});
  nwr["railway"~"station|subway_entrance"](${b});
  node["amenity"~"cafe|restaurant|fast_food|convenience|bank|pharmacy|library|police|post_office|place_of_worship"](${b});
  node["shop"](${b});
  node["tourism"](${b});
  way["barrier"~"wall|fence|hedge|retaining_wall|guard_rail|city_wall"](${b});
  nwr["amenity"="bicycle_parking"](${b});
  node["highway"="street_lamp"](${b});
  node["barrier"="gate"](${b});
);
out body geom;`;

for (const url of MIRRORS) {
  try {
    console.log('요청:', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': 'berry-daechi-masil/0.1 (personal hobby game; one-off data fetch)', Accept: 'application/json' },
      body: new URLSearchParams({ data: query }),
    });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith('<')) throw new Error(`HTTP ${res.status}: ${text.replace(/<[^>]+>/g, ' ').slice(0, 200)}`);
    const json = JSON.parse(text);
    json.bbox = BBOX;
    fs.writeFileSync(new URL('../data/osm-raw.json', import.meta.url), JSON.stringify(json));
    console.log(`완료: 요소 ${json.elements.length}개 → data/osm-raw.json`);
    process.exit(0);
  } catch (err) {
    console.warn('실패:', err.message);
  }
}
console.error('모든 Overpass 미러가 실패했습니다. 잠시 후 다시 시도하세요.');
process.exit(1);
