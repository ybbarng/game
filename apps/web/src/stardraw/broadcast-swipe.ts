/**
 * 우주국 방송을 끌다 놓았을 때: 옆으로 80px 넘게, 또는 위·아래로 60px 넘게 밀었으면 지우고, 거의 움직이지
 * 않았으면 누른 것으로 본다. 그 사이면 제자리로 돌아간다(아래로 끌어 가려진 화면을 잠깐 볼 수 있다, 2026-11-02 사용자)
 */
export function swipeResult(d: {
  x: number;
  y: number;
}): "dismiss" | "go" | "stay" {
  if (Math.abs(d.x) > 80 || Math.abs(d.y) > 60) return "dismiss";
  if (Math.abs(d.x) < 8 && Math.abs(d.y) < 8) return "go";
  return "stay";
}
