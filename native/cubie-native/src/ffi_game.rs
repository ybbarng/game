//! 그리기 없는 한 판의 C ABI(docs/52 5-5, Core Animation 그리기). 앱이 층 트리로 큐브를 그리고, 여기서는 키 → 수,
//! 섞기와 섞기 연출 수, 맞춤 판정, 화면 상태의 칸 색만 준다. wgpu를 링크하지 않는다.
//!
//! 머리 파일은 손으로 쓴 `apps/cubie/Sources/CubieNativeC/include/cubie_native.h`이고 여기 함수와 하나씩 맞아야 한다.
//! 모든 함수는 주 스레드에서만 부른다.

use crate::game::{Game, Outcome, ScrambleShow};
use crate::keycode::mac_key_code;
use cube_core::keys::KeyInput;
use cube_core::state::face_colors;
use cube_core::topology::{cube_topology, MAX_SIZE, MIN_SIZE};

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

pub const SHOW_INSTANT: i32 = 0;
pub const SHOW_MOVES: i32 = 1;
pub const SHOW_SPIN: i32 = 2;
pub const SHOW_AUTO: i32 = 3;

/// 돌릴 수 하나(C 구조체 `CubieTurn`과 같은 배치)
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CubieTurn {
    /// 0 x · 1 y · 2 z
    pub axis: i32,
    /// 층 범위(1 = 축의 + 쪽 바깥층)
    pub from: i32,
    pub to: i32,
    /// 축의 + 쪽에서 볼 때 시계 방향 90°의 횟수(1·2·3)
    pub turns: i32,
    /// 돌리는 시간(ms)
    pub ms: f64,
}

/// 한 판
pub struct CubieGame {
    game: Game,
    /// Enter로 섞을 때 쓸 연출
    show: ScrambleShow,
}

/// n×n 한 판(2~7, 벗어나면 3)
#[no_mangle]
pub extern "C" fn cubie_game_new(n: u32) -> *mut CubieGame {
    let n = n as usize;
    let n = if (MIN_SIZE..=MAX_SIZE).contains(&n) {
        n
    } else {
        3
    };
    Box::into_raw(Box::new(CubieGame {
        game: Game::new(n),
        show: ScrambleShow::auto(n),
    }))
}

/// # Safety
/// `g`는 [`cubie_game_new`]가 돌려준 값이거나 NULL이고, 한 번만 부른다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_free(g: *mut CubieGame) {
    if !g.is_null() {
        drop(unsafe { Box::from_raw(g) });
    }
}

/// # Safety
/// `g`는 살아 있는 한 판이어야 한다(아래 함수 모두 같다).
#[no_mangle]
pub unsafe extern "C" fn cubie_game_size(g: *const CubieGame) -> u32 {
    unsafe { &*g }.game.n as u32
}

fn show_of(code: i32, n: usize) -> ScrambleShow {
    match code {
        SHOW_INSTANT => ScrambleShow::Instant,
        SHOW_MOVES => ScrambleShow::Moves,
        SHOW_SPIN => ScrambleShow::Spin,
        _ => ScrambleShow::auto(n),
    }
}

/// Enter로 섞을 때 쓸 연출(`SHOW_*`, 기본 「크기에 맞게」)
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_set_scramble_show(g: *mut CubieGame, show: i32) {
    let g = unsafe { &mut *g };
    g.show = show_of(show, g.game.n);
}

/// 맥 키 누름 하나(`NSEvent.keyCode`, 조합 키 `FLAG_*`). `seed`는 Enter(섞기)에 쓴다. 돌려주는 값은 `KEY_*`
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_key(
    g: *mut CubieGame,
    key_code: u16,
    flags: u32,
    seed: u32,
) -> i32 {
    let g = unsafe { &mut *g };
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
    // Enter 섞기는 정한 연출로(해석기는 섞기 명령만 알린다)
    let show = g.show;
    match g.game.key(&input, seed) {
        Outcome::Ignored => KEY_IGNORED,
        Outcome::Consumed => KEY_CONSUMED,
        Outcome::Moved { solved: true, .. } => KEY_SOLVED,
        Outcome::Moved { .. } => KEY_MOVED,
        Outcome::Scrambled { .. } => {
            if show != ScrambleShow::Instant {
                g.game.scramble_with(seed, show);
            }
            KEY_SCRAMBLED
        }
        Outcome::Reset => KEY_RESET,
    }
}

/// 코어 섞기(같은 씨앗이면 사이트와 같은 섞기)와 연출(`SHOW_*`). 섞기 수 개수를 돌려준다
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_scramble(g: *mut CubieGame, seed: u32, show: i32) -> u32 {
    let g = unsafe { &mut *g };
    let show = show_of(show, g.game.n);
    match g.game.scramble_with(seed, show) {
        Outcome::Scrambled { text } => text.split_whitespace().count() as u32,
        _ => 0,
    }
}

/// 맞춘 상태로
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_reset(g: *mut CubieGame) {
    unsafe { &mut *g }.game.reset();
}

