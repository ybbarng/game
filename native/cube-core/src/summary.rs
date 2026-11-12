//! Cubie 기록 창 맨 위 요약(사이트 `apps/web/src/cube/mini/store.ts` `summarize`, `records.ts` `averageOf`·`resultMs`).
//!
//! 티어(대회 규칙 Ao5, [`crate::tier`])와 다른 셈이다: 벌점을 더한 시간을 1/100초로 버리지 않고 그대로 쓰고,
//! 평균은 자바스크립트 `Math.round`로 ms 단위 반올림한다. 4판 넘게 셀 때만 가장 좋은·나쁜 판을 하나씩 뺀다.

use crate::tier::{js_round, Timeable};

/// 최근 n판 평균(사이트 `averageOf`가 돌려주는 세 갈래)
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RecentAverage {
    /// 기록이 모자람(화면 「-」)
    Missing,
    /// 뺄 수 있는 것보다 DNF가 많음(화면 「DNF」)
    Dnf,
    Ms(f64),
}

/// 기록 창 요약(사이트 `MiniSummary`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MiniSummary {
    pub count: usize,
    /// 가장 빠른 시간(벌점 포함). 맞춘 판이 없으면 None
    pub best: Option<f64>,
    /// 맞춘 판 모두의 평균(ms 반올림)
    pub mean: Option<f64>,
    pub ao5: RecentAverage,
    pub ao12: RecentAverage,
}

/// 기록 하나의 결과 시간(벌점 포함, DNF는 None. 사이트 `resultMs`)
pub fn result_ms(t: &Timeable) -> Option<f64> {
    t.ms.map(|ms| ms + t.penalty)
}

/// 최근 `count`판 평균(새것이 앞인 목록, 사이트 `averageOf`). 3판 이하는 그냥 평균, 그 위는 가장 좋은·나쁜 판을 하나씩 뺀다
pub fn recent_average(list: &[Timeable], count: usize) -> RecentAverage {
    if list.len() < count || count == 0 {
        return RecentAverage::Missing;
    }
    let times: Vec<Option<f64>> = list[..count].iter().map(result_ms).collect();
    let dnf = times.iter().filter(|t| t.is_none()).count();
    let trim = if count > 3 { 1 } else { 0 };
    if dnf > trim {
        return RecentAverage::Dnf;
    }
    let mut sorted: Vec<f64> = times.iter().map(|t| t.unwrap_or(f64::INFINITY)).collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).expect("숫자"));
    let kept = &sorted[trim..sorted.len() - trim];
    RecentAverage::Ms(js_round(
        kept.iter().fold(0.0, |s, v| s + v) / kept.len() as f64,
    ))
}

/// 기록 창 요약(사이트 `summarize`)
pub fn mini_summary(list: &[Timeable]) -> MiniSummary {
    let times: Vec<f64> = list.iter().filter_map(result_ms).collect();
    MiniSummary {
        count: list.len(),
        best: times.iter().copied().reduce(f64::min),
        mean: (!times.is_empty())
            .then(|| js_round(times.iter().fold(0.0, |s, v| s + v) / times.len() as f64)),
        ao5: recent_average(list, 5),
        ao12: recent_average(list, 12),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(ms: Option<f64>, penalty: f64) -> Timeable {
        Timeable {
            ms,
            penalty,
            hints: 0,
        }
    }

    #[test]
    fn trims_one_each_side_above_three() {
        let list = [
            t(Some(10_005.0), 0.0),
            t(None, 0.0),
            t(Some(9_000.0), 2000.0),
            t(Some(12_000.0), 0.0),
            t(Some(8_000.0), 0.0),
        ];
        // DNF 하나는 빼는 쪽(가장 나쁜 판)으로 간다: 10005·11000·12000 → 11001.67 → 11002
        assert_eq!(recent_average(&list, 5), RecentAverage::Ms(11_002.0));
        assert_eq!(recent_average(&list, 12), RecentAverage::Missing);
        let s = mini_summary(&list);
        assert_eq!(s.best, Some(8_000.0));
        assert_eq!(s.mean, Some(10_251.0));
        let two_dnf = [t(None, 0.0), t(None, 0.0), t(Some(1.0), 0.0)];
        assert_eq!(recent_average(&two_dnf, 3), RecentAverage::Dnf);
        assert_eq!(mini_summary(&[]).best, None);
    }
}
