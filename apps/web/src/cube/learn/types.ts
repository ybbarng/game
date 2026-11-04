// 큐브 맞추기 배우기·훈련 자료의 모양(docs/47 8절). 화면과 엔진은 이 자료를 읽기만 한다.
// 공식은 모두 WCA 표기 문자열이다(R U R' U', Rw, 2R, M E S, x y z). 기본 방향은 위 흰색·앞 초록·오른쪽 빨강.

export type CubeSize = 2 | 3 | 4 | 5;

/**
 * 맞아 있어야 할 조각 묶음 이름. "직접 해보기"의 통과 조건이다.
 * 엔진에서 구현할 것: 각 이름을 "어느 조각이 가운데 색 기준으로 제자리·제방향인가"로 판정한다.
 * 큐브를 어느 쪽으로 들고 있든 가운데 색으로 본다(흰 십자는 흰 가운데가 위든 아래든 같다).
 */
export const GOALS = {
  solved: "다 맞춤",
  "white-cross": "흰 십자(흰 모서리 넷이 옆 가운데 색까지 맞음)",
  cross: "십자(CFOP: 흰 모서리 넷, 흰 면이 아래)",
  "first-layer": "첫 층(흰 십자 + 흰 꼭짓점 넷)",
  "second-layer": "둘째 층까지(첫 층 + 가운데 줄 모서리 넷)",
  f2l: "F2L(아래 두 층 전부)",
  "f2l-pair:FR": "앞-오른쪽 칸 짝(꼭짓점+모서리)",
  "f2l-pair:FL": "앞-왼쪽 칸 짝",
  "f2l-pair:BR": "뒤-오른쪽 칸 짝",
  "f2l-pair:BL": "뒤-왼쪽 칸 짝",
  "yellow-cross": "노란 십자(아래 두 층 + 윗면 모서리 넷이 노란색 위)",
  oll: "윗면 한 색(아래 두 층 + 윗면 아홉 칸이 노랑)",
  "yellow-corners":
    "위 꼭짓점 자리까지(윗면 노랑 + 꼭짓점 넷이 제자리, 윗면 돌리기로 맞출 수 있으면 됨)",
  ll: "윗층까지 다 맞음(윗면 돌리기 하나 남아도 됨)",
  "2x2-first-layer": "2×2 첫 층(흰 꼭짓점 넷이 옆색까지 맞음)",
  "2x2-top-face": "2×2 윗면 한 색(첫 층 + 윗면 노랑)",
  "2x2-first-face": "2×2 오르테가 첫 면(흰 칸 넷이 한 면, 옆색은 안 봄)",
  "2x2-both-faces": "2×2 오르테가 위아래 면(흰 면·노란 면 모두, 옆색은 안 봄)",
  centers: "큰 큐브 가운데 맞춤(면마다 가운데 조각이 한 색)",
  "edges-paired":
    "큰 큐브 모서리 묶기(가운데 + 모서리 조각이 같은 색끼리 한 줄)",
  "edge-pair:UF": "큰 큐브 모서리 한 줄(위-앞 자리 날개가 한 색끼리 붙음)",
  "edges-ten":
    "큰 큐브 모서리 열 줄 묶기(가운데 맞음, 안 묶인 줄이 둘 이하. 마지막 둘은 따로 배운다)",
  // 다른 해법(judge-methods.ts). 자리는 지금 들고 있는 방향으로 본다
  "roux-fb": "루 첫 블록(왼쪽 1×2×3)",
  "roux-sb": "루 두 블록(왼쪽·오른쪽 1×2×3)",
  cmll: "두 블록 + 위 꼭짓점(윗면 돌리기 하나는 남아도 됨)",
  "lse-eo": "위 꼭짓점까지 + 모서리 방향(흰·노랑 칸이 위아래)",
  "lse-ulur": "모서리 방향 + 왼쪽·오른쪽 위 모서리",
  eo: "모서리 방향(나쁜 모서리 없음)",
  eoline: "EO라인(모서리 방향 + 아래 앞·뒤 모서리)",
  "zz-left": "EO라인 + 왼쪽 블록",
  "petrus-222": "페트루스 2×2×2(왼쪽-뒤-아래)",
  "petrus-223": "페트루스 2×2×3(왼쪽 아래 두 층)",
  "yau-ud-centers": "4×4 흰·노랑 가운데(맞은편 두 면)",
  "yau-cross3": "4×4 흰·노랑 가운데 + 흰 십자 모서리 셋",
  "yau-centers": "4×4 가운데 여섯 + 흰 십자 모서리 셋",
  "yau-cross": "4×4 가운데 여섯 + 흰 십자 모서리 넷",
} as const;
export type GoalName = keyof typeof GOALS;

