//! 네이티브 화면 스크린샷(화면 밖에 그려 투명 바탕 PNG로). 앱 창을 띄우지 않아 사용자 화면을 건드리지 않는다.
//!
//!   cargo run --release --bin cubie-shot -- <폴더> [한 변 pt, 기본 96] [배율, 기본 2]
//!
//! 장면 셋: `native-solved.png`(맞춘 큐브, 떠 있을 때), `native-scrambled.png`(섞인 큐브, 씨앗 7),
//! `native-turning.png`(섞인 큐브에서 R을 반쯤 돌린 때). 바탕 넷에 얹은 비교판은 docs/52 5-2의 명령으로 만든다.

use std::path::PathBuf;

use cube_core::{parse_moves, solved_cube};
use cubie_native::game::Game;
use cubie_native::png::encode_rgba;
use cubie_native::render::Renderer;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let out = PathBuf::from(args.first().expect("폴더를 준다"));
    let side: f32 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(96.0);
    let scale: f32 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(2.0);
    std::fs::create_dir_all(&out).expect("폴더");
    let px = (side * scale).round() as u32;
    let mut r = Renderer::offscreen(px, px, scale).expect("그래픽 장치");

    let save = |name: &str, rgba: Vec<u8>| {
        let path = out.join(name);
        std::fs::write(&path, encode_rgba(px, px, &rgba)).expect("쓰기");
        println!("{}", path.display());
    };

    save("native-solved.png", r.capture(3, &solved_cube(3), None));
    let mut g = Game::new(3);
    g.scramble(7);
    save("native-scrambled.png", r.capture(3, g.state(), None));
    let m = parse_moves(3, "R").unwrap()[0];
    save(
        "native-turning.png",
        r.capture(3, g.state(), Some((m, 0.5))),
    );
}
