import {
  type BoardSquare,
  type GalaxyBoard,
  type GalaxyStar,
  starAt,
} from "@game/galaxy-engine";

/**
 * 은하 한 바퀴 화면 글과 표시(docs/48 1-3 낱말). 별빛은 `✦120`, 읽을 때는 「별빛 120」.
 */

/** 별빛 표시: ✦1,240 */
export function money(n: number): string {
  return `✦${n.toLocaleString("ko-KR")}`;
}

/** 별빛 변화 표시: +✦30 / −✦30 */
export function signedMoney(n: number): string {
  return `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
}

/** 등급 표시: −1.5등급, 0.0등급 */
export function magText(mag: number): string {
  const v = Math.round(mag * 10) / 10;
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}등급`;
}

/** 거리 표시: 8.6광년, 1,600광년. 모르면 null */
export function lyText(ly: number | null): string | null {
  if (ly === null) return null;
  return `${ly < 10 ? ly.toFixed(1) : Math.round(ly).toLocaleString("ko-KR")}광년`;
}

/** 표면 온도에 따른 색 이름(별 따기 `tempWord`와 같은 구간) */
export function colorWord(k: number): string {
  if (k < 4000) return "붉은색";
  if (k < 5500) return "주황색";
  if (k < 7000) return "노란색";
  if (k < 10000) return "흰색";
  return "푸른색";
}

/** 별 한 줄 사실(docs/48 5-3): 시리우스 · 큰개자리 · −1.5등급 · 8.6광년 · 흰색 9,900 K */
export function starLine(star: GalaxyStar, constellation: string): string {
  return [star.ko, constellation, starFacts(star)].filter(Boolean).join(" · ");
}

/** 별의 밝기·거리·색(이름·별자리가 이미 보이는 칸 카드 머리에서 쓴다) */
export function starFacts(star: GalaxyStar): string {
  return [
    magText(star.mag),
    lyText(star.ly),
    `${colorWord(star.k)} ${star.k.toLocaleString("ko-KR")} K`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 별 칸의 별과 별자리 이름(별 칸이 아니면 null) */
export function starInfo(
  board: GalaxyBoard,
  square: number,
): { star: GalaxyStar; constellation: string; value: number } | null {
  const s = starAt(board, square);
  if (!s) return null;
  return {
    star: s.star,
    constellation: board.groups[s.group]?.ko ?? "",
    value: s.value,
  };
}

const CORNER_NAMES: Record<string, string> = {
  base: "카노푸스 우주국",
  asteroid: "소행성대",
  observatory: "관측지",
  comet: "혜성",
  notice: "우주국 공문",
};

/** 칸 이름: 별 이름, 또는 모퉁이·공문 이름 */
export function squareName(board: GalaxyBoard, square: number): string {
  const sq = board.squares[square] as BoardSquare | undefined;
  if (!sq) return `${square}번 칸`;
  if (sq.star) return sq.star.star.ko;
  return CORNER_NAMES[sq.kind] ?? `${square}번 칸`;
}

/** 계절 변 이름(0 가을 → 1 겨울 → 2 봄 → 3 여름, docs/48 2-1) */
export const SEASON_NAMES = ["가을", "겨울", "봄", "여름"] as const;

/**
 * 문장의 주어: 「민준이」·「컴퓨터가」·「내가」(받침이 있으면 이, 없으면 가). 기록·알림 문장을
 * 「누가 어디에 도착해서 무엇을 했는지」로 쓸 때(2026-11-05 사용자 「누군가 어디 도착해서 어쩌구」)
 */
export function subject(name: string): string {
  if (name === "나") return "내가";
  const last = name.charCodeAt(name.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3)
    return `${name}${(last - 0xac00) % 28 === 0 ? "가" : "이"}`;
  // 숫자로 끝나면(컴퓨터 1) 읽는 소리로 받침을 정한다: 1·3·6·7·8·0은 받침이 있다
  if (/[0-9]$/.test(name))
    return `${name}${"136780".includes(name.at(-1) ?? "") ? "이" : "가"}`;
  return `${name}이(가)`;
}

/** 자리 이름: 혼자 하기는 나·컴퓨터 1·2·3 */
export function seatLabel(
  seat: number,
  me: number,
  seatNames: string[] | null,
  players: number,
): string {
  if (seat === me) return "나";
  if (seatNames) return seatNames[seat] ?? `${seat + 1}번 자리`;
  if (players <= 2) return "컴퓨터";
  return `컴퓨터 ${seat < me ? seat + 1 : seat}`;
}

/**
 * 우주선 모양과 색(자리마다 둘 다 달라 색만으로 가르지 않는다, docs/48 7-1).
 * 색은 어두운 판 위에서 서로 잘 갈리는 넷
 */
export const SHIPS = [
  { shape: "circle", color: "#fbbf24", glyph: "●", name: "금빛" },
  { shape: "triangle", color: "#38bdf8", glyph: "▲", name: "하늘빛" },
  { shape: "square", color: "#f472b6", glyph: "■", name: "분홍빛" },
  { shape: "diamond", color: "#a3e635", glyph: "◆", name: "연둣빛" },
] as const;

export function shipOf(seat: number): (typeof SHIPS)[number] {
  return SHIPS[seat % SHIPS.length] as (typeof SHIPS)[number];
}
