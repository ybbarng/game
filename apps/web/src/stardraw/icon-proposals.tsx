/**
 * 하늘의 별 따기 아이콘 시안(2026-11-01 검토, 아직 쓰지 않는다). 셋 다 `next/og` ImageResponse용 JSX이고
 * 글꼴·바깥 그림을 쓰지 않는다. 사용자가 고르면 `icon-art.tsx`의 `StardrawIconArt` 자리에 넣는다.
 *
 * - A `StardrawIconRefined`: 지금 아이콘(밤하늘 + 금빛 공)을 다듬은 것
 * - B `StardrawIconPicked`: 네모 하늘에서 금빛 고리로 고른 별 하나(카노푸스)
 * - C `StardrawIconSeal`: 카노푸스 우주국 직인(용골자리 붉은 네모 인장)
 *
 * `size`는 실제로 그려질 픽셀 크기다. 48px 아래에서는 흐린 선·잔별을 빼고 굵기를 키운다(16·32px에서 뭉개지지 않게).
 * satori는 <svg> 안의 컴포넌트를 그리지 못해 그림 조각은 함수로 부른다.
 */

type IconProps = { maskable?: boolean; size?: number };

/**
 * 시안이 공통으로 쓰는 바깥 틀: 둥근 네모 안에 100×100 그림. 바탕(`bg`)은 늘 꽉 채우고,
 * 마스커블이면 그림(`art`)만 가운데 80%로 줄인다(안드로이드·iOS가 잘라 쓰는 안전 영역).
 */
function frame(
  maskable: boolean,
  defs: React.ReactElement,
  bg: React.ReactElement,
  art: React.ReactElement,
): React.ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        borderRadius: maskable ? 0 : "18%",
        overflow: "hidden",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        aria-hidden="true"
        style={{ display: "flex" }}
      >
        <defs>{defs}</defs>
        {bg}
        <g transform={maskable ? "translate(10 10) scale(0.8)" : undefined}>
          {art}
        </g>
      </svg>
    </div>
  );
}

/** 용골자리 밝은 별 열(직인 `Seal`과 같은 좌표, 동쪽이 왼쪽). 카노푸스가 alpha */
const CARINA = {
  alpha: [84, 18],
  chi: [61, 19],
  epsilon: [54, 31],
  iota: [40, 30],
  q: [25, 34],
  p: [21, 35],
  theta: [18, 40],
  omega: [26, 49],
  beta: [41, 48],
  upsilon: [33, 40],
} as const;
type CarinaStar = keyof typeof CARINA;
const CARINA_KEYS = Object.keys(CARINA) as CarinaStar[];
const CARINA_LINES: CarinaStar[][] = [
  ["alpha", "chi", "epsilon", "iota", "q", "p", "theta"],
  ["epsilon", "beta", "omega", "theta"],
  ["iota", "upsilon", "beta"],
];

/** 용골자리 좌표를 `scale`배로 키워 카노푸스가 (`ax`, `ay`)에 오게 옮긴다 */
function carinaAt(ax: number, ay: number, scale: number) {
  const [x0, y0] = CARINA.alpha;
  const out = {} as Record<CarinaStar, [number, number]>;
  for (const k of CARINA_KEYS) {
    const [x, y] = CARINA[k];
    out[k] = [ax + (x - x0) * scale, ay + (y - y0) * scale];
  }
  return out;
}

/** 흐린 별자리 선(화면의 별자리 선처럼 은은하게) */
function faintLines(c: Record<CarinaStar, [number, number]>, opacity: number) {
  return CARINA_LINES.map((l) => (
    <polyline
      key={l.join("-")}
      points={l.map((k) => c[k].join(",")).join(" ")}
      fill="none"
      stroke="#a9b8e8"
      strokeOpacity={opacity}
      strokeWidth="0.8"
      strokeLinejoin="round"
    />
  ));
}

/** 오목한 네 갈래 별(✦). 작은 크기에서 가는 빛줄기 대신 쓴다. 세로가 조금 길다 */
function sparklePath(cx: number, cy: number, r: number, waist: number) {
  const v = r * 1.15;
  const w = waist;
  return `M${cx} ${cy - v} Q${cx + w} ${cy - w} ${cx + r} ${cy} Q${cx + w} ${cy + w} ${cx} ${cy + v} Q${cx - w} ${cy + w} ${cx - r} ${cy} Q${cx - w} ${cy - w} ${cx} ${cy - v} Z`;
}

/**
 * 화면의 별과 같은 결: 흐린 빛 번짐 + 십자 빛줄기(세로가 조금 길다) + 작고 또렷한 가운데 점.
 * `r`는 빛줄기 반 길이, `w`는 빛줄기 밑동 너비. 그러데이션은 `glowStarDefs`로 같은 id에 둔다.
 */
