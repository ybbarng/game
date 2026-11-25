// 해법 지도 시안 화면(SolveMapApp)이 네 안에서 함께 쓰는 계산. 화면을 모르는 순수 함수다.
import {
  edgeById,
  isBigMethod,
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
  nodeById,
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
};

/** B안에서 처음에 펼쳐 둘 해법(나머지는 「다른 해법」으로 접는다) */
export const MAIN_METHODS: readonly MapMethodId[] = [
  "beginner",
  "beginner-twist-first",
  "two-look",
  "cfop",
];

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

/** 길을 지나는 해법들(차례는 MAP_METHODS) */
export function methodsOfEdge(
  edgeId: string,
  methods: readonly MapMethod[],
): MapMethod[] {
  return methods.filter((m) => m.edges.includes(edgeId));
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
 * 길에 붙일 공식 글: 직관 걸음은 「공식 없음」, 앞 길에서 배운 공식만 다시 쓰면 「앞 공식」, 셀 자료가 없으면 null
 */
export function edgeFormulaLabel(
  e: MapEdge,
  selected: readonly MapMethod[],
): string | null {
  if (!e.formulas) return null;
  if (!e.formulas.length) return "공식 없음";
  const k = edgeFormulaCount(e, selected);
  return k === 0 ? "앞 공식" : `공식 ${k}`;
}

/** 길에 붙일 잰 평균 수(고른 해법 가운데 잰 값이 있는 첫 해법) */
export function edgeTurns(
  e: MapEdge,
  selected: readonly MapMethod[],
): number | undefined {
  for (const m of selected)
    if (m.edges.includes(e.id)) {
      const v = measuredStep(m.id, e.id);
      if (v !== undefined) return v;
    }
  return undefined;
}

/** 공식 수 글(값): 0은 「공식 없음」, null(자료 없음)은 비움 */
export function formulaText(k: number | null): string | null {
  if (k === null) return null;
  return k === 0 ? "공식 없음" : `공식 ${k}`;
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

/** 지도 줄 범위(보일 지점만) */
export function rowRange(nodes: Set<MapNodeId>): { min: number; max: number } {
  const rows = [...nodes].map((id) => nodeById(id).row);
  return { min: Math.min(...rows), max: Math.max(...rows) };
}

/** 4×4 해법을 고르거나 펼쳤나 */
export const anyBig = (methods: readonly MapMethod[]) =>
  methods.some(isBigMethod);

/**
 * B안 갈림길: 보일 해법끼리 갈라지거나 합쳐지는 지점(들어오는 길·나가는 길이 둘 이상)과 처음·끝 지점
 */
export function hubNodes(methods: readonly MapMethod[]): Set<MapNodeId> {
  const ins = new Map<MapNodeId, Set<string>>();
  const outs = new Map<MapNodeId, Set<string>>();
  const ends = new Set<MapNodeId>();
  for (const m of methods) {
    const nodes = methodNodes(m);
    ends.add(nodes[0] as MapNodeId);
    ends.add(nodes.at(-1) as MapNodeId);
    for (const id of m.edges) {
      const e = edgeById(id) as MapEdge;
      ins.set(e.to, (ins.get(e.to) ?? new Set()).add(id));
      outs.set(e.from, (outs.get(e.from) ?? new Set()).add(id));
    }
  }
  const out = new Set(ends);
  for (const [n, s] of ins) if (s.size > 1) out.add(n);
  for (const [n, s] of outs) if (s.size > 1) out.add(n);
  return out;
}

export interface Segment {
  key: string;
  from: MapNodeId;
  to: MapNodeId;
  edges: string[];
  methods: MapMethod[];
}

/** 해법마다 길을 갈림길에서 끊은 구간(같은 길 묶음은 하나로, 지나는 해법을 모은다) */
export function segments(methods: readonly MapMethod[]): Segment[] {
  const hubs = hubNodes(methods);
  const by = new Map<string, Segment>();
  for (const m of methods) {
    let cur: string[] = [];
    let from = methodNodes(m)[0] as MapNodeId;
    for (const id of m.edges) {
      const e = edgeById(id) as MapEdge;
      cur.push(id);
      if (hubs.has(e.to)) {
        const key = cur.join(">");
        const seg = by.get(key) ?? {
          key,
          from,
          to: e.to,
          edges: cur,
          methods: [],
        };
        seg.methods.push(m);
        by.set(key, seg);
        cur = [];
        from = e.to;
      }
    }
  }
  return [...by.values()];
}

/** 구간의 공식 수(그 구간을 지나는 첫 고른 해법 기준, 없으면 첫 해법). 셀 자료가 없는 길이 있으면 null */
export function segmentFormulas(
  seg: Segment,
  selected: readonly MapMethod[],
): number | null {
  const m = selected.find((x) => seg.methods.includes(x)) ?? seg.methods[0];
  if (!m) return null;
  const nf = newFormulas(m);
  let sum = 0;
  for (const id of seg.edges) {
    const k = nf.get(id);
    if (k === null || k === undefined) return null;
    sum += k;
  }
  return sum;
}

/** 구간의 잰 평균 수(한 길이라도 잰 값이 없으면 undefined) */
export function segmentTurns(
  seg: Segment,
  selected: readonly MapMethod[],
): number | undefined {
  const ms = [
    ...selected.filter((x) => seg.methods.includes(x)),
    ...seg.methods,
  ];
  for (const m of ms) {
    const xs = seg.edges.map((id) => measuredStep(m.id, id));
    if (xs.every((x) => x !== undefined))
      return xs.reduce((a, b) => (a as number) + (b as number), 0);
  }
  return undefined;
}

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;

/** 줌·패닝 틀의 보기(지도 좌표 → 틀 좌표: 틀 = 지도 × k + (x, y)) */
export interface FrameView {
  x: number;
  y: number;
  k: number;
}

/**
 * 보기를 지도 범위 안으로: 지도가 틀보다 넓으면 지도 끝이 틀 끝을 넘어 들어오지 않게(지도 밖 빈칸이 보이지 않게),
 * 좁으면 왼쪽·위에 붙인다. `w`·`h`는 틀 크기, `width`·`height`는 지도 크기(배율 1)
 */
export function clampView(
  v: FrameView,
  b: { w: number; h: number; width: number; height: number },
): FrameView {
  const fit = (pos: number, frame: number, content: number) =>
    content <= frame ? 0 : Math.min(0, Math.max(frame - content, pos));
  return {
    k: v.k,
    x: fit(v.x, b.w, b.width * v.k),
    y: fit(v.y, b.h, b.height * v.k),
  };
}