/**
 * 가리기(마스크) 이름. 「가리기」 모드에서 색으로 보일 스티커 묶음이고, 나머지는 까맣게 한다.
 * 엔진에서 구현할 것: 스티커마다 「보임 / 까맣게 / 회색」을 돌려주는 함수(docs/47 2-3).
 */
export const MASKS = {
  cross: "십자 모서리와 가운데만 보임",
  "first-layer": "첫 층(십자 + 꼭짓점)과 가운데만 보임",
  f2l: "아래 두 층과 가운데만 보임",
  oll: "아래 두 층 + 윗면의 노란 칸만 보임(윗층 옆면은 회색)",
  pll: "아래 두 층 + 윗층 전부 보임(윗면은 회색으로 둬도 됨)",
  all: "모두 보임(가리지 않음)",
  "roux-fb": "루 첫 블록(흰 면 아래로 쥐었을 때 왼쪽 블록)과 가운데만 보임",
  "roux-blocks": "루 두 블록과 가운데만 보임",
  cmll: "루 두 블록 + 위 꼭짓점만 보임(나머지 모서리는 회색)",
  "eo-edges": "모서리와 가운데만 보임(꼭짓점은 회색)",
} as const;
export type MaskName = keyof typeof MASKS;

/**
 * 스스로 섞기 규칙. 「보통 큐브」 모드에서 상황을 무작위로 만든다(docs/47 2-3 일부만 섞기).
 * 엔진에서 구현할 것: 맞아 있어야 할 조각은 그대로 두고 나머지만 맞출 수 있는 조건 안에서 섞는다.
 */
export const SCRAMBLE_RULES = {
  "random-cross": "모두 섞음(십자 연습)",
  "cross-solved": "흰 십자만 맞음, 나머지 섞음",
  "first-layer-solved": "첫 층만 맞음",
  "second-layer-solved": "아래 두 층 맞음, 윗층만 섞음",
  "f2l-solved": "F2L 맞음, 윗층만 섞음(OLL 연습)",
  "oll-solved": "F2L과 윗면 맞음, 윗층 자리만 섞음(PLL 연습)",
  "yellow-cross-solved": "아래 두 층과 노란 십자 맞음",
  "yellow-face-solved": "아래 두 층과 윗면 맞음(꼭짓점 자리 연습)",
  "corners-placed": "윗층 꼭짓점까지 맞음(모서리 자리 연습)",
  "f2l-one-slot": "십자와 F2L 칸 셋 맞음, 앞-오른쪽 짝만 흩어짐",
  "2x2-random": "2×2 모두 섞음",
  "2x2-first-layer-solved": "2×2 첫 층 맞음",
  "2x2-top-face-solved": "2×2 첫 층과 윗면 맞음",
  "4x4-random": "4×4 모두 섞음",
  "4x4-centers-solved": "4×4 가운데만 맞음",
  "4x4-reduced": "4×4 가운데와 모서리 묶기까지 맞음(3×3처럼 풀기)",
  "5x5-random": "5×5 모두 섞음",
  "5x5-centers-solved": "5×5 가운데만 맞음",
  "5x5-two-edges-left": "5×5 모서리 둘만 남음",
  "bld-random": "블라인드 연습용 모두 섞음",
  "roux-fb-solved": "루 첫 블록만 맞음(흰 면 아래)",
  "roux-blocks-solved": "루 두 블록 맞음",
  "roux-cmll-solved": "루 두 블록과 꼭짓점 모두 맞음(LSE 연습)",
  "roux-eo-solved": "루 LSE 모서리 방향까지 맞음(M2·U로 섞음)",
  "roux-ulur-solved": "루 왼쪽·오른쪽 위 모서리까지 맞음(가운데 줄만 섞임)",
  "zz-eoline-solved": "ZZ EO라인 맞음(R·U·L로 섞음)",
  "4x4-yau-ud-centers": "4×4 흰·노랑 가운데만 맞음",
  "4x4-yau-cross3": "4×4 흰·노랑 가운데와 흰 십자 모서리 셋 맞음",
  "4x4-yau-centers": "4×4 가운데 여섯과 흰 십자 모서리 셋 맞음",
  "4x4-yau-cross": "4×4 가운데 여섯과 흰 십자 모서리 넷 맞음",
} as const;
export type ScrambleRule = keyof typeof SCRAMBLE_RULES;

