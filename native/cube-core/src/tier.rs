//! 기록 통계와 티어(`apps/web/src/cube/timer/stats.ts`, `tiers/rank.ts`, 표는 `tiers/table.ts`에서 만든 [`crate::data`]).
//!
//! - 한 판 기록(WCA 9f1·9f2): 1/100초 아래를 버리고 +2를 더하며, 10분 이상이면 초 아래를 버린다. DNF는 무한대.
//! - Ao5: 5판 가운데 가장 좋은·나쁜 판을 빼고 셋의 평균. 10분 미만은 1/100초, 10분 이상은 초로 반올림.
//! - 티어 값은 그 크기의 최고 Ao5. 힌트를 본 판이 든 5판은 치지 않는다.

/// 기록 하나(사이트 `SolveRecord`의 `ms`·`penalty`·`hints`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Timeable {
    /// 맞춘 시간(ms, 벌점 빼고). DNF면 None
    pub ms: Option<f64>,
    /// 살펴보기 벌점(ms, 0 또는 2000). 0보다 크면 +2
    pub penalty: f64,
    /// Cubie 「공식 보기」를 본 횟수
    pub hints: u32,
}

pub const DNF: f64 = f64::INFINITY;
pub const TEN_MINUTES_MS: f64 = 600_000.0;

/// 기록으로 적는 값(사이트 `recordedMs`)
pub fn recorded_ms(t: &Timeable) -> f64 {
    let Some(ms) = t.ms else { return DNF };
    let truncated = (ms / 10.0).floor() * 10.0;
    let total = if t.penalty > 0.0 {
        truncated + 2000.0
    } else {
        truncated
    };
    if total >= TEN_MINUTES_MS {
        (total / 1000.0).floor() * 1000.0
    } else {
        total
    }
}

/// 자바스크립트 `Math.round`(딱 반이면 +무한대 쪽). `f64::round`는 0에서 먼 쪽이라 음수 반만 다르다
pub(crate) fn js_round(x: f64) -> f64 {
    let r = x.round();
    if x < 0.0 && r - x == -0.5 {
        r + 1.0
    } else {
        r
    }
}

/// 평균값을 규정대로 반올림한다(사이트 `roundAverage`)
pub fn round_average(ms: f64) -> f64 {
    if ms == DNF {
        return DNF;
    }
    let clean = js_round(ms * 1000.0) / 1000.0;
    let unit = if clean >= TEN_MINUTES_MS {
        1000.0
    } else {
        10.0
    };
    js_round(clean / unit) * unit
}

/// 딱 n개로 내는 평균(위아래 ceil(n × 5%)씩 빼고). 3개보다 적으면 None, DNF면 무한대(사이트 `averageOf`)
pub fn average_of(list: &[Timeable]) -> Option<f64> {
    let n = list.len();
    if n < 3 {
        return None;
    }
    let trim = (n as f64 * 0.05).ceil() as usize;
    let mut sorted: Vec<f64> = list.iter().map(recorded_ms).collect();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let kept = &sorted[trim..n - trim];
    if kept.iter().any(|&v| v == DNF) {
        return Some(DNF);
    }
    Some(round_average(
        kept.iter().fold(0.0, |s, v| s + v) / kept.len() as f64,
    ))
}

/// 5판의 Ao5(ms). DNF면 None
pub fn ao5(five: &[Timeable]) -> Option<f64> {
    assert_eq!(five.len(), 5, "Ao5는 5판으로 센다");
    average_of(five).filter(|v| v.is_finite())
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BestAo5 {
    pub ms: f64,
    /// 목록(새것이 앞)에서 그 5판의 첫 자리
    pub at: usize,
}

/// 기록 목록(새것이 앞)에서 연달아 5판씩 본 Ao5 가운데 가장 좋은 것. 힌트를 본 판이 든 5판은 건너뛴다
pub fn best_ao5(records: &[Timeable]) -> Option<BestAo5> {
    let mut best: Option<BestAo5> = None;
    for i in 0..records.len().saturating_sub(4) {
        let five = &records[i..i + 5];
        if five.iter().any(|r| r.hints > 0) {
            continue;
        }
        if let Some(v) = ao5(five) {
            if best.is_none_or(|b| v < b.ms) {
                best = Some(BestAo5 { ms: v, at: i });
            }
        }
    }
    best
}

/// 티어 열 개(낮은 쪽부터)
pub const TIER_IDS: [&str; 10] = [
    "iron",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "emerald",
    "diamond",
    "master",
    "grandmaster",
    "challenger",
];

pub const TIER_LABELS: [&str; 10] = [
    "아이언",
    "브론즈",
    "실버",
    "골드",
    "플래티넘",
    "에메랄드",
    "다이아몬드",
    "마스터",
    "그랜드마스터",
    "챌린저",
];

/// 구간 이름(낮은 쪽부터)
pub const DIVISIONS: [&str; 4] = ["IV", "III", "II", "I"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TierPlace {
    /// `TIER_IDS` 번호
    pub tier: usize,
    /// `DIVISIONS` 번호. 구간이 없는 티어는 None
    pub division: Option<usize>,
    /// 낮은 쪽부터 센 자리(0 = 아이언 IV)
    pub step: usize,
}

impl TierPlace {
    pub fn tier_id(&self) -> &'static str {
        TIER_IDS[self.tier]
    }

    /// 「다이아몬드 II」「챌린저」
    pub fn name(&self) -> String {
        match self.division {
            Some(d) => format!("{} {}", TIER_LABELS[self.tier], DIVISIONS[d]),
            None => TIER_LABELS[self.tier].to_string(),
        }
    }
}

/// 크기 `n`에서 Ao5 `ms`의 티어. 표가 없는 크기면 None
pub fn tier_of(n: usize, ms: f64) -> Option<TierPlace> {
    let table = crate::data::TIER_TABLE
        .iter()
        .find(|(size, _)| *size == n)?
        .1;
    if !ms.is_finite() {
        return None;
    }
    let mut place = None;
    let mut step = 0;
    for (tier, cuts) in table.iter().enumerate() {
        for (d, cut) in cuts.iter().enumerate() {
            if ms <= js_round(cut * 1000.0) {
                place = Some(TierPlace {
                    tier,
                    division: (cuts.len() == 4).then_some(d),
                    step,
                });
            }
            step += 1;
        }
    }
    place
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MyTier {
    pub n: usize,
    pub ao5: f64,
    pub place: TierPlace,
}

/// 기록(새것이 앞)과 따로 남겨 둔 최고 Ao5 5판에서 지금 최고 티어(사이트 `myTier`)
pub fn my_tier(n: usize, records: &[Timeable], best_five: &[Timeable]) -> Option<MyTier> {
    let from_list = best_ao5(records).map(|b| b.ms);
    let kept = if best_five.len() == 5 && !best_five.iter().any(|r| r.hints > 0) {
        ao5(best_five)
    } else {
        None
    };
    let best = match (from_list, kept) {
        (None, k) => k,
        (f, None) => f,
        (Some(f), Some(k)) => Some(f.min(k)),
    }?;
    let place = tier_of(n, best)?;
    Some(MyTier {
        n,
        ao5: best,
        place,
    })
}
