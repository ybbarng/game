import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/*",
      // 저장소 도구(scripts/*.mjs)의 시험
      {
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.mjs"],
          environment: "node",
        },
      },
    ],
    // `--changed <기준>`(CI·push 전 검사, 2026-11-04)은 바뀐 파일을 불러오는 시험만 돌린다. 아래 파일이 바뀌면 전부 돈다.
    // 기본값(package.json, vitest·vite 설정)에 더해: 타입·의존·런타임 설정, CI 자체, 그리고 시험이 import가 아니라
    // 파일로 읽는 것(모듈 그래프에 안 잡힌다): stats/pinned-script.test.ts가 읽는 public/stats,
    // stardraw-cli/site.test.ts가 실행하는 build-hashes.mjs
    forceRerunTriggers: [
      "**/package.json",
      "**/{vitest,vite}.config.*",
      "**/tsconfig*.json",
      "**/pnpm-lock.yaml",
      "**/pnpm-workspace.yaml",
      "**/biome.json",
      "**/.node-version",
      "**/.github/workflows/ci.yml",
      "**/apps/web/public/stats/**",
      // src/sw.test.ts가 읽어 돌리는 서비스 워커
      "**/apps/web/public/sw.js",
      // src/cubie/appcast.test.ts가 읽는 Cubie 업데이트 목록(새 판마다 바뀐다)
      "**/apps/web/public/cubie/appcast.xml",
      "**/apps/web/scripts/build-hashes.mjs",
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**"],
    },
  },
});
