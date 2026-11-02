"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { LottoBall } from "@/stardraw/components/parts";
import {
  SKY_STARS,
  type SkyStar,
  starLight,
  starOf,
  tempWord,
} from "@/stardraw/sky";
import {
  bump,
  css,
  peakNm,
  planck,
  type Spectrum,
  spectrumRgb,
  sum,
  wavelengthCss,
} from "@/stardraw/spectrum";

import { P } from "../learn/ui";

/** 그림의 파장 범위(nm). 보이는 빛(380~750)보다 넓게 잡아 곡선의 꼭대기가 보이게 한다 */
const NM_MIN = 150;
const NM_MAX = 1300;
const SEE_MIN = 380;
const SEE_MAX = 750;

const W = 360;
const H = 150;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

const xOf = (nm: number) => ((nm - NM_MIN) / (NM_MAX - NM_MIN)) * W;

/** 보이는 빛 띠의 무지개 색 */
const RAINBOW = Array.from({ length: 19 }, (_, i) => {
  const nm = SEE_MIN + ((SEE_MAX - SEE_MIN) * i) / 18;
  return { offset: i / 18, color: wavelengthCss(nm) };
});

function where(nm: number): string {
  if (nm < SEE_MIN) return "자외선(눈에 안 보임)";
  if (nm > SEE_MAX) return "적외선(눈에 안 보임)";
  if (nm < 450) return "보라·파랑";
  if (nm < 495) return "파랑";
  if (nm < 570) return "초록";
  if (nm < 590) return "노랑";
  if (nm < 620) return "주황";
  return "빨강";
}

/** 빛 세기 곡선 그림: 가운데 무지개 띠가 눈에 보이는 범위, 곡선 아래는 그 빛이 눈에 보이는 색으로 칠한다 */
function SpectrumChart({
  f,
  peak,
  id,
}: {
  f: Spectrum;
  /** 꼭대기 표시(nm) */
  peak?: number;
  id: string;
}) {
  const color = css(spectrumRgb(f));
  const { line, area } = useMemo(() => {
    const pts: [number, number][] = [];
    for (let nm = NM_MIN; nm <= NM_MAX; nm += 5) pts.push([nm, f(nm)]);
    const top = Math.max(...pts.map(([, v]) => v));
    const yOf = (v: number) =>
      H - PAD_BOTTOM - (v / top) * (H - PAD_TOP - PAD_BOTTOM);
    const d = pts
      .map(
        ([nm, v], i) =>
          `${i ? "L" : "M"}${xOf(nm).toFixed(1)},${yOf(v).toFixed(1)}`,
      )
      .join("");
    return {
      line: d,
      area: `${d}L${W},${H - PAD_BOTTOM}L0,${H - PAD_BOTTOM}Z`,
    };
  }, [f]);
  const base = H - PAD_BOTTOM;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="빛의 세기를 파장별로 그린 곡선"
    >
      <defs>
        <linearGradient id={`${id}-rainbow`} x1="0" x2="1" y1="0" y2="0">
          {RAINBOW.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <rect
        x={xOf(SEE_MIN)}
        y={PAD_TOP}
        width={xOf(SEE_MAX) - xOf(SEE_MIN)}
        height={base - PAD_TOP}
        fill={`url(#${id}-rainbow)`}
        opacity={0.22}
      />
      <rect
        x={xOf(SEE_MIN)}
        y={base + 2}
        width={xOf(SEE_MAX) - xOf(SEE_MIN)}
        height={4}
        fill={`url(#${id}-rainbow)`}
      />
      <path d={area} fill={color} opacity={0.35} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} />
      <line x1={0} x2={W} y1={base} y2={base} stroke="rgba(255,255,255,0.3)" />
      {peak !== undefined && peak >= NM_MIN && peak <= NM_MAX && (
        <line
          x1={xOf(peak)}
          x2={xOf(peak)}
          y1={PAD_TOP}
          y2={base}
          stroke="rgba(255,255,255,0.55)"
          strokeDasharray="3 3"
        />
      )}
      <g fill="rgba(255,255,255,0.6)" fontSize={10} textAnchor="middle">
        <text x={xOf(NM_MIN + 110)} y={H - 4}>
          자외선
        </text>
        <text x={xOf((SEE_MIN + SEE_MAX) / 2)} y={H - 4}>
          눈에 보이는 빛
        </text>
        <text x={xOf(NM_MAX - 250)} y={H - 4}>
          적외선
        </text>
      </g>
    </svg>
  );
}

