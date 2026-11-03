import { ManualClock } from "@game/fair-play";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AstronautCard } from "./AstronautCard";
import { cardCodeOf, decodeCard, type SharedCard } from "./card-code";
import { fingermarkOf } from "./finger-pattern";
import { astronautOf } from "./identity";

const key = (i: number) => {
  const k = new Uint8Array(65);
  k[0] = 4;
  for (let j = 1; j < 65; j++) k[j] = (i * 31 + j * 19) & 255;
  return k;
};
const clock = new ManualClock();
const back = (html: string) =>
  // 뒷면부터 카드 아래 「뒷면 보기」 단추 앞까지
  html.slice(
    html.indexOf("data-idcard-back"),
    html.lastIndexOf("<button", html.indexOf("data-flip-card")),
  );
const front = (html: string) => html.slice(0, html.indexOf("data-idcard-back"));
/** 별 무늬(선과 별) 부분만 */
const artOf = (html: string) => {
  const b = back(html);
  return b.slice(b.indexOf("data-key-art"), b.indexOf("</svg>"));
};

describe("등록증 공유본(열쇠 없이 그린 등록증)", () => {
  const pub = key(4);
  const card = decodeCard(
    cardCodeOf(pub, { issuedAt: Date.UTC(2026, 10, 3, 5), round: 12 }),
  ) as SharedCard;
  const mine = renderToStaticMarkup(
    <AstronautCard
      astronaut={astronautOf(pub)}
      issued="2026. 11. 3."
      clock={clock}
      pub={pub}
      onReveal={async () => true}
      onCheck={async () => true}
    />,
  );
  const copy = renderToStaticMarkup(
    <AstronautCard
      astronaut={card.astronaut}
      issued={card.issued}
      clock={clock}
      copy
    />,
  );

  it("앞면 값·뒷면 별 무늬·지문 도장이 내 등록증과 같다", () => {
    expect(copy).toContain(`data-idcard="${astronautOf(pub).number}"`);
    expect(copy).toContain(astronautOf(pub).name);
    expect(artOf(copy)).toBe(artOf(mine));
    expect(back(copy)).toContain(`data-fingermark="${fingermarkOf(pub).kind}"`);
  });

  it("공개 열쇠 줄은 늘 가려 있고 누를 수 없다(단추·복사 없음)", () => {
    const b = back(copy);
    expect(b).toContain("data-key-locked");
    expect(b).toContain("●●●● ●●●● ●●●● ●●●●");
    expect(b).not.toContain("<button");
    expect(b).not.toContain("눌러서 꺼내 보기");
    expect(b).not.toContain("data-public-key");
    expect(b).not.toContain("복사");
  });

  it("앞뒷면에 공유본 도장, 본인 확인 안내는 없다", () => {
    expect(front(copy)).toContain("data-copy-mark");
    expect(back(copy)).toContain("data-copy-mark");
    expect(copy).toContain("본인 확인에 쓸 수 없습니다");
    expect(copy).not.toContain("누르면 본인 확인");
    expect(copy).not.toContain("이 기기에서 확인됨");
    // 뒤집기 단추는 그대로
    expect(copy).toContain("data-flip-card");
  });

  it("내 등록증은 그대로: 도장 없이 가린 줄을 눌러 꺼내 본다", () => {
    expect(mine).not.toContain("data-copy-mark");
    expect(back(mine)).toContain('aria-label="공개 열쇠 꺼내 보기(본인 확인)"');
    expect(back(mine)).not.toContain("data-key-locked");
    expect(mine).toContain("누르면 본인 확인");
  });
});
