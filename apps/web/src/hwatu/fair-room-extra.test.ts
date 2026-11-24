// @vitest-environment node
// 화투 암호화방 시험은 판을 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다
// (fair-room-one-round.test.ts 한 판짜리 게임 끝 검증, fair-room-vote.test.ts 끊긴 사람 투표)
import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@game/minhwatu-ai";
import { type MinhwatuView, STANDARD_RULES } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuRoomKit } from "@/minhwatu/fair-table";
import { closeWhenDone } from "@/net/close-when-done";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { reloadTab } from "@/net/reload-tab";

import {
  type AnyHost,
  hwatuHostOptions,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

const RULES = { ...STANDARD_RULES, rounds: 2 };

const phase = (host: AnyHost) =>
  (host.match?.current() as MinhwatuView | undefined)?.phase;

describe("화투 암호화방: 새로고침과 끊긴 사람", () => {
  // 참가자 새로고침은 나이롱뽕(가져온 카드는 그 사람만 알아 되살릴 것이 가장 많다)으로 본다: nyrongppong-reload.test.ts
  it("방장이 판 중간과 다음 판에서 새로고침해도 이어 치고, 판마다·게임 끝 검증을 통과한다", async () => {
    const {
      net,
      clock,
      host,
      guests,
      incidents,
      audits,
      verified,
      store,
      tab,
    } = await setupHwatu({
      kit: minhwatuRoomKit,
      rules: RULES,
      guests: 1,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
      hostStore: true,
    });
    if (!store || !tab) throw new Error("방장 저장소가 없다");
    await host.start();
    let current = host;
    let currentTab = tab;
    for (const [k, point] of [4, 18].entries()) {
      await playHwatu({
        host: current,
        guests,
        bot: minhwatuBeginnerBot,
        incidents,
        done: () => (current.match?.actionLog().length ?? 0) >= point,
      });
      net.disconnect(k === 0 ? "host" : `host${k}`);
      // 옛 탭은 사라진다: 더 남기지 못하고 계산도 멈춘다(reload-tab.ts)
      currentTab.reload(current);
      currentTab = reloadTab(store);
      // 메모리 네트워크는 끊김 알림을 마이크로태스크로 보내므로, 다음 차례 하나만 양보하면 모두에게 닿는다
      await new Promise((resolve) => setTimeout(resolve, 0));
      const restore = store.load();
      current = new HostRoom({
        transport: net.join(`host${k + 1}`),
        ...hwatuHostOptions({
          kit: minhwatuRoomKit,
          rules: RULES,
          bot: minhwatuIntermediateBot,
          botLevel: 1,
          clock,
          store: currentTab.store,
        }),
        ...(restore ? { restore } : {}),
      } as never) as AnyHost;
      current.onIncident((n) => incidents.push(n));
      closeWhenDone(current);
      await until(
        () => current.lobby().seats.every((s) => s.connected),
        "참가자 다시 연결",
      );
    }
    await playHwatu({
      host: current,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => phase(current) === "gameOver",
    });
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    current.finish();
    await until(() => audits.length === 1, "판 끝 검증");
    expect(audits).toEqual([{ ok: true }]);
    await until(() => verified.length === 2, "판마다 검증");
    expect(verified).toEqual([1, 2]);
  });
});
