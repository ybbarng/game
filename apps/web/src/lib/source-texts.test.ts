import { describe, expect, it } from "vitest";
import { sourceTexts } from "./source-texts";

const texts = (src: string) =>
  sourceTexts(src).map(({ text, whole, key, beforeTag }) => ({
    text,
    whole,
    ...(key ? { key } : {}),
    ...(beforeTag ? { beforeTag } : {}),
  }));

describe("소스에서 화면 글 뽑기", () => {
  it("문자열과 속성 이름", () => {
    expect(texts(`const a = { label: "입문", description: "둬요." };`)).toEqual(
      [
        { text: "입문", whole: true, key: "label" },
        { text: "둬요.", whole: true, key: "description" },
      ],
    );
  });

  it("주석과 개발자용 오류는 뽑지 않는다", () => {
    expect(
      texts(`// 주석이다\n/* 덩이 주석 */ throw new Error("봇이 없다");`),
    ).toEqual([]);
  });

  it("템플릿 자리는 ○로 바꾸고 그 안의 문자열도 뽑는다", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 템플릿이 든 소스 글을 입력으로 준다
    expect(texts('`${name} 차례 · ${x ? "쉬었어요" : ""}`')).toEqual([
      { text: "쉬었어요", whole: false },
      { text: "○ 차례 · ○", whole: true },
    ]);
  });

  it("JSX 글: 닫는 태그 앞이면 끝난 글, 이름·태그가 이어지면 이어지는 글", () => {
    expect(
      texts(
        `<p>윈도우 규칙을 따랐어요(옵션). 공정성은{" "}<a href="/s">어떻게?</a></p>`,
      ),
    ).toEqual([
      { text: "윈도우 규칙을 따랐어요(옵션). 공정성은", whole: false },
      { text: "어떻게?", whole: true },
    ]);
    expect(texts(`<div>방장이 나갔어요<button>나가기</button></div>`)).toEqual([
      { text: "방장이 나갔어요", whole: false, beforeTag: true },
      { text: "나가기", whole: true },
    ]);
  });

  it("JSX 글 속 따옴표는 문자열이 아니다", () => {
    expect(texts(`<p>원작의 "용어 사용"과 같아요.</p>`)).toEqual([
      { text: '원작의 "용어 사용"과 같아요.', whole: true },
    ]);
  });
});
