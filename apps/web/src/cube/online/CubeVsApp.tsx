"use client";

import { levelText } from "@game/cube-ai";
import type { MilestoneId } from "@game/cube-engine";
import { useEffect, useRef, useState } from "react";

import { raceClock } from "@/net/race/race-session";
import { randomId } from "@/net/transport";
import {
  type ShapePick,
  type ShapeStart,
  shapePicks,
  shapeSupports,
} from "../patterns/race";
import { ShapeRulePicker } from "../patterns/ShapeRulePicker";
import type { VersusRule } from "../practice/versus";
import { formatMs } from "../records";
import { planInWorker, scrambleInWorker, warmUpScramble } from "../worker";
import { BotLevelPicker } from "./BotLevelPicker";
import {
  DELAY_CHOICES,
  goalChoices,
  type Handicap,
  HELPS,
  type Help,
  helpChoices,
  helpLabel,
  localAverages,
} from "./handicap";
import { drawItem, type ItemKind } from "./items";
import { nextLabel } from "./MatchBoard";
import { PracticeRulePicker } from "./PracticeRulePicker";
import { PARTY_MODE_LABELS, PARTY_MODES, type PartyMode } from "./party";
import { RaceView } from "./RaceView";
import { eventForSize } from "./race-game";
import { CubeRoom, TIME_LIMIT_SEC } from "./room";
import { POINTS_ROUNDS, SCORING_LABELS, type Scoring } from "./standings";
import { useCubeRoom } from "./use-room";
import { testVsBots, testVsSeed, testVsShapeKey } from "./vs-seed";

/**
 * 컴퓨터와 대결(`/cube/vs`, docs/47 10절). 단계를 고르면 같은 섞기로 나란히 맞춘다.
 * 온라인 방과 같은 길(대결 틀 + 컴퓨터 참가자)을 진짜 연결 없이 쓴다.
 */

const SIZES = [2, 3, 4, 5] as const;
/** 컴퓨터 수(나와 함께 8명까지, 둘러앉은 자리 docs/47 9-9) */
const BOT_COUNTS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * 화면 시험만: 아이템 뽑기를 정해 둔다(`window.__cubeItemDraw(받는 사람, 이정표 순번)`, 화면 시험 갈고리 `__cubeTestHooks`가
 * 켜졌을 때만). 컴퓨터와 대결은 이 기기 안에서만 도는 판이라 공정성과 상관없다. 온라인 방에는 넣지 않는다
 */
function testItemDraw(): { drawItem?: typeof drawItem } {
  if (typeof window === "undefined") return {};
  const w = window as {
    __cubeTestHooks?: boolean;
    __cubeItemDraw?: (player: string, milestone: number) => ItemKind | null;
  };
  const hook = w.__cubeItemDraw;
  if (!w.__cubeTestHooks || !hook) return {};
  return {
    drawItem: (seed, player, milestone, standing, rules) =>
      hook(player, milestone) ??
      drawItem(seed, player, milestone, standing, rules),
  };
}

