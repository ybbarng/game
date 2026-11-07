import type { Setup } from "@game/janggi-engine";

import type { Guess } from "./example-play";
import { bestAgainst, FORMATION, isMatsang } from "./matchups";

/*
 * 16가지 짝마다 그 짝의 실제 처음 판에서 직접 두고 맞혀 보는 예시(2026-11-08, docs/23 「짝마다 실제 예시」).
 * 같은 까닭은 같은 예시를 그 짝 배치로 옮겨 쓴다. 좌우가 바뀐 짝(마상마상 ↔ 상마상마)은 판을 좌우로 뒤집은 수순이다.
 * 수순이 규칙에 맞는지, 글대로 잡히고 지키는지는 matchup-examples.test.ts가 엔진으로 본다.
 * 까닭(matchups.ts의 글)이 말하는 것만 보인다. 출처에 없는 평가는 만들지 않는다(docs/23 178줄 기준)
 */

/** 예시 갈래: 까닭이 같은 짝은 같은 갈래다 */
export type PairKind =
  /** 귀마끼리 같은 이름: 마주 본 상을 하나씩 올려 서로 잡고 바꾼다 */
  | "matsang"
  /** 귀마끼리 다른 이름: 상을 하나씩 올려도 서로 닿지 않는다 */
  | "apart"
  /** 초 양귀마: 한 면포가 지키는 마 없는 75 졸을 공짜로 잡는다 */
  | "yangCenter"
  /** 초 원앙마 대 한 귀마·원앙마: 한 면포가 75를 잡으면 상이 되잡는다 */
  | "wonangGuard"
  /** 초 귀마 대 한 원앙마: 초는 세 수에 갖추고 찻길을 여는 사이 한은 다섯 수가 든다 */
  | "gwimaLead"
  /** 초 원앙마 대 한 양귀마: 초가 두 마·가운데 상을 갖추는 사이 한은 두 마를 귀에 들이고 두 찻길을 연다 */
  | "wonangSlowVsYang"
  /** 초 귀마 대 한 양귀마: 면포가 지키는 마 없는 45 병을 공짜로 잡는다 */
  | "centerTarget";

export interface PairExample {
  kind: PairKind;
  /** 판 위에 보이는 짧은 이름 */
  title: string;
  moves: string[];
  notes: string[];
  guess?: Guess;
}

/** 좌우 뒤집기: 세로줄 c → 10 - c */
const flip = (point: string) => `${point[0]}${10 - Number(point[1])}`;

/** 자리 이름 바꾸기(그대로 또는 좌우 뒤집기) */
type Map = (point: string) => string;
const same: Map = (p) => p;

const moveOf = (m: Map) => (text: string) =>
  text
    .split("-")
    .map((p) => m(p))
    .join("-");

/** 예시를 짜는 함수: 자리 이름을 `m`으로 바꿔 수순·글·맞혀 보기를 만든다 */
type Build = (m: Map) => Omit<PairExample, "kind">;

