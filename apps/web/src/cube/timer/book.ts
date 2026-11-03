import { isTimerEvent, TIMER_EVENTS, type TimerEvent } from "./events";
import { DEFAULT_HOLD_MS, type Penalty } from "./machine";

/**
 * 타이머 기록장. 이 기기(localStorage)에 두고 JSON으로 내보내고 가져온다.
 * 다른 게임의 「내 기록」(`src/stats/records.ts`)은 판 단위 기록이라 모양이 달라, 같은 방식(버전 필드,
 * 읽기 실패면 빈 기록, 저장 실패는 무시)만 따르고 따로 둔다. 내 기록 화면에 묶는 일은 남은 일이다.
 *
 * 함수는 모두 새 기록장을 돌려준다(원래 것을 고치지 않는다).
 */

export interface Solve {
  readonly id: string;
  readonly at: number;
  readonly event: TimerEvent;
  readonly session: string;
  readonly ms: number;
  readonly penalty: Penalty;
  readonly inspectionMs?: number;
  readonly memoMs?: number;
  readonly scramble: string;
  /** 섞는 공식이 대회 규칙으로 만든 것인지 */
  readonly official: boolean;
  readonly note?: string;
}

export interface Session {
  readonly id: string;
  readonly event: TimerEvent;
  readonly name: string;
}

export interface TimerSettings {
  readonly inspection: boolean;
  readonly holdMs: number;
  /** 도는 동안 숫자를 숨긴다 */
  readonly hideRunning: boolean;
  readonly sound: boolean;
}

export interface TimerBook {
  readonly version: 1;
  readonly event: TimerEvent;
  /** 종목마다 지금 고른 세션 */
  readonly current: Readonly<Partial<Record<TimerEvent, string>>>;
  readonly sessions: readonly Session[];
  /** 오래된 것부터 */
  readonly solves: readonly Solve[];
  readonly settings: TimerSettings;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  inspection: true,
  holdMs: DEFAULT_HOLD_MS,
  hideRunning: false,
  sound: true,
};

/** 종목마다 처음부터 있는 세션의 id */
export function defaultSessionId(event: TimerEvent): string {
  return `${event}-1`;
}

export function emptyBook(): TimerBook {
  return {
    version: 1,
    event: "333",
    current: {},
    sessions: TIMER_EVENTS.map((event) => ({
      id: defaultSessionId(event),
      event,
      name: "세션 1",
    })),
    solves: [],
    settings: DEFAULT_SETTINGS,
  };
}

export function currentSession(book: TimerBook, event = book.event): string {
  const id = book.current[event];
  if (id && book.sessions.some((s) => s.id === id && s.event === event))
    return id;
  return (
    book.sessions.find((s) => s.event === event)?.id ?? defaultSessionId(event)
  );
}

export function sessionsOf(book: TimerBook, event: TimerEvent): Session[] {
  return book.sessions.filter((s) => s.event === event);
}

export function solvesOf(book: TimerBook, session: string): Solve[] {
  return book.solves.filter((s) => s.session === session);
}

export function selectEvent(book: TimerBook, event: TimerEvent): TimerBook {
  return { ...book, event };
}

export function selectSession(book: TimerBook, session: string): TimerBook {
  const s = book.sessions.find((x) => x.id === session);
  if (!s) return book;
  return {
    ...book,
    event: s.event,
    current: { ...book.current, [s.event]: s.id },
  };
}

/** 지금 종목에 새 세션을 만들고 고른다 */
export function addSession(book: TimerBook): TimerBook {
  const event = book.event;
  const mine = sessionsOf(book, event);
  let k = mine.length + 1;
  while (book.sessions.some((s) => s.id === `${event}-${k}`)) k++;
  const session: Session = { id: `${event}-${k}`, event, name: `세션 ${k}` };
  return selectSession(
    { ...book, sessions: [...book.sessions, session] },
    session.id,
  );
}

export function addSolve(book: TimerBook, solve: Solve): TimerBook {
  if (book.solves.some((s) => s.id === solve.id)) return book;
  return { ...book, solves: [...book.solves, solve] };
}

function updateSolve(
  book: TimerBook,
  id: string,
  fn: (s: Solve) => Solve,
): TimerBook {
  return {
    ...book,
    solves: book.solves.map((s) => (s.id === id ? fn(s) : s)),
  };
}

export function setPenalty(
  book: TimerBook,
  id: string,
  penalty: Penalty,
): TimerBook {
  return updateSolve(book, id, (s) => ({ ...s, penalty }));
}

export function setNote(book: TimerBook, id: string, note: string): TimerBook {
  return updateSolve(book, id, (s) => {
    const { note: _old, ...rest } = s;
    return note.trim() ? { ...rest, note } : rest;
  });
}

export function removeSolve(book: TimerBook, id: string): TimerBook {
  return { ...book, solves: book.solves.filter((s) => s.id !== id) };
}

export function setSettings(
  book: TimerBook,
  patch: Partial<TimerSettings>,
): TimerBook {
  return { ...book, settings: { ...book.settings, ...patch } };
}

// ---------- 읽기 검사 ----------

