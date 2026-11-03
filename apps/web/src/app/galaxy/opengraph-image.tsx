import {
  gameShareImage,
  SHARE_SIZE,
} from "@/components/brand/game-share-image";

export const dynamic = "force-static";

/** 정적 호스팅에서 이미지로 전송되도록 이름에 확장자를 붙인다 */
export function generateImageMetadata() {
  return [
    {
      id: "share.png",
      alt: "Galaxy Loop — 은하 한 바퀴",
      size: SHARE_SIZE,
      contentType: "image/png",
    },
  ];
}

/** 은하 한 바퀴 링크를 공유할 때 보이는 미리보기 */
export default function OpenGraphImage() {
  return gameShareImage({
    game: "galaxy",
    title: "GALAXY LOOP",
    background: "radial-gradient(circle at 50% 30%, #1d2f5c, #070d1c)",
  });
}
