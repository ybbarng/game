import {
  attacked,
  type Board,
  createJanggiScenario,
  legalMoves,
  pointAt,
  pointName,
  pseudoTargets,
  SETUPS,
  type Setup,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { threatenedPieces } from "./danger";
import { exampleState } from "./example-play";
import {
  choReply,
  firstMoves,
  pairExample,
  pairKind,
} from "./matchup-examples";
import { isMatsang, matchup } from "./matchups";
import { openingPieces } from "./opening-lessons";
import { parseMove, replayBoards, sideAt, tallyOf, tallyText } from "./replay";

const ALL = SETUPS.map((s) => s.value);
const PAIRS = ALL.flatMap((han) => ALL.map((cho) => ({ han, cho })));

function boardsOf(han: Setup, cho: Setup) {
  const example = pairExample(han, cho);
  const start = createJanggiScenario({ pieces: openingPieces(cho, han) }).board;
  return { example, boards: replayBoards(start, example.moves) };
}

const at = (board: Board | undefined, name: string) =>
  (board ?? [])[pointAt(name)];
const reach = (board: Board | undefined, name: string) =>
  pseudoTargets(board ?? [], pointAt(name)).map(pointName);

/** 그 편이 그 자리를 지키나(그 자리에 상대 기물이 있다고 보고 닿는지) */
function guarded(board: Board, name: string, side: "c" | "h"): boolean {
  const probe = [...board];
  probe[pointAt(name)] = side === "c" ? "hP" : "cP";
  return attacked(probe, pointAt(name), side);
}

describe("짝마다 실제 예시", () => {
  it("16가지 짝 모두 그 짝의 처음 판에서 번갈아 둘 수 있는 수순이고, 수마다 마침표로 끝나는 까닭이 있다", () => {
    for (const { han, cho } of PAIRS) {
      const { example, boards } = boardsOf(han, cho);
      const name = `한 ${han} 초 ${cho}`;
      expect(example.notes, name).toHaveLength(example.moves.length);
      for (const note of example.notes)
        expect(note.endsWith("."), name).toBe(true);
      example.moves.forEach((text, i) => {
        const m = parseMove(text);
        const legal = legalMoves(boards[i] ?? [], sideAt(i)).some(
          (l) => l.from === m.from && l.to === m.to,
        );
        expect(legal, `${name} ${i + 1}수 ${text}`).toBe(true);
      });
      // 이어 두기 대국도 그대로 만들어진다
      expect(
        exampleState({
          pieces: openingPieces(cho, han),
          moves: example.moves,
          setups: { cho, han },
        }).board,
      ).toEqual(boards[example.moves.length]);
    }
  });

  it("맞혀 볼 정답은 그 순간 다음 수가 가는 자리다", () => {
    for (const { han, cho } of PAIRS) {
      const { example, boards } = boardsOf(han, cho);
      const { guess } = example;
      if (!guess) continue;
      const m = parseMove(example.moves[guess.at] ?? "");
      expect(m.to, `한 ${han} 초 ${cho}`).toBe(pointAt(guess.answer));
      expect(pseudoTargets(boards[guess.at] ?? [], m.from)).toContain(m.to);
      expect(guess.ask.endsWith(".")).toBe(true);
      expect(guess.why.endsWith(".")).toBe(true);
    }
  });

  it("예시 갈래는 짝 표의 까닭과 같은 갈래다(맞상은 맞상 짝, 양귀마는 초 양귀마 짝)", () => {
    for (const { han, cho } of PAIRS) {
      const kind = pairKind(han, cho);
      expect(kind === "matsang", `${han} ${cho}`).toBe(isMatsang(cho, han));
      const reason = matchup(han, cho).reason;
      if (kind === "matsang") expect(reason).toContain("맞상");
      if (kind === "apart") expect(reason).toContain("맞상을 피해요");
      if (kind === "yangCenter") expect(reason).toContain("가운데 졸(75)");
      if (kind === "centerTarget") expect(reason).toContain("가운데 병(45)");
      if (kind === "gwimaLead") expect(reason).toContain("빨리 갖춰지는 귀마");
      if (kind === "wonangSlowVsYang")
        expect(reason).toContain("갖추는 사이에 한이 먼저");
    }
  });

  it("글대로: 잡힘·지킴·주고받은 점수", () => {
    for (const { han, cho } of PAIRS) {
      const { example, boards } = boardsOf(han, cho);
      const name = `한 ${han} 초 ${cho}`;
      const n = example.moves.length;
      const end = boards[n] ?? [];
      const tally = tallyText(tallyOf(boards, example.moves, n));
      const [m1 = 0, m2 = 0] = example.moves.map((t) => parseMove(t).to);
      switch (example.kind) {
        case "matsang": {
          // 두 수 뒤 두 상이 서로 닿고, 잡고 되잡아 점수가 같다
          const [c, h] = [pointName(m1), pointName(m2)];
          expect(reach(boards[2], c), name).toContain(h);
          expect(reach(boards[2], h), name).toContain(c);
          expect(tally, name).toContain("점수가 같아 손해 없음");
          break;
        }
        case "apart": {
          const [c, h] = [pointName(m1), pointName(m2)];
          expect(reach(end, c), name).not.toContain(h);
          expect(reach(end, h), name).not.toContain(c);
          expect(tally, name).toBeNull();
          break;
        }
        case "yangCenter":
          // 잡기 직전 75는 지키는 기물이 없다
          expect(guarded(boards[n - 1] ?? [], "75", "c"), name).toBe(false);
          expect(at(end, "75"), name).toBe("hC");
          expect(tally, name).toContain("초 2점 손해");
          break;
        case "wonangGuard":
          expect(at(end, "75"), name).toBe("cE");
          expect(tally, name).toContain("초 5점 이득");
          break;
        case "centerTarget":
          // 45 병은 지키는 한 기물이 없고, 잡은 포도 되잡히지 않는다
          expect(guarded(boards[n - 1] ?? [], "45", "h"), name).toBe(false);
          expect(at(end, "45"), name).toBe("cC");
          expect(attacked(end, pointAt("45"), "h"), name).toBe(false);
          expect(tally, name).toContain("초 2점 이득");
          break;
        case "gwimaLead": {
          // 초는 세 수(다섯째 수) 만에 진마·귀마·면포, 한은 다섯 수 끝에 두 마·면포·가운데 상
          const five = boards[5];
          expect(at(five, "85"), name).toBe("cC");
          expect(
            ["83", "86", "84", "87"].filter((p) => at(five, p) === "cN"),
            name,
          ).toHaveLength(2);
          expect(at(end, "35"), name).toBe("hC");
          expect(at(end, "45"), name).toBe("hE");
          expect(
            ["33", "37"].every((p) => at(end, p) === "hN"),
            name,
          ).toBe(true);
          expect(tally, name).toBeNull();
          break;
        }
        case "wonangSlowVsYang":
          expect(
            ["42", "48"].every((p) => at(end, p) === "hP"),
            name,
          ).toBe(true);
          expect(at(end, "75"), name).toBe("cE");
          expect(
            ["83", "87"].every((p) => at(end, p) === "cN"),
            name,
          ).toBe(true);
          expect(
            ["34", "36"].every((p) => at(end, p) === "hN"),
            name,
          ).toBe(true);
          expect(tally, name).toBeNull();
          break;
      }
    }
  });

  it("잡는 수가 없는 갈래는 수마다 둔 편에 공짜로 잡힐 기물이 생기지 않는다", () => {
    for (const { han, cho } of PAIRS) {
      const { example, boards } = boardsOf(han, cho);
      if (!["gwimaLead", "wonangSlowVsYang"].includes(example.kind)) continue;
      example.moves.forEach((text, i) => {
        expect(
          threatenedPieces(boards[i + 1] ?? [], sideAt(i)),
          `한 ${han} 초 ${cho} ${i + 1}수 ${text}`,
        ).toEqual([]);
      });
    }
  });
});

describe("실제 차례대로 겪어 보기", () => {
  it("권하는 첫 수는 차 앞 졸을 옆으로 쓸어 그 차가 갈 곳을 늘린다(어느 짝에서든 둘 수 있다)", () => {
    for (const { han, cho } of PAIRS) {
      const board = createJanggiScenario({
        pieces: openingPieces(cho, han),
      }).board;
      for (const text of firstMoves(cho)) {
        const m = parseMove(text);
        const name = `${han} ${cho} ${text}`;
        expect(
          legalMoves(board, "c").some(
            (l) => l.from === m.from && l.to === m.to,
          ),
          name,
        ).toBe(true);
        expect(board[m.from], name).toBe("cP");
        // 졸이 비킨 세로줄의 맨 아래가 차다
        const rook = pointAt(`0${text[1]}`);
        expect(board[rook], name).toBe("cR");
        const reachOf = (b: Board) =>
          legalMoves(b, "c").filter((l) => l.from === rook).length;
        const after = replayBoards(board, [text])[1] ?? [];
        expect(reachOf(after), name).toBeGreaterThan(reachOf(board));
      }
    }
  });

  it("귀마는 차 옆에 상이 있는 쪽 졸을 쓴다", () => {
    for (const cho of ["NENE", "ENEN"] as const) {
      const board = createJanggiScenario({
        pieces: openingPieces(cho, "NENE"),
      }).board;
      const [text = ""] = firstMoves(cho);
      const beside = text[1] === "1" ? "02" : "08";
      expect(board[pointAt(beside)], cho).toBe("cE");
    }
  });

  it("한이 무엇을 골라도 초는 보고 골라 맞상을 피한다", () => {
    for (const han of ALL)
      for (const r of [0, 0.5, 0.99]) {
        const cho = choReply(han, () => r);
        expect(isMatsang(cho, han), `${han} ${cho}`).toBe(false);
        expect(matchup(han, cho).grade).toBe("best");
      }
  });
});
