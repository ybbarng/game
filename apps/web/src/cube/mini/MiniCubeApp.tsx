"use client";

import {
  applyMoves,
  type CubeMove,
  formatMove,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { realClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { stickersFromState } from "../bridge";
import { playCubeCue, playCubeSound } from "../components/CubePlay";
import { CubePosterPair } from "../components/CubePosterPair";
import { KeyboardMap, KeyLegend } from "../components/KeyboardMap";
import { KeyCaps } from "../components/MoveChip";
import { ViewHome } from "../components/ViewHome";
import { soloSound } from "../game-sounds";
import { HeroLoop, heroMoveMs, SOLVED_LABEL } from "../hero/loop";
import { heroRotation, isHeroSize, solveForHero } from "../hero/methods";
import {
  attachKeyboard,
  chordLabel,
  chordsFor,
  KeyInterpreter as Interpreter,
  type KeyInterpreter,
  type Keymap,
  type KeyResult,
  loadKeymap,
  PRESET_LABEL,
  resolveAction,
} from "../input";
import { keycapLabel, keysForMove } from "../keys/move-keys";
import { formatMs, type SolveInput } from "../records";
import { ReplayPlayer, type ReplayStatus, solveSteps } from "../replay-player";
import { useCubeSettings } from "../settings";
import { SolveSession } from "../solve-session";
import { type MyTier, tierName } from "../tiers/rank";
import { TIER_TONE } from "../tiers/TierTable";
import { useReducedMotion } from "../use-reduced-motion";
import { useRenewable } from "../use-renewable";
import { type CubeView, loadCubeView } from "../view";
import { MIRROR_FADE_MS } from "../view/mirror";
import { heroSolveInWorker, scrambleInWorker, warmUpScramble } from "../worker";
import {
  type BubbleLine,
  type FromApp,
  hasApp,
  onAppMessage,
  toApp,
} from "./app-bridge";
import { FocusClock } from "./focus-clock";
import {
  algTokens,
  type FormulaHint,
  HINT_INLINE_MIN,
  HINT_KEY_LABEL,
  HINT_KEYS,
  HINT_RULES,
  HintGate,
  LEARN_PATH,
} from "./hint";
import { IDLE_TIMING, IdleShow, jigglePlan, playMoves } from "./idle";
import { miniMirrorShown } from "./mirror";
import {
  hasReplay,
  idleReplaySteps,
  pickIdleReplay,
  replayMoveMs,
  SCRAMBLE_MOVE_MS,
} from "./replay";
import {
  addMiniRecord,
  type KeyOrigin,
  keyOriginOf,
  loadMiniBestFive,
  loadMiniPrefs,
  loadMiniRecords,
  MINI_SIZES,
  type MiniPrefs,
  type MiniRecord,
  miniTier,
  saveMiniPrefs,
  summarize,
} from "./store";

/**
 * 미니 모드(`/cube/mini`, docs/47 15절): 맥 앱 Cubie의 작은 투명 창(기본 200×200, 48×48까지 줄임)에 맞춘 혼자 맞추기.
 * 앱 안에서는 바탕이 없어 큐브와 거울만 바탕화면 위에 뜬다(바탕 비우기는 앱이 넣는 CSS, 바닥 그림자는 끈다).
 *
 * - 화면에는 큐브와 거울만 둔다. 시간·단추·글은 보이지 않는다(사용자 「시간도 화면에 떠 있으면 어지러우니까」).
 *   섞기·거울·크기·기록은 앱 메뉴(브라우저에서는 구석의 작은 메뉴)에서 고른다.
 * - 거울은 직접 맞추는 동안만 보인다(포커스가 있고 섞인 큐브, `mirror.ts`). 떠 있을 때의 움직임과 맞춘 큐브에는 없다.
 *   기록 창의 다시 보기는 같은 큐브·거울을 그리고, 거울이 늘 보인다(메뉴에서 끄지 않았으면).
 * - 키는 사이트의 키 배치(두 손·표기·사용자) 그대로다. 섞기는 배치의 「다시 섞기」 키(두 배치 모두 Enter), 되돌리기는
 *   ⌫. 배치의 Esc(맞춘 상태로)는 쓰지 않는다: 앱에서 Esc는 이전 앱으로 돌아가는 키이고, 실수로 진행을 버리지 않게.
 * - 시간은 포커스가 있는 동안만 잰다(`FocusClock`). 섞은 뒤 첫 면 돌리기부터 맞출 때까지, 살펴보기는 없다.
 * - 포커스가 없으면 이따금 움직인다(`idle.ts`): 맞춘 큐브는 내 판 다시 보기(`replay.ts`, 재료가 없으면 첫 화면
 *   연출 한 판), 섞인 큐브는 조금 섞고 되돌리기. 기록에서 판을 고르면 그 판을 다시 본다(`ReplayBox`).
 *   움직임은 장면에만 넣고 엔진 상태(진행)는 그대로다.
 */

/**
 * 거울을 저절로 접는 문턱: 창의 짧은 변(CSS px)이 큐브 크기 n × 이 값보다 작으면 큐브만 크게 보인다.
 * 거울 칸 한 변은 대략 창의 0.27배 ÷ n이라, 10이면 칸이 약 2.7px보다 작아질 때 접힌다(2026-11-09 이 맥에서 줄여 보며
 * 정함: 48px 창의 3×3 거울도 색을 알아본다). 3×3·4×4는 가장 작은 창(48)에서도 거울이 남고, 7×7은 70px 아래에서 접힌다
 */
export const MINI_MIRROR_PER_N = 10;

const DEFAULT_VIEW = { yaw: 32, pitch: 26 };
const PEEK = {
  peekBack: { yaw: 212, pitch: 26 },
  peekDown: { yaw: 32, pitch: -55 },
} as const;

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const eventFor = (n: number) => `${n}${n}${n}` as ScrambleEvent;

/**
 * `?view=records`면 기록만 보인다(앱이 따로 여는 기록 창, 떠 있는 창은 아주 작을 수 있어서). 아니면 큐브.
 * 주소는 붙은 뒤에 읽는다(정적 HTML은 둘 다 아니다)
 */
export function MiniCubeApp() {
  const [view, setView] = useState<"cube" | "records" | "keys" | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    setView(v === "records" || v === "keys" ? v : "cube");
  }, []);
  if (view === "records") return <RecordsPage />;
  if (view === "keys") return <KeysPage />;
  if (view === "cube") return <MiniCube />;
  return null;
}

/** 기록 창: 이 기기의 미니 모드 기록. 창이 다시 앞에 오거나 다른 창이 기록을 더하면 다시 읽는다 */
function RecordsPage() {
  const [n, setN] = useState(() => loadMiniPrefs().n);
  const [records, setRecords] = useState<MiniRecord[]>(() =>
    loadMiniRecords(n),
  );
  useEffect(() => {
    const reload = () => setRecords(loadMiniRecords(n));
    reload();
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", reload);
    };
  }, [n]);
  return (
    <main className="fixed inset-0 flex flex-col bg-neutral-950 text-white">
      <MiniTiers version={records} n={n} onSize={setN} />
      <div className="relative flex-1">
        {/* 앱(Cubie)이 여는 기록 창이라 다시 보기도 마우스 둘러보기 없이 */}
        <RecordsPanel n={n} records={records} onSize={setN} orbit={false} />
      </div>
    </main>
  );
}

