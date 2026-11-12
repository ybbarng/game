//! 공통 시험 자료(`fixtures/*.json`, 사이트 엔진이 만듦)와 코어의 결과가 같은지 본다.
//! 자료를 다시 만드는 법은 `apps/web/src/cube/native/core-fixtures.ts` 머리말.
//! 어긋난 사례는 모두 모아 찍고 하나라도 있으면 실패한다.

mod json;

use cube_core::judge::{goal_met, Goal};
use cube_core::notation::format_moves;
use cube_core::replay::{
    format_replay, format_splits, parse_replay, parse_splits, replay_length, replay_steps,
    REPLAY_MAX_PAUSE_MS,
};
use cube_core::scramble::{scramble, ScrambleEvent};
use cube_core::spot::{last_layer_hint, spot_case, spot_hold, LastLayerHint};
use cube_core::state::{apply_moves, face_colors, is_solved_with};
use cube_core::summary::{mini_summary, RecentAverage};
use cube_core::tier::{ao5, best_ao5, my_tier, tier_of, Timeable, DIVISIONS};
use cube_core::{data, parse_moves, solved_cube};
use json::Json;

struct Report {
    name: &'static str,
    total: usize,
    bad: Vec<String>,
}

impl Report {
    fn new(name: &'static str) -> Self {
        Report {
            name,
            total: 0,
            bad: vec![],
        }
    }
    fn check<T: PartialEq + std::fmt::Debug>(&mut self, what: &str, have: T, want: T) {
        if have != want {
            self.bad
                .push(format!("{what}\n    코어: {have:?}\n    사이트: {want:?}"));
        }
    }
    fn finish(self) {
        println!(
            "{}: 사례 {}개, 어긋남 {}개",
            self.name,
            self.total,
            self.bad.len()
        );
        assert!(self.total > 0, "{}: 사례가 없다", self.name);
        assert!(
            self.bad.is_empty(),
            "{}: 어긋남 {}개\n{}",
            self.name,
            self.bad.len(),
            self.bad.join("\n")
        );
    }
}

fn cases(text: &str) -> Vec<Json> {
    json::parse(text).get("cases").arr().to_vec()
}

#[test]
fn scramble_text_matches_site() {
    let mut r = Report::new("섞기");
    for c in cases(include_str!("../fixtures/scramble.json")) {
        r.total += 1;
        let event = ScrambleEvent::from_id(c.get("event").str()).expect("종목");
        let seed = c.get("seed").num() as u32;
        let s = scramble(event, seed);
        let what = format!("{} 씨앗 {seed}", event.id());
        r.check(&what, s.text.as_str(), c.get("text").str());
        r.check(&what, s.official, c.get("official").bool());
    }
    r.finish();
}

#[test]
fn moves_and_states_match_site() {
    let mut r = Report::new("표기·상태");
    for c in cases(include_str!("../fixtures/moves.json")) {
        r.total += 1;
        let n = c.get("n").num() as usize;
        let alg = c.get("alg").str();
        let what = format!("{n}×{n} 「{alg}」");
        match parse_moves(n, alg) {
            Err(e) => {
                if c.has("error") {
                    r.check(&what, e.index, c.get("error").get("index").num() as usize);
                    r.check(
                        &what,
                        e.message().as_str(),
                        c.get("error").get("message").str(),
                    );
                } else {
                    r.bad.push(format!("{what}: 코어만 못 읽음 {e}"));
                }
            }
            Ok(moves) => {
                if c.has("error") {
                    r.bad.push(format!("{what}: 사이트는 못 읽음"));
                    continue;
                }
                r.check(
                    &what,
                    format_moves(n, &moves).as_str(),
                    c.get("formatted").str(),
                );
                let s = apply_moves(n, &solved_cube(n), &moves);
                let colors: String = face_colors(n, &s).iter().map(|c| c.to_string()).collect();
                r.check(&what, colors.as_str(), c.get("colors").str());
                let perm: Vec<f64> = s.perm.iter().map(|&p| f64::from(p)).collect();
                let want: Vec<f64> = c.get("perm").arr().iter().map(Json::num).collect();
                r.check(&what, perm, want);
                let twist: String = s.twist.iter().map(|t| t.to_string()).collect();
                r.check(&what, twist.as_str(), c.get("twist").str());
                r.check(&what, is_solved_with(n, &s, false), c.get("solved").bool());
                r.check(
                    &what,
                    is_solved_with(n, &s, true),
                    c.get("solvedOriented").bool(),
                );
            }
        }
    }
    r.finish();
}

