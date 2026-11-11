//! 상태 안에 넣어 둘 수 있는 난수 생성기(mulberry32). `packages/engine/src/rng.ts`와 같은 수를 낸다.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rng {
    pub seed: u32,
}

impl Rng {
    /// `createRng(seed)`. 사이트는 `seed >>> 0`으로 32비트 부호 없는 수로 바꾼다
    pub fn new(seed: u32) -> Self {
        Rng { seed }
    }

    /// 0 이상 1 미만의 수(`nextFloat`)
    pub fn next_float(&mut self) -> f64 {
        self.seed = self.seed.wrapping_add(0x6d2b_79f5);
        let mut t = self.seed;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        f64::from(t ^ (t >> 14)) / 4_294_967_296.0
    }

    /// 0 이상 `max_exclusive` 미만의 정수(`nextInt`)
    pub fn next_int(&mut self, max_exclusive: u32) -> u32 {
        (self.next_float() * f64::from(max_exclusive)).floor() as u32
    }

    /// Fisher-Yates로 제자리에서 섞는다(`shuffleInPlace`)
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.next_int(i as u32 + 1) as usize;
            items.swap(i, j);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_numbers() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..10 {
            assert_eq!(a.next_int(1000), b.next_int(1000));
        }
    }
}
