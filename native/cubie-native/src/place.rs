//! Cubie 상황 놓기(docs/47 16-24): 마지막 층 상황 하나(코어 `practice::place_case`, 사이트 `practice/place.ts`와 같은 값)를
//! 한 판([`Game`])에 둔다. 맞추던 판은 기록 없이 끝나고(맞춘 상태로와 같다), 놓은 뒤에는 채점·시간·기록 없이 마음대로
//! 돌린다(코어 세션은 「마음대로」 단계라 다 맞춰도 기록이 생기지 않는다). 섞기·맞춘 상태로·다른 상황을 놓으면 끝난다.
//! 말풍선 줄은 상황 이름, 펼치면(힌트 키) 공식(고정폭 글자)과 그 키(키캡 상자, docs/47 4-4 「수 표기와 키」).

use cube_core::practice::{alg_tokens, place_case, place_stages, PRACTICE_N};

use crate::game::Game;
use crate::json;
use crate::practice::{alg_key_spans, spans_fields};

/// 놓은 상황(앱 메뉴 체크 표시·말풍선)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Placed {
    pub stage: &'static str,
    pub case: &'static str,
    /// 말풍선 제목(「PLL · T 퍼뮤」처럼 단계 이름 · 상황 이름)
    pub title: String,
    /// 보일 공식 낱말(괄호를 뺀 것)
    pub tokens: Vec<String>,
    /// 공식을 펼쳤나
    pub revealed: bool,
}

/// 상황 놓기 메뉴: 줄마다 「단계 id\t단계 이름\t상황 id\t상황 이름\t모양 묶음(없으면 빈칸)」
pub fn place_menu_lines() -> Vec<String> {
    place_stages()
        .iter()
        .flat_map(|s| {
            s.cases.iter().map(move |c| {
                format!(
                    "{}\t{}\t{}\t{}\t{}",
                    s.id,
                    s.title,
                    c.id,
                    c.name,
                    c.group.unwrap_or("")
                )
            })
        })
        .collect()
}

impl Game {
    /// 상황 하나를 놓는다(3×3, 공식 연습 밖에서만). 내 공식은 사이트와 같은 JSON(`cube.algs.v1`). 못 놓으면 false
    pub fn place(&mut self, stage: &str, case: &str, alg_book: &str) -> bool {
        if self.n != PRACTICE_N || self.practicing() {
            return false;
        }
        let Some(p) = place_case(stage, case, self.keymap(), &json::alg_book(alg_book)) else {
            return false;
        };
        // 맞추던 판은 기록 없이 끝난다(맞춘 상태로와 같다)
        self.reset();
        self.jump_to(p.start);
        self.placed = Some(Placed {
            stage: p.stage.id,
            case: p.case.id,
            title: format!("{} · {}", p.stage.title, p.case.name),
            tokens: alg_tokens(&p.alg),
            revealed: false,
        });
        true
    }

    pub fn placed(&self) -> Option<&Placed> {
        self.placed.as_ref()
    }

    /// 공식 펼치기·접기(힌트 키). 놓은 상황이 없으면 false, 있으면 펼친 뒤의 상태
    pub fn place_reveal(&mut self) -> bool {
        match self.placed.as_mut() {
            Some(p) => {
                p.revealed = !p.revealed;
                p.revealed
            }
            None => false,
        }
    }

    /// 말풍선 줄(공식 연습 줄과 같은 꼴 「꼴\t글[\t낱말들]」): 제목, 펼쳤으면 공식 줄과 키 줄
    pub fn place_lines(&self) -> Vec<String> {
        let Some(p) = &self.placed else {
            return vec![];
        };
        let mut lines = vec![format!("title\t{}", p.title)];
        if p.revealed {
            let alg = p.tokens.join(" ");
            lines.push(format!("alg\t{alg}"));
            lines.push(format!(
                "keys\t{}",
                spans_fields(&alg_key_spans(self.keymap(), PRACTICE_N, &alg))
            ));
        }
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cube_core::keys::KeyInput;
    use cube_core::practice::{case_start, stage_by_id};
    use cube_core::{parse_moves, solved_cube};

    fn key(code: &str) -> KeyInput<'_> {
        KeyInput {
            code,
            ..Default::default()
        }
    }

