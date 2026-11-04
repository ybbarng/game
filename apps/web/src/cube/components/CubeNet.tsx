import { hexColor } from "../settings";
import { MARK_COLOR, type MarkTone } from "../view/types";

/**
 * 펼친 그림(전개도). 위(U) 아래로 왼쪽·앞·오른쪽·뒤(L F R B)가 한 줄, 그 아래 아래(D).
 * `faces`는 면마다(U R F D L B) 칸 색 번호(줄마다 왼쪽→오른쪽, null = 가림). 칸 차례는 엔진과 같다.
 */

/** 면 번호 → 펼친 그림에서 칸 자리(가로, 세로) */
const PLACE: Record<number, [number, number]> = {
  0: [1, 0], // U
  4: [0, 1], // L
  2: [1, 1], // F
  1: [2, 1], // R
  5: [3, 1], // B
  3: [1, 2], // D
};

export function CubeNet({
  n,
  faces,
  colors,
  hidden,
  className,
  onCell,
  marked,
  marks,
}: {
  n: number;
  faces: readonly (readonly (number | null)[])[];
  colors: readonly number[];
  hidden: "black" | "gray";
  className?: string;
  /** 칸을 누르면 그 스티커 자리 번호(f*n*n + k)를 준다(배우기 「조각 찾기」) */
  onCell?: ((sticker: number) => void) | undefined;
  /** 테두리로 표시할 스티커 자리(찾은 조각) */
  marked?: ReadonlySet<number> | undefined;
  /** 자리별 표시(고름·맞음·틀림·따라가는 조각). `marked`보다 앞선다 */
  marks?: readonly (MarkTone | null)[] | null | undefined;
}) {
  const cell = 10;
  const gap = 4;
  const face = n * cell;
  const w = 4 * face + 3 * gap;
  const h = 3 * face + 2 * gap;
  const hiddenFill = hidden === "gray" ? "#6b6b6b" : "#111";
  return (
    <svg
      viewBox={`-1 -1 ${w + 2} ${h + 2}`}
      className={className}
      role="img"
      aria-label="큐브 펼친 그림"
      data-cube-net
    >
      {faces.map((grid, f) => {
        const [fx, fy] = PLACE[f] ?? [0, 0];
        const ox = fx * (face + gap);
        const oy = fy * (face + gap);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 면 번호가 곧 자리
          <g key={f}>
            {grid.map((c, k) => {
              const sticker = f * n * n + k;
              const tone = marks?.[sticker] ?? null;
              const mark = tone !== null || (marked?.has(sticker) ?? false);
              const stroke = tone ? hexColor(MARK_COLOR[tone]) : "#38bdf8";
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: 누를 수 있을 때만 role="button"을 준다
                <rect
                  // biome-ignore lint/suspicious/noArrayIndexKey: 칸 번호가 곧 자리
                  key={k}
                  x={ox + (k % n) * cell + 0.5}
                  y={oy + Math.floor(k / n) * cell + 0.5}
                  width={cell - 1}
                  height={cell - 1}
                  rx={1.5}
                  fill={c === null ? hiddenFill : hexColor(colors[c] ?? 0)}
                  stroke={mark ? stroke : "#000"}
                  strokeWidth={mark ? 1.6 : 0.6}
                  data-net-mark={tone ?? undefined}
                  data-net-cell={onCell ? sticker : undefined}
                  // 누를 수 없는 그림(문제 그림 등)도 시험이 칸과 가림을 읽는다
                  data-net-sticker={sticker}
                  data-net-hidden={c === null ? "" : undefined}
                  role={onCell ? "button" : undefined}
                  tabIndex={onCell ? 0 : undefined}
                  aria-label={onCell ? `칸 ${sticker + 1}` : undefined}
                  onClick={onCell ? () => onCell(sticker) : undefined}
                  onKeyDown={
                    onCell
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onCell(sticker);
                          }
                        }
                      : undefined
                  }
                  className={onCell ? "cursor-pointer" : undefined}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
