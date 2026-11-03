import {
  CARINA_LINES,
  CARINA_STARS,
  type CarinaStar,
} from "../astronaut/carina";
import data from "../canopus-sky.json";
import { tempColor } from "../sky";

/**
 * 옛 아르고자리 자리: 실제 별(Bright Star Catalogue)과 별자리 선(d3-celestial)을 아르고호 둘레로 잘라 그리고,
 * 그 위에 직접 그린 단순한 배 윤곽을 흐리게 겹친다. 용골자리는 공용 정의(astronaut/carina.ts)의 잇는 별 목록으로
 * 또렷하게, 고물자리·돛자리는 그다음, 나머지는 아주 흐리게(우주국 소개 「용골자리와 아르고호」)
 */
interface Star {
  hr: number;
  ra: number;
  dec: number;
  mag: number;
  k: number;
}
const STARS = data.stars as Star[];
const LINES = (data.lines as { con: string; pts: [number, number][] }[]).filter(
  (l) => l.con !== "용골자리",
);
const ARGO_PARTS = new Set(["고물자리", "돛자리"]);
const CARINA_PTS: [number, number][][] = CARINA_LINES.map((l) =>
  l.map((k: CarinaStar) => [CARINA_STARS[k].ra, CARINA_STARS[k].dec]),
);

const W = 400;
const H = 400;
/** 가운데(적경·적위)와 가장자리까지의 각도 */
const RA0 = 131;
const DEC0 = -46;
const R = 34;
const rad = (d: number) => (d * Math.PI) / 180;
const K = W / 2 / (2 * Math.tan(rad(R) / 2));

/** 입체 투영(동쪽이 왼쪽, 올려다본 모습) */
function project(ra: number, dec: number) {
  const d = rad(ra - RA0);
  const δ = rad(dec);
  const δ0 = rad(DEC0);
  const c =
    Math.sin(δ0) * Math.sin(δ) + Math.cos(δ0) * Math.cos(δ) * Math.cos(d);
  const f = (2 * K) / (1 + c);
  return {
    x: W / 2 - f * Math.cos(δ) * Math.sin(d),
    y:
      H / 2 -
      f *
        (Math.cos(δ0) * Math.sin(δ) - Math.sin(δ0) * Math.cos(δ) * Math.cos(d)),
  };
}
const pathOf = (pts: [number, number][]) =>
  pts
    .map(([ra, dec], i) => {
      const p = project(ra, dec);
      return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join("");

const rgb = ([r, g, b]: [number, number, number], a = 1) =>
  `rgba(${r}, ${g}, ${b}, ${a})`;
const sizeOf = (mag: number) => Math.max(0.4, 2.7 - 0.48 * mag);

/**
 * 직접 그린 아르고호(옛 성도 그림을 베끼지 않은 단순한 선). 그림 좌표(400칸)로, 이 투영에서
 * 용골자리가 배 밑, 고물자리가 높이 솟은 배 뒤쪽(오른쪽 위), 돛자리가 돛에 오게 맞췄다
 */
const HULL =
  "M58 286 L294 262 C314 246 320 214 316 182 C314 160 304 144 288 134 C316 136 336 166 340 204 C344 248 340 290 322 318 C296 360 230 378 160 370 C112 364 78 334 58 286 Z";
const MAST = "M166 266 L166 150";
const SAIL =
  "M100 166 C140 158 194 158 232 166 C226 196 224 226 228 252 C186 246 140 246 104 252 C108 222 108 192 100 166 Z";

const LABEL_HALO = {
  stroke: "#060b16",
  strokeWidth: 3,
  strokeLinejoin: "round",
  paintOrder: "stroke",
} as const;

export function ArgoChart() {
  const canopus = project(CARINA_STARS.alpha.ra, CARINA_STARS.alpha.dec);
  const [a, b] = (CARINA_PTS[0] ?? []).map(([ra, dec]) => project(ra, dec));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="옛 아르고자리 자리의 실제 성도. 흐린 배 윤곽 아래쪽에 용골자리가 금빛 선으로 또렷하고, 배 뒤쪽 위로 고물자리, 돛 자리에 돛자리가 흐리게 보인다. 카노푸스가 배 뒤쪽 아래에서 가장 밝게 빛난다."
      className="w-full rounded-2xl bg-[#060b16]"
      data-argo-chart
    >
      <g
        fill="rgba(160,190,255,0.035)"
        stroke="rgba(190,205,240,0.32)"
        strokeWidth="1"
        strokeDasharray="5 4"
        strokeLinejoin="round"
      >
        <path d={HULL} />
        <path d={SAIL} />
        <path d={MAST} fill="none" />
      </g>
      <g fill="none" strokeLinejoin="round">
        {LINES.map((l, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: 고정 데이터의 차례
            key={i}
            d={pathOf(l.pts)}
            stroke={
              ARGO_PARTS.has(l.con)
                ? "rgba(190,210,255,0.62)"
                : "rgba(170,200,255,0.1)"
            }
            strokeWidth={ARGO_PARTS.has(l.con) ? 1.1 : 0.7}
          />
        ))}
        {CARINA_PTS.map((l) => (
          <path
            key={l.join()}
            d={pathOf(l)}
            stroke="rgba(255,214,150,0.8)"
            strokeWidth="1.6"
            data-carina-lines
          />
        ))}
      </g>
      {STARS.map((s) => {
        if (s.hr === 2326) return null;
        const p = project(s.ra, s.dec);
        if (p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4) return null;
        return (
          <circle
            key={s.hr}
            cx={p.x}
            cy={p.y}
            r={sizeOf(s.mag)}
            fill={rgb(tempColor(s.k), Math.min(1, 1.25 - s.mag * 0.16))}
          />
        );
      })}
      <defs>
        <radialGradient id="argo-canopus">
          <stop offset="0" stopColor={rgb(tempColor(7500), 0.9)} />
          <stop offset="0.35" stopColor={rgb(tempColor(7500), 0.35)} />
          <stop offset="1" stopColor={rgb(tempColor(7500), 0)} />
        </radialGradient>
      </defs>
      <circle cx={canopus.x} cy={canopus.y} r={22} fill="url(#argo-canopus)" />
      <circle cx={canopus.x} cy={canopus.y} r={3.2} fill="#fff" />
      <g fontSize="10" {...LABEL_HALO}>
        <text x={16} y={26} fill="rgba(200,215,255,0.6)">
          옛 아르고자리
        </text>
        <text x={canopus.x + 9} y={canopus.y - 9} fill="#fff" fontWeight="700">
          카노푸스
        </text>
        {a && b && (
          <text
            x={(a.x + b.x) / 2 - 20}
            y={(a.y + b.y) / 2 + 22}
            fill="rgba(255,222,170,0.95)"
            fontSize="12"
            fontWeight="700"
          >
            용골자리
          </text>
        )}
        <text x={318} y={128} fill="rgba(205,220,255,0.75)">
          고물자리
        </text>
        <text x={104} y={152} fill="rgba(205,220,255,0.75)">
          돛자리
        </text>
      </g>
    </svg>
  );
}
