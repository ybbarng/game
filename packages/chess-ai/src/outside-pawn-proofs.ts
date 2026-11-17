/*
 * 바깥 패스 폰 문제(웹 `chess/puzzles.ts` 「outside-pawn」)의 확인한 증명 기록(docs/26 6절).
 * 만드는 법과 확인은 bench `outside-pawn.strength.ts`. 웹 단위 시험은 이 기록으로 후보 증명이 같은지 본다.
 * 화면 묶음에 들어가지 않게 패키지 첫 입구(`index.ts`)가 아니라 따로 낸 입구(`@game/chess-ai/outside-pawn-proofs`)로 쓴다.
 */
import data from "./outside-pawn-proofs.json";
import type { PawnProofRecord } from "./queen-ending";

export const OUTSIDE_PAWN_PROOFS: readonly PawnProofRecord[] = data;
