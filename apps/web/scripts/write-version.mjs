// 배포된 판 번호(out/version.json): 열어 둔 화면이 새 배포를 알아채는 데 쓴다(별 따기 「조용히 새 화면으로」, 2026-11-02).
// 값은 빌드한 커밋이라 같은 커밋이면 같은 파일이다(재현 빌드, docs/36 11-8). 화면 코드에는 같은 값이
// NEXT_PUBLIC_BUILD_COMMIT으로 들어간다(next.config.ts). build-hashes.mjs보다 먼저 돌아 해시 목록에도 들어간다
//
//   node scripts/write-version.mjs [out 폴더]

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function commit() {
  const fromEnv = process.env.SOURCE_COMMIT?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const out =
  process.argv[2] ?? fileURLToPath(new URL("../out", import.meta.url));
writeFileSync(
  join(out, "version.json"),
  `${JSON.stringify({ commit: commit() })}\n`,
);
