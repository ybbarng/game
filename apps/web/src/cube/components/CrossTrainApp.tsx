"use client";

import {
  type CubeMove,
  type StickerMask,
  type StickerVisibility,
  stageMask,
} from "@game/cube-engine";
import { realClock } from "@game/fair-play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { addCrossRecord, crossStats, loadCrossRecords } from "../cross/records";
import {
  CROSS_COLOR_SETS,
  CROSS_DIFFICULTIES,
  type CrossColorSet,
  type CrossDifficulty,
  type CrossRound,
  difficultyAvailable,
  roundStart,
} from "../cross/scramble";
import {
  type CrossConditions,
  type CrossCue,
  type CrossFail,
  type CrossInspection,
  type CrossLimit,
  type CrossRecord,
  CrossSession,
  type CrossStyle,
  conditionKey,
  DEFAULT_CONDITIONS,
} from "../cross/session";
import type { Command } from "../input";
import { formatMs } from "../records";
import { hexColor, useCubeSettings } from "../settings";
import { useRenewable } from "../use-renewable";
import { crossRoundInWorker } from "../worker";
import { CubePlay, playCubeCue } from "./CubePlay";
import { DemoCube } from "./DemoCube";
import { MoveChip, useMoveKeys } from "./MoveChip";

/**
 * 십자 훈련(`/cube/train/cross`, docs/47 8절). 조건을 골라 섞고, 살펴본 뒤 몇 수 안에 십자를 만드는지 잰다.
 * 진행은 `CrossSession`(시계로 잰다), 섞기·최적 해는 워커(`cross` 일), 3D는 `CubePlay`가 따라 그린다.
 * 다음 판은 치는 동안 워커에서 미리 만들어 둔다(실패하면 바로 다음 판으로 넘어갈 수 있게).
 */

const COLOR_NAMES = ["흰색", "빨강", "초록", "노랑", "주황", "파랑"];
const CONDITIONS_KEY = "cube.cross.conditions.v1";

const COLOR_SET_LABEL: Record<CrossColorSet, string> = {
  white: "흰색",
  whiteYellow: "흰·노랑",
  all: "모든 색",
};
const DIFFICULTY_LABEL = (d: CrossDifficulty) =>
  d === "le4" ? "4수 이하" : d === "random" ? "무작위" : `${d}수`;
const LIMIT_LABEL: Record<CrossLimit, string> = {
  opt: "최적",
  opt1: "최적+1",
  opt2: "최적+2",
  none: "없음",
};
const INSPECT_LABEL = (i: CrossInspection) =>
  i === "none" ? "무제한" : `${i}초`;
const STYLE_LABEL: Record<CrossStyle, string> = {
  see: "보면서",
  blind: "계획 후 가리고",
};
const FAIL_LABEL: Record<CrossFail, string> = {
  over: "수 제한을 넘었어요",
  unsolved: "십자가 안 되었어요",
  inspection: "살펴보기 시간을 넘었어요",
  gaveUp: "포기",
};

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

function loadConditions(): CrossConditions {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(CONDITIONS_KEY) ?? "null",
    );
    if (typeof raw !== "object" || raw === null) return DEFAULT_CONDITIONS;
    const r = raw as Partial<CrossConditions>;
    const c: CrossConditions = {
      colorSet:
        r.colorSet && r.colorSet in CROSS_COLOR_SETS
          ? r.colorSet
          : DEFAULT_CONDITIONS.colorSet,
      difficulty: CROSS_DIFFICULTIES.includes(r.difficulty as CrossDifficulty)
        ? (r.difficulty as CrossDifficulty)
        : DEFAULT_CONDITIONS.difficulty,
      limit:
        r.limit && r.limit in LIMIT_LABEL ? r.limit : DEFAULT_CONDITIONS.limit,
      inspection:
        r.inspection === 15 || r.inspection === 8 || r.inspection === "none"
          ? r.inspection
          : DEFAULT_CONDITIONS.inspection,
      style: r.style === "blind" ? "blind" : "see",
      fromBottom: r.fromBottom === true,
    };
    return difficultyAvailable(c.colorSet, c.difficulty)
      ? c
      : { ...c, difficulty: "random" };
  } catch {
    return DEFAULT_CONDITIONS;
  }
}

