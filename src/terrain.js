// 지형: 단대부고 캠퍼스는 언덕 위 평지(+HILL_H)이고, 그 주변으로 R m 에 걸쳐 완만하게 내려온다(경사 약 8~10%).
// 캠퍼스 안은 옹벽 높이(STEP)만큼 한 번 더 올라가 있어 경계에 옹벽이 생기고, 정문 진입로에서만 경사로로 이어진다.
// 지도의 다른 곳은 전부 평지(0). 모든 오브젝트는 이 높이 위에 놓인다.
export const HILL_H = 17, STEP = 3, R = 230;

function closestOnPoly(p, x, z) {
  let best = Infinity;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[2 * j], az = p[2 * j + 1], dx = p[2 * i] - ax, dz = p[2 * i + 1] - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d2 = (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}
function pointInPoly(p, x, z) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

// campus: 캠퍼스 폴리곤, gate: 정문 {x,z}, dirIn: 정문에서 캠퍼스 안쪽 방향 단위벡터
export function createTerrain(campus, gate, dirIn) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < campus.length; i += 2) {
    minX = Math.min(minX, campus[i]); maxX = Math.max(maxX, campus[i]);
    minZ = Math.min(minZ, campus[i + 1]); maxZ = Math.max(maxZ, campus[i + 1]);
  }
  const bbox = { minX: minX - R, maxX: maxX + R, minZ: minZ - R, maxZ: maxZ + R };
  const inHill = (x, z) => x > bbox.minX && x < bbox.maxX && z > bbox.minZ && z < bbox.maxZ;
  const px = -dirIn.z, pz = dirIn.x;    // 진입로에 수직인 방향

  function y(x, z) {
    if (!inHill(x, z)) return 0;
    if (pointInPoly(campus, x, z)) {
      // 정문 안쪽 18m 구간은 경사로 (옹벽 높이만큼 올라감)
      const ax = (x - gate.x) * dirIn.x + (z - gate.z) * dirIn.z, side = Math.abs((x - gate.x) * px + (z - gate.z) * pz);
      if (side < 12 && ax < 18) return HILL_H + STEP * smooth(ax / 18);
      // 경계에서 3m 안쪽까지는 옹벽 높이로 부드럽게 올라간다 (땅 격자와 캐릭터가 같은 높이를 쓰도록 계단 대신 짧은 비탈)
      return HILL_H + STEP * smooth(closestOnPoly(campus, x, z) / 3);
    }
    const d = closestOnPoly(campus, x, z);
    return HILL_H * smooth(1 - d / R);
  }
  return { y, bbox, inHill, campus, gate, dirIn };
}
