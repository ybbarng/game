// 공식 문자열 다루기(엔진과 상관없는 글자 처리만). 상황 만드는 공식을 「풀이의 거꾸로」로 적을 때 쓴다.

/** 공식을 수 단위로 나눈다. 괄호는 무시한다 */
export function algTokens(alg: string): string[] {
  return alg
    .replace(/[()[\]]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** 수 하나의 거꾸로: R → R', R' → R, R2 → R2 */
export function invertMove(move: string): string {
  if (move.endsWith("2'")) return move.slice(0, -1);
  if (move.endsWith("2")) return move;
  if (move.endsWith("'")) return move.slice(0, -1);
  return `${move}'`;
}

/** 공식 전체의 거꾸로(순서를 뒤집고 수마다 거꾸로) */
export function invertAlg(alg: string): string {
  return algTokens(alg).reverse().map(invertMove).join(" ");
}

/** 맞춘 큐브에서 이 풀이로 풀리는 상황을 만드는 공식. 앞에 붙일 수(큐브 돌리기 등)를 줄 수 있다 */
export function setupFor(solution: string, before = ""): string {
  return `${before} ${invertAlg(solution)}`.trim();
}
