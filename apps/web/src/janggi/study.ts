import { janggiExpertBot } from "@game/janggi-ai";
import {
  type Action,
  applyMove,
  attacked,
  type Board,
  createJanggiScenario,
  forcesMateAfter,
  inCheck,
  isCheckmate,
  type JanggiState,
  KIND_NAMES,
  type Kind,
  legalMoves,
  type Move,
  PIECE_VALUE,
  pointAt,
  pointName,
  pseudoTargets,
  viewOf,
  xyOf,
} from "@game/janggi-engine";
import { adviseWith } from "@/game/bot-runner";
import { topic } from "@/lib/josa";

import { threatenedPieces } from "./danger";
import type { JanggiPuzzle } from "./puzzles";
import { ladderMoves } from "./rook-ladder";

/** 문제 장면에서 시작하는 판. 늘 초(나, 0번 자리)가 둘 차례다 */
export function puzzleState(puzzle: JanggiPuzzle): JanggiState {
  return createJanggiScenario({ pieces: puzzle.pieces, me: "c" });
}

/** "19-39" → 수 */
export function parseMove(text: string): Move {
  const [from, to] = text.split("-");
  return { from: pointAt(from ?? ""), to: pointAt(to ?? "") };
}

export const sameMove = (a: Move, b: Move) =>
  a.from === b.from && a.to === b.to;

/**
 * 내 수를 판정한다. 양수겸장은 정답 수만 맞다.
 * 외통 문제의 마지막 수는 외통이면 어느 수든 정답, 그 앞 수는 문제의 정답 수만
 */
export function judgeMove(
  puzzle: JanggiPuzzle,
  state: JanggiState,
  move: Move,
  step: number,
): "solved" | "next" | "wrong" {
  if (puzzle.kind === "rooks") {
    // 끝내기 「차 둘로 외통」: 방법이 고르는 수면 맞다(여럿이면 어느 것이든). 외통이 되면 푼 것이다
    if (!ladderMoves(state.board).moves.some((m) => sameMove(m, move)))
      return "wrong";
    return isCheckmate(applyMove(state.board, move), "h") ? "solved" : "next";
  }
  if (puzzle.kind !== "mate")
    return sameMove(move, parseMove(puzzle.solution)) ? "solved" : "wrong";
  const after = applyMove(state.board, move);
  if (isCheckmate(after, "h")) return "solved";
  const last = step >= puzzle.mateIn - 1;
  if (last) return "wrong";
  if (step === 0)
    return sameMove(move, parseMove(puzzle.solution)) ? "next" : "wrong";
  // 세 수 문제의 가운데 수: 남은 수 안에 외통이 되면 어느 수든 맞다.
  return forcesMateAfter(after, "c", puzzle.mateIn - step - 1)
    ? "next"
    : "wrong";
}

/** 상대(한)의 받는 수: 고수가 가장 오래 버티는 수를 고른다. 같은 문제는 늘 같은 수 */
export function defenseFor(state: JanggiState) {
  return janggiExpertBot.decide(viewOf(state, 1), { seed: 7 });
}

/** `defenseFor`와 같은 수를 웹 워커에서 센다(문제 화면이 멈추지 않게) */
export function defenseOffThread(state: JanggiState): Promise<Action> {
  return adviseWith<Action>(
    { game: "janggi", name: "advisor" },
    viewOf(state, 1),
    7,
    // 워커가 실패하면 같은 수를 화면 스레드에서 센다(문제 화면이 「받는 중」에 멈추지 않게)
    () => defenseFor(state),
  );
}

function attackers(board: Board, at: number, side: "c" | "h" = "c"): Kind[] {
  const kinds: Kind[] = [];
  board.forEach((cell, from) => {
    if (cell.startsWith(side) && pseudoTargets(board, from).includes(at))
      kinds.push(cell[1] as Kind);
  });
  return kinds;
}

