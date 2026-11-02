import type { Metadata, Viewport } from "next";
import { Fragment } from "react";
import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { HomeLink } from "@/stardraw/components/HomeLink";
import {
  KeyHoldingExplained,
  PasskeyFaq,
} from "@/stardraw/components/PasskeyHelp";
import { RANK_RULE } from "@/stardraw/results";

export const metadata: Metadata = {
  title: { absolute: "하늘의 별 따기 설명 · Stardraw" },
  description:
    "하늘의 별 따기 한 회차가 어떻게 돌아가는지, 입상은 어떻게 확인하고 우주국은 무엇을 보관하는지 설명합니다.",
};

export const viewport: Viewport = { themeColor: "#070d19" };

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="font-bold text-xl">{title}</h2>
      {children}
    </section>
  );
}

/** 한 회차의 한 단계: 장소·시각, 여기서 하는 일 한 줄, 그 아래 자세한 설명 */
function FlowStep({
  n,
  place,
  time,
  does,
  children,
}: {
  n: number;
  place: string;
  time: string;
  does: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full border border-amber-200/40 font-bold text-amber-100 text-sm"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="font-bold">
          {place}
          <span className="ml-2 font-normal text-sm text-white/55 tabular-nums">
            {time}
          </span>
        </h3>
        <p className="text-amber-100/90">{does}</p>
        <div className="flex flex-col gap-1.5 text-sm text-white/75">
          {children}
        </div>
      </div>
    </li>
  );
}

/** 화면에 나오는 장소와 낱말(docs/36 11-29·11-36 낱말표, 화면 문구와 같은 이름만) */
const WORDS: [string, string][] = [
  [
    "우주인 등록증",
    "내 기기의 패스키로 만든 등록증입니다. 예측서에 서명할 때 쓰고, 관측지에서는 신분증으로 제시합니다.",
  ],
  ["접수처", "지금 회차의 예측서를 내는 곳입니다."],
  ["별 바구니", "고른 별 6개를 담아 두는 칸입니다."],
  [
    "예측서",
    "빛날 별 6개를 적어 내는 종이입니다. 낼 때 내 패스키로 서명합니다.",
  ],
  [
    "접수증",
    "우주국이 예측서를 받았다고 서명해 주는 증서입니다. 관측 시각과 일련번호가 적히고, 관측 뒤에는 결과가 찍힙니다.",
  ],
  [
    "관측지",
    "회차마다 열리는 곳으로, 다른 우주인과 함께 관측합니다. 정각 7분 뒤에 닫힙니다.",
  ],
  [
    "언덕",
    "관측지에서 얼굴을 내보이고 이야기를 나누는 자리입니다. 신분증을 제시하면 오를 수 있습니다.",
  ],
  [
    "언덕 아래",
    "언덕에 오르지 않은 우주인이 숨어서 관측하는 자리입니다. 다른 우주인의 얼굴과 말은 보이지만 내 모습은 보이지 않습니다.",
  ],
  [
    "내 기록",
    "「내 예측」 탭에서 입상 증서, 관측 수첩, 입상 기록, 기념 서류를 모아 보는 곳입니다.",
  ],
  ["입상 증서", "1~3등 예측서에 주는 증서입니다."],
  ["관측 수첩", "4등을 할 때마다 별 도장을 하나씩 찍는 수첩입니다."],
];

