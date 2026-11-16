//! Cubie 공식 연습(docs/47 16-11, docs/52 5-6): 코어 진행기(`cube_core::practice::PracticeSession`, 사이트와 공통 시험
//! 자료로 어긋남 0)를 한 판([`Game`])에 붙인다. 연습하는 동안 키는 진행기로 가고, 받은 수만 장면에 넣는다(틀린 수는
//! 넣지 않고 그 수의 키를 잠깐 보인다). 말풍선 줄은 사이트 `mini/practice.ts` `practiceBubbleLines`와 같은 글이다.

use cube_core::keys::{keycap_label, keys_for_move, Command, KeyInput, KeyResult, Keymap};
use cube_core::mask::{mask_at_slots, mask_for, Visibility};
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

/// 말풍선 낱말 하나를 「꼴:글」로(앱 `bubbleLine`이 0x1f로 나눠 읽는다)
fn span(style: &str, text: &str) -> String {
    format!("{style}:{text}")
}

/// 수 하나의 키 낱말(사이트 `mini/key-spans.ts` `moveKeySpans`, docs/47 4-4 「수 표기와 키」): 키마다 키캡(key),
/// 같은 키는 빈칸으로 나란히, 다른 키로 넘어가면 차례 화살(arrow). 키가 없으면 「?」
pub fn move_key_spans(keymap: &Keymap, n: usize, notation: &str) -> Vec<String> {
    let Some(keys) = keys_for_move(keymap, n, notation).filter(|k| !k.is_empty()) else {
        return vec![span("plain", "?")];
    };
    let labels: Vec<String> = keys.iter().map(keycap_label).collect();
    let mut out = Vec::new();
    for (i, l) in labels.iter().enumerate() {
        if i > 0 {
            out.push(if labels[i - 1] == *l {
                span("plain", " ")
            } else {
                span("arrow", " → ")
            });
        }
        out.push(span("key", l));
    }
    out
}

/// 공식의 수마다 키 낱말을 「 · 」로 잇는다(사이트 `algKeySpans`)
pub fn alg_key_spans(keymap: &Keymap, n: usize, alg: &str) -> Vec<String> {
    let mut out = Vec::new();
    for (i, m) in alg.split_whitespace().enumerate() {
        if i > 0 {
            out.push(span("plain", " · "));
        }
        out.extend(move_key_spans(keymap, n, m));
    }
    out
}

/// 낱말들 → 말풍선 줄 끝 두 칸(「글\t낱말들」). 글은 낱말을 이은 것(꼴을 모르는 앱이 그린다)
pub fn spans_fields(spans: &[String]) -> String {
    let text: String = spans
        .iter()
        .map(|s| s.split_once(':').map_or("", |(_, t)| t))
        .collect();
    format!("{text}\t{}", spans.join("\u{1f}"))
}

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

    /// 공식 연습 중이면 그 단계의 가리기를 화면 상태의 자리마다(사이트 미니 `stickersFromState(…, board.mask)`).
    /// 가리지 않는 단계·연습 밖이면 `None`. 값은 코어 [`mask_for`]가 내고 공통 시험 자료(`mask.json`)로 사이트와 견준다
    pub fn shown_mask(&self) -> Option<Vec<Visibility>> {
        let p = self.practice.as_ref()?;
        p.board.as_ref()?;
        let m = mask_for(self.n, p.stage.mask)?;
        Some(mask_at_slots(self.shown(), &m))
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
            // 수 표기(고정폭 글자)와 그 수의 키(키캡 상자)를 갈라 보인다(사이트 `practiceBubbleLines`)
            let mut sp = vec![span("move", token), span("plain", "  ")];
            sp.extend(move_key_spans(self.keymap(), PRACTICE_N, token));
            lines.push(format!("keys\t{}", spans_fields(&sp)));
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
    use cube_core::keys::{preset_keymap, two_hand_keymap, Preset};
    use cube_core::practice::menu_stages;

    // 사이트 `mini/key-spans.test.ts`와 같은 예(docs/47 4-4 「수 표기와 키」)
    #[test]
    fn key_spans_split_moves_and_keycaps() {
        let two = two_hand_keymap();
        let sp = alg_key_spans(&two, 3, "R U' R2");
        assert_eq!(
            sp,
            [
                "key:I",
                "plain: · ",
                "key:F",
                "plain: · ",
                "key:I",
                "plain: ",
                "key:I"
            ]
        );
        assert_eq!(spans_fields(&sp).split('\t').next(), Some("I · F · I I"));
        let sp = alg_key_spans(&preset_keymap(Preset::Notation), 4, "2R");
        assert_eq!(sp, ["key:2", "arrow: → ", "key:R"]);
        assert_eq!(move_key_spans(&two, 3, "Q"), ["plain:?"]);
    }

    #[test]
    fn wrong_move_line_keeps_move_and_keycaps_apart() {
        let mut g = Game::new(3);
        assert!(g.practice_start(menu_stages()[0].id, false, "{}", "", "", 7));
        let want = g.practice.as_ref().unwrap().tokens()[0].clone();
        let other = if want.starts_with('D') { "B" } else { "D" };
        let mv = cube_core::parse_moves(3, other).unwrap()[0];
        g.practice.as_mut().unwrap().input(&mv, 0.0);
        let lines = g.practice_lines("Enter");
        let keys: Vec<&String> = lines.iter().filter(|l| l.starts_with("keys\t")).collect();
        assert_eq!(keys.len(), 1, "{lines:?}");
        let f: Vec<&str> = keys[0].split('\t').collect();
        assert!(f[1].starts_with(&format!("{want}  ")), "{f:?}");
        let spans: Vec<&str> = f[2].split('\u{1f}').collect();
        assert_eq!(spans[0], format!("move:{want}"));
        assert!(spans.iter().any(|s| s.starts_with("key:")), "{spans:?}");
    }

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
        // 첫 단계(십자)는 십자 엣지와 센터만 보인다: 54칸 중 보이는 칸은 십자 엣지 넷 × 2 + 센터 여섯 = 14
        let m = g.shown_mask().expect("십자 단계는 가린다");
        assert_eq!(m.len(), 54);
        assert_eq!(m.iter().filter(|v| **v == Visibility::Visible).count(), 14);
        g.practice_stop();
        assert!(!g.practicing());
        assert!(g.shown_mask().is_none());
        assert!(!Game::new(4).practice_start(stage, false, "", "", "", 1));
        assert_eq!(format_ms(62_050.0), "1:02.05");
    }
}
