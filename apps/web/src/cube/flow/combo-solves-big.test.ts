import { expectUnbrokenSolves } from "./combo-test-util";

// 4×4·5×5: 축소(센터·엣지 짝)부터 3×3 단계까지
expectUnbrokenSolves([
  [4, "beginner", [1]],
  [4, "advanced", [2]],
  [5, "beginner", [1]],
  [5, "advanced", [2]],
]);