function saveConditions(c: CrossConditions): void {
  try {
    localStorage.setItem(CONDITIONS_KEY, JSON.stringify(c));
  } catch {
    // 저장소가 막혀도 이번 화면에서는 쓴다
  }
}

/** 고른 색들의 십자 마스크를 합친다(어느 한 색에서 보이면 보인다) */
function crossMask(colors: readonly number[]): StickerMask {
  const masks = colors.map((c) => stageMask(3, "cross", c));
  return (masks[0] as StickerVisibility[]).map((_, i) =>
    masks.some((m) => m[i] === "visible") ? "visible" : "hidden",
  );
}

export function CrossTrainApp() {
  const settings = useCubeSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [cond, setCond] = useState<CrossConditions>(DEFAULT_CONDITIONS);
  const [crossOnly, setCrossOnly] = useState(false);
  const [records, setRecords] = useState<CrossRecord[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [demo, setDemo] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  const [, tick] = useState(0);
  const sync = useCallback(() => setSyncToken((v) => v + 1), []);

  useEffect(() => {
    setCond(loadConditions());
    setRecords(loadCrossRecords());
  }, []);

  const session = useRenewable(
    () =>
      new CrossSession({
        clock: realClock,
        onChange: () => setVersion((v) => v + 1),
        onCue: (cue: CrossCue) => {
          const s = settingsRef.current;
          if (cue === "inspect8" || cue === "inspect12")
            playCubeCue(s, "cubeInspect");
          else if (cue === "solved") playCubeCue(s, "cubeSolved");
          else playCubeCue(s, "invalid");
        },
        onRecord: (r) => setRecords(addCrossRecord(r)),
      }),
    "cross",
  );

  /** 미리 만든 다음 판(조건 열쇠마다) */
  const pending = useRef<{ key: string; round: Promise<CrossRound> } | null>(
    null,
  );
  const requestId = useRef(0);

  const fetchRound = useCallback(
    (c: CrossConditions) =>
      crossRoundInWorker({
        colors: CROSS_COLOR_SETS[c.colorSet],
        difficulty: c.difficulty,
        seed: randomSeed(),
        fromBottom: c.fromBottom,
      }),
    [],
  );

  const prefetch = useCallback(
    (c: CrossConditions) => {
      const round = fetchRound(c);
      round.catch(() => undefined);
      pending.current = { key: conditionKey(c), round };
    },
    [fetchRound],
  );

  const startRound = useCallback(
    async (c: CrossConditions) => {
      const id = ++requestId.current;
      setPreparing(true);
      setNotice(null);
      setDemo(null);
      const key = conditionKey(c);
      const ready =
        pending.current?.key === key ? pending.current.round : fetchRound(c);
      pending.current = null;
      try {
        const round = await ready;
        if (id !== requestId.current || session.disposed) return;
        session.start(round, c);
        sync();
        prefetch(c);
      } catch {
        if (id === requestId.current)
          setNotice("이 조건의 섞기를 만들지 못했어요");
      } finally {
        if (id === requestId.current) setPreparing(false);
      }
    },
    [session, sync, fetchRound, prefetch],
  );

  const retry = useCallback(() => {
    const round = session.round;
    if (!round) return;
    requestId.current++;
    setPreparing(false);
    setDemo(null);
    session.start(round, session.conditions);
    sync();
  }, [session, sync]);

  const changeCond = (patch: Partial<CrossConditions>) => {
    const next = { ...cond, ...patch };
    if (!difficultyAvailable(next.colorSet, next.difficulty))
      next.difficulty = 7;
    setCond(next);
    saveConditions(next);
    // 조건이 바뀌면 지금 판을 접고 새 조건으로 기다린다
    requestId.current++;
    setPreparing(false);
    pending.current = null;
    session.abandon();
    setDemo(null);
    sync();
  };

  // 가림이 바뀌면(치기 시작·끝) 장면을 다시 칠한다
  const hidden = session.hidden;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 가림이 바뀔 때만
  useEffect(() => sync(), [hidden, crossOnly]);

  // 시간이 흐르는 동안 시계 글을 다시 그린다
  const running = session.phase === "inspect" || session.phase === "solving";
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick((t) => t + 1), 47);
    return () => window.clearInterval(id);
  }, [running]);

  const onMove = useCallback(
    (move: CubeMove) => session.input(move),
    [session],
  );

  const live = useRef({ cond, startRound, retry });
  live.current = { cond, startRound, retry };
  const onCommand = useCallback(
    (c: Command): CubeMove | null => {
      if (c === "undo") return session.undo();
      if (c === "scramble") {
        if (session.phase !== "inspect" && session.phase !== "solving")
          void live.current.startRound(live.current.cond);
      } else if (c === "reset") live.current.retry();
      else if (c === "inspectionSkip") session.declareDone();
      return null;
    },
    [session],
  );

  const colors = CROSS_COLOR_SETS[cond.colorSet];
  const onlyMask = useMemo(
    () => (crossOnly ? crossMask(colors) : null),
    [crossOnly, colors],
  );
  const mask = session.mask ?? onlyMask;

  const stats = crossStats(records, conditionKey(cond));
  const recent = records
    .filter((r) => r.cond === conditionKey(cond))
    .slice(0, 8);
  const phase = session.phase;
  const round = session.round;
  const result = session.result;
  const state = session.state ?? roundStart({ scramble: "", hold: "" });

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4"
        data-cross-phase={phase}
        data-cross-optimal={round?.optimal}
        data-cross-solution={round?.solutions[0]?.moves}
        data-cross-hidden={hidden ? "" : undefined}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube/methods"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 해법 익히기
          </a>
          <h1 className="font-bold text-lg">십자 훈련</h1>
          <a
            href="/cube/train"
            className="ml-auto text-sm text-white/70 hover:text-white"
          >
            공식 훈련
          </a>
        </header>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Toggle
            label="색"
            value={cond.colorSet}
            options={(["white", "whiteYellow", "all"] as const).map((v) => [
              v,
              COLOR_SET_LABEL[v],
            ])}
            onChange={(v) => changeCond({ colorSet: v })}
          />
          <Toggle
            label="어려움"
            value={String(cond.difficulty)}
            options={CROSS_DIFFICULTIES.filter((d) =>
              difficultyAvailable(cond.colorSet, d),
            ).map((d) => [String(d), DIFFICULTY_LABEL(d)])}
            onChange={(v) =>
              changeCond({
                difficulty: (/^\d$/.test(v) ? Number(v) : v) as CrossDifficulty,
              })
            }
          />
          <Toggle
            label="수 제한"
            value={cond.limit}
            options={(["opt", "opt1", "opt2", "none"] as const).map((v) => [
              v,
              LIMIT_LABEL[v],
            ])}
            onChange={(v) => changeCond({ limit: v })}
          />
          <Toggle
            label="살펴보기"
            value={String(cond.inspection)}
            options={([15, 8, "none"] as const).map((v) => [
              String(v),
              INSPECT_LABEL(v),
            ])}
            onChange={(v) =>
              changeCond({
                inspection: (v === "none" ? v : Number(v)) as CrossInspection,
              })
            }
          />
          <Toggle
            label="방식"
            value={cond.style}
            options={(["see", "blind"] as const).map((v) => [
              v,
              STYLE_LABEL[v],
            ])}
            onChange={(v) => changeCond({ style: v })}
          />
          <div className="flex items-center gap-3">
            <Check
              label="아래에서"
              on={cond.fromBottom}
              onChange={(v) => changeCond({ fromBottom: v })}
            />
            <Check label="십자만 보기" on={crossOnly} onChange={setCrossOnly} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <section className="flex flex-col items-center gap-2">
            <StatusLine session={session} preparing={preparing} />
            {round && (
              <p
                className="break-keep text-center font-mono text-white/70 text-xs"
                data-cross-scramble={round.scramble}
              >
                {round.scramble}
                {round.hold && (
                  <b className="ml-2 text-amber-200">{round.hold}</b>
                )}
              </p>
            )}
            {notice && (
              <p className="text-amber-300 text-xs" role="status">
                {notice}
              </p>
            )}

            <div className="flex min-h-9 flex-wrap items-center justify-center gap-2 text-sm">
              {phase !== "inspect" && phase !== "solving" && (
                <button
                  type="button"
                  data-cross-start
                  disabled={preparing}
                  onClick={(e) => {
                    void startRound(cond);
                    e.currentTarget.blur();
                  }}
                  className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black disabled:opacity-60"
                >
                  {preparing
                    ? "섞는 중…"
                    : phase === "done"
                      ? "다음 판(Enter)"
                      : "시작(Enter)"}
                </button>
              )}
              {phase === "solving" && cond.style === "blind" && (
                <button
                  type="button"
                  data-cross-declare
                  onClick={(e) => {
                    session.declareDone();
                    e.currentTarget.blur();
                  }}
                  className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-black"
                >
                  끝(Space)
                </button>
              )}
              {round && (
                <button
                  type="button"
                  data-cross-retry
                  onClick={(e) => {
                    retry();
                    e.currentTarget.blur();
                  }}
                  className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
                >
                  같은 섞기 다시(Esc)
                </button>
              )}
              {(phase === "inspect" || phase === "solving") && (
                <button
                  type="button"
                  onClick={(e) => {
                    session.giveUp();
                    e.currentTarget.blur();
                  }}
                  className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
                >
                  포기
                </button>
              )}
            </div>

            {phase === "done" && result && round && (
              <ResultPanel
                round={round}
                result={result}
                colors={settings.colors}
                demo={demo}
                onDemo={setDemo}
              />
            )}
            {demo && round && (
              <div className="w-full max-w-sm">
                <DemoCube
                  n={3}
                  start={roundStart(round)}
                  alg={demo}
                  mask={null}
                  settings={settings}
                  autoPlay
                />
              </div>
            )}

            <CubePlay
              n={3}
              state={state}
              mask={mask}
              syncToken={syncToken}
              settings={settings}
              onMove={onMove}
              onCommand={onCommand}
              locked={preparing || demo !== null}
            />
          </section>

          <aside className="flex flex-col gap-2 text-sm" data-cross-stats>
            <h2 className="font-semibold">이 조건 기록</h2>
            <dl className="grid grid-cols-3 gap-1 text-center">
              <Stat
                label="성공률"
                value={
                  stats.successRate === null
                    ? "-"
                    : `${Math.round(stats.successRate * 100)}%`
                }
              />
              <Stat
                label="더 친 수"
                value={
                  stats.avgExtra === null
                    ? "-"
                    : `+${stats.avgExtra.toFixed(1)}`
                }
              />
              <Stat
                label="살펴보기"
                value={
                  stats.avgInspectMs === null
                    ? "-"
                    : `${(stats.avgInspectMs / 1000).toFixed(1)}초`
                }
              />
            </dl>
            <ul data-cross-records className="flex flex-col gap-0.5">
              {recent.map((r) => (
                <li
                  key={`${r.at}-${r.scramble}`}
                  className="flex items-center gap-2 rounded px-1 py-0.5 text-xs"
                >
                  <span className={r.ok ? "text-emerald-300" : "text-red-300"}>
                    {r.ok ? "성공" : "실패"}
                  </span>
                  <span className="font-mono tabular-nums">
                    {r.moves}/{r.optimal}수
                  </span>
                  <span className="ml-auto font-mono text-white/60 tabular-nums">
                    {r.ok ? formatMs(r.solveMs + r.penalty) : "-"}
                  </span>
                </li>
              ))}
            </ul>
            {recent.length > 0 && (
              <p className="text-white/40 text-xs">내 수/최적 수 · 시간</p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatusLine({
  session,
  preparing,
}: {
  session: CrossSession;
  preparing: boolean;
}) {
  const phase = session.phase;
  const elapsed = session.elapsed();
  const limitMs = session.inspectLimitMs;
  let clock: string;
  let tone = "";
  if (phase === "inspect") {
    if (limitMs === null) {
      clock = `${Math.floor(elapsed / 1000)}`;
      tone = "text-sky-300";
    } else {
      const left = limitMs - elapsed;
      clock = left > 0 ? String(Math.ceil(left / 1000)) : "+2";
      tone =
        left <= 0
          ? "text-red-400"
          : left <= 3_000
            ? "text-amber-300"
            : "text-sky-300";
    }
  } else if (phase === "solving" || phase === "done") {
    clock = formatMs(elapsed);
  } else clock = preparing ? "…" : "0.00";
  const limit = session.limit;
  return (
    <div className="flex w-full flex-wrap items-baseline justify-center gap-x-5 gap-y-1">
      <span
        data-cross-clock
        className={cn("font-mono font-semibold text-4xl tabular-nums", tone)}
      >
        {clock}
      </span>
      <span className="text-sm text-white/70">
        수 <b data-cross-moves>{session.moves}</b>
        {limit !== null && session.round && (
          <span className="text-white/50"> / 제한 {limit}</span>
        )}
      </span>
      {phase === "inspect" && (
        <span className="text-white/55 text-xs">살펴보는 중</span>
      )}
      {session.hidden && (
        <span className="text-amber-200 text-xs">가린 채 치는 중</span>
      )}
    </div>
  );
}

function ResultPanel({
  round,
  result,
  colors,
  demo,
  onDemo,
}: {
  round: CrossRound;
  result: NonNullable<CrossSession["result"]>;
  colors: readonly number[];
  demo: string | null;
  onDemo: (alg: string | null) => void;
}) {
  const { keysOf } = useMoveKeys(3);
  const depthEntries = Object.entries(round.depths) as [string, number][];
  return (
    <div
      data-cross-result={result.ok ? "ok" : "fail"}
      role="status"
      className="flex w-full max-w-xl flex-col gap-2 rounded-xl bg-white/5 p-3 text-sm"
    >
      <p
        className={cn(
          "self-center rounded-full px-4 py-1 font-bold",
          result.ok
            ? "border border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
            : "bg-red-500/20 text-red-200",
        )}
      >
        {result.ok ? "성공" : (FAIL_LABEL[result.reason ?? "gaveUp"] ?? "실패")}
      </p>
      <dl className="grid grid-cols-4 gap-1 text-center">
        <Stat label="내 수" value={String(result.moves)} />
        <Stat label="최적" value={String(result.optimal)} />
        <Stat
          label="시간"
          value={
            result.ok
              ? `${formatMs(result.solveMs + result.penalty)}${result.penalty ? "(+2)" : ""}`
              : "-"
          }
        />
        <Stat
          label="살펴보기"
          value={`${(result.inspectMs / 1000).toFixed(1)}초`}
        />
      </dl>
      {depthEntries.length > 1 && (
        <p className="flex flex-wrap justify-center gap-x-3 text-white/70 text-xs">
          {depthEntries.map(([c, d]) => (
            <span
              key={c}
              className={cn(
                "inline-flex items-center gap-1",
                d === round.optimal && "font-semibold text-white",
              )}
            >
              <Swatch color={colors[Number(c)] ?? 0} />
              {COLOR_NAMES[Number(c)]} {d}
            </span>
          ))}
        </p>
      )}
      <ol className="flex flex-col gap-1.5" data-cross-solutions>
        {round.solutions.slice(0, 2).map((s) => (
          <li key={s.moves} className="flex flex-wrap items-center gap-1.5">
            <Swatch color={colors[s.color] ?? 0} />
            {s.moves.split(" ").map((tok, i) => (
              <MoveChip
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                key={i}
                notation={tok}
                keysOf={keysOf}
                className="rounded bg-white/10 px-1"
              />
            ))}
            <button
              type="button"
              aria-pressed={demo === s.moves}
              data-cross-demo
              onClick={(e) => {
                onDemo(demo === s.moves ? null : s.moves);
                e.currentTarget.blur();
              }}
              className="ml-auto rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/15"
            >
              {demo === s.moves ? "시연 닫기" : "시연"}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Swatch({ color }: { color: number }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 rounded-sm border border-white/30"
      style={{ background: hexColor(color) }}
    />
  );
}

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-white/60">{label}</span>
      <fieldset
        aria-label={label}
        className="flex flex-wrap rounded-lg bg-white/10 p-0.5"
      >
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            data-cross-option={`${label}:${v}`}
            onClick={(e) => {
              onChange(v);
              e.currentTarget.blur();
            }}
            className={cn(
              "rounded-md px-2.5 py-1",
              value === v && "bg-white/20 font-semibold",
            )}
          >
            {text}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function Check({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-cross-option={`${label}:${on ? "on" : "off"}`}
      onClick={(e) => {
        onChange(!on);
        e.currentTarget.blur();
      }}
      className={cn(
        "rounded-lg px-2.5 py-1",
        on ? "bg-sky-500 font-semibold text-black" : "bg-white/10",
      )}
    >
      {label}
    </button>
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
