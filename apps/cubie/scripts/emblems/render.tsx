// 네이티브 Cubie 메뉴 프로필 칸의 티어 엠블럼(docs/47 15-20, docs/52 5-6). 사이트가 앱에 보내던 그림과 같게,
// 사이트 `TierEmblem`(still·noHdr, 32pt)을 그려 `emblemPng`(64px)로 뗀다. make.mjs가 묶어 화면 없는 브라우저에서 부른다.
import { createRoot } from "react-dom/client";
import { emblemPng } from "@/cube/tiers/emblemImage";
import { TierEmblem } from "@/cube/tiers/TierEmblem";
import { TIER_IDS } from "@/cube/tiers/table";

declare global {
  interface Window {
    drawEmblems: () => Promise<Record<string, string | null>>;
  }
}

window.drawEmblems = async () => {
  const out: Record<string, string | null> = {};
  for (const tier of TIER_IDS) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<TierEmblem tier={tier} size={32} still noHdr />);
    await new Promise((r) => setTimeout(r, 50));
    out[tier] = await emblemPng(host, 64);
    root.unmount();
    host.remove();
  }
  return out;
};
