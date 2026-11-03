/*
 * 수 배우기의 "수순 따라 두기"(docs/23 2절). 장기 포진·체스 오프닝·바둑 정석이 함께 쓴다.
 * 수순은 게임의 기보 글자(체스 SAN "Nf3", 장기 출발-도착 "48-44", 바둑 "D4"·쉬기 "pass")로 쓰고, 게임마다 글자를 수로 바꾸는 함수를 넘긴다.
 * 여기에는 판·규칙을 모르는 순수 함수만 둔다(어느 수가 맞는지, 다음은 어디인지).
 */

/** 수순의 한 마디: 수 하나와 그 수의 설명, 이 자리에서 갈라지는 다른 수순 */
export interface LineNode {
  /** 게임의 기보 글자 */
  move: string;
  /** 이 수를 왜 두는지(두고 난 뒤 보인다) */
  note?: string;
  /**
   * 이 마디 대신 둘 수 있는 다른 수순들. 갈래마다 첫 마디가 이 마디 자리의 다른 수이고, 그 뒤로 이어진다.
   * 배우는 쪽이 갈래 첫 수를 두면 그 갈래로 옮겨 간다. 상대 차례에는 본줄기와 갈래 가운데 하나를 고른다(`opponentPick`)
   */
  branches?: readonly (readonly LineNode[])[];
}

/** 수순 하나 */
export interface StudyLine {
  /** 진행 기록 열쇠. 게임 안에서 문제 id와 겹치지 않게 앞에 "line-" 따위를 붙인다 */
  id: string;
  /** 이름(예: "이탈리안 게임") */
  name: string;
  /** 한 줄 소개(노림) */
  summary: string;
  /**
   * 배우는 사람이 두는 편. 게임의 흑백·초한이 아니라 **수순 안의 차례**로 센다:
   * 0은 `moves[0]`을 두는 편(체스 백·장기 초·바둑 흑이 보통 그렇다), 1은 그 상대.
   * 시작 판에서 누가 먼저 두는지는 게임이 `start`로 정한다
   */
  learner: 0 | 1;
  /**
   * 수순이 시작하는 판(게임의 글자, 없으면 게임의 처음 판). 틀은 읽지 않고 게임의 `initial`이 읽는다.
   * 예: 체스 FEN, 장기 상차림(형식은 장기가 정해 `placeSetup`에 넘긴다), 바둑 판 크기와 놓인 돌. 읽는 코드는 그 게임의 수순 화면에 둔다
   */
  start?: string;
  /** 본줄기 */
  moves: readonly LineNode[];
  /** 출처(수순을 확인한 자료). 화면에는 보이지 않고 데이터를 고칠 사람이 본다 */
  source: string;
}

/** 수순 안의 자리: 지금 따라가는 줄기와 그 안의 몇 번째 마디인지, 처음부터 둔 수 수 */
export interface LineCursor {
  list: readonly LineNode[];
  index: number;
  ply: number;
}

export function startCursor(line: StudyLine): LineCursor {
  return { list: line.moves, index: 0, ply: 0 };
}

/** 수순을 다 두었나 */
export function lineDone(cursor: LineCursor): boolean {
  return cursor.index >= cursor.list.length;
}

/** 지금 둘 차례가 배우는 사람인가 */
export function learnerToMove(line: StudyLine, cursor: LineCursor): boolean {
  return cursor.ply % 2 === line.learner;
}

/** 지금 자리에서 둘 수 있는 마디들: 본줄기 마디가 먼저, 그다음 갈래 첫 마디 */
export function candidates(cursor: LineCursor): LineNode[] {
  const node = cursor.list[cursor.index];
  if (!node) return [];
  const others = (node.branches ?? [])
    .map((b) => b[0])
    .filter((n): n is LineNode => n !== undefined);
  return [node, ...others];
}