/**
 * 끝 글자에 받침이 있나(을/를, 과/와를 고른다). 자리 이름 숫자는 읽는 소리로 본다
 * (0 영·1 일·3 삼·6 육·7 칠·8 팔은 받침이 있다)
 */
export function hasBatchim(word: string): boolean {
  const last = word.at(-1) ?? "";
  if (/[0-9]/.test(last)) return "013678".includes(last);
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
export const obj = (word: string) => `${word}${hasBatchim(word) ? "을" : "를"}`;
/** 「이·가」: 받침에 맞춘다(「졸이」·「마가」) */
const subj = (word: string) => `${word}${hasBatchim(word) ? "이" : "가"}`;

/**
 * 「로·으로」: 받침이 없거나 ㄹ이면 로, 다른 받침이면 으로. 자리 이름 숫자는 읽는 소리로 본다
 * (0 영·3 삼·6 육은 으로, 1 일·7 칠·8 팔은 ㄹ이라 로)
 */
export function ro(word: string): string {
  const last = word.at(-1) ?? "";
  if (/[0-9]/.test(last))
    return `${word}${"036".includes(last) ? "으로" : "로"}`;
  const code = last.charCodeAt(0) - 0xac00;
  const jong = code >= 0 && code <= 11171 ? code % 28 : 0;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

const names = (kinds: Kind[]) =>
  [...new Set(kinds)].map((k) => KIND_NAMES[k]).join("·");

/**
 * 외통이 된 판을 말로 풀어 준다: 누가 장군을 불렀고, 궁이 갈 수 있는 곳을 누가 지키나.
 * 장면에서 엔진으로 만들어 문제 데이터와 어긋나지 않는다
 */
export function explainMate(board: Board, move: Move): string[] {
  const after = applyMove(board, move);
  const king = after.indexOf("hK");
  const mover = after[move.to] as string;
  const lines = [
    `${obj(KIND_NAMES[mover[1] as Kind])} ${ro(pointName(move.to))}: 장군!`,
  ];
  const checkers = attackers(after, king);
  if (checkers.length > 1)
    lines.push(`${subj(names(checkers))} 함께 궁을 노려요(양수겸장).`);
  const escapes = pseudoTargets(after, king);
  const guarded = new Map<string, string[]>();
  for (const to of escapes) {
    const moved = applyMove(after, { from: king, to });
    const who = names(attackers(moved, to));
    if (!who) continue;
    guarded.set(who, [...(guarded.get(who) ?? []), pointName(to)]);
  }
  for (const [who, squares] of guarded)
    lines.push(`궁이 피할 ${topic(squares.join("·"))} ${subj(who)} 지켜요.`);
  if (escapes.length === 0)
    lines.push("궁 둘레가 막혀 궁이 움직일 곳이 없어요.");
  lines.push("막거나 잡을 수도 없어 외통이에요.");
  return lines;
}

/** 양수겸장을 말로 풀어 준다: 옮긴 기물이 노리는 상대 기물들 */
export function explainFork(board: Board, move: Move): string[] {
  const after = applyMove(board, move);
  const mover = after[move.to] as string;
  const targets = pseudoTargets(after, move.to)
    .filter((t) => after[t]?.startsWith("h"))
    .map((t) => ({ at: t, kind: (after[t] as string)[1] as Kind }))
    .sort((a, b) => (b.kind === "K" ? 1 : 0) - (a.kind === "K" ? 1 : 0));
  const words = targets.map((t) => KIND_NAMES[t.kind]);
  // "차(26)와 궁(15)을"처럼 앞 낱말 받침에 맞춰 와/과, 끝 낱말에 맞춰 을/를을 붙인다.
  const list = targets
    .map((t, i) => {
      const word = `${KIND_NAMES[t.kind]}(${pointName(t.at)})`;
      if (i === targets.length - 1)
        return `${word}${hasBatchim(words[i] ?? "") ? "을" : "를"}`;
      return `${word}${hasBatchim(words[i] ?? "") ? "과" : "와"}`;
    })
    .join(" ");
  const check = targets.some((t) => t.kind === "K");
  return [
    `${obj(KIND_NAMES[mover[1] as Kind])} ${ro(pointName(move.to))}: ${list} 함께 노려요.`,
    check
      ? "장군이라 한은 궁부터 피해야 하고, 그사이 다른 기물을 잡아요."
      : "한이 하나를 지키거나 피하면 다른 하나를 잡아요.",
  ];
}

/**
 * 잡을까 말까를 말로 풀어 준다: 정답 잡기가 왜 이득인지, 함정 잡기는 누가 다시 잡는지.
 * 장면에서 엔진으로 만들어 문제 데이터와 어긋나지 않는다
 */
export function explainTrade(board: Board, move: Move, trap: Move): string[] {
  const takenKind = (board[move.to] as string)[1] as Kind;
  const after = applyMove(board, move);
  const mover = KIND_NAMES[(after[move.to] as string)[1] as Kind];
  const taken = KIND_NAMES[takenKind];
  const recapture = names(attackers(after, move.to, "h"));
  const lines = [
    recapture
      ? `${ro(mover)} ${obj(taken)} 잡아요(${PIECE_VALUE[takenKind]}점). ${subj(recapture)} 다시 잡아도 이득이에요.`
      : `${ro(mover)} ${obj(taken)} 잡아요(${PIECE_VALUE[takenKind]}점). 지키는 기물이 없어 공짜예요.`,
  ];
  const trapKind = (board[trap.to] as string)[1] as Kind;
  const trapAfter = applyMove(board, trap);
  const trapper = KIND_NAMES[(trapAfter[trap.to] as string)[1] as Kind];
  const guard = names(attackers(trapAfter, trap.to, "h"));
  lines.push(
    guard
      ? `${pointName(trap.to)}의 ${obj(KIND_NAMES[trapKind])} ${ro(trapper)} 잡으면 ${subj(guard)} 다시 잡아 ${obj(trapper)} 잃어요.`
      : `${pointName(trap.to)}의 ${obj(KIND_NAMES[trapKind])} 잡으면 그사이 더 큰 기물을 잃어요.`,
  );
  return lines;
}

/**
 * 장군 풀기를 말로 풀어 준다: 누가 장군을 불렀고, 정답이 잡기·막기·비키기 가운데 무엇인지.
 * 장면에서 엔진으로 만들어 문제 데이터와 어긋나지 않는다
 */
export function explainEscape(board: Board, move: Move): string[] {
  const king = board.indexOf("cK");
  const checkers = attackers(board, king, "h");
  const by = names(checkers);
  const mover = KIND_NAMES[(board[move.from] as string)[1] as Kind];
  const target = board[move.to] ?? "";
  let how: string;
  const takenKind = target === "" ? null : (target[1] as Kind);
  // 잡은 기물이 장군을 부른 기물인가(아니면 그 기물을 잡으며 장군 길을 막은 것이다)
  const takesChecker =
    target !== "" && pseudoTargets(board, move.to).includes(king);
  if (move.from === king)
    how = takenKind
      ? `궁으로 ${obj(KIND_NAMES[takenKind])} 잡으며 ${ro(pointName(move.to))} 비켜요(${PIECE_VALUE[takenKind]}점)`
      : `궁을 ${ro(pointName(move.to))} 비켜요`;
  else if (takenKind && takesChecker)
    how = `${ro(mover)} 장군 부른 ${obj(KIND_NAMES[takenKind])} 잡아요(${PIECE_VALUE[takenKind]}점)`;
  else if (takenKind)
    how = `${ro(mover)} ${obj(KIND_NAMES[takenKind])} 잡으며 장군 길을 막아요(${PIECE_VALUE[takenKind]}점)`;
  else {
    // 장군 부른 포와 궁 사이에서 비킨 기물이면 포의 다리를 치운 것이다.
    const bridge = board.some(
      (cell, at) =>
        cell === "hC" &&
        pseudoTargets(board, at).includes(king) &&
        between(at, king, move.from),
    );
    how = bridge
      ? `${obj(mover)} ${ro(pointName(move.to))} 옮겨 포의 다리를 치워요`
      : `${obj(mover)} ${pointName(move.to)}에 놓아 길을 막아요`;
  }
  return [
    `${subj(by)} 장군을 불렀어요.`,
    `${how}. 다른 풀기는 두 수 안에 기물을 잃거나 몰려요.`,
  ];
}

/** 한 궁성의 대각선 위 점(모서리 넷과 가운데) */
const HAN_PALACE_DIAGONAL = new Set(["14", "16", "25", "34", "36"]);

/** 차·포·졸이 한 궁성 대각선을 따라 움직이는 수인가(가로·세로 수는 아니다) */
export function palaceDiagonalMove(board: Board, move: Move): boolean {
  const kind = board[move.from]?.[1];
  if (kind !== "R" && kind !== "C" && kind !== "P") return false;
  if (
    !HAN_PALACE_DIAGONAL.has(pointName(move.from)) ||
    !HAN_PALACE_DIAGONAL.has(pointName(move.to))
  )
    return false;
  const [fx, fy] = xyOf(move.from);
  const [tx, ty] = xyOf(move.to);
  return fx !== tx && fy !== ty;
}

/** 궁성 공격을 말로 풀어 준다: 대각선으로 간 길과, 그 수로 얻는 것. 장면에서 엔진으로 만든다 */
export function explainPalace(board: Board, move: Move): string[] {
  const after = applyMove(board, move);
  const moverKind = (board[move.from] as string)[1] as Kind;
  const mover = KIND_NAMES[moverKind];
  const [fx] = xyOf(move.from);
  const [tx] = xyOf(move.to);
  // 모서리에서 모서리로 가면 가운데(25)를 지난다. 포는 그 기물을 넘는다.
  const jumped = Math.abs(tx - fx) === 2 ? (board[pointAt("25")] ?? "") : "";
  const path =
    moverKind === "C" && jumped !== ""
      ? `가운데 ${obj(KIND_NAMES[jumped[1] as Kind])} 넘어`
      : "";
  const lines = [
    `${obj(mover)} ${pointName(move.from)}에서 ${ro(pointName(move.to))}: 궁성 대각선을 따라 ${path ? `${path} ` : ""}가요.`,
  ];
  const taken = board[move.to] ?? "";
  const check = attackers(after, after.indexOf("hK")).length > 0;
  if (isCheckmate(after, "h")) {
    lines.push("장군! 궁이 피할 곳도, 막거나 잡을 길도 없어 외통이에요.");
  } else if (taken !== "") {
    const kind = taken[1] as Kind;
    lines.push(
      `${obj(KIND_NAMES[kind])} 잡아요(${PIECE_VALUE[kind]}점).${check ? " 장군도 함께 불러요." : ""}`,
    );
  } else {
    const next = pseudoTargets(after, move.to)
      .filter(
        (t) =>
          after[t]?.startsWith("h") && after[t] !== "hK" && isBig(after[t]),
      )
      .map((t) => KIND_NAMES[(after[t] as string)[1] as Kind]);
    const word = [...new Set(next)].join("·");
    lines.push(
      word
        ? `장군! ${obj(word)} 함께 노려서, 한이 궁을 지키는 사이 잡아요.`
        : "장군! 한이 궁을 지키는 사이 다른 기물을 얻어요.",
    );
  }
  lines.push("차·포·졸은 궁성 안에서 선이 그어진 대각선으로도 다녀요.");
  return lines;
}

/**
 * 공짜로 잡힐 내(초) 큰 기물(차·포·마): 한이 잡을 수 있는데 다시 잡을 기물이 없거나,
 * 노리는 기물이 더 싸서 잡고 바꿔도 한이 이득인 것. `attackers`는 노리는 한 기물 자리
 */
export function hangingPieces(
  board: Board,
): { at: number; attackers: number[] }[] {
  // 계산은 화면의 잡힐 위험 표시와 같은 것(danger.ts)을 쓰고, 문제에서는 큰 기물만 본다.
  return threatenedPieces(board, "c").filter(
    (t) => PIECE_VALUE[(board[t.at] as string)[1] as Kind] >= 5,
  );
}

/**
 * 잡힐 기물 지키기를 말로 풀어 준다: 누가 무엇을 노리고, 정답이 비키기·지키기·막기 가운데 무엇인지.
 * 장면에서 엔진으로 만든다
 */
export function explainDefend(board: Board, move: Move): string[] {
  const threat = hangingPieces(board)[0];
  if (!threat) return [];
  const by = names(
    threat.attackers.map((at) => (board[at] as string)[1] as Kind),
  );
  const lines = [
    `한 ${subj(by)} ${pieceAt(board, threat.at, "을")} 공짜로 노려요.`,
  ];
  const after = applyMove(board, move);
  const mover = KIND_NAMES[(board[move.from] as string)[1] as Kind];
  if (move.from === threat.at) {
    lines.push(`${obj(mover)} ${ro(pointName(move.to))} 비켜요.`);
  } else {
    const still = threat.attackers.some((from) =>
      pseudoTargets(after, from).includes(threat.at),
    );
    // 노리던 포와 기물 사이에서 비킨 기물이면 포의 다리를 치운 것이다.
    const bridge = threat.attackers.some(
      (from) => board[from] === "hC" && between(from, threat.at, move.from),
    );
    lines.push(
      still
        ? `${obj(mover)} ${ro(pointName(move.to))} 옮겨 지켜요. 잡으면 다시 잡아 한이 손해예요.`
        : bridge
          ? `${obj(mover)} ${ro(pointName(move.to))} 옮겨 포의 다리를 치워요.`
          : `${obj(mover)} ${pointName(move.to)}에 놓아 노리는 길을 막아요.`,
    );
  }
  lines.push(
    move.from === threat.at
      ? "다른 곳으로 비키면 또 잡히거나 다른 기물을 잃어요. 비킬 곳이 안전한지 살펴요."
      : "다른 수는 두 수 안에 기물을 잃어요.",
  );
  return lines;
}

/** 푼 문제의 해설: 문제 종류에 맞는 풀이를 장면에서 만든다 */
export function explainSolved(
  puzzle: JanggiPuzzle,
  board: Board,
  move: Move,
): string[] {
  switch (puzzle.kind) {
    case "trade":
      return explainTrade(board, move, parseMove(puzzle.trap));
    case "fork":
      return explainFork(board, move);
    case "cannon":
      return explainCannon(board, move);
    case "block":
      return explainBlock(board, move);
    case "mate":
    case "rooks":
      return explainMate(board, move);
    case "pin":
      return explainPin(board, move);
    case "discover":
      return explainDiscovered(board, move);
    case "escape":
      return explainEscape(board, move);
    case "palace":
      return explainPalace(board, move);
    case "defend":
      return explainDefend(board, move);
  }
}

/** 큰 기물(차·포·마)이나 궁인가: 포 길·멱 문제에서 노리거나 지킬 만한 기물 */
const isBig = (cell: string | undefined) => {
  const kind = cell?.[1] as Kind | undefined;
  return kind !== undefined && (kind === "K" || PIECE_VALUE[kind] >= 5);
};

/** `at`이 `a`와 `b` 사이 곧은 줄 위에 있나(끝은 빼고) */
function between(a: number, b: number, at: number): boolean {
  const [ax, ay] = xyOf(a);
  const [bx, by] = xyOf(b);
  const [x, y] = xyOf(at);
  if (ax === bx && x === ax)
    return y > Math.min(ay, by) && y < Math.max(ay, by);
  if (ay === by && y === ay)
    return x > Math.min(ax, bx) && x < Math.max(ax, bx);
  return false;
}

/**
 * 포 길 열기: 이 수로 내 포가 새로 상대 큰 기물(또는 궁)을 노리게 되나.
 * 옮긴 기물이 포가 넘을 다리가 되면 `bridge`, 비켜서 다리가 하나만 남으면 `bridge: false`.
 * 옮긴 기물이 포 자신이면 길 열기가 아니다
 */
export function cannonOpening(
  board: Board,
  move: Move,
): { cannon: number; target: number; bridge: boolean } | null {
  if (board[move.from] === "cC") return null;
  const after = applyMove(board, move);
  for (let at = 0; at < after.length; at++) {
    if (after[at] !== "cC") continue;
    const before = pseudoTargets(board, at);
    const target = pseudoTargets(after, at).find(
      (t) =>
        after[t]?.startsWith("h") && isBig(after[t]) && !before.includes(t),
    );
    if (target !== undefined)
      return { cannon: at, target, bridge: between(at, target, move.to) };
  }
  return null;
}

/**
 * 멱 막기: 이 수가 상대 마·상의 멱(지나는 칸)을 막아, 그 기물이 노리던 내 큰 기물을 지키나.
 * 막은 기물을 치우면 다시 노리는지까지 본다(정말 멱을 막아 지킨 것인지)
 */
export function legBlock(
  board: Board,
  move: Move,
): { attacker: number; saved: number[] } | null {
  const after = applyMove(board, move);
  const lifted = [...after];
  lifted[move.to] = "";
  for (let at = 0; at < after.length; at++) {
    const cell = after[at];
    if (cell !== "hN" && cell !== "hE") continue;
    const before = pseudoTargets(board, at).filter(
      (t) => t !== move.from && board[t]?.startsWith("c") && isBig(board[t]),
    );
    const now = pseudoTargets(after, at);
    const again = pseudoTargets(lifted, at);
    const saved = before.filter((t) => !now.includes(t) && again.includes(t));
    if (saved.length > 0) return { attacker: at, saved };
  }
  return null;
}

/** "차(14)"처럼 기물과 자리. 조사는 기물 이름 받침에 맞춘다 */
function pieceAt(board: Board, at: number, josa: "을" | "이" | "의" | "") {
  const word = KIND_NAMES[(board[at] as string)[1] as Kind];
  const tail =
    josa === "을"
      ? hasBatchim(word)
        ? "을"
        : "를"
      : josa === "이"
        ? hasBatchim(word)
          ? "이"
          : "가"
        : josa;
  return `${word}(${pointName(at)})${tail}`;
}

/** 포 길 열기를 말로 풀어 준다. 장면에서 엔진으로 만든다 */
export function explainCannon(board: Board, move: Move): string[] {
  const open = cannonOpening(board, move);
  if (!open) return [];
  const after = applyMove(board, move);
  const mover = KIND_NAMES[(after[move.to] as string)[1] as Kind];
  const target = pieceAt(after, open.target, "을");
  const cannon = pieceAt(after, open.cannon, "이");
  return [
    open.bridge
      ? `${obj(mover)} ${ro(pointName(move.to))}: ${subj(mover)} 다리가 되어 ${cannon} ${target} 노려요.`
      : `${obj(mover)} ${ro(pointName(move.to))} 비키면 다리가 하나만 남아 ${cannon} ${target} 노려요.`,
    after[open.target] === "hK"
      ? "포 장군이에요. 한은 궁부터 지켜야 해서 그사이 다른 기물을 얻어요."
      : "포는 꼭 하나를 넘어야 움직여요. 다리를 놓거나 치우면 길이 열려요.",
  ];
}

/**
 * 묶인 기물: 이 수 뒤 초가 노리는 한 큰 기물(차·포·마) 가운데, 갈 곳은 있는데 비키면 한 궁이 잡혀
 * 한 칸도 움직일 수 없는 것. `pinner`는 그 기물이 비키면 궁을 잡게 되는 초 기물
 */
export function pinnedTarget(
  board: Board,
  move: Move,
): { pinned: number; pinner: number } | null {
  const after = applyMove(board, move);
  // 장군이면 어느 기물이든 장군을 풀어야 해서, 묶여서 못 움직이는 것과 가를 수 없다.
  if (inCheck(after, "h")) return null;
  const king = after.indexOf("hK");
  const legal = legalMoves(after, "h");
  for (let at = 0; at < after.length; at++) {
    const cell = after[at] ?? "";
    if (!cell.startsWith("h") || !isBig(cell) || cell === "hK") continue;
    if (!attacked(after, at, "c")) continue;
    if (pseudoTargets(after, at).length === 0) continue;
    if (legal.some((m) => m.from === at)) continue;
    const lifted = [...after];
    lifted[at] = "";
    const pinner = lifted.findIndex(
      (c, from) =>
        c.startsWith("c") && pseudoTargets(lifted, from).includes(king),
    );
    if (pinner >= 0) return { pinned: at, pinner };
  }
  return null;
}

/** 묶인 기물 노리기를 말로 풀어 준다. 장면에서 엔진으로 만든다 */
export function explainPin(board: Board, move: Move): string[] {
  const pin = pinnedTarget(board, move);
  if (!pin) return [];
  const after = applyMove(board, move);
  const king = after.indexOf("hK");
  const mover = KIND_NAMES[(after[move.to] as string)[1] as Kind];
  const pinnedKind = (after[pin.pinned] as string)[1] as Kind;
  const pinnedName = KIND_NAMES[pinnedKind];
  const pinnerName = KIND_NAMES[(after[pin.pinner] as string)[1] as Kind];
  const line = xyOf(king)[0] === xyOf(pin.pinned)[0] ? "세로줄" : "가로줄";
  const lines = [
    `${obj(mover)} ${ro(pointName(move.to))}: 한의 ${pieceAt(after, pin.pinned, "을")} 노려요.`,
    `${pieceAt(after, pin.pinned, "")}${hasBatchim(pinnedName) ? "은" : "는"} 초 ${pinnerName}(${pointName(pin.pinner)})${hasBatchim(pinnerName) ? "과" : "와"} 한의 궁(${pointName(king)}) 사이, 같은 ${line}에 서 있어요. 비키면 궁이 잡혀서 움직일 수 없어요.`,
  ];
  // 그 판의 사실: 묶인 기물을 지키는 한 기물이 있는지, 있으면 가장 싼 초 기물로 잡아 바꿔도 이득인지
  const defenders = attackers(after, pin.pinned, "h");
  const takers = attackers(after, pin.pinned, "c").sort(
    (a, b) => PIECE_VALUE[a] - PIECE_VALUE[b],
  );
  const cheapest = takers[0];
  if (defenders.length === 0)
    lines.push(
      `${obj(pinnedName)} 지키는 한의 기물이 없어 다음 수에 공짜로 잡아요(${PIECE_VALUE[pinnedKind]}점).`,
    );
  else if (cheapest && PIECE_VALUE[cheapest] < PIECE_VALUE[pinnedKind])
    lines.push(
      `한의 ${subj(names(defenders))} 지켜도, ${ro(KIND_NAMES[cheapest])} 잡고 바꾸면 이득이에요.`,
    );
  return lines;
}

/**
 * 비켜 부르는 장군: 이 수로 옮긴 기물은 장군을 부르지 않고, 그 기물이 막고 있던 초 차가 한 궁을 노린다.
 * 옮긴 기물은 한 큰 기물을 잡았거나 새로 노린다. `checker`는 길이 열린 차, `gain`은 잡거나 노리는 한 기물 자리
 */
export function discoveredCheck(
  board: Board,
  move: Move,
): { checker: number; gain: number; captured: boolean } | null {
  const after = applyMove(board, move);
  const king = after.indexOf("hK");
  if (pseudoTargets(after, move.to).includes(king)) return null;
  const checker = after.findIndex(
    (c, from) =>
      c === "cR" &&
      from !== move.to &&
      pseudoTargets(after, from).includes(king) &&
      !pseudoTargets(board, from).includes(king),
  );
  if (checker < 0) return null;
  const taken = board[move.to] ?? "";
  if (taken !== "" && isBig(taken))
    return { checker, gain: move.to, captured: true };
  const gain = pseudoTargets(after, move.to).find(
    (t) => after[t]?.startsWith("h") && after[t] !== "hK" && isBig(after[t]),
  );
  return gain === undefined ? null : { checker, gain, captured: false };
}

/** 비켜 부르는 장군을 말로 풀어 준다. 장면에서 엔진으로 만든다 */
export function explainDiscovered(board: Board, move: Move): string[] {
  const found = discoveredCheck(board, move);
  if (!found) return [];
  const after = applyMove(board, move);
  const moverKind = (after[move.to] as string)[1] as Kind;
  const mover = KIND_NAMES[moverKind];
  const gainKind = (found.captured ? board : after)[found.gain]?.[1] as Kind;
  const gain = KIND_NAMES[gainKind];
  // 그 판의 사실: 한이 장군을 푸는 길(궁 비키기·사이 막기·장군 부른 차 잡기)
  const king = after.indexOf("hK");
  const ways = new Set<number>(
    legalMoves(after, "h").map((m) =>
      m.from === king ? 0 : m.to === found.checker ? 2 : 1,
    ),
  );
  // 길마다 이어 쓰는 꼴과 끝 꼴: 「궁을 비키거나 사이를 막아」
  const WAYS = [
    ["궁을 비키거나", "궁을 비켜"],
    ["사이를 막거나", "사이를 막아"],
    ["장군 부른 차를 잡거나", "장군 부른 차를 잡아"],
  ] as const;
  const open = [0, 1, 2].filter((w) => ways.has(w));
  const answer = open
    .map((w, i) => WAYS[w]?.[i === open.length - 1 ? 1 : 0])
    .join(" ");
  return [
    found.captured
      ? `${ro(mover)} ${pieceAt(board, found.gain, "을")} 잡으며 비켜요(${PIECE_VALUE[gainKind]}점).`
      : `${obj(mover)} ${ro(pointName(move.to))} 비켜 한의 ${pieceAt(after, found.gain, "을")} 노려요.`,
    `${pieceAt(board, move.from, "이")} 막고 있던 길이 열려 ${pieceAt(after, found.checker, "이")} 장군을 불러요.`,
    found.captured
      ? `한은 ${answer} 장군부터 풀어야 해서, ${obj(mover)} 다시 잡을 틈이 없어요.`
      : `한은 ${answer} 장군부터 풀어야 해서, 그사이 ${obj(gain)} 잡아요.`,
  ];
}

/** 멱 막기를 말로 풀어 준다. 장면에서 엔진으로 만든다 */
export function explainBlock(board: Board, move: Move): string[] {
  const block = legBlock(board, move);
  if (!block) return [];
  const after = applyMove(board, move);
  const mover = KIND_NAMES[(after[move.to] as string)[1] as Kind];
  const attackerKind = (after[block.attacker] as string)[1] as Kind;
  const saved = block.saved.map((t, i) =>
    pieceAt(after, t, i === block.saved.length - 1 ? "을" : ""),
  );
  return [
    `${obj(mover)} ${ro(pointName(move.to))}: 한 ${pieceAt(after, block.attacker, "의")} 멱을 막아 ${saved.join("·")} 지켜요.`,
    attackerKind === "N"
      ? "마는 곧게 한 칸 간 뒤 비스듬히 가요. 곧게 가는 첫 칸(멱)이 막히면 못 가요."
      : "상은 곧게 한 칸, 비스듬히 두 칸 가요. 지나는 칸 하나라도 막히면 못 가요.",
  ];
}
