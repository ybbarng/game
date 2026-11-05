import type { StickerPattern } from "../item-look";
import { hexColor } from "../settings";
import { MARK_COLOR, type Normal, type Sticker } from "../view/types";
import { posterShapes } from "./cube-poster-art";
import { PatternGlyph } from "./PatternGlyph";

/**
 * 비스듬히 본 큐브 그림(SVG, three.js 없음). 3D 장면과 같은 카메라·같은 화면 크기로 그려
 * 3D가 뜨기 전·못 뜰 때 그 자리에 둔다. 첫 화면은 색 묶음(프리셋)이면 3D로 찍은 이미지를 쓰고
 * (`hero/poster.ts`), 색을 직접 고른 사람에게만 이 그림을 보인다.
 * 면마다 밝기·몸통 색·그림자는 찍은 이미지(public/cube/hero)에서 재서 맞췄다.
 */

/**
 * 면마다 스티커 색에 곱하는 밝기(3D 조명: 위-앞 빛, 오른쪽 빛, 왼쪽-앞 빛). 찍은 이미지의 스티커 가운데
 * 색을 재서 맞췄다(2026-11-04, 3×3 표준 색): 흰 255 → 위 244, 초록 155 → 앞 160, 빨강 200 → 오른쪽 181.
 * 톤 매핑이 어두운 쪽을 조금 띄우므로 `SHADE_LIFT`를 더한다
 */
export const FACE_SHADE: Partial<Record<Normal, number>> = {
  "+y": 0.93,
  "+z": 0.98,
  "+x": 0.865,
};
const SHADE_LIFT = 8;
/** 면마다 몸통 색(검은 플라스틱에 비친 빛, 찍은 이미지의 틈에서 잼) */
const BODY_FILL: Partial<Record<Normal, string>> = {
  "+y": "#191919",
  "+z": "#0e0e10",
  "+x": "#121113",
};
/** 윗면 둘레의 둥근 모서리가 위 빛을 받아 밝게 보인다 */
const EDGE_LIGHT = "rgba(255,255,255,0.13)";
const BODY_DEFAULT = "#0d0d0f";
const HIDDEN = { black: 0x111111, gray: 0x6b6b6b } as const;

function shade(color: number, k: number): string {
  const ch = (v: number) => Math.min(255, Math.round(v * k + SHADE_LIFT));
  const r = ch((color >> 16) & 255);
  const g = ch((color >> 8) & 255);
  const b = ch(color & 255);
  return `rgb(${r},${g},${b})`;
}

export function CubePoster({
  n,
  stickers,
  colors,
  width,
  height,
  stickerless = false,
  hidden = "black",
  shadow = true,
  className,
  patterns,
  slotOf,
  onSticker,
}: {
  /**
   * 스티커 정체 → 지금 자리 번호(f*n*n + k). 주면 칸마다 자리·가림·표시를 속성(`data-sticker` 등)으로 달아
   * 시험과 누르기가 읽는다. 뒤쪽 그림(돌려 쥔 상태)도 원래 상태의 자리를 알린다
   */
  slotOf?: ((id: number) => number) | undefined;
  /** 칸을 누르면 그 자리 번호(배우기 「조각 찾기」). `slotOf`와 함께 준다 */
  onSticker?: ((slot: number) => void) | undefined;
  /** 흑백 화면(아이템전): 색 번호마다 무늬 */
  patterns?: readonly (StickerPattern | null)[] | null | undefined;
  n: number;
  /** 스티커 전부(`stickersFromState`). 보이는 면의 것만 그린다 */
  stickers: readonly Sticker[];
  /** 면 번호별 색(U R F D L B) */
  colors: readonly number[];
  /** 그림 크기(CSS 픽셀). 3D 캔버스와 같은 크기여야 카메라가 맞는다 */
  width: number;
  height: number;
  stickerless?: boolean;
  hidden?: "black" | "gray";
  shadow?: boolean;
  className?: string;
}) {
  const s = posterShapes(n, stickers, width, height, stickerless);
  const gid = `cube-poster-shadow-${n}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
      data-cube-poster={n}
    >
      {shadow && (
        <>
          <defs>
            <radialGradient id={gid}>
              <stop offset="0" stopColor="#000" stopOpacity={0.42} />
              <stop offset="0.45" stopColor="#000" stopOpacity={0.23} />
              <stop offset="1" stopColor="#000" stopOpacity={0} />
            </radialGradient>
          </defs>
          <ellipse
            cx={s.shadow.cx}
            cy={s.shadow.cy}
            rx={s.shadow.rx}
            ry={s.shadow.ry}
            fill={`url(#${gid})`}
          />
        </>
      )}
      {s.body.map((b) => (
        <polygon
          key={b.normal}
          points={b.points}
          fill={BODY_FILL[b.normal] ?? BODY_DEFAULT}
          stroke={BODY_FILL[b.normal] ?? BODY_DEFAULT}
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
      ))}
      {s.body
        .filter((b) => b.normal === "+y")
        .map((b) => (
          <polygon
            key="edge"
            points={b.points}
            fill="none"
            stroke={EDGE_LIGHT}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        ))}
      {s.stickers.map((t, i) => {
        const k = FACE_SHADE[t.normal] ?? 0.85;
        const c = t.color === null ? HIDDEN[hidden] : (colors[t.color] ?? 0);
        const p = t.color === null ? null : patterns?.[t.color];
        const slot = slotOf && t.id !== undefined ? slotOf(t.id) : undefined;
        const press = onSticker && slot !== undefined ? onSticker : undefined;
        const mark = t.mark ?? null;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 스티커 자리 차례가 곧 열쇠
          <g key={i}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: 누를 수 있을 때만 role="button"을 준다 */}
            <polygon
              points={t.points}
              fill={shade(c, k)}
              data-poster-sticker={t.color ?? "hidden"}
              data-sticker={slot}
              data-sticker-hidden={
                slot !== undefined && t.color === null ? "" : undefined
              }
              stroke={mark ? hexColor(MARK_COLOR[mark]) : undefined}
              strokeWidth={mark ? 2.4 : undefined}
              strokeLinejoin="round"
              data-sticker-mark={
                slot !== undefined ? (mark ?? undefined) : undefined
              }
              data-sticker-cell={press ? slot : undefined}
              role={press ? "button" : undefined}
              tabIndex={press ? 0 : undefined}
              aria-label={
                press && slot !== undefined ? `칸 ${slot + 1}` : undefined
              }
              onClick={
                press && slot !== undefined ? () => press(slot) : undefined
              }
              onKeyDown={
                press && slot !== undefined
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        press(slot);
                      }
                    }
                  : undefined
              }
              className={press ? "cursor-pointer" : undefined}
            />
            {p && p !== "none" && (
              <PatternGlyph pattern={p} transform={t.frame} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
