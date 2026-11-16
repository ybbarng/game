//! Cubie 홈 시연 한 판(`fixtures/hero-show.json`·`hero-show-big.json`·`hero-show-yau.json`, 사이트
//! `apps/web/src/cube/native/core-fixtures-hero.ts` `buildHeroShow`·`buildHeroShowBig`·`buildHeroShowYau`): 해법(사이트 `HERO_METHODS` 전부)
//! × 씨앗 → 섞기·쥐는 방향, 풀이의 보여 주기 변환, 연출 걸음. 어긋난 사례는 모두 모아 찍는다.

mod json;

use cube_core::hero_show::{
    hero_timing, orient_for_solve, orient_steps, random_scramble, scramble_steps, solve_for_hero,
    solve_steps, HeroMethod,
};
use cube_core::rng::Rng;
use cube_core::solved_cube;
use cube_core::state::apply_alg;
use json::Json;

fn nums(j: &Json) -> Vec<f64> {
    j.arr().iter().map(Json::num).collect()
}

#[test]
fn hero_show_matches_site() {
    check(include_str!("../fixtures/hero-show.json"));
}

#[test]
fn hero_show_big_matches_site() {
    check(include_str!("../fixtures/hero-show-big.json"));
}

#[test]
fn hero_show_yau_matches_site() {
    check(include_str!("../fixtures/hero-show-yau.json"));
}

/// 해법마다 한 판 계산 시간(앱이 시연 풀이를 만드는 데 드는 시간). 평소 시험에서는 건너뛴다:
/// `cargo test --release --test hero_show -- --ignored --nocapture`
#[test]
#[ignore]
fn hero_show_timing() {
    use cube_core::hero_show::hero_show;
    for (k, method) in HeroMethod::all().into_iter().enumerate() {
        let mut times = vec![];
        // 해법마다 다른 씨앗(축소법 기억이 앞 해법의 판을 재사용하지 않게)
        for seed in (1..=5u32).map(|s| s + 100 * k as u32) {
            let mut rng = Rng::new(seed);
            let t0 = std::time::Instant::now();
            hero_show(method, &mut || rng.next_float()).expect("한 판");
            times.push(t0.elapsed().as_secs_f64() * 1000.0);
        }
        times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!(
            "{} 가운데 {:.1}ms · 가장 오래 {:.1}ms",
            method.id(),
            times[2],
            times[4]
        );
    }
}

fn check(text: &str) {
    let cases = json::parse(text).get("cases").arr().to_vec();
    let mut bad: Vec<String> = vec![];
    for c in &cases {
        let method = HeroMethod::from_id(c.get("method").str()).expect("해법");
        let seed = c.get("seed").num() as u32;
        let n = method.size();
        assert_eq!(n, c.get("size").num() as usize);
        let t = hero_timing(n);
        let what = format!("{} 씨앗 {seed}", method.id());
        let mut check = |name: &str, have: String, want: String| {
            if have != want {
                bad.push(format!(
                    "{what} {name}\n    코어: {have}\n    사이트: {want}"
                ));
            }
        };
        let mut rng = Rng::new(seed);
        let scramble = random_scramble(&mut || rng.next_float(), t.scramble_length, n);
        check("섞기", scramble.join(" "), c.get("scramble").str().into());
        let mut state = apply_alg(n, &solved_cube(n), &scramble.join(" ")).expect("섞기");
        let orient = orient_for_solve(n, &state);
        check("방향", orient.join(" "), c.get("orient").str().into());
        if !orient.is_empty() {
            state = apply_alg(n, &state, &orient.join(" ")).expect("방향");
        }
        let solve = match solve_for_hero(method, &state) {
            Ok(s) => s,
            Err(e) => {
                bad.push(format!("{what}: 풀지 못함 {e}"));
                continue;
            }
        };
        let p = &solve.presented;
        check(
            "첫 면 색",
            solve.first.to_string(),
            (c.get("first").num() as usize).to_string(),
        );
        check("수", p.moves.join(" "), c.get("moves").str().into());
        let stages: Vec<String> = p
            .stages
            .iter()
            .zip(&solve.labels)
            .map(|((name, s, e), l)| format!("{name}/{l}/{s}/{e}"))
            .collect();
        let want_stages: Vec<String> = c
            .get("stages")
            .arr()
            .iter()
            .map(|s| {
                let a = s.arr();
                format!(
                    "{}/{}/{}/{}",
                    a[0].str(),
                    a[1].str(),
                    a[2].num(),
                    a[3].num()
                )
            })
            .collect();
        check("단계", format!("{stages:?}"), format!("{want_stages:?}"));
        let f = |v: &[usize]| format!("{:?}", v.iter().map(|&x| x as f64).collect::<Vec<_>>());
        check(
            "살피는 자리",
            f(&p.looks),
            format!("{:?}", nums(c.get("looks"))),
        );
        check(
            "찾는 돌리기",
            f(&p.searches),
            format!("{:?}", nums(c.get("searches"))),
        );
        check(
            "쉬는 자리",
            f(&p.gaps),
            format!("{:?}", nums(c.get("gaps"))),
        );
        let marks: Vec<String> = p
            .marks
            .iter()
            .map(|(at, m)| {
                let ids: Vec<String> = m.stickers.iter().map(|s| s.to_string()).collect();
                format!(
                    "{at} {} {} {} {}",
                    m.kind.id(),
                    u8::from(m.solo),
                    u8::from(m.check),
                    ids.join(",")
                )
            })
            .collect();
        let want_marks: Vec<String> = c
            .get("marks")
            .arr()
            .iter()
            .map(|m| {
                let a = m.arr();
                format!(
                    "{} {} {} {} {}",
                    a[0].num(),
                    a[1].str(),
                    a[2].num(),
                    a[3].num(),
                    a[4].str()
                )
            })
            .collect();
        check("강조", marks.join("\n"), want_marks.join("\n"));
        let mut steps = scramble_steps(&scramble, method.label(), &t);
        steps.extend(orient_steps(&orient, method.label(), &t));
        steps.extend(solve_steps(&solve, method.label(), &t));
        let labels: Vec<&str> = c.get("labels").arr().iter().map(Json::str).collect();
        let have: Vec<String> = steps
            .iter()
            .map(|s| {
                format!(
                    "{} {} {} {}",
                    s.mv.as_deref().unwrap_or(""),
                    s.ms,
                    s.label,
                    s.marks
                )
            })
            .collect();
        let want: Vec<String> = c
            .get("steps")
            .arr()
            .iter()
            .map(|s| {
                let a = s.arr();
                format!(
                    "{} {} {} {}",
                    a[0].str(),
                    a[1].num(),
                    labels[a[2].num() as usize],
                    a[3].num()
                )
            })
            .collect();
        check("걸음", have.join("\n"), want.join("\n"));
    }
    println!(
        "홈 시연 한 판: 사례 {}개, 어긋남 {}개",
        cases.len(),
        bad.len()
    );
    assert!(!cases.is_empty());
    assert!(
        bad.is_empty(),
        "어긋남 {}개\n{}",
        bad.len(),
        bad.iter().take(6).cloned().collect::<Vec<_>>().join("\n")
    );
}