export function CubeVsApp() {
  const [n, setN] = useState(2);
  /** 단계 글(`levelText`) 또는 「내 실력에 맞춤」(`"fit"`) */
  const [level, setLevel] = useState(levelText("casual"));
  const [botCount, setBotCount] = useState(1);
  const [inspection, setInspection] = useState(true);
  /** 판 수: 1이면 한 판, 아니면 점수제(docs/51 3-1) */
  const [rounds, setRounds] = useState(1);
  const [scoring, setScoring] = useState<Scoring>("wins");
  // 내 핸디캡(컴퓨터는 단계로 이미 맞춘다, docs/51 4절)
  const [delay, setDelay] = useState(0);
  const [goal, setGoal] = useState<MilestoneId | "">("");
  const [byAverage, setByAverage] = useState(false);
  const [help, setHelp] = useState<Help | "">("");
  /** 파티 모드(체력바·아이템전, docs/51 3-2·3-3). 「평균 대비」와는 함께 쓰지 않는다 */
  const [partyMode, setPartyMode] = useState<PartyMode | null>(null);
  /** 모양 만들기(docs/47 9-10). 파티 모드와는 함께 쓰지 않는다 */
  const [shapeOn, setShapeOn] = useState(false);
  const [shapeStart, setShapeStart] = useState<ShapeStart>("solved");
  const [shapePick, setShapePick] = useState<ShapePick>("easy");
  const [shapeFormula, setShapeFormula] = useState(true);
  /** 공식 연습 대결(docs/47 16-14). 3×3만, 파티 모드·모양 만들기와 함께 쓰지 않는다 */
  const [practiceOn, setPracticeOn] = useState(false);
  const [practiceRule, setPracticeRule] = useState<VersusRule>({
    stage: "beginner-second",
  });
  const party = partyMode !== null && !practiceOn;
  const shapeNow = shapeOn && shapeSupports(n) && !practiceOn;
  // 크기를 바꿔 고른 어려움이 없으면 그 크기의 첫 어려움으로
  useEffect(() => {
    const picks = shapePicks(n);
    if (!picks.includes(shapePick)) setShapePick(picks[0] ?? "easy");
  }, [n, shapePick]);
  const [averages, setAverages] = useState<Record<string, number>>();
  useEffect(() => setAverages(localAverages()), []);
  // 크기를 바꾸면 그 크기의 목표가 아니므로 비운다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 크기가 바뀔 때만
  useEffect(() => setGoal(""), [n]);
  const myAverage = averages?.[String(n)];
  const [room, setRoom] = useState<CubeRoom | null>(null);
  const version = useCubeRoom(room);
  const roomRef = useRef<CubeRoom | null>(null);

  useEffect(() => warmUpScramble(eventForSize(n)), [n]);
  useEffect(() => () => roomRef.current?.dispose(), []);

  const start = () => {
    roomRef.current?.dispose();
    const r = new CubeRoom({
      clock: raceClock,
      isHost: true,
      name: "나",
      ...(averages ? { avgs: averages } : {}),
      scrambler: scrambleInWorker,
      botPlan: planInWorker,
      // 화면 시험만: 섞기 씨앗을 정해 둔다(`__cubeTestHooks` + `__cubeVsSeed`, vs-seed.ts)
      ...testVsSeed(),
      settings: {
        n: practiceOn ? 3 : n,
        ...(practiceOn ? { practice: practiceRule } : {}),
        ...(rounds > 1
          ? { format: "points" as const, rounds, scoring }
          : { format: "single" as const }),
        inspection,
        timeLimitSec: TIME_LIMIT_SEC[n] ?? 300,
        ...(party && !shapeNow ? { party: partyMode } : {}),
        ...(shapeNow
          ? {
              shape: {
                start: shapeStart,
                pick: shapePick,
                key: testVsShapeKey() ?? randomId(8),
                ...(shapeFormula ? {} : { formula: false }),
              },
            }
          : {}),
      },
      ...testItemDraw(),
    });
    for (let k = testVsBots() ?? botCount; k > 0; k--) r.addBot(level);
    const handicap: Handicap = {};
    if (delay > 0) handicap.delay = { [r.me]: delay };
    const average = byAverage && !party && !shapeNow && !practiceOn;
    if (goal && !average && !shapeNow && !practiceOn)
      handicap.goal = { [r.me]: goal };
    if (average) handicap.score = "avg";
    if (help && !practiceOn) handicap.help = { [r.me]: help };
    r.setHandicap(handicap);
    roomRef.current = r;
    setRoom(r);
    r.startRound();
  };

  const status = room?.state?.status;
  const multi = room?.state?.settings.format === "points";
  const between = multi && status === "between";
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-vs={status ?? "setup"}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">컴퓨터와 대결</h1>
          {multi && room?.state && (
            <span className="text-sm text-white/60">
              {room.state.round}번째 판
            </span>
          )}
        </header>

        {!room ? (
          <section className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white/5 p-4">
            <label
              className={`flex items-center justify-between text-sm ${practiceOn ? "hidden" : ""}`}
            >
              크기
              <select
                data-cube-vs-size
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                className="rounded bg-white/10 px-2 py-1"
              >
                {SIZES.map((k) => (
                  <option key={k} value={k} className="bg-neutral-800">
                    {k}×{k}
                  </option>
                ))}
              </select>
            </label>
            <BotLevelPicker
              n={practiceOn ? 3 : n}
              average={practiceOn ? averages?.["3"] : myAverage}
              value={level}
              onChange={setLevel}
              times={!practiceOn}
            />
            <label className="flex items-center justify-between text-sm">
              컴퓨터 수
              <select
                data-cube-vs-bots
                value={botCount}
                onChange={(e) => setBotCount(Number(e.target.value))}
                className="rounded bg-white/10 px-2 py-1"
              >
                {BOT_COUNTS.map((k) => (
                  <option key={k} value={k} className="bg-neutral-800">
                    {k}명
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1">규칙</legend>
              <div className="flex flex-wrap gap-1">
                {[null, ...PARTY_MODES].map((m) => (
                  <button
                    key={m ?? "normal"}
                    type="button"
                    data-cube-vs-party={m ?? "normal"}
                    aria-pressed={!shapeOn && !practiceOn && partyMode === m}
                    onClick={() => {
                      setPartyMode(m);
                      setShapeOn(false);
                      setPracticeOn(false);
                    }}
                    className={`rounded-lg px-3 py-1.5 ${!shapeOn && !practiceOn && partyMode === m ? "bg-amber-400 text-black" : "bg-white/10"}`}
                  >
                    {m ? PARTY_MODE_LABELS[m] : "일반"}
                  </button>
                ))}
                {shapeSupports(n) && (
                  <button
                    type="button"
                    data-cube-vs-party="shape"
                    aria-pressed={shapeOn && !practiceOn}
                    onClick={() => {
                      setShapeOn(true);
                      setPartyMode(null);
                      setPracticeOn(false);
                    }}
                    className={`rounded-lg px-3 py-1.5 ${shapeOn && !practiceOn ? "bg-amber-400 text-black" : "bg-white/10"}`}
                  >
                    모양 만들기
                  </button>
                )}
                <button
                  type="button"
                  data-cube-vs-party="practice"
                  aria-pressed={practiceOn}
                  onClick={() => {
                    setPracticeOn(true);
                    setShapeOn(false);
                    setPartyMode(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 ${practiceOn ? "bg-amber-400 text-black" : "bg-white/10"}`}
                >
                  공식 연습
                </button>
              </div>
            </fieldset>
            {practiceOn && (
              <PracticeRulePicker
                value={practiceRule}
                onChange={setPracticeRule}
              />
            )}
            {shapeNow && (
              <ShapeRulePicker
                n={n}
                start={shapeStart}
                pick={shapePick}
                onStart={setShapeStart}
                onPick={setShapePick}
                formula={shapeFormula}
                onFormula={setShapeFormula}
              />
            )}
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1">판 수</legend>
              <div className="flex flex-wrap gap-1">
                {[1, ...POINTS_ROUNDS].map((k) => (
                  <button
                    key={k}
                    type="button"
                    data-cube-vs-rounds={k}
                    aria-pressed={rounds === k}
                    onClick={() => setRounds(k)}
                    className={`rounded-lg px-3 py-1.5 ${rounds === k ? "bg-amber-400 text-black" : "bg-white/10"}`}
                  >
                    {k === 1 ? "한 판" : `${k}판`}
                  </button>
                ))}
              </div>
            </fieldset>
            {rounds > 1 && (
              <label className="flex items-center justify-between text-sm">
                점수
                <select
                  data-cube-vs-scoring
                  value={scoring}
                  onChange={(e) => setScoring(e.target.value as Scoring)}
                  className="rounded bg-white/10 px-2 py-1"
                >
                  {(Object.keys(SCORING_LABELS) as Scoring[]).map((k) => (
                    <option key={k} value={k} className="bg-neutral-800">
                      {SCORING_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset
              data-cube-vs-handicap
              className="flex flex-col gap-2 border-white/10 border-t pt-2 text-sm"
            >
              <legend className="sr-only">내 핸디캡</legend>
              <label className="flex items-center justify-between">
                출발 늦추기
                <select
                  data-cube-vs-delay
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  className="rounded bg-white/10 px-2 py-1"
                >
                  {DELAY_CHOICES.map((k) => (
                    <option key={k} value={k} className="bg-neutral-800">
                      {k === 0 ? "바로" : `+${k}초`}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className={`flex items-center justify-between ${party || shapeNow || practiceOn ? "hidden" : ""}`}
              >
                순위
                <select
                  data-cube-vs-score
                  value={byAverage ? "avg" : "time"}
                  onChange={(e) => setByAverage(e.target.value === "avg")}
                  className="rounded bg-white/10 px-2 py-1"
                >
                  <option value="time" className="bg-neutral-800">
                    시간
                  </option>
                  <option value="avg" className="bg-neutral-800">
                    내 평균 대비
                  </option>
                </select>
              </label>
              {shapeNow || practiceOn ? null : byAverage && !party ? (
                <p className="text-white/50 text-xs" data-cube-vs-average>
                  내 평균{" "}
                  {myAverage === undefined
                    ? "없음 · 첫 판이 기준"
                    : formatMs(myAverage)}
                </p>
              ) : (
                <label className="flex items-center justify-between">
                  목표
                  <select
                    data-cube-vs-goal
                    value={goal}
                    onChange={(e) =>
                      setGoal(e.target.value as MilestoneId | "")
                    }
                    className="rounded bg-white/10 px-2 py-1"
                  >
                    <option value="" className="bg-neutral-800">
                      완성
                    </option>
                    {goalChoices(n).map((g) => (
                      <option
                        key={g.id}
                        value={g.id}
                        className="bg-neutral-800"
                      >
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label
                className={`flex items-center justify-between ${practiceOn ? "hidden" : ""}`}
              >
                도움
                <select
                  data-cube-vs-help
                  value={help}
                  onChange={(e) => setHelp(e.target.value as Help | "")}
                  className="rounded bg-white/10 px-2 py-1"
                >
                  <option value="" className="bg-neutral-800">
                    그대로
                  </option>
                  {HELPS.filter(
                    (k) => helpChoices(n).includes(k) || help === k,
                  ).map((k) => (
                    <option key={k} value={k} className="bg-neutral-800">
                      {helpLabel(n, k)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <label
              className={`flex items-center gap-2 text-sm ${practiceOn ? "hidden" : ""}`}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-sky-400"
                checked={inspection}
                onChange={(e) => setInspection(e.target.checked)}
              />
              15초 살펴보기
            </label>
            <button
              type="button"
              data-cube-vs-start
              onClick={start}
              className="rounded-xl bg-sky-500 py-2 font-semibold text-black"
            >
              시작
            </button>
          </section>
        ) : (
          <RaceView
            room={room}
            version={version}
            local
            resultActions={
              <>
                <button
                  type="button"
                  onClick={() => {
                    room.dispose();
                    roomRef.current = null;
                    setRoom(null);
                  }}
                  className="min-h-10 rounded-lg bg-white/10 px-3 text-sm hover:bg-white/15"
                >
                  다시 고르기
                </button>
                {between ? (
                  <button
                    type="button"
                    data-cube-next
                    onClick={() => room.startRound()}
                    className="min-h-10 rounded-lg bg-sky-500 px-4 font-semibold text-black text-sm hover:bg-sky-400"
                  >
                    {nextLabel(room)}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-cube-again
                    onClick={() => {
                      room.newMatch();
                      room.startRound();
                    }}
                    className="min-h-10 rounded-lg bg-sky-500 px-4 font-semibold text-black text-sm hover:bg-sky-400"
                  >
                    {multi ? "새 경기" : "한 판 더"}
                  </button>
                )}
              </>
            }
          />
        )}
      </main>
    </div>
  );
}