#[test]
fn spot_matches_site() {
    let mut r = Report::new("OLL·PLL 알아보기");
    for c in cases(include_str!("../fixtures/spot.json")) {
        r.total += 1;
        let alg = c.get("alg").str();
        let what = format!("「{alg}」");
        let s = apply_moves(3, &solved_cube(3), &parse_moves(3, alg).unwrap());
        r.check(&what, goal_met(3, &s, Goal::F2l), c.get("f2l").bool());
        r.check(
            &what,
            spot_case(&s, data::OLL_CASES).map(|x| x.id),
            c.get("oll").opt_str(),
        );
        r.check(
            &what,
            spot_case(&s, data::PLL_CASES).map(|x| x.id),
            c.get("pll").opt_str(),
        );
        let hold = spot_hold(&s, data::TWO_LOOK_CASES).map(|h| (h.case.id, h.rot, h.pre));
        let want = c.get("twoLook");
        let want = (!want.is_null()).then(|| {
            (
                want.get("id").str(),
                want.get("rot").str(),
                want.get("pre").str(),
            )
        });
        r.check(&what, hold, want);

        let hint = c.get("hint");
        if hint.is_null() {
            continue;
        }
        let have = last_layer_hint(&s);
        if hint.has("kind") {
            // 사이트: 공식 없음(이미 맞음 등)
            r.check(
                &what,
                matches!(have, LastLayerHint::Solved),
                hint.get("kind").str() == "none",
            );
            continue;
        }
        let have = match have {
            LastLayerHint::Formula {
                stage,
                name,
                before,
                alg,
                ..
            } => Some((
                stage.to_string(),
                Some(name.to_string()),
                before,
                alg.to_string(),
            )),
            LastLayerHint::Finish { alg } => Some((
                "마무리(윗면 맞추기)".to_string(),
                None,
                String::new(),
                alg.to_string(),
            )),
            // 사이트가 컴퓨터 해법의 다음 단계(십자·F2L 짝)를 낸 경우만 건너뛴다. 코어에는 아직 그 해법이 없다
            LastLayerHint::NotLastLayer
                if !hint.get("stage").str().starts_with("OLL")
                    && !hint.get("stage").str().starts_with("PLL")
                    && !hint.get("stage").str().starts_with("마무리") =>
            {
                continue
            }
            LastLayerHint::NotLastLayer => None,
            LastLayerHint::Solved => None,
        };
        let want = Some((
            hint.get("stage").str().to_string(),
            hint.get("name").opt_str().map(str::to_string),
            hint.get("before").str().to_string(),
            hint.get("alg").str().to_string(),
        ));
        r.check(&what, have, want);
    }
    r.finish();
}

fn timeable(j: &Json) -> Timeable {
    Timeable {
        ms: j.get("ms").opt_num(),
        penalty: j.get("penalty").num(),
        hints: j.get("hints").opt_num().unwrap_or(0.0) as u32,
    }
}

fn place_json(p: &Json) -> Option<(String, Option<String>, usize, String)> {
    (!p.is_null()).then(|| {
        (
            p.get("tier").str().to_string(),
            p.get("division").opt_str().map(str::to_string),
            p.get("step").num() as usize,
            p.get("name").str().to_string(),
        )
    })
}

fn place_core(
    p: Option<cube_core::tier::TierPlace>,
) -> Option<(String, Option<String>, usize, String)> {
    p.map(|p| {
        (
            p.tier_id().to_string(),
            p.division.map(|d| DIVISIONS[d].to_string()),
            p.step,
            p.name(),
        )
    })
}

