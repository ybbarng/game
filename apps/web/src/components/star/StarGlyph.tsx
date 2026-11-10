import { type CSSProperties, useId } from "react";
import { cn } from "@/lib/cn";
import {
  coreHeat,
  css,
  deepColor,
  glowOf,
  type Rgb,
  rhythm,
  sizeOf,
} from "./star-look";
import "@/components/star/star.css";

/**
 * 쌀알 무늬(대류 세포). 한 번 그려 둔 그림이라 프레임마다 다시 계산하지 않고, 겹을 천천히 돌려 이글거리게 한다
 */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.16' numOctaves='3' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 2.2 -0.9'/></filter><rect width='80' height='80' filter='url(#n)'/></svg>`,
)}")`;

/** 빛무리 세기 곡선(가운데 1 → 바깥 0). 가운데서 빠르게 줄고 멀리 옅게 남는다(별 따기 `HALO_STOPS`의 결) */
const HALO_STOPS: readonly [number, number][] = [
  [0, 1],
  [20, 0.55],
  [35, 0.22],
  [50, 0.09],
  [70, 0.03],
  [100, 0],
];

const whiter = (c: Rgb, t: number): Rgb =>
  c.map((v) => Math.round(v + (255 - v) * t)) as unknown as Rgb;

export interface StarGlyphProps {
  /** 표면 온도(K) */
  k: number;
  /** 겉보기 등급 */
  mag: number;
  /** 박자를 가르는 값(칸 번호 등). 같은 값이면 늘 같은 박자 */
  seed: number;
  /** 등급 0인 별의 원반 지름(부모 너비에 대한 %) */
  base?: number;
  /** 흐리게(맡긴 별 등) */
  dim?: boolean;
  className?: string;
}

/**
 * 별 하나(2026-11-05 사용자 「별 느낌은 좀 약한 것 같음, 좀 더 자연스러워 보이게」).
 * 하늘의 별 따기 공·starship 하늘의 별과 같은 생각: 가운데가 하얗게 타고 둘레로 별 색이 번지며, 밝기는 원반 크기보다
 * 빛무리와 빛줄기로 낸다. 겹은 넷이다.
 * - 빛무리: 별 색, 가운데서 빠르게 줄고 멀리 옅게 남는다. 천천히 숨 쉰다
 * - 원반: 흰 핵 → 흰빛 섞인 별 색 → 별 색 → 투명. 가장자리가 딱 끊기지 않고 번진다. 안쪽에 쌀알 무늬가 옅게 이글거린다
 * - 빛줄기: 1.6등급보다 밝은 별만, 가운데 흰빛 → 별 색 → 투명으로 끝이 가늘어지는 ＋(세로가 조금 길다)
 * - 흰 핵: 작고 또렷한 흰 점. 빛줄기와 함께 별마다 다른 박자로 가끔 잠깐 반짝인다
 * 부모의 가운데에 놓이고(absolute), 움직임 줄이기면 멈춘 그림이다(globals.css)
 */
export function StarGlyph({
  k,
  mag,
  seed,
  base = 28,
  dim = false,
  className,
}: StarGlyphProps) {
  const id = useId();
  const d = base * sizeOf(mag);
  const deep = deepColor(k);
  const heat = coreHeat(k);
  const glow = glowOf(mag);
  const beat = rhythm(seed);
  const box: CSSProperties = {
    width: `${d}%`,
    aspectRatio: "1",
    opacity: dim ? 0.45 : 1,
  };
  const pale = whiter(deep, 0.55);
  // 빛줄기 그림은 세로 빛줄기 길이(1.15배)까지 덮는 정사각형. 그림 좌표 −1~1
  const spikeBox = glow.spike * 2 * 1.15;
  const along = 1 / 1.15;
  return (
    <span
      aria-hidden="true"
      data-star-glyph
      className={cn(
        "pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        className,
      )}
      style={box}
    >
      <span
        className="star-breathe absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: `${glow.halo * 100}%`,
          height: `${glow.halo * 100}%`,
          background: `radial-gradient(circle closest-side, ${HALO_STOPS.map(([t, a]) => `${css(deep, glow.haloA * a)} ${t}%`).join(", ")})`,
          animationDuration: `${beat.breatheMs}ms`,
          animationDelay: `${beat.delayMs}ms`,
        }}
      />
      <span
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle closest-side, rgba(255,255,255,1) 0%, rgba(255,253,248,${0.85 + heat * 0.15}) ${7 + heat * 9}%, ${css(pale)} ${22 + heat * 8}%, ${css(deep)} 48%, ${css(deep, 0.55)} 74%, ${css(deep, 0)} 100%)`,
        }}
      >
        <span
          className="star-boil absolute -inset-1/4 rounded-full mix-blend-soft-light"
          style={{
            backgroundImage: GRAIN,
            backgroundSize: "60% 60%",
            opacity: 0.55,
            maskImage:
              "radial-gradient(circle closest-side, #000 30%, transparent 60%)",
            WebkitMaskImage:
              "radial-gradient(circle closest-side, #000 30%, transparent 60%)",
            animationDuration: `${beat.boilMs}ms`,
            animationDelay: `${beat.delayMs}ms`,
          }}
        />
      </span>
      <span
        data-star-twinkle
        className="star-twinkle absolute top-1/2 left-1/2 size-full -translate-x-1/2 -translate-y-1/2"
        style={{
          animationDuration: `${beat.twinkleMs}ms`,
          animationDelay: `${beat.twinkleDelayMs}ms`,
        }}
      >
        {glow.spike > 0 && (
          <svg
            aria-hidden="true"
            viewBox="-1 -1 2 2"
            className="absolute top-1/2 left-1/2 block max-w-none -translate-x-1/2 -translate-y-1/2 overflow-visible"
            style={{
              width: `${spikeBox * 100}%`,
              height: `${spikeBox * 100}%`,
            }}
          >
            <defs>
              {(
                [
                  ["h", along],
                  ["v", 1],
                ] as const
              ).map(([n, len]) => (
                <linearGradient
                  key={n}
                  id={`${id}-${n}`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2={len}
                  y2="0"
                >
                  <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                  <stop offset="0.3" stopColor={css(pale)} stopOpacity="0.6" />
                  <stop offset="1" stopColor={css(deep)} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {(
              [
                [0, "h", along],
                [180, "h", along],
                [90, "v", 1],
                [270, "v", 1],
              ] as const
            ).map(([deg, n, len]) => (
              <polygon
                key={deg}
                points={`0,-0.024 ${len},0 0,0.024`}
                fill={`url(#${id}-${n})`}
                transform={`rotate(${deg})`}
              />
            ))}
          </svg>
        )}
        <span
          className="absolute top-1/2 left-1/2 size-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: `radial-gradient(circle closest-side, #fff 0%, rgba(255,255,255,0.9) 22%, ${css(pale, 0.35)} 55%, transparent 100%)`,
          }}
        />
      </span>
    </span>
  );
}
