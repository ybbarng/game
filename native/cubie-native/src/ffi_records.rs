//! 기록 계산의 C ABI(docs/52 5-6): Ao5·최고 Ao5(힌트 판 묶음 빼기)·Cubie 기록 티어. 계산은 코어 `tier.rs`(사이트
//! `timer/stats.ts`·`tiers/rank.ts`와 공통 시험 자료로 어긋남 0)를 그대로 부른다. 앱은 기록을 사이트와 같은 JSON 꼴로
//! 들고 있고, 판마다 시간·벌점·힌트 수만 넘긴다.
//!
//! 머리 파일 `apps/cubie/Sources/CubieNativeC/include/cubie_native.h`와 하나씩 맞아야 한다.

use cube_core::tier::{ao5, average_of, best_ao5, my_tier, Timeable};

/// 기록 한 판(C 구조체 `CubieTimeable`과 같은 배치). `ms`가 음수면 DNF
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CubieTimeable {
    pub ms: f64,
    pub penalty: f64,
    pub hints: u32,
}

/// 내 티어(C 구조체 `CubieTier`)
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CubieTier {
    /// 최고 Ao5(ms)
    pub ao5: f64,
    /// 0 아이언 … 9 챌린저
    pub tier: u32,
    /// 0 IV … 3 I, 단계가 없는 티어는 -1
    pub division: i32,
}

unsafe fn timeables(p: *const CubieTimeable, count: u32) -> Vec<Timeable> {
    if p.is_null() || count == 0 {
        return vec![];
    }
    unsafe { std::slice::from_raw_parts(p, count as usize) }
        .iter()
        .map(|t| Timeable {
            ms: if t.ms < 0.0 { None } else { Some(t.ms) },
            penalty: t.penalty,
            hints: t.hints,
        })
        .collect()
}

/// 대회 규칙 평균(사이트 `averageOf`): 3판보다 적으면 NaN, DNF면 무한대
///
/// # Safety
/// `recs`는 `count`칸을 읽을 수 있는 자리(0이면 NULL이어도 된다).
#[no_mangle]
pub unsafe extern "C" fn cubie_average_of(recs: *const CubieTimeable, count: u32) -> f64 {
    average_of(&unsafe { timeables(recs, count) }).unwrap_or(f64::NAN)
}

/// 5판의 Ao5(사이트 `ao5`). DNF·잘못된 개수면 NaN
///
/// # Safety
/// `five`는 `count`칸을 읽을 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_ao5(five: *const CubieTimeable, count: u32) -> f64 {
    if count != 5 {
        return f64::NAN;
    }
    ao5(&unsafe { timeables(five, count) }).unwrap_or(f64::NAN)
}

/// 최고 Ao5(사이트 `bestAo5`, 힌트 판이 든 5판은 건너뛴다). 있으면 `ms`·`at`(그 5판의 첫 번호)에 쓰고 true
///
/// # Safety
/// `recs`는 `count`칸을 읽을 수 있는 자리, `ms`·`at`은 쓸 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_best_ao5(
    recs: *const CubieTimeable,
    count: u32,
    ms: *mut f64,
    at: *mut u32,
) -> bool {
    let Some(b) = best_ao5(&unsafe { timeables(recs, count) }) else {
        return false;
    };
    unsafe {
        *ms = b.ms;
        *at = b.at as u32;
    }
    true
}

/// 기록(새것이 앞)과 최고 5판으로 내 티어(사이트 `myTier`). 있으면 `out`에 쓰고 true
///
/// # Safety
/// 배열은 각 칸 수만큼 읽을 수 있는 자리, `out`은 쓸 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_my_tier(
    n: u32,
    recs: *const CubieTimeable,
    count: u32,
    best5: *const CubieTimeable,
    best5_count: u32,
    out: *mut CubieTier,
) -> bool {
    let list = unsafe { timeables(recs, count) };
    let five = unsafe { timeables(best5, best5_count) };
    let Some(t) = my_tier(n as usize, &list, &five) else {
        return false;
    };
    unsafe {
        *out = CubieTier {
            ao5: t.ao5,
            tier: t.place.tier as u32,
            division: t.place.division.map_or(-1, |d| d as i32),
        }
    };
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(ms: f64) -> CubieTimeable {
        CubieTimeable {
            ms,
            penalty: 0.0,
            hints: 0,
        }
    }

    #[test]
    fn averages_and_tiers_through_c() {
        unsafe {
            let five = [
                t(10_000.0),
                t(12_000.0),
                t(11_000.0),
                t(30_000.0),
                t(9_000.0),
            ];
            assert_eq!(cubie_ao5(five.as_ptr(), 5), 11_000.0);
            assert!(cubie_ao5(five.as_ptr(), 4).is_nan());
            assert!(cubie_average_of(five.as_ptr(), 2).is_nan());
            let mut ms = 0.0;
            let mut at = 9;
            assert!(cubie_best_ao5(five.as_ptr(), 5, &mut ms, &mut at));
            assert_eq!((ms, at), (11_000.0, 0));
            // 힌트 판이 든 5판은 건너뛴다
            let mut hinted = five;
            hinted[2].hints = 1;
            assert!(!cubie_best_ao5(hinted.as_ptr(), 5, &mut ms, &mut at));
            // DNF 두 판이면 Ao5 없음
            let dnf = [t(-1.0), t(-1.0), t(1.0), t(1.0), t(1.0)];
            assert!(cubie_ao5(dnf.as_ptr(), 5).is_nan());
            let mut tier = CubieTier::default();
            assert!(cubie_my_tier(
                3,
                five.as_ptr(),
                5,
                std::ptr::null(),
                0,
                &mut tier
            ));
            assert_eq!(tier.ao5, 11_000.0);
            assert!(!cubie_my_tier(
                3,
                five.as_ptr(),
                4,
                std::ptr::null(),
                0,
                &mut tier
            ));
        }
    }
}
