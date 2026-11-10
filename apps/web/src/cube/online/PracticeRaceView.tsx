"use client";

import { type CubeMove, invertMove, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/cn";
import type { RaceSnapshot } from "@/net/race/types";
import { loadAlgBook } from "../algs/store";
import { CubePlay, playCubeCue } from "../components/CubePlay";
import { KeyCaps, useMoveKeys } from "../components/MoveChip";
import type { Command } from "../input";
import { loadKeymap } from "../input/storage";
import { pickAlg } from "../practice/pick-alg";
import { PRACTICE_N } from "../practice/problem";
import { stageById } from "../practice/stages";
import {
  trackOf,
  type VersusRule,
  type VersusTrack,
  versusAt,
  versusBoard,
  versusCase,
  versusOver,
  versusSummary,
} from "../practice/versus";
import { formatMs } from "../records";
import { useCubeSettings } from "../settings";
import { MatchBoard } from "./MatchBoard";
import { practiceBotRunOk } from "./practice-bot";
import { PEEK_TEXT } from "./race-game";
import type { CubeRoom } from "./room";

/**
 * 공식 연습 대결 한 판의 화면(docs/47 16-14). 친구와 대결·컴퓨터와 대결이 함께 쓴다.
 * 내 큐브와 공식 줄은 혼자 공식 연습(`PracticeApp`)과 같은 꼴이고, 상대마다 「몇 번째 문제 / 10」·콤보·끝낸 시간을 작게 보인다.
 * 진행·콤보·정확도는 모두 이 기기가 받은 수 기록으로 계산한 값이다(`practice/versus.ts`).
 */

/** 틀린 수의 키를 보이는 시간(혼자 공식 연습과 같다) */
const WRONG_SHOW_MS = 1500;
/** 문제를 맞춘 뒤 ✓가 떠 있는 시간(키는 막지 않는다: 겨루는 판이라 모두에게 같은 조건으로 바로 다음 문제) */
const OK_SHOW_MS = 700;

const PHASE_TEXT: Record<RaceSnapshot["phase"], string> = {
  commit: "문제를 정하는 중…",
  reveal: "문제를 정하는 중…",
  inspect: "준비",
  race: "치는 중",
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

const trackIn = (state: PuzzleState | undefined): VersusTrack | null =>
  state && "practice" in state ? trackOf(state) : null;

export function PracticeRaceView({
  room,
  version,
  local = false,
  resultActions,
}: {
  room: CubeRoom;
  version: number;
  local?: boolean;
  resultActions?: ReactNode;
}) {
  const settings = useCubeSettings();
  const session = room.anySession();
  const mine = room.session();
  const snap = session?.snapshot();
  const phase = snap?.phase ?? "commit";
  useTicker(phase === "inspect" || phase === "race" || phase === "waiting");
  const rule: VersusRule | undefined =
    room.game()?.practice ?? room.state?.settings.practice;
  const stage = rule ? stageById(rule.stage) : undefined;
  const { keysOf } = useMoveKeys(PRACTICE_N);

  // 내가 칠 공식: 혼자 연습과 같이 내 공식이 먼저, 없으면 내 키 배치에서 가장 싼 공식(시작 모양은 모두 같다)
  const [picks, setPicks] = useState<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    if (!stage) return;
    const keymap = loadKeymap();
    const book = loadAlgBook();
    setPicks(
      new Map(stage.cases.map((c) => [c.id, pickAlg(c, keymap, book).alg])),
    );
  }, [stage]);

  const myState = mine?.stateOf(room.me) ?? mine?.startState();
  const track = trackIn(myState);
  const dc = track ? versusCase(track) : undefined;
  const myAlg = dc ? picks?.get(dc.id) : undefined;
  const board = track ? versusBoard(track, myAlg) : null;
  const myAlgRef = useRef(myAlg);
  myAlgRef.current = myAlg;
  const syncKey = `${room.state?.race?.id}|${snap?.attempt}|${snap?.seed ?? ""}`;
  const repaint = `${syncKey}|${track?.jumps ?? 0}`;
  const [syncToken, setSyncToken] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 새 판·새 문제·반쪽 되돌림 때만 다시 칠한다
  useEffect(() => setSyncToken((v) => v + 1), [repaint]);

  // 틀린 낱말의 키는 1.5초만, 맞춘 표시는 0.7초만(보이기만 한다)
  const [wrongAt, setWrongAt] = useState<number | null>(null);
  const [okKey, setOkKey] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const onMove = useCallback(
    (move: CubeMove) => {
      const s = room.session();
      let before = trackIn(s?.stateOf(room.me));
      // 따라 치기: 문제마다 첫 수 앞에 내가 칠 공식을 알린다(모든 기기가 이 공식으로 한 수씩 판정한다)
      const alg = myAlgRef.current;
      if (
        s &&
        alg &&
        before?.mode === "follow" &&
        before.alg === null &&
        before.fed.length === 0
      ) {
        s.play({ alg });
        before = trackIn(s.stateOf(room.me));
      }
      const r = room.play(move);
      if (!r.ok) return false;
      const after = trackIn(s?.stateOf(room.me));
      if (!before || !after) return true;
      if (after.misses > before.misses) {
        const at = after.wrong;
        setWrongAt(at);
        later(WRONG_SHOW_MS, () => setWrongAt((w) => (w === at ? null : w)));
        return false;
      }
      if (after.index > before.index) {
        const key = `${syncKey}|${after.index}`;
        setOkKey(key);
        setWrongAt(null);
        playCubeCue(settings, "cubeSolved");
        later(OK_SHOW_MS, () => setOkKey((k) => (k === key ? null : k)));
      }
      return true;
    },
    [room, syncKey, settings, later],
  );

  const onCommand = useCallback(
    (c: Command): CubeMove | null => {
      // 보고 치기만 되돌리기(마지막 수를 거꾸로)를 받는다. 따라 치기는 틀린 수가 큐브에 남지 않는다
      if (c !== "undo") return null;
      const s = room.session();
      const t = trackIn(s?.stateOf(room.me));
      if (!s || !t || t.mode !== "see") return null;
      const last = t.fed.at(-1);
      if (!last) return null;
      const back = invertMove(parseMoves(PRACTICE_N, last)[0] as CubeMove);
      return s.play(back).ok ? back : null;
    },
    [room],
  );

  if (!snap || !session || !stage || !rule) {
    return (
      <p className="rounded-xl bg-white/5 p-4 text-center text-sm">
        이번 판에는 들지 않았어요.
      </p>
    );
  }

  const me = snap.peers.find((p) => p.id === room.me);
  const others = snap.peers.filter((p) => p.id !== room.me);
  const total = track?.problems.length ?? 10;
  const round = room.rounds.find((r) => r.race === room.state?.race?.id);
  const result = snap.result ?? round?.result;
  const mode = rule.mode ?? "follow";

  let clock: string;
  if (phase === "inspect")
    clock = String(Math.max(0, Math.ceil((snap.inspectionLeft ?? 0) / 1000)));
  else if (me?.status === "done") clock = formatMs(me.reported);
  else if (snap.elapsed !== undefined && phase !== "finished")
    clock = formatMs(snap.elapsed);
  else clock = "-";

  const at = track && board ? versusAt(track) : 0;
  const over = !!track && versusOver(track);
  const tokens = board?.tokens ?? [];

  return (
    <div
      className="flex flex-col gap-3"
      data-cube-race-phase={phase}
      data-cube-version={version}
      data-cube-practice-race={stage.id}
      data-practice-mode={mode}
      data-practice-index={track?.index}
      data-practice-next={!over && mode === "follow" ? tokens[at] : undefined}
      data-practice-answer={!over ? board?.tokens.join(" ") : undefined}
      data-practice-combo={track?.combo ?? 0}
    >
      {result && (
        <PracticeResult
          room={room}
          snap={snap}
          final={!!snap.result || !!round}
          local={local}
          actions={resultActions}
        />
      )}

      <ul
        className="flex flex-wrap justify-center gap-2"
        data-cube-practice-peers
      >
        {others.map((p) => {
          const t = trackIn(session.stateOf(p.id));
          const status =
            p.status === "done"
              ? formatMs(p.reported)
              : p.status === "forfeit"
                ? "기권"
                : p.status === "dnf"
                  ? "못 끝냄"
                  : null;
          return (
            <li
              key={p.id}
              data-cube-peer={p.id}
              data-cube-peer-status={p.status}
              data-cube-bot-planned={room.botPlanned(p.id) ? "" : undefined}
              data-practice-peer-index={t?.index ?? 0}
              data-practice-peer-combo={t?.combo ?? 0}
              className={cn(
                "flex min-w-36 flex-col gap-0.5 rounded-xl px-3 py-2 text-sm",
                p.status === "done"
                  ? "bg-emerald-500/15"
                  : p.status === "playing"
                    ? "bg-white/5"
                    : "bg-white/5 opacity-60",
              )}
            >
              <span className="flex items-center gap-1.5 truncate font-semibold">
                {room.playerName(p.id)}
                {!p.connected && (
                  <span className="text-red-300 text-xs">끊김</span>
                )}
              </span>
              <span className="flex items-baseline justify-between gap-3 font-mono text-white/70 text-xs tabular-nums">
                <span>
                  {Math.min(
                    total,
                    (t?.index ?? 0) + (p.status === "done" ? 0 : 1),
                  )}{" "}
                  / {total}
                </span>
                <span
                  className={(t?.combo ?? 0) > 0 ? "text-amber-300" : undefined}
                >
                  콤보 {t?.combo ?? 0}
                </span>
                {status && (
                  <span
                    className={
                      p.status === "done" ? "text-emerald-200" : "text-rose-200"
                    }
                  >
                    {status}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <section
        className="flex flex-col items-center gap-3"
        data-cube-peer={room.me}
        data-cube-peer-status={me?.status}
      >
        <div className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1">
          <span
            data-cube-clock
            className={cn(
              "font-mono font-semibold text-4xl tabular-nums",
              phase === "inspect" && "text-sky-300",
            )}
          >
            {clock}
          </span>
          <span className="text-sm text-white/70" data-cube-phase-text>
            {PHASE_TEXT[phase]} · 공식 연습 {stage.title} ·{" "}
            {mode === "follow" ? "따라 치기" : "보고 치기"}
          </span>
        </div>

        {mine && track && !over && dc && phase !== "finished" && (
          <>
            <div className="flex w-full max-w-xl items-baseline justify-between gap-3 text-sm">
              <span
                className="font-mono text-white/70 tabular-nums"
                data-practice-count
              >
                {track.index + 1} / {total}
              </span>
              <span className="truncate font-semibold" data-practice-name>
                {dc.name}
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  track.combo > 0 ? "text-amber-300" : "text-white/40",
                )}
              >
                콤보 {track.combo}
              </span>
            </div>
            {mode === "follow" ? (
              <ol
                className="flex min-h-10 w-full max-w-xl flex-wrap justify-center gap-1.5"
                data-practice-tokens
              >
                {tokens.map((t, i) => {
                  const done = i < at;
                  const now = i === at;
                  const miss = now && wrongAt === i;
                  return (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                      key={i}
                      data-token-state={
                        miss ? "wrong" : done ? "done" : now ? "now" : "next"
                      }
                      className={cn(
                        "flex min-w-10 flex-col items-center rounded-lg px-2 py-1 font-mono font-semibold text-lg transition-colors duration-300",
                        done && "bg-emerald-500/25 text-emerald-100",
                        now && !miss && "bg-white/15 ring-2 ring-sky-300",
                        miss && "bg-red-500/40 ring-2 ring-red-400",
                        !done && !now && "bg-white/5 text-white/60",
                      )}
                    >
                      {t}
                      {miss && (
                        <span data-practice-wrong-keys>
                          {keysOf ? (
                            <KeyCaps keys={keysOf(t)} className="text-white" />
                          ) : null}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="flex min-h-10 w-full max-w-xl flex-col items-center gap-1">
                {track.peeked ? (
                  <p
                    className="flex flex-wrap justify-center gap-1.5 font-mono font-semibold text-lg"
                    data-practice-peek
                  >
                    {tokens.map((t, i) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                        key={i}
                        className="rounded-lg bg-white/10 px-2 py-0.5"
                      >
                        {t}
                      </span>
                    ))}
                  </p>
                ) : (
                  <button
                    type="button"
                    data-practice-peek-button
                    disabled={phase !== "race"}
                    onClick={(e) => {
                      const s = room.session();
                      s?.play(room.game()?.decodeMove(PEEK_TEXT) as never);
                      e.currentTarget.blur();
                    }}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-50"
                  >
                    공식 보기
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {mine && myState ? (
          <div className="relative w-full">
            <CubePlay
              n={PRACTICE_N}
              state={myState}
              mask={board?.mask ?? null}
              syncToken={syncToken}
              settings={settings}
              onMove={onMove}
              onCommand={onCommand}
              locked={phase !== "race" || over}
              hideKeys
            />
            {okKey && (
              <span
                aria-hidden
                data-practice-ok
                className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500/90 px-3 py-1 font-bold text-black text-xl"
              >
                ✓
              </span>
            )}
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-white/70">보는 중</p>
        )}
      </section>
    </div>
  );
}

/** 판 끝 순위: 시간·정확도·가장 긴 콤보. 정확도와 콤보는 이 기기가 수 기록으로 계산한 값 */
function PracticeResult({
  room,
  snap,
  final,
  local,
  actions,
}: {
  room: CubeRoom;
  snap: RaceSnapshot;
  final: boolean;
  local: boolean;
  actions?: ReactNode;
}) {
  const session = room.anySession();
  const round = room.rounds.find((r) => r.race === room.state?.race?.id);
  const result = round?.result ?? snap.result;
  if (!session || !result) return null;
  const myRank = result.ranking.indexOf(room.me);
  const me = result.players[room.me];
  const head = result.cancelled
    ? "이번 판은 열리지 않았어요."
    : result.noDecision
      ? "이 판은 두 기기 기록이 달라 판정하지 않았어요."
      : me?.status === "done" && !me.unranked && myRank >= 0
        ? `${myRank + 1}위예요.`
        : me
          ? "이번 판은 못 끝냈어요."
          : "판이 끝났어요.";
  let place = 0;
  return (
    <section
      className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4"
      data-cube-result={final ? "final" : "live"}
      data-practice-result
    >
      <h2 className="font-bold text-lg">{head}</h2>
      <div>
        <table className="w-full text-sm">
          <thead className="text-white/50 text-xs">
            <tr>
              <th className="py-1 text-left font-normal">순위</th>
              <th className="py-1 text-left font-normal">이름</th>
              <th className="py-1 text-right font-normal">시간</th>
              <th className="py-1 text-right font-normal">정확도</th>
              <th className="break-keep py-1 text-right font-normal">
                가장 긴 콤보
              </th>
            </tr>
          </thead>
          <tbody>
            {result.ranking.map((id) => {
              const p = result.players[id];
              const t = trackIn(session.stateOf(id));
              const sum = t ? versusSummary(t) : null;
              const ranked = p?.status === "done" && !p.unranked;
              if (ranked) place++;
              const time =
                p?.status === "done"
                  ? p.accepted !== undefined
                    ? formatMs(p.accepted)
                    : "확인 안 됨"
                  : p?.status === "forfeit"
                    ? "기권"
                    : "못 끝냄";
              const bot = room.state?.players.find((x) => x.id === id)?.bot;
              const botOk =
                bot !== undefined && round
                  ? practiceBotRunOk(
                      bot,
                      round.start,
                      round.seed,
                      id,
                      round.logs[id] ?? [],
                      p?.status === "done",
                    )
                  : null;
              return (
                <tr
                  key={id}
                  data-cube-rank={id}
                  data-practice-accuracy={
                    sum ? Math.round(sum.accuracy * 100) : undefined
                  }
                  data-practice-best={sum?.bestCombo}
                  className={id === room.me ? "text-amber-200" : undefined}
                >
                  <td className="py-1 font-mono tabular-nums">
                    {ranked ? place : "-"}
                  </td>
                  <td className="truncate py-1">
                    {room.playerName(id)}
                    {botOk === false && (
                      <span className="ml-1 text-rose-300 text-xs">
                        컴퓨터 계획과 다름
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">
                    {time}
                    {p?.status === "dnf" && (
                      <span className="block text-white/50 text-xs">
                        {sum?.solved ?? 0}/{t?.problems.length ?? 10}문제
                      </span>
                    )}
                    {!local && p?.weak && (
                      <span className="ml-1 text-white/50 text-xs">
                        확인 약함
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">
                    {sum ? `${Math.round(sum.accuracy * 100)}%` : "-"}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">
                    {sum?.bestCombo ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MatchBoard room={room} />
      {final && actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </section>
  );
}
