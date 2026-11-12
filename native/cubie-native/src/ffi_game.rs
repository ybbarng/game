//! 그리기 없는 한 판의 C ABI(docs/52 5-5, Core Animation 그리기). 앱이 층 트리로 큐브를 그리고, 여기서는 키 → 수,
//! 섞기와 섞기 연출 수, 맞춤 판정, 화면 상태의 칸 색만 준다. wgpu를 링크하지 않는다.
//!
//! 머리 파일은 손으로 쓴 `apps/cubie/Sources/CubieNativeC/include/cubie_native.h`이고 여기 함수와 하나씩 맞아야 한다.
//! 모든 함수는 주 스레드에서만 부른다.

use std::ffi::{c_char, CStr};

use crate::game::{Game, Outcome, ScrambleShow};
use crate::keycode::mac_key_code;
use cube_core::keys::actions::parse_action;
use cube_core::keys::keymap::KeyBinding;
use cube_core::keys::{preset_keymap, Command, KeyInput, Keymap, Preset};
use cube_core::replay::replay_steps;
use cube_core::solved_cube;
use cube_core::state::face_colors;
use cube_core::topology::{cube_topology, MAX_SIZE, MIN_SIZE};

pub const KEY_IGNORED: i32 = 0;
pub const KEY_CONSUMED: i32 = 1;
pub const KEY_MOVED: i32 = 2;
pub const KEY_SOLVED: i32 = 3;
pub const KEY_SCRAMBLED: i32 = 4;
pub const KEY_RESET: i32 = 5;
pub const KEY_PEEK_BACK: i32 = 6;
pub const KEY_PEEK_DOWN: i32 = 7;
pub const KEY_VIEW_HOME: i32 = 8;

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
        Outcome::View(Command::PeekBack) => KEY_PEEK_BACK,
        Outcome::View(Command::PeekDown) => KEY_PEEK_DOWN,
        Outcome::View(_) => KEY_VIEW_HOME,
    }
}

unsafe fn c_str<'a>(p: *const c_char) -> Option<&'a str> {
    if p.is_null() {
        return None;
    }
    unsafe { CStr::from_ptr(p) }.to_str().ok()
}

/// 글을 `out`에 `len`바이트까지 쓴다(UTF-8, 끝 NUL 없음). 글 전체 바이트 수를 돌려준다(모자라면 더 큰 자리로 다시 부른다)
unsafe fn write_str(s: &str, out: *mut u8, len: u32) -> u32 {
    let b = s.as_bytes();
    if !out.is_null() && b.len() <= len as usize {
        unsafe { std::ptr::copy_nonoverlapping(b.as_ptr(), out, b.len()) };
    }
    b.len() as u32
}

/// 키 배치를 바꾼다(사이트 `cube.keymap.v1`과 같은 꼴). `preset`이 "twoHand"·"notation"이면 그 배치(목록은 보지 않는다),
/// "custom"이면 `count`개의 키(`codes`는 `KeyboardEvent.code`, `mods`는 Shift 1·Alt 2·Ctrl 4, `actions`는 동작 이름).
/// 모르는 동작은 버린다(사이트 가져오기는 그 배치를 통째로 거절하지만, 앱은 설정 창이 저장한 값만 받는다).
/// 모르는 묶음 이름이면 바꾸지 않고 false
///
/// # Safety
/// [`cubie_game_size`]와 같다. 배열 셋은 `count`칸, 글은 NUL로 끝나는 C 글.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_set_keymap(
    g: *mut CubieGame,
    preset: *const c_char,
    codes: *const *const c_char,
    mods: *const u8,
    actions: *const *const c_char,
    count: u32,
) -> bool {
    let g = unsafe { &mut *g };
    let Some(preset) = unsafe { c_str(preset) }.and_then(Preset::from_id) else {
        return false;
    };
    let keymap = if preset == Preset::Custom {
        let mut bindings = Vec::new();
        for i in 0..count as usize {
            let (code, action) = unsafe { (c_str(*codes.add(i)), c_str(*actions.add(i))) };
            let (Some(code), Some(action)) = (code, action) else {
                continue;
            };
            if parse_action(action).is_none() {
                continue;
            }
            bindings.push(KeyBinding {
                code: code.to_string(),
                mods: unsafe { *mods.add(i) } & 7,
                action: action.to_string(),
            });
        }
        Keymap { preset, bindings }
    } else {
        preset_keymap(preset)
    };
    g.game.set_keymap(keymap);
    true
}

