"use client";

import {
  applyMoves,
  type CubeMove,
  invertMove,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RaceSnapshot } from "@/net/race/types";
import { faceGrid } from "../bridge";
import { CubeNet } from "../components/CubeNet";
import { CubePlay, playCubeCue } from "../components/CubePlay";
import type { Command } from "../input";
import { formatMs } from "../records";
import { useCubeSettings } from "../settings";
import { planInWorker } from "../worker";
import { checkBotRun } from "./bot-racer";
import { stageLabel, turnCount } from "./race-game";
import type { CubeRoom, RoundRecord } from "./room";

/**
 * 경주 한 판의 화면(온라인 방·컴퓨터와 경주가 함께 쓴다, docs/47 9-1).
 * 내 큐브는 크게(`CubePlay`), 다른 사람은 진행 막대·단계 이름·순위, 사람이 셋 이하이면 작은 펼친 그림.
 * 판이 끝나면 결과(시간·수·초당 수·인정 시간과 하한, 확인 약함·의심 표시)와 모두의 풀이 다시 보기.
 */

const PHASE_TEXT: Record<RaceSnapshot["phase"], string> = {
  commit: "섞기를 정하는 중(모두 약속)…",
  reveal: "섞기를 정하는 중(모두 공개)…",
  inspect: "살펴보기: 큐브를 보기만 할 수 있습니다(마우스로 끌어 돌려 보기)",
  race: "맞추세요!",
  waiting: "다른 사람을 기다리는 중",
  finished: "판 끝",
};

function useTicker(active: boolean): void {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => tick((t) => t + 1), 53);
    return () => window.clearInterval(id);
  }, [active]);
}