/** 하늘의 별 따기 설명 페이지(게임 화면에는 작은 "설명" 링크만 둔다) */
export default function StardrawAbout() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article className="mx-auto flex max-w-2xl flex-col gap-10 break-keep leading-relaxed">
        <header className="flex flex-col gap-3">
          <HomeLink />
          <h1 className="font-black text-3xl">하늘의 별 따기 설명</h1>
          <p className="text-amber-100/90" data-agency>
            하늘의 별 따기는 카노푸스 우주국이 정해진 시각마다 여는 공개
            관측입니다. 어떤 별이 빛날지는 세계 여러 천문대가 정각에 함께
            보내오는 신호로 정해집니다. 어느 천문대도 혼자서는 이 신호를 미리 알
            수 없어서, 우주국도 결과를 고를 수 없습니다. 우주국장 역시 지난
            기록을 고치거나 남의 등록증으로 예측할 수 없습니다.
          </p>
          <details className="text-sm text-white/70">
            <summary className="cursor-pointer text-white/80">
              왜 카노푸스인가요?
            </summary>
            <p className="mt-2">
              카노푸스는 밤하늘에서 두 번째로 밝은 별이지만, 서울에서는 지평선
              위로 오르지 않아 예측판의 별 45개에는 없습니다. 제주 남쪽
              하늘에서나 아주 낮게 보이는 별이라, 옛사람들은 노인성이라 부르며
              이 별을 보면 오래 산다고 여겼습니다. 매리너 4호와 보이저 같은
              탐사선은 방향을 잡을 때 카노푸스를 기준 별로 썼습니다. 보기는
              드물어도 길잡이가 되어 온 별이라 우주국 이름으로 삼았습니다.
            </p>
          </details>
          <p className="text-white/75">
            로또 1등과 하늘의 별 따기, 어느 쪽이 더 쉬울까요? 카노푸스 우주국은
            서울 하늘에서 가장 밝은 별 45개 가운데 회차마다 6개가 빛난다는 것을
            알아냈습니다. 다음에 빛날 별 6개를 맞혀 보세요. 관측은 한 시간마다
            열립니다.
          </p>
          <a
            href="/stardraw/learn"
            className="self-start text-amber-100/90 text-sm underline underline-offset-2"
          >
            어떻게 속일 수 없게 만들었나요? 보안 배우기
          </a>
          <a
            href="/stardraw/stars"
            className="self-start text-amber-100/90 text-sm underline underline-offset-2"
          >
            예측판의 별은 어떤 별인가요? 별 이야기
          </a>
        </header>

        <Section title="한 회차의 흐름" id="flow">
          <p className="text-white/85">
            한 회차는 1시간입니다. 접수처에서 예측서를 내고, 마감 뒤에는
            관측지에서 별이 빛나는 순간을 함께 지켜봅니다. 회차별 시각은{" "}
            <a href="/stardraw/timetable" className="underline">
              관측 시간표
            </a>
            에 있습니다.
          </p>
          <ol className="flex flex-col gap-4" data-flow>
            <FlowStep
              n={1}
              place="접수처"
              time="매시 1분 ~ 55분"
              does="이번 회차에 빛날 별 6개를 골라 예측서를 냅니다."
            >
              <p>
                네모 하늘에서 별을 누르거나 아래 1~45 칸에서 번호를 누르면 별
                바구니에 담깁니다. 「자동」이나 「남은 칸 자동」으로 채워도
                됩니다. 「예측서 내기」를 누르면 내 패스키로 서명한 예측서가
                우주국에 가고, 우주국이 서명한 접수증이 돌아옵니다.
              </p>
              <p>
                처음이라면 먼저 우주인으로 등록합니다. Face ID나 지문, 화면
                잠금으로 패스키를 만들면 그 패스키가 우주인 등록증이 됩니다.
                이름이나 이메일은 묻지 않습니다. 예측서는 패스키 하나로 회차마다
                한 장만 낼 수 있고, 일찍 등록했다고 확률이 높아지지는 않습니다.
              </p>
            </FlowStep>
            <FlowStep
              n={2}
              place="마감"
              time="매시 55분"
              does="예측서 접수를 마칩니다."
            >
              <p>
                우주국은 그때까지 받은 예측서 목록을 봉인해 공개 장부에
                올립니다. 그 뒤로는 우주국도 예측서를 넣거나 뺄 수 없습니다.
              </p>
            </FlowStep>
            <FlowStep
              n={3}
              place="관측지"
              time="정각 ~ 7분"
              does="다른 우주인과 함께 여섯 별이 빛나는 순간을 지켜봅니다."
            >
              <p>
                정각에 천문대들의 신호가 오면 빛날 별 6개와 보너스 별 하나가
                정해집니다. 룰렛 불빛이 별 사이를 돌다 멈출 때마다 하늘에서 그
                별이 켜집니다. 관측은 1분쯤 걸리고, 관측지에 있는 우주인은 같은
                장면을 함께 봅니다. 늦게 오면 중간부터 보게 되고, 관측이 끝난
                뒤에 처음 오면 관측 장면을 다시 보고 나서 들어갑니다.
              </p>
              <p>
                관측지에 들어가면 처음에는 언덕 아래 어둠 속에 숨어서
                관측합니다. 다른 우주인의 얼굴과 말은 보이지만 내 모습은 보이지
                않고, 말도 할 수 없습니다. 「언덕에 오르기」를 누르고 신분증을
                제시하면 언덕에 내 얼굴이 나타나고, 이야기를 나누거나 별똥별을
                보낼 수 있습니다. 언덕에 오르면 다른 우주인에게 내 등록증의
                얼굴과 이름, 예측서를 냈는지가 보이고, 마감 뒤에는 내가 고른
                별까지 보입니다.
              </p>
              <p>
                관측이 끝나도 관측지가 닫히기 전이라면 언덕에 오를 수 있습니다.
                관측이 끝나면 닫히기까지 남은 시간이 관측지 아래에 나오고, 정각
                7분 뒤에 닫힙니다. 우주국은 언덕에서 나눈 이야기를 남기지
                않습니다. 다음 회차 접수처는 정각 1분 뒤에 열립니다.
              </p>
            </FlowStep>
            <FlowStep
              n={4}
              place="결과"
              time="관측 뒤"
              does="내 예측서가 별을 몇 개 맞혔는지 보고, 받은 것을 모아 봅니다."
            >
              <p>
                접수증에 빛난 별과 등수가 찍힙니다. 「내 예측」 탭의 「내
                기록」에는 1~3등 입상 증서와 입상 기록, 기념 서류가 모이고,
                4등을 할 때마다 관측 수첩에 별 도장이 하나씩 찍힙니다. 1등과
                2등에는 카노푸스 별 훈장도 드립니다. 입상했다는 것을 다른
                사람에게 보여 주는 방법은 아래 「입상 확인」에 있습니다.
              </p>
            </FlowStep>
          </ol>
          <p className="text-white/85">등수는 실제 로또와 같습니다.</p>
          <table className="w-full text-sm">
            <tbody>
              {([1, 2, 3, 4, 5] as const).map((rank) => (
                <tr key={rank} className="border-white/10 border-b">
                  <td className="py-1.5 font-bold">{rank}등</td>
                  <td className="py-1.5 text-white/75">
                    {RANK_RULE[rank]} 맞힘
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="장소와 낱말" id="words">
          <dl
            className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm"
            data-words
          >
            {WORDS.map(([word, meaning]) => (
              <Fragment key={word}>
                <dt className="font-semibold text-amber-100">{word}</dt>
                <dd className="text-white/80">{meaning}</dd>
              </Fragment>
            ))}
          </dl>
        </Section>

        <Section title="로또 1등과 별 맞히기">
          <p className="text-white/85">
            밤하늘에서 맨눈으로 볼 수 있는 별은 9천 개쯤입니다. 그중 별 하나를
            콕 집어 맞힐 확률은 약 1/9,000입니다. 로또 1등(45개 중 6개)은
            1/8,145,060이라, 별 하나 맞히기보다 900배쯤 어렵습니다. 하늘의 별
            따기 1등도 로또 1등과 같은 1/8,145,060입니다. 이 확률이 어느
            정도인지 느껴 보시라고 카노푸스 우주국이 하늘의 별 따기를
            열었습니다.
          </p>
        </Section>

        <Section title="입상 확인">
          <ol className="list-decimal space-y-2 pl-5 text-white/85">
            <li>
              입상하면 「내 예측」에 카노푸스 우주국의 입상 안내가 뜹니다. 이
              안내는 서버가 알려 주는 것이 아니고, 내 기기가 공개 장부를 보고
              계산해 띄웁니다.
            </li>
            <li>
              「확인 링크 만들기」를 누르고 우주인 등록증으로 서명하면 한 번만
              쓸 수 있는 링크가 생깁니다. 이 링크를 입상을 알리고 싶은 사람에게
              메신저로 보냅니다. 링크는 예측서를 낸 사람만 만들 수 있고, 7일이
              지나면 닫힙니다.
            </li>
            <li>
              받은 사람이 링크를 열어 「확인 시작」을 누르면 내 기기에 확인
              요청이 옵니다. 「등록증으로 승인」을 누르면 별 세 개가 ①②③ 차례로
              뜹니다. 승인은 24시간 안에 하면 됩니다.
            </li>
            <li>
              링크를 보낸 메신저나 메일로 세 별의 이름을 차례대로 알려 줍니다.
              받은 사람이 하늘에서 그 별을 차례로 누르면 초록불이 켜집니다. 세
              번 틀리면 확인이 닫히고, 다시 하려면 새 링크를 보내야 합니다.
            </li>
          </ol>
          <p className="rounded-xl border border-amber-200/30 bg-amber-200/5 p-3 text-amber-50/90 text-sm">
            판정은 늘 확인하는 사람의 기기에서 합니다. 확인하는 사람의
            브라우저가 장부에 있는 예측서 열쇠로 서명을 검사하고, 두 기기만 아는
            임시 열쇠로 별 세 개를 계산합니다. 그래서 입상자의 화면이나
            스크린샷은 증거가 되지 못합니다. 별 세 개는 요청을 전해 주는 서버도
            모르기 때문에, 중간에 누가 끼어들어도 맞힐 수 없습니다. 링크는 한 번
            쓰면 닫힙니다. 누가 가로채 먼저 써 버리면 받은 사람 화면에 "이미
            사용된 링크"가 떠서 알아챌 수 있습니다.
          </p>
        </Section>

        <Section title="우주국장도 장부로만 일합니다" id="director">
          <p className="text-white/85">
            소속을 더하거나 정식 시작을 예약하는 일은 우주국장이 국장 패스키로
            서명한 기록으로만 할 수 있습니다. 이 기록은 공개 장부에 실리고
            3회차가 지나야 효력이 생기므로, 그동안 누구나 미리 볼 수 있습니다.
            서버 데이터를 몰래 고쳐서 할 수는 없습니다. 빛날 별도 우주국장이
            고르지 못합니다. 천문대들의 신호는 실제로는 drand라는 공개
            난수입니다. 그 값으로 결과를 다시 계산하는 방법과, 국장 열쇠를 언제
            정하고 바꿨는지는{" "}
            <a href="/stardraw/verify#check" className="underline">
              검증하기
            </a>
            에서 볼 수 있습니다. 국장 패스키는 예측할 때 쓰는 패스키와 따로
            있어서, 장부에서 우주국장의 예측은 다른 우주인의 예측과 구별되지
            않습니다.
          </p>
        </Section>

        <Section title="패스키와 보안" id="passkey">
          <p className="text-white/85">
            하늘의 별 따기에서는 패스키로만 예측할 수 있습니다. 패스키는
            비밀번호보다 안전하고 쓰기도 쉬워서, 이 게임을 하며 패스키에
            익숙해지셨으면 합니다. 패스키를 만들 때 얼굴이나 지문을 한 번
            확인하고, 그 뒤로는 예측서를 낼 때마다 한 번씩 확인해 서명합니다.
            아래는 자주 묻는 질문입니다.
          </p>
          <KeyHoldingExplained />
          <PasskeyFaq />
        </Section>

        <Section title="우주국이 보관하는 것" id="privacy">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-white/85">
            <li>
              저장하는 것: 공개 열쇠, 패스키 번호, 등록 회차. 예측서는 공개
              장부에 남습니다.
            </li>
            <li>받지 않는 것: 이름, 이메일, 전화번호.</li>
            <li>
              예측 수를 제한할 때 IP는 앞부분(IPv4는 앞 세 칸, IPv6는 앞 세
              묶음)만 메모리에서 세고, 저장하지 않습니다.
            </li>
            <li>
              장부는 고칠 수 없으니 지울 수도 없습니다. 대신 장부에는 이름 없이
              공개 열쇠만 남습니다.
            </li>
            <li>
              예측이 서로 이어져 보이는 게 싫으면 새 우주인으로 다시 등록하세요.
              그때부터 낸 예측은 앞의 것과 이어지지 않습니다.
            </li>
          </ul>
        </Section>

        <div className="flex flex-col gap-2">
          <a
            href="/stardraw/stars"
            className="self-start text-sm text-amber-100/90 underline underline-offset-2"
          >
            별 이야기: 예측판의 별 45개와 그 이야기, 예측판을 편 방법, 별의 색
          </a>
          <a
            href="/stardraw/learn"
            className="self-start text-sm text-amber-100/90 underline underline-offset-2"
          >
            보안 기술을 직접 해 보며 배우기: 서명, 패스키, 작업 증명, 머클 나무,
            시각 인증, drand, 사슬, 공격해 보기
          </a>
          <a
            href="/stardraw/verify"
            className="self-start text-sm text-amber-100/90 underline underline-offset-2"
          >
            직접 검증하려면: 장부 파일, 계산 규칙, 시험 값, 장부 전체 검사
          </a>
        </div>

        <footer className="text-center text-[11px] text-white/40">
          <AgencyFooter />
        </footer>
      </article>
    </main>
  );
}
