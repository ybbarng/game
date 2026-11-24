/*
 * 덧붙임 문구 금지(docs/standing-rules.md 3절 「동작 힌트·덧붙임 문구를 넣지 않는다」)의 기계 점검.
 * 큐브 화면과 Cubie 앱 창에 「기록은 이 기기에만 저장돼요.」·「Cubie 기록 기준이에요.」처럼 기록이 어디에 저장되는지,
 * 어느 기록을 기준으로 매기는지 알리는 안내가 다시 들어오면 실패한다. 2026-11-20 사용자 「잡스런 문구 없애주고」,
 * 「매번 말하는 게 지쳐서 그래」: 3절이 이미 있었는데 2026-11-18에 「티어 화면은 어느 기록 기준인지 밝힌다」는 규칙이
 * 더해져 이 문구가 다시 생겼다. 어느 기록을 읽는지는 화면 글이 아니라 시험이 본다(앱 `TierSheetTests`
 * 「tiersWindowUsesCubieRecordsLikeRecordsWindow」, 화면 시험 `cube-tiers.spec.ts` 「Cubie 창(records=cubie)…」의
 * `data-cube-tier-basis` 속성).
 *
 * 저장 위치가 본문 내용인 곳(숫자야구·윷놀이의 「비밀 수는 각자 기기에만」, 보안 설명, 별 따기 패스키 도움말)은
 * 공정성·보안 설명이라 범위 밖이다.
 *
 * 2026-11-20 셋째: 큐브 밖 모든 게임 화면(게임 폴더·공통 화면·기록·복기·별 따기·페이지)도 같은 기준으로 본다(`WIDE`).
 * 기록 화면 빈 상태 뒤의 「…여기에 쌓여요」·「한 판 하고 오세요」, 복기 「이 기기에 남겨요」, 옵션·대기실의
 * 「판마다 흑백을 바꿔요」·「여기서 고른 …로 방을 열어요」·「빈자리는 컴퓨터가 채워요」, 「눌러 보세요」 같은 안내를 지웠다.
 * 학습 글(튜토리얼·수 배우기·보안 배우기)·보안 설명·사이트 소개·별 이야기는 그 화면의 본문이라 뺀다.
 */
import { describe, expect, it } from "vitest";
import { sourceTexts } from "@/lib/source-texts";

