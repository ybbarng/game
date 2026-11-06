import { expectUnbrokenSolves } from "./combo-test-util";

// 3×3 초보자·CFOP, 2×2 초보자·고급(큰 큐브는 combo-solves-big.test.ts, 따로 돌게 나눔)
expectUnbrokenSolves([
  [3, "beginner", [1, 2, 3, 4, 5, 6, 7, 8]],
  [3, "advanced", [1, 2, 3, 4, 5, 6, 7, 8]],
  [2, "beginner", [1, 2, 3, 4]],
  [2, "advanced", [1, 2, 3, 4]],
]);
