// 이차곡선 도감 — 카드 형태. 뒷면은 흑백 단대부고 교표, 앞면은 수집한 물건의 컬러 그림.
// 미션을 완료하면 카드가 앞으로 뒤집힌다. 수집 상태는 브라우저에 저장된다.
const KEY = 'berry-daechi:dogam';

// 단대부고 교표: 회색 테두리 원, 빨강(위)·파랑(왼쪽)·흰색(오른쪽)·검정(아래) 4분면, 노란 원 안에 高
function emblemSVG(gray) {
  const c = gray ? { red: '#8a8a8a', blue: '#6a6a6a', white: '#e4e4e4', black: '#3a3a3a', yellow: '#c9c9c9', ring: '#b5b5b5', ink: '#333' }
    : { red: '#e8461e', blue: '#2b3c9e', white: '#ffffff', black: '#111111', yellow: '#f5e400', ring: '#b7b7b7', ink: '#1a1a1a' };
  const R = 100, r = 40, g = 7;
  const seg = (a0, a1, col) => { const p = a => [100 + R * Math.cos(a), 100 + R * Math.sin(a)], q = a => [100 + (r + g) * Math.cos(a), 100 + (r + g) * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1), [u0, v0] = q(a0), [u1, v1] = q(a1); return `<path d="M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${u1},${v1} A${r + g},${r + g} 0 0 0 ${u0},${v0} Z" fill="${col}"/>`; };
  const d = Math.PI / 4;
  return `<svg viewBox="-10 -10 220 220" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="108" fill="${c.ring}"/>
    ${seg(-Math.PI / 2 - d, -Math.PI / 2 + d, c.red)}${seg(-d, d, c.white)}${seg(Math.PI / 2 - d, Math.PI / 2 + d, c.black)}${seg(Math.PI - d, Math.PI + d, c.blue)}
    <g stroke="${c.ring}" stroke-width="7"><line x1="100" y1="100" x2="${100 + 108 * Math.cos(-Math.PI / 2 - d)}" y2="${100 + 108 * Math.sin(-Math.PI / 2 - d)}"/><line x1="100" y1="100" x2="${100 + 108 * Math.cos(-Math.PI / 2 + d)}" y2="${100 + 108 * Math.sin(-Math.PI / 2 + d)}"/><line x1="100" y1="100" x2="${100 + 108 * Math.cos(Math.PI / 2 - d)}" y2="${100 + 108 * Math.sin(Math.PI / 2 - d)}"/><line x1="100" y1="100" x2="${100 + 108 * Math.cos(Math.PI / 2 + d)}" y2="${100 + 108 * Math.sin(Math.PI / 2 + d)}"/></g>
    <circle cx="100" cy="100" r="${r + g}" fill="${c.ring}"/><circle cx="100" cy="100" r="${r}" fill="${c.yellow}"/>
    <text x="100" y="104" text-anchor="middle" dominant-baseline="middle" font-size="46" font-weight="900" fill="${c.ink}" font-family="'Malgun Gothic',sans-serif">高</text></svg>`;
}
// 앞면 그림
const ART = {
  telescope: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2352"/><stop offset="1" stop-color="#4a3c7a"/></linearGradient></defs>
    <rect width="200" height="200" rx="14" fill="url(#sky)"/>
    <g fill="#fff"><circle cx="30" cy="30" r="1.5"/><circle cx="70" cy="18" r="1"/><circle cx="120" cy="40" r="1.3"/><circle cx="175" cy="60" r="1"/><circle cx="50" cy="70" r="1"/><circle cx="160" cy="20" r="1.6"/><circle cx="20" cy="110" r="1"/></g>
    <circle cx="150" cy="48" r="22" fill="#f6efc8"/><circle cx="142" cy="42" r="5" fill="#e2d9a8" opacity=".7"/><circle cx="158" cy="56" r="7" fill="#e2d9a8" opacity=".6"/>
    <g stroke="#ffd98a" stroke-width="1.2" opacity=".55"><line x1="140" y1="60" x2="92" y2="118"/><line x1="150" y1="66" x2="102" y2="124"/><line x1="130" y1="56" x2="82" y2="112"/></g>
    <g transform="rotate(-42 95 125)"><rect x="55" y="112" width="86" height="26" rx="6" fill="#6e7c93"/><rect x="55" y="112" width="86" height="8" rx="4" fill="#8fa0bb"/><rect x="135" y="108" width="12" height="34" rx="3" fill="#39404e"/><rect x="40" y="117" width="18" height="16" rx="3" fill="#39404e"/><circle cx="49" cy="125" r="5" fill="#7fd8ff"/></g>
    <rect x="90" y="132" width="10" height="24" fill="#2a303c"/>
    <g stroke="#4a5262" stroke-width="5" stroke-linecap="round"><line x1="95" y1="152" x2="62" y2="190"/><line x1="95" y1="152" x2="128" y2="190"/><line x1="95" y1="152" x2="95" y2="192"/></g>
    <text x="100" y="196" text-anchor="middle" font-size="9" fill="#cfd8ff" font-family="'Malgun Gothic',sans-serif">카세그레인식 반사망원경</text></svg>`,
  lithotripter: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" rx="14" fill="#eef0f7"/>
    <rect x="18" y="86" width="164" height="10" rx="3" fill="#d6d4c6"/><rect x="26" y="96" width="8" height="40" fill="#bdbbad"/><rect x="166" y="96" width="8" height="40" fill="#bdbbad"/>
    <ellipse cx="100" cy="72" rx="62" ry="22" fill="#f6f3ee" stroke="#d9c5b8" stroke-width="2"/>
    <circle cx="160" cy="66" r="15" fill="#f6f3ee" stroke="#d9c5b8" stroke-width="2"/><path d="M150,56 l-4,-12 8,6 z M166,54 l4,-12 -8,6 z" fill="#f2b3bf"/><circle cx="156" cy="64" r="2" fill="#2d3a2f"/><circle cx="165" cy="64" r="2" fill="#2d3a2f"/>
    <path d="M40,72 q-14,8 -18,-6" stroke="#e9e4dc" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M60,96 A40,52 0 0 0 140,96 Z" fill="#c4c5ba" stroke="#7e7f72" stroke-width="2"/>
    <path d="M60,96 A40,52 0 0 0 140,96" fill="none" stroke="#2f45ec" stroke-width="2" stroke-dasharray="4 3"/>
    <rect x="96" y="120" width="8" height="40" fill="#33342e"/><circle cx="100" cy="122" r="4" fill="#e0a200"/>
    <g stroke="#2f45ec" stroke-width="1.3" opacity=".75"><line x1="100" y1="122" x2="70" y2="105"/><line x1="70" y1="105" x2="100" y2="76"/><line x1="100" y1="122" x2="130" y2="105"/><line x1="130" y1="105" x2="100" y2="76"/><line x1="100" y1="122" x2="84" y2="94"/><line x1="84" y1="94" x2="100" y2="76"/><line x1="100" y1="122" x2="116" y2="94"/><line x1="116" y1="94" x2="100" y2="76"/></g>
    <circle cx="100" cy="76" r="5" fill="#4a4740"/><circle cx="100" cy="76" r="9" fill="none" stroke="#2f45ec" stroke-width="1.5"/>
    <text x="100" y="134" text-anchor="middle" font-size="9" font-style="italic" fill="#8a6a10" font-family="Georgia,serif">F₁</text><text x="112" y="72" font-size="9" font-style="italic" fill="#2f45ec" font-family="Georgia,serif">F₂</text>
    <rect x="30" y="166" width="140" height="8" rx="3" fill="#7c7d70"/>
    <text x="100" y="192" text-anchor="middle" font-size="9" fill="#3e3b33" font-family="'Malgun Gothic',sans-serif">체외 충격파 쇄석기 (타원)</text></svg>`,
};
export const CARDS = [
  { id: 'telescope', name: '단대부고 옥상 반사망원경', kind: '쌍곡선 · 포물선', place: '단대부고 옥상 천문대', how: '천문대에서 조작 모드 미션 3개 완료' },
  { id: 'lithotripter', name: '내과 체외 충격파 쇄석기', kind: '타원', place: 'KB국민은행 건물 내과', how: '시술 체험에서 결석 완전 파쇄' },
];

