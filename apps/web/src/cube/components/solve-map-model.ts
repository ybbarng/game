// 해법 배우기의 해법 카드·지도(SolveMapApp)가 함께 쓰는 계산. 화면을 모르는 순수 함수다.
import {
  type CubeSize,
  edgeById,
  lessonFor,
  MAP_EDGES,
  MAP_MEASURE,
  MAP_METHODS,
  type MapEdge,
  type MapMethod,
  type MapMethodId,
  type MapNodeId,
  measuredStep,
  methodFormulaCount,
  methodNodes,
  newFormulas,
  PARITY_AT,
  PARITY_LOOPS,
  type ParityLoop,
} from "../learn/solve-map";

/** 해법마다 선 색(어두운 바탕에서 서로 갈리게) */
export const METHOD_COLOR: Readonly<Record<MapMethodId, string>> = {
  beginner: "#f59e0b",
  "beginner-twist-first": "#fb7185",
  "two-look": "#a3e635",
  cfop: "#38bdf8",
  roux: "#c084fc",
  zz: "#34d399",
  petrus: "#f472b6",
  "zz-coll": "#2dd4bf",
  "zz-zbll": "#86efac",
  "cfop-1lll": "#93c5fd",
  "corners-first": "#fde047",
  "444-reduction": "#fca5a5",
  "444-yau": "#e879f9",
  "222-beginner": "#f59e0b",
  "222-from333": "#38bdf8",
  ortega: "#c084fc",
  "555-reduction": "#fca5a5",
};

export const methodById = (id: MapMethodId) =>
  MAP_METHODS.find((m) => m.id === id) as MapMethod;

/** 주소 `?m=a,b` → 고른 해법(모르는 id는 버린다). 없으면 초보자 */
export function parseSelected(text: string | null): MapMethodId[] {
  const ids = (text ?? "")
    .split(",")
    .filter((x): x is MapMethodId => MAP_METHODS.some((m) => m.id === x));
  return ids.length ? [...new Set(ids)] : ["beginner"];
}

/** 보일 해법: 기본 해법 + (펼쳤으면 접은 해법) + 고른 해법 */
export function visibleMethods(
  selected: readonly MapMethodId[],
  showExtra: boolean,
  folded: (m: MapMethod) => boolean,
): MapMethod[] {
  return MAP_METHODS.filter(
    (m) => !folded(m) || showExtra || selected.includes(m.id),
  );
}

export const isExtra = (m: MapMethod) => !!m.extra;

/** 보일 지점(보일 해법이 지나는 지점) */
export function visibleNodes(methods: readonly MapMethod[]): Set<MapNodeId> {
  return new Set(methods.flatMap(methodNodes));
}

/** 보일 길(보일 해법이 지나는 길) */
export function visibleEdges(methods: readonly MapMethod[]): MapEdge[] {
  const ids = new Set(methods.flatMap((m) => m.edges));
  return MAP_EDGES.filter((e) => ids.has(e.id));
}

export interface MethodTotals {
  formulas: number | null;
  turns: number | undefined;
  steps: number;
}

export function methodTotals(m: MapMethod): MethodTotals {
  return {
    formulas: methodFormulaCount(m),
    turns: MAP_MEASURE.turns[m.id],
    steps: m.edges.length,
  };
}

/**
 * 길에 붙일 공식 수: 고른 해법 가운데 그 길을 지나는 첫 해법에서 새로 배우는 수, 고른 해법이 지나지 않으면
 * 길 자체의 공식 수. 셀 자료가 없으면 null
 */
export function edgeFormulaCount(
  e: MapEdge,
  selected: readonly MapMethod[],
): number | null {
  const m = selected.find((x) => x.edges.includes(e.id));
  if (m) return newFormulas(m).get(e.id) ?? null;
  return e.formulas ? e.formulas.length : null;
}

/**
 * 길에 붙일 공식 글: 공식 수는 「공식 n개」, 앞 길에서 배운 공식만 다시 쓰면 「배운 공식」, 셀 자료가 없거나 직관 걸음(공식 0)이면 null.
 * 직관 걸음에 「공식 없음」을 붙이지 않는다(2026-11-26 사용자, 불필요한 표시)
 */
export function edgeFormulaLabel(
  e: MapEdge,
  selected: readonly MapMethod[],
): string | null {
  if (!e.formulas?.length) return null;
  const k = edgeFormulaCount(e, selected);
  // 「공식 9」는 9번 공식처럼 읽혀 개수임을 드러낸다(2026-11-26 사용자). 「앞 공식」도 뜻이 흐려 「배운 공식」
  return k === 0 ? "배운 공식" : `공식 ${k}개`;
}

/**
 * 길에 붙일 잰 평균 수: 고른 해법 가운데 잰 값이 있는 첫 해법, 없으면 그 길을 지나는 다른 해법.
 * 고르지 않은 길에도 같은 값을 보여 한 해법만 골라도 전체를 견준다(2026-11-26 사용자)
 */
export function edgeTurns(
  e: MapEdge,
  selected: readonly MapMethod[],
): number | undefined {
  for (const m of [...selected, ...MAP_METHODS])
    if (m.edges.includes(e.id)) {
      const v = measuredStep(m.id, e.id);
      if (v !== undefined) return v;
    }
  return undefined;
}

export const lessonHref = (id: string) => `/cube/learn?lesson=${id}`;

/** 길을 누르면 갈 단원 주소(없으면 null) */
export function edgeHref(
  e: MapEdge,
  m: MapMethod | undefined,
  courseOf: (id: string) => string | undefined,
): string | null {
  const id = lessonFor(e, m, courseOf);
  return id ? lessonHref(id) : null;
}

