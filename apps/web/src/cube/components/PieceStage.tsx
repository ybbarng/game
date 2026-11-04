"use client";

import {
  cubeTopology,
  maskFromPieces,
  pieceFaces,
  solvedCube,
} from "@game/cube-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid, marksAtSlots, stickersFromState } from "../bridge";
import {
  BUILD_COLOR,
  BUILD_START,
  type BuildState,
  buildAsks,
  buildBegin,
  buildCount,
  buildFill,
  buildNext,
  buildOrder,
  buildSay,
  buildTakeApart,
  buildTap,
  PART_NAME,
  topic,
} from "../learn/build";
import { marksForSlots, pieceName, stickerAtHit } from "../learn/interact";
import { type CubeSettings, hexColor } from "../settings";
import type { CubeView } from "../view";
import { loadCubeView } from "../view";
import type { PieceLayout } from "../view/types";
import { CubeNet } from "./CubeNet";
import { playCubeCue } from "./CubePlay";

/**
 * 조각 단원의 3D 부품(docs/47 8-4): 「스티커로 보기 / 조각으로 보기」(PartsPanel)와 가상 분해·조립(BuildPanel).
 * 장면의 놓임(`CubeView.setLayout`)으로 조각을 벌리고 날려 끼운다. 3D를 못 그리면 펼친 그림으로 같은 일을 한다.
 * 판정은 `learn/build.ts`(순수 함수).
 */

const N = 3;
const COLOR_NAME = ["흰", "빨강", "초록", "노랑", "주황", "파랑"];
const TOPO = cubeTopology(N);
const SOLVED = solvedCube(N);
const posKey = (v: readonly number[]) =>
  v.map((x) => Math.round(x * 2)).join(",");
/** 조각 제자리 → 조각 번호 */
const PIECE_AT = new Map(TOPO.pieces.map((p, i) => [posKey(p.position), i]));
const pieceOfHome = (home: readonly number[]) => PIECE_AT.get(posKey(home));
const scaleVec = (v: readonly number[], k: number) =>
  [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0].map((x) => x * k) as [
    number,
    number,
    number,
  ];

/** 장면 하나(누르기만 받고, 끌면 둘러본다) */
function useStage(
  settings: CubeSettings,
  onSticker: (sticker: number) => void,
  paint: (view: CubeView) => void,
  keepView = false,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = useRef({ onSticker, paint });
  live.current = { onSticker, paint };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const view = CubeView.create(canvas, {
          n: N,
          quality: settings.quality,
          colors: settings.colors,
          stickerless: settings.stickerless,
          hidden: settings.hidden,
          keepView,
          onTap: (hit) => {
            const i = stickerAtHit(N, hit.center, hit.normal);
            if (i !== null) live.current.onSticker(i);
          },
        });
        viewRef.current = view;
        live.current.paint(view);
        ro.observe(canvas);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [
    settings.quality,
    settings.colors,
    settings.stickerless,
    settings.hidden,
    keepView,
  ]);

  return { canvasRef, viewRef, ready, failed };
}

function Stage({
  stage,
  net,
  label,
}: {
  stage: ReturnType<typeof useStage>;
  net: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      {stage.failed ? (
        <div data-cube-no3d className="w-full max-w-[360px] p-2">
          {net}
        </div>
      ) : (
        <div className="relative aspect-square w-full max-w-[380px]">
          <canvas
            ref={stage.canvasRef}
            data-cube-canvas
            data-cube-ready={stage.ready ? "" : undefined}
            className="h-full w-full cursor-pointer touch-none"
          />
        </div>
      )}
      <p className="text-white/50 text-xs">{label}</p>
    </div>
  );
}

function Swatches({
  piece,
  settings,
}: {
  piece: number;
  settings: CubeSettings;
}) {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {pieceFaces(N, piece).map((f) => (
        <span
          key={f}
          className="inline-block h-4 w-4 rounded-sm border border-black/40"
          style={{ background: hexColor(settings.colors[f] ?? 0) }}
        />
      ))}
    </span>
  );
}

const pieceLabel = (p: number) => {
  const faces = pieceFaces(N, p);
  const type =
    faces.length === 1 ? "center" : faces.length === 2 ? "edge" : "corner";
  return `${faces.map((f) => COLOR_NAME[f]).join("-")} ${pieceName(type)}`;
};

/** 분해·조립의 조각 이름(2026-11-05 용어: 센터·엣지·코너 블럭, 예: 흰-초록 엣지 블럭) */
const blockLabel = (p: number) => {
  const faces = pieceFaces(N, p);
  const part =
    faces.length === 1 ? "centers" : faces.length === 2 ? "edges" : "corners";
  return `${faces.map((f) => COLOR_NAME[f]).join("-")} ${PART_NAME[part]}`;
};

