"use client";

// 해법 지도 시안의 네 안(SolveMapApp). A 펼친 지도와 C 노선도는 같은 자리 자료를 다르게 그리고, 줌·패닝·미니맵 틀
// (MapFrame) 안에 둔다. B는 갈림길만 두고 구간을 누르면 걸음이 펼쳐진다. D는 해법마다 막대 하나.
import {
  type MouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
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
  measuredStep,
  methodNodes,
  newFormulas,
  nodeById,
  nodeMask,
  nodeSize,
  nodeState,
  PARITY_AT,
  PARITY_LOOPS,
} from "../learn/solve-map";
import {
  type EdgeSolo,
  edgeLearn,
  edgeTrain,
  myRoute,
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
  formulaText,
  METHOD_COLOR,
  methodsOfEdge,
  methodTotals,
  nodeHref,
  parityMeasure,
  rowRange,
  type Segment,
  seconds,
  segmentFormulas,
  segments,
  segmentTurns,
  visibleEdges,
  visibleNodes,
} from "./solve-map-model";

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
          const done = edgeLearn(e, ctx.progress) === "done";
          const f = edgeFormulaLabel(e, [fin]);
          const here = loops.filter(
            (l) => at && (l.kind === "oll" ? at.oll : at.pll) === e.to,
          );
          const body = (
            <>
              <NodeCube id={e.to} settings={ctx.settings} px={40} as={n} />
              <span className="flex min-w-0 flex-col text-[11px] leading-tight">
                <span className="font-medium text-white">
                  {done ? "✓ " : ""}
                  {e.title}
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
  /** 「나」가 있는 지점 → 그 해법들. 기록이 없으면 그 크기의 「다 섞임」 */
  me: Map<MapNodeId, MapMethod[]>;
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

/** 「나」 표시(해법마다 색 점) */
export function MeBadge({ methods }: { methods: MapMethod[] }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-px font-bold text-[11px] text-neutral-900"
      data-me
    >
      나
      {methods.map((m) => (
        <span
          key={m.id}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: METHOD_COLOR[m.id] }}
        />
      ))}
    </span>
  );
}

// ── 지점 그림 ─────────────────────────────────────────

