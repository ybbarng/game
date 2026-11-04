// 시험 전용: 큰 큐브(4×4·5×5) 상태를 축소법 단계로 읽는다.
import { type Cube, colorMap, key, normalize, solved } from "./sim";

const isCenterSticker = (
  n: number,
  pos: readonly number[],
  normal: readonly number[],
) => {
  const m = n - 1;
  return pos.every((v, i) => normal[i] !== 0 || Math.abs(v) < m);
};

/** 면마다 센터 블럭이 그 면 색으로 맞아 있나 */
export function centersSolved(c: Cube): boolean {
  const nc = normalize(c);
  const ref = colorMap(solved(c.n));
  return nc.stickers.every(
    (s) =>
      !isCenterSticker(c.n, s.pos, s.normal) ||
      ref.get(key(s.pos, s.normal)) === s.color,
  );
}

/** 묶이지 않은(한 줄의 날개 색이 서로 다른) 엣지 수 */
export function unpairedEdges(c: Cube): number {
  const m = c.n - 1;
  const lines = new Map<string, Map<string, Set<number>>>();
  for (const s of c.stickers) {
    const extreme = s.pos.map((v) => Math.abs(v) === m);
    if (extreme.filter(Boolean).length !== 2) continue;
    const lineKey = s.pos.map((v, i) => (extreme[i] ? v : "*")).join(",");
    const byNormal = lines.get(lineKey) ?? new Map<string, Set<number>>();
    const nk = s.normal.join(",");
    const colors = byNormal.get(nk) ?? new Set<number>();
    colors.add(s.color);
    byNormal.set(nk, colors);
    lines.set(lineKey, byNormal);
  }
  let count = 0;
  for (const byNormal of lines.values()) {
    if ([...byNormal.values()].some((cs) => cs.size > 1)) count++;
  }
  return count;
}

/** 위층을 뺀 나머지 스티커가 맞아 있나 */
export function belowTopIntact(c: Cube): boolean {
  const nc = normalize(c);
  const ref = colorMap(solved(c.n));
  return nc.stickers.every(
    (s) => s.pos[1] === c.n - 1 || ref.get(key(s.pos, s.normal)) === s.color,
  );
}
