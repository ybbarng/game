/**
 * 찍기 스크립트(`scripts/render-emblem-posters.mjs`)가 부르는 고리. 티어 화면 주소에 `?emblemCapture=1`이 있을 때만
 * `window.__emblemCapture`를 둔다(개발용 미리보기 페이지를 없애며 옮겼다, docs/47 14-7 「진열」). three.js 묶음은 이때만
 * 늦게 받는다. 제품 화면은 이 고리를 쓰지 않는다.
 */
export function installCaptureHook(search: string): void {
  if (new URLSearchParams(search).get("emblemCapture") !== "1") return;
  Promise.all([import("./stage"), import("./ladder")]).then(
    ([stage, ladder]) => {
      (window as { __emblemCapture?: unknown }).__emblemCapture = {
        frames: stage.captureFrames,
        measure: stage.measureEmblem,
        stills: (jobs: Parameters<typeof stage.captureShots>[0]) =>
          stage.captureShots(jobs, 0),
        print: ladder.lookPrint(),
        violations: ladder.ladderViolations,
      };
    },
  );
}
