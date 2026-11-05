// 과정마다 전체 흐름을 보이는 단계 지도(2026-11-04 사용자 요청 「전체 몇 단계로 맞추게 되는지 흐름을 쭉 보여 주고 진행」).
// 과정 시작(준비 단원 뒤)에 지도 단원을 붙이고, 단원 머리에는 「n단계 중 k단계」 띠를 보인다.
// 시연 수는 단계마다 나눠 둔다: 풀이 함수(`@game/cube-ai`)가 단계 꼬리표대로 푼 것을 옮겨 적었고,
// 풀이 함수와 순서가 다른 초보자 과정은 단원의 공식으로 짰다. stage-map.test.ts가 단계 끝마다 그 단계 목표가 되는지 본다.
import { invertAlg } from "./notation";
import type {
  Course,
  CourseStage,
  Lesson,
  LessonStep,
  QuizSpec,
} from "./types";

export interface StageDemo {
  /** 맞춘 큐브에서 섞는 수 */
  scramble: string;
  /** 단계마다 푸는 수(stages와 같은 차례) */
  moves: string[];
  /** 수를 낸 곳(풀이 함수 이름과 꼬리표 묶음, 또는 「단원 공식」) */
  source: string;
}

export interface StageSpec {
  stages: CourseStage[];
  demo?: StageDemo;
  /** 지도 단원에 더할 고르기 문제(자동 「다음 단계」 문제 뒤) */
  quizzes?: QuizSpec[];
}

/** 같은 공식 k번 */
const reps = (alg: string, k: number) =>
  Array.from({ length: k }, () => alg).join(" ");
const TW = "R' D' R D";
const RIGHT = "U R U' R' U' F' U F";
const FROM_RIGHT = "U' F' U F U R U' R'";
const EO = "F R U R' U' F'";
const SUNE = "R U R' U R U2 R'";
const EDGE_SWAP = `${SUNE} U`;
const CYCLE = "U R U' L' U R' U' L";
const A_PERM = "R' F R' B2 R F' R' B2 R2";

/**
 * 풀이 수들의 거꾸로를 섞기로 쓴다(맞춘 큐브에서 섞기 → 풀이 = 맞춤). 풀이 속 큐브 돌리기(x·y·z)를 앞에 먼저 두어
 * 섞기 전체의 돌리기가 없어지게 한다. 그래야 섞인 큐브가 기본 방향(흰 위·초록 앞)으로 시작하고, 끝은 돌려 쥔 채 맞은 모양이다
 */
function scrambleFor(moves: string[]): string {
  const all = moves.join(" ");
  const turns = all
    .split(/\s+/)
    .filter((t) => /^[xyz]/.test(t))
    .join(" ");
  return `${turns} ${invertAlg(all)}`.trim();
}

// 3×3 초보자: 흰 십자 → 첫 층 코너(흰 면 위) → 뒤집고 둘째 층 → 노란 십자 → 옆면 → 코너 자리 → 방향
const BEGINNER_333_MOVES = [
  "D' F2 y F D' F' y F y F2 D y F2",
  `D ${TW} y' ${reps(TW, 3)} y' D2 ${reps(TW, 5)} y' D' ${TW}`,
  `z2 U ${RIGHT} U2 y' ${FROM_RIGHT} y2 ${RIGHT} U' y' ${FROM_RIGHT}`,
  `${EO} U2 ${EO} ${EO}`,
  `U ${EDGE_SWAP} U' y' ${EDGE_SWAP}`,
  `${CYCLE} y' ${CYCLE}`,
  `${reps(TW, 2)} U ${reps(TW, 2)} U ${reps(TW, 2)} U2`,
];

const FROM333_222_MOVES = [
  `${TW} D ${reps(TW, 3)} y ${reps(TW, 5)} y D' ${TW}`,
  `z2 U ${CYCLE} y' ${CYCLE}`,
  `${reps(TW, 2)} U ${reps(TW, 4)} U'`,
];

const BEGINNER_222_MOVES = [
  `${TW} D ${reps(TW, 3)} y ${reps(TW, 5)} y D' ${TW}`,
  `z2 U ${SUNE} ${SUNE}`,
  `U ${A_PERM} U2`,
];

// 풀이 함수가 낸 수(대회 섞기 3×3 씨앗 21, 4×4·5×5 씨앗 3)
const CFOP_SCRAMBLE =
  "L2 D2 U' L2 F2 D F2 U2 B2 D' L' F' R2 B U' F2 U R B L R2";

