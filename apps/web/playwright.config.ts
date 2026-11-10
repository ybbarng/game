import { defineConfig, devices } from "@playwright/test";
import { BROWSER } from "./e2e/browser";
import { projectFilter } from "./e2e/projects";

/** 다른 작업 트리가 같은 포트로 띄운 서버를 재사용하지 않게 `E2E_PORT`로 바꿀 수 있다 */
const PORT = Number(process.env.E2E_PORT ?? 4173);

/** 실제 정적 빌드(out/)를 띄워 화면 크기별로 한 판을 끝까지 해 본다 */
export default defineConfig({
  testDir: "e2e",
  // 뜨는 브라우저가 보안 수정 뒤 버전인지 먼저 본다(e2e/browser.ts)
  globalSetup: "./e2e/global-setup.ts",
  // 멈춤을 빨리 드러내는 안전장치. 가장 긴 보통 시험이 이 기계에서 약 14초(2026-10-30, docs/38).
  // 여러 탭 멘탈 포커처럼 무거운 시험은 파일 안에서 따로 정한다
  timeout: 90_000,
  fullyParallel: true,
  // CI도 list를 함께 써서 시험마다 걸린 시간을 로그에 남긴다(느린 시험을 찾을 때 `gh run view --log`로 본다).
  // json은 시험마다 걸린 시간을 파일로 남겨, CI가 artifact로 올리고 scripts/slow-tests.mjs가 기준과 비교한다
  reporter: process.env.CI
    ? [["list"], ["github"], ["json", { outputFile: "test-times/e2e.json" }]]
    : "list",
  // 끝에 느린 파일 목록을 낸다(파일 하나가 이보다 오래 걸리면)
  reportSlowTests: { max: 15, threshold: 30_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // 연출(섞기·나눠 주기·던지기·말 움직임 등)을 실제 시간으로 기다리지 않는다.
    // 연출이 있는 길을 보는 시험만 `emulateMedia({ reducedMotion: "no-preference" })`로 켠다.
    contextOptions: { reducedMotion: "reduce" },
  },
  // 한 크기에서만 보는 시험은 태그(e2e/projects.ts)로 목록에서 뺀다. CI는 조각마다 spec 목록을 따로 넘겨
  // (scripts/affected-e2e.mjs가 지난 시험 시간으로 고르게 나눈다) 프로젝트 차례가 조각 나누기에 영향을 주지 않는다
  projects: [
    {
      name: "phone-portrait",
      ...projectFilter("phone-portrait"),
      use: { ...devices["Pixel 7"], ...BROWSER },
    },
    {
      name: "desktop",
      ...projectFilter("desktop"),
      use: {
        ...devices["Desktop Chrome"],
        ...BROWSER,
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "phone-landscape",
      ...projectFilter("phone-landscape"),
      use: { ...devices["Pixel 7 landscape"], ...BROWSER },
    },
  ],
  webServer: {
    command: `pnpm exec serve out -l ${PORT} --no-port-switching`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
