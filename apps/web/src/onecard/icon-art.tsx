/**
 * 원카드 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 남색 바탕 위 버린 더미에 한 장 남은 카드(하트 A)를
 * 탁 치는 손바닥 자국. 다른 게임처럼 공통 `IconArt`가 부르고 `maskable`을 받는다
 */
export function OnecardIconArt({ maskable = false }: { maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e3a8a",
        borderRadius: maskable ? 0 : "18%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          width: maskable ? "78%" : "100%",
          height: maskable ? "78%" : "100%",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ display: "flex" }}
        >
          {/* 버린 더미(뒤에 깔린 두 장) */}
          <rect
            x={22}
            y={20}
            width={44}
            height={62}
            rx={6}
            fill="#e2e8f0"
            transform="rotate(-14 44 51)"
          />
          <rect
            x={30}
            y={18}
            width={44}
            height={62}
            rx={6}
            fill="#f1f5f9"
            transform="rotate(9 52 49)"
          />
          {/* 맨 위 한 장: 하트 A */}
          <rect
            x={27}
            y={19}
            width={46}
            height={64}
            rx={6}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth={1.2}
          />
          {/* 모서리 "A"(이미지 그리기가 <text>를 못 그려 선으로) */}
          <path
            d="M32 34 L36.5 22 L41 34 M33.8 29.5 L39.2 29.5"
            stroke="#d42a2a"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M50 66 C38 57 34 50 38 45 C42 40 48 42 50 47 C52 42 58 40 62 45 C66 50 62 57 50 66 Z"
            fill="#d42a2a"
          />
          {/* 탁 치는 느낌의 빛줄기 */}
          <path
            d="M82 14 L76 24 M90 28 L80 31 M86 44 L78 40"
            stroke="#fbbf24"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