/// 다음에 돌릴 수 하나를 `out`에 꺼낸다(화면 상태에 바로 들어간다). 없으면 false
///
/// # Safety
/// [`cubie_game_size`]와 같다. `out`은 쓸 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_take_turn(g: *mut CubieGame, out: *mut CubieTurn) -> bool {
    let g = unsafe { &mut *g };
    let Some((m, ms)) = g.game.take_turn() else {
        return false;
    };
    if !out.is_null() {
        unsafe {
            *out = CubieTurn {
                axis: m.axis as i32,
                from: m.from as i32,
                to: m.to as i32,
                turns: m.turns as i32,
                ms,
            }
        };
    }
    true
}

/// 줄에 돌릴 수가 남았나
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_has_turns(g: *const CubieGame) -> bool {
    unsafe { &*g }.game.has_turns()
}

/// 섞기 연출 수가 남았으면 바로 끝낸 자리로. 남았던 게 있으면 true
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_finish_show(g: *mut CubieGame) -> bool {
    unsafe { &mut *g }.game.finish_show()
}

/// 스티커 자리 수(6·n²)
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_sticker_count(g: *const CubieGame) -> u32 {
    cube_topology(unsafe { &*g }.game.n).stickers.len() as u32
}

/// 스티커 자리 `i`의 조각 중심(두 배 좌표, x 오른쪽·y 위·z 앞)과 면 방향. 범위 밖이면 false
///
/// # Safety
/// [`cubie_game_size`]와 같다. `pos2`·`normal`은 i32 세 칸을 쓸 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_sticker_slot(
    g: *const CubieGame,
    i: u32,
    pos2: *mut i32,
    normal: *mut i32,
) -> bool {
    let topo = cube_topology(unsafe { &*g }.game.n);
    let Some(s) = topo.stickers.get(i as usize) else {
        return false;
    };
    let p = topo.pieces[s.piece].position;
    for k in 0..3 {
        unsafe {
            *pos2.add(k) = p[k];
            *normal.add(k) = s.normal[k];
        }
    }
    true
}

/// 화면 상태의 칸 색(스티커 자리마다 색 번호 0~5, U R F D L B)을 `out`에 `len`칸까지 쓴다. 쓴 칸 수를 돌려준다
///
/// # Safety
/// [`cubie_game_size`]와 같다. `out`은 `len`바이트를 쓸 수 있는 자리.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_shown_colors(
    g: *const CubieGame,
    out: *mut u8,
    len: u32,
) -> u32 {
    let g = unsafe { &*g };
    let colors = face_colors(g.game.n, g.game.shown());
    let k = colors.len().min(len as usize);
    unsafe { std::ptr::copy_nonoverlapping(colors.as_ptr(), out, k) };
    k as u32
}

/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_is_solved(g: *const CubieGame) -> bool {
    unsafe { &*g }.game.is_solved()
}

/// 섞인 큐브를 맞추는 중인가(거울 판을 보일지)
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_is_scrambled(g: *const CubieGame) -> bool {
    unsafe { &*g }.game.is_scrambled()
}

/// 섞은 뒤 둔 수
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_move_count(g: *const CubieGame) -> u32 {
    unsafe { &*g }.game.move_count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    /// C로 부르는 차례 그대로: 섞고(연출 하나씩), 수를 꺼내 화면 상태가 논리 상태를 따라가는지
    #[test]
    fn c_calls_follow_the_game() {
        unsafe {
            let g = cubie_game_new(3);
            assert_eq!(cubie_game_sticker_count(g), 54);
            let count = cubie_game_scramble(g, 42, SHOW_MOVES);
            assert!(count > 0);
            let mut colors = [0u8; 54];
            cubie_game_shown_colors(g, colors.as_mut_ptr(), 54);
            // 연출 전 화면은 맞춘 모양: 면마다 한 색
            assert!(colors.chunks(9).all(|f| f.iter().all(|&c| c == f[0])));
            let mut t = CubieTurn::default();
            let mut taken = 0;
            while cubie_game_take_turn(g, &mut t) {
                assert!((0..3).contains(&t.axis) && t.ms > 0.0);
                taken += 1;
            }
            assert_eq!(taken, count);
            assert!(!cubie_game_is_solved(g));
            assert!(cubie_game_is_scrambled(g));
            // 범위 밖 크기는 3
            let h = cubie_game_new(9);
            assert_eq!(cubie_game_size(h), 3);
            let mut p = [0i32; 3];
            let mut nrm = [0i32; 3];
            assert!(cubie_game_sticker_slot(
                h,
                0,
                p.as_mut_ptr(),
                nrm.as_mut_ptr()
            ));
            // 0번은 U면(위를 향함), 조각은 맨 윗줄
            assert_eq!((nrm, p[1]), ([0, 1, 0], 2));
            assert!(!cubie_game_sticker_slot(
                h,
                54,
                p.as_mut_ptr(),
                nrm.as_mut_ptr()
            ));
            cubie_game_free(h);
            // 키: I = R(두 손 배치), Enter = 섞기
            cubie_game_reset(g);
            assert_eq!(cubie_game_key(g, 34, 0, 0), KEY_MOVED);
            assert_eq!(cubie_game_key(g, 36, 0, 5), KEY_SCRAMBLED);
            assert!(cubie_game_has_turns(g));
            assert!(cubie_game_finish_show(g));
            assert!(!cubie_game_has_turns(g));
            cubie_game_free(g);
        }
    }
}
