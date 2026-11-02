// 스트레스 측정 도구(bench/stress.ts, docs/36 11-30 9번)를 Node가 바로 돌리는 파일로 묶는다(운영 이미지에는 넣지 않는다)
import { defineConfig } from "rolldown";

export default defineConfig({
  input: {
    stress: "bench/stress.ts",
    "stress-server": "bench/stress-server.ts",
    watchers: "bench/watchers.ts",
    entries: "bench/entries.ts",
  },
  platform: "node",
  output: { dir: "dist/bench", format: "esm" },
  external: [/^node:/],
});
