import { describe, it } from "vitest";
import { checkScramble } from "./scramble-test-util";

/**
 * 실제 입력: 화면이 쓰는 대회 규칙 섞기(4×4 무작위 수 40수)를 엔진 상태로 만들어 푼다.
 * 다른 시험의 `randomCubeState`와 달리 섞기 표기를 엔진으로 두는 길까지 함께 본다.
 */
describe("4×4 대회 섞기", () => {
  it.each([1, 2, 3])("씨앗 %i: 고수·축소법이 엔진에서 맞춘다", (seed) => {
    checkScramble("444", seed);
  });
});