export const STAGE_SPECS: Record<string, StageSpec> = {
  "333-beginner": {
    stages: [
      {
        title: "흰 십자",
        lessons: ["333-safe-turns", "333-white-cross"],
        goal: "white-cross",
      },
      {
        title: "첫 층 코너",
        lessons: ["333-first-corners-up"],
        goal: "first-layer",
      },
      {
        title: "둘째 층 엣지",
        lessons: ["333-second-layer"],
        goal: "second-layer",
      },
      { title: "노란 십자", lessons: ["333-ll-cross"], goal: "yellow-cross" },
      { title: "옆면 맞추기", lessons: ["333-ll-edges"], goal: "yellow-edges" },
      {
        title: "코너 자리",
        lessons: ["333-ll-corner-place"],
        goal: "ll-corners-placed",
      },
      {
        title: "코너 방향",
        lessons: ["333-ll-corner-twist"],
        goal: "solved",
      },
    ],
    demo: {
      scramble: scrambleFor(BEGINNER_333_MOVES),
      moves: BEGINNER_333_MOVES,
      source: "단원 공식",
    },
    quizzes: [
      {
        question:
          "마지막 단계(코너 방향)에서 다시 쓰는 공식은 몇 단계에서 처음 배우나요?",
        choices: ["2단계(첫 층 코너)", "4단계(노란 십자)", "6단계(코너 자리)"],
        answer: 0,
        why: "첫 층 코너에서 쓴 R' D' R D를 마지막에 다시 써요.",
      },
      {
        question: "끝까지 맞추는 데 외울 공식은 모두 몇 개일까요?",
        choices: ["여섯 개", "열두 개", "스무 개 넘게"],
        answer: 0,
        why: "R' D' R D, 둘째 층 넣기 둘(앞에서·오른쪽에서), F R U R' U' F', R U R' U R U2 R' U, U R U' L' U R' U' L. 단계마다 같은 공식을 여러 번 써요.",
      },
    ],
  },
  "222-beginner": {
    stages: [
      {
        title: "첫 층",
        lessons: ["222-first-layer-up"],
        goal: "2x2-first-layer",
      },
      { title: "윗면", lessons: ["222-top-face"], goal: "2x2-top-face" },
      { title: "윗층 자리", lessons: ["222-top-layer"], goal: "solved" },
    ],
    demo: {
      scramble: scrambleFor(BEGINNER_222_MOVES),
      moves: BEGINNER_222_MOVES,
      source: "단원 공식",
    },
    quizzes: [
      {
        question: "2×2 첫 층에서 되풀이하는 공식은?",
        choices: ["R' D' R D", "F R U R' U' F'"],
        answer: 0,
        why: "3×3 첫 층 코너와 같은 R' D' R D예요. 2×2에는 엣지가 없어 노란 십자 공식은 안 써요.",
      },
    ],
  },
  "222-from333": {
    stages: [
      {
        title: "첫 층",
        lessons: ["222-from333-first-layer-up"],
        goal: "2x2-first-layer",
      },
      {
        title: "코너 자리",
        lessons: ["222-from333-corner-place"],
        goal: "2x2-corners-placed",
      },
      {
        title: "코너 방향",
        lessons: ["222-from333-corner-twist"],
        goal: "solved",
      },
    ],
    demo: {
      scramble: scrambleFor(FROM333_222_MOVES),
      moves: FROM333_222_MOVES,
      source: "단원 공식",
    },
    quizzes: [
      {
        question: "이 세 단계는 3×3 초보자 과정의 어느 단계와 같을까요?",
        choices: [
          "첫 층 코너·코너 자리·코너 방향",
          "흰 십자·둘째 층 엣지·노란 십자",
        ],
        answer: 0,
        why: "2×2는 코너뿐이라 3×3의 코너 단계만 남아요.",
      },
    ],
  },
  cfop: {
    stages: [
      { title: "십자", lessons: ["cfop-cross"], goal: "cross" },
      { title: "F2L(짝 넷)", lessons: ["cfop-f2l-pair"], goal: "f2l" },
      { title: "OLL", lessons: ["cfop-2look-oll"], goal: "oll" },
      { title: "PLL", lessons: ["cfop-2look-pll"], goal: "solved" },
    ],
    demo: {
      scramble: CFOP_SCRAMBLE,
      moves: [
        "z2 L' B R L2 F' D",
        "F L2 F2 L2 F' B2 R' U2 R U2 B2 B' R B' R' B2 U F' U2 F R U R'",
        "U R U R' U R U2 R'",
        "U R U R' U' D R2 U' R U' R' U R' U R2 D' U",
      ],
      source: "solveCfop(cross · f2l-1~4 · oll · pll)",
    },
    quizzes: [
      {
        question: "처음 배울 때 OLL은 두 번에 나눠요. 먼저 맞추는 것은?",
        choices: ["엣지 방향(노란 십자)", "코너 방향"],
        answer: 0,
        why: "2단계 OLL은 노란 십자를 먼저, 그다음 코너를 노랗게 해요. PLL도 코너 자리 → 엣지 자리 두 번으로 나눠요.",
      },
    ],
  },
  roux: {
    stages: [
      { title: "첫 블록", lessons: ["roux-fb"], goal: "roux-fb" },
      { title: "둘째 블록", lessons: ["roux-sb"], goal: "roux-sb" },
      { title: "CMLL", lessons: ["roux-cmll"], goal: "cmll" },
      { title: "LSE", lessons: ["roux-lse"], goal: "solved" },
    ],
    demo: {
      scramble: CFOP_SCRAMBLE,
      moves: [
        "z2 y B L D R2 U F M F",
        "Rw2 U M2 U R2 U M2 U2 Rw U R'",
        "U R U2 R' U' R U' R' U2",
        "M2 U' M' U M M2 U' M U2 M U' U2 M U2 M2 U2 M U2",
      ],
      source: "solveRoux(fb · sb · cmll · lse-eo·lse-ulur·lse-ep)",
    },
    quizzes: [
      {
        question: "마지막 LSE에서 돌리는 것은?",
        choices: ["가운데 줄(M)과 윗면(U)만", "오른쪽(R)과 앞(F)"],
        answer: 0,
        why: "두 블록과 코너를 지키려면 M과 U만 돌려요.",
      },
    ],
  },
  zz: {
    stages: [
      { title: "EO라인", lessons: ["zz-eo", "zz-eoline"], goal: "eoline" },
      { title: "블록(F2L)", lessons: ["zz-f2l"], goal: "f2l" },
      { title: "마지막 층", lessons: ["zz-ll"], goal: "solved" },
    ],
    demo: {
      scramble: CFOP_SCRAMBLE,
      moves: [
        "z2 F U D L B U2 F'",
        "L U R U' L' U2 L' U' L U L' R' U2 R2 U2 R' U2 R' U' R U' R' U2 R'",
        "U' Rw U R' U' Rw' F R F' U M' U M2 U M2 U M' U2 M2",
      ],
      source: "solveZZ(eoline · zz-left·zz-right · oll·pll)",
    },
    quizzes: [
      {
        question: "EO라인을 만든 뒤 블록에서 돌리는 면은?",
        choices: ["R·U·L만", "F·B도 자주"],
        answer: 0,
        why: "F·B를 4분의 1 돌리면 엣지 방향이 깨져요. 그래서 R·U·L만으로 블록을 쌓아요.",
      },
    ],
  },
  "444-reduction": {
    stages: [
      { title: "센터", lessons: ["444-centers"], goal: "centers" },
      { title: "엣지 짝", lessons: ["444-edges"], goal: "edges-paired" },
      {
        title: "3×3처럼(패리티)",
        lessons: ["444-as-333"],
        goal: "solved",
      },
    ],
    demo: {
      scramble:
        "Uw2 U2 F U' Uw' F D2 R2 F' D' U' Uw2 F Rw R' Uw R2 Uw F' Rw2 F' U Rw' R' Fw2 Uw' L' Uw2 D2 L Uw2 U F Rw' B2 Uw Rw B U2 L2",
      moves: [
        "2R B2 2R' F' 2R U 2R' R 2F R' 2F' 2R' D2 2R 2F L2 2F' D 2F D' 2F' 2U' R 2U B 2R2 F' 2R2 L' 2U2 L2 2U2 B' 2U' L2 2U",
        "F' 2D' F D' F' 2D2 L' U' L 2D' F 2U F' D' F 2U' R 2D' R U R' 2D U2 F 2U' R D2 R' 2U",
        "z2 F' R F D F' D L' D2 B D R U R' U' R U R' U' R U R' U' y U R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' y2 U' R U R' U' R U R' U' R U R' U' y' R U R' U' R U R' U' R U R' U' R U R' U' y U R U' R' U' F' U F y' U2 L' U L U F U' F' y' U2 L' U L U F U' F' 2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2 F U R U' R' F' U R U R' U R U2 R' U' R U R' U R U2 R' 2R2 U2 2R2 Uw2 2R2 2U2 R' F R' B2 R F' R' B2 R2 U2 y R U' R U R U R U' R' U' R' U' R U R U R U' R' U' R2",
      ],
      source: "solveHuman(beginner, 4)(centers-* · edges · 나머지)",
    },
    quizzes: [
      {
        question: "3×3처럼 풀 때 4×4에서만 생길 수 있는 것은?",
        choices: [
          "패리티(엣지 하나가 뒤집히거나 둘이 바뀜)",
          "센터가 다시 흐트러짐",
        ],
        answer: 0,
        why: "4×4는 센터·엣지를 묶어 3×3처럼 풀지만, 3×3에는 없는 패리티가 나올 수 있어요.",
      },
    ],
  },
  "555-reduction": {
    stages: [
      { title: "센터", lessons: ["555-centers"], goal: "centers" },
      {
        title: "엣지 셋 묶기",
        lessons: ["555-edges", "555-last-two-edges"],
        goal: "edges-paired",
      },
      { title: "3×3처럼", lessons: [], goal: "solved" },
    ],
    demo: {
      scramble:
        "Rw2 U2 B2 U' Lw B' D' L Uw2 R2 D Rw2 B' Lw2 Fw2 L' Rw Uw Lw' Uw2 U Fw2 L' Bw Lw B Rw2 D' F2 Rw' U B' Fw2 Dw Rw Lw2 Dw Uw' U' F2 Uw2 Fw F' B2 Uw' Lw Fw Dw' F2 Rw B2 Bw' Fw2 Rw2 Bw2 Lw U' Uw2 Fw2 F",
      moves: [
        "2R U2 2R2 F 2R 2L' U 2L 2B' U' 2B 2R2 U' 2R2 E' L 2B' L' E L 2B L' B M B 2L' B' M' B 2L B' 2L D 2L' D 2F L' 2F' 2L B 2L' D2 2F' R 2F E' R 2F R' E R 2F' R' 2U B2 2U F2 2U2 R 2U R 2U' L' 2U B 2U' L' 2U2 R2 2U R2 2U 2L' U' 2L 2D 2L' U 2L 2D' R' E' F' 2U' F E F' 2U F2 E' F 2D' F' E F 2D F'",
        "2D F' U F 2D' 2U' R D' R' 2U R 2U' R' D R 2U R 2U F D F' 2U' U L 2D R U R' 2D' R' 2D' F U' F' 2D B 2U F' U F 2U' F' 2U F D2 F' 2U' B 2U' L U2 L' 2U R 2U B U' B' 2U' 2F2 R2 U2 2B U2 2F' U2 2F U2 L2 2F L2 2B' R2 2F2 U' F 2D' R F' U R' F 2D",
        "z2 L' F' D B' D' B D F' D' y R U R' U' R U R' U' R U R' U' y' U R U R' U' R U R' U' R U R' U' y' U R U R' U' R U R' U' R U R' U' y' R U R' U' R U R' U' R U R' U' R U R' U' L' U L U F U' F' y2 U L' U L U F U' F' y U2 L' U L U F U' F' y2 U' L' U L U F U' F' F R U R' U' F' U' R U R' U R U2 R' U2 R U R' U R U2 R' U2 R' F R' B2 R F' R' B2 R2 U y R U' R U R U R U' R' U' R2",
      ],
      source: "solveHuman(beginner, 5)(centers-* · edges·last-edges · 나머지)",
    },
    quizzes: [
      {
        question: "5×5에서 움직이지 않는 칸은?",
        choices: ["면마다 한가운데 칸", "센터 둘레 칸"],
        answer: 0,
        why: "한가운데 칸은 3×3 센터처럼 고정이라 면 색을 정해 줘요. 둘레 칸은 움직여요.",
      },
    ],
  },
  "444-yau": {
    stages: [
      { title: "흰·노랑 센터", lessons: ["yau-ud-centers"] },
      { title: "흰 십자 셋", lessons: ["yau-cross3"] },
      { title: "옆 센터", lessons: ["yau-side-centers"] },
      { title: "엣지 묶기", lessons: ["yau-edges"] },
      { title: "3×3처럼", lessons: ["yau-finish"] },
    ],
  },
  "bld-op": {
    stages: [
      { title: "외우기", lessons: ["bld-letters"] },
      { title: "엣지", lessons: ["bld-edges"] },
      { title: "코너", lessons: ["bld-corners", "bld-parity"] },
    ],
    quizzes: [
      {
        question: "블라인드에서 큐브를 보는 때는?",
        choices: ["외우기 단계에서만", "맞추는 내내"],
        answer: 0,
        why: "외운 뒤에는 눈을 가리고 외운 글자 차례대로 엣지, 코너를 맞춰요.",
      },
    ],
  },
};

