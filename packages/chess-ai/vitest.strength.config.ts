import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "chess-ai-strength",
    environment: "node",
    include: ["src/**/*.strength.ts"],
    // 초고수 대 고수 20판은 부하가 있는 맥에서 30분을 넘는다(2026-11-03 약 34분)
    testTimeout: 3_600_000,
  },
});
