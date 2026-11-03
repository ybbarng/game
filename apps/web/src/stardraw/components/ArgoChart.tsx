import {
  CARINA_LINES,
  CARINA_STARS,
  type CarinaStar,
} from "../astronaut/carina";
import data from "../canopus-sky.json";
import { tempColor } from "../sky";

/**
 * 옛 아르고자리 자리: 실제 별(Bright Star Catalogue)과 별자리 선(d3-celestial)을 아르고호 둘레로 잘라 그리고,
 * 그 아래에 배 그림을 흐리게 깐다. 용골자리는 공용 정의(astronaut/carina.ts)의 잇는 별 목록으로
 * 또렷하게, 고물자리·돛자리는 그다음, 나침반자리는 흐리게, 나머지는 아주 흐리게(우주국 소개 「용골자리와 아르고호」)
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
const PYXIS = "나침반자리";
const CARINA_PTS: [number, number][][] = CARINA_LINES.map((l) =>
  l.map((k: CarinaStar) => [CARINA_STARS[k].ra, CARINA_STARS[k].dec]),
);

/**
 * 바탕 그림. 페이지에는 하나만 쓴다(시안 비교: "outline" 직접 그린 윤곽 A, "bayer" 옛 성도 B).
 * 바꿀 때는 이 값 하나만 고친다
 */
export type ArgoBackdrop = "outline" | "bayer";
export const ARGO_BACKDROP: ArgoBackdrop = "bayer";

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
 * 시안 A: 직접 그린 아르고호(옛 성도 그림을 베끼지 않은 단순한 선). 그림 좌표(400칸)로, 이 투영에서
 * 용골자리가 배 밑, 고물자리가 높이 솟은 배 뒤쪽(오른쪽 위), 돛자리가 돛에 오게 맞췄다
 */
const HULL =
  "M58 286 L294 262 C314 246 320 214 316 182 C314 160 304 144 288 134 C316 136 336 166 340 204 C344 248 340 290 322 318 C296 360 230 378 160 370 C112 364 78 334 58 286 Z";
const MAST = "M166 266 L166 150";
const SAIL =
  "M100 166 C140 158 194 158 232 166 C226 196 224 226 228 252 C186 246 140 246 104 252 C108 222 108 192 100 166 Z";

/**
 * 시안 B: 요한 바이어 「우라노메트리아」(1603)의 아르고호 판(공공 저작물, 위키미디어 공용
 * File:Uranometria_Argo_Navis.png, 린다 홀 도서관 스캔 1280×920).
 *
 * 그림 만들기: 판의 별 기호(이 성도의 실제 별과 헷갈리지 않게)를 옆 결로 덮고, 왼쪽 바위와 테두리 밖을 잘라
 * (BAYER_CROP, 판 픽셀) 종이는 투명·먹선은 흰색으로 바꾼 뒤 가장자리를 흐리고 72%로 줄였다(700×618 webp).
 *
 * 맞추기: 바이어 판은 황도 좌표 그물이다. 아래 가운데 (650, 906) 근처로 모이는 선이 남쪽 황극이고 1도가
 * 약 17.75픽셀인 등거리 방위 투영으로, 하늘을 안에서 올려다본 방향(거울상 아님)이다. 판에서 읽은 별 기호
 * 약 75개와 실제 별(4등급까지)을 맞춰 극 자리·배율·회전을 찾았고(카노푸스·β별 Miaplacidus·γ²돛자리·ρ·ξ고물자리
 * 등이 판의 별 기호와 10픽셀 안에서 겹친다), 그 투영과 이 성도의 입체 투영을 아르고자리 둘레에서
 * 최소제곱으로 이은 아핀 변환이 BAYER_TO_CHART다(평균 6칸·최대 21칸 어긋남, 400칸 기준. 바이어 판 자체의
 * 별 위치 오차보다 작다). 행렬식이 양수라 뒤집지 않고 시계 반대로 약 30° 돌려 0.32배로 줄인다.
 * 나침반자리 별은 이 판에서 돛대 위에 온다(옛날에는 그 자리를 아르고호 돛대로 여겼다).
 */
