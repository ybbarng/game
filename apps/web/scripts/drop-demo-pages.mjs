// 로컬 전용 쪽을 운영 빌드의 out/ 에서 뺀다. 해시 목록(build-hashes.mjs)보다 먼저 돌아, 목록에도 실리지 않는다.
// 정적 내보내기는 notFound()인 쪽도 "찾을 수 없음" 내용으로 room.html을 만들어, nginx가 그 파일을 200으로 낸다.
// 파일을 지워야 운영 주소가 진짜 404(error_page)가 된다.
//   /stardraw/room  회차 방 바로가기. NEXT_PUBLIC_STARDRAW_ROOM_SHORTCUT=1로 빌드할 때만 남긴다
//   /stardraw/demo  데모. 로컬 디버깅·화면 시험 전용(2026-11-02 사용자). 운영 이미지(Dockerfile·Image 워크플로)는
//                   NEXT_PUBLIC_STARDRAW_DEMO=0으로 빌드해 지운다. 로컬·CI 화면 시험 빌드는 값이 없어 남는다.
//                   값은 해시 목록 env에 적혀, 같은 값으로 다시 빌드하면 같은 파일 목록이 나온다(docs/36 11-8)
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));

const drop = (page) => {
  for (const path of [page, `${page}.html`, `${page}.txt`])
    rmSync(join(out, path), { recursive: true, force: true });
};

if (process.env.NEXT_PUBLIC_STARDRAW_ROOM_SHORTCUT !== "1")
  drop("stardraw/room");
if (process.env.NEXT_PUBLIC_STARDRAW_DEMO === "0") drop("stardraw/demo");
