/**
 * 윷 던지기 3D 장면 코드(three.js가 함께 실린다)를 한 번만 불러온다. 멍석(`TossMat.tsx`)이 장면을 붙일 때 쓰고,
 * 화면 묶음을 따로 받는 곳(복기의 윷 다시 보기)은 그 묶음과 함께 `preloadTossScene`으로 미리 받기 시작한다
 * (화면이 뜬 뒤에야 받기 시작하면 「복기 → 다시 보기 화면 → 3D 장면」을 차례로 받아 멍석이 늦게 뜬다)
 */

let loading: Promise<typeof import("./toss-scene")> | null = null;

/** 3D 장면 코드. 받다 실패하면 다음에 다시 받는다 */
export function loadTossScene(): Promise<typeof import("./toss-scene")> {
  if (!loading) {
    const next = import("./toss-scene");
    loading = next;
    next.catch(() => {
      if (loading === next) loading = null;
    });
  }
  return loading;
}

/** 3D 멍석을 띄울 것 같으면(움직임 줄이기가 아니면) 장면 코드를 미리 받아 둔다 */
export function preloadTossScene(): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  loadTossScene().catch(() => {});
}
