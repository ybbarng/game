/**
 * 주소의 `?seed=숫자`(화면 시험·버그 재현이 같은 판으로 시작할 때). 양의 정수만 받는다.
 * 첫 화면에서 시작할 때만 쓰고, 판 끝 「다시 하기」는 씨앗을 새로 뽑는다
 */
export function seedFromUrl(): number | undefined {
  const seed = Number(new URLSearchParams(window.location.search).get("seed"));
  return Number.isInteger(seed) && seed > 0 ? seed : undefined;
}
