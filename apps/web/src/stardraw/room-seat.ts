/**
 * 회차 방에서 지금 내 자리(docs/36 11-23 ③-2). 대화 표(신분증 제시) 없이 들어온 사람도 서버가 말·응원을 모두 건네므로
 * 남의 얼굴·풍등·응원은 보이지만(들어올 마음이 생기게), 언덕에 내 얼굴이 없고 말할 수 없다. 그래서 화면은 참여 전에
 * 입력 칸·별똥별 단추 대신 참여 단추 하나를 둔다. 서버는 추첨 시각부터 새 표를 주지 않는다(room.ts afterDraw)
 */
export interface RoomSeat {
  /** 신분증을 제시해 언덕에 앉았는지 */
  joined: boolean;
  /** 상태 표시 */
  badge: string;
  /** 상태 설명(대화 참여 중이면 없음) */
  note: string | null;
  /** 대화에 참여하는 단추 이름(지금 참여할 수 없으면 없음) */
  join: string | null;
  /** 언덕에 나 말고 아무도 없을 때 문구 */
  hill: string | null;
}

export function roomSeat(input: {
  /** 대화 표가 있다 */
  pass: boolean;
  /** 이 기기에 우주인 등록증이 있다 */
  hasKey: boolean;
  /** 아직 표를 받을 수 있다(추첨 시각 전이고 방이 열려 있다) */
  canJoin: boolean;
  /** 언덕의 다른 우주인 수(나 빼고) */
  others: number;
}): RoomSeat {
  const hill = input.others === 0 ? "아직 다른 우주인은 오지 않았어요." : null;
  if (input.pass)
    return {
      joined: true,
      badge: "대화 참여 중",
      note: null,
      join: null,
      hill,
    };
  if (!input.canJoin)
    return {
      joined: false,
      badge: "조용히 관측 중",
      note: "추첨이 시작되어 이제는 대화에 참여할 수 없어요.",
      join: null,
      hill,
    };
  return {
    joined: false,
    badge: "조용히 관측 중",
    note: "우주인들의 이야기는 보이지만, 나는 아직 언덕에 없어요.",
    // 이미 방 안에서 보고 있으니 「입장」이 아니라 상태 이름 「대화 참여 중」과 이어지는 「참여」
    join: input.hasKey ? "대화에 참여하기" : "우주인 등록하고 참여하기",
    hill,
  };
}
