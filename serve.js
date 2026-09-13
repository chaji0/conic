/* 베리의 대치동마실 로컬 서버 — 의존성 없음.  실행: node serve.js  →  http://localhost:8130
   게임은 정적 파일만 쓰며 구글맵 API를 호출하지 않는다. .env 는 절대 내보내지 않는다. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = process.env.PORT || 8130;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
};
const BLOCKED = /(^|[\\/])(\.env|tools|streetview)([\\/]|$)/;

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel === '/' ? 'dev.html' : rel);
  if (!file.startsWith(ROOT) || BLOCKED.test(path.relative(ROOT, file))) { res.writeHead(403).end('403'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('찾을 수 없습니다'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`베리의 대치동마실: http://localhost:${PORT}`));
