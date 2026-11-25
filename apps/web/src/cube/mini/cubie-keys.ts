// Cubie(앱·사이트 미니 화면)가 키 배치에서 쓰는 동작(docs/47 16-24). 살펴보기(Space)는 쓰지 않는다. 맞춘 상태로는 쓰되,
// 아무것도 함께 누르지 않은 Esc 자리는 뺀다: 앱은 Esc를 단축키 표 닫기 → 연습 끝내기 → 이전 앱으로, 브라우저 미니는
// 연습 끝내기로 쓴다. 기본 배치는 Shift+Enter에도 맞춘 상태로가 있다(`keymaps.ts` `COMMON_COMMANDS`).
// Rust 코어도 같은 규칙으로 거른다(`native/cubie-native/src/ffi_game.rs` `cubie_uses`).
import type { KeyBinding, Keymap } from "../input/keymaps";

export function cubieUses(b: KeyBinding): boolean {
  if (b.action === "inspectionSkip") return false;
  if (b.action === "reset")
    return !(b.code === "Escape" && !b.shift && !b.alt && !b.ctrl);
  return true;
}

/** Cubie가 쓰는 키만 남긴 배치(단축키 표·키 처리) */
export function cubieKeymap(k: Keymap): Keymap {
  return { ...k, bindings: k.bindings.filter(cubieUses) };
}
