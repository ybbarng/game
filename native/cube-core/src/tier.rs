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

// ── 최고 5판·다음 판 목표·티어 이력(사이트 `rank.ts` 같은 이름, docs/47 14-8) ─────────────

/// 5판(새것이 앞) 가운데 평균에서 빠지는 가장 빠른 판과 가장 느린 판의 자리(0~4). 같은 시간이면 앞(새것) 판.
/// 다섯 모두 같으면 가장 느린 판은 가장 빠른 판이 아닌 첫 판(사이트 `trimmedOf`)
pub fn trimmed_of(five: &[Timeable]) -> (usize, usize) {
    let v: Vec<f64> = five.iter().map(recorded_ms).collect();
    let mut fast = 0;
    for i in 1..v.len() {
        if v[i] < v[fast] {
            fast = i;
        }
    }
    let mut slow: Option<usize> = None;
    for i in 0..v.len() {
        if i == fast {
            continue;
        }
        if slow.is_none_or(|s| v[i] > v[s]) {
            slow = Some(i);
        }
    }
    (fast, slow.unwrap_or(0))
}

/// 티어를 정한 5판(사이트 `BestFiveDetail`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BestFiveDetail {
    pub ms: f64,
    /// 따로 남겨 둔 최고 5판이면 true(값이 같으면 목록)
    pub kept: bool,
    /// 목록이면 그 5판의 첫 자리, 남겨 둔 5판이면 0
    pub at: usize,
    pub fast: usize,
    pub slow: usize,
}

/// 최고 5판 평균을 낸 5판(사이트 `bestFiveDetail`)
pub fn best_five_detail(records: &[Timeable], best_five: &[Timeable]) -> Option<BestFiveDetail> {
    let from_list = best_ao5(records);
    let kept = if best_five.len() == 5 && !best_five.iter().any(|r| r.hints > 0) {
        ao5(best_five)
    } else {
        None
    };
    if let Some(b) = from_list {
        if kept.is_none_or(|k| b.ms <= k) {
            let (fast, slow) = trimmed_of(&records[b.at..b.at + 5]);
            return Some(BestFiveDetail {
                ms: b.ms,
                kept: false,
                at: b.at,
                fast,
                slow,
            });
        }
    }
    let k = kept?;
    let (fast, slow) = trimmed_of(best_five);
    Some(BestFiveDetail {
        ms: k,
        kept: true,
        at: 0,
        fast,
        slow,
    })
}

/// 낮은 쪽부터 센 자리 `step`의 구간과 그 상한(ms, 사이트 `placeAt`)
pub fn place_at(n: usize, step: usize) -> Option<(TierPlace, f64)> {
    let table = crate::data::TIER_TABLE
        .iter()
        .find(|(size, _)| *size == n)?
        .1;
    let mut s = 0;
    for (tier, cuts) in table.iter().enumerate() {
        for (d, cut) in cuts.iter().enumerate() {
            if s == step {
                return Some((
                    TierPlace {
                        tier,
                        division: (cuts.len() == 4).then_some(d),
                        step,
                    },
                    js_round(cut * 1000.0),
                ));
            }
            s += 1;
        }
    }
    None
}

/// 지금 구간 안의 자리(기록 창 가로 막대, 사이트 `TierBand`, docs/47 14-9)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TierBand {
    pub here: TierPlace,
    /// 왼쪽 끝: 지금 구간 상한(ms). 상한이 없는 맨 아래 구간이면 None(자리는 `high_ms`의 두 배로 셈)
    pub low_ms: Option<f64>,
    /// 바로 위 구간. 꼭대기면 None
    pub up: Option<TierPlace>,
    /// 오른쪽 끝: 바로 위 구간 상한(ms). 꼭대기면 0(더 빠를 수 없다)
    pub high_ms: f64,
    /// 0 왼쪽 끝 ~ 1 오른쪽 끝, 시간에 비례
    pub ratio: f64,
}

/// 크기 `n`에서 최고 5판 평균 `ms`의 구간 안 자리(사이트 `tierBand`). 티어가 없으면 None
pub fn tier_band(n: usize, ms: f64) -> Option<TierBand> {
    let here = tier_of(n, ms)?;
    let low = place_at(n, here.step).map_or(f64::INFINITY, |(_, c)| c);
    let next = place_at(n, here.step + 1);
    let high_ms = next.map_or(0.0, |(_, c)| c);
    let low_ms = low.is_finite().then_some(low);
    let left = low_ms.unwrap_or(high_ms * 2.0);
    let raw = if left > high_ms {
        (left - ms) / (left - high_ms)
    } else {
        0.0
    };
    Some(TierBand {
        here,
        low_ms,
        up: next.map(|(p, _)| p),
        high_ms,
        ratio: raw.clamp(0.0, 1.0),
    })
}

