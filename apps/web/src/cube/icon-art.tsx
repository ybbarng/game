/**
 * 큐브 맞추기 앱 아이콘 그림(`next/og` ImageResponse용 JSX): 위층을 살짝 들어 돌리는 중인 섞인 3×3 큐브.
 * 상표 로고처럼 보이지 않게 맞춘 큐브의 반듯한 세 면이 아니라, 색이 섞이고 위층이 떠 있는 모습으로 그린다.
 * 공통 `IconArt`가 `game === "cube"`이면 이것을 그린다. 글꼴을 넣지 않으려고 글자는 쓰지 않는다
 */
import type { ReactNode } from "react";

const W = "#f8fafc";
const Y = "#facc15";
const R = "#dc2626";
const O = "#f97316";
const G = "#16a34a";
const B = "#2563eb";

/** 등축 투영: x는 오른쪽 위, z는 왼쪽 위, y는 위. 가장 가까운 아래 꼭짓점이 (50, 88) */
const U = 12;
const DX = U * 0.866;
/** 위층을 들어 올린 높이 */
const LIFT = 4.5;

function pt(x: number, z: number, y: number, lifted: boolean): string {
  const sx = 50 + (x - z) * DX;
  const sy = 88 - (x + z) * (U / 2) - y * U - (lifted ? LIFT : 0);
  return `${sx.toFixed(2)},${sy.toFixed(2)}`;
}

type Corner = [number, number, number];

/** 칸 하나: 네 꼭짓점을 가운데 쪽으로 줄인 둥근 스티커 */
function sticker(
  corners: Corner[],
  lifted: boolean,
  color: string,
  key: string,
) {
  const cx = corners.reduce((s, c) => s + c[0], 0) / 4;
  const cz = corners.reduce((s, c) => s + c[1], 0) / 4;
  const cy = corners.reduce((s, c) => s + c[2], 0) / 4;
  const k = 0.78;
  const points = corners
    .map(([x, z, y]) =>
      pt(cx + (x - cx) * k, cz + (z - cz) * k, cy + (y - cy) * k, lifted),
    )
    .join(" ");
  return (
    <polygon
      key={key}
      points={points}
      fill={color}
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  );
}

function quad(corners: Corner[], lifted: boolean): string {
  return corners.map(([x, z, y]) => pt(x, z, y, lifted)).join(" ");
}

// 면마다 칸 색. 옆면은 아래 줄부터(행 0 = 맨 아래층), 윗면은 앞쪽 꼭짓점부터
const TOP = [
  [W, R, W],
  [Y, W, W],
  [W, W, B],
];
/** z = 0 쪽(오른쪽 아래로 보이는 면) */
const RIGHT = [
  [G, G, O],
  [G, G, Y],
  [R, G, G],
];
/** x = 0 쪽(왼쪽 아래로 보이는 면) */
const LEFT = [
  [O, O, R],
  [W, O, O],
  [O, B, O],
];

export function CubeIconArt({ maskable = false }: { maskable?: boolean }) {
  const body = "#111114";
  const parts: ReactNode[] = [];
  // 아래 두 층 몸통(위층이 떠서 그 틈으로 윗면이 조금 보인다)
  parts.push(
    <polygon
      key="low-top"
      points={quad(
        [
          [0, 0, 2],
          [3, 0, 2],
          [3, 3, 2],
          [0, 3, 2],
        ],
        false,
      )}
      fill="#000000"
    />,
    <polygon
      key="low-right"
      points={quad(
        [
          [0, 0, 0],
          [3, 0, 0],
          [3, 0, 2],
          [0, 0, 2],
        ],
        false,
      )}
      fill={body}
    />,
    <polygon
      key="low-left"
      points={quad(
        [
          [0, 0, 0],
          [0, 3, 0],
          [0, 3, 2],
          [0, 0, 2],
        ],
        false,
      )}
      fill={body}
    />,
  );
  // 위층 몸통
  parts.push(
    <polygon
      key="up-right"
      points={quad(
        [
          [0, 0, 2],
          [3, 0, 2],
          [3, 0, 3],
          [0, 0, 3],
        ],
        true,
      )}
      fill={body}
    />,
    <polygon
      key="up-left"
      points={quad(
        [
          [0, 0, 2],
          [0, 3, 2],
          [0, 3, 3],
          [0, 0, 3],
        ],
        true,
      )}
      fill={body}
    />,
    <polygon
      key="up-top"
      points={quad(
        [
          [0, 0, 3],
          [3, 0, 3],
          [3, 3, 3],
          [0, 3, 3],
        ],
        true,
      )}
      fill={body}
    />,
  );
  // 스티커
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const lifted = row === 2;
      parts.push(
        sticker(
          [
            [col, 0, row],
            [col + 1, 0, row],
            [col + 1, 0, row + 1],
            [col, 0, row + 1],
          ],
          lifted,
          RIGHT[row]?.[col] ?? W,
          `r${row}${col}`,
        ),
        sticker(
          [
            [0, col, row],
            [0, col + 1, row],
            [0, col + 1, row + 1],
            [0, col, row + 1],
          ],
          lifted,
          LEFT[row]?.[col] ?? W,
          `l${row}${col}`,
        ),
        sticker(
          [
            [col, row, 3],
            [col + 1, row, 3],
            [col + 1, row + 1, 3],
            [col, row + 1, 3],
          ],
          true,
          TOP[row]?.[col] ?? W,
          `t${row}${col}`,
        ),
      );
    }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e7490",
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
          {/* 바닥 그림자 */}
          <ellipse
            cx={50}
            cy={90}
            rx={30}
            ry={5}
            fill="#000000"
            opacity={0.3}
          />
          {parts}
        </svg>
      </div>
    </div>
  );
}
