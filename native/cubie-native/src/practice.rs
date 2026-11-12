//! Cubie 공식 연습(docs/47 16-11, docs/52 5-6): 코어 진행기(`cube_core::practice::PracticeSession`, 사이트와 공통 시험
//! 자료로 어긋남 0)를 한 판([`Game`])에 붙인다. 연습하는 동안 키는 진행기로 가고, 받은 수만 장면에 넣는다(틀린 수는
//! 넣지 않고 그 수의 키를 잠깐 보인다). 말풍선 줄은 사이트 `mini/practice.ts` `practiceBubbleLines`와 같은 글이다.

use cube_core::keys::{keycaps_for_move, Command, KeyInput, KeyResult};
use cube_core::practice::{
    stage_by_id, PracticeEvent, PracticeInput, PracticeMode, PracticePhase, PracticeSession,
    PRACTICE_N,
};

use crate::game::{Game, Outcome};
use crate::json;

pub const EV_REPAINT: u32 = 1;
pub const EV_SOLVED: u32 = 2;
pub const EV_INVALID: u32 = 4;
pub const EV_ROUND_OVER: u32 = 8;

/// 사이트 `formatMs`
pub fn format_ms(ms: f64) -> String {
    let cs = (ms / 10.0).floor() as i64;
    let s = cs / 100;
    let frac = cs % 100;
    if s < 60 {
        format!("{s}.{frac:02}")
    } else {
        format!("{}:{:02}.{frac:02}", s / 60, s % 60)
    }
}

impl Game {
    /// 공식 연습을 연다(3×3 한 판만). 기록·보고 치기 기록·내 공식은 사이트와 같은 JSON 글. 모르는 단계면 false
    pub fn practice_start(
        &mut self,
        stage: &str,
        see: bool,
        alg_book: &str,
        record: &str,
        train: &str,
        seed: u32,
    ) -> bool {
        if self.n != PRACTICE_N {
            return false;
        }
        let Some(stage) = stage_by_id(stage) else {
            return false;
        };
        let mode = if see {
            PracticeMode::See
        } else {
            PracticeMode::Follow
        };
        let mut rec = json::practice_record(record);
        rec.last = Some(stage.id.to_string());
        let p = PracticeSession::new(
            stage,
            mode,
            &self.keymap_clone(),
            &json::alg_book(alg_book),
            rec,
            json::train_book(train),
            seed,
        );
        self.practice = Some(p);
        self.practice_events = 0;
        self.drain_practice();
        if let Some(st) = self.practice.as_ref().and_then(|p| p.state.clone()) {
            self.jump_to(st);
        }
        true
    }

    /// 연습 끝내기(맞추던 판은 앱이 다른 한 판으로 들고 있다)
    pub fn practice_stop(&mut self) {
        self.practice = None;
    }

    pub fn practicing(&self) -> bool {
        self.practice.is_some()
    }

    /// 시각이 닿은 일(맞춘 모습 멈춤 끝·틀린 키 끝)
    pub fn practice_tick(&mut self, now: f64) {
        if let Some(p) = self.practice.as_mut() {
            p.tick(now);
        }
        self.drain_practice();
    }

    /// 보고 치기: 공식 펼치기(힌트 키)
    pub fn practice_peek(&mut self) -> bool {
        let now = self.now();
        let ok = self.practice.as_mut().is_some_and(|p| p.peek(now));
        self.drain_practice();
        ok
    }

    pub fn take_practice_events(&mut self) -> u32 {
        std::mem::take(&mut self.practice_events)
    }

    fn drain_practice(&mut self) {
        let Some(p) = self.practice.as_mut() else {
            return;
        };
        let mut repaint = false;
        for e in p.take_events() {
            self.practice_events |= match e {
                PracticeEvent::Repaint => {
                    repaint = true;
                    EV_REPAINT
                }
                PracticeEvent::Solved => EV_SOLVED,
                PracticeEvent::Invalid => EV_INVALID,
                PracticeEvent::RoundOver => EV_ROUND_OVER,
            };
        }
        if repaint {
            if let Some(st) = self.practice.as_ref().and_then(|p| p.state.clone()) {
                self.jump_to(st);
            }
        }
    }

    /// 연습 중의 키(사이트 `MiniCubeApp` 연습 갈래): 섞기 키는 판 끝에서만 「한 판 더」, 되돌리기는 보고 치기만
    pub(crate) fn practice_key(&mut self, input: &KeyInput, seed: u32) -> Outcome {
        let now = self.now();
        let out = match self.interp_handle(input) {
            None => Outcome::Ignored,
            Some(KeyResult::Move { notation, mv, .. }) => {
                let p = self.practice.as_mut().expect("연습");
                match p.input(&mv, now) {
                    PracticeInput::Applied => {
                        let st = p.state.clone().expect("상태");
                        self.push_with_state(mv, st);
                        Outcome::Moved {
                            notation,
                            solved: false,
                        }
                    }
                    _ => Outcome::Consumed,
                }
            }
            Some(KeyResult::Command { command, .. }) => {
                let p = self.practice.as_mut().expect("연습");
                match command {
                    Command::Scramble => {
                        if p.phase == PracticePhase::Over {
                            p.new_round(seed);
                        }
                        Outcome::Consumed
                    }
                    Command::Undo => match p.undo(now) {
                        Some(back) => {
                            let st = p.state.clone().expect("상태");
                            self.push_with_state(back, st);
                            Outcome::Moved {
                                notation: String::new(),
                                solved: false,
                            }
                        }
                        None => Outcome::Consumed,
                    },
                    Command::PeekBack | Command::PeekDown | Command::ViewHome => {
                        Outcome::View(command)
                    }
                    _ => Outcome::Consumed,
                }
            }
            Some(_) => Outcome::Consumed,
        };
        self.drain_practice();
        out
    }

