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
  CUBIE_KEY_RESET = 5,     // 맞춘 상태로(앱 한 판은 쓰지 않는다: 미니 모드는 Esc·Space 명령을 먹기만 한다)
  CUBIE_KEY_PEEK_BACK = 6, // 살짝 보기: 뒤(키를 떼면 앱이 처음 각도로)
  CUBIE_KEY_PEEK_DOWN = 7, // 살짝 보기: 아래
  CUBIE_KEY_VIEW_HOME = 8, // 처음 각도로
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
/// 가린 칸(공식 연습 가리기)의 색 번호. 설정의 「가린 칸 색」(사이트 `hidden`)으로 칠한다
#define CUBIE_COLOR_MASKED 6
/// 화면 상태의 칸 색(자리마다 0~5, U R F D L B, 가린 칸은 CUBIE_COLOR_MASKED)을 len칸까지 쓴다. 쓴 칸 수를 돌려준다
uint32_t cubie_game_shown_colors(const CubieGame *game, uint8_t *out, uint32_t len);
bool cubie_game_is_solved(const CubieGame *game);
/// 섞인 큐브를 맞추는 중인가(거울 판을 보일지)
bool cubie_game_is_scrambled(const CubieGame *game);
/// 섞은 뒤 둔 수
uint32_t cubie_game_move_count(const CubieGame *game);

/// 키 배치(사이트 `cube.keymap.v1`과 같은 꼴). preset "twoHand"·"notation"이면 목록은 보지 않고, "custom"이면 count개의
/// 키(codes = KeyboardEvent.code, mods = Shift 1·Alt 2·Ctrl 4, actions = 동작 이름). 모르는 동작은 버린다. 모르는 묶음이면 false
bool cubie_game_set_keymap(CubieGame *game, const char *preset, const char *const *codes, const uint8_t *mods,
                           const char *const *actions, uint32_t count);
/// 마지막으로 둔 수의 표기(되돌리기면 거꾸로 돌린 수)를 out에 len바이트까지(UTF-8, NUL 없음). 글 전체 바이트 수를 돌려준다
uint32_t cubie_game_last_notation(const CubieGame *game, uint8_t *out, uint32_t len);
/// 마지막으로 둔 수가 큐브 돌리기(x·y·z)인가
bool cubie_game_last_rotation(const CubieGame *game);
/// 맥 키 코드 → KeyboardEvent.code(배치가 쓰는 키만, 모르면 빈 글). 글 바이트 수를 돌려준다
uint32_t cubie_mac_key_code(uint16_t key, uint8_t *out, uint32_t len);
/// 마지막으로 둔 수가 되돌리기였나
bool cubie_game_last_undo(const CubieGame *game);
/// 마지막 섞기 글(WCA 표기). 글 전체 바이트 수를 돌려준다(out이 NULL이면 길이만)
uint32_t cubie_game_scramble_text(const CubieGame *game, uint8_t *out, uint32_t len);
/// 보기만 하는 연출: 화면을 맞춘 모양(solved) 또는 논리 상태(false)로 두고 줄을 비운다
void cubie_game_show_jump(CubieGame *game, bool solved);
/// 보기만 하는 수를 줄에 넣는다(여러 수면 ms를 나눈다). 읽지 못하면 false
bool cubie_game_show_push(CubieGame *game, const char *notation, double ms);
/// 한 수를 돌리는 시간(사이트 설정 moveMs, 0~200ms)
void cubie_game_set_move_ms(CubieGame *game, double ms);
/// 지금 상태의 힌트(사이트 pickHint, 코어 사람 해법 포함)를 줄 여덟으로: 갈래(hint·none·unsupported), 단계, 상황 이름,
/// 쥐는 법, 공식, 배우기 단원, 공식의 키캡 줄, 쥐는 법의 키캡 줄. 글 전체 바이트 수를 돌려준다(out이 NULL이면 길이만)
uint32_t cubie_game_hint(const CubieGame *game, uint8_t *out, uint32_t len);
/// 다음 키·섞기의 시각(ms, 앱의 포커스 시계). 기록 시간·다시 보기 글은 이 시각으로 잰다
void cubie_game_set_now(CubieGame *game, double now);
/// 섞은 뒤 맞추는 중인가(첫 수 전 포함)
bool cubie_game_solving(const CubieGame *game);
/// 이정표가 새로 켜졌으면 true(한 번만)
bool cubie_game_take_milestone(CubieGame *game);
/// 다 맞춰 생긴 기록 한 판(ms·penalty·moves·scramble·seed·replay·splits·combo)을 JSON 글로 꺼낸다(한 번만, 없으면 0).
/// 글 전체 바이트 수를 돌려준다(len이 모자라면 꺼내지 않고 필요한 길이만)
uint32_t cubie_game_take_record(CubieGame *game, uint8_t *out, uint32_t len);
/// 지금 배치에서 크기 n에 쓰는 키(단축키 표): 줄마다 「code\t조합\t동작」(맞춘 상태로·살펴보기·쓸 수 없는 동작 뺌)
uint32_t cubie_game_key_bindings(const CubieGame *game, uint32_t n, uint8_t *out, uint32_t len);
/// 단축키 표(F1)의 칸마다 적는 글(사이트 미니 표와 같다): 줄마다
/// 「code\t조합(Shift 1·Alt 2)\t쓸 수 있나(1/0)\t동작\t칸 글\t칠하기」, 한 키의 줄은 위에서부터 차례로.
/// 칠하기는 「f」(면 돌리기)·「s」(큐브 돌리기·가운데 층) + 면 번호 + 반대(0/1) + 넓게·큐브 돌리기(0/1), 수가 아니면 빈 글
uint32_t cubie_game_key_table(const CubieGame *game, uint32_t n, uint8_t *out, uint32_t len);
/// 단축키 표 칸 색(사이트 KeyPaint): which 0 칸 바탕·1 반대 칸 바탕·2 선·3 사선·4 반대 사선. 면 색 rgb를 페이지 바탕과 섞은 색
uint32_t cubie_key_tone(uint32_t rgb, uint32_t which);
/// 그 배색(사이트 colorScheme)에서 이 면 색 칸에 사선 무늬를 넣나
bool cubie_key_striped(const char *scheme, uint8_t color);
/// 공식 연습 단계 목록(메뉴): 줄마다 「id\t이름\t묶음」. 글 바이트 수
uint32_t cubie_practice_menu(uint8_t *out, uint32_t len);
/// 공식 연습을 연다(3×3 한 판만). 기록 글은 사이트와 같은 JSON. 못 열면 false
bool cubie_game_practice_start(CubieGame *game, const char *stage, bool see, const char *alg_book, const char *record,
                               const char *train, uint32_t seed);
