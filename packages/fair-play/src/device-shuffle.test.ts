import { describe, expect, it } from "vitest";

import type { FairDevice } from "./device";
import { network, passWaits, TEST_DECK, TEST_OWNERS } from "./device-fixture";
import { type Party, Party as PartyClass } from "./protocol";

describe("메시지로 하는 멘탈 포커", () => {
  describe("섞기 증명: 섞을 때 카드를 바꾸면 그 기기를 짚는다", () => {
    const stateOf = (d: FairDevice) =>
      (
        d as unknown as {
          deals: Map<
            number,
            {
              shuffles: Map<
                string,
                {
                  checked: Map<number, Promise<boolean>>;
                  commits: Map<number, unknown>;
                  nonces: Map<number, unknown>;
                  answers: Map<number, unknown>;
                }
              >;
            }
          >;
        }
      ).deals
        .get(1)
        ?.shuffles.get("0:shuffle");
    async function run(
      cheater: number | null,
      hideNonce = false,
      /** 정직한 기기가 할 일을 마치고 기다리는 시간이 지나기 전(속인 기기의 증명을 기다리는 중)에 부른다 */
      waiting?: (devices: FairDevice[]) => void,
    ) {
      // 고친 프로그램이 nonce를 숨기면(남의 nonce를 보고 도전값이 불리하다고 보고 멈춘다) 보내지 않는다.
      const { devices, clock, settle } = network([0, 1, 2], {
        drop: (m, from) =>
          hideNonce && from === cheater && m.k === "sproof" && !!m.nonce,
      });
      const problems: { by: number; device: number | null; reason: string }[] =
        [];
      for (const d of devices)
        d.on("problem", (_deal, reason, device) =>
          problems.push({ by: d.id, device, reason }),
        );
      // 속이는 기기: 섞은 덱에서 한 장을 다른 카드의 복제로 바꾼다(그 카드를 엿볼 수 있게).
      const real = PartyClass.prototype.lockAndShuffle;
      PartyClass.prototype.lockAndShuffle = async function (
        this: Party,
        deck,
        pass,
      ) {
        const out = await real.call(this, deck, pass);
        if (this.id === cheater && pass === "shuffle")
          out[1] = out[2] as bigint;
        return out;
      };
      try {
        for (const d of devices) {
          d.start(1, [0, 1, 2], TEST_DECK);
          d.assign(1, TEST_OWNERS);
        }
        // 정직한 기기는 할 수 있는 일(섞기 증명 계산·확인까지)을 모두 마친다.
        await settle();
        waiting?.(devices);
        // 그 뒤에 기다리는 시간이 하나씩 지나게 한다. 정직한 기기의 증명은 이미 와 있어 늦은 것으로 몰리지 않는다.
        await passWaits({ clock, settle });
      } finally {
        PartyClass.prototype.lockAndShuffle = real;
      }
      return { devices, problems };
    }

    it("정직하면 모두가 서로의 섞기 증명을 확인하고 아무도 짚지 않는다", async () => {
      const { devices, problems } = await run(null);
      expect(problems).toEqual([]);
      for (const d of devices) {
        const results = await Promise.all(stateOf(d)?.checked.values() ?? []);
        expect(results).toEqual([true, true]);
      }
    });

    it("복제 카드를 넣고 nonce를 숨기면(도전값을 정하지 못하게) 조작이 드러날 때 nonce를 공개하지 않은 그 기기를 짚는다", async () => {
      const { devices, problems } = await run(1, true);
      // 늦거나 없는 것만으로는 바로 탓하지 않는다(느린 정직한 기기일 수 있다).
      expect(problems.filter((p) => p.by !== 1 && p.device !== null)).toEqual(
        [],
      );
      // 같은 카드가 드러났을 때처럼 범인을 찾는다.
      for (const d of [devices[0], devices[2]]) {
        const culprit = await d?.shuffleCulprit(1);
        expect(culprit?.device).toBe(1);
        expect(culprit?.reason).toMatch(/nonce를 공개하지/);
      }
    });

    it("복제 카드를 넣고 섞으면(응답을 만들 수 없다) 조작이 드러날 때 다른 두 기기가 그 기기를 짚는다", async () => {
      const { devices } = await run(1);
      for (const d of [devices[0], devices[2]]) {
        const culprit = await d?.shuffleCulprit(1);
        expect(culprit?.device).toBe(1);
        expect(culprit?.reason).toMatch(/섞기 증명/);
      }
    });

    it("섞기 증명을 기다리는 중에 범인을 물으면, 기다림이 지나고 기기가 한가해졌을 때 이미 답이 나와 있다", async () => {
      // 조작이 드러나는 때가 증명 주고받기가 끝나기보다 빠를 수 있다. 그때 답(확정 알림)을 기기 일 밖에서
      // 실제 시간으로 되물어 늦게 내면, 한가해진 기기를 본 쪽은 「확인하는 중」만 보게 된다.
      const answers: (number | null)[] = [];
      await run(1, false, (devices) => {
        for (const d of [devices[0], devices[2]])
          void d
            ?.shuffleCulprit(1)
            .then((culprit) => answers.push(culprit?.device ?? null));
      });
      expect(answers).toEqual([1, 1]);
    });
  });
});
