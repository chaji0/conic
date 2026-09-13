# 베리의 대치동마실

고양이 **베리**가 되어 단대부고 앞에서 출발해, **실제 지도 그대로 만든** 대치동·도곡동(약 2km × 2km)을 산책하는
웹 3D 게임입니다. 3분마다 낮과 밤이 바뀌고, 자동차는 구글 스트릿뷰로 갈 수 있는 길로만 다닙니다.
같은 방에 들어온 친구들은 지도 위에 고양이로 함께 보입니다.

배포 주소: <https://chaji0.github.io/conic/> (`main` 에 푸시하면 1~2분 뒤 반영)

> 이전에 이 저장소에 있던 「단붕이의 대치동 이차곡선 탐험」은 git 기록(`9d46f90` 이전)에 남아 있습니다.
> 이차곡선 도감은 이 지도 위에 새로 만들 예정입니다 (`docs/PRD.md` 참고).

---

## 실행 / 개발

```bash
npm install          # three, esbuild, playwright
npm start            # http://localhost:8130 → dev.html (src/ 를 직접 실행, 수정 즉시 반영)
npm run build        # dev.html + src/ + data/ → index.html (배포용 단일 파일, 약 1MB)
npm test             # dev/test.js — 빌드된 index.html 을 헤드리스로 띄워 시작·이동까지 확인 (ERRORS: [] 이어야 함)
```

**`index.html` 은 빌드 결과물입니다. 직접 편집하지 말고 `src/` 와 `dev.html` 을 고친 뒤 `npm run build` 로 다시 만드세요.**
GitHub Pages 는 이 `index.html` 하나를 그대로 서비스하며, 파일을 더블클릭해도(인터넷·서버 없이) 실행됩니다.

## 조작

| 입력 | 동작 |
|---|---|
| `↑` `↓` / `W` `S` | 앞으로 · 뒤로 |
| `←` `→` / `A` `D` | 왼쪽 · 오른쪽으로 돌기 |
| `Shift` / 🏃 버튼 | 달리기 (1.9배) |
| 톡 누르기 | 가까운 장소 둘러보기 |
| 짧게 끌기 · 휠 · 슬라이더 | 시점 돌리기 · 확대·축소 |
| 꾹 누른 채 끌기 (터치) | 가상 조이스틱으로 이동 |
| 두 손가락 | 확대·축소 |
| `E` `M` `R` `H` | 둘러보기 · 지도 접기/펴기 · 처음 위치 · 도움말 |

## 폴더 구조

```
index.html          빌드 결과 (배포용, 직접 편집 금지)
dev.html            개발용 화면 (importmap 으로 src/ 를 바로 실행)
src/
  main.js           조작·카메라·HUD·전체 지도·랜드마크·동시접속·메인 루프
  world.js          지도 데이터 → 땅·도로·건물·담벼락·가로등·나무·충돌·미니맵 이미지
  vehicles.js       자동차(스트릿뷰 도로망 주행) · 세워 둔 자전거
  sky.js            하늘 돔·별·해·달 · 밤낮 주기
  cat.js            베리 모델과 걷기 애니메이션
  multiplayer.js    Firebase 동시접속 (FIREBASE_CONFIG)
data/
  map.json          게임용 지도 (원점 = 단대부고, +x 동, +z 남, 단위 m) — tools/ 로 생성
  landmarks.json    랜드마크 20곳 (이름·좌표·설명·Meshy 모델 경로)
assets/models/      Meshy 등에서 받은 GLB 모델 (있으면 자동으로 교체 배치)
tools/              제작 단계 스크립트 (아래 참고)
dev/test.js         헤드리스 테스트 (Playwright)
docs/               개발노트 · 동시접속 설정 · PRD
```

## 지도 데이터 만들기 (제작 단계)

```bash
node tools/fetch-osm.mjs          # OpenStreetMap(Overpass) → data/osm-raw.json
node tools/build-map.mjs          # → data/map.json (건물 높이 추정, 도로 폭, 구역, 이전 스트릿뷰 확인값 보존)
node tools/streetview-roads.mjs   # 도로마다 구글 스트릿뷰 유무 확인 → map.json 의 sv (.env 의 GOOGLE_MAPS_API_KEY 필요, 무료 메타데이터 호출)
node tools/streetview.mjs --dry   # 랜드마크마다 스트릿뷰 파노라마가 있는지 확인 (무료)
node tools/streetview.mjs dandae  # 랜드마크 사진 4방향 다운로드 → streetview/<id>/ (유료 API, Meshy 변환용)
```

랜드마크 건물을 Meshy 로 만든 GLB 로 바꾸려면 `assets/models/<이름>.glb` 에 두고 `data/landmarks.json`
해당 항목의 `model` 에 경로를 적습니다 (`modelHeight`·`modelYaw`·`replaceRadius` 로 조정). 베리 자신은
`assets/models/berry.glb` 가 있으면 그것을 씁니다.

게임 실행 중에는 지도 API 를 전혀 호출하지 않습니다. `.env` 는 git 에 올라가지 않습니다.
지도 데이터 © OpenStreetMap 기여자 (ODbL).
