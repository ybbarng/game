import { describe } from "vitest";

import { heroBigCaseTests } from "./core-fixtures-hero-big-cases";

// 큰 큐브 홈 시연 공통 자료의 7×7 판(머리·판 차례와 4×4는 core-fixtures-hero-big.test.ts)
describe("Rust 코어 공통 자료: 홈 시연(4×4~7×7 축소법)", () => {
  heroBigCaseTests([7]);
});
