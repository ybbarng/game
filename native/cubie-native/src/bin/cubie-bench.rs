//! 그리기 메모리 실험(docs/52 5-2): 화면 밖에서 초당 `fps`장으로 `seconds`초 동안 큐브를 돌리며 그리고, 시작·중간·끝과
//! 멈춘 뒤의 이 프로세스 메모리(footprint)를 찍는다. 앱 창을 띄우지 않는다.
//!
//!   cargo run --release --bin cubie-bench -- [초, 기본 10] [fps, 기본 60] [모드]
//!
//! 모드: `turn`(기본, 수마다 돌리기) · `still`(같은 장면을 계속 다시 그림) · `wait`(장마다 GPU가 끝날 때까지 기다림)

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
    let gfx = out
        .lines()
        .find(|l| l.contains("IOAccelerator (graphics)"))
        .map(|l| l.split_whitespace().take(3).collect::<Vec<_>>().join(" "))
        .unwrap_or_default();
    format!("{total:.1} MB (graphics: {gfx})")
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let seconds: f64 = args.first().and_then(|s| s.parse().ok()).unwrap_or(10.0);
    let fps: f64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(60.0);
    let mode = args.get(2).map(String::as_str).unwrap_or("turn");
    let mut r = Renderer::offscreen(192, 192, 2.0).expect("장치");
    let mut g = Game::new(3);
    g.scramble(3);
    let r_move = parse_moves(3, "R").unwrap()[0];
    println!("시작 {}", footprint());
    let t0 = Instant::now();
    let mut frames = 0u64;
    let mut next_report = 1.0;
    while t0.elapsed().as_secs_f64() < seconds {
        let now = t0.elapsed().as_secs_f64() * 1000.0;
        match mode {
            "still" => {
                let _ = r.draw(3, g.state(), Some((r_move, 0.3)));
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
