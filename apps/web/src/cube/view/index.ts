/**
 * 큐브 3D 장면을 늦게 불러온다. three.js는 큐브 화면을 열 때만 받는다(첫 화면 묶음에 싣지 않는다).
 *
 *   const { CubeView } = await loadCubeView();
 *   const view = CubeView.create(canvas, { n: 3 });
 */
export function loadCubeView(): Promise<typeof import("./cube-view")> {
  return import("./cube-view");
}

export type { CubeView } from "./cube-view";
export * from "./geometry";
export * from "./types";
