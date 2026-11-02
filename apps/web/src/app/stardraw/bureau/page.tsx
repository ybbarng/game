import type { Metadata, Viewport } from "next";
import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { BureauDirector } from "@/stardraw/components/BureauDirector";
import { BureauLogo } from "@/stardraw/components/BureauMarks";
import { GalaxyMap, NearbyStars3D } from "@/stardraw/components/BureauSpace";
import {
  CANOPUS_SKY_SOURCE,
  CanopusChart,
  JejuSky,
} from "@/stardraw/components/CanopusSky";
import { HomeLink } from "@/stardraw/components/HomeLink";

export const metadata: Metadata = {
  title: { absolute: "카노푸스 우주국 · 하늘의 별 따기" },
  description:
    "하늘의 별 따기를 여는 카노푸스 우주국이 어떤 곳인지, 무슨 일을 하고 어떤 원칙을 지키는지 소개합니다.",
};

export const viewport: Viewport = { themeColor: "#070d19" };

/**
 * 카노푸스 우주국 소개(별 따기 footer의 기관 이름에서 들어온다). 우주국은 별 따기 안의 기관이고, 실제 운영 주체는
 * 개인정보처리방침에 적는다. 연혁 날짜는 docs/36과 커밋 기록에서 확인한 것만 쓴다
 */
