/** 복기 목록과 게임 다시 보기가 함께 쓰는 게임 이름표 */
export const GAME_NAME: Record<string, string> = {
  mighty: "♠ 마이티",
  hearts: "♥ 하트",
  omok: "● 오목",
  janggi: "楚 장기",
  baduk: "⚫ 바둑",
  chess: "♞ 체스",
  gostop: "🎴 고스톱",
  minhwatu: "🎴 민화투",
  nyrongppong: "🎴 나이롱뽕",
  baseball: "⚾ 숫자야구",
  yut: "🪵 윷놀이",
  galaxy: "✶ 은하 한 바퀴",
  onecard: "🃏 원카드",
};

/** 게임을 시작한 때(월·일 시:분) */
export function when(at: number): string {
  return new Date(at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
