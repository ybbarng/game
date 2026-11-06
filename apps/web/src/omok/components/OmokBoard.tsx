"use client";

import {
  type Cell,
  type Forbidden,
  indexOf,
  pointName,
  SIZE,
  type Stone,
  xyOf,
} from "@game/omok-engine";
import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useRef,
  useState,
} from "react";

/** 판 가장자리 여백(칸 단위). 바깥 줄 위 돌이 잘리지 않게 */
const PAD = 0.7;
const VIEW = SIZE - 1 + PAD * 2;
/** 화점 */
const STARS = [
  [3, 3],
  [11, 3],
  [7, 7],
  [3, 11],
  [11, 11],
] as const;

const BOARD = "#e0b464";
const LINE = "#3b2a14";
/** 힌트(고수가 고른 자리) 표시. 장기 힌트와 같은 색 */
const HINT_COLOR = "#059669";
/** 해설이 짚는 자리: 정답은 진한 주황 고리, 다른 자리는 파란 점선 고리 */
const MARK_MAIN = "#c2410c";
const MARK_OTHER = "#1d4ed8";

/** 해설이 짚는 자리(배우기·문제) */
export interface BoardMarks {
  main: readonly number[];
  other: readonly number[];
}

/**
 * 오목 판. 마우스는 올리면 반투명 돌이 보이고 누르면 둔다.
 * 손가락은 돌을 가려 잘못 두기 쉬워서 한 번 눌러 겨누고(십자선), 같은 자리를 다시 누르면 둔다.
 * 키보드는 화살표로 겨누고 Enter·Space로 둔다.
 */
