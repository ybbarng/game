import type { BotLevel, BotPlan } from "@game/cube-ai";
import type { Scramble, ScrambleEvent } from "@game/cube-scramble";

/**
 * 큐브 워커가 받는 일과 돌려주는 답. 섞기(`cube-scramble`)와 3×3 풀이(`cube-solver`)는 처음 부를 때
 * 표를 만들어 오래 걸리므로 화면 스레드가 아니라 워커에서 한다. 컴퓨터 계획(`cube-ai` botPlan)도 해법기를 써서
 * 처음에는 1초 넘게 걸릴 수 있어 워커에서 만든다(경주 화면이 멈추지 않게).
 */
export type CubeJob =
  | { kind: "scramble"; event: ScrambleEvent; seed: number }
  | { kind: "solve"; facelets: string; maxLength?: number }
  | {
      kind: "plan";
      level: BotLevel;
      size: number;
      /** 시작 상태(PuzzleState의 perm·twist를 배열로) */
      perm: number[];
      twist: number[];
      seed: number;
    };

/** 워커가 돌려주는 답 */
export type CubeJobAnswer = Scramble | string | BotPlan;

export type CubeJobResult<J extends CubeJob> = J extends { kind: "scramble" }
  ? Scramble
  : J extends { kind: "plan" }
    ? BotPlan
    : string;

export type CubeJobMessage = { id: number; job: CubeJob };
export type CubeJobReply =
  | { id: number; result: CubeJobAnswer }
  | { id: number; error: string };

/** 일 하나를 한다(워커 안에서, 또는 워커를 못 쓸 때 화면 스레드에서). 무거운 패키지는 여기서 늦게 불러온다 */
export async function runCubeJob(job: CubeJob): Promise<CubeJobAnswer> {
  if (job.kind === "plan") {
    const { botPlan } = await import("@game/cube-ai");
    return botPlan(
      job.level,
      job.size,
      { perm: Uint16Array.from(job.perm), twist: Uint8Array.from(job.twist) },
      job.seed,
    );
  }
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
