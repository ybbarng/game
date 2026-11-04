"use client";

import {
  applyMove,
  applyMoves,
  type CubeMove,
  invertMove,
  NotationError,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Command } from "../../input";
import {
  COMMUTATOR_EXAMPLES,
  ORDER_PRESETS,
  SUPERFLIP,
} from "../../math/examples";
import {
  changedPieces,
  commutator,
  conjugate,
  orderOf,
  stateAfter,
} from "../../math/pieces";
import type { CubeSettings } from "../../settings";
import type { CubeView } from "../../view";
import { CubePlay } from "../CubePlay";
import { DemoCube } from "../DemoCube";
import { StateCube } from "./StateCube";
import { Big, Lead, Pill, Source } from "./ui";

const N = 3;

const samePerm = (a: PuzzleState, b: PuzzleState) =>
  a.perm.every((v, i) => v === b.perm[i]);

/** 신의 수: 슈퍼플립을 보고 직접 쳐 본다 */
export function GodCard({ settings }: { settings: CubeSettings }) {
  const start = useMemo(() => solvedCube(N), []);
  const goal = useMemo(() => stateAfter(N, SUPERFLIP), []);
  const [mode, setMode] = useState<"watch" | "try">("watch");
  const [state, setState] = useState(start);
  const [token, setToken] = useState(0);
  const [done, setDone] = useState(false);
  const live = useRef({ state: start, history: [] as CubeMove[] });

  const onMove = useCallback(
    (m: CubeMove) => {
      const c = live.current;
      const next = applyMove(N, c.state, m);
      live.current = { state: next, history: [...c.history, m] };
      setState(next);
      if (samePerm(next, goal)) setDone(true);
      return true;
    },
    [goal],
  );
  const onCommand = useCallback(
    (cmd: Command): CubeMove | null => {
      const c = live.current;
      if (cmd === "undo") {
        const last = c.history.at(-1);
        if (!last) return null;
        const back = invertMove(last);
        live.current = {
          state: applyMove(N, c.state, back),
          history: c.history.slice(0, -1),
        };
        setState(live.current.state);
        return back;
      }
      if (cmd === "reset" || cmd === "scramble") {
        live.current = { state: start, history: [] };
        setState(start);
        setDone(false);
        setToken((t) => t + 1);
      }
      return null;
    },
    [start],
  );
  const tokens = SUPERFLIP.split(" ");
  const typed = live.current.history.length;

  return (
    <div className="flex flex-col gap-3">
      <Lead>
        어떤 섞인 3×3도 20수 안에 풀 수 있어요(반 바퀴도 한 수로 셀 때). 이 20을
        「신의 수」라고 불러요. 90°만 한 수로 세면 26수예요.
      </Lead>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-black/30 p-2">
          <p className="text-white/60 text-xs">3×3</p>
          <Big>20 / 26</Big>
        </div>
        <div className="rounded-xl bg-black/30 p-2">
          <p className="text-white/60 text-xs">2×2</p>
          <Big>11 / 14</Big>
        </div>
      </div>
      <p className="text-center text-white/50 text-xs">
        반 바퀴도 한 수 / 90°만 한 수
      </p>
      <Lead>
        정확히 20수가 드는 모양 가운데 하나가 「슈퍼플립」이에요. 모든 모서리가
        제자리에서 뒤집혀 있어요.
      </Lead>
      <div className="flex gap-1.5">
        <Pill active={mode === "watch"} onClick={() => setMode("watch")}>
          시연 보기
        </Pill>
        <Pill
          active={mode === "try"}
          onClick={() => setMode("try")}
          attr={{ "data-god-try": "" }}
        >
          직접 쳐 보기
        </Pill>
      </div>
      {mode === "watch" ? (
        <div className="mx-auto w-full max-w-xs">
          <DemoCube
            n={N}
            start={start}
            alg={SUPERFLIP}
            mask={null}
            settings={settings}
            tps={3}
          />
        </div>
      ) : (
        <>
          <p className="flex flex-wrap justify-center gap-1 font-mono text-sm">
            {tokens.map((t, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                key={`${i}-${t}`}
                className={
                  i < typed
                    ? "rounded bg-white/15 px-1"
                    : "rounded bg-white/5 px-1"
                }
              >
                {t}
              </span>
            ))}
          </p>
          {done && (
            <p
              role="status"
              data-god-done
              className="text-center font-bold text-emerald-300"
            >
              슈퍼플립 완성! 이 모양은 20수보다 짧게는 못 풀어요.
            </p>
          )}
          <CubePlay
            n={N}
            state={state}
            mask={null}
            syncToken={token}
            settings={settings}
            onMove={onMove}
            onCommand={onCommand}
          />
        </>
      )}
      <Source>
        20수: 2010년 Tomas Rokicki, Herbert Kociemba, Morley Davidson, John
        Dethridge가 컴퓨터로 증명. 26수(90°만): 2014년 Rokicki·Davidson.
        슈퍼플립에 꼭 20수가 든다는 것은 1995년 Michael Reid가 보였어요.
      </Source>
    </div>
  );
}

