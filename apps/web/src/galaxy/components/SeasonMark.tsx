import { cn } from "@/lib/cn";

/**
 * 칸의 계절 표시(2026-11-05 사용자 「계절별 별자리끼리 식별할 방법도 필요」). 별자리 자리가 섞인 판에서도
 * 칸마다 그 별자리가 어느 계절 하늘인지 보인다. 색과 모양 둘 다 달라 색만으로 가르지 않는다:
 * 봄 꽃(연두), 여름 해(분홍), 가을 잎(주황), 겨울 눈송이(하늘색). 색은 별자리 띠 색(star-color.ts)과 같은 갈래
 */
export const SEASON_KO = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
} as const;

export function SeasonMark({
  season,
  className,
}: {
  season: "spring" | "summer" | "autumn" | "winter" | null;
  className?: string;
}) {
  if (!season) return null;
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      data-season-mark={season}
      className={cn("drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]", className)}
    >
      {season === "spring" && (
        <g fill="#86efac">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse
              key={a}
              cx="10"
              cy="5.2"
              rx="3"
              ry="4.4"
              transform={`rotate(${a} 10 10)`}
            />
          ))}
          <circle cx="10" cy="10" r="2.4" fill="#fef9c3" />
        </g>
      )}
      {season === "summer" && (
        <g stroke="#f9a8d4" strokeWidth="2" strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1="10"
              y1="1.5"
              x2="10"
              y2="4"
              transform={`rotate(${a} 10 10)`}
            />
          ))}
          <circle cx="10" cy="10" r="4.3" fill="#f9a8d4" stroke="none" />
        </g>
      )}
      {season === "autumn" && (
        <g>
          <path
            d="M10 1.5 C15.5 5 17 10 10 18.5 C3 10 4.5 5 10 1.5 Z"
            fill="#fdba74"
            transform="rotate(35 10 10)"
          />
          <path
            d="M10 4 V17"
            stroke="#9a3412"
            strokeWidth="1.1"
            transform="rotate(35 10 10)"
          />
        </g>
      )}
      {season === "winter" && (
        <g stroke="#bae6fd" strokeWidth="1.8" strokeLinecap="round">
          {[0, 60, 120].map((a) => (
            <g key={a} transform={`rotate(${a} 10 10)`}>
              <line x1="10" y1="1.5" x2="10" y2="18.5" />
              <line x1="10" y1="4" x2="8" y2="2.5" />
              <line x1="10" y1="4" x2="12" y2="2.5" />
              <line x1="10" y1="16" x2="8" y2="17.5" />
              <line x1="10" y1="16" x2="12" y2="17.5" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
