//! Cubie 네이티브 화면(docs/52 5-2·5-5): 큐브 코어(`cube-core`)로 키를 수로 바꾸는 한 판과 그 C ABI. 맥 앱은 정적
//! 라이브러리를 링크해 [`ffi_game`]의 C 함수를 부르고 큐브는 Core Animation 층 트리로 그린다(5-5).
//! 기능 `wgpu`를 켜면 5-2 시제품의 wgpu(Metal) 그리기([`render`], [`ffi`])도 들어온다(스크린샷·벤치 도구, 앱은 쓰지 않음).
//!
//! | 모듈 | 하는 일 |
//! |---|---|
//! | [`game`] | 한 판: 키 → 수, 섞기, 되돌리기, 맞춤 판정, 돌리는 연출 줄(시간은 밖에서 넣는다) |
//! | [`scene`] | 조각·스티커 모양, 상태 → 인스턴스, 카메라(사이트 생김새 값) |
//! | [`render`] | wgpu 그리기(장면 + 실루엣 윤곽), 창 또는 화면 밖 |
//! | [`practice`] | 공식 연습: 코어 진행기를 한 판에 붙이기, 말풍선 줄(사이트 `practiceBubbleLines`) |
//! | [`json`] | 작은 JSON 읽기·쓰기(연습 기록·내 공식, 사이트와 같은 꼴) |
//! | [`keycode`] | 맥 키 코드 → `KeyboardEvent.code` |
//! | [`ffi_game`] | 앱이 부르는 한 판 C ABI(그리기 없음) |
//! | [`ffi_records`] | 기록 계산 C ABI(Ao5·최고 Ao5·티어, 코어 `tier.rs`) |
//! | [`ffi`] | wgpu 그리기 C ABI(기능 `wgpu`) |
//! | [`png`] | 스크린샷 PNG 쓰기(기능 `wgpu`) |
//!
//! 이 크레이트는 CI에서 시험하지 않는다(기능 `wgpu`는 Metal이 있는 맥에서만 돈다). CI는 의존 없는 코어만 본다.
//! 기능 없이 `cargo test`면 한 판·C ABI·장면 계산만, `cargo test --release --features wgpu`면 그리기 시험까지 돈다.

#[cfg(feature = "wgpu")]
pub mod ffi;
pub mod ffi_game;
pub mod ffi_records;
pub mod game;
pub mod json;
pub mod keycode;
pub mod math;
#[cfg(feature = "wgpu")]
pub mod png;
pub mod practice;
#[cfg(feature = "wgpu")]
pub mod render;
pub mod scene;
