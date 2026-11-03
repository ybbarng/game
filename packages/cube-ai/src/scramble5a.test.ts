import { describe, it } from "vitest";
import { checkScramble } from "./scramble-test-util";

/**
 * 실제 입력: 화면이 쓰는 대회 규칙 섞기(5×5 무작위 수 60수)를 엔진 상태로 만들어 푼다.
 * 5×5는 축소법 한 번이 수백 ms라(고수·초고수가 같은 결과를 나눠 쓴다), 파일 하나가 2초를 넘지 않게 씨앗마다 파일을
 * 나눈다(scramble5a·5b, 파일끼리는 동시에 돈다).
 */
describe("5×5 대회 섞기", () => {
  it("씨앗 1: 고수·축소법이 엔진에서 맞춘다", () => {
    checkScramble("555", 1);
  });
});
