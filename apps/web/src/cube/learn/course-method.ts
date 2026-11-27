// 강의 → 해법 이름(강 화면 이동 경로, docs/47 16-31). 이름은 해법 카드(`solve-map.ts` MAP_METHODS)와 같은 것을 쓴다.
import { MAP_METHODS, type MapMethodId } from "./solve-map";
import type { Course } from "./types";

/**
 * 해법 카드가 없는 강의의 해법 이름. 6×6·7×7은 지도·카드가 없고(docs/47 16-29) 4×4·5×5 축소법을 넓힌 것,
 * 블라인드 강의는 올드 포흐만 해법 하나를 가르친다
 */
const NO_CARD: Readonly<Record<string, string>> = {
  "big-666-777": "축소법",
  "bld-op": "올드 포흐만",
};

export interface CourseMethod {
  /** 해법 카드 이름(「CFOP」, 「축소법」) */
  title: string;
  /** 해법 카드 id. 카드가 없는 해법은 없다 */
  id?: MapMethodId;
  /**
   * 화면에 쓰는 이름(3×3이 아니면 크기를 앞에: 「2×2 처음 맞추기 해법」). 둘째 이름이 있으면 「해법」 대신 함께 적는다
   * (「초보자(코너 방향 먼저) · 신광사 해법」, 「해법」을 두 번 쓰지 않는다)
   */
  label: string;
}

const sizeText = (course: Course) =>
  (course.sizes ?? [course.size]).map((n) => `${n}×${n}`).join("·");

/**
 * 이 강의가 가르치는 해법. 카드가 여럿이면(초보자 강의 = 초보자·초보자(코너 방향 먼저)) 기본으로 펼친 카드의 첫째.
 * 해법이 아닌 강의(큐브의 기초)는 없다
 */
export function courseMethod(course: Course): CourseMethod | undefined {
  const card = MAP_METHODS.find((m) => m.course === course.id && !m.extra);
  const title = card?.title ?? NO_CARD[course.id];
  if (!title) return undefined;
  const size = course.sizes || course.size !== 3 ? `${sizeText(course)} ` : "";
  return {
    title,
    ...(card ? { id: card.id } : {}),
    label: card?.alias
      ? `${size}${title} · ${card.alias}`
      : `${size}${title} 해법`,
  };
}
