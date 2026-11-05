import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import {
  coreHeat,
  css,
  deepColor,
  rhythm,
  rimColor,
  sizeOf,
  spiked,
} from "./star-look";

/**
 * 쌀알 무늬(대류 세포) 두 겹. 한 번 그려 둔 그림이라 프레임마다 다시 계산하지 않고, 겹을 천천히 돌려 이글거리게 한다.
 * 밝은 겹은 흰 얼룩, 어두운 겹은 검은 얼룩이고 서로 반대로 돈다
 */
const noise = (seed: number, freq: number, dark: boolean) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${dark ? 0 : 1} 0 0 0 0 ${dark ? 0 : 1} 0 0 0 0 ${dark ? 0 : 1} 0 0 0 2.2 -0.9'/></filter><rect width='80' height='80' filter='url(#n)'/></svg>`,
  )}")`;
const GRAIN_LIGHT = noise(3, 0.16, false);
const GRAIN_DARK = noise(11, 0.2, true);

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
 * 진한 색 원반 + 이글거리는 쌀알 무늬 + 숨 쉬는 빛무리. 밝은 별일수록 크고 1등급보다 밝으면 빛줄기가 선다.
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
  const d = base * sizeOf(mag);
  const deep = deepColor(k);
  const rim = rimColor(k);
  const heat = coreHeat(k);
  const beat = rhythm(seed);
  const box: CSSProperties = {
    width: `${d}%`,
    aspectRatio: "1",
    opacity: dim ? 0.45 : 1,
  };
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
      {/* 빛무리: 별 색으로 넓게 번지고 천천히 숨 쉰다 */}
      <span
        className="star-breathe absolute top-1/2 left-1/2 size-[260%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `radial-gradient(circle, ${css(deep, 0.55)} 0%, ${css(deep, 0.18)} 38%, transparent 68%)`,
          animationDuration: `${beat.breatheMs}ms`,
          animationDelay: `${beat.delayMs}ms`,
        }}
      />
      {spiked(mag) && (
        <span
          className="absolute top-1/2 left-1/2 size-[330%] -translate-x-1/2 -translate-y-1/2"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${css(deep, 0.5)} 50%, transparent 100%) center / 100% 5% no-repeat, linear-gradient(0deg, transparent 0%, ${css(deep, 0.5)} 50%, transparent 100%) center / 5% 100% no-repeat`,
          }}
        />
      )}
      {/* 원반: 가운데는 뜨거울수록 하얗게, 가장자리는 어둡게 */}
      <span
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 44% 42%, rgba(255,250,240,${0.55 + heat * 0.45}) 0%, ${css(deep)} ${30 + (1 - heat) * 18}%, ${css(rim)} 100%)`,
          boxShadow: `0 0 ${Math.max(2, d * 0.08)}px ${css(deep, 0.8)}`,
        }}
      >
        <span
          className="star-boil absolute -inset-1/4 rounded-full mix-blend-soft-light"
          style={{
            backgroundImage: GRAIN_LIGHT,
            backgroundSize: "60% 60%",
            opacity: 0.9,
            animationDuration: `${beat.boilMs}ms`,
            animationDelay: `${beat.delayMs}ms`,
          }}
        />
        <span
          className="star-boil-back absolute -inset-1/4 rounded-full mix-blend-multiply"
          style={{
            backgroundImage: GRAIN_DARK,
            backgroundSize: "70% 70%",
            opacity: 0.35,
            animationDuration: `${Math.round(beat.boilMs * 1.3)}ms`,
            animationDelay: `${beat.delayMs}ms`,
          }}
        />
      </span>
    </span>
  );
}