/// 마지막으로 둔 수의 표기(기록에 적는 이름, 되돌리기면 거꾸로 돌린 수)를 `out`에 쓴다. 글 전체 바이트 수를 돌려준다
///
/// # Safety
/// [`cubie_game_size`]와 같다. `out`은 `len`바이트를 쓸 수 있는 자리(NULL이면 길이만).
#[no_mangle]
pub unsafe extern "C" fn cubie_game_last_notation(
    g: *const CubieGame,
    out: *mut u8,
    len: u32,
) -> u32 {
    unsafe { write_str((*g).game.last_notation(), out, len) }
}

/// 마지막으로 둔 수가 큐브 돌리기(x·y·z)인가
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_last_rotation(g: *const CubieGame) -> bool {
    unsafe { &*g }.game.last_rotation()
}

/// 보기만 하는 연출: 화면을 맞춘 모양(`solved` true) 또는 논리 상태(false)로 두고 줄을 비운다
///
/// # Safety
/// [`cubie_game_size`]와 같다.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_show_jump(g: *mut CubieGame, solved: bool) {
    let g = unsafe { &mut *g };
    if solved {
        let st = solved_cube(g.game.n);
        g.game.show_jump(st);
    } else {
        g.game.show_restore();
    }
}

/// 보기만 하는 수(표기 글, 여러 수면 시간을 나눈다)를 줄에 넣는다. 읽지 못하면 false
///
/// # Safety
/// [`cubie_game_size`]와 같다. `notation`은 NUL로 끝나는 C 글.
#[no_mangle]
pub unsafe extern "C" fn cubie_game_show_push(
    g: *mut CubieGame,
    notation: *const c_char,
    ms: f64,
) -> bool {
    let g = unsafe { &mut *g };
    match unsafe { c_str(notation) } {
        Some(t) => g.game.show_push(t, ms),
        None => false,
    }
}

