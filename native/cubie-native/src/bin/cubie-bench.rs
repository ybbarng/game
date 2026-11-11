//! 그리기 메모리 실험(docs/52 5-2): 화면 밖에서 초당 `fps`장으로 `seconds`초 동안 큐브를 돌리며 그리고, 시작·중간·끝과
//! 멈춘 뒤의 이 프로세스 메모리(footprint)를 찍는다. 앱 창을 띄우지 않는다.
//!
//!   cargo run --release --bin cubie-bench -- [초, 기본 10] [fps, 기본 60] [모드]
//!
//! 모드: `turn`(기본, 수마다 돌리기) · `still`(같은 장면을 계속 다시 그림) · `wait`(장마다 GPU가 끝날 때까지 기다림) · `keys`(앱 재기처럼 0.12초마다 한 수)
//! · `release`(그리개를 놓았다 다시 만들기: 아낀 메모리와 첫 장까지 걸린 시간, 앞 두 인자는 무시)

use std::process::Command;
use std::time::{Duration, Instant};

use cube_core::parse_moves;
use cubie_native::game::Game;
use cubie_native::render::Renderer;

fn footprint() -> String {
    let out = Command::new("footprint")
        .args(["-p", &std::process::id().to_string(), "-f", "bytes"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
    let total = out
        .lines()
        .find(|l| l.contains("phys_footprint:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse::<f64>().ok())
        .map(|b| b / 1048576.0)
        .unwrap_or(0.0);
    let peak = out
        .lines()
        .find(|l| l.contains("phys_footprint_peak:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse::<f64>().ok())
        .map(|b| b / 1048576.0)
        .unwrap_or(0.0);
    let gfx = out
        .lines()
        .find(|l| l.contains("IOAccelerator (graphics)"))
        .map(|l| l.split_whitespace().take(3).collect::<Vec<_>>().join(" "))
        .unwrap_or_default();
    format!("{total:.1} MB, 최고 {peak:.1} MB (graphics: {gfx})")
}

/// 장치 놓기 실험(docs/52 5-3): 한 장 그리고 쉰 뒤 → 그리개(장치·버퍼·텍스처)를 놓은 뒤 → 다시 만들어 첫 장을 그리기까지
/// 걸린 시간. 앱에서 「가만히 N초 뒤 장치를 놓고 다음 키에 다시 만들기」를 하면 얻는 것과 첫 수 지연을 본다
fn release_trial() {
    let g = Game::new(3);
    let mut r = Renderer::offscreen(192, 192, 2.0).expect("장치");
    let _ = r.draw(3, g.state(), None);
    r.wait_idle();
    println!("첫 장 바로 뒤 {}", footprint());
    std::thread::sleep(Duration::from_secs(4));
    println!("한 장 그리고 4초 {}", footprint());
    drop(r);
    std::thread::sleep(Duration::from_secs(3));
    println!("그리개 놓고 3초 {}", footprint());
    for round in 1..=3 {
        let t = Instant::now();
        let mut r = Renderer::offscreen(192, 192, 2.0).expect("장치");
        let made = t.elapsed();
        let _ = r.draw(3, g.state(), None);
        r.wait_idle();
        println!(
            "다시 만들기 {round}: 장치·준비 {:.1}ms, 첫 장까지 {:.1}ms {}",
            made.as_secs_f64() * 1000.0,
            t.elapsed().as_secs_f64() * 1000.0,
            footprint()
        );
        drop(r);
        std::thread::sleep(Duration::from_secs(3));
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let seconds: f64 = args.first().and_then(|s| s.parse().ok()).unwrap_or(10.0);
    let fps: f64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(60.0);
    let mode = args.get(2).map(String::as_str).unwrap_or("turn");
    if mode == "release" {
        release_trial();
        return;
    }
    let mut r = Renderer::offscreen(192, 192, 2.0).expect("장치");
    let mut g = Game::new(3);
    g.scramble(3);
    let r_move = parse_moves(3, "R").unwrap()[0];
    println!("시작 {}", footprint());
    // 넷째 인자: 첫 장을 그린 뒤 쉬는 초(앱은 켠 뒤 한참 있다가 돌린다)
    if let Some(idle) = args.get(3).and_then(|s| s.parse::<f64>().ok()) {
        let _ = r.draw(3, g.state(), None);
        std::thread::sleep(Duration::from_secs_f64(idle));
        println!("첫 장 뒤 {idle}초 쉼 {}", footprint());
    }
    let t0 = Instant::now();
    let mut frames = 0u64;
    let mut next_key = 0.0;
    let mut next_report = 1.0;
    while t0.elapsed().as_secs_f64() < seconds {
        let now = t0.elapsed().as_secs_f64() * 1000.0;
        match mode {
            "still" => {
                let _ = r.draw(3, g.state(), Some((r_move, 0.3)));
            }
            "keys" => {
                // 앱 재기처럼 0.12초마다 한 수, 그릴 것이 있을 때만 그린다
                if now >= next_key {
                    g.play(r_move);
                    next_key += 120.0;
                }
                if g.needs_frame() {
                    let turning = g.frame(now);
                    let _ = r.draw(3, g.shown(), turning);
                }
            }
            _ => {
                if !g.needs_frame() || g.frame(now).is_none() {
                    g.play(r_move);
                }
                let turning = g.frame(now);
                let _ = r.draw(3, g.shown(), turning);
                if mode == "wait" {
                    r.wait_idle();
                }
            }
        }
        frames += 1;
        if t0.elapsed().as_secs_f64() >= next_report {
            println!("{:>4.0}초 {frames}장 {}", next_report, footprint());
            next_report += (seconds / 4.0).max(1.0);
        }
        std::thread::sleep(Duration::from_secs_f64(1.0 / fps));
    }
    println!("끝 {frames}장 {}", footprint());
    std::thread::sleep(Duration::from_secs(3));
    println!("멈추고 3초 {}", footprint());
}
