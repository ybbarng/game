//! 순열 ↔ 번호(Lehmer 부호). `packages/cube-solver/src/perm.ts`

const FACT: [u32; 11] = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];

pub fn rank_permutation(p: &[u8]) -> u32 {
    let n = p.len();
    let mut r = 0;
    for i in 0..n {
        let smaller = p[i + 1..].iter().filter(|&&x| x < p[i]).count() as u32;
        r += smaller * FACT[n - 1 - i];
    }
    r
}

pub fn unrank_permutation(mut r: u32, n: usize) -> Vec<u8> {
    let mut left: Vec<u8> = (0..n as u8).collect();
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let f = FACT[n - 1 - i];
        let k = r / f;
        r -= k * f;
        out.push(left.remove(k as usize));
    }
    out
}

/// 순열의 홀짝(0 짝, 1 홀)
pub fn parity(p: &[u8]) -> u8 {
    let mut s = 0;
    for i in 0..p.len() {
        for j in i + 1..p.len() {
            if p[j] < p[i] {
                s ^= 1;
            }
        }
    }
    s
}
