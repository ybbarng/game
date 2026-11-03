import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "yut-ai-strength",
    environment: "node",
    // 세기·시간 결과를 console로 찍는다. vitest 5는 통과한 시험의 출력을 기본으로 가려서 켠다
    silent: false,
    include: ["src/**/*.strength.ts"],
    testTimeout: 1_800_000,
  },
});
