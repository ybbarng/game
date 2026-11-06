"use client";

import {
  type CubeMove,
  invertMove,
  milestoneLabel,
  type StickerMask,
  solvedCube,
  stageMask,
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
import type { StickerMarks } from "../bridge";
import { CubePlay, playCubeCue, playCubeSound } from "../components/CubePlay";
import { CubePosterPair } from "../components/CubePosterPair";
import { useMoveKeys } from "../components/MoveChip";
import { raceInspectSound, raceMilestoneSound } from "../game-sounds";
import type { Command } from "../input";
import type { CubeLook } from "../item-look";
import { SHAPE_START_LABELS, shapeGoal, shapeProgress } from "../patterns/race";
import { ShapeFormula } from "../patterns/ShapeFormula";
import { groupSplits, type SplitGroup } from "../progress/splits";
import { formatMs, type Split } from "../records";
import { effectiveRaceAlerts, useCubeSettings } from "../settings";
import { INSPECTION_MS } from "../solve-session";
import { planInWorker } from "../worker";
import { BOT_UNVERIFIED_NOTE, checkBotRun, sameAsBotSolve } from "./bot-racer";
import {
  type ActiveHandicap,
  goalLabel,
  handicapTags,
  helpLabel,
  helpOf,
  helpScreen,
  ratioText,
} from "./handicap";
import { GrayLegend, ItemIcon, ItemNotices, ItemSlot } from "./ItemBar";
import {
  applyLogText,
  ITEM_LABELS,
  type ItemKind,
  lastEffectiveMove,
  trackOf,
} from "./items";
import { MatchBoard } from "./MatchBoard";
import { PartyBar } from "./PartyBar";
import {
  hasHp,
  hasItems,
  PARTY_END_LABELS,
  PARTY_HP,
  PARTY_LOW,
  PARTY_MODE_LABELS,
  PARTY_REASONS,
  type PartyOutcome,
} from "./party";
import { PeerStages, RaceSeat } from "./RaceSeat";
import { stageLabel, turnCount } from "./race-game";
import {
  NARROW_ONE_PX,
  planSeats,
  type SeatLook,
  type SeatMode,
  seatModeOf,
} from "./race-seats";
import {
  liveOrder,
  pickToasts,
  StageTracker,
  splitCell,
  splitColumns,
} from "./race-stages";
import { type CubeRoom, excludeUnverified, type RoundRecord } from "./room";

/**
 * 대결 한 판의 화면(온라인 방·컴퓨터와 대결이 함께 쓴다, docs/47 9-1).
 * 둘러앉은 판(9-9): 내 큐브는 가운데 크게(`CubePlay`), 시간·수·단계·아이템은 그 바로 위. 상대는 테두리 자리마다
 * 작은 큐브 그림(비스듬한 SVG)·이름·단계 칩·체력·맞은 방해(`RaceSeat`, 자리 나누기는 `race-seats.ts`).
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

/** 자리 배치에 쓸 화면 모양(창 크기가 바뀌면 다시) */
function readSeatMode(): SeatMode {
  return typeof window === "undefined"
    ? "wide"
    : seatModeOf(window.innerWidth, window.innerHeight);
}

function useSeatMode(): SeatMode {
  const [mode, setMode] = useState<SeatMode>(readSeatMode);
  useEffect(() => {
    const on = () => setMode(readSeatMode());
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return mode;
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
  const handicapNow: ActiveHandicap | undefined = room.handicap();
  const myDelayMs = (handicapNow?.delaySec[room.me] ?? 0) * 1000;
  const waitLeft =
    phase === "race" && myDelayMs > 0
      ? myDelayMs - (snap?.elapsed ?? 0)
      : phase === "inspect" && myDelayMs > 0
        ? myDelayMs
        : 0;
  const waiting = waitLeft > 0;
  useEffect(() => {
    if (phase !== "inspect" && !waiting) setNotice(null);
  }, [phase, waiting]);
  const [showSmall, setShowSmall] = useState(true);
  const seatMode = useSeatMode();
  const reduced = useReducedMotion();
  const alerts = effectiveRaceAlerts(settings.raceAlerts, reduced);

  // 체력바 대결(docs/51 3-2): 이 기기가 받은 만큼, 확실한 데까지의 판정. 판이 끝났으면 판 기록의 것
  const partyRound = room.rounds.find((r) => r.race === room.state?.race?.id);
  const partyLive: PartyOutcome | undefined = room.party();
  const partyHp = (id: string): number | undefined =>
    partyRound?.party?.hp[id] ?? partyLive?.hp[id];
  const partyOut = (id: string): boolean =>
    (partyRound?.party?.knockedOut[id] ?? partyLive?.knockedOut[id]) !==
    undefined;
  const myHp = partyHp(room.me);
  // 내 체력이 20% 아래로 내려가면 가벼운 경고음(제한 도전과 같은 `cubeLow`), 판마다 한 번
  const myLow =
    myHp !== undefined &&
    myHp > 0 &&
    myHp < PARTY_LOW &&
    !partyLive?.decided &&
    phase === "race";
  const warned = useRef("");
  useEffect(() => {
    if (!myLow || warned.current === syncKey) return;
    warned.current = syncKey;
    playCubeCue(settings, "cubeLow");
  });

  const myState: PuzzleState =
    mine?.stateOf(room.me) ?? mine?.startState() ?? solvedCube(n);

  // 도움(docs/47 9-8): 이 화면에서만 거울·힌트를 열고 닫고, 「가리고 맞추기」면 풀린 뒤 내 큐브를 까맣게 가린다
  // (같은 3D 장면에서 스티커 색만 빠진다. 가린 칸 색 설정이 회색이어도 까맣게)
  const myHelp = mine ? helpOf(handicapNow, room.me) : undefined;
  const myPlaying =
    snap?.peers.find((p) => p.id === room.me)?.status === "playing";
  const helpNow = helpScreen(myHelp, n, { phase, playing: myPlaying });
  const hiddenMask = useMemo(() => stageMask(n, "all-hidden"), [n]);
  const playSettings = useMemo(
    () => ({
      ...settings,
      ...(helpNow.back ? {} : { backView: "off" as const }),
      ...(helpNow.hidden ? { hidden: "black" as const } : {}),
    }),
    [settings, helpNow.back, helpNow.hidden],
  );

  // 아이템전(docs/51 3-3): 내 아이템·방패, 이 화면에 그릴 효과(안개·한 면 가리기·색 뒤집기·흑백 화면·찾아 주기·힌트)
  const mode = room.partyMode();
  const itemsOn = hasItems(mode);
  const items = itemsOn ? partyLive?.items : undefined;
  const screen = itemsOn ? room.itemScreen() : null;
  const myItem = items?.slot[room.me] ?? null;
  const usable = itemsOn ? room.heldItem(room.me) : null;
  const look: CubeLook | null =
    screen && (screen.swap || screen.gray)
      ? { swap: screen.swap, gray: screen.gray }
      : null;
  const blindKey = screen?.blind ? screen.blind.stickers.join(",") : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: 가린 스티커가 바뀔 때만 새 마스크
  const blindMask = useMemo((): StickerMask | null => {
    if (!screen?.blind) return null;
    const hide = new Set(screen.blind.stickers);
    return Array.from({ length: 6 * n * n }, (_, i) =>
      hide.has(i) ? "hidden" : "visible",
    );
  }, [blindKey, n]);
  const findKey = screen?.find
    ? `${screen.find.found.join(",")}|${screen.find.slot.join(",")}`
    : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: 빛낼 조각이 바뀔 때만
  const glow = useMemo((): StickerMarks | null => {
    if (!screen?.find) return null;
    const marks: (StickerMarks[number] | null)[] = Array(6 * n * n).fill(null);
    for (const s of screen.find.slot) marks[s] = "focus";
    for (const s of screen.find.found) marks[s] = "glow";
    return marks;
  }, [findKey, n]);
  // 힌트 한 수: 배우기 힌트(초보자 해법) 계산을 필요할 때 불러 다음 수를 띄운다
  const [hintMod, setHintMod] = useState<
    typeof import("../learn/taught-hint") | null
  >(null);
  // 도움 「힌트 허용」: 배우기와 같은 두 단계(1 지금 경우, 2 다음 수). 연 단계는 경우(토막)가 바뀌면 다시 접는다
  const [opened, setOpened] = useState<{ level: 0 | 1 | 2; seg?: string }>({
    level: 0,
  });
  const helpPlan = useRef<import("../learn/taught-hint").HintPlan | null>(null);
  const wantHint =
    (!!screen?.hint || (helpNow.hint && opened.level > 0)) && n === 3;
  useEffect(() => {
    if (!wantHint || hintMod) return;
    let live = true;
    void import("../learn/taught-hint").then((m) => live && setHintMod(m));
    return () => {
      live = false;
    };
  }, [wantHint, hintMod]);
  const hintMove = useMemo(() => {
    if (!screen?.hint || n !== 3 || !hintMod) return null;
    try {
      return hintMod.finaleHint(myState, null)?.move ?? null;
    } catch {
      return null;
    }
  }, [screen?.hint, n, hintMod, myState]);
  const helpHint = useMemo(() => {
    if (!helpNow.hint || opened.level === 0 || !hintMod) return null;
    try {
      const h = hintMod.finaleHint(myState, helpPlan.current);
      helpPlan.current = h?.plan ?? null;
      return h;
    } catch {
      return null;
    }
  }, [helpNow.hint, opened.level, hintMod, myState]);
  const helpSeg = helpHint ? `${helpHint.stage}|${helpHint.segment}` : "";
  useEffect(() => {
    if (opened.level > 0 && opened.seg === undefined && helpHint)
      setOpened({ level: opened.level, seg: helpSeg });
  }, [opened, helpHint, helpSeg]);
  const helpLevel =
    opened.seg === undefined || opened.seg === helpSeg ? opened.level : 0;
  const { keysOf } = useMoveKeys(n);
  const shownMove =
    hintMove ?? (helpLevel >= 2 ? (helpHint?.move ?? null) : null);
  const hintKeys = shownMove && keysOf ? keysOf(shownMove) : null;
  // 받기·맞기 소리: 새 아이템 → cubeItemGet, 맞음 → cubeItemHit(막으면 소리 없음)
  const itemCue = useRef({ key: "", slot: "", notices: new Set<string>() });
  useEffect(() => {
    if (!itemsOn) return;
    const cue = itemCue.current;
    if (cue.key !== syncKey) {
      cue.key = syncKey;
      cue.slot = "";
      cue.notices = new Set();
    }
    const slotNow = myItem ?? "";
    if (slotNow && slotNow !== cue.slot) playCubeCue(settings, "cubeItemGet");
    cue.slot = slotNow;
    for (const nt of screen?.notices ?? [])
      if (!cue.notices.has(nt.key)) {
        cue.notices.add(nt.key);
        if (!nt.blocked) playCubeCue(settings, "cubeItemHit");
      }
  });
  // 되감기·맞은 섞기는 내 수가 아니어서 장면이 따라 돌지 않는다: 그만큼 다시 칠한다
  const myTrack = itemsOn ? trackOf(myState) : null;
  const jumps = myTrack
    ? myTrack.hits.length + myTrack.uses.filter((u) => u === "rewind").length
    : 0;
  // 섞기가 바뀌면(새 판·다시 정한 섞기) 장면을 다시 칠한다
  const syncKey = `${room.state?.race?.id}|${snap?.attempt}|${snap?.seed ?? ""}`;
  const [syncToken, setSyncToken] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 섞기가 바뀔 때(아이템전: 내 수 밖으로 상태가 바뀔 때)만 다시 칠한다
  useEffect(() => setSyncToken((v) => v + 1), [syncKey, jumps]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 새 섞기면 연 힌트를 접는다
  useEffect(() => {
    setOpened({ level: 0 });
    helpPlan.current = null;
  }, [syncKey]);

  // 모양 만들기(docs/47 9-10): 목표 모양. 단계 칩(십자·F2L…) 대신 목표까지의 진행을 보인다
  const shape = room.game()?.shape;
  const goal = shape ? shapeGoal(shape.id) : undefined;
  // 「공식 보기」(방 규칙이 허용할 때만, 모두에게 같은 조건). 연 채로 다음 판에 가면 그 판 공식이 보인다
  const [formulaOpen, setFormulaOpen] = useState(false);
  // 단계 칩(docs/51 1-3): 이미 받은 수 기록에서 이 기기가 계산한다(새로 보내는 정보 없음, race-stages.ts)
  const start = snap?.seed ? session?.startState() : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 섞기가 바뀔 때만 새로 센다
  const tracker = useMemo(
    () => (start && !shape ? new StageTracker(n, start) : null),
    [syncKey, n, start !== undefined, !shape],
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
    // 가리고 맞추는 동안은 내 단계 톡을 띄우지 않는다(맞은 데를 알려 주게 된다)
    if (helpNow.hidden && passed.includes(room.me))
      passed.splice(passed.indexOf(room.me), 1);
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
    // 소리(docs/51 5절): 1등이 바뀌면 짧게, 아니면 내가 지났을 때만 띵(상대 이정표는 소리 없음). 톡 설정과 따로 간다
    playCubeSound(
      settings,
      raceMilestoneSound({
        passed,
        me: room.me,
        prevLeader: prev,
        leader: order[0],
        meDone: snap.peers.find((p) => p.id === room.me)?.status === "done",
      }),
    );
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

  // 살펴보기·출발·맞춤 소리. 살펴보기는 들어설 때 한 번, 대회처럼 8초 한 번·12초 두 번, 15초에 모두 출발하면 「삐-뽀」
  const lastCue = useRef("");
  const lastPhase = useRef<{ key: string; phase: string }>({
    key: "",
    phase: "",
  });
  const inspectSeen = useRef<{ key: string; ms: number }>({ key: "", ms: 0 });
  useEffect(() => {
    const me = snap?.peers.find((p) => p.id === room.me);
    if (phase === "inspect" && snap?.inspectionLeft !== undefined) {
      const ms = INSPECTION_MS - snap.inspectionLeft;
      const seen = inspectSeen.current;
      const prevMs = seen.key === syncKey ? seen.ms : ms;
      inspectSeen.current = { key: syncKey, ms };
      playCubeSound(settings, raceInspectSound(prevMs, ms));
    }
    const was = lastPhase.current;
    lastPhase.current = { key: syncKey, phase };
    if (was.key === syncKey && was.phase === "inspect" && phase === "race")
      playCubeCue(settings, "cubeInspectEnd");
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
      if (r.reason === "출발 전")
        setNotice("늦게 출발하는 판이에요. 시간이 되면 돌릴 수 있어요.");
      return false;
    },
    [room],
  );

  const onCommand = useCallback(
    (c: Command): CubeMove | null => {
      // 아이템 쓰기: 살펴보기 키(기본 Space). 대결 중에는 살펴보기를 접을 일이 없다
      if (c === "inspectionSkip") {
        room.spendItem();
        return null;
      }
      if (c !== "undo") return null;
      const s = room.session();
      if (!s) return null;
      // 마지막으로 큐브에 들어간 수(아이템전의 맞은 섞기·되감기 포함)를 거꾸로
      const last = lastEffectiveMove(n, s.moveLog(room.me));
      if (!last) return null;
      const back = invertMove(last);
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
  /** 단계 칩으로 보이나(대결 알림 「끔」이면 예전처럼 진행 막대·단계 이름·수). 모양 만들기는 목표까지의 진행 */
  const chips = alerts !== "off" && !shape;
  const finishedFirst = snap.peers
    .filter((p) => p.status === "done" && p.reported !== undefined)
    .sort((a, b) => (a.reported as number) - (b.reported as number));
  const round = room.rounds.find((r) => r.race === room.state?.race?.id);
  const handicap = round?.handicap ?? handicapNow;
  const myGoal = handicap?.goal[room.me];

  let clock: string;
  if (phase === "inspect")
    clock = String(Math.max(0, Math.ceil((snap.inspectionLeft ?? 0) / 1000)));
  else if (me?.status === "done") clock = formatMs(me.reported);
  else if (snap.elapsed !== undefined && phase !== "finished")
    clock = formatMs(snap.elapsed);
  else clock = "-";

  const meIndex = snap.peers.findIndex((p) => p.id === room.me);
  // 나 다음 차례부터 시계 방향으로 앉는다
  const ring =
    meIndex < 0
      ? snap.peers
      : [...snap.peers.slice(meIndex + 1), ...snap.peers.slice(0, meIndex)];
  const plan = planSeats(ring, seatMode);
  const peerHits = itemsOn ? room.peerNotices() : {};
  /** 끝낸 시간·기권·탈락·DNF(맞추는 중이면 빈 글, 칩을 끈 때는 수) */
  const statusOf = (p: (typeof snap.peers)[number]): string => {
    const hp = partyHp(p.id);
    const knocked = hp !== undefined && partyOut(p.id);
    if (p.status === "done") return formatMs(p.reported);
    if (p.status === "forfeit") return "기권";
    if (knocked) return "탈락";
    if (p.status === "dnf")
      return hp !== undefined &&
        PARTY_REASONS.includes(session.checkpointLog(p.id)?.reason ?? "")
        ? ""
        : "DNF";
    // 모양 만들기는 진행 글(목표 n%)이 따로 있어 수를 붙이지 않는다
    return chips || shape ? "" : `${p.moves}수`;
  };
  const seat = (p: (typeof snap.peers)[number], shape: SeatLook) => {
    const st = session.stateOf(p.id);
    const hp = partyHp(p.id);
    const knocked = hp !== undefined && partyOut(p.id);
    return (
      <RaceSeat
        key={p.id}
        id={p.id}
        name={room.playerName(p.id)}
        shape={shape}
        status={statusOf(p)}
        done={p.status === "done"}
        out={knocked || p.status === "forfeit" || p.status === "dnf"}
        connected={p.connected}
        botPlanned={room.botPlanned(p.id)}
        peerStatus={p.status}
        hp={hp}
        groups={stages.get(p.id)?.groups ?? []}
        toast={toasts[p.id]}
        handicap={handicap}
        n={n}
        item={items ? (items.slot[p.id] ?? null) : undefined}
        guard={!!items?.guard[p.id]}
        hits={peerHits[p.id] ?? []}
        state={st}
        settings={settings}
        look={look}
        showCube={showSmall}
        chips={chips}
        progress={p.progress}
        stageText={st ? stageLabel(n, st, room.game()?.shape) : "-"}
      />
    );
  };
  // 가리고 맞추는 동안은 내 단계·진행을 보이지 않는다
  const myGroups = helpNow.hidden ? [] : (stages.get(room.me)?.groups ?? []);
  const myStatus = me ? statusOf(me) : "";
  const myToast = toasts[room.me];

  return (
    <div
      className="flex flex-col gap-3"
      data-cube-race-phase={phase}
      data-cube-version={version}
    >
      {/* 아무도 못 맞춰도 판이 끝나면 결과(모두 DNF)를 보인다 */}
      {(finishedFirst.length > 0 ||
        snap.result ||
        partyLive?.decided ||
        (myHp !== undefined && partyOut(room.me))) && (
        <ResultBox
          room={room}
          snap={snap}
          round={round}
          n={n}
          local={local}
          actions={resultActions}
          splitsOf={(id) => stages.get(id)?.splits ?? []}
          handicap={handicap}
          party={hasHp(mode) ? partyLive : undefined}
        />
      )}

      {/* 둘러앉은 판(docs/47 9-9): 위 줄·왼쪽 칸·오른쪽 칸에 상대, 가운데에 내 큐브 */}
      <div
        data-cube-peers
        data-cube-seat-mode={seatMode}
        data-cube-race-alerts={alerts}
        data-cube-toasts-shown={toastCount}
        className="flex flex-col gap-3"
      >
        {plan.top.length > 0 && (
          <div
            data-cube-seats="top"
            className={
              plan.topSeatWidth === null
                ? "mx-auto grid w-full gap-1.5"
                : "flex flex-wrap justify-center gap-3"
            }
            style={
              plan.topSeatWidth === null
                ? {
                    gridTemplateColumns: `repeat(${plan.topColumns}, minmax(0, 1fr))`,
                    ...(plan.topColumns === 1
                      ? { maxWidth: NARROW_ONE_PX }
                      : {}),
                  }
                : undefined
            }
          >
            {plan.top.map((p) =>
              plan.topSeatWidth === null ? (
                seat(p, plan.topLook)
              ) : (
                <div
                  key={p.id}
                  className="max-w-full"
                  style={{ width: plan.topSeatWidth }}
                >
                  {seat(p, plan.topLook)}
                </div>
              ),
            )}
          </div>
        )}
        <div className="flex items-start gap-3">
          {plan.left.length > 0 && (
            <div
              data-cube-seats="left"
              className="flex shrink-0 flex-col gap-2"
              style={{ width: plan.sideWidth }}
            >
              {plan.left.map((p) => seat(p, plan.sideLook))}
            </div>
          )}
          <div className="relative flex min-w-0 flex-1 flex-col items-center gap-2">
            {/* 내 자리: 시간·수·단계·체력을 큐브 바로 위에 모은다 */}
            <div
              data-cube-peer={room.me}
              data-cube-peer-status={me?.status}
              className="relative flex w-full flex-col items-center gap-1"
            >
              <div className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1">
                <span
                  data-cube-clock
                  className={`font-mono font-semibold text-4xl tabular-nums ${phase === "inspect" ? "text-sky-300" : ""}`}
                >
                  {clock}
                </span>
                <span className="text-sm text-white/70">
                  수{" "}
                  <b data-cube-moves className="text-base text-white">
                    {turnCount(n, mine?.moveLog(room.me) ?? [])}
                  </b>
                </span>
                <span className="text-sm text-white/70" data-cube-phase-text>
                  {snap.preparing ? "섞는 중…" : PHASE_TEXT[phase]}
                  {mode
                    ? ` · ${PARTY_MODE_LABELS[mode].replace("파티: ", "")}`
                    : ""}
                  {shape ? " · 모양 만들기" : ""}
                  {snap.attempt > 0 && phase !== "finished"
                    ? ` · 섞기 다시 정함(${snap.attempt + 1}번째)`
                    : ""}
                </span>
                {others.length > 0 && (
                  <button
                    type="button"
                    data-cube-small-toggle
                    onClick={() => setShowSmall((v) => !v)}
                    className="text-white/50 text-xs hover:underline"
                  >
                    {showSmall ? "작은 큐브 끄기" : "작은 큐브 켜기"}
                  </button>
                )}
              </div>
              {/* 단계·체력·끝남: 늘 같은 높이(칩이 늘어도 큐브가 밀리지 않게) */}
              {mine && (chips || myHp !== undefined || myStatus) && (
                <div className="flex h-5 w-full max-w-md items-center justify-center gap-2">
                  {myHp !== undefined && (
                    <div className="w-40 shrink-0">
                      <PartyBar
                        id={room.me}
                        hp={myHp}
                        out={partyOut(room.me)}
                      />
                    </div>
                  )}
                  {chips && (
                    <PeerStages
                      groups={myGroups}
                      empty={null}
                      className="shrink"
                    />
                  )}
                  {myStatus && me?.status !== "done" && (
                    <span className="shrink-0 font-semibold text-rose-200 text-sm">
                      {myStatus}
                    </span>
                  )}
                </div>
              )}
              {myToast && (
                <span
                  key={myToast.key}
                  data-cube-race-toast={room.me}
                  data-toast-key={myToast.key}
                  className="cube-race-toast pointer-events-none absolute top-0 right-0 z-10 whitespace-nowrap rounded-full border border-sky-200/40 bg-neutral-900/90 px-2 py-0.5 font-semibold text-sky-100 text-xs shadow-lg"
                >
                  {myToast.text}
                </span>
              )}
            </div>
            {goal && shape && (
              <ShapeTarget
                name={goal.pattern.name}
                start={shape.start}
                n={n}
                target={goal.target}
                progress={
                  mine && !helpNow.hidden
                    ? shapeProgress(goal, myState, shape.start)
                    : null
                }
                done={me?.status === "done"}
                settings={settings}
                look={look}
                id={shape.id}
                alg={goal.pattern.alg}
                formula={shape.formula !== false}
                formulaOpen={formulaOpen}
                onFormula={setFormulaOpen}
              />
            )}
            <p
              className="min-h-5 break-keep text-center font-mono text-white/70 text-xs"
              data-cube-scramble={scramble}
            >
              {scramble}
            </p>
            {/* 판 시작 전·살펴보기 동안: 무엇을 할 수 있는지 미리 알린다 */}
            {(phase === "commit" ||
              phase === "reveal" ||
              phase === "inspect") &&
              mine && (
                <p
                  data-cube-inspect-hint
                  className="mx-auto break-keep rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-center text-sky-100 text-xs"
                >
                  살펴보기: 보기만 해요(끌거나 ←·↓ 키로 둘러보기). 시간이 열리면
                  면을 돌려요.
                </p>
              )}
            {/* 내 핸디캡(출발 늦추기·목표)은 판 내내 보인다 */}
            {mine &&
              (myDelayMs > 0 || myGoal || myHelp) &&
              phase !== "finished" &&
              phase !== "waiting" && (
                <p
                  data-cube-my-handicap
                  data-cube-my-help={myHelp}
                  data-cube-start-wait={
                    waiting ? Math.ceil(waitLeft / 1000) : 0
                  }
                  className={`mx-auto break-keep rounded-full border px-3 py-1 text-center text-xs ${
                    waiting && phase === "race"
                      ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
                      : "border-white/15 bg-white/5 text-white/70"
                  }`}
                >
                  {[
                    myDelayMs > 0
                      ? waiting && phase === "race"
                        ? `출발까지 ${Math.ceil(waitLeft / 1000)}초`
                        : `+${myDelayMs / 1000}초 늦게 출발`
                      : "",
                    myGoal ? `목표: ${goalLabel(n, myGoal)}` : "",
                    myHelp ? helpLabel(n, myHelp) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            {myLow && (
              <p
                role="status"
                data-cube-hp-warning
                className="mx-auto rounded-full border border-rose-300/40 bg-rose-400/10 px-3 py-1 text-center text-rose-100 text-xs"
              >
                체력이 얼마 안 남았어요 · {Math.ceil(myHp as number)}
              </p>
            )}
            {notice && (phase === "inspect" || waiting) && (
              <p
                role="status"
                data-cube-notice
                className="text-center text-amber-300 text-xs"
              >
                {notice}
              </p>
            )}
            {/* 아이템 줄: 내 아이템·맞은 방해·흑백 화면 짝 표. 늘 같은 높이라 무엇이 떠도 큐브가 밀리지 않는다 */}
            {itemsOn && mine && (
              <div
                data-cube-item-row
                data-cube-screen={
                  [
                    screen?.fog ? "fog" : "",
                    screen?.blind ? "blind" : "",
                    screen?.swap ? "swap" : "",
                    screen?.gray ? "gray" : "",
                    screen?.find ? "find" : "",
                    screen?.hint ? "hint" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className="flex h-9 w-full flex-nowrap items-center justify-center gap-2 overflow-hidden md:gap-3"
              >
                <ItemSlot
                  item={myItem}
                  guard={!!items?.guard[room.me]}
                  pending={!!myItem && !usable}
                  onUse={() => room.spendItem()}
                  useKey="Space"
                />
                {screen && (
                  <ItemNotices
                    notices={screen.notices}
                    nameOf={(id) => room.playerName(id)}
                    reduced={reduced}
                    // 휴대폰은 폭이 모자라 흑백 화면 동안 짝 표를 먼저 보인다
                    className={screen.gray ? "max-md:hidden" : ""}
                  />
                )}
                {screen?.gray && <GrayLegend colors={settings.colors} />}
                {hintMove && (
                  <span
                    data-cube-item-hint={hintMove}
                    className="flex h-8 items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 font-mono text-amber-100 text-sm"
                  >
                    <ItemIcon item="hint" />
                    {hintMove}
                  </span>
                )}
              </div>
            )}
            {/* 도움 「힌트 허용」: 늘 같은 높이(연 힌트 글이 길어도 큐브가 밀리지 않게) */}
            {mine && helpNow.hint && (
              <HelpHintRow
                level={helpLevel}
                label={helpHint?.label ?? null}
                move={helpLevel >= 2 ? (helpHint?.move ?? null) : null}
                stuck={helpLevel > 0 && !!hintMod && !helpHint}
                onOpen={(level) =>
                  setOpened({
                    level,
                    ...(level === 2 && helpSeg ? { seg: helpSeg } : {}),
                  })
                }
              />
            )}
            {mine ? (
              <CubePlay
                flow="small"
                n={n}
                state={myState}
                mask={helpNow.hidden ? hiddenMask : blindMask}
                syncToken={syncToken}
                settings={playSettings}
                onMove={onMove}
                onCommand={onCommand}
                locked={phase !== "inspect" && phase !== "race"}
                fitViewport
                fog={!!screen?.fog}
                look={look}
                glow={glow}
                want={hintKeys}
              />
            ) : (
              <p className="p-6 text-center text-sm text-white/70">보는 중</p>
            )}
          </div>
          {plan.right.length > 0 && (
            <div
              data-cube-seats="right"
              className="flex shrink-0 flex-col gap-2"
              style={{ width: plan.sideWidth }}
            >
              {plan.right.map((p) => seat(p, plan.sideLook))}
            </div>
          )}
        </div>
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
  handicap,
  party,
}: {
  room: CubeRoom;
  snap: RaceSnapshot;
  round: RoundRecord | undefined;
  n: number;
  local: boolean;
  actions?: ReactNode;
  /** 사람마다 구간 기록(이 기기가 수 기록에서 계산) */
  splitsOf: (id: string) => readonly Split[];
  handicap: ActiveHandicap | undefined;
  /** 체력바 판의 지금 판정(판 기록이 생기기 전) */
  party: PartyOutcome | undefined;
}) {
  // 판 기록이 있으면 그 결과(「평균 대비」·체력바면 순위를 다시 매긴 것). 체력바는 판 기록이 생기기 전 결과를 보이지 않는다
  // 계획을 맞춰 보지 못한 컴퓨터는 이 기기에서 순위에서 뺀다(판 기록이 생기기 전 결과도 같게)
  const unverified = round?.unverified ?? room.unverifiedBots();
  const result =
    round?.result ??
    (party || !snap.result
      ? undefined
      : excludeUnverified(snap.result, unverified));
  const hp = round?.party;
  const score = round?.score;
  const session = room.anySession();
  // 컴퓨터가 계획대로 두었는지 이 기기에서 다시 계산해 본다(판이 끝난 뒤 한 번)
  // 계획은 웹 워커에서 다시 만든다(해법기 표를 처음 만들 때 화면이 멈추지 않게)
  const [botChecks, setBotChecks] = useState<Record<string, boolean | null>>(
    {},
  );
  useEffect(() => {
    setBotChecks({});
    if (!round || !room.state) return;
    let alive = true;
    for (const p of room.state.players) {
      const level = p.bot;
      if (!level || !round.players.includes(p.id)) continue;
      // 맞춰 보지 못하는 컴퓨터는 판을 열 때 이미 뺐다(「계획 확인 못 함 · 순위에서 뺌」)
      if (round.unverified?.includes(p.id)) continue;
      // 기권한 컴퓨터는 둔 수가 없다(계획을 못 만들었거나 그 판을 떠났다)
      if (round.result.players[p.id]?.status === "forfeit") continue;
      const log = round.logs[p.id] ?? [];
      // 체력바 판에서 판이 정해져 멈춘 컴퓨터는 계획의 앞부분만 두었다
      const stopped =
        !!round.party && round.result.players[p.id]?.status !== "done";
      void checkBotRun(
        level,
        n,
        round.start,
        round.seed,
        p.id,
        log,
        planInWorker,
        stopped,
        round.shape?.id,
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
  const [botLike, setBotLike] = useState<Record<string, string>>({});
  useEffect(() => {
    setBotLike({});
    // 모양 만들기는 모양 공식이 정해져 있어 컴퓨터와 같은 수 차례가 흔하다: 보지 않는다
    if (!round || !room.state || round.shape) return;
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

  if (!result && party) {
    const me = room.me;
    const d = party.decided;
    const knocked = party.knockedOut[me] !== undefined;
    return (
      <div
        data-cube-result="partial"
        data-cube-party-end={d?.end}
        role="status"
        className={`rounded-xl border px-4 py-2 text-center ${
          d?.winner === me
            ? "border-emerald-400/40 bg-emerald-400/10"
            : "border-white/15 bg-white/5"
        }`}
      >
        <b className={d?.winner === me ? "text-emerald-300" : "text-white/85"}>
          {d
            ? d.end === "noDecision"
              ? "두 기기 기록이 달라 판정하지 않아요"
              : `${d.winner === me ? "이겼어요" : d.winner ? `${room.playerName(d.winner)} 승` : "승자 없음"} · ${PARTY_END_LABELS[d.end]}`
            : knocked
              ? "체력이 0이 되어 탈락했어요"
              : ""}
        </b>
        <p className="text-white/70 text-xs">
          {d ? "결과를 맞춰 보는 중" : "남은 사람을 보는 중"}
        </p>
      </div>
    );
  }

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
  const solved = hp ? hp.winner === room.me : mine?.status === "done";
  const headline = hp
    ? partyHeadline(hp, room.me, mine?.accepted, result.noDecision)
    : result.noDecision
      ? "이 판은 두 기기 기록이 달라 판정하지 않았어요"
      : !mine
        ? "판이 끝났어요"
        : mine.unranked
          ? "맞췄지만 두 기기 기록이 달라 순위에 넣지 않았어요"
          : solved
            ? `${myRank === 0 ? "1위예요" : `${myRank + 1}위`} · ${formatMs(mine.accepted)}${
                score?.[room.me] !== undefined
                  ? ` · ${ratioText(score[room.me] as number)}`
                  : ""
              }`
            : mine.status === "forfeit"
              ? "이번 판은 기권했어요"
              : "이번 판은 맞추지 못했어요(DNF)";
  return (
    <div
      data-cube-result="final"
      data-cube-party-end={hp?.end}
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
        <thead className="whitespace-nowrap text-white/60 text-xs">
          <tr>
            <th className="text-left">순위</th>
            <th className="text-left">이름</th>
            <th className="text-right">시간</th>
            {hp && <th className="pl-2 text-right">체력</th>}
            {score && (
              <th className="pl-2 text-right" title="내 평균 대비">
                대비
              </th>
            )}
            <th className="pl-2 text-right">수</th>
            <th className="pl-2 text-right">초당</th>
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
            const notes: string[] = [
              ...handicapTags(handicap, n, id),
              ...itemNotes(round, id),
            ];
            if (hp?.winner === id) notes.push(PARTY_END_LABELS[hp.end]);
            const ko = hp?.knockedOut[id];
            if (ko !== undefined) notes.push(`체력 0 · ${formatMs(ko)}`);
            const base = round?.baseline?.[id];
            if (score && base?.from === "first")
              notes.push(`기준: 첫 판 ${formatMs(base.ms)}`);
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
              if (like) notes.push(`의심: 컴퓨터 풀이와 같음(${like})`);
            }
            if (
              p?.reason &&
              p.status !== "done" &&
              !(hp && PARTY_REASONS.includes(p.reason))
            )
              notes.push(p.reason);
            const dropped = !!bot && unverified.includes(id);
            if (dropped) notes.push(BOT_UNVERIFIED_NOTE);
            else if (bot && id in botChecks)
              notes.push(
                botChecks[id] === null
                  ? "컴퓨터 계획 확인 못 함(다른 버전)"
                  : botChecks[id]
                    ? "컴퓨터 계획 확인 ✓"
                    : "컴퓨터 계획과 다름 ⚠",
              );
            return (
              <tr key={id} data-cube-rank={id} className="align-top">
                <td>
                  {hp
                    ? (hp.places[id] ?? "-")
                    : p?.status === "done" && !p.unranked && !result.noDecision
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
                      ? dropped
                        ? "확인 못 함"
                        : "확인 안 됨"
                      : formatMs(time)
                    : p?.status === "forfeit"
                      ? "기권"
                      : hp
                        ? ko !== undefined
                          ? "탈락"
                          : "-"
                        : "DNF"}
                </td>
                {hp && (
                  <td
                    className={`pl-2 text-right font-mono tabular-nums ${
                      ko !== undefined ? "text-white/40" : ""
                    }`}
                    data-cube-result-hp={id}
                  >
                    {id in hp.hp
                      ? Math.max(0, Math.ceil((hp.hp[id] as number) - 1e-9))
                      : "-"}
                  </td>
                )}
                {score && (
                  <td
                    className="pl-2 text-right font-mono tabular-nums"
                    data-cube-ratio={id}
                  >
                    {score[id] === undefined
                      ? "-"
                      : ratioText(score[id] as number).replace(
                          "평균 대비 ",
                          "",
                        )}
                  </td>
                )}
                <td className="pl-2 text-right">{turns}</td>
                <td className="pl-2 text-right">
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

/** 체력바 판 결과 머리: 「1위예요 · 끝까지 맞춤 · 12.34」, 「체력이 0이 되어 탈락했어요 · 2위」, 「2위 · 체력 50」 */
function partyHeadline(
  hp: NonNullable<RoundRecord["party"]>,
  me: string,
  accepted: number | undefined,
  noDecision: boolean | undefined,
): string {
  if (noDecision) return "이 판은 두 기기 기록이 달라 판정하지 않았어요";
  const place = hp.places[me];
  if (hp.winner === me)
    return `1위예요 · ${PARTY_END_LABELS[hp.end]}${
      hp.end === "solved" && accepted !== undefined
        ? ` · ${formatMs(accepted)}`
        : ""
    }`;
  if (hp.knockedOut[me] !== undefined)
    return `체력이 0이 되어 탈락했어요${place ? ` · ${place}위` : ""}`;
  if (place === undefined) return "판이 끝났어요";
  const left = Math.max(0, Math.ceil((hp.hp[me] ?? PARTY_HP) - 1e-9));
  return `${place}위 · 체력 ${left}`;
}

/** 결과 상자의 아이템 글(「받음 방패·안개 · 씀 안개 · 맞음 한 수 섞기」) */
function itemNotes(round: RoundRecord | undefined, id: string): string[] {
  const s = round?.items;
  if (!s) return [];
  const list = (xs: readonly ItemKind[] | undefined) =>
    (xs ?? []).map((x) => ITEM_LABELS[x]).join("·");
  const out: string[] = [];
  if (s.got[id]?.length) out.push(`받음 ${list(s.got[id])}`);
  if (s.used[id]?.length) out.push(`씀 ${list(s.used[id])}`);
  if (s.hit[id]?.length) out.push(`맞음 ${list(s.hit[id])}`);
  if (s.blocked[id]) out.push(`방패로 막음 ${s.blocked[id]}`);
  return out;
}

/**
 * 도움 「힌트 허용」의 두 단계 힌트 줄(배우기 「힌트 1 · 지금 경우」「힌트 2 · 다음 수」와 같은 계산). 한 줄 높이로 고정한다
 */
function HelpHintRow({
  level,
  label,
  move,
  stuck,
  onOpen,
}: {
  level: 0 | 1 | 2;
  label: string | null;
  move: string | null;
  /** 지금 모양은 초보자 방식으로 바로 이어 갈 수 없다 */
  stuck: boolean;
  onOpen: (level: 1 | 2) => void;
}) {
  const button = (k: 1 | 2, text: string) => (
    <button
      type="button"
      data-cube-help-hint={k}
      aria-pressed={level >= k}
      onClick={(e) => {
        onOpen(level >= k ? (level as 1 | 2) : k);
        e.currentTarget.blur();
      }}
      className={`h-7 shrink-0 rounded-full px-2.5 font-semibold text-xs transition active:scale-[0.97] ${
        level >= k
          ? "bg-amber-400/25 text-amber-100"
          : level === k - 1
            ? "bg-amber-400/90 text-black"
            : "bg-white/10 text-white/80"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div
      data-cube-help-hint-row
      className="mb-2 flex h-7 w-full min-w-0 flex-nowrap items-center justify-center gap-2 overflow-hidden"
    >
      {button(1, "힌트 1")}
      {button(2, "힌트 2")}
      {level > 0 && (
        <span
          data-cube-help-case={label ?? undefined}
          className="min-w-0 truncate text-amber-100 text-xs"
        >
          {stuck ? "지금은 힌트가 없어요" : label}
        </span>
      )}
      {move && (
        <span
          data-cube-hint={move}
          className="shrink-0 rounded bg-amber-400 px-1.5 font-mono text-black text-xs"
        >
          {move}
        </span>
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
          // 아이템전의 특별한 수(맞은 섞기·되감기)도 그때 큐브에 들어간 대로
          let state: PuzzleState = round.start;
          for (const x of done) {
            try {
              state = applyLogText(n, state, x.m);
            } catch {
              // 읽지 못하는 수는 건너뛴다(대결 틀이 이미 걸렀다)
            }
          }
          return (
            <figure key={id} className="flex flex-col items-center gap-1">
              <CubePosterPair
                n={n}
                state={state}
                settings={settings}
                captions={false}
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

/**
 * 모양 만들기의 목표 그림(docs/47 9-10): 펼친 그림이 아니라 비스듬한 큐브 그림 둘(위·앞·오른쪽 / 아래·왼쪽·뒤)과
 * 이름·시작, 내 진행. 판 내내 같은 높이라 큐브가 밀리지 않는다
 */
function ShapeTarget({
  id,
  alg,
  formula,
  formulaOpen,
  onFormula,
  name,
  start,
  n,
  target,
  progress,
  done,
  settings,
  look,
}: {
  id: string;
  alg: string;
  /** 방 규칙이 「공식 보기」를 허용하나 */
  formula: boolean;
  formulaOpen: boolean;
  onFormula: (open: boolean) => void;
  name: string;
  start: keyof typeof SHAPE_START_LABELS;
  n: number;
  target: PuzzleState;
  /** 내 진행(0~1). 보는 사람·가리고 맞추기는 null */
  progress: number | null;
  done: boolean;
  settings: ReturnType<typeof useCubeSettings>;
  look: CubeLook | null;
}) {
  return (
    <div
      data-cube-shape-target={id}
      className="flex items-center gap-3 rounded-xl border border-violet-300/30 bg-violet-300/10 px-3 py-1.5"
    >
      <CubePosterPair
        n={n}
        state={target}
        settings={settings}
        look={look}
        captions={false}
        className="w-28 shrink-0 md:w-36"
      />
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-violet-100/70 text-xs">만들 모양</span>
        <b className="break-keep text-violet-50">{name}</b>
        <span className="text-white/60 text-xs">
          {SHAPE_START_LABELS[start]}
        </span>
        {progress !== null && (
          <span
            data-cube-shape-progress={Math.round(progress * 100)}
            className={`font-mono text-xs tabular-nums ${done ? "text-emerald-300" : "text-violet-100"}`}
          >
            {done ? "완성" : `목표 ${Math.round(progress * 100)}%`}
          </span>
        )}
        {formula && (
          <ShapeFormula
            n={n}
            alg={alg}
            start={start}
            open={formulaOpen}
            onToggle={onFormula}
          />
        )}
      </div>
    </div>
  );
}
