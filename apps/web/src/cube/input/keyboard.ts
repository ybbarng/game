import type { KeyInterpreter, KeyResult } from "./interpreter";

/**
 * 키보드를 해석기에 잇는 얇은 연결(DOM). 글 입력 칸에 치는 중이면 건드리지 않는다.
 * 동작으로 바뀐 키는 기본 동작(스크롤·뒤로 가기 등)을 막는다. 떼는 함수를 돌려준다.
 */
export function attachKeyboard(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  interpreter: () => KeyInterpreter,
  onResult: (result: KeyResult, event: KeyboardEvent) => void,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const r = interpreter().handle(e);
    if (!r) return;
    e.preventDefault();
    onResult(r, e);
  };
  target.addEventListener("keydown", onKeyDown as EventListener);
  return () =>
    target.removeEventListener("keydown", onKeyDown as EventListener);
}

/** 글 입력 칸에 치는 중인지(큐브 키를 먹지 않는다) */
export function isTyping(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== "string") return false;
  const el = t as HTMLElement;
  if (el.tagName === "INPUT")
    return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  return (
    el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
  );
}

/** 눌러도 글을 치지 않는 입력 칸(누른 뒤에도 큐브 키가 먹어야 한다) */
const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "range",
  "button",
  "submit",
  "reset",
  "color",
]);
