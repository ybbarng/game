import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "galaxy-ai-strength",
    environment: "node",
    // 결과 표를 console로 찍는다. vitest 5는 통과한 시험의 출력을 기본으로 가려서 켠다
    silent: false,
    include: ["src/**/*.strength.ts"],
    testTimeout: 3_600_000,
  },
});