// ── 스티커로 보기 / 조각으로 보기 ──────────────────────────────

/**
 * 스티커로 보기: 몸통 없이 54칸만 떠 있다. 조각으로 보기: 26조각이 살짝 벌어져 색이 조각별로 묶인다.
 * 어느 쪽이든 칸 하나를 누르면 그 칸이 붙은 조각 전체가 함께 들린다. 조각으로 보기와 들어 보기를 해 보면 통과
 */
export function PartsPanel({
  settings,
  onPassed,
}: {
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const [mode, setMode] = useState<"sticker" | "piece">("sticker");
  const [lifted, setLifted] = useState<number | null>(null);
  const [seenPiece, setSeenPiece] = useState(false);
  const [passed, setPassed] = useState(false);
  const live = useRef({ mode, lifted });
  live.current = { mode, lifted };

  const paint = useCallback((view: CubeView, ms = 0) => {
    const { mode: m, lifted: up } = live.current;
    const marks = up === null ? null : marksForSlots(N, SOLVED, [[up, "pick"]]);
    view.setStickers(stickersFromState(N, SOLVED, null, marks));
    view.setLayout((home): PieceLayout => {
      const p = pieceOfHome(home);
      const isUp = p !== undefined && p === up;
      const spread = m === "piece" ? 0.32 : 0;
      const len = Math.hypot(...home) || 1;
      const lift = isUp ? 0.9 / len : 0;
      return {
        shift: scaleVec(home, spread + lift),
        body: m === "piece" || isUp,
      };
    }, ms);
  }, []);

  const pick = (sticker: number) => {
    const p = TOPO.stickers[sticker]?.piece;
    if (p === undefined) return;
    setLifted((cur) => (cur === p ? null : p));
    playCubeCue(settings, "cubeTurn");
  };
  const stage = useStage(settings, pick, (v) => paint(v));

  // biome-ignore lint/correctness/useExhaustiveDependencies: 고른 것이 바뀌면 다시 놓는다
  useEffect(() => {
    if (stage.viewRef.current) paint(stage.viewRef.current, 380);
  }, [mode, lifted, paint]);

  useEffect(() => {
    if (!passed && seenPiece && lifted !== null) {
      setPassed(true);
      playCubeCue(settings, "cubeSolved");
      onPassed();
    }
  }, [passed, seenPiece, lifted, settings, onPassed]);

  const marks = useMemo(
    () =>
      lifted === null ? null : marksForSlots(N, SOLVED, [[lifted, "pick"]]),
    [lifted],
  );

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-act="parts"
      data-act-passed={passed ? "" : undefined}
      data-parts-mode={mode}
    >
      <fieldset
        aria-label="보기"
        className="flex rounded-lg bg-white/10 p-0.5 text-sm"
      >
        {(
          [
            ["sticker", "스티커로 보기"],
            ["piece", "조각으로 보기"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            data-parts-to={m}
            aria-pressed={mode === m}
            onClick={(e) => {
              setMode(m);
              if (m === "piece") setSeenPiece(true);
              e.currentTarget.blur();
            }}
            className={cn(
              "rounded-md px-3 py-1",
              mode === m && "bg-white/20 font-semibold",
            )}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <p
        role="status"
        className={cn(
          "min-h-7 rounded-full px-4 py-1 text-center text-sm",
          passed
            ? "border border-emerald-400/50 bg-emerald-400/15 font-bold text-emerald-300"
            : "text-white/70",
        )}
      >
        {lifted !== null
          ? `그 칸은 ${pieceLabel(lifted)}의 한 면이에요. 조각째 함께 들려요.`
          : mode === "sticker"
            ? "칸 54장이 따로 떠 있는 것 같지만… 칸 하나를 눌러 보세요."
            : "26조각이에요. 색이 조각별로 묶여 있어요. 칸을 눌러 들어 보세요."}
      </p>
      <Stage
        stage={stage}
        label="칸을 누르면 그 조각을 들어요. 끌면 둘러볼 수 있어요."
        net={
          <CubeNet
            n={N}
            faces={faceGrid(N, SOLVED, null)}
            colors={settings.colors}
            hidden={settings.hidden}
            className="h-auto w-full"
            onCell={pick}
            marks={marksAtSlots(SOLVED, marks)}
          />
        }
      />
    </div>
  );
}

// ── 분해·조립 ────────────────────────────────────────────

/** 지금 끼울 종류의 빈자리 */
function ghostsOf(s: BuildState): number[] {
  if (s.phase !== "centers" && s.phase !== "edges" && s.phase !== "corners")
    return [];
  return buildOrder()[s.phase].filter((p) => !s.placed.includes(p));
}

/** 끼운 조각만 색, 빈자리 표시는 색 없이 하늘색 테 */
function stickersOf(s: BuildState) {
  return stickersFromState(
    N,
    SOLVED,
    maskFromPieces(N, s.placed),
    marksForSlots(
      N,
      SOLVED,
      ghostsOf(s).map((p) => [p, "pick"] as const),
    ),
  );
}

/**
 * 가상 분해·조립: 맞춘 큐브 → 분해(조각이 흩어지고 축만 남음) → 가운데 6(흰 위·초록 앞을 잡고 넷을 고름)
 * → 모서리 12(둘을 고르고 나머지) → 꼭짓점 8(하나를 고르고 나머지) → 끝(흩었다 모으기, 둘러보기)
 */
export function BuildPanel({
  settings,
  onPassed,
}: {
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const [b, setB] = useState<BuildState>(BUILD_START);
  const [say, setSay] = useState<{ text: string; ok: boolean } | null>(null);
  const [mirror, setMirror] = useState(false);
  const live = useRef({ b, onPassed });
  live.current = { b, onPassed };
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  /** 끼운 조각만 제자리, 나머지는 바깥으로 흩어져 안 보인다 */
  const layoutFor = useCallback(
    (state: BuildState, spread?: number) =>
      (home: readonly [number, number, number]): PieceLayout => {
        const p = pieceOfHome(home);
        const placed = p !== undefined && state.placed.includes(p);
        if (spread !== undefined) return { shift: scaleVec(home, spread) };
        if (placed) return { shift: [0, 0, 0] };
        // 지금 끼울 종류의 빈자리는 작은 자리 표시(하늘색 테)로 남긴다
        if (p !== undefined && ghostsOf(state).includes(p))
          return { shift: [0, 0, 0], scale: 0.42 };
        return { shift: scaleVec(home, 1.4), scale: 0 };
      },
    [],
  );

  const paint = useCallback(
    (view: CubeView, ms = 0) => {
      const s = live.current.b;
      view.setStickers(stickersOf(s));
      view.setCore(s.phase !== "whole");
      view.setLayout(layoutFor(s), ms);
    },
    [layoutFor],
  );

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const update = (next: BuildState) => {
    setB(next);
    live.current.b = next;
    const view = stage.viewRef.current;
    if (view) {
      view.setStickers(stickersOf(next));
      view.setCore(next.phase !== "whole");
      view.setLayout(layoutFor(next), 450);
    }
    if (next.phase === "done" && b.phase !== "done") {
      // 다 끼우면 처음 각으로 돌아와 맞춘 모습을 보인다
      view?.resetView();
      playCubeCue(settings, "cubeSolved");
      live.current.onPassed();
    }
  };

  const tap = (sticker: number) => {
    const slot = TOPO.stickers[sticker]?.piece;
    const cur = live.current.b;
    if (slot === undefined || !buildAsks(cur)) return;
    const r = buildTap(cur, slot);
    setSay({ text: buildSay(r.verdict, cur), ok: r.verdict.kind === "ok" });
    setMirror(r.verdict.kind === "mirror");
    if (r.verdict.kind === "ok") {
      playCubeCue(settings, "cubeTurn");
      update(r.state);
    } else playCubeCue(settings, "invalid");
  };
  // 아래·뒤 빈자리를 끌어 돌려 본 채로 누를 수 있게, 손을 떼도 보기를 남긴다(휴대폰은 돌아가는 사이에 누를 수 없었다)
  const stage = useStage(settings, tap, (v) => paint(v), true);

  const takeApart = () => {
    const view = stage.viewRef.current;
    // 먼저 조각이 벌어진 뒤 흩어져 사라진다
    if (view) {
      view.setCore(true);
      view.setLayout(layoutFor(b, 1.1), 500);
    }
    setSay(null);
    later(view ? 560 : 0, () => update(buildTakeApart()));
  };
  const scatter = () => {
    const view = stage.viewRef.current;
    if (!view) return;
    view.setLayout(layoutFor(b, 1.2), 500);
    later(900, () => view.setLayout(layoutFor(live.current.b), 600));
  };

  const next = buildNext(b);
  const count = buildCount(b);
  const asks = buildAsks(b);
  const mask = useMemo(() => maskFromPieces(N, b.placed), [b.placed]);

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-act="build"
      data-act-passed={b.phase === "done" ? "" : undefined}
      data-build-phase={b.phase}
    >
      <p className="break-keep text-center text-white/50 text-xs">
        이것은 구조 보기예요. 실물 큐브의 분해·조립은 제품 설명서대로 하세요.
      </p>
      <div className="flex min-h-9 flex-wrap items-center justify-center gap-2 text-sm">
        {b.phase === "whole" && (
          <button
            type="button"
            data-build-start
            onClick={takeApart}
            className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black"
          >
            분해하기
          </button>
        )}
        {b.phase === "core" && (
          <>
            <span className="break-keep text-white/80">
              가운데에는 축이 있어요. 실물은 가운데 뚜껑 안 나사로 조이고 풀 수
              있어요.
            </span>
            <button
              type="button"
              data-build-next
              onClick={() => update(buildBegin(b))}
              className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black"
            >
              센터 블럭 끼우기
            </button>
          </>
        )}
        {count.total > 0 && (
          <span
            data-build-count={`${count.done}/${count.total}`}
            className="rounded-full bg-sky-400 px-3 py-1 font-bold font-mono text-black tabular-nums"
          >
            {PART_NAME[b.phase as keyof typeof PART_NAME]} {count.done} /{" "}
            {count.total}
          </span>
        )}
        {asks && next !== null && (
          <span className="break-keep" data-build-ask={next}>
            다음 블럭 <Swatches piece={next} settings={settings} />{" "}
            {topic(blockLabel(next))} 어디에? 빈자리를 눌러요.
          </span>
        )}
        {b.phase === "centers" && (
          <span
            data-build-pairs
            className="break-keep rounded-lg bg-white/5 px-2 py-1 text-white/70 text-xs"
          >
            맞은편 짝{" "}
            {PAIRS.map(([a, z], i) => (
              <span key={a} className="whitespace-nowrap">
                {i > 0 && " · "}
                <Chip face={a} settings={settings} />↔
                <Chip face={z} settings={settings} />
              </span>
            ))}{" "}
            · 흰색 위·초록색 앞이면 빨간색은 오른쪽
          </span>
        )}
        {!asks && next !== null && (
          <button
            type="button"
            data-build-fill
            onClick={() => {
              setSay(null);
              update(buildFill(b));
            }}
            className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black"
          >
            나머지 {PART_NAME[b.phase as keyof typeof PART_NAME]} 끼우기
          </button>
        )}
        {b.phase === "done" && (
          <>
            <button
              type="button"
              data-build-scatter
              onClick={scatter}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
            >
              흩었다 모으기
            </button>
            <button
              type="button"
              onClick={() => {
                setSay(null);
                update(BUILD_START);
              }}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
            >
              처음부터
            </button>
          </>
        )}
      </div>
      {say && (
        <p
          role="status"
          data-build-say={say.ok ? "ok" : "no"}
          className={cn(
            "max-w-md break-keep rounded-lg px-3 py-1.5 text-center text-sm",
            say.ok ? "text-emerald-300" : "bg-red-500/15 text-red-200",
          )}
        >
          {say.text}
          {mirror && (
            <>
              {" "}
              <a href="/cube/math" className="underline">
                큐브의 수학에서 더 보기
              </a>
            </>
          )}
        </p>
      )}
      {b.phase === "done" && (
        <p className="max-w-md break-keep text-center text-emerald-300 text-sm">
          다 끼웠어요! 조각을 뒤집거나 돌려 끼우면 맞출 수 없는 큐브가 돼요.
          뽑아서 아무렇게나 다시 끼우면 12번에 1번만 맞출 수 있어요.{" "}
          <a href="/cube/math" className="underline">
            까닭 보기
          </a>
        </p>
      )}
      <Stage
        stage={stage}
        label="빈자리를 눌러 끼워요. 끌어 돌린 각도는 그대로 남아요."
        net={
          <CubeNet
            n={N}
            faces={faceGrid(N, SOLVED, mask)}
            colors={settings.colors}
            hidden={settings.hidden}
            className="h-auto w-full"
            onCell={tap}
          />
        }
      />
      {stage.ready && b.phase !== "whole" && b.phase !== "done" && (
        <button
          type="button"
          data-build-home-view
          onClick={() => stage.viewRef.current?.resetView()}
          className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
        >
          처음 각도로
        </button>
      )}
    </div>
  );
}

/** 가운데 맞은편 짝(면 차례 U R F D L B): 흰↔노랑, 초록↔파랑, 빨강↔주황 */
const PAIRS = [
  [0, 3],
  [2, 5],
  [1, 4],
] as const;

function Chip({ face, settings }: { face: number; settings: CubeSettings }) {
  return (
    <span
      title={BUILD_COLOR[face]}
      className="mx-0.5 inline-block h-3 w-3 rounded-sm border border-black/40 align-middle"
      style={{ background: hexColor(settings.colors[face] ?? 0) }}
    />
  );
}
