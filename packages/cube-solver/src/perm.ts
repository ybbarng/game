/** 순열 ↔ 번호(Lehmer 부호). 0..n-1을 늘어놓은 순열 n!개에 0..n!-1을 붙인다. */

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];

export function rankPermutation(p: readonly number[]): number {
  const n = p.length;
  let r = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    const v = p[i] as number;
    for (let j = i + 1; j < n; j++) if ((p[j] as number) < v) smaller++;
    r += smaller * (FACT[n - 1 - i] as number);
  }
  return r;
}

export function unrankPermutation(r: number, n: number): number[] {
  const left: number[] = [];
  for (let i = 0; i < n; i++) left.push(i);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i] as number;
    const k = Math.floor(r / f);
    r -= k * f;
    out.push(left.splice(k, 1)[0] as number);
  }
  return out;
}
