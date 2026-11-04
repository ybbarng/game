"use client";

import {
  applyMove,
  applyMoves,
  type CubeMove,
  centerTwists,
  cornerTwists,
  cubeTopology,
  edgeFlips,
  invertMove,
  parseMoves,
  pieceName,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import type { Command } from "../../input";
import { COUNT_PLANS, groupDigits } from "../../math/counts";
import { CENTER_HALF_TURN } from "../../math/examples";
import { invariants, isFaceTurn } from "../../math/pieces";
import { type CubeSettings, hexColor } from "../../settings";
import { CubePlay } from "../CubePlay";
import { Lead, Meter, Quiz, Source } from "./ui";

const N = 3;

/** 방향과 짝: 직접 돌리는 동안 계기가 바뀌어도 규칙은 늘 지켜진다. 가운데 방향(그림 큐브)까지 */
export function OrientCard({ settings }: { settings: CubeSettings }) {
  const [state, setState] = useState<PuzzleState>(() => solvedCube(N));
  const [token, setToken] = useState(0);
  const [moves, setMoves] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const live = useRef({ state, history: [] as CubeMove[] });

  const set = (s: PuzzleState, history: CubeMove[]) => {
    live.current = { state: s, history };
    setState(s);
    setMoves(history.length);
  };

  const onMove = useCallback((m: CubeMove) => {
    if (!isFaceTurn(N, m)) {
      setBlocked(true);
      return false;
    }
    setBlocked(false);
    const c = live.current;
    const next = applyMove(N, c.state, m);
    live.current = { state: next, history: [...c.history, m] };
    setState(next);
    setMoves(c.history.length + 1);
    return true;
  }, []);

  const onCommand = useCallback((cmd: Command): CubeMove | null => {
    const c = live.current;
    if (cmd === "undo") {
      const last = c.history.at(-1);
      if (!last) return null;
      const back = invertMove(last);
      const next = applyMove(N, c.state, back);
      live.current = { state: next, history: c.history.slice(0, -1) };
      setState(next);
      setMoves(c.history.length - 1);
      return back;
    }
    if (cmd === "reset" || cmd === "scramble") {
      live.current = { state: solvedCube(N), history: [] };
      setState(live.current.state);
      setMoves(0);
      setToken((t) => t + 1);
    }
    return null;
  }, []);

  const v = useMemo(() => invariants(N, state), [state]);
  const corners = useMemo(() => cornerTwists(N, state), [state]);
  const edges = useMemo(() => edgeFlips(N, state), [state]);
  const centers = useMemo(() => centerTwists(N, state), [state]);
  const topo = cubeTopology(N);
  const centerFace = (q: number) =>
    topo.stickers[topo.pieces[q]?.stickers[0] as number]?.face as number;
  const supercube = (COUNT_PLANS[3].total * 4n ** 6n) / 2n;

  return (
    <div className="flex flex-col gap-3">
      <Lead>
        조각마다 방향을 숫자로 재 봐요. 꼭짓점은 흰색·노란색 칸이 위나 아래를
        보면 0, 한쪽으로 한 칸 돌아가 있으면 1, 반대쪽이면 2예요. 모서리는
        흰색·노란색 칸(없으면 초록·파랑 칸)이 위·아래(가운데 층이면 앞·뒤)를
        보면 0, 아니면 1이에요.
      </Lead>
      <Lead>
        아래 큐브를 마음대로 돌려 보세요(면 돌리기만). 숫자는 바뀌어도 규칙은
        절대 안 깨져요.
      </Lead>

      <div
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-5"
        data-orient-meters
      >
        <Meter
          attr="twist"
          label="꼭짓점 비틀림 합"
          value={v.twistSum}
          rule="3의 배수"
          ok={v.twistSum % 3 === 0}
        />
        <Meter
          attr="flip"
          label="모서리 뒤집힘 합"
          value={v.flipSum}
          rule="짝수"
          ok={v.flipSum % 2 === 0}
        />
        <Meter
          attr="corner-parity"
          label="꼭짓점 자리 짝"
          value={v.cornerParity ? "홀수" : "짝수"}
          rule="모서리 짝과 같다"
          ok={v.cornerParity === v.edgeParity}
        />
        <Meter
          attr="edge-parity"
          label="모서리 자리 짝"
          value={v.edgeParity ? "홀수" : "짝수"}
          rule="꼭짓점 짝과 같다"
          ok={v.cornerParity === v.edgeParity}
        />
        <Meter
          attr="center"
          label="가운데 회전 합(90° 단위)"
          value={v.centerTurnSum}
          rule="홀짝이 꼭짓점 짝과 같다"
          ok={v.centerTurnSum % 2 === v.cornerParity}
        />
      </div>
      <p
        className="text-center text-white/60 text-xs"
        data-orient-moves={moves}
      >
        면 돌리기 {moves}수
        {blocked && (
          <span className="ml-2 text-amber-300">
            이 카드에서는 면 돌리기(R·L·U·D·F·B)만 써요
          </span>
        )}
      </p>

      <CubePlay
        n={N}
        state={state}
        mask={null}
        syncToken={token}
        settings={settings}
        onMove={onMove}
        onCommand={onCommand}
      />

      <div className="flex flex-col gap-2 rounded-xl bg-black/25 p-3 text-xs">
        <p className="text-white/70">조각마다 방향 값</p>
        <div className="flex flex-wrap gap-1">
          {corners.map((c) => (
            <span
              key={c.piece}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono",
                c.twist ? "bg-amber-400/80 text-black" : "bg-white/10",
              )}
            >
              {pieceName(N, c.piece)} {c.twist}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {edges.map((e) => (
            <span
              key={e.piece}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono",
                e.flip ? "bg-sky-400/80 text-black" : "bg-white/10",
              )}
            >
              {pieceName(N, e.piece)} {e.flip}
            </span>
          ))}
        </div>
        <p className="mt-1 text-white/70">
          가운데 칸 방향(그림이 있는 큐브라면 보이는 것)
        </p>
        <div className="flex flex-wrap gap-2" data-orient-centers>
          {centers.map((c) => (
            <CenterArrow
              key={c.piece}
              color={settings.colors[centerFace(c.piece)] ?? 0x888888}
              turns={c.twist}
            />
          ))}
        </div>
      </div>

      <Lead>
        면 하나를 90° 돌리면 그 면 가운데가 90° 돌고, 꼭짓점 4개와 모서리 4개가
        한 바퀴씩 돌아요(둘 다 맞바꾸기 3번 = 홀). 그래서 꼭짓점 짝, 모서리 짝,
        가운데 회전 합의 홀짝이 늘 함께 바뀌어요.
      </Lead>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-orient-center-alg
          onClick={() => {
            const s = applyMoves(
              N,
              live.current.state,
              parseMoves(N, CENTER_HALF_TURN),
            );
            const h = [
              ...live.current.history,
              ...parseMoves(N, CENTER_HALF_TURN),
            ];
            set(s, h);
            setToken((t) => t + 1);
          }}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm"
        >
          윗면 가운데만 180° 돌리는 공식 넣기
        </button>
        <code className="text-white/60 text-xs">{CENTER_HALF_TURN}</code>
      </div>
      <Quiz
        id="supercube"
        question="그림이 있는 큐브를 다 맞췄는데 가운데만 어긋났어요. 돌려서 절대 생기지 않는 모양은?"
        choices={[
          "가운데 하나만 90° 돌아간 것",
          "가운데 하나만 180° 돌아간 것",
          "가운데 둘이 90°씩 돌아간 것",
        ]}
        answer={0}
        why="다 맞췄으면 꼭짓점 짝이 짝이니, 가운데 회전 합도 짝수여야 해요. 90° 하나(합 1)는 안 되고, 180°(합 2)나 90° 둘(합 2)은 돼요."
      />
      <Lead>
        그래서 그림 큐브의 모양 수는 3×3의 4⁶ ÷ 2배,{" "}
        <b className="font-mono">{groupDigits(supercube)}</b>가지예요. 4×4
        이상은 가운데가 여러 칸이라 규칙이 달라요.
      </Lead>
      <Source>
        가운데 방향까지 맞추는 큐브를 「수퍼큐브」라고도 불러요. 계기 값은 이
        페이지의 큐브 엔진이 매 수마다 계산해요.
      </Source>
    </div>
  );
}

function CenterArrow({ color, turns }: { color: number; turns: number }) {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded border border-black/40"
      style={{ background: hexColor(color) }}
      data-center-turns={turns}
    >
      <span
        className="font-bold text-black text-lg leading-none"
        style={{ transform: `rotate(${turns * 90}deg)` }}
      >
        ↑
      </span>
    </span>
  );
}
