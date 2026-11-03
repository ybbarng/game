import type { Scramble, ScrambleEvent } from "@game/cube-scramble";

/**
 * 큐브 워커가 받는 일과 돌려주는 답. 섞기(`cube-scramble`)와 3×3 풀이(`cube-solver`)는 처음 부를 때
 * 표를 만들어 오래 걸리므로 화면 스레드가 아니라 워커에서 한다.
 */
export type CubeJob =
  | { kind: "scramble"; event: ScrambleEvent; seed: number }
  | { kind: "solve"; facelets: string; maxLength?: number };

export type CubeJobResult<J extends CubeJob> = J extends { kind: "scramble" }
  ? Scramble
  : string;

export type CubeJobMessage = { id: number; job: CubeJob };
export type CubeJobReply =
  | { id: number; result: Scramble | string }
  | { id: number; error: string };

/** 일 하나를 한다(워커 안에서, 또는 워커를 못 쓸 때 화면 스레드에서). 무거운 패키지는 여기서 늦게 불러온다 */
export async function runCubeJob(job: CubeJob): Promise<Scramble | string> {
  if (job.kind === "scramble") {
    const { scramble } = await import("@game/cube-scramble");
    return scramble(job.event, job.seed);
  }
  const { solve3x3 } = await import("@game/cube-solver");
  return solve3x3(
    job.facelets,
    job.maxLength === undefined ? {} : { maxLength: job.maxLength },
  );
}
