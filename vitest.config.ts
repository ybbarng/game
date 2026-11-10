import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** 저장소 맨 위 package.json(절대 경로). 바뀐 파일 목록이 절대 경로라 그대로 맞춘다 */
const ROOT_PACKAGE_JSON = fileURLToPath(
  new URL("./package.json", import.meta.url),
);

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
    // 루트 package.json, vitest·vite 설정, 타입·의존·런타임 설정, CI 자체, 그리고 시험이 import가 아니라 파일로 읽는 것
    // (모듈 그래프에 안 잡힌다): stats/pinned-script.test.ts가 읽는 public/stats, stardraw-cli/site.test.ts가 실행하는
    // build-hashes.mjs.
    // 2026-11-10 줄임: 패키지마다의 package.json은 뺐다. 의존을 바꾸면 lockfile(pnpm-lock.yaml은 패키지마다의 의존을
    // 적는다)이 함께 바뀌어 전부 돌고, 그 밖의 변경(scripts·exports)은 CI의 typecheck 전체와 매일 전부 실행이 본다.
    // 시험이 파일로 읽던 appcast·sw.js·큐브 page 목록은 import.meta.glob으로 읽게 바꿔 모듈 그래프로 따라간다.
    // 시험이 파일로 읽는 입력을 새로 두면, 되도록 import.meta.glob(?raw)으로 읽고 안 되면 여기에 더한다
    forceRerunTriggers: [
      ROOT_PACKAGE_JSON,
      "**/{vitest,vite}.config.*",
      "**/tsconfig*.json",
      "**/pnpm-lock.yaml",
      "**/pnpm-workspace.yaml",
      "**/biome.json",
      "**/.node-version",
      "**/.github/workflows/ci.yml",
      "**/apps/web/public/stats/**",
      "**/apps/web/scripts/build-hashes.mjs",
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**", "apps/*/src/**"],
    },
  },
});