/// 다시 보기 글 → 걸음(사이트 `solveSteps`, 수 사이 멈춤은 `max_pause_ms`까지, 첫 수가 `offset`). 걸음마다 한 줄
/// 「시각 표기」(수가 여럿이면 빈칸으로 이음)를 `out`에 쓴다. 글 전체 바이트 수를 돌려준다
///
/// # Safety
/// `text`는 NUL로 끝나는 C 글, `out`은 `len`바이트를 쓸 수 있는 자리(NULL이면 길이만).
#[no_mangle]
pub unsafe extern "C" fn cubie_replay_steps(
    n: u32,
    text: *const c_char,
    max_pause_ms: f64,
    offset: f64,
    out: *mut u8,
    len: u32,
) -> u32 {
    let n = n as usize;
    let Some(text) = (unsafe { c_str(text) }) else {
        return 0;
    };
    let lines: Vec<String> = replay_steps(n, text, max_pause_ms, offset)
        .into_iter()
        .map(|s| format!("{} {}", s.at, cube_core::format_moves(n, &s.moves)))
        .collect();
    unsafe { write_str(&lines.join("\n"), out, len) }
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

    fn notation(g: *const CubieGame) -> String {
        let mut buf = [0u8; 32];
        let k = unsafe { cubie_game_last_notation(g, buf.as_mut_ptr(), 32) } as usize;
        String::from_utf8(buf[..k].to_vec()).unwrap()
    }

    /// 사용자 배치: J를 R'로, 모르는 동작은 버린다. 「표기」로 바꾸면 R 키가 R
    #[test]
    fn custom_keymap_and_last_notation() {
        use std::ffi::CString;
        unsafe {
            let g = cubie_game_new(3);
            let codes = [CString::new("KeyJ").unwrap(), CString::new("KeyQ").unwrap()];
            let actions = [CString::new("R'").unwrap(), CString::new("nope").unwrap()];
            let cp: Vec<_> = codes.iter().map(|c| c.as_ptr()).collect();
            let ap: Vec<_> = actions.iter().map(|c| c.as_ptr()).collect();
            let mods = [0u8, 0];
            let custom = CString::new("custom").unwrap();
            assert!(cubie_game_set_keymap(
                g,
                custom.as_ptr(),
                cp.as_ptr(),
                mods.as_ptr(),
                ap.as_ptr(),
                2
            ));
            assert_eq!(cubie_game_key(g, 38, 0, 0), KEY_MOVED); // J
            assert_eq!(notation(g), "R'");
            assert_eq!(cubie_game_key(g, 12, 0, 0), KEY_IGNORED); // Q: 버린 키
                                                                  // 되돌리기 키가 없는 배치라 ⌫는 먹지 않는다
            assert_eq!(cubie_game_key(g, 51, 0, 0), KEY_IGNORED);
            let bad = CString::new("weird").unwrap();
            assert!(!cubie_game_set_keymap(
                g,
                bad.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                0
            ));
            let nota = CString::new("notation").unwrap();
            assert!(cubie_game_set_keymap(
                g,
                nota.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                0
            ));
            assert_eq!(cubie_game_key(g, 15, 0, 0), KEY_MOVED); // R
            assert_eq!(notation(g), "R");
            assert!(!cubie_game_last_rotation(g));
            // ⌫ = 되돌리기: 거꾸로 돌린 수 표기
            assert_eq!(cubie_game_key(g, 51, 0, 0), KEY_MOVED);
            assert_eq!(notation(g), "R'");
            cubie_game_free(g);
        }
    }

    /// 살짝 보기는 보기 명령으로 알린다(두 손: ← 뒤, ↓ 아래)
    #[test]
    fn peek_keys_report_view_commands() {
        unsafe {
            let g = cubie_game_new(3);
            assert_eq!(cubie_game_key(g, 123, 0, 0), KEY_PEEK_BACK);
            assert_eq!(cubie_game_key(g, 125, 0, 0), KEY_PEEK_DOWN);
            cubie_game_free(g);
        }
    }

    /// 보기만 하는 연출은 논리 상태를 건드리지 않고, 끝나면 논리 상태로 돌아간다
    #[test]
    fn show_only_moves_leave_logic_alone() {
        use std::ffi::CString;
        unsafe {
            let g = cubie_game_new(3);
            cubie_game_scramble(g, 3, SHOW_INSTANT);
            cubie_game_show_jump(g, true);
            let mut colors = [0u8; 54];
            cubie_game_shown_colors(g, colors.as_mut_ptr(), 54);
            assert!(colors.chunks(9).all(|f| f.iter().all(|&c| c == f[0])));
            let t = CString::new("R U2").unwrap();
            assert!(cubie_game_show_push(g, t.as_ptr(), 200.0));
            let mut turn = CubieTurn::default();
            assert!(cubie_game_take_turn(g, &mut turn));
            assert_eq!(turn.ms, 100.0);
            assert!(!cubie_game_is_solved(g));
            cubie_game_show_jump(g, false);
            assert!(!cubie_game_has_turns(g));
            cubie_game_free(g);
        }
    }

    #[test]
    fn replay_steps_as_lines() {
        use std::ffi::CString;
        unsafe {
            let t = CString::new("R@0 U'@300 x@5000").unwrap();
            let mut buf = [0u8; 64];
            let k = cubie_replay_steps(3, t.as_ptr(), 1000.0, 50.0, buf.as_mut_ptr(), 64) as usize;
            assert_eq!(
                std::str::from_utf8(&buf[..k]).unwrap(),
                "50 R\n350 U'\n1350 x"
            );
            assert_eq!(
                cubie_replay_steps(3, t.as_ptr(), 1000.0, 50.0, std::ptr::null_mut(), 0),
                k as u32
            );
        }
    }
}