/**
 * 마디 하나를 두고 다음 자리로. 본줄기 마디면 한 칸 나아가고, 갈래 첫 마디면 그 갈래로 옮긴다.
 * 지금 자리의 후보가 아니면 null
 */
export function advance(
  cursor: LineCursor,
  played: LineNode,
): LineCursor | null {
  const node = cursor.list[cursor.index];
  if (!node) return null;
  if (played === node)
    return { list: cursor.list, index: cursor.index + 1, ply: cursor.ply + 1 };
  const branch = node.branches?.find((b) => b[0] === played);
  if (!branch) return null;
  return { list: branch, index: 1, ply: cursor.ply + 1 };
}

/** 그대로 두는 변환 */
const SAME = (s: string) => s;

/** 아직 맞는 방향들. null이면 모든 방향 */
export function waysOf(
  transforms: readonly ((notation: string) => string)[],
  orients: readonly number[] | null,
): number[] {
  return orients ? [...orients] : transforms.map((_, k) => k);
}

/** 이 마디를 `move`로 두는 방향만 남긴다(대칭인 자리는 여러 방향이 함께 맞는다) */
export function keepWays<M>(
  node: LineNode,
  move: M,
  parse: (notation: string) => M | null,
  same: (a: M, b: M) => boolean,
  transforms: readonly ((notation: string) => string)[],
  ways: readonly number[],
): number[] {
  return ways.filter((k) => {
    const m = parse((transforms[k] ?? SAME)(node.move));
    return m !== null && same(m, move);
  });
}

/**
 * 대칭 변환으로 둔 수를 수순 마디에 맞춰 본다(바둑 정석은 네 귀·뒤집기 여덟 방향 어디서나 같다).
 * - `transforms[k]`는 수순 글자를 k번째 방향의 글자로 바꾼다. 0번은 그대로여야 하고, 쉬기("pass") 같은 판 밖 글자는 그대로 돌려줘야 한다
 * - 방향은 숫자 하나가 아니라 「아직 맞는 방향 집합」(`orients`, null이면 모두)으로 들고 다닌다.
 *   첫 수가 대각선 위처럼 대칭인 자리면 여러 방향이 함께 맞으니 모두 남기고, 뒤의 수가 좁힌다
 * `parse`가 글자를 판의 수로 바꾸고, `same`이 둔 수와 같은지 본다. 맞는 마디가 없으면 null
 */
export function matchMove<M>(
  cursor: LineCursor,
  played: M,
  parse: (notation: string) => M | null,
  same: (a: M, b: M) => boolean,
  transforms: readonly ((notation: string) => string)[],
  orients: readonly number[] | null,
): { node: LineNode; move: M; orients: number[] } | null {
  const ways = waysOf(transforms, orients);
  for (const node of candidates(cursor)) {
    const kept = keepWays(node, played, parse, same, transforms, ways);
    if (kept.length > 0) return { node, move: played, orients: kept };
  }
  return null;
}

/** 상대 차례에 둘 마디. `roll`(0 이상 1 미만)로 본줄기와 갈래 가운데 하나를 고른다 */
export function opponentPick(
  cursor: LineCursor,
  roll: number,
): LineNode | null {
  const all = candidates(cursor);
  return all[Math.min(all.length - 1, Math.floor(roll * all.length))] ?? null;
}

/** 본줄기와 모든 갈래를 처음부터 끝까지 따라간 수순들(검증 시험이 엔진으로 다시 둔다) */
export function allPaths(line: StudyLine): LineNode[][] {
  const paths: LineNode[][] = [];
  const walk = (prefix: LineNode[], list: readonly LineNode[]) => {
    const path = [...prefix];
    list.forEach((node) => {
      for (const branch of node.branches ?? []) walk(path, branch);
      path.push(node);
    });
    paths.push(path);
  };
  walk([], line.moves);
  return paths;
}

/** 본줄기의 수 수(목록에 "8수" 따위로 보인다) */
export function lineLength(line: StudyLine): number {
  return line.moves.length;
}
