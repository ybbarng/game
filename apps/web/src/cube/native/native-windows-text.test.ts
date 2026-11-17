// Cubie 네이티브 보통 창(기록 창·티어표·설정 창, docs/52 5-8)이 사이트 화면과 같은 글을 쓰는지 본다. 사이트 화면 글을 고치면
// 이 시험이 깨져 앱의 같은 글(`apps/cubie/Sources/CubieCore/*Sheet.swift`)도 고치라고 알린다. 앱 글은 Cubie 새 판을 내야
// 사용자에게 간다(고정 규칙 5절).
import { describe, expect, it } from "vitest";

import { PRESET_LABEL } from "../input/keymaps";
import { SCRAMBLE_SHOW_LABEL } from "../scramble-show";
import { COLOR_SCHEME_LABEL } from "../settings";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

const FILES = import.meta.glob<string>(
  [
    "../../../../cubie/Sources/CubieCore/RecordsSheet.swift",
    "../../../../cubie/Sources/CubieCore/TierSheet.swift",
    "../../../../cubie/Sources/CubieCore/TierShowcase.swift",
    "../../../../cubie/Sources/CubieCore/SettingsSheet.swift",
    "../../../../cubie/Sources/CubieCore/TierProgress.swift",
    "../tiers/progress-view.ts",
    "../mini/MiniCubeApp.tsx",
    "../tiers/TiersApp.tsx",
    "../tiers/TierShowcase.tsx",
    "../tiers/TierTable.tsx",
    "../components/CubeSettingsApp.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
);

/** 줄 바꿈·들여쓰기·JSX 빈칸 `{" "}`을 빈칸 하나로(긴 JSX 글은 서식기가 여러 줄로 나눈다) */
const flat = (s: string) =>
  s
    .replaceAll('{" "}', " ")
    .replace(/\s+/g, " ")
    .replaceAll("> ", ">")
    .replaceAll(" <", "<");

function source(name: string): string {
  const key = Object.keys(FILES).find((k) => k.endsWith(name));
  expect(key, `${name}을 못 읽음`).toBeDefined();
  return flat(FILES[key as string] as string);
}

/** `site`는 화면 파일 하나 또는 여럿(한 화면을 여러 파일이 나눠 그릴 때, 예: 티어 화면 + 진열) */
function sameText(
  site: string | readonly string[],
  app: string,
  texts: readonly string[],
) {
  const s = (typeof site === "string" ? [site] : site).map(source).join(" ");
  const a = source(app);
  for (const t of texts) {
    expect(s, `사이트 ${site}에 「${t}」가 없다`).toContain(t);
    expect(
      a,
      `앱 ${app}에 「${t}」가 없다(사이트 글이 바뀌었으면 앱도 고친다)`,
    ).toContain(t);
  }
}

describe("Cubie 네이티브 창 글 = 사이트 화면 글", () => {
  it("기록 창(MiniCubeApp RecordsPage)", () =>
    sameText("MiniCubeApp.tsx", "RecordsSheet.swift", [
      "Cubie 기록 기준 · 최고 5판 평균(Ao5)",
      "티어표",
      "5판 뒤에",
      "Cubie는 살펴보기 없이, 큐브에 키 입력이 있는 동안만 재요. 사이트 혼자 맞추기 기록과는 따로 매겨요. 힌트를 쓴 판이 든 5판은 티어에 넣지 않아요.",
      "아직 기록이 없어요.",
      "다른 프로그램 입력",
      "마우스·화면",
      "힌트를 본 판이 든 5판은 티어에 넣지 않아요",
      "다시 보기",
      "이어 보기",
      "멈추기",
      "처음부터",
    ]));

  it("최고 5판·다음 판 목표(progress-view, 앱 TierProgress.swift)", () =>
    sameText("progress-view.ts", "TierProgress.swift", [
      '"최근 5판 평균"',
      '"최근 12판 평균"',
      '"최고 5판 평균"',
      "~",
      "번",
      "다음 판 ",
      " 안이면 ",
      "다음 판을 맞추면 ",
      "다음 판 하나로는 ",
      "에 못 닿아요. 최고 5판 평균을 ",
      "초 줄여야 해요.",
    ]));

  it("티어표(TiersApp)", () =>
    // 내 티어 칸 글은 진열(TierShowcase.tsx)로 옮겼다(2026-11-13, 글은 그대로)
    sameText(["TiersApp.tsx", "TierShowcase.tsx"], "TierSheet.swift", [
      "← 큐브",
      "같은 크기에서 낸 가장 좋은 5판 평균(Ao5)으로 티어를 매겨요. 5판 평균은 연달아 맞춘 5판 가운데 가장 빠른 판과 가장 느린 판을 빼고 남은 3판의 평균이에요.",
      "골드부터 위는 세계 큐브 협회(WCA) 대회 기록의 분포로 정했고, 아이언·브론즈·실버는 대회에 나가지 않는 사람까지 담도록 넓혔어요. 큰 큐브는 3×3 기록이 같은 사람이 그 크기에서 내는 기록에 맞춰, 크기가 달라도 같은 티어면 비슷한 실력이에요.",
      "내 최고 5판 평균",
      // 앱 티어표는 Cubie 기록으로 센다(사이트는 `?records=cubie`일 때 같은 글)
      "이 크기는 아직 5판 평균이 없어요. Cubie에서 5판 맞추면 생겨요.",
      "Cubie 기록 기준이에요.",
      "기록은 이 기기에만 저장돼요.",
      "칸의 시간은 그 구간에 드는 최고 5판 평균의 상한이에요. 「WCA 경기자 중」은 그 티어에 드는 시간 이하인 대회 경기자의 비율이에요(",
      "평균 기록이 있는 약",
      "그랜드마스터·챌린저 경계는 그때의 세계 약 1,000위·300위 기록이라 해마다 빨라질 수 있어요.",
    ]));

  it("설정 창(CubeSettingsApp 가운데 Cubie가 쓰는 칸)", () =>
    sameText("CubeSettingsApp.tsx", "SettingsSheet.swift", [
      "← 큐브",
      "큐브 설정",
      "키 배치",
      "키보드 그림으로 보기",
      "키 익히기",
      '"위(U)"',
      '"오른쪽(R)"',
      '"앞(F)"',
      '"아래(D)"',
      '"왼쪽(L)"',
      '"뒤(B)"',
      "보기와 소리",
      "회전 속도",
      "섞기 연출",
      "크기에 맞게는 5×5까지 하나씩 빠르게, 6×6·7×7은 짧은 연출이에요.",
      '"스티커 없는 모양"',
      '"큐브 소리"',
      "가린 스티커",
      '"검정"',
      '"회색"',
      '"키 그림에 면 색"',
    ]));

  it("설정 창 사용자 배치 편집(KeymapSection, 알림 글은 코어 keys/editor.rs가 공통 자료로)", () =>
    sameText("CubeSettingsApp.tsx", "SettingsSheet.swift", [
      "마우스로 끌어 큐브 전체 돌리기(x·y·z)",
      "동작 목록 크기",
      "기본으로 되돌리기:",
      "바꾸기",
      "그만두기",
      "키 없음",
      '"키 기다리는 중"',
      '"키 지정"',
      "비우기",
      '"이 키 빼기"',
      '"이 동작의 키 모두 지우기"',
      "내보내기·가져오기(JSON)",
      "지금 배치",
      "복사",
      "가져올 배치",
      "가져오기",
    ]));

  it("설정 칩 이름(사이트 이름표 모음)", () => {
    const app = source("SettingsSheet.swift");
    for (const [id, label] of [
      ...Object.entries(PRESET_LABEL),
      ...Object.entries(COLOR_SCHEME_LABEL),
      ...Object.entries(SCRAMBLE_SHOW_LABEL),
    ]) {
      const pair =
        id === "custom" && label === "직접 고름"
          ? `"${label}"`
          : `("${id}", "${label}")`;
      expect(app, `앱 설정 글에 ${pair}가 없다`).toContain(pair);
    }
  });

  it("티어 진열(TierShowcase, 앱 TierShowcase.swift)", () =>
    sameText("TierShowcase.tsx", "TierShowcase.swift", [
      "모든 티어",
      "까지",
      " 이하",
      "5판 평균 ",
      " · ",
    ]));

  it("티어 기준표(TierTable)", () =>
    sameText("TierTable.tsx", "TierSheet.swift", [
      "WCA 경기자 중",
      "대회 밖",
      "다 맞춤",
      " 이하",
    ]));
});
