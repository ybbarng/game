import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "cube-ai",
    environment: "node",
    // 멈춘 시험을 잡는 안전장치. 해법 표 만들기가 들어 있어 부하 아래 느려질 수 있다(docs/38)
    testTimeout: 30_000,
  },
});
