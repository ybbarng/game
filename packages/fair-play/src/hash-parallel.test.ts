import { fullDeck } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { combineStatement, hash, type KeyStatement } from "./proof";
import { encodedDeck } from "./protocol";
import {
  commitShuffle,
  type ShuffleLabel,
  secretsOf,
  weights,
} from "./shuffle-proof";
import type { SraGroup } from "./sra";
import { TEST_GROUPS } from "./test-groups";

/*
 * 해시를 한꺼번에 기다리게 바꾼 함수들이 예전처럼 하나씩 기다리던 구현과 같은 값을 내는지 본다.
 * 아래 `old*`는 바꾸기 전 코드를 그대로 옮긴 것이다(2026-11-04).
 */

async function oldCombineStatement(g: SraGroup, st: KeyStatement) {
  const seed = await hash([
    "w",
    st.device,
    st.v,
    ...st.items.flatMap((i) => [i.slot, i.input, i.output, i.key]),
  ]);
  let A = g.one;
  let B = g.one;
  for (const [index, item] of st.items.entries()) {
    const w = (await hash([seed, index])) & 0xffff_ffff_ffff_ffffn;
    A = g.mul(A, g.pow(item.input, (item.key * w) % g.q));
    B = g.mul(B, g.pow(item.output, w));
  }
  return { A, B };
}

async function oldWeights(
  parts: readonly (string | number | bigint)[],
  n: number,
) {
  const seed = await hash(parts);
  const out: bigint[] = [];
  for (let i = 0; i < n; i++)
    out.push((await hash([seed, i])) & 0xffff_ffff_ffff_ffffn);
  return out;
}

const T_BITS = 320n;

async function oldSecretsOf(
  g: SraGroup,
  e: bigint,
  l: ShuffleLabel,
  r: number,
  n: number,
) {
  const lp = [l.device, l.deal, l.round, l.stage];
  const h = await hash(["t", e, ...lp, r]);
  const t =
    g.q > 1n << T_BITS
      ? 1n + (h % (1n << T_BITS))
      : 1n + (((h << 256n) | (await hash(["t2", e, ...lp, r]))) % (g.q - 1n));
  const sigma = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Number((await hash(["s", e, ...lp, r, i])) % BigInt(i + 1));
    [sigma[i], sigma[j]] = [sigma[j] as number, sigma[i] as number];
  }
  return { sigma, t };
}

const label: ShuffleLabel = { device: 3, deal: 2, round: 1, stage: "shuffle" };
const E = 0x1234_5678_9abc_def1n;

/** commitShuffle 결과 전체의 해시. 바꾸기 전 구현으로 뽑아 둔 값 */
const COMMIT_FIXTURE: Record<string, string> = {
  "1024": "e4d3077223c42f29353a8ddf68970d865462e0286cedb0f0ff9c182d950dc1c3",
  r255: "591fa9f94497c3bc0ed31eec3aa412e190d0a95c4e8c38f95e248363fc46e561",
};

describe.each(TEST_GROUPS)("군 %s", (name, g) => {
  const deck = encodedDeck(g, fullDeck().slice(0, 12));

  it("combineStatement가 예전 구현과 같다", async () => {
    const st: KeyStatement = {
      device: 5,
      v: g.pow(g.generator, 7n),
      items: deck.map((input, slot) => ({
        slot,
        input,
        output: g.pow(input, 11n),
        key: BigInt(slot + 2),
      })),
    };
    expect(await combineStatement(g, st)).toEqual(
      await oldCombineStatement(g, st),
    );
  });

  it("secretsOf가 예전 구현과 같다", async () => {
    for (const n of [1, 2, 12, 53])
      for (const r of [0, 15])
        expect(await secretsOf(g, E, label, r, n)).toEqual(
          await oldSecretsOf(g, E, label, r, n),
        );
  });

  it("commitShuffle 결과가 바꾸기 전과 같다", async () => {
    const work = await commitShuffle(g, label, deck, E);
    const digest = await hash([
      JSON.stringify(work.commit),
      JSON.stringify(work.sigmas),
      ...work.ts,
      ...work.z.flat(),
    ]);
    expect(digest.toString(16)).toBe(COMMIT_FIXTURE[name]);
  });
});

it("weights가 예전 구현과 같다", async () => {
  for (const n of [0, 1, 53])
    expect(await weights(["w", 1, 2n, "x"], n)).toEqual(
      await oldWeights(["w", 1, 2n, "x"], n),
    );
});
