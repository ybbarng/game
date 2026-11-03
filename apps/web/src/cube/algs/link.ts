// 공식 링크: 주소에 상황과 공식을 실어 보낸다(/cube/algs?case=oll-27&alg=R+U+R%27...).
// 받은 쪽은 그 상황을 열어 공식을 시연하고 「내 공식에 넣기」를 보인다(넣을 때 검사기를 거친다).
import { caseById, MAX_ALG_LENGTH } from "./check";
import { tidyAlg } from "./transform";

export const ALGS_PATH = "/cube/algs";

/** 공식 링크 주소. origin을 주면 전체 주소, 없으면 경로만 */
export function algLink(caseId: string, alg?: string, origin = ""): string {
  const q = new URLSearchParams({ case: caseId });
  if (alg) q.set("alg", tidyAlg(alg));
  return `${origin}${ALGS_PATH}?${q.toString()}`;
}

/** 주소의 검색 부분(?case=...&alg=...)을 읽는다. 없는 상황이면 null */
export function parseAlgLink(
  search: string,
): { caseId: string; alg: string | null } | null {
  const q = new URLSearchParams(search);
  const caseId = q.get("case");
  if (!caseId || !caseById(caseId)) return null;
  const alg = q.get("alg");
  // 공식 글은 짧다. 너무 긴 것은 받지 않는다
  return {
    caseId,
    alg: alg && alg.length <= MAX_ALG_LENGTH ? tidyAlg(alg) || null : null,
  };
}
