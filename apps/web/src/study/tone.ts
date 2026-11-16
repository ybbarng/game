/*
 * 수 배우기 글의 말투(docs/standing-rules.md 3절): 해설·안내·설명 문장은 해요체로 쓰고 마침표(또는 물음표·느낌표)로 끝낸다.
 * 제목·단추 이름·고르기 단추(퀴즈 보기)는 문장이 아니라 여기서 보지 않는다.
 * 기계로 정확히 가를 수 있는 것만 본다:
 * - 글 끝이 마침표·물음표·느낌표다
 * - 마침표로 끝나는 문장은 「~요.」·「~죠.」로 끝난다(끝의 괄호 풀이 「(긴 축)」는 빼고 본다). 그래서 「~다.」(해라체)·「~니다.」(합쇼체)는 걸린다
 * 느낌표·물음표 문장(「장군!」, 「흑은?」)은 말투를 보지 않는다. 낱말 고르기처럼 판단이 필요한 것은 사람이 읽는다.
 */

const plain = (text: string) => text.replace(/\*\*/g, "").trim();

/**
 * 글 하나를 문장으로 나눈다: 마침표·물음표·느낌표 뒤에 빈칸이 오면 문장이 끝난다.
 * 「7.5」와 글 첫머리 번호(「1. 메이트: …」)는 나누지 않는다
 */
export const sentencesOf = (text: string) =>
  plain(text)
    .split(/(?<=[.!?])(?<!^\d{1,2}\.)\s+/)
    .filter((s) => s !== "");

/** 문장 하나가 어긋났으면 그 까닭, 맞으면 null */
export function sentenceProblem(sentence: string): string | null {
  if (!/[.!?]$/.test(sentence)) return "마침표 없음";
  if (!sentence.endsWith(".")) return null;
  let body = sentence.slice(0, -1).trim();
  // 끝에 붙은 괄호 풀이는 빼고 본다: 「몰았어요(긴 축).」
  while (/\([^()]*\)$/.test(body))
    body = body.replace(/\([^()]*\)$/, "").trim();
  return /(요|죠)$/.test(body) ? null : "해요체 아님";
}

/** 글 목록에서 어긋난 문장을 「까닭: 글」로 모은다. 빈 글은 건너뛴다(없는 칸) */
export function toneProblems(texts: readonly (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const sentence of sentencesOf(text)) {
      const problem = sentenceProblem(sentence);
      if (problem) out.push(`${problem}: ${sentence}`);
    }
  }
  return out;
}

/** 단원 글: 요약, 설명 본문, 퀴즈 물음·풀이, 미션 목표·도움말·성공·실패 */
export function lessonTexts(
  lessons: readonly {
    summary: string;
    steps: readonly (
      | { kind: "explain"; body: readonly string[] }
      | { kind: "quiz"; question: string; explain: string }
      | {
          kind: "mission";
          objective: string;
          hint: string;
          success: string;
          fail: string;
        }
    )[];
  }[],
): string[] {
  const texts: string[] = [];
  for (const lesson of lessons) {
    texts.push(lesson.summary);
    for (const step of lesson.steps) {
      if (step.kind === "explain") texts.push(...step.body);
      if (step.kind === "quiz") texts.push(step.question, step.explain);
      if (step.kind === "mission")
        texts.push(step.objective, step.hint, step.success, step.fail);
    }
  }
  return texts;
}

type Node = {
  note?: string;
  branches?: readonly (readonly Node[])[];
};

/** 수순 따라 두기 글: 수순 소개와 모든 갈래의 수 설명 */
export function lineTexts(
  lines: readonly { summary: string; moves: readonly Node[] }[],
): string[] {
  const notes = (nodes: readonly Node[]): string[] =>
    nodes.flatMap((n) => [
      ...(n.note ? [n.note] : []),
      ...(n.branches ?? []).flatMap(notes),
    ]);
  return lines.flatMap((l) => [l.summary, ...notes(l.moves)]);
}
