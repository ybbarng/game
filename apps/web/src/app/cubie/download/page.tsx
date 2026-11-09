import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";

import { latestCubie } from "@/cubie/appcast";

/**
 * 맥 앱 Cubie 내려받기 주소(game.byb.kr/cubie/download). README와 사이트는 이 주소만 적어 둔다.
 * 빌드할 때 업데이트 목록(public/cubie/appcast.xml)의 맨 위 판을 읽어 그 판의 zip(GitHub Release)으로 바로 넘긴다.
 * 새 판의 appcast가 main에 들어가 사이트가 다시 배포되면 이 주소도 새 판을 가리킨다(src/cubie/appcast.ts).
 * 정적 사이트라 서버 넘기기(302) 대신 meta refresh를 쓰고, 넘어가지 않을 때를 위해 링크를 함께 둔다.
 */
const latest = latestCubie(
  readFileSync(path.join(process.cwd(), "public/cubie/appcast.xml"), "utf8"),
);

const RELEASES =
  "https://github.com/ybbarng/game/releases?q=cubie-v&expanded=true";
const README = "https://github.com/ybbarng/game/tree/main/apps/cubie#readme";

export const metadata: Metadata = {
  title: { absolute: "Cubie 내려받기" },
  description: "화면 구석에 작게 떠 있는 큐브 맥 앱 Cubie를 내려받는다.",
  robots: { index: false },
};

export default function CubieDownloadPage() {
  return (
    <main
      data-cubie-download={latest.version}
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center text-white"
    >
      <meta httpEquiv="refresh" content={`0;url=${latest.url}`} />
      <h1 className="font-bold text-xl">Cubie {latest.version}</h1>
      <p className="break-keep text-sm text-white/70">
        내려받기가 시작되지 않으면{" "}
        <a className="underline" href={latest.url} data-cubie-zip>
          Cubie.zip
        </a>
        을 누르세요.
        {latest.minimumSystem ? ` macOS ${latest.minimumSystem} 이상.` : ""}
      </p>
      <p className="flex gap-4 text-sm text-white/70">
        <a className="underline" href={README}>
          설치 방법
        </a>
        <a className="underline" href={RELEASES}>
          지난 판
        </a>
      </p>
    </main>
  );
}