/** 「○ 다음에 할 단계는?」 고르기(답은 가운데에 둔다) */
function nextStageQuiz(stages: CourseStage[]): QuizSpec {
  const [a, b, c] = stages.map((s) => s.title);
  const last = stages.at(-1)?.title as string;
  const wrong = stages.length > 3 ? last : (c as string);
  return {
    question: `「${a}」 다음에 할 단계는?`,
    choices: [
      wrong,
      b as string,
      stages.length > 3 ? (c as string) : (a as string),
    ],
    answer: 1,
    why: `${stages.map((s) => s.title).join(" → ")} 차례예요.`,
  };
}

export const mapLessonId = (courseId: string) => `${courseId}-map`;

/** 지도 단원: 단계 시연(있으면) → 「다음 단계」 → 과정 고르기 */
export function mapLesson(course: Course, spec: StageSpec): Lesson {
  const order = spec.stages.map((s) => s.title).join(" → ");
  const steps: LessonStep[] = [];
  if (spec.demo)
    steps.push({
      kind: "demo",
      stageMap: true,
      body: `섞인 큐브가 ${spec.stages.length}단계를 거쳐 맞춰져요(${order}). 단계마다 멈춰요. 띠의 칸을 누르거나 「다음 단계」로 이어 보세요.`,
      setup: { alg: spec.demo.scramble },
      alg: spec.demo.moves.join(" "),
    });
  const quizzes = [nextStageQuiz(spec.stages), ...(spec.quizzes ?? [])];
  quizzes.forEach((quiz, i) => {
    steps.push({
      kind: "quiz",
      body:
        i === 0
          ? `이 과정은 ${spec.stages.length}단계로 맞춰요. 단원마다 위쪽 띠에 지금 몇 단계인지 보여요.`
          : "띠를 보며 답해 보세요.",
      ...(spec.demo ? { setup: { alg: spec.demo.scramble } } : {}),
      mask: "all",
      quiz,
    });
  });
  return {
    id: mapLessonId(course.id),
    size: course.size,
    title: "전체 흐름",
    summary: `${spec.stages.length}단계로 맞춰요: ${order}.`,
    stageMap: true,
    steps,
  };
}