const BUILDS: Record<Exclude<PairKind, "yangCenter">, Build> = {
  matsang: (m) => ({
    title: "맞상: 상끼리 바꾸고 시작해요",
    moves: [`08-76`, `12-44`, `76-44`, `43-44`].map(moveOf(m)),
    notes: [
      `상(${m("08")})을 ${m("76")}로 올려요.`,
      `한도 마주 보던 상(${m("12")})을 ${m("44")}로 올려요. 이제 두 상이 서로 잡을 수 있어요.`,
      "초가 먼저 한 상을 잡아요.",
      "한 병이 옆으로 와서 되잡아요. 상끼리 하나씩 바꿨어요.",
    ],
    guess: {
      at: 2,
      ask: `두 상이 올라왔어요. 내 상(${m("76")})이 잡을 수 있는 한 기물은 무엇일까요? 판에서 눌러 보세요.`,
      answer: m("44"),
      why: "같은 이름 귀마라 두 편 상이 대각선으로 마주 봐요. 한 번씩 올리면 서로 잡을 수 있어요.",
    },
  }),
  apart: (m) => ({
    title: "다른 이름: 상이 서로 닿지 않아요",
    moves: [`02-74`, `12-44`].map(moveOf(m)),
    notes: [
      `상(${m("02")})이 ${m("74")}로 올라가요.`,
      `한 상(${m("12")})이 ${m("44")}로 올라가요. 두 상은 서로 잡을 수 없어요. 맞상이 아니에요.`,
    ],
  }),
  wonangGuard: (m) => ({
    title: "원앙마: 가운데 졸이 단단해요",
    moves: [`02-83`, `18-37`, `08-87`, `38-35`, `79-78`, `35-75`, `03-75`].map(
      moveOf(m),
    ),
    notes: [
      "진마를 올려요.",
      "한도 진마를 올려요.",
      `다른 마도 가운데 쪽(${m("87")})으로 올려요. 두 마가 모두 75 졸을 지켜요.`,
      "한이 면포를 놓아 75 졸을 노려요.",
      "찻길을 열어요.",
      "한 포가 병(45)을 넘어 75 졸을 잡았어요.",
      "상이 되잡아요. 졸(2점)을 주고 포(7점)를 얻었어요.",
    ],
    guess: {
      at: 6,
      ask: "한 포가 75 졸을 잡았어요. 되잡으려면 어느 자리로 가야 할까요? 판에서 눌러 보세요.",
      answer: "75",
      why: "마 둘·상 둘이 75를 지켜 한 포를 되잡을 수 있어요. 원앙마가 단단한 까닭이에요.",
    },
  }),
  gwimaLead: (m) => ({
    title: "귀마가 먼저 갖춰요",
    moves: [
      `02-83`,
      `18-37`,
      `07-86`,
      `12-33`,
      `82-85`,
      `38-35`,
      `79-78`,
      `45-44`,
      `71-72`,
      `13-45`,
    ].map(moveOf(m)),
    notes: [
      "진마를 올려요.",
      "한이 마를 가운데 쪽으로 올려요.",
      `귀마가 궁성 귀(${m("86")})로 들어가요.`,
      "한이 다른 마도 가운데 쪽으로 올려요.",
      "면포를 놓아요. 초는 세 수 만에 갖췄어요.",
      "한도 면포를 놓아요.",
      "그 사이 초는 찻길을 열어요.",
      "한은 가운데 병을 옆으로 비켜 상이 올라올 길을 열어요.",
      "다른 쪽 찻길도 열어요.",
      "한 상이 가운데(45)로 올라와요. 한은 다섯 수가 들었어요.",
    ],
    guess: {
      at: 4,
      ask: `포(${m("82")})가 진마를 넘어 설 면 자리는 어디일까요? 판에서 눌러 보세요.`,
      answer: "85",
      why: "진마를 넘어 면(85)에 서면 면포예요. 귀마는 세 수 만에 갖춰요.",
    },
  }),
  wonangSlowVsYang: (m) => ({
    title: "원앙마가 갖추는 사이",
    moves: [
      `02-83`,
      `13-34`,
      `08-87`,
      `17-36`,
      `75-74`,
      `41-42`,
      `03-75`,
      `49-48`,
    ].map(moveOf(m)),
    notes: [
      "진마를 올려요.",
      "한이 마를 궁성 귀(34)로 들여요.",
      "다른 마도 가운데 쪽으로 올려요.",
      "한이 다른 마도 궁성 귀(36)로 들여요. 두 수 만에 귀를 지켜요.",
      "가운데 졸을 옆으로 비켜 상이 올라올 길을 열어요.",
      "한이 찻길을 열어요.",
      "상이 가운데(75)로 올라와요. 면포까지 놓으려면 한 수가 더 들어요.",
      "한이 다른 쪽 찻길도 열어요. 두 차가 나올 길이 생겼고, 48 병이 47 병을 지켜요.",
    ],
    guess: {
      at: 6,
      ask: `가운데 졸을 비켰어요. 상(${m("03")})이 올라올 가운데 자리는 어디일까요? 판에서 눌러 보세요.`,
      answer: "75",
      why: "상이 75에 올라 두 마와 서로 받쳐요. 그 사이 한은 두 마를 귀에 들이고 찻길을 열어 공격을 준비해요.",
    },
  }),
  centerTarget: (m) => ({
    title: "양귀마의 가운데 병을 노려요",
    moves: [`02-83`, `13-34`, `82-85`, `17-36`, `85-45`].map(moveOf(m)),
    notes: [
      "진마를 올려요.",
      `한이 마를 궁성 귀(${m("34")})로 들여요.`,
      "면포를 놓아요. 내 졸(75) 너머로 한 병(45)을 노려요.",
      `한이 다른 마도 궁성 귀(${m("36")})로 들여요. 45 병을 지키는 마가 없어요.`,
      "면포가 졸을 넘어 45 병을 잡아요(2점). 되잡을 한 기물이 없어요.",
    ],
    guess: {
      at: 4,
      ask: "면포(85)가 공짜로 잡을 수 있는 한 기물은 무엇일까요? 판에서 눌러 보세요.",
      answer: "45",
      why: "한은 두 마가 모두 귀(34·36)로 가서 가운데 병(45)을 지키는 마가 없어요.",
    },
  }),
};