export function NodeCube({
  id,
  settings,
  px,
  as,
}: {
  id: MapNodeId;
  settings: CubeSettings;
  px: number;
  /** 3×3 지점을 이 크기 큐브로 그린다(큰 큐브 「3×3 맞추기」를 펼친 칸) */
  as?: CubeSize;
}) {
  const n = as && as !== 3 && nodeSize(id) === 3 ? as : nodeSize(id);
  const state = useMemo(() => nodeState(id, as), [id, as]);
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
  const learn = edgeLearn(e, ctx.progress);
  const train = full ? edgeTrain(e, ctx.train) : null;
  const solo = full ? edgeSolo(e, ctx) : undefined;
  return (
    <>
      <span className="whitespace-nowrap">
        {learn === "done" && <span className="text-emerald-300">✓ </span>}
        {[f, turns !== undefined ? `${turns}수` : null]
          .filter(Boolean)
          .join(" · ")}
        {!e.lessons.length && (
          <span className="text-white/40">
            {f || turns ? " · " : ""}단원 없음
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
}

function useLayout(ctx: MapCtx, style: "map" | "metro"): Layout {
  return useMemo(() => {
    const nodes = visibleNodes(ctx.methods);
    const { min, max } = rowRange(nodes);
    const CW = style === "map" ? 118 : 112;
    const RH = style === "map" ? 158 : 118;
    const PAD = 24;
    const nodeH = style === "map" ? 92 : 0;
    // 지도는 「다 섞임」에서 시작한다(노선도는 역 이름표·노선 이름이 위로 조금 나온다)
    const TOP = PAD + (style === "map" ? 16 : 40);
    const cols = [...nodes].map((id) => nodeById(id).col);
    const maxCol = Math.max(...cols);
    const pos = new Map<MapNodeId, { x: number; y: number }>();
    for (const id of nodes) {
      const n = nodeById(id);
      pos.set(id, {
        x: PAD + (n.col + 0.5) * CW,
        y: TOP + (n.row - min) * RH,
      });
    }
    return {
      width: PAD * 2 + (maxCol + 1) * CW + (style === "metro" ? 70 : 0),
      height: TOP + (max - min) * RH + nodeH + 30 + PAD,
      pos,
      nodeH,
    };
  }, [ctx.methods, style]);
}

type Pt = { x: number; y: number };
const mid = (a: Pt, b: Pt, c: Pt, d: Pt): Pt => ({
  x: (a.x + 3 * b.x + 3 * c.x + d.x) / 8,
  y: (a.y + 3 * b.y + 3 * c.y + d.y) / 8,
});

/** 글 폭 어림(10px 글씨: 한글 10px, 그 밖 6px) */
const textW = (s: string) =>
  [...s].reduce((w, c) => w + (/[가-힣]/.test(c) ? 10 : 6), 0);

/** 꼬리표 크기 어림(가운데 기준 상자의 폭·높이) */
function labelSize(e: MapEdge, ctx: MapCtx, on: boolean) {
  const f = edgeFormulaLabel(e, ctx.selected) ?? "";
  const turns = on ? edgeTurns(e, ctx.selected) : undefined;
  const lines = [
    `✓ ${f} · ${turns ?? ""}수${e.lessons.length ? "" : " · 단원 없음"}`,
  ];
  if (on) {
    lines.push(e.title);
    if (edgeTrain(e, ctx.train)) lines.push("익숙 0/0 · 0.0초");
    if (edgeSolo(e, ctx)) lines.push("내 00.0초");
  }
  return {
    w: Math.max(...lines.map(textW)) + 14,
    h: lines.length * 13 + 6,
  };
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * 꼬리표 자리 고르기: 지점 상자와 다른 꼬리표에 겹치면 덜 겹친 쪽(가로·세로)으로 민다. 지점 상자는 움직이지 않는다
 */
function placeLabels(items: Box[], fixed: Box[]): Pt[] {
  const ps = items.map((b) => ({ ...b }));
  const push = (a: Box, b: Box, share: number) => {
    const ox = (a.w + b.w) / 2 + 8 - Math.abs(a.x - b.x);
    const oy = (a.h + b.h) / 2 + 6 - Math.abs(a.y - b.y);
    if (ox <= 0 || oy <= 0) return;
    if (ox < oy) a.x += (a.x >= b.x ? 1 : -1) * ox * share;
    else a.y += (a.y >= b.y ? 1 : -1) * oy * share;
  };
  for (let round = 0; round < 80; round++) {
    for (const [i, a] of ps.entries()) {
      for (const f of fixed) push(a, f, 1);
      for (const [j, b] of ps.entries()) if (i !== j) push(a, b, 0.5);
    }
  }
  return ps.map(({ x, y }) => ({ x, y }));
}

/** 같은 두 지점을 잇는 길이 여럿이면 옆으로 벌린다 */
function parallelOffset(e: MapEdge, edges: MapEdge[]): number {
  const same = edges.filter((x) => x.from === e.from && x.to === e.to);
  const i = same.indexOf(e);
  return (i - (same.length - 1) / 2) * 34;
}

// ── A·C ─────────────────────────────────────────────

export function MapView({
  ctx,
  style,
}: {
  ctx: MapCtx;
  style: "map" | "metro";
}) {
  const layout = useLayout(ctx, style);
  const edges = visibleEdges(ctx.methods);
  const selectedEdges = new Set(ctx.selected.flatMap((m) => m.edges));
  const selectedNodes = new Set(ctx.selected.flatMap(methodNodes));
  // 처음 가운데 둘 곳: 「나」가 있는 지점(기록이 없으면 「다 섞임」). 지도 범위로 묶여 맨 위·왼쪽 끝이 보인다
  const meNode =
    [...ctx.me.keys()].find((k) => layout.pos.has(k)) ??
    (methodNodes(ctx.selected[0] ?? (ctx.methods[0] as MapMethod))[0] as
      | MapNodeId
      | undefined);
  const focus = (meNode && layout.pos.get(meNode)) || { x: 0, y: 0 };
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
      focus={{ x: focus.x, y: focus.y + layout.nodeH / 2 }}
      fit={fit}
      fitKey={fitKey}
      mini={mini}
    >
      {style === "map" ? (
        <MapLayer
          ctx={ctx}
          layout={layout}
          edges={edges}
          selectedEdges={selectedEdges}
          selectedNodes={selectedNodes}
        />
      ) : (
        <MetroLayer
          ctx={ctx}
          layout={layout}
          edges={edges}
          selectedNodes={selectedNodes}
        />
      )}
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
    const dx = parallelOffset(e, edges);
    const p0 = { x: a.x, y: a.y + nodeH };
    const p3 = { x: b.x, y: b.y };
    const dy = Math.max(40, (p3.y - p0.y) * 0.45);
    const p1 = { x: a.x + dx, y: p0.y + dy };
    const p2 = { x: b.x + dx, y: p3.y - dy };
    return [{ e, p0, p1, p2, p3, label: mid(p0, p1, p2, p3) }];
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
      w: 104,
      h: nodeH + 4,
    })),
  );
  const geo = geo0.map((g, i) => ({ ...g, label: placed[i] as Pt }));
  const path = (g: (typeof geo)[number], off: number) =>
    `M${g.p0.x + off},${g.p0.y} C${g.p1.x + off},${g.p1.y} ${g.p2.x + off},${g.p2.y} ${g.p3.x + off},${g.p3.y}`;
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
          return ms.map((m, j) => (
            <path
              key={`${g.e.id}-${m.id}`}
              d={path(g, (j - (ms.length - 1) / 2) * 5)}
              fill="none"
              stroke={METHOD_COLOR[m.id]}
              strokeWidth={3.5}
              strokeDasharray={dash}
              strokeLinecap="round"
              data-edge-line={g.e.id}
            />
          ));
        })}
      </svg>
      {geo.map((g) => {
        const on = selectedEdges.has(g.e.id);
        // 흐린 길에 적을 값이 없으면(셀 자료 없음·단원 있음) 꼬리표를 두지 않는다
        if (
          !on &&
          !edgeFormulaLabel(g.e, ctx.selected) &&
          g.e.lessons.length &&
          edgeLearn(g.e, ctx.progress) !== "done"
        )
          return null;
        const m = ctx.selected.find((x) => x.edges.includes(g.e.id));
        const href = hrefOf(g.e, m, ctx);
        const body = (
          <>
            {on && <span className="font-medium text-white">{g.e.title}</span>}
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
        const me = ctx.me.get(id);
        const body = (
          <>
            <NodeCube id={id} settings={ctx.settings} px={60} />
            <span className="mt-0.5 text-center text-[11px] leading-tight">
              {nodeById(id).title}
            </span>
            {me && (
              <span className="-top-2 -right-2 absolute">
                <MeBadge methods={me} />
              </span>
            )}
          </>
        );
        const cls = cn(
          "-translate-x-1/2 absolute flex w-[100px] flex-col items-center rounded-lg px-1 py-1",
          on ? "bg-neutral-800" : "opacity-35",
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

function MetroLayer({
  ctx,
  layout,
  edges,
  selectedNodes,
}: {
  ctx: MapCtx;
  layout: Layout;
  edges: MapEdge[];
  selectedNodes: Set<MapNodeId>;
}) {
  const { pos } = layout;
  const lineOff = (m: MapMethod) => {
    const i = ctx.methods.indexOf(m);
    return (i - (ctx.methods.length - 1) / 2) * 4.5;
  };
  const seg = (a: Pt, b: Pt, off: number, dx: number) => {
    const dy = b.y - a.y;
    const y1 = a.y + dy * 0.3;
    const y2 = b.y - dy * 0.3;
    return `M${a.x + off},${a.y} L${a.x + off + dx * 0.3},${y1} L${b.x + off + dx * 0.3},${y2} L${b.x + off},${b.y}`;
  };
  const isSel = (m: MapMethod) => ctx.selected.includes(m);
  // 고른 노선의 역 사이 꼬리표(여러 노선이 함께 지나는 길은 첫 노선만). 역 이름과 서로를 가리지 않게 민다
  const raw = ctx.selected.flatMap((m) =>
    m.edges.flatMap((id) => {
      const e = edgeById(id) as MapEdge;
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b || methodsOfEdge(id, ctx.selected)[0] !== m) return [];
      const dx = parallelOffset(e, edges) * 0.3;
      return [
        { m, e, at: { x: (a.x + b.x) / 2 + dx + 50, y: (a.y + b.y) / 2 } },
      ];
    }),
  );
  // 고른 노선의 이름: 처음 길과 마지막 길 곁(지하철 노선도처럼 처음과 끝)
  const names = ctx.selected.flatMap((m) => {
    const ends = [m.edges[0], m.edges.at(-1)].map(
      (id) => edgeById(id as string) as MapEdge,
    );
    return ends.flatMap((e, k) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) return [];
      const t = k === 0 ? 0.3 : 0.7;
      return [
        {
          m,
          key: `${m.id}-${k ? "end" : "start"}`,
          at: { x: a.x + (b.x - a.x) * t - 40, y: a.y + (b.y - a.y) * t },
        },
      ];
    });
  });
  const spots = placeLabels(
    [
      ...raw.map((r) => ({ ...r.at, ...labelSize(r.e, ctx, true) })),
      ...names.map((n) => ({ ...n.at, w: textW(n.m.title) + 16, h: 18 })),
    ],
    [...pos].map(([id, p]) => {
      const w = 64 + textW(nodeById(id).title) + 30;
      return { x: p.x - 10 + w / 2, y: p.y, w, h: 40 };
    }),
  );
  const labels = raw.map((r, i) => ({ ...r, at: spots[i] as Pt }));
  const nameSpots = names.map((n, i) => ({
    ...n,
    at: spots[raw.length + i] as Pt,
  }));
  // 내 경로: 끝낸 길을 따라 노선을 이어 탄 한 줄. 노선이 바뀌는 역이 환승역
  const route = myRoute(ctx.methods, ctx.progress);
  const transfers = new Set(
    route
      .filter((l, i) => i > 0 && route[i - 1]?.method !== l.method)
      .map((l) => l.edge.from),
  );
  // 선은 고른 해법을 위에 그린다
  const order = [...ctx.methods].sort(
    (a, b) => Number(isSel(a)) - Number(isSel(b)),
  );
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
        {/* 내 경로(노선 아래 흰 띠) */}
        {route.map(({ edge: e, method: m }) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          return (
            <path
              key={`route-${e.id}`}
              d={seg(a, b, lineOff(m), parallelOffset(e, edges))}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.35}
              strokeWidth={13}
              strokeLinejoin="round"
              strokeLinecap="round"
              data-route-leg={`${m.id}:${e.id}`}
            />
          );
        })}
        {order.map((m) =>
          m.edges.map((id) => {
            const e = edgeById(id) as MapEdge;
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            return (
              <path
                key={`${m.id}-${id}`}
                d={seg(a, b, lineOff(m), parallelOffset(e, edges))}
                fill="none"
                stroke={METHOD_COLOR[m.id]}
                strokeOpacity={isSel(m) ? 1 : 0.18}
                strokeWidth={isSel(m) ? 4 : 3}
                strokeLinejoin="round"
                strokeDasharray={e.lessons.length ? undefined : "5 4"}
              />
            );
          }),
        )}
      </svg>
      {nameSpots.map(({ m, key, at }) => (
        <span
          key={key}
          className="-translate-x-1/2 -translate-y-1/2 absolute whitespace-nowrap rounded-full px-2 font-semibold text-[11px] text-neutral-950 leading-[18px]"
          style={{
            left: at.x,
            top: at.y,
            background: METHOD_COLOR[m.id],
            zIndex: 3,
          }}
          data-line-name={key}
        >
          {m.title}
        </span>
      ))}
      {/* 고른 노선의 역 사이 공식 수 */}
      {labels.map(({ m, e, at }) => {
        const id = e.id;
        const href = hrefOf(e, m, ctx);
        const cls =
          "-translate-x-1/2 -translate-y-1/2 absolute flex flex-col rounded bg-neutral-900/90 px-1 text-[10px] leading-tight text-white/80";
        const style = {
          left: at.x,
          top: at.y,
          borderLeft: `3px solid ${METHOD_COLOR[m.id]}`,
          zIndex: 3,
        };
        const body = <EdgeLines key="lines" e={e} ctx={ctx} full />;
        return href ? (
          <a
            key={`${m.id}-${id}`}
            href={href}
            onClick={toggleClick(e.jump, ctx)}
            aria-expanded={e.jump ? !!ctx.fin : undefined}
            className={cls}
            style={style}
            data-edge={id}
          >
            {body}
          </a>
        ) : (
          <span
            key={`${m.id}-${id}`}
            className={cls}
            style={style}
            data-edge={id}
            aria-disabled
          >
            {body}
          </span>
        );
      })}
      {[...pos].map(([id, p]) => {
        const lines = ctx.methods.filter((m) => methodNodes(m).includes(id));
        const big = lines.length > 1;
        const on = selectedNodes.has(id);
        const me = ctx.me.get(id);
        const href = nodeHrefOf(id, ctx);
        const transfer = transfers.has(id);
        const body = (
          <>
            {/* 환승역(여러 노선이 지나는 같은 모양): 크고 테두리 있는 둥근 역, 곁에 갈아탈 노선 색 점 */}
            <span className="relative shrink-0">
              <span
                className={cn(
                  "block rounded-full",
                  big
                    ? "h-6 w-6 border-[4px] border-white bg-neutral-900"
                    : "h-3 w-3 border-2 border-neutral-900",
                )}
                style={
                  big
                    ? undefined
                    : { background: METHOD_COLOR[lines[0]?.id ?? "beginner"] }
                }
                data-station={big ? "transfer" : "stop"}
              />
              {transfer && (
                <span
                  className="-inset-1.5 absolute rounded-full border-2 border-white border-dashed"
                  data-route-transfer
                />
              )}
            </span>
            {big && (
              <span
                className="flex max-w-[44px] flex-wrap gap-0.5"
                data-station-lines
              >
                {lines.map((m) => (
                  <span
                    key={m.id}
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: METHOD_COLOR[m.id],
                      opacity: isSel(m) ? 1 : 0.35,
                    }}
                  />
                ))}
              </span>
            )}
            <NodeCube id={id} settings={ctx.settings} px={38} />
            <span className="text-[11px] leading-tight">
              {nodeById(id).title}
            </span>
            {me && <MeBadge methods={me} />}
          </>
        );
        const cls = cn(
          "-translate-y-1/2 absolute flex items-center gap-1 whitespace-nowrap",
          !on && "opacity-40",
        );
        const style = { left: p.x - (big ? 12 : 6), top: p.y, zIndex: 2 };
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
      <Loops ctx={ctx} pos={pos} dx={150} dy={0} />
    </div>
  );
}