void cubie_game_practice_stop(CubieGame *game);
/// 시각이 닿은 일(멈춤 끝·틀린 키 끝)
void cubie_game_practice_tick(CubieGame *game, double now);
/// 보고 치기: 공식 펼치기
bool cubie_game_practice_peek(CubieGame *game);
/// 진행기가 알린 일(비트: 1 다시 칠함 · 2 문제 맞춤 · 4 틀린 수 · 8 판 끝)
uint32_t cubie_game_practice_events(CubieGame *game);
/// 말풍선 줄들(줄마다 「꼴\t글[\t낱말 꼴:글을 0x1f로 이음]」). 글 바이트 수
uint32_t cubie_game_practice_lines(const CubieGame *game, const char *again, uint8_t *out, uint32_t len);
/// 저장할 기록 글(which 0 공식 연습 기록, 1 보고 치기 기록). 글 바이트 수
uint32_t cubie_game_practice_record(const CubieGame *game, uint32_t which, uint8_t *out, uint32_t len);
/// 다시 보기 글 → 걸음 줄들(「시각 표기」, 줄바꿈으로 이음). 글 전체 바이트 수를 돌려준다(out이 NULL이면 길이만)
uint32_t cubie_replay_steps(uint32_t n, const char *text, double max_pause_ms, double offset, uint8_t *out,
                            uint32_t len);

// ---- 기록 계산(native/cubie-native/src/ffi_records.rs, 코어 tier.rs) ----

/// 기록 한 판. ms가 음수면 DNF
typedef struct CubieTimeable {
  double ms;
  double penalty;
  uint32_t hints;
} CubieTimeable;

/// 내 티어
typedef struct CubieTier {
  double ao5;        // 최고 Ao5(ms)
  uint32_t tier;     // 0 아이언 … 9 챌린저
  int32_t division;  // 0 IV … 3 I, 단계 없는 티어는 -1
} CubieTier;

/// 대회 규칙 평균(3판보다 적으면 NaN, DNF면 무한대)
double cubie_average_of(const CubieTimeable *recs, uint32_t count);
/// 5판의 Ao5(DNF·개수가 5가 아니면 NaN)
double cubie_ao5(const CubieTimeable *five, uint32_t count);
/// 최고 Ao5(힌트 판이 든 5판은 건너뜀). 있으면 ms·at(그 5판의 첫 번호)에 쓰고 true
bool cubie_best_ao5(const CubieTimeable *recs, uint32_t count, double *ms, uint32_t *at);
/// 기록(새것이 앞)과 최고 5판으로 내 티어. 있으면 out에 쓰고 true
bool cubie_my_tier(uint32_t n, const CubieTimeable *recs, uint32_t count, const CubieTimeable *best5,
                   uint32_t best5_count, CubieTier *out);

#ifdef __cplusplus
}
#endif

#endif
