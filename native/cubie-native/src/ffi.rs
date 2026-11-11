//! Swift 앱이 부르는 C ABI. 머리 파일은 손으로 쓴 `apps/cubie/Sources/CubieNativeC/include/cubie_native.h`이고,
//! 여기 함수와 하나씩 맞아야 한다(이름·인자·돌려주는 값). 모든 함수는 주 스레드에서만 부른다.

use std::ffi::c_void;

use crate::game::{Game, Outcome};
use crate::keycode::mac_key_code;
use crate::render::{Renderer, DRAW_OCCLUDED};
use cube_core::keys::KeyInput;

/// 큐브 화면 하나(한 판 + 그리개)
pub struct CubieView {
    game: Game,
    renderer: Renderer,
    /// 실제로 그려 내보낸 장 수와 그리지 못한 장 수·마지막 까닭(재기·확인용)
    drawn: u64,
    failed: u64,
    last_failure: i32,
}

pub const KEY_IGNORED: i32 = 0;
pub const KEY_CONSUMED: i32 = 1;
pub const KEY_MOVED: i32 = 2;
pub const KEY_SOLVED: i32 = 3;
pub const KEY_SCRAMBLED: i32 = 4;
pub const KEY_RESET: i32 = 5;

pub const FLAG_SHIFT: u32 = 1;
pub const FLAG_ALT: u32 = 2;
pub const FLAG_CTRL: u32 = 4;
pub const FLAG_CMD: u32 = 8;
pub const FLAG_REPEAT: u32 = 16;

/// `CAMetalLayer` 하나에 3×3 큐브 화면을 만든다. 실패하면 NULL
///
/// # Safety
/// `layer`는 살아 있는 `CAMetalLayer`이고 [`cubie_view_free`]까지 살아 있어야 한다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_new(
    layer: *mut c_void,
    width_px: u32,
    height_px: u32,
    scale: f64,
) -> *mut CubieView {
    if layer.is_null() {
        return std::ptr::null_mut();
    }
    match unsafe { Renderer::for_layer(layer, width_px, height_px, scale as f32) } {
        Ok(renderer) => Box::into_raw(Box::new(CubieView {
            game: Game::new(3),
            renderer,
            drawn: 0,
            failed: 0,
            last_failure: 0,
        })),
        Err(e) => {
            eprintln!("[cubie-native] {e}");
            std::ptr::null_mut()
        }
    }
}

/// 창 없이 화면 밖 텍스처에 그리는 화면(재기 모드: 화면 밖 창은 wgpu가 가려진 창으로 보고 그릴 곳을 내주지 않아,
/// 같은 그리기를 텍스처에 한다. 내보내기만 빠진다). 실패하면 NULL
#[no_mangle]
pub extern "C" fn cubie_view_new_offscreen(
    width_px: u32,
    height_px: u32,
    scale: f64,
) -> *mut CubieView {
    match Renderer::offscreen(width_px, height_px, scale as f32) {
        Ok(renderer) => Box::into_raw(Box::new(CubieView {
            game: Game::new(3),
            renderer,
            drawn: 0,
            failed: 0,
            last_failure: 0,
        })),
        Err(e) => {
            eprintln!("[cubie-native] {e}");
            std::ptr::null_mut()
        }
    }
}

/// # Safety
/// `view`는 [`cubie_view_new`]가 돌려준 값이거나 NULL이고, 한 번만 부른다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_free(view: *mut CubieView) {
    if !view.is_null() {
        drop(unsafe { Box::from_raw(view) });
    }
}

/// # Safety
/// `view`는 살아 있는 화면이어야 한다(아래 함수 모두 같다).
#[no_mangle]
pub unsafe extern "C" fn cubie_view_resize(
    view: *mut CubieView,
    width_px: u32,
    height_px: u32,
    scale: f64,
) {
    let v = unsafe { &mut *view };
    v.renderer.resize(width_px, height_px, scale as f32);
    v.game.invalidate();
}

/// 맥 키 누름 하나(`NSEvent.keyCode`, 조합 키 `FLAG_*`). `seed`는 Enter(섞기)에 쓴다. 돌려주는 값은 `KEY_*`
///
/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_key(
    view: *mut CubieView,
    key_code: u16,
    flags: u32,
    seed: u32,
) -> i32 {
    let v = unsafe { &mut *view };
    let Some(code) = mac_key_code(key_code) else {
        return KEY_IGNORED;
    };
    let input = KeyInput {
        code,
        shift: flags & FLAG_SHIFT != 0,
        alt: flags & FLAG_ALT != 0,
        ctrl: flags & FLAG_CTRL != 0,
        meta: flags & FLAG_CMD != 0,
        repeat: flags & FLAG_REPEAT != 0,
    };
    match v.game.key(&input, seed) {
        Outcome::Ignored => KEY_IGNORED,
        Outcome::Consumed => KEY_CONSUMED,
        Outcome::Moved { solved: true, .. } => KEY_SOLVED,
        Outcome::Moved { .. } => KEY_MOVED,
        Outcome::Scrambled { .. } => KEY_SCRAMBLED,
        Outcome::Reset => KEY_RESET,
    }
}

/// 코어 섞기(같은 씨앗이면 사이트와 같은 섞기)
///
/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_scramble(view: *mut CubieView, seed: u32) {
    let v = unsafe { &mut *view };
    v.game.scramble(seed);
}

/// 그릴 것이 있나(돌리는 중이거나 다시 그려야 함). 없으면 앱은 화면 갱신을 멈춘다
///
/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_needs_frame(view: *const CubieView) -> bool {
    unsafe { &*view }.game.needs_frame()
}

/// 다음에 한 장 다시 그리게 한다(창이 다시 보일 때)
///
/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_invalidate(view: *mut CubieView) {
    unsafe { &mut *view }.game.invalidate();
}

/// 시각 `now_ms`의 화면을 한 장 그린다. 그 뒤에도 그릴 것이 남았으면 true
///
/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_render(view: *mut CubieView, now_ms: f64) -> bool {
    let v = unsafe { &mut *view };
    let turning = v.game.frame(now_ms);
    let n = v.game.n;
    if let Err(why) = v.renderer.draw(n, v.game.shown(), turning) {
        v.failed += 1;
        v.last_failure = why;
        // 그릴 곳을 얻지 못했으면 다음에 다시 그린다. 가려진 창이면 갱신을 멈추고(헛돌지 않게) 다시 보일 때
        // 앱이 cubie_view_invalidate로 깨운다
        v.game.invalidate();
        if why == DRAW_OCCLUDED {
            return false;
        }
    } else {
        v.drawn += 1;
    }
    v.game.needs_frame()
}

/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_is_solved(view: *const CubieView) -> bool {
    unsafe { &*view }.game.is_solved()
}

/// 섞은 뒤 둔 수
///
/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_move_count(view: *const CubieView) -> u32 {
    unsafe { &*view }.game.move_count() as u32
}

/// 실제로 그려 내보낸 장 수(재기·확인용)
///
/// # Safety
/// [`cubie_view_resize`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_frames_drawn(view: *const CubieView) -> u64 {
    unsafe { &*view }.drawn
}

/// 그리지 못한 장 수. `last`에 마지막 까닭(1 그릴 곳 없음·2 시간 초과·3 가려짐·4 설정 낡음·5 그 밖)을 적는다
///
/// # Safety
/// [`cubie_view_resize`]와 같다. `last`는 NULL이거나 쓸 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_view_frames_failed(view: *const CubieView, last: *mut i32) -> u64 {
    let v = unsafe { &*view };
    if !last.is_null() {
        unsafe { *last = v.last_failure };
    }
    v.failed
}
