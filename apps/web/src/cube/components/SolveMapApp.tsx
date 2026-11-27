"use client";

// 해법 배우기(`/cube/methods`)의 해법 카드와 지도(docs/47 16-30). 같은 자료(learn/solve-map.ts)를 두 가지로 그린다:
// - 첫 모습: 해법 카드 세로(MethodCards). 위에서 아래로 초보자 → 고급(지도의 왼쪽 → 오른쪽과 같은 차례)
// - 전체 보기(`?view=map`): 펼친 지도(MapScreen). 고른 해법은 `?sel=a,b`, 접은 해법 펼치기 `?more=1`, 큰 큐브에서
//   들른 3×3 지도 `?from=4`, 큰 큐브 「3×3 맞추기」 펼치기 `?x=<해법>`
// 크기는 해법 배우기의 크기 단추(사이트 「지금 크기」, docs/47 16-28)를 따른다. 3×3 지도에 들르기는 지금 크기를 바꾸지 않는다.
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";
import { COURSES } from "../learn/courses";
import {
  type LearnProgress,
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
  methodSize,
} from "../learn/solve-map";
import {
  type EdgeSolo,
  methodSolo,
  solveMethodOf,
} from "../learn/solve-map-me";
import {
  loadMethod,
  type SolveMethod,
  usableMethod,
} from "../progress/methods";
import { loadRecords, type SolveRecord } from "../records";
import { useCubeSettings } from "../settings";
import { SizePicker } from "./SizePicker";
import { CardsView } from "./SolveMapCards";
import { type MapCtx, MapView } from "./SolveMapViews";
import {
  isExtra,
  METHOD_COLOR,
  methodById,
  methodTotals,
  parseSelected,
  visibleMethods,
} from "./solve-map-model";

const lessonCourse = new Map(
  COURSES.flatMap((c) => c.lessons.map((l) => [l.id, c.id] as const)),
);
const lessonTitle = new Map(
  COURSES.flatMap((c) => c.lessons.map((l) => [l.id, l.title] as const)),
);
const courseOf = (id: string) => lessonCourse.get(id);

/** 쉬운 해법부터(지도 왼쪽 → 오른쪽 칸, 같은 칸이면 MAP_METHODS 차례) */
export const byLane = (a: MapMethod, b: MapMethod) =>
  (MAP_LANES[a.id] ?? 99) - (MAP_LANES[b.id] ?? 99) ||
  MAP_METHODS.indexOf(a) - MAP_METHODS.indexOf(b);

/** 그 크기에서 처음 고를 해법: 기본 해법 가운데 가장 쉬운 것 */
export function defaultOf(n: CubeSize): MapMethodId {
  return [...MAP_METHODS]
    .filter((m) => methodSize(m) === n && !m.extra)
    .sort(byLane)[0]?.id as MapMethodId;
}

