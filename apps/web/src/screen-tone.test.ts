/*
 * 게임 화면 글 말투(docs/standing-rules.md 3절): 상태 줄·안내·규칙 한눈에·옵션 설명·컴퓨터 단계 설명·업적·기록 화면 글은
 * 해요체 + 마침표 문장이거나, 사실을 「·」로 이은 마침표 없는 꼬리표다. 판정은 대국·다시 보기 해설과 같은
 * `lineProblems`(review/tone.ts). 제목·단추 이름·칩은 서술어로 끝나지 않아 저절로 걸리지 않는다.
 * 컴포넌트 안에 박힌 글까지 보려고 소스 파일에서 글을 뽑아(`lib/source-texts.ts`) 본다.
 */
import { describe, expect, it } from "vitest";
import { sourceTexts } from "@/lib/source-texts";
import { lineProblems } from "@/review/tone";
import { sentenceProblem, sentencesOf } from "@/study/tone";

const files: Record<string, string> = import.meta.glob(
  [
    "./{baduk,baseball,chess,galaxy,game,gostop,hearts,hwatu,janggi,minhwatu,nyrongppong,omok,onecard,yut,review,stats,components}/**/*.{ts,tsx}",
    "./net/{audit-text,bot-plan}.ts", // 판 끝 검증 알림 글(그 밖의 net 검증 실패 사유는 아직 해라체, docs/standing-rules.md 3절)
    "!./**/*.test.{ts,tsx}",
    // 따로 정한 말투나 따로 보는 시험이 있는 글
    "!./components/learn/**", // 보안 배우기: 학습 글, learn-terms.test.tsx
    "!./components/security/**", // 보안 설명(/security)
    "!./components/AboutScreen.tsx", // 사이트 소개
    "!./components/brand/**", // 사이트 이름·검색 설명(꾸밈 글)
    "!./components/tutorial/**",
    "!./components/study/**",
    "!./*/tutorial.ts", // 튜토리얼(해요체로 써 있고, 용어 순서 시험이 본다)
    "!./*/tutorial/**",
    "!./*/components/*-tutorial.tsx",
    "!./*/study*.ts", // 수 배우기: study-text.test.ts
    "!./*/opening-lessons.ts",
    "!./*/matchup*.ts",
    "!./*/components/*-scenes.tsx",
    "!./chess/mate3-suite.ts",
    "!./chess/endgame*.ts",
    "!./galaxy/star-facts.ts", // 별 이야기(별 따기의 별 한 줄 이야기와 같은 말투, docs/48 「더 보기」)
    "!./galaxy/components/Sources.tsx", // 출처 목록(서지 표기)
    "!./galaxy/star-quiz.ts",
    "!./galaxy/components/GalaxyStarQuiz.tsx",
    "!./review/commentary-tone-suite.ts", // 시험 틀
    "!./hwatu/card-table-sim.ts", // 시험·시연용 흉내
    "!./*/fair-room-fixture.ts",
    "!./*/*-fixture.ts", // 시험 자료
  ],
  { query: "?raw", import: "default", eager: true },
);

/** 서술어처럼 끝나지만 이름인 낱말(공약 「노기루다」, 무늬 첫 글자 「다」) */
const NAMES = ["노기루다", "다"];
/** 제목·단추 이름 자리(속성 이름). 문장이 아니라 보지 않는다 */
const LABEL_KEYS = new Set(["label", "title"]);

const HANGUL = /[가-힣]/;
/** 합쇼체 끝말(「~니다」)은 글 어디에 있어도 해요체가 아니다(「선입니다 — 낼 카드를…」, 「못했습니다: …」) */
const FORMAL = /[가-힣]+니다(?![가-힣])/g;
/** 「—」 앞에서 끝나는 해라체 문장(「끝났다 — 다시…」) */
const PLAIN_BEFORE_DASH = /[가-힣]+(?<!니)다(?=\s*—)/g;
/** 글 끝에서 서술어로 끝났는가(뒤에 단추 같은 태그가 이어져도 문장이 끝난 것) */
const ENDS_AS_SENTENCE = /(다|요|죠)$/;

