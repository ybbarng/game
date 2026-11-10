// Cubie 공식 연습(docs/47 16-11): 미니 모드에서 사이트 공식 연습과 같은 단계·출제·판정·콤보·판 결과를 쓴다
// (`practice/session.ts`가 잇는다). 이 파일은 미니 모드에만 있는 것: 기록 자리, 앱 메뉴에 넘길 단계 목록,
// 작은 창일 때 앱 말풍선에 보낼 줄.
import type { Keymap } from "../input/keymaps";
import { keycapLabel, keysForMove } from "../keys/move-keys";
import { PRACTICE_N } from "../practice/problem";
import type { PracticeMode } from "../practice/round";
import type { PracticeSession } from "../practice/session";
import { METHOD_TITLE, PRACTICE_STAGES } from "../practice/stages";
import { formatMs } from "../records";
import type { BubbleLine, BubbleSpan } from "./app-bridge";

/**
 * 미니 모드 연습 기록은 사이트 연습 기록(`cube.practice.v1`·보고 치기 `cube.train.v1`)과 같은 꼴로 `cube.mini.` 아래에 둔다.
 * 앱의 웹 저장소는 원래 브라우저와 따로지만, 브라우저에서 연 미니 모드에서도 사이트 기록과 섞이지 않게 이름을 바꾼다.
 * 맞추기 기록·티어(`cube.mini.v1`)와도 따로다(docs/47 15-6).
 */
export const MINI_PRACTICE_PREFIX = "cube.mini.";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** 「cube.practice.v1」 → 「cube.mini.practice.v1」처럼 이름을 바꿔 읽고 쓰는 저장소 */
export function miniPracticeStorage(
  base: StorageLike | null = defaultStorage(),
): StorageLike | null {
  if (!base) return null;
  const rename = (k: string) =>
    k.startsWith("cube.") ? `${MINI_PRACTICE_PREFIX}${k.slice(5)}` : k;
  return {
    getItem: (k) => base.getItem(rename(k)),
    setItem: (k, v) => base.setItem(rename(k), v),
  };
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** 앱 메뉴 「공식 연습 ▸」에 보일 단계(해법 차례대로) */
export interface MenuStage {
  id: string;
  title: string;
  /** 묶음 이름(「초보자」·「CFOP」) */
  group: string;
}

export const MENU_STAGES: MenuStage[] = PRACTICE_STAGES.map((s) => ({
  id: s.id,
  title: s.title,
  group: METHOD_TITLE[s.method],
}));

/** 판 끝 결과의 「한 판 더」·「끝내기」 키 이름 */
export interface RoundKeys {
  again: string;
}

/** 수 하나의 키캡 글(「I」, 「I I」). 키가 없으면 「?」 */
export function keysLabel(keymap: Keymap | null, token: string): string {
  if (!keymap) return "";
  return (
    keysForMove(keymap, PRACTICE_N, token)?.map(keycapLabel).join(" ") ?? "?"
  );
}

export const MODE_TITLE: Record<PracticeMode, string> = {
  follow: "따라 치기",
  see: "보고 치기",
};

/**
 * 작은 창일 때 앱 말풍선 줄(앱은 줄마다 글꼴만 고른다). 공식 줄은 낱말마다 꼴(`spans`)을 붙인다:
 * 친 것 done, 지금 칠 것 now, 남은 것 next, 틀린 것 wrong. 따라 치기는 키를 보이지 않고, 틀린 그 한 수의 키만 잠깐 보인다.
 */
export function practiceBubbleLines(
  s: PracticeSession,
  keymap: Keymap | null,
  keys: RoundKeys,
): BubbleLine[] {
  if (s.phase === "over" && s.summary) return summaryLines(s, keys);
  const round = s.round;
  const c = s.current;
  const lines: BubbleLine[] = [
    {
      text: `${s.stage.title} ${Math.min(round.index + 1, round.problems.length)}/${round.problems.length} · 콤보 ${round.combo.current}`,
      style: "title",
    },
  ];
  if (c) lines.push({ text: c.name, style: "note" });
  const tokens = s.tokens;
  if (s.mode === "see" && !s.peeked && s.phase === "play") return lines;
  const spans: BubbleSpan[] = tokens.map((t, i) => ({
    text: t,
    style:
      s.phase !== "play" || i < s.at
        ? "done"
        : i === s.at
          ? s.wrong?.index === i
            ? "wrong"
            : s.mode === "follow"
              ? "now"
              : "next"
          : "next",
  }));
  lines.push({ text: tokens.join(" "), style: "alg", spans: spaced(spans) });
  if (s.wrong) {
    const k = keysLabel(keymap, s.wrong.token);
    if (k) lines.push({ text: `${s.wrong.token}  ${k}`, style: "keys" });
  }
  if (s.phase === "pause") lines.push({ text: "맞춤", style: "ok" });
  return lines;
}

/** 낱말 사이에 빈칸(꼴 없는 plain)을 끼운다 */
function spaced(spans: BubbleSpan[]): BubbleSpan[] {
  const out: BubbleSpan[] = [];
  spans.forEach((sp, i) => {
    if (i > 0) out.push({ text: " ", style: "next" });
    out.push(sp);
  });
  return out;
}

function summaryLines(s: PracticeSession, keys: RoundKeys): BubbleLine[] {
  const sum = s.summary;
  if (!sum) return [];
  const lines: BubbleLine[] = [
    { text: `${s.stage.title} 한 판 끝`, style: "title" },
    {
      text: `정확도 ${Math.round(sum.accuracy * 100)}% · 평균 ${formatMs(sum.avgMs)}초`,
      style: "plain",
    },
    {
      text: `1분에 ${Math.round(sum.perMinute)}수 · 가장 긴 콤보 ${sum.bestCombo}`,
      style: "plain",
    },
  ];
  if (sum.slow.length > 0) {
    lines.push({ text: "느렸던 공식", style: "note" });
    for (const x of sum.slow)
      lines.push({
        text: `${s.caseOf(x.caseId)?.name ?? x.caseId}  ${formatMs(x.ms)}초`,
        style: "plain",
      });
  }
  lines.push({
    text: `${keys.again} 한 판 더 · Esc 연습 끝내기`,
    style: "keys",
  });
  return lines;
}