    /// 말풍선 줄(사이트 `practiceBubbleLines`). 줄마다 「꼴\t글」, 공식 줄은 끝에 「\t」와 낱말마다 「꼴:글」을 0x1f로 이은 것.
    /// `again`은 「한 판 더」 키 이름
    pub fn practice_lines(&self, again: &str) -> Vec<String> {
        let Some(s) = self.practice.as_ref() else {
            return vec![];
        };
        let keymap = self.keymap_clone();
        let keys = |t: &str| keycaps_for_move(&keymap, PRACTICE_N, t).unwrap_or_else(|| "?".into());
        if s.phase == PracticePhase::Over {
            if let Some(sum) = &s.summary {
                let mut lines = vec![
                    format!("title\t{} 한 판 끝", s.stage.title),
                    format!(
                        "plain\t정확도 {}% · 평균 {}초",
                        (sum.accuracy * 100.0).round() as i64,
                        format_ms(sum.avg_ms)
                    ),
                    format!(
                        "plain\t1분에 {}수 · 가장 긴 콤보 {}",
                        sum.per_minute.round() as i64,
                        sum.best_combo
                    ),
                ];
                if !sum.slow.is_empty() {
                    lines.push("note\t느렸던 공식".into());
                    for (id, ms) in &sum.slow {
                        let name = s.stage.case(id).map_or(id.as_str(), |c| c.name);
                        lines.push(format!("plain\t{name}  {}초", format_ms(*ms)));
                    }
                }
                lines.push(format!("keys\t{again} 한 판 더 · Esc 연습 끝내기"));
                return lines;
            }
        }
        let round = &s.round;
        let total = round.problems.len();
        let mut lines = vec![format!(
            "title\t{} {}/{} · 콤보 {}",
            s.stage.title,
            (round.index + 1).min(total),
            total,
            round.combo.current
        )];
        if let Some(c) = s.current() {
            lines.push(format!("note\t{}", c.name));
        }
        if s.mode == PracticeMode::See && !s.peeked && s.phase == PracticePhase::Play {
            return lines;
        }
        let tokens = s.tokens();
        let at = s.at();
        let mut spans: Vec<String> = Vec::new();
        for (i, t) in tokens.iter().enumerate() {
            let style = if s.phase != PracticePhase::Play || i < at {
                "done"
            } else if i == at {
                if s.wrong.as_ref().is_some_and(|w| w.0 == i) {
                    "wrong"
                } else if s.mode == PracticeMode::Follow {
                    "now"
                } else {
                    "next"
                }
            } else {
                "next"
            };
            if i > 0 {
                spans.push("next: ".into());
            }
            spans.push(format!("{style}:{t}"));
        }
        lines.push(format!(
            "alg\t{}\t{}",
            tokens.join(" "),
            spans.join("\u{1f}")
        ));
        if let Some((_, token)) = &s.wrong {
            let k = keys(token);
            if !k.is_empty() {
                lines.push(format!("keys\t{token}  {k}"));
            }
        }
        if s.phase == PracticePhase::Pause {
            lines.push("ok\t맞춤".into());
        }
        lines
    }

    /// 저장할 기록 글: (공식 연습 기록, 보고 치기 기록)
    pub fn practice_records(&self) -> Option<(String, String)> {
        let p = self.practice.as_ref()?;
        Some((
            json::practice_record_json(&p.record),
            json::train_book_json(&p.train),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cube_core::practice::menu_stages;

    #[test]
    fn practice_runs_inside_the_game() {
        let mut g = Game::new(3);
        let stage = menu_stages()[0].id;
        assert!(g.practice_start(stage, false, "{}", "", "", 7));
        assert!(g.practicing());
        let lines = g.practice_lines("Enter");
        assert!(lines[0].starts_with("title\t"), "{lines:?}");
        assert!(lines.iter().any(|l| l.starts_with("alg\t")), "{lines:?}");
        // 지금 칠 첫 낱말을 쳐서 받는지(수 이름 → 두 손 키는 몰라도 진행기에 바로 넣는다)
        let first = g.practice.as_ref().unwrap().tokens()[0].clone();
        let mv = cube_core::parse_moves(3, &first).unwrap()[0];
        let st = g.practice.as_ref().unwrap().state.clone();
        let r = g.practice.as_mut().unwrap().input(&mv, 0.0);
        assert_eq!(r, PracticeInput::Applied);
        assert_ne!(g.practice.as_ref().unwrap().state, st);
        let (rec, train) = g.practice_records().unwrap();
        assert!(rec.contains(&format!("\"last\":\"{stage}\"")), "{rec}");
        assert_eq!(train, "{}");
        g.practice_stop();
        assert!(!g.practicing());
        assert!(!Game::new(4).practice_start(stage, false, "", "", "", 1));
        assert_eq!(format_ms(62_050.0), "1:02.05");
    }
}
