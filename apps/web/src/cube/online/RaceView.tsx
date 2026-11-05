"use client";

import { BOT_LEVEL_LABELS, type BotLevel } from "@game/cube-ai";
import {
  applyMoves,
  type CubeMove,
  invertMove,
  milestoneLabel,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { RaceSnapshot } from "@/net/race/types";
import { faceGrid } from "../bridge";
import { CubeNet } from "../components/CubeNet";
import { CubePlay, playCubeCue } from "../components/CubePlay";
import { CubePosterPair } from "../components/CubePosterPair";
import type { Command } from "../input";
import { groupSplits, type SplitGroup } from "../progress/splits";
import { formatMs, type Split } from "../records";
import { effectiveRaceAlerts, useCubeSettings } from "../settings";
import { planInWorker } from "../worker";
import { checkBotRun, sameAsBotSolve } from "./bot-racer";
import { MatchBoard } from "./MatchBoard";
import { stageLabel, turnCount } from "./race-game";
import {
  liveOrder,
  pickToasts,
  StageTracker,
  splitCell,
  splitColumns,
} from "./race-stages";
import type { CubeRoom, RoundRecord } from "./room";

/**
 * 대결 한 판의 화면(온라인 방·컴퓨터와 대결이 함께 쓴다, docs/47 9-1).
 * 내 큐브는 크게(`CubePlay`), 다른 사람은 진행 막대·단계 이름·순위, 사람이 셋 이하이면 작은 펼친 그림.
 * 판이 끝나면 결과(시간·수·초당 수·인정 시간과 하한, 확인 약함·의심 표시)와 모두의 풀이 다시 보기.
 */

const PHASE_TEXT: Record<RaceSnapshot["phase"], string> = {
  commit: "섞기를 정하는 중(모두 약속)…",
  reveal: "섞기를 정하는 중(모두 공개)…",
  inspect: "살펴보는 중",
  race: "맞추는 중",
  waiting: "다른 사람을 기다리는 중",
  finished: "판 끝",
};

/** 톡이 떠 있는 시간(ms). 1초 안쪽(docs/51 1-3) */
const TOAST_MS = 900;
/** 이보다 오래전에 지난 이정표는 톡을 띄우지 않는다(판 중간에 화면을 연 때 지난 것을 한꺼번에 띄우지 않게) */
const TOAST_RECENT_MS = 2_000;

/** 움직임 줄이기 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!q) return;
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

interface Toast {
  /** 톡마다 다른 열쇠(같은 사람이 이어 지나도 다시 뜬다) */
  key: string;
  text: string;
}

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
  local = false,
  resultActions,
}: {
  room: CubeRoom;
  /** 방이 바뀔 때마다 오르는 값(다시 그리기) */
  version: number;
  /** 이 기기 안에서만 도는 대결(컴퓨터와 대결). 연결이 없으니 연결 지연 표시를 숨긴다 */
  local?: boolean;
  /** 판이 끝난 뒤 결과 상자 안에 둘 다음 길(온라인의 「다음 판」·「새 경기」) */
  resultActions?: ReactNode;
}) {
  const settings = useCubeSettings();
  const n = room.state?.settings.n ?? 3;
  const session = room.anySession();
  const mine = room.session();
  const snap = session?.snapshot();
  const phase = snap?.phase ?? "commit";
  useTicker(phase === "inspect" || phase === "race" || phase === "waiting");
  const [notice, setNotice] = useState<string | null>(null);
  // 「살펴보기 중에는…」 알림은 살펴보기 동안만. 판이 열리거나 끝나면 지운다
  useEffect(() => {
    if (phase !== "inspect") setNotice(null);
  }, [phase]);
  const [showSmall, setShowSmall] = useState(true);
  const alerts = effectiveRaceAlerts(settings.raceAlerts, useReducedMotion());

  const myState: PuzzleState =
    mine?.stateOf(room.me) ?? mine?.startState() ?? solvedCube(n);
  // 섞기가 바뀌면(새 판·다시 정한 섞기) 장면을 다시 칠한다
  const syncKey = `${room.state?.race?.id}|${snap?.attempt}|${snap?.seed ?? ""}`;
  const [syncToken, setSyncToken] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 섞기가 바뀔 때만 다시 칠한다
  useEffect(() => setSyncToken((v) => v + 1), [syncKey]);

  // 단계 칩(docs/51 1-3): 이미 받은 수 기록에서 이 기기가 계산한다(새로 보내는 정보 없음, race-stages.ts)
  const start = snap?.seed ? session?.startState() : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 섞기가 바뀔 때만 새로 센다
  const tracker = useMemo(
    () => (start ? new StageTracker(n, start) : null),
    [syncKey, n, start !== undefined],
  );
  const stages = new Map<string, { splits: Split[]; groups: SplitGroup[] }>();
  if (tracker && session && snap)
    for (const p of snap.peers) {
      const splits = [...tracker.update(p.id, session.moveLog(p.id))];
      stages.set(p.id, { splits, groups: groupSplits(splits) });
    }

  // 이정표를 지나면 그 칸에 톡(「십자 3.21초」). 4명이 넘으면 1등이 바뀐 때와 나·내 앞뒤만
  const [toasts, setToasts] = useState<Record<string, Toast>>({});
  /** 이번 판에 띄운 톡 수(화면 시험이 잠깐 뜨는 톡을 기다리지 않고 센다) */
  const [toastCount, setToastCount] = useState(0);
  const seen = useRef<{ key: string; counts: Map<string, number> }>({
    key: "",
    counts: new Map(),
  });
  const leader = useRef<string | undefined>(undefined);
  const toastTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const id of toastTimers.current) window.clearTimeout(id);
    },
    [],
  );
  useEffect(() => {
    if (!snap) return;
    if (seen.current.key !== syncKey) {
      seen.current = { key: syncKey, counts: new Map() };
      leader.current = undefined;
      setToasts({});
      setToastCount(0);
    }
    const counts = seen.current.counts;
    const passed: string[] = [];
    for (const p of snap.peers) {
      const groups = stages.get(p.id)?.groups ?? [];
      if (groups.length > (counts.get(p.id) ?? 0)) passed.push(p.id);
      counts.set(p.id, groups.length);
    }
    if (passed.length === 0) return;
    const order = liveOrder(
      snap.peers.map((p) => ({
        id: p.id,
        status: p.status,
        reported: p.reported,
        groups: stages.get(p.id)?.groups ?? [],
      })),
    );
    const prev = leader.current;
    leader.current = order[0];
    if (alerts !== "on") return;
    const now = snap.elapsed ?? 0;
    const shown: Record<string, Toast> = {};
    for (const id of pickToasts(passed, {
      order,
      prevLeader: prev,
      me: room.me,
    })) {
      const g = stages.get(id)?.groups.at(-1);
      if (!g || now - g.ms > TOAST_RECENT_MS) continue;
      shown[id] = { key: `${syncKey}|${id}|${g.ms}`, text: toastText(g) };
    }
    if (Object.keys(shown).length === 0) return;
    setToasts((t) => ({ ...t, ...shown }));
    setToastCount((c) => c + Object.keys(shown).length);
    const timer = window.setTimeout(() => {
      setToasts((t) => {
        const next = { ...t };
        for (const [id, toast] of Object.entries(shown))
          if (next[id]?.key === toast.key) delete next[id];
        return next;
      });
    }, TOAST_MS);
    toastTimers.current.push(timer);
  });

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
          "살펴보기 중에는 면도 큐브도 돌릴 수 없어요. 끌거나 ←·↓ 키로 둘러보세요.",
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
        이번 판에는 들지 않았어요.
      </p>
    );
  }

  const me = snap.peers.find((p) => p.id === room.me);
  const game = room.game();
  const scramble = snap.seed ? (game?.scrambleFor(snap.seed)?.text ?? "") : "";
  const others = snap.peers.filter((p) => p.id !== room.me);
  const small = snap.peers.length <= 3 && showSmall;
  /** 단계 칩으로 보이나(대결 알림 「끔」이면 예전처럼 진행 막대·단계 이름·수) */
  const chips = alerts !== "off";
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
          {snap.preparing ? "섞는 중…" : PHASE_TEXT[phase]}
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
      {/* 판 시작 전·살펴보기 동안: 무엇을 할 수 있는지 미리 알린다 */}
      {(phase === "commit" || phase === "reveal" || phase === "inspect") &&
        mine && (
          <p
            data-cube-inspect-hint
            className="mx-auto break-keep rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-center text-sky-100 text-xs"
          >
            살펴보기: 보기만 해요(끌거나 ←·↓ 키로 둘러보기). 시간이 열리면 면을
            돌려요.
          </p>
        )}
      {notice && phase === "inspect" && (
        <p
          role="status"
          data-cube-notice
          className="text-center text-amber-300 text-xs"
        >
          {notice}
        </p>
      )}

      {/* 아무도 못 맞춰도 판이 끝나면 결과(모두 DNF)를 보인다 */}
      {(finishedFirst.length > 0 || snap.result) && (
        <ResultBox
          room={room}
          snap={snap}
          round={round}
          n={n}
          local={local}
          actions={resultActions}
          splitsOf={(id) => stages.get(id)?.splits ?? []}
        />
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col items-center">
          {mine ? (
            <CubePlay
              flow="small"
              n={n}
              state={myState}
              mask={null}
              syncToken={syncToken}
              settings={settings}
              onMove={onMove}
              onCommand={onCommand}
              locked={phase !== "inspect" && phase !== "race"}
              fitViewport
            />
          ) : (
            <p className="p-6 text-center text-sm text-white/70">보는 중</p>
          )}
        </div>
        <aside
          data-cube-peers
          data-cube-race-alerts={alerts}
          data-cube-toasts-shown={toastCount}
          className={
            chips
              ? "flex gap-2 max-md:-mx-1 max-md:order-first max-md:overflow-x-auto max-md:px-1 max-md:pb-1 md:flex-col"
              : "flex flex-col gap-2"
          }
        >
          <div
            className={`items-center justify-between ${chips ? "hidden md:flex" : "flex"}`}
          >
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
            const groups = stages.get(p.id)?.groups ?? [];
            const toast = toasts[p.id];
            const status =
              p.status === "done"
                ? formatMs(p.reported)
                : p.status === "forfeit"
                  ? "기권"
                  : p.status === "dnf"
                    ? "DNF"
                    : chips
                      ? ""
                      : `${p.moves}수`;
            return (
              <div
                key={p.id}
                data-cube-peer={p.id}
                data-cube-peer-status={p.status}
                data-cube-bot-planned={room.botPlanned(p.id) ? "" : undefined}
                className={`relative flex flex-col gap-1 rounded-xl bg-white/5 p-2 ${
                  chips
                    ? "max-md:w-36 max-md:shrink-0 max-md:gap-0.5 max-md:p-1.5"
                    : ""
                }`}
              >
                <div className="flex items-baseline gap-2 text-sm">
                  <b
                    className={`truncate ${p.id === room.me ? "text-amber-200" : ""}`}
                  >
                    {room.playerName(p.id)}
                    {p.id === room.me && room.playerName(p.id) !== "나"
                      ? " (나)"
                      : ""}
                  </b>
                  {!p.connected && (
                    <span className="text-red-300 text-xs">끊김</span>
                  )}
                  <span
                    className={`ml-auto shrink-0 font-mono text-xs tabular-nums ${
                      p.status === "done" ? "text-emerald-300" : ""
                    }`}
                  >
                    {status}
                  </span>
                </div>
                {chips ? (
                  <PeerStages groups={groups} />
                ) : (
                  <>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full ${p.status === "done" ? "bg-emerald-400" : "bg-sky-400"}`}
                        style={{ width: `${Math.round(p.progress * 100)}%` }}
                      />
                    </div>
                    <span className="text-white/60 text-xs">
                      {st ? stageLabel(n, st) : "-"}
                    </span>
                  </>
                )}
                {small && p.id !== room.me && st && (
                  // 상대가 여럿이라 3D 장면 대신 비스듬한 SVG 큐브 둘(여섯 면)
                  <CubePosterPair
                    n={n}
                    state={st}
                    settings={settings}
                    captions={false}
                    fallback={
                      <CubeNet
                        n={n}
                        faces={faceGrid(n, st)}
                        colors={settings.colors}
                        hidden={settings.hidden}
                        className="h-auto w-32"
                      />
                    }
                    className={`w-36 self-center ${chips ? "max-md:hidden" : ""}`}
                  />
                )}
                {toast && (
                  <span
                    key={toast.key}
                    data-cube-race-toast={p.id}
                    data-toast-key={toast.key}
                    className="cube-race-toast pointer-events-none absolute top-1 right-1 z-10 whitespace-nowrap rounded-full border border-sky-200/40 bg-neutral-900/90 px-2 py-0.5 font-semibold text-sky-100 text-xs shadow-lg"
                  >
                    {toast.text}
                  </span>
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
  local,
  actions,
  splitsOf,
}: {
  room: CubeRoom;
  snap: RaceSnapshot;
  round: RoundRecord | undefined;
  n: number;
  local: boolean;
  actions?: ReactNode;
  /** 사람마다 구간 기록(이 기기가 수 기록에서 계산) */
  splitsOf: (id: string) => readonly Split[];
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
      // 기권한 컴퓨터는 둔 수가 없다(계획을 못 만들었거나 그 판을 떠났다)
      if (round.result.players[p.id]?.status === "forfeit") continue;
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

  // 사람의 수 차례가 우리 컴퓨터 풀이와 같은지(의심 표시, 결과는 그대로). 판이 끝난 뒤 한 번 워커에서
  const [botLike, setBotLike] = useState<Record<string, BotLevel>>({});
  useEffect(() => {
    setBotLike({});
    if (!round || !room.state) return;
    let alive = true;
    for (const id of round.players) {
      const p = room.state.players.find((x) => x.id === id);
      if (!p || p.bot) continue;
      if (round.result.players[id]?.status !== "done") continue;
      void sameAsBotSolve(
        n,
        round.start,
        round.logs[id] ?? [],
        planInWorker,
      ).then(
        (level) => {
          if (alive && level) setBotLike((c) => ({ ...c, [id]: level }));
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
            ? "내가 먼저 맞췄어요"
            : `먼저 맞췄어요: ${room.playerName(first?.id ?? "")}`}{" "}
          · {formatMs(first?.reported)}
        </b>
        <p className="text-white/70 text-xs">
          {snap.peers.find((p) => p.id === room.me)?.status === "playing"
            ? "맞추는 중"
            : "다른 사람을 기다리는 중"}
        </p>
      </div>
    );
  }

  const bots = new Map(
    room.state?.players.filter((p) => p.bot).map((p) => [p.id, p.bot]) ?? [],
  );
  const myRank = result.ranking.indexOf(room.me);
  const mine = result.players[room.me];
  const solved = mine?.status === "done";
  const headline = result.noDecision
    ? "이 판은 두 기기 기록이 달라 판정하지 않았어요"
    : !mine
      ? "판이 끝났어요"
      : mine.unranked
        ? "맞췄지만 두 기기 기록이 달라 순위에 넣지 않았어요"
        : solved
          ? myRank === 0
            ? `1위예요 · ${formatMs(mine.accepted)}`
            : `${myRank + 1}위 · ${formatMs(mine.accepted)}`
          : mine.status === "forfeit"
            ? "이번 판은 기권했어요"
            : "이번 판은 맞추지 못했어요(DNF)";
  return (
    <div
      data-cube-result="final"
      data-cube-no-decision={result.noDecision ? "" : undefined}
      data-cube-result-mine={mine?.status}
      role="status"
      className={`flex flex-col gap-1 rounded-xl border px-3 py-2 ${
        solved || !mine
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-white/15 bg-white/5"
      }`}
    >
      <p
        className={`font-bold text-base ${solved ? "text-emerald-300" : "text-white/80"}`}
      >
        {headline}
      </p>
      {result.cancelled && (
        <p className="text-amber-300 text-sm">
          판을 열지 못했어요: {result.cancelled}
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
            if (extra > 0 && !local)
              notes.push(`연결 지연으로 +${(extra / 1000).toFixed(2)}초(하한)`);
            if (p?.disputed && p.usedBound != null)
              notes.push(
                `확인 안 됨: 두 기기 기록이 다름(보고 ${formatMs(p.reported)} · 다른 기기가 잰 하한 ${formatMs(p.usedBound)})`,
              );
            if (p?.weak && !local) notes.push("확인 약함(끊김)");
            const bot = bots.get(id);
            // 의심 표시는 사람에게만(컴퓨터는 아래 「계획 확인」으로 본다)
            if (!bot) {
              if (p?.flags?.burst)
                notes.push(
                  `의심: 몰아친 수(순간 초당 ${p.flags.peakMovesPerSecond.toFixed(0)}수)`,
                );
              // 맞추지 못한 판(DNF·기권)의 0수는 의심할 까닭이 없다
              if (p?.flags?.fewMoves && p.status === "done")
                notes.push("의심: 수가 지나치게 적음");
              if (p?.flags?.even)
                notes.push("의심: 수 사이 간격이 지나치게 고름");
              if (p?.flags?.fastStart)
                notes.push("의심: 첫 수들이 사람 손 빠르기를 넘음");
              const like = botLike[id];
              if (like)
                notes.push(
                  `의심: 컴퓨터 풀이와 같음(${BOT_LEVEL_LABELS[like]})`,
                );
            }
            if (p?.reason && p.status !== "done") notes.push(p.reason);
            if (bot && id in botChecks)
              notes.push(
                botChecks[id] ? "컴퓨터 계획 확인 ✓" : "컴퓨터 계획과 다름 ⚠",
              );
            return (
              <tr key={id} data-cube-rank={id} className="align-top">
                <td>
                  {p?.status === "done" && !p.unranked && !result.noDecision
                    ? i + 1
                    : "-"}
                </td>
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
                    ? p.unranked
                      ? "확인 안 됨"
                      : formatMs(time)
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
      <RaceSplits room={room} ids={result.ranking} splitsOf={splitsOf} />
      <MatchBoard room={room} />
      {!local && <ResultDetails room={room} snap={snap} />}
      {actions && (
        <div
          data-cube-result-actions
          className="mt-1 flex flex-wrap items-center justify-end gap-2 border-white/10 border-t pt-2"
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/** 칩에 쓸 대표 단계 이름과 시각: 「십자 3.21초」(1분 넘으면 「1:02.34」) */
function toastText(g: SplitGroup): string {
  const t = formatMs(g.ms);
  return `${g.label.replace(/ \+\d+$/, "")} ${t.includes(":") ? t : `${t}초`}`;
}

/**
 * 사람 칸의 단계 칩 한 줄(docs/51 1-3). 수마다 움직이지 않고 이정표를 지날 때만 칩이 하나 는다. 최근 셋, 마지막 칩만
 * 시각을 붙이고 앞 칩은 흐리게. 휴대폰(위 줄의 좁은 칸)은 마지막 칩만
 */
function PeerStages({ groups }: { groups: readonly SplitGroup[] }) {
  const shown = groups.slice(-3);
  return (
    <ol
      data-cube-peer-stages={groups.map((g) => g.ids.join("+")).join(" ")}
      className="flex h-5 min-w-0 items-center gap-1 overflow-hidden"
    >
      {shown.length === 0 && <li className="text-white/35 text-[11px]">-</li>}
      {shown.map((g, i) => {
        const last = i === shown.length - 1;
        return (
          <li
            key={`${g.ms}-${g.ids.join("+")}`}
            data-milestone={g.ids.join("+")}
            title={`${g.full} ${formatMs(g.ms)}`}
            className={`shrink-0 truncate rounded-full border px-1.5 py-px text-[11px] ${
              last
                ? "cube-milestone-in border-sky-300/35 bg-sky-400/10 text-sky-100"
                : "border-white/10 text-white/45 max-md:hidden"
            }`}
          >
            {g.label}
            {last && (
              <span className="ml-1 font-mono text-sky-200/75 tabular-nums">
                {formatMs(g.ms)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 결과 상자의 구간 기록(사람마다 나란히). 열은 사람들 칩의 대표 단계, 칸은 그 단계를 처음 지난 시각.
 * 열마다 가장 빠른 칸을 밝게. 다 맞춘 순간에 함께 지난 단계는 비운다(「-」)
 */
function RaceSplits({
  room,
  ids,
  splitsOf,
}: {
  room: CubeRoom;
  ids: readonly string[];
  splitsOf: (id: string) => readonly Split[];
}) {
  const rows = ids.map((id) => ({ id, splits: splitsOf(id) }));
  const columns = splitColumns(rows.map((r) => groupSplits(r.splits)));
  if (columns.length === 0) return null;
  const fastest = new Map<string, number>();
  for (const c of columns)
    for (const r of rows) {
      const t = splitCell(r.splits, c);
      if (t !== null && t < (fastest.get(c) ?? Number.POSITIVE_INFINITY))
        fastest.set(c, t);
    }
  return (
    <div className="overflow-x-auto" data-cube-race-splits={columns.join(" ")}>
      <table className="text-xs">
        <thead className="text-white/50">
          <tr>
            <th className="text-left font-normal">구간</th>
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap pl-4 text-right font-normal"
              >
                {milestoneLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-cube-race-split-row={r.id}>
              <td className="max-w-24 truncate text-white/70">
                {room.playerName(r.id)}
              </td>
              {columns.map((c) => {
                const t = splitCell(r.splits, c);
                return (
                  <td
                    key={c}
                    className={`pl-4 text-right font-mono tabular-nums ${
                      t === null
                        ? "text-white/30"
                        : t === fastest.get(c)
                          ? "text-emerald-300"
                          : "text-white/75"
                    }`}
                  >
                    {t === null ? "-" : formatMs(t)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 결과 자세히 보기(이 기기에서 본 것, 판정에는 쓰지 않는 값 포함): 몰아 보낸 수(수마다 하한보다 이른 시각을 단 수),
 * 내가 잰 도착 하한과 인정 시간의 차이
 */
function ResultDetails({ room, snap }: { room: CubeRoom; snap: RaceSnapshot }) {
  const result = snap.result;
  if (!result) return null;
  const rows = result.ranking
    .filter((id) => id !== room.me)
    .map((id) => {
      const p = result.players[id];
      const mine = p?.bounds?.[room.me];
      const late = snap.lateMoves[id] ?? 0;
      const parts: string[] = [`몰아 보낸 수 ${late}`];
      if (p?.status === "done" && mine !== undefined)
        parts.push(
          mine === null
            ? "내가 잰 하한: 확인 약함(끊김)"
            : p.accepted === undefined
              ? `내가 잰 하한 ${formatMs(Math.max(0, mine))} · 인정 시간 없음(판정하지 않음)`
              : `내가 잰 하한 ${formatMs(Math.max(0, mine))} · 인정 시간과 차이 ${((p.accepted - mine) / 1000).toFixed(2)}초`,
        );
      if (p?.flags?.intervalCv != null)
        parts.push(
          `수 간격 고르기(변동 계수) ${p.flags.intervalCv.toFixed(2)}`,
        );
      return { id, text: parts.join(" · ") };
    });
  if (rows.length === 0) return null;
  return (
    <details data-cube-result-details className="text-white/70 text-xs">
      <summary className="cursor-pointer">자세히 보기</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.id} data-cube-detail={r.id}>
            {room.playerName(r.id)}: {r.text}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 판 끝 모두의 풀이 나란히 다시 보기(비스듬한 SVG 큐브 둘, 그때 시각대로, 4배 빠르게 고를 수 있음) */
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
    <section
      data-cube-replay-view
      className="flex flex-col gap-2 rounded-xl bg-white/5 p-3"
    >
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
              <CubePosterPair
                n={n}
                state={state}
                settings={settings}
                captions={false}
                fallback={
                  <CubeNet
                    n={n}
                    faces={faceGrid(n, state)}
                    colors={settings.colors}
                    hidden={settings.hidden}
                    className="h-auto w-32"
                  />
                }
                className="w-44"
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
