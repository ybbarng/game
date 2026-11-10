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
import { Big, Lead, Notation, Pill, Source } from "./ui";

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
        지금까지는 큐브에서 나올 수 있는 모양을 세고, 그 모양들이 지키는 규칙을
        봤어요. 이번에는 섞인 큐브를 가장 짧게 풀면 몇 수가 드는지 봐요.
      </Lead>
      <Lead>
        반 바퀴 R2도 한 수로 세면, 3×3을 아무리 섞어도 가장 짧게 푸는 길은
        20수를 넘지 않아요. 모든 길을 다 아는 신이 풀어도 드는 수라서 이 20을
        「신의 수」라고 불러요. 90° 돌리기만 한 수로 세어 R2를 두 수로 치면
        26수예요.
      </Lead>
      <Notation />
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
        가장 짧게 풀어도 꼭 20수가 드는 모양 가운데 하나가 「슈퍼플립」이에요.
        모든 엣지 블럭이 제자리에서 뒤집혀 있어요. 아래 20수 공식으로 만들 수
        있어요.
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
          직접 해 보기
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
          <Lead>
            맞춘 큐브에서 아래 20수를 왼쪽부터 차례로 돌리면 슈퍼플립이 돼요.
          </Lead>
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
        20수는 2010년 Tomas Rokicki, Herbert Kociemba, Morley Davidson, John
        Dethridge가 컴퓨터로 증명했어요. 90°만 세는 26수는 2014년 Rokicki와
        Davidson이 증명했어요. 슈퍼플립에 꼭 20수가 든다는 것은 1995년 Michael
        Reid가 보였어요.
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
        앞 카드에서는 20수 공식 하나로 슈퍼플립을 만들었어요. 이번에는 짧은 수
        묶음 하나를 되풀이하면 어떻게 되는지 봐요.
      </Lead>
      <Lead>
        맞춘 큐브에 R U R' U' 같은 수 묶음을 계속 되풀이하면 언젠가 반드시 처음
        모양으로 돌아와요. 모양의 수가 정해져 있으니 되풀이하다 보면 언젠가는
        앞에서 본 모양을 다시 만나요. 그런데 수는 모두 거꾸로 되돌릴 수 있어요.
        처음 모양을 0번째, 묶음을 한 번 한 모양을 1번째라고 세 볼게요. 처음 겹친
        것이 5번째와 9번째처럼 둘 다 중간 모양이라고 해 봐요. 둘을 한 묶음씩
        되돌린 4번째와 8번째도 같은 모양이어야 하니, 그보다 먼저 이미 겹쳤다는
        말이 돼서 앞뒤가 안 맞아요. 그래서 처음 겹치는 것은 늘 0번째, 곧 처음
        모양이에요. 돌아오는 데 드는 횟수를 그 묶음의 「차수」라고 해요.
      </Lead>
      <Notation />
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
                : "읽을 수 없는 표기예요.",
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
        {alg === "R U" ? "" : "예를 들어 "}R U를 한 번 하면 엣지 블럭 7개가 한
        칸씩 자리를 옮기며 한 바퀴 돌아요. 그래서 7번마다 제자리에 와요. 코너
        블럭은 6개가 바뀌어요. 5개는 이렇게 도는데, 5번 해서 한 바퀴 돌고 나면
        방향이 비틀려 있어서 세 바퀴인 15번마다 제자리에 바른 방향으로 와요.
        나머지 1개는 제자리에서 비틀리기만 해서 3번마다 바른 방향으로 와요. 모두
        함께 맞는 건 7, 15, 3으로 모두 나누어떨어지는 가장 작은 수인
        105번째예요. 이런 수를 최소공배수라고 해요.
      </Lead>
      <Source>
        3×3에서 가장 큰 차수는 1260이에요. R U2 D' B D'가 한 예예요.
      </Source>
    </div>
  );
}

/** 교환자와 켤레: A B A' B'가 조금만 바꾸는 까닭 */
export function CommutatorCard({ settings }: { settings: CubeSettings }) {
  const [i, setI] = useState(2);
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
        앞 카드에서는 묶음 하나를 되풀이했어요. 이번에는 두 묶음을 엮어 조각 몇
        개만 옮기는 방법을 봐요.
      </Lead>
      <Lead>
        A와 B를 수 묶음 둘이라고 할게요. A를 거꾸로 되돌리는 것을 A'라고 써요.
        A를 하고, B를 하고, A를 되돌리고, B를 되돌리는 A B A' B' 꼴을
        「교환자」라고 해요. A와 B가 함께 움직이는 조각이 적을수록 적게
        바뀌어요. 조각 몇 개만 옮기는 공식 대부분이 이렇게 만들어져요.
      </Lead>
      <Notation />
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
            코너 블럭 {corner} · 엣지 블럭 {edge}
          </span>
        </Big>
        <p className="break-keep text-white/60 text-xs">
          코너 블럭 8개와 엣지 블럭 12개, 모두 20개 가운데 바뀐 조각 수예요.
          {ex.note ? ` ${ex.note}` : ""}
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
        「켤레」는 A B A' 꼴이에요. A로 조각을 B가 일하는 자리로 옮기고, B를
        하고, A'로 되돌려 놓아요. 예를 들어 {conjugate("R", "U")}는 R로
        앞-오른쪽 줄의 조각을 윗면으로 올려 U로 함께 돌린 뒤, R'로 오른쪽 면을
        되돌려 놓아요. 공식이 다루는 자리와 바꾸고 싶은 조각의 자리가 다를 때 이
        꼴을 써요. A는 바꾸고 싶은 조각을 공식이 다루는 자리로 옮기는 수
        묶음이에요. A가 다른 조각을 함께 옮겨도 괜찮아요. 공식 B가 건드리지 않은
        조각은 A'가 모두 제자리로 되돌려 놓아요.
      </Lead>
      <Source>바뀐 조각 수는 이 페이지가 직접 돌려 세어요.</Source>
    </div>
  );
}
