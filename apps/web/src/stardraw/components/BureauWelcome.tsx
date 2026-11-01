/**
 * 처음 온 사람에게 카노푸스 우주국이 건네는 인사(docs/36 11-34): 우주국이 찾은 여섯 별, 그것을 맞히는 일이
 * 하늘의 별 따기라는 것, 그리고 우주인 등록 권유. 입구(첫 화면)와 등록증 없이 연 응모 화면이 같이 쓴다
 */
export function BureauWelcome({ cadence }: { cadence: string }) {
  return (
    <section
      aria-label="카노푸스 우주국 안내"
      data-gate
      className="sd-glass flex flex-col gap-2 rounded-3xl px-5 py-5 break-keep text-[15px] leading-relaxed"
    >
      <p className="font-semibold text-amber-100">
        안녕하세요, 카노푸스 우주국입니다.
      </p>
      <p className="text-white/85">
        우주국은 오랜 관측 끝에 서울 하늘의 밝은 별 45개 가운데 {cadence} 6개가
        빛난다는 것을 알게 되었습니다. 그러나 다음에 어느 별이 빛날지 미리
        맞히는 일은 말 그대로 하늘의 별 따기였습니다.
      </p>
      <p className="text-white/85">
        그래서 온 우주의 우주인께 묻습니다. 다음에 빛날 별을 맞힐 우주인이
        있을까요? 우주인으로 등록하고 답안지를 내 주세요. 이미 등록하셨다면
        신분증을 제시해 주세요.
      </p>
    </section>
  );
}
