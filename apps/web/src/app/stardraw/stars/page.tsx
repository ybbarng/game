import type { Metadata, Viewport } from "next";
import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { HomeLink } from "@/stardraw/components/HomeLink";
import { LottoBall } from "@/stardraw/components/parts";
import { SKY_STARS, tempWord } from "@/stardraw/sky";
import { BoardMorph } from "@/stardraw/stars/BoardMorph";
import { ColorQuiz } from "@/stardraw/stars/ColorQuiz";
import { StarColorToys } from "@/stardraw/stars/StarColorToy";

export const metadata: Metadata = {
  title: { absolute: "별 이야기 · 하늘의 별 따기" },
  description:
    "예측판의 별 45개와 그 이야기, 실제 하늘을 예측판으로 편 방법, 별의 색이 정해지는 까닭.",
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

/**
 * 별 이야기(2026-11-02 사용자): 예측판의 별에 관한 것을 한곳에. 설명 페이지의 「예측판 읽는 법」·「별 45개」·
 * 「데이터 출처」와 배우기의 「덧붙임: 별의 색」을 옮기고, 실제 하늘을 예측판으로 펴는 막대를 더했다.
 * 별 정보 창의 「별 이야기에서 더 보기」는 #star-번호로 온다
 */
export default function StardrawStars() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article className="mx-auto flex max-w-2xl flex-col gap-10 break-keep leading-relaxed">
        <header className="flex flex-col gap-3">
          <HomeLink />
          <h1 className="font-black text-3xl">별 이야기</h1>
          <p className="text-white/80">
            예측판의 별 45개는 모두 서울 하늘에 실제로 뜨는 별입니다. 둥근
            하늘을 어떻게 네모난 예측판으로 폈는지, 별의 색은 왜 그런지, 별마다
            어떤 이야기가 있는지 모았습니다.
          </p>
          <nav
            aria-label="차례"
            className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
          >
            <a
              href="#board"
              className="text-amber-100/85 underline-offset-2 hover:underline"
            >
              예측판의 별
            </a>
            <a
              href="#making"
              className="text-amber-100/85 underline-offset-2 hover:underline"
            >
              예측판을 편 방법
            </a>
            <a
              href="#colors"
              className="text-amber-100/85 underline-offset-2 hover:underline"
            >
              별의 색
            </a>
            <a
              href="#list"
              className="text-amber-100/85 underline-offset-2 hover:underline"
            >
              별 45개
            </a>
          </nav>
        </header>

        <Section title="예측판의 별 45개" id="board">
          <ul className="list-disc space-y-2 pl-5 text-white/85">
            <li>
              번호 1~45는 서울에서 보이는 가장 밝은 실제 별 45개이고, 번호가 곧
              밝은 순서입니다. 1번은 온 하늘에서 가장 밝은 시리우스입니다.
            </li>
            <li>
              별의 크기는 실제 밝기(등급), 색은 실제 표면 온도입니다.
              베텔게우스·안타레스는 붉고, 리겔·스피카는 푸릅니다.
            </li>
            <li>
              번호는 별 오른쪽 위에 그 별의 빛깔로 적고, 고른 번호 공은 그
              빛깔을 진하게 칠합니다. 표면 온도가 높은 순서로 푸른 별, 흰 별,
              노란빛 별, 주황빛 별, 붉은 별입니다. 초록 별은 왜 없는지, 공과
              별빛을 왜 다르게 칠했는지는 아래{" "}
              <a href="#colors" className="underline">
                「별의 색」
              </a>
              에서 직접 움직여 볼 수 있습니다.
            </li>
            <li>
              흐린 선은 실제 별자리 선(서울 하늘에 뜨는 별자리 68개)이고, 작은
              점은 번호가 없는 어두운 별입니다. 번호 별은 늘 자기 별자리 선 위에
              있습니다. 별을 누르면 그 별의 별자리가 환해지며 이름이 나오고,
              고른 별의 별자리는 조금 밝게 남습니다.
            </li>
          </ul>
        </Section>

        <Section title="예측판은 어떻게 만들었나" id="making">
          <p className="text-white/85">
            네모 하늘은 하늘을 가로(동쪽이 왼쪽)·세로(위가 북쪽)로 편 것입니다.
            그대로 펴면 겨울 하늘에 별이 몰리고, 가까이 붙은 별은 손가락으로
            따로 누를 수 없습니다. 그래서 별이 가장 드문 곳에서 하늘을 갈라
            별자리가 잘리지 않게 하고, 동서남북 차례는 지키면서 몰린 곳은 넓히고
            빈 곳은 채웠습니다. 그렇게 옮기면서도 별자리는 알아볼 수 있게, 원래
            만나지 않던 선은 만나지 않고 한 줄로 늘어선 별은 한 줄 그대로
            두었습니다. 아래 막대로 실제 하늘에서 예측판까지 옮겨 가는 모습을
            보세요.
          </p>
          <BoardMorph />
        </Section>

        <Section title="별의 색" id="colors">
          <p className="text-white/85">
            예측판의 별 색도 실제 계산에서 나옵니다. 별 색은 표면 온도가
            정합니다. 난로 열선은 붉게, 더 뜨거운 용접 불꽃은 희푸르게 빛나듯,
            차가운 별(약 3,000 K)은 붉고 해(약 5,800 K)는 희고 아주 뜨거운
            별(30,000 K)은 푸릅니다. 물감과 달리 빛은 뜨거울수록 푸릅니다.
          </p>
          <p className="text-white/85">
            별이 파장마다 내는 빛의 세기는 종 모양의 정규분포가 아니라{" "}
            <b>플랑크 곡선</b>입니다. 꼭대기가 하나인 언덕인데 아주 넓어서, 언덕
            하나가 무지개 띠(눈에 보이는 빛) 전체를 넉넉히 덮습니다. 곡선 모양은
            온도 하나로 정해지고, 색은 이 곡선이 무지개 띠 안에서 어느 쪽으로
            기울었는지로 정해집니다. 아래에서 온도를 바꿔 보세요.
          </p>
          <StarColorToys />
          <ul className="flex flex-col gap-1.5 rounded-xl bg-white/[0.04] p-4 text-sm text-white/85">
            <li>
              별빛 곡선(플랑크 곡선)은 넓은 언덕 하나입니다. 모양은 온도 하나로
              정해집니다.
            </li>
            <li>
              꼭대기가 초록에 와도 빨강·파랑을 함께 덮어 흰빛이 됩니다. 그래서
              초록 별이 없습니다.
            </li>
            <li>
              분홍은 빨강·파랑 두 봉우리가 필요합니다. 봉우리가 하나인
              별빛으로는 만들 수 없습니다.
            </li>
            <li>
              하늘 그림은 실제처럼 옅게, 번호 공은 구별되게 다섯 구간으로 진하게
              칠합니다.
            </li>
          </ul>
          <ColorQuiz />
        </Section>

        <Section title="별 45개" id="list">
          <ol className="flex flex-col gap-3">
            {SKY_STARS.map((s) => (
              <li
                key={s.n}
                id={`star-${s.n}`}
                className="flex scroll-mt-6 items-start gap-3 rounded-xl target:bg-amber-200/10 target:outline target:outline-1 target:outline-amber-200/30 target:outline-offset-4"
              >
                <LottoBall n={s.n} size="sm" className="mt-0.5" />
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold">
                    {s.ko}{" "}
                    <span className="font-normal text-white/55 text-xs">
                      {s.con} {s.bayer} · {s.mag.toFixed(2)}등급 ·{" "}
                      {tempWord(s.k)}
                    </span>
                  </span>
                  <span className="text-sm text-white/75">{s.fact}</span>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="자료 출처" id="sources">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-white/75">
            <li>
              별 목록: Hoffleit &amp; Warren, The Bright Star Catalogue 5판
              (VizieR V/50). 서울에서 적위 -45° 위로 뜨는 별 가운데 밝은 순서로
              45개를 골랐습니다.
            </li>
            <li>
              별자리 선: Olaf Frohn,{" "}
              <a
                href="https://github.com/ofrohn/d3-celestial"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                d3-celestial
              </a>{" "}
              (Copyright (c) 2015, Olaf Frohn.{" "}
              <a
                href="/licenses/d3-celestial.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                BSD 3조항 라이선스 전문
              </a>
              )
            </li>
            <li>
              별의 한글 이름과 데이터 정리:{" "}
              <a
                href="https://star.byb.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                star.byb.kr
              </a>
            </li>
          </ul>
        </Section>

        <footer className="text-center text-[11px] text-white/40">
          <AgencyFooter />
        </footer>
      </article>
    </main>
  );
}