function glowStar(
  id: string,
  cx: number,
  cy: number,
  r: number,
  w: number,
  halo: number,
) {
  const v = r * 1.18;
  return (
    <g key={id}>
      <circle cx={cx} cy={cy} r={halo} fill={`url(#${id}-halo)`} />
      <path
        d={`M${cx} ${cy - v} L${cx + w} ${cy} L${cx} ${cy + v} L${cx - w} ${cy} Z`}
        fill={`url(#${id}-v)`}
      />
      <path
        d={`M${cx - r} ${cy} L${cx} ${cy - w} L${cx + r} ${cy} L${cx} ${cy + w} Z`}
        fill={`url(#${id}-h)`}
      />
      <circle cx={cx} cy={cy} r={w * 1.1} fill="#ffffff" />
    </g>
  );
}

/** `glowStar`가 쓰는 그러데이션 셋(빛 번짐, 세로·가로 빛줄기: 가운데 흰색 → 별 색 → 투명) */
function glowStarDefs(
  id: string,
  cx: number,
  cy: number,
  r: number,
  color: string,
  halo: number,
  haloAlpha: number,
) {
  const v = r * 1.18;
  const ray = (key: string, x1: number, y1: number, x2: number, y2: number) => (
    <linearGradient
      key={key}
      id={`${id}-${key}`}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      gradientUnits="userSpaceOnUse"
    >
      <stop offset="0" stopColor={color} stopOpacity="0" />
      <stop offset="0.4" stopColor={color} />
      <stop offset="0.5" stopColor="#ffffff" />
      <stop offset="0.6" stopColor={color} />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </linearGradient>
  );
  return [
    <radialGradient
      key="halo"
      id={`${id}-halo`}
      cx={cx}
      cy={cy}
      r={halo}
      gradientUnits="userSpaceOnUse"
    >
      <stop offset="0" stopColor={color} stopOpacity={haloAlpha} />
      <stop offset="0.3" stopColor={color} stopOpacity={haloAlpha * 0.4} />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>,
    ray("v", cx, cy - v, cx, cy + v),
    ray("h", cx - r, cy, cx + r, cy),
  ];
}

const SKY_TOP = "#24427e";
const SKY_BOTTOM = "#0a1530";
/** 카노푸스의 별빛(표면 온도 약 7,400K, 화면 `tempColor`처럼 옅게) */
const CANOPUS_LIGHT = "#f4f1ff";
/** 화면의 고른 별 고리·번호 공 금빛 */
const GOLD = "#f2c14e";

/**
 * 시안 A: 지금 아이콘을 다듬었다. 밤하늘과 금빛 공은 그대로 두고
 * ① 아무렇게나 그린 별자리 선 → 실제 용골자리 ② 다섯 꼭짓점 만화 별 → 화면의 별처럼 네 갈래 빛
 * ③ 따로 떠 있던 유성 꼬리를 빼고 공을 키워 작은 크기에서도 공이 보이게 했다.
 */
export function StardrawIconRefined({
  maskable = false,
  size = 192,
}: IconProps) {
  const small = size < 48;
  const c = carinaAt(90, 14, 0.74);
  const ball = small ? { cx: 50, cy: 52, r: 33 } : { cx: 46, cy: 63, r: 25 };
  const defs = (
    <>
      <radialGradient id="ra-sky" cx="75%" cy="0%" r="110%">
        <stop offset="0%" stopColor={SKY_TOP} />
        <stop offset="100%" stopColor={SKY_BOTTOM} />
      </radialGradient>
      <radialGradient id="ra-ball" cx="36%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#fff6cf" />
        <stop offset="38%" stopColor="#f6c343" />
        <stop offset="100%" stopColor="#a8761a" />
      </radialGradient>
      <radialGradient id="ra-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fde68a" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
      </radialGradient>
    </>
  );
  return frame(
    maskable,
    defs,
    <rect width="100" height="100" fill="url(#ra-sky)" />,
    <>
      {!small && faintLines(c, 0.42)}
      {!small &&
        CARINA_KEYS.map((k) => (
          <circle
            key={k}
            cx={c[k][0]}
            cy={c[k][1]}
            r={k === "alpha" ? 2.4 : 1.3}
            fill="#e8eeff"
          />
        ))}
      {small && <circle cx="85" cy="14" r="3.4" fill="#e8eeff" />}
      <circle
        cx={ball.cx}
        cy={ball.cy}
        r={ball.r * 1.55}
        fill="url(#ra-glow)"
      />
      <circle cx={ball.cx} cy={ball.cy} r={ball.r} fill="url(#ra-ball)" />
      <path
        d={sparklePath(ball.cx, ball.cy - 1, ball.r * 0.62, ball.r * 0.1)}
        fill="#ffffff"
        fillOpacity="0.95"
      />
    </>,
  );
}

/**
 * 시안 B: 네모 하늘에서 별 하나를 고른 순간. 응모 화면에서 별을 누르면 생기는 금빛 고리와
 * 화면과 같은 결의 별(빛 번짐 + 십자 빛줄기)을 크게 그렸다. 고른 별은 카노푸스이고 뒤로 흐리게 용골자리가 이어진다.
 * "하늘에서 별 하나를 딴다"를 그대로 그림으로 옮긴 것이다. 작은 크기에서는 빛줄기 대신 굵은 ✦로 바꿔 조준경처럼 보이지 않게 한다.
 */
