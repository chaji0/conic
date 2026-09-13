// 배포용 단일 HTML 만들기 — 게임 코드·three.js·지도 데이터를 한 파일(index.html)에 담는다.
// 결과 파일은 서버·Node·인터넷 없이 더블클릭으로도 실행되고, GitHub Pages 가 그대로 서비스한다.
//   npm run build            → index.html (저장소 루트, 배포용)
// 개발 중에는 dev.html 을 node serve.js 로 열어 src/ 를 직접 실행한다. index.html 은 직접 편집하지 않는다.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('src/main.js', root))],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2022',
  legalComments: 'eof',
  write: false,
});
const code = outputFiles[0].text;

const map = JSON.parse(read('data/map.json'));
const { landmarks } = JSON.parse(read('data/landmarks.json'));
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');

let html = read('dev.html');
const before = html;
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
if (html === before) throw new Error('dev.html 에서 importmap 을 찾지 못했습니다');
const withModule = html;
html = html.replace(/<script type="module" src="src\/main\.js"><\/script>/, () =>
  `<!-- 자동 생성 파일: npm run build (원본은 dev.html + src/). 직접 고치지 마세요. -->\n` +
  `<script>window.BERRY_DATA=${safe(JSON.stringify({ map, landmarks }))};</script>\n<script>${safe(code)}</script>`);
if (html === withModule) throw new Error('dev.html 에서 main.js 스크립트 태그를 찾지 못했습니다');

const out = new URL('index.html', root);
fs.writeFileSync(out, html);
console.log(`완료: ${fileURLToPath(out)} (${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB)`);
