// 규모 측정 도구를 Node가 바로 돌리는 파일로 묶는다(운영 이미지에는 넣지 않는다, docs/36 11-30)
import { defineConfig } from "rolldown";

export default defineConfig({
  input: {
    sizes: "bench/sizes.ts",
    argon: "bench/argon.ts",
    rush: "bench/rush.ts",
    blast: "bench/blast.ts",
    verify: "bench/verify.ts",
  },
  platform: "node",
  output: { dir: "dist/bench", format: "esm" },
  external: [/^node:/],
});
