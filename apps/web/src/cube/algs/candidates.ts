// 추천 후보 공식(docs/47 8-1, 2026-11-04). 상황마다 자료(대표·대안) 밖의 널리 쓰는 다른 공식을 두어
// 「내 공식 일람표」에서 견주고 골라 쓰게 한다. 꼬리표는 수를 코드로 세어 붙인다(짧음·R·U만 등).
// 모든 후보가 그 상황의 검사기(checkAlg)를 통과하는지 candidates.test.ts가 확인한다.
import { type CubeMove, isRotation, parseMoves } from "@game/cube-engine";

import type { AlgCase } from "../learn";
import { LL_CANDIDATES } from "./candidates-ll";
import { MORE_CANDIDATES } from "./candidates-more";
import { setOf } from "./check";
import { moveCounts } from "./transform";

export interface CandidateSpec {
  alg: string;
  /** 엔진으로 찾은 공식(「찾은 공식」 꼬리표) */
  found?: true;
}

export interface Candidate {
  alg: string;
  tags: string[];
  htm: number;
  stm: number;
}

const TABLE: Readonly<Record<string, readonly CandidateSpec[]>> = {
  ...LL_CANDIDATES,
  ...MORE_CANDIDATES,
};

/** 자료에 적힌 후보(2단계 OLL 꼭짓점은 같은 번호의 OLL 후보를 함께 쓴다) */
export function candidateSpecs(c: AlgCase): readonly CandidateSpec[] {
  const own = TABLE[c.id] ?? [];
  const m = /^2look-oll-(\d+)$/.exec(c.id);
  const shared = m ? (TABLE[`oll-${m[1]}`] ?? []) : [];
  return [...own, ...shared];
}

/** 바깥 면 글자(R U F L D B) 또는 M·넓게 등 수 하나의 이름. 큐브 돌리기는 null */
function faceOf(n: number, m: CubeMove): string | null {
  if (isRotation(n, m)) return null;
  const outer = m.from === 1 || m.to === n;
  const width = m.to - m.from + 1;
  if (n === 3 && m.from === 2 && m.to === 2) return `${m.axis}-mid`;
  if (!outer || width > 1) return `${m.axis}-${m.from}-${m.to}`;
  return `${m.axis}-${m.from}`;
}

const NAMES = (n: number) => {
  const one = (t: string) => faceOf(n, parseMoves(n, t)[0] as CubeMove);
  return {
    R: one("R"),
    U: one("U"),
    F: one("F"),
    M: n === 3 ? one("M") : null,
  };
};

/** 수 이름 묶음으로 본 꼬리표(R·U만, M·U만, R·U·F만, 큐브 돌림) */
export function shapeTags(n: number, alg: string): string[] {
  const moves = parseMoves(n, alg);
  const names = NAMES(n);
  const used = new Set<string>();
  let rotation = false;
  for (const m of moves) {
    const f = faceOf(n, m);
    if (f === null) rotation = true;
    else used.add(f);
  }
  const only = (...allowed: (string | null)[]) =>
    !rotation && [...used].every((f) => allowed.includes(f));
  const tags: string[] = [];
  if (only(names.R, names.U)) tags.push("R·U만");
  else if (names.M && only(names.M, names.U)) tags.push("M·U만");
  else if (only(names.R, names.U, names.F)) tags.push("R·U·F만");
  if (rotation) tags.push("큐브 돌림");
  return tags;
}

/**
 * 상황의 후보 공식(자료의 대표·대안과 같은 것은 뺀다). 꼬리표:
 * - 「짧음」: 대표·대안·후보 가운데 HTM이 가장 적은 것(같으면 모두)
 * - 수 모양(shapeTags), 「찾은 공식」
 */
export function candidatesOf(c: AlgCase): Candidate[] {
  const hit = cache.get(c.id);
  if (hit) return hit;
  const n = setOf(c).size;
  const seen = new Set(c.algs);
  const specs = candidateSpecs(c).filter((s) => {
    if (seen.has(s.alg)) return false;
    seen.add(s.alg);
    return true;
  });
  const countOf = (alg: string) => moveCounts(n, parseMoves(n, alg));
  const shortest = Math.min(
    ...[...c.algs, ...specs.map((s) => s.alg)].map((a) => countOf(a).htm),
  );
  const out = specs.map((s) => {
    const counts = countOf(s.alg);
    const tags = [
      ...(counts.htm === shortest ? ["짧음"] : []),
      ...shapeTags(n, s.alg),
      ...(s.found ? ["찾은 공식"] : []),
    ];
    return { alg: s.alg, tags, ...counts };
  });
  cache.set(c.id, out);
  return out;
}

const cache = new Map<string, Candidate[]>();

/** 자료 공식(대표·대안)의 꼬리표: 「짧음」(후보까지 견줘)과 수 모양 */
export function dataAlgTags(c: AlgCase, alg: string): string[] {
  const n = setOf(c).size;
  const htm = (a: string) => moveCounts(n, parseMoves(n, a)).htm;
  const shortest = Math.min(
    ...[...c.algs, ...candidatesOf(c).map((x) => x.alg)].map(htm),
  );
  return [...(htm(alg) === shortest ? ["짧음"] : []), ...shapeTags(n, alg)];
}
