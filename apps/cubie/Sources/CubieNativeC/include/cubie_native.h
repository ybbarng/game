// Cubie 네이티브 화면(native/cubie-native, docs/52 5-2)의 C ABI. 손으로 쓴 머리 파일이다:
// native/cubie-native/src/ffi.rs의 함수·상수와 하나씩 맞아야 한다. 모든 함수는 주 스레드에서만 부른다.
#ifndef CUBIE_NATIVE_H
#define CUBIE_NATIVE_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CubieView CubieView;

/// cubie_view_key가 돌려주는 값
enum {
  CUBIE_KEY_IGNORED = 0,   // 키를 먹지 않음(배치에 없음)
  CUBIE_KEY_CONSUMED = 1,  // 먹었지만 상태는 그대로(깊이·층 수, 다루지 않는 명령)
  CUBIE_KEY_MOVED = 2,     // 수를 둠(되돌리기 포함)
  CUBIE_KEY_SOLVED = 3,    // 섞인 큐브를 이 수로 다 맞춤
  CUBIE_KEY_SCRAMBLED = 4, // 섞음(Enter)
  CUBIE_KEY_RESET = 5,     // 맞춘 상태로
};

/// cubie_view_key의 조합 키
enum {
  CUBIE_FLAG_SHIFT = 1,
  CUBIE_FLAG_ALT = 2,
  CUBIE_FLAG_CTRL = 4,
  CUBIE_FLAG_CMD = 8,
  CUBIE_FLAG_REPEAT = 16,
};

/// CAMetalLayer 하나에 3×3 큐브 화면을 만든다(크기는 장치 px, scale은 장치 px ÷ pt). 실패하면 NULL.
/// 층은 cubie_view_free까지 살아 있어야 한다.
CubieView *cubie_view_new(void *metal_layer, uint32_t width_px, uint32_t height_px, double scale);
/// 창 없이 화면 밖 텍스처에 그리는 화면(재기 모드. 화면 밖 창은 wgpu가 가려진 창으로 보고 그리지 않아 같은 그리기를 텍스처에 한다)
CubieView *cubie_view_new_offscreen(uint32_t width_px, uint32_t height_px, double scale);
void cubie_view_free(CubieView *view);
void cubie_view_resize(CubieView *view, uint32_t width_px, uint32_t height_px, double scale);
/// 맥 키 누름(NSEvent.keyCode, CUBIE_FLAG_*). seed는 Enter(섞기)에 쓴다. CUBIE_KEY_*를 돌려준다
int32_t cubie_view_key(CubieView *view, uint16_t key_code, uint32_t flags, uint32_t seed);
/// 코어 섞기(같은 씨앗이면 사이트와 같은 섞기)
void cubie_view_scramble(CubieView *view, uint32_t seed);
/// 그릴 것이 있나(돌리는 중이거나 다시 그려야 함). 없으면 화면 갱신을 멈춘다
bool cubie_view_needs_frame(const CubieView *view);
/// 다음 갱신에 한 장 다시 그리게 한다(창이 다시 보일 때)
void cubie_view_invalidate(CubieView *view);
/// 시각 now_ms의 화면을 한 장 그린다. 그 뒤에도 그릴 것이 남았으면 true. 창이 가려져 그리지 못했으면 false를 돌려주고,
/// 다시 보일 때 cubie_view_invalidate로 깨운다
bool cubie_view_render(CubieView *view, double now_ms);
bool cubie_view_is_solved(const CubieView *view);
/// 섞은 뒤 둔 수
uint32_t cubie_view_move_count(const CubieView *view);
/// 실제로 그려 내보낸 장 수(재기·확인용)
uint64_t cubie_view_frames_drawn(const CubieView *view);
/// 그리지 못한 장 수. last에 마지막 까닭(1 그릴 곳 없음·2 시간 초과·3 가려짐·4 설정 낡음·5 그 밖)
uint64_t cubie_view_frames_failed(const CubieView *view, int32_t *last);

#ifdef __cplusplus
}
#endif

#endif
