//! 공식 연습 진행기가 사이트와 같은지 본다(`fixtures/practice.json`, 사이트 `practice/`가 만듦).
//! 메뉴 단계, 단계·키 배치마다 고른 공식과 키 비용, 씨앗·기록 → 출제와 시작 모양, 진행기 차례 → 화면 상태·소리·기록.

mod json;

use std::collections::HashMap;

use cube_core::keys::{notation_to_move, preset_keymap, Preset};
use cube_core::notation::AXIS_NAMES;
use cube_core::practice::{
    board_for, case_start, draw_round, key_cost, menu_stages, pick_alg, problem_of, stage_by_id,
    AlgBook, CaseAlgs, CaseStats, DrawOptions, PracticeEvent, PracticeInput, PracticeMode,
    PracticePhase, PracticeRecord, PracticeSession, TrainBook, PRACTICE_N, ROUND_SIZE,
};
use cube_core::state::{face_colors, State};
use json::Json;

fn colors(s: &State) -> String {
    face_colors(PRACTICE_N, s)
        .iter()
        .map(|c| char::from(b'0' + c))
        .collect()
}

fn obj(j: &Json) -> Vec<(&String, &Json)> {
    match j {
        Json::Obj(m) => m.iter().collect(),
        Json::Null => vec![],
        other => panic!("객체가 아니다: {other:?}"),
    }
}

fn nums(j: &Json) -> Vec<f64> {
    j.arr().iter().map(Json::num).collect()
}

fn book_of(j: &Json) -> TrainBook {
    obj(j)
        .into_iter()
        .map(|(id, s)| {
            (
                id.clone(),
                CaseStats {
                    solves: s.get("solves").num() as u32,
                    fails: s.get("fails").num() as u32,
                    best: s.get("best").opt_num(),
                    times: nums(s.get("times")),
                    moves: nums(s.get("moves")),
                },
            )
        })
        .collect()
}

/// 기록을 견줄 수 있게 차례를 정한 글로
fn book_text(b: &TrainBook) -> String {
    let mut ids: Vec<&String> = b.keys().collect();
    ids.sort();
    ids.iter()
        .map(|id| format!("{id}:{:?}", b[*id]))
        .collect::<Vec<_>>()
        .join("\n")
}

struct Bad(Vec<String>);

impl Bad {
    fn check<T: PartialEq + std::fmt::Debug>(&mut self, what: &str, have: T, want: T) {
        if have != want {
            self.0
                .push(format!("{what}\n    코어: {have:?}\n    사이트: {want:?}"));
        }
    }
}

fn preset(id: &str) -> Preset {
    Preset::from_id(id).expect("배치")
}

