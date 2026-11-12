//! 기록 계산의 C ABI(docs/52 5-6): Ao5·최고 Ao5(힌트 판 묶음 빼기)·Cubie 기록 티어. 계산은 코어 `tier.rs`(사이트
//! `timer/stats.ts`·`tiers/rank.ts`와 공통 시험 자료로 어긋남 0)를 그대로 부른다. 앱은 기록을 사이트와 같은 JSON 꼴로
//! 들고 있고, 판마다 시간·벌점·힌트 수만 넘긴다.
//!
//! 머리 파일 `apps/cubie/Sources/CubieNativeC/include/cubie_native.h`와 하나씩 맞아야 한다.

use cube_core::data;
use cube_core::summary::{mini_summary, RecentAverage};
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

/// 기록 창 요약(C 구조체 `CubieSummary`). 값이 없으면 NaN, DNF면 무한대
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CubieSummary {
    pub count: u32,
    pub best: f64,
    pub mean: f64,
    pub ao5: f64,
    pub ao12: f64,
}

fn recent(v: RecentAverage) -> f64 {
    match v {
        RecentAverage::Missing => f64::NAN,
        RecentAverage::Dnf => f64::INFINITY,
        RecentAverage::Ms(ms) => ms,
    }
}

/// Cubie 기록 창 요약(사이트 `summarize`, 코어 `summary.rs`): 최고·평균은 맞춘 판이 없으면 NaN, 5번·12번 평균은
/// 모자라면 NaN·DNF면 무한대
///
/// # Safety
/// `recs`는 `count`칸을 읽을 수 있는 자리, `out`은 쓸 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_mini_summary(
    recs: *const CubieTimeable,
    count: u32,
    out: *mut CubieSummary,
) {
    let s = mini_summary(&unsafe { timeables(recs, count) });
    unsafe {
        *out = CubieSummary {
            count: s.count as u32,
            best: s.best.unwrap_or(f64::NAN),
            mean: s.mean.unwrap_or(f64::NAN),
            ao5: recent(s.ao5),
            ao12: recent(s.ao12),
        }
    };
}

/// 티어표 글(사이트 `tiers/table.ts`): 첫 줄 「WCA 경기자 수\t자료 날짜\tWCA 문구\tWCA 주소」, 그 뒤 티어 열 줄(아이언부터)
/// 「구간 상한(초, 쉼표로, 끝없음은 inf)\t진입 시간 이하 경기자 수\t상위 %」(대회 밖은 뒤 두 칸이 비었다). 표에 없는 크기는 빈 글
pub fn tier_table_text(n: usize) -> String {
    let Some((_, rows)) = data::TIER_TABLE.iter().find(|(s, _)| *s == n) else {
        return String::new();
    };
    let Some((_, people, wca)) = data::TIER_WCA.iter().find(|(s, _, _)| *s == n) else {
        return String::new();
    };
    let mut out = format!(
        "{people}\t{}\t{}\t{}\n",
        data::TIER_DATA_DATE,
        data::WCA_CREDIT,
        data::WCA_RESULTS_URL
    );
    for (i, cuts) in rows.iter().enumerate() {
        let cuts: Vec<String> = cuts
            .iter()
            .map(|c| {
                if c.is_finite() {
                    format!("{c}")
                } else {
                    "inf".to_string()
                }
            })
            .collect();
        let share = match wca.get(i).copied().flatten() {
            Some((p, pct)) => format!("{p}\t{pct}"),
            None => "\t".to_string(),
        };
        out.push_str(&format!("{}\t{share}\n", cuts.join(",")));
    }
    out
}

/// [`tier_table_text`]를 out에 len바이트까지(UTF-8, NUL 없음). 글 전체 바이트 수를 돌려준다(out이 NULL이면 길이만)
///
/// # Safety
/// `out`은 `len`바이트를 쓸 수 있는 자리(또는 NULL).
#[no_mangle]
pub unsafe extern "C" fn cubie_tier_table(n: u32, out: *mut u8, len: u32) -> u32 {
    let text = tier_table_text(n as usize);
    let bytes = text.as_bytes();
    if !out.is_null() {
        let k = bytes.len().min(len as usize);
        unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), out, k) };
    }
    bytes.len() as u32
}

/// 기본 배치(「두 손」 twoHand·「표기」 notation)의 키 전부를 사이트와 같은 차례로: 줄마다 「code\t조합(Shift 1·Alt 2·Ctrl 4)\t동작」.
/// 설정 창의 「사용자」(사이트 `toCustom`)가 지금 기본 배치를 사용자 배치로 옮길 때 쓴다. 모르는 묶음이면 빈 글
pub fn preset_bindings_text(preset: &str) -> String {
    let table = match preset {
        "twoHand" => cube_core::keymap_data::TWO_HAND,
        "notation" => cube_core::keymap_data::NOTATION,
        _ => return String::new(),
    };
    table
        .iter()
        .map(|(code, mods, action)| format!("{code}\t{mods}\t{action}\n"))
        .collect()
}

/// [`preset_bindings_text`]를 out에 len바이트까지. 글 전체 바이트 수를 돌려준다(out이 NULL이면 길이만)
///
/// # Safety
/// `preset`은 NUL로 끝나는 글, `out`은 `len`바이트를 쓸 수 있는 자리(또는 NULL).
#[no_mangle]
pub unsafe extern "C" fn cubie_preset_bindings(
    preset: *const std::ffi::c_char,
    out: *mut u8,
    len: u32,
) -> u32 {
    let name = if preset.is_null() {
        ""
    } else {
        unsafe { std::ffi::CStr::from_ptr(preset) }
            .to_str()
            .unwrap_or("")
    };
    let text = preset_bindings_text(name);
    let bytes = text.as_bytes();
    if !out.is_null() {
        let k = bytes.len().min(len as usize);
        unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), out, k) };
    }
    bytes.len() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_bindings_follow_site_tables() {
        let two = preset_bindings_text("twoHand");
        let first: Vec<&str> = two.lines().take(2).collect();
        assert_eq!(first, ["KeyI\t0\tR", "KeyI\t1\tRw"]);
        assert_eq!(two.lines().count(), cube_core::keymap_data::TWO_HAND.len());
        assert!(preset_bindings_text("notation").contains("\tscramble\n"));
        assert_eq!(preset_bindings_text("custom"), "");
        let c = std::ffi::CString::new("notation").unwrap();
        let need = unsafe { cubie_preset_bindings(c.as_ptr(), std::ptr::null_mut(), 0) };
        assert_eq!(need as usize, preset_bindings_text("notation").len());
    }

    #[test]
    fn summary_and_tier_table_through_c() {
        unsafe {
            let list = [t(10_000.0), t(-1.0), t(12_000.0)];
            let mut s = CubieSummary::default();
            cubie_mini_summary(list.as_ptr(), 3, &mut s);
            assert_eq!((s.count, s.best, s.mean), (3, 10_000.0, 11_000.0));
            assert!(s.ao5.is_nan() && s.ao12.is_nan());
            let need = cubie_tier_table(3, std::ptr::null_mut(), 0);
            let text = tier_table_text(3);
            assert_eq!(need as usize, text.len());
            let lines: Vec<&str> = text.lines().collect();
            assert_eq!(lines.len(), 11);
            assert!(lines[0].starts_with("284562\t2026-11-09\t"));
            assert_eq!(lines[1], "inf,900,630,435\t\t");
            assert_eq!(lines[10], "6.5\t295\t0.1");
            assert_eq!(tier_table_text(8), "");
        }
    }

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
