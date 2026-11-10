import { describe, expect, it } from "vitest";

import { COURSES, courseById } from "../learn";
import type { LearnProgress } from "../learn/progress";
import { type NextInput, nextStep } from "./next-step";

const beginner = courseById("333-beginner");
const cfop = courseById("cfop");
if (!beginner || !cfop) throw new Error("과정이 없다");

/** 과정 단원을 모두 끝낸 진도 */
const doneAll = (...ids: string[]): LearnProgress["lessons"] =>
  Object.fromEntries(
    ids.flatMap(
      (id) =>
        courseById(id)?.lessons.map((l) => [
          l.id,
          { passed: [], done: true },
        ]) ?? [],
    ),
  );

const input = (over: Partial<NextInput> = {}): NextInput => ({
  keysDone: 0,
  learn: { lessons: {} },
  solo3: 0,
  anySolo: false,
  ...over,
});

describe("다음에 할 것", () => {
  it("처음 온 사람은 사이트 쓰는 법", () => {
    expect(nextStep(input(), COURSES)).toMatchObject({
      kind: "intro",
      href: "/cube/intro",
    });
  });

  it("키 익히기를 했으면 처음 맞추기 첫 단원", () => {
    expect(nextStep(input({ keysDone: 3 }), COURSES)).toMatchObject({
      kind: "first-solve",
      title: "처음 맞추기",
      href: `/cube/learn?lesson=${beginner.lessons[0]?.id}`,
    });
  });

  it("처음 맞추기를 보던 중이면 그 단원부터 이어서", () => {
    const l = beginner.lessons[4];
    if (!l) throw new Error("단원이 없다");
    const step = nextStep(
      input({
        learn: {
          lessons: { [l.id]: { passed: [], done: false } },
          last: l.id,
        },
      }),
      COURSES,
    );
    expect(step).toMatchObject({
      kind: "first-solve",
      title: `처음 맞추기 이어서: ${l.title}`,
      href: `/cube/learn?lesson=${l.id}`,
    });
  });

  it("처음 맞추기를 끝냈고 혼자 완성 기록이 없으면 초보자 해법 연습", () => {
    expect(
      nextStep(input({ learn: { lessons: doneAll("333-beginner") } }), COURSES),
    ).toMatchObject({
      kind: "beginner-practice",
      href: "/cube/train?set=beginner-cross",
    });
  });

  it("맞출 줄 아는 사람(혼자 맞추기 기록이 있음)은 안내를 건너뛰고 기록 재기", () => {
    expect(nextStep(input({ anySolo: true, solo3: 2 }), COURSES)).toMatchObject(
      { kind: "solo", href: "/cube/solo" },
    );
  });

  it("5번 평균이 나오면 다음 해법(CFOP) 첫 단원", () => {
    expect(
      nextStep(
        input({
          anySolo: true,
          solo3: 5,
          learn: { lessons: doneAll("333-beginner") },
        }),
        COURSES,
      ),
    ).toMatchObject({
      kind: "method",
      title: `다음 해법: ${cfop.title}`,
      href: `/cube/learn?lesson=${cfop.lessons[0]?.id}`,
    });
  });

  it("권하는 해법을 다 끝냈으면 기록 재기", () => {
    expect(
      nextStep(
        input({
          anySolo: true,
          solo3: 12,
          learn: {
            lessons: doneAll("333-beginner", "cfop", "roux", "zz", "petrus"),
          },
        }),
        COURSES,
      ),
    ).toMatchObject({ kind: "solo" });
  });
});
