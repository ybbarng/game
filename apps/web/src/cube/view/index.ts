/**
 * 큐브 3D 장면을 늦게 불러온다. three.js는 큐브 화면을 열 때만 받는다(첫 화면 묶음에 싣지 않는다).
 *
 *   const { CubeView } = await loadCubeView();
 *   const view = CubeView.create(canvas, { n: 3 });
 *
 * 3D를 못 그리는 기기처럼 실패하면 화면마다 비스듬한 큐브 그림(SVG) 둘로 대신한다.
 */
export function loadCubeView(): Promise<typeof import("./cube-view")> {
  if (testNo3d()) return Promise.reject(new Error("시험이 3D 그리기를 껐다"));
  return import("./cube-view");
}

/**
 * 화면 시험의 「3D 끄기」(`window.__cubeNo3d`, e2e/cube.ts `no3d`). GPU 없는 CI는 장면 하나를 만들고 그리는 데
 * 몇 초씩 써서, 3D 그림을 보지 않는 시험도 그 시간을 기다렸다(2026-11-04 #1). 3D를 못 그리는 기기와 같은 길
 * (큐브 그림)로 간다. 제품은 이 값을 넣지 않는다
 */
function testNo3d(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as { __cubeNo3d?: boolean }).__cubeNo3d === true
  );
}

export type { CubeView } from "./cube-view";
export * from "./geometry";
export * from "./mirror";
export * from "./swipe";
export * from "./types";
