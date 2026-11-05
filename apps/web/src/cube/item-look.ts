// 아이템전 화면 방해의 칠하기(docs/47 9-7): 색 뒤집기·흑백 화면. 3D 큐브·거울 판·펼친 그림·작은 큐브 그림·키 그림이
// 모두 이 값으로 칠해 한꺼번에 바뀐다(일부만 바뀌면 화면이 틀린 것처럼 보인다). 큐브 상태·수·판정은 그대로다.
//
// - 색 번호는 면 번호(U R F D L B = 0~5)다. 칸의 색 번호는 맞춘 큐브에서 그 스티커가 있던 면이다.
// - 색 뒤집기: 칸을 맞은편 색 번호의 색으로 칠한다(흰↔노, 빨↔주, 초↔파). 사용자 색 배치여도 맞은편끼리 바꾼다.
// - 흑백 화면: 모든 색을 같은 밝기의 회색 하나로 칠하고, 색 번호마다 정해진 무늬를 늘 같게 붙인다. 무늬는 칠한 색이 아니라
//   (색 뒤집기를 거친) 색 번호를 따른다. 스티커가 돌아가도 같아 보이게 방향 없는 점·고리만 쓴다.

export interface CubeLook {
  /** 색 뒤집기 */
  swap?: boolean;
  /** 흑백 화면 */
  gray?: boolean;
}

/** 맞은편 면 번호 */
export const oppositeColor = (c: number): number => (c + 3) % 6;

/** 흑백 화면의 회색(모든 색이 같은 밝기). 밝기로는 구별되지 않는다 */
export const GRAY = 0x8f8f8f;
/** 무늬 색(회색 위에서 잘 보이는 짙은 회색) */
export const PATTERN_INK = 0x262626;

/**
 * 무늬. 방향이 없는 것만(점·고리). 많고 적음·크고 작음·속이 찼나 비었나로 갈린다.
 * - 흰: 민무늬 / 노랑: 가운데 큰 점 / 빨강: 고리 / 주황: 작은 점 넷(2×2) / 초록: 작은 점 아홉(3×3) / 파랑: 고리 안에 점
 */
export type StickerPattern =
  | "none"
  | "dot"
  | "ring"
  | "dots4"
  | "dots9"
  | "ringDot";

/** 색 번호(U R F D L B) → 무늬 */
export const COLOR_PATTERNS: readonly StickerPattern[] = [
  "none", // U 흰
  "ring", // R 빨강
  "dots9", // F 초록
  "dot", // D 노랑
  "dots4", // L 주황
  "ringDot", // B 파랑
];

export const PATTERN_LABELS: Record<StickerPattern, string> = {
  none: "민무늬",
  dot: "큰 점",
  ring: "고리",
  dots4: "점 넷",
  dots9: "점 아홉",
  ringDot: "고리 안 점",
};

/** 칸(색 번호 c)이 지금 보일 색 번호(색 뒤집기면 맞은편) */
export function shownColor(
  c: number,
  look: CubeLook | null | undefined,
): number {
  return look?.swap ? oppositeColor(c) : c;
}

/** 색 번호마다 칠할 색(장면·펼친 그림·작은 큐브 그림에 넘기는 `colors` 대신) */
export function lookColors(
  colors: readonly number[],
  look: CubeLook | null | undefined,
): number[] {
  return colors.map((_, c) =>
    look?.gray ? GRAY : (colors[shownColor(c, look)] as number),
  );
}

/** 색 번호마다 무늬(흑백 화면이 아니면 null) */
export function lookPatterns(
  look: CubeLook | null | undefined,
): StickerPattern[] | null {
  if (!look?.gray) return null;
  return [0, 1, 2, 3, 4, 5].map(
    (c) => COLOR_PATTERNS[shownColor(c, look)] as StickerPattern,
  );
}

export const isPlainLook = (look: CubeLook | null | undefined): boolean =>
  !look?.swap && !look?.gray;

/** 무늬의 점·고리(칸 한 변 = 1). 캔버스·SVG·CSS가 같은 모양을 그린다 */
export interface PatternShape {
  dots: { x: number; y: number; r: number }[];
  rings: { x: number; y: number; r: number; w: number }[];
}

export function patternShape(p: StickerPattern): PatternShape {
  const grid = (k: number, r: number) => {
    const out: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++)
        out.push({ x: (i + 1) / (k + 1), y: (j + 1) / (k + 1), r });
    return out;
  };
  switch (p) {
    case "none":
      return { dots: [], rings: [] };
    case "dot":
      return { dots: [{ x: 0.5, y: 0.5, r: 0.2 }], rings: [] };
    case "ring":
      return { dots: [], rings: [{ x: 0.5, y: 0.5, r: 0.27, w: 0.08 }] };
    case "dots4":
      return { dots: grid(2, 0.1), rings: [] };
    case "dots9":
      return { dots: grid(3, 0.065), rings: [] };
    case "ringDot":
      return {
        dots: [{ x: 0.5, y: 0.5, r: 0.09 }],
        rings: [{ x: 0.5, y: 0.5, r: 0.28, w: 0.07 }],
      };
  }
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/**
 * CSS 바탕 조각(HTML 칸, 키 그림): 점·고리마다 `radial-gradient` 한 장을 그 크기·자리에 둔다(칸 크기와 상관없이 같은 모양,
 * 방향 없음). 바탕색은 따로(`backgroundColor`)
 */
export function patternStyle(p: StickerPattern): {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
} {
  const ink = hex(PATTERN_INK);
  const s = patternShape(p);
  const layers: { image: string; x: number; y: number; r: number }[] = [
    ...s.dots.map((d) => ({
      image: `radial-gradient(closest-side, ${ink} 0 88%, transparent 100%)`,
      x: d.x,
      y: d.y,
      r: d.r,
    })),
    ...s.rings.map((r) => {
      const outer = r.r + r.w / 2;
      const inner = ((r.r - r.w / 2) / outer) * 100;
      return {
        image: `radial-gradient(closest-side, transparent ${inner - 4}%, ${ink} ${inner}%, ${ink} 90%, transparent 100%)`,
        x: r.x,
        y: r.y,
        r: outer,
      };
    }),
  ];
  if (layers.length === 0) return {};
  const pos = (c: number, size: number) =>
    size >= 1 ? 50 : ((c - size / 2) / (1 - size)) * 100;
  return {
    backgroundImage: layers.map((l) => l.image).join(", "),
    backgroundSize: layers.map((l) => `${l.r * 200}% ${l.r * 200}%`).join(", "),
    backgroundPosition: layers
      .map((l) => `${pos(l.x, l.r * 2)}% ${pos(l.y, l.r * 2)}%`)
      .join(", "),
    backgroundRepeat: "no-repeat",
  };
}