export function createCollection({ toast }) {
  const $ = s => document.querySelector(s);
  const root = $('#dogam'), grid = $('#dogam-grid'), badge = $('#dogam-btn');
  let got = new Set();
  try { got = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* 저장 불가 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...got])); } catch { /* 저장 불가 */ } };

  function render() {
    grid.innerHTML = CARDS.map(c => `
      <div class="dcard${got.has(c.id) ? ' got' : ''}" data-id="${c.id}">
        <div class="inner">
          <div class="face back">${emblemSVG(true)}<div class="lbl">단대부고</div></div>
          <div class="face front">${ART[c.id]}</div>
        </div>
        <div class="meta"><b>${got.has(c.id) ? c.name : '???'}</b><span>${got.has(c.id) ? c.kind : c.how}</span></div>
      </div>`).join('');
    badge.textContent = `📖 도감 ${got.size}/${CARDS.length}`;
  }
  function show() { render(); root.hidden = false; }
  function hide() { root.hidden = true; }
  // 새로 얻은 카드: 도감을 열고 그 카드만 뒷면에서 앞면으로 뒤집는 연출
  function collect(id) {
    const c = CARDS.find(x => x.id === id);
    if (!c) return;
    const isNew = !got.has(id);
    got.add(id); save();
    render();
    root.hidden = false;
    if (isNew) {
      const el = grid.querySelector(`[data-id="${id}"]`);
      el.classList.remove('got'); el.classList.add('flip-new');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('got')));
      toast && toast(`📖 도감에 새 카드! ${c.name}`, 4000);
    }
  }
  root.addEventListener('click', e => { if (e.target === root || e.target.id === 'dogam-close') hide(); });
  badge.addEventListener('click', () => (root.hidden ? show() : hide()));
  render();
  return { show, hide, collect, has: id => got.has(id), get isOpen() { return !root.hidden; } };
}