/// 다음 판 목표(사이트 `NextSolve`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum NextSolveKind {
    /// 다음 판을 이 시간(ms) 안에 맞추면 닿는다
    Within(f64),
    /// 다음 판이 몇 초든(DNF여도) 닿는다
    Any,
    /// 다음 판 하나로는 못 닿는다. 지금 최고에서 줄일 시간(ms)
    Out(f64),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NextSolve {
    pub to: TierPlace,
    pub cut_ms: f64,
    pub kind: NextSolveKind,
}

/// 다음 판 하나로 바로 위 구간에 닿으려면(사이트 `nextSolve`). 티어가 없거나 꼭대기면 None
pub fn next_solve(n: usize, records: &[Timeable], best_five: &[Timeable]) -> Option<NextSolve> {
    let mine = my_tier(n, records, best_five)?;
    let (to, cut_ms) = place_at(n, mine.place.step + 1)?;
    let out = NextSolve {
        to,
        cut_ms,
        kind: NextSolveKind::Out((mine.ao5 - cut_ms).max(0.0)),
    };
    if records.len() < 4 || records[..4].iter().any(|r| r.hints > 0) {
        return Some(out);
    }
    let four = &records[..4];
    let ok = |x: Timeable| {
        let mut five = vec![x];
        five.extend_from_slice(four);
        ao5(&five).is_some_and(|v| v <= cut_ms)
    };
    let solve = |ms: Option<f64>| Timeable {
        ms,
        penalty: 0.0,
        hints: 0,
    };
    if ok(solve(None)) {
        return Some(NextSolve {
            kind: NextSolveKind::Any,
            ..out
        });
    }
    if !ok(solve(Some(0.0))) {
        return Some(out);
    }
    let top = four
        .iter()
        .map(recorded_ms)
        .filter(|v| v.is_finite())
        .fold(cut_ms * 3.0, f64::max);
    let mut lo: i64 = 0;
    let mut hi: i64 = (top / 10.0).ceil() as i64 + 1;
    while hi - lo > 1 {
        let mid = (lo + hi).div_euclid(2);
        if ok(solve(Some(mid as f64 * 10.0))) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let ms = if lo as f64 * 10.0 >= TEN_MINUTES_MS {
        (lo / 100) as f64 * 1000.0 + 990.0
    } else {
        lo as f64 * 10.0
    };
    Some(NextSolve {
        kind: NextSolveKind::Within(ms),
        ..out
    })
}

/// 티어 이력의 한 판(사이트 `TierHistoryPoint`): 그 판까지의 최고 5판 평균
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HistoryPoint {
    pub no: u32,
    pub at: f64,
    pub ms: Option<f64>,
}

/// 티어(구간)가 바뀐 순간(사이트 `TierChange`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TierChange {
    pub no: u32,
    pub at: f64,
    pub from: Option<TierPlace>,
    pub to: TierPlace,
    pub ms: f64,
}

/// 기록 한 판과 그 번호·시각(이력용)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Dated {
    pub t: Timeable,
    /// 기록 번호(0이면 오래된 판부터 센 차례)
    pub no: u32,
    pub at: f64,
}

/// 기록(새것이 앞)에서 다시 센 티어 이력(사이트 `tierHistory`)
pub fn tier_history(n: usize, records: &[Dated]) -> (Vec<HistoryPoint>, Vec<TierChange>) {
    let old: Vec<Dated> = records.iter().rev().copied().collect();
    let mut points = vec![];
    let mut changes = vec![];
    let mut best: Option<f64> = None;
    let mut place: Option<TierPlace> = None;
    for (i, r) in old.iter().enumerate() {
        if i >= 4 {
            let five: Vec<Timeable> = old[i - 4..=i].iter().map(|d| d.t).collect();
            if !five.iter().any(|x| x.hints > 0) {
                if let Some(v) = ao5(&five) {
                    if best.is_none_or(|b| v < b) {
                        best = Some(v);
                    }
                }
            }
        }
        let no = if r.no > 0 { r.no } else { i as u32 + 1 };
        points.push(HistoryPoint {
            no,
            at: r.at,
            ms: best,
        });
        if let Some(p) = best.and_then(|b| tier_of(n, b)) {
            if place.is_none_or(|q| q.step != p.step) {
                changes.push(TierChange {
                    no,
                    at: r.at,
                    from: place,
                    to: p,
                    ms: best.unwrap_or(0.0),
                });
                place = Some(p);
            }
        }
    }
    (points, changes)
}
