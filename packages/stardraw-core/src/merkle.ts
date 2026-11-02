import { compareBytes, equalBytes, sha256 } from "./bytes";

/**
 * RFC 6962 머클 트리(docs/36 8-1 S2).
 * 잎은 0x00, 가지는 0x01을 앞에 붙여 해시해, 가지 값을 잎인 척하는 위조를 막는다.
 * n개를 나눌 때는 n보다 작은 가장 큰 2의 거듭제곱 k에서 왼쪽 k개, 오른쪽 나머지로 나눈다.
 * 하늘의 별 따기의 잎은 응모권 id이고, id 사전 순으로 정렬해 넣는다(`sortLeaves`).
 */

export function leafHash(leaf: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([0]), leaf);
}

export function nodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([1]), left, right);
}

export function sortLeaves(leaves: readonly Uint8Array[]): Uint8Array[] {
  return [...leaves].sort(compareBytes);
}

function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** 머클 루트. 빈 목록은 빈 바이트의 해시 */
export function merkleRoot(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return sha256();
  return subtreeRoot(leaves.map(leafHash));
}

function subtreeRoot(hashes: readonly Uint8Array[]): Uint8Array {
  if (hashes.length === 1) return hashes[0] as Uint8Array;
  const k = split(hashes.length);
  return nodeHash(
    subtreeRoot(hashes.slice(0, k)),
    subtreeRoot(hashes.slice(k)),
  );
}

/** index번째 잎의 포함 증명(아래에서 위로 형제 해시) */
export function inclusionProof(
  leaves: readonly Uint8Array[],
  index: number,
): Uint8Array[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new Error("잎 번호가 범위 밖이다");
  }
  return path(index, leaves.map(leafHash));
}

function path(index: number, hashes: readonly Uint8Array[]): Uint8Array[] {
  if (hashes.length <= 1) return [];
  const k = split(hashes.length);
  if (index < k)
    return [...path(index, hashes.slice(0, k)), subtreeRoot(hashes.slice(k))];
  return [...path(index - k, hashes.slice(k)), subtreeRoot(hashes.slice(0, k))];
}

/** RFC 9162 2.1.3.2의 확인 방식 */
export function verifyInclusion(
  leaf: Uint8Array,
  index: number,
  size: number,
  proof: readonly Uint8Array[],
  root: Uint8Array,
): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= size) return false;
  let fn = index;
  let sn = size - 1;
  let r = leafHash(leaf);
  for (const p of proof) {
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);
      if (fn % 2 === 0) {
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      r = nodeHash(r, p);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equalBytes(r, root);
}

/**
 * 층을 한 번 만들어 둔 트리(서버가 회차마다 기억해 증명을 여럿 낼 때). 층 0은 잎 해시, 위로 갈수록 짝을 지어 해시하고
 * 짝이 없는 마지막 하나는 그대로 올린다 — 위 split 방식(RFC 6962)과 같은 트리다. 층마다 32바이트 해시를 이어 붙여
 * 한 버퍼로 둔다(해시마다 객체를 만들지 않아 메모리가 적다). 빈 목록은 층이 없다
 */
export interface MerkleLevels {
  size: number;
  levels: Uint8Array[];
}

const H = 32;

export function merkleLevels(leaves: readonly Uint8Array[]): MerkleLevels {
  if (leaves.length === 0) return { size: 0, levels: [] };
  let level = new Uint8Array(leaves.length * H);
  leaves.forEach((l, i) => {
    level.set(leafHash(l), i * H);
  });
  const levels = [level];
  let count = leaves.length;
  while (count > 1) {
    const up = Math.ceil(count / 2);
    const next = new Uint8Array(up * H);
    for (let i = 0; i + 1 < count; i += 2)
      next.set(
        nodeHash(
          level.subarray(i * H, (i + 1) * H),
          level.subarray((i + 1) * H, (i + 2) * H),
        ),
        (i / 2) * H,
      );
    if (count % 2 === 1)
      next.set(level.subarray((count - 1) * H, count * H), (up - 1) * H);
    levels.push(next);
    level = next;
    count = up;
  }
  return { size: leaves.length, levels };
}

/** 층으로 만든 루트(`merkleRoot`와 같은 값) */
export function levelsRoot(tree: MerkleLevels): Uint8Array {
  const top = tree.levels.at(-1);
  return top ? top.slice(0, H) : sha256();
}

/** 층으로 만든 index번째 잎의 포함 증명(`inclusionProof`와 같은 값, 층 수만큼만 읽는다) */
export function levelsProof(tree: MerkleLevels, index: number): Uint8Array[] {
  if (!Number.isInteger(index) || index < 0 || index >= tree.size) {
    throw new Error("잎 번호가 범위 밖이다");
  }
  const out: Uint8Array[] = [];
  let i = index;
  let count = tree.size;
  for (let d = 0; d < tree.levels.length - 1; d++) {
    const level = tree.levels[d] as Uint8Array;
    const sibling = i % 2 === 1 ? i - 1 : i + 1;
    if (sibling < count) out.push(level.slice(sibling * H, (sibling + 1) * H));
    i = Math.floor(i / 2);
    count = Math.ceil(count / 2);
  }
  return out;
}
