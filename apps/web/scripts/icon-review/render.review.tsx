// 별 따기 아이콘 검토용 그림 뽑기. 설명은 같은 폴더 vitest.config.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { it } from "vitest";

import { IconArt } from "@/components/brand/icon-art";
import {
  StardrawIconPicked,
  StardrawIconRefined,
  StardrawIconSeal,
} from "@/stardraw/icon-proposals";

const OUT = process.env.ICON_OUT ?? "/tmp/icon-review";

type Draw = (size: number, maskable: boolean) => React.ReactElement;

/** 지금 아이콘과 시안 셋 */
const CANDIDATES: Record<string, Draw> = {
  now: (_s, m) => <IconArt game="stardraw" maskable={m} />,
  a: (s, m) => <StardrawIconRefined size={s} maskable={m} />,
  b: (s, m) => <StardrawIconPicked size={s} maskable={m} />,
  c: (s, m) => <StardrawIconSeal size={s} maskable={m} />,
};

/** 나란히 놓을 다른 게임 아이콘(목록 차례) */
const OTHERS = [
  "omok",
  "janggi",
  "chess",
  "baduk",
  "mighty",
  "hearts",
  "gostop",
  "minhwatu",
  "nyrongppong",
  "baseball",
  "yut",
  "center",
] as const;

async function png(el: React.ReactElement, w: number, h = w) {
  const res = new ImageResponse(el, { width: w, height: h });
  return Buffer.from(await res.arrayBuffer());
}

it("아이콘을 크기별로 그린다", async () => {
  mkdirSync(OUT, { recursive: true });
  for (const [name, draw] of Object.entries(CANDIDATES)) {
    for (const size of [16, 32, 64, 128, 192]) {
      writeFileSync(
        join(OUT, `${name}-${size}.png`),
        await png(draw(size, false), size),
      );
    }
    writeFileSync(
      join(OUT, `${name}-apple-180.png`),
      await png(draw(180, true), 180),
    );
    // 공유 미리보기: game-share-image.tsx와 같은 배치(아이콘 350px + 영문 이름)
    writeFileSync(
      join(OUT, `${name}-share.png`),
      await png(
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 36,
            background: "radial-gradient(circle at 50% 30%, #1d3156, #070d19)",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 350,
              height: 350,
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              borderRadius: 63,
            }}
          >
            {draw(350, false)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 800,
              letterSpacing: 16,
              color: "#ffffff",
            }}
          >
            STARDRAW
          </div>
        </div>,
        1200,
        630,
      ),
    );
  }
  for (const game of OTHERS) {
    for (const size of [32, 128]) {
      writeFileSync(
        join(OUT, `other-${game}-${size}.png`),
        await png(<IconArt game={game} />, size),
      );
    }
  }
});
