import {
  combineStatement,
  hash,
  type KeyProof,
  type KeyStatement,
  verifyKeys,
} from "./proof";
import { loadRistretto255 } from "./ristretto";
import {
  type ShuffleLabel,
  type ZeroRound,
  zeroRoundBatched,
  zeroRoundDirect,
} from "./shuffle-proof";
import { randomBelow, type SraGroup } from "./sra";

/*
 * 계산을 줄인 길(2026-11-24)이 바꾸기 전 길과 같은 결과를 내는지 고정 입력으로 견준다.
 * 단위 시험(fast-path.test.ts)은 적은 수로, bench(fast-path.strength.ts)는 수천 개로 같은 함수를 부른다.
 *  ① ristretto255 생성원 곱하기: 미리 만든 표 함수(_base) ↔ 일반 곱하기
 *  ② 섞기 증명 도전 0 확인: 하나씩 보기 ↔ 가중치 묶음
 *  ③ 열쇠 증명 만들기: B = A^u ↔ B = Π O^w
 * 아래 `old*`는 바꾸기 전 코드를 그대로 옮긴 것이다.
 */

type Sodium = typeof import("libsodium-wrappers-sumo");

const sodium: Sodium = await import("libsodium-wrappers-sumo").then(
  async (module) => {
    const s = (module.default ?? module) as Sodium;
    await s.ready;
    return s;
  },
);

export const R255 = await loadRistretto255();

const L = R255.q;

function toBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function fromBytes(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function scalarBytes(e: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = e;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** 바꾸기 전 ristretto255 pow(생성원도 일반 곱하기로) */
export function oldPow(x: bigint, e: bigint): bigint {
  const k = ((e % L) + L) % L;
  if (k === 0n || x === 0n) return 0n;
  return fromBytes(
    sodium.crypto_scalarmult_ristretto255(scalarBytes(k), toBytes(x)),
  );
}

/** 바꾸기 전 proveKeys(B = Π O^w) */
export async function oldProveKeys(
  g: SraGroup,
  st: KeyStatement,
  u: bigint,
): Promise<KeyProof> {
  const { A, B } = await combineStatement(g, st);
  const r = 1n + randomBelow(g.q - 1n);
  const a = g.pow(g.generator, r);
  const b = g.pow(A, r);
  const c = (await hash(["c", st.device, g.generator, st.v, A, B, a, b])) % g.q;
  const z = (r + c * u) % g.q;
  return { a: a.toString(16), b: b.toString(16), z: z.toString(16) };
}

/** 고정 수열(xorshift64*). 무작위가 아니라 늘 같은 입력을 낸다 */
export function fixedBigints(
  seed: number,
  count: number,
  bits = 256,
): bigint[] {
  let s = BigInt(seed) * 0x9e3779b97f4a7c15n + 1n;
  const mask = (1n << 64n) - 1n;
  const next = () => {
    s ^= s >> 12n;
    s ^= (s << 25n) & mask;
    s ^= s >> 27n;
    s &= mask;
    return (s * 0x2545f4914f6cdd1dn) & mask;
  };
  return Array.from({ length: count }, () => {
    let v = 0n;
    for (let i = 0; i < bits; i += 64) v = (v << 64n) | next();
    return v & ((1n << BigInt(bits)) - 1n);
  });
}

/** 던지면 그 글, 아니면 값 */
function outcome<T>(f: () => T): { value: T } | { error: string } {
  try {
    return { value: f() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function outcomeAsync<T>(
  f: () => Promise<T>,
): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await f() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** 지수 경계: 0, 1, ℓ−1, ℓ, ℓ+1, 음수, 2^256 넘는 수 */
export const EDGE_EXPONENTS = [
  0n,
  1n,
  2n,
  L - 1n,
  L,
  L + 1n,
  -1n,
  -L,
  1n << 255n,
  (1n << 256n) + 5n,
];

/** 원소 경계: 항등원(0), 표준 인코딩이 아닌 값, 생성원, 카드 점 */
export function edgeElements(): bigint[] {
  const card = R255.encodeIndex(0);
  return [0n, 1n, (1n << 256n) - 1n, card + 1n, R255.generator, card];
}

/** ① 생성원과 경계 원소에 지수 `count`개(고정)와 경계 지수를 곱해 바꾸기 전 pow와 견준다. 다른 것의 목록 */
export function powMismatches(count: number): string[] {
  const out: string[] = [];
  const exponents = [...EDGE_EXPONENTS, ...fixedBigints(1, count)];
  const compare = (x: bigint, e: bigint) => {
    const now = outcome(() => R255.pow(x, e));
    const before = outcome(() => oldPow(x, e));
    if (JSON.stringify(now, big) !== JSON.stringify(before, big))
      out.push(`pow(${x.toString(16)}, ${e.toString(16)})`);
  };
  for (const e of exponents) compare(R255.generator, e);
  for (const x of edgeElements()) for (const e of EDGE_EXPONENTS) compare(x, e);
  return out;
}

function big(_key: string, value: unknown) {
  return typeof value === "bigint" ? `${value}n` : value;
}

const LABEL: ShuffleLabel = { device: 2, deal: 3, round: 1, stage: "shuffle" };

/** 고정 순열(Fisher–Yates, 고정 수열로) */
function fixedPermutation(n: number, seed: number): number[] {
  const sigma = Array.from({ length: n }, (_, i) => i);
  const rs = fixedBigints(seed, n, 64);
  for (let i = n - 1; i > 0; i--) {
    const j = Number((rs[i] as bigint) % BigInt(i + 1));
    [sigma[i], sigma[j]] = [sigma[j] as number, sigma[i] as number];
  }
  return sigma;
}

/** 도전 0 회 하나를 고정 입력으로 만든다. `kind`: 0 맞음, 1 Z 하나를 다른 t로, 2 Z 둘 바꿔치기, 3 Z 하나를 다른 카드로, 4 입력에 군 밖 값, 5 입력에 항등원 */
export function zeroRoundCase(index: number): {
  kind: number;
  round: ZeroRound;
} {
  const g = R255;
  const kind = index % 6;
  const n = [1, 2, 3, 5][Math.floor(index / 6) % 4] as number;
  const input = Array.from({ length: n }, (_, j) =>
    g.encodeIndex((index * 7 + j) % 60),
  );
  const t = 1n + ((fixedBigints(1000 + index, 1)[0] as bigint) % (g.q - 1n));
  const sigma = fixedPermutation(n, 2000 + index);
  const z = sigma.map((from) => g.pow(input[from] as bigint, t));
  const other = g.encodeIndex(61 + (index % 7));
  if (kind === 1) z[0] = g.pow(input[sigma[0] as number] as bigint, t + 1n);
  if (kind === 2 && n >= 2) [z[0], z[1]] = [z[1] as bigint, z[0] as bigint];
  if (kind === 3) z[n - 1] = other;
  // 맨 윗비트가 켜진 32바이트는 표준 인코딩이 될 수 없다(늘 군 밖)
  if (kind === 4)
    input[sigma[n - 1] as number] = (1n << 256n) - 1n - BigInt(index);
  if (kind === 5) {
    // 확인 앞에서 Z는 군의 원소(항등원 아님)로 걸러지므로, 항등원 자리의 Z는 다른 원소로 둔다
    const at = sigma[0] as number;
    input[at] = 0n;
    z[0] = other;
  }
  return {
    kind,
    round: {
      l: LABEL,
      r: index % 16,
      t,
      sigma,
      zText: z.map((v) => v.toString(16)),
      z,
      input,
    },
  };
}

/** ② 도전 0 확인: 하나씩 보기와 묶음이 같은 답(또는 같은 던짐)을 내는지. 다른 것의 목록과 종류별 맞음 수 */
export async function zeroRoundMismatches(
  count: number,
): Promise<{ mismatches: string[]; holds: number[]; threw: number[] }> {
  const mismatches: string[] = [];
  const holds = [0, 0, 0, 0, 0, 0];
  const threw = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < count; i++) {
    const { kind, round } = zeroRoundCase(i);
    const now = outcome(() => zeroRoundDirect(R255, round));
    const before = await outcomeAsync(() => zeroRoundBatched(R255, round));
    if (JSON.stringify(now) !== JSON.stringify(before))
      mismatches.push(
        `회 ${i}(종류 ${kind}): ${JSON.stringify(now)} ↔ ${JSON.stringify(before)}`,
      );
    if ("value" in now && now.value) holds[kind] = (holds[kind] as number) + 1;
    if ("error" in now) threw[kind] = (threw[kind] as number) + 1;
  }
  return { mismatches, holds, threw };
}

/** 열쇠 증명 진술 하나(고정). `honest`가 아니면 O 하나를 다른 지수로 잠근다 */
export function keyStatementCase(index: number): {
  honest: boolean;
  st: KeyStatement;
  u: bigint;
} {
  const g = R255;
  const honest = index % 3 !== 2;
  const n = 1 + (index % 4);
  const [uRaw, ...keys] = fixedBigints(3000 + index, n + 1);
  const u = 1n + ((uRaw as bigint) % (g.q - 1n));
  const items = Array.from({ length: n }, (_, slot) => {
    const input = g.encodeIndex((index * 5 + slot) % 60);
    const key = 1n + ((keys[slot] as bigint) % (1n << 64n));
    const exponent = (u * key) % g.q;
    const wrong = !honest && slot === n - 1;
    return {
      slot,
      input,
      output: g.pow(input, wrong ? exponent + 1n : exponent),
      key,
    };
  });
  return {
    honest,
    st: { device: index % 5, v: g.pow(g.generator, u), items },
    u,
  };
}

/**
 * ③ 열쇠 증명 만들기: 맞는 진술이면 B = A^u가 Π O^w와 같은 점이고, 맞든 틀리든 새 길과 바꾸기 전 길의
 * 증명이 확인을 통과하는지가 같다. 다른 것의 목록
 */
export async function proverMismatches(
  count: number,
  proveKeys: (g: SraGroup, st: KeyStatement, u: bigint) => Promise<KeyProof>,
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const { honest, st, u } = keyStatementCase(i);
    const { A, B } = await combineStatement(R255, st);
    if (honest && R255.pow(A, u) !== B) out.push(`진술 ${i}: A^u ≠ Π O^w`);
    const now = await verifyKeys(R255, st, await proveKeys(R255, st, u));
    const before = await verifyKeys(R255, st, await oldProveKeys(R255, st, u));
    if (now !== before || now !== honest)
      out.push(
        `진술 ${i}(맞는 진술 ${honest}): 새 길 ${now}, 바꾸기 전 ${before}`,
      );
  }
  return out;
}
