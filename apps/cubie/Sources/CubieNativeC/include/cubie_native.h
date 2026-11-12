// Cubie 네이티브 화면의 한 판 C ABI(native/cubie-native/src/ffi_game.rs, docs/52 5-5). 손으로 쓴 머리 파일이다:
// ffi_game.rs의 함수·상수·구조체와 하나씩 맞아야 한다. 모든 함수는 주 스레드에서만 부른다.
// 그리기는 앱(Swift, Core Animation 층 트리)이 하고, 여기서는 키 → 수, 섞기와 섞기 연출 수, 맞춤 판정, 칸 색만 준다.
// wgpu 그리기(5-2 시제품, ffi.rs)는 크레이트 기능 `wgpu`로만 들어오고 앱은 링크하지 않는다.
#ifndef CUBIE_NATIVE_H
#define CUBIE_NATIVE_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CubieGame CubieGame;

/// cubie_game_key가 돌려주는 값
enum {
  CUBIE_KEY_IGNORED = 0,   // 키를 먹지 않음(배치에 없음)
  CUBIE_KEY_CONSUMED = 1,  // 먹었지만 상태는 그대로(깊이·층 수, 다루지 않는 명령)
  CUBIE_KEY_MOVED = 2,     // 수를 둠(되돌리기 포함)
  CUBIE_KEY_SOLVED = 3,    // 섞인 큐브를 이 수로 다 맞춤
  CUBIE_KEY_SCRAMBLED = 4, // 섞음(Enter)
  CUBIE_KEY_RESET = 5,     // 맞춘 상태로
};

/// cubie_game_key의 조합 키
enum {
  CUBIE_FLAG_SHIFT = 1,
  CUBIE_FLAG_ALT = 2,
  CUBIE_FLAG_CTRL = 4,
  CUBIE_FLAG_CMD = 8,
  CUBIE_FLAG_REPEAT = 16,
};

/// 섞기 연출(사이트 scramble-show.ts)
enum {
  CUBIE_SHOW_INSTANT = 0, // 바로
  CUBIE_SHOW_MOVES = 1,   // 하나씩 빠르게(섞기 수가 연출 줄에 들어간다)
  CUBIE_SHOW_SPIN = 2,    // 짧은 연출(한 바퀴는 앱이 돌린다. 화면 상태는 바로 섞인 모양)
  CUBIE_SHOW_AUTO = 3,    // 크기에 맞게(5×5까지 하나씩, 6×6·7×7 짧은 연출)
};

/// 돌릴 수 하나
typedef struct CubieTurn {
  int32_t axis;  // 0 x · 1 y · 2 z
  int32_t from;  // 층 범위(1 = 축의 + 쪽 바깥층)
  int32_t to;
  int32_t turns; // 축의 + 쪽에서 볼 때 시계 방향 90°의 횟수(1·2·3)
  double ms;     // 돌리는 시간
} CubieTurn;

/// n×n 한 판(2~7, 벗어나면 3)
CubieGame *cubie_game_new(uint32_t n);
void cubie_game_free(CubieGame *game);
uint32_t cubie_game_size(const CubieGame *game);
/// Enter로 섞을 때 쓸 연출(CUBIE_SHOW_*, 기본 크기에 맞게)
void cubie_game_set_scramble_show(CubieGame *game, int32_t show);
/// 맥 키 누름(NSEvent.keyCode, CUBIE_FLAG_*). seed는 Enter(섞기)에 쓴다. CUBIE_KEY_*를 돌려준다
int32_t cubie_game_key(CubieGame *game, uint16_t key_code, uint32_t flags, uint32_t seed);
/// 코어 섞기(같은 씨앗이면 사이트와 같은 섞기)와 연출. 섞기 수 개수를 돌려준다
uint32_t cubie_game_scramble(CubieGame *game, uint32_t seed, int32_t show);
void cubie_game_reset(CubieGame *game);
/// 다음에 돌릴 수 하나를 꺼낸다(화면 상태에 바로 들어간다). 없으면 false
bool cubie_game_take_turn(CubieGame *game, CubieTurn *out);
bool cubie_game_has_turns(const CubieGame *game);
/// 섞기 연출 수가 남았으면 바로 끝낸 자리로. 남았던 게 있으면 true
bool cubie_game_finish_show(CubieGame *game);
/// 스티커 자리 수(6·n²)
uint32_t cubie_game_sticker_count(const CubieGame *game);
/// 스티커 자리 i의 조각 중심(두 배 좌표, x 오른쪽·y 위·z 앞)과 면 방향(i32 세 칸씩). 범위 밖이면 false
bool cubie_game_sticker_slot(const CubieGame *game, uint32_t i, int32_t *pos2, int32_t *normal);
/// 화면 상태의 칸 색(자리마다 0~5, U R F D L B)을 len칸까지 쓴다. 쓴 칸 수를 돌려준다
uint32_t cubie_game_shown_colors(const CubieGame *game, uint8_t *out, uint32_t len);
bool cubie_game_is_solved(const CubieGame *game);
/// 섞인 큐브를 맞추는 중인가(거울 판을 보일지)
bool cubie_game_is_scrambled(const CubieGame *game);
/// 섞은 뒤 둔 수
uint32_t cubie_game_move_count(const CubieGame *game);

#ifdef __cplusplus
}
#endif

#endif
