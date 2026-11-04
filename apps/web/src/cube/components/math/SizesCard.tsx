"use client";

import { solvedCube } from "@game/cube-engine";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid } from "../../bridge";
import { PARITY_4X4 } from "../../learn/algs-big";
import { invertText, stateAfter } from "../../math/pieces";
import { sizeFacts } from "../../math/sizes";
import type { CubeSettings } from "../../settings";
import { CubeNet } from "../CubeNet";
import { DemoCube } from "../DemoCube";
import { Lead, Pill, Quiz, Source } from "./ui";

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
        4×4를 3×3처럼 만들어(센터 모으기, 엣지 짝짓기) 맞추다 보면 3×3에서는
        절대 안 나오는 모양이 나와요. 엣지 하나만 뒤집힌 꼴(OLL 패리티), 엣지
        둘만 바뀐 꼴(PLL 패리티)이에요.
      </Lead>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "OLL 패리티", s: oll },
          { label: "PLL 패리티", s: pll },
        ].map(({ label, s }) => (
          <figure key={label} className="flex flex-col items-center gap-1">
            <CubeNet
              n={4}
              faces={faceGrid(4, s)}
              colors={settings.colors}
              hidden={settings.hidden}
              className="h-auto w-full max-w-[200px]"
            />
            <figcaption className="text-white/70 text-xs">{label}</figcaption>
          </figure>
        ))}
      </div>
      <Lead>
        까닭은 날개에 있어요. 안쪽 한 층을 90° 돌리면 날개 4개가 한 바퀴 돌아요.
        4개 고리는 맞바꾸기 3번이라 홀이에요. 그런데 짝수 큐브는 센터도 움직이고
        같은 색 센터는 서로 구별이 안 돼서, 이 홀짝을 바로잡아 줄 기준이 없어요.
        그래서 3×3 단계까지 남아 패리티로 보여요.
      </Lead>

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
      <p className="text-white/60 text-xs">
        OLL·PLL 패리티는 3×3처럼 맞추는 단계에서 보이는지, 짝짓기 끝 뒤집힘은
        엣지 짝짓기 마지막 두 짝에서 날개 짝 하나가 뒤집혀 보이는지예요.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-center text-xs">
          <thead className="text-white/60">
            <tr>
              <th className="p-1">크기</th>
              <th className="p-1">날개 고리</th>
              <th className="p-1">가운데 엣지</th>
              <th className="p-1">OLL 패리티</th>
              <th className="p-1">PLL 패리티</th>
              <th className="p-1">짝짓기 끝 뒤집힘</th>
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
        <span className="text-white/70">안쪽 한 층 돌려 보기:</span>
        {f.slices.map((s, i) => (
          <Pill key={s.move} active={i === slice} onClick={() => setSlice(i)}>
            {s.move}
          </Pill>
        ))}
      </div>
      <p className="text-sm" data-sizes-slice>
        {sl.move}:{" "}
        {sl.wings
          .map((w, i) => {
            const name =
              sl.wings.length > 1
                ? `${i === 0 ? "바깥" : "안쪽"} 날개 고리`
                : "날개";
            if (w.length === 0) return `${name}는 그대로`;
            const swaps = w.reduce((a, k) => a + k - 1, 0);
            return `${name} ${w.join("·")}개가 한 바퀴(맞바꾸기 ${swaps}번, ${swaps % 2 ? "홀" : "짝"})`;
          })
          .join(", ")}
        {sl.midges.length > 0 ? ", 한가운데 엣지도 함께 돌아요" : ""}
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
          {n}×{n}에는 3×3 엣지처럼 움직이는 한가운데 엣지와 움직이지 않는
          한가운데 칸이 있어요. 한가운데 엣지의 자리 짝은 코너 짝과 묶여 있어서,
          3×3처럼 맞추는 단계에서 갑자기 나타나는 패리티는 없어요. 대신 날개
          고리의 홀짝은 엣지 짝짓기 마지막 두 짝에서 날개 짝 하나가 뒤집힌 꼴로
          나타나고, 그때 공식으로 고쳐요.
        </Lead>
      ) : (
        <Lead>
          {n}×{n}에는 한가운데 엣지도 고정된 한가운데 칸도 없어요.{" "}
          {f.wingOrbits > 1
            ? "날개 고리가 둘이라 고리마다 홀짝이 따로 생기고, 4×4처럼 3×3 단계에서 패리티가 다시 나와요."
            : "날개 고리의 홀짝이 3×3 단계까지 남아 OLL·PLL 패리티로 보여요."}
        </Lead>
      )}
      <Quiz
        key={n}
        id={`sizes-${n}`}
        question={`${n}×${n}을 3×3처럼 맞추는 단계에서 PLL 패리티(엣지 둘만 바뀐 꼴)가 생길 수 있을까요?`}
        choices={["생길 수 있다", "생기지 않는다"]}
        answer={f.pllParity ? 0 : 1}
        why={
          f.pllParity
            ? "짝수 큐브라 날개 고리의 홀짝을 바로잡을 한가운데 엣지가 없어요."
            : "한가운데 엣지가 코너와 짝을 맞춰 줘요."
        }
      />
      <Source>
        날개 고리 수와 안쪽 층이 만드는 고리 길이는 이 페이지의 큐브 엔진이
        4×4~7×7에서 세어 맞춘 값이에요.
      </Source>
    </div>
  );
}
