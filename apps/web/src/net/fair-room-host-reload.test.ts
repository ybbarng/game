// @vitest-environment node
import { describe, it } from "vitest";
import {
  HOST_RELOAD_TITLE,
  hostReloadCase,
} from "./fair-room-host-reload-case";

describe("멘탈 포커 온라인 대전: 방장 새로고침", () => {
  // 새로고침 뒤 다음 판(새로 섞기)까지 이어 가는지는 5마 두 판으로 본다. 6마(죽이기·다시 나누기)는 그 판만
  // fair-room-host-reload-six.test.ts가 본다(오래 걸려 파일을 나눠 동시에 돈다)
  it(`5마(두 판): ${HOST_RELOAD_TITLE}`, () =>
    hostReloadCase("standard5", 1, [8, 30], 2));
});