/** 상황 만들기: 맞춘 큐브에 적용할 공식, 또는 스스로 섞기 규칙 */
export type LessonSetup = { alg: string } | { rule: ScrambleRule };

/**
 * 단계 종류. 글만 읽고 넘기는 단계는 두지 않는다(사용자가 직접 하는 것이 있어야 한다, 2026-11-04).
 * - text: 글과 정지한 큐브 그림(남겨 둔 옛 자료용. 새 자료는 아래 상호작용 종류를 쓴다)
 * - demo: 공식을 천천히 돌려 보인다. 끝에 「직접 해 보기」로 같은 수를 쳐 볼 수 있다
 * - try: 정해진 상황에서 목표 모양(goal)을 만들면 통과
 * - look: 둘러보기. 큐브 전체 돌리기(x·y·z, 빈 곳 밀기)만 된다. `look`이 있으면 그 색이 그 면에 와야 통과
 * - find: 조각 찾기. 큐브에서 `find`에 맞는 칸을 누르면(3D·펼친 그림 모두) 통과
 * - quiz: 고르기 문제. 큐브 그림을 보고 `quiz.choices`에서 고른다
 * - turn: 한 수 해 보기. 시작 상황에서 `alg`를 직접 쳐서 같은 모양이 되면 통과
 */
export type LessonStepKind =
  | "text"
  | "demo"
  | "try"
  | "look"
  | "find"
  | "quiz"
  | "turn";

/** 면 이름. 색은 맞춘 큐브에서 그 면에 있던 색(U 흰, R 빨강, F 초록, D 노랑, L 주황, B 파랑) */
export type FaceLetter = "U" | "R" | "F" | "D" | "L" | "B";

/** 조각 종류(큰 큐브의 날개 모서리는 edge, 안쪽 가운데는 center로 친다) */
export type PieceType = "center" | "edge" | "corner";

/**
 * 찾을 조각. 여럿 주면 모두 맞아야 한다.
 * - piece: 그 종류 아무 조각
 * - colors: 꼭 그 색들만 붙은 조각(색 차례 상관없음, 예: ["U","F"] = 흰-초록 모서리)
 * - has: 그 색이 붙어 있는 조각(예: ["D"] = 노란색이 붙은 조각 아무거나)
 */
export interface FindTarget {
  piece?: PieceType;
  colors?: FaceLetter[];
  has?: FaceLetter[];
}

/** 둘러보기 목표: 색 `color`(맞춘 큐브의 그 면 색)가 면 `on`으로 오게 큐브를 돌린다 */
export interface LookGoal {
  color: FaceLetter;
  on: FaceLetter;
}

export interface QuizSpec {
  question: string;
  choices: string[];
  /** 맞는 답의 차례(0부터) */
  answer: number;
  /** 고른 뒤 보여 줄 까닭 한두 문장 */
  why: string;
}

export interface LessonStep {
  kind: LessonStepKind;
  /** 짧은 한국어 문단(해요체) */
  body: string;
  /** demo: 천천히 돌려 보일 공식. try: 모범 답(힌트로 보여 줌, 채점은 goal로 한다). turn: 직접 칠 수 */
  alg?: string;
  /** 시작 상황(모든 종류). 없으면 맞춘 큐브 */
  setup?: LessonSetup;
  /** try: 통과 조건 */
  goal?: GoalName;
  /** 「가리기」 모드에서 쓸 마스크 */
  mask?: MaskName;
  /** find: 찾을 조각 */
  find?: FindTarget;
  /** find: 서로 다른 조각을 몇 개 찾아야 하나. 기본 1 */
  count?: number;
  /** look: 맞출 방향. 없으면 큐브 전체를 한 번 돌리면 통과 */
  look?: LookGoal;
  /** quiz: 문제 */
  quiz?: QuizSpec;
  /** 단계 아래에 펼쳐 둘 표(블라인드 글자마다 준비 수 등) */
  sheet?: SheetName;
}

/** 단계 아래에 보일 표. 화면은 이름으로 자료를 찾아 그린다 */
export const SHEETS = {
  "bld-edges": "블라인드 모서리 글자마다 준비 수(BLD_EDGE_TARGETS)",
  "bld-corners": "블라인드 꼭짓점 글자마다 준비 수(BLD_CORNER_TARGETS)",
} as const;
export type SheetName = keyof typeof SHEETS;