export function StardrawIconPicked({
  maskable = false,
  size = 192,
}: IconProps) {
  const small = size < 48;
  const star = small ? { x: 50, y: 50 } : { x: 57, y: 45 };
  const ring = small ? 30 : 23;
  const ray = 29;
  const c = carinaAt(star.x, star.y, 0.95);
  const field: [number, number, number][] = [
    [84, 82, 1.1],
    [70, 91, 0.8],
    [91, 64, 0.9],
    [12, 14, 1],
    [32, 9, 0.8],
    [90, 10, 0.9],
    [50, 88, 0.7],
  ];
  const defs = (
    <>
      <linearGradient id="rb-sky" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor={SKY_TOP} />
        <stop offset="100%" stopColor={SKY_BOTTOM} />
      </linearGradient>
      {glowStarDefs("rb-s", star.x, star.y, ray, CANOPUS_LIGHT, 22, 0.6)}
    </>
  );
  return frame(
    maskable,
    defs,
    <rect width="100" height="100" fill="url(#rb-sky)" />,
    small ? (
      <>
        <circle
          cx={star.x}
          cy={star.y}
          r={ring}
          fill="none"
          stroke={GOLD}
          strokeWidth="7"
        />
        <path d={sparklePath(star.x, star.y, 19, 3.4)} fill="#ffffff" />
      </>
    ) : (
      <>
        {faintLines(c, 0.38)}
        {CARINA_KEYS.filter((k) => k !== "alpha").map((k) => (
          <circle key={k} cx={c[k][0]} cy={c[k][1]} r="1.3" fill="#dfe6ff" />
        ))}
        {field.map(([x, y, r]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={r}
            fill="#c9d4f5"
            opacity="0.8"
          />
        ))}
        {/* 고른 별의 금빛 고리(화면의 고른 별 고리와 같은 색) */}
        <circle
          cx={star.x}
          cy={star.y}
          r={ring}
          fill="none"
          stroke={GOLD}
          strokeWidth="3.6"
        />
        {glowStar("rb-s", star.x, star.y, ray, 2.9, 22)}
      </>
    ),
  );
}

const SEAL_INK = "#cf3b26";
const SEAL_PAPER = "#f4ecdc";

/**
 * 시안 C: 카노푸스 우주국 직인. 등록증·당첨 직인에 찍히는 붉은 네모 인장에서 글자를 빼고
 * 용골자리를 크게 키웠다. 인주 결(가장자리 휨, 잔 구멍)은 48px 이상에서만 넣는다.
 */
export function StardrawIconSeal({ maskable = false, size = 192 }: IconProps) {
  const small = size < 48;
  const c = carinaAt(75, 38, 0.8);
  const star = (x: number, y: number, r: number) =>
    `M${x} ${y - r} L ${x + r * 0.3} ${y - r * 0.3} L ${x + r} ${y} L ${x + r * 0.3} ${y + r * 0.3} L ${x} ${y + r} L ${x - r * 0.3} ${y + r * 0.3} L ${x - r} ${y} L ${x - r * 0.3} ${y - r * 0.3} Z`;
  const defs = (
    <filter id="rc-ink" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.05"
        numOctaves="2"
        seed="11"
        result="warp"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="warp"
        scale="1.6"
        xChannelSelector="R"
        yChannelSelector="G"
        result="bent"
      />
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.7"
        numOctaves="1"
        seed="41"
        result="fine"
      />
      <feColorMatrix
        in="fine"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  20 0 0 0 -4.2"
        result="pits"
      />
      <feComposite in="bent" in2="pits" operator="in" />
    </filter>
  );
  return frame(
    maskable,
    defs,
    <rect width="100" height="100" fill={SEAL_PAPER} />,
    <g
      fill={SEAL_INK}
      stroke={SEAL_INK}
      filter={small ? undefined : "url(#rc-ink)"}
      transform="rotate(-4 50 50)"
    >
      <rect
        x="13"
        y="13"
        width="74"
        height="74"
        rx="4"
        fill="none"
        strokeWidth={small ? 9 : 6.5}
      />
      {!small && (
        <rect
          x="21"
          y="21"
          width="58"
          height="58"
          rx="1.5"
          fill="none"
          strokeWidth="1.6"
        />
      )}
      {CARINA_LINES.map((l) => (
        <polyline
          key={l.join("-")}
          points={l.map((k) => c[k].join(",")).join(" ")}
          fill="none"
          strokeWidth={small ? 4.5 : 2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {CARINA_KEYS.map((k) => (
        <path
          key={k}
          d={star(
            c[k][0],
            c[k][1],
            k === "alpha" ? (small ? 13 : 9.5) : small ? 0.01 : 4.6,
          )}
          stroke="none"
        />
      ))}
    </g>,
  );
}
