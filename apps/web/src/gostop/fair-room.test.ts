// @vitest-environment node
import { gostopIntermediateBot } from "@game/gostop-ai";
import { GOSTOP3_RULES, type GostopState } from "@game/gostop-engine";
import { describe, expect, it } from "vitest";

import { setupHwatu, until } from "@/hwatu/fair-room-fixture";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import { gostopRoomKit } from "./fair-table";

/** 이 씨앗(시험 난수원)이면 3명 첫 판에서 누군가 총통을 받는다. 바꾸면 이 시험의 앞 확인이 짚는다 */
const CHONGTONG_SEED = "gostop-chongtong-98";

describe("고스톱 암호화방(멘탈 포커)", () => {
  // 끝까지 치는 판(맞고·3명, 판 잇기)은 카드 표 약속을 암호 없이 본다(fair.test.ts). 화투 진행을 진짜 암호로
  // 이어 붙인 한 판은 hwatu/nyrongppong-reload.test.ts가 본다. 여기서는 고스톱만의 길(총통)을 진짜 암호로 본다.
  it("3명 한 판이 첫 판 총통으로 시작하자마자 끝나도 판 끝 기록을 공개해 검증한다", async () => {
    const { host, incidents, audits, verified } = await setupHwatu({
      kit: gostopRoomKit,
      rules: { ...GOSTOP3_RULES, rounds: 1 },
      guests: 1,
      bot: gostopIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
      seed: CHONGTONG_SEED,
    });
    await host.start();
    const state = host.match?.rawState() as GostopState;
    expect(state.phase).toBe("gameOver");
    expect(state.result?.kind).toBe("chongtong");
    // 뒤따르는 화면이 없으니 시작할 때 판 끝 기록을 보내야 한다(예전에는 보내지 않아 참가자가 끝없이 기다렸다).
    await until(() => audits.length === 1, "판 끝 검증");
    expect(audits).toEqual([{ ok: true }]);
    await until(() => verified.length === 1, "판마다 검증");
    expect(incidents).toEqual([]);
  });
});