type Text = { text: string; whole: boolean; beforeTag?: boolean };

/**
 * 글 하나의 어긋난 곳. 이어지는 글(`whole: false`)은 끝 조각을 빼고 끝난 문장만 본다.
 * 다만 뒤에 여는 태그가 오고 끝 조각이 서술어로 끝나면(「방장이 방을 나갔어요 <button>」) 문장 끝으로 본다.
 * 한글이 없는 조각(「○.」)과, 끝말을 템플릿 자리가 만드는 문장(「평균 ${copula(…)}.」)은 볼 수 없어 건너뛴다
 */
function textProblems({ text, whole, beforeTag }: Text): string[] {
  if (NAMES.includes(text)) return [];
  const out = [
    ...[...text.matchAll(FORMAL)].map((m) => `합쇼체: ${m[0]} (${text})`),
    ...[...text.matchAll(PLAIN_BEFORE_DASH)]
      .filter((m) => !NAMES.includes(m[0]))
      .map((m) => `해라체: ${m[0]} (${text})`),
  ];
  const sentences = sentencesOf(text).filter(
    (s) =>
      HANGUL.test(s.replace(/○/g, "")) && !/○\)?(\([^()]*\))?[.!?]?$/.test(s),
  );
  if (whole) return [...out, ...sentences.flatMap(lineProblems)];
  if (!/[.!?]$/.test(text)) {
    const tail = sentences.pop();
    if (tail && beforeTag && ENDS_AS_SENTENCE.test(tail))
      out.push(`마침표 없는 문장: ${tail}`);
  }
  for (const s of sentences) {
    const p = sentenceProblem(s);
    if (p) out.push(`${p}: ${s}`);
  }
  return out;
}

describe("게임 화면 글 말투", () => {
  const whole = (text: string) => textProblems({ text, whole: true });

  it("문장은 해요체 마침표, 꼬리표는 서술어 없이", () => {
    expect(whole("기권했어요")).toEqual(["마침표 없는 문장: 기권했어요"]);
    expect(whole("먼저 둔다.")).toEqual(["해요체 아님: 먼저 둔다."]);
    expect(whole("기권했어요.")).toEqual([]);
    expect(whole("3판 · 민준 차례")).toEqual([]);
    expect(whole("노기루다")).toEqual([]);
  });

  it("합쇼체와 「—」 앞 해라체는 글 가운데에서도 걸린다", () => {
    expect(whole("내가 선입니다 — 낼 카드를 고르세요.")).toEqual([
      "합쇼체: 선입니다 (내가 선입니다 — 낼 카드를 고르세요.)",
    ]);
    expect(whole("끝났다 — 다시 해요.")).toEqual([
      "해라체: 끝났다 (끝났다 — 다시 해요.)",
    ]);
  });

  it("이어지는 글은 끝 조각을 보지 않는다", () => {
    expect(
      textProblems({ text: "규칙을 따랐어요. 공정성은", whole: false }),
    ).toEqual([]);
    expect(
      textProblems({ text: "규칙을 따랐다. 공정성은", whole: false }),
    ).toEqual(["해요체 아님: 규칙을 따랐다."]);
  });

  it("뒤에 단추가 이어져도 서술어로 끝난 글은 문장이다", () => {
    expect(
      textProblems({
        text: "방장이 방을 나갔어요",
        whole: false,
        beforeTag: true,
      }),
    ).toEqual(["마침표 없는 문장: 방장이 방을 나갔어요"]);
    expect(
      textProblems({ text: "내 등수는", whole: false, beforeTag: true }),
    ).toEqual([]);
  });

  it("모든 게임 화면 파일", () => {
    const out: string[] = [];
    for (const [path, src] of Object.entries(files)) {
      for (const t of sourceTexts(src))
        if (!LABEL_KEYS.has(t.key ?? ""))
          for (const p of textProblems(t))
            out.push(`${path.slice(2)}:${t.line} ${p}`);
    }
    expect(out).toEqual([]);
  });
});