export function OmokBoard({
  board,
  myStone,
  canPlay,
  lastMove,
  winLine,
  forbidden,
  aim,
  onAim,
  onPlace,
  hint = null,
  coords = false,
  marks = null,
  still = false,
}: {
  board: readonly Cell[];
  /** 내 돌 색(미리 보기 돌 색) */
  myStone: Stone;
  canPlay: boolean;
  lastMove: number | null;
  winLine: readonly number[] | null;
  forbidden: readonly { at: number; reason: Forbidden }[];
  /** 겨눈 자리(손가락·키보드) */
  aim: number | null;
  onAim: (at: number | null) => void;
  onPlace: (at: number) => void;
  /** 힌트: 고수가 고른 자리에 초록 고리 */
  hint?: number | null;
  /** 판 바깥 여백에 좌표(위 A~O, 왼쪽 15~1)를 작게 붙인다. 글이 자리 이름으로 말하는 화면(배우기·문제)에서 켠다 */
  coords?: boolean;
  /** 해설이 짚는 자리 */
  marks?: BoardMarks | null;
  /** 누를 수 없는 그림(배우기 장면). 둘 수 없어도 넘긴 금지 자리 ×를 보인다 */
  still?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  // 돌 그러데이션 이름. 한 화면에 판이 여럿이어도 겹치지 않게 한다.
  const id = `stone${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const blackFill = `url(#${id}-black)`;
  const whiteFill = `url(#${id}-white)`;
  const [hover, setHover] = useState<number | null>(null);

  /** 화면 좌표 → 가장 가까운 교차점 */
  const pointAt = (clientX: number, clientY: number): number | null => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return null;
    const unit = rect.width / VIEW;
    const x = Math.round((clientX - rect.left) / unit - PAD);
    const y = Math.round((clientY - rect.top) / unit - PAD);
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
    return indexOf(x, y);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "mouse") return;
    setHover(canPlay ? pointAt(e.clientX, e.clientY) : null);
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!canPlay) return;
    const at = pointAt(e.clientX, e.clientY);
    if (at === null || board[at] !== 0) return;
    if (e.pointerType === "mouse" || aim === at) {
      onAim(null);
      onPlace(at);
    } else onAim(at);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!canPlay) return;
    const [x, y] = xyOf(aim ?? indexOf(7, 7));
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = move[e.key];
    if (delta) {
      e.preventDefault();
      const nx = Math.min(SIZE - 1, Math.max(0, x + delta[0]));
      const ny = Math.min(SIZE - 1, Math.max(0, y + delta[1]));
      onAim(aim === null ? indexOf(7, 7) : indexOf(nx, ny));
    } else if ((e.key === "Enter" || e.key === " ") && aim !== null) {
      e.preventDefault();
      if (board[aim] === 0) {
        onAim(null);
        onPlace(aim);
      }
    }
  };

  const ghost = canPlay ? (aim ?? hover) : null;
  const forbiddenAt = new Map(forbidden.map((f) => [f.at, f.reason]));
  const at = (i: number) => {
    const [x, y] = xyOf(i);
    return [x + PAD, y + PAD] as const;
  };
  const lines = Array.from({ length: SIZE }, (_, i) => i + PAD);
  const end = SIZE - 1 + PAD;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label={canPlay ? "오목 판, 내 차례" : "오목 판"}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 판은 키보드로 겨누고 둔다
      tabIndex={0}
      className="block h-full w-full touch-none select-none rounded-lg shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      style={{ background: BOARD }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {/* 돌의 입체감: 왼쪽 위에서 오는 빛(밝은 점이 왼쪽 위로 치우친 둥근 그러데이션) */}
      <defs>
        <radialGradient id={`${id}-black`} cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#6b6b6b" />
          <stop offset="0.35" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <radialGradient id={`${id}-white`} cx="0.36" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#f1f0ec" />
          <stop offset="1" stopColor="#b9b6ae" />
        </radialGradient>
      </defs>
      {lines.map((p) => (
        <g key={p}>
          <line
            x1={p}
            y1={PAD}
            x2={p}
            y2={end}
            stroke={LINE}
            strokeWidth={0.04}
          />
          <line
            x1={PAD}
            y1={p}
            x2={end}
            y2={p}
            stroke={LINE}
            strokeWidth={0.04}
          />
        </g>
      ))}
      {STARS.map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x + PAD}
          cy={y + PAD}
          r={0.1}
          fill={LINE}
        />
      ))}

      {/* 좌표: 판을 줄이지 않게 바깥 여백(PAD) 안에 작게. 가장자리 돌이 조금 덮을 수 있다 */}
      {coords && (
        <g
          fill={LINE}
          opacity={0.75}
          fontSize={0.3}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
          aria-hidden
        >
          {lines.map((p, i) => (
            <g key={`c${p}`}>
              <text x={p} y={PAD * 0.4}>
                {String.fromCharCode(65 + i)}
              </text>
              <text x={PAD * 0.4} y={p}>
                {SIZE - i}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* 겨눈 자리 십자선(손가락·키보드) */}
      {aim !== null && canPlay && (
        <g stroke="#b91c1c" strokeWidth={0.06} opacity={0.8}>
          <line x1={PAD} y1={at(aim)[1]} x2={end} y2={at(aim)[1]} />
          <line x1={at(aim)[0]} y1={PAD} x2={at(aim)[0]} y2={end} />
        </g>
      )}

      {(canPlay || still) &&
        [...forbiddenAt].map(([i, reason]) => {
          const [cx, cy] = at(i);
          return (
            <g key={`f${i}`} stroke="#b91c1c" strokeWidth={0.07}>
              <title>{`${pointName(i)} ${reason} 금지`}</title>
              <line
                x1={cx - 0.18}
                y1={cy - 0.18}
                x2={cx + 0.18}
                y2={cy + 0.18}
              />
              <line
                x1={cx - 0.18}
                y1={cy + 0.18}
                x2={cx + 0.18}
                y2={cy - 0.18}
              />
            </g>
          );
        })}

      {board.map((cell, i) => {
        if (cell === 0) return null;
        const [cx, cy] = at(i);
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: 판 자리 번호가 곧 정체다
            key={i}
            data-stone={cell === 1 ? "black" : "white"}
            data-point={pointName(i)}
          >
            {/* 오른쪽 아래로 비치는 그림자 */}
            <circle
              cx={cx + 0.06}
              cy={cy + 0.08}
              r={0.46}
              fill="#000000"
              opacity={0.35}
            />
            <circle
              cx={cx}
              cy={cy}
              r={0.46}
              fill={cell === 1 ? blackFill : whiteFill}
              stroke={cell === 1 ? "#000000" : "#9a978f"}
              strokeWidth={0.02}
            />
          </g>
        );
      })}

      {ghost !== null && board[ghost] === 0 && !forbiddenAt.has(ghost) && (
        <circle
          cx={at(ghost)[0]}
          cy={at(ghost)[1]}
          r={0.45}
          fill={myStone === 1 ? blackFill : whiteFill}
          opacity={0.55}
          pointerEvents="none"
        />
      )}

      {hint !== null && board[hint] === 0 && (
        <circle
          cx={at(hint)[0]}
          cy={at(hint)[1]}
          r={0.56}
          fill="none"
          stroke={HINT_COLOR}
          strokeWidth={0.09}
          data-hint={pointName(hint)}
          pointerEvents="none"
        />
      )}

      {marks?.other
        .filter((i) => !marks.main.includes(i))
        .map((i) => (
          <circle
            key={`mo${i}`}
            cx={at(i)[0]}
            cy={at(i)[1]}
            r={0.54}
            fill="none"
            stroke={MARK_OTHER}
            strokeWidth={0.07}
            strokeDasharray="0.18 0.12"
            data-mark="other"
            data-mark-at={pointName(i)}
            pointerEvents="none"
          />
        ))}
      {marks?.main.map((i) => (
        <circle
          key={`mm${i}`}
          cx={at(i)[0]}
          cy={at(i)[1]}
          r={0.56}
          fill="none"
          stroke={MARK_MAIN}
          strokeWidth={0.11}
          data-mark="main"
          data-mark-at={pointName(i)}
          pointerEvents="none"
        />
      ))}

      {lastMove !== null && (
        <circle
          cx={at(lastMove)[0]}
          cy={at(lastMove)[1]}
          r={0.12}
          fill={board[lastMove] === 1 ? "#fafafa" : "#111111"}
          data-last={pointName(lastMove)}
        />
      )}

      {winLine && winLine.length > 1 && (
        <line
          x1={at(winLine[0] as number)[0]}
          y1={at(winLine[0] as number)[1]}
          x2={at(winLine.at(-1) as number)[0]}
          y2={at(winLine.at(-1) as number)[1]}
          stroke="#dc2626"
          strokeWidth={0.14}
          strokeLinecap="round"
          opacity={0.85}
        />
      )}
    </svg>
  );
}
