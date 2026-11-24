/*
 * 검증을 기다리는 기록. 온라인 참가자의 판·게임 기록은 게임 끝 검증(방장이 공개한 기록을 이 기기가 다시 계산해 내가 본
 * 화면과 맞춰 보기)이 끝난 뒤에 내 기록에 넣는다. 통과하면 넣고, 실패하면(이 게임은 무효) 버린다.
 * 기다리는 동안은 이 탭(sessionStorage)에만 둔다: 새로고침해도 이어 가고, 검증 전에 창을 닫으면 확인하지 못한 기록도
 * 함께 사라져 다음에 열 때 남지 않는다.
 * 방장과 혼자 하기는 기다리지 않는다(이 기기가 엔진이라 따로 검증하지 않는다, `StatsTarget.hold`).
 */

import {
  addGame,
  addRound,
  type GameRecord,
  type RoundRecord,
} from "./records";

/** 한 대국(내 기록 키)의 기다리는 기록과, 결과가 나왔으면 그 결과 */
export interface HeldStats {
  rounds: RoundRecord[];
  games: GameRecord[];
  /** 검증 결과. 나온 뒤에 끝나는 판·게임은 기다리지 않고 바로 넣거나 버린다 */
  verdict?: "ok" | "invalid";
}

type Shelf = Record<string, HeldStats>;

const KEY = "mighty-stats-pending";
/** 이 탭에서 기억할 대국 수(한 판 더를 여러 번 해도 넘치지 않게) */
const KEEP = 20;

/** sessionStorage를 쓸 수 없을 때(사생활 보호 창 등) 이 페이지 안에서만 기억한다 */
let memory: Shelf = {};

function load(): Shelf {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Shelf) : {};
  } catch {
    return memory;
  }
}

function save(shelf: Shelf): void {
  const keys = Object.keys(shelf);
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP)))
    delete shelf[old];
  memory = shelf;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(shelf));
  } catch {
    // 남기지 못해도 이 페이지 안에서는 기억한다.
  }
}

function entry(shelf: Shelf, key: string): HeldStats {
  const found = shelf[key];
  if (found) return found;
  const fresh: HeldStats = { rounds: [], games: [] };
  shelf[key] = fresh;
  return fresh;
}

/** 판 기록을 검증 결과까지 둔다(결과가 이미 나왔으면 바로 넣거나 버린다) */
export function holdRound(key: string, record: RoundRecord): void {
  const shelf = load();
  const held = entry(shelf, key);
  if (held.verdict === "ok") addRound(record);
  else if (held.verdict === undefined) {
    if (held.rounds.some((r) => r.id === record.id)) return;
    held.rounds.push(record);
    save(shelf);
  }
}

/** 게임 기록을 검증 결과까지 둔다(결과가 이미 나왔으면 바로 넣거나 버린다) */
export function holdGame(key: string, record: GameRecord): void {
  const shelf = load();
  const held = entry(shelf, key);
  if (held.verdict === "ok") addGame(record);
  else if (held.verdict === undefined) {
    if (held.games.some((g) => g.id === record.id)) return;
    held.games.push(record);
    save(shelf);
  }
}

/**
 * 게임 끝 검증 결과로 기다리던 기록을 정한다. 통과하면 내 기록에 넣고, 실패하면 버린다.
 * 결과는 그 대국에 남겨, 늦게 끝나는 판·게임 기록도 같은 결과를 따른다. 처음 나온 결과만 쓴다
 */
export function settleStats(key: string, ok: boolean): void {
  const shelf = load();
  const held = entry(shelf, key);
  if (held.verdict !== undefined) return;
  held.verdict = ok ? "ok" : "invalid";
  if (ok) {
    for (const r of held.rounds) addRound(r);
    for (const g of held.games) addGame(g);
  }
  held.rounds = [];
  held.games = [];
  save(shelf);
}

/** 그 대국의 기다리는 기록(시험·화면에서 본다) */
export function heldStats(key: string): HeldStats | undefined {
  return load()[key];
}
