/**
 * 장소 표시(2026-11-03 사용자): 관측지는 겹친 언덕과 큰 별, 접수처는 별을 적은 예측서. 아래 탭 아이콘과 같은 꼴(24칸, 선 1.5,
 * 글자색)이라 한 벌로 보인다. 짝을 이루는 자리에만 둔다: 「관측지로 가기」·「언덕에 오르기」·관측 방송 띠·관측지 머리와,
 * 그 짝인 「별 6개 고르기」. 그보다 많은 곳에 두면 장식이 된다
 */

export type Place = "room" | "desk";

/** 관측지: 겹친 언덕 둘 위로 큰 별 하나와 작은 별 하나 */
export function RoomIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-place-icon="room"
      className={className}
    >
      <path d="M1.5 20c2.5-3.5 5-5 7.5-5 2 0 3.5.8 5 2" />
      <path d="M8 20c3-4.5 6-6.5 8.5-6.5s4.5 1.8 6 4" />
      <path d="M12 2.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
      <circle cx="19" cy="5" r=".6" fill="currentColor" />
    </svg>
  );
}

/** 접수처: 귀가 접힌 예측서에 별 하나 */
export function DeskIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-place-icon="desk"
      className={className}
    >
      <path d="M6 2.5h8.5L19 7v14.5H6z" />
      <path d="M14.5 2.5V7H19" />
      <path d="M12.5 10.5l.9 2 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z" />
      <path d="M9 19h7" />
    </svg>
  );
}

/** 단추 글자 앞에 장소 표시. 크기는 글자 크기를 따른다 */
export function PlaceLabel({
  place,
  children,
}: {
  place: Place;
  children: React.ReactNode;
}) {
  const Icon = place === "room" ? RoomIcon : DeskIcon;
  return (
    <span className="inline-flex items-center justify-center gap-[0.4em]">
      <Icon className="size-[1.15em] shrink-0" />
      <span>{children}</span>
    </span>
  );
}
