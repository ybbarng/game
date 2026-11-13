import { stillSrc } from "./emblem3d/still";
import type { TierId } from "./table";

/**
 * 티어 엠블럼 정지 그림(3D를 정면에서 찍은 그림, `emblem3d/still.ts`)을 PNG data URL로(docs/47 15-20). 맥 앱 Cubie가 사이트
 * 창으로 큐브 창을 열 때(`CUBIE_WEB=1`) 메뉴 프로필 칸에 사이트와 같은 그림을 쓰게 웹이 다리로 넘긴다. 네이티브 창은 같은
 * 그림을 앱에 묶어 쓴다(`apps/cubie/Resources/Emblems`).
 *
 * 한 변 `pt`의 칸에 맞는 단계를 2배 화소(`pt × 2`)로 그려 넘긴다. 받지 못하면 null.
 */
export async function emblemPng(
  tier: TierId,
  pt: number,
): Promise<string | null> {
  const px = pt * 2;
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("emblem"));
      img.src = stillSrc(tier, pt);
    });
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, px, px);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