/** 과정에 단계를 달고, 첫 단계 단원 앞(준비 단원 뒤)에 지도 단원을 끼운다 */
export function withStages(course: Course, spec: StageSpec): Course {
  const staged = new Set(spec.stages.flatMap((s) => s.lessons));
  const first = course.lessons.findIndex((l) => staged.has(l.id));
  const at = first < 0 ? course.lessons.length : first;
  const lessons = [...course.lessons];
  lessons.splice(at, 0, mapLesson(course, spec));
  return {
    ...course,
    lessons,
    stages: spec.stages,
    ...(spec.demo
      ? {
          stageDemo: {
            scramble: spec.demo.scramble,
            moves: spec.demo.moves,
          },
        }
      : {}),
  };
}

export type LessonPlace =
  | { kind: "prep" }
  | { kind: "map" }
  | { kind: "stage"; index: number }
  | { kind: "after" };

/** 과정 안에서 단원의 자리(띠에 보일 꼬리표) */
export function lessonPlace(course: Course, lessonId: string): LessonPlace {
  const stages = course.stages ?? [];
  const index = stages.findIndex((s) => s.lessons.includes(lessonId));
  if (index >= 0) return { kind: "stage", index };
  if (lessonId === mapLessonId(course.id)) return { kind: "map" };
  const map = course.lessons.findIndex((l) => l.id === mapLessonId(course.id));
  const me = course.lessons.findIndex((l) => l.id === lessonId);
  return map >= 0 && me < map ? { kind: "prep" } : { kind: "after" };
}
