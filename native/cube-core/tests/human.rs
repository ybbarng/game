//! Cubie 네이티브 4단계(docs/52)의 공통 시험 자료: 한 판 세션, 사람 해법과 공식 보기, 공식 연습 진행기.
//! 자료는 사이트 코드가 만든다(`apps/web/src/cube/native/core-fixtures-human.ts`). 어긋난 사례는 모두 모아 찍는다.

mod json;

use cube_core::hint::{pick_hint, HintAnswer};
use cube_core::human::{solve_advanced2, solve_cfop};
use cube_core::session::{SessionCue, SolvePhase, SolveSession};
use cube_core::solved_cube;
use cube_core::state::apply_alg;
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
            self.bad
                .iter()
                .take(30)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
}

fn cases(text: &str) -> Vec<Json> {
    json::parse(text).get("cases").arr().to_vec()
}

fn phase_id(p: SolvePhase) -> &'static str {
    match p {
        SolvePhase::Free => "free",
        SolvePhase::Ready => "ready",
        SolvePhase::Solving => "solving",
        SolvePhase::Done => "done",
    }
}

fn cue_id(c: SessionCue) -> &'static str {
    match c {
        SessionCue::Milestone => "milestone",
        SessionCue::Solved => "solved",
    }
}

#[test]
fn session_matches_site() {
    let mut r = Report::new("한 판 세션");
    for (ci, c) in cases(include_str!("../fixtures/session.json"))
        .iter()
        .enumerate()
    {
        let n = c.get("n").num() as usize;
        let mut s = SolveSession::new(n);
        let mut now = 0.0;
        for (i, (op, want)) in c
            .get("ops")
            .arr()
            .iter()
            .zip(c.get("out").arr())
            .enumerate()
        {
            r.total += 1;
            if op.has("t") {
                now = op.get("t").num();
            }
            let outcome = match op.get("op").str() {
                "start" => {
                    s.start(
                        op.get("scramble").str(),
                        Some(op.get("seed").num() as u32),
                        now,
                    )
                    .expect("섞기 글");
                    None
                }
                "reset" => {
                    s.reset();
                    None
                }
                "undo" => s.undo(now).map(|(_, o)| o),
                _ => Some(
                    s.input_notation(op.get("notation").str(), now)
                        .expect("표기"),
                ),
            };
            let what = format!("사례 {ci} 차례 {i} {op:?}");
            let cues: Vec<&str> = outcome
                .as_ref()
                .map(|o| o.cues.iter().map(|&c| cue_id(c)).collect())
                .unwrap_or_default();
            let want_cues: Vec<&str> = want.get("cues").arr().iter().map(Json::str).collect();
            r.check(&what, cues, want_cues);
            r.check(&what, phase_id(s.phase), want.get("phase").str());
            r.check(&what, f64::from(s.move_count), want.get("moves").num());
            r.check(&what, s.elapsed(now), want.get("elapsed").num());
            r.check(&what, s.progress().value, want.get("progress").num());
            r.check(&what, f64::from(s.flow_score()), want.get("flow").num());
            r.check(
                &what,
                f64::from(s.longest_combo()),
                want.get("longest").num(),
            );
            let splits: Vec<(String, f64)> = s
                .splits
                .iter()
                .map(|(m, t)| (m.id().to_string(), *t))
                .collect();
            r.check(
                &what,
                cube_core::replay::format_splits(&splits).as_str(),
                want.get("splits").str(),
            );
            let rec = outcome.and_then(|o| o.record);
            let wr = want.get("record");
            r.check(&what, rec.is_some(), !wr.is_null());
            if let Some(rec) = rec {
                r.check(&what, rec.ms, wr.get("ms").num());
                r.check(&what, rec.penalty, wr.get("penalty").num());
                r.check(&what, f64::from(rec.moves), wr.get("moves").num());
                r.check(&what, rec.replay.as_str(), wr.get("replay").str());
                r.check(&what, rec.splits.as_deref(), wr.get("splits").opt_str());
                r.check(&what, rec.combo.map(f64::from), wr.get("combo").opt_num());
            }
        }
    }
    r.finish();
}

fn hint_text(h: &HintAnswer) -> String {
    match h {
        HintAnswer::Hint(f) => format!(
            "stage={:?} name={:?} before={:?} alg={:?} lesson={:?}",
            f.stage,
            f.name.as_deref(),
            f.before,
            f.alg,
            f.lesson
        ),
        HintAnswer::Unsupported => "kind=unsupported".to_string(),
        HintAnswer::None => "kind=none".to_string(),
    }
}

fn want_hint_text(j: &Json) -> String {
    if j.has("kind") {
        return format!("kind={}", j.get("kind").str());
    }
    format!(
        "stage={:?} name={:?} before={:?} alg={:?} lesson={:?}",
        j.get("stage").str(),
        j.get("name").opt_str(),
        j.get("before").str(),
        j.get("alg").str(),
        j.get("lesson").opt_str()
    )
}

#[test]
fn hint_and_human_solve_match_site() {
    let mut r = Report::new("공식 보기·사람 해법");
    for c in cases(include_str!("../fixtures/hint.json")) {
        r.total += 1;
        let n = c.get("n").num() as usize;
        let alg = c.get("alg").str();
        let state = apply_alg(n, &solved_cube(n), alg).expect("표기");
        let what = format!("{n}×{n} 「{alg}」");
        r.check(
            &what,
            hint_text(&pick_hint(n, &state)),
            want_hint_text(c.get("hint")),
        );
        let want = c.get("solve");
        if want.is_null() {
            continue;
        }
        let solve = if n == 3 {
            solve_cfop(&state)
        } else {
            solve_advanced2(&state)
        }
        .expect("해법");
        r.check(
            &what,
            solve.moves.join(" ").as_str(),
            want.get("moves").str(),
        );
        let stages: Vec<(String, f64, f64)> = solve
            .stages
            .iter()
            .map(|s| (s.name.id().to_string(), s.start as f64, s.end as f64))
            .collect();
        let want_stages: Vec<(String, f64, f64)> = want
            .get("stages")
            .arr()
            .iter()
            .map(|s| {
                let a = s.arr();
                (a[0].str().to_string(), a[1].num(), a[2].num())
            })
            .collect();
        r.check(&what, stages, want_stages);
        let looks: Vec<f64> = solve.looks.iter().map(|&l| l as f64).collect();
        let want_looks: Vec<f64> = want.get("looks").arr().iter().map(Json::num).collect();
        r.check(&what, looks, want_looks);
    }
    r.finish();
}
