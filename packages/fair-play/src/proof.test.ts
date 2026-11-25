import { describe, expect, it } from "vitest";

import {
  combineStatement,
  hash,
  type KeyProof,
  type KeyStatement,
  proveKeys,
  verifyKeys,
} from "./proof";
import {
  combine,
  encodeIndex,
  GROUP_1024,
  GROUP_2048,
  newKey,
  newPassKey,
  type SraGroup,
} from "./sra";
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
  return (await forgeWith(g, st, u, newKey(g))).proof;
}

/** `forgeProof`를 정한 r로. 도전값 c와 식에 넣는 값(a, b, z)도 돌려준다 */
async function forgeWith(g: SraGroup, st: KeyStatement, u: bigint, r: bigint) {
  const { A, B } = await combineStatement(g, st);
  const a = g.pow(g.generator, r);
  const b = g.pow(A, r);
  const c = (await hash(["c", st.device, g.generator, st.v, A, B, a, b])) % g.q;
  const z = (r + c * u) % g.q;
  return {
    proof: { a: a.toString(16), b: b.toString(16), z: z.toString(16) },
    A,
    B,
    a,
    b,
    c,
    z,
  };
}

/** 기기 하나가 자리 셋을 다시 잠근다: O[i] = I[i]^(u·k_i) */
function relockedIn(g: SraGroup) {
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

describe.each(TEST_GROUPS)("군 %s", (_name, g) => {
  const relocked = () => relockedIn(g);

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

/** 진술의 한 자리(0번) 잠근 값을 바꾼다 */
function withOutput0(st: KeyStatement, output: bigint): KeyStatement {
  return {
    ...st,
    items: st.items.map((item, i) => (i === 0 ? { ...item, output } : item)),
  };
}

// 군마다 다른 속임이라 군 계층으로 따로 본다. 모두 "두 식은 맞는데 값이 군 밖"이라 `isElement` 확인만 막는다.
describe("열쇠 증명: 군 밖의 값으로 맞춘 증명", () => {
  it("1024: 잠근 값에 위수 2인 p−1을 곱하고 짝수 도전값을 골라 두 식을 맞춘 증명도 거절한다", async () => {
    const g = GROUP_1024;
    // (p−1)² = 1 (mod p)라 위수 2이고, 이차잉여가 아니라 크기 q 부분군 밖이다.
    const minusOne = g.p - 1n;
    // 0번 자리 잠근 값 O에 p−1을 곱한다. 그 자리 가중치가 홀수면 B = (p−1)·A^u라, 짝수 도전값에서는
    // B^c = A^(u·c)로 둘째 식이 맞는다. 가중치는 진술의 해시라 잠그기를 새로 해 가며 홀수인 진술을 찾는다(평균 두 번).
    for (;;) {
      const { u, st } = relockedIn(g);
      const lie = withOutput0(
        st,
        g.mul(st.items[0]?.output as bigint, minusOne),
      );
      const { A, B } = await combineStatement(g, lie);
      if (B !== g.mul(minusOne, g.pow(A, u))) continue;
      // 공격자는 도전값이 짝수가 될 때까지 r을 다시 고른다(평균 두 번).
      for (;;) {
        const f = await forgeWith(g, lie, u, newKey(g));
        if (f.c % 2n !== 0n) continue;
        // 군 확인이 없으면 통과할 증명이다: 두 식이 모두 맞고, 군 밖인 값은 B 하나다.
        expect(g.pow(g.generator, f.z)).toBe(g.mul(f.a, g.pow(lie.v, f.c)));
        expect(g.pow(f.A, f.z)).toBe(g.mul(f.b, g.pow(f.B, f.c)));
        const inGroup = [lie.v, f.a, f.b, f.A, f.B].map((x) => g.isElement(x));
        expect(inGroup).toEqual([true, true, true, true, false]);
        expect(await verifyKeys(g, lie, f.proof)).toBe(false);
        return;
      }
    }
  });

  // 곱셈군(옛 방·보안 설명 데모)과 r255 모두. 곱셈군은 1을 원소로 받아 이 진술이 통과했다(2026-11-25 고침).
  it.each([
    ["1024", GROUP_1024],
    ["2048", GROUP_2048],
    ["r255", TEST_GROUPS.find(([name]) => name === "r255")?.[1] as SraGroup],
  ] as const)(
    "%s: 지수 0(항등원)으로 잠갔다는 진술은 두 식이 맞아도 거절한다",
    async (_, g) => {
      // V = 항등원이고 잠근 값을 모두 항등원으로 두면(카드를 지워 버림) u = 0으로 B = A^0 = 항등원이 맞는 진술이 된다.
      const { st } = relockedIn(g);
      const lie: KeyStatement = {
        ...st,
        v: g.one,
        items: st.items.map((item) => ({ ...item, output: g.one })),
      };
      const f = await forgeWith(g, lie, 0n, newKey(g));
      expect(g.pow(g.generator, f.z)).toBe(g.mul(f.a, g.pow(lie.v, f.c)));
      expect(g.pow(f.A, f.z)).toBe(g.mul(f.b, g.pow(f.B, f.c)));
      expect([lie.v, f.B].map((x) => g.isElement(x))).toEqual([false, false]);
      expect(await verifyKeys(g, lie, f.proof)).toBe(false);
    },
  );

  it("r255: 점의 표준 인코딩이 아닌 값을 낸 증명은 계산 오류 없이 거절한다", async () => {
    const g = TEST_GROUPS.find(([name]) => name === "r255")?.[1] as SraGroup;
    const { u, st } = relockedIn(g);
    const f = await forgeWith(g, st, u, newKey(g));
    // 첫 바이트(작은 끝 인코딩의 가장 낮은 바이트)의 맨 아래 비트는 표준 인코딩에서 늘 0이다(음수가 아닌 수).
    const bent = f.a ^ (1n << 248n);
    expect([f.a, bent].map((x) => g.isElement(x))).toEqual([true, false]);
    await expect(
      verifyKeys(g, st, { ...f.proof, a: bent.toString(16) }),
    ).resolves.toBe(false);
  });
});
