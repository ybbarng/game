/*
 * 초고수의 오프닝 책. 처음 몇 수는 읽지 않고 이름난 오프닝 수순에서 고른다.
 * 수순은 웹의 「수순 따라 두기」(apps/web/src/chess/openings.ts)와 같고, 영어 위키백과의 각 오프닝 문서에서
 * 확인한 본줄기·갈래다(2026-11-03). chess-ai가 웹에 기대지 않도록 기보만 여기 따로 둔다.
 * 같은 판에서 책에 수가 여럿이면 시드로 고른다(같은 시드면 같은 수, 판마다 다른 오프닝).
 */
import {
  applyMove,
  type Move,
  type Position,
  parseFen,
  positionKey,
  START_FEN,
  sanToMove,
} from "@game/chess-engine";

const wiki = (page: string) => `https://en.wikipedia.org/wiki/${page}`;

/** 오프닝 이름, 출처, 처음부터 둔 수순(기보, 빈칸으로 나눔) */
export const OPENING_BOOK: readonly {
  name: string;
  source: string;
  moves: string;
}[] = [
  {
    name: "이탈리안 게임(지우오코 피아노)",
    source: wiki("Italian_Game"),
    moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3",
  },
  {
    name: "이탈리안 게임(지우오코 피아니시모)",
    source: wiki("Italian_Game"),
    moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 c3",
  },
  {
    name: "루이 로페스(닫힌 변화)",
    source: wiki("Ruy_Lopez"),
    moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
  },
  {
    name: "스카치 게임",
    source: wiki("Scotch_Game"),
    moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4",
  },
  {
    name: "스카치 게임(클래식 변화)",
    source: wiki("Scotch_Game"),
    moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7",
  },
  {
    name: "퀸스 갬빗 거절",
    source: wiki("Queen%27s_Gambit_Declined"),
    moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6",
  },
  {
    name: "런던 시스템",
    source: wiki("London_System"),
    moves: "d4 Nf6 Bf4 d5 e3 e6 Nd2 c5 c3 Nc6",
  },
  {
    name: "시실리안 디펜스: 나이도르프",
    source: wiki("Sicilian_Defence,_Najdorf_Variation"),
    moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6",
  },
  {
    name: "프렌치 디펜스(클래식 변화)",
    source: wiki("French_Defence"),
    moves: "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5",
  },
  {
    name: "프렌치 디펜스(어드밴스 변화)",
    source: wiki("French_Defence"),
    moves: "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3",
  },
  {
    name: "카로칸 디펜스(클래식 변화)",
    source: wiki("Caro%E2%80%93Kann_Defence"),
    moves:
      "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3",
  },
  {
    name: "킹스 인디언 디펜스(클래식 변화)",
    source: wiki("King%27s_Indian_Defence"),
    moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7",
  },
];

let table: Map<string, Move[]> | null = null;

/** 판(positionKey)마다 책에 있는 다음 수들. 처음 쓸 때 한 번 만든다 */
export function bookTable(): Map<string, Move[]> {
  if (table) return table;
  const out = new Map<string, Move[]>();
  for (const line of OPENING_BOOK) {
    let pos: Position = parseFen(START_FEN);
    for (const san of line.moves.split(" ")) {
      const move = sanToMove(pos, san);
      if (!move) throw new Error(`책 수순이 틀렸다: ${line.name} ${san}`);
      const key = positionKey(pos);
      const list = out.get(key) ?? [];
      if (
        !list.some(
          (m) =>
            m.from === move.from &&
            m.to === move.to &&
            m.promotion === move.promotion,
        )
      )
        list.push(move);
      out.set(key, list);
      pos = applyMove(pos, move);
    }
  }
  table = out;
  return out;
}

/** 이 판에서 책에 있는 수들(없으면 빈 배열) */
export function bookMoves(pos: Position): readonly Move[] {
  return bookTable().get(positionKey(pos)) ?? [];
}