/** 사이트 큐브 화면 소스(시험·시험 자료는 뺀다) */
const SITE: Record<string, string> = import.meta.glob(
  [
    "./cube/**/*.{ts,tsx}",
    "./app/cube/**/*.{ts,tsx}",
    "!./**/*.test.{ts,tsx}",
    "!./**/*-fixture.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

/** 큐브 밖 웹 화면 소스. 학습 글·보안 설명·사이트 소개·별 이야기처럼 설명이 본문인 곳과 시험·시험 자료는 뺀다 */
const WIDE: Record<string, string> = import.meta.glob(
  [
    "./{baduk,baseball,chess,galaxy,game,games,gostop,hearts,hwatu,janggi,minhwatu,nyrongppong,omok,onecard,yut,review,stats,components,stardraw,layout,app}/**/*.{ts,tsx}",
    "!./**/*.test.{ts,tsx}",
    "!./**/*-fixture.ts",
    "!./*/*-suite.ts",
    "!./app/cube/**",
    "!./components/learn/**", // 보안 배우기
    "!./components/security/**", // 보안 설명
    "!./components/AboutScreen.tsx", // 사이트 소개
    "!./components/tutorial/**",
    "!./components/study/**",
    "!./*/tutorial.ts",
    "!./*/tutorial/**",
    "!./*/components/*-tutorial.tsx",
    "!./*/study*.ts",
    "!./*/opening-lessons.ts",
    "!./*/matchup*.ts",
    "!./*/components/*-scenes.tsx",
    "!./stardraw/learn/**", // 별 따기 보안 배우기
    "!./stardraw/stars/**", // 별 이야기
    "!./app/stardraw/{about,stars,verify,privacy}/**", // 소개·별 이야기·검증 방법·개인정보 안내
  ],
  { query: "?raw", import: "default", eager: true },
);

/**
 * 큐브 밖 화면의 금지 문구(2026-11-20 셋째). 빈 상태 뒤에 채우는 법을 덧붙이는 꼴, 저장 위치, 옵션·대기실에서 무엇을
 * 함께 쓰는지·누가 빈자리에 앉는지 알리는 꼴, 눌러 보라는 안내. 남기는 본문(「비밀 수는 이 기기에만 남고」 같은 공정성 설명,
 * 「기록은 이 브라우저에만 있어요」 데이터를 잃을 수 있다는 경고)과 겹치지 않게 고른다
 */
const WIDE_BANNED: readonly RegExp[] = [
  /여기에 (쌓여요|생겨요)/,
  /한 판 (하고|두고|치고) 오세요/,
  /이 기기에 남겨요/,
  /(화면|기기)에만 남아요/,
  /배우기는 기록하지 않아요/,
  /흐름을 그려요/,
  /눌러 보세요/,
  /처음이라면 여기서 시작해요/,
  /여기서 실력을 키워요/,
  /여기서 고른 .*방을 열어요/,
  /빈 ?자리(는|에는) 컴퓨터.{0,6}(채워|앉아)요/,
  /판마다 (흑백|백·흑|초·한)을 바꿔요/,
  /옵션에서 바꿀 수 있어요/,
  /옵션 화면에서 고른/,
  /끝낼지 투표해요/,
  /카메라로 찍으면 바로 들어와요/,
  /크게 출렁입니다/,
  /저장해 둡니다/,
  // 2026-11-24 사용자: 값 옆 덧붙임 툴팁·설명(값과 제목은 남긴다)
  /턴 진행과 아직 나오지 않은/,
  /^내 (남은 카드|이번 판 점수와 합계)$/,
  /^남은 손패$/,
  /이 기기에 쌓인 판과 승률/,
  /끝난 게임의 가장 낮은 점수/,
  /^낮을수록 좋아요\.?$/,
  /^상대가 기권한 판$/,
  /^판에 (둔 수|놓인 돌)$/,
];

/** Cubie 앱 소스(앱이 직접 그리는 창의 글 상수와 화면) */
const APP: Record<string, string> = import.meta.glob(
  "../../cubie/Sources/**/*.swift",
  { query: "?raw", import: "default", eager: true },
);

/**
 * 금지 문구. 기록이 어디에 저장되는지(「기기에만」, 「이 기기에 저장」, 「이 기기에 남」)와
 * 어느 기록을 기준으로 매기는지(「기록 기준」, 「사이트 혼자 맞추기 기록과는 따로 매겨요」)를 알리는 안내.
 * 2026-11-20 둘째(「대체 이런 건 왜 넣는거야」): 어떻게 재는지(「키 입력이 있는 동안만 재요」), 무엇은 세지 않는지
 * (「힌트를 쓴 판이 든 5판은 티어에 넣지 않아요」, 「만드는 법을 본 판은 기록이 따로 남아요」), 기록이 어떻게
 * 생기는지(「섞고 맞추면 여기에 쌓여요」, 「Cubie에서 5판 맞추면 생겨요」), 설정으로 보내는 안내(「설정에서 키를 놓을 수 있어요」)
 */
const BANNED: readonly RegExp[] = [
  /기기에만/,
  /이 기기에 (저장|남)/,
  /기록 기준/,
  /기록과는 따로 매겨요/,
  /동안만 재(요|어요)/,
  /티어에 (넣지|들지|넣지는) 않아요/,
  /기록이 따로 남아요/,
  /여기에 쌓여요/,
  /Cubie에서 \d+판 맞추면/,
  /설정에서 키를 (놓|정|고)/,
];

/** Swift 소스의 문자열 글(주석은 뺀다). 여러 줄 글(`"""`)도 줄마다 따옴표 안을 본다 */
function swiftTexts(src: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let multi = false;
  for (const [i, raw] of src.split("\n").entries()) {
    if (multi) {
      if (raw.includes('"""')) multi = false;
      else out.push({ text: raw.trim(), line: i + 1 });
      continue;
    }
    if (/"""\s*$/.test(raw)) {
      multi = true;
      continue;
    }
    // 따옴표 밖의 `//`부터는 주석
    let inString = false;
    let cur = "";
    for (let j = 0; j < raw.length; j++) {
      const c = raw[j];
      if (inString) {
        if (c === "\\") {
          cur += c + (raw[j + 1] ?? "");
          j++;
        } else if (c === '"') {
          out.push({ text: cur, line: i + 1 });
          cur = "";
          inString = false;
        } else cur += c;
      } else if (c === '"') inString = true;
      else if (c === "/" && raw[j + 1] === "/") break;
    }
  }
  return out;
}

function problems(
  files: Record<string, string>,
  texts: (src: string) => { text: string; line: number }[],
  banned: readonly RegExp[] = BANNED,
): string[] {
  const out: string[] = [];
  for (const [file, src] of Object.entries(files))
    for (const t of texts(src))
      if (banned.some((b) => b.test(t.text)))
        out.push(`${file}:${t.line} 「${t.text}」`);
  return out;
}

describe("큐브 화면·Cubie 앱 창에 기록 저장 위치·기준 안내 문구가 없다(고정 규칙 3절)", () => {
  it("사이트 큐브 화면 글", () => {
    expect(Object.keys(SITE).length).toBeGreaterThan(50);
    expect(problems(SITE, sourceTexts)).toEqual([]);
  });

  it("Cubie 앱 글", () => {
    expect(Object.keys(APP).length).toBeGreaterThan(20);
    expect(problems(APP, swiftTexts)).toEqual([]);
  });

  it("점검이 지운 문구를 실제로 잡는다", () => {
    const site =
      'export const X = <p>기록은 이 기기에만 저장돼요.</p>;\nconst y = "Cubie 기록 기준이에요.";';
    expect(problems({ "a.tsx": site }, sourceTexts)).toEqual([
      "a.tsx:1 「기록은 이 기기에만 저장돼요.」",
      "a.tsx:2 「Cubie 기록 기준이에요.」",
    ]);
    const app =
      '  public static let deviceOnly = "Cubie 기록 기준이에요. 기록은 이 기기에만 저장돼요."\n  // 주석 속 「Cubie 기록 기준」은 보지 않는다\n  let u = "https://game.byb.kr" // 기기에만';
    expect(problems({ "A.swift": app }, swiftTexts)).toEqual([
      "A.swift:1 「Cubie 기록 기준이에요. 기록은 이 기기에만 저장돼요.」",
    ]);
  });

  it("점검이 재는 법·세지 않는 판·기록이 생기는 법 안내도 잡는다", () => {
    const site =
      '<p>Cubie는 살펴보기 없이, 큐브에 키 입력이 있는 동안만 재요.</p>\n<span title="힌트를 본 판이 든 5판은 티어에 넣지 않아요">힌트</span>\n<p>아직 기록이 없어요. 섞고 맞추면 여기에 쌓여요.</p>';
    expect(problems({ "b.tsx": site }, sourceTexts).length).toBe(3);
    const app =
      '  public static let none = "이 크기는 아직 5판 평균이 없어요. Cubie에서 5판 맞추면 생겨요."\n  public static let empty = "아직 기록이 없어요."';
    expect(problems({ "B.swift": app }, swiftTexts)).toEqual([
      "B.swift:1 「이 크기는 아직 5판 평균이 없어요. Cubie에서 5판 맞추면 생겨요.」",
    ]);
  });
});

describe("큐브 밖 게임 화면에 덧붙임 문구가 없다(고정 규칙 3절)", () => {
  it("게임·공통 화면·기록·복기·별 따기 화면 글", () => {
    expect(Object.keys(WIDE).length).toBeGreaterThan(500);
    expect(problems(WIDE, sourceTexts, WIDE_BANNED)).toEqual([]);
  });

  it("점검이 빈 상태 덧붙임·저장 위치·옵션 덧붙임·누르기 안내를 잡고, 남기는 본문은 잡지 않는다", () => {
    const src = [
      '<Card title="아직 기록이 없어요"><p>고스톱을 한 판 끝까지 치면 여기에 쌓여요.</p></Card>',
      "<p>아직 끝낸 윷놀이 판이 없어요. 한 판 하고 오세요.</p>",
      "<p>판이 끝날 때마다 이 기기에 남겨요(최근 50게임).</p>",
      '<p className="text-xs opacity-60">여러 판이면 판마다 흑백을 바꿔요.</p>',
      "<p>다함께 바둑도 여기서 고른 판 크기·덤·판 수·시간으로 방을 열어요.</p>",
      '<span className="block">빈자리는 컴퓨터가 채워요.</span>',
      "<p>이번 회차에 예측했습니다. 「지금 관측」을 눌러 보세요.</p>",
      '<span title="턴 진행과 아직 나오지 않은 점수 카드 수">3/10턴</span>',
      // 남기는 것: 빈 상태 한 문장, 공정성 설명, 데이터를 잃을 수 있다는 경고
      "<p>아직 끝낸 윷놀이 판이 없어요.</p>",
      "<p>비밀 수는 이 기기에만 남고, 상대에게는 잠긴 약속만 가요.</p>",
      "<p>기록은 이 브라우저에만 있어요. 브라우저 데이터를 지우면 함께 사라지니, 가끔 내보내 두세요.</p>",
    ].join("\n");
    expect(
      problems({ "c.tsx": src }, sourceTexts, WIDE_BANNED).map(
        (p) => p.split(" ")[0],
      ),
    ).toEqual([
      "c.tsx:1",
      "c.tsx:2",
      "c.tsx:3",
      "c.tsx:4",
      "c.tsx:5",
      "c.tsx:6",
      "c.tsx:7",
      "c.tsx:8",
    ]);
  });
});
