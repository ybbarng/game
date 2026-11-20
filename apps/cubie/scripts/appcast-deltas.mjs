// release.sh가 appcast의 차이 업데이트 자리를 다룰 때 부른다(docs/47 15-12 「차이 업데이트」).
// 셈은 사이트 쪽 apps/web/src/cubie/appcast.ts에 두고 그 시험(appcast.test.ts)이 본다. node 24는 .ts의 타입을 걷어 내고 바로 돌린다.
//   node scripts/appcast-deltas.mjs versions <appcast>                     판을 위(새 판)에서 아래로, 한 줄에 하나
//   node scripts/appcast-deltas.mjs set <appcast> <판> <목록> <나갈 파일>   목록 한 줄 = 「옛 판 길이 서명」(빈 파일이면 차이 없음)
//   node scripts/appcast-deltas.mjs in-use <appcast>                       appcast가 가리키는 차이 파일 이름
import { readFileSync, writeFileSync } from "node:fs";

import {
  appcastVersions,
  deltaFilesInUse,
  withDeltas,
} from "../../web/src/cubie/appcast.ts";

const [cmd, ...args] = process.argv.slice(2);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

if (cmd === "versions" && args.length === 1) {
  for (const v of appcastVersions(readFileSync(args[0], "utf8")))
    process.stdout.write(`${v}\n`);
} else if (cmd === "in-use" && args.length === 1) {
  for (const f of deltaFilesInUse(readFileSync(args[0], "utf8")))
    process.stdout.write(`${f}\n`);
} else if (cmd === "set" && args.length === 4) {
  const [appcast, version, list, out] = args;
  const deltas = readFileSync(list, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [from, length, signature, ...rest] = line.trim().split(/\s+/);
      if (!from || !length || !signature || rest.length > 0)
        fail(`목록 줄이 「옛 판 길이 서명」 꼴이 아니다: ${line}`);
      return { from, length: Number(length), signature };
    });
  writeFileSync(
    out,
    withDeltas(readFileSync(appcast, "utf8"), version, deltas),
  );
} else {
  fail(
    "쓰는 법: appcast-deltas.mjs versions <appcast> | in-use <appcast> | set <appcast> <판> <목록> <나갈 파일>",
  );
}
