import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "chess-ai-strength",
    environment: "node",
    // 세기·시간 결과를 console로 찍는다. vitest 5는 통과한 시험의 출력을 기본으로 가려서 켠다
    silent: false,
    include: ["src/**/*.strength.ts"],
    // 초고수 대 고수 20판은 부하가 있는 맥에서 30분을 넘는다(2026-11-03 약 34분)
    testTimeout: 3_600_000,
  },
});