const PENALTIES: readonly Penalty[] = ["none", "+2", "DNF"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readSolve(v: unknown): Solve | null {
  if (!isObject(v)) return null;
  const { id, at, event, session, ms, penalty, scramble, official } = v;
  if (
    typeof id !== "string" ||
    typeof at !== "number" ||
    !isTimerEvent(event) ||
    typeof session !== "string" ||
    typeof ms !== "number" ||
    !Number.isFinite(ms) ||
    ms < 0 ||
    !PENALTIES.includes(penalty as Penalty) ||
    typeof scramble !== "string"
  )
    return null;
  return {
    id,
    at,
    event,
    session,
    ms,
    penalty: penalty as Penalty,
    scramble,
    official: official === true,
    ...(typeof v.inspectionMs === "number"
      ? { inspectionMs: v.inspectionMs }
      : {}),
    ...(typeof v.memoMs === "number" ? { memoMs: v.memoMs } : {}),
    ...(typeof v.note === "string" && v.note ? { note: v.note } : {}),
  };
}

function readSession(v: unknown): Session | null {
  if (!isObject(v)) return null;
  const { id, event, name } = v;
  if (
    typeof id !== "string" ||
    !isTimerEvent(event) ||
    typeof name !== "string"
  )
    return null;
  return { id, event, name };
}

function readSettings(v: unknown): TimerSettings {
  if (!isObject(v)) return DEFAULT_SETTINGS;
  const holdMs =
    typeof v.holdMs === "number" && v.holdMs >= 0 && v.holdMs <= 2000
      ? v.holdMs
      : DEFAULT_SETTINGS.holdMs;
  return {
    inspection:
      typeof v.inspection === "boolean"
        ? v.inspection
        : DEFAULT_SETTINGS.inspection,
    holdMs,
    hideRunning:
      typeof v.hideRunning === "boolean"
        ? v.hideRunning
        : DEFAULT_SETTINGS.hideRunning,
    sound: typeof v.sound === "boolean" ? v.sound : DEFAULT_SETTINGS.sound,
  };
}

/** 저장해 둔 값을 읽는다. 모양이 틀린 줄은 버리고, 버전이 다르면 null */
export function readBook(value: unknown): TimerBook | null {
  if (!isObject(value) || value.version !== 1) return null;
  const base = emptyBook();
  const sessions = Array.isArray(value.sessions)
    ? value.sessions.map(readSession).filter((s): s is Session => s !== null)
    : [];
  // 종목마다 기본 세션은 늘 있게 한다
  for (const s of base.sessions)
    if (!sessions.some((x) => x.id === s.id)) sessions.push(s);
  const known = new Set(sessions.map((s) => s.id));
  const solves = Array.isArray(value.solves)
    ? value.solves
        .map(readSolve)
        .filter((s): s is Solve => s !== null && known.has(s.session))
    : [];
  const current: Partial<Record<TimerEvent, string>> = {};
  if (isObject(value.current))
    for (const [k, v] of Object.entries(value.current))
      if (isTimerEvent(k) && typeof v === "string" && known.has(v))
        current[k] = v;
  return {
    version: 1,
    event: isTimerEvent(value.event) ? value.event : base.event,
    current,
    sessions,
    solves,
    settings: readSettings(value.settings),
  };
}

// ---------- 저장 ----------

export const STORAGE_KEY = "cube-timer";

/** 브라우저 저장소를 쓸 수 없으면(사생활 보호 창 등) 빈 기록장 */
export function loadBook(storage?: Storage): TimerBook {
  try {
    const s = storage ?? localStorage;
    const raw = s.getItem(STORAGE_KEY);
    return (raw ? readBook(JSON.parse(raw)) : null) ?? emptyBook();
  } catch {
    return emptyBook();
  }
}

export function saveBook(book: TimerBook, storage?: Storage): void {
  try {
    (storage ?? localStorage).setItem(STORAGE_KEY, JSON.stringify(book));
  } catch {
    // 남기지 못해도 타이머는 돈다.
  }
}

// ---------- 내보내기·가져오기 ----------

export const EXPORT_FORMAT = "game.byb.kr/cube-timer";

export function exportBook(book: TimerBook): string {
  return JSON.stringify({ format: EXPORT_FORMAT, ...book }, null, 2);
}

/**
 * 내보낸 글을 지금 기록장에 합친다. 같은 id의 기록·세션은 지금 것을 둔다(두 번 가져와도 같다).
 * 설정과 고른 종목은 지금 것을 둔다. 읽을 수 없으면 오류를 던진다.
 */
export function importBook(book: TimerBook, text: string): TimerBook {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON으로 읽을 수 없는 파일입니다");
  }
  if (!isObject(parsed) || parsed.format !== EXPORT_FORMAT)
    throw new Error("큐브 타이머에서 내보낸 파일이 아닙니다");
  const incoming = readBook(parsed);
  if (!incoming) throw new Error("모르는 버전의 파일입니다");
  const sessions = [...book.sessions];
  for (const s of incoming.sessions)
    if (!sessions.some((x) => x.id === s.id)) sessions.push(s);
  const ids = new Set(book.solves.map((s) => s.id));
  const solves = [
    ...book.solves,
    ...incoming.solves.filter((s) => !ids.has(s.id)),
  ].sort((a, b) => a.at - b.at);
  return { ...book, sessions, solves };
}
