import { magText } from "./format";
import {
  compareExplain,
  type GalaxyScene,
  SHAPE_HINTS,
  TUTORIAL_BOARD,
  winnerOf,
} from "./tutorial";

/**
 * 배우기 첫 화면의 「별자리 퀴즈」(docs/48 5-6): 사계절 하늘 8 별자리·24별로 무작위 문제를 낸다.
 * 모양 → 이름, 반짝이는 별 → 이름, 둘 중 더 밝은·먼·뜨거운 별
 */

export type StarQuizKind = "shape" | "star" | "brighter" | "farther" | "hotter";

export interface StarQuestion {
  kind: StarQuizKind;
  question: string;
  scene: GalaxyScene;
  options: string[];
  answer: number;
  explain: string;
}

export const STAR_QUIZ_KINDS: readonly StarQuizKind[] = [
  "shape",
  "star",
  "brighter",
  "farther",
  "hotter",
];

/** 0 이상 1 미만 난수(시험은 정해진 것을 넣는다) */
export type Random = () => number;

const pick = <T>(list: readonly T[], random: Random): T =>
  list[Math.floor(random() * list.length)] as T;

function shuffle<T>(list: readonly T[], random: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const groups = TUTORIAL_BOARD.groups;
const stars = TUTORIAL_BOARD.squares.flatMap((s) => (s.star ? [s.star] : []));

/** 정답 하나와 다른 보기 셋을 섞어 낸다 */
function withOptions(
  correct: string,
  pool: readonly string[],
  random: Random,
): { options: string[]; answer: number } {
  const others = shuffle(
    pool.filter((p) => p !== correct),
    random,
  ).slice(0, 3);
  const options = shuffle([correct, ...others], random);
  return { options, answer: options.indexOf(correct) };
}

/** 문제 하나. 갈래를 정하지 않으면 무작위로 */
export function starQuestion(
  random: Random = Math.random,
  kind: StarQuizKind = pick(STAR_QUIZ_KINDS, random),
): StarQuestion {
  if (kind === "shape") {
    const g = pick(groups, random);
    return {
      kind,
      question: "이 선 그림은 어느 별자리일까요?",
      scene: { kind: "sky", group: g.id },
      ...withOptions(
        g.ko,
        groups.map((x) => x.ko),
        random,
      ),
      explain: `**${g.ko}**예요. ${SHAPE_HINTS[g.id] ?? ""}`,
    };
  }
  if (kind === "star") {
    const s = pick(stars, random);
    const g = groups[s.group];
    if (!g) throw new Error("별자리가 없다");
    // 같은 별자리 다른 별을 먼저 보기로 넣어 모양을 보고 고르게 한다
    const same = stars.filter((x) => x.group === s.group && x !== s);
    const rest = shuffle(
      stars.filter((x) => x.group !== s.group),
      random,
    );
    const pool = [...same, ...rest].slice(0, 3).map((x) => x.star.ko);
    const options = shuffle([s.star.ko, ...pool], random);
    return {
      kind,
      question: `${g.ko}에서 반짝이는 별의 이름은?`,
      scene: { kind: "sky", group: g.id, star: s.star.id },
      options,
      answer: options.indexOf(s.star.ko),
      explain: `**${s.star.ko}**(${magText(s.star.mag)})예요.`,
    };
  }
  // 견주기: 값이 다른 두 별
  for (;;) {
    const [a, b] = shuffle(stars, random);
    if (!a || !b) throw new Error("별이 모자란다");
    const win = winnerOf(a.star.id, b.star.id, kind);
    if (!win) continue;
    const word =
      kind === "brighter"
        ? "더 밝은"
        : kind === "hotter"
          ? "더 뜨거운"
          : "더 먼";
    const options = [a.star.ko, b.star.ko];
    return {
      kind,
      question: `두 별 가운데 **${word}** 별은?`,
      scene: { kind: "pair", stars: [a.star.id, b.star.id] },
      options,
      answer: win === a.star.id ? 0 : 1,
      explain: compareExplain(a.star.id, b.star.id, kind),
    };
  }
}