// ── 줌·패닝·미니맵 틀 ────────────────────────────────────

interface View {
  x: number;
  y: number;
  k: number;
}
const MIN_K = 0.3;
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
  focus,
  fit,
  fitKey,
  mini,
  children,
}: {
  width: number;
  height: number;
  /** 처음 가운데 둘 점 */
  focus: Pt;
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

  // 처음: 「나」가 보이는 범위에서 지도 왼쪽 끝을 틀 왼쪽에(「나」를 가운데에 두되 지도 밖 빈칸은 보이지 않게).
  // 휴대폰은 조금 줄여서
  useEffect(() => {
    if (!size.w || home.current) return;
    const k = size.w < 600 ? 0.75 : 1;
    const v = clampView(centerOn(focus, k), bounds.current);
    home.current = v;
    setView(v);
  }, [size, focus, centerOn, setView]);

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
    const k = clampK(Math.min(size.w / fit.w, size.h / fit.h, 1.2));
    // 영역이 화면보다 길면 머리(위쪽)를 맞춘다
    const cy =
      fit.h * k > size.h ? fit.y + size.h / (2 * k) : fit.y + fit.h / 2;
    setView(centerOn({ x: fit.x + fit.w / 2, y: cy }, k));
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
      className="relative h-[72dvh] min-h-[420px] w-full touch-none select-none overflow-hidden rounded-xl border border-white/10 bg-neutral-950"
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
        {children}
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

// ── B: 갈림길 ────────────────────────────────────────────

export function HubView({ ctx }: { ctx: MapCtx }) {
  const segs = segments(ctx.methods);
  const hubs = [...new Set(segs.flatMap((s) => [s.from, s.to]))].sort(
    (a, b) =>
      nodeById(a).row - nodeById(b).row || nodeById(a).col - nodeById(b).col,
  );
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="flex flex-col gap-2" data-map-hubs>
      {hubs.map((h) => {
        const out = segs.filter((s) => s.from === h);
        const me = ctx.me.get(h);
        const on = ctx.selected.some((m) => methodNodes(m).includes(h));
        return (
          <li key={h} className="flex flex-col gap-2" data-hub={h}>
            <div
              className={cn(
                "flex items-center gap-2 self-start rounded-lg bg-neutral-800 px-2 py-1",
                !on && "opacity-40",
              )}
            >
              <NodeCube id={h} settings={ctx.settings} px={52} />
              <span className="font-semibold">{nodeById(h).title}</span>
              {me && <MeBadge methods={me} />}
            </div>
            {out.length > 0 && (
              <div className="ml-6 flex flex-wrap gap-2 border-white/15 border-l-2 pl-3">
                {out.map((s) => (
                  <SegmentCard
                    key={s.key}
                    seg={s}
                    ctx={ctx}
                    open={open === s.key}
                    onToggle={() => setOpen(open === s.key ? null : s.key)}
                  />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SegmentCard({
  seg,
  ctx,
  open,
  onToggle,
}: {
  seg: Segment;
  ctx: MapCtx;
  open: boolean;
  onToggle: () => void;
}) {
  const on = seg.methods.some((m) => ctx.selected.includes(m));
  const f = segmentFormulas(seg, ctx.selected);
  const turns = segmentTurns(seg, ctx.selected);
  const done = seg.edges.every(
    (id) => edgeLearn(edgeById(id) as MapEdge, ctx.progress) === "done",
  );
  const m = ctx.selected.find((x) => seg.methods.includes(x)) ?? seg.methods[0];
  return (
    <div
      className={cn(
        "flex min-w-[200px] max-w-full flex-col rounded-lg border bg-neutral-800/60",
        on ? "border-white/30" : "border-white/10 opacity-45",
      )}
      data-segment={seg.key}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex flex-col items-start gap-1 px-2.5 py-1.5 text-left"
      >
        <span className="flex flex-wrap items-center gap-1">
          {seg.methods.map((x) => (
            <span
              key={x.id}
              className="inline-flex items-center gap-1 rounded-full px-1.5 text-[11px]"
              style={{
                background: `${METHOD_COLOR[x.id]}33`,
                color: METHOD_COLOR[x.id],
              }}
            >
              {x.title}
            </span>
          ))}
        </span>
        <span className="text-sm">
          {done && <span className="text-emerald-300">✓ </span>}→{" "}
          {nodeById(seg.to).title}
        </span>
        <span className="whitespace-nowrap text-white/60 text-xs">
          {[
            `걸음 ${seg.edges.length}`,
            formulaText(f),
            turns !== undefined ? `${turns}수` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {open && (
        <ol
          className="flex flex-col gap-1 border-white/10 border-t px-2 py-2"
          data-segment-steps
        >
          {seg.edges.map((id) => {
            const e = edgeById(id) as MapEdge;
            const href = hrefOf(e, m, ctx);
            const me = ctx.me.get(e.to);
            const body = (
              <>
                <NodeCube id={e.to} settings={ctx.settings} px={44} />
                <span className="flex flex-col text-[11px] leading-tight">
                  <span className="font-medium text-sm">
                    {e.title} → {nodeById(e.to).title}
                  </span>
                  <EdgeLines e={e} ctx={ctx} full />
                </span>
                {me && <MeBadge methods={me} />}
              </>
            );
            return (
              <li key={id}>
                {href ? (
                  <a
                    href={href}
                    className="flex items-center gap-2 rounded px-1 hover:bg-white/5"
                    data-edge={id}
                  >
                    {body}
                  </a>
                ) : (
                  <div
                    className="flex items-center gap-2 px-1 opacity-70"
                    data-edge={id}
                    aria-disabled
                  >
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ── D: 막대 ─────────────────────────────────────────────

/** 막대 칸 하나: 걸음 하나, 또는 잰 값이 둘을 합친 걸음들(루 CMLL 방향·자리는 컴퓨터 해법이 한 번에 푼다) */
interface BarCell {
  key: string;
  edges: MapEdge[];
  title: string;
  turns: number | undefined;
}

function barCells(m: MapMethod): BarCell[] {
  const out: BarCell[] = [];
  for (const id of m.edges) {
    const e = edgeById(id) as MapEdge;
    if (m.id === "roux" && id === "roux-cp") continue;
    if (m.id === "roux" && id === "roux-co")
      out.push({
        key: "cmll",
        edges: [e, edgeById("roux-cp") as MapEdge],
        title: "CMLL",
        turns: measuredStep(m.id, "cmll"),
      });
    else
      out.push({
        key: id,
        edges: [e],
        title: e.title,
        turns: measuredStep(m.id, id),
      });
  }
  return out;
}

/** 한 수의 막대 길이(px). 모든 막대가 같은 눈금이라 길이를 바로 견준다 */
const PX_PER_TURN = 8;
const MIN_CELL = 44;
const UNMEASURED_CELL = 64;

/** 가장 긴 막대 너비 상한(3×3 초보자 127수 × 8px 쯤) */
const MAX_BAR = 1016;
/** 패리티 칸 너비 */
const LOOP_CELL = 132;

export function BarsView({ ctx }: { ctx: MapCtx }) {
  const [open, setOpen] = useState<string | null>(null);
  // 한 화면의 막대는 같은 눈금. 큰 큐브처럼 수가 많으면 가장 긴 막대가 상한에 들도록 줄인다(패리티 칸 몫은 먼저 뺀다)
  const longest = Math.max(
    1,
    ...ctx.selected.map((m) => methodTotals(m).turns ?? 0),
  );
  const loopRoom =
    detours(ctx.size, ctx.from, ctx.selected.slice(0, 1)).length * LOOP_CELL;
  const pxPerTurn = Math.min(PX_PER_TURN, (MAX_BAR - loopRoom) / longest);
  return (
    <div className="overflow-x-auto" data-map-bars>
      <div className="flex w-max min-w-full flex-col gap-4 pb-1">
        {ctx.selected.map((m) => {
          const t = methodTotals(m);
          const cells = barCells(m);
          // 잰 값이 모든 칸에 있어야 너비를 수에 맞춘다(없으면 같은 너비)
          const measured = cells.every((c) => c.turns !== undefined);
          const solo = ctx.solo.get(m.id);
          const openCell = cells.find((c) => open === `${m.id}:${c.key}`);
          return (
            <section key={m.id} className="flex flex-col gap-1" data-bar={m.id}>
              <div className="flex items-baseline gap-3">
                <h3
                  className="font-semibold"
                  style={{ color: METHOD_COLOR[m.id] }}
                >
                  {m.title}
                </h3>
                <span
                  className="whitespace-nowrap text-sm text-white/80"
                  data-bar-total
                >
                  {[
                    t.formulas !== null ? `공식 ${t.formulas}` : null,
                    t.turns !== undefined ? `${t.turns}수` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div
                className="flex gap-px overflow-hidden rounded-md self-start"
                data-bar-measured={measured ? "" : undefined}
              >
                {cells.map((c, i) => {
                  const k = `${m.id}:${c.key}`;
                  const learn = c.edges.every(
                    (e) => edgeLearn(e, ctx.progress) === "done",
                  )
                    ? "done"
                    : "none";
                  const s = c.edges.length === 1 ? solo?.get(c.key) : undefined;
                  const nf = newFormulas(m);
                  const ks = c.edges.map((e) => nf.get(e.id));
                  const f =
                    c.edges.length === 1
                      ? edgeFormulaLabel(c.edges[0] as MapEdge, [m])
                      : ks.some((x) => x === null || x === undefined)
                        ? null
                        : formulaText(
                            ks.reduce(
                              (a, b) => (a as number) + (b as number),
                              0,
                            ) as number,
                          );
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-expanded={open === k}
                      onClick={() => setOpen(open === k ? null : k)}
                      className={cn(
                        "flex shrink-0 flex-col items-start justify-start gap-0.5 overflow-hidden px-1 py-1.5 text-left text-[10px] leading-tight",
                        open === k && "ring-2 ring-white ring-inset",
                      )}
                      style={{
                        width: measured
                          ? Math.max(MIN_CELL, (c.turns as number) * pxPerTurn)
                          : UNMEASURED_CELL,
                        background: `${METHOD_COLOR[m.id]}${learn === "done" ? "66" : i % 2 ? "26" : "3a"}`,
                        borderBottom: s?.skill
                          ? `3px solid ${s.skill === "weak" ? "#fdba74" : s.skill === "strong" ? "#6ee7b7" : "transparent"}`
                          : undefined,
                      }}
                      data-cell={c.key}
                    >
                      <span className="line-clamp-2 w-full break-keep font-medium text-white">
                        {learn === "done" ? "✓ " : ""}
                        {c.title}
                      </span>
                      {f && (
                        <span className="w-full break-keep text-white/70">
                          {f}
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* 큰 큐브: 3×3 맞추기 칸 뒤에 패리티 고리 두 칸(나올 때만 치는 걸음이라 점선) */}
                {cells.some((c) => c.key.endsWith(":333")) &&
                  detours(ctx.size, ctx.from, [m]).map((d) => (
                    <span
                      key={d.loop.kind}
                      className="flex shrink-0 flex-col items-start gap-0.5 rounded-sm border border-dashed px-1 py-1.5 text-[10px] leading-tight"
                      style={{
                        borderColor: LOOP_COLOR,
                        // 이름·작은 줄이 들어가게 넓게(짧은 걸음이라 눈금보다 넓다)
                        width: Math.max(
                          LOOP_CELL,
                          parityMeasure(d.loop.kind).turns * pxPerTurn,
                        ),
                      }}
                      data-cell={`loop:${d.loop.kind}`}
                    >
                      <span
                        className="font-medium"
                        style={{ color: LOOP_COLOR }}
                      >
                        {d.loop.name}
                      </span>
                      <span className="break-keep text-white/60">
                        {d.loop.sub}
                      </span>
                      <span className="text-white/70">
                        {`공식 ${d.loop.formulas.length} · ${parityMeasure(d.loop.kind).turns}수 · ${parityMeasure(d.loop.kind).rate}% 판에 나옴`}
                      </span>
                    </span>
                  ))}
              </div>
              {openCell?.edges.map((e) => (
                <BarDetail key={e.id} e={e} m={m} ctx={ctx} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BarDetail({ e, m, ctx }: { e: MapEdge; m: MapMethod; ctx: MapCtx }) {
  const href = hrefOf(e, m, ctx);
  return (
    <div
      className="flex items-center gap-3 rounded-lg bg-neutral-800 px-2 py-2"
      data-bar-detail={e.id}
    >
      <NodeCube id={e.to} settings={ctx.settings} px={64} />
      <div className="flex flex-col gap-0.5 text-xs">
        <span className="font-semibold text-sm">
          {e.title} → {nodeById(e.to).title}
        </span>
        <EdgeLines e={e} ctx={{ ...ctx, selected: [m] }} full />
        {href ? (
          <a
            href={href}
            className="mt-1 self-start rounded-md bg-white px-2 py-0.5 font-medium text-neutral-900"
          >
            배우기
          </a>
        ) : null}
      </div>
    </div>
  );
}