    #[test]
    fn placing_a_case_shows_its_start_and_drops_the_solve_without_record() {
        let mut g = Game::new(3);
        g.set_now(0.0);
        g.scramble(42);
        assert!(g.solving());
        g.set_now(300.0);
        g.key(&key("KeyI"), 0);
        assert!(g.place("pll", "pll-t", "{}"));
        let stage = stage_by_id("pll").unwrap();
        let case = stage.case("pll-t").unwrap();
        assert_eq!(g.state(), &case_start(stage, case, ""));
        assert_eq!(g.shown(), g.state());
        assert!(!g.solving() && !g.is_scrambled());
        assert_eq!(g.move_count(), 0);
        assert!(g.take_record().is_none());
        assert_eq!(
            g.placed().map(|p| (p.stage, p.case)),
            Some(("pll", "pll-t"))
        );
        assert_eq!(g.place_lines(), ["title\tPLL · T 퍼뮤"]);
    }

    #[test]
    fn solving_the_placed_case_leaves_no_record() {
        let mut g = Game::new(3);
        assert!(g.place("oll", "oll-21", "{}"));
        let alg = g.placed().unwrap().tokens.join(" ");
        let mut t = 0.0;
        for m in parse_moves(3, &alg).unwrap() {
            t += 200.0;
            g.set_now(t);
            g.key_move_for_test(m);
        }
        // 마지막 층 모양이 풀렸지만(윗면 돌리기·PLL이 남을 수 있다) 기록은 없다
        assert!(g.take_record().is_none());
        // 큐브를 다 맞춰도 마찬가지(맞춘 상태로 뒤 돌린 것과 같다)
        g.reset();
        g.key(&key("KeyI"), 0);
        g.key(&key("KeyK"), 0);
        assert!(g.is_solved());
        assert!(g.take_record().is_none());
    }

    #[test]
    fn hint_key_reveals_the_alg_as_moves_and_keycaps() {
        let mut g = Game::new(3);
        assert!(g.place("pll", "pll-t", "{}"));
        assert!(g.place_reveal());
        let lines = g.place_lines();
        assert_eq!(lines.len(), 3, "{lines:?}");
        let alg = g.placed().unwrap().tokens.join(" ");
        assert_eq!(lines[1], format!("alg\t{alg}"));
        let keys: Vec<&str> = lines[2].split('\t').collect();
        assert_eq!(keys[0], "keys");
        assert!(keys[2]
            .split('\u{1f}')
            .all(|s| s.starts_with("key:") || s.starts_with("plain:") || s.starts_with("arrow:")));
        assert!(keys[2].contains("key:I"), "{keys:?}");
        assert!(!g.place_reveal());
        assert_eq!(g.place_lines().len(), 1);
    }

    #[test]
    fn scramble_reset_and_other_sizes_end_or_refuse_placing() {
        let mut g = Game::new(3);
        assert!(g.place("2look-oll", g_first_case("2look-oll"), "{}"));
        g.scramble(1);
        assert!(g.placed().is_none());
        assert!(g.place("pll", "pll-t", "{}"));
        g.key(
            &KeyInput {
                code: "Enter",
                shift: true,
                ..Default::default()
            },
            0,
        );
        assert!(g.placed().is_none());
        assert_eq!(g.state(), &solved_cube(3));
        assert!(!Game::new(4).place("pll", "pll-t", "{}"));
        assert!(!g.place("f2l", "f2l-1", "{}"));
        let mut p = Game::new(3);
        assert!(p.practice_start("pll", false, "{}", "", "", 1));
        assert!(!p.place("pll", "pll-t", "{}"));
    }

    fn g_first_case(stage: &str) -> &'static str {
        stage_by_id(stage).unwrap().cases[0].id
    }

    #[test]
    fn menu_lists_every_case_of_the_four_stages() {
        let lines = place_menu_lines();
        let total: usize = place_stages().iter().map(|s| s.cases.len()).sum();
        assert_eq!(lines.len(), total);
        assert!(
            lines.contains(&"pll\tPLL\tpll-t\tT 퍼뮤\tadjacent".to_string()),
            "{:?}",
            &lines[..3]
        );
        assert!(lines[0].starts_with("2look-oll\t2단계 OLL\t"));
    }
}
