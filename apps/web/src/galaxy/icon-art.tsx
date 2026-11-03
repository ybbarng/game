/**
 * 은하 한 바퀴 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 밤하늘에 네모 고리 판처럼 둘러선 별 점들,
 * 가운데 밝은 별과 그 둘레의 정거장 고리, 고리를 도는 금빛 우주선 하나. 공통 `IconArt`가 `game === "galaxy"`이면 그린다.
 * 글꼴을 넣지 않으려고 글자는 쓰지 않는다. `maskable`이면 하늘은 끝까지, 그림만 가운데 80%로 줄인다
 */
export function GalaxyIconArt({ maskable = false }: { maskable?: boolean }) {
  // 네모 고리 위 별 점: 변마다 넷(모퉁이 포함), 색은 실제 별빛처럼 옅게
  const ring: [number, number, string, number][] = [];
  const colors = ["#cfe0ff", "#ffe6c4", "#ffffff", "#ffd2b0", "#d9e6ff"];
  const steps = [16, 32, 50, 68, 84];
  let i = 0;
  for (const x of steps) ring.push([x, 16, colors[i++ % 5] as string, 1.6]);
  for (const y of steps.slice(1))
    ring.push([84, y, colors[i++ % 5] as string, 1.6]);
  for (const x of [...steps].reverse().slice(1))
    ring.push([x, 84, colors[i++ % 5] as string, 1.6]);
  for (const y of [...steps].reverse().slice(1, -1))
    ring.push([16, y, colors[i++ % 5] as string, 1.6]);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#070d1c",
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
        <defs>
          <radialGradient id="gl-sky" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor="#1d2f5c" />
            <stop offset="100%" stopColor="#070d1c" />
          </radialGradient>
          <radialGradient id="gl-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6dc" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#fde68a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gl-dot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#gl-sky)" />
        <g transform={maskable ? "translate(10 10) scale(0.8)" : undefined}>
          {/* 판의 네모 고리 */}
          <rect
            x="16"
            y="16"
            width="68"
            height="68"
            rx="6"
            fill="none"
            stroke="#93c5fd"
            strokeOpacity="0.28"
            strokeWidth="1.2"
          />
          {ring.map(([x, y, color, r]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r={r * 2.6} fill="url(#gl-dot)" />
              <circle cx={x} cy={y} r={r} fill={color} />
            </g>
          ))}
          {/* 가운데 별자리 선(흐리게) */}
          <polyline
            points="34,62 42,50 50,50 60,40 68,44"
            fill="none"
            stroke="#c7d2fe"
            strokeOpacity="0.45"
            strokeWidth="1"
          />
          {/* 가운데 밝은 별과 큰 정거장 고리 */}
          <circle cx="50" cy="50" r="16" fill="url(#gl-glow)" />
          <ellipse
            cx="50"
            cy="50"
            rx="11"
            ry="4.2"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.8"
            transform="rotate(-18 50 50)"
          />
          <circle cx="50" cy="50" r="3.6" fill="#fffbeb" />
          {/* 고리를 도는 우주선(금빛 동그라미 말) */}
          <circle
            cx="84"
            cy="50"
            r="5"
            fill="#fbbf24"
            stroke="#070d1c"
            strokeWidth="1.4"
          />
        </g>
      </svg>
    </div>
  );
}