export interface Lesson {
  id: string;
  size: CubeSize;
  title: string;
  /** 한 줄 소개 */
  summary: string;
  steps: LessonStep[];
  /** 이 단원과 짝인 공식 훈련 묶음. 단원 끝에 「이 공식 훈련하기」로 잇는다 */
  drill?: AlgSet;
}

/** 단원을 차례로 묶은 과정(초보자 3×3 등) */
export interface Course {
  id: string;
  size: CubeSize;
  title: string;
  summary: string;
  lessons: Lesson[];
  /** 먼저 배우면 좋은 과정 id. 목록에 보이기만 하고 잠그지 않는다. 과정 끝 「다음에 할 것」은 이것의 거꾸로다 */
  requires?: string[];
}

export type AlgSet =
  | "oll"
  | "pll"
  | "f2l"
  | "2look-oll"
  | "2look-pll"
  | "ortega-oll"
  | "ortega-pbl"
  | "parity-4x4"
  | "edges-5x5"
  | "bld-op";

export interface AlgCase {
  id: string;
  set: AlgSet;
  /** 한국어 이름. 굳은 이름(T퍼뮤 등)은 그대로 쓰고 설명을 곁들인다 */
  name: string;
  /** 모양 묶음(OLL의 「점」·「물고기」 등) */
  group?: string;
  /** 대표 공식 먼저, 대안 1~2개 */
  algs: string[];
  /** 대표 공식의 수마다 손가락 표기(FINGER_NOTATION 낱말을 띄어쓰기로, 수 개수와 같게) */
  fingers?: string;
  /** 상황 만드는 공식. 없으면 대표 공식의 거꾸로 */
  setup?: string;
  /** 알아보는 법·주의 한 줄 */
  note?: string;
  /** false: 기억이 확실하지 않거나 시험으로 확인하지 못함 */
  verified?: false;
}

/**
 * 손가락 표기 규칙(실물 큐브, 오른손잡이 기준). AlgCase.fingers·FingerDrill.fingers가 이 낱말을 쓴다.
 * 공식의 수 하나에 낱말 하나. 큐브 전체 돌리기(x y z)는 "rot"로 적는다.
 */
export const FINGER_NOTATION = {
  RW: "오른 손목 돌리기(R·R'·R2, r·r')",
  LW: "왼 손목 돌리기(L·L'·L2, l·l')",
  RI: "오른 검지로 윗면 앞쪽을 왼쪽으로 밀기(U)",
  LI: "왼 검지로 윗면 앞쪽을 오른쪽으로 밀기(U')",
  RI2: "오른 검지로 두 번 밀기(U2, 검지·가운뎃손가락 이어 밀기 포함)",
  LI2: "왼 검지로 두 번 밀기(U2')",
  RIb: "오른 검지로 윗면 뒤쪽을 오른쪽으로 당기기(U)",
  LIb: "왼 검지로 윗면 뒤쪽을 왼쪽으로 당기기(U')",
  RIf: "오른 검지로 앞면 위쪽을 오른쪽으로 밀기(F, R' 뒤라 검지가 앞면 위에 와 있다)",
  LIf: "왼 검지로 앞면 위쪽을 왼쪽으로 당기기(F')",
  LT: "왼 엄지로 앞면 왼쪽을 위로 밀기(F)",
  RT: "오른 엄지로 앞면 오른쪽을 위로 밀기(F')",
  LR: "왼 약지로 아랫면 앞쪽을 오른쪽으로 밀기(D)",
  RR: "오른 약지로 아랫면 앞쪽을 왼쪽으로 밀기(D')",
  RIB: "오른 검지로 뒷면 위쪽을 오른쪽으로 당기기(B')",
  RRm: "오른 약지로 가운데 줄 뒤쪽을 아래로 당기기(M')",
  LRm: "왼 약지로 가운데 줄 아래쪽을 뒤로 밀기(M)",
  rot: "큐브 전체 돌리기(x·y·z, 손으로 다시 쥐기)",
} as const;
export type FingerToken = keyof typeof FINGER_NOTATION;

export interface FingerDrill {
  id: string;
  title: string;
  alg: string;
  /** 수마다 손가락 표기 */
  fingers: string;
  note: string;
  /** 기본 반복 횟수(실물로 돌리며 스페이스바로 표시) */
  reps: number;
}