/**
 * 크기별 최고 Ao5와 티어(Cubie 기록 기준, docs/47 15-6). 티어는 사이트와 같은 규칙(최고 Ao5, `tiers/rank.ts`)이지만
 * 기록은 미니 모드 것이라(살펴보기 없이·포커스 있는 동안만 잼) 그렇게 밝힌다
 */
function MiniTiers({
  version,
  n,
  onSize,
}: {
  version: unknown;
  n: number;
  onSize: (n: number) => void;
}) {
  const [tiers, setTiers] = useState<(MyTier | null)[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version은 기록이 바뀐 때를 알리는 값
  useEffect(() => {
    setTiers(MINI_SIZES.map((s) => miniTier(s)));
  }, [version]);
  return (
    <section
      data-mini-tiers
      className="flex flex-col gap-1 border-white/10 border-b p-2 text-xs"
    >
      <div className="flex items-baseline gap-2">
        <h2 className="font-bold text-sm">티어</h2>
        <span className="text-white/60">Cubie 기록 기준 · 최고 Ao5</span>
        <a
          href={`/cube/tiers?n=${n}`}
          className="ml-auto text-white/70 underline-offset-2 hover:underline"
        >
          티어표
        </a>
      </div>
      <ul className="grid grid-cols-3 gap-1 tabular-nums">
        {MINI_SIZES.map((s, i) => {
          const t = tiers[i] ?? null;
          return (
            <li key={s}>
              <button
                type="button"
                data-mini-tier-size={s}
                aria-pressed={s === n}
                onClick={() => onSize(s)}
                className={cn(
                  "flex w-full flex-col items-start rounded px-1.5 py-1 text-left",
                  s === n ? "bg-white/15" : "bg-white/5 hover:bg-white/10",
                )}
              >
                <span className="text-white/60">
                  {s}×{s} {t ? formatMs(t.ao5) : ""}
                </span>
                {t ? (
                  <span
                    data-cube-tier={t.place.tier}
                    className={cn("font-semibold", TIER_TONE[t.place.tier])}
                  >
                    {tierName(t.place)}
                  </span>
                ) : (
                  <span className="text-white/40">5판 뒤에</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="break-keep text-white/50">
        Cubie는 살펴보기 없이, 큐브에 키 입력이 있는 동안만 재요. 사이트 혼자
        맞추기 기록과는 따로 매겨요. 힌트를 쓴 판이 든 5판은 티어에 넣지 않아요.
      </p>
    </section>
  );
}

/** 앱 단축키(맥 앱 Cubie가 쓰는 키). 앱 쪽 값은 `apps/cubie/Sources/Cubie/Config.swift` */
const APP_KEYS: { keys: string; what: string }[] = [
  { keys: "⌃⌥⌘C", what: "큐브로 가기(다시 누르면 돌아가기)" },
  { keys: "Esc", what: "이전 앱으로 돌아가기(큐브는 그대로 떠 있다)" },
  { keys: "큐브 클릭", what: "큐브로 가기" },
  {
    keys: "큐브 끌기",
    what: "창 옮기기(⌘ + 끌기나 창 위 손잡이도 된다. 다른 모니터로도 옮길 수 있다)",
  },
  {
    keys: "핀치, ⌘ + 스크롤",
    what: "창 크기 바꾸기(오른쪽 아래 손잡이나 메뉴 「창」도 된다)",
  },
  {
    keys: HINT_KEY_LABEL,
    what: `힌트(맞추는 동안, ${HINT_RULES.showMs / 1000}초 보임 · ${HINT_RULES.cooldownMs / 1000}초에 한 번 · 한 판 ${HINT_RULES.perSolve}번)`,
  },
];

/**
 * 단축키 창(앱 메뉴 「단축키 보기」): 앱 단축키 짧은 목록과, 지금 키 배치·크기의 큐브 키를 사이트 단축키 표와 같은
 * 키보드 그림으로. 섞기·되돌리기는 배치에서 읽는다
 */
function KeysPage() {
  const [n, setN] = useState(() => loadMiniPrefs().n);
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  useEffect(() => {
    const reload = () => {
      setKeymap(loadKeymap());
      setN(loadMiniPrefs().n);
    };
    reload();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);
  const chord = (action: "scramble" | "undo") =>
    keymap
      ? chordsFor(keymap, action)
          .map((c) => chordLabel(c))
          .join(", ") || "없음"
      : "…";
  return (
    <main
      data-mini-keys={n}
      className="min-h-dvh bg-neutral-950 p-4 text-sm text-white"
    >
      <h1 className="mb-2 font-bold text-base">단축키</h1>
      <table className="mb-4 text-left">
        <tbody>
          {[
            ...APP_KEYS,
            { keys: chord("scramble"), what: "섞기" },
            { keys: chord("undo"), what: "되돌리기" },
          ].map((k) => (
            <tr key={k.what}>
              <th className="pr-4 font-semibold tabular-nums">{k.keys}</th>
              <td className="text-white/70">{k.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-bold">큐브 돌리기</h2>
        {keymap && (
          <span className="text-white/60 text-xs">
            배치 「{PRESET_LABEL[keymap.preset]}」
          </span>
        )}
        <div className="ml-auto flex gap-0.5">
          {MINI_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === n}
              onClick={() => setN(s)}
              className={cn(
                "rounded px-1.5 text-xs",
                s === n ? "bg-white/20" : "text-white/60 hover:bg-white/10",
              )}
            >
              {s}×{s}
            </button>
          ))}
        </div>
      </div>
      {keymap && (
        <div className="flex flex-col gap-2">
          <KeyboardMap keymap={keymap} n={n} layer="all" />
          <KeyLegend />
          <p className="break-keep text-white/60 text-xs">
            칸마다 맨 위 굵은 글은 그냥 칠 때, 그 아래는 Shift와 함께, 맨 아래는
            Alt와 함께 칠 때예요. 흐린 글은 이 크기에서 쓰지 않아요. Cubie에서
            Esc는 「처음으로」가 아니라 이전 앱으로 돌아가는 키이고,
            Space(살펴보기)는 쓰지 않아요. 마우스로는 큐브를 돌려 보지 않으니
            보는 각도는 큐브 통째 돌리기(x·y·z) 키로 바꿔요. 배치는 메뉴 「키
            배치·색…」에서 바꿔요.
          </p>
        </div>
      )}
    </main>
  );
}

function MiniCube() {
  const settings = useCubeSettings();
  const reduced = useReducedMotion();
  const [prefs, setPrefsState] = useState<MiniPrefs | null>(null);
  useEffect(() => setPrefsState(loadMiniPrefs()), []);
  const n = prefs?.n ?? 3;
  const setPrefs = useCallback((next: MiniPrefs) => {
    setPrefsState(next);
    saveMiniPrefs(next);
  }, []);

  // 앱 안인지는 붙은 뒤에 본다(정적 HTML과 첫 그림이 같아야 한다)
  const [app, setApp] = useState(false);
  useEffect(() => setApp(hasApp()), []);
  // 앱 안이면 앱이 알려 줄 때까지 포커스 없음·보임으로 둔다. 브라우저는 창의 포커스를 본다
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsN, setRecordsN] = useState(n);
  const [records, setRecords] = useState<MiniRecord[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, bumpState] = useState(0);
  const bump = useCallback(() => bumpState((v) => v + 1), []);

  const clock = useMemo(() => new FocusClock(realClock, false), []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /**
   * 이번 판의 입력(혼자 맞추기와 같은 `inputs`, 처음 쓴 차례)과 키 출처(공정함 확인): 앱이 키마다 바로 앞에 알려 준
   * 출처(`key` 메시지)를 모은다. 섞을 때 비우고, 기록에 `inputs`·`keyOrigin`(`keyOriginOf`)으로 남긴다
   */
  const keyOriginRef = useRef<KeyOrigin | null>(null);
  const inputsRef = useRef<SolveInput[]>([]);
  const originsRef = useRef(new Set<KeyOrigin>());
  const appRef = useRef(false);
  appRef.current = app;

  // 공식 보기(docs/47 15-15): 한 판의 횟수·시간 제한(`HintGate`), 보이는 공식, 짧은 알림(남은 초 등)
  const hintGate = useMemo(() => new HintGate(realClock, bump), [bump]);
  useEffect(() => () => hintGate.dispose(), [hintGate]);
  const hintGateRef = useRef(hintGate);
  hintGateRef.current = hintGate;
  const [hint, setHint] = useState<FormulaHint | null>(null);
  const [hintMsg, setHintMsg] = useState<string | null>(null);
  /** 앱이 창 옆 말풍선을 그리는가(0.1.3부터 앱이 `caps`로 알린다) */
  const [appBubble, setAppBubble] = useState(false);

  const session = useRenewable(
    () =>
      new SolveSession({
        n,
        mode: "solo",
        inspection: false,
        clock,
        onChange: bump,
        onCue: (cue) => {
          if (cue === "solved")
            playCubeSound(settingsRef.current, soloSound("solved"));
        },
        onRecord: (r) => {
          const origin = keyOriginOf(originsRef.current);
          const list = addMiniRecord({
            ...r,
            inspection: false,
            ...(inputsRef.current.length > 0
              ? { inputs: [...inputsRef.current] }
              : {}),
            ...(origin ? { keyOrigin: origin } : {}),
            ...(hintGateRef.current.used > 0
              ? { hints: hintGateRef.current.used }
              : {}),
          });
          hintGateRef.current.hide();
          setRecords(list);
        },
      }),
    `${n}`,
  );
  session.inspection = false;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 3D 장면
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const mirrorWanted = prefs?.mirror ?? true;
  const mirrorFits =
    size === null || Math.min(size.w, size.h) >= MINI_MIRROR_PER_N * n;
  const mirror = mirrorWanted && mirrorFits;

  const repaint = useCallback(() => {
    const v = viewRef.current;
    if (!v) return;
    v.setStickers(stickersFromState(n, sessionRef.current.state, null));
    v.setMarks(null);
    v.setOptions({ moveMs: settingsRef.current.moveMs });
  }, [n]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () =>
      setSize((s) => {
        const w = Math.round(wrap.clientWidth);
        const h = Math.round(wrap.clientHeight);
        return s && s.w === w && s.h === h ? s : { w, h };
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const quality = settings.quality;
  const loaded = prefs !== null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    let disposed = false;
    setReady(false);
    const ro = new ResizeObserver(() =>
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const s = settingsRef.current;
        const view = CubeView.create(canvas, {
          n,
          quality,
          colors: s.colors,
          stickerless: s.stickerless,
          moveMs: s.moveMs,
          hidden: s.hidden,
          // 앱의 투명 창에서는 바닥 그림자를 끈다(바탕화면 위 얼룩처럼 보인다).
          // 마우스 둘러보기도 끈다: 앱에서는 큐브를 끌면 창이 옮겨지고, 보는 각도는 키보드 x·y·z로 바꾼다
          ...(hasApp() ? { shadow: false, interactive: false } : {}),
          onSwipe: (m) => moveRef.current(m, formatMove(n, m), "swipe", null),
        });
        view.setStickers(stickersFromState(n, sessionRef.current.state, null));
        viewRef.current = view;
        view.resize(canvas.clientWidth, canvas.clientHeight);
        ro.observe(canvas);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [n, quality, loaded]);

  useEffect(() => {
    viewRef.current?.setOptions({
      colors: settings.colors,
      stickerless: settings.stickerless,
      moveMs: settings.moveMs,
      hidden: settings.hidden,
    });
  }, [settings.colors, settings.stickerless, settings.moveMs, settings.hidden]);

  /**
   * 떠 있을 때 다시 보는 판의 그림 상태(3D가 없을 때 SVG 그림이 엔진 상태 대신 보인다). 3D 장면은 수를 직접 넣는다
   */
  const [idleState, setIdleState] = useState<PuzzleState | null>(null);
  /** 떠 있을 때 다시 보는 판 번호(화면 시험용)와 고르기 차례(최고·최근 번갈아) */
  const idleReplayNo = useRef<number | null>(null);
  const idleReplayTurn = useRef(0);

  // 떠 있을 때 움직임
  const idle = useMemo(
    () =>
      new IdleShow(realClock, {
        solved: () => isSolved(sessionRef.current.n, sessionRef.current.state),
        replay: (done) => {
          const size = sessionRef.current.n;
          const r = pickIdleReplay(
            loadMiniRecords(size),
            loadMiniBestFive(size),
            idleReplayTurn.current,
          );
          const steps = r ? idleReplaySteps(size, r) : [];
          if (!r || steps.length === 0) return null;
          idleReplayTurn.current++;
          idleReplayNo.current = r.no ?? null;
          const v = viewRef.current;
          // 맞춘 큐브(흰 위·초록 앞)에서 섞기를 빠르게 보인다
          let shown = solvedCube(size);
          let moveMs = Math.min(SCRAMBLE_MOVE_MS, settingsRef.current.moveMs);
          if (v) {
            v.setStickers(stickersFromState(size, shown, null));
            v.setOptions({ moveMs });
          } else setIdleState(shown);
          const player = new ReplayPlayer(
            realClock,
            steps,
            {
              onStep: (step, i) => {
                if (!v) {
                  shown = applyMoves(size, shown, step.moves);
                  setIdleState(shown);
                  return;
                }
                // 맞춘 과정은 설정의 회전 시간으로, 다음 수가 더 빨리 오면 그 간격에 맞춰 줄인다(차례가 밀리지 않게)
                if (step.part === "solve") {
                  const want = replayMoveMs(
                    steps,
                    i,
                    settingsRef.current.moveMs,
                  );
                  if (want !== moveMs) {
                    moveMs = want;
                    v.setOptions({ moveMs });
                  }
                }
                for (const m of step.moves) v.enqueue(m);
              },
              onEnd: done,
            },
            // 다 맞춘 모습을 잠깐 보인다
            1500,
          );
          player.play();
          return () => player.stop();
        },
        hero: (done) => {
          const v = viewRef.current;
          const size = sessionRef.current.n;
          if (!v || !isHeroSize(size)) return null;
          // 연출은 맞춘 큐브(흰 위·초록 앞)에서 시작한다
          v.setStickers(
            stickersFromState(size, sessionRef.current.state, null),
          );
          let moveMs = settingsRef.current.moveMs;
          let finishing: (() => void) | null = null;
          const loop = new HeroLoop({
            n: size,
            methods: heroRotation(size, settingsRef.current.heroMethod),
            clock: realClock,
            rng: Math.random,
            solve: heroSolveInWorker,
            solveHere: solveForHero,
            onMove: (_m, ms, parsed) => {
              const want = heroMoveMs(ms, parsed);
              if (want !== moveMs) {
                moveMs = want;
                v.setOptions({ moveMs });
              }
              for (const m of parsed) v.enqueue(m);
            },
            onLabel: (label) => {
              // 한 판을 다 맞추면(「… · 맞춤」) 그 멈춤만큼 보이고 끝낸다
              if (!label.endsWith(SOLVED_LABEL) || finishing) return;
              finishing = realClock.after(1500, () => {
                loop.stop();
                done();
              });
            },
            onReset: (state) => v.setStickers(stickersFromState(size, state)),
          });
          loop.start();
          return () => {
            finishing?.();
            loop.stop();
          };
        },
        jiggle: (done) => {
          const s = sessionRef.current;
          const plan = jigglePlan(s.n, Math.random, IDLE_TIMING.jiggleMoves);
          return playMoves(
            realClock,
            plan,
            IDLE_TIMING.jiggleStepMs,
            (m) => viewRef.current?.enqueue(m),
            done,
          );
        },
        restore: () => {
          idleReplayNo.current = null;
          setIdleState(null);
          repaintRef.current();
          bump();
          if (hasApp()) toApp({ type: "idle", showing: null });
        },
        started: (kind) => {
          bump();
          if (hasApp()) toApp({ type: "idle", showing: kind });
        },
      }),
    [bump],
  );
  const repaintRef = useRef(repaint);
  repaintRef.current = repaint;
  useEffect(() => () => idle.dispose(), [idle]);
  useEffect(() => {
    clock.setFocused(focused);
    idle.setActive(!focused && visible && !reduced && prefs !== null);
    // 다음 움직임이 걸렸는지 화면에 알린다(`data-mini-idle-armed`, 화면 시험이 시계를 감기 전에 기다린다)
    bump();
  }, [clock, idle, focused, visible, reduced, prefs, bump]);
  // 크기가 바뀌면 움직이던 것을 멈추고 간격을 처음부터
  // biome-ignore lint/correctness/useExhaustiveDependencies: 크기가 바뀔 때만
  useEffect(() => idle.reset(), [n, idle]);

  // 거울은 직접 맞추는 동안만(`mirror.ts`). 나타나고 사라질 때 짧게 페이드하고(움직임 줄이기면 바로), 숨으면
  // 카메라가 큐브만 담는 자리로 옮겨 큐브가 창 가운데에 크게 보인다(창 크기는 그대로)
  const solved = isSolved(session.n, session.state);
  const mirrorShown = miniMirrorShown({
    wanted: mirrorWanted,
    fits: mirrorFits,
    focused,
    solved,
    idle: idle.showing !== null,
  });
  useEffect(() => {
    if (ready) viewRef.current?.setMirror(mirrorShown, true);
  }, [mirrorShown, ready]);

  // 앱의 투명 창: 큐브·(보이는) 거울이 차지하는 곳을 알린다(그 밖의 누르기는 아래 앱으로 지나간다).
  // 거울이 숨으면 거울 사각형이 빠져 그 자리의 누르기도 아래 앱으로 간다
  const hitKey = size ? `${mirrorShown}-${size.w}x${size.h}` : "";
  useEffect(() => {
    // 거울이 보이고 숨거나 창 크기가 바뀌면(hitKey) 다시 알린다
    if (!app || !ready || !hitKey) return;
    const send = () => {
      const v = viewRef.current;
      if (!v) return;
      toApp({
        type: "hit",
        rects: v
          .hitRects()
          .map((r) => [r.x, r.y, r.w, r.h].map((x) => Math.round(x))),
      });
    };
    // 거울이 페이드하는 동안(MIRROR_FADE_MS) 카메라가 옮겨 가므로, 다 옮긴 뒤에도 한 번 더
    // (앱 안에서는 마우스 둘러보기가 꺼져 있어 보는 각도가 끌기로 바뀌지 않는다)
    const timers = [0, MIRROR_FADE_MS + 150].map((ms) =>
      window.setTimeout(send, ms),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [app, ready, hitKey]);

  // 섞기
  const preparing = useRef(false);
  const scrambleId = useRef(0);
  const doScramble = useCallback(async () => {
    if (preparing.current) return;
    preparing.current = true;
    const id = ++scrambleId.current;
    const s = sessionRef.current;
    const seed = randomSeed();
    try {
      const made = await scrambleInWorker(eventFor(s.n), seed);
      if (id !== scrambleId.current || s.disposed) return;
      idle.reset();
      s.start(made.text, seed);
      hintGateRef.current.reset();
      inputsRef.current = [];
      originsRef.current = new Set();
      repaintRef.current();
    } catch {
      // 섞기를 못 만들었다: 다음에 다시 누르면 된다
    } finally {
      if (id === scrambleId.current) preparing.current = false;
    }
  }, [idle]);
  useEffect(() => {
    if (prefs) warmUpScramble(eventFor(n));
    return () => {
      scrambleId.current++;
      preparing.current = false;
    };
  }, [n, prefs]);

  /**
   * 수 하나: 엔진에 넣고 장면이 따라 돈다(키·밀기). 입력 방식과 키 출처(키일 때)는 이번 판 기록에 남긴다
   */
  const moveRef = useRef(
    (
      move: CubeMove,
      notation: string,
      input: SolveInput,
      origin: KeyOrigin | null,
    ) => {
      idleRef.current.setActive(false);
      hintGateRef.current.hide();
      const s = sessionRef.current;
      // 맞춰서 기록이 생기는 수도 그 판에 든다(input 전에 더한다)
      if (!inputsRef.current.includes(input))
        inputsRef.current = [...inputsRef.current, input];
      if (origin) originsRef.current.add(origin);
      if (s.input(move, notation) !== "applied") return;
      viewRef.current?.enqueue(move);
      playCubeCue(settingsRef.current, "cubeTurn");
    },
  );
  const idleRef = useRef(idle);
  idleRef.current = idle;
  const scrambleRef = useRef(doScramble);
  scrambleRef.current = doScramble;

  // 키
  const [keymap] = useState(() =>
    typeof window === "undefined" ? null : loadKeymap(),
  );
  const interpreter = useMemo(
    () => (keymap ? new Interpreter(n, keymap) : null),
    [n, keymap],
  );
  const interpreterRef = useRef<KeyInterpreter | null>(interpreter);
  interpreterRef.current = interpreter;
  const recordsOpenRef = useRef(recordsOpen);
  recordsOpenRef.current = recordsOpen;

  // 공식 보기
  const hintMsgTimer = useRef<(() => void) | null>(null);
  useEffect(() => () => hintMsgTimer.current?.(), []);
  const flashHint = useCallback((text: string | null) => {
    hintMsgTimer.current?.();
    hintMsgTimer.current = null;
    setHintMsg(text);
    if (text === null) return;
    hintGateRef.current.hide();
    hintMsgTimer.current = realClock.after(HINT_MSG_MS, () => {
      hintMsgTimer.current = null;
      setHintMsg(null);
    });
  }, []);
  const requestHint = useCallback(async () => {
    const s = sessionRef.current;
    const solving = () => s.phase === "ready" || s.phase === "solving";
    if (!solving()) return flashHint("섞은 뒤 맞추는 동안 볼 수 있어요");
    if (s.n !== 2 && s.n !== 3) return flashHint("이 크기는 힌트 없음");
    let pick: typeof import("./hint-pick").pickHint;
    try {
      pick = (await import("./hint-pick")).pickHint;
    } catch {
      return flashHint("공식을 불러오지 못했어요");
    }
    if (sessionRef.current !== s || !solving()) return;
    const a = pick(s.n, s.state);
    if (a.kind !== "hint")
      return flashHint(
        a.kind === "unsupported"
          ? "이 크기는 힌트 없음"
          : "지금은 보일 공식이 없어요",
      );
    const r = hintGateRef.current.request();
    if (!r.ok)
      return flashHint(
        r.reason === "limit"
          ? `이번 판 ${HINT_RULES.perSolve}번 다 봤어요`
          : `${r.seconds}초 뒤에 다시 볼 수 있어요`,
      );
    flashHint(null);
    setHint(a.hint);
  }, [flashHint]);
  const requestHintRef = useRef(requestHint);
  requestHintRef.current = requestHint;
  // 섞기가 시작되면 공식 고르기 모듈을 미리 불러 둔다(처음 누를 때 기다리지 않게)
  const scrambled = session.phase === "ready" || session.phase === "solving";
  useEffect(() => {
    if (scrambled && (n === 2 || n === 3)) void import("./hint-pick");
  }, [scrambled, n]);
  // 크기가 바뀌면 처음으로
  // biome-ignore lint/correctness/useExhaustiveDependencies: 크기가 바뀔 때만
  useEffect(() => hintGate.reset(), [n, hintGate]);
  useEffect(() => {
    let peekKey: string | null = null;
    /**
     * 지금 키의 출처: 앱이 키 바로 앞에 보낸 `key` 메시지를 키마다(동작이 아닌 키도) 한 번 꺼내 쓴다.
     * 브라우저(앱 없음)거나 메시지가 없으면 unknown
     */
    let eventOrigin: KeyOrigin = "unknown";
    const take = (e: KeyboardEvent) => {
      // 수식 키만 누른 keydown(Shift 등)은 앱의 키 알림이 없다(맥에서는 키가 아니라 수식 변화). 다음 키 몫을 남겨 둔다
      if (MODIFIER_KEYS.has(e.key)) return;
      eventOrigin = appRef.current
        ? (keyOriginRef.current ?? "unknown")
        : "unknown";
      keyOriginRef.current = null;
    };
    window.addEventListener("keydown", take, true);
    const handle = (r: KeyResult, e: KeyboardEvent) => {
      if (r.kind === "move") {
        moveRef.current(r.move, r.notation, "keyboard", eventOrigin);
        return;
      }
      if (r.kind !== "command") return;
      if (r.command === "undo") {
        // 되돌리기는 입력 방식에 세지 않지만(혼자 맞추기와 같다) 키 출처에는 넣는다(판을 바꾸는 키다)
        originsRef.current.add(eventOrigin);
        hintGateRef.current.hide();
        const m = sessionRef.current.undo();
        if (m) {
          viewRef.current?.enqueue(m);
          playCubeCue(settingsRef.current, "cubeTurn");
        }
      } else if (r.command === "scramble") void scrambleRef.current();
      else if (r.command === "peekBack" || r.command === "peekDown") {
        const p = PEEK[r.command];
        viewRef.current?.setView(p.yaw, p.pitch);
        peekKey = e.code;
      }
      // reset(Esc)·inspectionSkip(Space)은 쓰지 않는다
    };
    const detach = attachKeyboard(
      window,
      () => {
        const it = interpreterRef.current;
        return it && !recordsOpenRef.current ? it : LOCKED;
      },
      handle,
    );
    const onKeyUp = (e: KeyboardEvent) => {
      if (peekKey === null || e.code !== peekKey) return;
      peekKey = null;
      viewRef.current?.setView(DEFAULT_VIEW.yaw, DEFAULT_VIEW.pitch);
    };
    window.addEventListener("keyup", onKeyUp);
    return () => {
      detach();
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", take, true);
    };
  }, []);

  // 힌트 키(F1, `\`). 사용자 배치가 `\`에 동작을 놓았으면 그 배치를 따른다. F1은 브라우저 도움말을 막는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(HINT_KEYS as readonly string[]).includes(e.code)) return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.code !== "F1" && keymap && resolveAction(keymap, e)) return;
      e.preventDefault();
      if (recordsOpenRef.current) return;
      void requestHintRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keymap]);

  // 포커스: 앱이면 앱이 알린다. 브라우저면 창의 포커스·보임
  useEffect(() => {
    // 앱 상태(app)는 붙은 뒤에 바뀌므로 여기서 바로 본다(첫 그림에서 브라우저 포커스로 켜지지 않게)
    if (app || hasApp()) return;
    const sync = () => {
      setFocused(document.hasFocus() && !document.hidden);
      setVisible(!document.hidden);
    };
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [app]);

  const openRecords = useCallback(
    (open: boolean) => {
      setRecordsOpen(open);
      if (open) {
        setRecordsN(n);
        setRecords(loadMiniRecords(n));
      }
    },
    [n],
  );

  // 앱이 보낸 것(앱이 없어도 같은 이벤트를 받는다: 화면 시험이 앱 흉내를 낸다)
  const live = useRef({ prefs, n, recordsOpen, openRecords });
  live.current = { prefs, n, recordsOpen, openRecords };
  useEffect(
    () =>
      onAppMessage((msg: FromApp) => {
        const c = live.current;
        switch (msg.type) {
          case "focus":
            // 시계는 알림을 받은 그 순간에 멈추고 이어 간다(effect를 기다리면 그 사이 시간이 섞인다)
            clock.setFocused(msg.focused);
            setFocused(msg.focused);
            break;
          case "visible":
            setVisible(msg.visible);
            break;
          case "scramble":
            void scrambleRef.current();
            break;
          case "mirror":
            if (c.prefs)
              setPrefs({ ...c.prefs, mirror: msg.on ?? !c.prefs.mirror });
            break;
          case "size":
            if (c.prefs && (MINI_SIZES as readonly number[]).includes(msg.n))
              setPrefs({ ...c.prefs, n: msg.n });
            break;
          case "records":
            c.openRecords(msg.open ?? !c.recordsOpen);
            break;
          case "key":
            keyOriginRef.current =
              msg.source === "keyboard" ? "hardware" : "synthetic";
            break;
          case "hint":
            void requestHintRef.current();
            break;
          case "caps":
            setAppBubble(msg.hintBubble);
            break;
        }
      }),
    [setPrefs, clock],
  );
  useEffect(() => {
    if (app) toApp({ type: "ready" });
  }, [app]);
  useEffect(() => {
    if (app && prefs)
      toApp({
        type: "state",
        n: prefs.n,
        mirror: prefs.mirror,
        records: recordsOpen,
        scrambleKeys: keymap
          ? chordsFor(keymap, "scramble").map(({ code, shift, alt, ctrl }) => ({
              code,
              ...(shift ? { shift } : {}),
              ...(alt ? { alt } : {}),
              ...(ctrl ? { ctrl } : {}),
            }))
          : [],
      });
  }, [app, prefs, recordsOpen, keymap]);
  // 기록을 보다가 포커스를 잃으면 닫는다(떠 있는 창은 큐브만)
  useEffect(() => {
    if (!focused && app) setRecordsOpen(false);
  }, [focused, app]);

  // 보이는 자리: 창이 넉넉하면 창 안, 작으면 앱의 말풍선(0.1.3부터), 말풍선이 없으면 창 안에 작게
  const shownHint = hintGate.showing ? hint : null;
  const shortSide = size ? Math.min(size.w, size.h) : 0;
  const bubble = app && appBubble && shortSide < HINT_INLINE_MIN;
  const bubbleLines =
    bubble && (shownHint || hintMsg)
      ? hintBubbleLines(shownHint, hintMsg, keymap, n)
      : null;
  const bubbleKey = JSON.stringify(bubbleLines);
  const sentBubble = useRef("null");
  // biome-ignore lint/correctness/useExhaustiveDependencies: bubbleKey가 bubbleLines의 내용이다
  useEffect(() => {
    if (!app || bubbleKey === sentBubble.current) return;
    sentBubble.current = bubbleKey;
    toApp({ type: "hint", lines: bubbleLines });
  }, [app, bubbleKey]);

  return (
    <main
      data-mini
      data-mini-n={n}
      data-mini-hint={shownHint?.alg ?? ""}
      data-mini-hint-before={shownHint?.before ?? undefined}
      data-mini-hint-msg={hintMsg ?? undefined}
      data-mini-hints-used={hintGate.used}
      data-mini-hint-where={
        shownHint || hintMsg ? (bubble ? "bubble" : "inline") : undefined
      }
      data-mini-phase={session.phase}
      data-mini-solved={solved ? "" : undefined}
      data-mini-scramble={session.scramble}
      data-mini-moves={session.moveCount}
      data-mini-focused={focused ? "" : undefined}
      data-mini-mirror={mirror ? "on" : mirrorWanted ? "folded" : "off"}
      data-mini-mirror-shown={mirrorShown ? "" : undefined}
      data-mini-idle={idle.showing ?? ""}
      data-mini-idle-armed={idle.armed ? "" : undefined}
      data-mini-idle-no={
        idle.showing === "replay" ? (idleReplayNo.current ?? "") : undefined
      }
      data-input-ready={interpreter && prefs ? "" : undefined}
      className={cn(
        "fixed inset-0 select-none overflow-hidden text-white",
        // 앱 안에서는 바탕을 비워 큐브와 거울만 바탕화면 위에 뜬다
        !app && "bg-neutral-950",
      )}
    >
      <div ref={wrapRef} className="absolute inset-0">
        {failed ? (
          <div
            data-cube-no3d
            className="flex h-full w-full items-center justify-center p-1"
          >
            <CubePosterPair
              n={n}
              state={idleState ?? session.state}
              settings={settings}
              captions={false}
              frontOnly={!mirrorShown}
              className="h-full w-full"
            />
          </div>
        ) : (
          <canvas
            key={`${n}-${quality}`}
            ref={canvasRef}
            data-cube-canvas
            data-cube-ready={ready ? "" : undefined}
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          />
        )}
        {/* 브라우저 미니 모드만(앱은 마우스 둘러보기를 끈다). 오른쪽 위는 메뉴, 아래는 힌트 자리라 왼쪽 위 */}
        {!app && !failed && (
          <ViewHome
            viewRef={viewRef}
            ready={ready}
            className="top-1 right-auto bottom-auto left-1"
          />
        )}
      </div>

      {!bubble && (shownHint || hintMsg) && (
        <HintCard
          hint={shownHint}
          msg={hintMsg}
          n={n}
          keymap={keymap}
          shortSide={shortSide}
        />
      )}

      {!app && (
        <BrowserMenu
          open={menuOpen}
          setOpen={setMenuOpen}
          n={n}
          mirror={mirrorWanted}
          onScramble={() => {
            setMenuOpen(false);
            void doScramble();
          }}
          onMirror={() =>
            prefs && setPrefs({ ...prefs, mirror: !prefs.mirror })
          }
          onSize={(size) => prefs && setPrefs({ ...prefs, n: size })}
          onRecords={() => {
            setMenuOpen(false);
            openRecords(true);
          }}
          onHint={() => {
            setMenuOpen(false);
            void requestHint();
          }}
        />
      )}

      {recordsOpen && (
        <RecordsPanel
          n={recordsN}
          records={recordsN === n ? records : loadMiniRecords(recordsN)}
          onSize={setRecordsN}
          onClose={() => setRecordsOpen(false)}
          orbit={!app}
        />
      )}
    </main>
  );
}

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Fn",
]);

/** 잠겨 있을 때(기록을 보는 동안) 쓰는 해석기: 어떤 키도 먹지 않는다 */
const LOCKED = { handle: () => null } as unknown as KeyInterpreter;

/** 브라우저에서 열었을 때(앱 메뉴가 없을 때)의 구석 메뉴 */
function BrowserMenu({
  open,
  setOpen,
  n,
  mirror,
  onScramble,
  onMirror,
  onSize,
  onRecords,
  onHint,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  n: number;
  mirror: boolean;
  onScramble: () => void;
  onMirror: () => void;
  onSize: (n: number) => void;
  onRecords: () => void;
  onHint: () => void;
}) {
  return (
    <div className="absolute top-1 right-1 z-10 flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label="메뉴"
        aria-expanded={open}
        data-mini-menu
        onClick={() => setOpen(!open)}
        className="h-7 w-7 rounded-md text-white/40 hover:bg-white/10 hover:text-white"
      >
        ⋯
      </button>
      {open && (
        <div className="flex w-36 flex-col gap-0.5 rounded-lg border border-white/15 bg-neutral-900/95 p-1 text-sm shadow-xl">
          <MenuItem onClick={onScramble} data="scramble">
            섞기
          </MenuItem>
          <MenuItem onClick={onMirror} data="mirror">
            {mirror ? "거울 끄기" : "거울 켜기"}
          </MenuItem>
          <MenuItem onClick={onRecords} data="records">
            기록
          </MenuItem>
          <MenuItem onClick={onHint} data="hint">
            힌트
          </MenuItem>
          <a
            href={LEARN_PATH}
            target="_blank"
            rel="noopener"
            data-mini-item="learn"
            className="rounded px-2 py-1 text-left hover:bg-white/10"
          >
            배우기
          </a>
          <div className="grid grid-cols-3 gap-0.5 pt-1">
            {MINI_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                data-mini-size={s}
                aria-pressed={s === n}
                onClick={() => onSize(s)}
                className={cn(
                  "rounded px-1 py-0.5 text-xs",
                  s === n ? "bg-white/20" : "hover:bg-white/10",
                )}
              >
                {s}×{s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  data,
  children,
}: {
  onClick: () => void;
  data: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-mini-item={data}
      onClick={onClick}
      className="rounded px-2 py-1 text-left hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function shortTime(at: number): string {
  const d = new Date(at);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 기록: 크기마다 지난 기록(날짜·시간·수)과 최고·평균 */
function RecordsPanel({
  n,
  records,
  onSize,
  onClose,
  orbit = true,
}: {
  n: number;
  records: readonly MiniRecord[];
  onSize: (n: number) => void;
  /** 없으면 닫기 단추가 없다(앱의 기록 창은 창을 닫는다) */
  onClose?: () => void;
  /** 다시 보기에서 마우스로 끌어 둘러보기(Cubie에서는 끈다) */
  orbit?: boolean;
}) {
  const sum = summarize(records);
  const [watching, setWatching] = useState<MiniRecord | null>(null);
  // 크기를 바꾸면 보던 판을 닫는다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 크기가 바뀔 때만
  useEffect(() => setWatching(null), [n]);
  return (
    <section
      data-mini-records={n}
      className="absolute inset-0 z-20 flex flex-col gap-1.5 overflow-hidden bg-neutral-950/95 p-2 text-xs"
    >
      <div className="flex items-center gap-1">
        <h1 className="font-bold text-sm">기록</h1>
        <div className="flex flex-1 flex-wrap gap-0.5">
          {MINI_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === n}
              data-mini-records-size={s}
              onClick={() => onSize(s)}
              className={cn(
                "rounded px-1",
                s === n ? "bg-white/20" : "text-white/60 hover:bg-white/10",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            data-mini-records-close
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
          >
            닫기
          </button>
        )}
      </div>
      <dl
        data-mini-summary
        className="grid grid-cols-2 gap-x-2 rounded bg-white/5 p-1.5 tabular-nums"
      >
        <dt className="text-white/60">최고</dt>
        <dd data-mini-best>{formatMs(sum.best ?? undefined)}</dd>
        <dt className="text-white/60">평균</dt>
        <dd>{formatMs(sum.mean ?? undefined)}</dd>
        <dt className="text-white/60">5번 평균</dt>
        <dd>{formatMs(sum.ao5)}</dd>
        <dt className="text-white/60">12번 평균</dt>
        <dd>{formatMs(sum.ao12)}</dd>
      </dl>
      {/* 다시 보는 동안은 큐브·거울이 남은 높이의 3/4, 기록 목록이 1/4(목록은 그 안에서 굴린다) */}
      {watching && (
        <ReplayBox
          key={`${watching.no}-${watching.at}`}
          record={watching}
          onClose={() => setWatching(null)}
          orbit={orbit}
        />
      )}
      {records.length === 0 ? (
        <p className="text-white/60">아직 기록이 없어요.</p>
      ) : (
        <ol className="min-h-12 flex-1 overflow-y-auto tabular-nums">
          {records.map((r) => (
            <li
              key={`${r.no}-${r.at}`}
              data-mini-record
              className="flex gap-2 border-white/10 border-b py-0.5"
            >
              <span className="w-6 text-white/40">{r.no}</span>
              <span className="w-20 text-white/60">{shortTime(r.at)}</span>
              <span className="flex-1 font-semibold">{formatMs(r.ms)}</span>
              {/* 실제 키보드가 아닌 입력이 섞인 판만 표시(막지는 않는다) */}
              {r.keyOrigin === "synthetic" && (
                <span
                  data-mini-source="synthetic"
                  className="rounded bg-amber-500/25 px-1 text-amber-200"
                >
                  다른 프로그램 입력
                </span>
              )}
              {r.inputs?.includes("swipe") && (
                <span
                  data-mini-source="swipe"
                  className="rounded bg-white/10 px-1 text-white/70"
                >
                  마우스·화면
                </span>
              )}
              {(r.hints ?? 0) > 0 && (
                <span
                  data-mini-record-hints={r.hints}
                  title="힌트를 본 판이 든 5판은 티어에 넣지 않아요"
                  className="rounded bg-sky-500/25 px-1 text-sky-200"
                >
                  힌트 {r.hints}번
                </span>
              )}
              <span className="text-white/60">{r.moves}수</span>
              {hasReplay(r) && (
                <button
                  type="button"
                  data-mini-replay-open={r.no}
                  aria-pressed={watching?.at === r.at && watching.no === r.no}
                  onClick={() => setWatching(r)}
                  className="rounded bg-white/10 px-1 hover:bg-white/20"
                >
                  다시 보기
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 기록 창의 다시 보기(docs/47 15-13): 섞인 상태에서 맞춘 수를 그때 시각대로(멈춤은 1초까지, 혼자 맞추기와 같은
 * `solveSteps`). 그림은 큐브 본 화면과 같은 3D 큐브 하나와 거울 셋(`CubeView`의 거울 판, 2026-11-09 사용자 「큐브
 * 2개가 아니라 우리 기존 UI처럼 거울이 보이는 디자인」).
 *
 * - 거울은 다시 보는 동안 늘 보인다. 메뉴 「거울」을 꺼 두었거나 칸이 거울을 담기에 작으면 큐브만. 「맞출 때만 거울」
 *   (`miniMirrorShown`)은 직접 맞출 때의 규칙이라 여기에는 쓰지 않는다.
 * - 장면은 수가 돌 때만 그린다(`CubeView`). 다시 보기를 닫거나 기록 창을 닫으면 장면을 버리고 재생도 멈춘다.
 * - 3D를 못 그리면 본 화면과 같이 SVG 큐브 그림(`CubePosterPair`, 거울을 끄면 앞만)으로 보인다.
 */
function ReplayBox({
  record,
  onClose,
  orbit,
}: {
  record: MiniRecord;
  onClose: () => void;
  /** 마우스로 끌어 둘러보기 */
  orbit: boolean;
}) {
  const settings = useCubeSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const n = record.n;
  const start = useMemo(() => {
    try {
      return applyMoves(n, solvedCube(n), parseMoves(n, record.scramble));
    } catch {
      return solvedCube(n);
    }
  }, [n, record.scramble]);
  const steps = useMemo(() => solveSteps(n, record.replay), [n, record.replay]);
  const [state, setState] = useState<PuzzleState>(start);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [status, setStatus] = useState<ReplayStatus>("playing");
  const [played, setPlayed] = useState(0);
  const playerRef = useRef<ReplayPlayer | null>(null);

  // 메뉴 「거울」(떠 있는 창이 저장한다). 기록 창이 열린 동안 바꾸면 다시 앞에 올 때·저장될 때 다시 읽는다
  const [mirrorWanted, setMirrorWanted] = useState(
    () => loadMiniPrefs().mirror,
  );
  useEffect(() => {
    const reload = () => setMirrorWanted(loadMiniPrefs().mirror);
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<CubeView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [short, setShort] = useState<number | null>(null);
  const mirrorFits = short === null || short >= MINI_MIRROR_PER_N * n;
  const mirror = mirrorWanted && mirrorFits;

  const quality = settings.quality;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    setReady(false);
    const measure = () => {
      setShort(Math.round(Math.min(canvas.clientWidth, canvas.clientHeight)));
      viewRef.current?.resize(canvas.clientWidth, canvas.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    void loadCubeView()
      .then(({ CubeView }) => {
        if (disposed) return;
        const s = settingsRef.current;
        const view = CubeView.create(canvas, {
          n,
          quality,
          colors: s.colors,
          stickerless: s.stickerless,
          moveMs: s.moveMs,
          hidden: s.hidden,
          // 떠 있는 창처럼 바닥 그림자 없이 큐브와 거울만
          shadow: false,
          interactive: orbit,
        });
        // 장면이 늦게 떴으면 그동안 둔 수까지 반영한 상태에서
        view.setStickers(stickersFromState(n, stateRef.current, null));
        viewRef.current = view;
        view.resize(canvas.clientWidth, canvas.clientHeight);
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro.disconnect();
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [n, quality, orbit]);

  useEffect(() => {
    viewRef.current?.setOptions({
      colors: settings.colors,
      stickerless: settings.stickerless,
      hidden: settings.hidden,
    });
  }, [settings.colors, settings.stickerless, settings.hidden]);

  useEffect(() => {
    if (ready) viewRef.current?.setMirror(mirror, true);
  }, [mirror, ready]);

  useEffect(() => {
    let cur = start;
    setState(start);
    setPlayed(0);
    viewRef.current?.setStickers(stickersFromState(n, start, null));
    let moveMs = -1;
    const p = new ReplayPlayer(realClock, steps, {
      onStep: (s, i) => {
        cur = applyMoves(n, cur, s.moves);
        setState(cur);
        setPlayed(i + 1);
        const v = viewRef.current;
        if (!v) return;
        // 떠 있을 때 다시 보기와 같이: 설정의 회전 시간, 다음 수가 더 빨리 오면 그 간격에 맞춰 줄인다
        const want = replayMoveMs(steps, i, settingsRef.current.moveMs);
        if (want !== moveMs) {
          moveMs = want;
          v.setOptions({ moveMs });
        }
        for (const m of s.moves) v.enqueue(m);
      },
      onReset: () => {
        cur = start;
        setState(start);
        setPlayed(0);
        viewRef.current?.setStickers(stickersFromState(n, start, null));
      },
      onStatus: setStatus,
    });
    playerRef.current = p;
    p.play();
    return () => {
      p.stop();
      playerRef.current = null;
    };
  }, [n, start, steps]);

  return (
    <div
      data-mini-replay={status}
      data-mini-replay-played={played}
      data-mini-replay-total={steps.length}
      data-mini-replay-mirror={mirror ? "on" : mirrorWanted ? "folded" : "off"}
      className="flex min-h-0 flex-[3] flex-col gap-1 rounded bg-white/5 p-1.5"
    >
      <div className="flex shrink-0 items-center gap-1">
        <span className="font-semibold tabular-nums">
          {record.no}번 · {formatMs(record.ms)}
          {(record.hints ?? 0) > 0 && (
            <span data-mini-replay-hints className="ml-1 text-sky-200">
              · 힌트 {record.hints}번
            </span>
          )}
        </span>
        <div className="ml-auto flex gap-0.5">
          <button
            type="button"
            data-mini-replay-toggle
            disabled={status === "done"}
            onClick={() => playerRef.current?.toggle()}
            className="rounded px-1.5 py-0.5 hover:bg-white/10 disabled:opacity-40"
          >
            {status === "paused" ? "이어 보기" : "멈추기"}
          </button>
          <button
            type="button"
            data-mini-replay-restart
            onClick={() => playerRef.current?.restart()}
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
          >
            처음부터
          </button>
          <button
            type="button"
            data-mini-replay-close
            onClick={onClose}
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
          >
            닫기
          </button>
        </div>
      </div>
      <div className="relative min-h-28 flex-1">
        {failed ? (
          <div
            data-cube-no3d
            className="absolute inset-0 flex items-center justify-center"
          >
            <CubePosterPair
              n={n}
              state={state}
              settings={settings}
              captions={false}
              frontOnly={!mirror}
              className="h-full w-full"
            />
          </div>
        ) : (
          <canvas
            key={`${n}-${quality}`}
            ref={canvasRef}
            data-cube-canvas
            data-cube-ready={ready ? "" : undefined}
            className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
          />
        )}
        {orbit && !failed && <ViewHome viewRef={viewRef} ready={ready} />}
      </div>
    </div>
  );
}

/** 짧은 알림(남은 초, 횟수 다 씀 등)이 보이는 시간(ms) */
const HINT_MSG_MS = 1500;

/** 공식 한 줄의 수마다 키캡 글(「I J K」). 키가 없는 수는 「?」 */
function keysText(keymap: Keymap | null, n: number, alg: string): string {
  if (!keymap) return "";
  return algTokens(alg)
    .map((m) => keysForMove(keymap, n, m)?.map(keycapLabel).join(" ") ?? "?")
    .join(" · ");
}

/** 앱 말풍선에 보낼 줄들(앱은 줄마다 글꼴만 고른다) */
function hintBubbleLines(
  hint: FormulaHint | null,
  msg: string | null,
  keymap: Keymap | null,
  n: number,
): BubbleLine[] {
  if (!hint) return [{ text: msg ?? "", style: "plain" }];
  const lines: BubbleLine[] = [
    {
      text: hint.name ? `${hint.stage} · ${hint.name}` : hint.stage,
      style: "title",
    },
  ];
  if (hint.before) {
    const k = keysText(keymap, n, hint.before);
    lines.push({
      text: `${hint.before} 뒤${k ? `  (${k})` : ""}`,
      style: "note",
    });
  }
  lines.push({ text: hint.alg, style: "alg" });
  const k = keysText(keymap, n, hint.alg);
  if (k) lines.push({ text: k, style: "keys" });
  return lines;
}

/**
 * 창 안의 공식 보기. 창이 넉넉하면(`HINT_INLINE_MIN` 이상) 단계·공식·키캡을, 작으면 공식만 작게, 아주 작으면
 * 「창을 키우면 보여요」. 누르기는 아래 큐브로 지나간다
 */
function HintCard({
  hint,
  msg,
  n,
  keymap,
  shortSide,
}: {
  hint: FormulaHint | null;
  msg: string | null;
  n: number;
  keymap: Keymap | null;
  shortSide: number;
}) {
  const roomy = shortSide >= HINT_INLINE_MIN;
  const tiny = shortSide < 80;
  return (
    <div
      data-mini-hint-card={roomy ? "full" : tiny ? "tiny" : "small"}
      className={cn(
        "pointer-events-none absolute inset-x-1 bottom-1 z-10 rounded-md bg-black/80 text-white shadow-lg",
        roomy ? "p-2 text-xs" : "px-1 py-0.5 text-[9px] leading-tight",
      )}
    >
      {!hint ? (
        <p className="break-keep">{msg}</p>
      ) : tiny ? (
        <p className="break-keep">창을 키우면 보여요</p>
      ) : !roomy ? (
        <p className="break-words font-mono font-semibold">
          {hint.before && (
            <span className="text-sky-200">{hint.before} · </span>
          )}
          {hint.alg}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">
            {hint.stage}
            {hint.name && (
              <span className="font-normal text-white/70"> · {hint.name}</span>
            )}
          </p>
          {hint.before && (
            <p className="text-sky-200">
              <span className="font-mono">{hint.before}</span> 뒤
            </p>
          )}
          <p className="flex flex-wrap gap-x-1.5 gap-y-1">
            {algTokens(hint.alg).map((m, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                key={i}
                className="inline-flex flex-col items-center"
              >
                <span className="font-mono font-semibold">{m}</span>
                {keymap && <KeyCaps keys={keysForMove(keymap, n, m)} />}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
