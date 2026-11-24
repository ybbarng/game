/**
 * 겉모습은 그대로 두고 누르는 자리만 44px(가로·세로 최소)로 넓히는 꾸밈.
 * 단추 가운데에 보이지 않는 44px 칸(::after)을 겹쳐 둔다. 부모가 `overflow-hidden`이면 넓힌 칸이 잘리니 피한다.
 * 줄 사이가 좁게 여러 줄로 쌓이는 단추(옵션 칩)는 이것 대신 단추 자체를 `min-h-11`로 둔다(넓힌 칸끼리 겹치지 않게).
 */
export const HIT_AREA =
  "relative after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-full after:min-w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']";