/** 주소의 일부만 바꾼다(다른 값은 그대로, 빈 값은 지운다) */
export function patchQuery(
  patch: Record<string, string | null>,
  mode: "push" | "replace" = "replace",
) {
  const q = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  const url = `${window.location.pathname}${s ? `?${s}` : ""}`;
  if (`${window.location.pathname}${window.location.search}` === url) return;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

interface MapState {
  n: CubeSize;
  selected: MapMethodId[];
  extra: boolean;
  from: 4 | 5 | null;
  fin: MapMethodId | null;
  progress: LearnProgress;
  setSelected: (f: (xs: MapMethodId[]) => MapMethodId[]) => void;
  setFrom: (from: 4 | 5 | null) => void;
  setFin: (fin: MapMethodId | null) => void;
  /** 3×3 지도에 들르는 주소 */
  hopHref: string;
  finHref: (id: MapMethodId | null) => string;
}

/** 지도·카드가 함께 쓰는 화면 자료(내 기록은 이 기기의 배우기 진행·공식 연습·혼자 맞추기) */
function useMapCtx(s: MapState): MapCtx {
  const settings = useCubeSettings();
  const [mine, setMine] = useState<{
    train: TrainBook;
    /** 크기마다 혼자 맞추기 기록 */
    records: SolveRecord[];
    /** 혼자 맞추기 「내 해법」(구간 기록은 이 해법으로만 읽는다) */
    method: SolveMethod;
  }>({ train: {}, records: [], method: "auto" });
  const { n } = s;
  useEffect(() => {
    setMine({
      train: loadTrain(),
      records: loadRecords("solo", n),
      method: loadMethod(),
    });
  }, [n]);
  const ofSize = (m: MapMethod) => methodSize(m) === n;
  const methods = visibleMethods(s.selected, s.extra, isExtra)
    .filter(ofSize)
    .sort(byLane);
  const picked = s.selected.filter((id) => ofSize(methodById(id)));
  const chosen = (picked.length ? picked : [defaultOf(n)]).map(methodById);
  const solo = useMemo(() => {
    const out = new Map<string, Map<string, EdgeSolo>>();
    // 내가 고른 해법으로 맞춘 판만 그 해법 길에 겹친다(자동이면 판마다 길이 달라 겹치지 않는다. 2×2는 길이 하나)
    for (const m of MAP_METHODS)
      if (
        methodSize(m) === n &&
        solveMethodOf(m) === usableMethod(n, mine.method)
      )
        out.set(m.id, methodSolo(m, mine.records));
    return out;
  }, [mine.records, mine.method, n]);
  return {
    settings,
    methods,
    selected: chosen,
    progress: s.progress,
    train: mine.train,
    solo,
    courseOf,
    lessonTitle: (id) => lessonTitle.get(id) ?? id,
    size: n,
    from: n === 3 ? s.from : null,
    fin: n !== 3 && s.fin ? methodById(s.fin) : null,
    finHref: s.finHref,
    setFin: s.setFin,
    hopHref: s.hopHref,
    hop: () => {
      if (n !== 4 && n !== 5) return;
      s.setSelected((xs) => hopSelected(xs, s.fin));
      s.setFrom(n);
    },
    toggle: (id) =>
      s.setSelected((xs) => {
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
}

/** 3×3 지도에 들를 때의 고른 해법: 다른 크기 것은 두고 3×3은 펼친 해법 하나로 */
function hopSelected(
  xs: readonly MapMethodId[],
  fin: MapMethodId | null,
): MapMethodId[] {
  const rest = xs.filter((x) => methodSize(methodById(x)) !== 3);
  return [...rest, fin ?? (FINISH_METHODS[0] as MapMethodId)];
}

/** 지도가 있는 크기면 그 크기(해법 배우기의 6×6·7×7은 지도가 없다) */
export const mapSizeFor = (n: number): CubeSize | null =>
  MAP_SIZES.includes(n as CubeSize) ? (n as CubeSize) : null;

/**
 * 해법 카드(첫 모습). 그 크기의 해법을 쉬운 것부터 세로로, 카드를 누르면 해법 화면(`onOpen`). 접은 해법(사이트에 단원이
 * 없는 해법)은 「다른 해법」으로 펼친다
 */
export function MethodCards({
  n,
  progress,
  onOpen,
  onMap,
}: {
  n: CubeSize;
  progress: LearnProgress;
  onOpen: (m: MapMethod) => void;
  onMap: () => void;
}) {
  const [extra, setExtra] = useState(false);
  useEffect(() => {
    setExtra(new URLSearchParams(window.location.search).get("more") === "1");
  }, []);
  const ctx = useMapCtx({
    n,
    selected: [],
    extra,
    from: null,
    fin: null,
    progress,
    setSelected: () => {},
    setFrom: () => {},
    setFin: () => {},
    hopHref: "",
    finHref: () => "",
  });
  const hasExtra = MAP_METHODS.some((m) => methodSize(m) === n && m.extra);
  return (
    <section className="flex flex-col gap-3" data-method-cards={n}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">해법</h2>
        <button
          type="button"
          onClick={onMap}
          className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
          data-open-map
        >
          🗺️ 전체 보기
        </button>
      </div>
      <CardsView ctx={ctx} onOpen={onOpen} />
      {hasExtra && (
        <button
          type="button"
          aria-pressed={extra}
          onClick={() => {
            setExtra((x) => !x);
            patchQuery({ more: extra ? null : "1" });
          }}
          className={cn(
            "self-start rounded-full border border-dashed px-3 py-1 text-sm",
            extra
              ? "border-white/60 text-white"
              : "border-white/25 text-white/60",
          )}
          data-more-methods
        >
          다른 해법
        </button>
      )}
    </section>
  );
}

/** 해법 화면(카드를 누른 뒤)에 쓰는 자료: 그 해법 하나만 고른 지도 자료 */
export function useMethodCtx(m: MapMethod, progress: LearnProgress): MapCtx {
  const [fin, setFin] = useState<MapMethodId | null>(null);
  useEffect(() => {
    const x = new URLSearchParams(window.location.search).get("x");
    setFin(FINISH_METHODS.find((f) => f === x) ?? null);
  }, []);
  const hopHref = `?view=map&sel=${fin ?? FINISH_METHODS[0]}&from=${methodSize(m)}`;
  return useMapCtx({
    n: methodSize(m),
    selected: [m.id],
    extra: !!m.extra,
    from: null,
    fin,
    progress,
    setSelected: () => {},
    // 해법 화면에서 3×3 지도에 들르면 전체 보기(지도)로 간다
    setFrom: () => window.location.assign(hopHref),
    setFin: (id) => {
      setFin(id);
      patchQuery({ x: id });
    },
    hopHref,
    finHref: (id) => `?method=${m.id}${id ? `&x=${id}` : ""}`,
  });
}

/**
 * 전체 보기: 화면 전체가 지도(위 얇은 줄 하나 + 그 아래 끝까지 지도). 크기 단추는 해법 배우기의 크기(`onSize`가 지금
 * 크기를 바꾼다). 큰 큐브에서 3×3 지도에 들르면 크기 단추는 큰 큐브 그대로다
 */
export function MapScreen({
  size,
  progress,
  onSize,
  onBack,
}: {
  size: CubeSize;
  progress: LearnProgress;
  onSize: (n: CubeSize) => void;
  onBack: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<MapMethodId[]>(["beginner"]);
  const [extra, setExtra] = useState(false);
  const [from, setFrom] = useState<4 | 5 | null>(null);
  const [fin, setFin] = useState<MapMethodId | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const f = Number(q.get("from"));
    setSelected(parseSelected(q.get("sel")));
    setExtra(q.get("more") === "1");
    setFrom(f === 4 || f === 5 ? f : null);
    setFin(FINISH_METHODS.find((m) => m === q.get("x")) ?? null);
    setReady(true);
  }, []);
  // 큰 큐브에서 들른 3×3 지도
  const n: CubeSize = from ? 3 : size;
  const query = (o: {
    from?: 4 | 5 | null;
    fin?: MapMethodId | null;
    sel?: MapMethodId[];
  }) => {
    const fr = o.from === undefined ? from : o.from;
    const x = o.fin === undefined ? fin : o.fin;
    const q = new URLSearchParams({ view: "map" });
    if (fr) q.set("from", String(fr));
    // 큰 큐브 「3×3 맞추기」를 펼친 해법(3×3 지도에 들렀다 돌아와도 펼친 채로)
    if (x && (size !== 3 || fr)) q.set("x", x);
    q.set("sel", (o.sel ?? selected).join(","));
    if (extra) q.set("more", "1");
    return `?${q.toString()}`;
  };
  const here = query({});
  useEffect(() => {
    if (!ready) return;
    const want = new URLSearchParams(here);
    patchQuery({
      view: "map",
      from: want.get("from"),
      x: want.get("x"),
      sel: want.get("sel"),
      more: want.get("more"),
    });
  }, [ready, here]);
  const ctx = useMapCtx({
    n,
    selected,
    extra,
    from,
    fin,
    progress,
    setSelected: (f) => setSelected(f),
    setFrom,
    setFin,
    hopHref: query({
      from: size === 4 || size === 5 ? size : null,
      sel: hopSelected(selected, fin),
    }),
    finHref: (id) => query({ fin: id }),
  });
  const ofSize = (m: MapMethod) => methodSize(m) === n;
  const chips = MAP_METHODS.filter(
    (m) => ofSize(m) && (!m.extra || extra || selected.includes(m.id)),
  ).sort(byLane);
  const chosenIds = ctx.selected.map((m) => m.id);
  return (
    // 바깥 틀도 스크롤되지 않는 상자로(지도 틀이 clip이면 포커스·스크롤이 이 틀을 대신 밀어 화면 전체가 어긋난다)
    <div
      data-game="cube"
      className="fixed inset-0 flex flex-col overflow-clip bg-neutral-900 text-white"
    >
      <main
        className="flex min-h-0 flex-1 flex-col break-keep"
        data-solve-map={ready ? "map" : undefined}
        data-map-full=""
      >
        {/* 위 줄: 돌아가기·크기, 해법 칩은 다음 줄(넓은 화면은 같은 줄 남은 폭)의 가로 스크롤 줄. 줄 자체는 넘치지 않는다 */}
        <div
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 whitespace-nowrap border-white/10 border-b px-3 py-1.5"
          data-map-bar
        >
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-sm text-white/70 hover:text-white"
            data-map-close
          >
            ← 해법 목록
          </button>
          <SizePicker
            attr="data-map-sizes"
            optionAttr="data-size"
            sizes={MAP_SIZES}
            value={from ?? size}
            onPick={(s) => {
              setFrom(null);
              setFin(null);
              onSize(s as CubeSize);
            }}
            className="shrink-0 flex-nowrap"
          />
          {from && (
            <button
              type="button"
              onClick={() => setFrom(null)}
              className="shrink-0 rounded-md border border-white/30 px-2.5 py-1 text-sm"
              data-map-back
            >
              ← {from}×{from}
            </button>
          )}
          <ScrollRow
            className="min-w-0 basis-full md:basis-0 md:flex-1"
            attr="data-map-methods"
          >
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
                      공식 {t.formulas}개
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
            {MAP_METHODS.some((m) => ofSize(m) && m.extra) && (
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
            )}
          </ScrollRow>
        </div>
        {ready && <MapView ctx={ctx} />}
      </main>
    </div>
  );
}

/**
 * 가로로 미는 한 줄. 넘쳐 가려진 것이 오른쪽(또는 왼쪽)에 있으면 그쪽 끝을 흐리게 하고 화살 표시를 두어 밀 수
 * 있다는 것이 보인다(`data-scroll-more`). 화면 시험은 이 표시로 잘린 칩이 밀어서 볼 수 있는 것인지 본다
 */
function ScrollRow({
  attr,
  className,
  children,
}: {
  attr: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
      setMore((m) =>
        m.left === left && m.right === right ? m : { left, right },
      );
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => {
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  });
  const fade = (side: "left" | "right") => (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 flex w-8 items-center text-white/70",
        side === "right"
          ? "right-0 justify-end bg-gradient-to-l"
          : "left-0 justify-start bg-gradient-to-r",
        "from-neutral-900 via-neutral-900/80 to-transparent",
      )}
      data-scroll-more={side}
    >
      {side === "right" ? "›" : "‹"}
    </span>
  );
  return (
    <div className={cn("relative", className)}>
      <div
        ref={ref}
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&>*]:shrink-0"
        {...{ [attr]: "" }}
      >
        {children}
      </div>
      {more.left && fade("left")}
      {more.right && fade("right")}
    </div>
  );
}