export default function StardrawBureauPage() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article
        data-bureau
        className="mx-auto flex max-w-xl flex-col gap-6 break-keep text-sm text-white/80 leading-relaxed"
      >
        <HomeLink />

        <header className="flex flex-col items-center gap-4 text-center">
          <BureauLogo className="size-28 text-amber-100/90" />
          <div className="flex flex-col gap-1">
            <h1 className="font-black text-3xl text-white tracking-tight">
              카노푸스 우주국
            </h1>
            <p className="text-white/60 text-xs tracking-[0.3em]">
              CANOPUS SPACE AGENCY
            </p>
          </div>
        </header>

        <Section title="기관 소개">
          <p>
            카노푸스 우주국은 서울 하늘의 밝은 별을 지켜보고 그 기록을 보관하는
            기관입니다. 회차마다 여섯 별이 빛나는 것을 두고, 온 우주의 우주인과
            함께 「하늘의 별 따기」를 엽니다. 참여는 누구나 할 수 있고, 결과도
            처음부터 다시 계산해 볼 수 있습니다.
          </p>
          <p>
            이름은 용골자리의 별 카노푸스에서 왔습니다. 밤하늘에서 시리우스
            다음으로 밝은 별입니다. 옛사람들은 이 별을 노인성이라 부르며 오래
            살기를 빌었습니다. 남쪽 하늘 낮은 곳에 떠서 서울에서는 지평선 아래에
            머물고, 제주처럼 남쪽 땅에서나 잠깐 보입니다.
          </p>
        </Section>

        <Section title="여섯 별">
          <p>
            우주국은 오랫동안 서울 하늘에서 가장 밝은 별 45개를 지켜보았습니다.
            그러다 회차마다 그 가운데 꼭 여섯 별이 빛나고, 그 밖에 한 별이 더
            빛난다는 것을 알게 되었습니다. 어느 별이 빛날지는 회차마다 달랐고,
            지난 회차에 빛난 별과도 아무 관계가 없었습니다.
          </p>
          <p>
            우주국 관측관들이 다음에 빛날 별을 미리 맞혀 보려 했지만 아무도
            맞히지 못했습니다. 너무 어려운 일이라, 우주국 사람들은 옛말을 빌려
            이 일을 하늘의 별 따기라고 불렀습니다.
          </p>
          <p>
            그래서 우주국은 다음에 빛날 별을 가장 잘 예측하는 우주인을 온
            우주에서 찾기로 했습니다. 우주인은 회차마다 예측서에 별 여섯을 적어
            내고, 관측지에서 다른 우주인과 함께 별이 빛나는 순간을 지켜봅니다.
            여섯 별을 모두 맞힌 우주인에게는 카노푸스 별 훈장 금장을, 다섯 별과
            보너스 별을 맞힌 우주인에게는 은장을 드립니다.
          </p>
        </Section>

        <Section title="국장 인사말">
          <blockquote className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <p>
              카노푸스 우주국에 오신 것을 환영합니다. 여섯 별이 왜 빛나는지는
              우주국도 아직 모릅니다. 다음에 어느 별이 빛날지도 우주국장인 저
              역시 미리 알 수 없고, 정할 수도 없습니다.
            </p>
            <p>
              우주국은 관측 결과를 빠짐없이 기록하고 공개하겠습니다. 먼 곳에서
              관측지를 찾아 주시는 우주인 여러분께 깊이 감사드립니다.
            </p>
            <footer className="text-right text-white/60 text-xs">
              제1대 카노푸스 우주국장
            </footer>
          </blockquote>
        </Section>

        <Section title="역대 국장">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-white/55">제1대</dt>
            <dd>카노푸스 우주국장 · 2026년 ~ 현재</dd>
          </dl>
          <BureauDirector />
        </Section>

        <Section title="하는 일">
          <ul className="flex flex-col gap-3">
            <Duty name="우주인 등록">
              하늘의 별 따기에 함께할 우주인을 등록하고 등록증을 발급합니다.
              등록증은 우주인의 기기에서 만들고, 우주국은 이름이나 이메일을 묻지
              않습니다.
            </Duty>
            <Duty name="하늘의 별 따기">
              회차마다 예측서를 받고, 정각에 빛나는 여섯 별과 보너스 별 하나를
              관측해 기록합니다. 어느 별이 빛날지는 그 순간이 오기 전까지 아무도
              모르고, 우주국도 결과를 먼저 보지 못합니다.
            </Duty>
            <Duty name="관측지">
              회차마다 관측지를 열어, 우주인들이 별이 빛나는 순간을 함께
              지켜보게 합니다. 신분증을 제시하면 언덕에 올라 이야기를 나눌 수
              있습니다. 그 이야기는 남기지 않습니다.
            </Duty>
            <Duty name="소속">
              우주국장이 정하는 우주인 모임입니다. 별·성단·성운·은하가 있고,
              소속마다 정한 방법으로 확인한 우주인만 들어갈 수 있습니다.
            </Duty>
            <Duty name="기록 공개">
              예측과 관측 기록을 모두 공개 장부에 남기고, 우주국 밖 여러 곳에도
              기록을 맡겨 둡니다. 장부가 맞는지는 검증 페이지에서 처음부터 다시
              확인해 볼 수 있습니다.
            </Duty>
          </ul>
          <a
            href="/stardraw/about#flow"
            className="self-start text-amber-100/90 underline underline-offset-2"
          >
            한 회차의 흐름: 접수처에서 관측지까지
          </a>
        </Section>

        <Section title="카노푸스는 어디에 있나">
          <p>
            카노푸스는 남쪽 하늘의 용골자리에 있습니다. 시리우스에서 남쪽으로,
            오리온자리 아래로 한참 내려간 곳입니다. 아래 성도는 실제 별의 자리와
            밝기, 별빛 색대로 그렸습니다.
          </p>
          <CanopusChart />
          <p className="text-white/60 text-xs">
            점선은 그 위도에서 떠오르는 별의 남쪽 끝입니다. 카노푸스는 서울
            선보다 0.3도 남쪽에 거의 붙어 있어 서울에서는 지평선에 겨우
            닿습니다. 마라도 선보다는 안쪽이라 제주 남쪽 바다 위로 떠오릅니다.
          </p>
        </Section>

        <Section title="제주에서 보는 카노푸스">
          <p>
            아래는 카노푸스가 가장 높이 뜨는 남중 순간에, 우리나라 가장 남쪽
            땅인 마라도에서 남쪽 바다를 바라본 하늘입니다. 같은 밤 서울의 남쪽
            하늘을 옆에 놓았습니다.
          </p>
          <JejuSky />
          <p>
            마라도에서 카노푸스는 남쪽 수평선 위 4도쯤까지 떠오릅니다.
            서울에서는 가장 높이 떠도 지평선에 걸치는 정도라 대개 산과 건물에
            가립니다. 남쪽으로 산 사이 골짜기가 트여 지평선이 보이는 곳에서만
            겨우 보입니다.
          </p>
          <p>
            이렇게 낮은 별의 빛은 머리 위에서 올 때보다 공기 속을 열 배 넘게
            길게 지나옵니다. 그동안 푸른빛이 먼저 흩어져, 맑은 바닷가에서도 세
            등급쯤 어두워지고 주황빛으로 보입니다. 그래서 하늘에서 두 번째로
            밝은 별이 수평선 위에서는 2등성쯤으로 보입니다.
          </p>
        </Section>

        <Section title="노인성 이야기">
          <p>
            옛사람들은 카노푸스를 남극노인성 또는 노인성이라 불렀습니다. 사람의
            수명을 맡은 별로 여겨, 이 별을 보면 오래 산다고 믿었습니다. 조선
            시대에는 해마다 노인성에 제사를 지냈습니다.
          </p>
          <p>
            한양에서는 거의 볼 수 없는 별이었지만 제주 남쪽 바닷가에서는 볼 수
            있었습니다. 서귀포 삼매봉 정상의 남성정은 지금도 노인성을 바라보는
            곳으로 알려져 있습니다.
          </p>
          <p>
            매리너 4호와 보이저 같은 탐사선은 방향을 잡을 때 카노푸스를 기준
            별로 썼습니다. 보기는 드물어도 길잡이가 되어 온 별이라 우주국
            이름으로 삼았습니다.
          </p>
        </Section>

        <Section title="우주 속 카노푸스">
          <p>
            카노푸스는 태양에서 310광년쯤 떨어진 별로, 우리 은하의 오리온 팔
            안에 있습니다. 우주인 등록증 주소에 적힌 "우리 은하 › 오리온 팔"이
            바로 이곳입니다.
          </p>
          <GalaxyMap />
          <NearbyStars3D />
        </Section>

        <Section title="원칙">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              어느 별이 빛날지는 우주국도 미리 알 수 없고, 고를 수도 없습니다.
            </li>
            <li>
              우주국은 우주인이 누구인지 모릅니다. 등록증과 소속은 이름이나
              이메일과 이어지지 않습니다.
            </li>
            <li>기록은 모두 공개하고, 한 번 남긴 기록은 고치지 않습니다.</li>
            <li>우주국을 믿지 않아도 결과가 맞는지 확인할 수 있게 합니다.</li>
          </ol>
        </Section>

        <Section title="연혁">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-white/55">2026.</dt>
            <dd>카노푸스 우주국 설립. 제1대 국장 취임.</dd>
            <dt className="text-white/55">2026. 10. 29.</dt>
            <dd>관측 사업 설계안 마련.</dd>
            <dt className="text-white/55">2026. 10. 30.</dt>
            <dd>시험 관측 시작. 우주인 등록과 등록증 발급 시작.</dd>
            <dt className="text-white/55">2026. 10. 31.</dt>
            <dd>소속 제도 시작. 첫 소속 벌집 성단.</dd>
            <dt className="text-white/55">예정</dt>
            <dd>정식 개국. 매시간 하늘의 별 따기 시작.</dd>
          </dl>
        </Section>

        <p data-bureau-sources className="text-[11px] text-white/45">
          출처: {CANOPUS_SKY_SOURCE} 별 위치는 J2000 좌표로, 남중 고도는 위도와
          적위로, 대기 굴절은 Sæmundsson 식, 대기 질량은 Kasten과 Young의 식,
          소광 계수는 맑은 바닷가의 흔한 값(0.25등급)으로 계산했습니다. 별까지의
          거리는 히파르코스 새 처리 시차(van Leeuwen 2007, VizieR I/311), 은하의
          크기와 태양의 자리는 GRAVITY 협력단(2019)과 공개 연구를 따랐고, 은하
          그림은 직접 그린 도식입니다.
        </p>

        <nav
          aria-label="관련 문서"
          className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-white/60"
        >
          <a href="/stardraw/about" className="hover:text-white">
            설명
          </a>
          <a href="/stardraw/verify" className="hover:text-white">
            검증
          </a>
          <a href="/stardraw/learn" className="hover:text-white">
            보안 배우기
          </a>
          <a href="/stardraw/privacy" className="hover:text-white">
            개인정보처리방침
          </a>
        </nav>

        <footer className="pt-2 text-center text-[11px] text-white/40">
          <AgencyFooter />
        </footer>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold text-base text-white">{title}</h2>
      {children}
    </section>
  );
}

function Duty({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="font-semibold text-amber-100">{name}</span>
      <span>{children}</span>
    </li>
  );
}
