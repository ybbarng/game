"use client";

// 큐브 해법 지도 시안(`/cube/learn-map`, 2026-11-25). 같은 자료(learn/solve-map.ts)를 여러 가지로 그려 견준다:
// A 펼친 지도(`?v=a`), B 갈림길만(`?v=b`), C 노선도(`?v=c`), D 길 견주기 막대(`?v=d`), E 해법 카드 세로·가로
// (`?v=cards-v`·`?v=cards-h`, 카드를 누르면 `&method=`로 해법 화면). 고른 해법은 `?m=a,b`,
// 견본 기록은 `?demo=1`(화면 안에서만). 시안 바꾸기·견본 기록 단추는 시안 때만 두고 고르면 지운다.
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { COURSES } from "../learn/courses";
import {
  type LearnProgress,
  loadLearn,
  loadTrain,
  type TrainBook,
} from "../learn/progress";
import {
  type CubeSize,
  FINISH_METHODS,
  MAP_LANES,
  MAP_METHODS,
  MAP_SIZES,
  type MapMethod,
  type MapMethodId,
  type MapNodeId,
  methodSize,
} from "../learn/solve-map";
import {
  DEMO_PROGRESS,
  DEMO_RECORDS,
  DEMO_TRAIN,
} from "../learn/solve-map-demo";
import {
  type EdgeSolo,
  methodSolo,
  myNode,
  solveMethodOf,
} from "../learn/solve-map-me";
import {
  loadMethod,
  type SolveMethod,
  usableMethod,
} from "../progress/methods";
import { loadRecords, type SolveRecord } from "../records";
import { useCubeSettings } from "../settings";
import { CardsView } from "./SolveMapCards";
import { BarsView, HubView, type MapCtx, MapView } from "./SolveMapViews";
import {
  isExtra,
  MAIN_METHODS,
  METHOD_COLOR,
  methodById,
  methodTotals,
  parseSelected,
  visibleMethods,
} from "./solve-map-model";

export type MapVariant = "a" | "b" | "c" | "d" | "cards-v" | "cards-h";
const VARIANTS: { id: MapVariant; title: string }[] = [
  { id: "a", title: "A 지도" },
  { id: "b", title: "B 갈림길" },
  { id: "c", title: "C 노선도" },
  { id: "d", title: "D 막대" },
  { id: "cards-v", title: "E 카드 세로" },
  { id: "cards-h", title: "E 카드 가로" },
];

const lessonCourse = new Map(
  COURSES.flatMap((c) => c.lessons.map((l) => [l.id, c.id] as const)),
);
const lessonTitle = new Map(
  COURSES.flatMap((c) => c.lessons.map((l) => [l.id, l.title] as const)),
);
const courseOf = (id: string) => lessonCourse.get(id);

function readQuery() {
  const q = new URLSearchParams(window.location.search);
  const v = q.get("v");
  const n = Number(q.get("n"));
  const from = Number(q.get("from"));
  return {
    variant: (VARIANTS.some((x) => x.id === v) ? v : "a") as MapVariant,
    selected: parseSelected(q.get("m")),
    demo: q.get("demo") === "1",
    extra: q.get("more") === "1",
    open: (MAP_METHODS.find((m) => m.id === q.get("method"))?.id ??
      null) as MapMethodId | null,
    n: (MAP_SIZES.includes(n as CubeSize) ? n : 3) as CubeSize,
    from: (from === 4 || from === 5 ? from : null) as 4 | 5 | null,
    fin: (FINISH_METHODS.find((m) => m === q.get("x")) ??
      null) as MapMethodId | null,
  };
}

interface QueryState {
  variant: MapVariant;
  selected: MapMethodId[];
  demo: boolean;
  extra: boolean;
  open: MapMethodId | null;
  n: CubeSize;
  from: 4 | 5 | null;
  fin: MapMethodId | null;
}

function queryOf(s: QueryState): string {
  const q = new URLSearchParams();
  q.set("v", s.variant);
  q.set("n", String(s.n));
  if (s.from && s.n === 3) q.set("from", String(s.from));
  // 큰 큐브 「3×3 맞추기」를 펼친 해법(3×3 지도에 들렀다 돌아와도 펼친 채로)
  if (s.fin && (s.n !== 3 || s.from)) q.set("x", s.fin);
  q.set("m", s.selected.join(","));
  if (s.demo) q.set("demo", "1");
  if (s.extra) q.set("more", "1");
  if (s.open && s.variant.startsWith("cards")) q.set("method", s.open);
  return `?${q.toString()}`;
}

