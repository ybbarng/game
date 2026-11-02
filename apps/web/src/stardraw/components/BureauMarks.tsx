import { useId } from "react";

import {
  CARINA_LINES,
  CARINA_STARS,
  type CarinaStar,
  starPath,
} from "../astronaut/marks";

/** 용골자리 별을 (x, y)로 옮겨 그리는 자리. 직인 좌표(0~100 칸 위쪽)를 비율 s로 줄여 가운데에 놓는다 */
function carinaAt(cx: number, cy: number, s: number) {
  // 직인 좌표의 별 묶음 가운데(x 18~84, y 18~49)
  const mx = 51;
  const my = 33.5;
  return (k: CarinaStar): [number, number] => {
    const [x, y] = CARINA_STARS[k];
    return [cx + (x - mx) * s, cy + (y - my) * s];
  };
}

/**
 * 카노푸스 우주국 로고(2026-11-02 사용자: 편지지 머리글): 둥근 테 안에 용골자리 선과 가장 큰 별 카노푸스, 아래에 낮은
 * 지평선. 카노푸스가 우리나라에서는 남쪽 지평선 위로 겨우 떠오르는 별(노인성)이라는 이야기(우주국 소개)를 담았다.
 * 한 색(`currentColor`)으로 그려 종이에 인쇄된 머리글처럼 쓴다
 */
export function BureauLogo({ className }: { className?: string }) {
  const at = carinaAt(50, 42, 0.78);
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="카노푸스 우주국 로고"
      data-bureau-logo
      className={className}
      fill="none"
      stroke="currentColor"
    >
      <circle cx="50" cy="50" r="46" strokeWidth="2.4" />
      <circle cx="50" cy="50" r="41" strokeWidth="0.9" />
      {/* 낮은 지평선: 테 안쪽을 가로지르는 완만한 호와 그 아래 옅은 땅 */}
      <path d="M11 66 Q50 58 89 66" strokeWidth="1.6" />
      <path
        d="M11 66 Q50 58 89 66 A41 41 0 0 1 11 66 Z"
        fill="currentColor"
        stroke="none"
        opacity="0.12"
      />
      {CARINA_LINES.map((l) => (
        <polyline
          key={l.join("-")}
          points={l.map((k) => at(k).join(",")).join(" ")}
          strokeWidth="1.1"
          strokeLinejoin="round"
          opacity="0.8"
        />
      ))}
      {(Object.keys(CARINA_STARS) as CarinaStar[]).map((k) => {
        const [x, y] = at(k);
        return (
          <path
            key={k}
            d={starPath(x, y, k === "alpha" ? 7.5 : 2.6)}
            fill="currentColor"
            stroke="none"
          />
        );
      })}
    </svg>
  );
}

/** 밀랍 가장자리: 둥근 모양을 고정된 물결로 살짝 일그러뜨린 점들(어느 화면에서나 같은 모양) */
function waxEdge(): string {
  const n = 28;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 44 + 2.2 * Math.sin(t * 5 + 0.7) + 1.3 * Math.sin(t * 9 + 2.1);
    pts.push(
      `${(50 + r * Math.cos(t)).toFixed(2)},${(50 + r * Math.sin(t)).toFixed(2)}`,
    );
  }
  return `M${pts.join(" L")} Z`;
}
const WAX_EDGE = waxEdge();

/**
 * 봉투의 실링왁스(2026-11-02 사용자: 글자 씰 대신 용골자리 모양을 눌러 찍은 밀랍). 붉은 밀랍 위에 눌린 테와
 * 도드라지게 새겨진 용골자리(카노푸스가 가장 큰 별)
 */
export function WaxSeal({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const at = carinaAt(50, 51, 0.6);
  const emboss = (dx: number, dy: number, color: string, w: number) => (
    <g
      transform={`translate(${dx} ${dy})`}
      stroke={color}
      fill="none"
      strokeLinejoin="round"
    >
      {CARINA_LINES.map((l) => (
        <polyline
          key={l.join("-")}
          points={l.map((k) => at(k).join(",")).join(" ")}
          strokeWidth={w}
        />
      ))}
      {(Object.keys(CARINA_STARS) as CarinaStar[]).map((k) => {
        const [x, y] = at(k);
        return (
          <path
            key={k}
            d={starPath(x, y, k === "alpha" ? 6.5 : 2.4)}
            fill={color}
            stroke="none"
          />
        );
      })}
    </g>
  );
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      data-wax-seal
      className={className}
    >
      <defs>
        <radialGradient id={`${id}-wax`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#d23a32" />
          <stop offset="0.55" stopColor="#a8231d" />
          <stop offset="1" stopColor="#6e1410" />
        </radialGradient>
      </defs>
      <path
        d={WAX_EDGE}
        fill={`url(#${id}-wax)`}
        style={{ filter: "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.45))" }}
      />
      {/* 눌린 테: 어두운 홈과 아래쪽 밝은 턱 */}
      <circle
        cx="50"
        cy="50"
        r="33"
        fill="none"
        stroke="rgba(70,8,6,0.55)"
        strokeWidth="2.4"
      />
      <circle
        cx="50.6"
        cy="51"
        r="33"
        fill="none"
        stroke="rgba(255,190,175,0.25)"
        strokeWidth="1"
      />
      {/* 도드라진 별자리: 밝은 윗면 + 어두운 그림자 */}
      {emboss(0.7, 0.9, "rgba(70,8,6,0.6)", 2.2)}
      {emboss(0, 0, "rgba(255,205,190,0.55)", 1.6)}
    </svg>
  );
}
