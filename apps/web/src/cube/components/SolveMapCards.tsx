"use client";

// 해법 지도 시안 E안(해법 카드): 해법마다 카드 하나에 「다 섞임 → … → 다 맞음」 지점 그림 띠, 총 공식 수·잰 평균 수,
// 내 진행(✓·「나」·잘하는·약한 걸음 색). 세로로 늘어놓는 꼴(`?v=cards-v`)과 가로로 늘어놓는 꼴(`?v=cards-h`).
// 카드를 누르면 그 해법 화면(`&method=`)에서 세부 걸음을 모두 본다.
import { cn } from "@/lib/cn";
import {
  edgeById,
  type MapEdge,
  type MapMethod,
  methodNodes,
  nodeById,
} from "../learn/solve-map";
import { edgeLearn } from "../learn/solve-map-me";
import {
  EdgeLines,
  type MapCtx,
  MeBadge,
  NodeCube,
  StartMark,
} from "./SolveMapViews";
import { edgeHref, METHOD_COLOR, methodTotals } from "./solve-map-model";

const SKILL_RING = {
  strong: "#6ee7b7",
  weak: "#fdba74",
  even: "transparent",
} as const;

function Totals({ m }: { m: MapMethod }) {
  const t = methodTotals(m);
  const parts = [
    t.formulas !== null ? `공식 ${t.formulas}` : null,
    t.turns !== undefined ? `${t.turns}수` : null,
  ].filter(Boolean);
  return parts.length ? (
    <span className="whitespace-nowrap text-sm text-white/80" data-card-total>
      {parts.join(" · ")}
    </span>
  ) : null;
}

/**
 * 단계 사이 화살표(그림). 끝낸 걸음은 해법 색, 아직이면 흐리게(내 위치가 함께 읽힌다).
 * 큐브 그림보다 덜 띄게 가늘게 그린다
 */
