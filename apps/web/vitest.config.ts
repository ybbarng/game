import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [react()],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    name: "web",
    // 기본은 node. 화면(DOM)·브라우저 저장소(localStorage·location 등)가 필요한 시험만 파일 맨 위에
    // `// @vitest-environment jsdom`을 단다. jsdom은 파일마다 새로 만들어 무겁다(2026-11-01, 지시 없는
    // 별 따기 시험 19개가 jsdom으로 돌아 전체 시간의 약 15%를 썼다). 예전 `node` 지시는 남아 있어도 같다
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // 멈춘 시험을 잡는 안전장치. 가장 긴 온라인 방 시험이 혼자 약 2~4초, 부하 아래 10배까지 느려진다(가장 긴 3.5초 → 35초)(2026-10-30, docs/38)
    testTimeout: 60_000,
  },
});