function Glow({ color, size = 72 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, #fff 0 8%, ${color} 22%, color-mix(in srgb, ${color} 40%, transparent) 42%, transparent 70%)`,
      }}
    />
  );
}

const T_MIN = 2000;
const T_MAX = 35000;
const posOf = (k: number) => Math.log(k / T_MIN) / Math.log(T_MAX / T_MIN);
const kOf = (pos: number) => Math.round(T_MIN * (T_MAX / T_MIN) ** pos);

/** 온도 띠: 온도마다 계산한 별빛 색 */
const TEMP_STRIP = Array.from({ length: 25 }, (_, i) => {
  const k = kOf(i / 24);
  return `${css(spectrumRgb(planck(k)))} ${((i / 24) * 100).toFixed(1)}%`;
}).join(",");

/** 같은 온도의 별끼리 위로 쌓는다 */
const TICKS = (() => {
  const seen = new Map<number, number>();
  return SKY_STARS.map((s) => {
    const row = seen.get(s.k) ?? 0;
    seen.set(s.k, row + 1);
    return { s, row };
  });
})();

const SUN = 5800;

/** 별빛 실험실: 온도를 바꾸면 곡선과 색이 바뀐다. 아래 띠의 점은 우리 별 45개 */
function StarLab() {
  const [k, setK] = useState(SUN);
  const [picked, setPicked] = useState<SkyStar | null>(null);
  const f = useMemo(() => planck(k), [k]);
  const peak = peakNm(k);
  const color = css(spectrumRgb(f));
  const pick = (s: SkyStar | null, kk: number) => {
    setPicked(s);
    setK(kk);
  };
  return (
    <div
      data-star-lab
      className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/[0.03] p-4"
    >
      <div className="flex items-center gap-4">
        <Glow color={color} />
        <div className="flex min-w-0 flex-col">
          <span className="font-bold text-lg" data-lab-name>
            {picked ? `${picked.n} ${picked.ko}` : k === SUN ? "해" : "별"}{" "}
            <span className="font-normal text-base text-white/70 tabular-nums">
              {k.toLocaleString()} K
            </span>
          </span>
          <span className="text-sm text-white/75">
            곡선 꼭대기 {Math.round(peak).toLocaleString()} nm · {where(peak)}
          </span>
          <span className="text-sm text-white/75">
            눈에 보이는 색: {tempWord(k)}
          </span>
        </div>
      </div>
      <SpectrumChart f={f} peak={peak} id="lab" />
      <div className="flex flex-col gap-1">
        <div className="relative mx-2 h-12">
          {TICKS.map(({ s, row }) => (
            <button
              key={s.n}
              type="button"
              aria-label={`${s.n} ${s.ko} ${s.k} K`}
              title={`${s.n} ${s.ko} · ${s.k.toLocaleString()} K`}
              onClick={() => pick(s, s.k)}
              className={cn(
                "absolute size-2.5 -translate-x-1/2 rounded-full",
                picked?.n === s.n && "ring-2 ring-white",
              )}
              style={{
                left: `${posOf(s.k) * 100}%`,
                bottom: row * 11,
                background: starLight(s.n),
              }}
            />
          ))}
        </div>
        <div
          className="mx-2 h-3 rounded-full"
          style={{ background: `linear-gradient(to right, ${TEMP_STRIP})` }}
        />
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(posOf(k) * 1000)}
          onChange={(e) => pick(null, kOf(Number(e.target.value) / 1000))}
          aria-label="표면 온도"
          className="w-full accent-amber-200"
        />
        <div className="flex justify-between text-white/55 text-xs">
          <span>2,000 K 차갑다</span>
          <span>35,000 K 뜨겁다</span>
        </div>
      </div>
      <p className="text-sm text-white/70">
        띠 위의 점은 예측판의 별 45개입니다. 점을 누르면 그 별의 곡선이
        나옵니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            [7, null],
            [2, null],
            [null, SUN],
            [1, null],
            [37, null],
          ] as const
        ).map(([n, kk]) => {
          const s = n ? starOf(n) : null;
          return (
            <button
              key={n ?? "sun"}
              type="button"
              onClick={() => pick(s, s ? s.k : (kk ?? SUN))}
              className="rounded-full border border-white/25 px-3 py-1 text-sm hover:bg-white/10"
            >
              {s ? s.ko : "해"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 직접 만드는 빛: 봉우리의 자리와 넓이를 마음대로 바꿀 수 있다면 */
function BumpLab() {
  const [center, setCenter] = useState(530);
  const [width, setWidth] = useState(15);
  const [twin, setTwin] = useState(false);
  const f = useMemo(
    () =>
      twin ? sum(bump(center, width), bump(450, width)) : bump(center, width),
    [center, width, twin],
  );
  const color = css(spectrumRgb(f));
  const presets: [string, number, number, boolean][] = [
    ["좁은 초록", 530, 15, false],
    ["넓은 초록", 530, 130, false],
    ["빨강 + 파랑", 630, 20, true],
  ];
  return (
    <div
      data-bump-lab
      className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-white/[0.03] p-4"
    >
      <div className="flex items-center gap-4">
        <Glow color={color} />
        <p className="text-sm text-white/80">
          {twin
            ? "봉우리 둘: 하나는 450 nm(파랑)에 두고, 다른 하나를 움직입니다."
            : "봉우리 하나: 자리와 넓이를 움직여 보세요."}
        </p>
      </div>
      <SpectrumChart f={f} id="bump" />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-white/75">
          봉우리 자리 {center} nm · {where(center)}
        </span>
        <input
          type="range"
          min={400}
          max={700}
          value={center}
          onChange={(e) => setCenter(Number(e.target.value))}
          className="w-full accent-amber-200"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-white/75">봉우리 넓이 {width} nm</span>
        <input
          type="range"
          min={8}
          max={200}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full accent-amber-200"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {presets.map(([label, c, w, t]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setCenter(c);
              setWidth(w);
              setTwin(t);
            }}
            className="rounded-full border border-white/25 px-3 py-1 text-sm hover:bg-white/10"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={twin}
          onClick={() => setTwin((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            twin
              ? "border-amber-200 bg-amber-200/15"
              : "border-white/25 hover:bg-white/10",
          )}
        >
          봉우리 둘
        </button>
      </div>
    </div>
  );
}

/** 다섯 구간마다 한 별씩: 계산한 색, 하늘의 별빛, 번호 공 */
const SAMPLES = [7, 9, 6, 1, 5] as const;

function ThreeColors() {
  const count = (n: number) => {
    const w = tempWord(starOf(n).k);
    return SKY_STARS.filter((s) => tempWord(s.k) === w).length;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm" data-three-colors>
        <thead>
          <tr className="text-left text-white/60 text-xs">
            <th className="py-2 font-normal">구간</th>
            <th className="py-2 font-normal">계산한 색</th>
            <th className="py-2 font-normal">하늘의 별빛</th>
            <th className="py-2 font-normal">번호 공</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLES.map((n) => {
            const s = starOf(n);
            return (
              <tr key={n} className="border-white/10 border-t">
                <td className="py-2">
                  <span className="font-semibold">{tempWord(s.k)}</span>
                  <span className="block text-white/55 text-xs">
                    {s.ko} {s.k.toLocaleString()} K · 45개 중 {count(n)}개
                  </span>
                </td>
                <td className="py-2">
                  <Glow color={css(spectrumRgb(planck(s.k)))} size={36} />
                </td>
                <td className="py-2">
                  <Glow color={starLight(n)} size={36} />
                </td>
                <td className="py-2">
                  <LottoBall n={n} size="md" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-2 font-bold text-base">{children}</h3>;
}

/**
 * 별 이야기 「별의 색」(/stardraw/stars#colors)의 체험 상자와 설명(2026-11-02 배우기에서 옮김).
 * 온도 실험실 → 초록·분홍 별이 없는 까닭 → 봉우리 실험실 → 번호 공과 하늘의 별빛 차례로 둔다
 */
export function StarColorToys() {
  return (
    <div className="flex flex-col gap-4">
      <StarLab />
      <H3>초록 별이 없는 까닭</H3>
      <P>
        위에서 「해」를 눌러 보세요. 곡선 꼭대기는 약 500 nm, 청록색 근처입니다.
        그런데 해는 초록이 아니라 흰빛입니다. 언덕이 넓어서 꼭대기가 초록에 와도
        빨강과 파랑을 거의 같은 세기로 함께 덮기 때문입니다. 빨강·초록·파랑이
        고루 섞이면 눈에는 흰빛입니다.
      </P>
      <P>
        초록으로 보이려면 초록만 세고 빨강·파랑은 약해야 합니다. 그러려면 언덕이
        좁아야 하는데, 별빛의 언덕은 온도를 바꿔도 넓이가 그대로 넓습니다.
        그래서 초록 별 자리에는 흰 별이 옵니다. 해가 노랗게 보이는 것은 대기가
        파란빛을 흩어 버려서이고, 우주에서 보면 해는 흰빛입니다.
      </P>
      <H3>분홍·보라 별이 없는 까닭</H3>
      <P>
        분홍(자홍)은 무지개에 없는 색입니다. 빨강과 파랑이 함께 오고 그 사이
        초록이 빠진 빛을 눈이 분홍으로 느낍니다. 그러려면 봉우리가 빨강과 파랑에
        하나씩, 둘이어야 합니다. 별빛의 곡선은 봉우리가 하나뿐이라 가운데 초록만
        비게 만들 수 없습니다.
      </P>
      <P>
        아주 뜨거운 별은 꼭대기가 보라보다 짧은 자외선으로 갑니다. 그래도 넓은
        언덕의 꼬리가 파랑·초록·빨강을 함께 덮어 하늘빛이 도는 흰색으로 보이고,
        온도를 끝까지 올려도 거기서 멈춥니다. 그래서 별의 색은 모두 붉은 빛에서
        푸른 빛까지 한 줄 위에 있습니다. 실험실의 온도 띠가 그 줄입니다.
      </P>
      <H3>봉우리를 마음대로 만들 수 있다면</H3>
      <P>
        별이 아닌 빛이라면 봉우리 넓이를 고를 수 있습니다. 좁은 초록 봉우리는
        진한 초록(초록 레이저, 신호등)이고, 넓히면 흰빛으로 바랩니다. 빨강과
        파랑 봉우리 둘이면 분홍입니다.
      </P>
      <BumpLab />
      <H3>번호 공은 진하게, 하늘의 별빛은 실제처럼</H3>
      <P>
        예측판은 한 별의 색을 두 가지로 칠합니다. 하늘 그림의 별빛은 실제 별처럼
        옅게, 번호 공은 진하게 칠합니다.
      </P>
      <ThreeColors />
      <ul className="list-disc space-y-2 pl-5 text-sm text-white/85">
        <li>
          <b>계산한 색</b>은 플랑크 곡선을 눈의 색 감각으로 바꾼, 사진기로 찍은
          듯한 색입니다. 언덕이 넓어 모두 옅고, 가장 붉은 베텔게우스도 연한
          주황입니다.
        </li>
        <li>
          <b>하늘의 별빛</b>은 여기에 흰빛을 조금 더 섞었습니다. 밤에 어두운
          빛은 색을 못 느끼는 눈 세포(막대세포)가 받아서, 맨눈으로 본 별은
          사진보다 더 하얗습니다. 예측판을 실제 밤하늘처럼 보이게 하려고 옅게
          두었습니다.
        </li>
        <li>
          <b>번호 공</b>은 한눈에 구별되어야 합니다. 실제 색은 서로 너무 비슷해
          공으로 칠하면 흰 공과 노란 공을 가리기 어렵습니다. 그래서 표면 온도를
          다섯 구간(4,000·5,500·7,000·10,000 K에서 나눔)으로 나눠 구간마다 진한
          색 하나를 칠했습니다. 천문학자가 별을 O B A F G K M 분광형으로 나누는
          것과 같은 생각입니다.
        </li>
      </ul>
      <P>
        계산 방법: 별빛 곡선은 플랑크의 흑체 복사 식, 꼭대기 파장은 빈의
        법칙(2,897,800 nm·K ÷ 온도), 눈의 색 감각은 CIE 1931 등색
        함수(Wyman·Sloan·Shirley 2013 근사식), 화면 색은 sRGB입니다. 화면이 낼
        수 없는 진한 색은 흰빛을 섞어 화면 안으로 들이고, 밝기는 맞춰 색만
        비교합니다.
      </P>
    </div>
  );
}
