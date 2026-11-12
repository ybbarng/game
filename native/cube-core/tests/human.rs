//! Cubie 네이티브 4단계(docs/52)의 공통 시험 자료: 한 판 세션, 사람 해법과 공식 보기, 공식 연습 진행기.
//! 자료는 사이트 코드가 만든다(`apps/web/src/cube/native/core-fixtures-human.ts`). 어긋난 사례는 모두 모아 찍는다.

mod json;

use cube_core::session::{SessionCue, SolvePhase, SolveSession};
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
