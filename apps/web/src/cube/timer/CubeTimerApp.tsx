"use client";

import type { Clock } from "@game/fair-play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BackToGames } from "@/components/BackToGames";
import { cn } from "@/lib/cn";

import {
  addSession,
  addSolve,
  currentSession,
  emptyBook,
  exportBook,
  importBook,
  loadBook,
  removeSolve,
  type Solve,
  saveBook,
  selectEvent,
  selectSession,
  sessionsOf,
  setNote,
  setPenalty,
  setSettings,
  solvesOf,
  type TimerBook,
} from "./book";
import { CubeNet } from "./CubeNet";
import { EVENT_INFO, TIMER_EVENTS, type TimerEvent } from "./events";
import { type Scramble, scrambleProvider } from "./fallback-scramble";
import {
  INSPECTION_MS,
  inspectionPenalty,
  type MachineView,
  type Penalty,
  type TimerEventOut,
  TimerMachine,
} from "./machine";
import { playTimerCue, unlockTimerAudio } from "./sound";
import {
  formatAverage,
  formatSingle,
  formatSolve,
  type SessionStats,
  sessionStats,
} from "./stats";

/** 화면 시계: 시각은 performance.now(밀리초 아래까지, 시계를 맞춰도 흔들리지 않는다) */
const screenClock: Clock = {
  now: () => performance.now(),
  after(ms, fn) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

const HOLD_CHOICES = [0, 100, 200, 300, 400, 500, 550, 800] as const;

function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 2 ** 32).toString(36)}`;
}

/** 입력 칸에 글을 쓰는 중인지(그때는 스페이스바를 타이머가 가로채지 않는다) */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

export function CubeTimerApp() {
  const [book, setBook] = useState<TimerBook>(emptyBook);
  const [loaded, setLoaded] = useState(false);
  const [scramble, setScramble] = useState<Scramble | null>(null);
  const [view, setView] = useState<MachineView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const event = book.event;
  const info = EVENT_INFO[event];
  const session = currentSession(book);
  const solves = useMemo(() => solvesOf(book, session), [book, session]);
  const stats = useMemo(() => sessionStats(solves), [solves]);

  // 이벤트 처리기가 가장 최근 값을 보게 한다
  const latest = useRef({ book, scramble });
  latest.current = { book, scramble };

  const update = useCallback((fn: (b: TimerBook) => TimerBook) => {
    setBook((b) => {
      const next = fn(b);
      saveBook(next);
      return next;
    });
  }, []);

  const scrambleRequest = useRef(0);
  const nextScramble = useCallback((ev: TimerEvent) => {
    const req = ++scrambleRequest.current;
    setScramble(null);
    void scrambleProvider(ev, newSeed()).then((s) => {
      // 그 사이 다시 요청했으면(종목을 바꿨으면) 버린다
      if (scrambleRequest.current === req) setScramble(s);
    });
  }, []);

  const onMachine = useCallback(
    (e: TimerEventOut) => {
      const { book: b, scramble: s } = latest.current;
      const sound = b.settings.sound;
      switch (e.type) {
        case "inspection-warning":
          if (sound) playTimerCue(e.at === 8_000 ? "warn8" : "warn12");
          break;
        case "start":
          if (sound) playTimerCue("start");
          break;
        case "stop": {
          if (sound) playTimerCue("stop");
          const solve: Solve = {
            id: newId(),
            at: Date.now(),
            event: b.event,
            session: currentSession(b),
            ms: Math.round(e.result.ms),
            penalty: e.result.penalty,
            scramble: s?.text ?? "",
            official: s?.official ?? false,
            ...(e.result.inspectionMs !== undefined
              ? { inspectionMs: Math.round(e.result.inspectionMs) }
              : {}),
            ...(e.result.memoMs !== undefined
              ? { memoMs: Math.round(e.result.memoMs) }
              : {}),
          };
          update((x) => addSolve(x, solve));
          nextScramble(b.event);
          break;
        }
        default:
          break;
      }
    },
    [update, nextScramble],
  );

  // 상태 기계는 화면이 사는 동안 하나. 알림은 매번 그린 가장 최근 처리기로 넘긴다
  const onMachineRef = useRef(onMachine);
  onMachineRef.current = onMachine;
  const [machine] = useState(
    () =>
      new TimerMachine(
        screenClock,
        { inspection: true, holdMs: 300, blind: false },
        (e) => {
          onMachineRef.current(e);
          if (e.type === "change") setView(machine.view());
        },
      ),
  );

  // 저장해 둔 기록은 첫 그리기 뒤에 읽는다(미리 그린 HTML과 어긋나지 않게)
  useEffect(() => {
    const b = loadBook();
    setBook(b);
    setLoaded(true);
    nextScramble(b.event);
    setView(machine.view());
    return () => machine.dispose();
  }, [machine, nextScramble]);

  // 설정·종목을 상태 기계에 알린다(대기 중에 바뀐 것은 다음 누름부터 적용)
  useEffect(() => {
    machine.setOptions({
      inspection: book.settings.inspection,
      holdMs: book.settings.holdMs,
      blind: info.blind,
    });
  }, [machine, book.settings.inspection, book.settings.holdMs, info.blind]);

  const phase = view?.phase ?? "idle";
  const active = phase !== "idle";

  // 키보드: 스페이스바로 살펴보기·준비·시작, 도는 중에는 아무 키나 멈춤, Esc는 살펴보기 그만두기
  useEffect(() => {
    if (!loaded) return;
    const down = (e: KeyboardEvent) => {
      if (machine.view().phase === "running") {
        if (e.repeat) return;
        e.preventDefault();
        machine.press();
        return;
      }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        unlockTimerAudio();
        machine.press();
      } else if (e.key === "Escape") {
        machine.cancel();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      if (typing(e.target) && machine.view().phase === "idle") return;
      e.preventDefault();
      machine.release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [loaded, machine]);

  // 누름(휴대폰은 길게 누르기)
  const pointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    unlockTimerAudio();
    machine.press();
  };
  const pointerUp = () => machine.release();

  return (
    <div
      className="min-h-dvh bg-neutral-950 text-white"
      data-cube-timer
      data-phase={phase}
      data-loaded={loaded ? "" : undefined}
    >
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:py-6">
        <header className="flex flex-wrap items-center gap-3">
          <BackToGames />
          <h1 className="font-bold text-xl">큐브 타이머</h1>
          <span className="text-sm text-white/50">실물 큐브 시간 재기</span>
        </header>

        <EventPicker
          event={event}
          onPick={(ev) => {
            update((b) => selectEvent(b, ev));
            nextScramble(ev);
            setSelected(null);
          }}
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="flex min-w-0 flex-col gap-4">
            <ScrambleBox
              n={info.size}
              scramble={scramble}
              onNext={() => nextScramble(event)}
            />
            <TimerFace
              view={view}
              blind={info.blind}
              hideRunning={book.settings.hideRunning}
              inspection={book.settings.inspection && !info.blind}
              onPointerDown={pointerDown}
              onPointerUp={pointerUp}
            />
          </section>

          <aside className="flex min-w-0 flex-col gap-4">
            <SessionBar
              book={book}
              onSelect={(id) => update((b) => selectSession(b, id))}
              onAdd={() => update(addSession)}
            />
            <StatsPanel stats={stats} blind={info.blind} />
            <SolveList
              solves={solves}
              selected={selected}
              onSelect={setSelected}
              onPenalty={(id, p) => update((b) => setPenalty(b, id, p))}
              onNote={(id, note) => update((b) => setNote(b, id, note))}
              onRemove={(id) => {
                update((b) => removeSolve(b, id));
                setSelected(null);
              }}
            />
            <SettingsPanel
              book={book}
              onChange={(patch) => update((b) => setSettings(b, patch))}
              onImport={(text) => {
                try {
                  const next = importBook(latest.current.book, text);
                  update(() => next);
                  setMessage("가져왔습니다");
                } catch (err) {
                  setMessage(
                    err instanceof Error ? err.message : "가져오지 못했습니다",
                  );
                }
              }}
              message={message}
            />
          </aside>
        </div>
      </main>

      {active && view && (
        <ActiveOverlay
          view={view}
          blind={info.blind}
          hideRunning={book.settings.hideRunning}
          onPointerDown={pointerDown}
          onPointerUp={pointerUp}
        />
      )}
    </div>
  );
}

// ---------- 조각 ----------

function EventPicker({
  event,
  onPick,
}: {
  event: TimerEvent;
  onPick: (ev: TimerEvent) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="종목">
      {TIMER_EVENTS.map((ev) => (
        <button
          key={ev}
          type="button"
          aria-pressed={ev === event}
          data-cube-event={ev}
          onClick={() => onPick(ev)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            ev === event
              ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
              : "border-white/20 text-white/70 hover:border-white/50",
          )}
        >
          {EVENT_INFO[ev].label}
        </button>
      ))}
    </nav>
  );
}

function ScrambleBox({
  n,
  scramble,
  onNext,
}: {
  n: number;
  scramble: Scramble | null;
  onNext: () => void;
}) {
  const size =
    n <= 3
      ? "text-xl sm:text-2xl"
      : n <= 5
        ? "text-base sm:text-lg"
        : "text-sm sm:text-base";
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-white/60">
          섞는 공식
          {scramble && !scramble.official && (
            <span className="ml-2 text-amber-300/80 text-xs">
              (임시: 무작위 수)
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onNext}
          className="rounded-md border border-white/20 px-3 py-1 text-sm hover:border-white/50"
          data-cube-next-scramble
        >
          다음 섞기
        </button>
      </div>
      <p className={cn("font-mono leading-relaxed", size)} data-cube-scramble>
        {scramble
          ? scramble.text.split(" ").map((m, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 여러 번 나온다
                key={i}
                className="mr-[0.6ch] inline-block whitespace-nowrap"
              >
                {m}
              </span>
            ))
          : "섞는 중…"}
      </p>
      {scramble && (
        <div className="flex justify-center">
          <CubeNet n={n} scramble={scramble.text} />
        </div>
      )}
    </div>
  );
}

/** 지금 보일 큰 글자와 색 */
function faceText(
  view: MachineView | null,
  hideRunning: boolean,
  now: number,
): { text: string; tone: string; sub?: string } {
  if (!view) return { text: "0.00", tone: "text-white" };
  const insp =
    view.inspectionStart !== null ? now - view.inspectionStart : null;
  const inspText = () => {
    if (insp === null) return null;
    const p = inspectionPenalty(insp);
    if (p !== "none") return p;
    return String(Math.ceil((INSPECTION_MS - insp) / 1000));
  };
  switch (view.phase) {
    case "inspecting":
      return { text: inspText() ?? "", tone: "text-amber-200" };
    case "holding":
      return {
        text: inspText() ?? "0.00",
        tone: "text-red-400",
      };
    case "ready":
      return { text: inspText() ?? "0.00", tone: "text-emerald-400" };
    case "running": {
      const ms = view.startAt !== null ? now - view.startAt : 0;
      return {
        text: hideRunning ? "풀이 중" : formatSingle(ms),
        tone: "text-white",
        ...(view.memoAt !== null && view.startAt !== null
          ? { sub: `외우기 ${formatSingle(view.memoAt - view.startAt)}` }
          : {}),
      };
    }
    default: {
      const last = view.last;
      if (!last) return { text: "0.00", tone: "text-white" };
      return {
        text: formatSolve(last),
        tone: last.penalty === "DNF" ? "text-red-300" : "text-white",
        ...(last.memoMs !== undefined
          ? {
              sub: `외우기 ${formatSingle(last.memoMs)} · 맞추기 ${formatSingle(last.ms - last.memoMs)}`,
            }
          : {}),
      };
    }
  }
}

/** 도는 동안 매 그림마다 다시 그린다 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      setNow(performance.now());
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [active]);
  return now;
}

interface FaceProps {
  view: MachineView | null;
  blind: boolean;
  hideRunning: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}

function TimerFace({
  view,
  blind,
  inspection,
  hideRunning,
  onPointerDown,
  onPointerUp,
}: FaceProps & { inspection: boolean }) {
  const { text, tone, sub } = faceText(view, hideRunning, 0);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 휴대폰 길게 누르기 자리다. 키보드(스페이스바)는 창 전체에서 받는다
    <div
      className="flex min-h-56 cursor-pointer touch-none select-none flex-col items-center justify-center gap-2 rounded-xl bg-white/5 p-6"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      data-cube-face
    >
      <div
        className={cn(
          "font-mono font-bold text-6xl tabular-nums sm:text-8xl",
          tone,
        )}
        data-cube-time
      >
        {text}
      </div>
      {sub && <div className="text-white/60">{sub}</div>}
      <p className="break-keep text-center text-sm text-white/50">
        스페이스바를 누르고 있다가 초록색이 되면 떼서 시작, 아무 키나 눌러 멈춤.
        휴대폰은 여기를 길게 누르다 뗍니다.
        {inspection && " 첫 누름은 15초 살펴보기를 시작합니다."}
        {blind && " 블라인드: 도는 중 첫 누름은 외우기 끝, 다음 누름은 멈춤."}
      </p>
    </div>
  );
}

function ActiveOverlay({
  view,
  blind,
  hideRunning,
  onPointerDown,
  onPointerUp,
}: FaceProps & { view: MachineView }) {
  const now = useNow(true);
  const { text, tone, sub } = faceText(view, hideRunning, now);
  const hint =
    view.phase === "inspecting"
      ? "살펴보는 중 · 스페이스바를 누르고 있다가 떼면 시작 · Esc 그만두기"
      : view.phase === "running"
        ? blind && view.memoAt === null
          ? "아무 키나 화면 누르기: 외우기 끝"
          : "아무 키나 화면 누르기: 멈춤"
        : view.phase === "ready"
          ? "떼면 시작"
          : "누르고 있기…";
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 도는 중 화면 어디를 눌러도 멈추게 하는 덮개다. 키보드는 창 전체에서 받는다
    <div
      className="fixed inset-0 z-50 flex touch-none select-none flex-col items-center justify-center gap-4 bg-neutral-950"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      data-cube-overlay
    >
      <div
        className={cn(
          "font-mono font-bold text-7xl tabular-nums sm:text-9xl",
          tone,
        )}
        data-cube-time
      >
        {text}
      </div>
      {sub && <div className="text-lg text-white/60">{sub}</div>}
      <p className="px-4 text-center text-sm text-white/40">{hint}</p>
    </div>
  );
}

function SessionBar({
  book,
  onSelect,
  onAdd,
}: {
  book: TimerBook;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const list = sessionsOf(book, book.event);
  return (
    <div className="flex items-center gap-2">
      <label className="flex flex-1 items-center gap-2 text-sm">
        <span className="text-white/60">세션</span>
        <select
          className="flex-1 rounded-md border border-white/20 bg-neutral-900 px-2 py-1"
          value={currentSession(book)}
          onChange={(e) => onSelect(e.target.value)}
        >
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-md border border-white/20 px-3 py-1 text-sm hover:border-white/50"
      >
        새 세션
      </button>
    </div>
  );
}

function StatsPanel({ stats, blind }: { stats: SessionStats; blind: boolean }) {
  const rows: [string, string][] = blind
    ? [
        ["최고", formatSingle(stats.best)],
        ["세 번 평균", formatAverage(stats.mo3)],
        ["세 번 중 최고", formatSingle(stats.bo3)],
        ["기록 수", String(stats.count)],
      ]
    : [
        ["최고", formatSingle(stats.best)],
        ["5번 평균", formatAverage(stats.ao5)],
        ["12번 평균", formatAverage(stats.ao12)],
        ["100번 평균", formatAverage(stats.ao100)],
        ["최고 5번 평균", formatAverage(stats.bestAo5)],
        ["최고 12번 평균", formatAverage(stats.bestAo12)],
      ];
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3 sm:grid-cols-3 lg:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-white/50 text-xs">{k}</dt>
          <dd className="font-mono tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SolveList({
  solves,
  selected,
  onSelect,
  onPenalty,
  onNote,
  onRemove,
}: {
  solves: readonly Solve[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPenalty: (id: string, p: Penalty) => void;
  onNote: (id: string, note: string) => void;
  onRemove: (id: string) => void;
}) {
  if (solves.length === 0)
    return (
      <p className="rounded-xl bg-white/5 p-3 text-sm text-white/50">
        아직 기록이 없습니다.
      </p>
    );
  const list = solves.map((s, i) => ({ s, no: i + 1 })).reverse();
  return (
    <ol className="flex max-h-[28rem] flex-col overflow-y-auto rounded-xl bg-white/5">
      {list.map(({ s, no }) => {
        const open = selected === s.id;
        return (
          <li
            key={s.id}
            className="border-white/5 border-b last:border-b-0"
            data-cube-solve
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
              onClick={() => onSelect(open ? null : s.id)}
              aria-expanded={open}
            >
              <span className="w-8 text-right text-white/40 text-xs">{no}</span>
              <span
                className={cn(
                  "flex-1 font-mono tabular-nums",
                  s.penalty === "DNF" && "text-red-300",
                  s.penalty === "+2" && "text-amber-200",
                )}
              >
                {formatSolve(s)}
              </span>
              {s.memoMs !== undefined && (
                <span className="text-white/40 text-xs">
                  외우기 {formatSingle(s.memoMs)}
                </span>
              )}
              {s.note && <span className="text-white/40 text-xs">메모</span>}
            </button>
            {open && (
              <SolveDetail
                solve={s}
                onPenalty={(p) => onPenalty(s.id, p)}
                onNote={(n) => onNote(s.id, n)}
                onRemove={() => onRemove(s.id)}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SolveDetail({
  solve,
  onPenalty,
  onNote,
  onRemove,
}: {
  solve: Solve;
  onPenalty: (p: Penalty) => void;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  const [note, setNoteText] = useState(solve.note ?? "");
  const choices: [Penalty, string][] = [
    ["none", "정상"],
    ["+2", "+2"],
    ["DNF", "DNF"],
  ];
  return (
    <div className="flex flex-col gap-2 px-3 pb-3 text-sm">
      <p className="break-words font-mono text-white/70 text-xs">
        {solve.scramble}
      </p>
      <p className="text-white/50 text-xs">
        {new Date(solve.at).toLocaleString("ko-KR")}
        {solve.inspectionMs !== undefined &&
          ` · 살펴보기 ${(solve.inspectionMs / 1000).toFixed(1)}초`}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map(([p, label]) => (
          <button
            key={p}
            type="button"
            aria-pressed={solve.penalty === p}
            onClick={() => onPenalty(p)}
            className={cn(
              "rounded-md border px-3 py-1",
              solve.penalty === p
                ? "border-emerald-400 bg-emerald-500/20"
                : "border-white/20 hover:border-white/50",
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (window.confirm("이 기록을 지울까요?")) onRemove();
          }}
          className="ml-auto rounded-md border border-red-400/40 px-3 py-1 text-red-300 hover:border-red-300"
        >
          지우기
        </button>
      </div>
      <input
        className="rounded-md border border-white/20 bg-neutral-900 px-2 py-1"
        placeholder="메모"
        value={note}
        onChange={(e) => setNoteText(e.target.value)}
        onBlur={() => onNote(note)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

function SettingsPanel({
  book,
  onChange,
  onImport,
  message,
}: {
  book: TimerBook;
  onChange: (patch: Partial<TimerBook["settings"]>) => void;
  onImport: (text: string) => void;
  message: string | null;
}) {
  const s = book.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const download = () => {
    const blob = new Blob([exportBook(book)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cube-timer-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const check = (
    label: string,
    key: "inspection" | "hideRunning" | "sound",
  ) => (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={s[key]}
        onChange={(e) => onChange({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <details className="rounded-xl bg-white/5 p-3 text-sm">
      <summary className="cursor-pointer text-white/70">설정·내보내기</summary>
      <div className="mt-3 flex flex-col gap-2">
        {check("15초 살펴보기(블라인드는 없음)", "inspection")}
        {check("도는 동안 숫자 숨기기", "hideRunning")}
        {check("소리", "sound")}
        <label className="flex items-center gap-2">
          준비까지 누르고 있기
          <select
            className="rounded-md border border-white/20 bg-neutral-900 px-2 py-1"
            value={s.holdMs}
            onChange={(e) => onChange({ holdMs: Number(e.target.value) })}
          >
            {HOLD_CHOICES.map((ms) => (
              <option key={ms} value={ms}>
                {(ms / 1000).toFixed(ms % 100 === 0 ? 1 : 2)}초
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            className="rounded-md border border-white/20 px-3 py-1 hover:border-white/50"
          >
            내보내기(JSON)
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-white/20 px-3 py-1 hover:border-white/50"
          >
            가져오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(onImport);
              e.target.value = "";
            }}
          />
        </div>
        {message && <p className="text-white/60">{message}</p>}
        <p className="text-white/40 text-xs">
          기록은 이 기기에만 저장됩니다. 다른 기기로 옮기려면 내보내기 파일을
          가져오세요(같은 기록은 겹치지 않습니다).
        </p>
      </div>
    </details>
  );
}