#[test]
fn tiers_match_site() {
    let mut r = Report::new("Ao5·티어");
    for c in cases(include_str!("../fixtures/tier.json")) {
        r.total += 1;
        match c.get("kind").str() {
            "ao5" => {
                let five: Vec<Timeable> = c.get("five").arr().iter().map(timeable).collect();
                r.check(&format!("Ao5 {five:?}"), ao5(&five), c.get("ao5").opt_num());
            }
            "tier" => {
                let n = c.get("n").num() as usize;
                let records: Vec<Timeable> = c.get("records").arr().iter().map(timeable).collect();
                let best_five: Vec<Timeable> =
                    c.get("bestFive").arr().iter().map(timeable).collect();
                let what = format!("{n}×{n} 기록 {}판", records.len());
                let best = best_ao5(&records).map(|b| (b.ms, b.at));
                let want = c.get("best");
                let want = (!want.is_null())
                    .then(|| (want.get("ms").num(), want.get("at").num() as usize));
                r.check(&what, best, want);
                let mine = my_tier(n, &records, &best_five);
                let have = mine.map(|m| (m.ao5, place_core(Some(m.place))));
                let my = c.get("my");
                let want = (!my.is_null()).then(|| (my.get("ao5").num(), place_json(my)));
                r.check(&what, have, want);
            }
            "tierOf" => {
                let n = c.get("n").num() as usize;
                let ms = c.get("ms").num();
                r.check(
                    &format!("{n}×{n} {ms}ms"),
                    place_core(tier_of(n, ms)),
                    place_json(c.get("place")),
                );
            }
            other => panic!("모르는 사례 {other}"),
        }
    }
    r.finish();
}

fn recent_json(j: &Json) -> RecentAverage {
    if j.is_null() {
        RecentAverage::Dnf
    } else if matches!(j, Json::Str(s) if s == "-") {
        RecentAverage::Missing
    } else {
        RecentAverage::Ms(j.num())
    }
}

#[test]
fn summary_matches_site() {
    let mut r = Report::new("Cubie 기록 창 요약");
    for c in cases(include_str!("../fixtures/summary.json")) {
        r.total += 1;
        let records: Vec<Timeable> = c.get("records").arr().iter().map(timeable).collect();
        let s = mini_summary(&records);
        r.check(
            &format!("기록 {}판", records.len()),
            (s.best, s.mean, s.ao5, s.ao12),
            (
                c.get("best").opt_num(),
                c.get("mean").opt_num(),
                recent_json(c.get("ao5")),
                recent_json(c.get("ao12")),
            ),
        );
    }
    r.finish();
}

fn pairs(j: &Json) -> Vec<(String, f64)> {
    j.arr()
        .iter()
        .map(|p| (p.arr()[0].str().to_string(), p.arr()[1].num()))
        .collect()
}

#[test]
fn replay_matches_site() {
    let mut r = Report::new("다시 보기·구간 기록");
    for c in cases(include_str!("../fixtures/replay.json")) {
        r.total += 1;
        match c.get("kind").str() {
            "replay" => {
                let n = c.get("n").num() as usize;
                let text = c.get("text").str();
                let what = format!("「{text}」");
                let parsed = parse_replay(text);
                r.check(&what, parsed.clone(), pairs(c.get("parsed")));
                r.check(
                    &what,
                    format_replay(&parsed).as_str(),
                    c.get("formatted").str(),
                );
                r.check(
                    &what,
                    replay_length(text, REPLAY_MAX_PAUSE_MS),
                    c.get("length").num(),
                );
                let steps: Vec<(f64, String)> = replay_steps(n, text, REPLAY_MAX_PAUSE_MS, 0.0)
                    .into_iter()
                    .map(|s| (s.at, format_moves(n, &s.moves)))
                    .collect();
                let want: Vec<(f64, String)> = c
                    .get("steps")
                    .arr()
                    .iter()
                    .map(|s| (s.get("at").num(), s.get("moves").str().to_string()))
                    .collect();
                r.check(&what, steps, want);
            }
            "splits" => {
                let text = c.get("text").str();
                let parsed = parse_splits(text);
                let want: Vec<(String, f64)> = c
                    .get("parsed")
                    .arr()
                    .iter()
                    .map(|s| (s.get("id").str().to_string(), s.get("ms").num()))
                    .collect();
                r.check(text, parsed.clone(), want);
                r.check(
                    text,
                    format_splits(&parsed).as_str(),
                    c.get("formatted").str(),
                );
            }
            "format" => {
                let events = pairs(c.get("events"));
                r.check(
                    "다시 보기 쓰기",
                    format_replay(&events).as_str(),
                    c.get("formatted").str(),
                );
            }
            other => panic!("모르는 사례 {other}"),
        }
    }
    r.finish();
}
