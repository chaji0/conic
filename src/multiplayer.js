// 실시간 동시접속 (Firebase Realtime Database, compat SDK 동적 로드)
// FIREBASE_CONFIG 가 null 이면 외부 요청 없이 혼자 플레이한다. 경로: rooms/<room>/players/<id>
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCZzhvM-OJlmFrmPsHPSfm50WYzcqi5rSE",
  authDomain: "geometry-c494f.firebaseapp.com",
  databaseURL: "https://geometry-c494f-default-rtdb.firebaseio.com",
  projectId: "geometry-c494f",
  storageBucket: "geometry-c494f.firebasestorage.app",
  messagingSenderId: "596006207599",
  appId: "1:596006207599:web:a9140de45a860fe13ecd9a"
};

// 방 이름은 DB 경로 키라 . $ # [ ] / 가 들어가면 접속이 통째로 실패한다 → 안전한 문자로 바꾼다
export const ROOM = (() => {
  const raw = new URLSearchParams(location.search).get('room') || '';
  const safe = raw.replace(/[.$#\[\]\/]/g, '-').replace(/[\x00-\x1f\x7f]/g, '').trim();
  return safe || 'daechi-classroom';
})();
const MY_ID = 'p_' + Math.random().toString(36).slice(2, 9);

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// onPeers(list: [{id, name, x, z, ry}]) · onStatus(state, text)
export function createMultiplayer({ onPeers, onStatus }) {
  let ref = null, db = null, lastSend = -999, myName = '베리', myChar = 'cat';
  const peers = new Map();
  const status = (state, text) => onStatus && onStatus(state, text);
  const count = () => status('live', peers.size ? `🟢 지금 ${peers.size + 1}명 접속 중` : '🟢 접속됨 · 친구를 기다리는 중');

  async function connect(name, char = 'cat') {
    myName = name; myChar = char;
    if (!FIREBASE_CONFIG) return;
    status(null, '실시간 접속하는 중...');
    try {
      await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js');
      const firebase = window.firebase;
      if (!firebase) { status('off', '⚪ 혼자 플레이 중 (접속 실패)'); return; }
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.database();
      ref = db.ref(`rooms/${ROOM}/players/${MY_ID}`);
      ref.onDisconnect().remove();
      count();
      db.ref('.info/connected').on('value', c => {
        if (c.val() === true) { ref.onDisconnect().remove(); count(); }
        else status(null, '🟡 다시 연결하는 중...');
      });
      db.ref(`rooms/${ROOM}/players`).on('value', snap => {
        const val = snap.val() || {};
        peers.clear();
        const now = Date.now();
        for (const [id, d] of Object.entries(val)) {
          if (id === MY_ID || !d) continue;
          if (d.t && now - d.t > 45000) continue;          // 45초 넘게 갱신이 없으면 끊긴 사람 (창을 닫다 만 경우)
          peers.set(id, { id, name: d.name || '친구', x: d.x || 0, z: d.z || 0, ry: d.ry || 0, c: d.c || 'cat', bike: !!d.b });
        }
        onPeers([...peers.values()]);
        count();
      });
    } catch (err) {
      console.warn('멀티플레이어 연결 실패(오프라인으로 계속 진행):', err);
      status('off', '⚪ 혼자 플레이 중 (인터넷 연결 확인)');
    }
  }
  // 0.25초마다 내 위치 전송 (트래픽 절약)
  function send(t, x, z, ry, bike = false) {
    if (!ref || t - lastSend < 0.25) return;
    lastSend = t;
    ref.set({ name: myName, c: myChar, b: bike ? 1 : 0, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, ry: Math.round(ry * 100) / 100, t: Date.now() });
  }
  function leave() { if (ref) { try { ref.remove(); } catch { /* 이미 끊김 */ } ref = null; } }
  return { connect, send, leave, id: MY_ID };
}
