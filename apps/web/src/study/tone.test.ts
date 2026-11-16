import { describe, expect, it } from "vitest";

import { lessonTexts, lineTexts, sentencesOf, toneProblems } from "./tone";

describe("수 배우기 글 말투 판정", () => {
  it("해요체 문장과 느낌표·물음표 문장은 통과한다", () => {
    expect(
      toneProblems([
        "단수를 쳐요. 백이 뻗어요.",
        "서로 버티는 법이었죠.",
        "장군!",
        "흑은?",
        "판 끝까지 몰았어요(긴 축).",
        "**굵게** 쓴 글도 봐요.",
      ]),
    ).toEqual([]);
  });

  it("마침표가 없으면 그 문장을 짚는다", () => {
    expect(toneProblems(["단수를 쳐요. 백이 뻗어요"])).toEqual([
      "마침표 없음: 백이 뻗어요",
    ]);
  });

  it("해라체·합쇼체로 끝난 문장을 짚는다", () => {
    expect(
      toneProblems(["단수를 친다. 축으로 잡혀요.", "실력을 키웁니다."]),
    ).toEqual(["해요체 아님: 단수를 친다.", "해요체 아님: 실력을 키웁니다."]);
  });

  it("끝 괄호 풀이를 빼도 해라체면 짚는다", () => {
    expect(toneProblems(["한 칸 떨어져 막는다(장문)."])).toEqual([
      "해요체 아님: 한 칸 떨어져 막는다(장문).",
    ]);
  });

  it("소수점은 문장을 나누지 않는다", () => {
    expect(sentencesOf("덤은 7.5예요. 6.5도 있어요.")).toEqual([
      "덤은 7.5예요.",
      "6.5도 있어요.",
    ]);
  });

  it("글 첫머리 번호는 문장으로 나누지 않는다", () => {
    expect(sentencesOf("1. 메이트: 체크메이트가 되는 수를 둬요.")).toEqual([
      "1. 메이트: 체크메이트가 되는 수를 둬요.",
    ]);
    expect(toneProblems(["2. 밀기: 한 칸 옮긴다."])).toEqual([
      "해요체 아님: 2. 밀기: 한 칸 옮긴다.",
    ]);
  });

  it("단원 글은 요약·설명·퀴즈 물음과 풀이·미션 글을 모으고 퀴즈 보기는 뺀다", () => {
    expect(
      lessonTexts([
        {
          summary: "요약",
          steps: [
            { kind: "explain", body: ["본문 하나", "본문 둘"] },
            { kind: "quiz", question: "물음", explain: "풀이" },
            {
              kind: "mission",
              objective: "목표",
              hint: "도움",
              success: "성공",
              fail: "실패",
            },
          ],
        },
      ]),
    ).toEqual([
      "요약",
      "본문 하나",
      "본문 둘",
      "물음",
      "풀이",
      "목표",
      "도움",
      "성공",
      "실패",
    ]);
  });

  it("수순 글은 소개와 갈래 안의 수 설명까지 모은다", () => {
    expect(
      lineTexts([
        {
          summary: "소개",
          moves: [
            { note: "첫 수" },
            {},
            { note: "셋째 수", branches: [[{ note: "갈래 첫 수" }, {}]] },
          ],
        },
      ]),
    ).toEqual(["소개", "첫 수", "셋째 수", "갈래 첫 수"]);
  });
});
