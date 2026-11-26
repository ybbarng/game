"use client";

// 해법 카드(해법 배우기 첫 모습, docs/47 16-30): 해법마다 카드 하나에 「다 섞임 → 큰 단계 … → 다 맞음」 그림 띠, 총 공식 수·잰
// 평균 수, 내 진행(✓·「나」·잘하는·약한 걸음 색). 앞 카드와 같은 단계(같은 모양에 닿는 단계)는 앞 카드 색 표시로 묶는다.
// 카드를 누르면 그 해법 화면(`?method=`)에서 세부 걸음을 모두 본다.
import type { ReactNode } from "react";

import { wa } from "@/lib/josa";
import {
  edgeById,
  type MapEdge,
  type MapMethod,
  type MapNodeId,
  methodNodes,
  methodStages,
  nodeById,
} from "../learn/solve-map";
import { type EdgeSkill, edgeLearn } from "../learn/solve-map-me";
import {
  EdgeLines,
  FinishPanel,
  hrefOf,
  LoopChip,
  type MapCtx,
  MeBadge,
  NodeCube,
  toggleClick,
} from "./SolveMapViews";
import { detours, METHOD_COLOR, methodTotals } from "./solve-map-model";

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

/** 이 지점 곁에 붙는 패리티 고리(큰 큐브: 다 맞음 곁, 3×3 「4×4에서 옴」: 그 해법의 패리티 자리) */
function loopsAt(m: MapMethod, id: MapNodeId, ctx: MapCtx) {
  // 큰 큐브에서 펼쳤으면 고리는 펼친 칸 안에
  if (ctx.fin && ctx.size !== 3) return [];
  return detours(ctx.size, ctx.from, [m]).filter((d) => d.at === id);
}

/** 이 해법 카드의 이 지점에 「나」를 둘까(기록이 없어 해법 없이 「다 섞임」에 둔 「나」는 모든 카드에) */
function meAt(ctx: MapCtx, id: MapNodeId, m: MapMethod): boolean {
  const at = ctx.me.get(id);
  return !!at && (at.length === 0 || at.includes(m));
}

/** 지점으로 들어오는 길을 끝냈나(첫 지점은 null) */
function arrivedDone(m: MapMethod, i: number, ctx: MapCtx): boolean {
  if (!i) return false;
  const e = edgeById(m.edges[i - 1] as string) as MapEdge;
  return edgeLearn(e, ctx.progress) === "done";
}

interface StripCell {
  /** 칸 그림 지점(다 섞임, 그다음은 큰 단계 끝) */
  id: MapNodeId;
  /** 이 단계의 세부 걸음을 모두 끝냈나(첫 칸은 false) */
  done: boolean;
  /** 잘하는·약한 걸음(단계가 걸음 하나일 때만, 혼자 맞추기 구간은 걸음마다라) */
  skill: EdgeSkill | null | undefined;
  /** 「나」: 단계 안 지점에 있으면 지나온 단계 끝 칸에 */
  me: boolean;
  /** 이 단계 안 지점(끝 포함)에 붙는 패리티 고리 */
  loops: ReturnType<typeof loopsAt>;
}

/** 띠 칸: 다 섞임 + 큰 단계마다 끝 지점(세부 걸음은 해법 화면에서, 2026-11-26 사용자) */
function stripCells(m: MapMethod, ctx: MapCtx): StripCell[] {
  const nodes = methodNodes(m);
  const solo = ctx.solo.get(m.id);
  const stages = methodStages(m);
  const meIdx = nodes.findIndex((id) => meAt(ctx, id, m));
  const at = [0, ...stages.map((s) => nodes.indexOf(s.to))];
  const meCell = meIdx < 0 ? -1 : at.filter((i) => i <= meIdx).length - 1;
  return [
    {
      id: nodes[0] as MapNodeId,
      done: false,
      skill: undefined,
      me: meCell === 0,
      loops: loopsAt(m, nodes[0] as MapNodeId, ctx),
    },
    ...stages.map((s, k) => ({
      id: s.to,
      done: s.edges.every((e) => edgeLearn(e, ctx.progress) === "done"),
      skill:
        s.edges.length === 1
          ? solo?.get((s.edges[0] as MapEdge).id)?.skill
          : undefined,
      me: meCell === k + 1,
      loops: s.edges.flatMap((e) => loopsAt(m, e.to, ctx)),
    })),
  ];
}

/**
 * 앞 카드와 같은 단계: 이 해법의 큰 단계 끝 지점이 앞 카드(더 쉬운 해법)의 큰 단계 끝 지점이기도 하면 가장 앞 카드.
 * 다 섞임·다 맞음은 모든 해법이 같으니 보지 않는다
 */
export function sameStages(
  methods: readonly MapMethod[],
): Map<string, Map<MapNodeId, MapMethod>> {
  const out = new Map<string, Map<MapNodeId, MapMethod>>();
  methods.forEach((m, i) => {
    const ends = methodStages(m)
      .slice(0, -1)
      .map((s) => s.to);
    const mine = new Map<MapNodeId, MapMethod>();
    for (const id of ends) {
      const first = methods
        .slice(0, i)
        .find((x) => methodStages(x).some((s) => s.to === id));
      if (first) mine.set(id, first);
    }
    out.set(m.id, mine);
  });
  return out;
}

