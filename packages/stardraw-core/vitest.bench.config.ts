import { defineProject } from "vitest/config";

/** 시간 재기(단위 시험이 아니다, docs/36 11-31): `pnpm --filter @mighty/stardraw-core bench` */
export default defineProject({
  test: {
    name: "stardraw-core-bench",
    environment: "node",
    include: ["bench/**/*.bench.ts"],
    testTimeout: 600_000,
  },
});
