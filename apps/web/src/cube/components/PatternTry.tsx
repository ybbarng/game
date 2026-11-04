"use client";

import {
  applyMove,
  type CubeMove,
  invertMove,
  isRotation,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid } from "../bridge";
import type { Command } from "../input";
import { algTokens } from "../learn";
import { patternState, samePattern } from "../patterns/shape";
import type { CubeSettings } from "../settings";
import { CubeNet } from "./CubeNet";
import { CubePlay, playCubeCue } from "./CubePlay";

/**
 * 패턴 「직접 만들어 보기」. 맞춘 큐브에서 내 키로 공식을 쳐서 그 모양을 만들면 통과.
 * 채점은 결과 색 배치로 한다(`samePattern`): 큐브 전체 방향이 달라도, 다른 공식으로 만들어도 모양이 같으면 통과.
 */
export function PatternTry({
  n,
  alg,
  settings,
}: {
  n: number;
  alg: string;
  settings: CubeSettings;
}) {
  const solved = useMemo(() => solvedCube(n), [n]);
  const target = useMemo(() => patternState(n, alg), [n, alg]);
  const tokens = useMemo(() => algTokens(alg), [alg]);
  const [state, setState] = useState<PuzzleState>(solved);
  const [history, setHistory] = useState<CubeMove[]>([]);
  const [passed, setPassed] = useState(false);
  const [syncToken, setSyncToken] = useState(0);

  const live = useRef({ state, history, passed, settings });
  live.current = { state, history, passed, settings };

  const reset = useCallback(() => {
    live.current.state = solved;
    live.current.history = [];
    live.current.passed = false;
    setState(solved);
    setHistory([]);
    setPassed(false);
    setSyncToken((t) => t + 1);
  }, [solved]);

  const onMove = useCallback(
    (move: CubeMove) => {
      const c = live.current;
      const next = applyMove(n, c.state, move);
      c.state = next;
      c.history = [...c.history, move];
      setState(next);
      setHistory(c.history);
      if (!c.passed && samePattern(n, next, target)) {
        c.passed = true;
        setPassed(true);
        playCubeCue(c.settings, "cubeSolved");
      }
      return true;
    },
    [n, target],
  );

  const onCommand = useCallback(
    (cmd: Command): CubeMove | null => {
      const c = live.current;
      if (cmd === "undo") {
        const last = c.history.at(-1);
        if (!last) return null;
        const back = invertMove(last);
        c.state = applyMove(n, c.state, back);
        c.history = c.history.slice(0, -1);
        setState(c.state);
        setHistory(c.history);
        return back;
      }
      if (cmd === "reset" || cmd === "scramble") reset();
      return null;
    },
    [n, reset],
  );

  const turns = history.filter((m) => !isRotation(n, m)).length;
  return (
    <div
      className="flex flex-col items-center gap-3"
      data-pattern-try
      data-pattern-passed={passed ? "" : undefined}
    >
      <div className="flex w-full flex-wrap items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <span className="text-white/60 text-xs">만들 모양</span>
          <CubeNet
            n={n}
            faces={faceGrid(n, target)}
            colors={settings.colors}
            hidden={settings.hidden}
            className="h-auto w-36"
          />
        </div>
        <div className="flex max-w-sm flex-col gap-2 text-sm">
          <p className="text-white/80">
            맞춘 큐브에서 이 공식을 차례로 쳐 보세요. 다른 순서로 만들어도
            모양만 같으면 통과예요.
          </p>
          <p
            className="flex flex-wrap gap-1 font-mono"
            title="공식"
            data-pattern-alg={alg}
          >
            {tokens.map((t, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                key={`${i}-${t}`}
                className="rounded bg-white/10 px-1.5"
              >
                {t}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-center gap-2">
        {passed ? (
          <span
            role="status"
            data-pattern-pass
            className="rounded-full border border-emerald-400/50 bg-emerald-400/15 px-4 py-1 font-bold text-emerald-300"
          >
            완성! 같은 모양이에요 ({turns}수)
          </span>
        ) : (
          <span className="text-white/60 text-xs">
            친 수 {turns} / 공식 {tokens.length}수
          </span>
        )}
        <button
          type="button"
          data-pattern-reset
          onClick={(e) => {
            reset();
            e.currentTarget.blur();
          }}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm",
            passed
              ? "bg-sky-500 font-semibold text-black"
              : "bg-white/10 hover:bg-white/15",
          )}
        >
          맞춘 큐브로 되돌리기(Esc)
        </button>
      </div>

      <CubePlay
        n={n}
        state={state}
        mask={null}
        syncToken={syncToken}
        settings={settings}
        onMove={onMove}
        onCommand={onCommand}
      />
    </div>
  );
}
