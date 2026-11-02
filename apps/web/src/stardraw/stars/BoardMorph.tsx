"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../components/StageOverlay";
import { SKY_LINES, SKY_STARS, starLight, starRadius } from "../sky";
import real from "../sky-real.json";

/** 실제 하늘 자리(scripts/build-stardraw-sky.mjs 2단계 큰 틀, 퍼뜨리기 전): 번호 별은 n-1 차례, 선은 SKY_LINES와 같은 차례 */
const REAL = real as { stars: [number, number][]; lines: [number, number][][] };

/** 펴는 데 걸리는 시간(연출은 무슨 일인지 알아볼 만큼 천천히) */
const PLAY_MS = 6000;

/** 막대 자리마다 지금 무엇을 하는지 */
function stageOf(t: number): { title: string; body: string } {
  if (t < 0.05)
    return {
      title: "실제 하늘",
      body: "둥근 하늘을 적경(가로, 동쪽이 왼쪽)과 적위(세로, 위가 북쪽) 그대로 폈습니다. 겨울 하늘(오리온·쌍둥이·큰개)에 별이 몰려 있고, 오리온 허리띠의 20·37번은 거의 겹쳐 손가락으로 따로 누를 수 없습니다.",
    };
  if (t < 0.95)
    return {
      title: "옮기는 중",
      body: "몰린 곳은 넓히고 빈 곳은 채웁니다. 번호 별끼리는 손가락이 들어갈 틈을 두고, 별자리는 알아볼 수 있게 모양을 지킵니다. 원래 만나지 않던 선은 만나지 않고, 한 줄로 선 별은 한 줄 그대로 갑니다.",
    };
  return {
    title: "예측판",
    body: "별자리끼리의 거리와 크기는 실제와 다르지만, 동서남북 차례와 별자리의 모양은 그대로입니다. 오리온 허리띠는 세 별이 한 줄로 늘어선 채 벌어졌습니다.",
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 앞뒤가 부드러운 움직임(가운데가 빠르다) */
const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

/**
 * 별 이야기 「예측판은 어떻게 만들었나」(2026-11-02 사용자): 막대 하나로 실제 하늘에서 예측판으로 별과 별자리 선이
 * 옮겨 가는 것을 본다. 두 자리 사이를 곧게 섞은 그림이라, 사이 모습은 만드는 과정의 흉내다(마지막 자리는 실제 예측판)
 */
export function BoardMorph() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduce = useReducedMotion();
  const frame = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 누를 때의 자리(t)에서 한 번 시작한다
  useEffect(() => {
    if (!playing) return;
    if (reduce) {
      setT(1);
      setPlaying(false);
      return;
    }
    const from = t >= 1 ? 0 : t;
    const start = performance.now() - from * PLAY_MS;
    const step = (now: number) => {
      const next = Math.min(1, (now - start) / PLAY_MS);
      setT(next);
      if (next < 1) frame.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [playing, reduce]);

  const k = ease(t);
  const at = (from: [number, number], to: [number, number]) =>
    [lerp(from[0], to[0], k), lerp(from[1], to[1], k)] as const;
  const stage = stageOf(t);

  return (
    <div className="flex flex-col gap-3" data-board-morph>
      <svg
        viewBox="0 0 1 1"
        role="img"
        aria-label={`예측판 펴기: ${stage.title}`}
        className="block aspect-square w-full max-w-full rounded-xl border border-white/10 bg-[#070d19]"
      >
        <defs>
          <clipPath id="morph-clip">
            <rect x="0" y="0" width="1" height="1" />
          </clipPath>
        </defs>
        <g clipPath="url(#morph-clip)">
          {SKY_LINES.map((line, i) => {
            const from = REAL.lines[i] ?? [];
            const d = line.pts
              .map((p, j) => {
                const [x, y] = at(from[j] ?? p, p);
                return `${j === 0 ? "M" : "L"}${x.toFixed(4)},${y.toFixed(4)}`;
              })
              .join("");
            return (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: 선은 고정된 자료라 차례가 바뀌지 않는다
                key={i}
                d={d}
                fill="none"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={0.0025}
                strokeLinejoin="round"
              />
            );
          })}
          {SKY_STARS.map((s) => {
            const [x, y] = at(REAL.stars[s.n - 1] ?? [s.x, s.y], [s.x, s.y]);
            const r = (starRadius(s.mag) / 360) * 0.9;
            return (
              <g key={s.n} data-morph-star={s.n}>
                <circle
                  cx={x}
                  cy={y}
                  r={r * 2.4}
                  fill={starLight(s.n)}
                  opacity={0.18}
                />
                <circle cx={x} cy={y} r={r} fill={starLight(s.n)} />
                <text
                  x={x + r + 0.004}
                  y={y - r - 0.002}
                  fontSize={0.022}
                  fill="rgba(255,255,255,0.6)"
                >
                  {s.n}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          data-morph-play
          className="shrink-0 rounded-xl border border-amber-200/40 px-3.5 py-2 font-semibold text-amber-100 text-sm hover:bg-amber-200/10"
        >
          {playing ? "멈추기" : t >= 1 ? "다시 펴 보기" : "펴 보기"}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(t * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value) / 1000);
          }}
          aria-label="실제 하늘에서 예측판까지"
          data-morph-range
          className="min-w-0 flex-1 accent-amber-200"
        />
      </div>
      <div className="flex justify-between text-white/50 text-xs">
        <span>실제 하늘</span>
        <span>예측판</span>
      </div>
      <p className="text-sm text-white/80" data-morph-stage={stage.title}>
        <b className="text-amber-100">{stage.title}</b> · {stage.body}
      </p>
    </div>
  );
}
