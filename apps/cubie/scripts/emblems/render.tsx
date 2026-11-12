// 네이티브 Cubie의 티어 엠블럼(docs/47 15-20, docs/52 5-6). 사이트가 앱에 보내던 그림과 같게, 사이트 `TierEmblem`(still·noHdr)을
// 그려 `emblemPng`로 뗀다. make.mjs가 묶어 화면 없는 브라우저에서 부른다.
// - `<티어>`: 32pt(64px). 메뉴 프로필 칸, 기록 창 티어 칸, 티어표 줄(28pt)
// - `big/<티어>`: 64pt(128px). 티어표 「내 티어」 상자(사이트 `TierEmblem size={64}`). 사이트는 그 아래 구간 점(IV~I)을
//   찍지만, 구간마다 그림을 두면 앱이 0.7MB 커져서 구간은 옆 이름 글(「골드 II」)로만 보인다
import { createRoot } from "react-dom/client";
import { emblemPng } from "@/cube/tiers/emblemImage";
import { TierEmblem } from "@/cube/tiers/TierEmblem";
import { type Division, TIER_IDS } from "@/cube/tiers/table";

declare global {
  interface Window {
    drawEmblems: () => Promise<Record<string, string | null>>;
  }
}

window.drawEmblems = async () => {
  const out: Record<string, string | null> = {};
  const draw = async (
    name: string,
    tier: (typeof TIER_IDS)[number],
    size: number,
    division: Division | null,
  ) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      <TierEmblem tier={tier} division={division} size={size} still noHdr />,
    );
    await new Promise((r) => setTimeout(r, 50));
    out[name] = await emblemPng(host, size * 2);
    root.unmount();
    host.remove();
  };
  for (const tier of TIER_IDS) {
    await draw(tier, tier, 32, null);
    await draw(`big/${tier}`, tier, 64, null);
  }
  return out;
};