/** 초 양귀마: 한 차림에 따라 한 진마가 다르다(한 진마가 마주 보는 면포 다리가 된다) */
function yangCenter(han: Setup): Omit<PairExample, "kind"> {
  // 한 진마와 포: 마상마상·마상상마는 18 마와 38 포, 상마상마는 12 마와 32 포, 상마마상은 17 마와 38 포
  const [horse, cannon] =
    han === "ENEN"
      ? (["12-33", "32-35"] as const)
      : han === "ENNE"
        ? (["17-36", "38-35"] as const)
        : (["18-37", "38-35"] as const);
  return {
    title: "양귀마: 가운데 졸이 약해요",
    moves: ["03-84", horse, "07-86", cannon, "79-78", "35-75"],
    notes: [
      "마가 왼쪽 귀(84)로 들어가요.",
      "한이 마를 올려 포가 넘을 다리를 놓아요.",
      "다른 마도 오른쪽 귀(86)로 들어가요. 75 졸을 지키는 마가 없어요.",
      "한이 면포를 놓아요.",
      "찻길을 열었지만 75 졸은 그대로예요.",
      "한 포가 75 졸을 공짜로 잡아요. 되잡을 기물이 없어요.",
    ],
    guess: {
      at: 5,
      ask: "한 포(35)가 무엇을 노릴까요? 판에서 눌러 보세요.",
      answer: "75",
      why: "한 포가 병(45)을 넘어 가운데 졸(75)에 닿아요. 두 마가 모두 귀로 가서 75를 지키는 기물이 없어요.",
    },
  };
}

/** 이 짝의 예시 갈래(matchups.ts의 까닭과 같은 갈래) */
export function pairKind(han: Setup, cho: Setup): PairKind {
  const mine = FORMATION[cho];
  const theirs = FORMATION[han];
  if (mine === "양귀마") return "yangCenter";
  if (mine === "귀마") {
    if (theirs === "귀마") return isMatsang(cho, han) ? "matsang" : "apart";
    return theirs === "원앙마" ? "gwimaLead" : "centerTarget";
  }
  // 초 원앙마
  return theirs === "양귀마" ? "wonangSlowVsYang" : "wonangGuard";
}

/**
 * 짝의 예시. 기본 수순은 초 마상마상(귀마)·한 마상마상(맞상), 초 상마상마·한 마상마상(다른 이름)을 기준으로 짰다.
 * 좌우가 바뀐 짝은 판을 뒤집어 옮긴다(원앙마·양귀마 차림은 좌우가 같다)
 */
export function pairExample(han: Setup, cho: Setup): PairExample {
  const kind = pairKind(han, cho);
  if (kind === "yangCenter") return { kind, ...yangCenter(han) };
  // 기준 수순이 짜인 짝과 좌우가 같은지
  const mirrored =
    kind === "matsang"
      ? cho === "ENEN"
      : kind === "apart"
        ? cho === "NENE"
        : kind === "wonangGuard"
          ? han === "ENEN"
          : kind === "gwimaLead" || kind === "centerTarget"
            ? cho === "ENEN"
            : false;
  return { kind, ...BUILDS[kind](mirrored ? flip : same) };
}

/**
 * 초의 첫 수로 권하는 수(「첫 수」 단원 원칙): 차 앞 졸을 옆으로 쓸어 찻길을 연다.
 * 귀마는 차 옆에 상이 있어 막힌 쪽(마상마상은 오른쪽 79→78, 상마상마는 왼쪽 71→72), 원앙마·양귀마는 어느 쪽이든
 */
export function firstMoves(cho: Setup): string[] {
  if (cho === "NENE") return ["79-78"];
  if (cho === "ENEN") return ["71-72"];
  return ["71-72", "79-78"];
}

/** 한 편 문제: 한이 고른 차림을 보고 초(컴퓨터)가 고르는 차림. 권하는 차림 가운데 하나(`random`은 0 이상 1 미만) */
export function choReply(han: Setup, random: () => number): Setup {
  const best = bestAgainst(han);
  return best[Math.floor(random() * best.length)] ?? "NENE";
}