/** 3×3 지도에 들를 때의 고른 해법: 다른 크기 것은 두고 3×3은 펼친 해법 하나로 */
function hopSelected(
  xs: readonly MapMethodId[],
  fin: MapMethodId | null,
): MapMethodId[] {
  const rest = xs.filter((x) => methodSize(methodById(x)) !== 3);
  return [...rest, fin ?? (FINISH_METHODS[0] as MapMethodId)];
}

/** 그 크기에서 처음 고를 해법: 기본 해법 가운데 가장 쉬운 것 */
function defaultOf(n: CubeSize): MapMethodId {
  return [...MAP_METHODS]
    .filter((m) => methodSize(m) === n && !m.extra)
    .sort((a, b) => (MAP_LANES[a.id] ?? 0) - (MAP_LANES[b.id] ?? 0))[0]
    ?.id as MapMethodId;
}

export function SolveMapApp() {
  const settings = useCubeSettings();
  const [ready, setReady] = useState(false);
  const [variant, setVariant] = useState<MapVariant>("a");
  const [selected, setSelected] = useState<MapMethodId[]>(["beginner"]);
  const [demo, setDemo] = useState(false);
  const [extra, setExtra] = useState(false);
  /** E안에서 연 해법 화면 */
  const [open, setOpen] = useState<MapMethodId | null>(null);
  /** 지도 크기(크기마다 지도가 따로다) */
  const [n, setN] = useState<CubeSize>(3);
  /** 3×3 지도를 큰 큐브에서 건너와 열었나(패리티 우회 역) */
  const [from, setFrom] = useState<4 | 5 | null>(null);
  /** 큰 큐브 「3×3 맞추기」를 펼쳤으면 그 안에서 고른 3×3 해법 */
  const [fin, setFin] = useState<MapMethodId | null>(null);
  const [mine, setMine] = useState<{
    progress: LearnProgress;
    train: TrainBook;
    /** 크기마다 혼자 맞추기 기록 */
    records: SolveRecord[];
    /** 혼자 맞추기 「내 해법」(구간 기록은 이 해법으로만 읽는다) */
    method: SolveMethod;
  }>({ progress: { lessons: {} }, train: {}, records: [], method: "auto" });

  useEffect(() => {
    const q = readQuery();
    setVariant(q.variant);
    setSelected(q.selected);
    setDemo(q.demo);
    setExtra(q.extra);
    setOpen(q.open);
    setN(q.n);
    setFrom(q.from);
    setFin(q.fin);
    setMine((x) => ({
      ...x,
      progress: loadLearn(),
      train: loadTrain(),
      method: loadMethod(),
    }));
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) setMine((x) => ({ ...x, records: loadRecords("solo", n) }));
  }, [ready, n]);
  const state: QueryState = {
    variant,
    selected,
    demo,
    extra,
    open,
    n,
    from,
    fin,
  };
  useEffect(() => {
    if (ready) window.history.replaceState(null, "", queryOf(state));
  });

  const record = demo
    ? {
        progress: DEMO_PROGRESS,
        train: DEMO_TRAIN,
        records: n === 3 ? DEMO_RECORDS : [],
        method: "layer" as SolveMethod,
      }
    : mine;
  const ofSize = (m: MapMethod) => methodSize(m) === n;
  // B안은 3×3의 루·ZZ·페트루스도 「다른 해법」으로 접는다
  const folded = (m: MapMethod) =>
    variant === "b" && n === 3 ? !MAIN_METHODS.includes(m.id) : isExtra(m);
  const methods = visibleMethods(selected, extra, folded).filter(ofSize);
  const picked = selected.filter((id) => ofSize(methodById(id)));
  const chosen = (picked.length ? picked : [defaultOf(n)]).map(methodById);
  const solo = useMemo(() => {
    const out = new Map<string, Map<string, EdgeSolo>>();
    // 내가 고른 해법으로 맞춘 판만 그 해법 길에 겹친다(자동이면 판마다 길이 달라 겹치지 않는다. 2×2는 길이 하나)
    for (const m of MAP_METHODS)
      if (
        methodSize(m) === n &&
        solveMethodOf(m) === usableMethod(n, record.method)
      )
        out.set(m.id, methodSolo(m, record.records));
    return out;
  }, [record.records, record.method, n]);
  const me = useMemo(() => {
    const out = new Map<MapNodeId | "prep", MapMethod[]>();
    for (const m of MAP_METHODS) {
      if (m.extra || methodSize(m) !== n) continue;
      const at = myNode(m, record.progress);
      if (!at) continue;
      out.set(at, [...(out.get(at) ?? []), m]);
    }
    if (!out.size) out.set("prep", []);
    return out;
  }, [record.progress, n]);

  const ctx: MapCtx = {
    settings,
    methods,
    selected: chosen,
    progress: record.progress,
    train: record.train,
    solo,
    me,
    courseOf,
    lessonTitle: (id) => lessonTitle.get(id) ?? id,
    size: n,
    from: n === 3 ? from : null,
    fin: n !== 3 && fin ? methodById(fin) : null,
    finHref: (id) => queryOf({ ...state, fin: id }),
    setFin,
    // 3×3 지도에 들르기: 펼친 해법을 고른 채로, 크기 탭은 그대로(지금 크기를 바꾸지 않는다)
    hopHref: queryOf({
      ...state,
      n: 3,
      from: n === 4 || n === 5 ? n : null,
      open: null,
      selected: hopSelected(selected, fin),
    }),
    hop: () => {
      if (n !== 4 && n !== 5) return;
      setSelected((xs) => hopSelected(xs, fin));
      setFrom(n);
      setN(3);
      setOpen(null);
    },
    toggle: (id) =>
      setSelected((xs) => {
        const mine = xs.filter((x) => ofSize(methodById(x)));
        const other = xs.filter((x) => !ofSize(methodById(x)));
        const cur = mine.length ? mine : [defaultOf(n)];
        const next = cur.includes(id)
          ? cur.length > 1
            ? cur.filter((x) => x !== id)
            : cur
          : [...cur, id];
        return [...other, ...next];
      }),
  };

  const chips = MAP_METHODS.filter(
    (m) => ofSize(m) && (!folded(m) || extra || selected.includes(m.id)),
  );
  const chosenIds = chosen.map((m) => m.id);
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 break-keep"
        data-solve-map={ready ? variant : undefined}
      >
        <h1 className="font-bold text-xl">해법 지도</h1>
        <div className="flex flex-wrap gap-1.5" data-map-variants>
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={variant === v.id}
              onClick={() => setVariant(v.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm",
                variant === v.id
                  ? "border-white bg-white text-neutral-900"
                  : "border-white/20 text-white/70",
              )}
            >
              {v.title}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={demo}
            onClick={() => setDemo((d) => !d)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-sm",
              demo
                ? "border-amber-300 bg-amber-300 text-neutral-900"
                : "border-white/20 text-white/70",
            )}
          >
            견본 기록
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-map-sizes>
          {MAP_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={(ctx.from ?? n) === s}
              onClick={() => {
                setN(s);
                setFrom(null);
                setOpen(null);
                setFin(null);
              }}
              className={cn(
                "rounded-md border px-3 py-1 font-semibold text-sm",
                (ctx.from ?? n) === s
                  ? "border-white bg-white text-neutral-900"
                  : "border-white/20 text-white/70",
              )}
              data-size={s}
            >
              {s}×{s}
            </button>
          ))}
          {ctx.from && (
            <button
              type="button"
              onClick={() => {
                setN(ctx.from as CubeSize);
                setFrom(null);
              }}
              className="rounded-md border border-white/30 px-2.5 py-1 text-sm"
              data-map-back
            >
              ← {ctx.from}×{ctx.from}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" data-map-methods>
          {chips.map((m) => {
            const on = chosenIds.includes(m.id);
            const t = methodTotals(m);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                data-method={m.id}
                onClick={() => ctx.toggle(m.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm",
                  on ? "bg-white/10" : "border-white/15 text-white/50",
                )}
                style={on ? { borderColor: METHOD_COLOR[m.id] } : undefined}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: METHOD_COLOR[m.id] }}
                />
                <span className="font-medium">{m.title}</span>
                {t.formulas !== null && (
                  <span className="whitespace-nowrap text-white/60 text-xs">
                    공식 {t.formulas}
                  </span>
                )}
                {t.turns !== undefined && (
                  <span className="whitespace-nowrap text-white/60 text-xs">
                    {t.turns}수
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={extra}
            onClick={() => setExtra((x) => !x)}
            className={cn(
              "rounded-full border border-dashed px-2.5 py-1 text-sm",
              extra
                ? "border-white/60 text-white"
                : "border-white/25 text-white/50",
            )}
          >
            다른 해법
          </button>
        </div>
        {ready && (
          <>
            {variant === "a" && <MapView ctx={ctx} style="map" />}
            {variant === "c" && <MapView ctx={ctx} style="metro" />}
            {variant === "b" && <HubView ctx={ctx} />}
            {variant === "d" && <BarsView ctx={ctx} />}
            {variant.startsWith("cards") && (
              <CardsView
                ctx={ctx}
                dir={variant === "cards-h" ? "h" : "v"}
                open={open ? methodById(open) : null}
                onOpen={(m) => {
                  setOpen(m?.id ?? null);
                  window.scrollTo({ top: 0 });
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
