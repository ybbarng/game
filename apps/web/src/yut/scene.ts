import type { Phase } from "@game/yut-engine";

/**
 * 윷놀이 화면의 두 장면(docs/37 15절): 던지는 장면(멍석 크게, 아래에 내 손의 윷, 윷판은 구석에 작게, 다른 사람은
 * 멍석 둘레)과 말 옮기는 장면(윷판 크게).
 *
 * - 누가 던질 차례이거나 던진 윷이 아직 굴러가는 동안(`tossing`)은 던지는 장면, 모은 결과로 말을 옮길 때와
 *   판이 끝났을 때는 말 옮기는 장면이다.
 * - 그래서 한 차례에 장면은 한 번 바뀐다(던지기 → 말 옮기기). 윷·모로 이어 던지면 단계가 다시 던지기라 그대로 머문다.
 *   상대 말을 잡아 한 번 더 던질 때만 그 차례 안에서 던지는 장면으로 돌아간다(새로 던지는 것이라).
 * - 낙이면 그 차례는 끝난다. 앞서 모은 결과(먼저 던진 윷 등)가 있으면 말 옮기는 장면으로 간다.
 */
export type YutScene = "throw" | "move";

export function sceneOf(phase: Phase, tossing: boolean): YutScene {
  if (tossing) return "throw";
  return phase === "move" || phase === "gameOver" ? "move" : "throw";
}