const BAYER_SRC = "/stardraw/argo-bayer-1603.webp";
/** 잘라 낸 자리(판 픽셀): x, y, 너비, 높이 */
const BAYER_CROP = [262, 26, 972, 858] as const;
/** 판 픽셀 → 성도 좌표, SVG matrix(a b c d e f) */
const BAYER_TO_CHART = [
  0.27838, -0.15905, 0.16201, 0.28602, -41.14143, 187.46388,
] as const;
/** 별과 선이 주인공이라 아주 흐리게 */
const BAYER_OPACITY = 0.3;
export const ARGO_BAYER_CREDIT =
  "그림: 요한 바이어, 우라노메트리아(1603), 공공 저작물";

const LABEL_HALO = {
  stroke: "#060b16",
  strokeWidth: 3,
  strokeLinejoin: "round",
  paintOrder: "stroke",
} as const;

function lineStyle(con: string) {
  if (ARGO_PARTS.has(con)) return { stroke: "rgba(190,210,255,0.62)", w: 1.1 };
  if (con === PYXIS) return { stroke: "rgba(190,210,255,0.36)", w: 0.9 };
  return { stroke: "rgba(170,200,255,0.1)", w: 0.7 };
}

export function ArgoChart({
  backdrop = ARGO_BACKDROP,
}: {
  backdrop?: ArgoBackdrop;
}) {
  const canopus = project(CARINA_STARS.alpha.ra, CARINA_STARS.alpha.dec);
  const [a, b] = (CARINA_PTS[0] ?? []).map(([ra, dec]) => project(ra, dec));
  // 나침반자리 이름표는 가장 밝은 α별(3.7등급) 왼쪽에(오른쪽은 고물자리 선과 겹친다)
  const pyxis = project(130.898, -33.186);
  const [cx, cy, cw, ch] = BAYER_CROP;
  return (
    <figure className="flex flex-col gap-1.5" data-argo-backdrop={backdrop}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          backdrop === "bayer"
            ? "옛 아르고자리 자리의 실제 성도. 1603년 바이어 성도의 아르고호 그림을 흐리게 깔았다. 배 밑에 용골자리가 금빛 선으로 또렷하고, 배 뒤쪽에 고물자리, 돛에 돛자리, 돛대 곁에 나침반자리가 흐리게 보인다. 카노푸스가 배 아래쪽에서 가장 밝게 빛난다."
            : "옛 아르고자리 자리의 실제 성도. 흐린 배 윤곽 아래쪽에 용골자리가 금빛 선으로 또렷하고, 배 뒤쪽 위로 고물자리, 돛 자리에 돛자리, 그 위에 나침반자리가 흐리게 보인다. 카노푸스가 배 뒤쪽 아래에서 가장 밝게 빛난다."
        }
        className="w-full rounded-2xl bg-[#060b16]"
        data-argo-chart
      >
        {backdrop === "bayer" ? (
          <image
            href={BAYER_SRC}
            x={cx}
            y={cy}
            width={cw}
            height={ch}
            preserveAspectRatio="none"
            transform={`matrix(${BAYER_TO_CHART.join(" ")})`}
            opacity={BAYER_OPACITY}
            data-argo-bayer
          />
        ) : (
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
        )}
        <g fill="none" strokeLinejoin="round">
          {LINES.map((l, i) => {
            const s = lineStyle(l.con);
            return (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: 고정 데이터의 차례
                key={i}
                d={pathOf(l.pts)}
                stroke={s.stroke}
                strokeWidth={s.w}
              />
            );
          })}
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
        <circle
          cx={canopus.x}
          cy={canopus.y}
          r={22}
          fill="url(#argo-canopus)"
        />
        <circle cx={canopus.x} cy={canopus.y} r={3.2} fill="#fff" />
        <g fontSize="10" {...LABEL_HALO}>
          <text x={16} y={26} fill="rgba(200,215,255,0.6)">
            옛 아르고자리
          </text>
          <text
            x={canopus.x + 9}
            y={canopus.y - 9}
            fill="#fff"
            fontWeight="700"
          >
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
          <text
            x={pyxis.x - 7}
            y={pyxis.y + 3}
            textAnchor="end"
            fill="rgba(205,220,255,0.55)"
            data-pyxis-label
          >
            나침반자리
          </text>
        </g>
      </svg>
      {backdrop === "bayer" && (
        <figcaption className="text-[11px] text-white/45">
          {ARGO_BAYER_CREDIT}
        </figcaption>
      )}
    </figure>
  );
}
