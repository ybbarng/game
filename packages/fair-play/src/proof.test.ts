import { describe, expect, it } from "vitest";

import {
  combineStatement,
  hash,
  type KeyProof,
  type KeyStatement,
  proveKeys,
  verifyKeys,
} from "./proof";
import { combine, encodeIndex, newKey, newPassKey, type SraGroup } from "./sra";
import { TEST_GROUPS } from "./test-groups";

/**
 * 거짓 진술에 공격자가 낼 수 있는 가장 그럴듯한 증명: 확인하는 쪽과 똑같이 공개 값에서 A·B를 계산해 도전값을
 * 맞추고, 아는 지수 u로 응답한다. 첫 식(g^z = a·V^c)은 늘 맞으니 거짓을 막는 것은 둘째 식(A^z = b·B^c)뿐이다.
 * `proveKeys`는 r255처럼 곱하기 비용이 같은 군에서 B를 A^u로 계산해, 거짓 진술이면 도전값부터 어긋나 첫 식에서
 * 떨어진다(둘째 식을 빼도 시험이 통과했다, 2026-11-25). 도전값 식은 `proof.ts` `challenge`와 같아야 한다(맞는
 * 진술로 만든 증명이 통과하는지 첫 시험이 본다)
 */
async function forgeProof(
  g: SraGroup,
  st: KeyStatement,
  u: bigint,
): Promise<KeyProof> {
  const { A, B } = await combineStatement(g, st);
  const r = newKey(g);
  const a = g.pow(g.generator, r);
  const b = g.pow(A, r);
  const c = (await hash(["c", st.device, g.generator, st.v, A, B, a, b])) % g.q;
  const z = (r + c * u) % g.q;
  return { a: a.toString(16), b: b.toString(16), z: z.toString(16) };
}

describe.each(TEST_GROUPS)("군 %s", (_name, g) => {
  /** 기기 하나가 자리 셋을 다시 잠근다: O[i] = I[i]^(u·k_i) */
  function relocked() {
    const u = newKey(g);
    const keys = [newPassKey(g), newPassKey(g), newPassKey(g)];
    const input = [3, 8, 20].map((i) => g.pow(encodeIndex(g, i), newKey(g)));
    const output = input.map((c, i) =>
      g.pow(c, combine(g, [u, keys[i] as bigint])),
    );
    const st: KeyStatement = {
      device: 2,
      v: g.pow(g.generator, u),
      items: keys.map((key, i) => ({
        slot: i,
        input: input[i] as bigint,
        output: output[i] as bigint,
        key,
      })),
    };
    return { u, st };
  }

  describe("열쇠 증명(Chaum–Pedersen)", () => {
    it("잠글 때 쓴 열쇠를 공개하면 증명이 맞는다", async () => {
      const { u, st } = relocked();
      const proof = await proveKeys(g, st, u);
      expect(await verifyKeys(g, st, proof)).toBe(true);
      // 공격자 흉내(forgeProof)도 맞는 진술이면 통과한다: 도전값 식이 제품과 같다.
      expect(await verifyKeys(g, st, await forgeProof(g, st, u))).toBe(true);
    });

    it("다른 열쇠를 공개하면 증명을 만들 수 없다", async () => {
      const { u, st } = relocked();
      const lie: KeyStatement = {
        ...st,
        items: st.items.map((item, i) =>
          i === 1 ? { ...item, key: newPassKey(g) } : item,
        ),
      };
      expect(await verifyKeys(g, lie, await proveKeys(g, lie, u))).toBe(false);
      expect(await verifyKeys(g, lie, await forgeProof(g, lie, u))).toBe(false);
    });

    it("맞는 증명이라도 다른 기기·다른 열쇠에 옮겨 쓰면 맞지 않는다", async () => {
      const { u, st } = relocked();
      const proof = await proveKeys(g, st, u);
      expect(await verifyKeys(g, { ...st, device: 3 }, proof)).toBe(false);
      const swapped: KeyStatement = {
        ...st,
        items: st.items.map((item, i) =>
          i === 0 ? { ...item, key: item.key + 1n } : item,
        ),
      };
      expect(await verifyKeys(g, swapped, proof)).toBe(false);
    });

    it("잠근 값을 바꿔치기했으면 맞는 열쇠로도 증명이 맞지 않는다", async () => {
      const { u, st } = relocked();
      const tampered: KeyStatement = {
        ...st,
        items: st.items.map((item, i) =>
          i === 2 ? { ...item, output: encodeIndex(g, 5) } : item,
        ),
      };
      expect(
        await verifyKeys(g, tampered, await proveKeys(g, tampered, u)),
      ).toBe(false);
      expect(
        await verifyKeys(g, tampered, await forgeProof(g, tampered, u)),
      ).toBe(false);
    });

    it("틀린 열쇠 둘이 서로 지워지게 고를 수 없다(가중치를 해시로 정한다)", async () => {
      // 같은 값을 두 자리에 잠갔다고 하자. 가중치 없이 곱하면 열쇠 하나를 d만큼 키우고 다른 하나를
      // d만큼 줄여도 곱이 같아 증명이 맞아 버린다.
      const u = newKey(g);
      const input = g.pow(encodeIndex(g, 4), newKey(g));
      const [k1, k2] = [newPassKey(g), newPassKey(g)];
      const item = (slot: number, key: bigint) => ({
        slot,
        input,
        output: g.pow(input, combine(g, [u, key])),
        key,
      });
      const honest = [item(0, k1), item(1, k2)];
      const d = 12345n;
      const lie: KeyStatement = {
        device: 1,
        v: g.pow(g.generator, u),
        items: [
          { ...(honest[0] as (typeof honest)[0]), key: k1 + d },
          { ...(honest[1] as (typeof honest)[0]), key: k2 - d },
        ],
      };
      expect(await verifyKeys(g, lie, await proveKeys(g, lie, u))).toBe(false);
      expect(await verifyKeys(g, lie, await forgeProof(g, lie, u))).toBe(false);
    });
  });
});
