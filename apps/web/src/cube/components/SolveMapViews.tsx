"use client";

// 해법 배우기의 펼친 지도(SolveMapApp MapScreen). 줌·패닝·미니맵 틀(MapFrame) 안에 둔다. 해법 카드도 지점 그림·꼬리표를 함께 쓴다.
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";
import type { LearnProgress, TrainBook } from "../learn/progress";
import {
  type CubeSize,
  edgeById,
  FINISH_METHODS,
  MAP_METHODS,
  type MapEdge,
  type MapMethod,
  type MapMethodId,
  type MapNodeId,
  methodNodes,
  nodeById,
  nodeMask,
  nodeSize,
  nodeState,
  PARITY_AT,
  PARITY_LOOPS,
} from "../learn/solve-map";
import {
  arrowLit,
  cellLit,
  type EdgeSolo,
  edgeProgress,
  edgeTrain,
  PROGRESS_SR,
  type StepProgress,
} from "../learn/solve-map-me";
import type { CubeSettings } from "../settings";
import { CubePosterPair } from "./CubePosterPair";
import {
  clampView,
  type Detour,
  detours,
  edgeFormulaLabel,
  edgeHref,
  edgeTurns,
  METHOD_COLOR,
  nodeHref,
  parityMeasure,
  rowRange,
  seconds,
  visibleEdges,
  visibleNodes,
} from "./solve-map-model";

/** 진도를 화면 낭독기에만 읽어 준다(보이는 글자는 두지 않는다, 진도 밝기 docs/47 16-30) */
export function ProgressSr({ p }: { p: StepProgress }) {
  const t = PROGRESS_SR[p];
  return t ? <span className="sr-only">{` ${t}`}</span> : null;
}

/** 진도가 아직인 칸: 그림·이름을 조금 어둡게(기록이 없어도 처음부터) */
export const DIM = "opacity-45";

/** 펼치기·접기 주소(큰 큐브 「3×3 맞추기」) */
const toggleHref = (ctx: MapCtx) =>
  ctx.finHref(ctx.fin ? null : (FINISH_METHODS[0] as MapMethodId));

/** 길을 누르면 갈 곳: 큰 큐브 「3×3 맞추기」는 그 자리에서 펼치기·접기, 그 밖은 단원 */
export function hrefOf(
  e: MapEdge,
  m: MapMethod | undefined,
  ctx: MapCtx,
): string | null {
  if (e.jump) return toggleHref(ctx);
  return edgeHref(e, m, ctx.courseOf);
}

/** 지점을 누르면 갈 곳: 「3×3처럼」은 다음 칸 펼치기·접기, 그 밖은 들어오는 길의 단원 */
export function nodeHrefOf(id: MapNodeId, ctx: MapCtx): string | null {
  if (nodeById(id).jump) return toggleHref(ctx);
  return nodeHref(id, ctx.selected, ctx.courseOf);
}

/** 펼치기·접기 칸이면 페이지를 옮기지 않고 그 자리에서 펼친다 */
export function toggleClick(
  jump: unknown,
  ctx: MapCtx,
): ((ev: MouseEvent) => void) | undefined {
  if (!jump) return undefined;
  return (ev) => {
    ev.preventDefault();
    ctx.setFin(ctx.fin ? null : (FINISH_METHODS[0] as MapMethodId));
  };
}

/**
 * 큰 큐브 「3×3 맞추기」를 펼친 칸: 고른 3×3 해법(칸 안에서 바꿈)의 걸음을 그 크기 큐브 그림으로, 패리티가 보이는
 * 자리에 토끼이빨·바보토끼이빨 고리, 3×3 지도에 들르는 링크
 */
