import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "galaxy-ai",
    environment: "node",
    // 멈춘 시험을 잡는 안전장치로만 둔다(CLAUDE.md flaky 규칙). 평소 시험 하나 1초 안쪽
    testTimeout: 30_000,
    // 컴퓨터끼리 수천 판을 두는 밸런스 bench는 `pnpm bench`로 따로(CI 워크플로 galaxy-bench)
    exclude: ["**/node_modules/**", "**/*.strength.ts"],
  },
});
