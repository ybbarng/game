//! Cubie 네이티브 화면(docs/52 5절 3단계 「맥 시제품」): 큐브 코어(`cube-core`)로 키를 수로 바꾸고, wgpu(Metal)로
//! 3×3 큐브를 그린다. 맥 앱은 정적 라이브러리를 링크해 [`ffi`]의 C 함수를 부른다.
//!
//! | 모듈 | 하는 일 |
//! |---|---|
//! | [`game`] | 한 판: 키 → 수, 섞기, 되돌리기, 맞춤 판정, 돌리는 연출 줄(시간은 밖에서 넣는다) |
//! | [`scene`] | 조각·스티커 모양, 상태 → 인스턴스, 카메라(사이트 생김새 값) |
//! | [`render`] | wgpu 그리기(장면 + 실루엣 윤곽), 창 또는 화면 밖 |
//! | [`keycode`] | 맥 키 코드 → `KeyboardEvent.code` |
//! | [`ffi`] | Swift가 부르는 C ABI |
//! | [`png`] | 스크린샷 PNG 쓰기 |
//!
//! 이 크레이트는 CI에서 시험하지 않는다(Metal이 있는 맥에서만 돈다). CI는 의존 없는 코어만 본다.

pub mod ffi;
pub mod game;
pub mod keycode;
pub mod math;
pub mod png;
pub mod render;
pub mod scene;