export function FinishPanel({ ctx }: { ctx: MapCtx }) {
  const fin = ctx.fin;
  if (!fin || ctx.size === 3) return null;
  const n = ctx.size;
  const at = PARITY_AT[fin.id];
  const loops = PARITY_LOOPS[n];
  const one = { ...ctx, selected: [fin] };
  return (
    <div
      className="flex w-[260px] flex-col gap-1.5 rounded-xl border border-white/25 bg-neutral-900/95 p-2"
      data-finish-panel={fin.id}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 들르는 링크는 머리 줄에(아래쪽은 휴대폰에서 작은 지도에 가린다) */}
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sm">3×3 맞추기</span>
        <a
          href={ctx.hopHref}
          onClick={(ev) => {
            ev.preventDefault();
            ctx.hop();
          }}
          className="text-sky-300 text-xs underline-offset-2 hover:underline"
          data-finish-hop
        >
          3×3 지도에서 보기 →
        </a>
      </span>
      <span className="flex flex-wrap gap-1" data-finish-methods>
        {FINISH_METHODS.map((id) => {
          const m = MAP_METHODS.find((x) => x.id === id) as MapMethod;
          const on = id === fin.id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => ctx.setFin(id)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                on ? "bg-white/10" : "border-white/15 text-white/50",
              )}
              style={on ? { borderColor: METHOD_COLOR[id] } : undefined}
              data-finish-method={id}
            >
              {m.title}
            </button>
          );
        })}
      </span>
      <ol className="flex flex-col gap-1">
        {fin.edges.map((id) => {
          const e = edgeById(id) as MapEdge;
          const href = edgeHref(e, fin, ctx.courseOf);
          const progress = edgeProgress(e, fin, ctx.progress, ctx.courseOf);
          const f = edgeFormulaLabel(e, [fin]);
          const here = loops.filter(
            (l) => at && (l.kind === "oll" ? at.oll : at.pll) === e.to,
          );
          const body = (
            <>
              <span
                className={cn(
                  "shrink-0",
                  CUBE_CELL,
                  !cellLit(false, progress) && DIM,
                )}
              >
                <NodeCube
                  id={e.to}
                  settings={ctx.settings}
                  px={40}
                  as={n}
                  method={fin}
                />
              </span>
              <span className="flex min-w-0 flex-col text-[11px] leading-tight">
                <span className="font-medium text-white">
                  {e.title}
                  <ProgressSr p={progress} />
                </span>
                {f && <span className="text-white/60">{f}</span>}
              </span>
            </>
          );
          return (
            <li key={id} className="flex flex-col gap-1">
              {href ? (
                <a
                  href={href}
                  className="flex items-center gap-2 rounded-md bg-neutral-800/80 px-1.5 py-1 hover:bg-neutral-800"
                  data-finish-edge={id}
                >
                  {body}
                </a>
              ) : (
                <span
                  className="flex items-center gap-2 rounded-md bg-neutral-800/40 px-1.5 py-1"
                  data-finish-edge={id}
                >
                  {body}
                </span>
              )}
              {here.map((loop) => (
                <span key={loop.kind} className="pl-6">
                  <LoopChip d={{ loop, at: e.to }} ctx={one} />
                </span>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 펼친 칸의 대략 크기(지도 범위를 넓히는 데 쓴다) */
export function finishPanelSize(ctx: MapCtx): { w: number; h: number } {
  if (!ctx.fin || ctx.size === 3) return { w: 0, h: 0 };
  const loops = PARITY_LOOPS[ctx.size].length;
  return { w: 260, h: 90 + ctx.fin.edges.length * 54 + loops * 70 };
}

/** 패리티 고리 색(두 고리를 같은 색·모양으로 묶어 「큰 큐브에만 있는 걸음」으로 보이게) */
export const LOOP_COLOR = "#fbbf24";

/**
 * 패리티 고리 칸: 한국 이름(토끼이빨·바보토끼이빨), 아래 작은 줄에 널리 쓰는 이름과 어디서 보이는지, 공식 수·잰 수
 * (축소법 판에서 나온 비율), 공식 연습 기록
 */
export function LoopChip({
  d,
  ctx,
  compact = false,
}: {
  d: Detour;
  ctx: MapCtx;
  compact?: boolean;
}) {
  const f = d.loop.formulas.length;
  const pm = parityMeasure(d.loop.kind);
  const train = edgeTrain(
    {
      id: `loop:${d.loop.kind}`,
      from: d.at,
      to: d.at,
      title: d.loop.name,
      lessons: [],
      formulas: d.loop.formulas,
    },
    ctx.train,
  );
  return (
    <span
      className="flex flex-col rounded-md border border-dashed bg-neutral-900/95 px-1.5 py-0.5 text-[10px] leading-tight"
      style={{ borderColor: LOOP_COLOR }}
      data-parity-loop={d.loop.kind}
    >
      <span
        className="whitespace-nowrap font-semibold text-xs"
        style={{ color: LOOP_COLOR }}
      >
        {d.loop.name}
      </span>
      {!compact && (
        <>
          <span className="whitespace-nowrap text-white/60">{d.loop.sub}</span>
          <span className="whitespace-nowrap text-white/80">
            {`공식 ${f} · ${pm.turns}수 · ${pm.rate}% 판에 나옴`}
          </span>
          {train && (
            <span className="whitespace-nowrap text-sky-200">
              익숙 {train.familiar}/{train.total}
              {train.avgMs !== null ? ` · ${seconds(train.avgMs)}` : ""}
            </span>
          )}
        </>
      )}
    </span>
  );
}

export interface MapCtx {
  settings: CubeSettings;
  /** 보이는 해법 */
  methods: MapMethod[];
  /** 고른 해법(고른 차례) */
  selected: MapMethod[];
  progress: LearnProgress;
  train: TrainBook;
  /** 해법 id → 길마다 내 혼자 맞추기 구간 */
  solo: Map<string, Map<string, EdgeSolo>>;
  courseOf: (lessonId: string) => string | undefined;
  /** 단원 id → 단원 제목 */
  lessonTitle: (lessonId: string) => string;
  toggle: (id: MapMethod["id"]) => void;
  /** 지도 크기 */
  size: CubeSize;
  /** 3×3 지도를 큰 큐브에서 건너와 열었으면 그 크기(패리티 우회 역) */
  from: 4 | 5 | null;
  /** 큰 큐브 「3×3 맞추기」를 펼쳤으면 그 안에서 고른 3×3 해법(접었으면 null) */
  fin: MapMethod | null;
  /** 펼친 해법을 이것으로 바꾼 주소(null이면 접은 주소) */
  finHref: (id: MapMethodId | null) => string;
  setFin: (id: MapMethodId | null) => void;
  /** 3×3 지도에 들르는 주소와 들르기(크기 탭은 그대로) */
  hopHref: string;
  hop: () => void;
}

/** 지도 틀의 지금 배율(A·C 지도 안에서만 1이 아니다) */
const ZoomK = createContext(1);

/** 이 배율보다 작으면 지점 그림 대신 점(그림이 너무 작아 알아볼 수 없다). 확대하면 그림이 나온다 */
const PIC_MIN_K = 0.45;

/** 지도 위 지점 그림: 작은 배율에서는 같은 자리의 점 하나 */
function NodePic({ id, ctx, px }: { id: MapNodeId; ctx: MapCtx; px: number }) {
  const k = useContext(ZoomK);
  if (k < PIC_MIN_K)
    return (
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ width: px, height: px * 0.9 }}
        data-node-part="pic"
        data-node-dot
      >
        <span
          className="block rounded-full bg-white/80"
          style={{ width: px * 0.45, height: px * 0.45 }}
        />
      </span>
    );
  return (
    <span className={cn("shrink-0", CUBE_CELL)} data-node-part="pic">
      <NodeCube id={id} settings={ctx.settings} px={px} />
    </span>
  );
}

/**
 * 지점 그림 칸: 검은 큐브가 묶음(지도 지점 상자·카드) 바탕에 묻히지 않게 한 단계 밝은 바탕과 얇은 테두리
 * (2026-11-26 사용자 「큐브가 눈에 잘 안 띈다」, 과하지 않게)
 */
export const CUBE_CELL = "rounded-md bg-neutral-700/60 ring-1 ring-white/15";

// ── 지점 그림 ─────────────────────────────────────────

export function NodeCube({
  id,
  settings,
  px,
  as,
  method,
}: {
  id: MapNodeId;
  settings: CubeSettings;
  px: number;
  /** 3×3 지점을 이 크기 큐브로 그린다(큰 큐브 「3×3 맞추기」를 펼친 칸) */
  as?: CubeSize;
  /** 해법 하나의 띠: 끝 지점(다 맞음)을 바로 앞 지점처럼 쥔다 */
  method?: MapMethod;
}) {
  const n = as && as !== 3 && nodeSize(id) === 3 ? as : nodeSize(id);
  const state = useMemo(() => nodeState(id, as, method), [id, as, method]);
  const mask = useMemo(() => nodeMask(id, as), [id, as]);
  return (
    <div style={{ width: px }} data-node-cube={id}>
      <CubePosterPair
        n={n}
        state={state}
        mask={mask}
        settings={settings}
        frontOnly
        captions={false}
        hidden="black"
        className="w-full"
      />
    </div>
  );
}

// ── 길의 내 기록 ─────────────────────────────────────────

function edgeSolo(e: MapEdge, ctx: MapCtx): EdgeSolo | undefined {
  for (const m of ctx.selected) {
    const s = ctx.solo.get(m.id)?.get(e.id);
    if (s && m.edges.includes(e.id)) return s;
  }
  return undefined;
}

const SKILL_COLOR = {
  strong: "text-emerald-300",
  weak: "text-orange-300",
  even: "text-white/80",
} as const;

/** 길 꼬리표 안의 줄들: 공식·잰 수, 공식 연습, 혼자 맞추기 */
export function EdgeLines({
  e,
  ctx,
  full,
}: {
  e: MapEdge;
  ctx: MapCtx;
  full: boolean;
}) {
  const f = edgeFormulaLabel(e, ctx.selected);
  const turns = full ? edgeTurns(e, ctx.selected) : undefined;
  const train = full ? edgeTrain(e, ctx.train) : null;
  const solo = full ? edgeSolo(e, ctx) : undefined;
  return (
    <>
      <span className="whitespace-nowrap">
        {[f, turns !== undefined ? `${turns}수` : null]
          .filter(Boolean)
          .join(" · ")}
        {!e.lessons.length && (
          <span className="text-white/40">
            {f || turns ? " · " : ""}강 없음
          </span>
        )}
      </span>
      {train && (
        <span className="whitespace-nowrap text-sky-200" data-edge-train>
          익숙 {train.familiar}/{train.total}
          {train.avgMs !== null ? ` · ${seconds(train.avgMs)}` : ""}
        </span>
      )}
      {solo && (
        <span
          className={cn(
            "whitespace-nowrap",
            solo.skill ? SKILL_COLOR[solo.skill] : "text-white/80",
          )}
          data-edge-solo={solo.skill ?? ""}
        >
          내 {seconds(solo.avgMs)}
        </span>
      )}
    </>
  );
}

// ── A·C: 자리 계산 ──────────────────────────────────────

interface Layout {
  width: number;
  height: number;
  pos: Map<MapNodeId, { x: number; y: number }>;
  nodeH: number;
  /** 줄 높이 */
  RH: number;
  /** 칸 사이 빈 길 폭 */
  G: number;
  /** 칸마다 왼쪽 끝과 폭(빈 칸은 폭 0) */
  colLeft: number[];
  colW: number[];
}

/** 지점 상자 폭 */
const BOX_W = 100;

function useLayout(ctx: MapCtx): Layout {
  return useMemo(() => {
    const nodes = visibleNodes(ctx.methods);
    const { min, max } = rowRange(nodes);
    const RH = 158;
    const PAD = 24;
    // 칸 사이 빈 길(거터): 칸을 넘는 선과 꼬리표는 여기로만 지난다
    const G = 56;
    const nodeH = 92;
    // 지도는 「다 섞임」에서 시작한다
    const TOP = PAD + 16;
    // 칸 폭: 지점이 있는 칸은 상자 폭
    const maxCol = Math.max(...[...nodes].map((id) => nodeById(id).col));
    const colW = Array.from({ length: maxCol + 1 }, (_, c) =>
      [...nodes].some((id) => nodeById(id).col === c) ? BOX_W : 0,
    );
    const colLeft: number[] = [];
    let x = PAD + G / 2;
    for (const w of colW) {
      colLeft.push(x);
      x += w ? w + G : 0;
    }
    const pos = new Map<MapNodeId, { x: number; y: number }>();
    for (const id of nodes) {
      const n = nodeById(id);
      pos.set(id, {
        x: (colLeft[n.col] as number) + BOX_W / 2,
        y: TOP + (n.row - min) * RH,
      });
    }
    return {
      width: x - G / 2 + PAD,
      height: TOP + (max - min) * RH + nodeH + 30 + PAD,
      pos,
      nodeH,
      RH,
      G,
      colLeft,
      colW,
    };
  }, [ctx.methods]);
}

/**
 * 길의 경로(꺾은선): 같은 칸 바로 아래면 곧게, 아니면 줄 사이 빈 길과 칸 사이 빈 길로만 지나 지점 그림·이름 위를
 * 가로지르지 않는다. `a`·`b`는 나가는 점·들어오는 점(상자 아래·위 가운데)
 */
function routeEdge(e: MapEdge, layout: Layout, a: Pt, b: Pt, dx: number): Pt[] {
  const na = nodeById(e.from);
  const nb = nodeById(e.to);
  const { G, RH, nodeH, colLeft, colW, pos } = layout;
  const gap = RH - nodeH;
  // 같은 칸에서 사이에 다른 지점이 있는가(있으면 곧게 가면 그 위를 지난다)
  const between = [...pos.keys()].some((id) => {
    const n = nodeById(id);
    return n.col === na.col && n.row > na.row && n.row < nb.row;
  });
  if (na.col === nb.col && !between) return [a, b];
  const ya = a.y + Math.min(gap / 2, (b.y - a.y) / 2);
  const yb = b.y - Math.min(gap / 2, (b.y - a.y) / 2);
  const oneRow = nb.row - na.row <= 1;
  if (oneRow && na.col !== nb.col)
    return [
      a,
      { x: a.x, y: ya },
      { x: b.x + dx, y: ya },
      { x: b.x + dx, y: b.y },
      b,
    ];
  // 여러 줄: 칸 사이 빈 길을 따라 내려간다(오른쪽으로 가면 b 칸 왼쪽, 왼쪽·같은 칸이면 b 칸 오른쪽 빈 길)
  const left = colLeft[nb.col] as number;
  const gx =
    nb.col > na.col
      ? left - G / 2 + dx
      : left + (colW[nb.col] as number) + G / 2 + dx;
  return [
    a,
    { x: a.x, y: ya },
    { x: gx, y: ya },
    { x: gx, y: yb },
    { x: b.x, y: yb },
    b,
  ];
}

/** 꺾은선을 SVG 경로로(해법마다 조금씩 비켜 겹치지 않게) */
const polyPath = (ps: Pt[], off: number) =>
  ps
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${p.x + off},${p.y + (i && i < ps.length - 1 ? off : 0)}`,
    )
    .join(" ");

/** 꺾은선에서 길이 절반 지점(꼬리표 자리) */
function halfway(ps: Pt[]): Pt {
  const lens = ps.slice(1).map((p, i) => {
    const q = ps[i] as Pt;
    return Math.hypot(p.x - q.x, p.y - q.y);
  });
  let left = lens.reduce((s, l) => s + l, 0) / 2;
  for (const [i, l] of lens.entries()) {
    const p = ps[i] as Pt;
    const q = ps[i + 1] as Pt;
    if (left <= l && l > 0)
      return {
        x: p.x + ((q.x - p.x) * left) / l,
        y: p.y + ((q.y - p.y) * left) / l,
      };
    left -= l;
  }
  return ps[0] as Pt;
}

type Pt = { x: number; y: number };

/** 글 폭 어림(10px 글씨: 한글 10px, 그 밖 6px) */
const textW = (s: string) =>
  [...s].reduce((w, c) => w + (/[가-힣]/.test(c) ? 10 : 6), 0);

/** 꼬리표 크기 어림(가운데 기준 상자의 폭·높이) */
function labelSize(e: MapEdge, ctx: MapCtx, on: boolean) {
  const f = edgeFormulaLabel(e, ctx.selected) ?? "";
  const turns = on ? edgeTurns(e, ctx.selected) : undefined;
  const lines = [
    // 앞의 「✓ 」는 여유 폭(어림이 작으면 밀어도 겹친다)
    `✓ ${f} · ${turns ?? ""}수${e.lessons.length ? "" : " · 강 없음"}`,
  ];
  if (on) {
    lines.push(e.title);
    if (edgeTrain(e, ctx.train)) lines.push("익숙 0/0 · 0.0초");
    if (edgeSolo(e, ctx)) lines.push("내 00.0초");
  }
  // 어림이 실제보다 작으면 밀어도 겹친다(겹침 화면 시험이 본다). 넉넉히
  return {
    w: Math.max(...lines.map(textW)) + 24,
    h: lines.length * 14 + 10,
  };
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * 꼬리표 자리 고르기: 지점 상자와 다른 꼬리표에 겹치면 덜 겹친 쪽(가로·세로)으로 민다. 지점 상자는 움직이지 않는다
 */
function placeLabels(items: Box[], fixed: Box[]): Pt[] {
  const ps = items.map((b) => ({ ...b }));
  // 같은 자리에서 시작한 둘은 같은 쪽으로 함께 밀려 영영 겹치니, 자리가 같으면 순서(tie)로 방향을 가른다
  const dir = (p: number, q: number, tie: number) =>
    p > q ? 1 : p < q ? -1 : tie;
  const push = (a: Box, b: Box, share: number, tie: number) => {
    const ox = (a.w + b.w) / 2 + 8 - Math.abs(a.x - b.x);
    const oy = (a.h + b.h) / 2 + 6 - Math.abs(a.y - b.y);
    if (ox <= 0 || oy <= 0) return;
    if (ox < oy) a.x += dir(a.x, b.x, tie) * ox * share;
    else a.y += dir(a.y, b.y, tie) * oy * share;
  };
  for (let round = 0; round < 80; round++) {
    for (const [i, a] of ps.entries()) {
      for (const f of fixed) push(a, f, 1, 1);
      for (const [j, b] of ps.entries())
        if (i !== j) push(a, b, 0.5, i < j ? -1 : 1);
    }
  }
  // 마무리: 위아래 지점 상자 사이 좁은 틈에 몰려 아직 겹친 꼬리표끼리는 뒤의 것을 옆으로 뗀다(위아래로는 상자에
  // 막혀 갈라지지 않는다, 2026-11-26 확대한 지도에서 1px 겹침이 드러남)
  for (let round = 0; round < 8; round++)
    for (const [i, a] of ps.entries())
      for (const b of ps.slice(i + 1)) {
        const ox = (a.w + b.w) / 2 + 8 - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        if (ox > 0 && oy > 0) b.x += dir(b.x, a.x, 1) * ox;
      }
  return ps.map(({ x, y }) => ({ x, y }));
}

/** 같은 두 지점을 잇는 길이 여럿이면 옆으로 벌린다 */
function parallelOffset(e: MapEdge, edges: MapEdge[]): number {
  const same = edges.filter((x) => x.from === e.from && x.to === e.to);
  const i = same.indexOf(e);
  return (i - (same.length - 1) / 2) * 34;
}

// ── 지도 ─────────────────────────────────────────────

export function MapView({ ctx }: { ctx: MapCtx }) {
  const layout = useLayout(ctx);
  const edges = visibleEdges(ctx.methods);
  const selectedEdges = new Set(ctx.selected.flatMap((m) => m.edges));
  const selectedNodes = new Set(ctx.selected.flatMap(methodNodes));
  // 큰 큐브 「3×3 맞추기」를 펼친 칸: 모든 노선 오른쪽, 「3×3처럼」 높이에서 아래로
  const panel = useMemo(() => {
    const sz = finishPanelSize(ctx);
    if (!sz.w) return null;
    const xs = [...layout.pos.values()].map((p) => p.x);
    const starts = ctx.selected
      .flatMap(methodNodes)
      .filter((id) => nodeById(id).jump)
      .map((id) => layout.pos.get(id))
      .filter((p): p is Pt => !!p);
    const y = starts.length ? Math.min(...starts.map((p) => p.y)) : 0;
    return { x: Math.max(...xs) + 110, y, ...sz, from: starts };
  }, [ctx, layout]);
  const width = panel
    ? Math.max(layout.width, panel.x + panel.w + 40)
    : layout.width;
  const height = panel
    ? Math.max(layout.height, panel.y + panel.h + 40)
    : layout.height;
  // 해법을 고르면 고른 길 전체가 보이게(펼쳤으면 펼친 칸과 그 앞 「3×3처럼」이 보이게)
  const fit = useMemo(() => {
    if (panel) {
      const x0 = Math.min(...panel.from.map((p) => p.x), panel.x) - 70;
      return {
        x: x0,
        y: panel.y - 20,
        w: panel.x + panel.w + 20 - x0,
        h: panel.h + 40,
      };
    }
    const ps = [...new Set(ctx.selected.flatMap(methodNodes))]
      .map((id) => layout.pos.get(id))
      .filter((p): p is Pt => !!p);
    if (!ps.length) return null;
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    return {
      x: Math.min(...xs) - 70,
      y: Math.min(...ys) - 20,
      w: Math.max(...xs) - Math.min(...xs) + 140,
      h: Math.max(...ys) - Math.min(...ys) + layout.nodeH + 60,
    };
  }, [layout, ctx.selected, panel]);
  const fitKey = `${ctx.selected.map((m) => m.id).join(",")}|${ctx.fin?.id ?? ""}`;

  const mini = (
    <svg width={width} height={height} aria-hidden>
      {panel && (
        <rect
          x={panel.x}
          y={panel.y}
          width={panel.w}
          height={panel.h}
          rx={14}
          fill="#444"
        />
      )}
      {edges.map((e) => {
        const a = layout.pos.get(e.from);
        const b = layout.pos.get(e.to);
        if (!a || !b) return null;
        const on = selectedEdges.has(e.id);
        const m = ctx.selected.find((x) => x.edges.includes(e.id));
        return (
          <line
            key={e.id}
            x1={a.x}
            y1={a.y + layout.nodeH / 2}
            x2={b.x}
            y2={b.y + layout.nodeH / 2}
            stroke={on && m ? METHOD_COLOR[m.id] : "#555"}
            strokeWidth={on ? 10 : 5}
          />
        );
      })}
      {[...layout.pos].map(([id, p]) => (
        <circle
          key={id}
          cx={p.x}
          cy={p.y + layout.nodeH / 2}
          r={14}
          fill={selectedNodes.has(id) ? "#fff" : "#777"}
        />
      ))}
    </svg>
  );

  return (
    <MapFrame
      width={width}
      height={height}
      fit={fit}
      fitKey={fitKey}
      mini={mini}
    >
      <MapLayer
        ctx={ctx}
        layout={layout}
        edges={edges}
        selectedEdges={selectedEdges}
        selectedNodes={selectedNodes}
      />
      {panel && (
        <>
          {/* 「3×3처럼」에서 펼친 칸으로 이어지는 점선 */}
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={1}
            height={1}
            aria-hidden
          >
            {panel.from.map((p) => (
              <path
                key={`${p.x},${p.y}`}
                d={`M${p.x + 50},${p.y + layout.nodeH / 2} C${p.x + 120},${p.y + layout.nodeH / 2} ${panel.x - 60},${panel.y + 20} ${panel.x},${panel.y + 20}`}
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
            ))}
          </svg>
          <div
            className="absolute"
            style={{ left: panel.x, top: panel.y, zIndex: 5 }}
          >
            <FinishPanel ctx={ctx} />
          </div>
        </>
      )}
    </MapFrame>
  );
}

function MapLayer({
  ctx,
  layout,
  edges,
  selectedEdges,
  selectedNodes,
}: {
  ctx: MapCtx;
  layout: Layout;
  edges: MapEdge[];
  selectedEdges: Set<string>;
  selectedNodes: Set<MapNodeId>;
}) {
  const { pos, nodeH } = layout;
  const geo0 = edges.flatMap((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return [];
    const dx = parallelOffset(e, edges) * 0.4;
    const ps = routeEdge(
      e,
      layout,
      { x: a.x, y: a.y + nodeH },
      { x: b.x, y: b.y },
      dx,
    );
    return [{ e, ps, label: halfway(ps) }];
  });
  // 꼬리표가 지점 그림이나 다른 꼬리표를 가리지 않게 옆으로 민다
  const placed = placeLabels(
    geo0.map((g) => ({
      ...g.label,
      ...labelSize(
        g.e,
        ctx,
        ctx.selected.some((m) => m.edges.includes(g.e.id)),
      ),
    })),
    [...pos.values()].map((p) => ({
      x: p.x,
      y: p.y + nodeH / 2,
      w: BOX_W + 8,
      h: nodeH + 8,
    })),
  );
  const geo = geo0.map((g, i) => ({ ...g, label: placed[i] as Pt }));
  const path = (g: (typeof geo)[number], off: number) => polyPath(g.ps, off);
  return (
    <div
      className="relative"
      style={{ width: layout.width, height: layout.height }}
    >
      <svg
        className="absolute inset-0"
        width={layout.width}
        height={layout.height}
        aria-hidden
      >
        {geo.map((g) => {
          const ms = ctx.selected.filter((m) => m.edges.includes(g.e.id));
          const dash = g.e.lessons.length ? undefined : "6 5";
          if (!ms.length)
            return (
              <path
                key={g.e.id}
                d={path(g, 0)}
                fill="none"
                stroke="#6b6b6b"
                strokeOpacity={0.45}
                strokeWidth={1.5}
                strokeDasharray={dash}
              />
            );
          // 걸음 선은 카드의 화살표 역할: 배우는 중부터 밝게, 아직이면 흐리게(진도 밝기)
          return ms.map((m, j) => {
            const lit = arrowLit(
              edgeProgress(g.e, m, ctx.progress, ctx.courseOf),
            );
            return (
              <path
                key={`${g.e.id}-${m.id}`}
                d={path(g, (j - (ms.length - 1) / 2) * 5)}
                fill="none"
                stroke={METHOD_COLOR[m.id]}
                strokeOpacity={lit ? 1 : 0.35}
                strokeWidth={lit ? 4.5 : 3.5}
                strokeDasharray={dash}
                strokeLinecap="round"
                data-edge-line={g.e.id}
                data-edge-lit={lit ? "lit" : "dim"}
              />
            );
          });
        })}
      </svg>
      {geo.map((g) => {
        const on = selectedEdges.has(g.e.id);
        // 흐린 길에 적을 값이 없으면(셀 자료 없음·단원 있음) 꼬리표를 두지 않는다
        if (!on && !edgeFormulaLabel(g.e, ctx.selected) && g.e.lessons.length)
          return null;
        const m = ctx.selected.find((x) => x.edges.includes(g.e.id));
        const href = hrefOf(g.e, m, ctx);
        const body = (
          <>
            {on && (
              <span className="font-medium text-white">
                {g.e.title}
                {m && (
                  <ProgressSr
                    p={edgeProgress(g.e, m, ctx.progress, ctx.courseOf)}
                  />
                )}
              </span>
            )}
            <EdgeLines e={g.e} ctx={ctx} full={on} />
          </>
        );
        const cls = cn(
          "-translate-x-1/2 -translate-y-1/2 absolute flex flex-col items-center rounded-md px-1.5 py-0.5 text-[10px] leading-tight",
          on
            ? "border border-white/20 bg-neutral-800/95 text-white/80"
            : "bg-neutral-900/80 text-white/35",
        );
        const style = { left: g.label.x, top: g.label.y, zIndex: on ? 3 : 1 };
        return href ? (
          <a
            key={g.e.id}
            href={href}
            onClick={toggleClick(g.e.jump, ctx)}
            aria-expanded={g.e.jump ? !!ctx.fin : undefined}
            className={cls}
            style={style}
            data-edge={g.e.id}
          >
            {body}
          </a>
        ) : (
          <span
            key={g.e.id}
            className={cls}
            style={style}
            data-edge={g.e.id}
            aria-disabled
          >
            {body}
          </span>
        );
      })}
      {[...pos].map(([id, p]) => {
        const on = selectedNodes.has(id);
        const shared = ctx.selected.filter((m) => methodNodes(m).includes(id));
        const href = nodeHrefOf(id, ctx);
        // 고른 길의 지점: 다 섞임은 늘 밝고, 그 밖은 들어오는 걸음을 마쳤을 때만 밝다(진도 밝기)
        const lit = on && nodeLit(id, ctx);
        const body = (
          <>
            <span
              className={cn(
                "flex flex-col items-center",
                !on ? "opacity-35" : !lit && DIM,
              )}
              data-node-lit={on ? (lit ? "lit" : "dim") : undefined}
            >
              <NodePic id={id} ctx={ctx} px={60} />
              <span
                className="mt-0.5 text-center text-[11px] leading-tight"
                data-node-part="name"
              >
                {nodeById(id).title}
              </span>
            </span>
          </>
        );
        // 흐린 지점도 어두운 바탕을 깔아 뒤 선이 비치지 않게
        const cls = cn(
          "-translate-x-1/2 absolute flex w-[100px] flex-col items-center rounded-lg px-1 py-1",
          on ? "bg-neutral-800" : "bg-neutral-900",
          shared.length > 1 && "ring-2 ring-white/70",
        );
        const style = { left: p.x, top: p.y, height: layout.nodeH, zIndex: 2 };
        return href ? (
          <a
            key={id}
            href={href}
            onClick={toggleClick(nodeById(id).jump, ctx)}
            className={cls}
            style={style}
            data-node={id}
          >
            {body}
          </a>
        ) : (
          <div key={id} className={cls} style={style} data-node={id}>
            {body}
          </div>
        );
      })}
      <Loops ctx={ctx} pos={pos} dx={62} dy={layout.nodeH / 2} />
    </div>
  );
}

/** 고른 해법 가운데 이 지점에서 시작하거나, 이 지점으로 들어오는 걸음을 마친 해법이 있나 */
function nodeLit(id: MapNodeId, ctx: MapCtx): boolean {
  return ctx.selected.some((m) => {
    const nodes = methodNodes(m);
    const i = nodes.indexOf(id);
    if (i < 0) return false;
    if (i === 0) return cellLit(true, "none");
    const e = edgeById(m.edges[i - 1] as string) as MapEdge;
    return cellLit(false, edgeProgress(e, m, ctx.progress, ctx.courseOf));
  });
}

/**
 * 패리티 고리 둘: 지점 곁으로 빠졌다 돌아오는 점선 고리와 고리 칸. 큰 큐브 지도에서는 「3×3 맞추기」 칸이 닿는 다
 * 맞음 곁(위쪽), 3×3 지도 「4×4에서 옴」에서는 그 해법의 패리티 자리 곁
 */
function Loops({
  ctx,
  pos,
  dx,
  dy,
}: {
  ctx: MapCtx;
  pos: Map<MapNodeId, Pt>;
  dx: number;
  dy: number;
}) {
  const ds = detours(ctx.size, ctx.from, ctx.selected);
  // 펼쳤으면 고리는 펼친 칸 안에 그 해법의 자리로 들어간다
  if (!ds.length || (ctx.fin && ctx.size !== 3)) return null;
  const big = ctx.size !== 3;
  // 큰 큐브: 다른 노선과 겹치지 않게 모든 노선 오른쪽, 다 맞음 높이에 위아래로 둘
  const right = Math.max(...[...pos.values()].map((q) => q.x));
  const items = ds.flatMap((d) => {
    const p = pos.get(d.at);
    if (!p) return [];
    const i = ds.filter((x) => x.at === d.at).indexOf(d);
    // 3×3: 그 지점 오른쪽에
    const at = big
      ? { x: right + dx, y: p.y - 90 + i * 58 }
      : { x: p.x + dx + 6, y: p.y + dy - 24 + i * 58 };
    return [{ d, p, at }];
  });
  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={1}
        height={1}
        aria-hidden
      >
        {items.map(({ d, p, at }) => {
          const sx = p.x + 20;
          const sy = big ? p.y - 30 : p.y + dy;
          return (
            <path
              key={`${d.at}-${d.loop.kind}`}
              d={`M${sx},${sy - 10} C${sx + 30},${sy - 10} ${at.x - 20},${at.y} ${at.x},${at.y + 12} M${at.x},${at.y + 30} C${at.x - 20},${at.y + 40} ${sx + 30},${sy + 10} ${sx},${sy + 10}`}
              fill="none"
              stroke={LOOP_COLOR}
              strokeOpacity={0.7}
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          );
        })}
      </svg>
      {items.map(({ d, at }) => (
        <span
          key={`${d.at}-${d.loop.kind}`}
          className="absolute"
          style={{ left: at.x, top: at.y, zIndex: 4 }}
        >
          <LoopChip d={d} ctx={ctx} />
        </span>
      ))}
    </>
  );
}

// ── 줌·패닝·미니맵 틀 ────────────────────────────────────

interface View {
  x: number;
  y: number;
  k: number;
}
const MIN_K = 0.12;
/** 처음 배율의 하한: 칸 이름(11px 글씨)이 화면에서 11px 이상(2026-11-26 HQ 검토) */
export const READABLE_K = 1;
const MAX_K = 2.5;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** 미니맵 위 지금 보는 영역(미니맵 밖으로 나간 부분은 잘라 낸다) */
function miniRect(
  view: View,
  size: { w: number; h: number },
  ms: number,
  w: number,
  h: number,
) {
  const x0 = Math.max(0, (-view.x / view.k) * ms);
  const y0 = Math.max(0, (-view.y / view.k) * ms);
  const x1 = Math.min(w, ((size.w - view.x) / view.k) * ms);
  const y1 = Math.min(h, ((size.h - view.y) / view.k) * ms);
  return {
    left: x0,
    top: y0,
    width: Math.max(4, x1 - x0),
    height: Math.max(4, y1 - y0),
  };
}

/** 손가락 둘의 가운데와 거리(둘이 아니면 null) */
function pinch(ps: Pt[]): { mid: Pt; dist: number } | null {
  const [p, q] = ps;
  if (!p || !q) return null;
  return {
    mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
    dist: Math.hypot(p.x - q.x, p.y - q.y),
  };
}

function MapFrame({
  width,
  height,
  fit,
  fitKey,
  mini,
  children,
}: {
  width: number;
  height: number;
  /** 해법을 고르면 맞출 영역 */
  fit: { x: number; y: number; w: number; h: number } | null;
  fitKey: string;
  mini: ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, rawSetView] = useState<View>({ x: 0, y: 0, k: 1 });
  // 지도 끝을 넘어 패닝하지 않게 모든 보기 바꾸기를 지도 범위 안으로 묶는다
  const bounds = useRef({ w: 0, h: 0, width, height });
  bounds.current = { w: size.w, h: size.h, width, height };
  const setView = useCallback(
    (u: View | ((v: View) => View)) =>
      rawSetView((prev) =>
        clampView(typeof u === "function" ? u(prev) : u, bounds.current),
      ),
    [],
  );
  const home = useRef<View | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{
    start: View;
    a: Pt;
    dist: number;
    moved: number;
  } | null>(null);
  const suppress = useRef(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight }),
    );
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const centerOn = useCallback(
    (p: Pt, k: number): View => ({
      k,
      x: size.w / 2 - p.x * k,
      y: size.h / 2 - p.y * k,
    }),
    [size],
  );

  /** 영역을 배율 k로: 화면에 들어가면 가운데, 넘치면 그 방향은 머리(왼쪽·위쪽)를 맞춘다 */
  const headOf = useCallback(
    (r: { x: number; y: number; w: number; h: number }, k: number): View => {
      const cx = r.w * k > size.w ? r.x + size.w / (2 * k) : r.x + r.w / 2;
      const cy = r.h * k > size.h ? r.y + size.h / (2 * k) : r.y + r.h / 2;
      return centerOn({ x: cx, y: cy }, k);
    },
    [size, centerOn],
  );

  // 처음과 「처음 자리로」: 지도 전체가 글자가 읽히는 배율(READABLE_K) 이상으로 한 화면에 들어오면 전체를, 아니면
  // 그 배율로 고른 해법 길의 머리(다 섞임, 왼쪽 위)에 맞춘다. 전체는 미니맵과 줌으로 본다(2026-11-26 HQ 검토: 휴대폰에서
  // 전체를 맞춰 넣으면 칸 이름이 점 크기). 틀 크기가 바뀌면(휴대폰 돌리기) 다시 잰다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 틀·지도 크기가 바뀔 때만 다시 잰다
  useEffect(() => {
    if (!size.w) return;
    const whole = Math.min(size.w / width, size.h / height, 1);
    const v = clampView(
      whole >= READABLE_K
        ? centerOn({ x: width / 2, y: height / 2 }, clampK(whole))
        : headOf(fit ?? { x: 0, y: 0, w: width, h: height }, READABLE_K),
      bounds.current,
    );
    const first = !home.current;
    home.current = v;
    if (first) setView(v);
  }, [size, width, height]);

  // 고른 해법이 바뀌면 그 길 전체를 맞춘다(처음 한 번은 건너뛴다)
  const firstFit = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 고른 해법(fitKey)이 바뀔 때만 맞춘다
  useEffect(() => {
    // 처음 그릴 때는 맞추지 않는다(틀 크기를 재기 전이어도 「처음」은 이때 한 번뿐)
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    if (!size.w || !fit) return;
    // 글자가 읽히는 배율 아래로는 줄이지 않는다
    const k = clampK(
      Math.max(READABLE_K, Math.min(size.w / fit.w, size.h / fit.h, 1.2)),
    );
    setView(headOf(fit, k));
  }, [fitKey]);

  // 휠·트랙패드: 가리킨 자리를 두고 줌(페이지 스크롤과 싸우지 않게 막는다)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      const f = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
      setView((v) => {
        const k = clampK(v.k * f);
        return {
          k,
          x: p.x - ((p.x - v.x) / v.k) * k,
          y: p.y - ((p.y - v.y) / v.k) * k,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const local = (ev: ReactPointerEvent): Pt => {
    const r = (box.current as HTMLDivElement).getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const startGesture = () => {
    const ps = [...pointers.current.values()];
    if (!ps.length) {
      gesture.current = null;
      return;
    }
    const pair = pinch(ps);
    const a = pair ? pair.mid : (ps[0] as Pt);
    const dist = pair ? pair.dist : 0;
    gesture.current = {
      start: view,
      a,
      dist,
      moved: gesture.current?.moved ?? 0,
    };
  };
  const onDown = (ev: ReactPointerEvent) => {
    pointers.current.set(ev.pointerId, local(ev));
    if (pointers.current.size === 1) suppress.current = false;
    startGesture();
  };
  const onMove = (ev: ReactPointerEvent) => {
    if (!pointers.current.has(ev.pointerId)) return;
    pointers.current.set(ev.pointerId, local(ev));
    const g = gesture.current;
    if (!g) return;
    const ps = [...pointers.current.values()];
    const pair = pinch(ps);
    if (pair) {
      const a = pair.mid;
      const d = pair.dist;
      const k = clampK(g.start.k * (d / (g.dist || d)));
      setView({
        k,
        x: a.x - ((g.a.x - g.start.x) / g.start.k) * k,
        y: a.y - ((g.a.y - g.start.y) / g.start.k) * k,
      });
      g.moved = 99;
    } else {
      const p = ps[0] as Pt;
      const dx = p.x - g.a.x;
      const dy = p.y - g.a.y;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      if (g.moved > 6) {
        if (!suppress.current) {
          suppress.current = true;
          // 끌기를 시작하면 누른 것에서 손을 떼어 링크가 눌리지 않게 한다
          (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
        }
        setView({ ...g.start, x: g.start.x + dx, y: g.start.y + dy });
      }
    }
  };
  const onUp = (ev: ReactPointerEvent) => {
    pointers.current.delete(ev.pointerId);
    startGesture();
    if (!pointers.current.size) gesture.current = null;
  };
  const zoomBy = (f: number) =>
    setView((v) => {
      const k = clampK(v.k * f);
      const c = { x: size.w / 2, y: size.h / 2 };
      return {
        k,
        x: c.x - ((c.x - v.x) / v.k) * k,
        y: c.y - ((c.y - v.y) / v.k) * k,
      };
    });

  // 미니맵
  // 휴대폰은 미니맵이 지도를 덜 가리게 작게
  // 세로로 긴 지도는 오른쪽 위 단추 셋(약 120px) 아래 공간에 맞게 높이를 묶고 폭도 같은 비율로 줄인다
  const maxMiniW = size.w < 600 ? 72 : 120;
  const maxMiniH = Math.max(60, size.h - 136);
  const ms = Math.min(maxMiniW / width, maxMiniH / height);
  const MINI_W = width * ms;
  const miniH = height * ms;
  const miniMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (ev.buttons === 0 && ev.type === "pointermove") return;
    const r = ev.currentTarget.getBoundingClientRect();
    const p = { x: (ev.clientX - r.left) / ms, y: (ev.clientY - r.top) / ms };
    setView((v) => centerOn(p, v.k));
  };

  return (
    <div
      ref={box}
      // 화면 전체를 쓰는 A·C: 부모(위 얇은 줄 아래 남은 화면)를 끝까지 채운다
      className="relative h-full min-h-0 w-full flex-1 touch-none select-none overflow-hidden bg-neutral-950"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClickCapture={(ev) => {
        if (suppress.current) {
          ev.preventDefault();
          ev.stopPropagation();
          suppress.current = false;
        }
      }}
      // 지도는 transform으로만 움직인다. 틀 밖에 걸친 링크로 포커스가 가면 브라우저가 틀을 스크롤해 보기가 어긋나니 되돌린다
      onScroll={(ev) => {
        ev.currentTarget.scrollTop = 0;
        ev.currentTarget.scrollLeft = 0;
      }}
      data-map-frame
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width,
          height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
        }}
        data-map-content
        data-map-zoom={view.k.toFixed(2)}
      >
        <ZoomK.Provider value={view.k}>{children}</ZoomK.Provider>
      </div>
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {[
          { t: "+", f: () => zoomBy(1.25) },
          { t: "−", f: () => zoomBy(0.8) },
          { t: "⌂", f: () => home.current && setView(home.current) },
        ].map((b) => (
          <button
            key={b.t}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={b.f}
            className="h-8 w-8 rounded-md border border-white/20 bg-neutral-800/90 text-lg leading-none"
            aria-label={
              b.t === "+" ? "크게" : b.t === "−" ? "작게" : "처음 자리로"
            }
          >
            {b.t}
          </button>
        ))}
      </div>
      <div
        className="absolute right-2 bottom-2 overflow-hidden rounded-md border border-white/20 bg-neutral-900/90"
        style={{ width: MINI_W, height: miniH }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          miniMove(e);
        }}
        onPointerMove={miniMove}
        data-map-mini
      >
        <div
          className="origin-top-left"
          style={{ transform: `scale(${ms})`, width, height }}
        >
          {mini}
        </div>
        <div
          className="absolute border-2 border-white"
          style={miniRect(view, size, ms, MINI_W, miniH)}
          data-map-mini-view
        />
      </div>
    </div>
  );
}