export function RaceView({
  room,
  version,
}: {
  room: CubeRoom;
  /** 방이 바뀔 때마다 오르는 값(다시 그리기) */
  version: number;
}) {
  const settings = useCubeSettings();
  const n = room.state?.settings.n ?? 3;
  const session = room.anySession();
  const mine = room.session();
  const snap = session?.snapshot();
  const phase = snap?.phase ?? "commit";
  useTicker(phase === "inspect" || phase === "race" || phase === "waiting");
  const [notice, setNotice] = useState<string | null>(null);
  const [showSmall, setShowSmall] = useState(true);

  const myState: PuzzleState =
    mine?.stateOf(room.me) ?? mine?.startState() ?? solvedCube(n);
  // 섞기가 바뀌면(새 판·다시 정한 섞기) 장면을 다시 칠한다
  const syncKey = `${room.state?.race?.id}|${snap?.attempt}|${snap?.seed ?? ""}`;
  const [syncToken, setSyncToken] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 섞기가 바뀔 때만 다시 칠한다
  useEffect(() => setSyncToken((v) => v + 1), [syncKey]);

  // 살펴보기·풀림·맞춤 소리
  const lastCue = useRef("");
  useEffect(() => {
    const me = snap?.peers.find((p) => p.id === room.me);
    const key = `${syncKey}|${phase}|${me?.status}`;
    if (key === lastCue.current) return;
    lastCue.current = key;
    if (phase === "inspect") playCubeCue(settings, "cubeInspect");
    if (me?.status === "done") playCubeCue(settings, "cubeSolved");
  });

  const onMove = useCallback(
    (move: CubeMove) => {
      const r = room.play(move);
      if (r.ok) {
        setNotice(null);
        return true;
      }
      if (r.reason === "살펴보기 중")
        setNotice(
          "살펴보기 중에는 돌릴 수 없습니다. 마우스로 끌어 보기만 됩니다.",
        );
      return false;
    },
    [room],
  );

  const onCommand = useCallback(
    (c: Command): CubeMove | null => {
      if (c !== "undo") return null;
      const s = room.session();
      const last = s?.moveLog(room.me).at(-1);
      if (!s || !last) return null;
      const back = invertMove(parseMoves(n, last.m)[0] as CubeMove);
      return s.play(back).ok ? back : null;
    },
    [room, n],
  );

  if (!snap || !session) {
    return (
      <p className="rounded-xl bg-white/5 p-4 text-center text-sm">
        이번 판에는 들지 않았습니다. 다음 판부터 함께합니다.
      </p>
    );
  }

  const me = snap.peers.find((p) => p.id === room.me);
  const game = room.game();
  const scramble = snap.seed ? (game?.scrambleFor(snap.seed)?.text ?? "") : "";
  const others = snap.peers.filter((p) => p.id !== room.me);
  const small = snap.peers.length <= 3 && showSmall;
  const finishedFirst = snap.peers
    .filter((p) => p.status === "done" && p.reported !== undefined)
    .sort((a, b) => (a.reported as number) - (b.reported as number));
  const round = room.rounds.find((r) => r.race === room.state?.race?.id);

  let clock: string;
  if (phase === "inspect")
    clock = String(Math.max(0, Math.ceil((snap.inspectionLeft ?? 0) / 1000)));
  else if (me?.status === "done") clock = formatMs(me.reported);
  else if (snap.elapsed !== undefined && phase !== "finished")
    clock = formatMs(snap.elapsed);
  else clock = "-";

  return (
    <div
      className="flex flex-col gap-3"
      data-cube-race-phase={phase}
      data-cube-version={version}
    >
      <div className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1">
        <span
          data-cube-clock
          className={`font-mono font-semibold text-4xl tabular-nums ${phase === "inspect" ? "text-sky-300" : ""}`}
        >
          {clock}
        </span>
        <span className="text-sm text-white/70">
          수 <b data-cube-moves>{turnCount(n, mine?.moveLog(room.me) ?? [])}</b>
        </span>
        <span className="text-sm text-white/70" data-cube-phase-text>
          {snap.preparing
            ? "섞는 중…(처음에는 몇 초 걸립니다)"
            : PHASE_TEXT[phase]}
          {snap.attempt > 0 && phase !== "finished"
            ? ` · 섞기 다시 정함(${snap.attempt + 1}번째)`
            : ""}
        </span>
      </div>
      <p
        className="min-h-5 break-keep text-center font-mono text-white/70 text-xs"
        data-cube-scramble={scramble}
      >
        {scramble}
      </p>
      {notice && (
        <p role="status" className="text-center text-amber-300 text-xs">
          {notice}
        </p>
      )}

      {finishedFirst.length > 0 && (
        <ResultBox room={room} snap={snap} round={round} n={n} />
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col items-center">
          {mine ? (
            <CubePlay
              n={n}
              state={myState}
              mask={null}
              syncToken={syncToken}
              settings={settings}
              onMove={onMove}
              onCommand={onCommand}
              locked={phase !== "inspect" && phase !== "race"}
            />
          ) : (
            <p className="p-6 text-center text-sm text-white/70">
              보기만 하는 중입니다.
            </p>
          )}
        </div>
        <aside className="flex flex-col gap-2" data-cube-peers>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">진행</h2>
            {snap.peers.length <= 3 && (
              <button
                type="button"
                onClick={() => setShowSmall((v) => !v)}
                className="text-white/60 text-xs hover:underline"
              >
                {showSmall ? "작은 큐브 끄기" : "작은 큐브 켜기"}
              </button>
            )}
          </div>
          {[...(me ? [me] : []), ...others].map((p) => {
            const st = session.stateOf(p.id);
            return (
              <div
                key={p.id}
                data-cube-peer={p.id}
                data-cube-peer-status={p.status}
                className="flex flex-col gap-1 rounded-xl bg-white/5 p-2"
              >
                <div className="flex items-baseline gap-2 text-sm">
                  <b className={p.id === room.me ? "text-amber-200" : ""}>
                    {room.playerName(p.id)}
                    {p.id === room.me && room.playerName(p.id) !== "나"
                      ? " (나)"
                      : ""}
                  </b>
                  {!p.connected && (
                    <span className="text-red-300 text-xs">끊김</span>
                  )}
                  <span className="ml-auto font-mono text-xs tabular-nums">
                    {p.status === "done"
                      ? formatMs(p.reported)
                      : p.status === "forfeit"
                        ? "기권"
                        : p.status === "dnf"
                          ? "DNF"
                          : `${p.moves}수`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full ${p.status === "done" ? "bg-emerald-400" : "bg-sky-400"}`}
                    style={{ width: `${Math.round(p.progress * 100)}%` }}
                  />
                </div>
                <span className="text-white/60 text-xs">
                  {st ? stageLabel(n, st) : "-"}
                </span>
                {small && p.id !== room.me && st && (
                  <CubeNet
                    n={n}
                    faces={faceGrid(n, st)}
                    colors={settings.colors}
                    hidden={settings.hidden}
                    className="h-auto w-32 self-center"
                  />
                )}
              </div>
            );
          })}
        </aside>
      </div>
      {round && <Replay room={room} round={round} n={n} />}
    </div>
  );
}

function ResultBox({
  room,
  snap,
  round,
  n,
}: {
  room: CubeRoom;
  snap: RaceSnapshot;
  round: RoundRecord | undefined;
  n: number;
}) {
  const result = snap.result;
  const session = room.anySession();
  // 컴퓨터가 계획대로 두었는지 이 기기에서 다시 계산해 본다(판이 끝난 뒤 한 번)
  // 계획은 웹 워커에서 다시 만든다(해법기 표를 처음 만들 때 화면이 멈추지 않게)
  const [botChecks, setBotChecks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setBotChecks({});
    if (!round || !room.state) return;
    let alive = true;
    for (const p of room.state.players) {
      const level = p.bot;
      if (!level || !round.players.includes(p.id)) continue;
      const log = round.logs[p.id] ?? [];
      void checkBotRun(
        level,
        n,
        round.start,
        round.seed,
        p.id,
        log,
        planInWorker,
      ).then(
        (ok) => {
          if (alive) setBotChecks((c) => ({ ...c, [p.id]: ok }));
        },
        () => undefined,
      );
    }
    return () => {
      alive = false;
    };
  }, [round, room, n]);

  if (!result) {
    const first = snap.peers
      .filter((p) => p.status === "done")
      .sort((a, b) => (a.reported ?? 0) - (b.reported ?? 0))[0];
    return (
      <div
        data-cube-result="partial"
        role="status"
        className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-center"
      >
        <b className="text-emerald-300">
          {first?.id === room.me
            ? "내가"
            : `${room.playerName(first?.id ?? "")}이(가)`}{" "}
          먼저 맞췄습니다 · {formatMs(first?.reported)}
        </b>
        <p className="text-white/70 text-xs">
          {snap.peers.find((p) => p.id === room.me)?.status === "playing"
            ? "끝까지 맞춰 내 시간을 남기세요. 제한 시간이 지나면 판이 끝납니다."
            : "다른 사람을 기다리는 중"}
        </p>
      </div>
    );
  }

  const bots = new Map(
    room.state?.players.filter((p) => p.bot).map((p) => [p.id, p.bot]) ?? [],
  );
  return (
    <div
      data-cube-result="final"
      role="status"
      className="flex flex-col gap-1 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2"
    >
      {result.cancelled && (
        <p className="text-amber-300 text-sm">
          판을 열지 못했습니다: {result.cancelled}
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="text-white/60 text-xs">
          <tr>
            <th className="text-left">순위</th>
            <th className="text-left">이름</th>
            <th className="text-right">시간</th>
            <th className="text-right">수</th>
            <th className="text-right">초당</th>
          </tr>
        </thead>
        <tbody>
          {result.ranking.map((id, i) => {
            const p = result.players[id];
            const log = session?.moveLog(id) ?? round?.logs[id] ?? [];
            const turns = turnCount(n, log);
            const time = p?.accepted;
            const extra =
              p?.accepted !== undefined && p.reported !== undefined
                ? p.accepted - p.reported
                : 0;
            const notes: string[] = [];
            if (extra > 0)
              notes.push(`연결 지연으로 +${(extra / 1000).toFixed(2)}초(하한)`);
            if (p?.weak) notes.push("확인 약함(끊김)");
            if (p?.flags?.burst)
              notes.push(
                `의심: 몰아친 수(순간 초당 ${p.flags.peakMovesPerSecond.toFixed(0)}수)`,
              );
            if (p?.flags?.fewMoves) notes.push("의심: 수가 지나치게 적음");
            if (p?.reason && p.status !== "done") notes.push(p.reason);
            const bot = bots.get(id);
            if (bot && id in botChecks)
              notes.push(
                botChecks[id] ? "컴퓨터 계획 확인 ✓" : "컴퓨터 계획과 다름 ⚠",
              );
            return (
              <tr key={id} data-cube-rank={id} className="align-top">
                <td>{p?.status === "done" ? i + 1 : "-"}</td>
                <td>
                  {room.playerName(id)}
                  {id === room.me && room.playerName(id) !== "나"
                    ? " (나)"
                    : ""}
                  {notes.length > 0 && (
                    <span className="block text-white/60 text-xs">
                      {notes.join(" · ")}
                    </span>
                  )}
                </td>
                <td className="text-right font-mono tabular-nums">
                  {p?.status === "done"
                    ? formatMs(time)
                    : p?.status === "forfeit"
                      ? "기권"
                      : "DNF"}
                </td>
                <td className="text-right">{turns}</td>
                <td className="text-right">
                  {p?.status === "done" && time
                    ? (turns / (time / 1000)).toFixed(2)
                    : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 판 끝 모두의 풀이 나란히 다시 보기(펼친 그림, 그때 시각대로, 4배 빠르게 고를 수 있음) */
function Replay({
  room,
  round,
  n,
}: {
  room: CubeRoom;
  round: RoundRecord;
  n: number;
}) {
  const settings = useCubeSettings();
  const [t, setT] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const end = Math.max(
    0,
    ...round.players.map((id) => round.logs[id]?.at(-1)?.t ?? 0),
  );
  useEffect(() => {
    if (t === null) return;
    if (t >= end) return;
    const id = window.setTimeout(
      () => setT((v) => (v === null ? null : v + 100 * speed)),
      100,
    );
    return () => window.clearTimeout(id);
  }, [t, end, speed]);

  if (t === null)
    return (
      <button
        type="button"
        data-cube-replay
        onClick={() => setT(0)}
        className="self-center rounded-lg bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
      >
        모두의 풀이 나란히 다시 보기
      </button>
    );
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-3 text-sm">
        <b>다시 보기</b>
        <span className="font-mono tabular-nums">
          {formatMs(Math.min(t, end))}
        </span>
        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 4 : 1))}
          className="text-xs underline"
        >
          {speed}배
        </button>
        <button
          type="button"
          onClick={() => setT(0)}
          className="text-xs underline"
        >
          처음부터
        </button>
        <button
          type="button"
          onClick={() => setT(null)}
          className="ml-auto text-xs underline"
        >
          닫기
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {round.players.map((id) => {
          const log = round.logs[id] ?? [];
          const done = log.filter((x) => x.t <= t);
          const state = applyMoves(
            n,
            round.start,
            done.flatMap((x) => parseMoves(n, x.m)),
          );
          return (
            <figure key={id} className="flex flex-col items-center gap-1">
              <CubeNet
                n={n}
                faces={faceGrid(n, state)}
                colors={settings.colors}
                hidden={settings.hidden}
                className="h-auto w-32"
              />
              <figcaption className="text-xs">
                {room.playerName(id)} · {turnCount(n, done)}수
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
