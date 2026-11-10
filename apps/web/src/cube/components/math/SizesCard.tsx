"use client";

import { solvedCube } from "@game/cube-engine";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { PARITY_4X4 } from "../../learn/algs-big";
import { invertText, stateAfter } from "../../math/pieces";
import { sizeFacts } from "../../math/sizes";
import type { CubeSettings } from "../../settings";
import { AlgPicture } from "../AlgPicture";
import { CubePosterPair } from "../CubePosterPair";
import { DemoCube } from "../DemoCube";
import { Lead, Notation, Pill, Quiz, Source } from "./ui";

const SIZES = [4, 5, 6, 7] as const;
const yes = (b: boolean) => (b ? "생겨요" : "없어요");

/** 크기와 패리티: 짝수 큐브에만 3×3 단계의 이상한 모양이 생기는 까닭 */
export function SizesCard({ settings }: { settings: CubeSettings }) {
  const [n, setN] = useState<(typeof SIZES)[number]>(4);
  const facts = useMemo(() => SIZES.map((s) => sizeFacts(s)), []);
  const f = facts.find((x) => x.n === n) ?? facts[0];
  const [slice, setSlice] = useState(0);
  const sl = f?.slices[Math.min(slice, (f?.slices.length ?? 1) - 1)];
  const start = useMemo(() => solvedCube(n), [n]);
  const oll = useMemo(
    () => stateAfter(4, invertText(PARITY_4X4[0]?.algs[1] as string)),
    [],
  );
  const pll = useMemo(
    () => stateAfter(4, invertText(PARITY_4X4[1]?.algs[0] as string)),
    [],
  );
  if (!f || !sl) return null;

  return (
    <div className="flex flex-col gap-3" data-sizes={n}>
      <Lead>
        앞 카드들에서는 3×3이 돌리기만으로 지키는 규칙을 봤어요. 이번에는
        4×4보다 큰 큐브를 맞출 때, 그 규칙 일부가 없어서 3×3에 없던 모양이
        생기는 것을 봐요. 한 줄의 칸 수가 짝수인 4×4·6×6을 「짝수 큐브」, 홀수인
        5×5·7×7을 「홀수 큐브」라고 부를게요.
      </Lead>
      <Lead>
        4×4는 모서리 한 줄에 엣지 블럭이 2개씩 날개처럼 붙어 있어서, 4×4의 엣지
        블럭을 「날개」라고도 불러요. 4×4는 보통 3×3처럼 만들어 맞춰요. 먼저
        면마다 그 면의 센터 블럭 4개를 제자리로 모아요. 이것을 「센터
        모으기」라고 해요. 다음에 짝이 되는 날개 둘을 나란히 붙여 엣지 한 줄로
        만들어요. 이것을 「엣지 짝짓기」라고 해요. 그러면 4×4가 3×3처럼 보여서,
        짝지은 엣지 한 줄을 3×3의 엣지 블럭처럼 다루며 맞춰요.
      </Lead>
      <Lead>
        그러다 보면 3×3에서는 절대 안 나오는 모양이 나와요. 엣지 한 줄 하나만
        뒤집혀 보이는 꼴과, 엣지 한 줄 둘만 자리가 바뀐 꼴이에요. 3×3을 빨리
        맞추는 사람들이 많이 쓰는 방법은 위층을 맨 마지막에 맞추고, 그 위층을 두
        단계로 나눠 맞춰요. 위층 조각의 방향을 맞추는 단계를 OLL, 위층 조각의
        자리를 맞추는 단계를 PLL이라고 해요. 두 꼴은 이 두 단계에서 보인다고
        해서 「OLL 패리티」, 「PLL 패리티」라고 불러요. 패리티는 영어로
        홀짝이라는 뜻이에요. 아래 그림은 두 꼴을 비스듬히 본 큐브와 위에서 본
        위층이에요.
      </Lead>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "OLL 패리티", s: oll },
          { label: "PLL 패리티", s: pll },
        ].map(({ label, s }) => (
          <figure key={label} className="flex flex-col items-center gap-1">
            <CubePosterPair
              n={4}
              state={s}
              settings={settings}
              captions={false}
              className="w-full max-w-[240px]"
            />
            <AlgPicture
              set="pll"
              n={4}
              state={s}
              colors={settings.colors}
              className="w-20"
            />
            <figcaption className="text-white/70 text-xs">{label}</figcaption>
          </figure>
        ))}
      </div>
      <Lead>
        OLL 패리티부터 봐요. 까닭은 바깥 면 말고 안쪽 층도 돌릴 수 있다는 데
        있어요. 안쪽 한 층을 90° 돌리면 날개 4개가 한 칸씩 자리를 옮겨 한 바퀴
        돌아요. 이렇게 조각 몇 개가 한 칸씩 옮겨 한 바퀴 도는 묶음을
        「고리」라고 해요. 4개짜리 고리는 맞바꾸기 3번과 같아서 날개 자리의
        홀짝이 바뀌어요. 그런데 짝지은 한 줄의 날개 둘은 색이 같아서, 둘이 서로
        자리를 맞바꿔도 짝지은 줄처럼 보여요. 그래서 날개 홀짝이 어긋난 것은
        엣지 짝짓기를 마칠 때까지 드러나지 않아요. 3×3처럼 맞추는 마지막
        단계에서야 그 줄 하나만 뒤집힌 것처럼 보여요. 날개는 한 방향으로만
        끼워지니, OLL 패리티는 사실 한 줄의 날개 둘이 서로 자리를 맞바꾼
        꼴이에요.
      </Lead>
      <Lead>
        PLL 패리티는 위층에서 엣지 한 줄 둘만 자리가 바뀐 꼴이에요. 3×3이었다면
        앞에서 본 자리 홀짝 규칙 때문에 생기지 않아요. 4×4에서는 바깥 면이든
        안쪽 층이든 한 층을 돌리면, 코너 블럭 자리의 홀짝과 함께 바뀌는 것이
        센터 블럭 자리의 홀짝이에요. 그런데 같은 색 센터 블럭끼리는 자리가
        바뀌어도 똑같아 보여서, 센터 모으기를 마친 큐브에서도 센터 블럭 자리의
        홀짝은 눈으로 알 수 없어요. 3×3처럼 맞추는 단계는 이 숨은 홀짝을 따지지
        않으니, 위층의 자리를 맞출 때 엣지 한 줄 둘만 바뀐 꼴이 나올 수 있어요.
      </Lead>
      <Notation />

      <div className="flex flex-wrap gap-1.5">
        {SIZES.map((s) => (
          <Pill
            key={s}
            active={s === n}
            onClick={() => {
              setN(s);
              setSlice(0);
            }}
            attr={{ "data-sizes-tab": String(s) }}
          >
            {s}×{s}
          </Pill>
        ))}
      </div>
      <p className="break-keep text-white/60 text-xs">
        아래 표의 날개 묶음은 서로 자리를 바꿀 수 있는 날개끼리의 무리예요.
        6×6부터는 코너 블럭 쪽 바깥 날개와 안쪽 날개가 서로 섞이지 않아 묶음이
        둘이에요. 가운데 엣지 블럭은 홀수 큐브에서 모서리 한 줄의 한가운데
        블럭이에요. OLL·PLL 패리티 칸은 3×3처럼 맞추는 단계에서 그 꼴이
        보이는지, 짝짓기 끝 날개 바뀜 칸은 엣지 짝짓기의 마지막 줄에서 날개 둘이
        서로 자리가 바뀐 꼴이 보이는지예요.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-center text-xs">
          <thead className="text-white/60">
            <tr>
              <th className="p-1">크기</th>
              <th className="p-1">날개 묶음</th>
              <th className="p-1">가운데 엣지 블럭</th>
              <th className="p-1">OLL 패리티</th>
              <th className="p-1">PLL 패리티</th>
              <th className="p-1">짝짓기 끝 날개 바뀜</th>
            </tr>
          </thead>
          <tbody>
            {facts.map((x) => (
              <tr
                key={x.n}
                className={cn(x.n === n ? "bg-sky-500/20" : "")}
                data-sizes-row={x.n}
              >
                <td className="p-1 font-bold">
                  {x.n}×{x.n}
                </td>
                <td className="p-1">{x.wingOrbits}개</td>
                <td className="p-1">{x.midges ? "있음" : "없음"}</td>
                <td className="p-1">{yes(x.ollParity)}</td>
                <td className="p-1">{yes(x.pllParity)}</td>
                <td className="p-1">{x.midges ? yes(x.pairingParity) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-white/70">
          안쪽 한 층 돌려 보기. 2R은 오른쪽에서 둘째 층을 R과 같은 방향으로
          돌리는 수예요. 6×6·7×7에는 셋째 층을 돌리는 3R도 있어요.
        </span>
        {f.slices.map((s, i) => (
          <Pill key={s.move} active={i === slice} onClick={() => setSlice(i)}>
            {s.move}
          </Pill>
        ))}
      </div>
      <p className="break-keep text-sm" data-sizes-slice>
        {sl.move}:{" "}
        {sl.wings
          .map((w, i) => {
            const many = sl.wings.length > 1;
            const name = many
              ? `${i === 0 ? "바깥" : "안쪽"} 날개 묶음`
              : "날개";
            if (w.length === 0) return `${name}은 그대로예요.`;
            const swaps = w.reduce((a, k) => a + k - 1, 0);
            return `${name}${many ? "에서" : ""} ${w.join("개, ")}개가 한 바퀴 돌아요. 맞바꾸기 ${swaps}번이라 홀짝이 ${swaps % 2 ? "바뀌어요" : "그대로예요"}.`;
          })
          .join(" ")}
        {sl.midges.length > 0 ? " 가운데 엣지 블럭도 함께 돌아요." : ""}
      </p>
      <div className="mx-auto w-full max-w-xs">
        <DemoCube
          key={`${n}-${sl.move}`}
          n={n}
          start={start}
          alg={`${sl.move} ${sl.move} ${sl.move} ${sl.move}`}
          mask={null}
          settings={settings}
          tps={1.5}
          autoPlay
          loop
        />
      </div>

      {f.midges ? (
        <Lead>
          {n}×{n}에는 3×3의 엣지 블럭처럼 움직이는 가운데 엣지 블럭과, 자리를
          옮기지 않는 면 정가운데 센터 블럭이 있어요. 면을 한 번 돌리면 코너
          블럭 4개와 가운데 엣지 블럭 4개가 함께 한 바퀴 돌아서, 둘의 자리
          홀짝은 3×3처럼 늘 같아요. 그래서 3×3처럼 맞추는 단계에서 갑자기
          나타나는 패리티는 없어요. 대신 날개 자리의 홀짝이 바뀐 것은 엣지
          짝짓기 때 드러나요. 날개를 가운데 엣지 블럭 양옆에 붙이기 때문에,
          마지막 줄에서 날개 둘이 서로 자리가 바뀐 꼴로 보여요. 이 꼴만 고치는
          공식이 따로 있고, 큐브 배우기의 5×5 과정에서 배워요.
        </Lead>
      ) : (
        <Lead>
          {n}×{n}에는 가운데 엣지 블럭도, 자리가 고정된 정가운데 센터 블럭도
          없어요.{" "}
          {f.wingOrbits > 1
            ? "날개 묶음이 둘이라 묶음마다 홀짝이 따로 바뀌고, 4×4처럼 3×3 단계에서 패리티가 나와요."
            : "날개 자리의 홀짝과 센터 블럭 자리의 홀짝이 겉으로 드러나지 않아, 3×3 단계에서 OLL·PLL 패리티로 보여요."}
        </Lead>
      )}
      <Quiz
        key={n}
        id={`sizes-${n}`}
        question={`${n}×${n}을 3×3처럼 맞추는 단계에서 PLL 패리티, 곧 엣지 한 줄 둘만 자리가 바뀐 꼴이 생길 수 있을까요?`}
        choices={["생길 수 있다", "생기지 않는다"]}
        answer={f.pllParity ? 0 : 1}
        why={
          f.pllParity
            ? "짝수 큐브는 같은 색 센터 블럭끼리 바뀌어도 똑같아 보여서, 엣지 한 줄들의 자리 홀짝이 코너 블럭의 홀짝과 어긋나도 3×3 단계까지 드러나지 않아요."
            : "홀수 큐브는 가운데 엣지 블럭의 자리 홀짝이 코너 블럭의 홀짝과 늘 같아서, 3×3처럼 맞출 때는 어긋나지 않아요."
        }
      />
      <Source>
        날개 묶음 수와 안쪽 층이 만드는 고리 길이는 이 페이지가 4×4~7×7 큐브를
        직접 돌려 세어 맞춘 값이에요.
      </Source>
    </div>
  );
}