/** 같은 단계 표시에 부르는 짧은 이름(칸 폭에 한두 줄로 들게) */
const SHORT_TITLE: Partial<Record<MapMethod["id"], string>> = {
  // 「2단계」만 쓰면 맞추는 차례의 둘째 단계로 읽힌다(처음 보는 독자 검토)
  "two-look": "OLL·PLL",
};

/** 지점 그림 띠(큰 단계만). 넘치면 다음 줄로(휴대폰 폭에서 옆으로 밀지 않는다) */
function Strip({
  m,
  ctx,
  same,
}: {
  m: MapMethod;
  ctx: MapCtx;
  same?: Map<MapNodeId, MapMethod> | undefined;
}) {
  return (
    <ol className="flex flex-wrap items-start gap-x-1 gap-y-2" data-card-strip>
      {stripCells(m, ctx).map(({ id, done, skill, me, loops }, i) => {
        const like = same?.get(id);
        return [
          // 화살표는 다음 칸과 한 덩이(줄이 바뀌어도 줄 끝에 화살표만 남지 않게)
          <li key={id} className="flex shrink-0 items-start gap-1">
            {i > 0 && (
              <span aria-hidden className="pt-5">
                <StepArrow dir="right" color={METHOD_COLOR[m.id]} done={done} />
              </span>
            )}
            <div
              className="relative flex w-[68px] flex-col items-center gap-0.5"
              data-strip-node={id}
              data-same-as={like?.id}
            >
              {me && (
                <span className="-top-2 -right-0 absolute z-10">
                  <MeBadge methods={[]} />
                </span>
              )}
              <div
                className="rounded-md border-2 p-0.5"
                style={{
                  borderColor: skill ? SKILL_RING[skill] : "transparent",
                }}
                data-strip-skill={skill ?? undefined}
              >
                <NodeCube id={id} settings={ctx.settings} px={44} method={m} />
              </div>
              <span
                className="w-full wrap-anywhere break-keep text-center text-[11px] leading-tight"
                data-strip-name
              >
                {done && <span className="text-emerald-300">✓ </span>}
                {nodeById(id).title}
              </span>
              {like && (
                <span
                  className="w-full wrap-anywhere break-keep rounded border px-0.5 text-center text-[10px] leading-tight"
                  style={{
                    borderColor: METHOD_COLOR[like.id],
                    color: METHOD_COLOR[like.id],
                  }}
                  data-strip-same
                >
                  {wa(SHORT_TITLE[like.id] ?? like.title)} 같음
                </span>
              )}
            </div>
          </li>,
          ...loops.map((d) => (
            <li key={`${id}-loop-${d.loop.kind}`} className="pt-4">
              <LoopChip d={d} ctx={ctx} compact />
            </li>
          )),
        ];
      })}
    </ol>
  );
}

/** 해법 카드 세로(위에서 아래로 쉬운 해법 → 어려운 해법) */
export function CardsView({
  ctx,
  onOpen,
}: {
  ctx: MapCtx;
  onOpen: (m: MapMethod) => void;
}) {
  const same = sameStages(ctx.methods);
  return (
    <div className="flex flex-col gap-3" data-map-cards>
      {ctx.methods.map((m) => (
        // 띠(목록)를 품으려고 단추 대신 링크로 둔다(주소는 해법 화면, 누르면 이 페이지 안에서 바꾼다)
        <a
          key={m.id}
          href={`?method=${m.id}`}
          onClick={(ev) => {
            ev.preventDefault();
            onOpen(m);
          }}
          className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-neutral-800/70 p-3 text-left hover:border-white/30"
          data-card={m.id}
        >
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span
              className="break-keep font-semibold text-lg"
              style={{ color: METHOD_COLOR[m.id] }}
            >
              {m.title}
            </span>
            <Totals m={m} />
          </span>
          <Strip m={m} ctx={ctx} same={same.get(m.id)} />
        </a>
      ))}
    </div>
  );
}

/** 해법 화면: 세부 걸음마다 지점 그림·공식 수·단원·내 기록. 아래 `children`(그 과정의 단원·연습) */
export function MethodScreen({
  m,
  ctx,
  onBack,
  children,
}: {
  m: MapMethod;
  ctx: MapCtx;
  onBack: () => void;
  children?: ReactNode;
}) {
  const one = { ...ctx, selected: [m] };
  return (
    <section className="flex min-w-0 flex-col gap-3" data-method-screen={m.id}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-white/20 px-2.5 py-1 text-sm"
          data-method-back
        >
          ← 해법 목록
        </button>
        <h2
          className="break-keep font-semibold text-xl"
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
          const href = hrefOf(e, m, ctx);
          const me = meAt(ctx, e.to, m);
          const body = (
            <>
              <span className="w-5 shrink-0 text-right text-sm text-white/50">
                {i + 1}
              </span>
              <NodeCube id={e.to} settings={ctx.settings} px={56} method={m} />
              <span className="flex min-w-0 flex-col break-keep text-[11px] leading-tight wrap-anywhere">
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
                  onClick={toggleClick(e.jump, ctx)}
                  aria-expanded={e.jump ? !!ctx.fin : undefined}
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
              {e.jump && ctx.fin && (
                <div className="py-1 pl-[58px]">
                  <FinishPanel ctx={ctx} />
                </div>
              )}
              {loopsAt(m, e.to, ctx).length > 0 && (
                <span className="flex flex-wrap gap-2 py-1 pl-[58px]">
                  {loopsAt(m, e.to, ctx).map((d) => (
                    <LoopChip key={d.loop.kind} d={d} ctx={ctx} />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {children}
    </section>
  );
}
