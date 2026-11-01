import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * 별 따기 아이콘 검토용 그림 뽑기(단위 시험이 아니다). 실행:
 *   ICON_OUT=<폴더> pnpm --filter @mighty/web exec vitest run --config scripts/icon-review/vitest.config.ts
 * `render.review.tsx`가 아이콘을 크기별 PNG로 써 둔다. 비교 그림은 `sheet.mjs`가 만든다.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": new URL("../../src", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    include: ["scripts/icon-review/*.review.tsx"],
    root: new URL("../..", import.meta.url).pathname,
    testTimeout: 120_000,
  },
});
