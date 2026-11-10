import { Fragment } from "react";

/**
 * 이야기 말과 실제 기술의 짝(docs/36 11-47). 이야기 쪽 화면은 왼쪽 말만 쓰고, 기술 쪽 페이지는 첫머리에 이 표를 한 번 둔다.
 * 짝이 바뀌면 여기 한 곳만 고친다(설명·검증·보안 배우기가 같이 쓴다).
 */
export const STORY_TECH_PAIRS: [string, string][] = [
  [
    "여섯 별이 빛나는 일",
    "drand 공개 난수로 정해지는 값입니다. 공개 난수는 나온 뒤에는 누구나 받아 볼 수 있지만 나오기 전에는 아무도 모르는 무작위 값입니다. drand는 세계 여러 기관이 함께 내서 어느 한 곳도 미리 알거나 고를 수 없고, 예측 마감 5분 뒤에 나오는 값을 씁니다.",
  ],
  [
    "카노푸스 우주국",
    "이 게임을 돌리는 별 따기 서버와 그 운영자입니다. 이야기 속 우주국장이 실제 운영자입니다.",
  ],
  [
    "우주인 등록증",
    "내 패스키의 공개 열쇠에서 계산해 그린 그림입니다. 패스키는 비밀 열쇠와 공개 열쇠 한 쌍입니다. 비밀 열쇠는 기기 밖으로 나오지 않고 서명을 만드는 데만 쓰이며, 공개 열쇠는 누구나 볼 수 있고 그 서명이 맞는지 확인하는 데 씁니다.",
  ],
  [
    "우주국 서명·관인",
    "서버가 가진 서명 열쇠로 한 서명입니다. 접수증과 운영 기록에 찍힙니다. 운영 기록은 정식 시작 예약처럼 운영을 바꾸는 일을 장부에 남긴 기록입니다.",
  ],
  [
    "봉인",
    "마감 때 예측서 목록 전체를 값 하나로 묶은 머클 루트와, 바깥 시각 인증 기관이 그 값이 그 시각에 있었다고 서명해 준 증명입니다. 마감 뒤에 목록을 바꾸면 이 값과 맞지 않습니다.",
  ],
  [
    "장부",
    "회차 기록을 차례로 이어 붙인 공개 기록입니다. 기록마다 바로 앞 기록의 해시를 넣습니다. 해시는 내용에서 계산한 짧은 값으로, 내용이 한 글자만 달라도 전혀 다른 값이 나옵니다. 그래서 지난 기록을 고치면 뒤 기록과 어긋납니다. 마지막 기록의 해시는 GitHub 저장소에도 남깁니다.",
  ],
];

/** 짝 낱말 표. `folded`면 접어 두고 「이야기 속 낱말은 실제로 무엇인가요?」로 펼친다 */
export function StoryTechWords({ folded = false }: { folded?: boolean }) {
  const list = (
    <dl
      data-story-tech
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm"
    >
      {STORY_TECH_PAIRS.map(([story, tech]) => (
        <Fragment key={story}>
          <dt className="font-semibold text-amber-100">{story}</dt>
          <dd className="text-white/80">{tech}</dd>
        </Fragment>
      ))}
    </dl>
  );
  if (!folded) return list;
  return (
    <details className="text-sm text-white/75">
      <summary className="cursor-pointer text-white/80">
        이야기 속 낱말은 실제로 무엇인가요?
      </summary>
      <div className="mt-2">{list}</div>
    </details>
  );
}