/** 지점을 누르면 갈 단원: 고른 해법에서 그 지점으로 들어오는 길의 단원 */
export function nodeHref(
  node: MapNodeId,
  selected: readonly MapMethod[],
  courseOf: (id: string) => string | undefined,
): string | null {
  for (const m of selected)
    for (const id of m.edges) {
      const e = edgeById(id);
      if (e?.to === node) {
        const href = edgeHref(e, m, courseOf);
        if (href) return href;
      }
    }
  return null;
}

export interface Detour {
  loop: ParityLoop;
  /** 우회 역을 붙일 지점 */
  at: MapNodeId;
}

/**
 * 패리티 우회 고리: 큰 큐브 지도에서는 「3×3 맞추기」 칸 옆(at = 그 칸이 닿는 다 맞음), 3×3 지도를 큰 큐브에서
 * 건너와 열었으면 고른 해법의 패리티 자리(PARITY_AT)에. 이름·공식은 PARITY_LOOPS 하나에서
 */
export function detours(
  size: CubeSize,
  from: 4 | 5 | null,
  selected: readonly MapMethod[],
): Detour[] {
  if (size !== 3) {
    const loops = PARITY_LOOPS[size];
    return loops.map((loop) => ({
      loop,
      at: `${size}-solved` as MapNodeId,
    }));
  }
  if (!from) return [];
  const out: Detour[] = [];
  for (const m of selected) {
    const at = PARITY_AT[m.id];
    if (!at) continue;
    for (const loop of PARITY_LOOPS[from]) {
      const node = loop.kind === "oll" ? at.oll : at.pll;
      if (!out.some((d) => d.at === node && d.loop.kind === loop.kind))
        out.push({ loop, at: node });
    }
  }
  return out;
}

/** 패리티 고리에 붙일 잰 값: 축소법 판에서 나온 비율과 나왔을 때 친 수(4×4) */
export const parityMeasure = (kind: "oll" | "pll") => MAP_MEASURE.parity[kind];

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;

/** 줌·패닝 틀의 보기(지도 좌표 → 틀 좌표: 틀 = 지도 × k + (x, y)) */
export interface FrameView {
  x: number;
  y: number;
  k: number;
}

const MIN_K = 0.12;
const MAX_K = 2.5;
/** 지도 배율의 범위 */
export const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** 휠 사건에서 지도가 쓰는 값(`WheelEvent`의 일부) */
export interface MapWheel {
  deltaX: number;
  deltaY: number;
  /** 0 화소, 1 줄, 2 쪽(`WheelEvent.DOM_DELTA_*`) */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** 줄 단위 휠 한 칸의 화소(Firefox 마우스 휠은 줄 단위로 온다) */
const LINE_PX = 16;
/** 확대·축소 한 번에 바뀌는 배율의 지수 상한(Ctrl + 마우스 휠 한 칸이 deltaY 100쯤이라 한 번에 튀지 않게) */
const MAX_ZOOM_STEP = 0.5;

/**
 * 휠·트랙패드 한 번으로 바뀐 보기(Figma 방식, 2026-11-29 사용자). `p`는 틀 안에서 가리킨 자리, `pageH`는 쪽 단위 휠의
 * 한 쪽 높이(틀 높이).
 * - Ctrl(트랙패드 오므리기는 브라우저가 Ctrl 휠로 준다, 맥·윈도 모두)·⌘ + 휠: 가리킨 자리를 두고 확대·축소
 * - 그 밖(두 손가락 밀기·마우스 휠): 밀린 만큼 옮기기, Shift + 휠은 가로로
 */
export function wheelView(
  v: FrameView,
  ev: MapWheel,
  p: { x: number; y: number },
  pageH: number,
): FrameView {
  const unit = ev.deltaMode === 1 ? LINE_PX : ev.deltaMode === 2 ? pageH : 1;
  let dx = ev.deltaX * unit;
  let dy = ev.deltaY * unit;
  if (ev.ctrlKey || ev.metaKey) {
    const step = Math.max(-MAX_ZOOM_STEP, Math.min(MAX_ZOOM_STEP, -dy * 0.01));
    const k = clampK(v.k * Math.exp(step));
    return {
      k,
      x: p.x - ((p.x - v.x) / v.k) * k,
      y: p.y - ((p.y - v.y) / v.k) * k,
    };
  }
  // Shift + 마우스 휠: 브라우저가 이미 가로(deltaX)로 바꿔 주지 않았으면 세로 밀기를 가로로
  if (ev.shiftKey && dx === 0) {
    dx = dy;
    dy = 0;
  }
  return { k: v.k, x: v.x - dx, y: v.y - dy };
}

/**
 * 보기를 지도 범위 안으로:지도가 틀보다 넓으면 지도 끝이 틀 끝을 넘어 들어오지 않게(지도 밖 빈칸이 보이지 않게),
 * 좁으면 가운데에 둔다(전체 보기). `w`·`h`는 틀 크기, `width`·`height`는 지도 크기(배율 1)
 */
export function clampView(
  v: FrameView,
  b: { w: number; h: number; width: number; height: number },
): FrameView {
  const fit = (pos: number, frame: number, content: number) =>
    content <= frame
      ? (frame - content) / 2
      : Math.min(0, Math.max(frame - content, pos));
  return {
    k: v.k,
    x: fit(v.x, b.w, b.width * v.k),
    y: fit(v.y, b.h, b.height * v.k),
  };
}
