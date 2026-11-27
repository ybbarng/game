// 큐브의 기초 크기 탭(docs/47 16-33): 열 크기, 탭마다 보일 강, 옮긴 조각 강의 이어 읽기, 4×4 색 배치 쪽의 답.
import {
  applyMoves,
  cubeGroups,
  cubeTopology,
  FACE_INDEX,
  faceColors,
  parseMoves,
  pieceFaces,
  solvedCube,
  U,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import {
  basicsLessons,
  basicsSizeFor,
  basicsSizeOf,
  COURSES,
  findLesson,
  isBasicsCourse,
  METHOD_COURSES,
  nextLesson,
} from "./courses";
import { maskFor, pieceByName } from "./judge";

describe("큐브의 기초를 열 크기(보는 화면)", () => {
  it.each([
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ])("지금 크기 %i는 %i 탭으로 연다", (current, tab) => {
    expect(basicsSizeFor(current)).toBe(tab);
  });

  it.each([6, 7])(
    "지금 크기가 %i이면 5×5 탭으로 연다(6×6·7×7 강의가 5×5 축소법을 먼저 배운다)",
    (current) => {
      expect(basicsSizeFor(current)).toBe(5);
    },
  );

  it("주소 ?n=이 탭에 있으면 지금 크기보다 주소가 이긴다", () => {
    expect(basicsSizeFor(3, 4)).toBe(4);
    expect(basicsSizeFor(7, 2)).toBe(2);
  });

  it("주소 크기가 탭에 없으면(6×6) 지금 크기 규칙대로 연다", () => {
    expect(basicsSizeFor(4, 6)).toBe(4);
    expect(basicsSizeFor(7, 6)).toBe(5);
  });
});

describe("크기 탭마다 보일 강", () => {
  const ids = (n: number) => basicsLessons(n).map((l) => l.id);

  it("2×2는 두 독자의 조각 강 둘을 나란히, 그다음 표기 읽기", () => {
    expect(ids(2)).toEqual([
      "222-pieces",
      "222-from333-corners",
      "333-notation",
    ]);
  });

  it("3×3은 지금까지의 기초 강 셋 그대로", () => {
    expect(ids(3)).toEqual(["333-start", "333-piece-moves", "333-notation"]);
  });

  it("4×4·5×5는 그 크기의 조각 강, 그다음 표기 읽기", () => {
    expect(ids(4)).toEqual(["444-pieces", "333-notation"]);
    expect(ids(5)).toEqual(["555-pieces", "333-notation"]);
  });

  it("2×2 두 강의 이름은 독자를 가른다", () => {
    expect(
      basicsLessons(2)
        .map((l) => l.title)
        .slice(0, 2),
    ).toEqual(["2×2의 조각", "3×3에서 2×2로"]);
  });
});

describe("해법 강의에서 옮긴 조각 강(강 id 그대로, 진도가 이어진다)", () => {
  it.each([
    ["222-pieces", 2, "222-beginner"],
    ["222-from333-corners", 2, "222-from333"],
    ["444-pieces", 4, "444-reduction"],
    ["555-pieces", 5, "555-reduction"],
  ])(
    "%s는 %i×%i 기초 탭에 있고 「다음 강」은 %s의 첫 강이다",
    (id, size, method) => {
      const found = findLesson(id);
      expect(found && isBasicsCourse(found.course)).toBe(true);
      expect(found && basicsSizeOf(found.course)).toBe(size);
      const course = METHOD_COURSES.find((c) => c.id === method);
      expect(found && nextLesson(found.course, id)?.id).toBe(
        course?.lessons[0]?.id,
      );
    },
  );

  it("해법 강의에는 옮긴 조각 강이 남지 않는다(한 강은 한 곳에만)", () => {
    const methodIds = METHOD_COURSES.flatMap((c) => c.lessons.map((l) => l.id));
    for (const id of [
      "222-pieces",
      "222-from333-corners",
      "444-pieces",
      "555-pieces",
    ])
      expect(methodIds).not.toContain(id);
    const all = COURSES.flatMap((c) => c.lessons.map((l) => l.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("4×4 색 배치는 코너 블럭이 정한다(444-pieces 마지막 쪽)", () => {
  const COLOR_NAME: Record<number, string> = {
    [FACE_INDEX.U as number]: "흰",
    [FACE_INDEX.R as number]: "빨강",
    [FACE_INDEX.F as number]: "초록",
    [FACE_INDEX.D as number]: "노랑",
    [FACE_INDEX.L as number]: "주황",
    [FACE_INDEX.B as number]: "파랑",
  };
  const step = findLesson("444-pieces")?.lesson.steps.at(-1);
  const topo = cubeTopology(4);
  const ufr = pieceByName(4, "UFR");
  /** 그 상태에서 앞-오른쪽 위 코너 블럭의 오른쪽을 보는 스티커 색 */
  const rightOfUfr = (alg: string) => {
    const colors = faceColors(
      4,
      applyMoves(4, solvedCube(4), parseMoves(4, alg)),
    );
    const s = topo.pieces[ufr]?.stickers.find(
      (i) => topo.stickers[i]?.face === FACE_INDEX.R,
    );
    return COLOR_NAME[colors[s as number] as number];
  };

  it("고르기 답은 흰-초록-빨강 코너 블럭의 남은 색(빨강)이다", () => {
    expect(
      pieceFaces(4, ufr)
        .map((f) => COLOR_NAME[f])
        .sort(),
    ).toEqual(["흰", "초록", "빨강"].sort());
    const answer = step?.quiz?.choices[step.quiz.answer];
    expect(answer).toBe(rightOfUfr(""));
    expect(answer).toBe("빨강");
  });

  it("안쪽 층을 돌려 센터 블럭이 흩어져도 코너 블럭이 알려 주는 색은 그대로다", () => {
    const moved = applyMoves(4, solvedCube(4), parseMoves(4, "2R 2U 2F"));
    const colors = faceColors(4, moved);
    const rightCenters = cubeGroups(4, U)
      .centers.filter((p) => pieceFaces(4, p)[0] === FACE_INDEX.R)
      .flatMap((p) => topo.pieces[p]?.stickers ?? [])
      .map((s) => COLOR_NAME[colors[s] as number]);
    expect(rightCenters).not.toEqual(["빨강", "빨강", "빨강", "빨강"]);
    expect(rightOfUfr("2R 2U 2F")).toBe("빨강");
  });

  it("그림은 코너 블럭만 보이고 센터 블럭은 가린다(답을 센터가 알려 주지 않는다)", () => {
    const mask = maskFor(4, step?.mask);
    const corner = topo.pieces[ufr]?.stickers ?? [];
    expect(corner.map((s) => mask?.[s])).toEqual([
      "visible",
      "visible",
      "visible",
    ]);
    const centerStickers = cubeGroups(4, U).centers.flatMap(
      (p) => topo.pieces[p]?.stickers ?? [],
    );
    expect(centerStickers.some((s) => mask?.[s] === "visible")).toBe(false);
  });
});