#[test]
fn practice_matches_site() {
    let root = json::parse(include_str!("../fixtures/practice.json"));
    let mut bad = Bad(vec![]);
    let mut total = 0;

    let menu: Vec<(String, String, String)> = menu_stages()
        .into_iter()
        .map(|m| (m.id.to_string(), m.title.to_string(), m.group.to_string()))
        .collect();
    let want_menu: Vec<(String, String, String)> = root
        .get("menu")
        .arr()
        .iter()
        .map(|m| {
            (
                m.get("id").str().to_string(),
                m.get("title").str().to_string(),
                m.get("group").str().to_string(),
            )
        })
        .collect();
    bad.check("메뉴", menu, want_menu);

    for c in root.get("cases").arr() {
        let stage = stage_by_id(c.get("stage").str()).expect("단계");
        if c.get("kind").str() == "stage" {
            for (p, list) in obj(c.get("picks")) {
                let km = preset_keymap(preset(p));
                for (case, want) in stage.cases.iter().zip(list.arr()) {
                    total += 1;
                    let alg = pick_alg(case, &km, &AlgBook::new()).alg;
                    let cost = key_cost(&alg, &km, PRACTICE_N);
                    let w = want.arr();
                    bad.check(
                        &format!("{} {p} {} 고른 공식·키 비용", stage.id, case.id),
                        (alg.as_str(), cost),
                        (w[0].str(), w[1].num()),
                    );
                }
            }
            let two = preset_keymap(Preset::TwoHand);
            for d in c.get("draws").arr() {
                total += 1;
                let book = book_of(d.get("book"));
                let ids: Vec<&str> = stage.cases.iter().map(|x| x.id).collect();
                let draws = draw_round(
                    &ids,
                    DrawOptions {
                        seed: d.get("seed").num() as u32,
                        book: Some(&book),
                        auf: stage.auf,
                        every_turn: d.get("everyTurn").bool(),
                        count: ROUND_SIZE,
                    },
                );
                let have: Vec<String> = draws
                    .iter()
                    .map(|dr| {
                        let case = stage.case(&dr.case_id).unwrap();
                        let p = problem_of(
                            stage,
                            case,
                            dr.turn,
                            &pick_alg(case, &two, &AlgBook::new()).alg,
                        );
                        let b = board_for(stage, case, &p);
                        format!(
                            "{} [{}] {} [{}] {} {}",
                            p.case_id,
                            p.turn,
                            p.alg,
                            p.pre_auf,
                            b.tokens.join(" "),
                            colors(&case_start(stage, case, p.turn))
                        )
                    })
                    .collect();
                let want: Vec<String> = d
                    .get("problems")
                    .arr()
                    .iter()
                    .map(|p| {
                        let tokens: Vec<&str> =
                            p.get("tokens").arr().iter().map(Json::str).collect();
                        format!(
                            "{} [{}] {} [{}] {} {}",
                            p.get("caseId").str(),
                            p.get("turn").str(),
                            p.get("alg").str(),
                            p.get("preAuf").str(),
                            tokens.join(" "),
                            p.get("start").str()
                        )
                    })
                    .collect();
                bad.check(
                    &format!("{} 씨앗 {} 출제", stage.id, d.get("seed").num()),
                    have,
                    want,
                );
            }
            continue;
        }

        // 진행기
        let mode = match c.get("mode").str() {
            "follow" => PracticeMode::Follow,
            _ => PracticeMode::See,
        };
        let km = preset_keymap(preset(c.get("preset").str()));
        let mut book = AlgBook::new();
        if c.has("mine") {
            for id in c.get("mine").arr() {
                let case = stage.case(id.str()).unwrap();
                book.insert(
                    id.str().to_string(),
                    CaseAlgs {
                        mine: vec![],
                        use_alg: Some(case.choices.last().unwrap().to_string()),
                    },
                );
            }
        }
        let seed = c.get("seed").num() as u32;
        let mut s = PracticeSession::new(
            stage,
            mode,
            &km,
            &book,
            PracticeRecord::default(),
            TrainBook::new(),
            seed,
        );
        s.take_events();
        let name = format!("{} {}", stage.id, mode.id());
        for (i, (op, want)) in c
            .get("ops")
            .arr()
            .iter()
            .zip(c.get("out").arr())
            .enumerate()
        {
            total += 1;
            let t = op.get("t").num();
            let what = format!("{name} 차례 {i} {op:?}");
            let result: Option<String> = match op.get("op").str() {
                "move" => {
                    let m = notation_to_move(PRACTICE_N, op.get("notation").str()).unwrap();
                    Some(
                        match s.input(&m, t) {
                            PracticeInput::Applied => "applied",
                            PracticeInput::Rejected => "rejected",
                            PracticeInput::Ignored => "ignored",
                        }
                        .to_string(),
                    )
                }
                "wait" => {
                    s.tick(t);
                    None
                }
                "peek" => Some(s.peek(t).to_string()),
                "reset" => Some(s.reset(t).to_string()),
                "undo" => s.undo(t).map(|m| {
                    format!(
                        "{} {} {} {}",
                        AXIS_NAMES[m.axis as usize], m.from, m.to, m.turns
                    )
                }),
                "newRound" => {
                    s.tick(t);
                    s.new_round(op.get("seed").num() as u32);
                    None
                }
                other => panic!("모르는 차례 {other}"),
            };
            let want_result = match want.get("result") {
                Json::Null => None,
                Json::Bool(b) => Some(b.to_string()),
                Json::Str(x) => Some(x.clone()),
                Json::Arr(a) => Some(format!(
                    "{} {} {} {}",
                    a[0].str(),
                    a[1].num(),
                    a[2].num(),
                    a[3].num()
                )),
                other => panic!("모르는 결과 {other:?}"),
            };
            bad.check(&what, result, want_result);
            let cues: Vec<&str> = s
                .take_events()
                .into_iter()
                .filter_map(|e| match e {
                    PracticeEvent::Invalid => Some("invalid"),
                    PracticeEvent::Solved => Some("solved"),
                    _ => None,
                })
                .collect();
            let want_cues: Vec<&str> = want.get("cues").arr().iter().map(Json::str).collect();
            bad.check(&what, cues, want_cues);
            let phase = match s.phase {
                PracticePhase::Play => "play",
                PracticePhase::Pause => "pause",
                PracticePhase::Over => "over",
            };
            let have = format!(
                "{phase} {}/{} {:?} [{}] at {} wrong {:?} peeked {} combo {}/{} state {:?} common {:?} see {}",
                s.round.index,
                s.round.problems.len(),
                s.round.current().map(|p| p.case_id.clone()),
                s.tokens().join(" "),
                s.at(),
                s.wrong,
                s.peeked,
                s.round.combo.current,
                s.round.combo.best,
                s.state.as_ref().map(colors),
                s.common_alg(),
                s.suggest_see(),
            );
            let wrong = match want.get("wrong") {
                Json::Null => None,
                w => Some((w.arr()[0].num() as usize, w.arr()[1].str().to_string())),
            };
            let combo = want.get("combo").arr();
            let want_text = format!(
                "{} {}/{} {:?} [{}] at {} wrong {:?} peeked {} combo {}/{} state {:?} common {:?} see {}",
                want.get("phase").str(),
                want.get("index").num(),
                want.get("count").num(),
                want.get("caseId").opt_str().map(str::to_string),
                want.get("tokens").str(),
                want.get("at").num(),
                wrong,
                want.get("peeked").bool(),
                combo[0].num(),
                combo[1].num(),
                want.get("state").opt_str().map(str::to_string),
                want.get("commonAlg").opt_str(),
                want.get("suggestSee").bool(),
            );
            bad.check(&what, have, want_text);
            let sum = want.get("summary");
            bad.check(&what, s.summary.is_some(), !sum.is_null());
            if let Some(h) = &s.summary {
                let slow: Vec<(String, f64)> = sum
                    .get("slow")
                    .arr()
                    .iter()
                    .map(|x| (x.arr()[0].str().to_string(), x.arr()[1].num()))
                    .collect();
                bad.check(
                    &what,
                    (
                        h.accuracy,
                        h.avg_ms,
                        h.per_minute,
                        f64::from(h.best_combo),
                        h.slow.clone(),
                    ),
                    (
                        sum.get("accuracy").num(),
                        sum.get("avgMs").num(),
                        sum.get("perMinute").num(),
                        sum.get("bestCombo").num(),
                        slow,
                    ),
                );
            }
        }
        // 기록(앱이 저장할 것)
        let rec = c.get("record");
        bad.check(
            &format!("{name} 따라 치기 기록"),
            book_text(&s.record.follow),
            book_text(&book_of(rec.get("follow"))),
        );
        let rounds: HashMap<String, (u32, u32)> = obj(rec.get("rounds"))
            .into_iter()
            .map(|(id, r)| {
                (
                    id.clone(),
                    (r.get("follow").num() as u32, r.get("see").num() as u32),
                )
            })
            .collect();
        bad.check(&format!("{name} 판 수"), s.record.rounds.clone(), rounds);
        bad.check(
            &format!("{name} 마지막 단계"),
            s.record.last.as_deref(),
            rec.get("last").opt_str(),
        );
        bad.check(
            &format!("{name} 보고 치기 기록"),
            book_text(&s.train),
            book_text(&book_of(c.get("train"))),
        );
    }
    println!("공식 연습: 사례 {total}개, 어긋남 {}개", bad.0.len());
    assert!(total > 0);
    assert!(
        bad.0.is_empty(),
        "어긋남 {}개\n{}",
        bad.0.len(),
        bad.0
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
}
