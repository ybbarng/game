// @vitest-environment node
import { describe, it } from "vitest";
import {
  HOST_RELOAD_TITLE,
  hostReloadCase,
} from "./fair-room-host-reload-case";

describe("멘탈 포커 온라인 대전: 방장 새로고침", () => {
  // 6마(죽이기·다시 나누기)는 새로고침한 그 판만 본다. 다음 판까지는 5마가 본다(fair-room-host-reload.test.ts)
  it(`6마(한 판): ${HOST_RELOAD_TITLE}`, () =>
    hostReloadCase("standard6", 1, [14, 40], 1));
});
