"use client";

import { type BotPlan, botSkillText, fitTargetMs } from "@game/cube-ai";
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { realClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { caseById, shortName } from "../algs/check";
import { spotCase } from "../algs/spot";
import {
  type AlgBook,
  habitList,
  loadAlgBook,
  usedAlg,
  watchAlgBook,
} from "../algs/store";
import { stickersFromState as stickersOf } from "../bridge";
import {
  addChallenge,
  bestScore,
  CHALLENGE_KINDS,
  CHALLENGE_LEVELS,
  CHALLENGE_SIZES,
  type ChallengeEntry,
  type ChallengeKind,
  type ChallengeLevel,
  type ChallengePick,
  challengeScore,
  KIND_LABEL,
  LEVEL_LABEL,
  limitFor,
  loadChallenges,
  loadPick,
  savePick,
  stageCount,
} from "../challenge";
import {
  beginDaily,
  DAILY_SIZES,
  type DailyEntry,
  dailyEntry,
  dailyEvent,
  dailySeed,
  dailyStreak,
  finishDaily,
  kstDate,
  loadDaily,
  markString,
  shortDate,
} from "../daily";
import { COMBO_SHOW } from "../flow/strip";
import { soloSound } from "../game-sounds";
import type { Command } from "../input";
import type { AlgCase } from "../learn";
import { FIT_CHOICE } from "../online/bot-choices";
import { recentAverage } from "../online/handicap";
import { NEAR_LIMIT, type ShortSolution } from "../progress/distance";
import { bestSegments, goldSplits, isPersonalBest } from "../progress/gold";
import { groupSplits } from "../progress/splits";
import {
  addRecord,
  averageOf,
  formatMs,
  loadBestFive,
  loadRecords,
  parseSplits,
  resultMs,
  type SolveInput,
  type SolveMode,
  type SolveRecord,
} from "../records";
import { solveSteps } from "../replay-player";
import { type RivalOutcome, rivalOutcome, rivalSeed } from "../rival";
import { useCubeSettings } from "../settings";
import { type SessionCue, SolveSession } from "../solve-session";
import { type MyTier, myTier } from "../tiers/rank";
import { TierLink } from "../tiers/TierTable";
import { useRenewable } from "../use-renewable";
import type { CubeView } from "../view";
import {
  distanceInWorker,
  planInWorker,
  scrambleInWorker,
  shortSolutionInWorker,
  warmUpScramble,
} from "../worker";
import { AlgChips } from "./AlgChips";
import {
  ChallengePanel,
  ChallengeResult,
  HpBar,
  REFILL_SHOW_MS,
} from "./ChallengeParts";
import { CubePlay, playCubeSound } from "./CubePlay";
import { averagesFor, DailyPanel, DailyShare } from "./DailyParts";
import { useMoveKeys } from "./MoveChip";
import { RivalPanel, RivalSelect } from "./RivalPanel";
import { MilestoneChips, ProgressMeter, SplitList } from "./SolveProgress";
import "@/cube/components/cube-fx.css";

/**
 * 혼자 맞추기(`/cube/solo`)와 가상 블라인드(`/cube/blind`) 화면(docs/47 1·7절).
 * 진행은 `SolveSession`(엔진 상태가 기준), 3D는 `CubePlay`가 따라 그린다.
 */

const SIZES = [2, 3, 4, 5, 6, 7];

function eventFor(n: number, mode: SolveMode): ScrambleEvent {
  if (n === 3 && mode === "blind") return "333bf";
  return `${n}${n}${n}` as ScrambleEvent;
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

/** 이 단계에 이른 수는 맞추기에 든다(입력 방식을 센다) */
const SOLVING_PHASES: ReadonlySet<string> = new Set([
  "solving",
  "blindSolve",
  "done",
]);

const PHASE_HINT: Record<string, string> = {
  free: "",
  inspect: "살펴보는 중",
  ready: "준비",
  solving: "맞추는 중",
  memo: "외우는 중",
  blindSolve: "가린 채 맞추는 중",
  done: "끝",
};

/** 오늘의 섞기 한 판: 그날 처음 받은 섞기면 기록(official), 아니면 연습 */
interface DailyAttempt {
  kind: "official" | "practice";
  date: string;
  startedAt: number;
}

/** 나란히 맞추는 컴퓨터(오늘의 섞기·제한 도전, `rival.ts`). 섞기마다 하나 */
interface Rival {
  scramble: string;
  /** 단계 글(「내 실력에 맞춤」은 목표 시간을 넣은 글) */
  bot: string;
  start: PuzzleState;
  plan: BotPlan | null;
  outcome: RivalOutcome | null;
}

/** 제한 도전 한 판: 고른 것과 그때의 최고 점수(결과 상자의 「최고 점수」) */
interface ChallengeRun {
  pick: ChallengePick;
  budget: number;
  short: number | null;
  priorBest: number | null;
}

/**
 * `challenge`: 제한 도전(`/cube/challenge`, docs/51 2-3). 혼자 맞추기 판에 시간·수 체력을 단다(크기 2×2·3×3). 살펴보기는
 * 늘 켜고(같은 조건으로 견주게), 기록은 혼자 맞추기 기록이 아니라 `cube.challenge.v1`에 둔다.
 *
 * `daily`: 오늘의 섞기(`/cube/daily`, docs/51 2-4). 혼자 맞추기와 같은 판에 날짜 씨앗 섞기·하루 한 번 기록·공유 글을 더한다.
 * 살펴보기는 설정과 상관없이 늘 켠다(모두 같은 조건으로 견주게)
 */
export function SolveApp({
  mode,
  daily = false,
  challenge = false,
}: {
  mode: SolveMode;
  daily?: boolean;
  challenge?: boolean;
}) {
  const settings = useCubeSettings();
  const [n, setN] = useState(3);
  const sizes: readonly number[] = daily
    ? DAILY_SIZES
    : challenge
      ? CHALLENGE_SIZES
      : SIZES;
  // 제한 도전: 고른 체력·어려움(크기는 n), 이 기기 기록, 지금 판
  const [kind, setKind] = useState<ChallengeKind>("time");
  const [level, setLevel] = useState<ChallengeLevel>("normal");
  const [challenges, setChallenges] = useState<ChallengeEntry[]>([]);
  const [run, setRun] = useState<ChallengeRun | null>(null);
  const runRef = useRef<ChallengeRun | null>(null);
  runRef.current = run;
  const [lastEntry, setLastEntry] = useState<ChallengeEntry | null>(null);
  useEffect(() => {
    if (!challenge) return;
    const p = loadPick();
    setN(p.n);
    setKind(p.kind);
    setLevel(p.level);
    setChallenges(loadChallenges());
  }, [challenge]);
  const pick: ChallengePick = { n, kind, level };
  // 오늘의 섞기: 날짜(한국 시각), 이 기기의 날마다 기록, 지금 판
  const [today, setToday] = useState("");
  const [dailyList, setDailyList] = useState<DailyEntry[]>([]);
  const [attempt, setAttempt] = useState<DailyAttempt | null>(null);
  const attemptRef = useRef<DailyAttempt | null>(null);
  attemptRef.current = attempt;
  const officialLiveRef = useRef(false);
  useEffect(() => {
    const check = () => setToday(kstDate(Date.now()));
    check();
    setDailyList(loadDaily());
    // 화면을 켜 둔 채 자정을 넘기면 날짜를 바꾼다
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, []);
  // 컴퓨터와 겨루기(오늘의 섞기·제한 도전): 고른 단계("" 없이), 이 섞기의 컴퓨터, 내가 출발한 때(realClock)
  const [rivalPick, setRivalPick] = useState("");
  const [rival, setRival] = useState<Rival | null>(null);
  const [rivalStart, setRivalStart] = useState<number | null>(null);
  const rivalOn = (daily || challenge) && mode === "solo" && rivalPick !== "";
  const [version, setVersion] = useState(0);
  const [syncToken, setSyncToken] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [records, setRecords] = useState<SolveRecord[]>([]);
  /**
   * 이번 판을 섞은 때의 기록(구간 골드·개인 최고를 견줄 옛 기록, docs/51 2-2). 판이 끝나 기록이 더해져도 이번 판과
   * 견주지 않게 섞을 때 떠 둔다
   */
  const [prior, setPrior] = useState<SolveRecord[]>([]);
  const bests = useMemo(() => bestSegments(prior), [prior]);
  /** 이번 판을 섞은 때의 티어(혼자 맞추기, 결과 상자가 티어가 올랐는지 견준다) */
  const [priorTier, setPriorTier] = useState<MyTier | null>(null);
  // 세션 소리(골드·개인 최고)가 지금 판의 옛 기록을 읽는다
  const priorRef = useRef(prior);
  priorRef.current = prior;
  const bestsRef = useRef(bests);
  bestsRef.current = bests;
  const [notice, setNotice] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [, tick] = useState(0);
  const viewRef = useRef<CubeView | null>(null);
  const replayTimers = useRef<number[]>([]);
  /** 섞기 요청 번호. 답이 왔을 때 번호가 바뀌었으면(크기를 바꿨거나 화면을 떠났으면) 그 답을 버린다 */
  const scrambleRequest = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // 상황 알림(설정에서 켰을 때, 혼자 맞추기 3×3): 내 목록 상황에 이르면 구석에 이름과 내 공식
  const [algBook, setAlgBook] = useState<AlgBook>({});
  const [spotted, setSpotted] = useState<AlgCase | null>(null);
  /** 이번 판에서 만난 내 목록 상황(기록에 남긴다) */
  const metRef = useRef<string[]>([]);
  const [met, setMet] = useState<string[]>([]);
  const alertOn = settings.caseAlert && mode === "solo" && n === 3;
  const myCases = useRef<AlgCase[]>([]);
  myCases.current = habitList(algBook).map((x) => x.c);
  const { keysOf } = useMoveKeys(3);
  useEffect(() => {
    setAlgBook(loadAlgBook());
    return watchAlgBook(setAlgBook);
  }, []);
  /** 이번 판 맞추기 동안 수를 둔 입력(처음 쓴 차례, 기록의 `inputs`) */
  const inputsRef = useRef<SolveInput[]>([]);
  // 새 판 준비: 만난 상황과 입력 방식을 비운다
  const clearMet = useCallback(() => {
    inputsRef.current = [];
    metRef.current = [];
    setMet([]);
    setSpotted(null);
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const sync = useCallback(() => setSyncToken((v) => v + 1), []);

  // 크기·방식마다 세션 하나. 효과 정리에서 치우고, 개발 모드처럼 효과가 다시 돌면 새로 만든다
  const session = useRenewable(() => {
    // 소리 고르기는 game-sounds.ts(docs/51 5절): 골드 칩이면 띵 대신 반짝임, 개인 최고면 맞춤 대신 팡파르
    const onCue = (cue: SessionCue) => {
      const r = made.result;
      const last = made.splits.at(-1);
      playCubeSound(
        settingsRef.current,
        soloSound(cue, {
          gold:
            cue === "milestone" &&
            last !== undefined &&
            goldSplits(made.splits, bestsRef.current).has(last.ms),
          best:
            cue === "solved" &&
            !challenge &&
            r !== null &&
            isPersonalBest(
              r.ms === null ? null : r.ms + r.penalty,
              priorRef.current,
            ),
        }),
      );
    };
    const made: SolveSession = new SolveSession({
      n,
      mode,
      inspection: true,
      clock: realClock,
      onChange: bump,
      onCue,
      onRecord: (raw) => {
        // 입력 방식·살펴보기는 화면이 안다(세션은 수만 받는다)
        const r: SolveRecord = {
          ...raw,
          ...(inputsRef.current.length > 0
            ? { inputs: [...inputsRef.current] }
            : {}),
          inspection: made.inspection,
        };
        if (challenge) {
          // 제한 도전은 혼자 맞추기 기록(평균)에 넣지 않고 따로 둔다
          const c = runRef.current;
          if (!c) return;
          const stages = stageCount(made.splits);
          const left = made.hpLeft() ?? 0;
          const reason = made.result?.dnfReason;
          const entry: ChallengeEntry = {
            at: r.at,
            n: r.n,
            kind: c.pick.kind,
            level: c.pick.level,
            ok: r.ms !== null,
            score: challengeScore(c.pick.kind, stages, left),
            stages,
            left,
            ms: made.playedMs,
            moves: c.pick.kind === "moves" ? made.limitMoves : made.moveCount,
            budget: c.budget,
            ...(c.short === null ? {} : { short: c.short }),
            scramble: r.scramble,
            ...(r.seed === undefined ? {} : { seed: r.seed }),
            ...(r.splits ? { splits: r.splits } : {}),
            ...(reason === "time" ||
            reason === "moves" ||
            reason === "inspection"
              ? { reason }
              : {}),
          };
          setLastEntry(entry);
          setChallenges(addChallenge(entry));
          return;
        }
        const a = attemptRef.current;
        if (daily) {
          // 연습은 어디에도 남기지 않는다. 기록 시도는 혼자 맞추기 기록(평균·골드)과 날마다 기록에 함께
          if (a?.kind !== "official") return;
          const before = loadRecords(mode, n);
          setRecords(addRecord({ ...r, daily: a.date }));
          setDailyList(
            finishDaily(a.date, {
              ...r,
              ...(made.result?.dnfReason === "inspection" ||
              made.result?.dnfReason === "unsolved"
                ? { dnfReason: made.result.dnfReason }
                : {}),
              marks: markString(made.splits, averagesFor(a.startedAt, before)),
            }),
          );
          return;
        }
        setRecords(
          addRecord(
            metRef.current.length > 0
              ? { ...r, myCases: [...metRef.current] }
              : r,
          ),
        );
        inputsRef.current = [];
      },
    });
    return made;
  }, `${n}-${mode}`);
  session.inspection = daily || challenge || settings.inspection;

  useEffect(() => {
    setRecords(loadRecords(mode, n));
    sync();
    return () => {
      scrambleRequest.current++;
    };
  }, [mode, n, sync]);

  // 표가 필요한 섞기(2×2·3×3)는 화면을 열 때 워커에서 미리 만들어 둔다
  useEffect(() => {
    if (n <= 3) warmUpScramble(eventFor(n, mode));
  }, [n, mode]);

  // 시간이 흐르는 동안 시계 글을 다시 그린다
  useEffect(() => {
    if (!session.running) return;
    const id = window.setInterval(() => tick((t) => t + 1), 47);
    return () => window.clearInterval(id);
  });

  const stopReplay = useCallback(() => {
    for (const id of replayTimers.current) window.clearTimeout(id);
    replayTimers.current = [];
    setReplaying(false);
  }, []);

  const doScramble = useCallback(async () => {
    if (preparing) return;
    stopReplay();
    setPreparing(true);
    setNotice(null);
    const id = ++scrambleRequest.current;
    const stale = () => id !== scrambleRequest.current || session.disposed;
    const date = kstDate(Date.now());
    const seed = daily ? dailySeed(date, n) : randomSeed();
    try {
      const s = await scrambleInWorker(
        daily ? dailyEvent(n) : eventFor(n, mode),
        seed,
      );
      if (stale()) return;
      // 제한 도전: 수 체력은 이 섞기의 짧은 풀이가 있어야 정해진다
      let limit: ReturnType<typeof limitFor> | undefined;
      if (challenge) {
        let shortMoves: number | null = null;
        if (kind === "moves") {
          try {
            const start = applyMoves(n, solvedCube(n), parseMoves(n, s.text));
            shortMoves = (await shortSolutionInWorker(n, start))?.moves ?? null;
          } catch {
            shortMoves = null;
          }
          if (stale()) return;
        }
        limit = limitFor(n, kind, level, shortMoves);
        setRun({
          pick: { n, kind, level },
          budget: limit.kind === "time" ? limit.startMs : limit.budget,
          short: shortMoves,
          priorBest: bestScore(loadChallenges(), { n, kind, level }),
        });
        setLastEntry(null);
      }
      clearMet();
      const before = loadRecords(mode, n);
      setPrior(before);
      setPriorTier(mode === "solo" ? myTier(n, before, loadBestFive(n)) : null);
      if (daily) {
        const now = Date.now();
        const begun = beginDaily({ date, n, seed, scramble: s.text, now });
        setDailyList(begun.entries);
        setToday(date);
        setAttempt({ kind: begun.kind, date, startedAt: now });
      }
      session.start(s.text, seed, limit);
      sync();
      if (!s.official) setNotice(TEMP_SCRAMBLE);
      setRivalStart(null);
      if (rivalOn) {
        const bot =
          rivalPick === FIT_CHOICE
            ? botSkillText({
                kind: "fit",
                targetMs: fitTargetMs(n, recentAverage(loadRecords("solo", n))),
              })
            : rivalPick;
        const start = applyMoves(n, solvedCube(n), parseMoves(n, s.text));
        setRival({ scramble: s.text, bot, start, plan: null, outcome: null });
        planInWorker(bot, n, start, rivalSeed(seed, n)).then(
          (plan) => {
            if (stale()) return;
            const outcome = rivalOutcome(n, start, plan, limit ?? null);
            setRival((r) =>
              r && r.scramble === s.text ? { ...r, plan, outcome } : r,
            );
          },
          () => {
            if (stale()) return;
            setRival(null);
            setNotice("컴퓨터가 맞출 길을 찾지 못했어요. 혼자 맞춰 보세요.");
          },
        );
      } else setRival(null);
    } catch {
      if (!stale()) setNotice("섞기를 만들지 못했어요. 다시 눌러 보세요.");
    } finally {
      if (id === scrambleRequest.current) setPreparing(false);
    }
  }, [
    preparing,
    n,
    mode,
    daily,
    challenge,
    kind,
    level,
    session,
    sync,
    stopReplay,
    clearMet,
    rivalOn,
    rivalPick,
  ]);

  const onMove = useCallback(
    (
      move: Parameters<SolveSession["input"]>[0],
      notation: string,
      input?: SolveInput,
    ) => {
      const before = session.phase;
      const r = session.input(move, notation);
      if (r === "blocked") {
        setNotice(MEMO_BLOCKED);
        return false;
      }
      if (
        input &&
        before !== "free" &&
        before !== "done" &&
        SOLVING_PHASES.has(session.phase) &&
        !inputsRef.current.includes(input)
      )
        inputsRef.current = [...inputsRef.current, input];
      if (alertOn && myCases.current.length > 0) {
        const c =
          session.phase === "solving"
            ? spotCase(3, session.state, myCases.current)
            : null;
        setSpotted(c);
        if (c && !metRef.current.includes(c.id)) {
          metRef.current = [...metRef.current, c.id];
          setMet(metRef.current);
        }
      }
      return true;
    },
    [session, alertOn],
  );

  const onCommand = useCallback(
    (c: Command) => {
      if (c === "undo") return session.undo();
      // 오늘의 섞기 기록 시도 중에는 섞기·처음으로 키를 받지 않는다(잘못 눌러 하루 한 번을 날리지 않게)
      if ((c === "reset" || c === "scramble") && officialLiveRef.current)
        return null;
      if (c === "reset") {
        stopReplay();
        clearMet();
        setRival(null);
        setRivalStart(null);
        session.reset();
        sync();
      } else if (c === "scramble") {
        void doScramble();
      } else if (c === "inspectionSkip") {
        const r = session.advance();
        if (r === "memoEnd" || r === "blindEnd") sync();
      }
      return null;
    },
    [session, sync, doScramble, stopReplay, clearMet],
  );

  /** 기록 하나를 다시 본다: 섞인 상태에서 수를 그때 시각대로 */
  const replay = (r: SolveRecord) => {
    const view = viewRef.current;
    if (!view || r.n !== n) return;
    stopReplay();
    session.reset();
    const scrambled = applyMoves(n, solvedCube(n), parseMoves(n, r.scramble));
    view.setStickers(
      // 섞인 상태에서 시작
      stickersOf(n, scrambled),
    );
    setReplaying(true);
    // 오래 멈춘 곳은 1초로 줄인다(`solveSteps`, Cubie 다시 보기와 같다)
    const steps = solveSteps(n, r.replay);
    for (const { at, moves } of steps)
      replayTimers.current.push(
        window.setTimeout(() => {
          for (const m of moves) viewRef.current?.enqueue(m);
        }, at),
      );
    const at = steps.at(-1)?.at ?? 0;
    replayTimers.current.push(
      window.setTimeout(() => {
        setReplaying(false);
        sync();
      }, at + 600),
    );
  };

  useEffect(() => stopReplay, [stopReplay]);

  const result = session.result;
  const phase = session.phase;
  // 컴퓨터는 내가 맞추기를 시작한 순간 출발한다(살펴보기 뒤 첫 면 돌리기)
  useEffect(() => {
    if (phase === "solving" && rival && rivalStart === null)
      setRivalStart(realClock.now() - session.elapsed());
  }, [phase, rival, rivalStart, session]);
  const rivalT = rivalStart === null ? null : realClock.now() - rivalStart;
  const rivalRunning =
    rivalT !== null && !!rival?.outcome && rivalT < rival.outcome.endAt;
  // 내 판이 끝난 뒤에도 컴퓨터가 끝날 때까지 다시 그린다
  useEffect(() => {
    if (!rivalRunning || session.running) return;
    const id = window.setInterval(() => tick((t) => t + 1), 47);
    return () => window.clearInterval(id);
  }, [rivalRunning, session.running]);
  /** 오늘의 섞기 기록 시도가 진행 중(크기 바꾸기·섞기를 막는다) */
  const officialLive =
    daily &&
    attempt?.kind === "official" &&
    (phase === "inspect" || phase === "ready" || phase === "solving");
  officialLiveRef.current = officialLive;
  /** 제한 도전이 진행 중(크기·체력·어려움 바꾸기를 막는다) */
  const challengeLive =
    challenge &&
    (phase === "inspect" || phase === "ready" || phase === "solving");
  const choosePick = (next: Partial<ChallengePick>) => {
    const p = { ...pick, ...next };
    savePick(p);
    if (next.kind) setKind(next.kind);
    if (next.level) setLevel(next.level);
  };
  const todayEntry = today ? dailyEntry(dailyList, today, n) : undefined;
  /** 「내 실력에 맞춤」 예상 시간을 보일 내 평균(그 크기 혼자 맞추기 최근) */
  const rivalAverage = useMemo(
    () => (daily || challenge ? recentAverage(records) : null),
    [daily, challenge, records],
  );
  const doneToday = !!todayEntry && !officialLive;
  // 「외우는 동안에는…」은 외우는 동안만. 맞추기를 시작하거나 끝나면 지운다
  useEffect(() => {
    if (phase !== "memo") setNotice((v) => (v === MEMO_BLOCKED ? null : v));
  }, [phase]);
  // 완성까지 거리(2×2·3×3, 8수 안쪽일 때만 보인다). 워커에는 한 번에 하나만 묻는다: 수마다 물으면 워커가 일을
  // 차례로 하므로 빠르게 칠수록 지난 상태들의 답을 다 기다린 뒤에야 지금 상태의 답이 온다(2026-11-05 CI에서
  // 5초 넘게 늦음). 답이 왔을 때 그사이 상태가 바뀌었으면 그 답은 버리고 마지막 상태만 다시 묻는다
  const [near, setNear] = useState<number | null>(null);
  const tracking = mode === "solo" && n <= 3 && phase === "solving";
  const nearAsk = useRef({ busy: false, live: false, n, session });
  nearAsk.current.n = n;
  nearAsk.current.session = session;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 수마다(version) 다시 묻는다
  useEffect(() => {
    const ask = nearAsk.current;
    ask.live = tracking;
    if (!tracking) {
      setNear(null);
      return;
    }
    if (ask.busy) return; // 지금 묻는 답이 오면 마지막 상태를 다시 묻는다
    // 크기·세션이 바뀌어도 답이 온 때의 마지막 것을 본다(ref)
    const run = () => {
      const { n: size, session: s } = ask;
      const asked = s.state;
      ask.busy = true;
      distanceInWorker(size, asked, NEAR_LIMIT)
        .then((d) => {
          if (ask.live && ask.session.state === asked) setNear(d);
        })
        .catch(() => undefined)
        .finally(() => {
          ask.busy = false;
          if (ask.live && ask.session.state !== asked) run();
        });
    };
    run();
  }, [tracking, version, n, session]);
  useEffect(
    () => () => {
      nearAsk.current.live = false;
    },
    [],
  );
  // 이 섞기의 짧은 풀이(결과 상자, 2×2·3×3)
  const [short, setShort] = useState<{
    scramble: string;
    value: ShortSolution;
  } | null>(null);
  const solvedScramble =
    mode === "solo" &&
    !challenge &&
    n <= 3 &&
    phase === "done" &&
    session.result?.ms != null
      ? session.scramble
      : null;
  useEffect(() => {
    if (!solvedScramble) return;
    let live = true;
    const start = applyMoves(n, solvedCube(n), parseMoves(n, solvedScramble));
    shortSolutionInWorker(n, start)
      .then((v) => {
        if (live && v) setShort({ scramble: solvedScramble, value: v });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [solvedScramble, n]);
  const elapsed = session.elapsed();
  const inspecting = phase === "inspect";
  const showProgress =
    mode === "solo" &&
    (phase === "inspect" ||
      phase === "ready" ||
      phase === "solving" ||
      phase === "done");
  const last = records[0];
  // 지금 최고 티어(혼자 맞추기 기록 칸, docs/47 14절). 섞은 때보다 오르면 결과 상자에도
  const tierNow = useMemo(
    () => (mode === "solo" ? myTier(n, records, loadBestFive(n)) : null),
    [mode, n, records],
  );
  const tierUp =
    tierNow && (!priorTier || tierNow.place.step > priorTier.place.step)
      ? tierNow
      : null;
  const best = records.reduce<number | null>((b, r) => {
    const t = resultMs(r);
    return t !== null && (b === null || t < b) ? t : b;
  }, null);

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-phase={phase}
        data-cube-version={version}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">
            {daily
              ? "오늘의 섞기"
              : challenge
                ? "제한 도전"
                : mode === "blind"
                  ? "블라인드(가상)"
                  : "혼자 맞추기"}
          </h1>
          {daily && today && (
            <span className="text-sm text-white/60 tabular-nums">
              {shortDate(today)}
            </span>
          )}
          {daily && doneToday && (
            <span
              data-cube-daily-done
              className="rounded-full border border-emerald-300/50 bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-200 text-xs"
            >
              오늘 완료
            </span>
          )}
          {challenge && (
            <div className="ml-auto flex items-center gap-3">
              <PickSelect
                label="체력"
                attr="data-cube-challenge-kind"
                value={kind}
                options={CHALLENGE_KINDS.map((k) => [k, KIND_LABEL[k]])}
                disabled={preparing || challengeLive}
                onChange={(v) => choosePick({ kind: v as ChallengeKind })}
              />
              <PickSelect
                label="어려움"
                attr="data-cube-challenge-level"
                value={level}
                options={CHALLENGE_LEVELS.map((l) => [l, LEVEL_LABEL[l]])}
                disabled={preparing || challengeLive}
                onChange={(v) => choosePick({ level: v as ChallengeLevel })}
              />
            </div>
          )}
          {(daily || challenge) && mode === "solo" && (
            <div className={challenge ? "" : "ml-auto"}>
              <RivalSelect
                n={n}
                average={rivalAverage}
                value={rivalPick}
                disabled={preparing || officialLive || challengeLive}
                onChange={(v) => {
                  setRivalPick(v);
                  setRival(null);
                  setRivalStart(null);
                }}
              />
            </div>
          )}
          <label
            className={`${challenge || daily ? "" : "ml-auto "}flex items-center gap-1 text-sm`}
          >
            크기
            <select
              data-cube-size
              value={n}
              disabled={preparing || officialLive || challengeLive}
              onChange={(e) => {
                stopReplay();
                scrambleRequest.current++;
                setPreparing(false);
                setAttempt(null);
                setRun(null);
                setLastEntry(null);
                setRival(null);
                setRivalStart(null);
                if (challenge) savePick({ ...pick, n: Number(e.target.value) });
                setN(Number(e.target.value));
                e.target.blur();
              }}
              className="rounded bg-white/10 px-2 py-1 disabled:opacity-60"
            >
              {sizes.map((s) => (
                <option key={s} value={s} className="bg-neutral-800">
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-cube-scramble-button
            onClick={() => void doScramble()}
            disabled={preparing || officialLive}
            className={`rounded-lg px-4 py-1.5 font-semibold text-sm disabled:opacity-60 ${
              daily && doneToday
                ? "border border-white/25 bg-white/10 text-white"
                : "bg-sky-500 text-black"
            }`}
          >
            {preparing
              ? "섞기 준비 중…"
              : !daily
                ? "섞기"
                : doneToday
                  ? "연습으로 다시"
                  : "오늘의 섞기 받기"}
          </button>
          {(phase === "memo" || phase === "blindSolve") && (
            <button
              type="button"
              onClick={() => onCommand("inspectionSkip")}
              className="rounded-lg bg-amber-400 px-4 py-1.5 font-semibold text-black text-sm"
            >
              {phase === "memo" ? "시작(가리기)" : "끝"}
            </button>
          )}
        </header>
        <SoloBranches
          current={
            daily
              ? "daily"
              : challenge
                ? "challenge"
                : mode === "blind"
                  ? "blind"
                  : "solo"
          }
        />

        <div
          className="grid gap-4 md:grid-cols-[1fr_260px]"
          data-cube-daily-attempt={daily ? (attempt?.kind ?? "") : undefined}
        >
          <section className="relative flex flex-col items-center gap-2">
            {alertOn && spotted && phase === "solving" && (
              <div
                data-case-alert={spotted.id}
                className="pointer-events-none absolute right-0 bottom-0 z-10 flex max-w-64 flex-col gap-0.5 rounded-lg bg-black/60 px-2 py-1 text-xs"
              >
                <span className="font-semibold">{shortName(spotted)}</span>
                <AlgChips
                  alg={usedAlg(algBook, spotted)}
                  keysOf={keysOf}
                  className="font-mono text-[11px] text-white/80"
                />
              </div>
            )}
            <div className="flex w-full flex-wrap items-baseline justify-center gap-x-6 gap-y-1">
              <span
                data-cube-clock
                className={`font-mono font-semibold text-4xl tabular-nums ${
                  inspecting
                    ? elapsed > 12_000
                      ? "text-red-400"
                      : elapsed > 8_000
                        ? "text-amber-300"
                        : "text-sky-300"
                    : ""
                }`}
              >
                {inspecting
                  ? Math.max(0, Math.ceil((15_000 - elapsed) / 1000))
                  : formatMs(phase === "done" ? (result?.ms ?? null) : elapsed)}
              </span>
              <span className="text-sm text-white/70">
                수 <b data-cube-moves>{session.moveCount}</b>
              </span>
              {/* 지금 단계(살펴보는 중·맞추는 중…)는 시간 줄 끝에 작게(큐브 칸 위를 납작하게) */}
              <span className="text-white/55 text-xs">
                {replaying ? "다시 보는 중" : PHASE_HINT[phase]}
              </span>
            </div>
            <p
              className="min-h-10 break-keep text-center font-mono text-sm text-white/80 sm:min-h-5"
              data-cube-scramble={session.scramble}
            >
              {preparing ? "섞기 준비 중…" : session.scramble || " "}
            </p>
            {notice && (
              <p className="text-amber-300 text-xs" role="status">
                {notice}
              </p>
            )}

            {challenge && run && phase !== "free" && (
              <HpBar
                kind={run.pick.kind}
                left={session.hpLeft() ?? 0}
                max={session.hpMax ?? 1}
                refill={
                  run.pick.kind === "time" &&
                  phase === "solving" &&
                  session.lastRefillAt !== null &&
                  Date.now() - session.lastRefillAt < REFILL_SHOW_MS
                    ? session.limit?.kind === "time"
                      ? session.limit.refillMs
                      : null
                    : null
                }
              />
            )}
            {rival && phase !== "free" && (
              <RivalPanel
                n={n}
                bot={rival.bot}
                start={rival.start}
                plan={rival.plan}
                outcome={rival.outcome}
                t={rivalT}
                mine={
                  phase === "done" && result
                    ? {
                        total:
                          result.ms === null
                            ? null
                            : result.ms + result.penalty,
                        score: challenge ? (lastEntry?.score ?? null) : null,
                      }
                    : null
                }
                settings={settings}
                scored={challenge}
              />
            )}
            {showProgress && (
              <>
                <ProgressMeter
                  n={n}
                  progress={session.progress}
                  best={session.bestProgress}
                  near={phase === "solving" ? near : null}
                />
                {phase !== "done" && (
                  <MilestoneChips
                    splits={session.splits}
                    gold={goldSplits(session.splits, bests)}
                  />
                )}
              </>
            )}
            {phase === "done" && result && challenge && lastEntry && (
              <ChallengeResult
                entry={lastEntry}
                best={
                  lastEntry.score > 0 &&
                  (run?.priorBest == null || lastEntry.score > run.priorBest)
                }
                splits={session.splits}
                gold={goldSplits(session.splits, bests)}
              />
            )}
            {phase === "done" && result && !challenge && (
              <ResultBox
                mode={mode}
                result={result}
                splits={session.splits}
                gold={goldSplits(session.splits, bests)}
                best={isPersonalBest(
                  result.ms === null ? null : result.ms + result.penalty,
                  prior,
                )}
                combo={session.longestCombo}
                tierUp={tierUp}
                practice={daily && attempt?.kind === "practice"}
                short={
                  short && short.scramble === session.scramble
                    ? short.value
                    : null
                }
              />
            )}
            {phase === "done" &&
              daily &&
              attempt?.kind === "official" &&
              todayEntry?.status === "done" &&
              todayEntry.date === attempt.date && (
                <div className="flex items-center gap-3 md:hidden">
                  {todayEntry.marks && entryMarks(todayEntry)}
                  <DailyShare entry={todayEntry} />
                </div>
              )}
            {phase === "done" && met.length > 0 && (
              <p
                className="text-white/70 text-xs"
                data-cube-met={met.join(" ")}
              >
                만난 내 상황:{" "}
                {met
                  .map((id) => caseById(id))
                  .filter((c): c is AlgCase => !!c)
                  .map(shortName)
                  .join(" · ")}
              </p>
            )}

            <CubePlay
              n={n}
              state={session.state}
              mask={session.mask}
              syncToken={syncToken}
              settings={settings}
              onMove={onMove}
              onCommand={onCommand}
              locked={preparing || replaying}
              onView={(v) => {
                viewRef.current = v;
              }}
              flow={mode === "solo" ? "large" : undefined}
              combo={mode === "solo"}
              comboProgress={
                mode === "solo" ? () => session.flowScore : undefined
              }
              fitViewport
            />
          </section>

          {challenge ? (
            <ChallengePanel pick={pick} entries={challenges} />
          ) : daily ? (
            <DailyPanel
              today={today}
              n={n}
              entries={dailyList}
              streak={today ? dailyStreak(dailyList, today) : 0}
              live={officialLive}
            />
          ) : (
            <aside className="flex flex-col gap-2 text-sm" data-cube-records>
              {/* 블라인드 기록은 혼자 맞추기와 따로 쌓인다(records.ts의 방식·크기마다) */}
              <h2 className="font-semibold" data-cube-records-title>
                {n}×{n} {mode === "blind" ? "블라인드 " : ""}기록
              </h2>
              <dl className="grid grid-cols-3 gap-1 text-center">
                <Stat label="최고" value={formatMs(best ?? undefined)} />
                <Stat
                  label="5번 평균"
                  value={formatMs(averageOf(records, 5))}
                />
                <Stat
                  label="12번 평균"
                  value={formatMs(averageOf(records, 12))}
                />
              </dl>
              {tierNow && (
                <p className="text-xs" data-cube-records-tier>
                  <span className="text-white/50">티어 </span>
                  <TierLink mine={tierNow} />
                  <span className="text-white/40">
                    {" "}
                    · 최고 Ao5 {formatMs(tierNow.ao5)}
                  </span>
                </p>
              )}
              {records.length === 0 ? (
                <p className="text-white/50 text-xs">
                  아직 기록이 없어요. 섞고 맞추면 여기에 쌓여요.
                </p>
              ) : (
                <ol className="flex max-h-80 flex-col gap-0.5 overflow-y-auto pr-1">
                  {records.slice(0, 30).map((r, i) => (
                    <li
                      key={`${r.at}-${r.scramble}`}
                      title={splitTitle(r)}
                      className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5"
                    >
                      <span className="w-6 text-right text-white/40 text-xs">
                        {r.no ?? records.length - i}
                      </span>
                      <span className="w-16 font-mono tabular-nums">
                        {formatMs(resultMs(r))}
                        {r.penalty > 0 && r.ms !== null ? "+" : ""}
                      </span>
                      <span className="text-white/50 text-xs">{r.moves}수</span>
                      {r.replay && (
                        <button
                          type="button"
                          onClick={() => replay(r)}
                          className="ml-auto text-sky-300 text-xs hover:underline"
                        >
                          다시 보기
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {last && (
                <p className="break-all text-white/40 text-xs">
                  지난 섞기: {last.scramble}
                </p>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

/** 머리의 작은 고르기(체력·어려움) */
function PickSelect({
  label,
  attr,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  attr: string;
  value: string;
  options: readonly (readonly [string, string])[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-sm">
      {label}
      <select
        {...{ [attr]: "" }}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          e.target.blur();
        }}
        className="rounded bg-white/10 px-2 py-1 disabled:opacity-60"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v} className="bg-neutral-800">
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-1">
      <dt className="text-white/50 text-xs">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

const MEMO_BLOCKED =
  "외우는 동안에는 면을 돌릴 수 없어요. 큐브 돌리기(x·y·z)로 둘러보세요.";
/** 4×4부터는 무작위 상태 섞기가 없어 무작위 수로 섞는다(타이머의 「임시: 무작위 수」와 같은 뜻) */
const TEMP_SCRAMBLE =
  "임시 섞기: 대회 방식(무작위 상태) 대신 무작위 수로 섞었어요.";

/** 기록 줄에 대면 보이는 구간 기록 */
function splitTitle(r: SolveRecord): string | undefined {
  const groups = groupSplits(parseSplits(r.splits));
  if (groups.length === 0) return undefined;
  return groups.map((g) => `${g.label} ${formatMs(g.ms)}`).join(" · ");
}

function ResultBox({
  mode,
  result,
  splits,
  gold,
  best,
  combo,
  tierUp = null,
  practice,
  short,
}: {
  mode: SolveMode;
  result: NonNullable<SolveSession["result"]>;
  splits: SolveSession["splits"];
  /** 골드 구간(칩 시각 ms) */
  gold: ReadonlySet<number>;
  /** 개인 최고(이 크기·방식의 옛 기록보다 빠름) */
  best: boolean;
  /** 가장 긴 흐름 콤보 */
  combo: number;
  /** 이번 판으로 오른 티어(없으면 null) */
  tierUp?: MyTier | null;
  /** 오늘의 섞기 연습(기록에 넣지 않았다) */
  practice: boolean;
  short: ShortSolution | null;
}) {
  const total = result.ms === null ? null : result.ms + result.penalty;
  const dnf = result.ms === null;
  const tps =
    result.ms && result.ms > 0
      ? (result.moves / (result.ms / 1000)).toFixed(2)
      : null;
  return (
    <div
      data-cube-result={dnf ? "dnf" : "solved"}
      role="status"
      className={`flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 rounded-xl border px-4 py-2 ${
        dnf
          ? "border-rose-400/40 bg-rose-500/10"
          : "border-emerald-400/40 bg-emerald-400/10"
      }`}
    >
      <span
        className={`font-bold text-xl ${dnf ? "text-rose-200" : "text-emerald-300"}`}
      >
        {result.ms === null
          ? result.dnfReason === "inspection"
            ? "DNF(살펴보기 17초 넘김)"
            : "DNF(맞지 않음)"
          : `${formatMs(total)}${result.penalty ? " (+2)" : ""}`}
      </span>
      {practice && (
        <span
          data-cube-practice
          className="rounded-full border border-white/25 px-2 py-0.5 font-semibold text-white/70 text-xs"
        >
          연습
        </span>
      )}
      {best && !practice && (
        <span
          data-cube-pb
          className="cube-gold rounded-full border px-2 py-0.5 font-semibold text-xs"
        >
          개인 최고
        </span>
      )}
      {tierUp && !practice && (
        <span className="text-sm" data-cube-tier-up>
          티어 <TierLink mine={tierUp} />
        </span>
      )}
      {mode === "blind" && result.memoMs !== undefined && (
        <span className="text-sm">
          외우기 {formatMs(result.memoMs)} · 맞추기 {formatMs(result.execMs)}
        </span>
      )}
      <span className="text-sm">{result.moves}수</span>
      {/* DNF는 맞추지 못했으니 빠르기를 보이지 않는다 */}
      {!dnf && tps && <span className="text-sm">초당 {tps}수</span>}
      {!dnf && combo >= COMBO_SHOW && (
        <span className="text-sm text-white/70" data-cube-best-combo={combo}>
          가장 긴 콤보 {combo}
        </span>
      )}
      {!dnf && short && (
        <span className="text-sm text-white/70" data-cube-short={short.moves}>
          {short.exact
            ? `이 섞기의 가장 짧은 풀이 ${short.moves}수`
            : `컴퓨터 풀이 ${short.moves}수`}
        </span>
      )}
      {!dnf && <SplitList splits={splits} gold={gold} />}
    </div>
  );
}

function entryMarks(e: DailyEntry) {
  return (
    <span data-cube-daily-marks={e.marks} className="text-sm tracking-wider">
      {e.marks}
    </span>
  );
}

type SoloBranch = "solo" | "daily" | "challenge" | "blind";

const BRANCHES: { id: SoloBranch; title: string; href: string }[] = [
  { id: "solo", title: "혼자 맞추기", href: "/cube/solo" },
  { id: "daily", title: "오늘의 섞기", href: "/cube/daily" },
  { id: "challenge", title: "제한 도전", href: "/cube/challenge" },
  { id: "blind", title: "블라인드", href: "/cube/blind" },
];

/**
 * 혼자 맞추기의 갈래(docs/47 16-2): 혼자 맞추기·오늘의 섞기·제한 도전·블라인드. 넷은 같은 `SolveApp`의 옵션이고
 * 주소는 그대로 산다. 첫 화면 칸에서는 빠지고 여기서 고른다. 오늘 이 기기에서 오늘의 섞기를 한 크기가 있으면 ✓
 */
function SoloBranches({ current }: { current: SoloBranch }) {
  const [dailyDone, setDailyDone] = useState(false);
  useEffect(() => {
    const today = kstDate(Date.now());
    setDailyDone(loadDaily().some((e) => e.date === today));
  }, []);
  return (
    <nav
      aria-label="혼자 맞추기 갈래"
      className="-mt-1 flex flex-wrap gap-1.5"
      data-solo-branches={current}
    >
      {BRANCHES.map((b) => (
        <a
          key={b.id}
          href={b.href}
          aria-current={b.id === current ? "page" : undefined}
          data-solo-branch={b.id}
          {...(b.id === "daily" && current !== "daily"
            ? {
                "data-cube-daily-link": "",
                "data-cube-daily-done": dailyDone ? "" : undefined,
              }
            : {})}
          {...(b.id === "challenge" && current !== "challenge"
            ? { "data-cube-challenge-link": "" }
            : {})}
          className={cn(
            "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs",
            b.id === current
              ? "border-sky-300/70 bg-sky-500/20 font-semibold text-white"
              : "border-white/15 text-white/80 hover:bg-white/10",
          )}
        >
          {b.title}
          {b.id === "daily" && dailyDone && (
            <span className="text-emerald-300">✓</span>
          )}
        </a>
      ))}
    </nav>
  );
}