/** 되풀이하면 돌아온다: 묶음을 고르거나 쳐 넣으면 몇 번에 돌아오는지 계산하고 빨리 감아 보인다 */
export function OrderCard({ settings }: { settings: CubeSettings }) {
  const [alg, setAlg] = useState(ORDER_PRESETS[2]?.alg ?? "R U R' U'");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [token, setToken] = useState(0);
  const viewRef = useRef<CubeView | null>(null);
  const moves = useMemo(() => parseMoves(N, alg), [alg]);
  const order = useMemo(() => orderOf(N, moves), [moves]);
  const [state, setState] = useState<PuzzleState>(() => solvedCube(N));
  const stateRef = useRef(state);
  const restart = () => {
    stateRef.current = solvedCube(N);
    setState(stateRef.current);
    setToken((t) => t + 1);
  };

  const choose = (next: string) => {
    setAlg(next);
    setCount(0);
    setPlaying(false);
    restart();
  };

  // 빨리 감기: 짧으면 수마다 돌리고, 길면 한 번씩 건너뛰며 칠한다
  const totalMoves = (order ?? 0) * moves.length;
  const animate = totalMoves <= 120;
  useEffect(() => {
    if (!playing || order === null) return;
    if (count >= order) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(
      () => {
        const next = applyMoves(N, stateRef.current, moves);
        stateRef.current = next;
        setState(next);
        if (animate && viewRef.current) {
          for (const m of moves) viewRef.current.enqueue(m);
        } else {
          setToken((t) => t + 1);
        }
        setCount((c) => c + 1);
      },
      animate ? moves.length * 70 : order > 300 ? 4 : 30,
    );
    return () => window.clearTimeout(id);
  }, [playing, count, order, moves, animate]);

  return (
    <div className="flex flex-col gap-3">
      <Lead>
        같은 수 묶음을 계속 되풀이하면 언젠가 반드시 처음 모양으로 돌아와요.
        모양의 수가 정해져 있으니 언젠가는 같은 모양을 다시 만나기 때문이에요.
        돌아오는 데 드는 횟수를 그 묶음의 「차수」라고 해요.
      </Lead>
      <div className="flex flex-wrap gap-1.5">
        {ORDER_PRESETS.map((p) => (
          <Pill
            key={p.alg}
            active={p.alg === alg}
            onClick={() => choose(p.alg)}
            attr={{ "data-order-preset": p.alg }}
          >
            {p.alg}
          </Pill>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const ms = parseMoves(N, text);
            if (ms.length === 0) return;
            setError(null);
            choose(text.trim());
          } catch (err) {
            setError(
              err instanceof NotationError
                ? err.message
                : "읽을 수 없는 표기예요",
            );
          }
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="직접 쓰기: 예) F R' U2"
          data-order-input
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-white/15 px-3 py-1.5 text-sm"
        >
          계산
        </button>
      </form>
      {error && <p className="text-red-300 text-xs">{error}</p>}
      <div className="rounded-xl bg-black/30 p-3 text-center">
        <p className="font-mono text-sky-200 text-sm">{alg}</p>
        <Big>
          <span data-order-value>{order ?? "너무 커요"}</span>
          <span className="text-base">번</span>
        </Big>
      </div>
      <div className="flex flex-col items-center gap-2">
        <StateCube
          n={N}
          state={state}
          syncToken={token}
          settings={settings}
          moveMs={60}
          onView={(v) => {
            viewRef.current = v;
          }}
        />
        <p className="font-mono text-sm" data-order-count={count}>
          {count} / {order ?? "?"}번
          {order !== null && count === order && " · 처음 모양!"}
        </p>
        <div className="flex gap-1.5 text-sm">
          <button
            type="button"
            data-order-play
            onClick={() => {
              if (order !== null && count >= order) {
                setCount(0);
                restart();
              }
              setPlaying((p) => !p);
            }}
            className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black"
          >
            {playing ? "⏸ 멈춤" : "▶ 끝까지 빨리 감기"}
          </button>
          <button
            type="button"
            onClick={() => choose(alg)}
            className="rounded-lg bg-white/10 px-3 py-1.5"
          >
            처음으로
          </button>
        </div>
      </div>
      <Lead>
        R U는 모서리 7개가 한 고리로 돌아 7번마다 제자리에 오고, 꼭짓점 5개는 한
        고리로 돌면서 비틀려 15번마다 제자리에 와요. 둘이 함께 맞는 건 7과 15의
        최소공배수인 105번째예요.
      </Lead>
      <Source>3×3에서 가장 큰 차수는 1260이에요(R U2 D' B D'가 한 예).</Source>
    </div>
  );
}

/** 교환자와 켤레: A B A' B'가 조금만 바꾸는 까닭 */
export function CommutatorCard({ settings }: { settings: CubeSettings }) {
  const [i, setI] = useState(3);
  const ex = COMMUTATOR_EXAMPLES[i] ?? COMMUTATOR_EXAMPLES[0];
  const start = useMemo(() => solvedCube(N), []);
  const alg = ex ? commutator(ex.a, ex.b) : "";
  const changed = useMemo(() => changedPieces(N, stateAfter(N, alg)), [alg]);
  if (!ex) return null;
  const corner = changed.corner ?? 0;
  const edge = changed.edge ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <Lead>
        A를 하고, B를 하고, A를 되돌리고, B를 되돌리는 꼴(A B A' B')을
        「교환자」라고 해요. A와 B가 겹치는 조각이 적을수록 적게 바뀌어요. 공식
        대부분이 이렇게 만들어져요.
      </Lead>
      <div className="flex flex-wrap gap-1.5">
        {COMMUTATOR_EXAMPLES.map((e, k) => (
          <Pill
            key={`${e.a}|${e.b}`}
            active={k === i}
            onClick={() => setI(k)}
            attr={{ "data-comm": String(k) }}
          >
            A={e.a}, B={e.b}
          </Pill>
        ))}
      </div>
      <div className="rounded-xl bg-black/30 p-3 text-center">
        <p className="font-mono text-sky-200 text-sm">{alg}</p>
        <Big>
          <span data-comm-changed={corner + edge}>
            꼭짓점 {corner} · 모서리 {edge}
          </span>
        </Big>
        <p className="text-white/60 text-xs">
          바뀐 조각(20개 중){ex.note ? ` · ${ex.note}` : ""}
        </p>
      </div>
      <div className="mx-auto w-full max-w-xs">
        <DemoCube
          key={alg}
          n={N}
          start={start}
          alg={alg}
          mask={null}
          settings={settings}
          tps={2}
        />
      </div>
      <Lead>
        「켤레」는 A B A' 꼴이에요. A로 조각을 B가 일하기 좋은 자리로 옮기고,
        B를 하고, A로 되돌려 놓아요. 예를 들어 {conjugate("R", "U")}는 U가 하는
        일을 다른 자리에서 해요.
      </Lead>
      <Source>바뀐 조각 수는 이 페이지의 큐브 엔진이 세어요.</Source>
    </div>
  );
}