function StepArrow({
  dir,
  color,
  done,
}: {
  dir: "right" | "down";
  color: string;
  done: boolean;
}) {
  const right = dir === "right";
  return (
    <svg
      aria-hidden
      width={right ? 14 : 12}
      height={right ? 12 : 14}
      viewBox={right ? "0 0 14 12" : "0 0 12 14"}
      className="shrink-0"
      data-step-arrow={done ? "done" : "todo"}
    >
      <path
        d={right ? "M1 6 H11 M7 2 L12 6 L7 10" : "M6 1 V11 M2 7 L6 12 L10 7"}
        fill="none"
        stroke={done ? color : "rgba(255,255,255,0.28)"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 지점으로 들어오는 길을 끝냈나(첫 지점은 null) */
function arrivedDone(m: MapMethod, i: number, ctx: MapCtx): boolean {
  if (!i) return false;
  const e = edgeById(m.edges[i - 1] as string) as MapEdge;
  return edgeLearn(e, ctx.progress) === "done";
}

/**
 * 지점 그림 띠. `column`: 위(다 섞임)에서 아래(다 맞음)로, 지점 이름을 곁에 둔다(카드를 가로로 늘어놓을 때,
 * 카드 방향과 맞추는 순서 방향을 엇갈리게). 그 밖은 왼쪽에서 오른쪽으로, 넘치면 옆으로 민다
 */
function Strip({
  m,
  ctx,
  column = false,
}: {
  m: MapMethod;
  ctx: MapCtx;
  column?: boolean;
}) {
  const nodes = methodNodes(m);
  const solo = ctx.solo.get(m.id);
  if (column) return <ColumnStrip m={m} ctx={ctx} />;
  return (
    <ol
      className="flex items-end gap-1 overflow-x-auto pb-1"
      data-card-strip="row"
    >
      {nodes.map((id, i) => {
        const e = i ? (edgeById(m.edges[i - 1] as string) as MapEdge) : null;
        const done = e ? edgeLearn(e, ctx.progress) === "done" : false;
        const skill = e ? solo?.get(e.id)?.skill : undefined;
        const me = ctx.me.get(id)?.includes(m);
        return [
          i > 0 && (
            <li key={`${id}-arrow`} aria-hidden className="self-center pb-3">
              <StepArrow dir="right" color={METHOD_COLOR[m.id]} done={done} />
            </li>
          ),
          <li
            key={id}
            className="relative flex shrink-0 flex-col items-center"
            data-strip-node={id}
          >
            {me && (
              <span className="-top-2 -right-1 absolute z-10">
                <MeBadge methods={[]} />
              </span>
            )}
            <div
              className="rounded-md border-2 p-0.5"
              style={{ borderColor: skill ? SKILL_RING[skill] : "transparent" }}
              data-strip-skill={skill ?? undefined}
            >
              <NodeCube id={id} settings={ctx.settings} px={40} />
            </div>
            <span className="h-3 text-[10px] text-emerald-300 leading-3">
              {done ? "✓" : ""}
            </span>
          </li>,
        ];
      })}
    </ol>
  );
}

/** 세로 띠: 지점마다 한 줄(그림 · 이름 · ✓), 지점 사이는 가는 세로 선 */
function ColumnStrip({ m, ctx }: { m: MapMethod; ctx: MapCtx }) {
  const nodes = methodNodes(m);
  const solo = ctx.solo.get(m.id);
  return (
    <ol className="flex flex-col" data-card-strip="column">
      {nodes.map((id, i) => {
        const e = i ? (edgeById(m.edges[i - 1] as string) as MapEdge) : null;
        const done = e ? edgeLearn(e, ctx.progress) === "done" : false;
        const skill = e ? solo?.get(e.id)?.skill : undefined;
        const me = ctx.me.get(id)?.includes(m);
        return (
          <li key={id} className="flex flex-col" data-strip-node={id}>
            {i > 0 && (
              <span aria-hidden className="ml-4 flex py-0.5">
                <StepArrow dir="down" color={METHOD_COLOR[m.id]} done={done} />
              </span>
            )}
            <span className="flex items-center gap-2">
              <span
                className="shrink-0 rounded-md border-2 p-0.5"
                style={{
                  borderColor: skill ? SKILL_RING[skill] : "transparent",
                }}
                data-strip-skill={skill ?? undefined}
              >
                <NodeCube id={id} settings={ctx.settings} px={36} />
              </span>
              <span className="min-w-0 break-keep text-sm leading-tight">
                {nodeById(id).title}
              </span>
              {done && <span className="text-emerald-300 text-xs">✓</span>}
              {me && <MeBadge methods={[]} />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function CardsView({
  ctx,
  dir,
  open,
  onOpen,
}: {
  ctx: MapCtx;
  dir: "v" | "h";
  open: MapMethod | null;
  onOpen: (m: MapMethod | null) => void;
}) {
  // 맨 위 출발 표시(큐브의 기초): 해법마다 다른 걸음이 아니라 카드 밖에 하나
  const start = (
    <span className="self-start">
      <StartMark ctx={ctx} />
    </span>
  );
  if (open)
    return (
      <>
        {start}
        <MethodScreen m={open} ctx={ctx} onBack={() => onOpen(null)} />
      </>
    );
  return (
    <>
      {start}
      <div
        className={cn(
          dir === "v"
            ? "flex flex-col gap-3"
            : "-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2",
        )}
        data-map-cards={dir}
      >
        {ctx.methods.map((m) => {
          const on = ctx.selected.includes(m);
          return (
            // 띠(목록)를 품으려고 단추 대신 링크로 둔다(주소는 해법 화면, 누르면 이 페이지 안에서 바꾼다)
            <a
              key={m.id}
              href={`?v=cards-${dir}&method=${m.id}`}
              onClick={(ev) => {
                ev.preventDefault();
                onOpen(m);
              }}
              className={cn(
                "flex flex-col gap-2 rounded-xl border bg-neutral-800/70 p-3 text-left",
                dir === "h" && "w-[300px] shrink-0 snap-start",
                on ? "" : "border-white/10",
              )}
              style={on ? { borderColor: METHOD_COLOR[m.id] } : undefined}
              data-card={m.id}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span
                  className="font-semibold text-lg"
                  style={{ color: METHOD_COLOR[m.id] }}
                >
                  {m.title}
                </span>
                <Totals m={m} />
              </span>
              <Strip m={m} ctx={ctx} column={dir === "h"} />
            </a>
          );
        })}
      </div>
    </>
  );
}

/** 해법 화면: 세부 걸음마다 지점 그림·공식 수·단원·내 기록 */
function MethodScreen({
  m,
  ctx,
  onBack,
}: {
  m: MapMethod;
  ctx: MapCtx;
  onBack: () => void;
}) {
  const one = { ...ctx, selected: [m] };
  return (
    <section className="flex flex-col gap-3" data-method-screen={m.id}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-white/20 px-2.5 py-1 text-sm"
        >
          ← 해법 카드
        </button>
        <h2
          className="font-semibold text-xl"
          style={{ color: METHOD_COLOR[m.id] }}
        >
          {m.title}
        </h2>
        <Totals m={m} />
      </div>
      <Strip m={m} ctx={ctx} />
      <ol className="flex flex-col">
        {m.edges.map((id, i) => {
          const e = edgeById(id) as MapEdge;
          const href = edgeHref(e, m, ctx.courseOf);
          const me = ctx.me.get(e.to)?.includes(m);
          const body = (
            <>
              <span className="w-5 shrink-0 text-right text-sm text-white/50">
                {i + 1}
              </span>
              <NodeCube id={e.to} settings={ctx.settings} px={56} />
              <span className="flex flex-col text-[11px] leading-tight">
                <span className="font-medium text-sm">
                  {e.title} → {nodeById(e.to).title}
                </span>
                <EdgeLines e={e} ctx={one} full />
              </span>
              {me && <MeBadge methods={[]} />}
            </>
          );
          return (
            <li key={id}>
              {i > 0 && (
                // 걸음 사이: 앞 걸음을 끝냈으면 해법 색
                <span aria-hidden className="flex py-0.5 pl-[58px]">
                  <StepArrow
                    dir="down"
                    color={METHOD_COLOR[m.id]}
                    done={arrivedDone(m, i, ctx)}
                  />
                </span>
              )}
              {href ? (
                <a
                  href={href}
                  className="flex items-center gap-2 rounded-lg bg-neutral-800/70 px-2 py-1.5 hover:bg-neutral-800"
                  data-edge={id}
                >
                  {body}
                </a>
              ) : (
                <div
                  className="flex items-center gap-2 rounded-lg bg-neutral-800/40 px-2 py-1.5 opacity-70"
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
    </section>
  );
}
