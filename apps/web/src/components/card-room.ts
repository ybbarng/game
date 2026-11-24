/**
 * 둘러앉은 카드 게임(화투 셋·원카드) 방이 함께 쓰는 설정: 친구가 들어와야 시작하고, 끊긴 사람은 30초 기다린 뒤
 * 컴퓨터가 대신한다(암호화방이면 기다린다). 멘탈 포커로 섞는다
 */
export const TABLE_ROOM = {
  needsFriend: true,
  standInMs: 30_000,
  fair: true,
  theme: {
    background: "bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)]",
    dataGame: "center",
  },
} as const;
