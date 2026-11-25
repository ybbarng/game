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
  MAP_METHODS,
  MAP_PREP,
  type MapMethod,
  type MapMethodId,
  type MapNodeId,
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
import { loadMethod, type SolveMethod } from "../progress/methods";
import { loadRecords, type SolveRecord } from "../records";
import { useCubeSettings } from "../settings";
import { ExplodedCube } from "./ExplodedCube";
import { CardsView } from "./SolveMapCards";
import {
  BarsView,
  HubView,
  type MapCtx,
  MapView,
  MeBadge,
} from "./SolveMapViews";
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
  return {
    variant: (VARIANTS.some((x) => x.id === v) ? v : "a") as MapVariant,
    selected: parseSelected(q.get("m")),
    demo: q.get("demo") === "1",
    extra: q.get("more") === "1",
    open: (MAP_METHODS.find((m) => m.id === q.get("method"))?.id ??
      null) as MapMethodId | null,
  };
}

function writeQuery(s: {
  variant: MapVariant;
  selected: MapMethodId[];
  demo: boolean;
  extra: boolean;
  open: MapMethodId | null;
}) {
  const q = new URLSearchParams();
  q.set("v", s.variant);
  q.set("m", s.selected.join(","));
  if (s.demo) q.set("demo", "1");
  if (s.extra) q.set("more", "1");
  if (s.open && s.variant.startsWith("cards")) q.set("method", s.open);
  window.history.replaceState(null, "", `?${q.toString()}`);
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
  const [mine, setMine] = useState<{
    progress: LearnProgress;
    train: TrainBook;
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
    setMine({
      progress: loadLearn(),
      train: loadTrain(),
      records: loadRecords("solo", 3),
      method: loadMethod(),
    });
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) writeQuery({ variant, selected, demo, extra, open });
  }, [ready, variant, selected, demo, extra, open]);

  const record = demo
    ? {
        progress: DEMO_PROGRESS,
        train: DEMO_TRAIN,
        records: DEMO_RECORDS,
        method: "layer" as SolveMethod,
      }
    : mine;
  // B안은 루·ZZ·페트루스도 「다른 해법」으로 접는다
  const folded = (m: MapMethod) =>
    variant === "b" ? !MAIN_METHODS.includes(m.id) : isExtra(m);
  const methods = visibleMethods(selected, extra, folded);
  const chosen = selected.map(methodById);
  const solo = useMemo(() => {
    const out = new Map<string, Map<string, EdgeSolo>>();
    // 내가 고른 해법으로 맞춘 판만 그 해법 길에 겹친다(자동이면 판마다 길이 달라 겹치지 않는다)
    for (const m of MAP_METHODS)
      if (solveMethodOf(m) === record.method)
        out.set(m.id, methodSolo(m, record.records));
    return out;
  }, [record.records, record.method]);
  const me = useMemo(() => {
    const out = new Map<MapNodeId | "prep", MapMethod[]>();
    for (const m of MAP_METHODS) {
      if (m.extra) continue;
      const at = myNode(m, record.progress);
      if (!at) continue;
      out.set(at, [...(out.get(at) ?? []), m]);
    }
    if (!out.size) out.set("prep", []);
    return out;
  }, [record.progress]);

  const ctx: MapCtx = {
    settings,
    methods,
    selected: chosen,
    progress: record.progress,
    train: record.train,
    solo,
    me,
    courseOf,
    toggle: (id) =>
      setSelected((xs) =>
        xs.includes(id)
          ? xs.length > 1
            ? xs.filter((x) => x !== id)
            : xs
          : [...xs, id],
      ),
  };

  const chips = MAP_METHODS.filter(
    (m) => !folded(m) || extra || selected.includes(m.id),
  );
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
        <div className="flex flex-wrap gap-1.5" data-map-methods>
          {chips.map((m) => {
            const on = selected.includes(m.id);
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
            <PrepCard ctx={ctx} />
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

/** 준비 칸: 큐브 상태를 바꾸지 않는 지식 단원. 모든 길이 여기서 출발한다 */
function PrepCard({ ctx }: { ctx: MapCtx }) {
  const here = ctx.me.has("prep");
  return (
    <section
      className="flex items-center gap-3 self-center rounded-xl border border-white/15 bg-white/5 px-3 py-2"
      data-map-prep
    >
      <ExplodedPrep ctx={ctx} />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">준비</h2>
          {here && <MeBadge methods={[]} />}
        </div>
        <ul className="flex flex-wrap gap-1">
          {MAP_PREP.map((id) => {
            const done = ctx.progress.lessons[id]?.done;
            return (
              <li key={id}>
                <a
                  href={`/cube/learn?lesson=${id}`}
                  className={cn(
                    "inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs",
                    done
                      ? "border-emerald-400/60 text-emerald-300"
                      : "border-white/20 text-white/80",
                  )}
                  data-done={done ? "" : undefined}
                >
                  {done ? "✓ " : ""}
                  {lessonTitle.get(id) ?? id}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function ExplodedPrep({ ctx }: { ctx: MapCtx }) {
  return <ExplodedCube colors={ctx.settings.colors} size={64} />;
}
