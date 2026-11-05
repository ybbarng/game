import type { BotLevel, BotPlan } from "@game/cube-ai";
import type { Scramble, ScrambleEvent } from "@game/cube-scramble";

import type { AlgBook, ImportResult } from "../algs/store";
import type { CrossRound, CrossRoundRequest } from "../cross/scramble";
import type { HeroSolve } from "../hero/methods";
import type { ShortSolution } from "../progress/distance";

/**
 * 큐브 워커가 받는 일과 돌려주는 답. 섞기(`cube-scramble`)와 3×3 풀이(`cube-solver`)는 처음 부를 때
 * 표를 만들어 오래 걸리므로 화면 스레드가 아니라 워커에서 한다. 컴퓨터 계획(`cube-ai` botPlan)도 해법기를 써서
 * 처음에는 1초 넘게 걸릴 수 있어 워커에서 만든다(대결 화면이 멈추지 않게).
 * 내 공식 가져오기(`algs-import`)도 공식마다 검사기를 돌려 길어질 수 있어 워커에서 한다.
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
    }
  | { kind: "algs-import"; book: AlgBook; text: string }
  | {
      /** 첫 화면 연출의 사람 흉내 해법(`hero/methods.ts` 표의 id) */
      kind: "hero";
      method: string;
      perm: number[];
      twist: number[];
    }
  | {
      /** 맞춘 상태까지 가장 짧은 수(`max`보다 멀면 null), 2×2·3×3만(`progress/distance.ts`) */
      kind: "distance";
      size: number;
      perm: number[];
      twist: number[];
      max: number;
    }
  | {
      /** 이 섞기의 짧은 풀이(결과 상자) */
      kind: "short";
      size: number;
      perm: number[];
      twist: number[];
    }
  | {
      /** 십자 훈련 한 판(어려움에 맞는 섞기 + 최적 수·해, `cross/scramble.ts`) */
      kind: "cross";
      request: CrossRoundRequest;
    };

/** 워커가 돌려주는 답 */
export type CubeJobAnswer =
  | Scramble
  | string
  | BotPlan
  | ImportResult
  | HeroSolve
  | CrossRound
  | ShortSolution
  | number
  | null;

export type CubeJobResult<J extends CubeJob> = J extends { kind: "scramble" }
  ? Scramble
  : J extends { kind: "plan" }
    ? BotPlan
    : J extends { kind: "algs-import" }
      ? ImportResult
      : J extends { kind: "hero" }
        ? HeroSolve
        : J extends { kind: "cross" }
          ? CrossRound
          : J extends { kind: "distance" }
            ? number | null
            : J extends { kind: "short" }
              ? ShortSolution | null
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
  if (job.kind === "hero") {
    const { solveForHero } = await import("../hero/methods");
    return solveForHero(job.method, {
      perm: Uint16Array.from(job.perm),
      twist: Uint8Array.from(job.twist),
    });
  }
  if (job.kind === "distance" || job.kind === "short") {
    const { distanceToSolved, shortSolution } = await import(
      "../progress/distance"
    );
    const state = {
      perm: Uint16Array.from(job.perm),
      twist: Uint8Array.from(job.twist),
    };
    return job.kind === "distance"
      ? distanceToSolved(job.size, state, job.max)
      : shortSolution(job.size, state);
  }
  if (job.kind === "cross") {
    const { makeCrossRound } = await import("../cross/scramble");
    return makeCrossRound(job.request);
  }
  if (job.kind === "algs-import") {
    const { importAlgBook } = await import("../algs/store");
    return importAlgBook(job.book, job.text);
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
