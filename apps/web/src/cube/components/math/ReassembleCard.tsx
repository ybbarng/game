"use client";

import {
  applyMoves,
  cubeTopology,
  parseMoves,
  pieceName,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid } from "../../bridge";
import { COUNT_PLANS, groupDigits, reassemblyCount } from "../../math/counts";
import { invariants, rotatePieceInPlace, swapPieces } from "../../math/pieces";
import type { CubeSettings } from "../../settings";
import { CubeNet } from "../CubeNet";
import { StateCube } from "./StateCube";
import { Big, Lead, Meter, Source } from "./ui";

const N = 3;
const FACES = ["R", "L", "U", "D", "F", "B"];
const SUFFIX = ["", "'", "2"];

function randomTurns(count: number): string {
  const out: string[] = [];
  let last = "";
  while (out.length < count) {
    const f = FACES[Math.floor(Math.random() * 6)] as string;
    if (f === last) continue;
    last = f;
    out.push(f + SUFFIX[Math.floor(Math.random() * 3)]);
  }
  return out.join(" ");
}

const pieceByName = (name: string) =>
  cubeTopology(N).pieces.findIndex((_, q) => pieceName(N, q) === name);

/** 뽑아서 다시 끼우기(중심 카드): 조각을 골라 뒤집거나 비틀거나 바꿔 끼우고, 돌려서 풀 수 있는지 맞힌다 */
export function ReassembleCard({ settings }: { settings: CubeSettings }) {
  const topo = cubeTopology(N);
  const [state, setState] = useState<PuzzleState>(() => solvedCube(N));
  const [token, setToken] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const [guess, setGuess] = useState<boolean | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const v = useMemo(() => invariants(N, state), [state]);
  const all = reassemblyCount(COUNT_PLANS[3].steps);
  const total = COUNT_PLANS[3].total;

  const update = (next: PuzzleState, what: string) => {
    setState(next);
    setToken((t) => t + 1);
    setGuess(null);
    setLog((l) => [...l, what].slice(-6));
  };
  const reset = () => {
    setPicked(null);
    setSwapFrom(null);
    setLog([]);
    setState(solvedCube(N));
    setToken((t) => t + 1);
    setGuess(null);
  };

  const kind = picked === null ? null : topo.pieces[picked]?.kind;
  const pick = (q: number) => {
    const k = topo.pieces[q]?.kind;
    if (k !== "corner" && k !== "edge") return;
    if (swapFrom !== null) {
      if (topo.pieces[swapFrom]?.kind === k && swapFrom !== q) {
        update(
          swapPieces(N, state, swapFrom, q),
          `${pieceName(N, swapFrom)} ↔ ${pieceName(N, q)} 맞바꾸기`,
        );
      }
      setSwapFrom(null);
      setPicked(q);
      return;
    }
    setPicked(q);
  };
  const marked = useMemo(
    () =>
      new Set(
        [picked, swapFrom].flatMap((q) =>
          q === null ? [] : [...(topo.pieces[q]?.stickers ?? [])],
        ),
      ),
    [picked, swapFrom, topo],
  );

  const flipRule = v.flipSum % 2 === 0;
  const twistRule = v.twistSum % 3 === 0;
  const parityRule = v.cornerParity === v.edgeParity;
  const solvable = v.solvable;

  return (
    <div className="flex flex-col gap-3">
      <Lead>
        돌려서 섞은 큐브는 언제나 다시 맞출 수 있어요. 그런데 큐브를 뜯어서
        조각을 아무렇게나 다시 끼우면 못 맞추는 큐브가 될 수 있어요. 얼마나
        자주일까요?
      </Lead>
      <div className="grid grid-cols-1 gap-1 rounded-xl bg-black/30 p-3 text-center sm:grid-cols-2">
        <div>
          <p className="text-white/60 text-xs">뽑아서 끼우는 방법</p>
          <p className="font-mono text-sm">8! × 3⁸ × 12! × 2¹²</p>
          <p className="break-all font-mono text-xs text-white/70">
            {groupDigits(all)}
          </p>
        </div>
        <div>
          <p className="text-white/60 text-xs">돌려서 닿는 모양</p>
          <p className="font-mono text-sm">8! × 3⁷ × 12! × 2¹¹ ÷ 2</p>
          <p className="break-all font-mono text-xs text-white/70">
            {groupDigits(total)}
          </p>
        </div>
        <Big className="sm:col-span-2">
          <span data-reassemble-ratio>{String(all / total)} = 2 × 3 × 2</span>
        </Big>
        <p className="text-sm text-white/80 sm:col-span-2">
          아무렇게나 끼우면 12개 중 1개만 맞출 수 있어요.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
        <Factor
          n="× 2"
          title="모서리 방향"
          rule="뒤집힘 합이 짝수"
          broken={!flipRule}
        />
        <Factor
          n="× 3"
          title="꼭짓점 방향"
          rule="비틀림 합이 3의 배수"
          broken={!twistRule}
        />
        <Factor
          n="× 2"
          title="자리 짝"
          rule="꼭짓점 짝 = 모서리 짝"
          broken={!parityRule}
        />
      </div>

      <Lead>
        직접 뽑아 보세요. 펼친 그림에서 조각을 누르고 뒤집거나 비틀거나 다른
        조각과 바꿔 끼워요.
      </Lead>
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
        <StateCube
          n={N}
          state={state}
          syncToken={token}
          settings={settings}
          className="relative aspect-square w-full max-w-[240px]"
        />
        <div className="flex w-full max-w-[280px] flex-col gap-2">
          <CubeNet
            n={N}
            faces={faceGrid(N, state)}
            colors={settings.colors}
            hidden={settings.hidden}
            onCell={(s) => pick(topo.stickers[s]?.piece as number)}
            marked={marked}
            className="h-auto w-full"
          />
          <p className="text-white/70 text-xs" data-reassemble-picked>
            {swapFrom !== null
              ? `${pieceName(N, swapFrom)}와 바꿀 ${topo.pieces[swapFrom]?.kind === "corner" ? "꼭짓점" : "모서리"}을 누르세요`
              : picked !== null
                ? `고른 조각: ${pieceName(N, picked)} (${kind === "corner" ? "꼭짓점" : "모서리"})`
                : "꼭짓점이나 모서리 칸을 누르세요"}
          </p>
          <div className="flex flex-wrap gap-1.5 text-sm">
            <button
              type="button"
              disabled={picked === null}
              data-op-rotate
              onClick={() =>
                picked !== null &&
                update(
                  rotatePieceInPlace(N, state, picked),
                  `${pieceName(N, picked)} ${kind === "corner" ? "비틀기" : "뒤집기"}`,
                )
              }
              className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black disabled:opacity-40"
            >
              {kind === "corner" ? "↻ 비틀어 끼우기" : "⇅ 뒤집어 끼우기"}
            </button>
            <button
              type="button"
              disabled={picked === null}
              data-op-swap
              onClick={() => setSwapFrom(picked)}
              className="rounded-lg bg-white/10 px-3 py-1.5 disabled:opacity-40"
            >
              ⇄ 다른 조각과 바꾸기
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <button
          type="button"
          data-op-preset="flip"
          onClick={() =>
            update(rotatePieceInPlace(N, state, pieceByName("UF")), "UF 뒤집기")
          }
          className="rounded-lg bg-white/10 px-2.5 py-1"
        >
          모서리 하나 뒤집기
        </button>
        <button
          type="button"
          onClick={() =>
            update(
              rotatePieceInPlace(N, state, pieceByName("UFR")),
              "UFR 비틀기",
            )
          }
          className="rounded-lg bg-white/10 px-2.5 py-1"
        >
          꼭짓점 하나 비틀기
        </button>
        <button
          type="button"
          onClick={() =>
            update(
              swapPieces(N, state, pieceByName("UF"), pieceByName("UR")),
              "UF ↔ UR 맞바꾸기",
            )
          }
          className="rounded-lg bg-white/10 px-2.5 py-1"
        >
          모서리 둘 맞바꾸기
        </button>
        <button
          type="button"
          data-op-turns
          onClick={() => {
            const alg = randomTurns(8);
            update(applyMoves(N, state, parseMoves(N, alg)), `돌리기 ${alg}`);
          }}
          className="rounded-lg bg-white/10 px-2.5 py-1"
        >
          8수 돌려 섞기
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-white/10 px-2.5 py-1"
        >
          처음으로
        </button>
      </div>
      {log.length > 0 && (
        <p className="break-keep text-[11px] text-white/50">
          한 일: {log.join(" → ")}
        </p>
      )}

      <div
        className="flex flex-col gap-2 rounded-xl bg-black/25 p-3"
        data-reassemble-guess
      >
        <p className="font-semibold text-sm">
          이 큐브, 돌려서 다시 맞출 수 있을까요?
        </p>
        <div className="flex gap-2">
          {[true, false].map((g) => (
            <button
              key={String(g)}
              type="button"
              data-guess={g ? "yes" : "no"}
              onClick={() => setGuess(g)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm",
                guess === g
                  ? g === solvable
                    ? "bg-emerald-500/30"
                    : "bg-red-500/30"
                  : "bg-white/5 hover:bg-white/10",
              )}
            >
              {g ? "맞출 수 있다" : "절대 못 맞춘다"}
            </button>
          ))}
        </div>
        {guess !== null && (
          <>
            <p
              role="status"
              className="text-sm"
              data-verdict={solvable ? "solvable" : "impossible"}
            >
              {guess === solvable ? "맞아요! " : "아쉬워요. "}
              {solvable
                ? "세 규칙을 모두 지켜서 돌려서 맞출 수 있어요."
                : "규칙을 어긴 게 있어서 아무리 돌려도 못 맞춰요. 다시 뽑아서 고쳐 끼워야 해요."}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <Meter
                label="모서리 뒤집힘 합"
                value={v.flipSum}
                rule="짝수"
                ok={flipRule}
              />
              <Meter
                label="꼭짓점 비틀림 합"
                value={v.twistSum}
                rule="3의 배수"
                ok={twistRule}
              />
              <Meter
                label="꼭짓점 짝 / 모서리 짝"
                value={`${v.cornerParity ? "홀수" : "짝수"} / ${v.edgeParity ? "홀수" : "짝수"}`}
                rule="같다"
                ok={parityRule}
              />
            </div>
          </>
        )}
      </div>
      <Lead>
        한 번 어긴 규칙은 같은 규칙을 한 번 더 어기면 풀려요. 모서리 둘을
        뒤집거나, 한 꼭짓점은 한 번·다른 꼭짓점은 두 번 비틀거나, 모서리 둘과
        꼭짓점 둘을 함께 바꿔 보세요.
      </Lead>
      <Source>
        세 규칙(방향 합, 짝)과 그것으로 12가 나오는 셈은 군론(되돌릴 수 있는
        움직임들의 모임을 다루는 수학)으로 증명돼요. 판정은 이 페이지의 큐브
        엔진이 해요.
      </Source>
    </div>
  );
}

function Factor({
  n,
  title,
  rule,
  broken,
}: {
  n: string;
  title: string;
  rule: string;
  broken: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border p-2",
        broken
          ? "border-red-400/70 bg-red-500/20"
          : "border-white/15 bg-white/5",
      )}
      data-factor-broken={broken ? "" : undefined}
    >
      <b className="font-mono text-lg">{n}</b>
      <span className="break-keep font-semibold">{title}</span>
      <span className="break-keep text-white/60">{rule}</span>
    </div>
  );
}
