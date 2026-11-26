// 글이 「흰색이 위예요」·「흰 면이 위, 초록 면이 앞」처럼 큐브를 쥔 방향을 밝히면, 그 색 센터 블럭은 그림에서도 보여야 한다
// (2026-11-26 사용자: 색 배치 찾기에서 글은 「흰색이 위예요」인데 그림의 위 센터 블럭이 까맸다). 답이 되는 조각은 쥔 방향을
// 말하는 글에 나오지 않으므로 가린 채로 둘 수 있다.
import {
  cubeGroups,
  cubeTopology,
  FACE_INDEX,
  pieceFaces,
  U,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { COURSES } from "./courses";
import { maskFor } from "./judge";
import type { LessonStep } from "./types";

const COLOR_FACE: Record<string, string> = {
  흰: "U",
  노란: "D",
  노랑: "D",
  초록: "F",
  빨간: "R",
  빨강: "R",
  파란: "B",
  파랑: "B",
  주황: "L",
};
const COLOR = Object.keys(COLOR_FACE).join("|");
const SAID = `(${COLOR})(?:색| 면| 센터 블럭)?(?:이|가) (?:위|앞)`;
/**
 * 쥔 방향을 밝히는 꼴: 위·앞 둘을 함께 대거나(「흰색이 위, 초록색이 앞」), 「~이 위예요」·「~이 위에 있」·「~ 면이 위로」.
 * 「흰색이 앞이면」(코너 블럭 스티커가 보는 쪽)처럼 조각 하나의 방향을 말하는 꼴은 잡지 않는다
 */
const HOLD = new RegExp(
  `${SAID}, ${SAID}|${SAID}로, ${SAID}|${SAID}(?:예요|이에요|에 있|로)`,
  "g",
);

/** 글이 쥔 방향으로 밝힌 색들 */
function saidColors(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HOLD))
    for (const word of m[0].matchAll(new RegExp(COLOR, "g"))) out.add(word[0]);
  return [...out];
}

const stepText = (s: LessonStep) => [s.body, s.quiz?.question ?? ""].join("\n");

/** 그 색 센터 블럭(큰 큐브는 그 면의 센터 블럭 가운데 하나라도)이 가리기에서 보이는지 */
function centerShown(n: number, step: LessonStep, color: string): boolean {
  const mask = maskFor(n, step.mask);
  if (!mask) return true;
  const face = FACE_INDEX[COLOR_FACE[color] as string] as number;
  const topo = cubeTopology(n);
  return cubeGroups(n, U)
    .centers.filter((p) => pieceFaces(n, p)[0] === face)
    .flatMap((p) => topo.pieces[p]?.stickers ?? [])
    .some((s) => mask[s] === "visible");
}

describe("글이 쥔 방향으로 밝힌 색 센터 블럭은 그림에서 보인다", () => {
  it("찾는 법: 쥔 방향만 잡고 조각 하나의 방향은 잡지 않는다", () => {
    expect(saidColors("이 까만 큐브는 흰색이 위예요.")).toEqual(["흰"]);
    expect(saidColors("흰 면이 위로, 초록 면이 앞으로 오게 들어요.")).toEqual([
      "흰",
      "초록",
    ]);
    expect(saidColors("흰색이 위, 초록색이 앞이면 오른쪽은?")).toEqual([
      "흰",
      "초록",
    ]);
    expect(saidColors("칸 밑에서 흰색이 앞이면 F D F'")).toEqual([]);
    expect(saidColors("노란색이 위면 U로 위-앞에 두고")).toEqual([]);
  });

  it("가리기 판정: 큐브와 만나기 색 배치 찾기는 위 센터 블럭만 보이고 노란 센터 블럭은 가린다", () => {
    const find: LessonStep = { kind: "find", body: "", mask: "centers:U" };
    expect(centerShown(3, find, "흰")).toBe(true);
    expect(centerShown(3, find, "노란")).toBe(false);
    expect(centerShown(3, { kind: "find", body: "", mask: "none" }, "흰")).toBe(
      false,
    );
  });

  for (const c of COURSES)
    it(`${c.title}: 밝힌 색 센터 블럭을 가린 단계가 없다`, () => {
      const hidden = c.lessons.flatMap((l) =>
        l.steps.flatMap((s, i) =>
          saidColors(stepText(s))
            .filter((color) => !centerShown(l.size, s, color))
            .map((color) => `${l.title} ${i + 1}번: ${color}`),
        ),
      );
      expect(hidden).toEqual([]);
    });
});
